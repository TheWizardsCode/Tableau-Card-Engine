# Asset Credits

All assets in this directory are licensed for free commercial use.

## Playing Card Assets

52 card face SVGs and 1 card back SVG sourced from:

- **Source**: [saulspatz/SVGCards](https://github.com/saulspatz/SVGCards)
- **Deck**: Vertical2
- **License**: Public Domain
- **Modifications**: Resized from 210x315px to 140x190px; renamed to `rank_of_suit.svg` convention.

Files: `ace_of_clubs.svg` through `king_of_spades.svg` (52 card faces) and `card_back.svg`.

## Audio Sound Effects

8 synthesized WAV sound effects generated for the Tableau Card Engine:

- **Source**: Procedurally generated using `scripts/generate-sfx.mjs`
- **License**: CC0 / Public Domain (original procedural synthesis, no external samples used)
- **Format**: 16-bit PCM WAV, 22050 Hz, mono
- **Generator**: Run `node scripts/generate-sfx.mjs` to regenerate

Files:
- `card-draw.wav` — card being drawn from pile (swoosh)
- `card-flip.wav` — card flipping face-up (snap/click)
- `card-swap.wav` — card being swapped into grid (slide out + in)
- `card-discard.wav` — card being discarded (soft thud)
- `turn-change.wav` — turn transition (two-tone chime)
- `round-end.wav` — end of round (three-note fanfare)
- `score-reveal.wav` — score display (sparkle arpeggio)
- `ui-click.wav` — generic UI button click
