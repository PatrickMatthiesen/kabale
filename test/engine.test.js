import test from 'node:test';import assert from 'node:assert/strict';import {deal,canMove,move,draw,toCell,cellToCol,toFoundation,runValid,pyramidPlayable,applyMove,legalMoves,autoMove} from '../src/engine.js';
test('Klondike lays 28 cards, seven exposed',()=>{const g=deal('klondike');assert.equal(g.cols.flat().length,28);assert.equal(g.cols.flat().filter(c=>c.up).length,7)});
test('FreeCell deals all 52 face up',()=>{const g=deal('freecell');assert.equal(g.cols.flat().length,52);assert.ok(g.cols.flat().every(c=>c.up))});
test('Spider deals 54 cards and stock of 50',()=>{const g=deal('spider');assert.equal(g.cols.flat().length,54);assert.equal(g.stock.length,50)});
test('Klondike allows a descending alternating sequence and flips newly exposed card',()=>{const g=deal('klondike');g.cols=[[{r:10,s:'♣',up:true},{r:9,s:'♠',up:true},{r:8,s:'♥',up:true}],[{r:10,s:'♥',up:true}]];assert.equal(runValid(g.cols[0].slice(1),'klondike'),true);assert.equal(move(g,0,1,1),true);assert.equal(g.cols[0].length,1)});
test('FreeCell cell can store and release a single card',()=>{const g=deal('freecell');g.cols[0]=[{r:8,s:'♥',up:true}];g.cols[1]=[{r:9,s:'♠',up:true}];assert.equal(toCell(g,0,0),true);assert.equal(cellToCol(g,0,1),true);assert.equal(g.moves,2)});
test('Klondike stock cycles through waste',()=>{const g=deal('klondike');const n=g.stock.length;assert.equal(draw(g),true);assert.equal(g.stock.length,n-1);while(g.stock.length)draw(g);assert.equal(draw(g),true);assert.ok(g.stock.length>0)});
test('foundation only accepts an ace initially',()=>{const g=deal('klondike');g.cols[0]=[{r:2,s:'♠',up:true}];assert.equal(toFoundation(g,0),false);g.cols[0]=[{r:1,s:'♠',up:true}];assert.equal(toFoundation(g,0),true)});
test('Pyramid only exposes bottom cards initially',()=>{const g=deal('pyramid');assert.equal(pyramidPlayable(g,0,0),false);assert.equal(pyramidPlayable(g,6,0),true)});

test('difficulty changes stock draw, free cells, Spider suits and Pyramid redeals',()=>{assert.equal(deal('klondike','hard').drawCount,3);assert.equal(deal('freecell','hard').cells.length,2);assert.equal(deal('spider','easy').suitCount,1);assert.equal(deal('spider','hard').suitCount,4);assert.equal(deal('pyramid','hard').redealsLeft,0)});
test('central moves reject illegal actions without changing game state',()=>{const g=deal('klondike');const before=JSON.stringify(g);assert.equal(applyMove(g,'stock','col:0'),true);assert.equal(applyMove(g,'col:0','col:0'),false);assert.notEqual(JSON.stringify(g),before)});
test('auto move sends an exposed ace to its suit foundation',()=>{const g=deal('klondike');g.cols[0]=[{r:1,s:'♠',id:'ace',up:true}];assert.equal(autoMove(g,'col:0'),true);assert.equal(g.found[0].length,1)});
test('Spider completes a king to ace same-suit run after tableau move',()=>{const g=deal('spider','easy');g.cols=Array.from({length:10},()=>[]);g.cols[0]=Array.from({length:12},(_,i)=>({r:13-i,s:'♠',id:`c${i}`,up:true}));g.cols[1]=[{r:1,s:'♠',id:'ace',up:true}];assert.equal(applyMove(g,'col:1','col:0'),true);assert.equal(g.found.length,1);assert.equal(g.cols[0].length,0)});
test('legal move list marks available stock action',()=>{const g=deal('klondike');assert.ok(legalMoves(g).some(m=>m.from==='stock'))});
test('legal moves enumerate movable tableau sequences and reversible foundation cards',()=>{const g=deal('klondike');g.cols=[[{r:9,s:'♠',id:'9s',up:true},{r:8,s:'♥',id:'8h',up:true}],[{r:9,s:'♣',id:'9c',up:true}],[],[],[],[],[]];assert.ok(legalMoves(g).some(m=>m.from==='col:0:1'&&m.to==='col:1'));g.found[0]=[{r:1,s:'♠',id:'a',up:true}];assert.ok(legalMoves(g).some(m=>m.from==='found:0'))});
test('Spider run requires one suit while tableau still accepts descending cards',()=>{const g=deal('spider','normal');assert.equal(runValid([{r:2,s:'♠',up:true},{r:1,s:'♥',up:true}],'spider'),false)});



test('hard draw takes all final three stock cards',()=>{const g=deal('klondike','hard');g.stock=g.stock.slice(0,3);draw(g);assert.equal(g.stock.length,0);assert.equal(g.waste.length,3)});
test('auto moves a full alternating sequence onto a legal card',()=>{const g=deal('klondike');g.cols=[[{r:9,s:'♠',up:true,id:'nine'},{r:8,s:'♥',up:true,id:'eight'}],[{r:10,s:'♥',up:true,id:'ten'}]];assert.equal(autoMove(g,'col:0:0'),true);assert.equal(g.cols[1].length,3)});
test('hidden cards and negative free-cell indexes cannot move',()=>{const g=deal('freecell');g.cols[0]=[{r:1,s:'♠',up:false,id:'hidden'}];assert.equal(applyMove(g,'col:0:0','found:0'),false);assert.equal(applyMove(g,'col:0:0','cell:-1'),false)});

test('Spider cannot complete a run containing a face-down King', () => {
  const g=deal('spider','easy');
  g.cols=Array.from({length:10},()=>[]);
  g.cols[0]=Array.from({length:12},(_,i)=>({r:13-i,s:'♠',up:i!==0,id:`run-${i}`}));
  g.cols[1]=[{r:1,s:'♠',up:true,id:'ace'}];
  assert.equal(applyMove(g,'col:1:0','col:0'),true);
  assert.equal(g.found.length,0);
  assert.equal(g.cols[0].length,13);
  assert.equal(g.cols[0][0].up,false);
});

test('Spider completed runs are neither hinted nor movable', () => {
  const g=deal('spider','easy');
  g.found=[Array.from({length:13},(_,i)=>({r:13-i,s:'♠',up:true,id:`complete-${i}`}))];
  g.cols[0]=[{r:2,s:'♠',up:true,id:'two'}];
  assert.equal(legalMoves(g).some(m=>m.from.startsWith('found:')),false);
  const before=JSON.stringify(g);
  assert.equal(applyMove(g,'found:0','col:0'),false);
  assert.equal(JSON.stringify(g),before);
});

test('Klondike empty-column option moves any valid sequence only when enabled', () => {
  const g=deal('klondike','normal',{emptyColumns:'any'});
  const sequence=[{r:7,s:'♠',up:true,id:'7s'},{r:6,s:'♥',up:true,id:'6h'}];
  g.cols=[sequence,[],[],[],[],[],[]];
  assert.equal(canMove(g,0,1),true);
  assert.equal(applyMove(g,'col:0:0','col:1'),true);
  assert.equal(g.cols[1].length,2);
  assert.equal(g.emptyColumns,'any');
});

test('Klondike empty-column option applies to waste cards and legal move hints', () => {
  const g=deal('klondike','normal',{emptyColumns:'any'});
  g.cols=Array.from({length:7},()=>[]);
  g.waste=[{r:7,s:'♣',up:true,id:'waste-seven'}];
  assert.ok(legalMoves(g).some(m=>m.from==='waste'&&m.to==='col:0'));
  assert.equal(autoMove(g,'waste'),true);
  assert.equal(g.cols[0][0].id,'waste-seven');
});

test('Klondike missing or invalid empty-column setting preserves King-only rules', () => {
  const g=deal('klondike');
  g.cols=[[{r:7,s:'♠',up:true,id:'7s'}],[],[],[],[],[],[]];
  delete g.emptyColumns;
  assert.equal(applyMove(g,'col:0','col:1'),false);
  g.emptyColumns='unexpected';
  assert.equal(legalMoves(g).some(m=>m.from==='col:0'&&m.to==='col:1'),false);
  g.cols[0]=[{r:13,s:'♠',up:true,id:'ks'}];
  assert.equal(applyMove(g,'col:0','col:1'),true);
});

test('empty-column option leaves FreeCell and Spider rules unchanged', () => {
  const free=deal('freecell','normal',{emptyColumns:'kings'});
  free.cols=Array.from({length:8},()=>[]);
  free.cols[0]=[{r:7,s:'♠',up:true,id:'7s'}];
  assert.equal(applyMove(free,'col:0','col:1'),true);
  const spider=deal('spider','easy',{emptyColumns:'kings'});
  spider.cols=Array.from({length:10},()=>[]);
  spider.cols[0]=[{r:7,s:'♠',up:true,id:'7s'}];
  assert.equal(applyMove(spider,'col:0','col:1'),true);
});
