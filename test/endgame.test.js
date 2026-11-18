import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMove, deal, legalMoves } from '../src/engine.js';
import { completionPlan, gameOutcome } from '../src/endgame.js';

const c=(r,s,id,up=true)=>({r,s,id,up});
const empty=(mode,difficulty='normal')=>({mode,difficulty,won:false,moves:0,cols:mode==='pyramid'?Array.from({length:7},(_,y)=>Array(y+1).fill(null)):Array.from({length:mode==='klondike'?7:mode==='spider'?10:8},()=>[]),stock:[],waste:[],found:mode==='spider'?[]:Array.from({length:4},()=>[]),cells:mode==='freecell'?Array(difficulty==='hard'?2:4).fill(null):[],removed:[],pairWaste:[],redealsLeft:0});

test('a position with any legal action is still playing, including draws and redeals',()=>{
  const k=empty('klondike');k.cols=[[]];k.stock=[c(2,'♠','draw',false)];assert.equal(gameOutcome(k).kind,'playing');
  const p=empty('pyramid');p.cols[6][0]=c(13,'♠','king');p.stock=[];p.pairWaste=[c(2,'♥','old')];p.redealsLeft=1;assert.equal(gameOutcome(p).kind,'playing');
});

test('blocked messages distinguish easy guidance, neutral normal and hard recovery',()=>{
  for(const mode of ['klondike','spider','freecell','pyramid']) {
    const g=empty(mode);
    assert.equal(gameOutcome(g).kind,'blocked');
    assert.match(gameOutcome({...g,difficulty:'easy'}).message,/Undo/);
    assert.doesNotMatch(gameOutcome({...g,difficulty:'normal'}).message,/Undo/);
    assert.match(gameOutcome({...g,difficulty:'hard'}).message,/Restart this deal/);
  }
  assert.equal(gameOutcome({...empty('klondike'),won:true}).kind,'won');
});

test('Klondike and FreeCell only offer verified foundation cleanup with fully visible cards',()=>{
  for(const mode of ['klondike','freecell']) {
    const g=empty(mode);
    g.found=['♠','♥','♦','♣'].map(s=>Array.from({length:12},(_,i)=>c(i+1,s,`${s}${i+1}`)));
    g.cols[0]=[c(13,'♠','king')];g.cols[1]=[c(13,'♥','king2')];g.cols[2]=[c(13,'♦','king3')];g.cols[3]=[c(13,'♣','king4')];
    g.cells=mode==='freecell'?[null]:[];
    const before=structuredClone(g),plan=completionPlan(g);
    assert.equal(plan.length,4);
    assert.deepEqual(g,before,'planning does not mutate the input');
    for(const step of plan)assert.ok(applyMove(g,step.from,step.to));
    assert.equal(g.won,true);
  }
});

test('Spider offers cleanup only when each move completes a full run',()=>{
  const g=empty('spider');g.found=Array.from({length:7},()=>[]);g.cols=Array.from({length:10},()=>[]);
  g.cols[0]=Array.from({length:12},(_,i)=>c(13-i,'♠',`run${i}`));g.cols[1]=[c(1,'♠','ace')];
  const before=structuredClone(g),plan=completionPlan(g);
  assert.deepEqual(plan,[{from:'col:1:0',to:'col:0'}]);
  assert.deepEqual(g,before);
  assert.ok(applyMove(g,plan[0].from,plan[0].to));assert.equal(g.won,true);
  const uncertain=empty('spider');uncertain.found=Array.from({length:7},()=>[]);uncertain.cols=Array.from({length:10},()=>[]);
  uncertain.cols[0]=Array.from({length:13},(_,i)=>c(13-i,'♠',`run${i}`));uncertain.cols[0][0].up=false;
  assert.equal(completionPlan(uncertain),null);
});

test('Pyramid offers only an immediate safe finish with one or two cards, without using stock',()=>{
  const one=empty('pyramid');one.cols[6][0]=c(13,'♠','king');one.stock=[];
  assert.deepEqual(completionPlan(one),[{from:'p:6:0',to:'p:6:0'}]);
  const two=empty('pyramid');two.cols[6][0]=c(5,'♠','five');two.cols[6][1]=c(8,'♥','eight');two.stock=[];
  assert.deepEqual(completionPlan(two),[{from:'p:6:0',to:'p:6:1'}]);
  const blocked=empty('pyramid');blocked.cols[6][0]=c(5,'♠','five');blocked.cols[6][1]=c(8,'♥','eight');blocked.stock=[c(2,'♦','stock',false)];
  assert.deepEqual(completionPlan(blocked),[{from:'p:6:0',to:'p:6:1'}]);
  const larger=empty('pyramid');larger.cols[6][0]=c(5,'♠','five');larger.cols[6][1]=c(8,'♥','eight');larger.cols[6][2]=c(13,'♣','king');larger.stock=[];
  assert.equal(completionPlan(larger),null);
});

test('foundation cleanup includes exposed free-cell and waste cards',()=>{
  for(const mode of ['klondike','freecell']) {
    const g=empty(mode);
    g.found=['♠','♥','♦','♣'].map(s=>Array.from({length:s==='♠'?12:13},(_,i)=>c(i+1,s,`${s}${i+1}`)));
    if(mode==='klondike')g.waste=[c(13,'♠','last')];
    else g.cells[0]=c(13,'♠','last');
    const plan=completionPlan(g);
    assert.equal(plan.length,1);
    assert.ok(applyMove(g,plan[0].from,plan[0].to));assert.equal(g.won,true);
  }
});

test('being face up is not enough when foundation-only cleanup gets stuck',()=>{
  const g=empty('freecell');g.cols[0]=[c(1,'♠','ace'),c(2,'♥','two')];
  assert.equal(completionPlan(g),null);
});

test('cleanup does not inspect hidden card values',()=>{
  const secret={up:false};Object.defineProperty(secret,'r',{enumerable:true,get(){throw Error('hidden rank read');}});
  const g=empty('klondike');g.cols[0]=[secret];assert.equal(completionPlan(g),null);
  g.cols[0]=[];g.stock=[secret];assert.equal(completionPlan(g),null);
  const p=empty('pyramid');p.cols[6][0]=c(13,'♠','king');p.stock=[secret];
  assert.equal(completionPlan(p).length,1);
});

test('face-up cards and hard mode do not imply that finish is safe or unavailable',()=>{
  const g=deal('klondike','hard');for(const card of g.stock)card.up=true;
  for(const pile of g.cols)for(const card of pile)card.up=true;
  assert.equal(completionPlan(g),null,'stock and waste still contain cards');
  const safe=empty('freecell','hard');safe.found=['♠','♥','♦','♣'].map(s=>Array.from({length:12},(_,i)=>c(i+1,s,`${s}${i+1}`)));safe.cols[0]=[c(13,'♠','king')];safe.cols[1]=[c(13,'♥','king2')];safe.cols[2]=[c(13,'♦','king3')];safe.cols[3]=[c(13,'♣','king4')];
  assert.equal(completionPlan(safe).length,4);
});

test('finish plans contain legal actions and stop at a won position',()=>{
  const g=empty('klondike');g.found=['♠','♥','♦','♣'].map(s=>Array.from({length:12},(_,i)=>c(i+1,s,`${s}${i+1}`)));g.cols[0]=[c(13,'♠','king')];g.cols[1]=[c(13,'♥','king2')];g.cols[2]=[c(13,'♦','king3')];g.cols[3]=[c(13,'♣','king4')];
  const plan=completionPlan(g);assert.ok(plan);
  for(const step of plan){assert.ok(legalMoves(g).some(move=>move.from===step.from&&move.to===step.to));assert.ok(applyMove(g,step.from,step.to));}
  assert.equal(g.won,true);
});
