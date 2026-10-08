# Reference card pack — Main Street Foundations

The **reference card pack** built by [`scripts/build-card-pack.mjs`](../../../../scripts/build-card-pack.mjs)
(feature F7, `CG-0MUZIS3G6008UQGO`). It is the worked example for the card-pack
DLC channel (`CG-0MUZFD1WR0031QTB`): a publisher authors a pack once and a
distribution operator packages it into the launcher's content directory.

## What it contains

A small, complete Main Street pack (`main-street-foundations`) with one card of
each common family — a **business**, an **event** and an **upgrade** — plus two
card-art assets:

| File | Purpose |
|------|---------|
| `manifest.json` | The pack-channel manifest (`{ version, packs[] }`) declaring the pack and its relative files. |
| `main-street/main-street-foundations/cards.csv` | The pack's CSV fragment in Main Street's `card-data.csv` schema (53 columns). |
| `main-street/main-street-foundations/assets/*.png` | Real (non-symlink) card art copied into the built pack. |

The directory is laid out like the on-disk target
`<contentDir>/packs/<gameId>/<packId>/`, so the builder validates and copies it
verbatim (excluding symlinks).

## Building it

```bash
npm run build:card-pack -- --input tests/fixtures/reference-packs/main-street
```

The builder writes the packs root to `build/card-packs/packs/`:

```
build/card-packs/packs/
  manifest.json                         # merged (upserted) pack catalogue
  main-street/main-street-foundations/
    cards.csv
    assets/biz-ms-foundations-teahouse.png
    assets/evt-ms-foundations-fair.png
```

Copy `build/card-packs/packs/` into `<contentDir>/packs/` to install it (see
[Card Packs](../../../../docs/DEVELOPER.md#card-packs)).

## Provenance

The card rows are authored for this fixture and released under **CC0 / Public
Domain**, consistent with the project's asset-licensing policy. The two PNG
assets are the canonical deterministic 1×1 PNG seed bytes already used by the
card-pack test fixtures (`tests/fixtures/card-pack/`); they contain no
third-party content.
