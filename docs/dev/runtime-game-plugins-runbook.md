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
    assets/thumbnail.png       # optional thumbnail (manifest "thumbnail")
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

## Known limitation — shared-dependency resolution in the packaged renderer

The reference builder externalises `phaser` and the engine aliases (as the
artifact contract requires), which leaves **bare ESM specifiers** in `entry.js`.
A plain browser/Electron renderer has no resolver for bare specifiers, so a
drop-in artifact is not yet playable in the packaged launcher until the launcher
exposes its bundled engine/Phaser through an import map (or equivalent shared
registry). This gap is tracked by **CG-0MUV9Y71Z002W8N2** (see the parent epic,
`discovered-from` the runtime-plugin feature). The automated harness above
injects the importer, so it verifies the builder↔loader↔selector contract
independently of that resolution work.
