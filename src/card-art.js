export const artStyles = ['engraved', 'woodcut'];

export function getStorage(host) {
  try { return host.localStorage; } catch { return null; }
}

const suits = { '♣': 'clubs', '♠': 'spades', '♥': 'hearts', '♦': 'diamonds' };

/** Position a complete face within its generated sheet, without cropping its artwork. */
export function cardFace(card, style) {
  if (!suits[card.s] || !Number.isInteger(card.r) || card.r < 1 || card.r > 13 || !artStyles.includes(style)) {
    throw new Error('Unknown card face');
  }
  const court = card.r > 10;
  const index = court ? card.r - 11 : card.r - 1;
  const columns = court ? 3 : 5;
  const rows = court ? 1 : 2;
  return {
    url: `./assets/cards/full/${style}-${suits[card.s]}-${court ? 'court' : 'numbers'}.jpg`,
    size: `${columns * 100}% ${rows * 100}%`,
    position: `${(index % columns) * 100 / (columns - 1)}% ${rows === 1 ? 0 : Math.floor(index / columns) * 100}%`
  };
}

export function resolveArt(choice, random = Math.random) {
  return artStyles.includes(choice) ? choice : artStyles[Math.floor(random() * artStyles.length)];
}

export function loadArt(storage, random = Math.random) {
  try {
    const saved = JSON.parse(storage.getItem('kabale-card-art'));
    if (saved?.choice === 'painted') saved.choice = 'woodcut';
    if (saved?.resolved === 'painted') saved.resolved = 'woodcut';
    if (saved && [...artStyles, 'random'].includes(saved.choice)) {
      return { choice: saved.choice, resolved: saved.choice === 'random' && artStyles.includes(saved.resolved) ? saved.resolved : resolveArt(saved.choice) };
    }
  } catch { /* Use the default when storage is unavailable or invalid. */ }
  return { choice: 'random', resolved: resolveArt('random', random) };
}

export function saveArt(storage, art) {
  try { storage.setItem('kabale-card-art', JSON.stringify(art)); } catch { /* The current tab can still use the selected art. */ }
}

