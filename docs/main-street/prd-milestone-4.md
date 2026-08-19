# Main Street PRD Milestone 4: Visual Polish, Animation, and Audio

## Goal

Milestone 4 delivers presentation polish for Main Street: reproducible thumbnail generation, placeholder-to-final asset pipeline guidance, animation timing specs, audio integration, and accessibility controls (reduced motion + mute/volume).

## Asset Pipeline

### Card art pipeline (placeholder now, final art later)

- Current source placeholders are SVG card assets under:
  - `public/assets/games/main-street/svg/cards/`
- Runtime rendering path in Main Street:
  - preload SVG text per card template
  - lazily rasterise to size-specific textures via `SvgTextureHelpers`
  - fall back to `ms_placeholder_card` when needed
- Final art handoff expectation:
  - final assets may be delivered as PNG/WebP/atlas without changing scene/game logic
  - texture key conventions should remain stable so game code does not change

### Texture cache key/invalidation policy

- Card textures use deterministic keys: `ms_card_<template>_<width>x<height>@<dpr>`.
- Regeneration triggers:
  - viewport resize (`handleResize`) prewarms visible card sizes for the new layout
  - device pixel ratio (DPR) change clears `ms_card_*` textures, then prewarms at the new DPR
- Steady state behavior:
  - if a texture key already exists, no rerasterization is performed
  - lazy request paths (`requestCardTexture`) only generate missing keys, then refresh scene render

### Thumbnail pipeline

Canonical fixture transcript:

- `tests/fixtures/transcripts/main-street/fixture-game.json`

Replay and screenshot generation:

```bash
npm run replay -- tests/fixtures/transcripts/main-street/fixture-game.json --game main-street --output data/screenshots/main-street
```

Thumbnail generation (120x68 PNG):

```bash
npx tsx scripts/generate-thumbnail.ts main-street
```

Output artifact:

- `public/assets/games/main-street/thumbnail.png`

## Street Adjacency Migration Note (2x5 Distance Model)

Main Street synergy is now computed against the rendered 2x5 street layout using 8-way adjacency (Chebyshev distance: orthogonal **and diagonal** cells), not linear index neighbors. (Originally Manhattan-only at milestone 4; updated to 8-way by CG-0MSP1HCAS00785MP.)

- storage remains a 10-slot row-major array for compatibility
- default range (`1`) checks all 8 surrounding cells (orthogonal + diagonal)
- upgrades expand range via `synergyRangeBonus` (Chebyshev radius)

This aligns rules with visuals and keeps existing state/transcript formats stable.

## Animation Specifications

### Card animations

Engine helpers:

- `src/ui/dealCard.ts`
- `src/ui/placeCard.ts`
- `src/ui/discardCard.ts`

Default timings/easing:

- Deal: `400ms`, arc motion, `Quad.easeOut` + `Quad.easeIn`
- Place: `350ms`, snap feel via `Back.easeOut`
- Discard: `400ms`, fade/scale/move via `Quad.easeIn`

### Event feedback animations

Resource pop animation (`popTextOrIcon`):

- target duration: `~1500ms`
- motion: rise + fade + slight scale pop
- non-blocking by design

### Transition helpers

- `src/ui/sceneTransition.ts` (`runSceneTransition`)
- fade/slide helpers are available; transitions should be skipped when reduced motion is enabled

## Audio Integration and Sourcing Guidance

Main Street audio folder:

- `public/assets/games/main-street/audio/`

Current placeholder files:

- `deal.wav`
- `place.wav`
- `discard.wav`
- `coin-pop.wav`
- `click.wav`
- `loop.wav`

Licensing requirements:

- Placeholder and final assets must be permissive (CC0/MIT/Apache-2.0 equivalent)
- All additions/changes must be documented in `public/assets/CREDITS.md`

Sourcing guidance for placeholder replacements:

1. Prefer in-repo procedural generation scripts where practical
2. If external assets are used, verify license before commit
3. Normalize assets to lightweight formats suitable for browser playback
4. Update `public/assets/CREDITS.md` in the same change

## Accessibility Toggles

Settings panel controls include:

- Reduced Motion toggle
- Mute toggle
- Volume slider

Persistence keys:

- `tce-ui-reduced-motion`
- `tce-sound-muted`
- `tce-sound-volume`

Expected behavior:

- Reduced motion disables non-essential motion (resource pops/transitions)
- Mute prevents playback
- Volume scales global playback

## Developer Runbook

### Validate visual smoke checks

```bash
npm test
```

Relevant smoke coverage includes:

- `tests/e2e/replay-main-street.e2e.test.ts`
- `tests/e2e/generate-thumbnail.main-street.test.ts`
- `tests/main-street/MainStreetScene.browser.test.ts`

## Main Street card rendering architecture (current)

- Runtime card display is Phaser-native only (GameObjects/textures). The legacy DOM renderer path has been removed from production flow.
- Overlay occlusion behavior (Help/Settings) is validated via canvas pixel assertions, not DOM visibility toggles.
- Texture cache invalidation policy:
  - `ms_card_*` textures are keyed by template + size + DPR
  - resize triggers prewarm for visible card sizes
  - DPR change clears existing `ms_card_*` textures before regeneration

## Rollback guidance

If a rendering migration regression is detected, roll back by reverting the dedicated feature commits on the rendering branch rather than reintroducing partial DOM behavior.

Suggested rollback flow:

```bash
git checkout <feature-branch>
git log --oneline -- example-games/main-street/scenes src/ui tests/main-street
# Revert the specific rendering migration commit(s)
git revert <commit-hash>
# Re-run quality gates
npm test
npm run build
```

### Regenerate Main Street thumbnail from fixture

```bash
npm run replay -- tests/fixtures/transcripts/main-street/fixture-game.json --game main-street --output data/screenshots/main-street
npx tsx scripts/generate-thumbnail.ts main-street
```

### Replace placeholder audio with final audio

1. Replace files under `public/assets/games/main-street/audio/` while preserving logical keys.
2. Keep scene key mapping stable in `MainStreetScene.ts` (`SFX_KEYS`).
3. Update `public/assets/CREDITS.md` with source/license details.
4. Run verification:

```bash
npm test
npm run build
```
