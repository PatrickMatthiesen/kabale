import { wasteLayout } from './waste-layout.js';

function cardPositions(game) {
  const positions = new Map();
  const add = (card, pile, key = pile, arrives = true) => {
    if (card?.id != null) positions.set(card.id, { pile, key, arrives });
  };

  const pyramid = game.mode === 'pyramid';
  game.cols.forEach((column, i) => {
    column.forEach((card, j) => {
      const pile = pyramid ? `p:${i}:${j}` : `col:${i}`;
      add(card, pile, pyramid ? pile : `${pile}:${j}`);
    });
  });

  const spider = game.mode === 'spider';
  game.found.forEach((foundation, i) => {
    const pile = spider ? 'runs' : `found:${i}`;
    foundation.forEach((card, j) => {
      add(card, pile, pile, !spider && j === foundation.length - 1);
    });
  });
  game.cells.forEach((card, i) => add(card, `cell:${i}`));

  const addWaste = (cards, pile) => {
    wasteLayout(cards).forEach(({ card, top }, i) => {
      add(card, pile, top ? pile : `${pile}:layer:${i}`);
    });
  };
  if (pyramid) addWaste(game.pairWaste, 'pw');
  else if (game.mode === 'klondike') addWaste(game.waste, 'waste');

  // The stock renders an anonymous back, so every stock card shares an anchor.
  game.stock.forEach(card => add(card, 'stock', 'stock', false));
  if (pyramid) game.removed.forEach(card => add(card, null, null, false));

  return positions;
}

/**
 * Compare two snapshots of the same deal. Match by physical card ID and
 * return board keys in destination order, with each stack bottom to top.
 * An anchor can exist without an individual card there, such as a buried
 * foundation card or a completed Spider run.
 */
export function cardTransfers(before, after) {
  if (before.mode !== after.mode) return [];

  const previous = cardPositions(before);
  const transfers = [];
  for (const [id, destination] of cardPositions(after)) {
    const source = previous.get(id);
    if (!source || source.pile === destination.pile) continue;
    const transfer = { from: source.key, to: destination.key, arrives: destination.arrives };
    if (!source.arrives && source.key?.startsWith('found:')) transfer.fromAnchor = true;
    transfers.push(transfer);
  }
  return transfers;
}
