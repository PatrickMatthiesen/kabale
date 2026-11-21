import { expect, test } from 'bun:test';
import { replayHints, seededDeal } from '../scripts/bench-hints.js';
import { legalMoves } from '../src/engine.js';

const replayCases = [
  { mode: 'klondike', seed: 1 },
  { mode: 'spider', seed: 1 },
  { mode: 'freecell', seed: 1, expected: 'win' },
  { mode: 'pyramid', seed: 7, expected: 'win' }
];

for (const {mode, seed, expected} of replayCases) {
  test(`${mode} Help plays legal moves on a seeded deal until it wins or runs out of hints`, () => {
    const game = seededDeal(mode, 'normal', seed);
    expect(game).toEqual(seededDeal(mode, 'normal', seed));
    const result = replayHints(game, 240);

    const terminal = game.won ? 'win' : legalMoves(game).length ? 'stalled' : 'dead-end';
    expect(result.outcome).toBe(terminal);
    if (expected) expect(result.outcome).toBe(expected);
    expect(game.moves).toBe(result.moves);
    expect(result.moves).toBeGreaterThan(0);
    expect(result.hintMs).toHaveLength(result.moves + (game.won ? 0 : 1));
  });
}

test('Klondike Help learns stock cards before stalling with a legal recycle', () => {
  const game = seededDeal('klondike', 'normal', 1);
  game.cols = game.cols.map(() => []);
  game.stock = [
    { id: 'ten', r: 10, s: '♥', up: false },
    { id: 'nine', r: 9, s: '♥', up: false }
  ];

  const result = replayHints(game);

  expect(result).toMatchObject({ outcome: 'stalled', moves: 2, stockExplorations: 2, stockKnowledgeRevisits: 0 });
  expect(game.stockMemory).toEqual([{ r: 9, s: '♥' }, { r: 10, s: '♥' }]);
  expect(legalMoves(game)).toEqual([{ from: 'stock', to: '', label: 'Deal' }]);
});

test('Klondike replay distinguishes a search limit with legal moves from a dead end', () => {
  const game = seededDeal('klondike', 'normal', 1);
  game.stock = [];
  game.cols = game.cols.map(() => []);
  game.cols[0] = [{ id: 'five', r: 5, s: '♠', up: true }];
  game.cols[1] = [{ id: 'four', r: 4, s: '♥', up: true }];

  expect(legalMoves(game)).toHaveLength(1);
  expect(replayHints(game, 1)).toMatchObject({ outcome: 'stalled', moves: 0, planReason: 'exhausted' });
  expect(replayHints(game, 1, { maxTimeMs: 0 })).toMatchObject({ outcome: 'stalled', moves: 0, planReason: 'limit' });

  game.cols[1] = [];
  expect(legalMoves(game)).toHaveLength(0);
  expect(replayHints(game, 1, { maxTimeMs: 0 })).toMatchObject({ outcome: 'dead-end', moves: 0, planReason: 'exhausted' });
});
