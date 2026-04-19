# Card Dimensions and Rendering Guidelines (Main Street)

## Canonical source art

- Orientation: landscape
- Canonical pixel size (in-repo source SVGs): 140 × 80 px

Rationale: 140×80 matches the Main Street market slot size and keeps runtime scaling simple for thumbnails and UI slots. SVG source art preserves vector fidelity and can be rasterised to derived thumbnails programmatically.

## Rendering rules (aspect-preserving)

All runtime rendering MUST preserve the canonical aspect ratio (landscape 140:80) unless an explicit designer decision is made and documented.

General rule: use "fit-inside" scaling (preserve aspect ratio and ensure the whole card is visible). Only use "fill-and-crop" when a tight visual crop is required by a layout (e.g., decorative hero images). Prefer letterboxing/pillarboxing over stretching.

UI slot mappings (recommendations)

- Market card slot (example-games/main-street): visual slot nominal size = 140 × 80 px (landscape).
  - Rendering: scale canonical art to fit inside the slot width (max width = 140) while preserving aspect ratio. Center vertically; allow top/bottom letterbox space.
  - Phaser: add Image with displayWidth = slotWidth, set displayHeight = (displayWidth * canonicalH / canonicalW) and position centered in slot.

- Street slot (10-slot grid shown as 2 rows × 5 columns): nominal slot size = 140 × 80 px (matches market placeholder).
  - Rendering: fit-inside within slot bounds, center in slot. Do NOT stretch; vertical/horizontal centering is acceptable. If a tighter crop is desired for visual density, consider providing a derived thumbnail (see "Derived thumbnails" below) and document exception.

- Incident queue and Investment/held-event thumbnails: nominal sizes vary; recommended approach is to scale to fit inside the slot and use a fixed padding (2–6 px) so glyphs and text do not clip.

- Hand / small runtime cards (UI helpers and layout constants): use shared runtime constants in `src/ui/constants.ts` (CARD_W, CARD_H). Derive display sizes by computing scale = CARD_W / canonicalWidth and applying the same scale to height.

- Game Selector thumbnails (120×68 px): render a composed scene at double or triple canonical scale and downscale to the thumbnail size. Maintain legibility by ensuring the card art occupies >= 40% of the thumbnail's dominant area.

## Derived thumbnails and export guidance

- Prefer generating thumbnails at runtime by rasterising SVGs into Phaser textures at the target display size. This keeps the repo free of large raster assets and allows dynamic scaling for different DPIs.
- If exporting raster thumbnails (for web or CDN delivery), produce them from the canonical SVG using a vector renderer at the desired pixel width and preserve aspect ratio.
  - Example: `rsvg-convert -w 140 -h 80 placeholder-card.svg -o placeholder-card-140x80.png` (or use the project's Node/TS generator scripts)

- Recommended derived sizes (suggested presets):
  - Full card (portrait reference): 140×190 (project-wide canonical for traditional cards)
  - Market slot thumbnail / Street slot: 140×80 (Main Street canonical)
  - Street small thumbnail: fit to 105×110
  - UI small (compact hand): CARD_W × CARD_H (48×65 default runtime)
  - Selector thumbnail: 120×68 (scene screenshot)

## Layout notes (Main Street)

- Main Street presents the street as a responsive 2×5 grid to preserve readability and avoid overlap with market, incident queue, hand, action controls, and instruction text across desktop and narrow/tall viewports.
- Bottom-right action controls are compact by design to preserve vertical space for the lower hand/challenge area.

## Migration notes

- Existing scene loaders should switch to loading canonical SVGs where possible and compute display sizes using fit-inside math to avoid distortion.
- Avoid committing rasterized card art into the repo; prefer SVGs plus small generated thumbnails only where necessary.

## Examples (Phaser pseudocode)

```
// load SVG once in preload
this.load.svg('ms_placeholder_card', 'assets/games/main-street/svg/placeholder-card.svg');

// when creating a market slot image
const img = this.add.image(slotX, slotY, 'ms_placeholder_card');
img.displayWidth = SLOT_WIDTH; // e.g. 140
img.displayHeight = (SLOT_WIDTH * 140) / 190; // maintain aspect (canonical H / canonical W)
img.setOrigin(0.5, 0.5);
```

Keep this document in sync with `docs/main-street/prd-milestone-*` and `public/assets/CREDITS.md` when canonical dimensions change.