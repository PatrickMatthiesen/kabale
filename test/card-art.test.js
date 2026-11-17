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

test('every rank and suit maps to a unique complete face in both decks', () => {
  for (const style of ['engraved','woodcut']) {
    const faces = new Set();
    for (const s of ['♣','♠','♥','♦']) for (let r=1;r<=13;r++) {
      const face=cardFace({r,s},style);
      assert.ok(existsSync(new URL(`../${face.url}`, import.meta.url)));
      faces.add(face.url+face.position);
    }
    assert.equal(faces.size,52);
  }
});

test('sprite coordinates retain complete edge faces, including ten and king', () => {
  assert.deepEqual(cardFace({r:10,s:'♥'},'woodcut'), {url:artManifest['woodcut-hearts-numbers'][1].url,size:'500% 200%',position:'100% 100%'});
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
