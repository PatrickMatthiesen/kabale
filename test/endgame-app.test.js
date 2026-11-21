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
      clientWidth:600,querySelectorAll:()=>[],querySelector:()=>null,getBoundingClientRect:()=>({left:0,top:0,width:60,height:90}),replaceChildren(){},focus(){},setAttribute(name,value){this[name]=value;},
      showModal(){this.open=true;},close(){this.open=false;}};
  }
  document.getElementById=id=>{if(!elements.has(id))elements.set(id,el(id));return elements.get(id);};
  document.createElement=()=>({...el(),children:[],append(child){this.children.push(child);},remove(){if(preview===this) preview=undefined;}});
  const window={...eventTarget(),localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)},devicePixelRatio:1,innerHeight:1000,scrollY:0};
  const context={...engine,...art,...hints,...settings,...i18n,getHintRole:hints.hintRole,wasteLayout,boardLayout,gameRules,attachEndgameUI,planKlondikeHint,rememberStock,restoreStockMemory,createCardMotion:motionFactory,document,
    window,performance:{now:()=>clickTime+=100},
    getComputedStyle:()=>({paddingLeft:'8px',paddingRight:'8px'}),ResizeObserver:class{observe(){}},confirm:()=>true,
    setTimeout(callback,delay){timers.set(++nextTimer,{callback,delay});return nextTimer;},
    clearTimeout:id=>timers.delete(id),setInterval(){},Date,console,structuredClone};
  vm.runInNewContext(dragSource+'\n'+source+';globalThis.api={state:()=>g,past:()=>past,choose,flush:saveNow};',context);
  function click(key) {
    const target={dataset:{key},closest:()=>target};
    document.getElementById('board').emit('click',{target,detail:1});
  }
  function startTouch(column,index,destination) {
    const board=document.getElementById('board');
    const pile={querySelectorAll:()=>cards};
    const cardAt=key=>({...el(),dataset:{key},
      closest(selector){return selector==='.col'?pile:this;},
      cloneNode:()=>({...el(),removeAttribute(){}})});
    const cards=context.api.state().cols[column].map((_,i)=>cardAt('col:'+column+':'+i));
    const target=cards[index];
    pointerTarget=destination==null ? null : cardAt('col:'+destination);
    board.contains=element=>element===pointerTarget;
    const pointer={pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:20,clientY:20,target,preventDefault(){this.defaultPrevented=true;}};
    board.emit('pointerdown',pointer);
    return {
      move(distance){window.emit('pointermove',{...pointer,clientY:pointer.clientY+distance});},
      release(distance){window.emit('pointerup',{...pointer,clientY:pointer.clientY+distance});},
      cancel(){window.emit('pointercancel',pointer);},
      click(){
        const event={...pointer,detail:1};
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
  return {get:id=>document.getElementById(id),api:context.api,stored,click,startTouch,preview:()=>preview,window,document,timers,expireTimer};
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

test('FreeCell blocks the four-card king run but lets the player drag the three-card tail',()=>{
  const h=app(freeCellKingRun());
  const instruction=h.get('message').textContent;
  const king=h.startTouch(0,0,1);
  king.move(12);
  assert.equal(h.preview(),undefined);
  king.release(12);
  assert.equal(king.click(),true);
  assert.equal(h.get('message').textContent,instruction);
  assert.equal(h.api.state().moves,0);

  const tap=h.startTouch(0,0,1);
  tap.move(3);
  tap.release(3);
  assert.equal(tap.click(),false);
  assert.equal(h.get('message').textContent,instruction);
  assert.equal(h.get('hint-feedback').hidden,true);

  const queen=h.startTouch(0,1,1);
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
  const king=h.startTouch(0,0,1);
  king.move(12);
  assert.equal(h.preview()?.children.length,4);
  king.release(12);
  assert.equal(h.api.state().cols[0].length,0);
  assert.deepEqual(Array.from(h.api.state().cols[1],card=>card.r),[13,12,11,10]);
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
