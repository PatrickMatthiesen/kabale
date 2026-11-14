const columnsByMode = { klondike: 7, spider: 10, freecell: 8, pyramid: 7 };

/** Fit the complete row into the board's content width, including its gaps. */
export function boardLayout(mode, contentWidth, availableHeight = Infinity) {
  const columns = columnsByMode[mode] ?? 7;
  const gap = contentWidth < 640 ? 2 : 10;
  // Reserve a pixel for fractional browser layout rounding.
  // Keep the initial deal comfortably visible on desktop as the cards grow.
  // Longer columns during play can still extend vertically.
  const heightRatio = { klondike: 4, spider: 4, freecell: 6.1, pyramid: 7 }[mode] ?? 4;
  const heightLimit = contentWidth >= 640 ? Math.max(40, (availableHeight - 40) / heightRatio) : Infinity;
  const cardWidth = Math.floor(Math.min(160, heightLimit, Math.max(0, (contentWidth - (columns - 1) * gap - 1) / columns)) * 100) / 100;
  return { columns, gap, cardWidth, faceStep: Math.min(64, cardWidth * .6), backStep: Math.min(28, cardWidth * .32) };
}
