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
- [Transcript Persistence](#transcript-persistence)
- [Replay Tool](#replay-tool)
- [Managing Assets](#managing-assets)
- [SVG Rendering & Migration](#svg-rendering--migration)
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

Release and deployment instructions have moved to RELEASE.md at the repository root. See RELEASE.md for the full release workflow, checklist, and verification steps. The CI workflow that performs releases is .github/workflows/deploy.yml.


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
│   └── scenes/
│       ├── GymRouterScene.ts    Landing page with navigation cards
│       ├── GymSceneBase.ts      Shared base class for all Gym scenes
│       ├── GymDeckRngScene.ts   Deck lifecycle & seeded RNG demo
│       ├── GymHandPileScene.ts  Hand/pile interaction demo
│       ├── GymOverlayUiScene.ts Overlay & UI configuration demo
│       ├── GymUndoRedoScene.ts  Undo/redo workflow demo
│       ├── GymTranscriptScene.ts Transcript recording demo
│       ├── GymSaveLoadScene.ts  Save/load state demo
│       └── GymAudioFeedbackScene.ts Audio & feedback configuration demo
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

## 9-Card Golf

The Golf game is the first full spike built on the engine. It demonstrates:

- **Card system**: Card, Deck, and Pile abstractions from `src/card-system/`
- **Core engine**: GameState and TurnSequencer from `src/core-engine/`
- **Game rules**: Golf-specific scoring (A=1, 2=-2, 3-10=face, J/Q=10, K=0, column-of-three=0), turn legality, and round-end detection
- **AI strategies**: RandomStrategy (uniform random legal moves) and GreedyStrategy (minimizes total score)
- **Transcript recording**: JSON game transcripts capturing all turns, board states, and results
- **Phaser UI**: Full visual interface with 3x3 grids, draw/discard piles, card flip animations, score display, and end-of-round screen

### Running the Golf game

```bash
npm run dev
```

Open `http://localhost:3000` and click the **9-Card Golf** card on the game selector page. Click the stock or discard pile to draw, click a grid card to swap, or click the discard pile after drawing to discard and flip a face-down card. Use the `[ Menu ]` button in the top-left to return to the game selector.

### Golf game files

| File | Purpose |
|------|---------|
| `example-games/golf/main.ts` | Phaser game config entry point |
| `example-games/golf/createGolfGame.ts` | Factory function to create a Golf game instance |
| `example-games/golf/GolfGrid.ts` | 3x3 grid type and utilities |
| `example-games/golf/GolfRules.ts` | Turn legality, move application, round-end detection |
| `example-games/golf/GolfScoring.ts` | Scoring rules (card values, column matching) |
| `example-games/golf/GolfGame.ts` | Game orchestration (setup, turn execution, move enumeration) |
| `example-games/golf/AiStrategy.ts` | AI strategies and AiPlayer wrapper |
| `example-games/golf/GameTranscript.ts` | Transcript types and TranscriptRecorder |
| `example-games/golf/scenes/GolfScene.ts` | Phaser scene (visual interface) |

### Golf game tests

Tests are in `tests/golf/`:

| File | Tests |
|------|-------|
| `GolfGrid.test.ts` | Grid creation, indexing, face-up counting |
| `GolfRules.test.ts` | Turn legality, move application, round-end detection |
| `GolfScoring.test.ts` | Card values, grid scoring, column matching |
| `GolfGame.test.ts` | Game setup, legal move enumeration, turn execution |
| `AiStrategy.test.ts` | RandomStrategy, GreedyStrategy, AiPlayer |
| `GameTranscript.test.ts` | Transcript recording, snapshots, finalization |
| `Integration.test.ts` | Full AI-vs-AI games, transcript validation, game invariants |
| `GolfScene.browser.test.ts` | Phaser UI rendering, canvas, game objects, interactions (browser) |

## Beleaguered Castle

Beleaguered Castle is the second full spike. It is a single-player open solitaire game demonstrating:

- **Single-player support**: Core engine's `createGameState()` accepts 1 player (deprecated for setup — use `resolveSetupOptions()` or `resolveBaseSetupOptions()` from `SetupOptions.ts` instead)
- **Undo/Redo**: Reusable `UndoRedoManager` in `src/core-engine/` with Command pattern and compound commands
- **Drag-and-drop**: Phaser drag events with drop zone highlighting and snap-back animation
- **Click-to-move**: Select a card then click a destination; co-exists with drag-and-drop
- **Auto-move to foundations**: Safe-move heuristic automatically plays cards to foundations when no tableau column needs them
- **Auto-complete**: Detects trivially winnable states and plays all remaining moves to completion
- **Win/loss detection**: Recognises when all 52 cards are on foundations (win) or no legal moves remain (loss)
- **Game transcript**: JSON transcript recording compatible with the Visual Replay Dev Tool
- **Help panel**: In-game rules and keyboard shortcut reference using the reusable HelpPanel/HelpButton components

### Running Beleaguered Castle

```bash
npm run dev
```

Open `http://localhost:3000` and click the **Beleaguered Castle** card on the game selector page. Use the `[ Menu ]` button in the top-left to return to the game selector.

### Beleaguered Castle game files

| File | Purpose |
|------|---------|
| `example-games/beleaguered-castle/main.ts` | Phaser game config entry point |
| `example-games/beleaguered-castle/createBeleagueredCastleGame.ts` | Factory function to create a BC game instance |
| `example-games/beleaguered-castle/BeleagueredCastleState.ts` | State types, move types, constants (FOUNDATION_COUNT, TABLEAU_COUNT, etc.) |
| `example-games/beleaguered-castle/BeleagueredCastleRules.ts` | Pure game logic: deal, applyMove, undoMove, getLegalMoves, isWon, hasNoMoves, findSafeAutoMoves, isTriviallyWinnable, getAutoCompleteMoves |
| `example-games/beleaguered-castle/GameTranscript.ts` | Transcript types and BCTranscriptRecorder |
| `example-games/beleaguered-castle/help-content.json` | Help panel content (8 sections: overview, setup, foundations, tableau, winning/losing, controls, keyboard shortcuts, tips) |
| `example-games/beleaguered-castle/scenes/BeleagueredCastleScene.ts` | Phaser scene with drag-and-drop, click-to-move, undo/redo, auto-move, auto-complete, win/loss overlays, help panel, and transcript recording |

### Beleaguered Castle tests

Tests are in `tests/beleaguered-castle/`:

| File | Tests |
|------|-------|
| `BeleagueredCastleRules.test.ts` | Deal correctness, move legality, foundation builds, win/loss detection, undo, auto-move heuristics, auto-complete (70 tests) |
| `Integration.test.ts` | Full greedy game play across seeds, game invariants, undo/redo across moves, transcript recording and validation, auto-complete verification, snapshot utilities (30 tests) |

## Sushi Go!

Sushi Go! is a card drafting game demonstrating:

- **Card drafting**: Pick one card from a hand, pass the rest, repeat until hands are exhausted
- **Custom card types**: Non-standard cards representing sushi dishes (Tempura, Sashimi, Maki Rolls, Nigiri, Wasabi, Dumplings, Pudding, Chopsticks)
- **Multi-round match**: 3-round game with inter-round scoring and Pudding scored only at game end
- **Set-collection scoring**: Different scoring functions per card type
- **AI strategies**: Random (valid picks) and Greedy (highest-value pick)

### Running Sushi Go!

```bash
npm run dev
```

Open `http://localhost:3000` and click the **Sushi Go!** card on the game selector page.

### Sushi Go! game files

| File | Purpose |
|------|---------|
| `example-games/sushi-go/main.ts` | Phaser game config entry point |
| `example-games/sushi-go/createSushiGoGame.ts` | Factory function for tests |
| `example-games/sushi-go/SushiGoCards.ts` | Card types, deck creation, procedural card-back textures |
| `example-games/sushi-go/SushiGoGame.ts` | Game orchestration (drafting rounds, hand passing, scoring) |
| `example-games/sushi-go/SushiGoScoring.ts` | Set-collection scoring rules per card type |
| `example-games/sushi-go/AiStrategy.ts` | AI strategies (RandomStrategy, GreedyStrategy) |
| `example-games/sushi-go/GameTranscript.ts` | Transcript types and SushiGoTranscriptRecorder |
| `example-games/sushi-go/help-content.json` | Help panel content |
| `example-games/sushi-go/scenes/SushiGoScene.ts` | Phaser scene (drafting interface) |

### Sushi Go! tests

Tests are in `tests/sushi-go/`:

| File | Tests |
|------|-------|
| `SushiGoCards.test.ts` | Card types, deck creation, card counts (19 tests) |
| `SushiGoScoring.test.ts` | All card type scoring rules (56 tests) |
| `SushiGoGame.test.ts` | Game setup, drafting, round progression (21 tests) |
| `AiStrategy.test.ts` | Random and Greedy strategy validation (15 tests) |

## Feudalism

Feudalism is an engine-building card game demonstrating:

- **Resource management**: Collect gem tokens to purchase development cards
- **Custom card types**: Development cards with costs, gem bonuses, and prestige points across 3 tiers
- **Noble attraction**: Automatically attract noble tiles when development card bonuses meet thresholds
- **Multi-action turns**: Take gems, reserve cards, or purchase developments
- **AI strategies**: Random (valid actions) and Greedy (prioritizes purchases and high-value cards)

### Running Feudalism

```bash
npm run dev
```

Open `http://localhost:3000` and click the **Feudalism** card on the game selector page.

### Feudalism game files

| File | Purpose |
|------|---------|
| `example-games/feudalism/main.ts` | Phaser game config entry point |
| `example-games/feudalism/createFeudalismGame.ts` | Factory function for tests |
| `example-games/feudalism/FeudalismCards.ts` | Development cards, nobles, gem types, tier data |
| `example-games/feudalism/FeudalismGame.ts` | Game orchestration (token collection, purchases, nobles, win detection) |
| `example-games/feudalism/AiStrategy.ts` | AI strategies (RandomStrategy, GreedyStrategy) |
| `example-games/feudalism/GameTranscript.ts` | Transcript types and FeudalismTranscriptRecorder |
| `example-games/feudalism/help-content.json` | Help panel content |
| `example-games/feudalism/scenes/FeudalismScene.ts` | Phaser scene (gem market, card tiers, token UI) |

### Feudalism tests

Tests are in `tests/feudalism/`:

| File | Tests |
|------|-------|
| `FeudalismCards.test.ts` | Card data, noble data, gem types (50 tests) |
| `FeudalismGame.test.ts` | Game setup, turn execution, win detection, noble attraction (55 tests) |
| `AiStrategy.test.ts` | Random and Greedy strategy validation (14 tests) |

## Lost Cities

Lost Cities is a two-player expedition card game demonstrating:

- **Custom card types**: 60 cards across 5 expedition colors (yellow, blue, white, green, red) with investment cards and ranks 2-10
- **Custom SVG assets**: 61 procedurally generated SVG card images (60 cards + card back) at 140x190px
- **Two-phase turn model**: Each turn consists of a play/discard phase followed by a draw phase
- **Ascending-play rules**: Cards must be played in ascending order on expedition lanes; investment cards must be played before any numbered cards
- **Multi-round match**: 3-round match with cumulative scoring across rounds
- **Investment multipliers**: 1/2/3 investment cards multiply expedition score by x2/x3/x4
- **AI strategies**: Random (valid moves) and Greedy (discard-aware, avoids giving opponent useful cards)
- **Transcript recording**: Multi-round JSON transcripts capturing all actions and board states

### Running Lost Cities

```bash
npm run dev
```

Open `http://localhost:3000` and click the **Lost Cities** card on the game selector page. Select a card from your hand, then click an expedition lane to play or a discard pile to discard. Draw from the draw pile or a discard pile to complete your turn. The AI opponent plays automatically between your turns.

### Lost Cities game files

| File | Purpose |
|------|---------|
| `example-games/lost-cities/LostCitiesCards.ts` | Card types, deck factory, expedition colors, card helpers |
| `example-games/lost-cities/LostCitiesRules.ts` | Two-phase turn model, ascending-play validation, legality checks |
| `example-games/lost-cities/LostCitiesScoring.ts` | Expedition scoring (-20 base, card values, investment multiplier, 8-card bonus) |
| `example-games/lost-cities/LostCitiesGame.ts` | Match manager (3-round session, executeAction, visible state, match lifecycle) |
| `example-games/lost-cities/AiStrategy.ts` | AI strategies (RandomStrategy, GreedyStrategy, LostCitiesAiPlayer wrapper) |
| `example-games/lost-cities/GameTranscript.ts` | Transcript recording (LCTranscriptRecorder, multi-round structure) |
| `example-games/lost-cities/help-content.json` | Help panel content (8 sections: overview, scoring, controls, strategy tips) |
| `example-games/lost-cities/scenes/LostCitiesScene.ts` | Phaser scene (interactive play with two-phase turns, animations, overlays) |
| `example-games/lost-cities/scenes/LostCitiesMockScene.ts` | Static layout mockup (development aid) |

### Lost Cities card assets

The 61 SVG card images are generated by `scripts/generate-lost-cities-cards.ts`:

```bash
npx tsx scripts/generate-lost-cities-cards.ts
```

Assets are output to `public/assets/cards/lost-cities/` and documented in `public/assets/CREDITS.md`.

### Lost Cities tests

Tests are in `tests/lost-cities/`:

| File | Tests |
|------|-------|
| `lost-cities-cards.test.ts` | Card types, deck factory, helpers, uniqueness (44 tests) |
| `lost-cities-scoring.test.ts` | Expedition scoring, round scoring, match scoring (26 tests) |
| `lost-cities-rules.test.ts` | Turn phases, legality checks, legal action enumeration (32 tests) |
| `lost-cities-game.test.ts` | Session setup, executeAction, round/match lifecycle (40 tests) |
| `lost-cities-ai.test.ts` | Random and Greedy strategies, AI player wrapper (22 tests) |
| `lost-cities-transcript.test.ts` | Transcript recording, full AI-vs-AI match validation (21 tests) |

## The Mind

The Mind is a cooperative real-time card game demonstrating:

- **Real-time gameplay**: Players play numbered cards (1-100) onto a shared ascending pile without communicating
- **Event-based transcript**: Unlike turn-based games, The Mind records real-time events (card plays, penalties, level completions) rather than discrete turns
- **Cooperative AI**: AI players use timing-based strategies to decide when to play cards
- **Level progression**: Survive 8 levels with increasing card counts per player
- **Headless runner**: `headlessGame.ts` enables AI-vs-AI games without Phaser for fixture generation

### Running The Mind

```bash
npm run dev
```

Open `http://localhost:3000` and click the **The Mind** card on the game selector page. Click your cards to play them onto the shared pile. The AI partner plays automatically based on timing. Survive all 8 levels to win.

### The Mind game files

| File | Purpose |
|------|---------|
| `example-games/the-mind/main.ts` | Phaser game config entry point |
| `example-games/the-mind/createTheMindGame.ts` | Factory function for tests |
| `example-games/the-mind/MindCards.ts` | Card types and deck creation |
| `example-games/the-mind/MindGame.ts` | Game orchestration (levels, lives, card play, penalties) |
| `example-games/the-mind/AiStrategy.ts` | AI strategies (timing-based play decisions) |
| `example-games/the-mind/GameTranscript.ts` | Transcript types and MindTranscriptRecorder (event-based) |
| `example-games/the-mind/headlessGame.ts` | Headless AI-vs-AI runner for fixture generation |
| `example-games/the-mind/help-content.json` | Help panel content |
| `example-games/the-mind/scenes/TheMindScene.ts` | Phaser scene (real-time card play interface) |

### The Mind tests

Tests are in `tests/the-mind/`:

| File | Tests |
|------|-------|
| `mind-card.test.ts` | Card types and deck creation (27 tests) |
| `mind-card-renderer.test.ts` | Card rendering utilities (37 tests) |
| `game-state.test.ts` | Game state, level progression, lives (72 tests) |
| `ai-strategy.test.ts` | AI timing strategies (56 tests) |
| `transcript.test.ts` | Event-based transcript recording (32 tests) |
| `auto-play.test.ts` | Headless auto-play across seeds (33 tests) |
| `integration.test.ts` | Full game invariants across seeds (33 tests) |

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

All six games have fixture transcripts checked into version control:

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

Games still using `scene.load.svg` (as of this migration): lost-cities.

## Keeping Docs Up to Date

**Policy:** Any change that alters developer workflows must include a documentation update. Specifically:

- Changes to npm scripts, dependencies, or `package.json` structure
- Changes to `tsconfig.json`, `vite.config.ts`, or build configuration
- Changes to directory structure or path aliases
- New tooling, CI/CD, or developer-facing infrastructure

**How to comply:**

1. Update this file (`docs/DEVELOPER.md`) and the relevant section of `AGENTS.md` in the same commit or PR
2. If the doc update cannot be done in the same commit, create a child work item in Worklog:
   ```bash
   wl create --title "Update docs for <change>" --parent <parent-id> --priority medium --issue-type task --json
   ```
3. The parent work item cannot be closed until the doc-update child is also closed

## Work-Item Tracking

This project uses **Worklog (wl)** for all task tracking. Key commands:

```bash
wl next --json                    # what should I work on?
wl create --title "..." --json    # create a work item
wl update <id> --status in_progress --json  # claim a task
wl close <id> --reason "..." --json         # close when done
wl sync                           # sync with remote
```

See the Worklog section in `AGENTS.md` for full documentation.

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
