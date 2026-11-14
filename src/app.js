import { deal, applyMove, autoMove, legalMoves, pyramidPlayable } from './engine.js';
import { loadArt, saveArt, resolveArt, cardFace, getStorage } from './card-art.js';
import { wasteLayout } from './waste-layout.js';
import { hintRole as getHintRole } from './hints.js';
import { boardLayout } from './board-layout.js';

const storage = getStorage(window);
const art = loadArt(storage);

const $ = id => document.getElementById(id);
const names = { klondike: '7-kabale', spider: 'Spider', freecell: 'FreeCell', pyramid: 'Pyramid' };
const storageKey = 'kabale-session-v3';
let g = deal('klondike', 'normal');
let initial = structuredClone(g), past = [], future = [], selected = null, hint = null;
let elapsed = 0, resumedAt = Date.now(), notice = '', lastClick = { key: '', time: 0 };
let saveTimer;
try {
  const saved = storage ? JSON.parse(storage.getItem(storageKey)) : null;
  if (saved?.version === 3 && names[saved.game?.mode] && Array.isArray(saved.game.cols) && saved.initial) {
    g = saved.game; initial = saved.initial;
    past = g.difficulty === 'hard' ? [] : (saved.past || []).slice(-100);
    future = g.difficulty === 'hard' ? [] : (saved.future || []).slice(-100);
    elapsed = Number.isFinite(saved.elapsed) ? saved.elapsed : 0;
  }
} catch { notice = 'Your saved game could not be loaded. A fresh table is ready.'; }
const board = $('board');
let lastLayout = '';
function fitBoard() {
  const style = getComputedStyle(board);
  const width = board.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const boardTop = board.getBoundingClientRect().top + window.scrollY;
  const availableHeight = window.innerHeight - boardTop - 50;
  const signature = `${g.mode}:${width}:${availableHeight}`;
  if (signature === lastLayout || width <= 0) return;
  lastLayout = signature;
  const layout = boardLayout(g.mode, width, availableHeight);
  for (const [name,value] of Object.entries({ 'card-w':layout.cardWidth, 'layout-gap':layout.gap, 'face-step':layout.faceStep, 'back-step':layout.backStep })) {
    board.style.setProperty(`--${name}`, `${value}px`);
  }
}
new ResizeObserver(fitBoard).observe(board);
window.addEventListener('resize', fitBoard);
const rank = c => ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][c.r];
const suitNames = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };
const clock = () => elapsed + (g.won ? 0 : Date.now() - resumedAt);
function saveNow() {
  clearTimeout(saveTimer);
  try { storage.setItem(storageKey, JSON.stringify({version: 3, game: g, initial, past, future, elapsed: clock()})); }
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
  const image = face ? cardFace(c, art.resolved) : null;
  const illustration = image ? `<span class="full-face" aria-hidden="true" style="background-image:url('${image.url}');background-size:${image.size};background-position:${image.position}"></span>` : '<span class="back-medallion" aria-hidden="true">K</span>';
  return `<button type="button" class="card ${face ? 'illustrated' : 'back'} ${face && ['♥','♦'].includes(c.s) ? 'red' : ''} ${isSelected ? 'selected' : ''} ${isHint ? 'hinted' : ''} ${hintRole}" style="top:${typeof top === 'number' ? `${top}px` : top}" data-key="${key}" aria-label="${label}" aria-pressed="${isSelected}" ${blocked || !face && key !== 'stock' ? 'disabled' : ''}>${illustration}</button>`;
}
function waste(cards, key) {
  if (!cards.length) return pile('', key, 'Waste');
  return `<div class="pile waste-pile" data-key="${key}">${wasteLayout(cards).map((layer,i) => `<div class="waste-layer ${layer.top ? 'waste-top' : 'waste-ghost'}" style="transform:translate(${layer.x}px,${layer.y}px) rotate(${layer.angle}deg);z-index:${i}" ${layer.top ? '' : 'aria-hidden="true" inert'}>${card(layer.card,key,0,!layer.top)}</div>`).join('')}</div>`;
}
function pile(contents, key, label) {
  return `<div class="pile ${!contents && hint?.to === key ? 'hinted hint-destination' : ''}" data-key="${key}">${contents || `<button class="placeholder empty-target" data-key="${key}" aria-label="${label || sourceLabel(key)}">${label || 'Empty'}</button>`}</div>`;
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
function summary() {
  const hard = g.difficulty === 'hard';
  const base = {
    klondike: `Build alternating colors downward; only Kings fill empty columns. Foundations run Ace to King. Draw ${hard ? 'three' : 'one'}; recycle the stock freely.`,
    spider: `Build downward in rank; move sequences of the same suit. Complete King-to-Ace runs in one suit. Fill every column before dealing. ${g.difficulty === 'easy' ? 'One suit' : hard ? 'Four suits' : 'Two suits'}.`,
    freecell: `Build alternating colors downward; any card may fill an empty column. ${hard ? 'Two' : 'Four'} free cells. Empty cells and columns determine how many cards you can move together. Foundations run Ace to King.`,
    pyramid: `Remove exposed pairs totaling 13; remove Kings alone. Clear the pyramid to win. Use the top waste card. ${g.difficulty === 'easy' ? 'Two redeals' : hard ? 'No redeals' : 'One redeal'}.`
  };
  return base[g.mode];
}
function render() {
  const focusKey = document.activeElement?.dataset.key;
  board.dataset.art = art.resolved;
  $('card-art').value = art.choice;
  $('art-note').textContent = art.choice === 'random' ? (art.resolved === 'engraved' ? 'Engraved' : 'Woodcut') : '';
  $('modes').innerHTML = Object.entries(names).map(([mode, name]) => `<button type="button" data-mode="${mode}" aria-pressed="${g.mode === mode}" class="${g.mode === mode ? 'active' : ''}">${name}</button>`).join('');
  $('difficulty').value = g.difficulty || 'normal';
  $('moves').textContent = g.moves;
  $('undo').disabled = g.difficulty === 'hard' || !past.length;
  $('redo').disabled = g.difficulty === 'hard' || !future.length;
  $('hint').disabled = g.difficulty === 'hard' || g.won;
  $('difficulty-note').textContent = g.difficulty === 'hard' ? 'Hard · no undo, redo or hints' : `${g.difficulty === 'easy' ? 'Easy' : 'Normal'} · undo and hints available`;
  $('rule-summary').textContent = summary();
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
  $('message').textContent = g.won ? 'The table is cleared. Well played.' : notice || (selected ? 'Choose a destination. Escape cancels your selection.' : 'Double-click a card to move it automatically.');
  if (focusKey) board.querySelector(`button[data-key="${focusKey}"]:not(:disabled)`)?.focus({preventScroll:true});
}
function action(fn) {
  const before = structuredClone(g);
  if (!fn()) { notice = 'That move is not available. Choose another card or destination.'; render(); return false; }
  if (g.difficulty !== 'hard') { past.push(before); if (past.length > 100) past.shift(); }
  future = []; selected = null; hint = null; notice = '';
  if (g.won) elapsed += Date.now() - resumedAt;
  save(); render(); return true;
}
function choose(key, automatic = false) {
  hint = null;
  if (g.won) return;
  if (key === 'stock') { action(() => applyMove(g,'stock','stock')); return; }
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
  elapsed = clock(); to.push(structuredClone(g)); g = from.pop(); selected = null; hint = null; notice = redo ? 'Move restored.' : 'Move undone.';
  resumedAt = Date.now(); save(); render();
}
function fresh(mode = g.mode, difficulty = g.difficulty, restart = false) {
  if (g.moves && !g.won && !confirm(restart ? 'Restart this deal? Your moves will be cleared.' : 'Start a new deal? Your current game will be replaced.')) return false;
  g = restart ? structuredClone(initial) : deal(mode,difficulty);
  if (!restart) { art.resolved = resolveArt(art.choice); saveArt(storage, art); }
  initial = structuredClone(g); past = []; future = []; selected = null; hint = null; elapsed = 0; resumedAt = Date.now(); notice = '';
  save(); render(); return true;
}
$('modes').onclick = e => { const mode=e.target.dataset.mode; if(mode && mode !== g.mode) fresh(mode); };
$('difficulty').onchange = e => { if(!fresh(g.mode,e.target.value)) e.target.value=g.difficulty; };
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
  hint = legalMoves(g)[0];
  notice = hint ? (hint.from === 'stock' ? 'Draw from the stock.' : `${hint.label}: ${sourceLabel(hint.from)} to ${sourceLabel(hint.to || hint.from)}.`) : 'No legal moves remain. Undo a move or try a new deal.';
  render();
};
$('rules').onclick = () => $('rules-dialog').showModal();
$('settings-open').onclick = () => $('settings-dialog').showModal();
document.addEventListener('keydown', e => {
  if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName) || $('rules-dialog').open || $('settings-dialog').open) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(e.shiftKey); }
  if (e.key === 'Escape') { selected = null; notice = ''; render(); }
  if (e.key.toLowerCase() === 'a' && selected) { e.preventDefault(); choose(selected,true); }
});
function updateClock(){ const seconds=Math.floor(clock()/1000); $('time').textContent=`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`; }
setInterval(updateClock,1000); updateClock(); render();






