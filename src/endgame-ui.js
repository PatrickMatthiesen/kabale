import { gameOutcome, completionPlan } from './endgame.js';
import { hintPosition } from './hints.js';

/** End notices are advisory. Dismissing one never changes the deal. */
export function attachEndgameUI({ elements: e, seen, onSeen, onUndo, onRestart, onNew, onFinish }) {
  let game, outcome, plan, cachedGame, cachedMoves, previousFocus;
  function close() { e.dialog.close(); previousFocus?.focus?.({preventScroll:true}); }
  function open() {
    if (e.dialog.open) return;
    previousFocus=e.dialog.ownerDocument?.activeElement;
    e.dialog.showModal();
  }
  e.close.onclick=close;
  e.keep.onclick=close;
  e.review.onclick=open;
  e.undo.onclick=()=>{close();onUndo();};
  e.restart.onclick=()=>{if(onRestart()) close();};
  e.newDeal.onclick=()=>{if(onNew()) close();};
  e.finish.onclick=()=>{if(plan?.length) onFinish(plan);};
  return {
    update(current, { canUndo, time, deferResult = false, newWin = false }) {
      game=current;
      if (cachedGame!==game || cachedMoves!==game.moves) {
        cachedGame=game; cachedMoves=game.moves;
        outcome=gameOutcome(game);
        plan=outcome.kind==='playing' ? completionPlan(game) : null;
      }
      const ended=outcome.kind!=='playing';
      e.actions.hidden=!ended||deferResult;
      e.finish.hidden=!plan;
      e.summary.textContent=outcome.title;
      e.review.textContent=outcome.kind==='won' ? 'View result' : 'Review options';
      e.dialog.dataset.outcome=outcome.kind;
      e.title.textContent=outcome.title;
      e.message.textContent=game.difficulty==='easy'&&!canUndo
        ? outcome.message.replace('Undo a move to try another route.','Replay this deal or start a new one.')
        : outcome.message;
      e.stats.hidden=outcome.kind!=='won';
      e.stats.textContent=`${time} · ${game.moves} ${game.moves===1?'move':'moves'}`;
      e.undo.hidden=outcome.kind==='won'||game.difficulty==='hard';
      e.undo.disabled=!canUndo;
      e.newDeal.classList.toggle('primary', outcome.kind==='won'||game.difficulty==='hard'||!canUndo);
      e.undo.classList.toggle('primary',outcome.kind==='blocked'&&canUndo&&game.difficulty!=='hard');
      e.keep.textContent=outcome.kind==='won' ? 'Back to the table' : 'Keep playing';
      if (!ended) { if(e.dialog.open) close(); return; }
      const key=`${game.difficulty}:${outcome.kind}:${hintPosition(game)}`;
      if (newWin && outcome.kind==='won') seen.delete(key);
      if (deferResult) return;
      if (!seen.has(key)) {
        // Do not steal focus from rules/settings; reconsider when those close.
        if (e.dialog.ownerDocument?.querySelector('dialog[open]') && !e.dialog.open) return;
        seen.add(key); onSeen(); open();
      }
    },
    reset() { cachedGame=null; if(e.dialog.open) close(); }
  };
}
