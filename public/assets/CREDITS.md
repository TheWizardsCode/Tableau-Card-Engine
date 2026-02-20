# Asset Credits

All assets in this directory are licensed for free commercial use.

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
