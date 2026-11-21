import test from 'node:test';
import assert from 'node:assert/strict';
import { cardTransfers } from '../src/card-transfers.js';
import { applyMove, autoMove, draw } from '../src/engine.js';

const card = (id, r, s = '♠', up = true) => ({ id, r, s, up });
const board = (mode, state) => ({
  mode,
  cols: [],
  stock: [],
  waste: [],
  pairWaste: [],
  found: [],
  cells: [],
  removed: [],
  redealsLeft: 1,
  moves: 0,
  won: false,
  ...state,
});
const transfer = (from, to, arrives = true) => ({ from, to, arrives });

function play(before, move) {
  const after = structuredClone(before);
  assert.equal(move(after), true);
  return after;
}

test('Klondike maps the moving sequence bottom to top and skips the exposed flip', () => {
  const before = board('klondike', {
    cols: [
      [card('back', 3, '♠', false), card('nine', 9), card('eight', 8, '♥')],
      [card('ten', 10, '♦')],
    ],
  });
  const after = play(before, game => applyMove(game, 'col:0:1', 'col:1'));
  assert.equal(after.cols[0][0].up, true);
  assert.deepEqual(cardTransfers(before, after), [
    transfer('col:0:1', 'col:1:1'),
    transfer('col:0:2', 'col:1:2'),
  ]);
  assert.deepEqual(cardTransfers(after, before), [
    transfer('col:1:1', 'col:0:1'),
    transfer('col:1:2', 'col:0:2'),
  ]);
});

test('Klondike waste to tableau and undo affect only the moved card', () => {
  const before = board('klondike', {
    waste: [card('buried', 4), card('lower', 8), card('previous', 6), card('nine', 9)],
    cols: [[card('ten', 10, '♥')]],
  });
  const after = play(before, game => applyMove(game, 'waste', 'col:0'));
  assert.deepEqual(cardTransfers(before, after), [transfer('waste', 'col:0:1')]);
  assert.deepEqual(cardTransfers(after, before), [transfer('col:0:1', 'waste')]);
});

test('Klondike waste to foundation and undo affect only the moved card', () => {
  const before = board('klondike', {
    waste: [card('previous', 8), card('two', 2)],
    found: [[card('ace', 1)]],
  });
  const after = play(before, game => applyMove(game, 'waste', 'found:0'));
  assert.deepEqual(cardTransfers(before, after), [transfer('waste', 'found:0')]);
  assert.deepEqual(cardTransfers(after, before), [transfer('found:0', 'waste')]);
});

test('Klondike draw three and undo transfer all three drawn cards', () => {
  const before = board('klondike', {
    waste: [card('previous', 8)],
    stock: [card('bottom', 4), card('third', 5), card('second', 6), card('first', 7)],
    drawCount: 3,
  });
  const after = play(before, draw);
  assert.equal(after.waste.length, 4);
  assert.deepEqual(cardTransfers(before, after), [
    transfer('stock', 'waste:layer:0'),
    transfer('stock', 'waste:layer:1'),
    transfer('stock', 'waste'),
  ]);
  assert.deepEqual(cardTransfers(after, before), [
    transfer('waste', 'stock', false),
    transfer('waste:layer:1', 'stock', false),
    transfer('waste:layer:0', 'stock', false),
  ]);
});

test('A short Klondike draw only transfers new cards into the shifted fan', () => {
  const before = board('klondike', {
    waste: [card('lower', 8), card('previous', 7)],
    stock: [card('second', 5), card('first', 6)],
    drawCount: 3,
  });
  const after = play(before, draw);
  assert.deepEqual(cardTransfers(before, after), [
    transfer('stock', 'waste:layer:1'),
    transfer('stock', 'waste'),
  ]);
  assert.deepEqual(cardTransfers(after, before), [
    transfer('waste', 'stock', false),
    transfer('waste:layer:1', 'stock', false),
  ]);
});

for (const [mode, wasteKey, wasteField] of [
  ['klondike', 'waste', 'waste'],
  ['pyramid', 'pw', 'pairWaste'],
]) {
  test(`${mode} redeal and undo transfer the visible fan and skip the buried waste`, () => {
    const before = board(mode, {
      [wasteField]: [card('buried', 4), card('bottom', 5), card('middle', 6), card('top', 7)],
    });
    const after = play(before, draw);
    assert.equal(after.stock.length, 4);
    assert.deepEqual(cardTransfers(before, after), [
      transfer(wasteKey, 'stock', false),
      transfer(`${wasteKey}:layer:1`, 'stock', false),
      transfer(`${wasteKey}:layer:0`, 'stock', false),
    ]);
    assert.deepEqual(cardTransfers(after, before), [
      transfer('stock', `${wasteKey}:layer:0`),
      transfer('stock', `${wasteKey}:layer:1`),
      transfer('stock', wasteKey),
    ]);
  });
}

test('FreeCell maps a card between its free cell and tableau position', () => {
  const before = board('freecell', { cols: [[card('jack', 11)]], cells: [null] });
  const after = play(before, game => applyMove(game, 'col:0:0', 'cell:0'));
  assert.deepEqual(cardTransfers(before, after), [transfer('col:0:0', 'cell:0')]);
  assert.deepEqual(cardTransfers(after, before), [transfer('cell:0', 'col:0:0')]);
});

test('FreeCell cascade maps all arrivals to their foundation and restores exact positions', () => {
  const before = board('freecell', {
    cols: [[card('two-spades', 2), card('ace-spades', 1)], [card('ace-hearts', 1, '♥')]],
    cells: [card('two-hearts', 2, '♥')],
    found: [[], [], [], []],
  });
  const after = play(before, game => autoMove(game, 'col:0:1', { cascadeFoundations: true }));
  assert.deepEqual(cardTransfers(before, after), [
    transfer('col:0:1', 'found:0', false),
    transfer('col:0:0', 'found:0'),
    transfer('col:1:0', 'found:1', false),
    transfer('cell:0', 'found:1'),
  ]);
  assert.deepEqual(cardTransfers(after, before), [
    transfer('found:0', 'col:0:0'),
    { ...transfer('found:0', 'col:0:1'), fromAnchor: true },
    { ...transfer('found:1', 'col:1:0'), fromAnchor: true },
    transfer('found:1', 'cell:0'),
  ]);
});

test('Spider stock deals to the actual next card slot of every column', () => {
  const before = board('spider', {
    cols: Array.from({ length: 10 }, (_, column) =>
      Array.from({ length: column + 1 }, (_, index) => card(`col-${column}-${index}`, 8))),
    stock: Array.from({ length: 10 }, (_, index) => card(`stock-${index}`, 7, '♠', false)),
  });
  const after = play(before, draw);
  assert.deepEqual(cardTransfers(before, after), before.cols.map((pile, i) =>
    transfer('stock', `col:${i}:${pile.length}`)));
  assert.deepEqual(cardTransfers(after, before), before.cols.map((pile, i) =>
    transfer(`col:${i}:${pile.length}`, 'stock', false)).reverse());
});

test('Spider matches duplicate ranks and suits by ID when completing and restoring a run', () => {
  const run = Array.from({ length: 12 }, (_, i) => card(`run-${i}`, 13 - i));
  const before = board('spider', {
    cols: [[card('back', 9, '♠', false), ...run], [card('moving-ace', 1)], [card('other-ace', 1)]],
    found: [[...run.map(c => ({ ...c, id: `finished-${c.id}` })), card('finished-ace', 1)]],
  });
  const after = play(before, game => applyMove(game, 'col:1:0', 'col:0'));
  const keys = [...run.map((_, i) => `col:0:${i + 1}`), 'col:1:0'];
  assert.deepEqual(cardTransfers(before, after), keys.map(key => transfer(key, 'runs', false)));
  assert.deepEqual(cardTransfers(after, before), keys.map(key => transfer('runs', key)));
});

test('Spider deal can complete a run with the incoming card', () => {
  const run = Array.from({ length: 12 }, (_, i) => card(`run-${i}`, 13 - i));
  const before = board('spider', {
    cols: [run, ...Array.from({ length: 9 }, (_, i) => [card(`col-${i}`, 8)])],
    stock: Array.from({ length: 10 }, (_, i) => card(`ace-${i}`, 1, '♠', false)),
  });
  const after = play(before, draw);
  assert.deepEqual(cardTransfers(before, after), [
    ...Array.from({ length: 9 }, (_, i) => transfer('stock', `col:${i + 1}:1`)),
    ...run.map((_, i) => transfer(`col:0:${i}`, 'runs', false)),
    transfer('stock', 'runs', false),
  ]);
  assert.deepEqual(cardTransfers(after, before), [
    ...run.map((_, i) => transfer('runs', `col:0:${i}`)),
    ...Array.from({ length: 9 }, (_, i) => transfer(`col:${9 - i}:1`, 'stock', false)),
    transfer('runs', 'stock', false),
  ]);
});

test('Pyramid draws to pw and removes a waste and tableau pair with null endpoints', () => {
  const before = board('pyramid', {
    cols: [[], [], [], [], [], [], [card('six', 6), card('keeper', 8)]],
    stock: [card('seven', 7, '♠', false)],
    pairWaste: [card('previous', 4)],
  });
  const drawn = play(before, draw);
  assert.deepEqual(cardTransfers(before, drawn), [transfer('stock', 'pw')]);
  assert.deepEqual(cardTransfers(drawn, before), [transfer('pw', 'stock', false)]);

  const after = play(drawn, game => applyMove(game, 'p:6:0', 'pw'));
  assert.deepEqual(cardTransfers(drawn, after), [
    transfer('p:6:0', null, false),
    transfer('pw', null, false),
  ]);
  assert.deepEqual(cardTransfers(after, drawn), [
    transfer(null, 'p:6:0'),
    transfer(null, 'pw'),
  ]);
});

test('Cards staying in their pile do not transfer when their index or face changes', () => {
  const before = board('klondike', {
    cols: [[card('back', 8, '♠', false), card('front', 7, '♥')]],
    stock: [card('earlier', 3, '♠', false), card('later', 4, '♥', false)],
  });
  const after = structuredClone(before);
  after.cols[0].reverse();
  after.cols[0][1].up = true;
  after.stock.reverse();
  after.moves++;
  assert.deepEqual(cardTransfers(before, before), []);
  assert.deepEqual(cardTransfers(before, after), []);
});
