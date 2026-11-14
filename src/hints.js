/** Mark one visible source and one destination, never the hidden cards behind them. */
export function hintRole(game, hint, key, faceUp) {
  if (!hint || (!faceUp && key !== 'stock')) return '';
  if (hint.from === key) return 'hint-source';
  if (hint.to === key) return 'hint-destination';
  const [kind, column, index] = key.split(':');
  if (kind === 'col' && hint.to === `col:${column}` && Number(index) === game.cols[Number(column)]?.length - 1) {
    return 'hint-destination';
  }
  return '';
}
