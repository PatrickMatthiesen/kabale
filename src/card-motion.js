const CARD_SELECTOR = '.card';
const MAX_CELEBRATION_CARDS = 24;

function cleanClone(card) {
  const clone = card.cloneNode(true);
  clone.removeAttribute('id');
  clone.removeAttribute('data-key');
  clone.removeAttribute('data-motion-key');
  clone.removeAttribute('aria-label');
  clone.removeAttribute('aria-pressed');
  clone.classList.remove('selected','hinted','hint-source','hint-destination','drag-source','drop-target','drop-hover');
  clone.setAttribute('aria-hidden', 'true');
  clone.inert = true;
  if ('disabled' in clone) clone.disabled = true;
  clone.style.setProperty('top', '0', 'important');
  clone.style.setProperty('left', '0', 'important');
  clone.style.setProperty('right', 'auto', 'important');
  clone.style.setProperty('bottom', 'auto', 'important');
  clone.style.setProperty('width', '100%', 'important');
  clone.style.setProperty('height', '100%', 'important');
  clone.style.setProperty('transform', 'none', 'important');
  clone.style.setProperty('transition', 'none', 'important');
  clone.style.setProperty('opacity', '1', 'important');
  clone.style.setProperty('pointer-events', 'none', 'important');
  return clone;
}

function visibleCards(board) {
  return [...board.querySelectorAll(CARD_SELECTOR)].filter(card => {
    if (card.closest('[aria-hidden="true"], .waste-ghost')) return false;
    const rect = card.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

function snapshotCards(board, { limit = Infinity } = {}) {
  const cards = visibleCards(board);
  const stride = cards.length > limit ? cards.length / limit : 1;
  const selected = cards.length > limit
    ? Array.from({ length: limit }, (_, index) => cards[Math.floor(index * stride)])
    : cards;
  return selected.map(card => ({ node: cleanClone(card), ...geometry(card) }));
}

function geometry(element) {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height, centerX: left + width / 2, centerY: top + height / 2 };
}

function intersects(rect, bounds) {
  return rect && rect.width > 0 && rect.height > 0 &&
    rect.left < bounds.left + bounds.width && rect.left + rect.width > bounds.left &&
    rect.top < bounds.top + bounds.height && rect.top + rect.height > bounds.top;
}

function transferTargets(board) {
  const targets = new Map();
  for (const element of board.querySelectorAll('[data-key], .run-counter')) {
    if (element.closest('[aria-hidden="true"], .waste-ghost')) continue;
    const key = element.dataset.key ?? 'runs';
    const card = element.matches('.card[data-key]');
    if (card || !targets.has(key)) targets.set(key, { element, card });
  }
  for (const element of board.querySelectorAll('.waste-ghost .card[data-motion-key]:disabled')) {
    const key = element.dataset.motionKey;
    if (!targets.has(key)) targets.set(key, { element, card: true });
  }
  return targets;
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Creates short, decorative card animations that never participate in play.
 * Call cancel() before changing the board for any action other than a deal.
 */
export function createCardMotion(board, { isEnabled = () => true } = {}) {
  if (!board) throw new TypeError('createCardMotion requires the game board element');

  const doc = board.ownerDocument;
  const view = doc?.defaultView;
  const reduceMotion = view?.matchMedia?.('(prefers-reduced-motion: reduce)');
  let overlay = null;
  let job = null;
  let lastCelebration = -1;
  const hidden = new Map();

  const enabled = () => isEnabled() && !reduceMotion?.matches && typeof board.animate === 'function';

  function hideCard(element) {
    if (hidden.has(element)) return;
    hidden.set(element, {
      opacity: element.style.opacity,
      priority: element.style.getPropertyPriority('opacity'),
    });
    element.style.opacity = '0';
  }

  function restoreCard(element) {
    if (!hidden.has(element)) return;
    const { opacity, priority } = hidden.get(element);
    element.style.setProperty('opacity', opacity, priority);
    hidden.delete(element);
  }

  function restoreCards() {
    for (const element of hidden.keys()) restoreCard(element);
  }

  function removeOverlay() {
    overlay?.remove();
    overlay = null;
    restoreCards();
  }

  function cancel() {
    const current = job;
    if (current) {
      for (const animation of current.animations) animation.cancel();
      current.finish();
    } else {
      removeOverlay();
    }
  }

  function cancelTransfer() {
    if (job?.transfer) cancel();
  }

  function capture() {
    if (!enabled()) return null;
    return { cards: snapshotCards(board) };
  }

  function makeOverlay(bounds) {
    const element = doc.createElement('div');
    element.className = 'card-motion-overlay';
    element.setAttribute('aria-hidden', 'true');
    element.inert = true;
    if (bounds) {
      Object.assign(element.style, {
        inset: 'auto',
        left: `${bounds.left}px`,
        top: `${bounds.top}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
      });
    }
    (doc.body || doc.documentElement).append(element);
    overlay = element;
    return element;
  }

  function addCard(layer, { node, left, top, width, height }, bounds) {
    const wrapper = doc.createElement('div');
    wrapper.className = 'card-motion-item';
    wrapper.style.left = `${left - (bounds?.left ?? 0)}px`;
    wrapper.style.top = `${top - (bounds?.top ?? 0)}px`;
    wrapper.style.width = `${width}px`;
    wrapper.style.height = `${height}px`;
    wrapper.style.setProperty('--card-w', `${width}px`);
    wrapper.append(node.cloneNode(true));
    layer.append(wrapper);
    return wrapper;
  }

  function addCards(layer, records) {
    return records.map(record => ({ wrapper: addCard(layer, record), ...record }));
  }

  function hideCurrentCards() {
    for (const element of visibleCards(board)) hideCard(element);
  }

  function run(animations, transfer = false) {
    if (!animations.length) {
      removeOverlay();
      return Promise.resolve();
    }
    return new Promise(resolve => {
      let settled = false;
      const current = {
        animations,
        transfer,
        finish: () => {
          if (settled) return;
          settled = true;
          if (job === current) {
            job = null;
            removeOverlay();
          }
          resolve();
        },
      };
      job = current;
      Promise.all(animations.map(animation => animation.finished.catch(() => undefined)))
        .then(current.finish);
    });
  }

  function animate(wrapper, frames, options) {
    try {
      return wrapper.animate(frames, { fill: 'both', ...options });
    } catch {
      return null;
    }
  }

  function transferBounds() {
    const { left, top } = board.getBoundingClientRect();
    const x = left + board.clientLeft;
    const y = top + board.clientTop;
    const right = Math.min(x + board.clientWidth, view?.innerWidth ?? Infinity);
    const bottom = Math.min(y + board.clientHeight, view?.innerHeight ?? Infinity);
    return {
      left: Math.max(0, x),
      top: Math.max(0, y),
      width: Math.max(0, right - Math.max(0, x)),
      height: Math.max(0, bottom - Math.max(0, y)),
    };
  }

  // Snapshot the old DOM before the next render replaces it.
  function captureTransfers(transfers) {
    cancelTransfer();
    if (!enabled() || !transfers?.length) return [];
    const targets = transferTargets(board);
    const bounds = transferBounds();
    const sources = new Map();
    return transfers.map(({ from, to, arrives, fromAnchor }) => {
      if (!sources.has(from)) {
        const target = targets.get(from);
        const rect = target && geometry(target.element);
        sources.set(from, rect?.width > 0 && rect.height > 0 ? {
          ...rect,
          visible: intersects(rect, bounds),
          node: target.card ? cleanClone(target.element) : null,
        } : null);
      }
      const source = sources.get(from);
      return { source: fromAnchor && source ? { ...source, node: null } : source, to, arrives };
    });
  }

  function move(records, { duration } = {}) {
    cancelTransfer();
    if (job || !enabled() || !records?.length) return Promise.resolve();

    const targets = transferTargets(board);
    const bounds = transferBounds();
    if (!bounds.width || !bounds.height) return Promise.resolve();
    const prepared = [];
    const arrivals = new Set();
    for (const { source, to, arrives } of records) {
      const target = targets.get(to);
      const end = target && geometry(target.element);
      const destination = arrives && target?.card ? target.element : null;
      const visibleEnd = intersects(end, bounds);
      const origin = source?.visible ? source : null;
      if (!origin && !(destination && visibleEnd)) continue;
      if (destination && arrivals.has(destination)) continue;

      const start = origin?.node ? origin : end;
      const node = source?.node ?? (destination && cleanClone(destination));
      if (!node || !start) continue;
      if (destination) arrivals.add(destination);

      // A placeholder or run counter supplies a position but no card image.
      const frame = (rect, scaleX, scaleY = scaleX) =>
        `translate3d(${rect.centerX - start.centerX}px,${rect.centerY - start.centerY}px,0) scale(${scaleX},${scaleY})`;
      const first = { transform: frame(origin ?? start, origin?.node ? 1 : .78), opacity: origin ? 1 : 0 };
      const last = end?.width && end.height ? {
        transform: destination
          ? frame(end, end.width / start.width, end.height / start.height)
          : frame(end, .65),
        opacity: destination ? 1 : 0,
      } : { transform: 'translate3d(0,-12px,0) scale(.92)', opacity: 0 };
      prepared.push({ start, node, destination: visibleEnd ? destination : null, frames: [first, last], duration: origin && visibleEnd ? 190 : 150 });
    }
    if (!prepared.length) return Promise.resolve();

    const layer = makeOverlay(bounds);
    const animations = [];
    prepared.forEach(({ start, node, destination, frames, duration: defaultDuration }, index) => {
      const wrapper = addCard(layer, { ...start, node }, bounds);
      const delay = Math.min(index * 9, 40, duration === undefined ? Infinity : duration / 4);
      const animation = animate(wrapper, frames, {
        duration: duration === undefined ? defaultDuration : duration - delay,
        delay,
        easing: 'cubic-bezier(.2,.72,.22,1)',
      });
      if (!animation) {
        wrapper.remove();
        return;
      }
      if (destination) hideCard(destination);
      animations.push(animation);
      const cleanup = () => {
        if (overlay !== layer) return;
        wrapper.remove();
        if (destination) restoreCard(destination);
      };
      // Release the real card on landing while the rest of the batch continues.
      animation.finished.then(cleanup, cleanup);
    });
    return run(animations, true);
  }

  function deal(previous) {
    cancel();
    if (!enabled()) return Promise.resolve();
    const oldCards = previous?.cards || [];
    const newCards = snapshotCards(board);
    if (!oldCards.length && !newCards.length) return Promise.resolve();

    const layer = makeOverlay();
    hideCurrentCards();
    const outgoing = addCards(layer, oldCards);
    const incoming = addCards(layer, newCards);
    const animations = [];

    outgoing.forEach(({ wrapper }, index) => {
      const side = index % 2 ? 1 : -1;
      const animation = animate(wrapper, [
        { transform: 'translate3d(0,0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate3d(${side * random(45, 150)}px,${random(150, 380)}px,0) rotate(${side * random(18, 48)}deg)`, opacity: 0 },
      ], { duration: random(235, 300), delay: random(0, 55), easing: 'cubic-bezier(.4,0,1,1)' });
      if (animation) animations.push(animation);
    });

    const bounds = board.getBoundingClientRect();
    const originX = bounds.left + bounds.width / 2;
    const originY = bounds.top - random(25, 85);
    incoming.forEach(({ wrapper, centerX, centerY }, index) => {
      const side = index % 2 ? 1 : -1;
      const dx = originX - centerX;
      const dy = originY - centerY;
      const spread = side * random(6, 26);
      const animation = animate(wrapper, [
        { transform: `translate3d(${dx}px,${dy}px,0) rotate(${side * random(15, 42)}deg) scale(.72)`, opacity: 0 },
        { transform: `translate3d(${dx * .38 + spread}px,${dy * .38}px,0) rotate(${side * 9}deg) scale(.94)`, opacity: 1, offset: .7 },
        { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)', opacity: 1 },
      ], { duration: random(250, 350), delay: 360 + index * random(2, 4), easing: 'cubic-bezier(.16,.72,.2,1)' });
      if (animation) animations.push(animation);
    });
    return run(animations);
  }

  function nextCelebration() {
    const choices = [0, 1, 2].filter(value => value !== lastCelebration);
    lastCelebration = choices[Math.floor(Math.random() * choices.length)];
    return lastCelebration;
  }

  function win(previous) {
    cancel();
    if (!enabled()) return Promise.resolve();
    const boardCards = snapshotCards(board, { limit: MAX_CELEBRATION_CARDS });
    const previousCards = previous?.cards || [];
    const faceUp = records => records.filter(record => record.node.classList.contains('illustrated'));
    const currentFaces = faceUp(boardCards);
    const launchFaces = currentFaces.length ? currentFaces : faceUp(previousCards);
    const available = launchFaces.length ? launchFaces : (boardCards.length ? boardCards : previousCards);
    if (!available.length) return Promise.resolve();

    const cardCount = Math.min(MAX_CELEBRATION_CARDS, Math.max(18, available.length));
    const records = Array.from({ length: cardCount }, (_, index) => {
      const source = available[index % available.length];
      const spread = index < available.length ? 0 : random(-30, 30);
      const lift = index < available.length ? 0 : random(-16, 18);
      return {
        ...source,
        left: source.left + spread,
        top: source.top + lift,
        centerX: source.centerX + spread,
        centerY: source.centerY + lift,
      };
    });

    const layer = makeOverlay();
    hideCurrentCards();
    const cards = addCards(layer, records);
    const style = nextCelebration();
    layer.dataset.celebration = ['burst','spiral','cascade'][style];
    const animations = [];
    const bounds = board.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height * .42;

    cards.forEach(({ wrapper, centerX: cardX, centerY: cardY }, index) => {
      const side = index % 2 ? 1 : -1;
      let frames;
      let options;
      if (style === 0) {
        const dx = random(-Math.max(150, bounds.width * .48), Math.max(150, bounds.width * .48));
        const dy = -random(Math.max(180, bounds.height * .35), Math.max(260, bounds.height * .7));
        frames = [
          { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)', opacity: 1 },
          { transform: `translate3d(${dx * .2}px,${dy * .82}px,0) rotate(${side * random(18, 65)}deg) scale(1.18)`, opacity: 1, offset: .56 },
          { transform: `translate3d(${dx}px,${dy}px,0) rotate(${side * random(60, 150)}deg) scale(.7)`, opacity: 0 },
        ];
        options = { duration: random(760, 980), delay: index * 13, easing: 'cubic-bezier(.2,.7,.25,1)' };
      } else if (style === 1) {
        const dx = centerX - cardX + random(-45, 45);
        const dy = centerY - cardY + random(-45, 45);
        frames = [
          { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)', opacity: 1 },
          { transform: `translate3d(${dx * .22}px,${dy * .22 - 90}px,0) rotate(${side * 160}deg) scale(1.22)`, opacity: 1, offset: .28 },
          { transform: `translate3d(${dx * .62}px,${dy * .62}px,0) rotate(${side * 300}deg) scale(.82)`, opacity: 1, offset: .72 },
          { transform: `translate3d(${dx}px,${dy}px,0) rotate(${side * 520}deg) scale(.08)`, opacity: 0 },
        ];
        options = { duration: random(880, 1080), delay: index * 8, easing: 'cubic-bezier(.2,.6,.25,1)' };
      } else {
        const fall = random(250, 580);
        frames = [
          { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)', opacity: 1 },
          { transform: `translate3d(${side * random(30, 100)}px,-${random(170, 290)}px,0) rotate(${side * random(15, 40)}deg) scale(1.12)`, opacity: 1, offset: .3 },
          { transform: `translate3d(${side * random(18, 160)}px,${fall * .4}px,0) rotate(${side * random(45, 120)}deg) scale(1)`, opacity: 1, offset: .72 },
          { transform: `translate3d(${side * random(40, 220)}px,${fall}px,0) rotate(${side * random(100, 220)}deg) scale(.76)`, opacity: 0 },
        ];
        options = { duration: random(840, 1040), delay: index * 11, easing: 'cubic-bezier(.45,0,.9,.5)' };
      }
      const animation = animate(wrapper, frames, options);
      if (animation) animations.push(animation);
    });
    return run(animations);
  }

  function flight(fromElement, toElement, { duration = 120 } = {}) {
    cancel();
    if (!enabled() || !fromElement?.isConnected || !toElement?.isConnected) return Promise.resolve();
    const sourceRect = fromElement.getBoundingClientRect();
    const targetRect = toElement.getBoundingClientRect();
    if (!sourceRect.width || !sourceRect.height || !targetRect.width || !targetRect.height) return Promise.resolve();
    const layer = makeOverlay();
    const wrapper = doc.createElement('div');
    wrapper.className = 'card-motion-item';
    wrapper.style.left = `${sourceRect.left}px`;
    wrapper.style.top = `${sourceRect.top}px`;
    wrapper.style.width = `${sourceRect.width}px`;
    wrapper.style.height = `${sourceRect.height}px`;
    wrapper.style.setProperty('--card-w',`${sourceRect.width}px`);
    wrapper.append(cleanClone(fromElement));
    layer.append(wrapper);
    hideCard(fromElement);
    const dx = targetRect.left + targetRect.width / 2 - sourceRect.left - sourceRect.width / 2;
    const dy = targetRect.top + targetRect.height / 2 - sourceRect.top - sourceRect.height / 2;
    const scaleX = targetRect.width / sourceRect.width;
    const scaleY = targetRect.height / sourceRect.height;
    const animation = animate(wrapper, [
      { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
      { transform: `translate3d(${dx}px,${dy}px,0) scale(${scaleX},${scaleY})`, opacity: .9 },
    ], { duration, easing: 'cubic-bezier(.2,.72,.22,1)' });
    return run(animation ? [animation] : []);
  }

  const onMotionPreferenceChange = () => {
    if (!enabled()) cancel();
  };
  reduceMotion?.addEventListener?.('change', onMotionPreferenceChange);

  return {
    enabled,
    capture,
    captureTransfers,
    move,
    cancelTransfer,
    deal,
    win,
    cancel,
    flight,
    destroy() {
      cancel();
      reduceMotion?.removeEventListener?.('change', onMotionPreferenceChange);
    },
  };
}
