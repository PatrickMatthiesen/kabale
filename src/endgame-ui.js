import { gameOutcome, completionPlan } from './endgame.js';
import { hintPosition } from './hints.js';
import { translate } from './i18n.js';

/** End notices are advisory. Dismissing one never changes the deal. */
export function attachEndgameUI({ elements: e, seen, onSeen, onUndo, onRestart, onNew, onFinish }) {
  let game, outcome, plan, cachedGame, cachedMoves, cachedLanguage, cachedCanUndo, previousFocus;
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
    update(current, { canUndo, time, deferResult = false, newWin = false, language = 'en' }) {
      game=current;
      const tr = (text,values) => translate(language,text,values);
      const moved = cachedGame!==game || cachedMoves!==game.moves;
      if (moved || cachedLanguage!==language || cachedCanUndo!==canUndo) {
        cachedGame=game; cachedMoves=game.moves; cachedLanguage=language; cachedCanUndo=canUndo;
        outcome=gameOutcome(game,{language,canUndo});
        if (moved) plan=outcome.kind==='playing' ? completionPlan(game) : null;
      }
      const ended=outcome.kind!=='playing';
      e.actions.hidden=!ended||deferResult;
      e.finish.hidden=!plan;
      e.summary.textContent=outcome.title;
      e.review.textContent=tr(outcome.kind==='won' ? 'View result' : 'Review options');
      e.dialog.dataset.outcome=outcome.kind;
      e.title.textContent=outcome.title;
      e.message.textContent=outcome.message;
      e.stats.hidden=outcome.kind!=='won';
      e.stats.textContent=`${time} · ${tr(game.moves===1?'{count} move':'{count} moves',{count:game.moves})}`;
      e.undo.hidden=outcome.kind==='won'||game.difficulty==='hard';
      e.undo.disabled=!canUndo;
      e.newDeal.classList.toggle('primary', outcome.kind==='won'||game.difficulty==='hard'||!canUndo);
      e.undo.classList.toggle('primary',outcome.kind==='blocked'&&canUndo&&game.difficulty!=='hard');
      e.keep.textContent=tr(outcome.kind==='won' ? 'Back to the table' : 'Keep playing');
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
