// Slots follow draw order: waste bottom to top, then stock top to bottom.
// Only the exposed waste top supplies a card's identity.
export function rememberStock(game, previous) {
  if (game.mode !== 'klondike') return;
  const size = game.stock.length + game.waste.length;
  if (!Array.isArray(game.stockMemory) || game.stockMemory.length !== size) {
    const memory = Array.isArray(previous?.stockMemory) ? previous.stockMemory.slice() : null;
    const removed = memory ? memory.length - size : -1;
    // Ordinary moves can only remove the old waste top. If a saved history
    // has a gap, start with unknown slots rather than guess their identities.
    const recoverable = removed === 0 || removed === 1 && previous.waste.length > 0;
    if (recoverable) {
      if (removed) memory.splice(previous.waste.length - 1, 1);
      game.stockMemory = memory;
    } else {
      game.stockMemory = Array(size).fill(null);
    }
  }
  const top = game.waste.at(-1);
  if (top?.up) game.stockMemory[game.waste.length - 1] = { r: top.r, s: top.s };
}

// Older saves have moves but no stock memory. Reconstruct from the contiguous
// snapshots that are available, without reading their hidden card identities.
export function restoreStockMemory(snapshots) {
  let previous;
  for (const game of snapshots) {
    rememberStock(game, previous?.moves === game.moves - 1 ? previous : undefined);
    previous = game;
  }
}
