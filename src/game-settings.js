const EMPTY_COLUMNS_KEY = 'kabale-empty-columns';

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
