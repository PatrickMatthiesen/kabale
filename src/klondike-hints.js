import { applyMove, legalMoves, movesFrom } from './engine.js';
import { hintVisitKey } from './hints.js';

const turnStock = { from: 'stock', to: '', label: 'Deal' };
const unknownCard = () => ({ up: false, r: 0, s: '?' });

function knownCard(face, up) {
  return face ? { ...face, up, id: `${face.s}:${face.r}` } : unknownCard();
}

function publicBoard(game, knowledge) {
  const cards = [...knowledge];
  if (game.waste.length) {
    const {r,s} = game.waste.at(-1);
    cards[game.waste.length - 1] = {r,s};
  }
  return {
    ...game,
    cols: game.cols.map(column => column.map(card => card.up ? knownCard({r:card.r,s:card.s},true) : unknownCard())),
    found: game.found.map(pile => pile.map(({r,s}) => knownCard({r,s},true))),
    stock: Array.from({length:game.stock.length}, (_, i) => knownCard(cards[game.waste.length + i],false)).reverse(),
    waste: Array.from({length:game.waste.length}, (_, i) => knownCard(cards[i],true))
  };
}

// Before playing a waste card, the stock has the same reachable tops on every
// tableau branch. Stop at a repeated split, including a partial draw-three pass.
function stockOptions(board) {
  const state = { ...board, stock: board.stock.slice(), waste: board.waste.slice() };
  const visitedSplits = new Set([state.stock.length]);
  const known = [];
  let unseenAt = null;
  for (let turns = 1; applyMove(state,turnStock.from,turnStock.to); turns++) {
    if (visitedSplits.has(state.stock.length)) break;
    visitedSplits.add(state.stock.length);
    const top = state.waste.at(-1);
    if (top?.r) known.push({ top, turns });
    else if (top && unseenAt === null) unseenAt = turns;
  }
  return { known, unseenAt };
}

/** Find a short legal path to progress using player-visible information. */
export function planKlondikeHint(game, knowledge = game.stockMemory ?? [], options = {}) {
  const { visited = new Set(), maxNodes = 240, maxDepth = 4, maxTimeMs = Infinity } = options;
  const result = (reason, path = [], goal = null) => ({reason, path, goal, move: path[0] ?? null});
  if (game.won || game.difficulty === 'hard') return result('exhausted');
  if (maxNodes < 1 || maxDepth < 1) return result('limit');
  const deadline = performance.now() + maxTimeMs;

  const start = publicBoard(game,knowledge);
  const { known, unseenAt } = stockOptions(start);
  const startKey = hintVisitKey(start);
  const foundationCount = start.found.flat().length;
  const queue = [{ board:start, path:[] }];
  const searched = new Set([startKey]);
  const progress = { reveal:3, foundation:2, waste:1 };
  let best = null;
  let limited = false;
  function consider(path, goal) {
    if (!best || path.length < best.path.length || path.length === best.path.length && progress[goal] > progress[best.goal]) {
      best = {path,goal};
    }
  }

  for (let i = 0; i < queue.length; i++) {
    const {board,path} = queue[i];
    if (best && path.length >= best.path.length) break;
    if (i > 0 && performance.now() >= deadline) { limited = true; break; }

    for (const move of legalMoves(board)) {
      if (move.from === 'stock' || move.from === 'waste' && !board.waste.at(-1)?.r) continue;
      const nextPath = [...path,move];
      if (move.from === 'waste') { consider(nextPath,'waste'); continue; }

      // These moves only change the tableau or foundations. The known stock
      // frames are shared; popping a tableau card can flip its predecessor.
      const next = {
        ...board,
        cols: board.cols.map(column => column.map(card => ({...card}))),
        found: board.found.map(pile => pile.slice())
      };
      if (!applyMove(next,move.from,move.to)) continue;
      const key = hintVisitKey(next);
      if (searched.has(key) || !path.length && visited.has(key)) continue;
      if (next.cols.some(column => column.at(-1)?.up && column.at(-1).r === 0)) {
        consider(nextPath,'reveal');
      } else if (next.found.flat().length > foundationCount) {
        consider(nextPath,'foundation');
      } else if (nextPath.length >= maxDepth) {
        limited = true;
      } else if (queue.length < maxNodes) {
        searched.add(key);
        queue.push({board:next,path:nextPath});
      } else {
        limited = true;
      }
    }

    // A stock option ends in playing a reachable known card. A pass that only
    // changes the stock phase is never treated as progress.
    for (const {top,turns} of known) {
      if (best && path.length + turns + 1 >= best.path.length) break;
      const move = movesFrom({...board,waste:[top]},'waste')[0];
      if (move) {
        consider([...path,...Array(turns).fill(turnStock),move],'waste');
        break;
      }
    }
  }

  if (best) return result('progress',best.path,best.goal);
  // Exploring the stock never requires rearranging the tableau first.
  if (unseenAt !== null) return result('explore',Array(unseenAt).fill(turnStock),'unseen-stock');
  return result(limited ? 'limit' : 'exhausted');
}
