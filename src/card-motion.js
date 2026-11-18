const CARD_SELECTOR = '.card';
const MAX_CELEBRATION_CARDS = 24;

function cleanClone(card) {
  const clone = card.cloneNode(true);
  clone.removeAttribute('id');
  clone.removeAttribute('data-key');
  clone.removeAttribute('aria-label');
  clone.removeAttribute('aria-pressed');
  clone.classList.remove('selected','hinted','hint-source','hint-destination','drag-source');
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
  return selected.map(card => {
    const rect = card.getBoundingClientRect();
    return {
      node: cleanClone(card),
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    };
  });
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Creates short, decorative card animations that never participate in play.
 * Call cancel() before changing the board for any action other than a deal.
 */
export function createCardMotion(board) {
  if (!board) throw new TypeError('createCardMotion requires the game board element');

  const doc = board.ownerDocument;
  const view = doc?.defaultView;
  const reduceMotion = view?.matchMedia?.('(prefers-reduced-motion: reduce)');
  let overlay = null;
  let job = null;
  let lastCelebration = -1;
  let hidden = [];

  const enabled = () => !reduceMotion?.matches && typeof board.animate === 'function';

  function restoreCards() {
    for (const { element, opacity } of hidden) {
      if (element.isConnected) element.style.opacity = opacity;
    }
    hidden = [];
  }

  function removeOverlay() {
    overlay?.remove();
    overlay = null;
    restoreCards();
  }

  function cancel() {
    const current = job;
    job = null;
    if (current) {
      for (const animation of current.animations) animation.cancel();
      current.finish();
    }
    removeOverlay();
  }

  function capture() {
    if (!enabled()) return null;
    return { cards: snapshotCards(board) };
  }

  function makeOverlay() {
    const element = doc.createElement('div');
    element.className = 'card-motion-overlay';
    element.setAttribute('aria-hidden', 'true');
    element.inert = true;
    (doc.body || doc.documentElement).append(element);
    overlay = element;
    return element;
  }

  function addCards(overlayElement, records) {
    return records.map(record => {
      const wrapper = doc.createElement('div');
      wrapper.className = 'card-motion-item';
      wrapper.style.left = `${record.left}px`;
      wrapper.style.top = `${record.top}px`;
      wrapper.style.width = `${record.width}px`;
      wrapper.style.height = `${record.height}px`;
      wrapper.style.setProperty('--card-w',`${record.width}px`);
      wrapper.append(record.node.cloneNode(true));
      overlayElement.append(wrapper);
      return { wrapper, ...record };
    });
  }

  function hideCurrentCards() {
    hidden = visibleCards(board).map(element => ({ element, opacity: element.style.opacity }));
    for (const { element } of hidden) element.style.opacity = '0';
  }

  function run(animations) {
    if (!animations.length) {
      removeOverlay();
      return Promise.resolve();
    }
    return new Promise(resolve => {
      let settled = false;
      const current = {
        animations,
        finish: () => {
          if (settled) return;
          settled = true;
          if (job === current) job = null;
          removeOverlay();
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
    hidden = [{element:fromElement,opacity:fromElement.style.opacity}];
    fromElement.style.opacity = '0';
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
