# Developer Guide

This document covers everything you need to develop, test, and build the Tableau Card Engine (TCE) project. For a high-level overview, see the [README](../README.md).

## Table of Contents

- [Environment Setup](#environment-setup)
- [Running Locally](#running-locally)
- [Building for Production](#building-for-production)
- [Testing](#testing)
- [ToneForge Audio Generation](#toneforge-audio-generation)
- [Project Structure](#project-structure)
- [Path Aliases](#path-aliases)
- [Adding an Example Game](#adding-an-example-game)
- [Example Games](#example-games)
- [Transcript Persistence](#transcript-persistence)
- [Replay Tool](#replay-tool)
- [Managing Assets](#managing-assets)
- [SVG Rendering & Migration](#svg-rendering--migration)
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

**Note:** The Phaser library produces a ~2.0 MB chunk with the current Phaser 4 RC bundle. This is expected and can be addressed with code-splitting when needed.

## Deployment / Release

See [RELEASE.md](../RELEASE.md) for the full release workflow, checklist, and verification steps. The CI workflow is `.github/workflows/deploy.yml`.

## Testing

```bash
npm test            # run all tests once (unit + browser, no tracked-asset restore step)
npm run monte-carlo # run Main Street Monte Carlo harness (JSON + CSV outputs)
npm run tf:generate # generate tf audio artifacts (out-of-repo build/tf-synths)
```

`npm test` is intentionally non-destructive and must not mutate tracked source assets such as `public/assets/games/main-street/svg/cards`. If asset regeneration is needed, run the dedicated generation scripts explicitly.

### Monte Carlo environment variables

The Main Street balance guardrail (`tests/main-street/monte-carlo-balance.test.ts`) and harness
script (`scripts/monte-carlo.ts`) are configurable via environment variables so that PR CI runs
quickly while the main branch retains full, strict checks:

| Variable | Default | PR value | Main value | Description |
|---|---|---|---|---|
| `MONTE_SEEDS` | 20 | 20 | 200 | Number of deterministic seeds to simulate |
| `MONTE_MIN_WIN_RATE` | 0.20 | 0.20 | 0.30 | Minimum acceptable win rate |
| `MONTE_MAX_WIN_RATE` | 0.80 | 0.80 | 0.60 | Maximum acceptable win rate |

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
MONTE_SEEDS=200 MONTE_MIN_WIN_RATE=0.20 MONTE_MAX_WIN_RATE=0.80 npm test
```

Tests use [Vitest](https://vitest.dev/) configured inline in `vite.config.ts` with two test projects:

| Project | Environment | File Pattern | Purpose |
|---------|-------------|-------------|---------|
| `unit` | Node.js | `tests/**/*.test.ts` | Logic, data, and integration tests |
| `browser` | Chromium (Playwright) | `tests/**/*.browser.test.ts` | Phaser UI and rendering tests |

Both projects run together via `npm test`. The browser project runs in headless Chromium using `@vitest/browser` with the Playwright provider.

During Vitest runs, the dev-only transcript persistence middleware (`POST /api/transcripts`) is intentionally disabled even though Vitest browser mode uses an internal Vite server. This prevents file-system side effects and reduces harness noise/flakiness during test execution.

### Writing unit tests

- Place test files in `tests/` following the `*.test.ts` pattern
- Import from `vitest` directly: `import { describe, it, expect } from 'vitest'`
- Vitest globals are enabled -- `describe`, `it`, `expect` are available without imports in test files

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

**Browser test dependencies:**

- `@vitest/browser` (matches vitest version)
- `playwright` (provides Chromium browser)
- Install Chromium: `npx playwright install chromium`

## ToneForge Audio Generation

ToneForge-generated synth artifacts are integrated via a thin adapter and are **not committed** to source control.

```bash
npm run tf:generate
```

This runs `scripts/tf-generate-synths.sh` and writes generated outputs under `build/tf-synths/`, including a runtime synth module (`main-street-runtime-synth.mjs`) used for on-the-fly synthesis.

See `docs/the-build/audio.md` for full details (module shape, mapping, runtime wiring, CI guidance).

## Project Structure

```
src/
├── core-engine/            Game loop, state management, turn sequencing, utilities
│   ├── GameState.ts        GameState<T>, createGameState (deprecated for setup — use SetupOptions)
│   ├── SetupOptions.ts     BaseSetupOptions, MultiplayerSetupOptions, resolveSetupOptions
│   ├── SeededRng.ts        createSeededRng — deterministic PRNG (LCG) for shuffles and AI
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
│       ├── GymHandPileScene.ts  Hand/pile interaction demo (bottom-anchored hand arc + live radius slider)
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
│   ├── AiStrategy.ts           AI strategies (RandomStrategy, GreedyStrategy)
│   ├── GameTranscript.ts       Transcript recording (TranscriptRecorder)
│   └── scenes/
│       └── GolfScene.ts        Phaser scene (full visual interface)
├── beleaguered-castle/
│   ├── main.ts                         Game entry point
│   ├── createBeleagueredCastleGame.ts   Factory function (used by main.ts)
│   ├── BeleagueredCastleState.ts        State types, move types, constants
│   ├── BeleagueredCastleRules.ts        Pure game logic (deal, moves, win/loss)
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
├── the-mind/
    ├── MindCards.ts                Card types and deck creation
    ├── MindGame.ts                 Game orchestration (levels, lives, card play, penalties)
    ├── AiStrategy.ts               AI strategies (timing-based play decisions)
    ├── GameTranscript.ts           Transcript types and MindTranscriptRecorder (event-based)
    ├── headlessGame.ts             Headless AI-vs-AI runner for fixture generation
    ├── help-content.json           Help panel content
    └── scenes/
        └── TheMindScene.ts         Phaser scene (real-time card play interface)

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
    ├── TheMindReplayAdapter.ts
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
│   ├── the-mind/thumbnail.png
│   ├── sushi-go/thumbnail.png
│   └── feudalism/thumbnail.png
└── CREDITS.md              Asset attribution

tests/
├── smoke.test.ts           Toolchain smoke test
├── fixtures/transcripts/   Fixture transcripts for replay tests (one per game)
├── ai/                     AiPlayer, pickRandom, pickBest, barrel export tests
├── card-system/            Card, Deck, Pile unit tests
├── core-engine/            GameState, TurnSequencer, UndoRedoManager, SeededRng, TranscriptRecorder unit tests
├── golf/                   Golf game unit + integration + browser tests
├── beleaguered-castle/     Beleaguered Castle unit + integration tests
├── sushi-go/               Sushi Go! cards, scoring, game, AI tests
├── feudalism/               Feudalism cards, game, AI tests
├── the-mind/               The Mind cards, game state, AI, transcript, auto-play, integration tests
├── lost-cities/            Lost Cities cards, scoring, rules, game, AI, transcript tests
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
| Beleaguered Castle | `example-games/beleaguered-castle/` | Single-player solitaire, UndoRedoManager (Command pattern), drag-and-drop + click-to-move, auto-move heuristics, auto-complete, win/loss detection, HelpPanel component | `tests/beleaguered-castle/` (2 files) |
| Sushi Go! | `example-games/sushi-go/` | Card drafting (pick-and-pass hands), custom card types with set-collection scoring, multi-round match, procedural card-back textures | `tests/sushi-go/` (4 files) |
| Feudalism | `example-games/feudalism/` | Resource management (gem tokens), tiered development cards with costs/bonuses, noble attraction, multi-action turns (take/reserve/purchase) | `tests/feudalism/` (3 files) |
| Lost Cities | `example-games/lost-cities/` | Two-player expeditions, two-phase turn model (play/discard then draw), ascending-play rules, investment multipliers (x2/x3/x4), multi-round match scoring, procedurally generated SVG card assets | `tests/lost-cities/` (6 files) |
| The Mind | `example-games/the-mind/` | Cooperative real-time game, event-based transcript, timing-based AI, level progression (1-100 cards, 8 levels), headless AI-vs-AI runner for fixture generation | `tests/the-mind/` (7 files) |
| Main Street | `example-games/main-street/` | Single-player tableau builder, responsive 2x5 grid layout, SLL integration, ToneForge audio adapter, Monte Carlo balance testing, tutorial scene | `tests/main-street/` |

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
| The Mind | `tests/fixtures/transcripts/the-mind/fixture-game.json` |
| Sushi Go | `tests/fixtures/transcripts/sushi-go/fixture-game.json` |
| Feudalism | `tests/fixtures/transcripts/feudalism/fixture-game.json` |
| Main Street | `tests/fixtures/transcripts/main-street/fixture-game.json` |

These are generated by game-specific fixture generator scripts (e.g. `scripts/generate-golf-fixture-transcript.ts`) that run deterministic AI-vs-AI games using a fixed seed.

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

### How It Works

1. The replay tool parses the transcript and resolves a `ReplayAdapter` from the adapter registry (`scripts/adapters/index.ts`)
2. It launches a headless Chromium browser via Playwright and navigates to the game with `?mode=replay&game=<game-type>`
3. For each turn in the transcript, it calls `adapter._injectBoardState()` which uses `page.evaluate()` to call the scene's `loadBoardState(stateJson)` method
4. The scene reconstructs visual state from the snapshot and emits a `state-settled` event when rendering is complete
5. The tool captures a screenshot of the canvas after each `state-settled` event

### Replay Adapters

Each game has a `ReplayAdapter` implementation in `scripts/adapters/` that bridges the replay tool to the game's scene:

| Game | Adapter | Game Type |
|------|---------|-----------|
| Beleaguered Castle | `BeleagueredCastleReplayAdapter` | `beleaguered-castle` |
| Lost Cities | `LostCitiesReplayAdapter` | `lost-cities` |
| The Mind | `TheMindReplayAdapter` | `the-mind` |
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

The script processes all supported games (`golf`, `beleaguered-castle`, `lost-cities`, `sushi-go`, `feudalism`, `the-mind`, `main-street`). For each game it runs the replay tool to capture screenshots, then invokes the thumbnail generator. Games that lack a fixture transcript or replay adapter are skipped with a warning (not a failure). The `gym` is excluded -- it has no replay transcript. A summary table is printed at the end showing which games were refreshed and which were skipped. The script exits non-zero if any supported game fails during replay or thumbnail generation.

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

### The Mind migration (CG-0MP12H40Q003Y7OU)

The Mind was the first example game migrated from `scene.load.svg` to SvgHelpers lazy rasterisation. Key changes:

- **MindCardRenderer.ts**: `preloadMindCardAssets` is now registration-only in browser runtimes (calls `markSceneValid(scene)`); it does NOT eagerly rasterise SVGs. The Node/test preload path still populates the `svgTextCache` for headless access.
- **MindCardTextureAdapter.ts**: New module providing a stable, DPR-aware API for callers. Use `resolveTemplateId()`, `getCanonicalTextureKey()`, and `ensureTexture()` instead of legacy template IDs when setting sprite textures.
- **Scene callers**: `MindRenderer`, `MindAnimator`, and `MindReplayController` now import from `MindCardTextureAdapter` instead of using `CARD_BACK_KEY` or `getMindCardTexture` directly.
- **Texture keys**: Lazy rasterisation via `SvgHelpers.getOrCreateTexture` produces DPR-aware keys (e.g. `ms_card_mind-42_48x65@2`). The legacy template IDs (`mind-42`, `mind-back`) are still returned by `getMindCardTexture()` and `mindCardTextureKey()` but should not be used for sprite texture lookups.
- **Tests**: Unit and integration tests updated to assert DPR-aware key format. A headless integration smoke test (`tests/the-mind/headless.test.ts`) verifies the full preload → ensure → key resolution pipeline.

**Pattern for migrating other games:**
1. Create a texture adapter module with `resolveTemplateId()`, `getCanonicalTextureKey()`, and `ensureTexture()` wrappers.
2. Replace `this.load.svg(...)` with `markSceneValid(this)` in preload; populate SVG text cache via `this.load.text(...)` or module-level cache for Node.
3. Replace direct texture key strings with adapter calls in scene code.
4. Update tests to assert DPR-aware key format and add headless integration checks.

### Lost Cities migration (CG-0MOZN33JW004XILY)

Lost Cities was the third example game migrated from `scene.load.svg` to SvgHelpers lazy rasterisation, following the pattern established by The Mind. Key changes:

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
| The Mind | `example-games/the-mind/layouts/the-mind.layout.json` | `example-games/the-mind/scenes/MindLayoutAdapter.ts` |
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

#### The Mind adapter (`src/ui/Renderer/adapters/MindAdapter.ts`)

Re-exports `createHudContainer` and `renderCardSvg`. Provides `createMindHudText` (centred origin, game depth) and `mindRenderCardSvg` (pre-configured with The Mind's card dimensions):

```typescript
import {
  createMindHudText,
  mindRenderCardSvg,
  createHudContainer,
} from '@ui/Renderer/adapters/MindAdapter';

const hud = createHudContainer(this);
const levelText = createMindHudText(this, 640, 20, 'Level 3', '#ffcc44', { fontSize: '20px' });
hud.add(levelText);

mindRenderCardSvg(this, cardContainer, 'mind-42');
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
| `example-games/the-mind/scenes/TheMindScene.ts` | Inline HUD container creation | `@ui/Renderer` | `createHudContainer` |
| `example-games/the-mind/scenes/TheMindScene.ts` | Inline HUD text styling | `@ui/Renderer` | `createHudText` |
| `example-games/the-mind/scenes/MindRenderer.ts` | `createMindHudText` (local) | `@ui/Renderer/adapters/MindAdapter` | `createMindHudText` |

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
| `14fa97f` | CG-0MPOLHCB400363VZ | The Mind adapter and migration |
| `7192f1f` | CG-0MPOLHCB400363VZ | Migrate MindRenderer to use shared `applyEnsuredTexture` |
| `f173bfd` | CG-0MPOLHCBV005SD2L | Migration documentation in DEVELOPER.md |

### Related work items

- **Shared Renderer** (CG-0MP12VWO1003YL55) — parent epic
- **Shared Renderer API scaffold and core helpers** (CG-0MPOLH2U9001P7BC)
- **Card rendering SVG wrapper helper** (CG-0MPOLHCAN004D753)
- **Main Street adapter and migration** (CG-0MPOLHCAN0037UUS)
- **The Mind adapter and migration** (CG-0MPOLHCB400363VZ)
- **Unit test specification for shared Renderer helpers** (CG-0MPOLGVTH009NSTM)
- **Browser integration smoke tests for Main Street and The Mind** (CG-0MPOLGZ70000Q9J1)

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
    }
    // ... game-specific setup ...
  }

  shutdown(): void {
    this.shutdownBase();
  }
}
```

The `initHelpPanel()` method creates both `HelpPanel` and `HelpButton`. The `initSettingsPanel()` method creates both `SettingsPanel` and `SettingsButton`. These are accessed via `this.helpPanel`, `this.helpButton`, `this.settingsPanel`, and `this.settingsButton` respectively.

### HUD Container Pattern

Games that need to separate persistent overlay elements (help/settings buttons, panel input blockers) from transient HUD elements (score text, status bars) should use a two-container pattern:

1. **`hudOverlayContainer`** – Persistent container for help/settings buttons and panel input blockers. Not rebuilt during HUD refresh cycles.
2. **`hudContainer`** – Transient container for HUD text and elements that need to be rebuilt each refresh. Children should be tagged with `_hudTransient: true`.

If no `hudOverlayContainer` exists on the scene, the HelpPanel and SettingsPanel will fall back to `hudContainer`, and if neither exists, they use standard depth layering.

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

## Troubleshooting

**Vite dev server won't start:**
- Check port 3000 is not already in use: `lsof -i :3000`
- Try `npm run dev -- --port 3001` for an alternate port

**TypeScript errors on build:**
- Run `npx tsc --noEmit` to see detailed errors
- Check that path aliases match between `tsconfig.json` and `vite.config.ts`

**Tests fail to find modules:**
- Ensure Vitest config in `vite.config.ts` includes the `test.projects` block
- Verify unit test files match `tests/**/*.test.ts`
- Verify browser test files match `tests/**/*.browser.test.ts`

**Browser tests fail or time out:**
- Ensure Playwright's Chromium is installed: `npx playwright install chromium`
- Check that `@vitest/browser` version matches `vitest` version
- Browser tests boot a real Phaser game and may take 8-10 seconds each
- If tests hang, check for unresolved game instances (ensure `afterEach` destroys the game)

**Large bundle warning:**
- The Phaser library is ~1.4 MB minified -- this is expected
- Code-splitting can be added later via `build.rollupOptions.output.manualChunks` in `vite.config.ts`
