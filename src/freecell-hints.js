import { applyMove, legalMoves } from './engine.js';
import { hintVisitKey } from './hints.js';

const suits = ['♠', '♥', '♦', '♣'];
const isRed = suit => suit === '♥' || suit === '♦';
const maxDepth = 7;
const beamWidth = 12;

function visibleCard(card) {
  if (!card) return null;
  if (!card.up) return { up: false, r: 0, s: '?' };
  const { r, s } = card;
  return { up: true, r, s, id: `${s}:${r}` };
}

function visibleBoard(game) {
  return {
    ...game,
    cols: game.cols.map(pile => pile.map(visibleCard)),
    cells: game.cells.map(visibleCard),
    found: game.found.map(pile => pile.map(visibleCard)),
    stock: Array(game.stock.length),
    waste: game.waste.map(visibleCard)
  };
}

function moveBoard(board, { from, to }, source) {
  const next = {
    ...board,
    cols: board.cols.slice(),
    cells: board.cells.slice(),
    found: board.found.slice()
  };
  if (source) {
    const pile = next.cols[source.column] = board.cols[source.column].slice();
    // The engine writes to the new top of the source column even if it is face up.
    if (source.start > 0) pile[source.start - 1] = { ...pile[source.start - 1] };
  } else if (from.startsWith('found:')) {
    const index = +from.slice(6);
    next.found[index] = board.found[index].slice();
  } else if (from === 'waste') {
    next.waste = board.waste.slice();
  }
  const [target, index] = to.split(':');
  if (target === 'col') next.cols[index] = board.cols[index].slice();
  if (target === 'found') next.found[index] = board.found[index].slice();
  return applyMove(next, from, to) ? next : null;
}

// Use compact, cached pile signatures inside the beam. Consult hintVisitKey
// at the history boundary so the app's canonical visit format stays private.
function searchKey(board, pileKeys) {
  const face = card => !card ? '' : !card.up ? '?' : !card.r ? '!' : String.fromCharCode(64 + suits.indexOf(card.s) * 13 + card.r);
  const pileKey = pile => {
    let key = pileKeys.get(pile);
    if (key === undefined) {
      key = pile.map(face).join('');
      pileKeys.set(pile, key);
    }
    return key;
  };
  return [
    board.cols.map(pileKey).sort().join('|'),
    board.cells.map(face).sort().join('|'),
    board.found.map(pileKey).sort().join('|'),
    pileKey(board.waste)
  ].join('~');
}

function evaluate(board) {
  if (board.won) return Infinity;
  const foundations = [0, 0, 0, 0];
  for (const pile of board.found) {
    const top = pile.at(-1);
    if (top?.r) foundations[suits.indexOf(top.s)] = top.r;
  }
  const freeCells = board.cells.filter(card => !card).length;
  const emptyColumns = board.cols.filter(pile => !pile.length).length;
  const capacity = (freeCells + 1) * 2 ** emptyColumns;
  let score = freeCells * 3 + emptyColumns * 9 + Math.log2(capacity) * 2;

  for (let i = 0; i < suits.length; i++) {
    const rank = foundations[i];
    // An advanced foundation can take a useful tableau parent out of play.
    const otherColor = isRed(suits[i])
      ? Math.min(foundations[0], foundations[3])
      : Math.min(foundations[1], foundations[2]);
    score += rank * 10 - Math.max(0, rank - otherColor - 2) * 4;
  }

  for (const pile of board.cols) {
    let runsAbove = 0;
    for (let i = pile.length - 1; i >= 0; i--) {
      const card = pile[i];
      if (!card.up || !card.r) break;
      const next = pile[i + 1];
      if (next) {
        if (card.r === next.r + 1 && isRed(card.s) !== isRed(next.s)) score += 1.25;
        else runsAbove++;
      }
      const distance = card.r - foundations[suits.indexOf(card.s)];
      // Uncover the next cards each suit needs. An ordered run can move in one
      // step when there is enough room, so it counts less than unrelated cards.
      if (distance > 0 && distance <= 3) {
        score -= (4 - distance) * (runsAbove + (pile.length - i - 1) * 0.3) * 0.9;
      }
    }
  }
  return score;
}

function moveOptions(board) {
  const emptyColumn = board.cols.findIndex(pile => !pile.length);
  const emptyCell = board.cells.findIndex(card => !card);
  const emptyFoundation = board.found.findIndex(pile => !pile.length);
  return legalMoves(board).filter(({ from, to }) => {
    const [kind, index] = to.split(':');
    if (kind === 'cell') return !from.startsWith('cell:') && +index === emptyCell;
    if (kind === 'found') return board.found[index].length || +index === emptyFoundation;
    if (board.cols[index].length) return true;
    return +index === emptyColumn && !(from.startsWith('col:') && from.endsWith(':0'));
  });
}

/** Find the first legal move on a short path to a better FreeCell position. */
export function planFreeCellHint(game, visited = new Set(), { maxTimeMs = 35 } = {}) {
  if (game.mode !== 'freecell' || game.won || game.difficulty === 'hard' || maxTimeMs <= 0) return null;
  const deadline = performance.now() + maxTimeMs;
  const root = visibleBoard(game);
  const pileKeys = new WeakMap();
  const searched = new Set([searchKey(root, pileKeys)]);
  const rootScore = evaluate(root);
  let layer = [{ board: root, first: null, cost: 0 }];
  let best = null;
  let bestScore = -Infinity;

  for (let depth = 1; depth <= maxDepth && layer.length; depth++) {
    const nextLayer = [];
    for (const { board, first, cost } of layer) {
      if (performance.now() >= deadline) return best;
      for (const { from, to } of moveOptions(board)) {
        if (performance.now() >= deadline) return best;
        const move = { from, to };
        const [kind, column, start] = from.split(':');
        const source = kind === 'col' ? { column: +column, start: +start } : null;
        const next = moveBoard(board, move, source);
        if (!next) continue;

        const key = searchKey(next, pileKeys);
        if (searched.has(key)) continue;
        searched.add(key);

        const firstMove = first ?? move;
        const revealed = source && next.cols[source.column].at(-1)?.r === 0;
        let nextCost = cost + 0.9;
        if (kind === 'found') nextCost += 5;
        if (to.startsWith('cell:')) nextCost += 1;
        // Prefer plans that reach foundations earlier if the resulting boards are similar.
        if (to.startsWith('found:')) nextCost -= (maxDepth - depth) * 0.75;
        const score = evaluate(next) - nextCost + (revealed ? 8 : 0);
        let checked = false;
        const improvesAfterWithdrawal = !firstMove.from.startsWith('found:') || score > rootScore;
        if (score > bestScore && improvesAfterWithdrawal) {
          if (visited.size && visited.has(hintVisitKey(next))) continue;
          if (next.won) return firstMove;
          best = firstMove;
          bestScore = score;
          checked = true;
        }
        if (!revealed) nextLayer.push({ board: next, first: firstMove, cost: nextCost, score, checked });
      }
    }
    layer = [];
    if (depth === maxDepth) break;
    for (const node of nextLayer.sort((a, b) => b.score - a.score)) {
      if (performance.now() >= deadline) return best;
      if (!node.checked && visited.size && visited.has(hintVisitKey(node.board))) continue;
      layer.push(node);
      if (layer.length === beamWidth) break;
    }
  }
  return best;
}
