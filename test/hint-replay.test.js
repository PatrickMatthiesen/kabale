import { expect, test } from 'bun:test';
import { replayHints, seededDeal } from '../scripts/bench-hints.js';
import { legalMoves } from '../src/engine.js';

for (const mode of ['klondike', 'spider', 'freecell', 'pyramid']) {
  test(`${mode} Help plays legal moves on a seeded deal until it wins or runs out of hints`, () => {
    const game = seededDeal(mode, 'normal', 1);
    expect(game).toEqual(seededDeal(mode, 'normal', 1));
    const result = replayHints(game, 240);

    const terminal = game.won ? 'win' : legalMoves(game).length ? 'stalled' : 'dead-end';
    expect(result.outcome).toBe(terminal);
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
