import { artManifest } from './art-manifest.js';
export const artStyles = ['engraved', 'woodcut'];

export function selectArtVariant(variants, cardWidth = 160, pixelRatio = 1) {
  const width = Number.isFinite(cardWidth) && cardWidth > 0 ? cardWidth : 160;
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  return variants.find(variant => variant.width >= width * ratio) ?? variants.at(-1);
}

export function getStorage(host) {
  try { return host.localStorage; } catch { return null; }
}

const suits = { '♣': 'clubs', '♠': 'spades', '♥': 'hearts', '♦': 'diamonds' };

/** Select art for the face; rank and suit labels are rendered separately by the card UI. */
export function cardFace(card, style, {cardWidth = 160, pixelRatio = 1} = {}) {
  if (!suits[card.s] || !Number.isInteger(card.r) || card.r < 1 || card.r > 13 || !artStyles.includes(style)) {
    throw new Error('Unknown card face');
  }
  const court = card.r > 10;
  const index = court ? card.r - 11 : card.r - 1;
  const variants = artManifest[`${style}-${suits[card.s]}-${court ? 'court' : 'numbers'}`];
  return {
    url: selectArtVariant(variants,cardWidth,pixelRatio).url,
    size: court ? '300% 100%' : '100% 100%',
    position: court ? `${index * 50}% 0%` : '0% 0%'
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

