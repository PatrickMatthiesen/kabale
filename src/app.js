import { deal, applyMove, autoMove, legalMoves, pyramidPlayable } from './engine.js';
import { loadArt, saveArt, resolveArt, cardFace, getStorage } from './card-art.js';
import { wasteLayout } from './waste-layout.js';
import { hintRole as getHintRole, hintVisitKey, selectHint } from './hints.js';
import { boardLayout } from './board-layout.js';
import { attachCardDrag } from './card-drag.js';
import { loadEmptyColumns, saveEmptyColumns } from './game-settings.js';
import { gameRules } from './game-rules.js';
import { attachEndgameUI } from './endgame-ui.js';
import './register-cache.js';

const storage = getStorage(window);
const art = loadArt(storage);
saveArt(storage,art);
let emptyColumns = loadEmptyColumns(storage);

const $ = id => document.getElementById(id);
const names = { klondike: '7-kabale', spider: 'Spider', freecell: 'FreeCell', pyramid: 'Pyramid' };
const storageKey = 'kabale-session-v3';
let g = deal('klondike', 'normal', { emptyColumns });
let initial = structuredClone(g), past = [], future = [], selected = null, hint = null;
let elapsed = 0, resumedAt = Date.now(), notice = '', lastClick = { key: '', time: 0 };
let hintFeedback = '';
let saveTimer;
let seenEndNotices = new Set();
try {
  const saved = storage ? JSON.parse(storage.getItem(storageKey)) : null;
  if (saved?.version === 3 && names[saved.game?.mode] && Array.isArray(saved.game.cols) && saved.initial) {
    g = saved.game; initial = saved.initial;
    past = g.difficulty === 'hard' ? [] : (saved.past || []).slice(-100);
    future = g.difficulty === 'hard' ? [] : (saved.future || []).slice(-100);
    elapsed = Number.isFinite(saved.elapsed) ? saved.elapsed : 0;
    seenEndNotices = new Set(Array.isArray(saved.seenEndNotices) ? saved.seenEndNotices.filter(k=>typeof k==='string') : []);
  }
} catch { notice = 'Your saved game could not be loaded. A fresh table is ready.'; }
if (g.mode === 'klondike') emptyColumns = g.emptyColumns ?? 'kings';
let hintPositions = new Set([...past,g].map(hintVisitKey));
const board = $('board');
let cardDrag;
let cardPixels = 160;
let lastLayout = '';
let endgameUI;
function refreshArtResolution() {
  for (const image of board.querySelectorAll('.full-face[data-rank]')) {
    const face=cardFace({r:Number(image.dataset.rank),s:image.dataset.suit},art.resolved,{cardWidth:cardPixels,pixelRatio:window.devicePixelRatio || 1});
    const background=`url("${face.url}")`;
    if (image.style.backgroundImage !== background) image.style.backgroundImage=background;
  }
}
function fitBoard() {
  const style = getComputedStyle(board);
  const width = board.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const boardTop = board.getBoundingClientRect().top + window.scrollY;
  const availableHeight = window.innerHeight - boardTop - 50;
  const signature = `${g.mode}:${width}:${availableHeight}:${window.devicePixelRatio}`;
  if (signature === lastLayout || width <= 0) return;
  lastLayout = signature;
  const layout = boardLayout(g.mode, width, availableHeight);
  cardPixels = layout.cardWidth;
  for (const [name,value] of Object.entries({ 'card-w':layout.cardWidth, 'layout-gap':layout.gap, 'face-step':layout.faceStep, 'back-step':layout.backStep })) {
    board.style.setProperty(`--${name}`, `${value}px`);
  }
  refreshArtResolution();
}
new ResizeObserver(fitBoard).observe(board);
window.addEventListener('resize', fitBoard);
const rank = c => ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][c.r];
const suitNames = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };
const clock = () => elapsed + (g.won ? 0 : Date.now() - resumedAt);
function saveNow() {
  clearTimeout(saveTimer);
  try { storage.setItem(storageKey, JSON.stringify({version: 3, game: g, initial, past, future, elapsed: clock(), seenEndNotices:[...seenEndNotices]})); }
  catch { notice = 'Browser storage is unavailable. Keep this tab open to retain your game.'; $('message').textContent = notice; }
}
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 120); }
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
function sourceLabel(key) {
  const [kind, i] = key.split(':');
  return kind === 'col' ? `Column ${+i + 1}` : kind === 'cell' ? `Free cell ${+i + 1}` : kind === 'found' ? `Foundation ${+i + 1}` : kind === 'p' ? `Pyramid row ${+i + 1}` : key === 'pw' || key === 'waste' ? 'Waste' : 'Stock';
}
function card(c, key, top = 0, blocked = false) {
  const face = c.up;
  const isSelected = !blocked && selected === key;
  const hintRole = blocked ? '' : getHintRole(g, hint, key, face);
  const isHint = !!hintRole;
  const label = face ? `${rank(c)} of ${suitNames[c.s]}, ${sourceLabel(key)}` : `Face down card, ${sourceLabel(key)}`;
  const image = face ? cardFace(c, art.resolved,{cardWidth:cardPixels,pixelRatio:window.devicePixelRatio || 1}) : null;
  const illustration = image ? `<span class="card-face" data-art="${art.resolved}" aria-hidden="true"><span class="full-face" data-rank="${c.r}" data-suit="${c.s}" style="background-image:url('${image.url}');background-size:${image.size};background-position:${image.position}"></span><span class="card-index card-index-top"><b>${rank(c)}</b><span>${c.s}\uFE0E</span></span><span class="card-index card-index-bottom"><b>${rank(c)}</b><span>${c.s}\uFE0E</span></span></span>` : '<span class="back-medallion" aria-hidden="true">K</span>';
  return `<button type="button" class="card ${face ? 'illustrated' : 'back'} ${face && ['♥','♦'].includes(c.s) ? 'red' : ''} ${isSelected ? 'selected' : ''} ${isHint ? 'hinted' : ''} ${hintRole}" style="top:${typeof top === 'number' ? `${top}px` : top}" data-key="${key}" aria-label="${label}" aria-pressed="${isSelected}" ${blocked || !face && key !== 'stock' ? 'disabled' : ''}>${illustration}</button>`;
}
function waste(cards, key) {
  if (!cards.length) return pile('', key, 'Waste');
  return `<div class="pile waste-pile" data-key="${key}">${wasteLayout(cards).map((layer,i) => `<div class="waste-layer ${layer.top ? 'waste-top' : 'waste-ghost'}" style="transform:translate(${layer.x}px,${layer.y}px) rotate(${layer.angle}deg);z-index:${i}" ${layer.top ? '' : 'aria-hidden="true" inert'}>${card(layer.card,key,0,!layer.top)}</div>`).join('')}</div>`;
}
function pile(contents, key, label) {
  const role = !contents ? (key==='stock' && hint?.from===key ? 'hint-source' : hint?.to===key ? 'hint-destination' : '') : '';
  return `<div class="pile ${role ? `hinted ${role}` : ''}" data-key="${key}">${contents || `<button class="placeholder empty-target" data-key="${key}" aria-label="${label || sourceLabel(key)}">${label || 'Empty'}</button>`}</div>`;
}
function tableau(col, i) {
  let faceSteps = 0, backSteps = 0, lastTop = '0px';
  const cards = col.map((c,j) => {
    const top = `calc(${faceSteps} * var(--face-step) + ${backSteps} * var(--back-step))`;
    lastTop = top;
    if (c.up) faceSteps++; else backSteps++;
    return card(c,`col:${i}:${j}`,top);
  }).join('');
  return `<div class="col ${!col.length && hint?.to === `col:${i}` ? 'hinted hint-destination' : ''}" data-key="col:${i}" aria-label="Column ${i+1}, ${col.length} cards" style="min-height:calc(var(--card-h) + ${lastTop})">${cards || `<button class="empty empty-target" data-key="col:${i}" aria-label="Empty column ${i+1}"><span>Empty</span></button>`}</div>`;
}
function render() {
  cardDrag?.cancel();
  board.dataset.mode = g.mode;
  fitBoard();
  const focusKey = document.activeElement?.dataset.key;
  board.dataset.art = art.resolved;
  $('card-art').value = art.choice;
  $('art-note').textContent = art.choice === 'random' ? (art.resolved === 'engraved' ? 'Engraved' : 'Woodcut') : '';
  $('modes').innerHTML = Object.entries(names).map(([mode, name]) => `<button type="button" data-mode="${mode}" aria-pressed="${g.mode === mode}" class="${g.mode === mode ? 'active' : ''}">${name}</button>`).join('');
  $('difficulty').value = g.difficulty || 'normal';
  $('empty-columns').value = g.mode === 'klondike' ? (g.emptyColumns ?? 'kings') : emptyColumns;
  $('klondike-options').hidden = g.mode !== 'klondike';
  $('moves').textContent = g.moves;
  $('undo').disabled = g.difficulty === 'hard' || !past.length;
  $('redo').disabled = g.difficulty === 'hard' || !future.length;
  $('hint').disabled = g.difficulty === 'hard' || g.won;
  $('difficulty-note').textContent = g.difficulty === 'hard' ? 'Hard · no undo, redo or hints' : `${g.difficulty === 'easy' ? 'Easy' : 'Normal'} · undo and hints available`;
  const rules = gameRules(g);
  $('rules-title').textContent = `${rules.name} rules`;
  $('rules-goal').textContent = rules.goal;
  $('rules-list').replaceChildren(...rules.rules.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
  $('rules-challenge').textContent = rules.challenge;
  let html;
  if (g.mode === 'pyramid') {
    html = g.cols.map((row, y) => `<div class="row pyramidrow">${row.map((c, x) => `<div class="pile pyramid-slot">${c ? card(c, `p:${y}:${x}`, 0, !pyramidPlayable(g,y,x)) : ''}</div>`).join('')}</div>`).join('');
    html += '<div class="row stockrow">' + pile(g.stock.length ? card({up: false}, 'stock') : '', 'stock', g.stock.length ? `Stock · ${g.stock.length}` : 'Redeal') + waste(g.pairWaste, 'pw') + '</div>';
  } else {
    html = '<div class="row reserve-row">';
    if (g.mode === 'freecell') html += g.cells.map((c,i) => pile(c ? card(c,`cell:${i}`) : '',`cell:${i}`,'Free cell')).join('');
    else html += pile(g.stock.length ? card({up:false},'stock') : '', 'stock', g.stock.length ? `Stock · ${g.stock.length}` : 'Redeal') + (g.mode === 'klondike' ? waste(g.waste, 'waste') : '');
    html += '<span class="reserve-spacer"></span>';
    html += g.mode === 'spider' ? `<span class="run-counter">${g.found.length}<small>of 8 runs</small></span>` : g.found.map((f,i) => pile(f.length ? card(f.at(-1),`found:${i}`) : '',`found:${i}`,'Ace')).join('');
    html += '</div><div class="row tableau">' + g.cols.map(tableau).join('') + '</div>';
  }
  board.dataset.mode = g.mode;
  fitBoard();
  board.innerHTML = html;
  $('message').textContent = g.won ? 'The table is cleared. Well played.' : notice || (selected ? 'Choose a destination. Escape cancels your selection.' : 'Drag a card, or select it and its destination.');
  $('message').setAttribute('aria-live',hintFeedback ? 'off' : 'polite');
  $('hint-feedback').hidden=!hintFeedback;
  $('hint-feedback-text').textContent=hintFeedback;
  if (focusKey) board.querySelector(`button[data-key="${focusKey}"]:not(:disabled)`)?.focus({preventScroll:true});
  endgameUI?.update(g,{canUndo:past.length>0,time:$('time').textContent});
}
function action(fn) {
  hintFeedback='';
  const before = structuredClone(g);
  if (!fn()) { notice = 'That move is not available. Choose another card or destination.'; render(); return false; }
  if (g.difficulty !== 'hard') { past.push(before); if (past.length > 100) past.shift(); }
  if (g.difficulty !== 'hard') hintPositions.add(hintVisitKey(g));
  future = []; selected = null; hint = null; notice = '';
  if (g.won) elapsed += Date.now() - resumedAt;
  updateClock(); save(); render(); return true;
}
function choose(key, automatic = false) {
  hintFeedback='';
  hint = null;
  if (g.won) return;
  if (key === 'stock') {
    if (g.mode==='spider' && g.stock.length && g.cols.some(col=>!col.length)) {
      notice='Fill every empty column before dealing from the stock.'; render(); return;
    }
    action(() => applyMove(g,'stock','stock')); return;
  }
  if (automatic) { action(() => autoMove(g,key)); return; }
  if (g.mode === 'pyramid' && legalMoves(g).some(m => m.from === key && m.to === key)) { action(() => applyMove(g,key,key)); return; }
  if (key === selected) { selected = null; notice = ''; render(); return; }
  if (selected && action(() => applyMove(g, selected, key))) return;
  const playable = legalMoves(g).some(m => m.from === key);
  if (playable) { selected = key; notice = ''; render(); }
  else if (!selected) { notice = 'There is no legal move for that card.'; render(); }
}
board.addEventListener('click', e => {
  const target = e.target.closest('[data-key]');
  if (!target || target.disabled) return;
  const key = target.dataset.key, time = performance.now();
  const automatic = e.detail !== 0 && key !== 'stock' && key === lastClick.key && time-lastClick.time < 400;
  lastClick = automatic ? {key:'',time:0} : {key,time};
  choose(key,automatic);
});
board.addEventListener('keydown', e => {
  if (e.target.tagName === 'BUTTON') return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(e.target.dataset.key); }
});
function undo(redo = false) {
  if (g.difficulty === 'hard') return;
  const from = redo ? future : past, to = redo ? past : future;
  if (!from.length) return;
  hintFeedback='';
  elapsed = clock(); to.push(structuredClone(g)); g = from.pop(); selected = null; hint = null; notice = redo ? 'Move restored.' : 'Move undone.';
  hintPositions = new Set([...past,g].map(hintVisitKey));
  resumedAt = Date.now(); save(); render();
}
function fresh(mode = g.mode, difficulty = g.difficulty, restart = false, emptyRule = emptyColumns) {
  if (g.moves && !g.won && !confirm(restart ? 'Restart this deal? Your moves will be cleared.' : 'Start a new deal? Your current game will be replaced.')) return false;
  g = restart ? structuredClone(initial) : deal(mode,difficulty,{emptyColumns:emptyRule});
  emptyColumns = g.mode === 'klondike' ? (g.emptyColumns ?? 'kings') : emptyRule;
  saveEmptyColumns(storage,emptyColumns);
  if (!restart) { art.resolved = resolveArt(art.choice); saveArt(storage, art); }
  initial = structuredClone(g); past = []; future = []; selected = null; hint = null; elapsed = 0; resumedAt = Date.now(); notice = '';
  hintPositions = new Set([hintVisitKey(g)]);
  hintFeedback='';
  seenEndNotices.clear(); endgameUI?.reset();
  save(); render(); return true;
}
$('modes').onclick = e => { const mode=e.target.dataset.mode; if(mode && mode !== g.mode) fresh(mode); };
$('difficulty').onchange = e => { if(!fresh(g.mode,e.target.value)) e.target.value=g.difficulty; };
$('empty-columns').onchange = e => {
  if (!fresh(g.mode,g.difficulty,false,e.target.value)) e.target.value=g.emptyColumns ?? 'kings';
};
$('card-art').onchange = e => {
  art.choice = e.target.value;
  art.resolved = resolveArt(art.choice);
  saveArt(storage, art);
  render();
};
$('new').onclick = () => fresh();
$('restart').onclick = () => fresh(g.mode,g.difficulty,true);
$('undo').onclick = () => undo();
$('redo').onclick = () => undo(true);
$('hint').onclick = () => {
  if (g.difficulty === 'hard') return;
  selected=null;
  hint = selectHint(g,hintPositions);
  notice = hint ? (hint.from === 'stock' ? (g.stock.length ? 'Draw from the stock.' : 'Recycle the waste into the stock.') : `${hint.label}: ${sourceLabel(hint.from)} to ${sourceLabel(hint.to || hint.from)}.`) : legalMoves(g).length ? 'No new hint found. Try another approach or undo a move. This does not mean the deal is lost.' : 'No legal moves remain from this position.';
  hintFeedback=notice;
  render();
};
$('hint-feedback-close').onclick=()=>{hintFeedback='';render();};
$('rules').onclick = () => $('rules-dialog').showModal();
$('settings-open').onclick = () => $('settings-dialog').showModal();

cardDrag = attachCardDrag(board, {
  getMoves: () => g.won ? [] : legalMoves(g),
  onStart: () => {
    hintFeedback=''; $('hint-feedback').hidden=true;
    $('message').setAttribute('aria-live','polite');
    hint=null; selected=null; lastClick={key:'',time:0};
    board.querySelectorAll('.hinted,.hint-source,.hint-destination,.selected').forEach(el=>el.classList.remove('hinted','hint-source','hint-destination','selected'));
    $('message').textContent='Release to place the card. Escape cancels.';
  },
  onDrop: (from,to) => {
    if (to) action(()=>applyMove(g,from,to));
    else { notice='Card returned to its original position.'; render(); }
  },
  onCancel: () => { notice='Move cancelled.'; $('message').textContent=notice; }
});
document.addEventListener('keydown', e => {
  if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName) || document.querySelector('dialog[open]')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(e.shiftKey); }
  if (e.key === 'Escape') { selected = null; notice = ''; hintFeedback=''; render(); }
  if (e.key.toLowerCase() === 'a' && selected) { e.preventDefault(); choose(selected,true); }
});
function updateClock(){ const seconds=Math.floor(clock()/1000); $('time').textContent=`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`; }
endgameUI=attachEndgameUI({
  elements:Object.fromEntries(Object.entries({dialog:'end-dialog',actions:'end-actions',summary:'end-summary',finish:'finish-game',review:'end-review',close:'end-close',keep:'end-keep',undo:'end-undo',restart:'end-restart',newDeal:'end-new',title:'end-title',message:'end-message',stats:'end-stats'}).map(([key,id])=>[key,$(id)])),
  seen:seenEndNotices, onSeen:save, onUndo:()=>undo(),
  onRestart:()=>fresh(g.mode,g.difficulty,true), onNew:()=>fresh(),
  onFinish:plan=>action(()=>{
    // Verify the complete sequence before touching the live game.
    const completed=structuredClone(g);
    for(const move of plan) if(!applyMove(completed,move.from,move.to)) return false;
    if(!completed.won) return false;
    g=completed; return true;
  })
});
for(const id of ['rules-dialog','settings-dialog']) $(id).addEventListener('close',()=>endgameUI.update(g,{canUndo:past.length>0,time:$('time').textContent}));
setInterval(updateClock,1000); updateClock(); render();






