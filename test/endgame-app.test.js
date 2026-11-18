import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as engine from '../src/engine.js';
import * as art from '../src/card-art.js';
import * as hints from '../src/hints.js';
import * as settings from '../src/game-settings.js';
import {wasteLayout} from '../src/waste-layout.js';
import {boardLayout} from '../src/board-layout.js';
import {gameRules} from '../src/game-rules.js';
import {attachEndgameUI} from '../src/endgame-ui.js';

const source=(await readFile(new URL('../src/app.js',import.meta.url),'utf8')).replace(/^import .*\r?\n/gm,'');
const dragSource=(await readFile(new URL('../src/card-drag.js',import.meta.url),'utf8')).replace('export function attachCardDrag','function attachCardDrag');
const c=(r,s='♠')=>({r,s,id:`${s}${r}`,up:true});
function board(difficulty='normal') {
  const g=engine.deal('klondike',difficulty);g.cols=[[c(7)],[],[],[],[],[],[]];g.stock=[];g.waste=[];g.moves=12;return g;
}
function app(game,stored=new Map()) {
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
  const context={...engine,...art,...hints,...settings,getHintRole:hints.hintRole,wasteLayout,boardLayout,gameRules,attachEndgameUI,document,
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
  assert.match(h.get('hint-feedback-text').textContent,/No new hint found/);
  assert.equal(h.get('end-dialog').open,false);
  assert.equal(h.get('message')['aria-live'],'off');
  h.get('hint-feedback-close').onclick();assert.equal(h.get('hint-feedback').hidden,true);
  assert.equal(h.get('message')['aria-live'],'polite');
  h.get('hint').onclick();h.api.choose('col:0:0');
  assert.equal(h.get('hint-feedback').hidden,true);
});

test('a stock recycle hint marks the empty Redeal pile and explains its action',()=>{
  const g=board();g.waste=[c(9,'♥')];
  const h=app(g);h.get('hint').onclick();
  assert.equal(h.get('hint-feedback').hidden,false);
  assert.equal(h.get('hint-feedback-text').textContent,'Recycle the waste into the stock.');
  assert.match(h.get('board').innerHTML,/class="pile hinted hint-source" data-key="stock"/);
  assert.equal(h.get('end-dialog').open,false);
});
