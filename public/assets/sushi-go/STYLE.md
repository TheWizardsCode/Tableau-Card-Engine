Icon Set: Sushi Go!
-------------------

This document describes the visual language, naming, export targets and regeneration notes for the in-repo Sushi Go! icon set.

Files
- Location: `public/assets/sushi-go/`
- Naming: `icon-<name>[-variant].svg` (examples: `icon-nigiri-salmon.svg`, `icon-maki-1.svg`, `icon-maki-3.svg`)

Visual / Style rules
- Palette: keep icons limited and flat for legibility at small sizes.
  - Rice / neutral: #F6F6F4
  - Salmon / accent: #FF7B6B
  - Seaweed / outline: #2E3B2E
  - Wasabi / green: #86C166
  - Tempura / yellow: #FFD37A
  - Sashimi / coral: #FF9E8A
  - Pudding / brown: #C07A4A

- Stroke: avoid thin strokes (<1px at 128px) — prefer solid shapes for pixel-tight rendering.
- Padding: provide an invisible 8px padding at 128x128 export (safe margin ~6%).
- Text: do not rely on text or external fonts inside SVGs; icons must be pure vector shapes.

Export targets
- Baseline (source): SVG (editable vectors) at any viewBox; recommended artboard 128x128 px.
- Raster fallbacks (for CI/older devices): PNG at
  - 128x128 (baseline)
  - 110x145 (hand-card reference)
  - 72x48 (tableau-card reference)

Naming and variants
- Use kebab-case with `icon-` prefix: `icon-<noun>[-variant]`.
- Examples:
  - `icon-nigiri-salmon.svg`
  - `icon-maki-1.svg`, `icon-maki-2.svg`, `icon-maki-3.svg`
  - `icon-tempura.svg`, `icon-sashimi.svg`, `icon-dumpling.svg`

CI / Regeneration notes
- We recommend a small Node script to rasterize SVG -> PNG using `sharp`.
- Suggested script path: `tools/export-sushi-icons.js` (not yet implemented).
- Example command to produce fallbacks:

  npx tsx tools/export-sushi-icons.js --src public/assets/sushi-go --out public/assets/sushi-go/png --sizes 128x128,110x145,72x48

- Keep SVGs as the source of truth. If you edit an SVG, re-run the raster export to refresh PNG fallbacks.

Accessibility
- Ensure icon color contrast is sufficient when used over card backgrounds. Prefer a subtle outline (`#2E3B2E`) to maintain separation on light/dark backgrounds.

Example
- Reference SVG: `public/assets/sushi-go/icon-nigiri-salmon.svg`

License
- Icons authored in-house for this project. License: MIT (see project LICENSE file).
