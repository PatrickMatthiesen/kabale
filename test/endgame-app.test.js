import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as engine from '../src/engine.js';
import * as art from '../src/card-art.js';
import * as hints from '../src/hints.js';
import {selectHelpHint} from '../src/help-hint.js';
import {rememberStock,restoreStockMemory} from '../src/stock-memory.js';
import * as settings from '../src/game-settings.js';
import * as i18n from '../src/i18n.js';
import {wasteLayout} from '../src/waste-layout.js';
import {boardLayout} from '../src/board-layout.js';
import {gameRules} from '../src/game-rules.js';
import {attachEndgameUI} from '../src/endgame-ui.js';
import {createCardMotion} from '../src/card-motion.js';
import {cardTransfers} from '../src/card-transfers.js';

const source=(await readFile(new URL('../src/app.js',import.meta.url),'utf8')).replace(/^import .*\r?\n/gm,'');
const dragSource=(await readFile(new URL('../src/card-drag.js',import.meta.url),'utf8')).replace('export function attachCardDrag','function attachCardDrag');
const c=(r,s='♠')=>({r,s,id:`${s}${r}`,up:true});
function board(difficulty='normal') {
  const g=engine.deal('klondike',difficulty);g.cols=[[c(7)],[],[],[],[],[],[]];g.stock=[];g.waste=[];g.moves=12;return g;
}
function eventTarget() {
  const handlers=new Map();
  return {
    addEventListener(type,handler,capture) {
      const listeners=handlers.get(type)??[];
      if (capture===true) listeners.unshift(handler);
      else listeners.push(handler);
      handlers.set(type,listeners);
    },
    emit(type,event) {
      let stopped=false;
      event.stopImmediatePropagation=()=>{stopped=true;};
      for (const listener of handlers.get(type)??[]) {
        listener(event);
        if (stopped) break;
      }
    }
  };
}
function app(game,stored=new Map(),motionFactory=createCardMotion) {
  if(game)stored.set('kabale-session-v3',JSON.stringify({version:3,game,initial:game,past:[],future:[],elapsed:120000}));
  const elements=new Map(),timers=new Map();
  let preview, pointerTarget, clickTime=0, nextTimer=0;
  const document={...eventTarget(),activeElement:null,
    body:{classList:{add(){},remove(){}},append(element){preview=element;}},
    elementFromPoint:()=>pointerTarget,querySelector:()=>[...elements.values()].find(e=>e.open)??null};
  function el(id='') {
    return {...eventTarget(),id,dataset:{},open:false,hidden:false,disabled:false,style:{setProperty(){}},classList:{toggle(){},add(){},remove(){}},ownerDocument:document,
      clientWidth:600,scrollLeft:0,scrollTop:0,querySelectorAll:()=>[],querySelector:()=>null,getBoundingClientRect:()=>({left:0,top:0,width:60,height:90}),replaceChildren(){},focus(){},setAttribute(name,value){this[name]=value;},
      showModal(){this.open=true;},close(){this.open=false;}};
  }
  document.getElementById=id=>{if(!elements.has(id))elements.set(id,el(id));return elements.get(id);};
  document.createElement=()=>({...el(),children:[],append(child){this.children.push(child);},remove(){if(preview===this) preview=undefined;}});
  const window={...eventTarget(),localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)},devicePixelRatio:1,innerHeight:1000,scrollY:0};
  const context={...engine,...art,...hints,...settings,...i18n,getHintRole:hints.hintRole,wasteLayout,boardLayout,gameRules,attachEndgameUI,selectHelpHint,rememberStock,restoreStockMemory,cardTransfers,createCardMotion:motionFactory,document,
    window,performance:{now:()=>clickTime+=100},
    getComputedStyle:()=>({paddingLeft:'8px',paddingRight:'8px'}),ResizeObserver:class{observe(){}},confirm:()=>true,
    setTimeout(callback,delay){timers.set(++nextTimer,{callback,delay});return nextTimer;},
    clearTimeout:id=>timers.delete(id),setInterval(){},Date,console,structuredClone};
  vm.runInNewContext(dragSource+'\n'+source+';globalThis.api={state:()=>g,past:()=>past,choose,flush:saveNow};',context);
  function clickTarget(key) {
    const html=document.getElementById('board').innerHTML;
    const markup=html.match(/<button [^>]+>/g)?.find(button=>button.includes('data-key="'+key+'"'));
    assert.ok(markup,'Expected a rendered button for '+key);
    const target={dataset:{key},closest:()=>target,
      matches:selector=>selector==='.card' && markup.includes('class="card '),
      disabled:markup.endsWith(' disabled>')};
    return target;
  }
  function click(key,detail=1) {
    document.getElementById('board').emit('click',{target:clickTarget(key),detail});
  }
  function startTouchFrom(key,destination) {
    const board=document.getElementById('board');
    const pile={querySelectorAll:()=>cards};
    const cardAt=key=>({...el(),dataset:{key},
      closest(selector){return selector==='.col'?pile:this;},
      matches:selector=>selector==='.card',
      cloneNode:()=>({...el(),removeAttribute(){}})});
    const [,column,index]=key.split(':');
    const cards=key.startsWith('col:') ? context.api.state().cols[column].map((_,i)=>cardAt('col:'+column+':'+i)) : [];
    const target=cards[index] ?? cardAt(key);
    pointerTarget=destination==null ? null : cardAt(destination);
    board.contains=element=>element===pointerTarget;
    const pointer={pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:20,clientY:20,target,preventDefault(){this.defaultPrevented=true;}};
    board.emit('pointerdown',pointer);
    return {
      move(distance){window.emit('pointermove',{...pointer,clientY:pointer.clientY+distance});},
      release(distance){window.emit('pointerup',{...pointer,clientY:pointer.clientY+distance});},
      cancel(){window.emit('pointercancel',pointer);},
      click(key){
        const event={...pointer,target:key===undefined ? target : clickTarget(key),detail:1};
        board.emit('click',event);
        return Boolean(event.defaultPrevented);
      }
    };
  }
  function expireTimer(id) {
    const {callback}=timers.get(id);
    timers.delete(id);
    callback();
  }
  const startTouch=(column,index,destination)=>startTouchFrom(`col:${column}:${index}`,destination);
  return {get:id=>document.getElementById(id),api:context.api,stored,click,startTouch,startTouchFrom,preview:()=>preview,window,document,timers,expireTimer};
}

function motionProbe() {
  const calls = [];
  let active = null;
  const start = kind => {
    calls.push({kind});
    return new Promise(resolve=>{active={kind,resolve};});
  };
  const cancel = () => {
    const current = active;
    active = null;
    current?.resolve();
  };
  return {
    calls,
    active:()=>active?.kind,
    complete:cancel,
    factory(board,{isEnabled}) {
      return {
        enabled:isEnabled,
        captureTransfers:transfers=>transfers.map(transfer=>({...transfer,markup:board.innerHTML})),
        move(records,options) {
          const playback = start('move');
          Object.assign(calls.at(-1),{records,options,markup:board.innerHTML,moves:board.ownerDocument.getElementById('moves').textContent});
          return playback;
        },
        cancelTransfer:()=>{if (active?.kind === 'move') cancel();},
        cancel,
        capture:()=>isEnabled() ? {} : null,
        deal:()=>start('deal'),
        win:()=>start('win'),
        flight:()=>start('flight'),
      };
    },
  };
}

test('stock movement reads the old board and commits before playback, with exact undo and redo',()=>{
  const stored = new Map(), sessions = [];
  const probe = motionProbe();
  const h = app(engine.deal('klondike'),stored,probe.factory), table = h.get('board');
  const saveSession = () => {
    h.api.flush();
    sessions.push(JSON.parse(stored.get('kabale-session-v3')));
  };
  const before = JSON.parse(JSON.stringify(h.api.state()));
  const markup = table.innerHTML;
  let rendered = markup;
  Object.assign(table,{scrollLeft:0,scrollTop:30});
  Object.defineProperty(table,'innerHTML',{
    get:()=>rendered,
    set:value=>{
      rendered = value;
      table.scrollTop = Math.min(table.scrollTop,10);
    },
  });
  h.click('stock');
  saveSession();
  const committed = sessions[0].game;
  assert.equal(probe.active(),'move');
  assert.equal(probe.calls[0].moves,1);
  assert.equal(probe.calls[0].records[0].markup,markup);
  assert.match(probe.calls[0].markup,/class="waste-layer waste-top"/);
  assert.equal(committed.moves,1);
  assert.deepEqual(sessions[0].past,[before]);
  assert.deepEqual(sessions[0].future,[]);
  assert.equal(table.scrollTop,10);
  table.emit('scroll',{});
  assert.equal(probe.active(),'move');
  table.scrollLeft=1;
  table.emit('scroll',{});
  assert.equal(probe.active(),undefined);

  h.get('undo').onclick();
  saveSession();
  assert.equal(probe.calls[1].records[0].from,'waste');
  assert.equal(probe.calls[1].records[0].to,'stock');
  assert.deepEqual(sessions[1].game,before);
  assert.deepEqual(sessions[1].past,[]);
  assert.deepEqual(sessions[1].future,[committed]);

  h.get('redo').onclick();
  saveSession();
  assert.equal(probe.calls[2].records[0].from,'stock');
  assert.equal(probe.calls[2].records[0].to,'waste');
  assert.deepEqual(sessions[2].game,committed);
  assert.deepEqual(sessions[2].past,[before]);
  assert.deepEqual(sessions[2].future,[]);

  const key = {key:'Enter',target:{tagName:'DIV',dataset:{key:'stock'}},preventDefault(){this.defaultPrevented=true;}};
  table.emit('keydown',key);
  h.document.emit('keydown',key);
  saveSession();
  assert.equal(sessions[3].game.moves,2);
  assert.equal(probe.active(),'move');
});

test('FreeCell keyboard auto-move animates and touch drag commits without replay',()=>{
  const probe = motionProbe(), g = freeCellBeforeWin();
  const h = app(g,new Map(),probe.factory);
  h.click('col:0:0',0);
  assert.equal(probe.calls.length,0);
  h.document.emit('keydown',{key:'a',target:{tagName:'BUTTON'},preventDefault(){}});
  assert.equal(probe.calls[0].records[0].to,'found:0');
  assert.equal(h.api.state().moves,g.moves+1);

  const touch = h.startTouch(1,0,'found:1');
  touch.move(12);
  touch.release(12);
  assert.equal(probe.calls.length,1);
  assert.equal(h.api.state().moves,g.moves+2);
  assert.equal(h.api.state().found[1].at(-1).r,13);
});

test('Spider run and Pyramid pair collection play after one committed action each',()=>{
  const spider = engine.deal('spider');
  spider.cols[0] = Array.from({length:12},(_,i)=>c(13-i));
  spider.cols[1] = [c(1)];
  const spiderProbe = motionProbe(), s = app(spider,new Map(),spiderProbe.factory);
  setAutoMoveTrigger(s);
  s.click('col:1:0');
  assert.equal(spiderProbe.calls[0].moves,1);
  assert.equal(spiderProbe.calls[0].records.length,13);
  assert.ok(spiderProbe.calls[0].records.every(record=>record.to==='runs' && !record.arrives));
  assert.equal(s.api.state().found.length,1);

  const pyramid = engine.deal('pyramid');
  pyramid.cols = pyramid.cols.map(row=>row.map(()=>null));
  pyramid.cols[6] = [c(5),c(8,'♥'),c(2),null,null,null,null];
  const pyramidProbe = motionProbe(), p = app(pyramid,new Map(),pyramidProbe.factory);
  p.click('p:6:0',0);
  p.click('p:6:1',0);
  assert.equal(pyramidProbe.calls[0].moves,1);
  assert.equal(pyramidProbe.calls[0].records.length,2);
  assert.ok(pyramidProbe.calls[0].records.every(record=>record.to===null && !record.arrives));
  assert.equal(p.api.state().removed.length,2);
});

function spiderBeforeWin() {
  const g = engine.deal('spider');
  const runs = Array.from({length:8},(_,i)=>Array.from({length:13},(_,j)=>{
    const card = c(13-j,i%2 ? '♥' : '♠');
    return {...card,id:`${i}:${card.id}`};
  }));
  g.stock = [];
  g.found = runs.slice(0,6);
  g.cols = [runs[6].slice(0,10),runs[6].slice(10),runs[7].slice(0,10),runs[7].slice(10),[],[],[],[],[],[]];
  return g;
}

test('Spider Finish captures each old board and animates all thirteen cards to the updated counter',async()=>{
  const g = spiderBeforeWin(), probe = motionProbe(), h = app(g,new Map(),probe.factory);
  const table = h.get('board'), before = table.innerHTML;
  assert.equal(h.get('finish-game').hidden,false);
  h.get('finish-game').onclick();
  h.api.flush();
  assert.equal(JSON.parse(h.stored.get('kabale-session-v3')).game.won,true);
  assert.equal(h.get('game-room').inert,true);
  assert.equal(h.get('end-dialog').open,false);

  const first = probe.calls[0];
  assert.equal(first.kind,'move');
  assert.equal(first.records.length,13);
  assert.equal(new Set(first.records.map(record=>record.from)).size,13);
  assert.ok(first.records.every(record=>record.to==='runs' && !record.arrives && record.markup===before));
  assert.match(first.markup,/class="run-counter">7<small>/);
  assert.doesNotMatch(first.markup,/data-key="col:0:0"/);
  table.emit('scroll',{});
  assert.equal(probe.calls.length,1);
  assert.equal(probe.active(),'move');

  probe.complete();
  await new Promise(resolve=>setImmediate(resolve));
  const second = probe.calls[1];
  assert.equal(second.kind,'move');
  assert.equal(second.records.length,13);
  assert.ok(second.records.every(record=>record.to==='runs' && !record.arrives && record.markup===first.markup));
  assert.match(second.markup,/class="run-counter">8<small>/);
  assert.ok(first.options.duration > 0 && second.options.duration > 0);
  assert.ok(first.options.duration + second.options.duration <= 1600);
  probe.complete();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(probe.calls.map(call=>call.kind),['move','move','win']);
  assert.equal(h.get('game-room').inert,false);
});

test('Skip cancels the pending Spider transfer and displays the saved win immediately',async()=>{
  const probe = motionProbe(), h = app(spiderBeforeWin(),new Map(),probe.factory);
  h.get('finish-game').onclick();
  assert.equal(probe.active(),'move');
  h.get('skip-finish').onclick();
  assert.equal(probe.active(),undefined);
  assert.equal(h.get('skip-finish').hidden,true);
  assert.equal(h.get('end-dialog').open,true);
  assert.match(h.get('board').innerHTML,/class="run-counter">8<small>/);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(probe.calls.map(call=>call.kind),['move']);

  const offProbe = motionProbe(), off = app(spiderBeforeWin(),new Map(),offProbe.factory);
  const setting = off.get('card-animations');
  setting.value='off';
  setting.onchange({target:setting});
  off.get('finish-game').onclick();
  assert.equal(off.api.state().won,true);
  assert.equal(off.get('end-dialog').open,true);
  assert.deepEqual(offProbe.calls,[]);
});

test('Spider drag animates only the stationary destination cards, including on the final run',async()=>{
  const g = spiderBeforeWin(), probe = motionProbe(), h = app(g,new Map(),probe.factory);
  const first = h.startTouch(1,0,'col:0');
  first.move(12);
  assert.equal(h.preview().children.length,3);
  first.release(12);
  assert.equal(h.preview(),undefined);
  assert.equal(h.api.state().won,false);
  assert.deepEqual(probe.calls[0].records.map(record=>record.from),Array.from({length:10},(_,i)=>`col:0:${i}`));
  assert.ok(probe.calls[0].records.every(record=>record.to==='runs' && !record.arrives));

  const last = h.startTouch(3,0,'col:2');
  last.move(12);
  last.release(12);
  assert.equal(h.api.state().won,true);
  assert.equal(h.api.state().moves,g.moves+2);
  assert.equal(h.get('end-dialog').open,false);
  assert.deepEqual(probe.calls[1].records.map(record=>record.from),Array.from({length:10},(_,i)=>`col:2:${i}`));
  assert.ok(probe.calls[1].records.every(record=>record.to==='runs' && !record.arrives));
  probe.complete();
  await Promise.resolve();
  assert.deepEqual(probe.calls.map(call=>call.kind),['move','move','win']);
});

test('Pyramid drag fades only the stationary partner before the win celebration',async()=>{
  const g = engine.deal('pyramid');
  g.cols = g.cols.map(row=>row.map(()=>null));
  g.cols[6][0] = c(5);
  g.pairWaste = [c(8,'♥')];
  const probe = motionProbe(), h = app(g,new Map(),probe.factory);
  const touch = h.startTouchFrom('p:6:0','pw');
  touch.move(12);
  touch.release(12);
  assert.equal(h.preview(),undefined);
  assert.equal(h.api.state().won,true);
  assert.equal(h.api.state().removed.length,2);
  assert.equal(h.get('end-dialog').open,false);
  assert.equal(probe.active(),'move');
  assert.equal(probe.calls[0].records.length,1);
  const [partner] = probe.calls[0].records;
  assert.equal(partner.from,'pw');
  assert.equal(partner.to,null);
  assert.equal(partner.arrives,false);
  assert.match(partner.markup,/data-key="pw"/);
  assert.doesNotMatch(probe.calls[0].markup,/data-key="p:6:0"/);
  probe.complete();
  await Promise.resolve();
  assert.deepEqual(probe.calls.map(call=>call.kind),['move','win']);
});

test('Card animations is localized, cancels playback when switched off, and stays off after reload',async()=>{
  const html = await readFile(new URL('../index.html',import.meta.url),'utf8');
  const cardsSettings = html.split('<legend data-i18n>Cards</legend>')[1].split('</fieldset>')[0];
  assert.match(cardsSettings,/<span data-i18n>Card animations<\/span>\s*<select id="card-animations">/);
  assert.equal(i18n.translate('da','Card animations'),'Kortanimationer');
  const probe = motionProbe(), h = app(engine.deal('klondike'),new Map(),probe.factory);
  const setting = h.get('card-animations');
  assert.equal(setting.value,'on');
  h.click('stock');
  assert.equal(probe.active(),'move');
  setting.value='off';
  setting.onchange({target:setting});
  assert.equal(probe.active(),undefined);
  h.api.flush();
  const restored = app(null,h.stored,probe.factory);
  assert.equal(restored.get('card-animations').value,'off');
  restored.click('stock');
  assert.equal(restored.api.state().moves,2);
  restored.get('new').onclick();
  assert.equal(restored.api.state().moves,0);
  assert.equal(probe.calls.length,1);
});

test('board scroll preserves the win celebration and switching animations off reveals the result',async()=>{
  const g = engine.deal('pyramid');
  g.cols = g.cols.map(row=>row.map(()=>null));
  g.cols[6][0] = c(13);
  const probe = motionProbe(), h = app(g,new Map(),probe.factory);
  h.click('p:6:0',0);
  assert.equal(h.api.state().won,true);
  assert.equal(probe.active(),'move');
  assert.equal(h.get('end-dialog').open,false);
  const table = h.get('board');
  table.emit('scroll',{});
  assert.equal(probe.active(),'move');
  table.scrollTop=5;
  table.emit('scroll',{});
  await Promise.resolve();
  table.scrollTop=10;
  table.emit('scroll',{});
  assert.equal(probe.active(),'win');
  const setting = h.get('card-animations');
  setting.value='off';
  setting.onchange({target:setting});
  await Promise.resolve();
  assert.equal(probe.active(),undefined);
  assert.equal(h.get('end-dialog').open,true);
  assert.deepEqual(probe.calls.map(call=>call.kind),['move','win']);
});

test('switching Card animations off ends a pending Finish and skips playback in a saved Off session',()=>{
  const g = freeCellBeforeWin();
  const probe = motionProbe(), h = app(g,new Map(),probe.factory);
  h.get('finish-game').onclick();
  assert.equal(probe.active(),'flight');
  assert.equal(h.get('game-room').inert,true);
  h.get('board').emit('scroll',{});
  assert.equal(probe.active(),'flight');
  const setting = h.get('card-animations');
  setting.value='off';
  setting.onchange({target:setting});
  assert.equal(probe.active(),undefined);
  assert.equal(h.get('game-room').inert,false);
  assert.equal(h.get('end-dialog').open,true);
  const restored = app(g,h.stored,probe.factory);
  restored.get('finish-game').onclick();
  assert.equal(restored.api.state().won,true);
  assert.equal(restored.get('end-dialog').open,true);
  assert.deepEqual(probe.calls.map(call=>call.kind),['flight']);
});

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

test('Spider ignores a blocked stock click without declaring the board lost',()=>{
  const g=engine.deal('spider');g.cols=[[c(9)],...Array.from({length:9},()=>[])];
  const h=app(g),stock=g.stock.length;h.click('stock');
  assert.equal(h.api.state().stock.length,stock);
  assert.equal(h.api.state().moves,0);
  assert.equal(h.get('hint-feedback').hidden,true);
  assert.equal(h.get('end-dialog').open,false);
});

test('Klondike ignores clicks on an empty foundation and keeps the selected non-ace',()=>{
  const g=board();g.cols[1]=[c(8,'♥')];
  const h=app(g),table=h.get('board'),feedback=h.get('hint-feedback');
  assert.match(table.innerHTML,/class="placeholder empty-target" data-key="found:0"/);

  h.click('found:0');
  assert.equal(feedback.hidden,true);
  assert.doesNotMatch(table.innerHTML,/aria-pressed="true"/);

  h.click('col:0:0');
  for (let i=0;i<2;i++) {
    h.click('found:0');
    assert.equal(feedback.hidden,true);
    assert.equal(h.api.state().moves,g.moves);
    assert.equal(h.api.state().found[0].length,0);
    assert.match(table.innerHTML,/data-key="col:0:0"[^>]*aria-pressed="true"/);
  }

  h.click('col:1:0');
  assert.equal(h.api.state().moves,g.moves+1);
  assert.equal(h.api.state().cols[1].at(-1)?.id,c(7).id);
});

test('undo and redo announce the move without showing a toast',()=>{
  const g=board();g.cols[1]=[c(8,'♥')];
  const h=app(g),feedback=h.get('hint-feedback'),message=h.get('message');
  h.click('col:0:0');h.click('col:1:0');

  h.get('undo').onclick();
  assert.equal(h.api.state().moves,g.moves);
  assert.equal(h.api.state().cols[0].at(-1)?.id,c(7).id);
  assert.equal(feedback.hidden,true);
  assert.equal(message['aria-live'],'polite');
  assert.equal(message.textContent,'Move undone.');

  h.get('redo').onclick();
  assert.equal(h.api.state().moves,g.moves+1);
  assert.equal(h.api.state().cols[1].at(-1)?.id,c(7).id);
  assert.equal(feedback.hidden,true);
  assert.equal(message.textContent,'Move restored.');
});

test('missed drops and drag cancellation return the card and restore the idle message',()=>{
  const g=board();g.cols[1]=[c(8,'♥')];
  const h=app(g),message=h.get('message'),idle=message.textContent;
  const finish = [touch=>touch.release(12),touch=>touch.cancel(),
    ()=>h.window.emit('resize',{}),()=>h.document.emit('keydown',{key:'Escape',target:{tagName:'BUTTON'}})];
  for (const end of finish) {
    const touch=h.startTouch(0,0,null);
    touch.move(12);
    assert.ok(h.preview());
    assert.equal(message.textContent,'Release to place the card. Escape cancels.');

    end(touch);
    assert.equal(h.preview(),undefined);
    assert.equal(h.api.state().moves,g.moves);
    assert.equal(h.api.state().cols[0].at(-1)?.id,c(7).id);
    assert.equal(h.get('hint-feedback').hidden,true);
    assert.equal(message['aria-live'],'polite');
    assert.equal(message.textContent,idle);
  }
});

test('a storage read warning expires after eight seconds without restarting on render',()=>{
  const h=app(null,new Map([['kabale-session-v3','{']]));
  const feedback=h.get('hint-feedback');
  assert.equal(feedback.hidden,false);
  assert.match(h.get('hint-feedback-text').textContent,/Your saved game could not be loaded/);
  const [[warningTimer,{delay}]]=h.timers;
  assert.equal(delay,8000);

  h.get('card-art').onchange({target:{value:'contrast'}});
  assert.deepEqual([...h.timers.keys()],[warningTimer]);
  h.expireTimer(warningTimer);
  assert.equal(feedback.hidden,true);
  assert.equal(h.get('message')['aria-live'],'polite');
});

test('replaced and explicitly dismissed warnings cannot dismiss newer feedback',()=>{
  const g=board();g.cols[1]=[c(8,'♥')];
  const h=app(g),feedback=h.get('hint-feedback'),label=h.get('hint-feedback-text');
  h.stored.set=()=>{throw new Error('Storage blocked');};
  h.api.flush();
  const [[first,{callback:stale}]]=h.timers;
  h.api.flush();
  assert.equal(h.timers.has(first),false);
  const [[second,{callback:dismissed}]]=h.timers;
  stale();
  assert.equal(feedback.hidden,false);
  assert.match(label.textContent,/storage is unavailable/i);

  h.get('hint-feedback-close').onclick();
  assert.equal(h.timers.has(second),false);
  assert.equal(feedback.hidden,true);
  h.get('hint').onclick();
  assert.equal(feedback.dataset.hint,'true');
  assert.equal(h.timers.size,0);
  const hint=label.textContent;
  dismissed();
  assert.equal(feedback.hidden,false);
  assert.equal(label.textContent,hint);
});

test('requesting a hint dismisses the active warning and shows the hint immediately',()=>{
  const g=engine.deal('freecell');g.cols=[[c(7)],[c(8,'♥')],[],[],[],[],[],[]];
  const h=app(g);
  h.stored.set=()=>{throw new Error('Storage blocked');};
  h.api.flush();
  h.get('hint').onclick();
  assert.match(h.get('hint-feedback-text').textContent,/Move 7/);
  assert.equal(h.get('hint-feedback').dataset.hint,'true');
  assert.equal(h.timers.size,0);
});

test('a warning pauses its dismissal timer while Dismiss has focus',()=>{
  const h=app(null,new Map([['kabale-session-v3','{']]));
  const button=h.get('hint-feedback-close');
  const [[initial,{callback:stale}]]=h.timers;
  h.document.activeElement=button;
  button.emit('focus',{});
  assert.equal(h.timers.has(initial),false);
  stale();
  assert.equal(h.get('hint-feedback').hidden,false);

  h.document.activeElement=null;
  button.emit('blur',{});
  const [[resumed,{delay}]]=h.timers;
  assert.equal(delay,7900);
  stale();
  assert.equal(h.get('hint-feedback').hidden,false);
  h.expireTimer(resumed);
  assert.equal(h.get('hint-feedback').hidden,true);
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
  h.get('hint').onclick();h.click('col:0:0');
  assert.equal(h.get('hint-feedback').dataset.hint,'false');
  assert.equal(h.get('hint-feedback').hidden,true);
  assert.equal(h.get('hint-feedback-text').textContent,'');
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

test('Pyramid reveals the hinted stock and moves a colliding toast without resizing the board',()=>{
  const g=engine.deal('pyramid');
  g.cols=g.cols.map(row=>row.map(card=>({...card,r:2})));
  g.stock=[{...c(3,'♣'),up:false}];
  const h=app(g);
  const table=h.get('board'), toast=h.get('hint-feedback');
  const layout={};
  table.style.setProperty=(name,value)=>{layout[name]=value;};
  const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
  table.getBoundingClientRect=()=>rect(0,80,600,parseFloat(layout['--table-height']));
  Object.assign(table,{clientTop:1,clientHeight:178,scrollHeight:260,scrollTop:0});
  const stock={getBoundingClientRect:()=>rect(260,264-table.scrollTop,40,62)};
  table.querySelector=selector=>selector==='.hint-source' ? stock : null;
  table.querySelectorAll=selector=>selector==='.hint-source, .hint-destination' ? [stock] : [];
  toast.getBoundingClientRect=()=>rect(toast.dataset.corner.endsWith('right') ? h.window.innerWidth-332 : 12,
    toast.dataset.corner.startsWith('bottom') ? h.window.innerHeight-66 : 12,320,54);

  Object.assign(h.window,{innerWidth:600,innerHeight:240});
  h.window.emit('resize',{});
  const before={...layout};
  h.get('hint').onclick();

  assert.equal(h.get('hint-feedback-text').textContent,'Draw from the stock.');
  assert.match(table.innerHTML,/hint-source[^>]*data-key="stock"[^>]*>/);
  assert.equal(table.scrollTop,67);
  const stockBox=stock.getBoundingClientRect();
  assert.ok(stockBox.top+stockBox.height/2 < h.window.innerHeight);
  assert.deepEqual(layout,before);
  assert.equal(toast.dataset.corner,'top-right');
  assert.ok(toast.getBoundingClientRect().bottom <= stockBox.top);

  table.scrollTop=0;
  table.emit('scroll',{});
  assert.equal(toast.dataset.corner,'bottom-right');
  table.scrollTop=67;
  table.emit('scroll',{});
  assert.equal(toast.dataset.corner,'top-right');

  h.stored.set=()=>{throw new Error('Storage blocked');};
  h.api.flush();
  assert.match(h.get('hint-feedback-text').textContent,/storage is unavailable/i);
  assert.equal(toast.dataset.hint,'false');
  assert.equal(toast.dataset.corner,'top-right');
  assert.match(table.innerHTML,/hint-source[^>]*data-key="stock"[^>]*>/);
  const [[warningTimer,{delay}]]=h.timers;
  assert.equal(delay,8000);
  h.expireTimer(warningTimer);
  assert.equal(toast.hidden,false);
  assert.equal(toast.dataset.hint,'true');
  assert.equal(h.get('hint-feedback-text').textContent,'Draw from the stock.');
  assert.equal(toast.dataset.corner,'top-right');

  Object.assign(h.window,{innerWidth:1280,innerHeight:768});
  h.window.emit('resize',{});
  assert.equal(toast.dataset.corner,'bottom-right');
  h.get('hint-feedback-close').onclick();
  assert.equal(toast.hidden,true);
});

function freeCellKingRun() {
  const g=engine.deal('freecell');
  g.cols=[[c(13),c(12,'♥'),c(11,'♣'),c(10,'♦')],[],[c(3)],[c(4,'♥')],[c(5)],[c(6)],[c(7)],[c(8)]];
  g.cells=[null,null,c(2),c(2,'♥')];
  return g;
}

function freeCellBeforeWin() {
  const g=engine.deal('freecell');
  const suits=['♠','♥','♦','♣'];
  g.found=suits.map(suit=>Array.from({length:12},(_,i)=>c(i+1,suit)));
  g.cols=[[c(13)],[c(13,'♥')],[c(13,'♦')],[],[],[],[],[]];
  g.cells=[c(13,'♣'),null,null,null];
  g.moves=48;
  return g;
}

test('FreeCell defaults to auto-fill in a saved game and treats the entire win as one action',()=>{
  const g=freeCellBeforeWin(),h=app(g);
  assert.equal(h.get('freecell-options').hidden,false);
  assert.equal(h.get('freecell-auto-fill-foundations').value,'on');

  h.click('col:0:0');
  assert.equal(h.api.state().moves,48);
  h.click('col:0:0');
  const won=structuredClone(h.api.state());
  assert.equal(won.moves,52);
  assert.equal(won.won,true);
  assert.deepEqual(won.found.map(pile=>pile.length),[13,13,13,13]);
  assert.equal(won.cells[0],null);
  assert.equal(h.api.past().length,1);
  assert.equal(h.get('end-dialog').open,true);
  assert.match(h.get('end-stats').textContent,/52 moves/);

  h.get('end-keep').onclick();
  h.get('undo').onclick();
  assert.deepEqual(h.api.state(),g);
  h.get('redo').onclick();
  assert.deepEqual(h.api.state(),won);
});

test('FreeCell auto-fill opt-out persists across reload and can change during a deal',()=>{
  const h=app(freeCellBeforeWin());
  const setting=h.get('freecell-auto-fill-foundations');
  const game=h.api.state();
  setting.value='off';
  setting.onchange({target:setting});
  assert.equal(h.api.state(),game);

  const reloaded=app(null,h.stored);
  const savedSetting=reloaded.get('freecell-auto-fill-foundations');
  assert.equal(savedSetting.value,'off');
  reloaded.click('col:0:0');
  reloaded.click('col:0:0');
  assert.equal(reloaded.api.state().moves,49);
  assert.equal(reloaded.api.state().won,false);

  const inProgress=reloaded.api.state();
  savedSetting.value='on';
  savedSetting.onchange({target:savedSetting});
  assert.equal(reloaded.api.state(),inProgress);
  assert.equal(reloaded.api.past().length,1);
  reloaded.click('col:1:0');
  reloaded.click('col:1:0');
  assert.equal(reloaded.api.state().moves,52);
  assert.equal(reloaded.api.state().won,true);
});

test('FreeCell A key, manual destination and drag each move just one foundation card',()=>{
  const moveSingleCard = [
    h=>{
      h.click('col:0:0',0);
      h.document.emit('keydown',{key:'a',target:{tagName:'BUTTON'},preventDefault(){}});
    },
    h=>{h.click('col:0:0');h.click('found:0');},
    h=>{
      const touch=h.startTouch(0,0,'found:0');
      touch.move(12);
      touch.release(12);
    }
  ];
  for (const move of moveSingleCard) {
    const h=app(freeCellBeforeWin());
    move(h);
    const state=h.api.state();
    assert.equal(state.moves,49);
    assert.equal(state.found[0].at(-1)?.id,c(13).id);
    assert.deepEqual(Array.from(state.found,pile=>pile.length),[13,12,12,12]);
  }
});

test('FreeCell auto-fill requires two pointer clicks on the same card',()=>{
  const h=app(freeCellBeforeWin());
  h.click('col:0:0',0);
  h.click('col:0:0');
  assert.equal(h.api.state().moves,48);
  h.click('col:0:0');
  assert.equal(h.api.state().won,true);
});

function setAutoMoveTrigger(h,value='single') {
  const setting=h.get('auto-move-trigger');
  setting.value=value;
  setting.onchange({target:setting});
}

test('the global auto-move trigger defaults to double-click and changes without replacing the deal',()=>{
  const h=app(freeCellBeforeWin());
  const game=h.api.state();
  assert.equal(h.get('auto-move-trigger').value,'double');
  setAutoMoveTrigger(h);
  assert.equal(h.api.state(),game);
  assert.equal(h.api.past().length,0);

  const reloaded=app(null,h.stored);
  assert.equal(reloaded.get('auto-move-trigger').value,'single');
  reloaded.click('col:0:0');
  assert.equal(reloaded.api.state().moves,52);
  assert.equal(reloaded.api.past().length,1);
  reloaded.get('end-keep').onclick();
  reloaded.get('undo').onclick();
  setAutoMoveTrigger(reloaded,'double');
  reloaded.click('col:0:0');
  assert.equal(reloaded.api.state().moves,48);
  reloaded.click('col:0:0');
  assert.equal(reloaded.api.state().won,true);
});

test('a touch below the drag threshold auto-moves only on the click after release',()=>{
  const probe=motionProbe(), h=app(freeCellBeforeWin(),new Map(),probe.factory);
  setAutoMoveTrigger(h);
  h.get('freecell-auto-fill-foundations').onchange({target:{value:'off'}});
  const tap=h.startTouch(0,0,'found:0');
  assert.equal(h.api.state().moves,48);
  tap.move(3);
  assert.equal(h.preview(),undefined);
  tap.release(3);
  assert.equal(h.api.state().moves,48);
  assert.equal(probe.calls.length,0);
  assert.equal(tap.click(),false);
  assert.equal(probe.calls[0].records[0].to,'found:0');
  assert.equal(h.api.state().moves,49);
  assert.equal(h.api.state().found[0].at(-1).id,c(13).id);
  assert.equal(h.api.state().cells[0].id,c(13,'♣').id);
});

test('single-click auto-move ignores the follow-up click after completed, missed and blocked drags',()=>{
  const completed=app(freeCellBeforeWin());
  setAutoMoveTrigger(completed);
  const drag=completed.startTouch(0,0,'col:3');
  assert.equal(completed.api.state().moves,48);
  drag.move(12);
  assert.ok(completed.preview());
  assert.equal(completed.api.state().moves,48);
  drag.release(12);
  assert.equal(completed.api.state().moves,49);
  assert.equal(completed.api.state().cols[3].at(-1).id,c(13).id);
  assert.equal(completed.api.state().found[0].length,12);
  assert.equal(drag.click('col:3:0'),true);
  assert.equal(completed.api.state().moves,49);
  completed.click('col:3:0');
  assert.equal(completed.api.state().won,true);

  const missed=app(freeCellBeforeWin());
  setAutoMoveTrigger(missed);
  const miss=missed.startTouch(0,0,null);
  miss.move(12);
  assert.ok(missed.preview());
  miss.release(12);
  assert.equal(miss.click(),true);
  assert.equal(missed.api.state().moves,48);
  assert.equal(missed.get('hint-feedback').hidden,true);

  const blockedGame=freeCellKingRun();
  blockedGame.cols[2]=[c(1,'♦')];
  const blocked=app(blockedGame);
  setAutoMoveTrigger(blocked);
  const blockedDrag=blocked.startTouch(0,0,'col:1');
  blockedDrag.move(12);
  assert.equal(blocked.preview(),undefined);
  blockedDrag.release(12);
  assert.equal(blockedDrag.click('col:2:0'),true);
  assert.equal(blocked.api.state().moves,0);
  blocked.click('col:2:0');
  assert.equal(blocked.api.state().found[0].at(-1).id,c(1,'♦').id);
});

test('single-click tries the selected card at its intended destination before auto-moving the clicked card',()=>{
  const g=engine.deal('freecell');
  g.cols=[[c(7),c(6,'♥')],[c(8,'♦')],[],[],[],[],[],[]];
  g.cells[0]=c(1);
  g.found[0]=Array.from({length:7},(_,i)=>c(i+1,'♦'));
  const h=app(g),table=h.get('board');
  setAutoMoveTrigger(h);

  h.click('col:0:0',0);
  h.click('cell:0');
  assert.equal(h.api.state().moves,0);
  assert.equal(h.api.state().cells[0].id,c(1).id);
  assert.match(table.innerHTML,/data-key="col:0:0"[^>]*aria-pressed="true"/);
  assert.equal(h.get('hint-feedback').hidden,true);

  h.click('col:1:0');
  assert.deepEqual(Array.from(h.api.state().cols[1],card=>card.r),[8,7,6]);
  assert.equal(h.api.state().found[0].length,7);
  assert.equal(h.api.state().moves,1);
});

test('single-click falls back to selection and deselection when FreeCell has no automatic destination',()=>{
  const g=engine.deal('freecell');
  g.cols=[[c(7)],[],[],[],[],[],[],[]];
  const h=app(g),table=h.get('board');
  setAutoMoveTrigger(h);
  const selected=/data-key="col:0:0"[^>]*aria-pressed="true"/;
  h.click('col:0:0');
  assert.match(table.innerHTML,selected);
  h.click('col:0:0');
  assert.doesNotMatch(table.innerHTML,selected);
  assert.equal(h.api.state().moves,0);
  assert.equal(h.get('hint-feedback').hidden,true);

  h.click('col:0:0');
  h.click('cell:0');
  assert.equal(h.api.state().cells[0].id,c(7).id);
  assert.equal(h.api.state().moves,1);
});

test('Klondike single-click keeps stock, placeholders and keyboard activation',()=>{
  const g=board();
  g.cols[0]=[c(1)];
  g.cols[1]=[c(1,'♥')];
  g.stock=[{...c(2),up:false}];
  const h=app(g);
  setAutoMoveTrigger(h);
  h.click('found:0');
  assert.equal(h.api.state().moves,g.moves);
  h.click('col:0:0',0);
  assert.equal(h.api.state().moves,g.moves);
  h.document.emit('keydown',{key:'a',target:{tagName:'BUTTON'},preventDefault(){}});
  assert.equal(h.api.state().found[0].at(-1).id,c(1).id);
  h.click('col:1:0');
  assert.equal(h.api.state().found[1].at(-1).id,c(1,'♥').id);
  assert.equal(h.api.state().moves,g.moves+2);
  h.click('stock');
  h.click('stock');
  assert.equal(h.api.state().stock.length,1);
  assert.equal(h.api.state().moves,g.moves+4);
});

test('the same single-click preference works in Spider and Pyramid',()=>{
  const stored=new Map();
  const spider=engine.deal('spider');
  spider.cols=[[c(7)],[c(8,'♥')],...Array.from({length:8},()=>[])];
  const spiderApp=app(spider,stored);
  setAutoMoveTrigger(spiderApp);
  spiderApp.click('col:0:0');
  assert.equal(spiderApp.api.state().cols[1].at(-1).id,c(7).id);

  const pyramid=engine.deal('pyramid');
  pyramid.cols=pyramid.cols.map(row=>row.map(()=>null));
  pyramid.cols[6]=[c(5),c(8,'♥'),null,null,null,null,null];
  const pyramidApp=app(pyramid,stored);
  assert.equal(pyramidApp.get('auto-move-trigger').value,'single');
  pyramidApp.click('p:6:0');
  assert.equal(pyramidApp.api.state().cols[6][0],null);
  assert.equal(pyramidApp.api.state().cols[6][1],null);
  assert.equal(pyramidApp.api.state().moves,1);
});

function pyramidWithTwoPartners() {
  const g=engine.deal('pyramid');
  g.cols=g.cols.map(row=>row.map(()=>null));
  g.cols[5][1]=c(4,'♣');
  g.cols[6].splice(0,3,c(9),c(4,'♥'),c(9,'♦'));
  g.stock=[];
  g.redealsLeft=0;
  return g;
}

for (const shortcut of ['single-click', 'double-click', 'A key']) {
  test(`Pyramid ${shortcut} plays the pair that Help highlights`,()=>{
    const h=app(pyramidWithTwoPartners());
    if (shortcut==='single-click') setAutoMoveTrigger(h);
    h.get('hint').onclick();
    assert.match(h.get('board').innerHTML,/class="[^"]*hint-source"[^>]*data-key="p:6:1"/);
    assert.match(h.get('board').innerHTML,/class="[^"]*hint-destination"[^>]*data-key="p:6:2"/);
    h.click('p:6:1');
    if (shortcut!=='single-click') assert.equal(h.api.state().moves,0);
    if (shortcut==='double-click') h.click('p:6:1');
    if (shortcut==='A key') {
      h.document.emit('keydown',{key:'a',target:{tagName:'BUTTON'},preventDefault(){}});
    }
    assert.equal(h.api.state().cols[6][0]?.id,c(9).id);
    assert.equal(h.api.state().cols[6][2],null);
    h.click('p:5:1');
    if (shortcut!=='single-click') h.click('p:6:0');
    assert.equal(h.api.state().won,true);
  });
}

test('Pyramid lets the player choose a different legal partner after Help',()=>{
  const h=app(pyramidWithTwoPartners());
  h.get('hint').onclick();
  h.click('p:6:1');
  assert.equal(h.api.state().moves,0);
  h.click('p:6:0');
  assert.equal(h.api.state().moves,1);
  assert.equal(h.api.state().cols[6][0],null);
  assert.equal(h.api.state().cols[6][2].id,c(9,'♦').id);
});

test('the auto-fill setting is visible only for FreeCell',()=>{
  const h=app(freeCellBeforeWin()),options=h.get('freecell-options');
  assert.equal(options.hidden,false);
  for (const mode of ['klondike','spider','pyramid','freecell']) {
    h.get('modes').onclick({target:{dataset:{mode}}});
    assert.equal(h.api.state().mode,mode);
    assert.equal(options.hidden,mode!=='freecell');
  }
});

test('FreeCell starts a new double-click after placing a card in a free cell',()=>{
  const g=engine.deal('freecell');
  g.cols=[[c(1)],[],[],[],[],[],[],[]];
  const h=app(g);

  h.click('col:0:0');
  h.click('cell:0');
  assert.equal(h.api.state().moves,1);

  h.click('cell:0');
  assert.equal(h.api.state().cells[0]?.id,c(1).id);
  assert.equal(h.api.state().moves,1);
  assert.match(h.get('board').innerHTML,/data-key="cell:0"[^>]*aria-pressed="true"/);

  h.click('cell:0');
  assert.equal(h.api.state().cells[0],null);
  assert.equal(h.api.state().found[0].at(-1)?.id,c(1).id);
  assert.equal(h.api.state().moves,2);
});

test('FreeCell double-click moves an exposed king to the first empty free cell',()=>{
  const g=engine.deal('freecell');
  const king=c(13), two=c(2,'♣');
  g.cols=[[two,king],[c(3)],[c(4)],[c(5)],[c(6)],[c(7)],[c(8)],[c(9)]];
  g.cells[0]=c(10);
  const h=app(g);
  const cellIds=()=>Array.from(h.api.state().cells,card=>card?.id??null);
  const expectedCells=[g.cells[0].id,king.id,null,null];

  h.click('col:0:1');
  h.click('col:0:1');
  assert.deepEqual(Array.from(h.api.state().cols[0],card=>card.id),[two.id]);
  assert.deepEqual(cellIds(),expectedCells);
  assert.equal(h.api.state().moves,1);

  h.click('cell:1');
  h.click('cell:1');
  assert.deepEqual(cellIds(),expectedCells);
  assert.equal(h.api.state().moves,1);
});

test('FreeCell double-click moves the four of spades to the first empty free cell',()=>{
  const g=engine.deal('freecell');
  const four=c(4), jack=c(11,'♦'), king=c(13,'♣');
  g.cols=[[jack,four],[c(3)],[c(5)],[c(6)],[c(7)],[c(8)],[c(9)],[c(10)]];
  g.cells[0]=king;
  const h=app(g);

  h.click('col:0:1');
  h.click('col:0:1');

  const state=h.api.state();
  assert.deepEqual(Array.from(state.cols[0],card=>card.id),[jack.id]);
  assert.deepEqual(Array.from(state.cells,card=>card?.id??null),[king.id,four.id,null,null]);
  assert.equal(state.moves,1);
});

test('FreeCell keeps the selected stack after repeated clicks on an occupied free cell',()=>{
  const g=engine.deal('freecell');
  g.cols=[[c(7),c(6,'♥')],[c(8,'♥')],[],[],[],[],[],[]];
  g.cells[0]=c(1);
  const h=app(g);

  h.click('col:0:0');
  for (let i=0;i<2;i++) {
    h.click('cell:0');
    assert.equal(h.api.state().moves,0);
    assert.equal(h.get('hint-feedback').hidden,true);
    assert.match(h.get('board').innerHTML,/data-key="col:0:0"[^>]*aria-pressed="true"/);
  }

  h.click('col:1:0');
  assert.deepEqual(Array.from(h.api.state().cols[1],card=>card.r),[8,7,6]);
  assert.equal(h.api.state().moves,1);

  h.click('cell:0');
  assert.match(h.get('board').innerHTML,/data-key="cell:0"[^>]*aria-pressed="true"/);
  h.click('cell:0');
  assert.equal(h.api.state().cells[0],null);
  assert.equal(h.api.state().found[0].at(-1)?.id,c(1).id);
  assert.equal(h.api.state().moves,2);
});

test('FreeCell double-click moves a three-card suffix to the first empty column',()=>{
  const g=freeCellKingRun();
  g.cells[0]=c(3,'♥');
  g.cols[2]=[];
  const h=app(g);

  h.click('col:0:1');
  assert.equal(h.api.state().moves,0);
  h.click('col:0:1');

  const state=h.api.state();
  assert.deepEqual(Array.from(state.cols[0],card=>card.id),[g.cols[0][0].id]);
  assert.deepEqual(Array.from(state.cols[1],card=>card.id),g.cols[0].slice(1).map(card=>card.id));
  assert.equal(state.cols[2].length,0);
  assert.equal(state.moves,1);
});

test('FreeCell double-click blocks the same suffix when one empty column has insufficient capacity',()=>{
  const g=freeCellKingRun();
  g.cells[0]=c(3,'♥');
  const h=app(g);

  h.click('col:0:1');
  h.click('col:0:1');

  const state=h.api.state();
  assert.deepEqual(Array.from(state.cols[0],card=>card.id),g.cols[0].map(card=>card.id));
  assert.equal(state.cols[1].length,0);
  assert.equal(state.moves,0);
});

test('FreeCell blocks the four-card king run but lets the player drag the three-card tail',()=>{
  const h=app(freeCellKingRun());
  const instruction=h.get('message').textContent;
  const king=h.startTouch(0,0,'col:1');
  king.move(12);
  assert.equal(h.preview(),undefined);
  king.release(12);
  assert.equal(king.click(),true);
  assert.equal(h.get('message').textContent,instruction);
  assert.equal(h.api.state().moves,0);

  const tap=h.startTouch(0,0,'col:1');
  tap.move(3);
  tap.release(3);
  assert.equal(tap.click(),false);
  assert.equal(h.get('message').textContent,instruction);
  assert.equal(h.get('hint-feedback').hidden,true);

  const queen=h.startTouch(0,1,'col:1');
  queen.move(12);
  assert.equal(h.preview()?.children.length,3);
  queen.release(12);
  assert.equal(h.preview(),undefined);
  assert.deepEqual(Array.from(h.api.state().cols[0],card=>card.r),[13]);
  assert.deepEqual(Array.from(h.api.state().cols[1],card=>card.r),[12,11,10]);
  assert.equal(h.api.state().moves,1);
});

test('FreeCell can lift the four-card king run with another empty column',()=>{
  const g=freeCellKingRun();
  g.cols[2]=[];
  const h=app(g);
  const king=h.startTouch(0,0,'col:1');
  king.move(12);
  assert.equal(h.preview()?.children.length,4);
  king.release(12);
  assert.equal(h.api.state().cols[0].length,0);
  assert.deepEqual(Array.from(h.api.state().cols[1],card=>card.r),[13,12,11,10]);
});

test('FreeCell hints name both face-up cards and mark the right handles',()=>{
  const g=engine.deal('freecell');
  g.cols=[[c(1,'♦'),c(7,'♣')],[c(13,'♠'),c(8,'♥')],[],[],[],[],[],[]];
  const single=app(g);
  single.get('hint').onclick();
  assert.equal(single.get('hint-feedback-text').textContent,'Move 7♣\uFE0E of clubs onto 8♥\uFE0E of hearts.');
  assert.match(single.get('board').innerHTML,/class="[^"]*hint-source"[^>]*data-key="col:0:1"/);
  assert.match(single.get('board').innerHTML,/class="[^"]*hint-destination"[^>]*data-key="col:1:1"/);
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
  g.cols=[[c(1,'♦'),c(7,'♣')],[c(13,'♠'),c(8,'♥')],[],[],[],[],[],[]];
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
