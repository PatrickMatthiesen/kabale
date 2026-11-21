const EMPTY_COLUMNS_KEY = 'kabale-empty-columns';
const CARD_INDEX_SIZE_KEY = 'kabale-card-index-size';
const FREECELL_AUTO_FILL_KEY = 'kabale-freecell-auto-fill-foundations';
const AUTO_MOVE_TRIGGER_KEY = 'kabale-auto-move-trigger';
const CARD_ANIMATIONS_KEY = 'kabale-card-animations';

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

export function loadFreeCellAutoFill(storage) {
  try {
    if (storage?.getItem(FREECELL_AUTO_FILL_KEY) === 'off') return 'off';
  } catch { /* Use the default when storage is unavailable. */ }
  return 'on';
}

export function saveFreeCellAutoFill(storage, value) {
  const preference = value === 'off' ? 'off' : 'on';
  try { storage?.setItem(FREECELL_AUTO_FILL_KEY, preference); } catch { /* Apply it for the current tab. */ }
  return preference;
}

export function loadAutoMoveTrigger(storage) {
  try {
    if (storage?.getItem(AUTO_MOVE_TRIGGER_KEY) === 'single') return 'single';
  } catch { /* Use the default when storage is unavailable. */ }
  return 'double';
}

export function saveAutoMoveTrigger(storage, value) {
  const preference = value === 'single' ? 'single' : 'double';
  try { storage?.setItem(AUTO_MOVE_TRIGGER_KEY, preference); } catch { /* Apply it for the current tab. */ }
  return preference;
}

export function loadCardAnimations(storage) {
  try {
    if (storage?.getItem(CARD_ANIMATIONS_KEY) === 'off') return 'off';
  } catch { /* Use the default when storage is unavailable. */ }
  return 'on';
}

export function saveCardAnimations(storage, value) {
  const preference = value === 'off' ? 'off' : 'on';
  try { storage?.setItem(CARD_ANIMATIONS_KEY, preference); } catch { /* Apply it for the current tab. */ }
  return preference;
}
