# Tableau Card Engine (TCE)

A modular, spike-driven game engine for building single-player tableau card games with **Phaser 4 RC**, **TypeScript**, **Vite**, and **Vitest**.

**[Play Alpha Game Now](https://thewizardscode.github.io/Tableau-Card-Engine/)**

## Quick Start

```bash
npm install          # install dependencies
npm run dev          # start Vite dev server (http://localhost:3000)
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

The project is organized as a **flat monorepo** -- a single `package.json` at the root, shared engine code under `src/`, and standalone example games under `example-games/`.

**How the engine was built:** for a narrative walkthrough of the project's evolution from first commit to present day -- the spike-driven phases, the architectural decisions, and the lessons learned -- see the [video series outline](https://github.com/SorraTheOrc/open_source_llm/blob/dev/docs/video-series-outline.md) (maintained in the open_source_llm project, where the video series is produced).

## Repository Layout

```
tableau-card-engine/
├── src/                   Engine modules
│   ├── core-engine/       Game loop, state management, turn sequencing
│   ├── card-system/       Card, Deck, Pile abstractions
│   ├── rule-engine/       Rule definitions, validation, turn logic
│   └── ui/                Reusable UI components (HelpPanel, SettingsPanel, Overlay, buttons, HUD utilities)
├── example-games/         Standalone example games
│   ├── gym/               Interactive demo scene suite for core-engine features
│   ├── golf/              9-Card Golf (human vs. AI)
│   ├── beleaguered-castle/ Beleaguered Castle (open solitaire)
│   ├── sushi-go/          Sushi Go! (card drafting, human vs. AI)
│   ├── feudalism/          Feudalism (engine-building, human vs. AI)
│   ├── lost-cities/       Lost Cities (2-player expedition lanes, human vs. AI)
│   ├── main-street/       Main Street (single-player tableau builder)
│   └── coloretto/         Coloretto (set-building rows, human vs. 1-4 AI)
├── electron/             Desktop launcher (Electron main process, preload, content locator)
├── public/assets/         Static assets (cards, fonts, images)
│   └── cards/             52 standard card SVGs + card back + game-specific cards (140x190px)
├── tests/                 Vitest test files
├── docs/                  Developer documentation
│   ├── DEVELOPER.md       Detailed developer guide
│   ├── core-engine/       Engine API notes (including spatial rules)
│   └── rule-engine/       Rule engine API docs (including economy ledger)
├── dist/                  Production build output (gitignored)
├── dist-electron/         Compiled Electron main process output (gitignored)
├── release/               Packaged binaries (gitignored; electron-builder output)
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

| Game | Location | Description |
|------|----------|-------------|
| Gym (demo suite) | `example-games/gym/` | Interactive demo scenes for every core-engine feature: deck lifecycle, hand/pile interactions, undo/redo, overlays, SLL composition, audio feedback, transcript recording, save/load |
| 9-Card Golf | `example-games/golf/` | Single-round 9-Card Golf (human vs. AI) with card flip animations, greedy/random AI strategies, and JSON game transcripts |
| Beleaguered Castle | `example-games/beleaguered-castle/` | Open solitaire with drag-and-drop, click-to-move, undo/redo, auto-move to foundations, auto-complete, win/loss detection, help panel, JSON game transcripts, and checkpoint autosave after each move with startup recovery. **Citadel variant**: a pre-game choice deals all 52 cards to the tableau (no pre-placed aces) for an extra challenge — selection persists across reloads |
| Sushi Go! | `example-games/sushi-go/` | Card drafting game (human vs. AI). Pick and pass hands over 3 rounds, collect sets of sushi dishes, and score the most points |
| Feudalism | `example-games/feudalism/` | Engine-building card game (human vs. AI). Collect gem tokens, purchase development cards for bonuses, attract nobles, and reach 15 prestige to win. Checkpoint autosaves after each turn (human + AI) with startup recovery |
| Lost Cities | `example-games/lost-cities/` | Two-player expedition card game (human vs. AI). Bet on up to 5 colored expeditions across a 3-round match with investment multipliers, ascending-play rules, and cumulative scoring |
| Main Street | `example-games/main-street/` | Single-player tableau builder. Buy businesses/upgrades/events, place businesses on a 10-slot street rendered as a responsive 2x5 grid, and optimize score — no turn limit by default (games end via score threshold, all challenges, bankruptcy, or reputation collapse; a turn limit is opt-in via an explicit `maxTurns` config). **Multi-Use Card Economy**: cards can be held in hand for synergy bonuses; staff cards expand hand capacity with ongoing costs. **Action economy**: one action per day (two with a General Manager) — move-to-hand, play-from-hand, direct buy-and-place (+50% premium), and hire-staff spend the action; refresh, sell, hint, discard, upgrades, events, and end-turn are free. Market cycles each turn. Tutorial overlay zones are defined in a separate SLL layout file (`main-street-tutorial.layout.json`) composed with the base layout. Balance analysis tools are specified in the [Balance Process & Tooling PRD](docs/main-street/prd-balance-process-and-tooling.md). |
| Scenario: Tutorial | `example-games/main-street/scenes/MainStreetTutorialScene.ts` | Guided introduction to Main Street. 17-step tutorial overlays walk through buy → hand → place, invest → optimize → trigger, and scoring. Accessible from the Game Selector. |
| Coloretto | `example-games/coloretto/` | Set-building card game (human vs. 1-4 AI). On your turn place the top deck card on a shared row (max 3) or take an entire row into your collection. Score 3 colors positively and the rest negatively across 7/5/4/3 rounds (2/3/4/5 players) using the canonical point table (1=1, 2=3, 3=6, 4=10, 5=15, 6+=21). |

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
