import { deal, applyMove, autoMove, legalMoves, pyramidPlayable } from './engine.js';
import { loadArt, saveArt, resolveArt, cardFace, getStorage } from './card-art.js';
import { wasteLayout } from './waste-layout.js';
import { hintRole as getHintRole, hintVisitKey, selectHint, visibleHintCard } from './hints.js';
import { planKlondikeHint } from './klondike-hints.js';
import { rememberStock, restoreStockMemory } from './stock-memory.js';
import { boardLayout } from './board-layout.js';
import { attachCardDrag } from './card-drag.js';
import { loadEmptyColumns, saveEmptyColumns, cardIndexScales, loadCardIndexSize, saveCardIndexSize } from './game-settings.js';
import { gameRules } from './game-rules.js';
import { attachEndgameUI } from './endgame-ui.js';
import { createCardMotion } from './card-motion.js';
import { attachFullscreen } from './fullscreen.js';
import { bindDocumentLanguage, loadLanguage, saveLanguage, translate } from './i18n.js';
import './register-cache.js';

const storage = getStorage(window);
const art = loadArt(storage);
saveArt(storage,art);
let emptyColumns = loadEmptyColumns(storage);
let indexSize = loadCardIndexSize(storage);
let language = loadLanguage(storage,window.navigator?.language);
const tr = (text,values) => translate(language,text,values);
const setDocumentLanguage = document.documentElement ? bindDocumentLanguage(document) : null;

const $ = id => document.getElementById(id);
const names = { klondike: '7-kabale', spider: 'Spider', freecell: 'FreeCell', pyramid: 'Pyramid' };
const storageKey = 'kabale-session-v3';
let g = deal('klondike', 'normal', { emptyColumns });
let initial = structuredClone(g), past = [], future = [], selected = null, hint = null;
let elapsed = 0, resumedAt = Date.now(), announcement = '', lastClick = { key: '', time: 0 };
let hintFeedback = '';
let warning = null;
let dragging = false;
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
} catch { setWarning('Your saved game could not be loaded. A fresh table is ready.'); }
if (g.mode === 'klondike') emptyColumns = g.emptyColumns ?? 'kings';
restoreStockMemory([...past,g,...future.slice().reverse()]);
let hintPositions = new Set([...past,g].map(hintVisitKey));
const board = $('board');
const feedback = $('hint-feedback');
const motion = createCardMotion(board);
let finishPlayback = null;
let celebrating = false;
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
  if (finishPlayback) return;
  const style = getComputedStyle(board);
  const pixels = value => parseFloat(value) || 0;
  const width = board.clientWidth - pixels(style.paddingLeft) - pixels(style.paddingRight);
  const boardTop = board.getBoundingClientRect().top + window.scrollY;
  const below = pixels(getComputedStyle(document.body).paddingBottom)
    + pixels(getComputedStyle($('table-main')).paddingBottom)
    + pixels(getComputedStyle($('game-room')).borderBottomWidth);
  const minimumHeight = document.documentElement?.hasAttribute('data-focus-mode') ? 0 : 180;
  const boardHeight = Math.max(minimumHeight,Math.floor(window.innerHeight - boardTop - below));
  const availableHeight = boardHeight - pixels(style.paddingTop) - pixels(style.paddingBottom)
    - pixels(style.borderTopWidth) - pixels(style.borderBottomWidth);
  const reserveGap = pixels(style.getPropertyValue?.('--reserve-gap')) || 12;
  const stacks = g.mode === 'pyramid' ? [] : g.cols.map(column => {
    const covered = column.slice(0,-1);
    const face = covered.filter(card=>card.up).length;
    return {face,back:covered.length-face};
  });
  const indexScale = cardIndexScales[indexSize];
  const signature = JSON.stringify([g.mode,width,boardHeight,availableHeight,reserveGap,indexScale,stacks,window.devicePixelRatio]);
  if (signature === lastLayout || width <= 0) return;
  lastLayout = signature;
  const options = {stacks,reserveGap,indexScale};
  let layout = boardLayout(g.mode,width,availableHeight,options);
  let sideReserves = false;
  if ((g.mode === 'freecell' || g.mode === 'klondike') && width >= 640) {
    const side = boardLayout(g.mode,width,availableHeight,{...options,sideReserves:true});
    if ((!layout.fits && side.overflow < layout.overflow) ||
        (side.fits && side.cardWidth > layout.cardWidth + 2)) {
      layout = side;
      sideReserves = true;
    }
  }
  cardPixels = layout.cardWidth;
  board.dataset.sideReserves = String(sideReserves);
  const tableauWidth = layout.columns * layout.cardWidth + (layout.columns - 1) * layout.gap;
  for (const [name,value] of Object.entries({ 'table-height':boardHeight, 'tableau-width':tableauWidth, 'rail-width':layout.railWidth, 'card-w':layout.cardWidth, 'layout-gap':layout.gap, 'face-step':layout.faceStep, 'back-step':layout.backStep })) {
    board.style.setProperty(`--${name}`, `${value}px`);
  }
  refreshArtResolution();
}
new ResizeObserver(() => {
  fitBoard();
  placeFeedback();
}).observe(board);
window.addEventListener('resize', () => {
  cancelDrag();
  fitBoard();
  if (finishPlayback) finishPlayback(false);
  else motion.cancel();
  placeFeedback();
});
const rank = c => ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][c.r];
const suitNames = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };
const clock = () => elapsed + (g.won ? 0 : Date.now() - resumedAt);
function saveNow() {
  clearTimeout(saveTimer);
  try { storage.setItem(storageKey, JSON.stringify({version: 3, game: g, initial, past, future, elapsed: clock(), seenEndNotices:[...seenEndNotices]})); }
  catch {
    setWarning('Browser storage is unavailable. Keep this tab open to retain your game.');
    renderFeedback();
  }
}
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 120); }
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
function sourceLabel(key) {
  const [kind, i] = key.split(':');
  const number = +i + 1;
  return kind === 'col' ? tr('Column {number}',{number})
    : kind === 'cell' ? tr('Free cell {number}',{number})
    : kind === 'found' ? tr('Foundation {number}',{number})
    : kind === 'p' ? tr('Pyramid row {number}',{number})
    : tr(key === 'pw' || key === 'waste' ? 'Waste' : 'Stock');
}
function describeCardHint(game, move) {
  const name = card => {
    const value = rank(card);
    const royal = {A:'Ace',J:'Jack',Q:'Queen',K:'King'};
    return tr('{rank}{symbol} of {suit}',{
      rank:tr(royal[value] ?? value),symbol:`${card.s}\uFE0E`,suit:tr(suitNames[card.s])
    });
  };
  const source = visibleHintCard(game,move.from);
  const target = visibleHintCard(game,move.to);
  if (!source) return tr('Look for the marked cards.');
  if (game.mode === 'pyramid') {
    if (move.from === move.to) return tr('Remove {card}.',{card:name(source)});
    if (target) return tr('Pair {card} with {target} to make 13.',{card:name(source),target:name(target)});
  }
  const [kind, column, index] = move.from.split(':');
  const isStack = kind === 'col' && index !== undefined && +index < game.cols[column].length - 1;
  let card = isStack ? tr('the stack starting with {card}',{card:name(source)}) : name(source);
  if (game.mode === 'spider' && kind === 'col') {
    card = tr('{card} from column {number}',{card,number:+column + 1});
  }
  const [destination, position] = move.to.split(':');
  if (destination === 'cell') return tr('Move {card} to free cell {number}.',{card,number:+position + 1});
  if (destination === 'found') {
    return target ? tr('Move {card} onto {target} on the foundation.',{card,target:name(target)})
      : tr('Move {card} to an empty foundation pile.',{card});
  }
  if (destination === 'col') {
    return target ? tr('Move {card} onto {target}.',{
      card,
      target:game.mode === 'spider' ? tr('{card} in column {number}',{card:name(target),number:+position + 1}) : name(target)
    })
      : tr('Move {card} to empty column {number}.',{card,number:+position + 1});
  }
  return tr('Look for the marked cards.');
}
function card(c, key, top = 0, blocked = false) {
  const face = c.up;
  const isSelected = !blocked && selected === key;
  const hintRole = blocked ? '' : getHintRole(g, hint, key, face);
  const isHint = !!hintRole;
  const name = face ? tr('{rank} of {suit}',{rank:tr(rank(c)),suit:tr(suitNames[c.s])}) : tr('Face down card');
  const label = `${name}, ${sourceLabel(key)}`;
  let illustration = '<span class="back-medallion" aria-hidden="true">K</span>';
  if (face) {
    const value = `<b>${rank(c)}</b><span>${c.s}\uFE0E</span>`;
    const index = `<span class="card-index card-index-top">${value}</span>`;
    let artMarkup = `<span class="contrast-suit">${c.s}\uFE0E</span>`;
    if (art.resolved !== 'contrast') {
      const image = cardFace(c, art.resolved,{cardWidth:cardPixels,pixelRatio:window.devicePixelRatio || 1});
      artMarkup = `<span class="full-face" data-rank="${c.r}" data-suit="${c.s}" style="background-image:url('${image.url}');background-size:${image.size};background-position:${image.position}"></span>`;
    }
    illustration = `<span class="card-face" data-art="${art.resolved}" aria-hidden="true">${artMarkup}${index}<span class="card-index card-index-bottom">${value}</span></span>`;
  }
  return `<button type="button" class="card ${face ? 'illustrated' : 'back'} ${face && ['♥','♦'].includes(c.s) ? 'red' : ''} ${isSelected ? 'selected' : ''} ${isHint ? 'hinted' : ''} ${hintRole}" style="top:${typeof top === 'number' ? `${top}px` : top}" data-key="${key}" aria-label="${label}" aria-pressed="${isSelected}" ${blocked || !face && key !== 'stock' ? 'disabled' : ''}>${illustration}</button>`;
}
function waste(cards, key) {
  if (!cards.length) return pile('', key, tr('Waste'));
  return `<div class="pile waste-pile" data-key="${key}">${wasteLayout(cards).map((layer,i) => `<div class="waste-layer ${layer.top ? 'waste-top' : 'waste-ghost'}" style="transform:translate(${layer.x}px,${layer.y}px) rotate(${layer.angle}deg);z-index:${i}" ${layer.top ? '' : 'aria-hidden="true" inert'}>${card(layer.card,key,0,!layer.top)}</div>`).join('')}</div>`;
}
function pile(contents, key, label) {
  const role = !contents ? (key==='stock' && hint?.from===key ? 'hint-source' : hint?.to===key ? 'hint-destination' : '') : '';
  const accessibleLabel = key.startsWith('cell:') ? sourceLabel(key) : label || sourceLabel(key);
  return `<div class="pile ${role ? `hinted ${role}` : ''}" data-key="${key}">${contents || `<button class="placeholder empty-target" data-key="${key}" aria-label="${accessibleLabel}">${label || tr('Empty')}</button>`}</div>`;
}
function tableau(col, i) {
  let faceSteps = 0, backSteps = 0, lastTop = '0px';
  const cards = col.map((c,j) => {
    const top = `calc(${faceSteps} * var(--face-step) + ${backSteps} * var(--back-step))`;
    lastTop = top;
    if (c.up) faceSteps++; else backSteps++;
    return card(c,`col:${i}:${j}`,top);
  }).join('');
  const label = tr('Column {number}, {count} cards',{number:i+1,count:col.length});
  return `<div class="col ${!col.length && hint?.to === `col:${i}` ? 'hinted hint-destination' : ''}" data-key="col:${i}" aria-label="${label}" style="min-height:calc(var(--card-h) + ${lastTop})">${cards || `<button class="empty empty-target" data-key="col:${i}" aria-label="${tr('Empty column {number}',{number:i+1})}"><span>${tr('Empty')}</span></button>`}</div>`;
}
function renderBoard(display) {
  let html;
  if (display.mode === 'pyramid') {
    html = display.cols.map((row, y) => `<div class="row pyramidrow">${row.map((c, x) => `<div class="pile pyramid-slot">${c ? card(c, `p:${y}:${x}`, 0, !pyramidPlayable(display,y,x)) : ''}</div>`).join('')}</div>`).join('');
    html += '<div class="row stockrow">' + pile(display.stock.length ? card({up: false}, 'stock') : '', 'stock', tr('Redeal')) + waste(display.pairWaste, 'pw') + '</div>';
  } else {
    html = '<div class="row reserve-row">';
    html += '<div class="reserve-group reserve-start">';
    if (display.mode === 'freecell') html += display.cells.map((c,i) => pile(c ? card(c,`cell:${i}`) : '',`cell:${i}`,tr('Free cell'))).join('');
    else html += pile(display.stock.length ? card({up:false},'stock') : '', 'stock', tr('Redeal')) + (display.mode === 'klondike' ? waste(display.waste, 'waste') : '');
    html += '</div>';
    html += '<span class="reserve-spacer"></span>';
    html += '<div class="reserve-group reserve-end">';
    html += display.mode === 'spider' ? `<span class="run-counter">${display.found.length}<small>${tr('of 8 runs')}</small></span>` : display.found.map((f,i) => pile(f.length ? card(f.at(-1),`found:${i}`) : '',`found:${i}`,tr('Ace'))).join('');
    html += '</div></div><div class="row tableau">' + display.cols.map(tableau).join('') + '</div>';
  }
  board.innerHTML = html;
}
function render(newWin = false) {
  cancelDrag();
  board.dataset.mode = g.mode;
  fitBoard();
  const focusKey = document.activeElement?.dataset.key;
  board.dataset.art = art.resolved;
  $('card-art').value = art.choice;
  $('card-index-size').value = indexSize;
  $('art-note').hidden = art.choice !== 'random';
  $('art-note').textContent = art.choice === 'random' ? tr(art.resolved === 'engraved' ? 'Engraved' : 'Woodcut') : '';
  $('modes').innerHTML = Object.entries(names).map(([mode, name]) => `<button type="button" data-mode="${mode}" aria-pressed="${g.mode === mode}" class="${g.mode === mode ? 'active' : ''}">${tr(name)}</button>`).join('');
  $('difficulty').value = g.difficulty || 'normal';
  $('game-room').dataset.difficulty = g.difficulty;
  $('empty-columns').value = g.mode === 'klondike' ? (g.emptyColumns ?? 'kings') : emptyColumns;
  $('klondike-options').hidden = g.mode !== 'klondike';
  $('moves').textContent = g.moves;
  $('undo').disabled = g.difficulty === 'hard' || !past.length;
  $('redo').disabled = g.difficulty === 'hard' || !future.length;
  $('hint').disabled = g.difficulty === 'hard' || g.won;
  const rules = gameRules(g,language);
  $('rules-title').textContent = tr('{game} rules',{game:rules.name});
  $('rules-goal').textContent = rules.goal;
  $('rules-list').replaceChildren(...rules.rules.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
  $('rules-challenge').textContent = rules.challenge;
  renderBoard(g);
  if (focusKey) board.querySelector(`button[data-key="${focusKey}"]:not(:disabled)`)?.focus({preventScroll:true});
  updateEndgame(newWin);
  fitBoard();
  renderFeedback();
  renderMessage();
}
function renderMessage() {
  const text = dragging ? tr('Release to place the card. Escape cancels.')
    : announcement || tr(g.won ? 'The table is cleared. Well played.'
      : selected ? 'Choose a destination. Escape cancels your selection.' : 'Drag a card, or select it and its destination.');
  const message = $('message');
  if (message.textContent !== text) message.textContent = text;
}
function setWarning(text) {
  clearTimeout(warning?.timer);
  if (!text) { warning = null; return; }
  warning = {text,remaining:8000};
  if (document.activeElement !== $('hint-feedback-close')) resumeWarning();
}
function resumeWarning() {
  const current = warning;
  if (!current || current.timer !== undefined) return;
  current.deadline = performance.now() + current.remaining;
  const timer = setTimeout(() => {
    if (warning !== current || current.timer !== timer) return;
    warning = null;
    renderFeedback();
  },current.remaining);
  current.timer = timer;
}
function pauseWarning() {
  if (warning?.timer === undefined) return;
  clearTimeout(warning.timer);
  warning.timer = undefined;
  warning.remaining = Math.max(0,warning.deadline - performance.now());
}
function renderFeedback() {
  const text = warning ? tr(warning.text) : hintFeedback;
  $('message').setAttribute('aria-live',text && !dragging && !announcement ? 'off' : 'polite');
  feedback.hidden = !text;
  feedback.dataset.hint = String(!warning && Boolean(hintFeedback));
  const label = $('hint-feedback-text');
  if (label.textContent !== text) label.textContent = text;
  placeFeedback();
}
function hintCardBounds(card) {
  const {left,right,top,bottom} = card.getBoundingClientRect();
  const next = card.nextElementSibling;
  return {left,right,top,bottom:next?.matches('.card') ? Math.min(bottom,next.getBoundingClientRect().top) : bottom};
}
function placeFeedback() {
  if (feedback.hidden) return;
  const marked = hint
    ? Array.from(board.querySelectorAll('.hint-source, .hint-destination'),hintCardBounds)
    : [];
  if (!marked.length) {
    feedback.dataset.corner = 'bottom-right';
    return;
  }
  const bounds = board.getBoundingClientRect();
  for (const corner of ['bottom-right','bottom-left','top-right','top-left']) {
    feedback.dataset.corner = corner;
    const toast = feedback.getBoundingClientRect();
    // Only the part of each mark inside the scrollable board can overlap the toast.
    if (marked.every(card =>
      Math.max(card.left,bounds.left,toast.left) >= Math.min(card.right,bounds.right,toast.right) ||
      Math.max(card.top,bounds.top,toast.top) >= Math.min(card.bottom,bounds.bottom,toast.bottom))) return;
  }
  feedback.dataset.corner = 'bottom-right';
}
function revealHintSource() {
  if (!(board.scrollHeight > board.clientHeight)) return;
  const source = board.querySelector('.hint-source');
  if (!source) return;
  const target = board.querySelector('.hint-destination');
  const sourceBox = hintCardBounds(source);
  const targetBox = target?.getBoundingClientRect();
  let top = sourceBox.top;
  let bottom = sourceBox.bottom;
  if (targetBox && Math.max(bottom,targetBox.bottom) - Math.min(top,targetBox.top) <= board.clientHeight) {
    top = Math.min(top,targetBox.top);
    bottom = Math.max(bottom,targetBox.bottom);
  }
  const viewportTop = board.getBoundingClientRect().top + board.clientTop;
  const viewportBottom = viewportTop + board.clientHeight;
  if (top < viewportTop) board.scrollTop += top - viewportTop;
  else if (bottom > viewportBottom) board.scrollTop += Math.min(top - viewportTop,bottom - viewportBottom);
  placeFeedback();
}
board.addEventListener('scroll',placeFeedback,{passive:true});
function updateEndgame(newWin = false) {
  endgameUI?.update(g,{canUndo:past.length>0,time:$('time').textContent,deferResult:celebrating,newWin,language});
}
function celebrate(previous) {
  const winner = g;
  celebrating = motion.enabled();
  render(true);
  if (celebrating) {
    const showResult = () => {
      if (g !== winner) return;
      celebrating = false;
      updateEndgame();
    };
    motion.win(previous).then(showResult,showResult);
  }
}
async function playFinish(display, path, previous) {
  $('game-room').inert = true;
  $('skip-finish').hidden = false;
  $('skip-finish').focus({preventScroll:true});
  const complete = animateWin => {
    if (finishPlayback !== complete) return;
    finishPlayback = null;
    motion.cancel();
    $('game-room').inert = false;
    $('skip-finish').hidden = true;
    if (animateWin) celebrate(previous);
    else render(true);
  };
  finishPlayback = complete;
  const duration = Math.min(150,1600 / path.length);
  try {
    for (const {from,to} of path) {
      const source = board.querySelector(`.card[data-key="${from}"]:not(.waste-ghost .card)`);
      const target = board.querySelector(`[data-key="${to}"]`);
      await motion.flight(source,target,{duration});
      if (finishPlayback !== complete) return;
      if (!motion.enabled()) { complete(false); return; }
      if (!applyMove(display,from,to)) break;
      renderBoard(display);
    }
    complete(true);
  } catch {
    // The verified final state has already been saved.
    complete(false);
  }
}
function action(fn, {finishPlan, quiet} = {}) {
  if (finishPlayback) return false;
  const before = structuredClone(g);
  if (!fn()) {
    if (!quiet) {
      setWarning('That move is not available. Choose another card or destination.');
      render();
    }
    return false;
  }
  rememberStock(g,before);
  if (g.difficulty !== 'hard') { past.push(before); if (past.length > 100) past.shift(); }
  if (g.difficulty !== 'hard') hintPositions.add(hintVisitKey(g));
  future = []; selected = null; hint = null; hintFeedback = ''; announcement = '';
  if (g.mode === 'freecell') lastClick = {key:'',time:0};
  if (g.won) elapsed += Date.now() - resumedAt;
  updateClock(); save();
  if (g.won) {
    cancelDrag();
    const previous = motion.capture();
    if (finishPlan && motion.enabled()) void playFinish(structuredClone(before),finishPlan,previous);
    else celebrate(previous);
  } else render();
  return true;
}
function choose(key, automatic = false) {
  if (g.won) return;
  hintFeedback='';
  hint = null;
  announcement = '';
  const attempt = fn => action(fn,{quiet:true});
  if (key === 'stock') {
    if (attempt(() => applyMove(g,'stock','stock'))) return;
  } else if (g.mode === 'freecell' && selected && key !== selected && key?.startsWith('cell:')) {
    if (attempt(() => applyMove(g,selected,key))) return;
    lastClick = {key:'',time:0};
  } else if (automatic) {
    if (attempt(() => autoMove(g,key))) return;
  } else if (g.mode === 'pyramid' && legalMoves(g).some(m => m.from === key && m.to === key)) {
    if (attempt(() => applyMove(g,key,key))) return;
  } else if (key === selected) {
    selected = null;
  } else {
    if (selected && attempt(() => applyMove(g,selected,key))) return;
    if (legalMoves(g).some(m => m.from === key)) selected = key;
  }
  render();
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
  if (finishPlayback || g.difficulty === 'hard') return;
  const from = redo ? future : past, to = redo ? past : future;
  if (!from.length) return;
  celebrating = false;
  motion.cancel();
  hintFeedback='';
  elapsed = clock(); to.push(structuredClone(g)); g = from.pop(); selected = null; hint = null; announcement = tr(redo ? 'Move restored.' : 'Move undone.');
  hintPositions = new Set([...past,g].map(hintVisitKey));
  resumedAt = Date.now(); save(); render();
}
function fresh(mode = g.mode, difficulty = g.difficulty, restart = false, emptyRule = emptyColumns, animate = false) {
  if (finishPlayback) return false;
  if (g.moves && !g.won && !confirm(tr(restart ? 'Restart this deal? Your moves will be cleared.' : 'Start a new deal? Your current game will be replaced.'))) return false;
  celebrating = false;
  motion.cancel();
  cancelDrag();
  const previous = animate ? motion.capture() : null;
  g = restart ? structuredClone(initial) : deal(mode,difficulty,{emptyColumns:emptyRule});
  rememberStock(g);
  emptyColumns = g.mode === 'klondike' ? (g.emptyColumns ?? 'kings') : emptyRule;
  saveEmptyColumns(storage,emptyColumns);
  if (!restart) { art.resolved = resolveArt(art.choice); saveArt(storage, art); }
  initial = structuredClone(g); past = []; future = []; selected = null; hint = null; elapsed = 0; resumedAt = Date.now(); announcement = '';
  hintPositions = new Set([hintVisitKey(g)]);
  hintFeedback='';
  seenEndNotices.clear(); endgameUI?.reset();
  updateClock(); save(); render();
  if (previous) void motion.deal(previous).catch(()=>motion.cancel());
  return true;
}
const newDeal = () => fresh(g.mode,g.difficulty,false,emptyColumns,true);
function applyLanguage() {
  setDocumentLanguage?.(language);
  $('language').value = language;
  document.documentElement?.style.setProperty('--hint-move-label',JSON.stringify(tr('Move')));
  document.documentElement?.style.setProperty('--hint-here-label',JSON.stringify(tr('Here')));
}
$('language').onchange = e => {
  language = saveLanguage(storage,e.target.value);
  hint = null;
  hintFeedback = '';
  announcement = '';
  applyLanguage();
  render();
};
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
$('card-index-size').onchange = e => {
  indexSize = saveCardIndexSize(storage,e.target.value);
  document.documentElement?.style.setProperty('--card-index-scale',cardIndexScales[indexSize]);
  render();
};
$('new').onclick = newDeal;
$('skip-finish').onclick = () => finishPlayback?.(false);
$('restart').onclick = () => fresh(g.mode,g.difficulty,true);
$('undo').onclick = () => undo();
$('redo').onclick = () => undo(true);
$('hint').onclick = () => {
  if (g.difficulty === 'hard' || g.won) return;
  setWarning('');
  selected=null;
  announcement = '';
  const plan = g.mode === 'klondike' ? planKlondikeHint(g,g.stockMemory,{visited:hintPositions,maxTimeMs:35}) : null;
  hint = plan ? plan.move : selectHint(g,hintPositions);
  if (!hint) {
    hintFeedback = tr(legalMoves(g).length ? 'No useful continuation found. Try another approach or undo a move.' : 'No legal moves remain from this position.');
  } else if (hint.from === 'stock') {
    hintFeedback = tr(g.stock.length ? 'Draw from the stock.' : 'Recycle the waste into the stock.');
    if (plan?.reason === 'explore') hintFeedback += ' ' + tr('There are still unseen cards to check.');
    else if (plan?.goal === 'waste') {
      const count = plan.path.length - 1;
      hintFeedback += ' ' + tr(count === 1 ? 'A known waste card is playable after {count} stock action.' : 'A known waste card is playable after {count} stock actions.',{count});
    }
  } else {
    hintFeedback = describeCardHint(g,hint);
    if (plan?.path.length > 1 && plan.goal === 'reveal') hintFeedback += ' ' + tr('This sets up a move that uncovers a card.');
    if (plan?.path.length > 1 && plan.goal === 'foundation') hintFeedback += ' ' + tr('This opens a path to the foundation.');
    if (plan?.path.length > 1 && plan.goal === 'waste') hintFeedback += ' ' + tr('This opens a play from the waste.');
  }
  render();
  revealHintSource();
};
const dismissFeedback = $('hint-feedback-close');
dismissFeedback.onclick=()=>{hint=null;hintFeedback='';announcement='';setWarning('');render();};
dismissFeedback.addEventListener('focus',pauseWarning);
dismissFeedback.addEventListener('blur',resumeWarning);
$('rules').onclick = () => $('rules-dialog').showModal();
$('settings-open').onclick = () => $('settings-dialog').showModal();

function endDrag() {
  dragging = false;
  renderFeedback();
  renderMessage();
}
function cancelDrag() {
  cardDrag?.cancel();
  if (dragging) endDrag();
}
cardDrag = attachCardDrag(board, {
  getMoves: () => g.won ? [] : legalMoves(g),
  canLift: (from,targets) => {
    if (targets.size || g.mode !== 'freecell' || !from.startsWith('col:')) return true;
    const [,column,index]=from.split(':');
    return Number(index) === g.cols[column].length - 1;
  },
  onStart: () => {
    dragging = true;
    hintFeedback=''; announcement='';
    hint=null; selected=null; lastClick={key:'',time:0};
    board.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed','false');
    board.querySelectorAll('.hinted,.hint-source,.hint-destination,.selected').forEach(el=>el.classList.remove('hinted','hint-source','hint-destination','selected'));
    renderFeedback();
    renderMessage();
  },
  onDrop: (from,to) => {
    dragging = false;
    if (!to || !action(()=>applyMove(g,from,to),{quiet:true})) render();
  },
  onCancel: endDrag
});
document.addEventListener('keydown', e => {
  if (finishPlayback) {
    if (e.key === 'Escape') { e.preventDefault(); finishPlayback(false); }
    return;
  }
  if (!celebrating) motion.cancel();
  if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName) || document.querySelector('dialog[open]')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(e.shiftKey); }
  if (e.key === 'Escape') {
    if (fullscreen?.exitFallback()) { e.preventDefault(); return; }
    motion.cancel(); selected = null; announcement = ''; hintFeedback=''; setWarning(''); render();
  }
  if (e.key.toLowerCase() === 'a' && selected) { e.preventDefault(); choose(selected,true); }
});
document.addEventListener('pointerdown', () => {
  if (!finishPlayback && !celebrating) motion.cancel();
},true);
window.addEventListener('scroll', () => {
  if (finishPlayback) finishPlayback(false);
  else motion.cancel();
  placeFeedback();
},{passive:true});
function updateClock(){ const seconds=Math.floor(clock()/1000); $('time').textContent=`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`; }
endgameUI=attachEndgameUI({
  elements:Object.fromEntries(Object.entries({dialog:'end-dialog',actions:'end-actions',summary:'end-summary',finish:'finish-game',review:'end-review',close:'end-close',keep:'end-keep',undo:'end-undo',restart:'end-restart',newDeal:'end-new',title:'end-title',message:'end-message',stats:'end-stats'}).map(([key,id])=>[key,$(id)])),
  seen:seenEndNotices, onSeen:save, onUndo:()=>undo(),
  onRestart:()=>fresh(g.mode,g.difficulty,true), onNew:newDeal,
  onFinish:plan=>action(()=>{
    // Verify the complete sequence before touching the live game.
    const completed=structuredClone(g);
    for(const move of plan) if(!applyMove(completed,move.from,move.to)) return false;
    if(!completed.won) return false;
    g=completed; return true;
  },{finishPlan:plan})
});
for(const id of ['rules-dialog','settings-dialog']) $(id).addEventListener('close',()=>updateEndgame());
const fullscreen = document.documentElement ? attachFullscreen(document.documentElement,$('fullscreen'),() => {
  if (finishPlayback) finishPlayback(false);
  cancelDrag();
  motion.cancel();
  fitBoard();
  placeFeedback();
},tr) : null;
applyLanguage();
document.documentElement?.style.setProperty('--card-index-scale',cardIndexScales[indexSize]);
setInterval(updateClock,1000); updateClock(); render();
