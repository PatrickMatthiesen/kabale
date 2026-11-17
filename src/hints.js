import { applyMove, legalMoves } from './engine.js';

// Ignore move counters and interchangeable column/cell/foundation positions.
// Hidden identities never participate in hint selection.
export function hintPosition(game) {
  const card = c => !c ? null : c.up ? [c.r,c.s] : '?';
  const piles = a => a.map(p => p.map(card)).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify({
    mode:game.mode, emptyColumns:game.emptyColumns,
    cols:game.mode === 'pyramid' ? game.cols.map(p=>p.map(card)) : piles(game.cols),
    cells:(game.cells ?? []).map(card).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
    found:piles(game.found ?? []), stock:game.stock.length,
    waste:(game.waste ?? []).map(card), pairWaste:(game.pairWaste ?? []).map(card),
    removed:game.removed?.length, redealsLeft:game.redealsLeft
  });
}

/** Choose a useful, unvisited move without solving or inspecting hidden cards. */
export function selectHint(game, visited = new Set()) {
  if (game.won || game.difficulty === 'hard') return null;
  const seen = new Set(visited);
  seen.add(hintPosition(game));
  const visible = structuredClone(game);
  for (const c of [...visible.cols.flat(),...visible.stock]) {
    if (c && !c.up) { c.r=0; c.s='?'; }
  }
  let best=null, bestScore=-Infinity;
  for (const move of legalMoves(game)) {
    let score=0;
    if (move.from === 'stock') {
      // A draw's value is unknown. Only a recycle has a predictable visible state.
      score=10;
      if (!game.stock.length) {
        const next=structuredClone(visible);
        if (!applyMove(next,move.from,move.to) || seen.has(hintPosition(next))) continue;
      }
    } else {
      const next=structuredClone(visible);
      if (!applyMove(next,move.from,move.to) || seen.has(hintPosition(next))) continue;
      const [kind,column,index]=move.from.split(':');
      const source=kind === 'col' ? game.cols[+column] : null;
      const start=source ? (index === undefined ? source.length-1 : +index) : 0;
      const target=move.to.startsWith('col:') ? game.cols[+move.to.split(':')[1]] : null;
      if (game.mode === 'pyramid') score=100;
      else if (move.to.startsWith('found:')) score=100;
      else if (source && start>0 && !source[start-1].up) score=90;
      else if (next.found.length>game.found.length) score=100; // Completed Spider run.
      else if (source && start===0 && target?.length) score=60;
      else if (kind === 'cell' && target) score=50;
      else if (kind === 'waste') score=40;
      else if (source && target?.length) {
        // Prefer joining a Spider suit; equivalent parent swaps don't improve a run.
        const card=source[start], parent=source[start-1], destination=target.at(-1);
        if (game.mode === 'spider') score=destination.s===card.s ? 35 : 5;
        else score=20;
        if (parent && parent.r===destination.r && (game.mode === 'spider' ? parent.s===destination.s : (['♥','♦'].includes(parent.s) === ['♥','♦'].includes(destination.s)))) score=0;
      } else if (move.to.startsWith('cell:')) score=1;
      else score=5;
      if (kind === 'found') score=0;
    }
    if (score>bestScore) { best=move; bestScore=score; }
  }
  return best;
}

/** Mark one visible source and one destination, never the hidden cards behind them. */
export function hintRole(game, hint, key, faceUp) {
  if (!hint || (!faceUp && key !== 'stock')) return '';
  if (hint.from === key) return 'hint-source';
  if (hint.to === key) return 'hint-destination';
  const [kind, column, index] = key.split(':');
  if (kind === 'col' && hint.to === `col:${column}` && Number(index) === game.cols[Number(column)]?.length - 1) {
    return 'hint-destination';
  }
  return '';
}
