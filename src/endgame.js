import { applyMove, legalMoves } from './engine.js';

/** Report only a win or a position with no legal action, including stock actions. */
export function gameOutcome(game) {
  if (game.won) return {kind:'won',title:'Well played!',message:'You cleared the table.'};
  if (legalMoves(game).length) return {kind:'playing',title:'',message:''};
  const easy=game.difficulty==='easy';
  const details={
    klondike:easy?'The stock and waste are empty, and no card can move to a column or foundation. Undo a move to try another route.':'The stock and waste are empty, and no legal card move remains.',
    spider:easy?'No card can move between columns, and the stock cannot be dealt. Undo a move to try another route.':'No tableau move or deal is available.',
    freecell:easy?'No card fits a column, free cell, or foundation. Undo a move to try another route.':'No legal card move remains.',
    pyramid:easy?'No available cards add to 13, no King can be removed, and no stock pass remains. Undo a move to try another route.':'No legal pair, King removal, or stock pass remains.'
  }[game.mode] ?? 'No legal move remains.';
  return {kind:'blocked',title:easy?'No moves left':'No legal moves',message:game.difficulty==='hard'?`${details} Restart this deal or start a new one.`:details};
}

const allFaceUp=game=>[...game.cols.flat(),...(game.cells??[]).filter(Boolean),...(game.waste??[])].every(card=>card.up);

function foundationPlan(game) {
  if(game.stock.length||!allFaceUp(game))return null;
  const state=structuredClone(game),path=[];
  // Foundation-only cleanup removes exposed cards without introducing blockers.
  // Its order needs no search, and a full-deck bound keeps this work small.
  while(!state.won && path.length<52) {
    const move=legalMoves(state).find(move=>move.to.startsWith('found:'));
    if(!move || !applyMove(state,move.from,move.to))return null;
    path.push({from:move.from,to:move.to});
  }
  return state.won?path:null;
}
function spiderPlan(game) {
  if(game.stock.length||!game.cols.flat().every(card=>card.up))return null;
  const state=structuredClone(game),path=[];
  while(!state.won&&path.length<8) {
    let finishing=null;
    for(const move of legalMoves(state)) {
      if(!move.to.startsWith('col:'))continue;
      const next=structuredClone(state),completed=next.found.length;
      if(applyMove(next,move.from,move.to)&&next.found.length>completed){finishing=move;break;}
    }
    if(!finishing)return null;
    if(!applyMove(state,finishing.from,finishing.to))return null;
    path.push({from:finishing.from,to:finishing.to});
  }
  return state.won?path:null;
}

function pyramidPlan(game) {
  if(game.cols.flat().filter(Boolean).length>2)return null;
  const moves=legalMoves(game).filter(move=>move.from!=='stock');
  for(const move of moves) {
    // Pyramid's goal ignores unused stock. Do not inspect those hidden cards.
    const next=structuredClone({...game,stock:[]});
    if(applyMove(next,move.from,move.to)&&next.won)return [{from:move.from,to:move.to}];
  }
  return null;
}

/** Return a short verified cleanup sequence, or null when cleanup is uncertain. */
export function completionPlan(game) {
  if(game.won)return [];
  if(game.mode==='klondike'||game.mode==='freecell')return foundationPlan(game);
  if(game.mode==='spider')return spiderPlan(game);
  if(game.mode==='pyramid')return pyramidPlan(game);
  return null;
}
