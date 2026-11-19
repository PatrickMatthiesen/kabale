import { translate } from './i18n.js';

/** Explain the rules used by the current deal, including its selected variants. */
export function gameRules(game,language = 'en') {
  const tr = (text,values) => translate(language,text,values);
  const hard = game.difficulty === 'hard';
  const difficulty = game.difficulty === 'easy' ? 'Easy' : hard ? 'Hard' : 'Normal';
  const suitCount = game.suitCount ?? (game.difficulty === 'easy' ? 1 : hard ? 4 : 2);
  const rules = {
    klondike: {
      name: '7-kabale',
      goal: 'Move all 52 cards to the four foundation piles, building each suit from Ace to King.',
      rules: [
        'Build columns downward in alternating colors. For example, a red 7 can go on a black 8.',
        'Move a face-up card or a descending sequence of alternating colors together. Uncovering a face-down card turns it face up automatically.',
        game.emptyColumns === 'any'
          ? 'Your empty-column rule allows any card or valid sequence to fill an empty column.'
          : 'Only a King, or a valid sequence starting with a King, can fill an empty column.',
        tr('Use the stock to turn over {amount} at a time. Only the top card of the waste pile is available. Recycle the waste when the stock runs out, as often as you like.',{amount:tr(game.drawCount === 3 ? 'up to three cards' : 'one card')}),
        'Start each foundation with an Ace, then add cards of the same suit in order: 2, 3, and so on up to King. A top foundation card may also move back to a column.'
      ]
    },
    spider: {
      name: 'Spider',
      goal: 'Complete eight sequences from King down to Ace, each entirely in one suit. Completed sequences leave the table automatically.',
      rules: [
        tr('This deal uses {count} {suits} and 104 cards across ten columns.',{count:suitCount,suits:tr(suitCount === 1 ? 'suit' : 'suits')}),
        'Place a card on a card one rank higher. Their suits can differ, so a 7 of hearts can go on an 8 of spades.',
        'To move several cards together, they must descend in rank and all share the same suit.',
        'Any card or valid sequence can fill an empty column. Uncovering a face-down card turns it face up automatically.',
        'The stock deals one new face-up card onto every column. Fill all empty columns before dealing.'
      ]
    },
    freecell: {
      name: 'FreeCell',
      goal: 'Move all 52 cards to the four foundation piles, building each suit from Ace to King.',
      rules: [
        'All cards begin face up in eight columns. Build downward in alternating colors, such as a red 7 on a black 8.',
        tr('There are {count} free cells. Each can hold one card temporarily.',{count:game.cells?.length ?? (hard ? 2 : 4)}),
        'Move an exposed card, or an alternating-color descending sequence when enough temporary spaces are free. Empty free cells and empty columns increase how many cards can move together; the destination column does not count as temporary space.',
        'For example, with one empty free cell and no empty columns, you can move a sequence of two cards together.',
        'Any card or a sequence that fits the available temporary spaces can fill an empty column.',
        'Start each foundation with an Ace, then add cards of that suit in ascending order up to King. A top foundation card may move back to a column or an empty free cell.'
      ]
    },
    pyramid: {
      name: 'Pyramid',
      goal: 'Remove all 28 cards from the pyramid. You do not need to clear the stock or waste to win.',
      rules: [
        'A pyramid card is available only when neither of the two cards overlapping it from below remains. Start with the bottom row.',
        'Remove two available cards whose ranks total 13, such as 5 and 8, or Ace and Queen. Suits and colors do not matter.',
        'Ace counts as 1, Jack as 11, and Queen as 12. A King counts as 13 and is removed on its own.',
        'You may pair two available pyramid cards, or one available pyramid card with the top card of the waste pile.',
        `${tr('Turn over one stock card at a time to replace the available waste card.')} ${tr(game.difficulty === 'easy' ? 'When the stock runs out, you may recycle the waste twice.' : hard ? 'You cannot recycle the waste, so there is only one pass through the stock.' : 'When the stock runs out, you may recycle the waste once.')}`
      ]
    }
  }[game.mode];
  return {
    name: tr(rules.name),
    goal: tr(rules.goal),
    rules: rules.rules.map(text => tr(text)),
    challenge: `${tr('{difficulty} challenge.',{difficulty:tr(difficulty)})} ${tr(hard ? 'Undo, redo and hints are disabled.' : 'Undo, redo and hints are available.')}`
  };
}
