import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as engine from '../src/engine.js';
import * as art from '../src/card-art.js';
import * as hints from '../src/hints.js';
import {planKlondikeHint} from '../src/klondike-hints.js';
import {rememberStock,restoreStockMemory} from '../src/stock-memory.js';
import * as settings from '../src/game-settings.js';
import * as i18n from '../src/i18n.js';
import {wasteLayout} from '../src/waste-layout.js';
import {boardLayout} from '../src/board-layout.js';
import {gameRules} from '../src/game-rules.js';
import {attachEndgameUI} from '../src/endgame-ui.js';
import {createCardMotion} from '../src/card-motion.js';

const source=(await readFile(new URL('../src/app.js',import.meta.url),'utf8')).replace(/^import .*\r?\n/gm,'');
const dragSource=(await readFile(new URL('../src/card-drag.js',import.meta.url),'utf8')).replace('export function attachCardDrag','function attachCardDrag');
const c=(r,s='♠')=>({r,s,id:`${s}${r}`,up:true});
function board(difficulty='normal') {
  const g=engine.deal('klondike',difficulty);g.cols=[[c(7)],[],[],[],[],[],[]];g.stock=[];g.waste=[];g.moves=12;return g;
}
function app(game,stored=new Map(),motionFactory=createCardMotion) {
  if(game)stored.set('kabale-session-v3',JSON.stringify({version:3,game,initial:game,past:[],future:[],elapsed:120000}));
  const elements=new Map();
  const document={activeElement:null,addEventListener(){},body:{classList:{add(){},remove(){}},append(){}},querySelector:()=>[...elements.values()].find(e=>e.open)??null};
  function el(id='') {
    return {id,dataset:{},open:false,hidden:false,disabled:false,style:{setProperty(){}},classList:{toggle(){},add(){},remove(){}},ownerDocument:document,
      clientWidth:600,querySelectorAll:()=>[],querySelector:()=>null,getBoundingClientRect:()=>({top:0}),replaceChildren(){},addEventListener(){},focus(){},setAttribute(name,value){this[name]=value;},
      showModal(){this.open=true;},close(){this.open=false;}};
  }
  document.getElementById=id=>{if(!elements.has(id))elements.set(id,el(id));return elements.get(id);};
  document.createElement=()=>el();
  const context={...engine,...art,...hints,...settings,...i18n,getHintRole:hints.hintRole,wasteLayout,boardLayout,gameRules,attachEndgameUI,planKlondikeHint,rememberStock,restoreStockMemory,createCardMotion:motionFactory,document,
    window:{localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)},devicePixelRatio:1,innerHeight:1000,scrollY:0,addEventListener(){}},
    getComputedStyle:()=>({paddingLeft:'8px',paddingRight:'8px'}),ResizeObserver:class{observe(){}},confirm:()=>true,
    setTimeout:()=>1,clearTimeout(){},setInterval(){},Date,console,structuredClone};
  vm.runInNewContext(dragSource+'\n'+source+';globalThis.api={state:()=>g,past:()=>past,choose,flush:saveNow};',context);
  return {get:id=>document.getElementById(id),api:context.api,stored};
}

test('real app finishes, saves final time/moves, and can undo the complete cleanup',()=>{
  const g=board();g.found=['♠','♥','♦','♣'].map(s=>Array.from({length:12},(_,i)=>c(i+1,s)));
  g.cols=['♠','♥','♦','♣'].map(s=>[c(13,s)]);
  const h=app(g);assert.equal(h.get('finish-game').hidden,false);
  h.get('finish-game').onclick();
  assert.equal(h.api.state().won,true);assert.equal(h.api.state().moves,16);
  assert.equal(h.get('end-dialog').open,true);assert.match(h.get('end-stats').textContent,/02:00 · 16 moves/);
  h.api.flush();assert.equal(JSON.parse(h.stored.get('kabale-session-v3')).game.won,true);
  h.get('end-keep').onclick();h.get('undo').onclick();
  assert.equal(h.api.state().won,false);assert.equal(h.api.state().moves,12);
  assert.equal(h.get('end-dialog').open,false);assert.equal(h.get('finish-game').hidden,false);
  h.get('redo').onclick();assert.equal(h.api.state().won,true);assert.equal(h.get('end-dialog').open,false);
});

test('the photographed exposed tableau offers Finish game above the board',async()=>{
  const rank={A:1,J:11,Q:12,K:13};
  const pile=tokens=>tokens.split(' ').filter(Boolean).map(token=>{
    const label=token.slice(0,-1);
    return c(rank[label]??Number(label),token.at(-1));
  });
  const g=board('easy');
  g.cols=[
    pile('K♥ Q♠ J♥ 10♠ 9♦ 8♣ 7♦ 6♣ 5♦ 4♣ 3♥'),
    pile('K♠ Q♦ J♣ 10♦ 9♣ 8♦ 7♠ 6♦ 5♣ 4♦'),
    [],pile('K♣ Q♥ J♠ 10♥ 9♠ 8♥ 7♣ 6♥ 5♠ 4♥'),
    pile('6♠'),pile('5♥'),pile('K♦ Q♣ J♦ 10♣ 9♥ 8♠ 7♥')
  ];
  g.found=[pile('A♠ 2♠ 3♠ 4♠'),pile('A♦ 2♦ 3♦'),pile('A♣ 2♣ 3♣'),pile('A♥ 2♥')];
  const fixture=[...g.cols.flat(),...g.found.flat()];
  assert.equal(fixture.length,52);
  assert.equal(new Set(fixture.map(card=>card.id)).size,52);
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(html.indexOf('id="finish-game"')<html.indexOf('id="board"'));
  const h=app(g);
  assert.equal(h.get('finish-game').hidden,false);
  h.get('finish-game').onclick();
  assert.equal(h.api.state().won,true);
  assert.equal(h.api.state().moves,g.moves+40);
});

test('finish saves the complete win before playback, and skipping preserves the original undo board',async()=>{
  const g=board();g.found=['♠','♥','♦','♣'].map(s=>Array.from({length:12},(_,i)=>c(i+1,s)));
  g.cols=['♠','♥','♦','♣'].map(s=>[c(13,s)]);
  const flights=[];
  const motion={enabled:()=>true,capture:()=>({}),flight:()=>new Promise(resolve=>flights.push(resolve)),cancel:()=>flights.splice(0).forEach(resolve=>resolve())};
  const h=app(g,new Map(),()=>motion);
  h.get('finish-game').onclick();
  assert.equal(h.api.state().won,true);
  assert.equal(h.get('game-room').inert,true);
  assert.equal(h.get('end-dialog').open,false);
  h.api.flush();
  assert.equal(JSON.parse(h.stored.get('kabale-session-v3')).game.won,true);
  flights.shift()();
  await Promise.resolve();
  h.get('skip-finish').onclick();
  assert.equal(h.get('game-room').inert,false);
  assert.equal(h.get('skip-finish').hidden,true);
  assert.equal(h.get('end-dialog').open,true);
  h.get('end-keep').onclick();h.get('undo').onclick();
  assert.deepEqual(h.api.state().cols,g.cols);
  assert.deepEqual(h.api.state().found,g.found);
});

test('real app persists dismissed dead ends and starts a fresh deal through recovery',()=>{
  const h=app(board());assert.equal(h.get('end-dialog').open,true);
  h.get('end-keep').onclick();h.api.flush();
  const reloaded=app(null,h.stored);assert.equal(reloaded.get('end-dialog').open,false);
  reloaded.get('end-review').onclick();assert.equal(reloaded.get('end-dialog').open,true);
  reloaded.get('end-new').onclick();
  assert.equal(reloaded.get('end-dialog').open,false);assert.equal(reloaded.api.state().moves,0);
  reloaded.api.flush();assert.equal(JSON.parse(reloaded.stored.get('kabale-session-v3')).seenEndNotices.length,0);
});

test('Hard completion keeps undo unavailable in the actual app',()=>{
  const g=board('hard');g.found=['♠','♥','♦','♣'].map(s=>Array.from({length:s==='♠'?12:13},(_,i)=>c(i+1,s)));g.cols=[[c(13)]];
  const h=app(g);h.get('finish-game').onclick();
  assert.equal(h.api.state().won,true);assert.equal(h.api.past().length,0);
  assert.equal(h.get('undo').disabled,true);assert.equal(h.get('end-undo').hidden,true);
});

test('Spider explains a blocked deal without declaring the board lost',()=>{
  const g=engine.deal('spider');g.cols=[[c(9)],...Array.from({length:9},()=>[])];
  const h=app(g),stock=g.stock.length;h.api.choose('stock');
  assert.equal(h.api.state().stock.length,stock);
  assert.equal(h.get('message').textContent,'Fill every empty column before dealing from the stock.');
  assert.equal(h.get('end-dialog').open,false);
});

test('Hint gives visible feedback when all remaining suggestions repeat, without declaring a loss',()=>{
  const g=board();g.stock=[{...c(9,'♥'),up:false}];
  const h=app(g);
  // Following the only available stock action reaches a state whose recycle
  // would revisit the starting position. The footer can be below a long table.
  h.api.choose('stock');h.get('hint').onclick();
  assert.equal(h.get('hint-feedback').hidden,false);
  assert.match(h.get('hint-feedback-text').textContent,/No useful continuation found/);
  assert.equal(h.get('end-dialog').open,false);
  assert.equal(h.get('message')['aria-live'],'off');
  h.get('hint-feedback-close').onclick();assert.equal(h.get('hint-feedback').hidden,true);
  assert.equal(h.get('message')['aria-live'],'polite');
  h.get('hint').onclick();h.api.choose('col:0:0');
  assert.equal(h.get('hint-feedback').dataset.hint,'false');
  assert.match(h.get('hint-feedback-text').textContent,/no legal move for that card/);
});

test('a stock recycle hint marks the empty Redeal pile and explains its action',()=>{
  const g=board();g.waste=[c(6,'♥'),c(9,'♥')];
  g.stockMemory=[{r:6,s:'♥'},{r:9,s:'♥'}];
  const h=app(g);h.get('hint').onclick();
  assert.equal(h.get('hint-feedback').hidden,false);
  assert.match(h.get('hint-feedback-text').textContent,/Recycle the waste into the stock.*known waste card/);
  assert.match(h.get('board').innerHTML,/class="pile hinted hint-source" data-key="stock"/);
  assert.equal(h.get('end-dialog').open,false);
});

test('FreeCell hints name both face-up cards and mark the right handles',()=>{
  const g=engine.deal('freecell');
  g.cols=[[c(9,'♦'),c(7,'♣')],[c(8,'♥')],[],[],[],[],[],[]];
  const single=app(g);
  single.get('hint').onclick();
  assert.equal(single.get('hint-feedback-text').textContent,'Move 7♣\uFE0E of clubs onto 8♥\uFE0E of hearts.');
  assert.match(single.get('board').innerHTML,/class="[^"]*hint-source"[^>]*data-key="col:0:1"/);
  assert.match(single.get('board').innerHTML,/class="[^"]*hint-destination"[^>]*data-key="col:1:0"/);
  assert.match(single.get('board').innerHTML,/data-key="cell:1" aria-label="Free cell 2"/);
  single.get('hint-feedback-close').onclick();
  assert.doesNotMatch(single.get('board').innerHTML,/hint-source|hint-destination/);

  g.cols[0].push(c(6,'♥'));
  const stack=app(g);
  stack.get('hint').onclick();
  assert.equal(stack.get('hint-feedback-text').textContent,'Move the stack starting with 7♣\uFE0E of clubs onto 8♥\uFE0E of hearts.');
  assert.match(stack.get('board').innerHTML,/class="[^"]*hint-source"[^>]*data-key="col:0:1"/);
});

test('Spider hints identify the columns of matching cards in both languages',()=>{
  const g=engine.deal('spider','easy');
  g.cols=[[c(7)],[c(8)],[{...c(7),id:'second-seven'}],[{...c(8),id:'second-eight'}],[],[],[],[],[],[]];
  g.stock=[];
  const h=app(g);
  h.get('hint').onclick();
  assert.equal(h.get('hint-feedback-text').textContent,'Move 7♠\uFE0E of spades from column 1 onto 8♠\uFE0E of spades in column 2.');
  h.get('language').onchange({target:{value:'da'}});
  h.get('hint').onclick();
  assert.equal(h.get('hint-feedback-text').textContent,'Læg spar 7♠\uFE0E fra kolonne 1 oven på spar 8♠\uFE0E i kolonne 2.');
});

test('rank and suit size is saved independently of the deal and deck',()=>{
  const h=app(board());
  h.get('card-art').onchange({target:{value:'woodcut'}});
  const game=h.api.state();
  h.get('card-index-size').onchange({target:{value:'large'}});
  assert.equal(h.api.state(),game);
  assert.equal(h.get('card-art').value,'woodcut');
  h.api.flush();
  const restored=app(null,h.stored);
  assert.equal(restored.get('card-index-size').value,'large');
  assert.equal(restored.get('card-art').value,'woodcut');
  assert.equal(restored.api.state().moves,game.moves);
});

test('Danish persists, translates live hints and leaves the current deal in place',()=>{
  const g=engine.deal('freecell');
  g.cols=[[c(9,'♦'),c(7,'♣')],[c(8,'♥')],[],[],[],[],[],[]];
  g.moves=14;
  const h=app(g);
  const original=h.api.state();
  h.get('language').onchange({target:{value:'da'}});
  assert.equal(h.api.state(),original);
  assert.equal(h.get('moves').textContent,14);
  assert.equal(h.get('rules-title').textContent,'Regler for FreeCell');
  assert.match(h.get('board').innerHTML,/Friplads/);
  h.get('hint').onclick();
  assert.equal(h.get('hint-feedback-text').textContent,'Læg klør 7♣\uFE0E oven på hjerter 8♥\uFE0E.');
  h.api.flush();
  const restored=app(null,h.stored);
  assert.equal(restored.get('language').value,'da');
  assert.equal(restored.api.state().moves,14);
  restored.get('language').onchange({target:{value:'en'}});
  assert.equal(restored.get('rules-title').textContent,'FreeCell rules');
});

test('failed session writes show visible feedback without re-rendering the board',()=>{
  const h=app(board());
  h.get('board').innerHTML='keep the board';
  h.stored.set=()=>{throw new Error('Storage is full');};
  h.api.flush();
  assert.equal(h.get('board').innerHTML,'keep the board');
  assert.equal(h.get('hint-feedback').hidden,false);
  assert.match(h.get('hint-feedback-text').textContent,/storage is unavailable/i);
});

test('a saved game started mid-pass remembers seen stock across redeal, reload and undo',()=>{
  const g=board();g.waste=[c(9,'♥')];g.stock=[{...c(10,'♥'),up:false}];
  const h=app(g);
  h.get('hint').onclick();
  assert.match(h.get('hint-feedback-text').textContent,/Draw from the stock.*unseen/);
  h.api.choose('stock');
  h.get('hint').onclick();
  assert.match(h.get('hint-feedback-text').textContent,/No useful continuation found/);
  h.api.choose('stock'); // Recycling by hand is still legal.
  h.api.flush();
  const restored=app(null,h.stored);
  restored.get('hint').onclick();
  assert.match(restored.get('hint-feedback-text').textContent,/No useful continuation found/);
  assert.equal(restored.get('end-dialog').open,false);
  assert.doesNotMatch(restored.get('board').innerHTML,/hint-source/);
  restored.get('undo').onclick();
  restored.get('hint').onclick();
  assert.match(restored.get('hint-feedback-text').textContent,/No useful continuation found/);
  restored.get('redo').onclick();
  restored.get('hint').onclick();
  assert.match(restored.get('hint-feedback-text').textContent,/No useful continuation found/);
});
