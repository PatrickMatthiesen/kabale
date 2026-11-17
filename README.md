# Kabale

A browser solitaire game with 7-kabale (Klondike), Spider, FreeCell, and Pyramid.

Play at https://patrickmatthiesen.github.io/kabale/.

## Run locally

Install Bun 1.4.4 or newer, then run:

```sh
bun run dev
```

Open http://localhost:5187. The development server listens on the local machine only. No dependency installation or build step is required.

```sh
bun test
```

## GitHub Pages

Pushes to `main` run the Bun tests, assemble `_site` with `bun run build`, and deploy it to GitHub Pages. The site uses relative asset paths so it also works below the repository's `/kabale/` path. Published scripts and styles share a version derived from the build contents, so refreshed pages request matching modules. Only the game files and optimized runtime artwork are published; the Bun development server is not needed in production.

## Playing

Drag a card or a valid sequence onto a highlighted destination using a mouse, pen, or touch. You can also select a card, then its destination. Double-click or double-tap a card to try an automatic move. With a card selected, press A for the same action. Press Escape to cancel selection or a drag. Ctrl+Z undoes a move; Ctrl+Shift+Z redoes it.

In Settings, 7-kabale can use either Kings only or Any card for empty columns. Changing this rule starts a new game after confirmation, and the rule stays with that game through undo, restart, and reload.

How to play explains the selected game's goal and rules, including its current challenge and empty-column setting.

Hints mark a source with "Move" and a destination with "Here". Hints clear when you select a card and do not inspect hidden card values. They prioritize foundation moves, uncovering cards, and freeing space, and skip previously visited positions, including equivalent empty-column and free-cell swaps. When only repeats remain, the game says no new hint was found; manual legal moves remain available. Hints suggest moves rather than guarantee a solution.

Easy and Normal allow hints, undo, and redo. Hard disables those assists. Spider uses one, two, or four suits; Hard Klondike draws three cards; Hard FreeCell has two free cells; Pyramid has two, one, or zero stock redeals. Easy and Normal Klondike and FreeCell use the same dealing rules. Deals are shuffled, not guaranteed solvable.

Restart replays the same deal. New deal shuffles fresh cards. The current game, up to 100 undo states, and card-art settings are saved in this browser's local storage. There is no account or server-side saved game.

## Card artwork

Random Deck is the default for new preferences. You can also choose Engraved or Woodcut; existing saved choices are retained. Random chooses a style for a new deal and retains it across reloads. Both styles use art-only number cards shared across ranks A through 10, plus separate Jack, Queen, and King illustrations for each suit. The card UI draws rank and suit labels in both corners, so larger labels stay sharp without being baked into or cropped by the art. The approved H3 heart and R4 court artwork guide the new card treatment. Cards use a 9:14 display ratio.

Number art fills the card face at every size. The corner labels sit over the illustration with enough room to remain readable on phones and in stacked columns. Dragged cards keep the same appearance.

The art-only source JPEGs are in `assets/cards/layered/`: each number file contains one suit illustration, and each court file contains J, Q, and K art in that order. Source prompts are in `assets/cards/layered/prompts.json`. `bun run prepare:images` uses native `Bun.Image` to generate small (80 pixels per card), medium (160 pixels per card), and full-resolution WebP images in `assets/cards/optimized/`, with content hashes in their filenames. The generated `src/art-manifest.js` records their URLs and dimensions. Commit regenerated variants and the manifest when source artwork changes. The client chooses the smallest sufficient variant using displayed card width and device pixel ratio, and updates its choice when the layout changes.

`assets/cards/retained-art.json` lists the previous generation's 48 hashed files. The build keeps these images alongside the current set so already-open tabs running the prior code can finish loading them during an art update. The preparation script validates the list and fails if a retained filename is invalid or its file is missing. When replacing artwork again, refresh this list from the manifest being replaced.

An artwork-only service worker stores requested hashed WebP images in browser Cache Storage, with a limit of 100 sheets. Unchanged images can be reused beyond GitHub Pages' ten-minute HTTP cache lifetime. Different bytes produce a different URL, so new artwork does not reuse old images. Browser storage eviction, private browsing or clearing site data can remove this cache. The worker does not cache HTML, scripts, stylesheets or game state; this is not full offline support.

The built-in image generator created the source artwork. Unused concepts and large PNG originals are excluded from Git and remain in the original local checkout.
