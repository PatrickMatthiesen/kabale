const columnsByMode = { klondike: 7, spider: 10, freecell: 8, pyramid: 7 };
const MIN_READABLE_CARD_WIDTH = 40;
const MAX_CARD_WIDTH = 160;

function cardMetrics(cardWidth, indexScale) {
  // Keep the rank and suit row clear of the next card, at every size.
  const indexSize = Math.min(cardWidth * .44, indexScale * Math.min(cardWidth * .37, cardWidth * .16 + 9));
  const indexInset = Math.max(2, Math.min(5, cardWidth * .03));
  const cardHeight = cardWidth * 14 / 9;
  const minFaceStep = Math.min(cardHeight - 1, indexSize + indexInset + 2);
  const faceStep = Math.min(cardHeight - 1, Math.max(minFaceStep, Math.min(54, cardWidth * .46)));
  const minBackStep = Math.min(cardHeight - 1, Math.max(8, cardWidth * .12));
  const backStep = Math.max(minBackStep, Math.min(22, cardWidth * .24));
  return { cardHeight, faceStep, backStep, minFaceStep, minBackStep };
}

function layoutMetrics(mode, cardWidth, stacks, reserveGap, indexScale, sideReserves, gap, availableHeight) {
  const metrics = cardMetrics(cardWidth, indexScale);
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
  const gap = contentWidth < 640 ? 2 : 6;
  const reserveGap = Math.max(0, Number(profile.reserveGap) || 0);
  const stacks = Array.isArray(profile.stacks) ? profile.stacks : initialStacks(mode);
  const indexScale = profile.indexScale ?? 1;
  const sideReserves = (mode === 'freecell' || mode === 'klondike') && Boolean(profile.sideReserves);
  const widthUse = sideReserves ? columns + 1.28 : columns;
  const widthGaps = sideReserves ? columns + 1 : columns - 1;
  const widthLimit = Math.max(0, Math.min(MAX_CARD_WIDTH, (contentWidth - widthGaps * gap - 1) / widthUse));
  const minWidth = Math.min(widthLimit, MIN_READABLE_CARD_WIDTH);
  const heightLimit = Number.isFinite(availableHeight) ? Math.max(0, availableHeight) : Infinity;

  // Height grows monotonically with card width, so binary search finds the
  // largest readable cards that fit this deal without clipping its last card.
  let low = minWidth;
  let high = widthLimit;
  if (layoutMetrics(mode, low, stacks, reserveGap, indexScale, sideReserves, gap, heightLimit).requiredHeight <= heightLimit) {
    for (let i = 0; i < 32 && high - low > .01; i++) {
      const middle = (low + high) / 2;
      if (layoutMetrics(mode, middle, stacks, reserveGap, indexScale, sideReserves, gap, heightLimit).requiredHeight <= heightLimit) low = middle;
      else high = middle;
    }
  } else if (mode !== 'pyramid') {
    // If even the smallest readable cards need scrolling, use more of the width.
    low = Math.max(minWidth, widthLimit * .76);
  }

  const cardWidth = Math.floor(low * 100) / 100;
  const { faceStep, backStep, requiredHeight: neededHeight } = layoutMetrics(mode, cardWidth, stacks, reserveGap, indexScale, sideReserves, gap, heightLimit);
  const fits = cardWidth <= widthLimit + .01 && neededHeight <= heightLimit + .01;
  return { columns, gap, cardWidth, faceStep, backStep, fits, sideReserves, overflow: Math.max(0, neededHeight - heightLimit) };
}
