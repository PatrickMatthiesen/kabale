const columnsByMode = { klondike: 7, spider: 10, freecell: 8, pyramid: 7 };
const MIN_READABLE_CARD_WIDTH = 40;
const MAX_CARD_WIDTH = 160;

function cardMetrics(cardWidth, compact) {
  // Keep this in sync with the fluid font size and inset in .card-index.
  const indexSize = Math.min(cardWidth * .46, Math.max(12, Math.min(cardWidth * .4, cardWidth * .2 + 14)));
  const indexInset = Math.max(2, Math.min(6, cardWidth * .03));
  // Normal labels stack rank above suit. Compact labels sit on one line.
  const labelHeight = indexSize * (compact ? .9 : 1.4025);
  const cardHeight = cardWidth * 14 / 9;
  const minFaceStep = Math.min(cardHeight - 1, labelHeight + indexInset + 4);
  const faceStep = Math.min(cardHeight - 1, Math.max(minFaceStep, Math.min(64, Math.max(Math.min(18, cardWidth), cardWidth * .6))));
  const minBackStep = Math.min(cardHeight - 1, Math.max(8, cardWidth * .12));
  const backStep = Math.min(28, cardWidth * .32);
  return { cardHeight, faceStep, backStep, minFaceStep, minBackStep };
}

function layoutMetrics(mode, cardWidth, stacks, reserveGap, compact, sideReserves, gap, availableHeight) {
  const metrics = cardMetrics(cardWidth, compact);
  const { cardHeight, minFaceStep, minBackStep } = metrics;
  if (mode === 'pyramid') return { ...metrics, requiredHeight: 3.92 * cardHeight + reserveGap };
  const baseHeight = sideReserves ? cardHeight : 2 * cardHeight + reserveGap;
  const offsetBudget = availableHeight - baseHeight;
  let compression = 1;
  for (const stack of stacks) {
    const face = stack.face || 0;
    const back = stack.back || 0;
    const naturalOffset = face * metrics.faceStep + back * metrics.backStep;
    const minimumOffset = face * minFaceStep + back * minBackStep;
    if (naturalOffset > minimumOffset) compression = Math.min(compression, Math.max(0, Math.min(1, (offsetBudget - minimumOffset) / (naturalOffset - minimumOffset))));
  }
  metrics.faceStep = minFaceStep + compression * (metrics.faceStep - minFaceStep);
  metrics.backStep = minBackStep + compression * (metrics.backStep - minBackStep);
  const tallestStack = stacks.reduce((max, stack) => Math.max(max, (stack.face || 0) * metrics.faceStep + (stack.back || 0) * metrics.backStep), 0);
  const railHeight = sideReserves ? 4 * (.64 * cardHeight) + 3 * gap : 0;
  return { ...metrics, requiredHeight: Math.max(baseHeight + tallestStack, railHeight) };
}

function initialStacks(mode) {
  if (mode === 'klondike') return Array.from({ length: 7 }, (_, i) => ({ face: 0, back: i }));
  if (mode === 'spider') return Array.from({ length: 10 }, (_, i) => ({ face: 0, back: i < 4 ? 5 : 4 }));
  if (mode === 'freecell') return Array.from({ length: 8 }, (_, i) => ({ face: i < 4 ? 6 : 5, back: 0 }));
  return [];
}

/** Fit the board width and current deal's complete stack height when possible. */
export function boardLayout(mode, contentWidth, availableHeight = Infinity, profile = {}) {
  const columns = columnsByMode[mode] ?? 7;
  const gap = contentWidth < 640 ? 2 : 10;
  const reserveGap = Math.max(0, Number(profile.reserveGap) || 0);
  const stacks = Array.isArray(profile.stacks) ? profile.stacks : initialStacks(mode);
  const compact = Boolean(profile.compact);
  const sideReserves = mode === 'freecell' && Boolean(profile.sideReserves);
  const widthUse = sideReserves ? columns + 1.28 : columns;
  const widthGaps = sideReserves ? columns + 1 : columns - 1;
  const widthLimit = Math.max(0, Math.min(MAX_CARD_WIDTH, (contentWidth - widthGaps * gap - 1) / widthUse));
  const minWidth = Math.min(MIN_READABLE_CARD_WIDTH, widthLimit);
  const heightLimit = Number.isFinite(availableHeight) ? Math.max(0, availableHeight) : Infinity;

  // Height grows monotonically with card width, so binary search finds the
  // largest readable cards that fit this deal without clipping its last card.
  let low = minWidth;
  let high = widthLimit;
  if (layoutMetrics(mode, low, stacks, reserveGap, compact, sideReserves, gap, heightLimit).requiredHeight <= heightLimit) {
    for (let i = 0; i < 32 && high - low > .01; i++) {
      const middle = (low + high) / 2;
      if (layoutMetrics(mode, middle, stacks, reserveGap, compact, sideReserves, gap, heightLimit).requiredHeight <= heightLimit) low = middle;
      else high = middle;
    }
  }

  const cardWidth = Math.floor(low * 100) / 100;
  const { faceStep, backStep, requiredHeight: neededHeight } = layoutMetrics(mode, cardWidth, stacks, reserveGap, compact, sideReserves, gap, heightLimit);
  const fits = cardWidth <= widthLimit + .01 && neededHeight <= heightLimit + .01;
  return { columns, gap, cardWidth, faceStep, backStep, fits, sideReserves };
}
