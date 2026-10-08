# Card-pack fixtures

Synthetic, dependency-free fixtures for the card-pack DLC feature
(`CG-0MUZFD1WR0031QTB`). They stand in for a real
`<contentDir>/packs/` tree so the manifest parser (`F2`), CSV merge (`F3`),
`tce-packs://` protocol (`F4`), entitlement seams (`F5`), renderer loader and
in-game listing (`F6`), and reference pack builder (`F7`) can be tested without
a launcher, Steam, a game repo, or a packaged Electron app.

## Layout

| Path | Purpose |
|------|---------|
| `manifest.json` | Valid `{ version, packs[] }` document with two compatible packs. |
| `manifest-malformed.json` | Malformed JSON (trailing comma). |
| `manifest-duplicate.json` | Two pack entries sharing the id `fixture-pack`. |
| `manifest-incompatible.json` | Valid shape, `coreEngineVersion: "^9.0.0"` (outside the launcher range). |
| `packs/fixture-game/fixture-pack/cards.csv` | Valid pack CSV fragment (Main Street `card-data.csv` header, one business row). |
| `packs/fixture-game/fixture-pack/cards-duplicate.csv` | Fragment reusing the base card id `biz-bakery` to drive merge-conflict tests. |
| `packs/fixture-game/fixture-pack/assets/icon.png` | Deterministic 1×1 PNG (70 bytes) pack asset. |
| `packs/fixture-game/fixture-pack-two/cards.csv` | Second valid pack fragment (additive multi-pack compose). |
| `packs/fixture-game/fixture-pack-two/assets/icon.png` | Second deterministic 1×1 PNG asset. |
| `helpers.ts` | Shared paths, in-memory manifest builders, and the disposable content-directory helper. |

The committed `packs/` tree mirrors the on-disk target layout
`<contentDir>/packs/<gameId>/<packId>/`, so a materialised fixture is a faithful
stand-in for a real content directory.

## Consuming the fixtures

Prefer the disposable helper for anything that walks a content directory:

```ts
import { withCardPackFixture } from '../fixtures/card-pack/helpers';

await withCardPackFixture(({ contentDir, packsDir, manifestPath, packDir }) => {
  // contentDir is a fresh os.tmpdir() directory; cleaned up automatically.
});
```

For `fs`-read-only tests, use the committed paths directly
(`CARD_PACK_MANIFESTS`, `CARD_PACKS_DIR`, `readCardPackManifestVariant`,
`readCommittedPackCsv`). Build manifest documents in memory with
`makeCardPackManifest` / `makeCardPackManifestJson` — do not hand-roll pack
JSON, and reuse `CARD_PACK_CSV_HEADER` when synthesising a base pool so the pack
schema has a single source of truth.

## Asset provenance

`assets/icon.png` is a hand-authored 1×1 PNG built from the canonical PNG seed
bytes (IHDR/IDAT/IEND). It contains no third-party content and is released under
**CC0 / Public Domain**, consistent with the project's asset-licensing policy
(`public/assets/CREDITS.md`).

## Notes

- These fixtures live under `tests/` and are therefore excluded from production
  builds.
- Do not add a real game, Steam, or Phaser import here — the fixtures must stay
  loadable in a plain Node context.
