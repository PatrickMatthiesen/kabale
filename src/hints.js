import { applyMove, legalMoves } from './engine.js';

// Ignore move counters and interchangeable column/cell/foundation positions.
// Hidden identities never participate in hint selection.
function positionKey(game, useStockPhase) {
  const card = c => !c ? null : c.up ? [c.r,c.s] : '?';
  const piles = a => a.map(p => p.map(card)).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify({
    mode:game.mode, emptyColumns:game.emptyColumns,
    cols:game.mode === 'pyramid' ? game.cols.map(p=>p.map(card)) : piles(game.cols),
    cells:(game.cells ?? []).map(card).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
    found:piles(game.found ?? []), stock:game.stock.length,
    waste:useStockPhase ? game.waste.length : (game.waste ?? []).map(card),
    drawCount:useStockPhase ? (game.drawCount || 1) : undefined,
    pairWaste:(game.pairWaste ?? []).map(card),
    removed:game.removed?.length, redealsLeft:game.redealsLeft
  });
}

export function hintPosition(game) {
  return positionKey(game,false);
}

// Within one forward history, Klondike draws and redeals preserve the combined
// order of stock and waste. Playing a waste card shrinks their combined size.
// Both counts therefore identify the stock phase without knowing any card faces.
export function hintVisitKey(game) {
  return positionKey(game,game.mode === 'klondike');
}

/** Choose a useful, unvisited move without solving or inspecting hidden cards. */
export function selectHint(game, visited = new Set()) {
  if (game.won || game.difficulty === 'hard') return null;
  const current = hintVisitKey(game);
  const seen = next => {
    const key = hintVisitKey(next);
    return key === current || visited.has(key);
  };
  const unknownCard = () => ({up:false,r:0,s:'?'});
  const visible = {
    ...game,
    cols:game.cols.map(pile=>pile.map(c=>c && !c.up ? unknownCard() : c)),
    stock:Array.from({length:game.stock.length},unknownCard)
  };
  let best=null, bestScore=-Infinity;
  for (const move of legalMoves(visible)) {
    let score=0;
    if (move.from === 'stock') {
      // Spider uses up stock. Pyramid uses up stock or a finite redeal.
      // Only Klondike can cycle indefinitely through stock actions.
      score=10;
      if (game.mode === 'klondike') {
        const next=structuredClone(visible);
        if (!applyMove(next,move.from,move.to) || seen(next)) continue;
      }
    } else {
      const next=structuredClone(visible);
      if (!applyMove(next,move.from,move.to) || seen(next)) continue;
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
