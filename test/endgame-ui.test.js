import assert from 'node:assert/strict';
import test from 'node:test';
import { attachEndgameUI, formatTime } from '../src/endgame-ui.js';

const card=(r,s='♠')=>({r,s,id:`${s}${r}`,up:true});
const game=()=>({mode:'klondike',difficulty:'normal',moves:12,won:false,emptyColumns:'kings',cols:[[card(7)]],stock:[],waste:[],cells:[],found:[[],[],[],[]],removed:[]});
function harness(seen=new Set()) {
  const calls=[];
  const e=Object.fromEntries(['dialog','actions','summary','finish','review','close','keep','undo','restart','newDeal','title','message','stats','winTime'].map(key=>[key,{hidden:false,disabled:false,textContent:'',dataset:{},classList:{toggle(){}}}]));
  let otherDialog=false;
  e.dialog.open=false;
  e.dialog.ownerDocument={querySelector:()=>otherDialog?{}:null,activeElement:{focus:()=>calls.push('focus')}};
  e.dialog.showModal=()=>{e.dialog.open=true;calls.push('show');};
  e.dialog.close=()=>{e.dialog.open=false;};
  const ui=attachEndgameUI({elements:e,seen,onSeen:()=>calls.push('seen'),onUndo:()=>calls.push('undo'),onRestart:()=>{calls.push('restart');return true;},onNew:()=>{calls.push('new');return true;},onFinish:plan=>calls.push(plan)});
  return {ui,e,calls,seen,other:val=>{otherDialog=val;},update:(g,canUndo=true)=>ui.update(g,{canUndo,time:'02:45'})};
}

test('a definite dead end offers recovery, and dismissal stays dismissed across renders and reload',()=>{
  const h=harness(),g=game();h.update(g);
  assert.equal(h.e.dialog.open,true);
  assert.equal(h.e.undo.hidden,false);
  assert.equal(h.e.finish.hidden,true);
  assert.equal(h.e.stats.hidden,true);
  h.e.keep.onclick();h.update(g);
  assert.equal(h.e.dialog.open,false);
  assert.equal(h.e.actions.hidden,false);
  assert.equal(h.calls.filter(c=>c==='show').length,1);
  const restored=harness(new Set(JSON.parse(JSON.stringify([...h.seen]))));
  restored.update(g);
  assert.equal(restored.e.dialog.open,false);
  restored.e.review.onclick();assert.equal(restored.e.dialog.open,true);
});

test('Hard has no undo recovery; empty Easy/Normal history disables undo',()=>{
  for(const difficulty of ['easy','normal','hard']){
    const h=harness(),g=game();g.difficulty=difficulty;h.update(g,false);
    assert.equal(h.e.undo.hidden,difficulty==='hard');
    assert.equal(h.e.undo.disabled,true);
    assert.equal(h.e.newDeal.hidden,false);
    if(difficulty==='easy') assert.doesNotMatch(h.e.message.textContent,/Undo/);
  }
});

test('undo, replay and new-deal buttons invoke the existing recovery actions',()=>{
  for(const [button,call] of [['undo','undo'],['restart','restart'],['newDeal','new']]){
    const h=harness();h.update(game());h.e[button].onclick();
    assert.ok(h.calls.includes(call));assert.equal(h.e.dialog.open,false);
  }
});

test('playable boards never open a loss notice even if the hint engine might decline a repeat',()=>{
  const h=harness(),g=game();g.stock=[{...card(8),up:false}];h.update(g);
  assert.equal(h.e.dialog.open,false);
  assert.equal(h.e.actions.hidden,true);
});

test('end notices wait for another dialog to close',()=>{
  const h=harness(),g=game();h.other(true);h.update(g);
  assert.equal(h.seen.size,0);assert.equal(h.e.dialog.open,false);
  h.other(false);h.update(g);assert.equal(h.e.dialog.open,true);
});

test('undoing to a playable board closes the result; reset allows the next deal to notify',()=>{
  const h=harness();h.update(game());
  const playable=game();playable.stock=[{...card(8),up:false}];h.update(playable);
  assert.equal(h.e.dialog.open,false);
  h.seen.clear();h.ui.reset();h.update(game());assert.equal(h.e.dialog.open,true);
});

test('a win shows final time and moves once, with replay and new-deal choices',()=>{
  const h=harness(),g=game();g.won=true;h.update(g);
  assert.equal(h.e.dialog.dataset.outcome,'won');
  assert.equal(h.e.stats.textContent,'02:45 · 12 moves');assert.equal(h.e.stats.hidden,false);
  assert.equal(h.e.winTime.hidden,true);
  assert.equal(h.e.undo.hidden,true);assert.equal(h.e.finish.hidden,true);
  h.e.keep.onclick();h.update(g);assert.equal(h.e.dialog.open,false);
});

test('the first recorded win shows the new personal best and preserves the final stats',()=>{
  const h=harness(),g={...game(),won:true};
  h.ui.update(g,{canUndo:true,time:'02:45',winResult:{seconds:165,previousSeconds:null,bestSeconds:165,isNewBest:true}});
  assert.equal(h.e.stats.textContent,'02:45 · 12 moves');
  assert.equal(h.e.winTime.hidden,false);
  assert.equal(h.e.winTime.textContent,'New best time\nPersonal best: 02:45');
});

test('win time compares with the previous win independently of the personal best',()=>{
  const h=harness(),g={...game(),won:true};
  const cases=[
    [{seconds:155,previousSeconds:165,bestSeconds:150,isNewBest:false},'Personal best: 02:30\n00:10 faster than the previous win'],
    [{seconds:145,previousSeconds:155,bestSeconds:145,isNewBest:true},'New best time\nPersonal best: 02:25\n00:10 faster than the previous win'],
    [{seconds:65,previousSeconds:0,bestSeconds:0,isNewBest:false},'Personal best: 00:00\n01:05 slower than the previous win'],
    [{seconds:0,previousSeconds:0,bestSeconds:0,isNewBest:false},'Personal best: 00:00\nSame time as the previous win']
  ];
  for (const [winResult,expected] of cases) {
    h.ui.update(g,{canUndo:true,time:formatTime(winResult.seconds),winResult});
    assert.equal(h.e.winTime.textContent,expected);
  }
});

test('win time localizes on update and clears when leaving a recorded win',()=>{
  const h=harness(),g={...game(),won:true};
  const winResult={seconds:3605,previousSeconds:3665,bestSeconds:3605,isNewBest:true};
  const options={canUndo:true,time:formatTime(winResult.seconds)};
  h.ui.update(g,{...options,winResult});
  h.ui.update(g,{...options,winResult,language:'da'});
  assert.equal(h.e.winTime.textContent,'Ny rekordtid\nPersonlig rekord: 60:05\n01:00 hurtigere end sidst');
  const playable=game();playable.stock=[{...card(8),up:false}];
  for (const [board,result] of [[game(),winResult],[playable,winResult],[g,undefined]]) {
    h.ui.update(g,{...options,winResult});
    h.ui.update(board,{...options,winResult:result});
    assert.equal(h.e.winTime.hidden,true);
    assert.equal(h.e.winTime.textContent,'');
  }
});

test('verified cleanup is offered on Hard without opening a notice or moving cards',()=>{
  const h=harness(),g=game();g.difficulty='hard';
  g.found=['♠','♥','♦','♣'].map(s=>Array.from({length:s==='♠'?12:13},(_,i)=>card(i+1,s)));
  g.cols=[[card(13)]];
  const before=structuredClone(g);h.update(g);
  assert.deepEqual(g,before);assert.equal(h.e.dialog.open,false);
  assert.equal(h.e.finish.hidden,false);h.e.finish.onclick();
  const plan=h.calls.find(Array.isArray);assert.ok(plan.length>0);
});
