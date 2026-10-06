# Runtime game plugins — verification runbook

This runbook verifies the runtime game plugin flow
([CG-0MTRO7VMI000F3A5](../../README.md)) in the **packaged Electron launcher**,
and describes the automated check that mirrors it. It is the verification slice
for feature F8 (`CG-0MUG2ZMPA002BBXM`).

A runtime plugin is a game built as an ESM artifact and dropped into
`<contentDir>/games/`, discovered at startup through `games/manifest.json` —
no launcher rebuild required.

## Contract at a glance

```
<contentDir>/games/
  manifest.json                # { version, games: [entry, …] }
  <game-id>/
    entry.js                   # ESM: named scene-class export + GAME_INFO
    assets/
      thumbnail.png            # optional thumbnail (manifest "thumbnail")
      audio/<game-id>/*.wav    # game-owned audio (packaged by the builder)
      games/<game-id>/*        # game-owned icons/sprites
```

`manifest.json` entry fields: `id`, `sceneKey`, `title`, `description`,
`thumbnail` (optional, artifact-relative), `coreEngineVersion` (semver range),
`entry` (artifact-relative path to the ESM module).

## Prerequisites

- Dependencies installed (`npm install`).
- The renderer/Electron build available (`npm run build` / `npm run build:electron`).
- For the sample game, the sibling repo (`../tce-golf`) checked out.
- `tsx` is available (a devDependency) — the builder runs under it.

## Building a reference artifact

```bash
# Build the 9-Card Golf runtime artifact into build/game-artifacts/
npm run build:game-artifact -- --game golf --preset configs/golf.json
```

The result:

```
build/game-artifacts/
  manifest.json
  golf/
    entry.js
    assets/thumbnail.png
```

`entry.js` externalises `phaser` and the engine aliases
(`@core-engine/*`, `@card-system/*`, `@rule-engine/*`, `@ui/*`, `@ai/*`), so the
artifact does not bundle a second engine/Phaser copy.

The builder also packages the game's **game-owned assets** into
`<artifact>/assets/` (`copyGameOwnedAssets`) — real files the game repo owns
(game audio, icons, game-specific cards). Symlinks to the shared core assets
are skipped: the launcher supplies those. A game-specific audio file that is
absent from the artifact falls back to the launcher's shared
`assets/audio/default/…` at runtime.

## Shared-dependency resolution (import map)

Because the artifact externalises those modules, `entry.js` contains bare ESM
specifiers (`@core-engine/SetupOptions`, `@ui/Renderer`, `phaser`, …). The
electron-mode launcher resolves them with a generated browser **import map**
(`scripts/vite-runtime-shared-plugin.ts`): each engine module is emitted as a
stable `tce-shared/<alias>/<module>.js` entry (path-derived names, no hashes),
Phaser is re-exported as `tce-shared/phaser.js`, and a
`<script type="importmap">` is injected into `dist/index.html` ahead of the
module script. Sharing one build means one engine/Phaser module instance
(class identity preserved). See
[DEVELOPER.md → Runtime Game Plugins](../DEVELOPER.md#runtime-game-plugins).

## Installing the artifact for a packaged launcher

1. Resolve the launcher's content directory (bundled `dist/` by default, or the
   directory passed via `--content-dir <dir>` / `TCE_CONTENT_DIR`).
2. Copy `build/game-artifacts/manifest.json` and the `build/game-artifacts/<id>/`
   directory into `<contentDir>/games/` (merging `manifest.json` if you already
   have runtime games installed).
3. Launch the launcher (`npm run start:electron`).

## Scenarios and expected observations

### A — compatible runtime game

Install an artifact whose `coreEngineVersion` satisfies the launcher's core
version (e.g. `^0.1.0`), then launch.

Expected:

- The Game Selector shows the runtime game's card **alongside** the static
  games, with its thumbnail (served via `tce-games://<id>/assets/thumbnail.png`).
- Clicking the card starts the game.
- No errors in the renderer console for the runtime game.

### B — incompatible runtime game

Set the manifest entry's `coreEngineVersion` to a range the launcher does not
satisfy (e.g. `^9.0.0`) and relaunch.

Expected:

- The game is **absent** from the card grid.
- A notice at the bottom of the selector reads e.g.
  `Incompatible game: 9-Card Golf — requires core v^9.0.0 (launcher is v0.1.0)`.
- The rest of the catalogue is unaffected.

### C — missing or malformed manifest

Rename/remove `games/manifest.json`, or corrupt its JSON, then relaunch.

Expected:

- The launcher boots normally and lists only the static games (no blank screen).
- The renderer console logs a clear error, e.g.
  `[runtime-plugins] <manifest>: Could not read …` or
  `[runtime-plugins] <manifest>: Invalid manifest at …`.

## Automated equivalent

The three scenarios are exercised without Electron by
[`tests/ui/game-plugin-e2e.test.ts`](../../tests/ui/game-plugin-e2e.test.ts),
which builds a real artifact with F7's builder, then drives the loader
(`loadGamePlugins`) and boot merge (`buildGameBootPayload`) with an injected
importer ("stub host"):

```bash
npx vitest run --project unit tests/ui/game-plugin-e2e.test.ts
```

It covers: compatible load + merge, incompatible hide + notice list,
missing manifest, malformed manifest, and the no-content-dir browser path.

The shared-dependency resolution is covered by
[`tests/ui/runtime-shared-import-map.test.ts`](../../tests/ui/runtime-shared-import-map.test.ts)
(discovery, determinism, deep specifiers) and
[`tests/ui/runtime-shared-artifact-coverage.test.ts`](../../tests/ui/runtime-shared-artifact-coverage.test.ts)
(the import map covers every bare specifier a real built artifact emits).

### D — shared-dependency resolution (startable artifact)

This is the scenario the import map closes. It is reproduced end-to-end by:

```bash
npm run verify:runtime-plugin
```

which builds the electron launcher, builds the minimal
`tests/fixtures/runtime-plugin-fixture` artifact into `dist/games/`, serves
`dist/` and, in a real Chromium, asserts the fixture is discovered **and** its
scene starts. A discovery hit proves the artifact's bare specifiers resolved
through the import map; a start hit proves the scene shares the launcher's
single Phaser instance.

Expected output:

```
[verify] catalogue: ["GymRouterScene","RuntimeFixtureScene"]
[verify] runtime fixture discovered + started ✓
[verify] PASS — runtime game plugin shared-dependency resolution works.
```

For the full Electron packaged path, install a real game artifact (the
fixture, or Golf) and run `npm run start:electron`: the runtime game appears in
the selector alongside the static games and starts when its card is clicked.

> **Note:** a real game that also loads its own audio/icons is supported by the
> per-game asset packaging described below; the fixture itself ships no assets
> so that scenario D stays focused on module resolution.

### E — build verification of the injected import map

After `npm run build:electron`, `dist/index.html` must contain an
`importmap` script whose entries all resolve to emitted files. The unit test
`tests/ui/runtime-shared-import-map.test.ts` asserts the mapping; a quick manual
check is:

```bash
grep -c 'type="importmap"' dist/index.html   # → 1
```

## Per-game asset resolution

The import map resolves externalised **modules**. A runtime game's own
**assets** (audio, icons) are packaged in its artifact and served through the
scoped `tce-games://` protocol:

- The builder copies the game's game-owned assets into
  `<artifact>/assets/` (skipping symlinks to the shared core assets).
- The Game Selector activates the runtime game
  (`setActiveRuntimeGame(<id>)`) before starting its scene, so
  `audioPathWithFallback('golf', …)` resolves to
  `tce-games://golf/assets/audio/golf/…` instead of a launcher-relative path.
- When the artifact omits an optional SFX, the `tce-games://` handler serves
  the launcher's shared `<contentDir>/assets/audio/default/<file>`; if it is
  absent everywhere, `SoundManager` skips the key rather than aborting the
  scene.

### Scenario E — a game with its own assets

Build and install a real game artifact (e.g. Golf and its audio), then launch
the packaged launcher and click its selector card.

Expected:

- The game starts and renders; its game-specific audio plays.
- No `Audio key "…" not found in cache` errors, and no 404s for
  `tce-games://<id>/assets/audio/…` in the renderer console.
- A game audio file that the artifact omits silently falls back to the shared
  default (or is skipped) with no scene abort.

Automated coverage: `tests/electron/game-protocol.test.ts` (shared-audio
fallback + traversal denial), `tests/ui/game-asset-url.test.ts` (active runtime
game base), `tests/ui/CardGameScene.test.ts` (`audioPathWithFallback`),
`tests/core-engine/SoundManager.test.ts` (missing-key skip), and
`tests/scripts/build-game-artifact.test.ts` (asset packaging).
