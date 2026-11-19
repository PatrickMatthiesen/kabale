const EMPTY_COLUMNS_KEY = 'kabale-empty-columns';
const CARD_INDEX_SIZE_KEY = 'kabale-card-index-size';

export const cardIndexScales = { small: .8, standard: 1, large: 1.25 };

export function loadCardIndexSize(storage) {
  try {
    const value = storage?.getItem(CARD_INDEX_SIZE_KEY);
    if (Object.hasOwn(cardIndexScales, value)) return value;
  } catch { /* Use the standard size when storage is unavailable. */ }
  return 'standard';
}

export function saveCardIndexSize(storage, value) {
  const size = Object.hasOwn(cardIndexScales, value) ? value : 'standard';
  try { storage?.setItem(CARD_INDEX_SIZE_KEY, size); } catch { /* The current tab can still use this size. */ }
  return size;
}

function normalizeEmptyColumns(value) {
  return value === 'any' ? 'any' : 'kings';
}

export function loadEmptyColumns(storage) {
  try {
    return normalizeEmptyColumns(storage?.getItem(EMPTY_COLUMNS_KEY));
  } catch {
    return 'kings';
  }
}

export function saveEmptyColumns(storage, value) {
  const normalized = normalizeEmptyColumns(value);
  try {
    storage?.setItem(EMPTY_COLUMNS_KEY, normalized);
  } catch {
    // Storage may be unavailable or blocked by the browser.
  }
  return normalized;
}
