import test from 'node:test';
import assert from 'node:assert/strict';
import { loadArt, resolveArt, saveArt, cardFace, getStorage, selectArtVariant } from '../src/card-art.js';
import { artManifest } from '../src/art-manifest.js';
import { existsSync } from 'node:fs';

test('a denied storage getter still allows default art and preference changes', () => {
  const host={get localStorage(){throw new DOMException('Denied','SecurityError');}};
  const storage=getStorage(host);
  assert.equal(storage,null);
  assert.deepEqual(loadArt(storage,()=>0),{choice:'random',resolved:'engraved'});
  assert.doesNotThrow(()=>saveArt(storage,{choice:'woodcut',resolved:'woodcut'}));
});

test('all ranks map to their suit artwork, with shared number art and indexed court art', () => {
  for (const style of ['engraved','woodcut']) {
    for (const [s,suit] of [['♣','clubs'],['♠','spades'],['♥','hearts'],['♦','diamonds']]) {
      const numbers=artManifest[`${style}-${suit}-numbers`];
      const court=artManifest[`${style}-${suit}-court`];
      assert.ok(existsSync(new URL(`../${cardFace({r:1,s},style).url}`, import.meta.url)));
      for(let r=1;r<=10;r++) {
        assert.deepEqual(cardFace({r,s},style),{url:selectArtVariant(numbers).url,size:'100% 100%',position:'0% 0%'});
      }
      for(let r=11;r<=13;r++) {
        assert.deepEqual(cardFace({r,s},style),{url:selectArtVariant(court).url,size:'300% 100%',position:`${(r-11)*50}% 0%`});
      }
    }
  }
});

test('all sixteen art-only layered sources are present', async () => {
  const { readdir }=await import('node:fs/promises');
  const names=new Set(await readdir(new URL('../assets/cards/layered/',import.meta.url)));
  for(const style of ['engraved','woodcut']) for(const suit of ['clubs','spades','hearts','diamonds']) for(const kind of ['numbers','court']) {
    assert.ok(names.has(`${style}-${suit}-${kind}.jpg`),`Missing ${style}-${suit}-${kind}.jpg`);
  }
});

test('shared number art and court coordinates retain complete faces', () => {
  assert.deepEqual(cardFace({r:10,s:'♥'},'woodcut'), {url:artManifest['woodcut-hearts-numbers'][1].url,size:'100% 100%',position:'0% 0%'});
  assert.deepEqual(cardFace({r:11,s:'♠'},'engraved'), {url:artManifest['engraved-spades-court'][1].url,size:'300% 100%',position:'0% 0%'});
  assert.deepEqual(cardFace({r:13,s:'♠'},'engraved'), {url:artManifest['engraved-spades-court'][1].url,size:'300% 100%',position:'100% 0%'});
});

test('card artwork resolves inside the GitHub Pages repository path', () => {
  const face=cardFace({r:1,s:'♠'},'engraved');
  assert.equal(new URL(face.url,'https://patrickmatthiesen.github.io/kabale/').pathname,`/kabale/${face.url.slice(2)}`);
});

test('art resolution follows physical card pixels rather than device names', () => {
  const variants=artManifest['engraved-clubs-court'];
  assert.equal(selectArtVariant(variants,40,1),variants[0]);
  assert.equal(selectArtVariant(variants,50,3),variants[1]);
  assert.equal(selectArtVariant(variants,160,2),variants[2]);
  assert.equal(selectArtVariant(variants,160,10),variants[2]);
});

test('every generated variant exists and its filename matches its bytes', async () => {
  const { createHash }=await import('node:crypto');
  for(const variants of Object.values(artManifest)) for(const variant of variants) {
    const bytes=await Bun.file(new URL(`../${variant.url}`,import.meta.url)).bytes();
    const hash=createHash('sha256').update(bytes).digest('hex').slice(0,16);
    assert.ok(variant.url.endsWith(`.${hash}.webp`));
    assert.equal(bytes.length,variant.bytes);
  }
});

test('retained previous-generation artwork exists and matches its content hash', async () => {
  const { createHash }=await import('node:crypto');
  const retained=JSON.parse(await Bun.file(new URL('../assets/cards/retained-art.json',import.meta.url)).text());
  assert.match(retained.reason,/open game tabs/i);
  assert.equal(retained.files.length,48);
  for(const file of retained.files) {
    const bytes=await Bun.file(new URL(`../assets/cards/optimized/${file}`,import.meta.url)).bytes();
    assert.ok(file.endsWith(`.${createHash('sha256').update(bytes).digest('hex').slice(0,16)}.webp`),file);
  }
});

test('selected styles stay fixed; random can choose either approved style', () => {
  assert.equal(resolveArt('engraved', () => .99), 'engraved');
  assert.equal(resolveArt('woodcut', () => 0), 'woodcut');
  assert.equal(resolveArt('random', () => 0), 'engraved');
  assert.equal(resolveArt('random', () => .99), 'woodcut');
});

test('random preference retains its resolved style across reloads', () => {
  let value;
  const storage = { getItem: () => value, setItem: (_, text) => { value = text; } };
  saveArt(storage, { choice: 'random', resolved: 'woodcut' });
  assert.deepEqual(loadArt(storage), { choice: 'random', resolved: 'woodcut' });
});

test('previous painted settings migrate to the requested woodcut style', () => {
  assert.deepEqual(loadArt({getItem: () => JSON.stringify({choice:'painted',resolved:'painted'})}), {choice:'woodcut',resolved:'woodcut'});
  assert.deepEqual(loadArt({getItem: () => JSON.stringify({choice:'random',resolved:'painted'})}), {choice:'random',resolved:'woodcut'});
});

test('fixed preference ignores stale resolved art and invalid storage falls back safely', () => {
  assert.deepEqual(loadArt({ getItem: () => JSON.stringify({choice:'woodcut',resolved:'engraved'}) }), {choice:'woodcut',resolved:'woodcut'});
  assert.deepEqual(loadArt({ getItem: () => '{bad' },()=>0), {choice:'random',resolved:'engraved'});
  assert.doesNotThrow(() => saveArt({ setItem() { throw Error('Unavailable'); } }, {choice:'woodcut',resolved:'woodcut'}));
});

test('a fresh art preference defaults to Random Deck without replacing saved choices', () => {
  assert.deepEqual(loadArt({getItem:()=>null},()=>.99),{choice:'random',resolved:'woodcut'});
  assert.deepEqual(loadArt({getItem:()=>JSON.stringify({choice:'engraved',resolved:'engraved'})},()=>.99),{choice:'engraved',resolved:'engraved'});
});

test('high contrast is a persistent fixed choice independent of illustrated deck randomization', () => {
  let stored;
  const storage={getItem:()=>stored,setItem:(_,value)=>{stored=value;}};
  saveArt(storage,{choice:'contrast',resolved:'contrast'});
  assert.deepEqual(loadArt(storage,()=>0),{choice:'contrast',resolved:'contrast'});
  assert.equal(resolveArt('random',()=>.99),'woodcut');
});
