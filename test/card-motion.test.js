import assert from 'node:assert/strict';
import test from 'node:test';
import { createCardMotion } from '../src/card-motion.js';

function harness({ supported = true, isEnabled } = {}) {
  const animations = [];
  const listeners = new Set();
  const media = {
    matches: false,
    addEventListener(type, callback) { if (type === 'change') listeners.add(callback); },
    removeEventListener(type, callback) { if (type === 'change') listeners.delete(callback); },
  };
  const matchMedia = query => {
    assert.equal(query, '(prefers-reduced-motion: reduce)');
    return media;
  };
  const document = { defaultView: { innerWidth: 400, innerHeight: 300, matchMedia } };

  function element(className = '', key, textContent = '', rect = {}) {
    const classes = new Set(className.split(' ').filter(Boolean));
    const attributes = new Map();
    const priorities = new Map();
    const style = {
      opacity: '',
      setProperty(name, value, priority = '') {
        this[name] = value;
        priorities.set(name, priority);
      },
      getPropertyPriority(name) { return priorities.get(name) ?? ''; },
    };
    const el = {
      ownerDocument: document,
      textContent,
      rect: { left: 30, top: 50, width: 60, height: 90, ...rect },
      style,
      dataset: key === undefined ? {} : { key },
      children: [],
      parentElement: null,
      get isConnected() { return this === document.body || !!this.parentElement?.isConnected; },
      get className() { return [...classes].join(' '); },
      set className(value) {
        classes.clear();
        value.split(' ').forEach(name => classes.add(name));
      },
      classList: {
        contains: name => classes.has(name),
        remove: (...names) => names.forEach(name => classes.delete(name)),
      },
      getAttribute(name) { return attributes.get(name); },
      setAttribute(name, value) {
        if (name === 'data-motion-key') this.dataset.motionKey = value;
        attributes.set(name, value);
      },
      removeAttribute(name) {
        if (name === 'data-key') delete this.dataset.key;
        if (name === 'data-motion-key') delete this.dataset.motionKey;
        attributes.delete(name);
      },
      getBoundingClientRect() {
        assert.ok(this.isConnected, 'Geometry must come from the live board');
        return this.rect;
      },
      matches(selector) {
        return selector.split(', ').some(value => {
          if (value === '[data-key]') return this.dataset.key !== undefined;
          if (value === '[aria-hidden="true"]') return this.getAttribute('aria-hidden') === 'true';
          if (value === '.card[data-key]') return classes.has('card') && this.dataset.key !== undefined;
          if (value === '.waste-ghost .card[data-motion-key]:disabled') {
            return classes.has('card') && this.dataset.motionKey !== undefined &&
              attributes.has('disabled') && !!this.parentElement?.closest('.waste-ghost');
          }
          return classes.has(value.slice(1));
        });
      },
      closest(selector) {
        return this.matches(selector) ? this : this.parentElement?.closest(selector);
      },
      querySelectorAll(selector) {
        return this.children.flatMap(child => [
          ...(child.matches(selector) ? [child] : []),
          ...child.querySelectorAll(selector),
        ]);
      },
      append(child) {
        this.children.push(child);
        child.parentElement = this;
      },
      remove() {
        const parent = this.parentElement;
        if (!parent) return;
        parent.children.splice(parent.children.indexOf(this), 1);
        this.parentElement = null;
      },
      replaceChildren(...children) {
        for (const child of [...this.children]) child.remove();
        for (const child of children) this.append(child);
      },
      cloneNode(deep) {
        const clone = element(this.className, this.dataset.key, this.textContent, this.rect);
        for (const [name, value] of attributes) clone.setAttribute(name, value);
        clone.inert = this.inert;
        Object.assign(clone.style, this.style);
        if (deep) for (const child of this.children) clone.append(child.cloneNode(true));
        return clone;
      },
    };
    if (supported) el.animate = (frames, options) => {
      let finish, reject;
      const finished = new Promise((resolve, fail) => { finish = resolve; reject = fail; });
      const animation = { el, frames, options, finished, finish, cancel: () => reject(new Error('cancelled')) };
      animations.push(animation);
      return animation;
    };
    return el;
  }

  document.body = element();
  document.createElement = () => element();
  const board = element('', undefined, '', { left: 10, top: 20, width: 320, height: 240 });
  Object.assign(board, { clientLeft: 1, clientTop: 1, clientWidth: 300, clientHeight: 220 });
  document.body.append(board);
  const motion = createCardMotion(board, { isEnabled });
  return {
    board, motion, animations, element, listeners,
    overlay: () => document.body.children[1],
    reduceMotion(matches) {
      media.matches = matches;
      for (const callback of listeners) callback();
    },
  };
}

test('a transfer snapshots the visible source before render and hides the matching arrival', async () => {
  const { board, motion, animations, element, overlay } = harness();
  const pile = element('pile', 'waste');
  const source = element('card illustrated selected drag-source', 'waste', 'Queen of hearts');
  source.setAttribute('aria-label', source.textContent);
  pile.append(source);
  const ghost = element('waste-ghost');
  ghost.append(element('card', 'waste', 'Waste ghost'));
  pile.append(ghost);
  const hidden = element('card', 'waste', 'Hidden card');
  hidden.setAttribute('aria-hidden', 'true');
  pile.append(hidden);
  board.append(pile);

  const records = motion.captureTransfers([{ from: 'waste', to: 'found:0', arrives: true }]);
  const arrival = element('card illustrated', 'found:0', 'Queen of hearts', { left: 150, top: 60, width: 48, height: 72 });
  arrival.style.setProperty('opacity', '.7', 'important');
  board.replaceChildren(arrival);
  source.textContent = 'Changed after capture';
  source.rect.left = 999;
  const moving = motion.move(records);

  const [animation] = animations;
  const [clone] = animation.el.children;
  assert.equal(clone.textContent, 'Queen of hearts');
  assert.equal(clone.dataset.key, undefined);
  assert.equal(clone.getAttribute('aria-label'), undefined);
  assert.equal(clone.getAttribute('aria-hidden'), 'true');
  assert.equal(clone.classList.contains('selected'), false);
  assert.equal(clone.style['pointer-events'], 'none');
  assert.equal(overlay().inert, true);
  assert.equal(overlay().style.width, '300px');
  assert.equal(animation.el.style.left, '19px');
  assert.equal(animation.el.style.top, '29px');
  assert.equal(animation.frames[1].transform, 'translate3d(114px,1px,0) scale(0.8,0.8)');
  assert.equal(arrival.style.opacity, '0');
  animation.finish();
  await moving;
  assert.equal(overlay(), undefined);
  assert.equal(arrival.style.opacity, '.7');
  assert.equal(arrival.style.getPropertyPriority('opacity'), 'important');
});

test('draw and undo animate the two inert ghost cards and the waste top', async () => {
  const { board, motion, animations, element } = harness();
  const stock = element('card back', 'stock', 'Back');
  const keys = ['waste:layer:0', 'waste:layer:1', 'waste'];
  board.append(stock);
  const draw = motion.captureTransfers(keys.map(to => ({ from: 'stock', to, arrives: true })));

  const pile = element('pile', 'waste');
  const cards = keys.map((key, i) => {
    const top = key === 'waste';
    const card = element('card illustrated', top ? key : undefined, `Card ${i}`, { left: 100 + i * 3 });
    if (top) {
      pile.append(card);
    } else {
      const layer = element('waste-ghost');
      layer.setAttribute('aria-hidden', 'true');
      layer.inert = true;
      card.setAttribute('data-motion-key', key);
      card.setAttribute('disabled', '');
      layer.append(card);
      pile.append(layer);
    }
    return card;
  });
  const other = element('card', undefined, 'Unrelated hidden card');
  other.setAttribute('data-motion-key', keys[0]);
  other.setAttribute('aria-hidden', 'true');
  other.setAttribute('disabled', '');
  board.replaceChildren(pile, other);

  const drawing = motion.move(draw);
  assert.deepEqual(animations.map(animation => animation.el.children[0].textContent), ['Back', 'Back', 'Back']);
  assert.deepEqual(cards.map(card => card.style.opacity), ['0', '0', '0']);
  assert.equal(other.style.opacity, '');
  for (const animation of animations) animation.finish();
  await drawing;
  assert.deepEqual(cards.map(card => card.style.opacity), ['', '', '']);
  assert.deepEqual(motion.capture().cards.map(({ node }) => node.textContent), ['Card 2']);

  const undo = motion.captureTransfers(keys.toReversed().map(from => ({ from, to: 'stock', arrives: false })));
  board.replaceChildren(stock);
  const undoing = motion.move(undo);
  const returning = animations.slice(3);
  assert.deepEqual(returning.map(animation => animation.el.children[0].textContent), ['Card 2', 'Card 1', 'Card 0']);
  for (const animation of returning) {
    const [clone] = animation.el.children;
    assert.deepEqual(clone.dataset, {});
    assert.equal(clone.getAttribute('aria-hidden'), 'true');
    assert.equal(clone.inert, true);
    animation.finish();
  }
  await undoing;
  assert.equal(stock.style.opacity, '');
});

test('moves use the old stock back and the new face only for an arrival without an old card', async () => {
  const { board, motion, animations, element } = harness();
  board.append(element('card back', 'stock', 'Back'));
  const runs = element('run-counter', undefined, '1 of 8', { left: 200, top: 50, width: 40, height: 24 });
  board.append(runs);
  const records = motion.captureTransfers([
    { from: 'stock', to: 'waste', arrives: true },
    { from: 'runs', to: 'col:0:0', arrives: true },
    { from: null, to: 'p:6:0', arrives: true },
  ]);
  const waste = element('card', 'waste', 'Ace of clubs');
  const returned = element('card', 'col:0:0', 'Five of spades', { left: 120, top: 140 });
  const pyramid = element('card', 'p:6:0', 'King of diamonds');
  board.replaceChildren(waste, returned, pyramid);
  const moving = motion.move(records);

  assert.deepEqual(animations.map(animation => animation.el.children[0].textContent), [
    'Back', 'Five of spades', 'King of diamonds',
  ]);
  assert.equal(animations[1].frames[0].transform, 'translate3d(70px,-123px,0) scale(0.78,0.78)');
  assert.equal(animations[2].frames[0].opacity, 0);
  assert.ok(animations[2].options.delay > animations[1].options.delay);
  animations[0].finish();
  await Promise.resolve();
  assert.equal(waste.style.opacity, '');
  assert.equal(returned.style.opacity, '0');
  assert.equal(pyramid.style.opacity, '0');
  for (const animation of animations.slice(1)) animation.finish();
  await moving;
  assert.equal(returned.style.opacity, '');
  assert.equal(pyramid.style.opacity, '');
});

test('undo uses the foundation as a starting point without copying the face of its top card', async () => {
  const { board, motion, animations, element } = harness();
  board.append(element('card', 'found:0', 'Two of spades', { left: 200, top: 50 }));
  const records = motion.captureTransfers([
    { from: 'found:0', to: 'col:0:0', arrives: true, fromAnchor: true },
    { from: 'found:0', to: 'col:0:1', arrives: true },
  ]);
  board.replaceChildren(
    element('card', 'col:0:0', 'Ace of spades', { left: 100, top: 140 }),
    element('card', 'col:0:1', 'Two of spades', { left: 100, top: 160 }),
  );
  const moving = motion.move(records);
  assert.deepEqual(animations.map(animation => animation.el.children[0].textContent), ['Ace of spades', 'Two of spades']);
  assert.equal(animations[0].frames[0].transform, 'translate3d(100px,-90px,0) scale(0.78,0.78)');
  for (const animation of animations) animation.finish();
  await moving;
});

test('removals fade out and stock receives a card without hiding its current contents', async () => {
  const { board, motion, animations, element } = harness();
  board.append(element('card', 'p:6:0', 'King'));
  board.append(element('card', 'pw', 'Ten', { left: 140 }));
  const records = motion.captureTransfers([
    { from: 'p:6:0', to: null, arrives: false },
    { from: 'pw', to: 'stock', arrives: false },
  ]);
  const stock = element('card back', 'stock', 'Back', { left: 200 });
  board.replaceChildren(stock);
  const moving = motion.move(records);

  assert.equal(stock.style.opacity, '');
  assert.equal(animations[0].frames[1].transform, 'translate3d(0,-12px,0) scale(.92)');
  assert.equal(animations[0].frames[1].opacity, 0);
  assert.equal(animations[1].frames[1].transform, 'translate3d(60px,0px,0) scale(0.65,0.65)');
  for (const animation of animations) animation.finish();
  await moving;
});

test('a keyed stock placeholder supplies an origin, but an off-board card does not', async () => {
  const { board, motion, animations, element, overlay } = harness();
  const stock = element('pile', 'stock');
  stock.append(element('placeholder', 'stock', 'Redeal'));
  board.append(stock);
  board.append(element('card', 'col:0:0', 'Clipped', { left: 350 }));
  board.append(element('card', 'col:1:0', 'Clipped too', { left: 350 }));
  const records = motion.captureTransfers([
    { from: 'stock', to: 'waste', arrives: true },
    { from: 'col:0:0', to: 'col:2:0', arrives: true },
    { from: 'col:1:0', to: 'col:3:0', arrives: true },
  ]);
  const visible = element('card', 'waste', 'New face', { left: 100 });
  const enters = element('card', 'col:2:0', 'Clipped', { left: 200 });
  const clipped = element('card', 'col:3:0', 'Clipped too', { left: 320 });
  board.replaceChildren(visible, enters, clipped);
  const moving = motion.move(records);

  assert.equal(animations.length, 2);
  assert.equal(animations[0].el.children[0].textContent, 'New face');
  assert.equal(animations[0].frames[0].transform, 'translate3d(-70px,0px,0) scale(0.78,0.78)');
  assert.equal(animations[1].frames[0].opacity, 0);
  assert.equal(overlay().style.width, '300px');
  assert.equal(clipped.style.opacity, '');
  for (const animation of animations) animation.finish();
  await moving;
});

test('preference and WAAPI support gate capture and reduced motion cancels active animation', async () => {
  let preference = false;
  const { board, motion, animations, element, overlay, listeners, reduceMotion } = harness({
    isEnabled: () => preference,
  });
  const transfers = [{ from: null, to: 'p:6:0', arrives: true }];
  assert.equal(motion.enabled(), false);
  assert.deepEqual(motion.captureTransfers(transfers), []);
  preference = true;
  assert.equal(motion.enabled(), true);
  const records = motion.captureTransfers(transfers);
  const arrival = element('card', 'p:6:0');
  board.append(arrival);
  preference = false;
  await motion.move(records);
  assert.equal(animations.length, 0);
  assert.equal(arrival.style.opacity, '');

  preference = true;
  const moving = motion.move(records);
  assert.equal(arrival.style.opacity, '0');
  reduceMotion(true);
  await moving;
  assert.equal(arrival.style.opacity, '');
  assert.equal(overlay(), undefined);
  assert.deepEqual(motion.captureTransfers(transfers), []);
  motion.destroy();
  assert.equal(listeners.size, 0);

  const unsupported = harness({ supported: false });
  assert.equal(unsupported.motion.enabled(), false);
  assert.deepEqual(unsupported.motion.captureTransfers(transfers), []);
});

test('replacement and transfer-only cancellation restore cards without cancelling finish flights', async () => {
  const { board, motion, element, overlay, animations } = harness();
  const records = motion.captureTransfers([{ from: null, to: 'p:6:0', arrives: true }]);
  const first = element('card', 'p:6:0');
  board.append(first);
  const one = motion.move(records);
  const second = element('card', 'p:6:0');
  board.replaceChildren(second);
  const two = motion.move(records);
  const secondOverlay = overlay();
  await one;
  assert.equal(first.style.opacity, '');
  assert.equal(second.style.opacity, '0');
  assert.equal(overlay(), secondOverlay);

  motion.cancelTransfer();
  await two;
  assert.equal(second.style.opacity, '');
  assert.equal(overlay(), undefined);

  const target = element('pile', 'found:0');
  board.append(target);
  const flight = motion.flight(second, target);
  const flightOverlay = overlay();
  motion.cancelTransfer();
  assert.equal(overlay(), flightOverlay);
  assert.equal(second.style.opacity, '0');
  animations.at(-1).finish();
  await flight;
  assert.equal(second.style.opacity, '');
  assert.equal(overlay(), undefined);
});
