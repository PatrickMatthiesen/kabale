const LAYERS = 3;

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Arrange the visible waste cards in a stable, slightly scattered fan. */
export function wasteLayout(cards) {
  const first = Math.max(0, cards.length - LAYERS);
  const occurrences = new Map();
  return cards.slice(first).map((card, offset, visible) => {
    const index = first + offset;
    const identity = String(card?.id ?? `${card?.r ?? ''}:${card?.s ?? ''}`);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    const seed = hash(`${identity}:${occurrence}`);
    const signed = (value, scale) => ((value % 2001) / 1000 - 1) * scale;
    const top = offset === visible.length - 1;
    return {
      card,
      angle: signed(seed, 3),
      x: signed(seed >>> 7, 4),
      y: signed(seed >>> 14, 4),
      top
    };
  });
}
