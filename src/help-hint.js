import { selectHint } from './hints.js';
import { planKlondikeHint } from './klondike-hints.js';

export function selectHelpHint(game, visited, {maxTimeMs = 35} = {}) {
  if (game.mode === 'klondike') {
    const plan = planKlondikeHint(game,game.stockMemory,{visited,maxTimeMs});
    return {move:plan.move,plan};
  }
  return {move:selectHint(game,visited),plan:null};
}
