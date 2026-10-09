# Developer Guide

This document covers everything you need to develop, test, and build the Tableau Card Engine (TCE) project. For a high-level overview, see the [README](../README.md).

## Table of Contents

- [Environment Setup](#environment-setup)
- [Running Locally](#running-locally)
- [Building for Production](#building-for-production)
- [Config-Driven Game Catalogue](#config-driven-game-catalogue)
- [Electron Launcher / Desktop Packaging](#electron-launcher--desktop-packaging)
- [Testing](#testing)
- [Startup Context Budget](#startup-context-budget)
- [ToneForge Audio Generation](#toneforge-audio-generation)
- [Project Structure](#project-structure)
- [Path Aliases](#path-aliases)
- [Adding an Example Game](#adding-an-example-game)
- [Game Repository Setup & Publication](#game-repository-setup--publication)
- [Runtime Game Plugins](#runtime-game-plugins)
- [Card Packs](#card-packs)
- [Hand & Pile Rendering](#hand--pile-rendering)
- [Animation & Sound Feedback for Player and AI Actions](#animation--sound-feedback-for-player-and-ai-actions)
- [Example Games](#example-games)
- [Transcript Persistence](#transcript-persistence)
- [Listener Registry](#listener-registry)
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

Main Street ships with a committed ToneForge runtime synth module at
`src/core-engine/tf-runtime/main-street-runtime-synth.mjs` that works out of the
box — no `tf` CLI or generation step required. The runtime imports it with a
static specifier, so Vite/Rollup code-splits it into a lazy chunk (keeping
Tone.js out of the main bundle) and ships it in every build (dev server,
production `dist/`, and the Electron bundle).

> **Why not `public/`?** Vite serves `public/` verbatim and refuses to import a
> module from it (“This file is in /public and will be copied as-is during build
> ... it can only be referenced via HTML tags”). The committed module therefore
> lives under `src/` and is consumed by a static-specifier dynamic import.

Optionally regenerate the runtime module and WAV/metadata outputs (requires
ToneForge CLI):

```bash
npm run tf:generate
```

This refreshes the committed module at
`src/core-engine/tf-runtime/main-street-runtime-synth.mjs` and writes the
WAV/JSON/metadata outputs to `build/tf-synths/`. The committed module is the
single source of truth for shipped builds.

**Runtime activation.** The sibling app's loader
(`../tce-main-street/src/tf/mainStreetTfModule.ts`) resolves the module
asynchronously after scene boot and attaches it to `SoundManager` via
`createTfPlayer()` / `setSynthIntegration()`. Once settled,
`SoundManager.isSynthActive()` is `true`, the debug **ToneForge** entry reports
`Active`, and the entry can toggle synthesis at runtime without a scene
restart. A load/normalisation failure logs a `console.warn` with the reason and
retains diagnostics (`getMainStreetTfDiagnostics()`) that the scene forwards to
`SoundManager.setSynthDiagnostics()`.

**Missing-factory fallback.** A logical key mapped to a factory the module does
not ship is **never silently dropped**: `tfAdapter` reports whether it handled
the key and `SoundManager.play()` falls back to the WAV/Phaser path when it did
not (CG-0MUU9PSWC009CW76). This is why the `sfx-income-*` and
`sfx-challenge-complete` mappings still produce audio despite having no matching
factory.

> **Testing note.** Synthesised voices require a real Web Audio context, so they
> cannot be constructed under Node (Tone.js cannot build *any* `Gain` node
> there). Unit tests assert the wiring/structural contract; voice construction
> is covered by `tests/core-engine/tf-runtime-integration.browser.test.ts` in a
> real browser.

### Multi-Game Routing

The project uses a unified entry point (`main.ts` at the project root) that registers a `GameSelectorScene` as the initial Phaser scene alongside all example game scenes. Navigation works as follows:

- **Game Selector -> Game**: Clicking a game card calls `scene.start(sceneKey)` to transition to the selected game's scene.
- **Game -> Game Selector**: Each game scene has a `[ Menu ]` button in its title bar (top-left) and in its end-game overlays that calls `scene.start('GameSelectorScene')` to return to the selector.

The game catalogue is stored in the Phaser registry (key: `gameSelector.games`) via a `preBoot` callback, so game scenes don't need to know about the catalogue to return to the selector.

Each example game also retains its own standalone `main.ts` entry point and `createXxxGame.ts` factory function for independent testing and browser test use.

#### Config-driven game catalogue

<a id="config-driven-game-catalogue"></a>

The catalogue is **generated at build time** by
`scripts/vite-game-discovery-plugin.ts` from a config preset — `main.ts`
imports `virtual:game-registry` and never hardcodes game imports. This is what
lets a checkout build with no games (the core-engine repo) or with any subset
of 1..n games (a distribution), without editing source.

Select a preset with the `GAMES_CONFIG` environment variable (a preset name or
an explicit path; default `core-only`):

```bash
npm run build                       # default preset: core-only (Gym only)
GAMES_CONFIG=solo npm run build     # one game (configs/solo.json)
GAMES_CONFIG=arcade npm run build   # a small subset (configs/arcade.json)
GAMES_CONFIG=deluxe npm run build   # a different subset (configs/deluxe.json)
GAMES_CONFIG=full npm run build     # every game (configs/full.json)
GAMES_CONFIG=main-street npm run build # one named game (configs/main-street.json)
GAMES_CONFIG=/path/to/my.json npm run build   # an explicit preset
```

The launcher ships two preset families. **Distribution presets** describe build
shapes (the `1 game` and `all games` cases are the boundary distributions):

| Preset | Games |
|---|---|
| `configs/core-only.json` | none — engine + Gym (default) |
| `configs/solo.json` | golf |
| `configs/arcade.json` | golf, main-street |
| `configs/deluxe.json` | feudalism, lost-cities |
| `configs/full.json` | all eight games |

**Per-game presets** (`configs/<game-id>.json`) each select exactly one game,
so `GAMES_CONFIG=<game-id>` builds or runs just that game (plus the
always-present Gym) for a fast development loop — for every example game
(`beleaguered-castle`, `blackjack`, `coloretto`, `feudalism`, `golf`,
`lost-cities`, `main-street`, `sushi-go`). Per-game presets are additive: the
distribution presets above are unchanged.

Presets live in `configs/`, are **data only**, and list the sibling game repos
to include:

```json
{
  "games": [
    { "id": "golf", "path": "../tce-golf",
      "scenePath": "../tce-golf/src/scenes/GolfScene.ts" }
  ]
}
```

An unknown preset **name** fails the build rather than silently shipping fewer
games. A game is resolved **sibling-only** (the merged core carries no games at
HEAD): first at the Option C `src/` layout (`../tce-<id>/src/…`), then at the
legacy sibling layout (`../tce-<id>/example-games/<id>/…`). An in-tree
`example-games/<id>/` copy is never consulted. A missing game fails the build
with a message naming it and every path it looked in. The **Gym is core-owned
and always present**, including in a core-only build.

A full multi-game distribution is composed from the core plus sibling game
checkouts; bootstrap it in one command:

```bash
npm run setup:distribution -- --dir ..   # clone core + all sibling game repos
npm run setup:distribution -- --dry-run  # print the plan only
```

#### Game asset composition

`setup:distribution` checks out the game repos; it does not copy their assets.
The launcher owns only the **shared** assets under `public/assets/`, while each
game's **game-owned** assets live in that game repo's own `public/assets/`
tree. `scripts/vite-game-assets-plugin.ts` (backed by
`scripts/link-game-assets.ts`) therefore composes the selected games'
game-owned roots into the launcher's `public/assets/` at config resolution —
before Vite scans (`dev`) or copies (`build`) the public dir — using the
ownership table `scripts/configs/repo-layout.json → gameAssets` and the active
`GAMES_CONFIG` preset.

- `GAMES_CONFIG=full npm run dev` / `npm run build` serve every selected
game's thumbnails, icons and audio with no extra step.
- Composition is idempotent; an existing correct link is untouched, a real
  file at a destination is never clobbered, and links for games the preset no
  longer selects are removed (so `core-only` leaves the tree clean).
- The composed links are generated artefacts and are gitignored. Drive them
  manually with `npx tsx scripts/link-game-assets.ts [--dry-run] [--json]`.

Related work item: CG-0MUKYCG9L00587FA.

> **Full reference:** [Config-Driven Game Catalogue](dev/game-configuration.md)
> is the authoritative guide to the preset schema (required and optional
> fields, the `$comment` annotation), selection, the three-step resolution
> order, the `GAME_INFO` convention and its bounded parsing, validation/failure
> modes, and how to author a new preset.

> **Two config locations, two purposes:** `configs/*.json` (this section) are
> **build presets** selecting which games a build includes; the repo partition
> used by the extraction tooling lives separately at
> `scripts/configs/repo-layout.json` (see
> [Multi-Repo Architecture](dev/multi-repo-architecture.md)).

> **Test suites always use the full preset.** The shell runners
> (`scripts/run-ci-tests.sh`, `run-dev-tests.sh`, `run-smoke-tests.sh`,
> `run-tutorial-tests.sh`) export `GAMES_CONFIG=full` by default, because the
> game suites exercise every game. Override with an explicit `GAMES_CONFIG=…` if
> needed. In a game-free core checkout the Main Street tutorial projects match
> no files; `run-tutorial-tests.sh` skips them (and the projects set
> `passWithNoTests`), so the core's suite stays green without sibling games.

> **`.worklog/worktrees/` layouts:** the sibling lookup is relative to the
> current project root, so presets resolve from a git worktree exactly as from
> the main checkout. Because games are sibling checkouts (`../tce-<game>`),
> a worktree resolves siblings next to itself (`.worklog/worktrees/tce-<game>`);
> run distribution builds from the main checkout, or symlink siblings beside
> the worktree.

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

Output goes to the gitignored `release/` directory. Config: `electron-builder.yml` (app id `com.thewizardscode.tableaucardengine`, asar containing only `dist/` + `dist-electron/` + `package.json` — the renderer and Phaser are Vite-bundled, so no `node_modules` are needed). Packaging runs with `--publish never` (private repo; binaries are uploaded to Steam manually). The Windows binary is also built reproducibly by CI on every push to `main` (`.github/workflows/package.yml`) and uploaded as a workflow artifact; CI composes the sibling game repos and builds with `GAMES_CONFIG=full`, so the Steam artifact ships the **full distribution** (all games + Gym, `CG-0MULGC6VP008GPH2`).

### Application icon

The app icon (browser favicon, Apple touch icon, web app manifest, and the
packaged desktop/installer icon) derives from a **single tracked
source-of-truth SVG**: `public/favicon.svg` — the "tableau emblem", an original
in-house mark (CC0; see `public/assets/CREDITS.md`). Never hand-edit the
generated PNG/ICO/ICNS variants.

```bash
npm run generate:icons   # regenerate every variant from public/favicon.svg
```

`scripts/generate-app-icons.ts` rasterises the emblem with `sharp` (`^0.33.0`, an
existing dependency) and writes:

| Artefact | Size | Purpose |
|----------|------|---------|
| `public/icon-32.png` | 32×32 | manifest / legacy favicon |
| `public/icon-192.png` | 192×192 | web app manifest (Android) |
| `public/icon-512.png` | 512×512 | web app manifest / PWA |
| `public/apple-touch-icon.png` | 180×180 | iOS home screen |
| `build/icon.png` | 1024×1024 | electron-builder `.ico`/`.icns` source |
| `build/icon.ico` | multi-size | NSIS installer/uninstaller icon |

The committed web PNGs live under `public/`; the Electron resources
`build/icon.png` and `build/icon.ico` are generated at package time because
`build/` is gitignored. Every `package*` npm script therefore runs
`npm run generate:icons` **before** `electron-builder`, and
`electron-builder.yml` points `win`/`linux`/`mac` at `build/icon.png`;
electron-builder derives the Windows `.ico` and macOS `.icns` from that ≥512px
PNG, so no extra packer dependency is needed. The NSIS
`installerIcon`/`uninstallerIcon` keys point at `build/icon.ico` instead: NSIS
requires a real ICO container and rejects a raw PNG as an *invalid icon file*.
`generate:icons` derives that ICO from `build/icon.png` using electron-builder's
own icon toolset (cached for the packaging step), so the installer icon matches
the application icon exactly (`CG-0MUWQJ279009KBMM`).

**Base-relative link convention.** The icon/manifest `<link>`s in `index.html`
(and the favicon link in `public/404.html`) use **base-relative** hrefs — with
no leading slash and no `./`:

```html
<link rel="icon" type="image/svg+xml" href="favicon.svg" />
<link rel="apple-touch-icon" href="apple-touch-icon.png" />
<link rel="manifest" href="site.webmanifest" />
```

Vite copies `public/` verbatim, so a base-relative href resolves correctly under
all three build bases without per-mode code: the GitHub Pages sub-path, the
dev-server root, and Electron's `file://` base. An absolute `/favicon.ico` would
404 on GitHub Pages. `tests/electron/app-icon-build-output.test.ts` asserts the
emitted HTML/manifest and that each referenced file exists in the output for all
three modes. See `CG-0MUTTXRWZ009NUB9`.

### Skill: release-windows

`.pi/skills/release-windows/` provides a repo-local skill (`/skill:release-windows`) that promotes the latest CI-built Windows installer to a **draft** GitHub Release — the operator's approval gate is the draft itself (review + publish in the GitHub UI; no pre-approval is requested to create the draft).

> **This promotion now runs automatically in CI.** On a `v*` tag push (the
> ship skill's `dev`→`main` release), the `promote-release` job in
> `.github/workflows/package.yml` creates the draft release with no manual
> invocation; a failure is non-blocking (it never fails the Pages deploy) and
> is reported in the job summary. **This skill is the documented manual
> fallback** — use it to regenerate/re-check a draft, or to dry-run the
> promotion path before a tag. The final step is still the operator's: review
> the draft and publish it in the GitHub UI.

The helper script is the single implementation shared by CI and the manual path. The CI job pins the run with `--run-id "${{ github.run_id }}"` (the current run is still `in_progress` on a tag push, so the "latest successful run" auto-resolve would otherwise pick the previous release); the manual invocation below uses the auto-resolve default.

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

### Steam follow-to-unlock (Steamworks)

The launcher has a growth mechanic: following the developer on Steam unlocks a
bundled bonus game (intake `CG-0MSMAJQQT004SDCC`). The mechanism is entirely
optional — the launcher builds and runs with no Steam client and no native
module (graceful degradation).

**Modules** (all pure Node unless noted, and unit-tested under `tests/steam-follow/`):

| Module | Responsibility |
|--------|----------------|
| `electron/steam-config.ts` | Load private credentials (env or gitignored JSON). Returns `null` when absent. |
| `electron/steam-follow.ts` | `FollowSource` interface, `SteamFollowService` (game-agnostic unlock + persistence), `FileUnlockStore`, `FakeFollowSource`. |
| `electron/steam-follow-steamworks.ts` | Real `SteamworksFollowSource`; dynamically imports the optional `steamworks.js`, capability-detects follow detection. |
| `electron/steam-follow-ipc.ts` | Channel names + handler table (pure) wired to `ipcMain` in `main.ts`. |
| `electron/bonus-catalog.ts` + `electron/bonus-catalog.json` | Config-driven bonus catalog; `bonusGameId` designates the unlocked game. |
| `src/ui/steam-follow-client.ts` | Renderer client over the `window.tce.steamFollow` bridge (never imports the SDK). |
| `src/ui/steam-lock.ts` | Pure unified lock computation for the Game Selector (`computeSteamLocks` / `applySteamLocks`) and the shared game/DLC predicate (`isTargetUnlocked` / `isDlcUnlocked`). |

**Private credentials (never committed).** The Steam App ID and the
developer's SteamID64 are read from, in priority order:

1. Environment variables `TCE_STEAM_APP_ID` / `TCE_STEAM_DEVELOPER_STEAM_ID`.
2. `electron/steam-config.local.json` (**gitignored**):

   ```json
   { "app_id": "<appid>", "developer_steam_id": "7656119..." }
   ```

3. `electron/steam-config.example.json` (committed, placeholder-only) for reference.

The Steamworks bootstrap also honours `steam_appid.txt` (the SDK convention) via
`loadSteamAppId({ appRoot })`. `steam_appid.txt` and the local config must never
be committed.

**Building a Steam binary.** `steamworks.js` is declared as a normal
`package.json` dependency: it ships prebuilt binaries for Windows/Linux/macOS
and has no install-time build hook, so `npm install`/`npm ci` need no native
toolchain. A Steam build still builds the follow-detection addon and uses the
Steam package script:

```bash
npm run build:steam-friends      # build the follow addon (Windows x64)
npm run package:steam            # pre-flights + Windows NSIS package
```

`scripts/check-steamworks.mjs` checks for `steamworks.js` and
`scripts/check-steam-friends.mjs` checks for the staged `tce-steam-friends`
addon; both fail early with actionable guidance (the addon check is a no-op
warning on non-Windows hosts). `electron-builder.yml` packs
`node_modules/steamworks.js/**` and `node_modules/tce-steam-friends/**`,
unpacking their native `.node`/`dist` binaries from the asar. A non-Steam build
uses `npm run package` and needs none of this.

**Follow detection — automatic via a custom addon (Option A).**
`steamworks.js` 0.4.0 exposes no `friends` namespace, so the shipped
`steam_api64.dll` is queried directly: `native/steam-friends` is a small C++
N-API addon that resolves the already-loaded DLL and calls
`SteamAPI_ISteamFriends_IsFollowing` (interface `SteamFriends017`), correlating
the asynchronous `FriendsIsFollowing_t` result within a bounded timeout. It
**never** calls `SteamAPI_Init` (no second init / DLL conflict) and resolves all
Steam symbols at runtime, so **no Steamworks SDK is needed at build time**.
`electron/steam-follow-native.ts` loads it as `tce-steam-friends`, and
`SteamworksFollowSource` capability-detects in a deterministic order:
`steamworks.js` friends API → native addon → manual self-attest. When no
automatic check is available (addon absent, Steam absent, or no logged-in user)
`followCheckSupported` is `false` and the UI offers a persisted **manual
claim**; the launcher never fabricates a follow. The store page still opens
through the real SDK (`overlay.activateToStore` / `activateToWebPage`).

**Addon build prerequisites and licensing.** The addon targets **Windows x64**
and builds with `node-gyp` + Visual Studio Build Tools
(`npm run build:steam-friends`), staging the result as `node_modules/tce-steam-friends`.
No Steamworks SDK is required to build it: all symbols are resolved at runtime
from the redistributable `steam_api64.dll` that `steamworks.js` loads, so no SDK
path or private CI secret is needed. The Steamworks SDK itself is **not
redistributable** — its headers and import libraries must never be committed or
shipped; only the `steam_api64.dll` redistributable may ship with the app. See
`native/steam-friends/README.md` and the P1 spike report
(`docs/dev/steam-follow-native-spike.md`).

**Bridge API** (`window.tce.steamFollow`, exposed by `electron/preload.cjs`):
`getStatus`, `isSteamAvailable`, `supportsAutomaticFollowCheck`,
`getBonusCatalog`, `openStorePage`, `isFollowing`, `claim`, `claimManually`.
The main process owns the only concrete source; the renderer never imports the
SDK.

**Game-list gating.** The catalogue (`electron/bonus-catalog.json`) lists the
bundled games; `bonusGameId` is unlocked on a confirmed follow and the other
listed games render locked ("Reserved for a future milestone"). Games absent
from the catalogue are base content and never locked. In a plain browser there
is no bridge, so nothing is locked and the web app stays fully functional.

The lock computation is generalised to consume the **unified unlock state**
(`CG-0MUZGBTD1007G84S`): the follow status plus the targets unlocked by the
platform-action/achievement rules. `main.ts` folds every persisted
`contentUnlocks` record's target into `computeSteamLocks`, so a catalogue entry
gated by an action-reward rule (`gatedBy`) unlocks when its rule is satisfied.
The same pure predicate (`isTargetUnlocked`, with the DLC convenience wrapper
`isDlcUnlocked`) answers game **and** DLC targets, so the Game Selector and an
in-game DLC gate read one source of truth. An action-gated-but-locked entry
shows an action message; a missing/empty/malformed state locks nothing extra and
never throws.

**Manual real-Steam QA:** see [Steam follow-to-unlock — manual E2E QA](dev/steam-follow-qa.md).

### Action-reward config and drift validator

The follow-to-unlock mechanism is generalised into **platform-agnostic
action rewards** (`CG-0MUZF156A007OUIT`): any action on any platform can unlock
any target. The declarative data lives in `electron/action-rewards.json` and is
guarded against drift by `electron/action-rewards-config.ts`.

**`electron/action-rewards.json`** declares, as data only:

- `rules` — the unified `UnlockRule` model (`trigger.kind:
  'platform-action' | 'achievement'`, `target.kind: 'game' | 'dlc'`).
- `actionUrls` — `ruleId` → the page the player visits to perform the action.
- `verifiers` — the `ActionVerifierConfig` resolution map (rule → action →
  platform → default); a platform with no detection API resolves to the
  `manual-self-attest` verifier.

Nothing in the reward logic hard-codes a game title, platform, action, or URL —
retargeting a reward is a config edit. The shipped rule is `itchio-follow`
(itch.io follow → the designated bundled `golf` game), consistent with the
`gatedBy` entry in `electron/bonus-catalog.json`.

**`electron/action-rewards-config.ts`** loads the file (returning `null` on
missing/corrupt config — never throws) and exposes
`validateActionRewardsConfig(config, registry)`. The registry is built with
`buildActionRewardRegistry(catalog, verifierIds)` from the bonus catalog and the
verifier registry, so validation is against the launcher's *real* capabilities.
The validator rejects a rule whose **target** game is not in the catalog, whose
game **scene** is not registered in the build, or that resolves to an
unregistered **verifier**; it also rejects duplicate rule ids / `(platform,
action)` pairs and a catalog `gatedBy` that names an unconfigured rule. The
shipped config passes cleanly; unit tests live in
`tests/platform-action-rewards/action-rewards-config.test.ts`.

```bash
npx vitest run --project unit tests/platform-action-rewards/action-rewards-config.test.ts
```

### Generalised content-unlock bridge (renderer read API)

The generalised unlock state is exposed to the renderer through an **additive**
context-bridge surface (`CG-0MUZGBSSQ009ISHG`, feature F5) — the legacy
`window.tce.steamFollow` surface and every `steamFollow:*` channel are
unchanged.

| Module | Responsibility |
|--------|----------------|
| `electron/action-rewards-ipc.ts` | `ACTION_REWARD_CHANNELS` (`contentUnlocks:isUnlocked`, `contentUnlocks:getUnlocks`, `contentUnlocks:refresh`) plus the **total** handler table wired to `ipcMain` in `main.ts`. |
| `electron/preload.cjs` | Exposes the additive `window.tce.contentUnlocks` bridge. |
| `src/ui/content-unlock-client.ts` | Total read client over the bridge (`isUnlocked(target)`, `getUnlocks()`); the browser fallback reports "not unlocked" and never throws. |

**Total read API.** `isUnlocked({ kind: 'game', gameId })` and
`isUnlocked({ kind: 'dlc', gameId, dlcId })` answer whether a target is
unlocked; `getUnlocks()` returns every persisted record. In a plain browser (no
Electron bridge) `contentUnlockClientFromWindow()` still returns a client whose
`isUnlocked()` is `false` and `getUnlocks()` is `[]`, so a DLC/game gate never
branches on the runtime and never crashes when the state cannot be read.

```bash
npx vitest run --project unit tests/platform-action-rewards/ tests/ui/content-unlock-client.test.ts
```

### Adding a platform, action, or verifier

Rules are **data**. Adding a reward is normally a config edit, not a code change:

1. **Add the rule** to `electron/action-rewards.json` under `rules` — a
   `platform-action` trigger (`platform` + `action`) with a `game` or `dlc`
   target. Add its URL to `actionUrls` (`ruleId` → the page the player visits).
2. **Pick the verifier** in the same file's `verifiers` map. Resolution
   precedence is rule id → `(platform, action)` → platform → `defaultVerifierId`
   → the `manual-self-attest` fallback, so a platform with no detection API
   needs no entry at all (it gets self-attest).
3. **If a new verification method is needed**, implement `ActionVerifier`
   (`electron/action-verifiers.ts`) — `id`, `label`,
   `supportsAutomaticVerification()`, `openActionPage()`, and a **total**
   `verify()` (never throws; degrade to `unavailable` so the UI offers
   self-attest). Register it in the launcher's `ActionVerifierRegistry` and add
   its id to the validator's `verifierIds`. Nothing else changes — the registry,
   reward service, store, and IPC are untouched.
4. **If the rule unlocks a catalogued game**, record the gating link as
   `gatedBy: <ruleId>` on that entry in `electron/bonus-catalog.json`.
5. **Validate.** `validateActionRewardsConfig(config, buildActionRewardRegistry(catalog, verifierIds))`
   must report no drift (unknown target game/scene, unregistered verifier,
   duplicate rule id/action, or a `gatedBy` naming an unconfigured rule). It is
   asserted on the shipped config in
   `tests/platform-action-rewards/action-rewards-config.test.ts` and exercised
   end-to-end in `tests/platform-action-rewards/action-rewards-e2e.test.ts`.

### Gating in-game DLC (cross-repo model)

DLC is **content inside a game**, not a whole game, so its gate spans two
repositories by design:

- **Core repo owns the mechanism** — the unified `UnlockRule`/`UnlockTarget`
  model, the `ContentUnlockStore`, the read API (`contentUnlockClientFromWindow()`),
  and the pure, framework-free
  [`createDlcGate`](../../src/core-engine/DlcGate.ts).
- **Each game repo owns its DLC content and the gating call site.** The DLC is
  identified by `{ kind: 'dlc', gameId, dlcId }`, where `dlcId` is owned by that
  game's content definition — there is no central DLC registry. The gate is a
  **pure, read-only check layered over the existing content-delivery path**
  (`electron/content-locator.ts`); it does not change how DLC content is located.

A game gates a content item through one call, injecting the renderer client as
the reader (so the same code works in a plain browser, where it reports
*not unlocked*):

```ts
import { createDlcGate } from '@core-engine/DlcGate';
import { contentUnlockClientFromWindow } from '@ui/content-unlock-client';

const client = contentUnlockClientFromWindow();
const gate = createDlcGate({
  gameId: 'main-street',
  isUnlocked: (target) => client.isUnlocked(target),
});

if (await gate.isUnlocked('riverfront-pack')) {
  // render / start the DLC content
} else {
  // render the documented locked-state presentation
}
```

The gate is **total**: an absent reader, a throwing reader, a non-boolean
result, or a malformed target all report *not unlocked* (`check()` returns
`reason: 'locked' | 'unreadable'`), so a DLC whose state cannot be read is
unreachable rather than fatal. The Game Selector's `isDlcUnlocked` predicate
(`src/ui/steam-lock.ts`) reads the **same** unified state, so locked/unlocked
results are consistent between the launcher and the game. The canonical proof
is the Gym's `GymDlcUnlockScene`; per-game roll-out across the catalogue is
tracked as follow-up work.

### Self-attestation is an honour system (caveat)

The default verifier for platforms with no public detection API (e.g. an
itch.io follow) is `manual-self-attest`: the player clicks through to the
action page and then confirms they completed it. This is **trivially
bypassable** — the unlock is not cryptographically tied to the action. It is
accepted as a deliberate trade-off: verification is a pluggable seam, so a
specific platform can later be upgraded to API/OAuth detection without
changing the unlock flow, store, or IPC. Never present a self-attested reward
as an automatically verified one, and never fabricate an unlock when no
verifier can run (the service reports `verification-unavailable` and offers the
self-attest path instead).

### Steam achievements (Steamworks)

The engine has an **engine-generic achievement layer** (`CG-0MSMGKSJB004MZBJ`)
that turns run-local challenges into persistent Steam achievements. It is built
from the same seam as the follow-to-unlock feature: a pure engine layer + a
pure-Node launcher service behind an interface with a deterministic fake, a
real Steamworks adapter, and an IPC bridge. The whole feature is optional — the
web build and any machine without Steam stay fully playable.

**The one rule:** a game module **never** imports the Steamworks SDK. A game
declares its achievements and maps its challenges; the launcher owns the only
Steam-aware code. The renderer talks to the main process only through the
`window.tce.achievements` context bridge (wrapped by
`src/ui/steam-achievements-client.ts`).

**Modules** (pure Node/TS unless noted; unit-tested under `tests/achievements/`
and `tests/steam-achievements/`):

| Module | Responsibility |
|--------|----------------|
| `src/core-engine/AchievementSystem.ts` | Steam-free engine layer: `AchievementDefinition`, challenge → achievement mapping, idempotent `AchievementSystem`, pluggable `AchievementSink`, `NoOpAchievementSink`. Zero Steam/Electron imports. |
| `electron/achievement-manifest.json` | Single source of truth for `gameId → achievementId → steamApiName → hidden`. Must match the Steamworks partner backend. |
| `electron/achievement-manifest.ts` | Pure loader + semantic validation (duplicate ids/API names, empty entries, version); returns `null`/issues rather than throwing. |
| `electron/steam-achievements.ts` | `AchievementSource` interface, `SteamAchievementService` (idempotent, offline-safe, re-sync), `FileAchievementStore`, `MemoryAchievementStore`, deterministic fakes. |
| `electron/steam-achievements-steamworks.ts` | Real `SteamworksAchievementSource`; dynamically imports the optional `steamworks.js`, capability-detects the achievement API. |
| `electron/steam-achievements-ipc.ts` | Channel names + pure handler table wired to `ipcMain` in `main.ts`. |
| `src/ui/steam-achievements-client.ts` | Renderer client over the `window.tce.achievements` bridge + `createSteamAchievementSink()` (the engine sink that forwards over IPC); returns `null` outside Electron. |

**Bridge API** (`window.tce.achievements`, exposed by `electron/preload.cjs`):
`unlock`, `getUnlocked`, `isAvailable`, `hasManifest`, `resync`.

**Manifest format.** `electron/achievement-manifest.json`:

```json
{
  "version": 1,
  "games": [
    {
      "gameId": "main-street",
      "achievements": [
        { "achievementId": "foodie-row", "steamApiName": "TCE_MAIN_STREET_FOODIE_ROW", "hidden": false }
      ]
    }
  ]
}
```

- `steamApiName` is the **static** API name registered on the Steamworks
  partner backend (Steam has no client-side creation). It **must match
  exactly**; a mismatch makes Steam silently drop the unlock.
- `achievementId` and `steamApiName` are app-global and must be unique across
  every game in the manifest.
- `hidden` is a **backend-only** flag (the client API cannot set it); it is
  mirrored here for documentation and UI only.
- The committed manifest is validated by
  `tests/steam-achievements/steam-achievements.test.ts`.

**Challenge → achievement mapping workflow for a new game:**

1. Add the game's `gameId` (and each `achievementId` / `steamApiName` / `hidden`)
   to `electron/achievement-manifest.json` and register the API names on the
   Steamworks backend.
2. In the game repo, create a `<Game>Achievements.ts` module (e.g.
   `tce-main-street/src/MainStreetAchievements.ts`) that:
   - declares an explicit `challengeId → achievementId` map,
   - builds the `AchievementDefinition`s (titles/descriptions can be derived
     from the challenge templates),
   - exports `create<Game>AchievementSystem(options)` (registers the
     definitions + mapping on the engine `AchievementSystem`),
   - resolves the sink via the renderer client
     (`steamAchievementsClientFromWindow()` → `createSteamAchievementSink()`,
     else `NoOpAchievementSink`),
   - attaches the system to the game state.
3. Forward challenge completions to the system at the game's single completion
   choke point (Main Street: `MainStreetChallenges.evaluateChallenges`, which
   also covers the per-action `evaluateChallengesAfterAction` path). Everything
   else (idempotence, persistence, re-sync, IPC) is engine/launcher code.
4. Add a game-side drift test asserting every challenge is mapped exactly once
   and every achievement id matches the launcher manifest (Main Street:
   `tests/main-street/main-street-achievements.test.ts`).

**Offline-safe and idempotent.** An unlock is persisted locally **before** the
Steam call; `SteamAchievementService.resync()` replays every persisted id at
launch, so an unlock made with Steam absent (or a failed `stats.store()`) is
re-sent when Steam is next available. `setAchievement`/`storeStats` never throw
and degrade to safe results, so a broken Steam install cannot crash the
launcher. The engine sink is idempotent, so a challenge fires at most one
unlock per achievement per session.

**Manifest ↔ store mismatch detection.** See
[Steam achievements — manual E2E QA](dev/steam-achievements-qa.md#manifest--store-mismatch-detection)
for the procedure (automated validation + the real-account `achievement.names()`
check).

**Manual real-Steam QA:** see [Steam achievements — manual E2E QA](dev/steam-achievements-qa.md).

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

### Test Configuration (`.pi/test-config.json`)

The repository root includes a `.pi/test-config.json` file that overrides the default
per-command test timeout for the implement skill and the audit skill's test runner:

```json
{"timeoutPerCommand": 1500}
```

- **`timeoutPerCommand`** — maximum seconds per test-suite command (default 600 if absent).
  TCE's full suite takes 18–21 minutes, so this is set to 1500 s (25 min) to prevent premature
timeout kills.

**Why is `.pi/test-config.json` tracked by git?**

Git worktrees (created by `implement.py start` and the worklog's worktree system) inherit
only tracked files. The `.pi/*` directory is gitignored (`.gitignore:103`), which means a
worktree would normally have no `.pi/test-config.json`. Without the file, `implement.py
finish` silently falls back to the 600 s default timeout and the full suite is killed
mid-run. By committing the file and adding a negation entry (`!.pi/test-config.json`) to
`.gitignore`, every worktree inherits the correct timeout configuration automatically.

This file is deliberately tracked as the simplest, most robust fix — no cross-repository
change to the implement skill is needed.

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
| `smoke` | Chromium (Playwright) | 10 explicit files (see [smoke profile](#smoke-tests)) | One representative test per game + core engine/UI smoke. ~2 min for rapid feedback during implementation |
| `dev` | Chromium (Playwright) | 30 explicit files (see [dev profile](#dev-tests)) | Smoke + key E2E per game. ~3.5 min for the implement/audit workflow |
| `browser` | Chromium (Playwright) | `tests/**/*.browser.test.ts` (excludes tutorial E2E) | All non-tutorial Phaser UI and rendering tests (requires [browser test setup](#browser-test-setup)) |
| `tutorial-part1..6` | Chromium (Playwright, one per part) | `tests/e2e/main-street-tutorial-e2e-part{1-6}.browser.test.ts` | Main Street tutorial E2E tests (each in own browser instance; requires [browser test setup](#browser-test-setup)) |

All projects run via `npm test`. The browser and tutorial projects run in headless Chromium using `@vitest/browser` with the Playwright provider.

The tutorial E2E tests are split into 6 part files (1-6 tests per file). Each part is a separate Vitest project with its own uniquely-named browser instance (`t1` through `t6`) to prevent the Phaser 4 RC GPU/Canvas context exhaustion that occurs after ~8 game create/destroy cycles in a single browser process. The runner script `scripts/run-tutorial-tests.sh` invokes each project sequentially.

The replay E2E tests live in `tests/e2e/replay-*.test.ts` and use a dedicated Node.js project (`replay-e2e`) with `pool: 'forks'` + `singleFork: true`. This isolates them from the parallel unit test pool, ensuring the Vite dev server started by `scripts/replay.ts` has uncontested CPU for its initial cold compilation. The replay tests start and stop their own dev server per run via `scripts/dev-server-utils.ts`.

### Skill-integrated test profiles

The staged profiles above are exposed to the global `test` skill through a project-local extension, so agents can run a profile without memorising the `--project` flags:

| `/skill:test --type` | Underlying profile | What it runs |
|----------------------|--------------------|--------------|
| `unit` | `--project unit` | Node.js logic/data/integration tests (seconds) |
| `smoke` | `--project smoke` | One representative file per game + core/UI smoke (~2 min) |
| `dev` | `--project dev` | Smoke + key E2E per game (~3.5 min) |
| `browser` | `--project browser` | All non-tutorial browser tests (~6–8 min) |
| `tutorial` | `tutorial-part1..6` | Main Street tutorial parts, one browser instance each (~4 min; order `part1, part2, part4, part5, part6, part3`) |
| `e2e` | `tutorial` + `replay-e2e` | Every tutorial part plus the Playwright replay project |
| `electron` | `scripts/run-electron-smoke.sh` | Display-aware Electron launch smoke |
| `full` (default) | `npm test` | The genuine full CI suite (unit → browser → tutorial → electron) |

- **`full` is deliberately omitted** from the extension's `types` map, so a bare `/skill:test` keeps resolving to the real full CI suite. **Only `--type full` populates the audit-accepted full-suite cache entry** — typed runs use independent cache keys and can never satisfy a "full test suite passes" AC.
- **Every typed Vitest command defaults `GAMES_CONFIG` to `full`** (preserving an explicitly supplied value), matching the shell runners. Without it a bare `/skill:test --type unit` runs under the `core-only` fallback preset, the game-discovery adapters never load, and Golf's `tests/golf/replay.test.ts` fails with `Available adapters: none` (CG-0MUIXVIBP0062A8H).
- Browser-dependent types (`smoke`, `dev`, `browser`, `tutorial`, `e2e`) chain `scripts/check-browser-test-env.ts` first, so a missing Playwright prerequisite (`npx playwright install chromium`) fails fast with remediation steps instead of an opaque Vitest browser timeout.
- Every typed Vitest command runs through `scripts/vitest-run-with-retry.ts` — the retry-once + wall-clock hang-timeout wrapper (exit 124 `[hang-timeout]` on a true hang, which is never retried).
- Commands also load `scripts/vitest-tap-reporter.ts` alongside the default reporter. It emits flat TAP for each failed test (`not ok N - <file> > <suite > test>` plus `error: |-` / `stack: |-` YAML blocks) that the global runner's `parse_node_failures` understands, so a red typed run creates per-test `test-failure` items instead of an opaque suite-level failure.
- Configuration lives in `.pi/skills_extensions/test/extension.json`; the stage-selection policy prose is in `.pi/skills_extensions/test/SKILL_PREFIX.md`.

Common invocations: `/skill:test --type unit` (fast feedback during implementation),
`/skill:test --type dev` (pre-audit), and `/skill:test` or `/skill:test --type full`
(release / pre-`in_review` evidence). Typed profiles default `GAMES_CONFIG` to
`full` (an explicit `GAMES_CONFIG=…` still wins), so the game-discovery adapters
load exactly as they do under the shell runners.

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
2. **Retry-once on the transient signatures (attribution-aware)** —
   the unit **and** browser steps in `scripts/run-ci-tests.sh` run through
   `scripts/vitest-run-with-retry.ts`, whose `shouldRetryOnce` guard recovers
   two shapes of the same contention transient:

   - **All-passed transient** — the reporter summary shows every file passed
     and the sole error is a transient signature
     (`[vitest-worker]: Timeout calling "onTaskUpdate"` or
     `[vitest] Browser connection was closed while running tests`).
   - **Attributable failed-file transient** (CG-0MUIMM28K001W88F) — the
     summary reports failed files/tests, but every error block in the run
     output is the transient signature itself (`failuresAreTransientOnly`).
     This is the failed-file variant of the same contention transient: under
     load Vitest counted the poisoned file/test as failed, which defeated the
     previous all-passed-only guard and failed the gate spuriously even though
     a re-run at the same commit was green.

   The guard is unit-tested in `tests/scripts/vitest-run-with-retry.test.ts`,
   including a **regression fixture** of the recorded
   CG-0MUIMM28K001W88F failing run and its genuine-assertion counter-case. A
   genuine assertion failure (a `Failed Tests` block carrying an
   `AssertionError`, not the timeout) can never be retried or hidden. If the
   retry is **also** a pure transient failure (both attempts poisoned by
   sustained contention), the run is accepted as green (exit 0): the guard
   attributed every reported failure to the transient signature, so there is
   no genuine failure to mask (CG-0MUF0LU4X006IXXU).

   The runner emits a final
   `[vitest-runner] attempts=N status=S outcome=... args="..."` line after every
   run as the canonical machine-readable diagnostic. Outcomes are `clean`,
   `retry-clean`, `accepted-transient`, `retry-failed`, `failed` and `hang`.
   Stage output is **no longer truncated** (CG-0MUIMM28K001W88F removed the
   former `tail -20` in `scripts/run-ci-tests.sh`), so a recurrence names the
   failed test/file and shows any distinct assertion error alongside the
   transient signature.

3. **Test-side hardening (browser tests)** — beyond the runner-level
   mitigations above, browser tests that drive the real Phaser pointer
   pipeline (dispatched DOM events at layout-derived canvas coordinates, e.g.
   the Main Street slot-click suites) can intermittently have their click
   dropped or delayed when the RAF-driven game loop is starved of frames by
   parallel full-suite runs. The following conventions keep these suites green
   under contention without masking real regressions:

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
   - **Step the game loop directly before dispatching a pointer gesture**
     (CG-0MUA7RRXL007GEHW, superseded for Main Street by
     CG-0MUE2U21C0007BKL): interactive game objects rebuilt by a refresh
     (`refreshAll`/`refreshStreetGrid`) are queued in Phaser's
     `_pendingInsertion` and only registered with the input system during
     `InputPlugin.preUpdate`, which runs on the game loop's tick — never from
     a `setTimeout`. Under concurrent full-suite runs that tick is driven by
     `requestAnimationFrame`, which can be starved for seconds; a drag started
     after the refresh but before the tick lands on a not-yet-registered hit
     zone, so the gesture is silently dropped and the drop never fires
     (observed as a `waitForCondition` timeout waiting for the transfer
     animation in `tests/main-street/upgrade-drag-drop.browser.test.ts`).
     Rather than awaiting animation frames (the superseded
     await-a-frame-before-gesture pattern, which no longer exists in the
     tree), gesture helpers step the Phaser loop synchronously with
     `TimeStep.step(time)` (`scene.game.loop.step(now + deltaMs)`) before the
     first `mousedown` —
     see `stepGame()` in `tests/main-street/upgrade-drag-drop.browser.test.ts`
     and `tests/main-street/market-deal-in.browser.test.ts`. A complete step
     runs input pre-update, tweens and rendering on demand, so the pending
     insertions flush regardless of frame availability. The same
     manual-stepping remedy is used by sibling game suites for the identical
     “rAF does not fire consistently in headless Chromium” problem (e.g.
     `BeleagueredCastleLayout.browser.test.ts` in the sibling
     `tce-beleaguered-castle` repo steps tweens with `scene.tweens.tick()`).
   - **Poll frame-gated waits by stepping the loop**: a helper that waits for
     the game loop to reach a state (e.g. `waitForCondition` in
     `tests/main-street/upgrade-drag-drop.browser.test.ts`) steps the loop on
     every poll (with a short `setTimeout` yield to avoid a busy spin) rather
     than awaiting `requestAnimationFrame`, so the polls make progress even
     when no animation frame is granted. Bare rAF polling can starve for
     seconds under concurrent-suite contention even when the timeout budget is
     large.
   - **Tear down Phaser games synchronously**
     (`@core-tests/helpers/phaserCanvasPool`): `game.destroy()` only sets
     `pendingDestroy`; the real teardown (renderer, tweens, input, loop) runs
     on the next game-loop frame, which contention can delay for seconds, so
     the previous test's loop lingers and competes with the current one for
     frames — the same starvation that stops `InputPlugin.preUpdate`. Browser
     suites booting one game per test call `destroyPhaserGame()`, which runs
     `runDestroy()` synchronously and then drains Phaser's global
     `CanvasPool`, freeing each canvas context immediately.
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
     visual-overlay hazard: a mid-week checkpoint restores a partially-sold
     market row with no business cards, so tests that assume a buyable
     business card (e.g. undo-redo's affordable-card finder) fail unless the
     checkpoint is cleared first (the ≥1-business guarantee applies at
     refill time only).
     The tutorial boot (`bootGameWithTutorial()` in
     `tests/helpers/main-street-tutorial-e2e.ts`) additionally wipes stale
     `run-checkpoint`/`campaign` records **before** creating the game
     (CG-0MTFREYSJ005EW43): a preceding file in the same vitest browser
     session (one Playwright context per session — same-origin IndexedDB is
     shared across files) can leave a turn-end autosave that lands after its
     own `destroyGame` clear, routing the next tutorial boot down the resume
     path and suppressing the `[ Start Tutorial ]` offer. This wipe uses
     plain readwrite transactions on the same-version `save-load-store` DB
     — deliberately **not** `deleteDatabase`, whose pending version-change
     delete would block the tutorial boot's own `SaveLoadStore.open()`
     (the boot uniquely awaits the campaign-load promise) and wedge the
     suite with a 90s hook timeout.
   - **Boot retry + modal poll** (CG-0MTGHZWOO001WWOU): `bootGameWithTutorial`
     wraps the boot in up to 3 attempts (full `destroyGame` + 1 s GC-settle
     between attempts), because under full-suite resource pressure the
     async tutorial-offer chain can stall: `checkAndResume()` runs
     fire-and-forget inside the `_campaignLoadPromise` `.then` callback, so
     that promise can resolve before the offer modal's `show()` executes.
     After awaiting it, the helper polls up to 15 s for the modal (a
     late-but-healthy show is not a failure), clicking the resume overlay's
     `[ New Game ]` button if a stale checkpoint surfaces instead. Only when
     the poll and all retries fail does it throw a diagnostic error (with
     checkpoint/display-list state) instead of leaving `waitForStartButton`
     to time out silently after 40 s.
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
     (`tests/main-street/composite-click.browser.test.ts`); peek's
     tween-completion waits use 10s budgets
     (`tests/main-street/peek.browser.test.ts`), matching the 5-10s
     per-wait convention; and the incident reveal's post-hold day-start
     wait uses a 22s budget (nominal ~6s choreography + 16s contention
     margin) in `tests/main-street/incident-reveal.browser.test.ts`, with
     the no-incident fast path on a 14s budget. A beforeEach hook that
     boots a game plus waits for
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
explicitly: 5 minutes for the unit stage, 20 minutes for the browser stage
(`--timeout-ms <n>`, default 10 minutes in the runner itself). The browser
bound is deliberately generous — 115 files at ~7-8s each runs ~13-15 minutes
nominal, and concurrent full-suite runs from parallel worktrees can stretch
it further — while a true hang never completes and is still bounded. (The
bound was raised from 15 to 20 minutes once the browser suite grew to 115
files and normal run-to-run variance straddled the old 15-minute limit,
risking an abort of an otherwise green stage.) Under `set -euo pipefail` the
124 exit aborts the gate instead of stalling it indefinitely.

Diagnosing a hang: `[hang-timeout]` in the output identifies the stage;
re-run the suspected file(s) in isolation via
`npx vitest run --project browser tests/<file>` to see whether the hang
reproduces without suite-wide contention. If it does, look for an unresolved
`Phaser.Game` (the `afterEach` must destroy it) or a frame-wait helper without
a timeout fallback. A hang in the **unit** stage is instead a synchronous
infinite loop in test/engine code (e.g. an unbounded drain over a deck that
self-replenishes or can stall — see [Writing unit tests](#writing-unit-tests));
vitest's `testTimeout` cannot preempt synchronous JS, so attaching the V8
inspector to the stuck process and pausing it is the fastest way to get the
stack (`kill -USR1 <pid>`, then connect to `http://127.0.0.1:9229/json`).
Exit codes from the runner: 0/1 from vitest, 124 on hang
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
- **Never write an unbounded `while (…) { … }` drain whose stop condition depends
  on engine state that can stall or self-replenish** — e.g.
  `while (state.incidentDeck.length > 0) resolveIncident(state)` hangs forever once
  week gating leaves only out-of-season cards (or `replenishIncidentDeck()` refills the
  deck). A synchronous infinite loop stalls the whole unit stage, vitest's
  `testTimeout` cannot preempt it, and only the runner's wall-clock bound catches it
  (exit 124). Bound the loop with a counter/`for`, stop on no-progress, or arrange the
  state directly so the assertion is reachable without iteration.

### Test-suite review (value audit)

The suite is periodically audited for low-value tests. The committed report
[`docs/dev/test-suite-review.md`](dev/test-suite-review.md) classifies every
`*.test.ts` file as `keep` / `remove` / `clean-up` against the six documented
anti-patterns (source-code-grep, placeholder/tautological, self-referential
simulations, duplicates of core coverage, type-level/structural-only,
zero-assertion browser tests), with per-file evidence, per-group counts, and a
full classification table. Each removal/clean-up recommendation is tracked as a
child work item under the audit parent.

Re-run the audit with the repo-local **`test-review` skill**
([`.pi/skills/test-review/SKILL.md`](../.pi/skills/test-review/SKILL.md), invoked
as `/skill:test-review`): it documents the discovery probes, the classification
procedure, the report format, the re-run/diff workflow, and the child-work-item
convention (plus the optional helper
`.pi/skills/test-review/scripts/scan-self-referential.sh`).

> The audit is **analysis-only**: it never deletes or modifies test files — the
> recommendation children execute the changes through the normal implement →
> audit gate. Precedent cleanups: CG-0MS9AGG3N003ASCR (2026-07-31, 32 files),
> CG-0MTCOPO8U001UW2Y (2026-09-20, 501 files reviewed).

### Smoke Tests

Run `npm run test:smoke` (or `npx vitest run --project smoke`) for rapid feedback during implementation. The smoke profile runs one representative test per game plus core engine/UI smoke tests — target runtime is ~2 min for 10 files.

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
- `tests/gym/GymSceneSmoke.browser.test.ts` (All gym scenes boot)

> **Layout note (Option A).** A game entry is included only when its test file
> exists in *this* checkout (`vite.config.ts → coreOrSelected`). The merged core
> carries no games, so in a sibling-only core checkout (`../tce-<game>`) the
> smoke/dev profiles deliberately run the core + Gym suites only — a game's own
> suite runs in its game repo. This keeps the core suite green in both layouts
> (CG-0MUKWPTZ50040V0Q).

### Dev Tests

Run `npm run test:dev` (or `npx vitest run --project dev`) for a more comprehensive but still fast suite. The dev profile adds key E2E tests per game on top of all smoke tests — target runtime is ~3.5 min for ~30 files.

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
import { createGolfGame } from '../../tce-golf/src/createGolfGame';

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

## Startup Context Budget

The pre-push hook enforces a committed byte budget for the pi **startup context surface** (`AGENTS.md`, the global ruleset, and skills prose) so it does not silently grow session startup cost. Any commit that changes `AGENTS.md` must refresh `docs/dev/context-budget.thresholds.json` in the same commit:

```bash
npm run context:refresh   # regenerate the thresholds, print the delta
npm run context:check     # verify without writing (also runs in the unit profile)
```

See [docs/dev/context-budget.md](dev/context-budget.md) for what the gate measures, why the refresh is required, the exact workflow, and its fail-open behaviour.

## ToneForge Audio Generation

ToneForge-generated synth artifacts are integrated via a thin adapter. The
**runtime synth module** (`src/core-engine/tf-runtime/main-street-runtime-synth.mjs`)
is committed to source control and ships with every build. Other generated
outputs (WAV files, JSON metadata, metadata module) remain **uncommitted** and
are generated on-demand.

> **Why `src/` and not `public/`?** Vite refuses to import a module from
> `public/` (“This file is in /public and will be copied as-is during build ...
> it can only be referenced via HTML tags”). Putting the committed module under
> `src/` lets the runtime import it with a static specifier, so Vite/Rollup
> code-splits it into a lazy chunk (Tone.js never enters the main bundle) and
> ships it in the dev server, the production `dist/`, and the Electron bundle.

### Source-controlled artefact

```
src/core-engine/tf-runtime/main-street-runtime-synth.mjs   # committed, single source of truth
src/core-engine/tf-runtime/main-street-runtime-synth.d.mts # hand-written type declaration
```

### Generated outputs (not committed)

```
build/tf-synths/wav/*.wav                              # generated on demand
build/tf-synths/main-street-tf-module.mjs              # generated on demand
build/tf-synths/*.json                                 # generated on demand
```

### Regeneration

When ToneForge CLI (`tf`) is available, regenerate the outputs:

```bash
npm run tf:generate
```

This runs `scripts/tf-generate-synths.sh` and writes:

- WAV files and metadata to `build/tf-synths/` (gitignored, on-demand only)
- The committed runtime synth module to
  `src/core-engine/tf-runtime/main-street-runtime-synth.mjs` (identical to the
  committed artefact — regeneration does not drift)

If `tf` is not installed, `npm run tf:generate` emits a warning and exits
successfully — `npm run dev` and `npm run build` never depend on it.

### Missing module handling

The committed runtime module is bundled into every build, so it is always
available. Because it is imported statically there is no runtime URL fetch and
no “module not found” Chromium error. `loadMainStreetTfModule()` in the sibling
Main Street repo's `mainStreetTfModule.ts` returns the bundled module
synchronously; if it is ever absent, the loader logs a warning and gracefully
returns `null`. Synthesis-based audio degrades silently; WAV-based SFX and game
logic are unaffected.

See `docs/the-build/audio.md` for full details (module shape, mapping, runtime wiring, CI guidance).

### SFX Key Naming Convention

All sound effects use the `sfx-` prefix with no game identifier. Common cross-game
keys are defined in `COMMON_SFX_KEYS` (exported from `src/core-engine/SoundManager.ts`).
Audio assets are organized in `public/assets/audio/<game>/` with a fallback to
`public/assets/audio/default/`. See `docs/SFX_CONVENTION.md` for the full convention.

## Project Structure

> **Multi-repo note.** This tree describes the **merged core checkout**
(`Tableau-Card-Engine`), which carries **no games at HEAD** (`example-games/`
holds only the core-owned `gym`). Each game lives in its own `tce-<game>` repo
at repo-root `src/` (the extraction renames `example-games/<game>/` -> `src/`)
plus a `./core` git submodule pointing at `Tableau-Card-Engine`; engine imports
resolve through path aliases. A full distribution composes the core plus the
game repos as **sibling checkouts** (the core never submodules games);
bootstrap it with `npm run setup:distribution -- --dir ..`. See
[Multi-Repo Architecture](dev/multi-repo-architecture.md) and the
[merged-core decision](dev/merged-core-decision.md) for the full split, and
`configs/*.json` for the build presets.

```
src/
├── core-engine/            Game loop, state management, turn sequencing, utilities
│   ├── GameState.ts        GameState<T>, createGameState (deprecated for setup — use SetupOptions)
│   ├── SetupOptions.ts     BaseSetupOptions, MultiplayerSetupOptions, resolveSetupOptions
│   ├── SeededRng.ts        createSeededRng — deterministic PRNG (LCG) for shuffles and AI
│   ├── ListenerRegistry.ts   Listener tracking + one-call cleanup (on/off/clear/size)
│   ├── scene-registry.ts     getSceneRegistry — WeakMap + shutdown hook auto-cleanup for scenes
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
    ├── UIComponentBase.ts   Shared lifecycle base class for UI components
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

public/ (app icon — see "Application icon")
├── favicon.svg             tableau-emblem source of truth (CC0)
├── icon-32.png             manifest / legacy favicon (generated)
├── icon-192.png            manifest (Android, generated)
├── icon-512.png            manifest / PWA (generated)
├── apple-touch-icon.png    iOS home screen (generated)
├── site.webmanifest        web app manifest
└── 404.html                Not Found page

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

The aliases are rooted at a single **core checkout root**, which
`vite.config.ts` computes via `resolveCoreAliases()` from
`scripts/vite-game-discovery-plugin.ts`. By default the root is the directory
containing `vite.config.ts` (correct for the merged core checkout, which *is*
the engine repo). A game repo sets `CORE_ROOT` to point the same aliases at its
engine checkout — the `./core` submodule or the sibling `../Tableau-Card-Engine`:

```bash
CORE_ROOT=./core npm run build     # game-repo context
```

This keeps `@core-engine/*`, `@card-system/*`, `@rule-engine/*`, `@ui/*` and
`@ai/*` import specifiers identical across the core repo and every game repo.

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

### ALPHA badge

Every shipped surface also carries a bright-red **ALPHA** badge that includes the
running version (`ALPHA v<version>`), so players and testers always know they are on
an unreleased build. The badge is produced by `createAlphaBadge()` from
`src/ui/AlphaBadge.ts` and is drawn with Phaser primitives (a red rectangle plus a
white label) — no image assets or new dependencies, and no animation (so it is
inherently reduced-motion safe).

`createSceneTitle()` / `createSceneHeader()` render the badge by default, so every
example-game and Gym scene inherits it with no per-game code. Callers can opt out
via `SceneTitleConfig.showAlphaBadge: false`. The one-off titles call the factory
directly: the Game Selector menu title, the `SettingsPanel` title, and the compact
`Help` + ALPHA header at the top of `HelpPanel`. The existing muted version labels
above are additive and remain in place.

```typescript
// src/ui/SceneHeader.ts wires the badge in automatically:
import { createSceneTitle } from '@ui/SceneHeader';
createSceneTitle(this, 'My Game');                          // title + ALPHA badge
createSceneTitle(this, 'My Game', { showAlphaBadge: false }); // title only

// One-off surfaces call the factory directly:
import { createAlphaBadge, ALPHA_BADGE_LABEL } from '@ui/AlphaBadge';
const badge = createAlphaBadge(this, { x: 640, titleY: 30, titleFontSizePx: 32 });
// badge.text.text === ALPHA_BADGE_LABEL (e.g. "ALPHA v0.1.17")
```

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

> **Canonical guide:** the full end-to-end lifecycle — concept/ideation,
> intake/planning, repo scaffold, architecture/implementation (SLL, HUD,
> audio/SFX, reduced motion, persistence, AI), testing profiles, CI/release,
> registration, assets/licensing, docs and publication — now lives in
> [**Creating a New Game**](dev/creating-a-new-game.md). Start there. Its
> [definition-of-done pointer](dev/creating-a-new-game.md#definition-of-done)
> leads to the single authoritative compliance checklist.
>
> **Deep dives:** [Multi-Repo Architecture](dev/multi-repo-architecture.md) ·
> [Config-Driven Game Catalogue](dev/game-configuration.md) ·
> [Per-game `src/` layout](dev/per-game-src-layout-decision.md) · [Repo
> publication decision](dev/repo-publication-decision.md).

> **Note:** For engine feature demonstrations (not full games), add a demo scene to the **Gym** instead of creating a new example game. See [Gym documentation](../example-games/gym/README.md) and [Gym scene index](gym/GYM_INDEX.md).

## Game Repository Setup & Publication

The detailed repo-layout, scaffold and publication reference behind the
lifecycle guide's stages 3, 7, 8 and 10. The lifecycle framing itself lives in
[Creating a New Game](dev/creating-a-new-game.md); this section is the
technical deep dive.

### Repo layout

A new game gets its **own repository** (`tce-<game>`) that composes the merged
core as a git submodule at `./core`, with its source at repo-root `src/`. The
core repo carries **no games at HEAD**; the discovery plugin resolves a game
**sibling-only** (`../tce-<game>`), first at the Option C `src/` layout
(`src/scenes/<Game>Scene.ts`) and then at the legacy `example-games/<game>/`
sibling layout. An in-tree `example-games/<game>/` copy is never consulted.

```bash
# Scaffold a game repo alongside the core checkout
mkdir tce-my-game && cd tce-my-game
git submodule add git@github.com:TheWizardsCode/Tableau-Card-Engine.git core
```

### Steps

1. Create the game source tree: `src/` (repo root of the game repo)
2. Add a standalone entry point: `src/main.ts`
3. Add a factory function: `src/createXxxGame.ts` (for browser tests)
4. Add scenes: `src/scenes/<SceneName>.ts` (extend `Phaser.Scene`)
5. Place game-owned assets under `public/assets/<game-name>/` in the game repo and document attribution in the core `public/assets/CREDITS.md`
6. Add game-specific tests under `tests/<game-name>/` in the game repo
7. **Export `GAME_INFO` from the game's scene module** (do *not* edit `main.ts`):

   ```ts
   export class MyGameScene extends CardGameScene { /* … */ }

   export const GAME_INFO = {
     sceneKey: 'MyGameScene',
     title: 'My Game',
     description: 'One or two sentences shown on the selector card.',
     thumbnail: 'games/my-game/thumbnail',   // optional; relative to assets/
   } as const;
   ```

   The Vite game-discovery plugin reads this at build time. See
   [Config-Driven Game Catalogue](#config-driven-game-catalogue).
8. **Add the game to a preset** in `configs/*.json`:

   ```json
   {
     "id": "my-game",
     "path": "../tce-my-game",
     "scenePath": "example-games/my-game/scenes/MyGameScene.ts",
     "siblingScenePath": "src/scenes/MyGameScene.ts",
     "adapterPath": "example-games/my-game/scripts/adapters/MyGameReplayAdapter.ts",
     "siblingAdapterPath": "src/scripts/adapters/MyGameReplayAdapter.ts"
   }
   ```

   `siblingScenePath` is the path in the game repo's `src/` layout and is tried
   first; `scenePath` is the legacy sibling fallback. `adapterPath` is optional;
   include it when the game supports replay. Games
   without an entry simply do not appear in that build. Also add a per-game
   preset `configs/<game-id>.json` (one game entry) so the game can be built in
   isolation, and add its entry to `configs/full.json`; see
   [Config-Driven Game Catalogue](dev/game-configuration.md).
9. Add a `[ Menu ]` button to the game scene that calls `this.scene.start('GameSelectorScene')` for navigation back to the selector
10. Add transcript recording:
    - Create `src/GameTranscript.ts` with transcript types and a `TranscriptRecorder` extending `TranscriptRecorderBase<T>` from the core `src/core-engine/TranscriptRecorder.ts`
    - Integrate recording into the scene: create the recorder after game setup, record each turn/action, finalize on game over, and auto-save to `TranscriptStore`
11. Add replay support:
    - Add `loadBoardState(stateJson: string)` to the scene to reconstruct visual state from a transcript snapshot
    - Emit a `state-settled` event (via `GameEventEmitter`) after `loadBoardState()` completes rendering
    - Handle `?mode=replay` URL parameter in the scene to skip normal game initialization
    - Expose `window.__GAME_EVENTS__` in replay mode for adapter communication
12. Create a replay adapter **inside the game repo**:
    - Create `src/scripts/adapters/<GameName>ReplayAdapter.ts` implementing the core `ReplayAdapter` interface
    - Reference it from the preset's `siblingAdapterPath` (step 8). Registration order follows preset order; put structural-match adapters (like Golf) last. Do **not** edit the core `scripts/adapters/index.ts` — it is core and game-free.
    - Include a `gameType` field in the transcript for explicit adapter matching
13. Generate fixture and thumbnail **inside the game repo**:
    - Create a fixture generator script at `src/scripts/generate-<game>-fixture-transcript.ts`
    - Generate and commit the fixture transcript at `src/tests/fixtures/transcripts/fixture-game.json`
    - Generate and commit the thumbnail at `public/assets/games/<game-name>/thumbnail.png` using the core `./scripts/refresh-thumbnails.sh <game-name>`

### Per-game npm scripts

A game repo runs the same core toolchain against its `./core` submodule:

```bash
CORE_ROOT=./core npm run dev               # HMR dev server
CORE_ROOT=./core npm run build             # production build
CORE_ROOT=./core npm run build:electron    # desktop build
```

### Scaffolding a game repo

An extracted game checkout (F1) has no root project files. Generate them with
`scripts/game-repo-scaffold.ts`, which turns the checkout into a runnable
single-game launcher against a sibling core (`../Tableau-Card-Engine`):

```bash
tsx scripts/game-repo-scaffold.ts \
  --game <game> --game-repo-root ../tce-<game> \
  --core-root ../Tableau-Card-Engine
# …or every game in scripts/configs/repo-layout.json:
npm run scaffold:games
```

It writes `package.json`, `vite.config.ts`, `tsconfig.json`, `main.ts`,
`env.d.ts` and `configs/game.json`. Per **Option C** (F9), the game source
lives at repo-root `src/` (the extraction renames `example-games/<game>/` ->
`src/`) and the scaffold creates only the `core` link to the sibling engine
checkout; engine imports resolve through the path aliases
(`@core-engine/*`, `@card-system/*`, `@rule-engine/*`, `@ui/*`, `@ai/*`,
`@balance-cards/*`, `@core-scripts/*`, `@core-tests/*`, `@core-gym/*`) rather
than the removed `src`/`scripts`/`example-games/gym`/`tests/helpers`
symlinks. Game tests that referenced `example-games/<game>/…` are repointed to
`src/…`, and core-owned CLI/core-layer references to `core/scripts/…` and
`core/src/…`. See
[Multi-Repo Architecture](dev/multi-repo-architecture.md#5-per-game-repo-scaffold-f4)
and the [layout decision record](dev/per-game-src-layout-decision.md).

### App icon linkage (`sharedPublicRoot`)

Every `tce-<game>` repo is its own Vite app with its own `index.html` and
`public/` directory, so the core's root app-icon set is composed into a game
repo's `public/` root by the same scaffold that links the shared deck and SFX.

`scripts/configs/repo-layout.json` declares the six shared root files in
`sharedPublicRoot`:

- `favicon.svg`
- `apple-touch-icon.png`
- `icon-32.png`
- `icon-192.png`
- `icon-512.png`
- `site.webmanifest`

`scaffoldGameRepo()` calls `linkSharedPublicAssets(gameRepoRoot, coreRoot)`
(likewise exported for tests), which symlinks each `core/public/<file>` next to
the game's own `public/` root and records the created paths in the scaffold
result's `publicLinks`. The linkage is idempotent, derives every target
relatively, and keeps `core/public/favicon.svg` — generated by
`scripts/generate-app-icons.ts` — the **single source of truth** for the emblem;
game repos never commit a hand-authored or divergent icon copy.

A game repo's `index.html` declares the three base-relative links immediately
before `<title>`:

```html
<link rel="icon" type="image/svg+xml" href="favicon.svg" />
<link rel="apple-touch-icon" href="apple-touch-icon.png" />
<link rel="manifest" href="site.webmanifest" />
```

The hrefs are deliberately **base-relative** — no leading `/` and no `./` —
because Vite copies `public/` files verbatim and the same link must resolve
under all three build bases: the dev-server root (`/`), a GitHub Pages project
sub-path (`/<repo>/`), and Electron's `file://` base (`./`). The
`site.webmanifest` references the `icon-192.png`/`icon-512.png` files that sit
beside it. `public/assets/CREDITS.md` records the emblem's provenance; no
game-specific icon variants are supported. See CG-0MUUFZSE90061KKL and the
parent icon work CG-0MUTTXRWZ009NUB9.

### Publishing the nine repositories

The nine repositories named in `scripts/configs/repo-layout.json` (the merged
core repo `Tableau-Card-Engine` plus one `tce-<game>` per game) are created and
published by `scripts/publish-repos.ts`:

> **Merged-core note.** Under the [merged-core decision](dev/merged-core-decision.md)
the core target is `Tableau-Card-Engine` and the interim
`tableau-card-engine-core` repository is retired, not published. The publication
helper/target list is updated by the F3 migration child of CG-0MUJ0IAJM009X0Q2.

```bash
npm run publish:repos -- --dry-run      # print the plan; runs no gh/git command
npm run publish:repos                   # create + publish every target
npm run publish:repos -- --target golf  # one target (core | <game> | tce-<game>)
npm run publish:repos -- --repos-dir ../tce-repos
```

Each target is created **public**, `dev` is pushed, and `main` is seeded from
`dev` and set as the default branch. Only `dev` and `main` are ever published
(no tags, no feature/`wl-*` branches); the helper is idempotent (an existing
repository is never re-created, and a target whose refs are up to date pushes
nothing and exits 0) and never force-pushes. The full contract, including the
safety guards and the fresh-clone verification commands, is recorded in the
[Repo publication decision](dev/repo-publication-decision.md); the executable
contract is `tests/scripts/repo-publication.test.ts`.

### Using a published repository

A published game repository is a complete single-game TCE checkout: the engine
is pulled in as the `core` git submodule, so a recursive clone gives you the
engine and the game together. For example, `tce-golf`:

```bash
git clone --recurse-submodules git@github.com:TheWizardsCode/tce-golf.git
cd tce-golf
npm install
npm run build            # tsc --noEmit && vite build
npm test -- --project unit
```

The merged-core repository works the same way for the engine (it has no game
submodules — the distribution composes games as siblings):

```bash
git clone git@github.com:TheWizardsCode/Tableau-Card-Engine.git
cd Tableau-Card-Engine
npm install
npm run build
npx vitest run --project unit   # `npm test` runs the full CI suite
```

The `tce-<game>` repos use `main` as their default branch, carry only `dev` and
`main`, and resolve every engine import through the aliases against `./core`.

Follow the Golf (original reference) and Sushi Go (most recent) examples as reference implementations.

## Runtime Game Plugins

The Electron launcher can also load games **at runtime** — a distribution
operator drops a built game artifact into the launcher's content directory and
adds a manifest entry, with no launcher rebuild. This complements the
[config-driven catalogue](#config-driven-game-catalogue) (games compiled into
the build): build-time presets decide the *shipped* catalogue, runtime plugins
add *drop-in* games afterwards.

> Runtime artifacts externalise `phaser` and the engine aliases; the packaged
> launcher resolves those bare specifiers with a generated **import map** — see
> [Shared-dependency resolution](#shared-dependency-resolution-tce-shared-import-map)
> below. Each artifact also packages its own **game-owned assets** (audio,
> icons, game-specific cards), resolved through the scoped `tce-games://`
> protocol — see [Per-game asset resolution](#per-game-asset-resolution).

### Artifact layout

```
<contentDir>/games/
  manifest.json                 # the catalogue of runtime games
  <game-id>/
    entry.js                    # ESM: named scene-class export + GAME_INFO
    assets/
      thumbnail.png             # optional thumbnail (manifest "thumbnail")
      audio/<game-id>/*.wav     # game-owned audio (packaged from the game repo)
      games/<game-id>/*         # game-owned icons/sprites
```

`<contentDir>` is the content directory the launcher resolved (bundled `dist/`
by default; a Steam DLC directory via `--content-dir <dir>` / `TCE_CONTENT_DIR`;
see [DLC content directory](#dlc-content-directory-steam-model)).

### `games/manifest.json` schema

```json
{
  "version": 1,
  "games": [
    {
      "id": "golf",
      "sceneKey": "GolfScene",
      "title": "9-Card Golf",
      "description": "Lowest score wins.",
      "thumbnail": "assets/thumbnail.png",
      "coreEngineVersion": "^0.1.0",
      "entry": "entry.js"
    }
  ]
}
```

| Field | Required | Meaning |
|-------|----------|---------|
| `version` | yes | Manifest schema version (currently `1`). |
| `games` | yes | Array of game entries. |
| `games[].id` | yes | Stable game id; also the artifact directory name. Lower-cased slug. |
| `games[].sceneKey` | yes | Phaser scene key the launcher registers/starts the game under. |
| `games[].title` | yes | Display name shown on the selector card. |
| `games[].description` | yes | Short description shown on the card. |
| `games[].thumbnail` | no | Artifact-relative path; served over `tce-games://<id>/<path>`. |
| `games[].coreEngineVersion` | yes | Semver range of compatible core-engine versions. |
| `games[].entry` | yes | Artifact-relative path to the ESM entry module. |

Duplicate `id`/`sceneKey` values, missing fields, and invalid semver ranges are
rejected as validation errors (the launcher logs them and continues with the
static catalogue). Parsing lives in `src/ui/game-manifest.ts`.

### Compatibility rule

Each entry declares `coreEngineVersion` (a semver range such as `^0.1.0`).
At load time the launcher checks it with `semver.satisfies(engineVersion,
range)` against `ENGINE_VERSION` from `@core-engine`. Incompatible games are
**hidden** from the card grid and listed in a notice, e.g.
`Incompatible game: 9-Card Golf — requires core v^9.0.0 (launcher is v0.1.0)`.
Anyone may build incompatible games; only compatible ones run.

### `tce-games://` asset protocol

Thumbnails and other per-game assets are **not** loaded from the launcher's
`public/` directory. The renderer builds `tce-games://<id>/<relative-path>`
URLs (`src/ui/game-asset-url.ts`) and the Electron main process serves them
from `<contentDir>/games/<id>/…` through a deny-by-default protocol handler
(`electron/game-protocol.ts`). Requests that are absolute, contain `..`/NUL, or
escape the game directory are denied (404); unknown extensions are served as
`application/octet-stream`.

**Shared-audio fallback.** A game artifact may legitimately omit an optional
SFX that the launcher ships in its shared `assets/audio/default/` set. When a
request for `games/<id>/assets/audio/<dir>/<rest…>` names a file absent from the
artifact, the handler serves `<contentDir>/assets/audio/default/<rest…>` instead
(`resolveSharedAudioFallback`) — a genuine runtime fallback. Only paths shaped
`assets/audio/…` are eligible; anything else is a hard 404.

### Per-game asset resolution

A runtime game scene loads its own assets through the same engine helpers as a
static game (e.g. `audioPathWithFallback('golf', 'card-draw.wav')`), but the
paths must resolve to the *artifact*, not the launcher's `public/` root. The
glue is the **active runtime game base**:

- The plugin loader tags each runtime entry with its artifact id
  (`GameEntry.runtimeGameId`).
- The Game Selector calls `setActiveRuntimeGame(id)` immediately before
  starting a runtime scene and `setActiveRuntimeGame(null)` when it is
  (re)entered (`src/ui/GameSelectorScene.ts`).
- `audioPathWithFallback` resolves the game-specific URL through
  `resolveActiveGameAssetUrl` (`src/ui/game-asset-url.ts`), producing
  `tce-games://<id>/assets/audio/<dir>/<file>` for a runtime game, and keeps the
  launcher-relative path for the static catalogue.

> **Phaser caveat:** an array passed to `this.load.audio()` is a list of
> *format* alternatives — Phaser loads only the first decodable entry, it is
> **not** an HTTP fallback. `audioPathWithFallback` therefore relies on the
> `tce-games://` handler for fallback (above) and on `SoundManager` for safety:
> `SoundPlayer.exists()` is consulted before playing, so a key that is absent
> from the audio cache (an optional SFX missing everywhere) is skipped rather
> than throwing out of Phaser's `WebAudioSound` constructor and aborting the
> scene. The reference builder (`scripts/build-game-artifact.mjs`,
> `copyGameOwnedAssets`) packages the game's real (non-symlink) assets —
> symlinks point at the shared core assets the launcher already ships.

### Producing an artifact

The reference builder turns a configured game into an artifact using Vite
library mode:

```bash
npm run build:game-artifact -- --game golf --preset configs/golf.json
```

It writes `build/game-artifacts/manifest.json` and
`build/game-artifacts/<id>/` (`entry.js` + `assets/`). `phaser` and the engine
aliases (`@core-engine/*`, `@card-system/*`, `@rule-engine/*`, `@ui/*`,
`@ai/*`) are externalised so the artifact does not bundle a second engine copy.
The emitted `entry.js` re-exports the scene class (named after the scene module)
and the game's `GAME_INFO`. The output directory is gitignored.

### Installing an artifact

1. Copy `build/game-artifacts/manifest.json` and the `build/game-artifacts/<id>/`
   directory into `<contentDir>/games/` (merge the manifest if runtime games
   already exist).
2. Relaunch the Electron launcher. The plugin loader
   (`src/ui/GamePluginLoader.ts`) reads the manifest, dynamically imports each
   compatible `entry.js`, and merges the games into the selector alongside the
   static catalogue.

If the manifest is missing, malformed, or a game fails to load, the launcher
continues with the statically-registered games and logs the error.

### Shared-dependency resolution (`tce-shared` import map)

The reference builder externalises `phaser` and the engine aliases (so a second
engine copy is never bundled), which leaves **bare ESM specifiers** in
`entry.js` — e.g. `import { resolveSetupOptions } from "@core-engine/SetupOptions"`.
A plain browser/Electron renderer has no resolver for bare specifiers.

The **electron-mode launcher build** closes this gap with a browser **import
map**, emitted by `scripts/vite-runtime-shared-plugin.ts` (pure logic in
`scripts/runtime-shared-import-map.ts`):

- Every engine module under `src/{core-engine,card-system,rule-engine,ai,ui}` is
  emitted as its own Rollup entry with a **stable, path-derived** output name
  (`tce-shared/<alias>/<module>.js` — never a content hash), and
  `src/runtime-shared/phaser.js` re-exports Phaser as `tce-shared/phaser.js`.
- Because those entries live in the **same build** as the launcher, Rollup
  deduplicates the engine/Phaser modules: the launcher and every runtime
  artifact share **one module instance** (no second Phaser/engine — class
  identity is preserved). `preserveEntrySignatures: 'strict'` keeps each
  entry's named exports.
- A `<script type="importmap">` mapping every known specifier is injected at
  `head-prepend` in `dist/index.html`, before the launcher's module script, so
  it is active when `src/ui/GamePluginLoader.ts` dynamically imports an
  artifact.

The map is derived from the launcher's own source tree, so it is deterministic
across builds and covers deep subpaths (`@ui/Renderer`,
`@ui/Renderer/adapters/GolfAdapter`, `@core-engine/transcript`, …). Web builds
are unaffected — the plugin is enabled only for `--mode electron` (runtime
plugins are Electron-only).

Verify the packaged path (builds the electron launcher + the
`tests/fixtures/runtime-plugin-fixture` artifact, then checks in a real
Chromium that the fixture is discovered and starts):

```bash
npm run verify:runtime-plugin
```

Automated coverage:
`tests/ui/runtime-shared-import-map.test.ts` (discovery, determinism, deep
specifiers) and `tests/ui/runtime-shared-artifact-coverage.test.ts` (the map
covers every bare specifier a real built artifact emits). The packaged
scenarios are in the
[verification runbook](dev/runtime-game-plugins-runbook.md) (scenario D).

> **Per-game assets are resolved separately from the import map.** The import
> map resolves external *modules*; a runtime game's own audio/icons are
> packaged in its artifact and served through `tce-games://` (see
> [Per-game asset resolution](#per-game-asset-resolution)). The reference
> builder copies game-owned assets (`copyGameOwnedAssets`), the selector sets
> the active runtime game base, and `SoundManager` skips an audio key the
> backend cannot play — so a runtime game boots and plays without the launcher
> having been rebuilt with its assets.

## Card Packs

Card packs are the card-level sibling of [runtime game plugins](#runtime-game-plugins): a
distribution operator drops a pack into the launcher's content directory to
extend an already-installed game with new cards and art, without rebuilding the
launcher (feature `CG-0MUZFD1WR0031QTB`; Main Street is the first consumer). A
pack is a manifest + a CSV fragment in the **game's existing card schema** +
optional assets, merged into the base pool at load time. Packs are additive and
may be entitlement-gated (Steam DLC). For the full lifecycle walk-through, see
the [card-packs runbook](dev/card-packs-runbook.md) (authoring → building →
installing → gating).

### Pack layout

```
<contentDir>/packs/
  manifest.json                 # pack catalogue ({ version, packs[] })
  <gameId>/<packId>/
    cards.csv                   # CSV fragment (same header as the base pool)
    assets/…                    # pack art, served over tce-packs://
```

Each manifest entry declares `id`, `gameId`, `title`, `description`, `version`,
`coreEngineVersion` (a semver range), `cards`, optional `assets`, and optional
`entitlement.steamAppId`. The contract lives in
`src/core-engine/CardPackManifest.ts`; the merge seam that turns base + packs
into one pool is `src/core-engine/CardPackMerge.ts`. The renderer discovers
packs with `src/ui/CardPackLoader.ts` and resolves pack assets through the
`tce-packs://` protocol (`src/ui/card-pack-url.ts`, `electron/pack-protocol.ts`).

### Loading a pack

The renderer discovers a game's packs with `loadCardPacks`
(`src/ui/CardPackLoader.ts`) from the launcher-resolved content directory:

1. Read `<contentDir>/packs/manifest.json` through `fetch`.
2. Parse and validate it (`parseCardPackManifest`) — never throws.
3. Filter to the running game (`filterPacksByGameId`) and partition by core
   compatibility (`splitPacksByCompatibility`).
4. Resolve entitlement for the compatible batch through the injected resolver.
5. Fetch each entitled pack's CSV fragment over
   `tce-packs://<gameId>/<packId>/<cards>` and expose its `assets` as resolved
   `tce-packs://` URLs (the game's asset loader fetches the binaries; the
   loader never reads image/audio bytes itself).

The loader is **environment-injected** (`contentDir`, `gameId`,
`engineVersion`, `fetchManifest`, `fetchCsv`/`importer`,
`resolveEntitlement`), so it is unit-testable without Electron, a network, or a
real content directory. Main Street calls `bootstrapMainStreetCardPacks()`
**before scene setup**, so the first deal already includes pack cards; a game
feeds the returned packs to the core merge seam
([`mergeCardPackCsv`](../src/core-engine/CardPackMerge.ts), see below).

### Entitlement

A pack with no `entitlement` is **free** base content. A pack gated on Steam
DLC is resolved by the main-process seam
(`electron/card-pack-entitlements.ts`): a pure `PackEntitlementSource` interface
with a deterministic `FakeEntitlementSource` and a real Steamworks adapter
(`electron/card-pack-entitlements-steamworks.ts`, dynamic optional import +
`apps.isDlcInstalled` capability detection). The pack → DLC app-id mapping is
**data** (`electron/card-pack-dlc-catalog.json`), never hard-coded, and resolves
by exact `(packId, gameId)` → wildcard `packId` → the pack's own manifest
`entitlement.steamAppId` (`electron/card-pack-catalog.ts`).

The renderer never imports the SDK; a total read client
(`src/ui/card-pack-client.ts`, `cardPackClientFromWindow()`) reads status
through the `window.tce.cardPacks` bridge
(`electron/preload.cjs` → `electron/card-pack-ipc.ts`). Each pack resolves to
`free`, `unlocked` or `locked`:

| State | Meaning |
|-------|---------|
| `free` | No entitlement declared; enabled by default. |
| `unlocked` | Gated and the DLC is owned; enabled by default, toggleable. |
| `locked` | Gated and not owned / Steam unavailable / no DLC API; read-only with a reason. |

Lock reasons: `Requires Steam DLC <appId>.`, `Steam is unavailable.`, or
`Pack bridge unavailable.` In a plain browser (no bridge) an ungated pack reads
`free` and a gated pack `locked`, so the web build plays base content and never
crashes. A capability gap (a binding with no DLC API) is never treated as
entitlement — the pack stays locked; the launcher never fabricates an unlock.

### Degradation

Every card-pack layer is **total** — a failure degrades to base content rather
than crashing the game. A missing/malformed manifest is reported structurally;
an incompatible pack is hidden from play and listed with a reason; a gated pack
that is not owned is listed locked and its cards are absent; a fragment whose
header does not match the base schema, or that contributes a duplicate card id,
is dropped **whole** (never partially merged).

Main Street additionally persists the active pack set (`activePacks: { id,
version }[]`) and the merged `csvChecksum` / `csvData` with every save. On load
the merged CSV is restored from the save, a pack named in the save but not
active produces a `missing`/`disabled` warning and play continues on base
content, and the game refuses to resume **only** when a live card instance needs
a missing template (`MissingCardPackTemplateError`). `mergeMainStreetCardPool()`
is the single merge entry point that feeds `loadTemplatesFromCsv()`.

### Producing a pack

The reference builder validates an authored pack source tree, copies its real
(non-symlink) files, and merges its manifest entry into an installable packs
root:

```bash
npm run build:card-pack -- --input tests/fixtures/reference-packs/main-street
```

It writes `build/card-packs/packs/manifest.json` (upserted, not overwritten)
and `build/card-packs/packs/<gameId>/<packId>/` (the CSV fragment + copied
assets). Symlinks are skipped — they point at shared core assets the launcher
already ships (the same `copyGameOwnedAssets` convention as
`build:game-artifact`). A pack whose CSV header is invalid is rejected whole and
reported; an invalid manifest refuses the build. Copy
`build/card-packs/packs/` into `<contentDir>/packs/` to install the packs.

The **reference pack** is the Main Street Foundations pack at
`tests/fixtures/reference-packs/main-street/` — one business, one event and one
upgrade card plus two art assets. It is the worked example for the contract and
is built and asserted by `tests/scripts/build-card-pack.test.ts`.

> A pack's CSV fragment must reuse the *base game's* header exactly; the merge
> rejects a fragment whose header differs. Duplicate card ids across the base
> and the packs are reported as structural conflicts, and the offending pack is
> dropped whole.

### Manual QA

The step-by-step lifecycle runbook — **authoring → building → installing →
gating**, with the reference pack as a worked example — is
[`docs/dev/card-packs-runbook.md`](dev/card-packs-runbook.md).

The automated suite covers the contract, loader, merge, entitlement, listing and
save/load policy. The parts that need a packaged Electron run, a real content
directory and (for the locked case) a real Steam DLC app id are covered by the
[card-packs manual QA plan](dev/card-packs-qa.md) (installed/entitled,
present/locked, missing).

## Hand & Pile Rendering

**Requirement:** Example games **must** render hands and piles through the core engine's hand-management code — `HandView`, `PileView`, and related helpers such as `flipCard()`. Hand-rolling card rows with manual sprite arrays and hardcoded positioning is not an accepted pattern; using the shared components means engine improvements (animations, reduced-motion fallbacks, DPR-aware textures, selection) propagate to every game automatically.

**Exception carve-outs:** Layouts that genuinely don't fit the single-row `HandView` model may keep bespoke card rendering, but the exception must be documented in code comments and/or the scene's help text:

- **Golf** — the 3×3 tableau grid (exception note in `../tce-golf/src/scenes/GolfRenderer.ts`); its stock/discard piles still use `PileView`.
- **Feudalism** — token/crop counters via `CropIconRenderer` (non-card tokens, not a hand).

**Canonical reference:** `../tce-blackjack/src/scenes/BlackjackScene.ts` — migrated to two SLL-anchored `HandView` instances with `centerX` row anchoring and a `flipCard()`-based hole-card reveal; its browser tests (`tests/blackjack/BlackjackHandView.browser.test.ts`) verify the rendering path.

For non-standard card models (tokens, resource icons, expedition cards), use the `CardTextureResolver` / `renderCard` callbacks documented in the [UI Adapter Guide](ui/ADAPTER-GUIDE.md). See the [Gym scene index](gym/GYM_INDEX.md) for the complete HandView/PileView scene-to-API mapping.

### Hand capacity outlines

`HandView` can render ghost slot outlines so the player always sees how many more cards the hand can hold (CG-0MT6ER7YY003G680). Enable them per instance with `showPositionOutlines: true` and declare the capacity with `maxSlots` (one outline per slot); `maxSlots` can be updated at runtime via `setMaxSlots()` when the capacity changes (e.g. staff cards altering `maxHandSize` in Main Street). Options:

- `cardWidth` / `cardHeight` — outline size in px. Set both to match non-default card sizes (`cardHeight` defaults to `CARD_H`; Main Street uses `handCardW - 4` × `handCardH - 4`).
- Outlines are static (no animation), so reduced-motion is honoured by construction.
- Occupied slots sit at exactly the card's position and rotation (`depth = index - 0.5`, behind card `index`); rotation mirrors the card sprite's **actual** rotation, so custom-rendered hands that never rotate keep straight outlines. Extra capacity slots continue the same step to the right and render below every card.
- With an empty hand, `maxSlots` outlines render centred on the hand centre — the player sees the hand's capacity before any card is drawn.
- **Capacity-driven, stable slots (CG-0MUAYBB4E007LWEQ).** When `maxSlots` is set the card row is placed into the *same fixed capacity template* the empty hand renders, so adding a card fills the next empty slot to the right without re-centring the row — every already-placed card and every outline slot keeps its exact position (and rotation) as cards are added, up to capacity. The layout is keyed on `maxSlots !== undefined`, so toggling `showPositionOutlines` never moves cards (`showPositionOutlines` is purely visual). `setMaxSlots()` is the only mutation that re-lays the row (capacity change). Transiently over-capacity hands keep the first `maxSlots` slots fixed, cap outlines at `maxSlots`, and continue overflow cards to the right with the same step. Hands without `maxSlots` keep the legacy centred-on-count row.

Reference implementations: `example-games/gym/scenes/GymHandPileScene.ts` (max hand size 7, toggle button) and `../tce-main-street/src/scenes/MainStreetRenderer.ts`. Tests: `tests/ui/handView.outlines.test.ts`, `tests/handView/gym-handpile-outlines.browser.test.ts`, `tests/main-street/hand-outlines.browser.test.ts`.

## Animation & Sound Feedback for Player and AI Actions

**Requirement:** Every player **and** AI action that uses a core engine animation/feedback helper — `dealCard`, `discardCard`, `flipCard`, `placeCard`, `moveGameObject`, `shakeIllegalMove`, `popTextOrIcon`, `createDragDropManager`, and any future helpers — must be rendered with the corresponding animation and wired with a sound effect (SFX), so the action is both animated and audible. Each helper accepts a `soundManager` + `sfx` (`start`/`move`/`end`) options map (see [UI Animation Helpers](ui-animations.md)); pass both so the action is never silent or instant by default. SFX keys must follow the shared `sfx-` prefix convention — `COMMON_SFX_KEYS` from `src/core-engine/SoundManager.ts`, detailed in [docs/SFX_CONVENTION.md](SFX_CONVENTION.md); no game-scoped string literals. (`shakeIllegalMove` plays `COMMON_SFX_KEYS.ILLEGAL_MOVE` automatically; `popTextOrIcon()` is the lightweight score/notification popup; `createDragDropManager` — the reusable drag-and-drop lifecycle in `src/ui/dragDrop.ts`, see [drag-and-drop lifecycle](ui-animations.md#createdragdropmanager-drag-and-drop-lifecycle) — plays the illegal feedback sound on pickup veto and invalid drops.)

**AI actions:** AI turns must be animated with a brief delay so the player can see and hear what the AI did (e.g. card placement / row take). Coloretto is the in-repo precedent — `../tce-coloretto/src/scenes/ColorettoAiScheduler.ts` schedules AI turns via `time.delayedCall` (750ms, 150ms under reduced motion) then dispatches the AI's action through the same animated/sounded path as a human turn (rendered by `ColorettoRenderer`, orchestrated by `ColorettoScene`).

**Accessibility:** Reduced-motion preferences (explicit flag → SettingsStore toggle → `prefers-reduced-motion`; see the [Accessibility](ui-animations.md#accessibility) section of the animation helpers reference) and the settings-panel mute/volume controls must be respected — pass the helper's `reducedMotion` flag and play SFX through `SoundManager` (or `safePlaySound()` for overlay helpers) so mute and volume apply uniformly. This requirement reinforces, never weakens, accessibility behaviour.

**Exceptions:** Actions that legitimately have no visible or audible effect, and headless/replay/test/transcript modes (no rendering or audio), are exempt. Document any exemption in code comments and/or the scene's help text.

**Compliant references:** Golf's `GolfAnimator` (`../tce-golf/src/scenes/GolfAnimator.ts`) wires `soundManager` + `sfx` into its deal/discard/flip helpers; Coloretto animates and sounds AI turns (above); Blackjack preserves flip-sound timing and runs the dealer AI on a delay (`../tce-blackjack/src/scenes/BlackjackScene.ts`). New games should follow these patterns.

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
| 9-Card Golf | `../tce-golf/` | Card/Deck/Pile abstractions, GameState/TurnSequencer, scoring rules (A=1, 2=-2, K=0, column-of-three=0), Random/Greedy AI strategies, transcript recording, Phaser UI with 3x3 grid | `tests/golf/` (8 files) |
| Beleaguered Castle | `../tce-beleaguered-castle/` | Single-player solitaire, UndoRedoManager (Command pattern), drag-and-drop + click-to-move, auto-move heuristics, auto-complete, win/loss detection, HelpPanel component, checkpoint autosave after each move with startup recovery, hint system (AI solver suggests best move with source/destination highlights), Classic/Citadel deal variants via a persisted pre-game popup (Citadel deals all 52 cards, no pre-placed aces), Canvas-compatible selection highlight (`createCardHighlight`), natural-flow (animated-deal) first-click + click-to-move regression tests | `tests/beleaguered-castle/` (17 files) |
| Sushi Go! | `../tce-sushi-go/` | Card drafting (pick-and-pass hands), custom card types with set-collection scoring, multi-round match, procedural card-back textures | `tests/sushi-go/` (4 files) |
| Feudalism | `../tce-feudalism/` | Resource management (gem tokens), tiered development cards with costs/bonuses, noble attraction, multi-action turns (take/reserve/purchase), checkpoint autosave after each turn (human + AI) with startup recovery | `tests/feudalism/` (4 files) |
| Lost Cities | `../tce-lost-cities/` | Two-player expeditions, two-phase turn model (play/discard then draw), ascending-play rules, investment multipliers (x2/x3/x4), multi-round match scoring, procedurally generated SVG card assets | `tests/lost-cities/` (6 files) |
| Main Street | `../tce-main-street/` | Single-player tableau builder, responsive 2x5 grid layout, SLL integration, ToneForge audio adapter, Monte Carlo balance testing, tutorial scene | `tests/main-street/` |
| Coloretto | `../tce-coloretto/` | Set-building tableau (take-a-row mechanic), custom card types, canonical set-collection scoring (1=1,2=3,3=6,4=10,5=15,6+=21) with positive/negative color selection, wild joker cards (declared per-joker to a color at scoring, with colour-coded declaration chips in the round-end picker) and flat +2 bonus cards in the full 49-card deck, multi-round cumulative scoring with canonical winner tie-breaks (most single-round wins, then highest single-round score), randomized turn order with the canonical per-round start-player rule (most cards taken; ties to the most recent row take), Random/Heuristic AI strategies, SLL layout, transcript recording. Scene decomposed into helpers: `ColorettoRenderer` (board + animations), `ColorettoInputHandler`, `ColorettoAiScheduler`, `ColorettoOverlays` | `tests/coloretto/` (7 files) |

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

#### Card art pipeline (CG-0MTORJ5FS006B0UN, CG-0MUCM36EQ008YP4R, CG-0MUCMB8DT003DAKR)

Each card's 64×64 art zone embeds its art as an inline base64 `data:` URI
(required: the SVG is rasterised from a data URI, so external refs do not
resolve). **The 64×64 zone is a layout dimension, not the render resolution** —
Phaser rasterises the card SVG at `Math.max(MIN_QUALITY_SCALE, dpr)` quality
scale (`rasteriseSvgToTexture`, `MIN_QUALITY_SCALE = 2`), so the zone occupies
up to `64 × MIN_QUALITY_SCALE = 128` device pixels (at DPR ≤ 2) and the
embedded bitmap is **256×256 WebP**, always downscaled for crisp rendering.
At DPR 3 the zone is `64 × 3 = 192` device pixels; the 256 WebP still
downscales, avoiding any upscaling artefacts.

**Texture filtering (CG-0MUCMB8DT003DAKR).** Rasterised SVG textures are
always filtered **linearly** (`SVG_TEXTURE_FILTER_MODE = 0` — Phaser's
`Phaser.Textures.FilterMode.LINEAR`, where `NEAREST = 1`). Nearest-neighbour
minification is what makes card art look pixelated and would defeat the whole
native-resolution pipeline: a texture rasterised at 2× logical size is
minified by half on a DPR-1 display. `SvgHelpers` applies linear filtering
explicitly, and `createCardGame()` keeps `render.antialias: true` /
`antialiasGL: true`. With `antialias: false`, Phaser's `TextureSource.init`
calls `setFilter(NEAREST)` on **every** texture and the WebGL upload path
ignores `LINEAR`, so the whole engine renders in pixel-art (nearest) mode. Do
not set `antialias: false` (or `pixelArt: true`) in a card game — it is the
Phaser pixel-art setting.

The committed 1024×1024 source sprites live in
`../tce-main-street/src/sprites/<Name>_1024_x_1024.png` (the source of
truth; the `_64_x_64.png` files are superseded legacy thumbnails). Run
`node scripts/generate-main-street-card-art.mjs` to regenerate
`../tce-main-street/src/card-art-map.json` (card name → base64 data URI,
plus spelling aliases and a `Fallback` entry); the script downscales each
1024×1024 sprite to 256×256 and re-encodes it as lossy WebP (quality 90),
which keeps the inline map small (~0.6 MB) despite carrying 16× the pixels of
the old 64×64 PNG map.
Both `MainStreetCardArt.ts` (runtime CSV generator) and
`scripts/generate-main-street-card-svgs.mjs` (static SVGs) consume the map.
Cards without dedicated art use the `Fallback` sprite.

#### Turn Economy (CG-0MTINZ5GG007BH44)

Single-source turn cash formula (Q1=c — see `MainStreetDifficulty.ts` header):
`weekStart snapshot (weekStartCoins/weekStartRep at WeekStart) → placement deductions → applyIncome breakdown (staff buffs → income-multiplier effects → rep multiplier sampled AFTER income's own rep accrual; hand cards contribute no income — CG-0MTRDX0DN004EECN) → ongoing costs (after income, before incident) → incident (or incident-averted log entry via Risk Manager per Q3) → net row (Turn N net: coinsNow-weekStartCoins / repNow-weekStartRep) as the final log entry, including premature bankruptcy/rep-collapse and competitive closing phases`. Invariants: Q1=c rep sampling, Q2 3-decimal tooltip (`toFixed(3)`), Q3 explicit averted entry, banner→net ordering on premature exits. Canonical sites: `reputationCoinMultiplier`/`applyReputationMultiplier` (`MainStreetDifficulty.ts`), `applyIncome` (`MainStreetAdjacency.ts`), `buildCoinsTooltip`/`buildReputationTooltip` (`MainStreetHudTooltips.ts`), `appendTurnNetRow`/`processEndOfTurn`/`resolveCompetitiveClosingPhases` (`MainStreetEngine.ts`).

#### Deferred End-of-Turn Mutation (CG-0MTR72P14000VO6Q)

Interactive play defers the application of end-of-turn resource changes until
the closing animations land, so the HUD coins/reputation/score update only
when the visual feedback completes (coins fly to the HUD, the incident reveal
finishes) and the game-over banner never appears mid-animation.

- **Dual-mode engine functions.** `applyIncome` (`MainStreetAdjacency.ts`),
  `applyStaffOngoingCosts` / `applyCommunitySpaceOngoingCosts` /
  `applyBusinessOngoingCosts`, and `resolveIncident` (`MainStreetEngine.ts`)
  accept an optional `{ apply?: boolean }` option. Defaulted (or omitted)
  calls keep the legacy immediate-apply contract — the headless/AI path
  (`endTurnHeadless`, the Monte Carlo harness) and all existing direct calls
  are unchanged and deterministic. With `apply: false` they compute and
  return the deltas without touching `state.resourceBank`.
- **Deferred `processEndOfTurn`.** `processEndOfTurn(state, { deferResourceApplication: true })`
  (interactive scene path) runs the same phases but returns the summed deltas
  in `TurnResult.pendingCoinDelta` / `pendingRepDelta` / `pendingScoreDelta`
  and sets `TurnResult.requiresDeferredClosing`; `state.resourceBank` and
  `state.finalScore` are NOT mutated and the closing tail (EndCheck → next
  week) is deferred. Tutorial, reduced-motion and replay paths omit the flag
  (legacy immediate behaviour, no regression — AC5).
- **Apply at animation end.** The scene (`MainStreetTurnController` +
  `MainStreetAnimator`) applies the deltas exactly once via
  `applyEndOfTurnDeltas` when the last animation completes (guarded by the
  scene's `endOfTurnDeltasApplied` flag so income and incident animations
  cannot double-apply), then runs `finishDeferredTurnClosing` — immediate
  loss check, challenge evaluation against the post-delta state (the
  end-of-turn **safety net**: challenges are normally completed immediately
  after the action that satisfies them, per CG-0MU37CKRR008252I), EndCheck,
  next-week advance, net row — and finally refreshes the HUD.
- **Deferred HUD window.** `refreshHud()` (`MainStreetRenderer.ts`) renders
  the pre-animation `previousCoins` / `previousReputation` captured at
  `endTurn()` start while `incomeCollectionActive` or `incidentRevealActive`
  is set, switching to the post-delta state once the window closes.
- **Game-over timing.** EndCheck runs inside `finishDeferredTurnClosing`
  (after the animations) — the overlay cannot appear before the player has
  seen the income/incident feedback (AC4).

Canonical sites: `applyIncome` (`MainStreetAdjacency.ts`),
`computeEventDeltas` / `resolveIncident` / `processEndOfTurn` /
`applyEndOfTurnDeltas` / `finishDeferredTurnClosing` (`MainStreetEngine.ts`),
`refreshHud` (`MainStreetRenderer.ts`), `animateIncomePhases` /
`collectIncomeGrids` / `animateIncidentReveal` (`MainStreetAnimator.ts`),
`endTurn` / `finishTurnPresentation` (`MainStreetTurnController.ts`),
`previousCoins` / `previousReputation` / `incomeCollectionActive` /
`incidentRevealActive` / `endOfTurnDeltasApplied` (`MainStreetScene.ts`).

#### Community Favour (CG-0MSTOATDQ005XDET)

The Community Favour resource exchange is a **free** once-per-turn action
available during the market phase (it does not consume `actionsRemaining`):

- **coins → reputation:** spend `favourCoinsToRepCost` (default 2) coins for +1 rep.
- **reputation → coins:** spend `favourRepToCoinsRepCost` (default 2) rep for
  `favourRepToCoinsCoinGain` (default 3) coins. The round-trip is lossy, so no
  arbitrage.
- Rates are per-difficulty `GameConfig` constants in `MainStreetDifficulty.ts`
  (defaults on Easy/Medium/Hard).
- Gating: `state.favourUsedThisTurn` (market-phase only, reset at `WeekStart`),
  serialized with legacy-save backfill to `false`.
- UI: two SLL-positioned buttons inside the **market-aligned HUD strip**
  between the Coins and Reputation readouts (`favourRepToCoinsButton` →
  `favourCoinsToRepButton`, left-to-right `[rep→coins][coins→rep]`; rendered by
  `MainStreetRenderer.refreshHud` and parented into `hudContainer` as transient
  HUD children). Each carries an i18n tooltip
  (`buildCoinsToRepTooltip` / `buildRepToCoinsTooltip`) describing the exact
  exchange rate and the once-per-turn limit; tooltips are skipped in replay
  mode. They are disabled when the input resource is insufficient or the gate
  is spent.
- HUD layout (CG-0MT5UO47U0047UKA): the HUD strip is market-aligned
  (`hudLeft`..`hudRight` = the market box edges) and the actions-remaining
  counter renders in the action cluster directly above the End Turn / Cancel
  button, not in the strip.
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

## Listener Registry

The `ListenerRegistry` module (`src/core-engine/ListenerRegistry.ts`) centralises
event listener cleanup: instead of chained `.off()` calls in `destroy()`
methods, components track every listener through the registry and remove them
all with a single `.clear()` call.

### API

- **`on(emitter, event, handler, ctx?)`** – register a listener and track it.
  Compatible with Phaser 4 RC emitters (`scene.events`, `scene.input`,
  `scene.input.keyboard`) and any object with `.on()`/`.off()`.
- **`off(emitter, event, handler)`** – remove a single tracked listener
  (idempotent).
- **`clear()`** – remove every tracked listener in one call (idempotent; the
  registry remains usable so it is safe on scene restarts).
- **`size`** – number of currently tracked listeners.

### Scene scoping

`getSceneRegistry(scene)` (`src/core-engine/scene-registry.ts`) returns a
`ListenerRegistry` backed by a `WeakMap` and auto-clears it when the scene
fires its `shutdown` event:

```ts
import { getSceneRegistry } from '@core-engine';

const registry = getSceneRegistry(this);
registry.on(this.input, 'pointerdown', this.onPointerDown, this);
// No explicit cleanup needed — cleared on scene shutdown.
```

### Migration status

`SettingsPanel` and `HelpPanel` (`src/ui/`) now use `ListenerRegistry` for
scene-level listener cleanup. Listener-leak behaviour is verified in
`tests/ui/ListenerLeaks.browser.test.ts` (component create/destroy asserts
emitter listener counts return to baseline); unit tests live in
`tests/core-engine/ListenerRegistry.test.ts` and
`tests/core-engine/scene-registry.test.ts`.

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
git log --oneline -- ../tce-main-street/src/scenes src/ui tests/main-street
git revert <commit-hash>
npm test
npm run build
```

**When to regenerate thumbnails:**

Thumbnails are static assets. Regenerate them when a game's visual appearance changes significantly. Use `scripts/refresh-thumbnails.sh` to regenerate all thumbnails at once, or use the individual commands above for a single game.

## SVG Rendering & Migration

The engine now provides shared SVG raster helpers from `src/core-engine/SvgHelpers.ts` (exported via `src/core-engine/index.ts`).

Rasterisation policy (project choice): lazy rasterisation on first use. In practice this means scenes should preload SVG *source text* (via `this.load.text`) and only rasterise to a texture when the texture is first required for rendering. This keeps preload fast and memory usage reasonable while ensuring visual fidelity when textures are needed.

### Texture filtering and crispness (CG-0MUCMB8DT003DAKR)

The shared pipeline rasterises at `Math.max(MIN_QUALITY_SCALE, dpr)`
(`MIN_QUALITY_SCALE = 2`) and filters the resulting textures **linearly**
(`SVG_TEXTURE_FILTER_MODE = 0`, exported from `@core-engine`). Best practices
for crisp SVG art in a browser Phaser game:

- **Rasterise at display density, not at a fixed multiple.** A texture drawn at
  `logicalSize × Math.max(MIN_QUALITY_SCALE, dpr)` is 1:1 on HiDPI and only
  mildly supersampled at DPR 1; the old fixed 4× baseline allocated 16× the
  logical pixels for no visible gain.
- **Use linear filtering, never nearest.** `Phaser.Textures.FilterMode` is
  `LINEAR = 0`, `NEAREST = 1` (the inverse of an intuitive "1 = linear"
  reading). In the Canvas renderer Phaser sets
  `ctx.imageSmoothingEnabled = !frame.source.scaleMode`, so `scaleMode = 1`
  disables smoothing and minified art goes blocky.
- **Keep `antialias: true` (the default).** `antialias: false` (or
  `pixelArt: true`) is the pixel-art setting: Phaser then forces `NEAREST` on
  every texture. `createCardGame()` sets `antialias: true` /
  `antialiasGL: true` so the engine stays out of nearest mode.
- **Keep embedded bitmaps at or above the device-pixel art zone** so they are
  only ever downscaled (the card art map's 256×256 WebP for a 64×64 zone).
- **`drawImage()` uses the SVG's intrinsic size** (MDN); rasterising into a
  `canvas` sized to the target device pixels is the supported way to get a
  crisp result, and `imageSmoothingQuality = 'high'` is set on the rasterising
  context.

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
| Golf | `../tce-golf/src/layouts/golf.layout.json` | `../tce-golf/src/scenes/GolfLayoutAdapter.ts` |
| Beleaguered Castle | `../tce-beleaguered-castle/src/layouts/beleaguered-castle.layout.json` | `../tce-beleaguered-castle/src/scenes/BeleagueredCastleLayoutAdapter.ts` |
| Main Street | `../tce-main-street/src/layouts/main-street.layout.json` | `../tce-main-street/src/scenes/MainStreetLayoutAdapter.ts` |

Games with layout files and adapters ready for renderer integration:

| Game | Layout file | Adapter |
|------|------------|---------|
| Feudalism | `../tce-feudalism/src/layouts/feudalism.layout.json` | `../tce-feudalism/src/scenes/FeudalismLayoutAdapter.ts` |
| Sushi Go | `../tce-sushi-go/src/layouts/sushi-go.layout.json` | `../tce-sushi-go/src/scenes/SushiGoLayoutAdapter.ts` |
| Lost Cities | `../tce-lost-cities/src/layouts/lost-cities.layout.json` | `../tce-lost-cities/src/scenes/LostCitiesLayoutAdapter.ts` |

### Main Street canonical example

- Layout file: `../tce-main-street/src/layouts/main-street.layout.json`
- Adapter: `../tce-main-street/src/scenes/MainStreetLayoutAdapter.ts`
- Renderer integration: `../tce-main-street/src/scenes/MainStreetRenderer.ts` (`computeLayout()` applies SLL first, then falls back)

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

Location: `../tce-main-street/src/scenes/UpgradeOverlaySpec.ts`

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
  - **Cash line** — `"+X / -Y"` (combined `baseIncome + incomeBonus` minus `ongoingCost`) rendered as **two-tone segments**: income in green (`#44ff44`), ongoing cost in red (`#ff6644`), with the ` / ` separator in neutral grey (`#dddddd`). The former `Cash:` prefix was removed by manual review (CG-0MTORJ5FS006B0UN) — the colouring carries the meaning. The renderer draws each segment as its own text object laid out side-by-side (`OverlayTextSpec.segments`, CG-0MTDMOYOL008IQVO). Centred, 11px bold. Shown only when income or cost > 0; zero components are omitted (e.g. `+2`, `-0.75`) (CG-0MTCP76MP0088TQW).
  - **Reputation text** — `"+R/turn"` in blue (`#88bbff`), below the cash line.
  - **Upgrade border** — Golden stroke (`0xffaa22`), 3px width, around the card perimeter.
  - **Name** — NOT an overlay: baked into the card's SVG via a display-name variant texture (CG-0MT24MHGZ0025O20).

#### Layer 2: Overlay Rendering (`MainStreetRenderer.applyUpgradeOverlays()`)

Location: `../tce-main-street/src/scenes/MainStreetRenderer.ts` — `applyUpgradeOverlays()` method.

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
│  + display-name     │     │  → cashLine: "+8"          │
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
| `../tce-main-street/src/scenes/MainStreetScene.ts` | Inline HUD container creation | `@ui/Renderer` | `createHudContainer` |
| `../tce-main-street/src/scenes/MainStreetScene.ts` | Inline HUD text styling | `@ui/Renderer` | `createHudText` |
| `../tce-main-street/src/scenes/MainStreetScene.ts` | Inline tooltip zone setup | `@ui/Renderer` | `attachHudTooltipZone` |
| `../tce-main-street/src/scenes/MainStreetScene.ts` | Inline action button creation | `@ui/Renderer` | `createActionButton` |
| `../tce-main-street/src/scenes/MainStreetRenderer.ts` | `renderCardSvg` (local) | `@ui/Renderer` | `renderCardSvg` |
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

1. **Create a layout JSON file** in `src/layouts/<game>.layout.json` with **position-only** normalized zone rectangles (`x`, `y`) and anchors. Use `baseViewport` of 1280x720 (matching the shared `GAME_W`/`GAME_H` constants).

   **Important**: Layout zones define **positioning only** (`x`, `y`). Card dimensions come entirely from per-game constants (e.g., `CARD_W`, `CARD_H`), not from layout zones. The `pixelOverride` field supports exact pixel-position overrides for `x` and `y` only — no dimensions.

2. **Create a layout adapter** in `src/scenes/<Game>LayoutAdapter.ts` that:
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
| `../tce-main-street/src/layouts/main-street.layout.json` | Canonical base layout (8 zones, position-only) |
| `../tce-main-street/src/layouts/main-street-tutorial.layout.json` | Tutorial-specific layout (7 zones, position + dimensions) |
| `../tce-main-street/src/scenes/MainStreetTutorialHints.ts` | Tutorial overlay manager |
| `../tce-main-street/src/TutorialFlow.ts` | T1-T26 unified step definitions with `TutorialHighlightZone` / `TutorialActionType` types (CG-0MTNMBX5Z002U0MH) |

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
| `hud` | HUD strip (market-aligned bar with coins, reputation, score, and the Community Favour buttons; width matches the market box, CG-0MUFAISSZ002TE1B) | Yes (full-width bounding box) |
| `marketBusinessRow` | Legacy full-market-area zone (single row now drawn in the same band) | No (informational) |
| `streetGrid` | The 2×5 street grid for placing businesses | Yes (stops before right column) |
| `endTurnButton` | End Turn action button area | Yes |
| `incidentQueue` | Face-down incident deck panel (card back + remaining count, CG-0MSTOATDP000JNHH) | Yes |
| `investmentsRow` | ALIAS of `developmentRow` — the market rows were merged into one (CG-0MSTOATDT009BRX2); upgrade/event steps highlight the same single row | Yes |
| `helpButton` | Help/settings button area | Yes |
| `actionButtons` | Community Favour button band inside the HUD strip (relocated from the action bar, CG-0MUFAITED0088AGN) | Yes |

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

See `../tce-main-street/src/layouts/main-street-tutorial.layout.json` for a complete example.

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

### Tooltip Manager

The `TooltipManager` (`src/ui/Tooltip.ts`) displays contextual information (card details, scoring rules, HUD explanations) on hover. It has two rendering modes:

- **DOM mode** (default) — a `div` overlay appended to `document.body`.
- **Phaser mode** — caller-supplied game objects rendered via a `phaserRender` callback.

```typescript
import { TooltipManager } from '@ui';

const tooltip = new TooltipManager(this, settingsPanel);
cardSprite.setInteractive({ useHandCursor: true });
cardSprite.on('pointerover', () => tooltip.show('Card info', cardSprite.x, cardSprite.y));
cardSprite.on('pointerout', () => tooltip.hide());
```

**Bounds guarantee.** A tooltip must never render (partially) outside its visible bounds — an off-screen DOM tooltip used to extend the page's scrollable area and make the page "resize to make space". Both modes are now clamped:

- **DOM mode** positions the node with `position: fixed`, measures it once per `show()` (a single synchronous reflow, no per-frame layout thrash and no resize listeners), then flips it above/left of the hover point when there is not enough room and finally clamps it to the viewport with a 4 px margin. Because the node is `position: fixed` it can never contribute to the document's scrollable overflow, so showing/hiding a tooltip never changes the document scroll size. The legacy world→screen mapping (canvas bounding rect + camera scroll + scale) is unchanged.
- **Phaser mode** delegates layout to the caller's `phaserRender` callback. Use the exported, unit-tested helper to keep the container inside the game canvas:

  ```typescript
  import { clampTooltipToBounds } from '@ui';

  const boxW = text.width + padding * 2;
  const boxH = text.height + padding * 2;
  const { x, y } = clampTooltipToBounds(rawX, rawY, boxW, boxH, GAME_W, GAME_H);
  container.setPosition(x, y);
  ```

  `clampTooltipToBounds(x, y, tooltipWidth, tooltipHeight, boundsWidth, boundsHeight, margin = 4)` is opt-in and never repositions a caller-managed container on its own, so a callback that already clamps is unaffected. Lost Cities, Sushi Go and the Gym tooltip demo all use it; `computeViewportTooltipPosition(...)` exposes the DOM flip+clamp maths for unit tests.

**Guards.** In non-DOM environments (`document`/`window` undefined) the manager stays inert; when the canvas bounding rect cannot be read it hides, and when viewport dimensions are unavailable it falls back to the legacy unclamped placement. `pointer-events: none`, the maximum `z-index` and reduced-motion behaviour are preserved. A tooltip larger than the viewport or canvas cannot fit — it is pinned to the margin and partial visibility is accepted.

### UI Component Base Class (`UIComponentBase`)

`UIComponentBase` (`src/ui/UIComponentBase.ts`) provides the shared lifecycle contract for reusable UI widgets. `HelpButton`, `SettingsButton`, and `Slider` extend it, and new components should too — it removes the repeated `destroyed` flag, idempotency guard, and manual listener bookkeeping that previously had to be re-implemented (and could leak listeners when a component was destroyed mid-interaction).

It provides:

- `destroyed` / `enabled` read-only state and `setEnabled(boolean)`.
- `protected canInteract()` — `true` while the component is live **and** enabled; event handlers should gate on it.
- `protected on(emitter, event, handler, context?)` — registers the listener and tracks it via the shared `ListenerRegistry` (`src/core-engine/ListenerRegistry.ts`). Returns an unsubscribe closure. Every tracked listener is removed automatically by `destroy()`.
- `protected off(emitter, event, handler)` — removes a single tracked listener early, for listeners whose lifetime is shorter than the component's (e.g. a slider's drag-scoped `pointermove`/`pointerup` handlers detached on `pointerup`).
- `protected abstract destroyContent()` — subclass-specific game-object teardown.
- `destroy()` — idempotent; runs `destroyContent()` exactly once, then removes all tracked listeners (cleanup still runs even if `destroyContent()` throws).

The companion `mergeDefaults(defaults, overrides?)` helper merges caller options over defaults: overrides win, absent or explicitly `undefined` keys fall back to the default, and falsy values (`0`, `false`, `''`) and `null` are preserved.

```typescript
import { UIComponentBase } from '@ui';

class MyWidget extends UIComponentBase {
  private readonly box: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    super();
    this.box = scene.add.rectangle(0, 0, 40, 40);
    this.on(this.box, 'pointerdown', () => {
      if (this.canInteract()) this.handleClick();
    });
  }

  protected destroyContent(): void {
    this.box.destroy();
  }
}
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

#### ToneForge

- **Label:** "ToneForge"
- **Location:** Debug Tools section of the Settings panel. Unlike the four
  engine-generic tools above, this entry is injected into the **effective**
  debug-tools list by `CardGameScene.initSettingsPanel` (via
  `resolveEffectiveDebugTools`), so it appears even for games that supply their
  own `debugTools` list (e.g. Main Street) — no game-specific registration is
  required. It is present whenever the scene has a `SoundManager`.
- **Function:** Reports whether ToneForge runtime synthesis is currently
  active and toggles it on/off at runtime, **without a scene restart**:
  - **Live status text:** `Active` / `Inactive` plus the mapped factory count
    and, when one was recorded, the last module load error (e.g.
    `Inactive · 0 factories · load error: module exploded`). The text is a
    `() => string` description that `SettingsPanel` re-resolves on a 500 ms
    poll while the panel is open, so an async module load or a toggle is
    reflected immediately without closing and reopening the panel.
  - **Toggle:** Clicking the label detaches the synth player/mapping when
    synthesis is active (keys fall back to the existing WAV/Phaser path) and
    restores the previously attached integration when inactive. No entry is
    added when there is no `SoundManager`.
- **When to use:** Verify that the ToneForge wiring is actually in use — the
  operator no longer has to guess from the sound — and A/B compare synthesised
  audio against the fallback audio. Open the Settings panel (gear icon) →
  scroll to Debug Tools → click **ToneForge** to toggle.
- **Implementation:**
  - `src/ui/debug/ToneForgeStatusTool.ts` — `createToneForgeStatusTool()`,
    `withToneForgeStatusTool()` and `resolveEffectiveDebugTools()`.
  - `src/core-engine/SoundManager.ts` — read-only `isSynthActive()` /
    `getSynthStatus()` and the `detachSynthIntegration()` /
    `restoreSynthIntegration()` toggle API.
  - `src/ui/CardGameScene.ts` — dev-gated effective-list injection.

#### Market Card Cheat (Main Street only)

- **Label:** "Market Card Cheat"
- **Location:** Debug Tools section of the Settings panel — appears only in
  `MainStreetScene` (injected via a Main-Street-specific override of
  `CardGameScene.initSettingsPanel`; other example games do not show it).
  Visible only when running under `npm run dev` (`import.meta.env.DEV === true`).
- **Function:** Replaces a random card in the 3-card market row with any card
  from the live Main Street pool (all 5 families — Business, Community Space,
  Event, Upgrade, Staff — derived from the CSV-backed template registry in
  `MainStreetCards.ts`). The picker provides:
  - **Type filter:** Checkboxes for one or more families (composes as an
    intersection with the text filter, `type ∩ text`).
  - **Title filter:** A text field that filters by case-insensitive substring
    against the card display name; clearing it restores the full grouped list.
  - **Mouse + keyboard:** Click a card to select-and-confirm, or use
    Arrow Up/Down to move focus and Enter to confirm; a pinned
    `[ Replace Market Slot ]` button in the dialog footer also confirms the
    highlighted card. `Escape` dismisses the overlay. A DOM input at the top
    of the dialog holds keyboard focus on open.
  - **Market replacement:** On confirm a uniformly-random slot from
    `state.market.cards` is replaced with a freshly-instantiated card
    (`${templateId}--cheat-<nonce>` unique id; business/community-space fields
    like level/bonuses are reset), the displaced card is returned to its
    family's discard pile, and the market row re-renders via the existing renderer path
    (`refreshMarket` / `refreshAll`). The operation is a direct state mutation
    and goes through the normal deck/discard lifecycle so save/load, transcript
    recording, and subsequent market refills continue to work.
- **When to use:** Force a rare or tier-gated card into the market to reproduce
  synergy, progression-gating, economy, or staff-skill edge cases without
  manipulating saves or seeds. Open the Settings panel (gear icon) → scroll to
  Debug Tools → click **Market Card Cheat** → pick a card → Replace.
- **Implementation:**
  - `src/ui/debug/MarketCardCheatOverlay.ts` — Overlay, picker, filtering
    (`filterEntries()`), keyboard navigation, and `createMarketCardCheatTool()`
    factory (label/description matched to the acceptance criteria).
  - `../tce-main-street/src/MainStreetMarket.ts` — `cheatReplaceMarketCard()`
    helper that performs the random-slot replacement and discard routing.
  - `../tce-main-street/src/scenes/MainStreetScene.ts` — Dev-gated wiring
    (`import.meta.env.DEV` branch in `initSettingsPanel`) so the tool is
    absent/tree-shaken from production bundles.

#### Staff Application (Main Street only)

- **Label:** "Staff Application"
- **Location:** Debug Tools section of the Settings panel — appears only in
  `MainStreetScene` (injected via a Main-Street-specific override of
  `CardGameScene.initSettingsPanel`). Visible only when running under
  `npm run dev` (`import.meta.env.DEV === true`).
- **Function:** Toggles a dev-only `forcedStaffApplicant` flag that makes the
  staff-applicant trigger fire deterministically at every week start, bypassing
  the usual `min(income + reputation, 15)%` RNG roll. The overlay shows the
  current state (`[ON]` / `[OFF]`) and the live computed chance
  (e.g. `Staff Application [ON] — 12% chance`), which updates each time the
  toggle is clicked as the underlying `computeApplicantChance(state)` value
  changes.
- **Constraints still respected:** Forced mode still requires at least one
  eligible business with a free employment slot; if none exists — or the
  computed chance is 0 — no applicant is spawned. The trigger is also
  suppressed in tutorial/headless runs where `state.suppressApplicant` is
  true, because `executeWeekStart()` skips `resolveStaffApplicant()` entirely
  in that case.
- **Session-only:** The `forcedStaffApplicant` flag is not persisted by
  save/load — it resets on a new game session.
- **When to use:** Test the hire / decline / let-go applicant flow without
  waiting for the random trigger. Open the Settings panel (gear icon) →
  scroll to Debug Tools → click **Staff Application** → click `[  TOGGLE  ]`
  to force an applicant on the next week start.
- **Implementation:**
  - `src/ui/debug/StaffApplicantCheatOverlay.ts` — Toggle overlay and
    `createStaffApplicantCheatTool()` factory.
  - `../tce-main-street/src/MainStreetState.ts` — `forcedStaffApplicant?:
    boolean` dev-only field (not serialized).
  - `../tce-main-street/src/MainStreetEngine.ts` — `computeApplicantChance()`
    (exported) and the forced branch in `resolveStaffApplicant()`.
  - `../tce-main-street/src/scenes/MainStreetScene.ts` — Dev-gated wiring
    (`import.meta.env.DEV` branch in `initSettingsPanel`).

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

   `description` may also be a `() => string` function for tools whose status
   changes at runtime (e.g. the **ToneForge** tool). `SettingsPanel` resolves it
   at render time and re-resolves it on a 500 ms poll while the panel is open,
   so the text stays live. Existing static-string descriptions are unchanged.

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
   `initSettingsPanel()` from any game scene to override the defaults. Note that
   the engine still injects the dev-only **ToneForge** entry into the
   **effective** list (via `resolveEffectiveDebugTools`) regardless of whether a
   game supplies its own tools — de-duplicated by label, and omitted entirely in
   production builds.

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
| `src/ui/debug/MarketCardCheatOverlay.ts` | Market Card Cheat overlay (Main Street market-replacement picker) |
| `src/ui/debug/StaffApplicantCheatOverlay.ts` | Staff Application cheat overlay (Main Street forced-applicant toggle) |
| `src/ui/debug/ToneForgeStatusTool.ts` | ToneForge status/toggle tool + effective-list injection helpers |
| `../tce-main-street/src/MainStreetMarket.ts` | `cheatReplaceMarketCard()` — random-slot replacement + discard routing |
| `src/ui/debug/index.ts` | Debug tools barrel file |
| `src/ui/CardGameScene.ts` | Default debug tool registration + effective-list injection |
| `src/ui/SettingsPanel.ts` | Debug section rendering (incl. live function descriptions) in Settings panel |

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
