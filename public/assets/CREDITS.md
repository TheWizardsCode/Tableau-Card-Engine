# Asset Credits

All assets in this directory are licensed for free commercial use.

## Canonical card art (project standard)

- Orientation: portrait
- Canonical pixel size (source SVGs): 140 × 190 px

Rendering guidance: The project's canonical card art is 140×190 (portrait). All runtime renderers should preserve aspect ratio (fit-inside) when deriving thumbnails for market slots, street slots, hand sprites, and UI components. See `docs/main-street/card-dimensions.md` for recommended mappings and Phaser examples.

## Playing Card Assets

52 card face SVGs and 1 card back SVG sourced from:

- **Source**: [saulspatz/SVGCards](https://github.com/saulspatz/SVGCards)
- **Deck**: Vertical2
- **License**: Public Domain
- **Modifications**: Resized from 210x315px to 140x190px; renamed to `rank_of_suit.svg` convention.

Files: `ace_of_clubs.svg` through `king_of_spades.svg` (52 card faces) and `card_back.svg`.

## Audio Sound Effects — Golf Game

8 synthesized WAV sound effects generated for the Golf solitaire game:

- **Source**: Procedurally generated using `scripts/generate-sfx.mjs`
- **License**: CC0 / Public Domain (original procedural synthesis, no external samples used)
- **Format**: 16-bit PCM WAV, 22050 Hz, mono
- **Generator**: Run `node scripts/generate-sfx.mjs` to regenerate

Files (in `audio/`):
- `card-draw.wav` — card being drawn from pile (swoosh)
- `card-flip.wav` — card flipping face-up (snap/click)
- `card-swap.wav` — card being swapped into grid (slide out + in)
- `card-discard.wav` — card being discarded (soft thud)
- `turn-change.wav` — turn transition (two-tone chime)
- `round-end.wav` — end of round (three-note fanfare)
- `score-reveal.wav` — score display (sparkle arpeggio)
- `ui-click.wav` — generic UI button click

## Audio Sound Effects — Beleaguered Castle

14 medieval/castle-themed WAV sound effects generated for the Beleaguered Castle solitaire game:

- **Source**: Procedurally generated using `scripts/generate-castle-sfx.mjs` with Tone.js frequency utilities
- **License**: CC0 / Public Domain (original procedural synthesis, no external samples used)
- **Format**: 16-bit PCM WAV, 22050 Hz, mono
- **Generator**: Run `node scripts/generate-castle-sfx.mjs` to regenerate

Files (in `audio/beleaguered-castle/`):
- `card-pickup.wav` — stone scrape / heavy lift when picking up a card
- `card-to-foundation.wav` — metallic bell chime when placing a card on a foundation
- `card-to-tableau.wav` — stone thud when placing a card on a tableau column
- `card-snap-back.wav` — wooden clunk when an invalid move snaps back
- `deal-card.wav` — quick stone slide during deal animation
- `win-fanfare.wav` — triumphant brass-like ascending fanfare on victory
- `loss-sound.wav` — deep descending tone / heavy gate closing on defeat
- `auto-complete-start.wav` — ascending sparkle when auto-complete begins
- `auto-complete-card.wav` — quick bright chime for each auto-completed card
- `undo.wav` — reverse swoosh when undoing a move
- `redo.wav` — forward swoosh when redoing a move
- `card-select.wav` — soft metallic click when selecting a card (click-to-move)
- `card-deselect.wav` — softer inverse click when deselecting a card
- `ui-click.wav` — castle-themed button press (stone/iron)

## Lost Cities Card Assets

61 SVG card images (60 expedition cards + 1 card back) generated for the Lost Cities game:

- **Source**: Procedurally generated using `scripts/generate-lost-cities-cards.ts`
- **License**: MIT (original procedural generation, no external assets used)
- **Format**: SVG, 140x190px
- **Generator**: Run `npx tsx scripts/generate-lost-cities-cards.ts` to regenerate

Files (in `cards/lost-cities/`):
- `lc-{color}-{2-10}.svg` — numbered expedition cards (45 total, 9 per color)
- `lc-{color}-inv{1-3}.svg` — investment/wager cards (15 total, 3 per color)
- `lc-back.svg` — card back with expedition theme
- Colors: yellow (compass), blue (ship), white (mountain), green (torch), red (crystal)

## Sushi Go! Icons (in-house)

- **Source**: In-house authored SVG icons for Sushi Go! example game
- **Files**: `public/assets/sushi-go/icon-*.svg`
- **License**: MIT (see project LICENSE)

Notes: Icons are vector SVGs authored for the project. See `public/assets/sushi-go/STYLE.md` for style and regeneration notes.

## Audio Sound Effects — Lost Cities

12 expedition-themed WAV sound effects generated for the Lost Cities game:

- **Source**: Procedurally generated using `scripts/generate-lost-cities-sfx.mjs` with Tone.js frequency utilities
- **License**: CC0 / Public Domain (original procedural synthesis, no external samples used)
- **Format**: 16-bit PCM WAV, 22050 Hz, mono
- **Generator**: Run `node scripts/generate-lost-cities-sfx.mjs` to regenerate

Files (in `audio/lost-cities/`):
- `card-select.wav` — compass click when selecting a card from hand
- `card-deselect.wav` — soft click when deselecting a card
- `card-play.wav` — map stamp when playing a card to an expedition
- `card-discard.wav` — parchment toss when discarding a card
- `card-draw.wav` — scroll unfurl when drawing a card
- `illegal-move.wav` — locked chest rattle for invalid moves
- `turn-change.wav` — ship's bell for turn transitions
- `round-end.wav` — journal close when a round ends
- `match-win.wav` — discovery fanfare on match victory
- `match-lose.wav` — sandstorm loss on match defeat
- `score-reveal.wav` — artifact chimes when scores are displayed
- `ui-click.wav` — map pin click for UI button presses

## The Mind Card Assets

101 SVG card images (100 numbered cards + 1 card back) generated for The Mind game:

- **Source**: Procedurally generated using `scripts/generate-mind-cards.ts`
- **License**: MIT (original procedural generation, no external assets used)
- **Format**: SVG, 140x190px
- **Generator**: Run `npx tsx scripts/generate-mind-cards.ts` to regenerate

Files (in `cards/the-mind/`):
- `mind-{1-100}.svg` — numbered cards (dark teal background, gold accents, white number)
- `mind-back.svg` — card back with mystery theme (radiating lines, "?" symbol)

## Audio Sound Effects — The Mind

6 zen/pulse-themed WAV sound effects generated for The Mind game:

- **Source**: Procedurally generated using `scripts/generate-mind-sfx.mjs` with Tone.js frequency utilities
- **License**: CC0 / Public Domain (original procedural synthesis, no external samples used)
- **Format**: 16-bit PCM WAV, 22050 Hz, mono
- **Generator**: Run `node scripts/generate-mind-sfx.mjs` to regenerate

Files (in `audio/the-mind/`):
- `card-play.wav` — heartbeat pulse when a card is played onto the pile
- `life-lost.wav` — dissonant warning tone when a life is lost from a penalty
- `level-complete.wav` — zen bowl chime when a level is completed
- `game-win.wav` — triumphant ascending bell cascade on victory
- `game-lost.wav` — descending minor tones with fading heartbeat on defeat
- `ui-click.wav` — zen wooden tap for UI button presses

## Game Thumbnails

Thumbnail images displayed on the Game Selector landing page:

- **Source**: Screenshots captured from the project's own example games via the replay pipeline or manual capture
- **License**: MIT (screenshots of the project's own games, no external content)
- **Format**: PNG, 120x68px (16:9 aspect ratio)
- **Generator**: Run `npx tsx scripts/generate-thumbnail.ts <game-name>` to regenerate from replay screenshots

Files (in `games/<game-name>/`):
- `games/golf/thumbnail.png` — Mid-game screenshot of 9-Card Golf

## Feudalism Crop Icons

Programmatic crop-themed icons drawn on resource tokens in the Feudalism game:

- **Source**: Drawn at runtime using Phaser 3 Graphics primitives in `example-games/feudalism/scenes/CropIconRenderer.ts`
- **License**: MIT (original procedural art, no external assets used)
- **Format**: Generated as in-memory Phaser textures (no static image files)
- **Icons**: Oats (grain heads), Flax (five-petal flower), Wheat (chevron ear), Barley (awned ear), Turnip (root bulb), Mead (honeycomb)
