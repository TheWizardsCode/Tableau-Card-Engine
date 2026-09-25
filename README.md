# Tableau Card Engine (TCE)

A modular, spike-driven game engine for building single-player tableau card games with **Phaser 4 RC**, **TypeScript**, **Vite**, and **Vitest**.

**[Play Alpha Game Now](https://thewizardscode.github.io/Tableau-Card-Engine/)**

## Quick Start

```bash
npm install          # install dependencies
npm run dev          # start Vite dev server (http://localhost:3000)
npm run monte-carlo  # run the Main Street Monte Carlo harness (JSON + CSV outputs)
npm test             # run Vitest test suite (non-destructive: does not modify tracked assets)
npm run build        # TypeScript check + production build -> dist/
npm run preview      # serve production build locally
npm run tf:generate  # generate ToneForge artifacts to build/tf-synths/

# Desktop / Steam packaging (Electron launcher):
npm run build:electron   # electron-mode Vite build (relative base, file://-safe)
npm run start:electron   # build + launch the desktop app locally
npm run package          # package a binary for the host platform (see below)

# Smoke test (headless, part of npm test):
npx vitest run --project unit tests/main-street/smoke-scenario.test.ts
```

Note: Vitest browser runs use an internal Vite server, but the dev-only transcript persistence middleware is disabled in test mode to avoid file-system side effects and reduce harness flakiness.

### Which games does a build include?

The game catalogue is **config-driven**. A build selects a preset with
`GAMES_CONFIG`; the default (`core-only`) ships the engine + Gym with no games:

```bash
npm run build                          # core-only (engine + Gym)
GAMES_CONFIG=solo npm run build        # configs/solo.json (one game)
GAMES_CONFIG=arcade npm run build      # configs/arcade.json (a small subset)
GAMES_CONFIG=deluxe npm run build      # configs/deluxe.json (a different subset)
GAMES_CONFIG=full npm run build        # configs/full.json (every game)
GAMES_CONFIG=configs/full.json npm run build   # an explicit preset path
```

See [Repository Map](#repository-map-multi-repo-layout) below and
[Config-Driven Game Catalogue](docs/DEVELOPER.md#config-driven-game-catalogue).

## Desktop Launcher (Electron) & Steam Packaging

TCE ships as a web app (GitHub Pages) **and** as a native desktop launcher built with **Electron** (`electron/`), for Steam distribution. The launcher boots the same built web app in a desktop window:

- `npm run build:electron` -- Vite build with a **relative base** (`./`) so `dist/index.html` loads under Electron's `file://` protocol; the GitHub Pages build (`npm run build`) is unchanged.
- `npm run start:electron` -- build + launch the desktop app locally.
- `npm run package` / `package:win` / `package:linux` / `package:mac` -- produce a distributable binary (Windows NSIS installer is the primary Steam artifact) into the gitignored `release/` directory.
- Game content can come from the bundled app or an external **Steam DLC install directory** via `--content-dir <dir>` / `TCE_CONTENT_DIR`, resolved behind a small provider interface so a future Steamworks-backed provider can be added without a rewrite.
- The Windows binary is built reproducibly by CI (`.github/workflows/package.yml`) and uploaded as a workflow artifact on every push to `main`.

See `docs/DEVELOPER.md` (Electron Launcher / Desktop Packaging) and `RELEASE.md` for the full workflow.

## What Is This?

The Tableau Card Engine (TCE) builds increasingly complex card games as "spikes" to validate gameplay mechanics and engine APIs. Reusable components are extracted from each spike into shared engine modules. The end goal is a fully modular engine that others can use to build their own tableau card games.

The project is organised as a **multi-repo distribution**. Shared engine code,
the Gym, and the launcher shell live in the **core-engine repo**; each example
game is its own repo that composes the engine as a git submodule. The
`Tableau-Card-Engine` repo is the **launcher / distribution**: it composes the
engine with any subset of game repos and produces the web and desktop builds.

See [Repository Map (multi-repo layout)](#repository-map-multi-repo-layout).

**How the engine was built:** for a narrative walkthrough of the project's evolution from first commit to present day -- the spike-driven phases, the architectural decisions, and the lessons learned -- see the [video series outline](https://github.com/SorraTheOrc/open_source_llm/blob/dev/docs/video-series-outline.md) (maintained in the open_source_llm project, where the video series is produced).

## Repository Map (multi-repo layout)

TCE is split into one **core-engine** repo plus one repo per game, composed back
together with **git submodules**. Repos are checked out as siblings:

```
<parent>/
├── tableau-card-engine-core/   engine + Gym + launcher shell + shared assets
├── tce-golf/                   one repo per game (pulls ./core as a submodule)
├── tce-beleaguered-castle/
├── tce-blackjack/
├── tce-sushi-go/
├── tce-feudalism/
├── tce-lost-cities/
├── tce-main-street/
└── tce-coloretto/
```

### Cloning

```bash
# Engine + Gym only
git clone git@github.com:TheWizardsCode/tableau-card-engine-core.git

# A game repo, with its engine submodule
git clone --recurse-submodules git@github.com:TheWizardsCode/tce-golf.git
# ...or, in an existing checkout:
git submodule update --init --recursive

# The launcher/distribution repo (engine + whichever games are configured)
git clone --recurse-submodules git@github.com:TheWizardsCode/Tableau-Card-Engine.git
```

### Building a distribution

Which games a build contains is selected by a preset in `configs/`:

| Preset | Games | Use |
|---|---|---|
| `configs/core-only.json` | none (engine + Gym) | core-only build; the default |
| `configs/solo.json` | golf | minimum non-empty distribution (1 game + Gym) |
| `configs/arcade.json` | golf, main-street | partial distribution |
| `configs/deluxe.json` | feudalism, lost-cities | partial distribution (distinct game set) |
| `configs/full.json` | all eight games | full distribution (all games + Gym) |

```bash
GAMES_CONFIG=full npm run build            # web build (dist/)
GAMES_CONFIG=full npm run build:electron   # desktop build
GAMES_CONFIG=full npm run package          # packaged desktop binary
```

A game is resolved **locally first** (`example-games/<id>/`, the flat layout
used by the launcher checkout) and then **as a sibling repo** — first at the
Option C `src/` layout (`../tce-<id>/src/…`) and then at the legacy sibling
layout (`../tce-<id>/example-games/<id>/…`), so one preset set works in both. A
missing game fails the build with a message naming it and listing every
candidate path.

### Per-game development loop

Each game repo is a minimal TCE distribution with exactly one game. A freshly
extracted game checkout has no root project files; generate them with
`scripts/game-repo-scaffold.ts` (which composes the sibling core checkout and
the shared assets):

```bash
# from the core repo, next to an extracted tce-golf checkout
tsx scripts/game-repo-scaffold.ts \
  --game golf --game-repo-root ../tce-golf \
  --core-root ../tableau-card-engine-core

cd tce-golf
npm install
npm run dev                               # HMR dev server
npm run build                             # production build
npm run build:electron                    # desktop build
```

The game source lives at repo-root `src/` (the extraction renames
`example-games/<game>/` -> `src/`), and engine imports
(`@core-engine/*`, `@card-system/*`, `@rule-engine/*`, `@ui/*`, `@ai/*`,
`@balance-cards/*`, `@core-scripts/*`, `@core-tests/*`, `@core-gym/*`) resolve
into the game's `./core` submodule via `CORE_ROOT`. There is no `src` symlink:
the aliases replace the F4 compatibility symlinks. See the
[layout decision record](docs/dev/per-game-src-layout-decision.md).

### Repository layout (this checkout)

```
tableau-card-engine/
├── src/                   Engine modules (core-engine, card-system, rule-engine, ui, ai, balance-cards)
├── example-games/         Example games; gym stays in core, the rest move to their own repos
├── configs/               Build presets (core-only, solo, arcade, deluxe, full)
├── scripts/               Core tooling (build/test runners, extraction, game discovery)
├── electron/              Desktop launcher (Electron main process, preload, content locator)
├── public/assets/         Shared assets (canonical deck, default SFX); game assets move with their game
├── tests/                 Vitest test files (core + Gym suites)
├── docs/                  Developer documentation
├── AGENTS.md              Project guidance and Worklog rules
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html             Single entry point for Vite
└── .gitignore
```

### Shared HUD Components

The engine provides a reusable HUD component library under `src/ui/` that
standardises overlay, sidebar, and button UI across all example games.
Components include HelpPanel, SettingsPanel, OverlayManager, Parameterized
Overlay, GymButtonBar (reusable button bar with left/center/right zones
and automatic row wrapping), CardGameScene base class with
initHelpPanel/initSettingsPanel helpers, and depth conventions for
consistent layering.

See [Shared HUD Components](docs/DEVELOPER.md#shared-hud-components) in the
Developer Guide for full documentation and usage examples.

## Technology Stack

| Tool | Purpose |
|------|---------|
| [Phaser 4 RC](https://phaser.io/) (4.0.0-rc.7) | HTML5 game framework -- rendering, input, tweens, scenes |
| [TypeScript](https://www.typescriptlang.org/) (strict, ES2020) | Static typing and early error detection |
| [Vite](https://vitejs.dev/) | Dev server with HMR and optimized production builds |
| [Vitest](https://vitest.dev/) | Vite-native test runner with Jest-compatible API |
| [Electron](https://www.electronjs.org/) | Desktop launcher for Steam distribution (see Desktop Launcher section) |
| [electron-builder](https://www.electron.build/) | Native binary packaging (Windows NSIS primary, Linux/macOS best-effort) |

## Example Games

Each game below is its **own repository** (`tce-<game>`) that pulls the engine in
as a `./core` submodule. In the launcher checkout they are present locally under
`example-games/<game>/`; in a decomposed checkout they are siblings. The **Gym
stays in the core repo** — it is the canonical core-engine feature demonstrator.

| Game | Repo | Description |
|------|------|-------------|
| Gym (demo suite) | *(core)* `example-games/gym/` | Interactive demo scenes for every core-engine feature: deck lifecycle, hand/pile interactions, undo/redo, overlays, SLL composition, audio feedback, transcript recording, save/load |
| 9-Card Golf | `tce-golf` | Single-round 9-Card Golf (human vs. AI) with card flip animations, greedy/random AI strategies, and JSON game transcripts |
| Beleaguered Castle | `tce-beleaguered-castle` | Open solitaire with drag-and-drop, click-to-move, undo/redo, auto-move to foundations, auto-complete, win/loss detection, help panel, JSON game transcripts, and checkpoint autosave after each move with startup recovery. **Citadel variant**: a pre-game choice deals all 52 cards to the tableau (no pre-placed aces) for an extra challenge — selection persists across reloads |
| Sushi Go! | `tce-sushi-go` | Card drafting game (human vs. AI). Pick and pass hands over 3 rounds, collect sets of sushi dishes, and score the most points |
| Feudalism | `tce-feudalism` | Engine-building card game (human vs. AI). Collect gem tokens, purchase development cards for bonuses, attract nobles, and reach 15 prestige to win. Checkpoint autosaves after each turn (human + AI) with startup recovery |
| Lost Cities | `tce-lost-cities` | Two-player expedition card game (human vs. AI). Bet on up to 5 colored expeditions across a 3-round match with investment multipliers, ascending-play rules, and cumulative scoring |
| Main Street | `tce-main-street` | Single-player tableau builder. Buy businesses/upgrades/events, place businesses on a 10-slot street rendered as a responsive 2x5 grid, and optimize score — no turn limit by default (games end via score threshold, all challenges, bankruptcy, or reputation collapse; a turn limit is opt-in via an explicit `maxTurns` config). **Annual calendar**: each turn is one week of the Irish year (weeks 1–52, year wraps); seasonal and holiday event cards only appear during their real-world week windows (e.g. St Patrick's Day in late winter, Harvest Festival in autumn). **Multi-Use Card Economy**: cards can be held in hand for synergy bonuses; staff cards expand hand capacity with ongoing costs. **Action economy**: one action per week (two with a General Manager) — move-to-hand, play-from-hand, direct buy-and-place (+50% premium), and hire-staff spend the action; refresh, sell, hint, discard, upgrades, events, and end-turn are free. Market cycles each turn. Tutorial overlay zones are defined in a separate SLL layout file (`main-street-tutorial.layout.json`) composed with the base layout. Balance analysis tools are specified in the [Balance Process & Tooling PRD](docs/main-street/prd-balance-process-and-tooling.md). |
| Scenario: Tutorial | `tce-main-street` | Guided introduction to Main Street. 17-step tutorial overlays walk through buy → hand → place, invest → optimize → trigger, and scoring. Accessible from the Game Selector. |
| Coloretto | `tce-coloretto` | Set-building card game (human vs. 1-4 AI). On your turn place the top deck card on a shared row (max 3) or take an entire row into your collection. Score 3 colors positively and the rest negatively across 7/5/4/3 rounds (2/3/4/5 players) using the canonical point table (1=1, 2=3, 3=6, 4=10, 5=15, 6+=21). |

## Main Street Card Upgrade Visualization

Main Street uses a **code-based overlay rendering pipeline** to display upgrade state on Business cards without requiring separate SVG assets for each level variant.

### How it works

When a Business card is upgraded (level > 0), the renderer applies visual overlays on top of the base SVG card texture:

| Overlay | Position | Description |
|---------|----------|-------------|
| **Level badge** | Top-right | Gold bold text showing "Lvl N" (e.g., "Lvl 2") |
| **Income display** | Bottom-center | Green bold text showing combined income (baseIncome + incomeBonus), e.g., "+8" |
| **Name overlay** | Top-center | White bold text with dark semi-transparent background showing the upgraded card name (e.g., "Reader's Café" instead of "Bookshop") |
| **Upgrade border** | Card perimeter | 3px golden stroke (`#ffaa22`) for visual distinction from base cards |

### Architecture

- **`UpgradeOverlaySpec.ts`** – Pure data module (no Phaser dependencies) that defines overlay specifications (`OverlayTextSpec`, `OverlayBorderSpec`, `UpgradeOverlaySpec`) and provides `buildUpgradeOverlaySpec(biz, width, height)` to generate overlay specs from a `BusinessCard`'s current state.
- **`MainStreetRenderer.applyUpgradeOverlays()`** – Reads the overlay spec and creates Phaser text/graphics objects as children of the card's container.
- **Texture caching** – Base card SVGs are rasterized once and cached. Overlays are drawn on top at render time, avoiding expensive re-rasterization for every card state variant.

This approach was chosen for **performance** (no per-level SVG regeneration), **texture caching simplicity** (one texture per base card), and **backward compatibility** (non-upgraded cards render identically to before).

## ToneForge runtime adapter (Main Street)

Main Street can optionally route mapped SFX keys through a ToneForge-backed module via `createTfPlayer`. Run `npm run tf:generate` to emit a runtime synth module at `build/tf-synths/main-street-runtime-synth.mjs` providing on-the-fly Tone/WebAudio voices. The adapter expects module exports `factories: Record<string, () => TfVoice>` and optional `getFactory()` / `descriptors` helpers. See `docs/the-build/audio.md` for generation workflow and wiring details.

## Contributing

1. **Track work with Worklog** -- every change must be associated with a `wl` work item. See `AGENTS.md` for Worklog usage.
2. **Quality gates** -- before pushing, ensure `npm test` passes and `npm run build` succeeds.
3. **Update docs** -- if you change tooling, scripts, directory structure, or developer workflow, update `docs/DEVELOPER.md` and `AGENTS.md` in the same PR or as a child work item.
4. **Asset licensing** -- all assets must be CC0, MIT, Apache 2.0, or similarly permissive. Document attribution in `public/assets/CREDITS.md`.

For detailed development guidance, see [`docs/DEVELOPER.md`](docs/DEVELOPER.md).

## Main Street Balance Documentation

- **[Balance Process & Tooling PRD](docs/main-street/prd-balance-process-and-tooling.md)** — Comprehensive specification for game balance review process, micro/macro metrics, CLI tools, baseline management, and implementation roadmap.
- **[Balancing Methodology](docs/main-street/balancing-methodology.md)** — Technical description of the `run-balance-cards` balancing algorithm.
- **[Monte Carlo Sample Results](docs/main-street/monte-carlo-sample-results.md)** — Example output from the Monte Carlo balance simulation harness.

## AI Assisted Development

To use pi to assist with Phaser development, clone the Phaser repository into the parent directory and install it as a pi package. For example, from this repository root:

```bash
cd ..
git clone git@github.com:phaserjs/phaser.git
pi install ../phaser
```

After running these commands, pi will discover the Phaser package and any skills, prompts, or extensions it exposes. Use `/reload` or restart pi if needed.

## License

MIT
