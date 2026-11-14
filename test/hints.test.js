import test from 'node:test';
import assert from 'node:assert/strict';
import { hintRole } from '../src/hints.js';
import { deal, legalMoves } from '../src/engine.js';

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
