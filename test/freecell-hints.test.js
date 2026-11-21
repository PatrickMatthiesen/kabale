import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, legalMoves } from '../src/engine.js';
import { planFreeCellHint } from '../src/freecell-hints.js';
import { hintVisitKey } from '../src/hints.js';

const suits = { S: '♠', H: '♥', D: '♦', C: '♣' };
const ranks = 'A23456789TJQK';
const card = id => ({ id, up: true, r: ranks.indexOf(id[1]) + 1, s: suits[id[0]] });
const pile = ids => ids ? ids.split(' ').map(card) : [];

function board(columns, cells = [null, null, null, null], foundations = ['', '', '', '']) {
  return {
    mode: 'freecell', difficulty: 'normal', moves: 0, won: false,
    cols: columns.map(pile), cells: cells.map(id => id ? card(id) : null), found: foundations.map(pile),
    stock: [], waste: []
  };
}

function follow(game, visited, expected) {
  const move = planFreeCellHint(game, visited, { maxTimeMs: Infinity });
  assert.deepEqual(move, expected);
  assert.ok(applyMove(game, move.from, move.to));
  const key = hintVisitKey(game);
  assert.ok(!visited.has(key));
  visited.add(key);
}

test('FreeCell Help uses a temporary cell to reach a buried foundation card', () => {
  const game = board(['C2 H5', 'D9 S8'], [null], ['CA', '', '', '']);
  const original = structuredClone(game);
  const visited = new Set([hintVisitKey(game)]);
  assert.ok(!legalMoves(game).some(move => move.to.startsWith('found:')));
  assert.deepEqual(planFreeCellHint(game, visited, { maxTimeMs: Infinity }), { from: 'col:0:1', to: 'cell:0' });
  assert.deepEqual(game, original);
  assert.deepEqual([...visited], [hintVisitKey(original)]);

  follow(game, visited, { from: 'col:0:1', to: 'cell:0' });
  follow(game, visited, { from: 'col:0:0', to: 'found:0' });
});

test('FreeCell Help skips equivalent positions even when a slot is available', () => {
  const game = board(['SK', ''], ['DK', null]);
  const filled = structuredClone(game);
  assert.ok(applyMove(filled, 'cell:0', 'col:1'));
  const parked = structuredClone(game);
  assert.ok(applyMove(parked, 'col:0:0', 'cell:1'));
  const visited = new Set([hintVisitKey(filled), hintVisitKey(parked)]);
  assert.equal(planFreeCellHint(game, visited, { maxTimeMs: Infinity }), null);
});

test('FreeCell Help avoids a plan that returns to a visited position after its first move', () => {
  const game = board(['C2 H5', 'S6', 'C6'], [], ['CA', '', '', '']);
  const endpoint = structuredClone(game);
  assert.ok(applyMove(endpoint, 'col:0:1', 'col:1'));
  assert.ok(applyMove(endpoint, 'col:0:0', 'found:0'));

  assert.deepEqual(planFreeCellHint(game, new Set(), { maxTimeMs: Infinity }), { from: 'col:0:1', to: 'col:1' });
  const visited = new Set([hintVisitKey(endpoint)]);
  assert.deepEqual(planFreeCellHint(game, visited, { maxTimeMs: Infinity }), { from: 'col:0:1', to: 'col:2' });
});

test('FreeCell Help can expose a card without reading its hidden rank or suit', () => {
  const game = board(['S4', 'H5'], []);
  const hidden = {
    up: false,
    get r() { throw Error('read hidden rank'); },
    get s() { throw Error('read hidden suit'); }
  };
  game.cols[0].unshift(hidden);
  assert.deepEqual(planFreeCellHint(game, new Set(), { maxTimeMs: Infinity }), { from: 'col:0:1', to: 'col:1' });
  assert.equal(game.cols[0][0], hidden);
  assert.equal(hidden.up, false);
});

test('FreeCell Help leaves a foundation ace in place when withdrawing it only spends space', () => {
  const game = board([''], [null], ['SA', '', '', '']);
  assert.ok(legalMoves(game).some(move => move.from === 'found:0'));
  assert.equal(planFreeCellHint(game, new Set(), { maxTimeMs: Infinity }), null);
});

test('FreeCell Help moves the four before transferring the exposed four-card run', () => {
  const game = board([
    'D4 DQ H3 CQ SJ C3 C8 H7 C6 D5 C4',
    'HA S7 S5 HT D2',
    'DJ CK C9 H6 C5',
    'DK CJ S8 D6',
    'D3 S3 SK DA D8 CT H9',
    'D9 HQ H2 SQ HJ HK',
    'ST S6 H5',
    'H8 S2 H4 D7 S4 DT S9'
  ], [null, 'C7', null, null], ['SA', 'CA C2', '', '']);
  assert.ok(!legalMoves(game).some(move => move.from === 'col:0:6' && move.to === 'col:4'));
  const visited = new Set([hintVisitKey(game)]);
  follow(game, visited, { from: 'col:0:10', to: 'col:6' });
  follow(game, visited, { from: 'col:0:6', to: 'col:4' });
});

test('FreeCell Help respects the time budget and disabled difficulty', () => {
  const game = board(['SA']);
  assert.equal(planFreeCellHint(game, new Set(), { maxTimeMs: 0 }), null);
  assert.equal(planFreeCellHint({ ...game, difficulty: 'hard' }), null);
});
