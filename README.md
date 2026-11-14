# Kabale

A browser solitaire game with 7-kabale (Klondike), Spider, FreeCell, and Pyramid.

## Run locally

Install Node.js 22 or newer, then run:

```sh
npm run dev
```

Open http://localhost:5187. The development server listens on the local machine only. No dependency installation or build step is required.

```sh
npm test
```

## Playing

Select a card, then its destination. Double-click or double-tap a card to try an automatic move. With a card selected, press A for the same action. Press Escape to cancel selection. Ctrl+Z undoes a move; Ctrl+Shift+Z redoes it. The buttons work on touch devices too.

Hints mark a source with "Move" and a destination with "Here". Hints clear when you select a card and do not inspect hidden card values.

Easy and Normal allow hints, undo, and redo. Hard disables those assists. Spider uses one, two, or four suits; Hard Klondike draws three cards; Hard FreeCell has two free cells; Pyramid has two, one, or zero stock redeals. Easy and Normal Klondike and FreeCell use the same dealing rules. Deals are shuffled, not guaranteed solvable.

Restart replays the same deal. New deal shuffles fresh cards. The current game, up to 100 undo states, and card-art settings are saved in this browser's local storage. There is no account or server-side saved game.

## Card artwork

Choose Engraved, Woodcut, or Random Deck. Random chooses a style for a new deal and retains it across reloads. Both styles have complete generated faces for all 52 cards, with matching number-card decoration and integrated indices. Cards use a 9:14 display ratio.

Runtime images are in `assets/cards/full/*.jpg`. The built-in image generator created the source artwork; prompts are recorded in `assets/cards/full/prompts.json`. Unused concepts and large PNG originals are excluded from Git and remain in the original local checkout.
