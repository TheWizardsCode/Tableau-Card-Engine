# Developer Guide

This document covers everything you need to develop, test, and build the Tableau Card Engine (TCE) project. For a high-level overview, see the [README](../README.md).

## Table of Contents

- [Environment Setup](#environment-setup)
- [Running Locally](#running-locally)
- [Building for Production](#building-for-production)
- [Electron Launcher / Desktop Packaging](#electron-launcher--desktop-packaging)
- [Testing](#testing)
- [ToneForge Audio Generation](#toneforge-audio-generation)
- [Project Structure](#project-structure)
- [Path Aliases](#path-aliases)
- [Adding an Example Game](#adding-an-example-game)
- [Hand & Pile Rendering](#hand--pile-rendering)
- [Animation & Sound Feedback for Player and AI Actions](#animation--sound-feedback-for-player-and-ai-actions)
- [Example Games](#example-games)
- [Transcript Persistence](#transcript-persistence)
- [Replay Tool](#replay-tool)
- [Managing Assets](#managing-assets)
- [SVG Rendering & Migration](#svg-rendering--migration)
- [HUD Layer](#hud-layer)
- [Shared HUD Components](#shared-hud-components)
- [Card Upgrade Rendering Pipeline](#card-upgrade-rendering-pipeline)
- [Shared Renderer](#shared-renderer)
- [Screen Layout Language (SLL)](#screen-layout-language-sll)
- [Keeping Docs Up to Date](#keeping-docs-up-to-date)
- [Work-Item Tracking](#work-item-tracking)
- [Troubleshooting](#troubleshooting)

---

## Environment Setup

**Prerequisites:**

- Node.js 18+ (LTS recommended)
- npm 9+ (ships with Node.js 18+)
- Git

**Install dependencies:**

```bash
npm install
```

This installs Phaser 4.0.0-rc.7 as a runtime dependency and TypeScript, Vite, and Vitest as dev dependencies.

## Running Locally

```bash
npm run dev
```

Starts the Vite dev server at `http://localhost:3000` with hot module replacement (HMR). The root `index.html` loads the **Game Selector** landing page, which displays all available example games as clickable cards. Click a game to launch it.

### ToneForge Synth Module

If you plan to use Main Street's ToneForge-backed audio synthesis, generate the synth module first:

```bash
npm run tf:generate
```

If the synth module is missing, `loadMainStreetTfModule()` logs a clear warning and gracefully degrades (returns `null`). Synthesis-based audio will be unavailable but WAV-based sound effects continue to work normally.

### Multi-Game Routing

The project uses a unified entry point (`main.ts` at the project root) that registers a `GameSelectorScene` as the initial Phaser scene alongside all example game scenes. Navigation works as follows:

- **Game Selector -> Game**: Clicking a game card calls `scene.start(sceneKey)` to transition to the selected game's scene.
- **Game -> Game Selector**: Each game scene has a `[ Menu ]` button in its title bar (top-left) and in its end-game overlays that calls `scene.start('GameSelectorScene')` to return to the selector.

The game catalogue is stored in the Phaser registry (key: `gameSelector.games`) via a `preBoot` callback, so game scenes don't need to know about the catalogue to return to the selector.

Each example game also retains its own standalone `main.ts` entry point and `createXxxGame.ts` factory function for independent testing and browser test use.

## Building for Production

```bash
npm run build
```

This runs two steps:
1. `tsc --noEmit` -- TypeScript type-checking (strict mode, no output files)
2. `vite build` -- production bundle to `dist/`

To preview the production build locally:

```bash
npm run preview
```

The preview server binds to all interfaces (`--host`, like `npm run dev`), so it is reachable from the LAN / Tailscale network at `http://<tailscale-ip>:4173/Tableau-Card-Engine/` (the `/Tableau-Card-Engine/` base path comes from the production `base` config used for GitHub Pages).

**Note:** The Phaser library produces a ~2.0 MB chunk with the current Phaser 4 RC bundle. This is expected and can be addressed with code-splitting when needed.

## Deployment / Release

See [RELEASE.md](../RELEASE.md) for the full release workflow, checklist, and verification steps. The CI workflow is `.github/workflows/deploy.yml`.

## Electron Launcher / Desktop Packaging

TCE also ships as a native desktop app (Steam distribution) via an **Electron** launcher in `electron/` that boots the same Vite-built web app in a desktop window. The launcher works without Steam during development; Steam integration (DLC management) is designed for later addition behind a small provider interface.

### Build modes

`vite.config.ts` gates the production `base` on the Vite `mode`:

| Mode | `base` | Used by |
|------|--------|---------|
| `production` | `/Tableau-Card-Engine/` | GitHub Pages (`npm run build`) — unchanged |
| `electron` | `./` (relative, `file://`-safe) | Desktop launcher (`npm run build:electron`) |
| dev/server | `/` | `npm run dev`, tests |

### Prerequisites

- Node.js 20+ (matches CI).
- Playwright Chromium for the browser tests (`npx playwright install chromium`).
- The Electron smoke test needs a display: on headless Linux run it under **xvfb** (`apt install xvfb`); macOS/Windows use their native display. The CI ubuntu runner ships xvfb.

### Build & run the desktop app

```bash
npm run build:electron     # electron-mode Vite build -> dist/ (relative asset URLs)
npm run build:electron-main # compile electron/*.ts -> dist-electron/ + copy preload.cjs
npm run start:electron     # both builds + launch `electron .`
```

`electron .` reads `package.json` `"main": "dist-electron/main.js"`. The main process (ESM) creates the `BrowserWindow`, loads the resolved content entry via `loadFile`, and exposes read-only host info (resolved content dir, app version, runtime versions) to the renderer through the preload context bridge (`window.tce`) with `contextIsolation` on and `nodeIntegration` off.

### Packaging a binary

```bash
npm run package        # host platform (Windows NSIS on Windows, AppImage/tar.gz on Linux, dmg on macOS)
npm run package:win    # Windows NSIS installer + win-unpacked (primary Steam artifact)
npm run package:linux  # AppImage + tar.gz
npm run package:mac    # dmg
```

Output goes to the gitignored `release/` directory. Config: `electron-builder.yml` (app id `com.thewizardscode.tableaucardengine`, asar containing only `dist/` + `dist-electron/` + `package.json` — the renderer and Phaser are Vite-bundled, so no `node_modules` are needed). Packaging runs with `--publish never` (private repo; binaries are uploaded to Steam manually). The Windows binary is also built reproducibly by CI on every push to `main` (`.github/workflows/package.yml`) and uploaded as a workflow artifact.

### Skill: release-windows

`.pi/skills/release-windows/` provides a repo-local skill (`/skill:release-windows`) that promotes the latest CI-built Windows installer to a **draft** GitHub Release — the operator's approval gate is the draft itself (review + publish in the GitHub UI; no pre-approval is requested to create the draft).

**Prerequisites:** `gh` CLI authenticated with `repo` scope. Invoke from the repo root.

**Invocation:**

```bash
node .pi/skills/release-windows/scripts/promote-windows-release.mjs --dry-run   # print exact commands, touch nothing
node .pi/skills/release-windows/scripts/promote-windows-release.mjs             # create the draft release
```

**What it does:**

1. Resolves the latest successful `Package Windows Binary` run (`.github/workflows/package.yml`) via `gh run list` — stops with a clear message if none exists.
2. Downloads the `tce-windows-installer` artifact (`gh run download`) and locates `TCE-Setup-<version>.exe`.
3. Derives `v<version>` from the artifact filename and extracts the matching `CHANGELOG.md` section as release notes; falls back to `gh release create --generate-notes` (with an explicit notice) when the section is missing.
4. Creates a **draft only** release (`gh release create v<version> <exe> --draft`) — never publishes, never marks pre-release. An existing `v<version>` tag is reused by `gh`; if a release already exists the skill skips and reports its URL (idempotent, exit 0).
5. Prints the draft URL and reminds the operator to review and publish it in the GitHub UI.

**Exit codes:** `0` success/skip; non-zero fatal (no successful run, download failure, missing installer, release creation failure). Windows Setup only — Linux/macOS assets are out of scope. See `SKILL.md` in that directory for the full workflow, error paths, and conventions.

### DLC content directory (Steam model)

Game content defaults to the bundled `dist/` inside the app. For Steam DLC (option a), the launcher reads game content from an external content root — a Steam-managed DLC install directory containing `index.html` + assets — supplied via:

```bash
npm run start:electron -- --content-dir /path/to/dlc
# or
TCE_CONTENT_DIR=/path/to/dlc npm run start:electron
```

The resolution lives in `electron/content-locator.ts` (pure Node, unit-tested) behind the `ContentDirectoryProvider` interface, so a future Steamworks-backed provider (option b, programmatic DLC management) can be added without changing the launcher's load path. Missing/invalid directories are rejected with a structured `ContentLocatorError` (clear message + exit code).

### Electron smoke test

The Playwright-Electron launch test (`tests/electron/launch-smoke.test.ts`) launches the real Electron app and asserts the Game Selector renders, the preload bridge is exposed, and clicking a selector card boots a game scene. It runs in its own vitest project so it never slows the regular suites:

```bash
# dev-build mode (rebuilds the electron-mode bundle first)
npx vitest run --project electron        # needs a display (xvfb on headless Linux)

# packaged-binary mode (CI packaging job uses this)
TCE_SMOKE_BINARY=/path/to/binary npx vitest run --project electron
```

`npm test` includes this stage and skips it automatically when no display and no `xvfb-run` are available (see `scripts/run-ci-tests.sh`).

## Testing

```bash
npm run monte-carlo       # run the Main Street Monte Carlo harness (JSON + CSV outputs)
npm run monte-carlo-sweep  # sweep strategy × difficulty combinations (per-combo JSON + CSV in results/)
npm run save-load-smoke    # deterministic save/restore + campaign round-trip smoke (exit 0 = pass)
npm test            # run all tests once (unit + browser, no tracked-asset restore step)
npm run tf:generate # generate tf audio artifacts (out-of-repo build/tf-synths)
```

The MC harness scripts import deck-building functions from `MainStreetCards.ts` (which loads
`card-data.csv` via Vite's `?raw`), so all three run under `vite-node` — the Vite-aware ESM
loader — never tsx (see the same rationale in `docs/main-street/card-catalog.md`).

`npm test` is intentionally non-destructive and must not mutate tracked source assets such as `public/assets/games/main-street/svg/cards`. If asset regeneration is needed, run the dedicated generation scripts explicitly.

> **PR CI is build-only (CG-0MT022826006EM0D):** GitHub Actions `pr-checks.yml` gates on `npm run build` only. The full test suite is run locally before every push (quality gates in `AGENTS.md`) and is intentionally not re-run in PR CI: the Phaser 4 browser suite outgrew the single-Chromium-instance context budget in the constrained CI environment (reliably hard-killed mid-run). The Monte Carlo env-var table below therefore applies to **local** runs (and any future CI that re-enables tests), not to PR CI.

### Monte Carlo environment variables

The Main Street balance guardrail (`tests/main-street/monte-carlo-balance.test.ts`) and harness
script (`scripts/monte-carlo.ts`) are configurable via environment variables so that PR CI runs
quickly while the main branch retains full, strict checks:

| Variable | Default | PR value | Main value | Description |
|---|---|---|---|---|
| `MONTE_SEEDS` | 20 | 20 | 200 | Number of deterministic seeds to simulate |
| `MONTE_MIN_WIN_RATE` | 0.20 | 0.20 | 0.30 | Minimum acceptable win rate |
| `MONTE_MAX_WIN_RATE` | 0.96 | 0.96 | 0.96 | Maximum acceptable win rate |

Detailed pacing metrics (median score, grid fill timing, loss-reason dominance) are only asserted
when `MONTE_SEEDS >= 50`, since they are not statistically meaningful for small sample sizes.

**Examples:**

```bash
# Fast local run (default — same as PR CI):
npm test

# Reproduce main branch CI conditions locally:
MONTE_SEEDS=200 MONTE_MIN_WIN_RATE=0.30 MONTE_MAX_WIN_RATE=0.60 npm test

# Run the harness script with a custom seed count:
MONTE_SEEDS=50 npm run monte-carlo

# Fully explicit override:
MONTE_SEEDS=200 MONTE_MIN_WIN_RATE=0.20 MONTE_MAX_WIN_RATE=0.96 npm test
```

Tests use [Vitest](https://vitest.dev/) with projects configured inline in `vite.config.ts`:

| Project | Environment | File Pattern | Purpose |
|---------|-------------|-------------|---------|
| `unit` | Node.js | `tests/**/*.test.ts` (excludes `replay-*.test.ts`) | Logic, data, and integration tests — runs in parallel (worker pool capped at `maxWorkers: 4`; see contention mitigation below) |
| `replay-e2e` | Node.js (fork pool) | `tests/e2e/replay-*.test.ts` | Playwright-driven replay e2e tests. Runs in its own fork (`singleFork: true`) after unit tests to avoid Vite cold-start CPU contention |
| `smoke` | Chromium (Playwright) | 10 explicit files (see [smoke profile](#smoke-tests)) | One representative test per game + core engine/UI smoke. ~30s for rapid feedback during implementation |
| `dev` | Chromium (Playwright) | 30 explicit files (see [dev profile](#dev-tests)) | Smoke + key E2E per game. ~3 min for the implement/audit workflow |
| `browser` | Chromium (Playwright) | `tests/**/*.browser.test.ts` (excludes tutorial E2E) | All non-tutorial Phaser UI and rendering tests (requires [browser test setup](#browser-test-setup)) |
| `tutorial-part1..6` | Chromium (Playwright, one per part) | `tests/e2e/main-street-tutorial-e2e-part{1-6}.browser.test.ts` | Main Street tutorial E2E tests (each in own browser instance; requires [browser test setup](#browser-test-setup)) |

All projects run via `npm test`. The browser and tutorial projects run in headless Chromium using `@vitest/browser` with the Playwright provider.

The tutorial E2E tests are split into 6 part files (1-6 tests per file). Each part is a separate Vitest project with its own uniquely-named browser instance (`t1` through `t6`) to prevent the Phaser 4 RC GPU/Canvas context exhaustion that occurs after ~8 game create/destroy cycles in a single browser process. The runner script `scripts/run-tutorial-tests.sh` invokes each project sequentially.

The replay E2E tests live in `tests/e2e/replay-*.test.ts` and use a dedicated Node.js project (`replay-e2e`) with `pool: 'forks'` + `singleFork: true`. This isolates them from the parallel unit test pool, ensuring the Vite dev server started by `scripts/replay.ts` has uncontested CPU for its initial cold compilation. The replay tests start and stop their own dev server per run via `scripts/dev-server-utils.ts`.

#### CPU-contention mitigation (unit and browser tests)

Full-suite runs can intermittently fail at teardown with
`Error: [vitest-worker]: Timeout calling "onTaskUpdate"` even though every test file
passed. Root cause (see CG-0MS9M5UJP005PWD3): Vitest's worker RPC layer uses
birpc with a hard-coded 60s timeout (`DEFAULT_TIMEOUT = 6e4` in Vitest internals —
not a configurable knob). Under CPU contention (e.g. concurrent vitest processes
on a 16-core workstation), a worker can miss the 60s window while reporting test
results back to the main process, and Vitest exits non-zero despite a fully-green
run. Browser-mode runs have a sibling failure mode (see CG-0MSCI73RH004VPCE): when
the browser RPC WebSocket is dropped under load, vitest browser mode closes the
connection and exits non-zero with
`[vitest] Browser connection was closed while running tests.` even though every
file completed. Because `scripts/run-ci-tests.sh` runs with `set -euo pipefail`,
those non-zero exits previously aborted the CI gate after the unit/browser step.

Two mitigations are in place in this repository:

1. **Worker-pool cap** — the `unit` project in `vite.config.ts` sets
   `maxWorkers: 4` to bound aggregate CPU demand from parallel tinypool workers.
2. **Retry-once on the transient signatures** — the unit **and** browser steps in
   `scripts/run-ci-tests.sh` run through `scripts/vitest-run-with-retry.ts`, which
   retries the run exactly once when (and only when) the reporter summary shows
   **all** files passed **and** the sole error is one of the transient signatures
   (`[vitest-worker]: Timeout calling "onTaskUpdate"` or
   `[vitest] Browser connection was closed while running tests`). The masking
   guard (`shouldRetryOnce` in that script, unit-tested in
   `tests/scripts/vitest-run-with-retry.test.ts`) proves "all passed" from the
   summary before a retry is allowed, so a genuine test failure can never be
   hidden by a retry.

3. **Test-side hardening (browser tests)** — beyond the runner-level
   mitigations above, browser tests that drive the real Phaser pointer
   pipeline (dispatched DOM events at layout-derived canvas coordinates, e.g.
   the Main Street slot-click suites) can intermittently have their click
   dropped or delayed when the RAF-driven game loop is starved of frames by
   parallel full-suite runs. Two conventions keep these suites green under
   contention without masking real regressions:

   - **Generous per-wait budgets**: animation- or frame-loop-gated waits (a
     triggered reveal, a dialog created by a transfer-completion callback)
     use multi-second budgets (5-10s per step) instead of tight sub-second
     expects, bounded by an explicit per-test timeout (e.g. 90s) rather than
     Vitest's default.
   - **Retry a dropped click**: when a real-pointer click is expected to move
     the scene out of an interaction phase (e.g. `uiPhase` leaves
     `'placing-from-hand'`), poll for the phase change and re-dispatch the
     click on a short interval if the phase has not moved, within a generous
     retry window (30s) that leaves headroom under the test's total budget.
     Re-dispatch is safe because the interaction handler no-ops once the
     phase has moved.
   - **Deterministic boot conditions**: tests that assume a buyable market
     card at boot set generous coins (e.g. `resourceBank.coins = 100`)
     rather than relying on the random seed's initial market draw — the
     default boot is not guaranteed to contain an affordable
     business/community-space card (see `tests/main-street/undo-redo.browser.test.ts`).
   - **Clear stale persistent checkpoints before boot**: a Main Street boot
     checks for a saved run checkpoint (tutorial mode included) and, if one
     exists, shows the resume overlay — a full-screen interactive backdrop
     (depth 2000, no pointerdown handler) that hides the start UI and
     swallows every street-slot click under `topOnly`. An end-of-turn
     auto-save from an earlier test/file/run therefore turns any later
     booting/interaction suite into a false failure until the checkpoint is
     cleared. Tests that boot Main Street wipe IndexedDB + localStorage at
     boot (non-blocking `deleteDatabase`, resolving on `onblocked`) — see
     `clearPersistentStorage()` in
     `tests/main-street/click-place.browser.test.ts`,
     `tests/main-street/composite-click.browser.test.ts`,
     `tests/main-street/drag.browser.test.ts`,
     `tests/main-street/hint-bar-placement.browser.test.ts`,
     `tests/main-street/undo-redo.browser.test.ts`, and
     `tests/ui/MainStreetMigration.browser.test.ts`. This is not just a
     visual-overlay hazard: a mid-day checkpoint restores a partially-sold
     market row with no business cards, so tests that assume a buyable
     business card (e.g. undo-redo's affordable-card finder) fail unless the
     checkpoint is cleared first (the ≥1-business guarantee applies at
     refill time only).
   - **Content-aware render gates**: fixed-frame waits (`waitFrames(24)`)
     with a hard 2s fallback resolve while a CPU-starved RAF loop has only
     produced a couple of frames, so pixel-analysis assertions can sample an
     unrendered canvas. `MainStreetMigration.browser.test.ts` first waits
     until the market container actually holds rendered card objects
     (`waitForSceneContent`, 15s budget) before the frame wait and the pixel
     pass — see the migration smoke suite.
   - **Generous boot/UI budgets for every Phaser scene**: boot-time work
     (SVG regeneration, tutorial offer flow) and RAF-gated UI waits stretch
     under parallel-browser contention. The coldest Main Street boot
     (first boot of a file, all-scene SVG regeneration plus the tutorial
     offer flow) has been observed to exceed 30s under full-suite
     contention, so the tutorial boot wait uses a 40s budget with a 90s
     beforeEach hook
     (`waitForStartButton(..., 40_000)` in
     `tests/main-street/TutorialOverlayClickThrough.browser.test.ts`);
     composite's premium-dialog wait factors loop liveness (frozen RAF
     detection) into a 60s deadline instead of a blind timer
     (`tests/main-street/composite-click.browser.test.ts`); and peek's
     tween-completion waits use 10s budgets
     (`tests/main-street/peek.browser.test.ts`), matching the 5-10s
     per-wait convention. A beforeEach hook that boots a game plus waits for
     UI must raise its own budget beyond Vitest's default 30s (e.g. 90s for
     the tutorial file) or the hook itself times out while the boot is still
     legitimately progressing.
   - **Subprocess-launching unit tests need generous per-test timeouts**: a
     unit test that spawns a vite-node / npm child process (cold TS
     transpile of the whole module graph) can exceed the unit project's 15s
     default `testTimeout` under parallel-suite saturation — the child has
     its own generous `runCmd` budget (180s) but the vitest cap fires
     first. `tests/main-street/harness-cli.test.ts` therefore sets an
     explicit `180_000` per-test timeout on its monte-carlo and
     save-load-smoke subprocess tests (matching the `replay-e2e` project's
     `180_000` precedent).

   References (CG-0MTF70V9X002CAYH): `tests/main-street/incident-reveal.browser.test.ts`
   and `tests/main-street/composite-click.browser.test.ts`.

#### Hang timeout (bounded wall-clock abort)

The transient signatures above cover runs that **exit** non-zero. A different
failure mode (CG-0MT08R2QR0070F3N) never exits at all: under heavy CPU
contention (load avg 14-35 on 16 cores), a browser test can stall indefinitely
— e.g. a `requestAnimationFrame` loop starved of frames, or a Phaser game
destroy in `afterEach` that never completes — leaving the whole browser stage
hanging with no exit code. The retry path cannot help: a hang produces no
output to mask against.

Mitigation: every attempt in `scripts/vitest-run-with-retry.ts` is bounded by
a wall-clock timeout. The runner spawns vitest asynchronously into its own
process group; when the bound elapses the whole group (vitest + tinypool
workers + Playwright Chromium) is SIGTERMed (graceful shutdown), then
SIGKILLed after a short grace period if it survives. An async `spawn` is
required: a `spawnSync` with a `timeout` hangs forever if the child ignores
SIGTERM, which would defeat the whole point against a genuinely hung
process. When the bound elapses the runner exits with code **124**
(`HANG_TIMEOUT_EXIT_CODE`, the conventional GNU-timeout exit code; vitest
itself only ever exits 0 or 1) after printing a `[hang-timeout]` diagnostic
with re-run guidance. Hangs are **never retried** — a genuine hang must
surface, not be masked. `scripts/run-ci-tests.sh` sets the bounds
explicitly: 5 minutes for the unit stage, 15 minutes for the browser stage
(`--timeout-ms <n>`, default 10 minutes in the runner itself). The browser
bound is deliberately generous — ~40 files at 8-10s each runs 6-8 minutes
nominal, and concurrent full-suite runs from parallel worktrees can stretch
it past 12 — while a true hang never completes and is still bounded. Under
`set -euo pipefail` the 124 exit aborts the gate instead of stalling it
indefinitely.

Diagnosing a hang: `[hang-timeout]` in the output identifies the stage;
re-run the suspected file(s) in isolation via
`npx vitest run --project browser tests/<file>` to see whether the hang
reproduces without suite-wide contention. If it does, look for an unresolved
`Phaser.Game` (the `afterEach` must destroy it) or a frame-wait helper without
a timeout fallback. Exit codes from the runner: 0/1 from vitest, 124 on hang
abort, 2 on an invalid `--timeout-ms` value.

If you see the worker-timeout error repeatedly under sustained load, run the
suites sequentially (e.g. `npx vitest run --project unit` alone) rather than
launching concurrent full-suite runs, and check for other vitest processes
competing for CPU.

The helper module at `tests/helpers/main-street-tutorial-e2e.ts` contains shared game lifecycle utilities (`bootGameWithTutorial`, `destroyGame` with CanvasPool drain), diagnostic error messages, and click helpers for tutorial step advancement.

During Vitest runs, the dev-only transcript persistence middleware (`POST /api/transcripts`) is intentionally disabled even though Vitest browser mode uses an internal Vite server. This prevents file-system side effects and reduces harness noise/flakiness during test execution.

### Dev-server transcript persistence: memory-safety bounds

When running `npm run dev`, the dev server exposes `POST /api/transcripts` (via `scripts/vite-transcript-plugin.ts`) so the browser can persist game transcripts to `data/transcripts/<game>/`. Three bounds keep this endpoint from growing the dev-server process without limit (fix for CG-0MSXL0A25009WZVK):

1. **Body size cap** — request bodies larger than 5 MiB are rejected with `413`. Transcripts are at most ~2.4 MB (largest fixture), so real saves are never rejected; the cap prevents a client from buffering an unbounded body in server memory (the previous `body += chunk.toString()` concat had no limit and ran in O(n²)).
2. **Write rate limit** — at most one accepted write per second (subsequent requests receive `429`). This prevents a misbehaving save loop from flooding the watched tree with new files.
3. **Watcher ignore list** — `server.watch.ignored` in `vite.config.ts` excludes the dev-output trees (`**/data/**`, `**/tmp/**`, `**/results/**`, `**/dist/**`, `**/dist-electron/**` via `DEV_WATCH_IGNORE_PATTERNS`). Vite does **not** consult `.gitignore` for watching, and every new file written into a watched directory previously created a permanently-retained inotify watcher + path strings in the dev server (measured ~10-43 KB/file of unbounded growth), which contributed to dev-server heap OOMs during long sessions/play-throughs.

The on-disk contract is unchanged: transcripts land at `data/transcripts/<gameType>/<gameType>-<ISO-timestamp>.json`, so `scripts/replay.ts` and `scripts/export-transcripts.ts` keep working without modification. The middleware's bounded-input behaviour is unit-tested in `tests/scripts/vite-transcript-plugin.test.ts`, and the watcher-ignore wiring in `tests/scripts/vite-transcript-plugin.test.ts` (config contract).

### Writing unit tests

- Place test files in `tests/` following the `*.test.ts` pattern
- Import from `vitest` directly: `import { describe, it, expect } from 'vitest'`
- Vitest globals are enabled -- `describe`, `it`, `expect` are available without imports in test files

### Smoke Tests

Run `npm run test:smoke` (or `npx vitest run --project smoke`) for rapid feedback during implementation. The smoke profile runs one representative test per game plus core engine/UI smoke tests — target runtime is ~30 seconds for 10 files.

**Smoke profile files:**
- `tests/main-street/MainStreetScene.browser.test.ts` (Main Street core game flow)
- `tests/golf/GolfScene.browser.test.ts` (Golf core flow)
- `tests/feudalism/FeudalismSmokeTest.browser.test.ts` (FC smoke)
- `tests/beleaguered-castle/BeleagueredCastleOverlay.browser.test.ts` (BC overlay)
- `tests/coloretto/ColorettoScene.browser.test.ts` (Coloretto core)
- `tests/sushi-go/SushiGoIcons.browser.test.ts` (Sushi Go rendering)
- `tests/lost-cities/LostCitiesRoundEnd.browser.test.ts` (Lost Cities flow)
- `tests/core-engine/SvgHelpers.browser.test.ts` (Core SVG pipeline)
- `tests/ui/HelpPanel.browser.test.ts` (UI chrome)
- `tests/gym/GymSceneSmoke.browser.test.ts` (All 19 gym scenes boot)

### Dev Tests

Run `npm run test:dev` (or `npx vitest run --project dev`) for a more comprehensive but still fast suite. The dev profile adds key E2E tests per game on top of all smoke tests — target runtime is ~3 minutes for ~30 files.

**Dev profile coverage:**
- All smoke files (above)
- Core + UI: `SvgHelpers`, `PhaserEventBridge`, `HelpPanel`, `TooltipManager`, `SettingsPanelTooltips`
- Main Street key E2E: `MainStreetScene`, `drag`, `undo-redo`, `MainStreetOverlay`, `game-over`
- Golf key E2E: `GolfScene`, `GolfInteraction`, `GolfEvents`
- FC key E2E: `FeudalismSmokeTest`, `FeudalismSelection`, `FeudalismLayout`
- BC key E2E: `BeleagueredCastleOverlay`, `BeleagueredCastleTurnController`, `BeleagueredCastleLayout`
- Sushi Go key E2E: `SushiGoIcons`, `SushiGoOverlay`, `SushiGoTableauRendering`
- Lost Cities key E2E: `LostCitiesRoundEnd`, `LostCitiesOverlayAlignment`
- Coloretto: `ColorettoScene`
- HandView: `gym-handpile-drag`, `gym-handpile-cancel`
- Gym: `GymDeckRngScene`, `GymOverlayUiScene`

Tutorial E2E tests are excluded from smoke and dev profiles (run in CI only).

### Writing browser tests

Browser tests verify Phaser UI rendering and interactions in a real browser environment. Phaser requires WebGL/Canvas and cannot run in JSDOM or happy-dom.

- Use the `*.browser.test.ts` pattern to mark tests for the browser project
- Tests run in headless Chromium via Playwright -- no visible browser window
- Import `createGolfGame` from the game's factory module to boot Phaser inside the test
- Wait for the scene to become active before making assertions
- Clean up the game instance in `afterEach` to avoid resource leaks
- Access Phaser game objects via `game.scene.getScene('SceneKey').children.list`

**Example:**

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { createGolfGame } from '../../example-games/golf/createGolfGame';

describe('MyScene browser tests', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
  });

  it('should render a canvas', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = createGolfGame();
    // wait for scene, then assert...
  });
});
```

### Tutorial E2E Tests

The Main Street tutorial E2E tests are defined in `tests/e2e/main-street-tutorial-e2e-part{1-6}.browser.test.ts`. Each part tests a subset of the tutorial flow. They use shared helpers from `tests/helpers/main-street-tutorial-e2e.ts`.

**Key design decisions:**

- **Per-file browser isolation:** Each tutorial part is a separate Vitest project with its own browser instance. This avoids Phaser 4 RC's canvas/GPU context exhaustion from sequential game create/destroy cycles.
- **Enhanced cleanup:** The `destroyGame` helper drains Phaser's CanvasPool after each test, force-releases canvas contexts by resetting canvas dimensions to 0, and removes orphaned canvases from the DOM.
- **Diagnostic tracking:** `bootGameWithTutorial` tracks boot cycles and provides detailed error messages if canvas context is null, including the cycle number, remaining canvas count, and CanvasPool state.
- **New project:** `scripts/run-ci-tests.sh` orchestrates the full CI test suite (unit → browser → tutorial E2E).

### Browser test setup

The `browser` and `tutorial-part1..6` projects run in headless Chromium via Playwright. On a clean checkout, the browser binary must be installed once before any browser test can run.

**Required dependencies** (already in `package.json` devDependencies):

- `playwright` — Playwright driver that launches Chromium
- `@vitest/browser` — Vitest browser-mode provider (must match the `vitest` version)

**Install Chromium:**

```bash
npx playwright install chromium
```

On Linux, Playwright also needs a set of system libraries. Install them with the system-dependencies variant (prepend `sudo` if your user lacks write access for the package manager):

```bash
npx playwright install --with-deps chromium
```

**Verify the installation:**

```bash
npx playwright install --list
```

This lists the installed browsers and their expected locations (e.g. `chromium-1208`).

**Fast-fail pre-check:** `npm test` (`scripts/run-ci-tests.sh`) and a direct `bash scripts/run-tutorial-tests.sh` run `scripts/check-browser-test-env.ts` first. The pre-check detects a missing Chromium binary launch-free (via `chromium.executablePath()` + `fs.existsSync()`, under 2 seconds) and aborts with the exact remediation command above — instead of failing minutes later with an opaque Vitest browser error. PR CI is build-only (CG-0MT022826006EM0D) and no longer runs browser tests; local devs run `npx playwright install chromium` once (see [Browser test setup](#browser-test-setup)).

## ToneForge Audio Generation

ToneForge-generated synth artifacts are integrated via a thin adapter and are **not committed** to source control.

```bash
npm run tf:generate
```

This runs `scripts/tf-generate-synths.sh` and writes generated outputs under `build/tf-synths/`, including a runtime synth module (`main-street-runtime-synth.mjs`) used for on-the-fly synthesis.

> **Missing module handling:** If the runtime synth module is absent, `loadMainStreetTfModule()` in `mainStreetTfModule.ts` logs a clear `console.warn` message with instructions to run `npm run tf:generate`, then gracefully returns `null` without triggering a Chromium module-loading error. Synthesis-based audio degrades silently; WAV-based SFX and game logic are unaffected.

See `docs/the-build/audio.md` for full details (module shape, mapping, runtime wiring, CI guidance).

### SFX Key Naming Convention

All sound effects use the `sfx-` prefix with no game identifier. Common cross-game
keys are defined in `COMMON_SFX_KEYS` (exported from `src/core-engine/SoundManager.ts`).
Audio assets are organized in `public/assets/audio/<game>/` with a fallback to
`public/assets/audio/default/`. See `docs/SFX_CONVENTION.md` for the full convention.

## Project Structure

```
src/
├── core-engine/            Game loop, state management, turn sequencing, utilities
│   ├── GameState.ts        GameState<T>, createGameState (deprecated for setup — use SetupOptions)
│   ├── SetupOptions.ts     BaseSetupOptions, MultiplayerSetupOptions, resolveSetupOptions
│   ├── SeededRng.ts        createSeededRng — deterministic PRNG (LCG) for shuffles and AI
│   ├── ActiveEffect.ts     Duration-based modifier system (create, decay, apply, query)
│   ├── CheckpointManager.ts   Checkpoint save-and-resume abstraction (save, load, clear, checkAndResume)
│   ├── CheckpointResumeOverlay.ts Built-in default resume overlay component
│   ├── TranscriptRecorder.ts BaseTranscript interface, TranscriptRecorderBase<T> abstract base class
│   ├── TurnSequencer.ts    advanceTurn, getCurrentPlayer, startGame, endGame
│   └── index.ts            Barrel file / public API
├── card-system/            Card, Deck, Pile abstractions
│   ├── Card.ts             Rank, Suit, Card type, createCard
│   ├── Deck.ts             createStandardDeck, shuffle, draw, drawOrThrow
│   ├── Pile.ts             Pile class (push, pop, peek, isEmpty, size)
│   └── index.ts            Barrel file / public API
├── rule-engine/index.ts    Rule definitions (stub -- game-specific rules live with games)
├── ai/                     Shared AI strategy abstractions and utilities
│   ├── AiStrategy.ts       AiStrategyBase interface, AiPlayer<TStrategy> generic base class
│   ├── AiUtils.ts          pickRandom<T>, pickBest<T> utility functions
│   └── index.ts            Barrel file / public API
└── ui/
    ├── GameSelectorScene.ts Game selector landing page (GameEntry, REGISTRY_KEY_GAMES)
    ├── HelpPanel.ts         Reusable help panel component
    ├── HelpButton.ts        Help button component
    └── index.ts             Barrel file / public API

example-games/
├── gym/
│   ├── README.md               Gym documentation and quick-start instructions
│   ├── GymRegistry.ts           Scene key constants and catalogue
│   ├── index.ts                 Barrel file / public API
│   ├── layouts/                 SLL sample layout JSON documents for GymSllScene
│   └── scenes/
│       ├── GymRouterScene.ts    Landing page with navigation cards
│       ├── GymSceneBase.ts      Shared base class for all Gym scenes
│       ├── GymDeckRngScene.ts   Deck lifecycle & seeded RNG demo
│       ├── GymHandPileScene.ts  Hand/pile interaction demo (bottom-anchored hand arc + live arc/spacing/rotation/raise sliders)
│       ├── GymOverlayUiScene.ts Overlay & UI configuration demo
│       ├── GymUndoRedoScene.ts  Undo/redo workflow demo
│       ├── GymTranscriptScene.ts Transcript recording demo
│       ├── GymSaveLoadScene.ts  Save/load state demo
│       ├── GymAudioFeedbackScene.ts Audio & feedback configuration demo
│       ├── GymGraphicsShaderSpikeScene.ts Shader & blend mode spike
│       ├── GymGraphicsLightingSpikeScene.ts Lighting spike
│       └── GymSllScene.ts       Screen Layout Language demo (schema+mapping+overlay)
├── golf/
│   ├── main.ts                 Game entry point (Phaser.Game config)
│   ├── createGolfGame.ts       Factory function (used by main.ts and tests)
│   ├── GolfGrid.ts             3x3 grid type and utilities
│   ├── GolfRules.ts            Turn legality, move application, round-end detection
│   ├── GolfScoring.ts          Card point values, grid scoring, column matching
│   ├── GolfGame.ts             Game orchestration (session setup, turn execution)
│   ├── AiStrategy.ts           AI players with configurable skillRating (default 80) and
│   │                        CardMemoryTracker for discard-pile memory across turns
│   ├── GameTranscript.ts       Transcript recording (TranscriptRecorder)
│   └── scenes/
│       └── GolfScene.ts        Phaser scene (full visual interface)
├── beleaguered-castle/
│   ├── main.ts                         Game entry point
│   ├── createBeleagueredCastleGame.ts   Factory function (used by main.ts)
│   ├── BeleagueredCastleState.ts        State types, move types, constants
│   ├── BeleagueredCastleRules.ts        Pure game logic (deal, moves, win/loss; classic + Citadel deal variants)
│   ├── BeleagueredCastleVariant.ts      Citadel/Classic variant selection persistence (localStorage)
│   ├── BeleagueredCastleAi.ts           AI solver (search + heuristics) powering the hint system
│   ├── GameTranscript.ts               Transcript recording (BCTranscriptRecorder)
│   ├── help-content.json               Help panel content (rules, controls, tips)
│   └── scenes/
│       └── BeleagueredCastleScene.ts   Phaser scene (full visual interface)
├── sushi-go/
│   ├── main.ts                 Game entry point
│   ├── createSushiGoGame.ts    Factory function (used by main.ts and tests)
│   ├── SushiGoCards.ts         Card types, deck creation, card-back texture generation
│   ├── SushiGoGame.ts          Game orchestration (drafting rounds, scoring)
│   ├── SushiGoScoring.ts       Set-collection scoring rules (Maki, Tempura, etc.)
│   ├── AiStrategy.ts           AI strategies (RandomStrategy, GreedyStrategy)
│   ├── help-content.json       Help panel content
│   └── scenes/
│       └── SushiGoScene.ts     Phaser scene (drafting UI, card picking)
├── feudalism/
│   ├── main.ts                 Game entry point
│   ├── createFeudalismGame.ts   Factory function (used by main.ts and tests)
│   ├── FeudalismCards.ts        Development cards, nobles, gem types, tier data
│   ├── FeudalismGame.ts         Game orchestration (token collection, purchases, nobles)
│   ├── AiStrategy.ts           AI strategies (RandomStrategy, GreedyStrategy)
│   ├── help-content.json       Help panel content
│   └── scenes/
│       └── FeudalismScene.ts    Phaser scene (gem tokens, card market, purchases)
└── lost-cities/
    ├── LostCitiesCards.ts      Card types, deck factory, 5 expedition colors, card helpers
    ├── LostCitiesRules.ts      Two-phase turn model, ascending-play validation, legality checks
    ├── LostCitiesScoring.ts    Expedition scoring (-20 base, investments, 8-card bonus)
    ├── LostCitiesGame.ts       Match manager (3-round session, executeAction, state queries)
    ├── AiStrategy.ts           AI strategies (RandomStrategy, GreedyStrategy)
    ├── GameTranscript.ts       Transcript recording (LCTranscriptRecorder)
    ├── help-content.json       Help panel content (rules, scoring, controls)
    └── scenes/
        ├── LostCitiesMockScene.ts  Static layout mockup (development aid)
        └── LostCitiesScene.ts      Phaser scene (interactive play with animations)
scripts/
├── replay.ts                       Replay CLI (Playwright-driven transcript replay + screenshots)
├── generate-thumbnail.ts           Thumbnail generator (midpoint frame -> 120x68 PNG)
├── refresh-thumbnails.sh           Batch thumbnail refresh for all games
├── generate-*-fixture-transcript.ts  Per-game fixture transcript generators
└── adapters/
    ├── ReplayAdapter.ts            ReplayAdapter interface (contract for all adapters)
    ├── AdapterRegistry.ts          Singleton adapter registry
    ├── index.ts                    Barrel file (imports and registers all adapters)
    ├── BeleagueredCastleReplayAdapter.ts
    ├── LostCitiesReplayAdapter.ts
    ├── SushiGoReplayAdapter.ts
    ├── FeudalismReplayAdapter.ts
    ├── MainStreetReplayAdapter.ts
    └── GolfReplayAdapter.ts        (structural detection fallback -- registered last)

public/assets/
├── cards/                  52 standard card SVGs + card_back.svg (140x190px, CC0)
│   └── lost-cities/        60 Lost Cities expedition card SVGs + lc-back.svg (140x190px)
├── games/                  Per-game assets (thumbnails)
│   ├── golf/thumbnail.png
│   ├── beleaguered-castle/thumbnail.png
│   ├── lost-cities/thumbnail.png
│   ├── sushi-go/thumbnail.png
│   └── feudalism/thumbnail.png
└── CREDITS.md              Asset attribution

tests/
├── fixtures/transcripts/   Fixture transcripts for replay tests (one per game)
├── ai/                     AiPlayer, pickRandom, pickBest, barrel export tests
├── card-system/            Card, Deck, Pile unit tests
├── core-engine/            GameState, TurnSequencer, UndoRedoManager, SeededRng, TranscriptRecorder unit tests
├── golf/                   Golf game unit + integration + browser tests
├── beleaguered-castle/     Beleaguered Castle unit + integration tests
├── sushi-go/               Sushi Go! cards, scoring, game, AI tests
├── feudalism/               Feudalism cards, game, AI tests
├── lost-cities/            Lost Cities cards, scoring, rules, game, AI, transcript tests
├── coloretto/              Coloretto cards, scoring, game, AI, integration tests
└── replay/                 Replay CLI validation tests
```

Each `src/` module has a barrel file (`index.ts`) that serves as its public API. Import engine modules using path aliases (see below).

## Path Aliases

The project defines path aliases in both `tsconfig.json` and `vite.config.ts`:

| Alias | Resolves To |
|-------|-------------|
| `@core-engine/*` | `src/core-engine/*` |
| `@card-system/*` | `src/card-system/*` |
| `@rule-engine/*` | `src/rule-engine/*` |
| `@ai/*` | `src/ai/*` |
| `@ui/*` | `src/ui/*` |

Usage in code:

```typescript
import { ENGINE_VERSION } from '@core-engine/index';
```

## Build-Time Version Injection

The app version (from `package.json`'s `version` field) is injected at build time
via Vite's `define` in `vite.config.ts`. The global constant `__APP_VERSION__` is
replaced with the version string during the Vite transform phase (both dev server
and production builds).

The version is displayed as `v<version>` (e.g. `v0.1.7`) in two locations:
- The **GameSelectorScene** menu screen (top-right corner, below the GitHub icon)
- The **SettingsPanel** overlay (shown on the game canvas when the panel opens)

Both use the shared factory `createVersionLabel()` from `src/ui/versionDisplay.ts`,
which provides consistent styling (11px font, muted grey, 60% opacity). The default
placement is the bottom-left corner; scenes may pass optional position and origin
parameters to place the label elsewhere (e.g. the game selector passes top-right
coordinates below the GitHub icon).

```typescript
// src/ui/versionDisplay.ts provides the factory and style constants:
import { createVersionLabel, VERSION_LABEL_TEXT } from '@ui/versionDisplay';

// Usage in a scene:
createVersionLabel(this); // creates a non-interactive version label at bottom-left

// GameSelectorScene: top-right, right-aligned below the GitHub icon:
createVersionLabel(this, undefined, GAME_W - 10, 10 + 28 + 4, 1, 0);
```

The version string can also be referenced directly in code as a `string`:

```typescript
console.log(`App version: ${__APP_VERSION__}`);
```

## Move Validation Pattern

All move validation across the Tableau Card Engine should use the canonical `LegalityResult` type from `@rule-engine/*`. This ensures consistent validation semantics across games and enables generic tooling (AI, replay, transcripts) to work with a uniform contract.

### The `LegalityResult` Type

```typescript
import type { LegalityResult } from '@rule-engine/index';

// Discriminated union:
// { legal: true }          — action is permitted
// { legal: false, reason } — action is forbidden with an explanation
```

### Convenience Helpers

Two convenience constructors are provided:

| Function | Returns |
|----------|---------|
| `legalAction()` | `{ legal: true }` |
| `illegalAction(reason: string)` | `{ legal: false, reason }` |

```typescript
import { legalAction, illegalAction } from '@rule-engine/index';

function validateMove(card: Card): LegalityResult {
  if (!card) return illegalAction('No card provided');
  return legalAction();
}
```

### Discriminating the Result

Callers should use the `legal` discriminant to check the result:

```typescript
const result = validateMove(someCard);
if (!result.legal) {
  // result.reason is a string
  showError(result.reason);
}
// When result.legal is true, result.reason is not present
```

### Games Using the Canonical Pattern

The following games use `LegalityResult` for move validation:

- **Golf** — `GolfRules.checkMoveLegality()`, `checkInitialReveal()`
- **Lost Cities** — `LostCitiesRules.checkPhase1Legality()`, `checkPhase2Legality()`
- **Main Street** — `MainStreetMarket` imports via market validation
- **Sushi Go** — `SushiGoGame.validatePick()` (migrated from `{ valid, reason }`)
- **Feudalism** — `FeudalismGame.validateAction()` and sub-validators (migrated from `string | null`)
- **Beleaguered Castle** — `BeleagueredCastleRules.isLegalFoundationMove()`, `isLegalTableauMove()` (migrated from `boolean`)

### Migration Notes

When migrating an existing game to the canonical pattern:

1. Import `LegalityResult` (as type-only) from `@rule-engine/index`
2. Change the validation function's return type to `LegalityResult`
3. Replace `return true` / `return null` → `return { legal: true }` (or `return legalAction()`)
4. Replace `return false` / `return 'error string'` / `throw Error(...)` → `return { legal: false, reason: '...' }` (or `return illegalAction('...')`)
5. Update all callers to check `result.legal` instead of the old pattern
6. Run `npm test` and `npm run build` to verify

## Adding an Example Game

> **Note:** For engine feature demonstrations (not full games), add a demo scene to the **Gym** instead of creating a new example game. See [Gym documentation](../example-games/gym/README.md) and [Gym scene index](gym/GYM_INDEX.md).

1. Create a directory: `example-games/<game-name>/`
2. Add a standalone entry point: `example-games/<game-name>/main.ts`
3. Add a factory function: `example-games/<game-name>/createXxxGame.ts` (for browser tests)
4. Add scenes: `example-games/<game-name>/scenes/<SceneName>.ts` (extend `Phaser.Scene`)
5. Place assets in `public/assets/<game-name>/` and document attribution in `public/assets/CREDITS.md`
6. Add game-specific tests under `tests/<game-name>/`
7. Register the game in the unified entry point (`main.ts` at the project root):
   - Import the scene class
   - Add it to the `scene` array in the Phaser config
   - Add a `GameEntry` to the `GAMES` catalogue array (include `thumbnail` once available)
8. Add a `[ Menu ]` button to the game scene that calls `this.scene.start('GameSelectorScene')` for navigation back to the selector
9. Add transcript recording:
   - Create `example-games/<game-name>/GameTranscript.ts` with transcript types and a `TranscriptRecorder` extending `TranscriptRecorderBase<T>` from `src/core-engine/TranscriptRecorder.ts`
   - Integrate recording into the scene: create the recorder after game setup, record each turn/action, finalize on game over, and auto-save to `TranscriptStore`
10. Add replay support:
    - Add `loadBoardState(stateJson: string)` to the scene to reconstruct visual state from a transcript snapshot
    - Emit a `state-settled` event (via `GameEventEmitter`) after `loadBoardState()` completes rendering
    - Handle `?mode=replay` URL parameter in the scene to skip normal game initialization
    - Expose `window.__GAME_EVENTS__` in replay mode for adapter communication
11. Create a replay adapter:
    - Create `scripts/adapters/<GameName>ReplayAdapter.ts` implementing the `ReplayAdapter` interface
    - Register the adapter in `scripts/adapters/index.ts` (before Golf, which uses structural detection)
    - Include a `gameType` field in the transcript for explicit adapter matching
12. Generate fixture and thumbnail:
    - Create a fixture generator script at `scripts/generate-<game>-fixture-transcript.ts`
    - Generate and commit the fixture transcript at `tests/fixtures/transcripts/<game-name>/fixture-game.json`
    - Generate and commit the thumbnail at `public/assets/games/<game-name>/thumbnail.png` using `./scripts/refresh-thumbnails.sh <game-name>`

Follow the Golf (original reference) and Sushi Go (most recent) examples as reference implementations.

## Hand & Pile Rendering

**Requirement:** Example games **must** render hands and piles through the core engine's hand-management code — `HandView`, `PileView`, and related helpers such as `flipCard()`. Hand-rolling card rows with manual sprite arrays and hardcoded positioning is not an accepted pattern; using the shared components means engine improvements (animations, reduced-motion fallbacks, DPR-aware textures, selection) propagate to every game automatically.

**Exception carve-outs:** Layouts that genuinely don't fit the single-row `HandView` model may keep bespoke card rendering, but the exception must be documented in code comments and/or the scene's help text:

- **Golf** — the 3×3 tableau grid (exception note in `example-games/golf/scenes/GolfRenderer.ts`); its stock/discard piles still use `PileView`.
- **Feudalism** — token/crop counters via `CropIconRenderer` (non-card tokens, not a hand).

**Canonical reference:** `example-games/blackjack/scenes/BlackjackScene.ts` — migrated to two SLL-anchored `HandView` instances with `centerX` row anchoring and a `flipCard()`-based hole-card reveal; its browser tests (`tests/blackjack/BlackjackHandView.browser.test.ts`) verify the rendering path.

For non-standard card models (tokens, resource icons, expedition cards), use the `CardTextureResolver` / `renderCard` callbacks documented in the [UI Adapter Guide](ui/ADAPTER-GUIDE.md). See the [Gym scene index](gym/GYM_INDEX.md) for the complete HandView/PileView scene-to-API mapping.

## Animation & Sound Feedback for Player and AI Actions

**Requirement:** Every player **and** AI action that uses a core engine animation/feedback helper — `dealCard`, `discardCard`, `flipCard`, `placeCard`, `moveGameObject`, `shakeIllegalMove`, `popTextOrIcon`, `createDragDropManager`, and any future helpers — must be rendered with the corresponding animation and wired with a sound effect (SFX), so the action is both animated and audible. Each helper accepts a `soundManager` + `sfx` (`start`/`move`/`end`) options map (see [UI Animation Helpers](ui-animations.md)); pass both so the action is never silent or instant by default. SFX keys must follow the shared `sfx-` prefix convention — `COMMON_SFX_KEYS` from `src/core-engine/SoundManager.ts`, detailed in [docs/SFX_CONVENTION.md](SFX_CONVENTION.md); no game-scoped string literals. (`shakeIllegalMove` plays `COMMON_SFX_KEYS.ILLEGAL_MOVE` automatically; `popTextOrIcon()` is the lightweight score/notification popup; `createDragDropManager` — the reusable drag-and-drop lifecycle in `src/ui/dragDrop.ts`, see [drag-and-drop lifecycle](ui-animations.md#createdragdropmanager-drag-and-drop-lifecycle) — plays the illegal feedback sound on pickup veto and invalid drops.)

**AI actions:** AI turns must be animated with a brief delay so the player can see and hear what the AI did (e.g. card placement / row take). Coloretto is the in-repo precedent — `example-games/coloretto/scenes/ColorettoScene.ts` runs AI turns via `time.delayedCall` (750ms, 150ms under reduced motion) then executes the AI's action through the same animated/sounded path as a human turn.

**Accessibility:** Reduced-motion preferences (explicit flag → SettingsStore toggle → `prefers-reduced-motion`; see the [Accessibility](ui-animations.md#accessibility) section of the animation helpers reference) and the settings-panel mute/volume controls must be respected — pass the helper's `reducedMotion` flag and play SFX through `SoundManager` (or `safePlaySound()` for overlay helpers) so mute and volume apply uniformly. This requirement reinforces, never weakens, accessibility behaviour.

**Exceptions:** Actions that legitimately have no visible or audible effect, and headless/replay/test/transcript modes (no rendering or audio), are exempt. Document any exemption in code comments and/or the scene's help text.

**Compliant references:** Golf's `GolfAnimator` (`example-games/golf/scenes/GolfAnimator.ts`) wires `soundManager` + `sfx` into its deal/discard/flip helpers; Coloretto animates and sounds AI turns (above); Blackjack preserves flip-sound timing and runs the dealer AI on a delay (`example-games/blackjack/scenes/BlackjackScene.ts`). New games should follow these patterns.

Gym reference scenes: [`GymAudioFeedbackScene`](../example-games/gym/scenes/GymAudioFeedbackScene.ts) (event-driven audio, mute/volume, pop text/icon) and [`GymHandPileScene`](../example-games/gym/scenes/GymHandPileScene.ts) (animated deal/discard/flip with SFX hooks). See the [Gym scene index](gym/GYM_INDEX.md) for the scene-to-API mapping.

## Example Games

All example games are playable via the Game Selector after running:

```bash
npm run dev
```

Open `http://localhost:3000` and click the desired game card. Each game also has a standalone entry point (`main.ts`) and factory function (`create<Game>Game.ts`) for independent testing.

### Game reference

| Game | Location | Key engine features demonstrated | Tests |
|------|----------|--------------------------------|-------|
| 9-Card Golf | `example-games/golf/` | Card/Deck/Pile abstractions, GameState/TurnSequencer, scoring rules (A=1, 2=-2, K=0, column-of-three=0), Random/Greedy AI strategies, transcript recording, Phaser UI with 3x3 grid | `tests/golf/` (8 files) |
| Beleaguered Castle | `example-games/beleaguered-castle/` | Single-player solitaire, UndoRedoManager (Command pattern), drag-and-drop + click-to-move, auto-move heuristics, auto-complete, win/loss detection, HelpPanel component, checkpoint autosave after each move with startup recovery, hint system (AI solver suggests best move with source/destination highlights), Classic/Citadel deal variants via a persisted pre-game popup (Citadel deals all 52 cards, no pre-placed aces) | `tests/beleaguered-castle/` (13 files) |
| Sushi Go! | `example-games/sushi-go/` | Card drafting (pick-and-pass hands), custom card types with set-collection scoring, multi-round match, procedural card-back textures | `tests/sushi-go/` (4 files) |
| Feudalism | `example-games/feudalism/` | Resource management (gem tokens), tiered development cards with costs/bonuses, noble attraction, multi-action turns (take/reserve/purchase), checkpoint autosave after each turn (human + AI) with startup recovery | `tests/feudalism/` (4 files) |
| Lost Cities | `example-games/lost-cities/` | Two-player expeditions, two-phase turn model (play/discard then draw), ascending-play rules, investment multipliers (x2/x3/x4), multi-round match scoring, procedurally generated SVG card assets | `tests/lost-cities/` (6 files) |
| Main Street | `example-games/main-street/` | Single-player tableau builder, responsive 2x5 grid layout, SLL integration, ToneForge audio adapter, Monte Carlo balance testing, tutorial scene | `tests/main-street/` |
| Coloretto | `example-games/coloretto/` | Set-building tableau (take-a-row mechanic), custom card types, canonical set-collection scoring (1=1,2=3,3=6,4=10,5=15,6+=21) with positive/negative color selection, wild joker cards (declared per-joker to a color at scoring, with colour-coded declaration chips in the round-end picker) and flat +2 bonus cards in the full 49-card deck, multi-round cumulative scoring with canonical winner tie-breaks (most single-round wins, then highest single-round score), randomized turn order with the canonical per-round start-player rule (most cards taken; ties to the most recent row take), Random/Heuristic AI strategies, SLL layout, transcript recording | `tests/coloretto/` (7 files) |

### Lost Cities card assets

The 61 SVG card images are generated by `scripts/generate-lost-cities-cards.ts`:

```bash
npx tsx scripts/generate-lost-cities-cards.ts
```

Assets are output to `public/assets/cards/lost-cities/` and documented in `public/assets/CREDITS.md`.

## Transcript Persistence

Game transcripts are automatically recorded by the engine's `TranscriptStore` and saved to the browser's IndexedDB. Two additional mechanisms allow transcripts to be persisted to disk for debugging, replay, and analysis.

### Automatic Disk Persistence (Dev Server)

When running `npm run dev`, a Vite plugin intercepts `POST /api/transcripts` requests and writes each transcript as a timestamped JSON file:

```
data/transcripts/<gameType>/<gameType>-<ISO-timestamp>.json
```

This happens via a fire-and-forget POST from `TranscriptStore.save()`. If the POST fails (e.g. the production build is being served instead of the dev server), a `console.warn` is emitted but gameplay is not disrupted.

The `data/` directory is gitignored, so persisted transcripts remain local to your machine.

The dev-server middleware enforces memory-safety bounds (body-size cap → 413, write rate limit → 429, and a Vite watcher ignore list for dev-output trees) — see [Dev-server transcript persistence: memory-safety bounds](#dev-server-transcript-persistence-memory-safety-bounds) under Testing. These bounds prevent the transcript write path from growing the dev-server process without limit (CG-0MSXL0A25009WZVK).

### CLI Batch Export

To export all transcripts currently stored in IndexedDB to disk, use:

```bash
npm run transcripts:export -- <game>
```

For example:

```bash
npm run transcripts:export -- golf
```

This launches a headless Chromium browser via Playwright, navigates to the game, reads all transcripts from IndexedDB, and writes them to `data/transcripts/<game>/`. The dev server is started automatically if it is not already running.

**Requirements:** Playwright's Chromium must be installed (`npx playwright install chromium`).

### Transcript Fixture Location

Each game has a fixture transcript used by replay tests and thumbnail generation:

```
tests/fixtures/transcripts/<game-name>/fixture-game.json
```

All example games have fixture transcripts checked into version control:

| Game | Fixture Path |
|------|-------------|
| Golf | `tests/fixtures/transcripts/golf/fixture-game.json` |
| Beleaguered Castle | `tests/fixtures/transcripts/beleaguered-castle/fixture-game.json` |
| Lost Cities | `tests/fixtures/transcripts/lost-cities/fixture-game.json` |
| Sushi Go | `tests/fixtures/transcripts/sushi-go/fixture-game.json` |
| Feudalism | `tests/fixtures/transcripts/feudalism/fixture-game.json` |
| Main Street | `tests/fixtures/transcripts/main-street/fixture-game.json` |

These are generated by game-specific fixture generator scripts (e.g. `scripts/generate-golf-fixture-transcript.ts`) that run deterministic AI-vs-AI games using a fixed seed.

## Checkpoint Save and Resume

Games can auto-save their run state after each turn and offer a resume/fresh-game
choice on startup via the shared `CheckpointManager` in `@core-engine`. This
pattern is game-agnostic — the manager works with any game state type and
`SaveSerializer`.

### CheckpointManager API

```typescript
import { CheckpointManager } from '@core-engine';

const manager = new CheckpointManager(store, 'my-game', 'run-checkpoint', mySerializer);
```

| Method | Description |
|--------|-------------|
| `save(state)` | Fire-and-forget checkpoint save after each game state change. |
| `load()` | Returns the saved state, or `null` if none exists. |
| `clear()` | Removes the checkpoint (e.g. on game end or New Game). |
| `checkAndResume(freshStartFn, resumeFn, createResumeOverlay?)` | Checks for a saved checkpoint. If found, shows a resume overlay via the optional callback. If not, calls `freshStartFn` immediately. |

### Resume overlay

The `createResumeOverlay` callback lets each game provide its own overlay UI.
A built-in `createDefaultResumeOverlay` is also available for quick integration:

```typescript
import { createDefaultResumeOverlay } from '@core-engine';

manager.checkAndResume(
  () => startFreshGame(),
  (state) => restoreFromCheckpoint(state),
  (state, onResume, onNewGame) =>
    createDefaultResumeOverlay(scene, state, onResume, onNewGame),
);
```

### Games using CheckpointManager

| Game | When checkpoint is saved | Startup behaviour |
|------|--------------------------|-------------------|
| Beleaguered Castle | After deal completes + after each player move | Shows "Resume Saved Game?" overlay with [Resume] and [New Game] buttons |
| Feudalism | After each human turn + after each AI turn | Shows resume overlay with [Resume] and [New Game] buttons |
| Main Street | _(planned)_ | _(planned)_ |

The `CheckpointManager` delegates all storage to `SaveLoadStore` (IndexedDB
with localStorage fallback). See `src/core-engine/CheckpointManager.ts` for
full API documentation.

## ActiveEffect System

The `ActiveEffect` module (`src/core-engine/ActiveEffect.ts`) provides a
duration-based modifier system that tracks ongoing effects over multiple turns.

### Core Types

- **`ActiveEffect`** – interface with `effectType`, `multiplier`, `turnsRemaining`,
  `sourceEventId`, and `description`.
- **`DecayResult`** – result of a decay operation with `active`, `expired`, and
  `effects` arrays.

### API Functions

All functions are exported from `@core-engine/index`:

| Function | Purpose |
|----------|---------|
| `createActiveEffect(type, mult, turns, sourceId, desc)` | Create a new effect |
| `decayActiveEffects(effects)` | Decrement all effects, return active/expired sets |
| `applyActiveEffectMultiplier(effects, type, baseValue)` | Apply matching multipliers (rounded) |
| `hasActiveEffectOfType(effects, type)` | Check if any effect of given type exists |

### Usage Pattern

Duration-based Event cards (e.g. `evt-flu-outbreak`) extend `EventCard` with
`duration`, `effectType`, and `multiplier` fields. The engine's `resolveEvent()`
function detects `DurationEventCard` instances via the `isDurationEventCard()`
type guard and creates an `ActiveEffect` instead of applying one-shot deltas.

Income-modifier effects are applied per-slot during `applyIncome()` _before_
the reputation coin multiplier. Effects decay at the end of each turn during
`EndCheck` in `processEndOfTurn()`.

### Main Street Integration

- `MainStreetState.activeEffects` stores the active effects array
- Serialization/deserialization includes `activeEffects` with migration for
  old saves (missing field defaults to `[]`)
- Duration computation for `evt-flu-outbreak` scans the street grid for
  Clinic/Medical Center cards

#### Community Favour (CG-0MSTOATDQ005XDET)

The Community Favour resource exchange is a **free** once-per-turn action
available during the market phase (it does not consume `actionsRemaining`):

- **coins → reputation:** spend `favourCoinsToRepCost` (default 2) coins for +1 rep.
- **reputation → coins:** spend `favourRepToCoinsRepCost` (default 2) rep for
  `favourRepToCoinsCoinGain` (default 3) coins. The round-trip is lossy, so no
  arbitrage.
- Rates are per-difficulty `GameConfig` constants in `MainStreetDifficulty.ts`
  (defaults on Easy/Medium/Hard).
- Gating: `state.favourUsedThisTurn` (market-phase only, reset at `DayStart`),
  serialized with legacy-save backfill to `false`.
- UI: two SLL-positioned buttons in the market-phase action bar
  (`favourCoinsToRepButton` / `favourRepToCoinsButton` zones), disabled when the
  input resource is insufficient or the gate is spent.
- AI: `MainStreetAiStrategy` enumerates the action when affordable/unused and
  scores rep→coins > 1 only when genuinely stalled (cannot afford the cheapest
  market card) with a reputation buffer; `GreedyStrategy` Priority 9 selects it
  only in that case, so normal purchases are never dominated.
- Tutorial: T13 (action-gated) teaches the rep→coins exchange. In the
  two-turn flow (CG-0MT53NXGZ004H5AE) the conversion is optional — end-turn
  income already keeps the balance above the $7 Library (T19), so the lesson
  is low-pressure.
- Tests: `tests/main-street/community-favour-*.test.ts` (engine, AI,
  persistence) + `community-favour-ui.browser.test.ts` (buttons, disabled
  states, full exchange round).

## Replay Tool

The replay tool (`scripts/replay.ts`) replays a fixture transcript through the game's Phaser scene in a headless browser, capturing per-turn screenshots. It is the foundation for thumbnail generation and visual regression testing.

### Running a Replay

```bash
npm run replay -- <transcript-path> [--output <dir>] [--stop-at <turn>]
```

- `transcript-path` -- Path to a fixture transcript JSON file
- `--output <dir>` -- Output directory for screenshots (defaults to `data/screenshots/<game-type>/`)
- `--stop-at <turn>` -- Stop replay at a specific turn number (for interactive takeover in headed mode)

**Examples:**

```bash
# Replay Golf fixture and capture all screenshots
npm run replay -- tests/fixtures/transcripts/golf/fixture-game.json

# Replay Feudalism with custom output directory
npm run replay -- tests/fixtures/transcripts/feudalism/fixture-game.json --output data/screenshots/feudalism-test

# Replay Main Street fixture and generate thumbnail source frames
npm run replay -- tests/fixtures/transcripts/main-street/fixture-game.json --game main-street --output data/screenshots/main-street
```

Screenshots are written as `turn-000.png`, `turn-001.png`, etc. in the output directory. A `replay-summary.json` is also written with metadata.

> **Performance note:** the replay script lazy-loads its heavy modules (Playwright, `sharp` via `contact-sheet.ts`) using dynamic `import()` only when the replay path actually needs them. Argument/transcript validation error paths (`--stop-at`/`--skip-to` validation, missing/invalid transcripts, version rejection) therefore exit in milliseconds-to-seconds instead of waiting for Playwright/sharp module evaluation (which can take 15-30s+ under parallel CPU load). See CG-0MSAXWIK70050RDA.

### How It Works

1. The replay tool parses the transcript and resolves a `ReplayAdapter` from the adapter registry (`scripts/adapters/index.ts`)
2. It launches a headless Chromium browser via Playwright and navigates to the game with `?mode=replay&game=<game-type>`
3. For each turn in the transcript, it calls `adapter._injectBoardState()` which uses `page.evaluate()` to call the scene's `loadBoardState(stateJson)` method
4. The scene reconstructs visual state from the snapshot and emits a `state-settled` event when rendering is complete
5. The tool captures a screenshot of the canvas after each `state-settled` event

### Contact Sheet

After a replay completes, a contact sheet image is automatically generated showing all per-turn screenshots arranged in a grid. The contact sheet is written to `contact-sheet.png` in the output directory.

- Thumbnails are 225x175px arranged in 4 columns
- Each thumbnail is labeled with its turn number
- Generated using `sharp` (MIT-licensed, already a dependency)
- The contact sheet path is included in `replay-summary.json` as `contactSheetPath`

### In-Game Transcript Export Button

During gameplay, an **Export Transcript** button appears on the end-of-round results screen, allowing you to download the current game transcript as a JSON file directly from the browser.

- **End-of-round screen:** After the game ends, click `[ Export Transcript ]` to download the transcript as `golf-transcript-<timestamp>.json`
- **Error-triggered export:** If an unhandled JavaScript error occurs during gameplay, an overlay appears with an `[ Export Transcript ]` button so the transcript can be saved for debugging before reloading

### Replay Adapters

Each game has a `ReplayAdapter` implementation in `scripts/adapters/` that bridges the replay tool to the game's scene:

| Game | Adapter | Game Type |
|------|---------|-----------|
| Beleaguered Castle | `BeleagueredCastleReplayAdapter` | `beleaguered-castle` |
| Lost Cities | `LostCitiesReplayAdapter` | `lost-cities` |
| Sushi Go | `SushiGoReplayAdapter` | `sushi-go` |
| Feudalism | `FeudalismReplayAdapter` | `feudalism` |
| Main Street | `MainStreetReplayAdapter` | `main-street` |
| Golf | `GolfReplayAdapter` | (structural detection) |

Adapters are registered in `scripts/adapters/index.ts`. Registration order matters: adapters with explicit `gameType` fields are registered before Golf, which uses structural shape-matching as a fallback.

### Adding a New Replay Adapter

1. Create `scripts/adapters/<GameName>ReplayAdapter.ts` implementing the `ReplayAdapter` interface from `scripts/adapters/ReplayAdapter.ts`
2. Implement all 14 interface methods (see `SushiGoReplayAdapter` as the most recent reference)
3. Register the adapter in `scripts/adapters/index.ts` before the Golf adapter
4. Ensure the game scene implements `loadBoardState()` and emits `state-settled` events
5. Test with: `npm run replay -- tests/fixtures/transcripts/<game>/fixture-game.json`

## Engine Event System

The core engine provides a typed event system for turn lifecycle events. It consists of two parts:

- **`GameEventEmitter`** (`src/core-engine/GameEventEmitter.ts`) — A type-safe event emitter that works in both Node.js and browser environments. Events are defined with typed payloads.
- **`PhaserEventBridge`** (`src/core-engine/PhaserEventBridge.ts`) — Bridges `GameEventEmitter` events to Phaser's scene event system and vice versa, allowing Phaser-based consumers (scenes, UI components) to subscribe to engine events using Phaser's native `scene.events`.

### Event Types

| Event | Payload | Fires When |
|-------|---------|------------|
| `turn-started` | `{ turnNumber: number, playerIndex: number, phase: string }` | A player's turn begins |
| `turn-completed` | `{ turnNumber: number, playerIndex: number }` | A move is applied and recorded |
| `animation-complete` | `{ turnNumber: number }` | All tween animations for a turn finish |
| `state-settled` | `{ turnNumber: number, phase: string }` | The board is visually stable and safe to screenshot |
| `game-ended` | `{ finalTurnNumber: number, winnerIndex: number, reason: string }` | The game ends after scoring |
| `resume-replay` | (none) | Signals the replay tool to resume after takeover |

### Subscribing to Events

```typescript
import { GameEventEmitter } from '@core-engine';

const emitter = new GameEventEmitter();

// Subscribe with full type safety
emitter.on('state-settled', (payload) => {
  console.log(`Turn ${payload.turnNumber} settled, phase: ${payload.phase}`);
});

// Unsubscribe
const handler = (p: StateSettledPayload) => {};
emitter.on('state-settled', handler);
emitter.off('state-settled', handler);
```

### Emitting Events

```typescript
emitter.emit('state-settled', { turnNumber: 5, phase: 'draw' });
```

### Global Access

During gameplay, the emitter is exposed globally as `window.__GAME_EVENTS__` so that tools (replay, testing) can subscribe from outside the Phaser scene:

```typescript
const emitter = (window as any).__GAME_EVENTS__;
emitter.on('state-settled', (payload) => {
  // e.g., capture screenshot
});
```

### PhaserEventBridge

When using Phaser scenes, the `PhaserEventBridge` forwards engine events to Phaser's scene events and vice versa:

```typescript
import { GameEventEmitter, PhaserEventBridge } from '@core-engine';

const emitter = new GameEventEmitter();
const bridge = new PhaserEventBridge(emitter, scene.events);

// Now scene.events receives forwarded engine events:
this.events.on('state-settled', (payload) => { /* ... */ });

// Destroy on scene shutdown:
bridge.destroy();
```

## Managing Assets

- All assets go in `public/assets/` and are served by Vite at the `/assets/` URL path
- Assets must be **CC0, MIT, Apache 2.0, or similarly permissive** -- no restrictive licenses
- Document every asset source and license in `public/assets/CREDITS.md`
- Prefer SVG for card art (resolution-independent, small file size)

### Game Thumbnails

Each game can have a thumbnail image displayed on its card in the Game Selector. Thumbnails are committed to the repo at:

```
public/assets/games/<game-name>/thumbnail.png
```

**Generating a thumbnail from replay screenshots:**

```bash
npx tsx scripts/generate-thumbnail.ts <game-name> [source-dir]
```

- `game-name` -- The game identifier (e.g. `golf`)
- `source-dir` -- Optional path to a directory containing `turn-NNN.png` replay screenshots. Defaults to `data/screenshots/<game-name>/`

The script selects the midpoint frame from the replay output, resizes it to 120x68 PNG, and writes it to `public/assets/games/<game-name>/thumbnail.png`.

**Wiring up a thumbnail:**

After generating the thumbnail PNG, add a `thumbnail` field to the game's entry in `main.ts`:

```typescript
{
  sceneKey: 'GolfScene',
  title: '9-Card Golf',
  description: '...',
  thumbnail: 'games/golf/thumbnail',  // asset key (no .png extension)
}
```

The `GameSelectorScene` will preload and display the thumbnail automatically. Games without a `thumbnail` field fall back to the text-only card layout.

**Refreshing all thumbnails at once:**

Use the `scripts/refresh-thumbnails.sh` script to replay fixture transcripts and regenerate thumbnails for all supported games in a single command:

```bash
bash scripts/refresh-thumbnails.sh
```

The script processes all supported games (`golf`, `beleaguered-castle`, `lost-cities`, `sushi-go`, `feudalism`, `main-street`). For each game it runs the replay tool to capture screenshots, then invokes the thumbnail generator. Games that lack a fixture transcript or replay adapter are skipped with a warning (not a failure). The `gym` is excluded -- it has no replay transcript. A summary table is printed at the end showing which games were refreshed and which were skipped. The script exits non-zero if any supported game fails during replay or thumbnail generation.

### Main Street visual smoke runbook

Main Street rendering policy is Phaser-native only for runtime card visuals. Do not add new `svgDom` visibility toggles for overlays; validate layering through canvas-native assertions.

Use these commands when validating Main Street visual polish changes:

```bash
# Replay canonical fixture and capture screenshots
npm run replay -- tests/fixtures/transcripts/main-street/fixture-game.json --game main-street --output data/screenshots/main-street

# Regenerate Main Street thumbnail
npx tsx scripts/generate-thumbnail.ts main-street

# Execute dedicated visual/replay smoke checks
npx vitest run --project unit tests/e2e/replay-main-street.e2e.test.ts tests/e2e/generate-thumbnail.main-street.test.ts
```

#### Rendering rollback (Main Street)

Use commit-level reverts on the feature branch if a rendering regression is discovered:

```bash
git checkout <feature-branch>
git log --oneline -- example-games/main-street/scenes src/ui tests/main-street
git revert <commit-hash>
npm test
npm run build
```

**When to regenerate thumbnails:**

Thumbnails are static assets. Regenerate them when a game's visual appearance changes significantly. Use `scripts/refresh-thumbnails.sh` to regenerate all thumbnails at once, or use the individual commands above for a single game.

## SVG Rendering & Migration

The engine now provides shared SVG raster helpers from `src/core-engine/SvgHelpers.ts` (exported via `src/core-engine/index.ts`).

Rasterisation policy (project choice): lazy rasterisation on first use. In practice this means scenes should preload SVG *source text* (via `this.load.text`) and only rasterise to a texture when the texture is first required for rendering. This keeps preload fast and memory usage reasonable while ensuring visual fidelity when textures are needed.

### Recommended scene pattern

1. Preload SVG source text (not `this.load.svg`) so you can rasterise through shared helpers:

```ts
this.load.text('svg:icon-tempura', 'assets/sushi-go/icon-tempura.svg');
```

2. Mark scene validity during lifecycle:

```ts
import { markSceneValid, markSceneInvalid } from '@core-engine/index';

markSceneValid(this);
this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => markSceneInvalid(this));
this.events.once(Phaser.Scenes.Events.DESTROY, () => markSceneInvalid(this));
```

3. Generate textures lazily or in a preload-to-render bridge:

```ts
import { makeTextureKey, getOrCreateTexture, rasteriseSvgToTexture } from '@core-engine/index';

const svgText = this.cache.text.get('svg:icon-tempura') as string;
const key = makeTextureKey('icon-tempura', 128, 128, window.devicePixelRatio || 1);

// Option A: fully explicit
await rasteriseSvgToTexture(this, key, svgText, 128, 128);

// Option B: lazy helper (recommended)
const texture = getOrCreateTexture(this, 'icon-tempura', svgText, 128, 128);
if (!texture.ready && texture.promise) await texture.promise;
```

### Migration checklist

- Replace direct `this.load.svg(...)` calls in scenes with `this.load.text(...)` for SVG source text.
- Import shared helpers from `src/core-engine` (`markSceneValid`, `markSceneInvalid`, `makeTextureKey`, `rasteriseSvgToTexture`, `getOrCreateTexture`).
- Ensure scene lifecycle invalidates helper operations on shutdown/destroy.
- Add or update browser smoke tests with pixel-sample assertions (non-solid texture checks).
- Keep per-test runtime at or below 10 seconds for SVG smoke checks.

### Migration pattern: SvgHelpers lazy rasterisation

The following pattern is used when migrating a game from `scene.load.svg` to SvgHelpers lazy rasterisation. Key changes:

- **Preload**: SVG assets are registration-only in browser runtimes (call `markSceneValid(scene)`); SVG source text is loaded via `this.load.text()` for later rasterisation. The Node/test preload path populates a module-level `svgTextCache` for headless access.
- **Texture adapter**: A new module provides a stable, DPR-aware API for callers, with `resolveTemplateId()`, `getCanonicalTextureKey()`, and `ensureTexture()` wrappers replacing legacy template IDs.
- **Scene callers**: All scene code imports from the texture adapter instead of using legacy keys or direct texture lookups.
- **Texture keys**: Lazy rasterisation via `SvgHelpers.getOrCreateTexture` produces DPR-aware keys. Legacy template IDs should not be used for sprite texture lookups.
- **Tests**: Unit and integration tests assert DPR-aware key format. A headless integration smoke test verifies the full preload → ensure → key resolution pipeline.

**Pattern for migrating other games:**
1. Create a texture adapter module with `resolveTemplateId()`, `getCanonicalTextureKey()`, and `ensureTexture()` wrappers.
2. Replace `this.load.svg(...)` with `markSceneValid(this)` in preload; populate SVG text cache via `this.load.text(...)` or module-level cache for Node.
3. Replace direct texture key strings with adapter calls in scene code.
4. Update tests to assert DPR-aware key format and add headless integration checks.

### Lost Cities migration (CG-0MOZN33JW004XILY)

Lost Cities was the third example game migrated from `scene.load.svg` to SvgHelpers lazy rasterisation. Key changes:

- **LostCitiesTextureHelpers.ts**: New co-located helper module providing `preloadLostCitiesAssets()`, `getLcTextureKey()`, `ensureLcCardTexture()`, `ensureLcCompactTexture()`, and `ensureLcBackTexture()`. The preload function is registration-only in browser runtimes (marks scene valid via `markSceneValid`); the Node/test path reads all 121 SVGs into a module-level cache.
- **LostCitiesScene.ts**: Removed 5 `this.load.svg()` blocks (121 SVG files) from `preload()`. Replaced with `preloadLostCitiesAssets(this)` and added `markSceneInvalid(this)` on shutdown.
- **LostCitiesRenderer.ts**: All sprite creation now starts with a card-back fallback texture and uses `applyEnsuredTexture` to lazily update to the DPR-aware texture when rasterisation completes. Expedition cards, discard pile cards, hand cards, and the draw pile all use the same lazy pattern.
- **Texture keys**: Lazy rasterisation via `SvgHelpers.getOrCreateTexture` produces DPR-aware keys (e.g. `ms_card_lc-blue-2_95x130@2`). Legacy template IDs (`lc-blue-2`, `lc-back`) are still returned by `cardAssetKey()`/`compactAssetKey()` but should not be used for sprite texture lookups.
- **Tests**: Focused unit tests added at `tests/lost-cities/texture-helpers.test.ts` covering key generation, SVG text caching, and texture retrieval for representative card samples.

**Pattern for migrating other games:**
1. Create a co-located helper module with `preload*Assets()`, `ensure*Texture()`, `get*TextureKey()`, and `svgTextCache`.
2. Replace `this.load.svg(...)` with `markSceneValid(this)` in preload; populate SVG text cache in Node.
3. Replace direct texture key strings with helper calls in scene/renderer code.
4. Update tests to assert DPR-aware key format and add focused unit tests.

No remaining games use `scene.load.svg`.

## HUD Layer

The project provides a shared HUD (Heads-Up Display) layer abstraction
that ensures help/settings panels, buttons, and game-state overlays
render consistently above gameplay content across all example games.

### Components

1.  **`CardGameScene.initHUDContainer()`** — Creates a shared container
    (`this.hudContainer`) at depth `1000`. Call this early in `create()`
    before `initHelpPanel()` and `initSettingsPanel()`.

2.  **`OverlayManager`** (`src/ui/OverlayManager.ts`) — A reusable class
    that manages game-state overlay lifecycle. Supports types:
    `'game-over'`, `'win/loss'`, `'round-end'`, `'custom'`.

### Depth Convention

| Layer                | Depth  | Purpose                                    |
|----------------------|--------|--------------------------------------------|
| HUD container        | 1000   | Help/settings panels, buttons              |
| Game-state overlays  | 2000   | Win, loss, game-over, round-end overlays   |

### Full Component Reference

For comprehensive documentation covering all shared HUD components
(HelpPanel, SettingsPanel, HelpButton, SettingsButton, Overlay Manager,
Parameterized Overlay, CardGameScene base class, undo/redo buttons, and
HUD container patterns) see the
[Shared HUD Components](#shared-hud-components) section below.

### Migration Guide

For detailed migration steps, see
[docs/HUD-LAYER-MIGRATION.md](HUD-LAYER-MIGRATION.md).

## Screen Layout Language (SLL)

The project now includes a reusable **Screen Layout Language** for viewport-aware scene layout.

### Core files

- Schema + types: `src/ui/screen-layout-schema.ts`
- Runtime mapping: `src/ui/screen-layout.ts`
- Composition helper: `src/ui/screen-layout-compose.ts`
- Visibility / ownership helper: `src/core-engine/VisibilityOwnership.ts`
- Public exports: `src/ui/index.ts`, `src/core-engine/index.ts`

### Migrated games

The following games have been migrated to use SLL layout helpers:

| Game | Layout file | Adapter |
|------|------------|---------|
| Golf | `example-games/golf/layouts/golf.layout.json` | `example-games/golf/scenes/GolfLayoutAdapter.ts` |
| Beleaguered Castle | `example-games/beleaguered-castle/layouts/beleaguered-castle.layout.json` | `example-games/beleaguered-castle/scenes/BeleagueredCastleLayoutAdapter.ts` |
| Main Street | `example-games/main-street/layouts/main-street.layout.json` | `example-games/main-street/scenes/MainStreetLayoutAdapter.ts` |

Games with layout files and adapters ready for renderer integration:

| Game | Layout file | Adapter |
|------|------------|---------|
| Feudalism | `example-games/feudalism/layouts/feudalism.layout.json` | `example-games/feudalism/scenes/FeudalismLayoutAdapter.ts` |
| Sushi Go | `example-games/sushi-go/layouts/sushi-go.layout.json` | `example-games/sushi-go/scenes/SushiGoLayoutAdapter.ts` |
| Lost Cities | `example-games/lost-cities/layouts/lost-cities.layout.json` | `example-games/lost-cities/scenes/LostCitiesLayoutAdapter.ts` |

### Main Street canonical example

- Layout file: `example-games/main-street/layouts/main-street.layout.json`
- Adapter: `example-games/main-street/scenes/MainStreetLayoutAdapter.ts`
- Renderer integration: `example-games/main-street/scenes/MainStreetRenderer.ts` (`computeLayout()` applies SLL first, then falls back)

### Gym SLL demo example

- Scene: `example-games/gym/scenes/GymSllScene.ts`
- Layout documents: `example-games/gym/layouts/gym-shell.layout.json` (shell-only and composed shell source), `example-games/gym/layouts/gym-scene.layout.json` (scene-only source), `example-games/gym/layouts/gym-sll-pixel-override.layout.json`
- Browser verification: `tests/gym/GymSllScene.browser.test.ts`
- Unit verification: `tests/core-engine/VisibilityOwnership.test.ts`, `tests/ui/screen-layout-compose.test.ts`, `tests/gym/GymSllLayout.test.ts`
- Shared ownership helper: `src/core-engine/VisibilityOwnership.ts`

### Composing shell + scene layouts

Use `composeResolvedLayouts(baseLayout, sceneLayout, viewport, dpr, { policy: 'sceneWins' })` to combine a shared shell layout (header/menu/toolbar/help) with a scene-specific layout without duplicating placement math. Collision handling follows the project default: scene wins, with a warning reported on collision for local dev visibility.

Register scene objects into ownership groups so visibility is managed automatically per layout mode:

```ts
import { VisibilityOwnershipController } from '@core-engine/VisibilityOwnership';

const controller = new VisibilityOwnershipController({
  groupRules: {
    shell: { 'shell-only': true, composed: true },
    scene: { 'scene-only': true, composed: true },
    shared: { 'shell-only': true, 'scene-only': true, composed: true },
  },
});
controller.register(headerText, 'shell');
controller.register(sceneContent, 'scene');
controller.setMode('scene-only'); // hides shell, shows scene+shared
```

Typical use cases: shared app chrome across scenes, scene-specific overrides, browser tests asserting merged anchor positions across DPR/viewports, and debug overlays needing both source layout IDs and resolved pixels.

## Card Upgrade Rendering Pipeline

Main Street uses a **code-based overlay rendering pipeline** to display upgrade state on Business cards. This section documents how the pipeline works, why it was designed this way, and how to extend it.

### Problem

When a player upgrades a Business card in Main Street, the game state updates correctly (level increases, income bonus applies, card name changes) but the visual display must reflect these changes. Creating separate SVG assets for every level variant of every card would cause asset explosion and make maintenance difficult.

### Solution: Code-Based Overlays

Instead of generating separate SVG templates for each card level, the system renders the base SVG card once (cached texture) and draws Phaser text/graphics objects on top as overlays. This approach provides:

- **Performance**: No per-level SVG re-rasterization. Base textures are cached and reused.
- **Texture caching simplicity**: One texture key per base card, regardless of upgrade state.
- **Backward compatibility**: Non-upgraded cards (level 0) render identically to before; no visual changes to existing rendering paths.
- **Testability**: The overlay spec builder is a pure function with no Phaser dependencies.

### Architecture

The pipeline has two layers:

#### Layer 1: Overlay Specification (`UpgradeOverlaySpec.ts`)

Location: `example-games/main-street/scenes/UpgradeOverlaySpec.ts`

This is a **pure data module** with no Phaser or runtime dependencies. It defines three interfaces:

- **`OverlayTextSpec`** – Describes a text overlay with `text`, `x`, `y`, `fontSize`, `color`, and `fontStyle` properties.
- **`OverlayBorderSpec`** – Describes a border/glow overlay with `color` (hex number) and `strokeWidth` (pixels).
- **`UpgradeOverlaySpec`** – Combines all overlay elements: `levelBadge`, `cashLine`, `reputationText`, and `upgradeBorder`.

> **Note (CG-0MT24MHGZ0025O20):** The upgraded business **name is not part of
> the overlay spec** — per manual review it must render as part of the card
> image. The renderer bakes it in via a **display-name variant texture**: the
> texture manager generates an SVG variant of the base template whose title is
> the card's `displayName` (e.g. `Patisserie`), keyed by template+displayName,
> so the upgraded card's face shows the new name exactly like the base name.

The key function is `buildUpgradeOverlaySpec(biz: BusinessCard, width: number, height: number): UpgradeOverlaySpec`:

```
BusinessCard state ──► buildUpgradeOverlaySpec() ──► UpgradeOverlaySpec
  (level, name,          (pure function,              (positioned text
   baseIncome,            no Phaser deps)               specs + border
   incomeBonus,                                          spec)
   ongoingCost)
```

**Logic:**
- Base cards (`level === 0`): level badge and border are `null`; the cash line is populated when income or cost > 0.
- Upgraded cards (`level > 0`): The non-name overlays are populated:
  - **Level badge** — `"Lvl N"` in gold (`#ffdd44`), top-right corner, 10px bold.
  - **Cash line** — `"Cash: +X / -Y"` (combined `baseIncome + incomeBonus` minus `ongoingCost`) rendered as **two-tone segments**: income in green (`#44ff44`), ongoing cost in red (`#ff6644`), with the `Cash:` prefix and ` / ` separator in neutral grey (`#dddddd`). The renderer draws each segment as its own text object laid out side-by-side (`OverlayTextSpec.segments`, CG-0MTDMOYOL008IQVO). Centred, 11px bold. Shown only when income or cost > 0; zero components are omitted (e.g. `Cash: +2`, `Cash: -0.75`) (CG-0MTCP76MP0088TQW).
  - **Reputation text** — `"+R/turn"` in blue (`#88bbff`), below the cash line.
  - **Upgrade border** — Golden stroke (`0xffaa22`), 3px width, around the card perimeter.
  - **Name** — NOT an overlay: baked into the card's SVG via a display-name variant texture (CG-0MT24MHGZ0025O20).

#### Layer 2: Overlay Rendering (`MainStreetRenderer.applyUpgradeOverlays()`)

Location: `example-games/main-street/scenes/MainStreetRenderer.ts` — `applyUpgradeOverlays()` method.

This method reads the `UpgradeOverlaySpec` and creates Phaser game objects as children of the card's container:

```
UpgradeOverlaySpec ──► applyUpgradeOverlays() ──► Phaser text/graphics objects
  (from Layer 1)        (reads spec, creates         (added to card container)
                         Phaser objects)
```

**Rendering order (back to front within the container):**
1. Upgrade border (transparent fill, golden stroke) — drawn behind text but on top of card image.
2. Level badge text (gold, top-right).
3. Cash line text (two-tone: green income / red cost, centre, above reputation).
4. Reputation text (blue, below cash line).

The upgraded card NAME is not an overlay — it is part of the card's SVG
face (display-name variant texture, CG-0MT24MHGZ0025O20).

The per-turn ongoing cost is **not** baked into the business/community-space
card SVG face — it is shown by the two-tone cash line overlay
(CG-0MTDMOYOL008IQVO). Staff cards keep their baked `-X/turn` cost text since
they have no overlay pipeline.

**Call site:** `drawBusinessSlot()` in `MainStreetRenderer.ts`:

```typescript
// Render card SVG. Upgraded businesses pass displayName so the texture
// manager rasterises a display-name variant with the upgraded name baked in.
mainStreetRenderCardSvg(s, cardContainer, biz.id, renderW, renderH, biz.displayName);

// Apply the remaining upgrade overlays (level badge, cash line, rep, border)
this.applyUpgradeOverlays(cardContainer, biz, renderW, renderH);
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Game State Update                           │
│  Player upgrades Bookshop → Reader's Café (level 1→2, income +3→+8)  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  refreshStreetGrid()                             │
│  Iterates over street grid, calls drawBusinessSlot() per card   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  drawBusinessSlot()                              │
│  1. mainStreetRenderCardSvg(+ displayName) → variant SVG texture │
│     (displayName baked in for upgraded cards, CG-0MT24MHGZ0025O20)  │
│  2. applyUpgradeOverlays() → level/cash-line/rep/border overlays │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌─────────────────────┐     ┌─────────────────────────────┐
│  Base SVG texture   │     │  buildUpgradeOverlaySpec()  │
│  (cached, reused)   │     │  → levelBadge: "Lvl 2"      │
│  + display-name     │     │  → cashLine: "Cash: +8"    │
│  variant (upgraded) │     │  → upgradeBorder: gold 3px   │
│                     │     │  (name is baked into the     │
│                     │     │   variant texture, not here) │
└─────────────────────┘     └──────────────┬──────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────────┐
                              │  applyUpgradeOverlays()     │
                              │  Creates Phaser objects:    │
                              │  - Rectangle (golden border)│
                              │  - Text (level, cash line, rep)│
                              └─────────────────────────────┘
```

### Extending Upgrade Visualizations

To add or modify upgrade overlays:

1. **Modify `buildUpgradeOverlaySpec()`** in `UpgradeOverlaySpec.ts` to compute new overlay specs. Keep it pure — no Phaser imports.
2. **Modify `applyUpgradeOverlays()`** in `MainStreetRenderer.ts` to create the corresponding Phaser objects.
3. **Add unit tests** for `buildUpgradeOverlaySpec()` in `tests/main-street/UpgradeOverlaySpec.test.ts` (this file tests the pure spec builder, not Phaser rendering).

**Example: Adding a star icon for level 3+ cards:**

```typescript
// In UpgradeOverlaySpec.ts — add to the spec interface:
export interface UpgradeOverlaySpec {
  // ... existing fields ...
  /** Star icon overlay for level 3+ cards, null otherwise. */
  starIcon: OverlayTextSpec | null;
}

// In buildUpgradeOverlaySpec():
const starIcon: OverlayTextSpec | null = biz.level >= 3
  ? { text: '\u2605', x: 4, y: Math.round(height / 2), fontSize: '16px', color: '#ffdd44' }
  : null;

// In applyUpgradeOverlays() in MainStreetRenderer.ts:
if (spec.starIcon) {
  const star = this.scene.add.text(spec.starIcon.x, spec.starIcon.y, spec.starIcon.text, {
    fontSize: spec.starIcon.fontSize, color: spec.starIcon.color,
  });
  container.add(star);
}
```

### Why Not SVG-Based Overlays?

An alternative approach would be to generate composite SVGs with embedded level/cash text and re-rasterize them per card state. This was considered but rejected because:

- **Asset duplication**: Each card would need SVG variants for each level (Bookshop L1, L2, L3, etc.), multiplying asset count.
- **Cache complexity**: Texture cache keys would need to encode card state, increasing cache miss rates.
- **SVG text rendering**: SVG text positioning and font rendering can be inconsistent across browsers, making precise overlay placement harder.
- **Performance**: Re-rasterizing SVGs on every state change is more expensive than drawing Phaser text objects on top of a cached texture.

The code-based overlay approach keeps the texture cache simple (one key per base card) and leverages Phaser's reliable text rendering.

## Shared Renderer

The engine provides a shared rendering API under `src/ui/Renderer/` that supplies common rendering helpers so game scenes stay small and focused without duplicating boilerplate patterns. The module exports container creation, HUD text, tooltip zones, action buttons, and an SVG card rendering wrapper — all designed to work with a standard Phaser Scene.

### Public API

All exports are available via `@ui/Renderer` (which resolves to `src/ui/Renderer/index.ts`).

#### Container helpers

```typescript
import {
  createHudContainer,
  createGameZone,
} from '@ui/Renderer';
```

**`createHudContainer(scene: Phaser.Scene): Phaser.GameObjects.Container`**

Creates a HUD container with depth 1000, intended for transient overlay elements that are rebuilt each HUD refresh cycle. Children should be tagged with `_hudTransient: true` so they can be selectively destroyed on the next refresh.

```typescript
const hud = createHudContainer(this);
const scoreText = createHudText(this, 10, 10, 'Score: 0', '#ffcc44');
(scoreText as any)._hudTransient = true;
hud.add(scoreText);
```

**`createGameZone(scene: Phaser.Scene, x: number, y: number, w: number, h: number, name?: string): Phaser.GameObjects.Container`**

Creates a named zone container for grouping related game objects. Stores logical width/height as `__zoneWidth` and `__zoneHeight` custom properties.

```typescript
const streetZone = createGameZone(this, 100, 200, 600, 300, 'street');
```

#### HUD text helper

```typescript
import { createHudText, attachHudTooltipZone } from '@ui/Renderer';
```

**`createHudText(scene: Phaser.Scene, x: number, y: number, text: string, color: string, options?: { fontSize?: string; fontFamily?: string; originX?: number; originY?: number }): Phaser.GameObjects.Text`**

Creates a styled text object using `FONT_FAMILY` by default, bold style, and origin (0, 0.5).

```typescript
const label = createHudText(this, 200, 50, 'Turn 1', '#ffffff', { fontSize: '18px' });
```

#### Tooltip zone helper

**`attachHudTooltipZone(scene: Phaser.Scene, textObj: Phaser.GameObjects.Text, ariaLabel: string, contentBuilder: () => string): void`**

Attaches an interactive tooltip zone to a HUD text element. On desktop, tooltip shows on hover; on mobile, toggles on tap. Sets ARIA labels for accessibility.

```typescript
attachHudTooltipZone(
  this,
  scoreText,
  'Current score',
  () => `Your score is ${gameState.score}`,
);
```

#### Action button helper

```typescript
import { createActionButton, type ActionButtonOptions } from '@ui/Renderer';
```

**`createActionButton(scene: Phaser.Scene, x: number, y: number, width: number, text: string, callback: () => void, options?: ActionButtonOptions): Phaser.GameObjects.Container`**

Creates a styled button with background, label, hover/click effects, and optional disabled state.

```typescript
createActionButton(
  this,
  100, 500, 120, 'Buy',
  () => buyCard(),
  { fillColor: 0x224455, textColor: '#88ccff' },
);
```

#### Texture application helper

```typescript
import { applyEnsuredTexture, type EnsureTextureResult } from '@ui/Renderer';
```

**`applyEnsuredTexture(sprite: Phaser.GameObjects.Image, ensureOp: Promise<EnsureTextureResult>, stillMounted: () => boolean, displayWidth?: number, displayHeight?: number): Promise<void>`**

Applies an ensured texture to a sprite, awaiting async generation if needed. Encapsulates the pattern: await the texture operation, check sprite is still mounted, swap texture, and re-apply display size.

```typescript
await applyEnsuredTexture(
  cardImage,
  ensureCardTexture(this, cardId, width, height),
  () => cardImage.active,
  width,
  height,
);
```

#### Card rendering SVG wrapper

```typescript
import { renderCardSvg, type RenderCardSvgOptions } from '@ui/Renderer';
```

**`renderCardSvg(scene: Phaser.Scene, parentContainer: Phaser.GameObjects.Container, templateId: string, width: number, height: number, options?: RenderCardSvgOptions): Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle`**

Renders an SVG card into a parent container. Checks for an existing texture; if found creates an `Image`, otherwise starts async generation and draws a fallback `Rectangle`.

```typescript
renderCardSvg(this, cardContainer, 'card-42', 95, 130, {
  fallbackFill: 0x333333,
  fallbackStroke: 0x666666,
});
```

### Type interfaces

The Renderer module exports several TypeScript interfaces used by the public API functions.

#### ActionButtonOptions

Passed to `createActionButton` to customise button appearance and behaviour.

| Field | Type | Default | Description |
|---|---|---|---|
| `height` | `number` | `32` | Button height in pixels. |
| `fillColor` | `number` | `0x554422` | Background fill colour. |
| `fillAlpha` | `number` | `0.8` | Background fill alpha. |
| `strokeColor` | `number` | `0xaa8855` | Stroke colour. |
| `textColor` | `string` | `'#ffcc88'` | Label text colour. |
| `fontSize` | `string` | `'14px'` | Label font size. |
| `disabled` | `boolean` | `false` | When `true`, the button is visually dimmed and non-interactive. |

#### HudTextOptions

Passed to `createHudText` (merged with an inline `fontSize` option) to customise text styling.

| Field | Type | Default | Description |
|---|---|---|---|
| `fontFamily` | `string` | `FONT_FAMILY` | Override the default font family. |
| `originX` | `number` | `0` | Horizontal origin (default `0`). |
| `originY` | `number` | `0.5` | Vertical origin (default `0.5`). |

The `createHudText` options parameter accepts `{ fontSize?: string } & HudTextOptions`, so you can pass `fontSize` alongside the fields above.

#### EnsureTextureResult

Returned by async texture-ensure operations; consumed by `applyEnsuredTexture`.

| Field | Type | Description |
|---|---|---|
| `key` | `string` | The texture key that will be (or is) available. |
| `ready` | `boolean` | `true` if the texture is already registered and ready to use. |
| `promise` | `Promise<void>` (optional) | Resolves when async generation completes. |

#### RenderCardSvgOptions

Passed to `renderCardSvg` to customise card rendering behaviour.

| Field | Type | Default | Description |
|---|---|---|---|
| `makeKey` | `MakeTextureKeyFn` | `makeTextureKey` from SvgHelpers | Derives a texture cache key from template ID and dimensions. |
| `requestTexture` | `RequestTextureFn` | wrapper around `getOrCreateTexture` | Initiates async texture generation when the texture is missing. |
| `fallbackFill` | `number` | `0x333333` | Fill colour for the fallback rectangle. |
| `fallbackStroke` | `number` | `0x666666` | Stroke colour for the fallback rectangle. |

#### MakeTextureKeyFn

Type alias: `(templateId: string, width: number, height: number) => string`

Derives a texture cache key. Games with custom texture pipelines provide their own implementation via `RenderCardSvgOptions.makeKey`.

#### RequestTextureFn

Type alias: `(scene: Phaser.Scene, templateId: string, width: number, height: number) => void`

Initiates asynchronous texture generation. Games with custom texture pipelines provide their own implementation via `RenderCardSvgOptions.requestTexture`.

### Adapter pattern

Each game provides a thin adapter module under `src/ui/Renderer/adapters/` that re-exports shared helpers and wires game-specific texture pipelines. This keeps scene code importing from a single adapter while the shared API remains stable.

#### Main Street adapter (`src/ui/Renderer/adapters/MainStreetAdapter.ts`)

Re-exports `createActionButton` and `attachHudTooltipZone` unchanged. Provides `mainStreetRenderCardSvg` that wires the scene's `templateKeyForCard` and `requestCardTexture` methods:

```typescript
import {
  createActionButton,
  attachHudTooltipZone,
  mainStreetRenderCardSvg,
  createMainStreetHintButton,
} from '@ui/Renderer/adapters/MainStreetAdapter';

// Button and tooltips use the shared helpers directly
const buyBtn = createActionButton(this, x, y, 120, 'Buy', () => buy());
attachHudTooltipZone(this, costText, 'Card cost', () => `Cost: ${card.cost}`);

// Card rendering uses the Main Street–specific wrapper
mainStreetRenderCardSvg(this, slotContainer, card.id, CARD_W, CARD_H);

// Hint button with game-specific styling
createMainStreetHintButton(this, x, y, 80, 32, hintUsed, () => showHint());
```

### Migration reference: helpers moved from game scenes

The following table lists helpers that were extracted from individual game scenes into the shared Renderer module.

| Old location (scene) | Old name | New location | New name |
|---|---|---|---|
| `example-games/main-street/scenes/MainStreetScene.ts` | Inline HUD container creation | `@ui/Renderer` | `createHudContainer` |
| `example-games/main-street/scenes/MainStreetScene.ts` | Inline HUD text styling | `@ui/Renderer` | `createHudText` |
| `example-games/main-street/scenes/MainStreetScene.ts` | Inline tooltip zone setup | `@ui/Renderer` | `attachHudTooltipZone` |
| `example-games/main-street/scenes/MainStreetScene.ts` | Inline action button creation | `@ui/Renderer` | `createActionButton` |
| `example-games/main-street/scenes/MainStreetRenderer.ts` | `renderCardSvg` (local) | `@ui/Renderer` | `renderCardSvg` |
### Before and after migration examples

**Before (Main Street — inline in scene):**

```typescript
// Old pattern: duplicated in every scene
const hudContainer = this.add.container(0, 0);
hudContainer.setDepth(1000);

const scoreText = this.add.text(10, 10, 'Score: 0', {
  fontSize: '16px',
  fontStyle: 'bold',
  color: '#ffcc44',
  fontFamily: 'system-ui, sans-serif',
}).setOrigin(0, 0.5);

const buyBtn = this.add.container(x + 60, y + 16);
const bg = this.add.rectangle(0, 0, 120, 32, 0x554422, 0.8);
bg.setStrokeStyle(1, 0xaa8855);
buyBtn.add(bg);
const label = this.add.text(0, 0, 'Buy', {
  fontSize: '14px', fontStyle: 'bold', color: '#ffcc88',
}).setOrigin(0.5);
buyBtn.add(label);
bg.setInteractive({ useHandCursor: true });
bg.on('pointerdown', () => buyCard());
```

**After (using shared Renderer via adapter):**

```typescript
import {
  createHudContainer,
  createHudText,
  createActionButton,
} from '@ui/Renderer/adapters/MainStreetAdapter';

const hud = createHudContainer(this);
const scoreText = createHudText(this, 10, 10, 'Score: 0', '#ffcc44');
hud.add(scoreText);

createActionButton(this, x, y, 120, 'Buy', () => buyCard());
```

### Changelog

> **PR**: Merged as part of [Shared Renderer epic (GitHub #568)](https://github.com/TheWizardsCode/Tableau-Card-Engine/issues/568)

| Commit | Work Item | Description |
|---|---|---|
| `42a3916` | CG-0MPOLH2U9001P7BC | Shared Renderer API scaffold and core helpers |
| `7d80ec1` | CG-0MPOLHCAN004D753 | Card rendering SVG wrapper helper (`renderCardSvg`) |
| `9f1272f` | CG-0MPOLHCAN0037UUS | Main Street adapter and migration |
| `f173bfd` | CG-0MPOLHCBV005SD2L | Migration documentation in DEVELOPER.md |

### Related work items

- **Shared Renderer** (CG-0MP12VWO1003YL55) — parent epic
- **Shared Renderer API scaffold and core helpers** (CG-0MPOLH2U9001P7BC)
- **Card rendering SVG wrapper helper** (CG-0MPOLHCAN004D753)
- **Main Street adapter and migration** (CG-0MPOLHCAN0037UUS)
- **Unit test specification for shared Renderer helpers** (CG-0MPOLGVTH009NSTM)
- **Browser integration smoke tests for Main Street** (CG-0MPOLGZ70000Q9J1)

See the Gym SLL demo (`example-games/gym/scenes/GymSllScene.ts`) for a working example with shell toggling.

### Standard SLL migration pattern for new games

When adding a new example game, follow this pattern:

1. **Create a layout JSON file** in `example-games/<game>/layouts/<game>.layout.json` with **position-only** normalized zone rectangles (`x`, `y`) and anchors. Use `baseViewport` of 1280x720 (matching the shared `GAME_W`/`GAME_H` constants).

   **Important**: Layout zones define **positioning only** (`x`, `y`). Card dimensions come entirely from per-game constants (e.g., `CARD_W`, `CARD_H`), not from layout zones. The `pixelOverride` field supports exact pixel-position overrides for `x` and `y` only — no dimensions.

2. **Create a layout adapter** in `example-games/<game>/scenes/<Game>LayoutAdapter.ts` that:
   - Parses the layout JSON using `parseScreenLayoutDocument`
   - Defines a typed `GameLayout` interface with the positions your renderer needs
   - Exports a `compute<Game>Layout()` function that maps SLL zones to the game-specific shape, falling back to legacy values if the SLL document is unavailable

3. **Update the renderer** to:
   - Import `compute<Game>Layout()` and call it in the constructor
   - Replace hardcoded position constants with `this.layout.<property>` references
   - Card dimensions always come from per-game constants (e.g., `CARD_W`, `CARD_H`); never derive card sizes from layout zones

4. **Update the Constants file** to:
   - Remove layout position constants (e.g. `PILE_X`, `HAND_Y`)
   - Keep card dimensions, timing constants, audio keys, and game-logic constants
   - Add a comment noting that layout positions are now defined via SLL

5. **Update tests** that mock renderers to include a `layout` property matching the `GameLayout` interface.

### Authoring and validation workflow

1. Author/update a `*.layout.json` file with **position-only** normalized zone rectangles (`x`, `y` — no `width`/`height`) and anchors.
2. Validate schema + parse behavior via:
   ```bash
   npx vitest run tests/ui/screen-layout-schema.test.ts --project unit
   ```
3. Validate mapping behavior via:
   ```bash
   npx vitest run tests/ui/screen-layout-mapping.test.ts --project unit
   ```
4. Validate SLL composition and Gym integration via:
   ```bash
   npx vitest run tests/ui/screen-layout-compose.test.ts --project unit
   npx vitest run tests/gym/GymSllScene.browser.test.ts --project browser
   ```
5. Validate Main Street layout integration via:
   ```bash
   npx vitest run tests/main-street/MainStreetLayoutAnchors.browser.test.ts --project browser
   npx vitest run tests/main-street/MainStreetScene.browser.test.ts --project browser
   ```

### Migration and fallback behavior

- Use `adaptLayoutWithFallback(...)` for incremental scene migration.
- If a layout document is missing or mapping fails, fallback layout code remains active.
- Runtime issue hooks (`ScreenLayoutIssue`) can be wired to telemetry/logging without changing scene logic.

### Troubleshooting SLL issues

- If schema validation fails, inspect `path` and `message` in validation errors from `validateScreenLayoutDocument`.
- If zones/anchors are missing at runtime, look for `UNKNOWN_ZONE` / `UNKNOWN_ANCHOR` issues.
- If scene behavior unexpectedly matches legacy coordinates, verify that the adapter sees a valid layout document and that the relevant zone names exist.

### Tutorial layout composition pattern

Main Street uses a **tutorial-specific layout file** that complements the base layout with
bounding-box zones for tutorial highlight areas. This pattern allows the tutorial to define
zones that don't exist in the base scene layout (HUD strip, help button, investments row) while
reusing base layout zones through composition.

#### File layout

| File | Purpose |
|------|--------|
| `example-games/main-street/layouts/main-street.layout.json` | Canonical base layout (8 zones, position-only) |
| `example-games/main-street/layouts/main-street-tutorial.layout.json` | Tutorial-specific layout (7 zones, position + dimensions) |
| `example-games/main-street/scenes/MainStreetTutorialHints.ts` | Tutorial overlay manager |
| `example-games/main-street/TutorialFlow.ts` | T1-T23 unified step definitions with `TutorialHighlightZone` / `TutorialActionType` types |

#### How composition works

The tutorial layout is composed with the base layout using `composeResolvedLayouts()`:

```typescript
import { composeResolvedLayouts } from '@ui';
import type { ScreenLayoutDocument } from '@ui';

// Load both layout documents
const baseDoc = parseScreenLayoutDocument(baseLayoutJson) as ScreenLayoutDocument;
const tutorialDoc = parseScreenLayoutDocument(tutorialLayoutJson) as ScreenLayoutDocument;

// Compose with sceneWins policy (tutorial zones override base zones on collision)
const resolved = composeResolvedLayouts(
  baseDoc,
  tutorialDoc,
  { width: 1280, height: 720 },  // viewport
  1,                              // DPR
  { policy: 'sceneWins' },
);

// Access tutorial-specific zones
const hudRect = resolved.zones.hud.rect;      // { x, y, width, height }
const streetRect = resolved.zones.streetGrid.rect;

// Access base zones alongside tutorial zones
const marketRect = resolved.zones.market.rect;  // still available from base
```

#### Tutorial zone names

The tutorial layout defines these zones (all use normalized coordinates with optional `w`/`h` dimensions):

| Zone ID | Description | Uses dimensions |
|---------|-------------|-----------------|
| `hud` | HUD strip (top bar with coins, reputation, score) | Yes (full-width bounding box) |
| `marketBusinessRow` | Legacy full-market-area zone (single row now drawn in the same band) | No (informational) |
| `streetGrid` | The 2×5 street grid for placing businesses | Yes (stops before right column) |
| `endTurnButton` | End Turn action button area | Yes |
| `incidentQueue` | Face-down incident deck panel (card back + remaining count, CG-0MSTOATDP000JNHH) | Yes |
| `investmentsRow` | ALIAS of `developmentRow` — the market rows were merged into one (CG-0MSTOATDT009BRX2); upgrade/event steps highlight the same single row | Yes |
| `helpButton` | Help/settings button area | Yes |

Zones that return `null` for highlighting (no bounding box needed):
- `center-modal` — centered overlay
- `completion-modal` — centered completion dialog

#### Schema extension for dimensions

The `NormalizedRect` type and JSON Schema were extended with optional `w` (width) and `h` (height)
fields. These are **fully backward-compatible** — existing position-only zones continue to work
without modification. When `w` and `h` are present, `getZoneRect()` returns a `PixelRect` with
`width` and `height` set.

```typescript
// Position-only (existing pattern)
interface PositionOnlyRect {
  x: number;  // 0-1 normalized
  y: number;  // 0-1 normalized
}

// Dimensioned (new pattern for bounding boxes)
interface DimensionedRect {
  x: number;
  y: number;
  w?: number;  // optional width (0-1 normalized)
  h?: number;  // optional height (0-1 normalized)
}
```

#### Authoring a tutorial layout

When creating a new tutorial layout file:

1. **Copy the base layout** structure (`version`, `id`, `baseViewport`, `requiredZones`)
2. **Define only the zones needed** for tutorial highlights (you don't need all base zones)
3. **Include `w` and `h`** for all zones that need bounding-box dimensions
4. **Use normalized coordinates** (0-1) — resolution is handled at runtime by `normalizedToPixels()`
5. **Add anchors** for each zone (used for tooltip positioning relative to the zone)
6. **Validate** with `validateScreenLayoutDocument()` and `composeResolvedLayouts()` before committing

See `example-games/main-street/layouts/main-street-tutorial.layout.json` for a complete example.

#### Tutorial tooltip input routing (DOM pass-through prevention)

The tutorial tooltip is rendered as a Phaser **DOMElement** (`s.add.dom`) so it can draw above
DOM-based card elements. Phaser 4 (RC.7) enables `input.windowEvents` by default: the
MouseManager and TouchManager register `mousedown`/`mouseup` and `touchstart`/`touchend`
listeners on `window.top` that process ANY event whose `event.target` is not the canvas —
guarded only by `!event.defaultPrevented` (see `node_modules/phaser/src/input/mouse/MouseManager.js`
and `touch/TouchManager.js`). Without interception, a pointer down/up on the tooltip (a button or
the box itself) would ALSO dispatch `pointerdown`/`pointerup` to whatever interactive game object
lies beneath the tooltip (hand card, market card, street slot, End Turn), corrupting game state
mid-tutorial.

`MainStreetTutorialHints.showStep()` therefore attaches `stopPropagation` listeners for
`pointerdown`, `pointerup`, `mousedown`, `mouseup`, `touchstart`, `touchend` and `touchcancel` on
the tooltip container, so those events never reach Phaser's window-level listeners. This is the
only place in the repo that creates interactive Phaser DOM elements. `stopPropagation` (rather
than `preventDefault`) is used deliberately:

- it does NOT cancel the browser's default actions, so touch scrolling of the `overflow: auto`
  tooltip body keeps working, and
- it does NOT suppress the DOM `click` event, so the buttons' `onclick` handlers (Next / Exit
  Tutorial / Let's play!) still fire.

Regression coverage: `tests/main-street/TutorialOverlayClickThrough.browser.test.ts` dispatches
real pointer events at a tutorial button (and the tooltip box) positioned over an interactive
market card and asserts the game state beneath is untouched while the button's own action fires.
See CG-0MSTB03U6009J2WV for the original bug report.

### Related follow-up scope

- Tutorial-specific layout migration remains tracked separately in work item **Adapt tutorial system to use layout description (CG-0MP7IZ4RK008065O)**.

## Shared HUD Components

The engine provides a collection of reusable HUD (heads-up display) components under `src/ui/` that standardise overlay, sidebar, and button UI across all example games. These components are exported via the core-engine public API (`src/ui/index.ts`) and are consumed through adapter modules in each game.

### Help Panel

The `HelpPanel` class provides a slide-in left sidebar that displays game rules, controls, and tips. It accepts an array of `HelpSection` objects, each with a `heading` and either `body` (plain text) or `render` (custom Phaser renderer) for rich content.

```typescript
import { HelpPanel, type HelpSection } from '@ui';

const helpPanel = new HelpPanel(this, {
  sections: [
    { heading: 'How to Play', body: 'Select cards and build sets...' },
    { heading: 'Scoring', body: 'Each card contributes...' },
  ],
});
helpPanel.open();   // Slide in from the left
helpPanel.close();  // Slide out
helpPanel.toggle(); // Toggle open/closed
```

**Depth conventions:**
- Input blocker: 900
- Panel background: 901
- Panel content: 902
- Close button: 903
- Help button: 1101

**Input blocking:** When open, the panel creates a full-screen transparent interactive rectangle that captures pointer events. Closing the panel removes this blocker.

### Help Button

The `HelpButton` class renders a circular "?" toggle button that opens/closes the associated `HelpPanel`. It renders at depth 1101 (above all gameplay and HUD content).

```typescript
import { HelpButton } from '@ui';

const helpButton = new HelpButton(this, helpPanel);
```

### Settings Panel

The `SettingsPanel` class provides a slide-in right sidebar with controls for:
- Sound mute toggle
- Volume slider
- Tooltip visibility toggle
- Reduced motion toggle
- Configurable End Turn keybind
- Difficulty selector (when `difficultyNames` provided)

```typescript
import { SettingsPanel } from '@ui';

const settingsPanel = new SettingsPanel(this, {
  soundManager: this.soundManager,
  difficultyNames: ['Easy', 'Medium', 'Hard'],
});
settingsPanel.open();   // Slide in from the right
settingsPanel.close();  // Slide out
settingsPanel.toggle(); // Toggle open/closed
```

**Depth conventions:** Same as HelpPanel (blocker 900, background 901, etc.). Settings button at depth 1102.

### Settings Button

The `SettingsButton` class renders a circular gear icon (\u2699) toggle button that opens/closes the associated `SettingsPanel`. It renders at depth 1102.

```typescript
import { SettingsButton } from '@ui';

const settingsButton = new SettingsButton(this, settingsPanel);
```

### Overlay Background System

The shared overlay system provides full-screen modal overlays with input-blocking backgrounds.

```typescript
import { createOverlayBackground, dismissOverlay } from '@ui';

// Create an overlay with a dark background and a visible centered box
const { background, box, objects } = createOverlayBackground(
  scene,
  { depth: 10, alpha: 0.75 },       // full-screen dark overlay
  { width: 500, height: 300, alpha: 0.95 }, // centered content box
);

// Later, dismiss the overlay
dismissOverlay(objects);
```

### Overlay Manager

The `OverlayManager` class provides a lifecycle wrapper around the overlay background system.

```typescript
import { OverlayManager } from '@ui';

const overlayManager = new OverlayManager(scene);
const overlay = overlayManager.create({ depth: 10 }, { width: 500, height: 300 });
overlayManager.dismiss(); // Cleans up all managed objects
```

### Overlay Button

The `createOverlayButton` factory creates interactive text buttons with hover effects, suitable for use in modal overlays (win screens, pause menus, etc.).

```typescript
import { createOverlayButton } from '@ui';

const playAgainBtn = createOverlayButton(
  scene,
  GAME_W / 2, GAME_H / 2 + 50,
  '[ Play Again ]',
  11, // depth
);
playAgainBtn.on('pointerdown', () => scene.scene.restart());
```

### Menu Button

The `createOverlayMenuButton` factory creates a "[ Menu ]" button that navigates to the GameSelectorScene when clicked.

```typescript
import { createOverlayMenuButton } from '@ui';

const menuBtn = createOverlayMenuButton(scene, GAME_W / 2, GAME_H / 2 + 50, 11);
```

### Parameterized Overlay

The `createParameterizedOverlay` factory combines overlay background, title text, detail text, and action buttons into a single convenient call.

```typescript
import { createParameterizedOverlay, overlayCenterY } from '@ui';

const objects = createParameterizedOverlay(scene, {
  title: 'You Win!',
  titleColor: '#88ff88',
  detailText: 'Score: 100',
  titleY: overlayCenterY(-60),
  detailY: overlayCenterY(-15),
  titleDepth: 11,
  detailDepth: 11,
  background: { depth: 10, alpha: 0.75 },
  box: { width: 460, height: 280, alpha: 0.9 },
  buttons: [
    { label: '[ Play Again ]', x: GAME_W / 2 - 90, y: GAME_H / 2 + 60, onClick: () => scene.scene.restart() },
  ],
});
```

### CardGameScene Base Class

The `CardGameScene` abstract class (at `src/ui/CardGameScene.ts`) provides shared boilerplate for all card game scenes:
- Event system setup (`GameEventEmitter` + `PhaserEventBridge`)
- Sound system setup (`SoundManager` + SFX registration)
- Help and Settings panel initialization via `initHelpPanel()` and `initSettingsPanel()`
- Undo/redo button creation via `initUndoRedoButtons()` with resolution-independent positioning
- Undo/redo button state updates via `refreshUndoRedoButtons(canUndo, canRedo)`
- Replay mode detection
- Standard shutdown/cleanup via `shutdownBase()`

```typescript
import { CardGameScene, type HelpSection } from '@ui';

export class MyGameScene extends CardGameScene {
  constructor() { super({ key: 'MyGameScene' }); }

  create(): void {
    this.detectReplayMode();
    this.initEventSystem();

    if (!this.replayMode) {
      this.initHelpPanel(helpContent as HelpSection[]);
      this.initSettingsPanel();
      this.initUndoRedoButtons(
        () => this.turnController.performUndo(),
        () => this.turnController.performRedo(),
      );
    }
    // ... game-specific setup ...
  }

  shutdown(): void {
    this.shutdownBase();
  }
}
```

The `initHelpPanel()` method creates both `HelpPanel` and `HelpButton`. The `initSettingsPanel()` method creates both `SettingsPanel` and `SettingsButton`. These are accessed via `this.helpPanel`, `this.helpButton`, `this.settingsPanel`, and `this.settingsButton` respectively.

### Undo/Redo Buttons

The `initUndoRedoButtons(onUndo, onRedo)` method creates standard undo/redo
action buttons positioned to avoid overlap with the settings and help toggle
buttons. The positioning is resolution-independent — computed dynamically from
the scene viewport using the same formula as the settings button's default
position.

- **Undo button** is placed to the left of the settings button
- **Redo button** is placed to the right of the undo button
- Both buttons are parented into `hudContainer` for consistent depth ordering
- Use `refreshUndoRedoButtons(canUndo, canRedo)` to update enabled/disabled
  state (alpha 1.0 when enabled, 0.5 when disabled)
- Both buttons are destroyed in `shutdownBase()`
- This method is **opt-in**: only scenes that explicitly call it get undo/redo
  buttons (games without undo/redo are unaffected)

### HUD Container Pattern

Games that need to separate persistent overlay elements (help/settings buttons, panel input blockers) from transient HUD elements (score text, status bars) should use a two-container pattern:

1. **`hudOverlayContainer`** – Persistent container for help/settings buttons and panel input blockers. Not rebuilt during HUD refresh cycles.
2. **`hudContainer`** – Transient container for HUD text and elements that need to be rebuilt each refresh. Children should be tagged with `_hudTransient: true`.

If no `hudOverlayContainer` exists on the scene, the HelpPanel and SettingsPanel will fall back to `hudContainer`, and if neither exists, they use standard depth layering.

### GymButtonBar

The `GymButtonBar` class (at `src/ui/GymButtonBar.ts`) provides a reusable full-width button bar with **left, center, and right zones** and **automatic row wrapping**. It is designed for Gym demo scenes to replace the manual `addButton(x, y, ...)` pattern with a declarative API.

```typescript
import { GymButtonBar } from '@ui';

const bar = new GymButtonBar(scene, {
  y: 60,                 // Y position of first row
  zone: 'center',        // default zone for buttons (optional)
  padding: 20,           // horizontal padding from screen edges
  buttonGap: 16,         // gap between buttons within a zone
  rowSpacing: 28,        // vertical gap between wrapped rows
  width: GAME_W,         // total bar width (defaults to 1280)
});

bar.addButton('[ Draw ]', () => this.drawCard(), { zone: 'center' });
bar.addButton('[ Discard ]', () => this.discardCard(), { zone: 'right' });
bar.addButton('[ Reset ]', () => this.resetGame(), { zone: 'left' });
```

#### Zones

Each zone occupies one-third of the bar width:
- **`'left'`** — Buttons align to the left edge of the left zone
- **`'center'`** — Buttons are centered in the center zone
- **`'right'`** — Buttons align to the right edge of the right zone

Buttons that overflow their zone width automatically wrap to a new row below. Multiple rows (1..n) are supported.

#### Per-button overrides

```typescript
bar.addButton('[ Custom ]', () => { /* ... */ }, {
  zone: 'left',
  fontSize: '16px',
  color: '#ff8888',          // text color
  hoverColor: '#ffbbbb',     // hover color
});
```

#### Instance methods

| Method | Description |
|--------|-------------|
| `addButton(label, callback, opts?)` | Add a button to the bar. Returns the `Phaser.GameObjects.Text` instance for further manipulation (e.g., `setVisible()`, `setText()`). |
| `refresh()` | Re-layout all buttons (call after modifying button visibility or text). |
| `destroy()` | Remove all buttons and clean up. |

#### Integration with GymSceneBase

Gym scenes call `initButtonBar()` once per button row/section. Each call creates a **new** `GymButtonBar` at the given Y position and appends it to an internal registry — previously created bars are **kept** (no destroy-and-recreate). `this.buttonBar` always points at the most recently created bar:

```typescript
// Controls row 1
this.initButtonBar(60);
this.buttonBar!.addButton('[ Draw ]', () => this.drawToHand(), { zone: 'center' });
this.buttonBar!.addButton('[ Discard ]', () => this.discardSelected(), { zone: 'center' });

// Controls row 2 — a SECOND bar; row 1 is NOT destroyed
this.initButtonBar(112);
this.buttonBar!.addButton('[ Disable Drag ]', () => this.toggleDrag(), { zone: 'center' });
```

`initButtonBar(y, opts?)` returns the created bar (also exposed as `this.buttonBar`), and accepts the same `GymButtonBarConfig` overrides as the `GymButtonBar` constructor (e.g. `{ zone: 'left' }`, `{ rowSpacing: 30 }`).

All registered bars are destroyed automatically when the scene shuts down or is destroyed, so scene restarts are leak-free. `GymSceneBase` wires this cleanup to the Phaser scene `shutdown`/`destroy` events on the first `initButtonBar()` call.

The `GymButtonBar` is exported from the UI barrel (`src/ui/index.ts`) and can be used by any scene, not just Gym scenes.

### Depth Convention Summary

| Component | Depth |
|-----------|-------|
| Gameplay containers | 0–999 |
| HUD container (transient) | 1000 |
| Help panel button | 1101 |
| Settings panel button | 1102 |
| Panel input blocker | 900 |
| Panel background | 901 |
| Panel content | 902 |
| Panel close button | 903 |
| Overlay background | 10–2000 (game-specific) |
| Overlay buttons | overlay depth + 1 |

## Keeping Docs Up to Date

See the **Doc-Update Policy** in `AGENTS.md` for the canonical policy. In summary: any change that alters developer workflows must include a corresponding documentation update in both `docs/DEVELOPER.md` and `AGENTS.md`, or a child work item tracking the doc update must be created.

## Work-Item Tracking

This project uses **Worklog (wl)** for all task tracking. See the Worklog section in `AGENTS.md` for full documentation on creating, updating, closing, and querying work items.

Quick reference:

```bash
wl next --json              # what should I work on?
wl create --title "..." --json  # create a work item
wl update <id> --status in_progress --json  # claim a task
wl close <id> --reason "..." --json  # close when done
```

## Developer Mode Debug Tools

The Tableau Card Engine includes a suite of debug tools that appear only when
running in developer mode (`npm run dev`). In production builds (`npm run build`),
the entire debug infrastructure is tree-shaken from the bundle using Vite's
`import.meta.env.DEV` build-time constant.

### How It Works

- **Dev mode detection:** A shared `isDevMode()` function (in
  `src/ui/debug/DebugToolsRegistry.ts`) returns the value of
  `import.meta.env.DEV`. During `npm run dev`, this is `true`. In production
  builds, Vite replaces it with `false` and tree-shakes all dead code gated
  behind `if (isDevMode())` — no debug code leaks into the production bundle.

- **Debug Tools section:** When `import.meta.env.DEV` is `true` and at least
  one debug tool is registered, a "Debug Tools" section appears at the bottom
  of the Settings panel (below all other sections). Each tool is displayed as
  a clickable label with a short description.

- **Opening the tools:** Press the Settings button (gear icon) in any game
  scene, scroll to the bottom of the panel, and click a debug tool to open
  its overlay.

### Available Debug Tools

#### Export Session

- **Label:** "Export Session"
- **Location:** Debug Tools section of the Settings panel
- **Function:** Downloads the current game transcript as a JSON file. If the
  active scene has a `recorder` with a `getTranscript()` method, it serializes
  the full transcript. Otherwise, it produces an empty transcript with metadata.
- **Use case:** Developers can export session data for debugging, regression
  testing, or replay without needing to finish the game or use CLI tools.
- **Implementation:** `src/ui/debug/SessionExportTool.ts`

#### State Inspector

- **Label:** "State Inspector"
- **Location:** Debug Tools section of the Settings panel
- **Function:** Opens a scrollable overlay showing the current game state as a
  collapsible tree view. Features include:
  - **Collapsible tree:** Click ▶/▼ icons to expand or collapse objects.
  - **Text filter:** Type in the filter field to show only matching fields
    (matched against key names and string values).
  - **Refresh button:** Re-reads the scene's state and redraws the tree.
  - **Close button:** Dismisses the overlay.
- **State detection:** The inspector automatically detects common state patterns
  (`state`, `gameState`, `session`, `recorder`). Falls back to enumerating all
  scene properties.
- **Use case:** Inspect runtime game state to debug AI decisions, rule
  validation, and rendering issues.
- **Implementation:** `src/ui/debug/StateInspectorOverlay.ts`

#### Game Events

- **Label:** "Game Events"
- **Location:** Debug Tools section of the Settings panel
- **Function:** Opens a scrollable overlay showing a live feed of events
  emitted by the `GameEventEmitter` during gameplay. Features include:
  - **Live feed:** Each event displays an ISO timestamp, event name (e.g.,
    `turn-started`, `turn-completed`, `state-settled`, `card-drawn`), and a
    truncated view of the event payload.
  - **Auto-scroll:** Newest events appear at the bottom and are shown
    automatically.
  - **Clear button:** Removes all entries from the feed.
  - **Pause/Resume:** Toggles whether new events are added to the feed.
- **Event source:** Subscribes to the `GameEventEmitter` instance exposed on
  `window.__GAME_EVENTS__` (set up automatically by `CardGameScene`).
- **Use case:** Monitor event flow during gameplay for debugging event-driven
  interactions or replays.
- **Implementation:** `src/ui/debug/GameEventLogOverlay.ts`

#### AI Decisions

- **Label:** "AI Decisions"
- **Location:** Debug Tools section of the Settings panel
- **Function:** Opens a scrollable overlay showing per-turn AI decision
  records. Features include:
  - **Decision records:** Each entry shows turn number, AI strategy name,
    and a description of the chosen action.
  - **Clear button:** Removes all entries.
  - **Pause/Resume:** Toggles whether new decisions are recorded.
- **Recording:** Game scenes push decision data to the global
  `AiDecisionRecorder` singleton at decision points. Golf's `GolfAiController`
  is instrumented out of the box; other games can add recording by importing
  and calling `AiDecisionRecorder.getInstance().record(...)`.
- **Use case:** Debug AI behavior, verify strategy selection, and inspect
  decision patterns across turns.
- **Implementation:**
  - `src/ui/debug/AiDecisionRecorder.ts` — Recording singleton
  - `src/ui/debug/AiDecisionOverlay.ts` — Display overlay

### Adding a New Debug Tool

Adding a new debug tool requires minimal code:

1. **Create a tool factory** in a new file under `src/ui/debug/` that exports a
   function returning a `DebugToolsEntry` object:

   ```ts
   import type { DebugToolsEntry } from './DebugToolsRegistry';

   export function createMyTool(): DebugToolsEntry {
     return {
       label: 'My Tool',
       description: 'What my tool does',
       activate: (scene: Phaser.Scene) => {
         // Your tool logic here
       },
     };
   }
   ```

2. **(Optional) Export from the barrel** by adding to `src/ui/debug/index.ts`.

3. **Register the tool** by adding it to the default debug tools array in
   `CardGameScene.initSettingsPanel()` (in `src/ui/CardGameScene.ts`):

   ```ts
   import { createMyTool } from './debug/MyTool';
   // ...
   const effectiveDebugTools = debugTools ?? [
     createSessionExportTool(),
     createStateInspectorTool(),
     createGameEventLogTool(),
     createAiDecisionViewerTool(),
     createMyTool(),   // <-- add yours here
   ];
   ```

   Alternatively, pass a custom `debugTools` array directly to
   `initSettingsPanel()` from any game scene to override the defaults.

4. **Write tests** (at minimum, verify the factory returns a valid entry).

### Production Safety

All debug code is gated behind `if (isDevMode())` (or direct `if (import.meta.env.DEV)`), which Vite evaluates at build time. During `npm run build`:

- `import.meta.env.DEV` is replaced with `false`.
- All code inside `if (false) { ... }` blocks is eliminated by Vite's
  tree-shaking (dead code elimination).
- No debug strings, imports, or logic appear in the production bundle.

To verify production safety:

1. Build the project: `npm run build`
2. Check the output bundle for any debug-related strings:
   ```bash
   grep -i "debug\\|state inspector\\|export session\\|game events\\|ai decisions" dist/assets/*.js
   ```
   This should produce no matches.

### Key Files

| File | Purpose |
|------|---------|
| `src/ui/debug/DebugToolsRegistry.ts` | `isDevMode()` function and `DebugToolsEntry` type |
| `src/ui/debug/SessionExportTool.ts` | Session export debug tool |
| `src/ui/debug/StateInspectorOverlay.ts` | State inspector overlay |
| `src/ui/debug/GameEventLogOverlay.ts` | Game event log overlay |
| `src/ui/debug/AiDecisionRecorder.ts` | AI decision recording singleton |
| `src/ui/debug/AiDecisionOverlay.ts` | AI decision viewer overlay |
| `src/ui/debug/index.ts` | Debug tools barrel file |
| `src/ui/CardGameScene.ts` | Default debug tool registration |
| `src/ui/SettingsPanel.ts` | Debug section rendering in Settings panel |

## Troubleshooting

**Vite dev server memory growth / heap OOM (CG-0MSXL0A25009WZVK):**

- **Symptoms:** the `npm run dev` process aborts after minutes of use with
  `FATAL ERROR: Ineffective mark-compacts near heap limit - JavaScript heap
  out of memory` (V8 old-space near the 4 GB default cap; native stack in
  `libnode.so`, `Aborted (core dumped)`). Seen on the Main Street game-over
  screen and in the vitest browser stage.
- **Root cause:** the dev server's transcript pipeline wrote each
  game-over transcript as a new file inside the Vite-watched root
  (`data/transcripts/`), and Vite (which does **not** consult `.gitignore`
  for watching) retained a permanent inotify watcher + path strings per
  file (~10-43 KB/file, unbounded over a dev session). The middleware also
  buffered request bodies with an unbounded O(n²) concat. On an
  `--host`-exposed server either path can balloon the heap.
- **Fix applied:** bounded request bodies (413 over 5 MiB), a 1/s write
  rate limit (429), chunk-array body accumulation, and a watcher ignore
  list for the dev-output trees — see
  [Dev-server transcript persistence: memory-safety bounds](#dev-server-transcript-persistence-memory-safety-bounds).
- **Monitoring tips (profiling a dev server):** run with
  `node --max-old-space-size=4096 --trace-gc --heapsnapshot-near-heap-limit=2
  node_modules/vite/bin/vite.js`, sample `grep VmRSS /proc/<pid>/status`
  and watcher growth (`cat /proc/<pid>/fdinfo/* | grep -c ino:` — a growing
  watch count while writing files means the ignore list is missing a
  write target); capture a heap snapshot over CDP
  (`HeapProfiler.takeHeapSnapshot` on the `--inspect` port).

**Vite dev server won't start:**
- Check port 3000 is not already in use: `lsof -i :3000`
- Try `npm run dev -- --port 3001` for an alternate port
- **Stale lock file / orphaned Vite process:** The dev server utilities now auto-clean stale processes and lock files when starting. If port 3000 is stuck, manually clean with: `rm -f tmp/dev-server-lock.json && kill -9 $(lsof -t -i :3000) 2>/dev/null; true`

**TypeScript errors on build:**
- Run `npx tsc --noEmit` to see detailed errors
- Check that path aliases match between `tsconfig.json` and `vite.config.ts`

**Tests fail to find modules:**
- Ensure Vitest config in `vite.config.ts` includes the `test.projects` block
- Verify unit test files match `tests/**/*.test.ts`
- Verify browser test files match `tests/**/*.browser.test.ts`

**Browser tests fail or time out:**
- Check the [browser test setup](#browser-test-setup) section — the most common cause is missing Playwright Chromium: `npx playwright install chromium` (add `--with-deps` on Linux for system libraries)
- `npm test` runs a fast-fail pre-check (`scripts/check-browser-test-env.ts`) that prints the exact remediation command if Chromium is missing; verify the install with `npx playwright install --list`
- Check that `@vitest/browser` version matches `vitest` version
- Browser tests boot a real Phaser game and may take 8-10 seconds each
- If tests hang, check for unresolved game instances (ensure `afterEach` destroys the game). A full `npm test` run that stalls indefinitely is aborted by the runner's wall-clock timeout (see [Hang timeout](#hang-timeout-bounded-wall-clock-abort)) with exit 124 and a `[hang-timeout]` diagnostic — run the suspected file in isolation to reproduce.
- **Process/resource leak cleanup:** All browser tests should clean up Phaser.Game instances in `afterEach` using `game.destroy(true, false)` and remove the game container div. The dev server utilities (`scripts/dev-server-utils.ts`) use a simplified start-stop-per-call pattern with no reference counting. `ensureDevServer()` kills any existing process on port 3000 before starting a fresh server. `killDevServer()` unconditionally kills the child process and any remaining process on port 3000. SIGTERM/SIGINT handlers provide additional cleanup for forced exits.

**Large bundle warning:**
- The Phaser library is ~1.4 MB minified -- this is expected
- Code-splitting can be added later via `build.rollupOptions.output.manualChunks` in `vite.config.ts`

**Replay tool: Dev server not running:**
- The replay tool (`npm run replay`) and transcript export (`npm run transcripts:export`) auto-start the dev server if `localhost:3000` is not responding
- If auto-start fails, start the dev server manually: `npm run dev`
- Check port 3000 availability: `lsof -i :3000`
- **Port conflict detection / stale server cleanup:** Before starting, `ensureDevServer()` kills any process on port 3000 using `fuser` (Linux) or `lsof` (macOS/Linux). This ensures a clean slate even if a previous server was orphaned by a crash or SIGKILL. `killDevServer()` also runs the same port-based cleanup as a belt-and-suspenders measure.

**Replay tool: Unsupported transcript version error:**
- The transcript schema includes a `version` field; the replay tool validates this and exits with a clear error if the version is unsupported
- Re-record the game to generate a transcript with the current version
- Transcripts evolve independently per game type; check the game's adapter for supported versions

**Transcript persistence: IndexedDB storage quota:**
- The `TranscriptStore` uses IndexedDB with a rolling window of the last 10 transcripts per game type
- If IndexedDB is unavailable (private browsing, storage quota exceeded), it falls back to localStorage with a console warning
- Individual large transcripts can exceed localStorage's ~5-10MB limit; a size warning is logged to console
- Use `npm run transcripts:export -- <game>` to offload transcripts to disk

**Playwright not installed:**
- The replay tool and transcript export use Playwright's Chromium browser
- Install it: `npx playwright install chromium`
- Verify installation: `npx playwright install --list`
