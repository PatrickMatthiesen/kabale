import { expect, test } from 'bun:test';
import { applyMove, deal, legalMoves } from '../src/engine.js';
import { hintVisitKey, selectHint } from '../src/hints.js';
import { planPyramidHint } from '../src/pyramid-hints.js';

const card = (r,s) => ({r,s,up:true});
const winningPair = {from:'p:6:1',to:'p:6:2'};
const otherPair = {from:'p:6:0',to:'p:6:1'};

function emptyPyramid() {
  const game = deal('pyramid');
  game.cols = game.cols.map(row => row.map(() => null));
  game.stock = [];
  game.redealsLeft = 0;
  return game;
}

function fourCardPyramid() {
  const game = emptyPyramid();
  game.cols[5][1] = card(4,'♣');
  game.cols[6].splice(0,3,card(9,'♠'),card(4,'♥'),card(9,'♦'));
  return game;
}

test('Pyramid Help pairs the heart with the diamond to uncover the last pair', () => {
  const game = fourCardPyramid();
  const before = structuredClone(game);
  const greedy = selectHint(game);
  expect(greedy).toMatchObject(otherPair);
  const deadEnd = structuredClone(game);
  expect(applyMove(deadEnd,greedy.from,greedy.to)).toBe(true);
  expect(legalMoves(deadEnd)).toEqual([]);

  const first = planPyramidHint(game);
  expect(first).toEqual(winningPair);
  expect(game).toEqual(before);
  expect(applyMove(game,first.from,first.to)).toBe(true);
  const last = planPyramidHint(game);
  expect(last).toEqual({from:'p:5:1',to:'p:6:0'});
  expect(applyMove(game,last.from,last.to)).toBe(true);
  expect(game.won).toBe(true);
});

test('Pyramid Help skips visited first moves, including the reverse of a pair', () => {
  const game = fourCardPyramid();
  game.stock = [card(7,'♦')];
  const visited = new Set([hintVisitKey(game)]);
  for (const move of [winningPair,otherPair]) {
    const next = structuredClone(game);
    expect(applyMove(next,move.to,move.from)).toBe(true);
    visited.add(hintVisitKey(next));
    expect(planPyramidHint(game,visited)).toEqual(move === winningPair ? otherPair : null);
  }
  expect(visited.size).toBe(3);
});

test('Pyramid Help chooses the same pair with unreadable stock', () => {
  const game = fourCardPyramid();
  game.stock = new Proxy(Array(24), {
    get(target,key) {
      if (key === 'length') return target.length;
      throw new Error('Unexpected access to hidden stock');
    }
  });
  expect(planPyramidHint(game)).toEqual(winningPair);
});

test('Pyramid Help prefers a continuing removal even when the stock will be needed', () => {
  const game = fourCardPyramid();
  game.cols[0][0] = card(6,'♠');
  game.stock = [{up:false,r:7,s:'♥'}];
  expect(planPyramidHint(game)).toEqual(winningPair);
});

test('Pyramid Help returns only removals and can use previously drawn waste', () => {
  const game = emptyPyramid();
  game.cols[6][0] = card(4,'♥');
  game.stock = [{up:false,r:9,s:'♣'}];
  expect(planPyramidHint(game)).toBeNull();
  game.pairWaste = [card(9,'♠'),card(13,'♦')];
  expect(planPyramidHint(game)).toEqual({from:'pw',to:'pw'});
  expect(applyMove(game,'pw','pw')).toBe(true);
  expect(planPyramidHint(game)).toEqual({from:'p:6:0',to:'pw'});
  game.difficulty = 'hard';
  expect(planPyramidHint(game)).toBeNull();
});
