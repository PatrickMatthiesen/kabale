import { applyMove, legalMoves, pyramidPlayable } from './engine.js';
import { hintVisitKey } from './hints.js';

const maxDepth = 16;
const maxStates = 512;

function visibleRemovals(board) {
  // Pyramid pairs are legal in both directions and lead to the same position.
  return legalMoves(board).filter(({from,to}) => from !== 'stock' && from <= to);
}

function afterRemoval(board, {from,to}) {
  const next = {
    ...board,
    cols: board.cols.map(row => row.slice()),
    pairWaste: board.pairWaste.slice(),
    removed: board.removed.slice()
  };
  applyMove(next,from,to);
  return next;
}

function position(board) {
  // With no draws, each slot is unchanged or empty, and waste only loses cards from the top.
  let occupied = '';
  let remaining = 0;
  let exposed = 0;
  for (const [y,row] of board.cols.entries()) {
    for (const [x,card] of row.entries()) {
      occupied += card ? '1' : '0';
      if (!card) continue;
      remaining++;
      if (pyramidPlayable(board,y,x)) exposed++;
    }
  }
  return {key:`${occupied}:${board.pairWaste.length}`,remaining,exposed};
}

/** Look ahead through removals using the face-up pyramid and previously drawn waste. */
export function planPyramidHint(game, visited = new Set(), {maxTimeMs = 35} = {}) {
  if (game.mode !== 'pyramid' || game.won || game.difficulty === 'hard') return null;
  const deadline = performance.now() + maxTimeMs;
  // Keep the stock count for the visit key while excluding all stock cards from simulation.
  const board = {...game, stock:Array(game.stock.length)};
  const queue = [];
  const searched = new Set();
  let best = null;

  function consider(next, move, depth) {
    const {key,remaining,exposed} = position(next);
    if (searched.has(key)) return;
    searched.add(key);
    if (!best || remaining < best.remaining || remaining === best.remaining && exposed > best.exposed) {
      best = {move,remaining,exposed};
    }
    if (depth < maxDepth) queue.push({board:next,move,depth});
  }

  // Check each first move against the real history, including the original stock count.
  for (const {from,to} of visibleRemovals(board)) {
    const move = {from,to};
    const next = afterRemoval(board,move);
    if (visited.has(hintVisitKey(next))) continue;
    if (next.won) return move;
    consider(next,move,1);
  }

  for (const entry of queue) {
    if (searched.size >= maxStates || performance.now() >= deadline) break;
    for (const removal of visibleRemovals(entry.board)) {
      if (searched.size >= maxStates || performance.now() >= deadline) break;
      const next = afterRemoval(entry.board,removal);
      if (next.won) return entry.move;
      consider(next,entry.move,entry.depth + 1);
    }
  }

  return best?.move ?? null;
}
