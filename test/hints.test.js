import test from 'node:test';
import assert from 'node:assert/strict';
import { hintRole, hintPosition, selectHint } from '../src/hints.js';
import { deal, legalMoves, applyMove } from '../src/engine.js';

const card=(r,s,id,up=true)=>({r,s,id,up});
function table(mode='klondike') {
  return {mode,difficulty:'normal',moves:0,won:false,cols:[],stock:[],waste:[],cells:[],found:mode==='spider'?[]:[[],[],[],[]],removed:[],emptyColumns:'kings'};
}

test('the reported sequence swap cannot send the player back or loop through equivalent columns', () => {
  const game=table();
  game.cols=[
    [card(11,'♠','j1'),card(10,'♥','10h'),card(9,'♠','9'),card(8,'♦','8'),card(7,'♠','7')],
    [card(13,'♣','k'),card(12,'♥','q'),card(11,'♣','j2'),card(10,'♦','10d')]
  ];
  const seen=new Set();
  for(let i=0;i<20;i++) {
    seen.add(hintPosition(game));
    const move=selectHint(game,seen);
    if(!move) return;
    assert.ok(applyMove(game,move.from,move.to));
    assert.ok(!seen.has(hintPosition(game)),'hint returned to an earlier position');
  }
  assert.fail('hints must stop instead of shuffling these two sequences indefinitely');
});

test('revealing a covered card outranks a cosmetic swap and does not inspect its identity', () => {
  const game=table();
  game.cols=[
    [card(10,'♥','parent'),card(9,'♠','nine')],
    [card(10,'♦','other')],
    [card(3,'♠','hidden',false),card(7,'♣','seven')],
    [card(8,'♥','eight')]
  ];
  assert.deepEqual(selectHint(game),{from:'col:2:1',to:'col:3',label:'Move to tableau'});
  const copy=structuredClone(game);
  copy.cols[2][0]=card(13,'♦','different',false);
  assert.deepEqual(selectHint(copy),selectHint(game));
});

test('a foundation move wins over shuffling and the stock wins over a cosmetic swap', () => {
  const game=table();
  game.cols=[[card(10,'♥','parent'),card(9,'♠','nine')],[card(10,'♦','other')],[card(1,'♥','ace')]];
  game.stock=[card(5,'♣','stock',false)];
  assert.equal(selectHint(game).to,'found:0');
  game.cols.pop();
  assert.equal(selectHint(game).from,'stock');
});

test('stock-only Klondike hints stop before repeating a complete stock pass', () => {
  const game=table();
  game.cols=[[]];
  game.stock=[card(6,'♥','six',false),card(8,'♣','eight',false)];
  const seen=new Set([hintPosition(game)]);
  for(let i=0;i<2;i++) {
    const move=selectHint(game,seen);
    assert.equal(move.from,'stock');
    applyMove(game,move.from,move.to);
    seen.add(hintPosition(game));
  }
  assert.equal(selectHint(game,seen),null);
  assert.ok(legalMoves(game).some(m=>m.from==='stock'),'manual stock recycling remains legal');
});

test('moving a whole column to another empty slot or a cell to another cell is not a hint', () => {
  const game=table('freecell');
  game.cols=[[card(12,'♣','queen')],[]];
  game.cells=[card(8,'♥','eight'),null];
  const before=hintPosition(game);
  const copy=structuredClone(game);
  assert.ok(applyMove(copy,'col:0:0','col:1'));
  assert.equal(hintPosition(copy),before);
  assert.ok(applyMove(copy,'cell:0','cell:1'));
  assert.equal(hintPosition(copy),before);
  const hint=selectHint(game);
  assert.notDeepEqual(hint,{from:'col:0:0',to:'col:1',label:'Move to tableau'});
  assert.notDeepEqual(hint,{from:'cell:0',to:'cell:1',label:'Move to free cell'});
});

test('hint selection is legal, non-mutating, and independent of hidden values in every game', () => {
  for(const mode of ['klondike','spider','freecell','pyramid']) {
    const game=deal(mode);
    const original=structuredClone(game);
    const hint=selectHint(game);
    assert.deepEqual(game,original);
    assert.ok(hint===null || legalMoves(game).some(m=>m.from===hint.from&&m.to===hint.to));
    const copy=structuredClone(game);
    for(const c of [...copy.cols.flat(),...copy.stock])if(c&&!c.up){c.r=c.r%13+1;c.s=c.s==='♠'?'♥':'♠';c.id='hidden';}
    assert.equal(hintPosition(copy),hintPosition(game));
    assert.deepEqual(selectHint(copy),hint);
    game.difficulty='hard';
    assert.equal(selectHint(game),null);
  }
});

test('a column destination marks only the exposed top card, not every card', () => {
  const game = {cols:[[{up:false},{up:false},{up:true},{up:true}]]};
  const hint = {from:'waste',to:'col:0'};
  assert.deepEqual(game.cols[0].map((c,i) => hintRole(game,hint,`col:0:${i}`,c.up)), ['', '', '', 'hint-destination']);
});

test('hidden cards never receive source or destination markers; stock can indicate a draw', () => {
  const game = {cols:[[{up:false}]]};
  assert.equal(hintRole(game,{from:'col:0:0',to:'found:0'},'col:0:0',false),'');
  assert.equal(hintRole(game,{from:'waste',to:'col:0'},'col:0:0',false),'');
  assert.equal(hintRole(game,{from:'stock',to:''},'stock',false),'hint-source');
});

test('a sequence source keeps a single marker on its first visible card', () => {
  const game = {cols:[[{up:true},{up:true}]]};
  const hint = {from:'col:0:0',to:'col:1'};
  assert.equal(hintRole(game,hint,'col:0:0',true),'hint-source');
  assert.equal(hintRole(game,hint,'col:0:1',true),'');
});

test('changing unseen stock and covered card values does not change available hints', () => {
  for (const mode of ['klondike','spider']) for (const difficulty of ['easy','normal','hard']) {
    const game=deal(mode,difficulty);
    const before=legalMoves(game);
    const copy=structuredClone(game);
    for (const c of [...copy.cols.flat().filter(c=>!c.up),...copy.stock]) {
      c.r=c.r%13+1;
      c.s=c.s==='♠'?'♥':'♠';
    }
    assert.deepEqual(legalMoves(copy),before,`${mode} ${difficulty}`);
  }
});
