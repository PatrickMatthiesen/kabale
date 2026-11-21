import { planFreeCellHint } from './freecell-hints.js';
import { selectHint } from './hints.js';
import { planKlondikeHint } from './klondike-hints.js';
import { planPyramidHint } from './pyramid-hints.js';

export function selectHelpHint(game, visited, {maxTimeMs = 35} = {}) {
  if (game.mode === 'klondike') {
    const plan = planKlondikeHint(game,game.stockMemory,{visited,maxTimeMs});
    return {move:plan.move,plan};
  }
  if (game.mode === 'freecell') {
    return {move:planFreeCellHint(game,visited,{maxTimeMs}),plan:null};
  }
  if (game.mode === 'pyramid') {
    const move = planPyramidHint(game,visited,{maxTimeMs});
    return {move:move ?? selectHint(game,visited),plan:null};
  }
  return {move:selectHint(game,visited),plan:null};
}
