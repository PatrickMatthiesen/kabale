import { describe, expect, test } from 'bun:test';
import { planKlondikeHint } from '../src/klondike-hints.js';
import { applyMove, legalMoves } from '../src/engine.js';
import { rememberStock, restoreStockMemory } from '../src/stock-memory.js';

const card = (r, s, up = true, id = `${r}${s}`) => ({ r, s, up, id });
const down = id => ({ r: 0, s: '?', up: false, id });

function game({ cols = Array.from({ length: 7 }, () => []), stock = [], waste = [], found = [[], [], [], []], drawCount = 1 } = {}) {
  return {
    mode: 'klondike', difficulty: 'normal', emptyColumns: 'kings', moves: 0, won: false,
    cols, stock, waste, found, drawCount, cells:[],
  };
}

describe('planKlondikeHint', () => {
  test('does not recommend a same-rank tableau swap that only cycles between equivalent positions', () => {
    // The pictured 4-3-2 can move between the black fives, but that does not
    // reveal a hidden card or enable a play from the already seen stock.
    const state = game({stock:[card(10,'♠',false),card(9,'♥',false)],cols: [
      [card(5, '♠'), card(4, '♥'), card(3, '♣'), card(2,'♥')],
      [card(5, '♣')],
      [], [], [], [], [],
    ] });

    expect(legalMoves(state)).toContainEqual({from:'col:0:1',to:'col:1',label:'Move to tableau'});
    const hint = planKlondikeHint(state, [{r:9,s:'♥'},{r:10,s:'♠'}]);

    expect(hint.reason).toBe('exhausted');
    expect(hint.move).toBeNull();
  });

  test('can recommend a setup move when it makes a known stock card playable', () => {
    // Moving the five exposes a red seven that can take the known black six.
    const state = game({
      cols: [
        [down('hidden-a'), card(7, '♥'), card(5, '♣')],
        [card(6, '♦')],
        [], [], [], [], [],
      ],
      stock: [card(6,'♠',false)],
    });
    const before = structuredClone(state);
    const hint = planKlondikeHint(state, [{ r: 6, s: '♠' }]);

    expect(hint.reason).toBe('progress');
    expect(hint.move).not.toBeNull();
    expect(hint.move.from).toBe('col:0:2');
    expect(hint.move.to).toBe('col:1');
    expect(state).toEqual(before);
    const replay = structuredClone(state);
    for (const step of hint.path) expect(applyMove(replay,step.from,step.to)).toBe(true);
    expect(replay.waste).toEqual([]);
  });

  test('marks an unseen stock draw as exploration and respects draw-three ordering', () => {
    const state = game({
      drawCount: 3,
      stock: [down('top'), down('middle'), down('bottom')],
    });
    const before = structuredClone(state);

    const hint = planKlondikeHint(state, [null, null, null]);

    expect(hint.reason).toBe('explore');
    expect(hint.move).toEqual(expect.objectContaining({ from: 'stock' }));
    expect(state).toEqual(before);
  });

  test('uses known stock faces to find a concrete play instead of treating the stock as unknown', () => {
    const state = game({
      cols: [[card(6, '♥')], [], [], [], [], [], []],
      stock: [down('known-five')],
    });

    const hint = planKlondikeHint(state, [{ r: 5, s: '♠' }]);

    expect(hint.reason).toBe('progress');
    expect(hint.move).toEqual(expect.objectContaining({ from: 'stock' }));
  });

  test('does not use hidden card faces to invent a stock play', () => {
    const hidden = {
      up:false,
      get r() { throw new Error('Unseen rank accessed'); },
      get s() { throw new Error('Unseen suit accessed'); },
      get id() { throw new Error('Unseen ID accessed'); }
    };
    const state = game({
      cols: [[hidden,card(6, '♥')], [], [], [], [], [], []],
      stock: [hidden],
    });

    const hint = planKlondikeHint(state, [null]);

    expect(hint.reason).toBe('explore');
    expect(hint.move).toEqual(expect.objectContaining({ from: 'stock' }));
  });

  test('reports a search limit without mutating the current game', () => {
    const state = game({
      cols: [[card(6, '♥')], [], [], [], [], [], []],
      stock: [down('stock')],
    });
    const before = structuredClone(state);

    const hint = planKlondikeHint(state, [null], { maxNodes: 0 });

    expect(hint.reason).toBe('limit');
    expect(state).toEqual(before);
  });
});

test('legacy draw-three history records exposed tops, tracks a waste removal and preserves order on redeal', () => {
  const first = game({
    drawCount:3,
    cols:[[card(7,'♥')],[],[],[],[],[],[]],
    stock:[card(10,'♣',false),card(6,'♠',false),card(8,'♣',false),card(9,'♦',false)]
  });
  const draw = structuredClone(first);
  expect(applyMove(draw,'stock','')).toBe(true);
  const play = structuredClone(draw);
  expect(applyMove(play,'waste','col:0')).toBe(true);
  restoreStockMemory([first,draw,play]);
  expect(draw.stockMemory).toEqual([null,null,{r:6,s:'♠'},null]);
  expect(play.stockMemory).toEqual([null,{r:8,s:'♣'},null]);

  const last = structuredClone(play);
  expect(applyMove(last,'stock','')).toBe(true);
  rememberStock(last,play);
  const recycle = structuredClone(last);
  expect(applyMove(recycle,'stock','')).toBe(true);
  rememberStock(recycle,last);
  expect(recycle.stockMemory).toEqual([null,{r:8,s:'♣'},{r:10,s:'♣'}]);
  const hint = planKlondikeHint(recycle);
  expect(hint.move).toBeNull(); // Draw-three exposes only the 10, which has no destination.
});
