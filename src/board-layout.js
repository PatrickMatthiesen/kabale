const columnsByMode = { klondike: 7, spider: 10, freecell: 8, pyramid: 7 };

/** Fit the complete row into the board's content width, including its gaps. */
export function boardLayout(mode, contentWidth) {
  const columns = columnsByMode[mode] ?? 7;
  const gap = contentWidth < 640 ? 2 : 10;
  // Reserve a pixel for fractional browser layout rounding.
  const cardWidth = Math.floor(Math.min(82, Math.max(0, (contentWidth - (columns - 1) * gap - 1) / columns)) * 100) / 100;
  return { columns, gap, cardWidth, faceStep: Math.min(38, cardWidth * .6), backStep: Math.min(20, cardWidth * .32) };
}
