# Kabale

A browser solitaire game with 7-kabale (Klondike), Spider, FreeCell, and Pyramid.

Play at https://patrickmatthiesen.github.io/kabale/.

## Run locally

Install Node.js 22 or newer, then run:

```sh
npm run dev
```

Open http://localhost:5187. The development server listens on the local machine only. No dependency installation or build step is required.

```sh
npm test
```

## GitHub Pages

Pushes to `main` run the tests, assemble `_site` with `npm run build`, and deploy it to GitHub Pages. The site uses relative asset paths so it also works below the repository's `/kabale/` path. Only the game files and runtime JPEG artwork are published; the development server is not needed in production.

## Playing

Drag a card or a valid sequence onto a highlighted destination using a mouse, pen, or touch. You can also select a card, then its destination. Double-click or double-tap a card to try an automatic move. With a card selected, press A for the same action. Press Escape to cancel selection or a drag. Ctrl+Z undoes a move; Ctrl+Shift+Z redoes it.

In Settings, 7-kabale can use either Kings only or Any card for empty columns. Changing this rule starts a new game after confirmation, and the rule stays with that game through undo, restart, and reload.

Hints mark a source with "Move" and a destination with "Here". Hints clear when you select a card and do not inspect hidden card values.

Easy and Normal allow hints, undo, and redo. Hard disables those assists. Spider uses one, two, or four suits; Hard Klondike draws three cards; Hard FreeCell has two free cells; Pyramid has two, one, or zero stock redeals. Easy and Normal Klondike and FreeCell use the same dealing rules. Deals are shuffled, not guaranteed solvable.

Restart replays the same deal. New deal shuffles fresh cards. The current game, up to 100 undo states, and card-art settings are saved in this browser's local storage. There is no account or server-side saved game.

## Card artwork

Random Deck is the default for new preferences. You can also choose Engraved or Woodcut; existing saved choices are retained. Random chooses a style for a new deal and retains it across reloads. Both styles have complete generated faces for all 52 cards, with matching number-card decoration and integrated indices. Cards use a 9:14 display ratio.

Runtime images are in `assets/cards/full/*.jpg`. The built-in image generator created the source artwork; prompts are recorded in `assets/cards/full/prompts.json`. Unused concepts and large PNG originals are excluded from Git and remain in the original local checkout.
