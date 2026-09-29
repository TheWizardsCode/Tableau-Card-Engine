# Runtime game plugin loader fixtures

Synthetic, dependency-free fixtures for the Electron runtime game plugin
loader (CG-0MTRO7VMI000F3A5). They stand in for a real `tce-<game>` Vite
library-mode artifact so the loader's parser, version-compatibility,
dynamic-import, asset-resolution, and selector-merge tests can run without a
game repo or a packaged Electron app.

## Layout

| File | Purpose |
|------|---------|
| `entry.js` | ESM artifact exporting a Phaser-compatible `FixtureGameScene` class and a `GAME_INFO` object. Importable in Node/Vitest. |
| `assets/thumbnail.png` | Deterministic 1×1 PNG (70 bytes) used as the fixture thumbnail. |
| `manifest.json` | Valid manifest with one compatible entry. |
| `manifest-malformed.json` | Malformed JSON (trailing comma). |
| `manifest-incompatible.json` | Valid shape, `coreEngineVersion` outside the launcher range. |
| `manifest-duplicate.json` | Two entries sharing both `id` and `sceneKey`. |
| `manifest-missing-file.json` | Entry points at an `entry` file that is not on disk. |
| `manifest-invalid-range.json` | `coreEngineVersion` is not a valid semver range. |
| `manifest-missing-fields.json` | Entry omits required `coreEngineVersion` and `entry`. |
| `helpers.ts` | Shared paths, `makeManifest(...)` / `makeManifestJson(...)` builders, and `readManifestVariant(...)`. |

## Asset provenance

`assets/thumbnail.png` is a hand-authored 1×1 PNG built from the canonical
PNG seed bytes (IHDR/IDAT/IEND). It contains no third-party content and is
released under **CC0 / Public Domain**, consistent with the project's
asset-licensing policy (`public/assets/CREDITS.md`).

## Notes

- These fixtures live under `tests/` and are therefore excluded from
  production builds.
- Do not add a real game or Phaser import here — the fixture must stay
  loadable in a plain Node context.
