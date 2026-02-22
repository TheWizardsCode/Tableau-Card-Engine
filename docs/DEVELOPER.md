# Developer Guide

This document covers everything you need to develop, test, and build the Tableau Card Engine (TCE) project. For a high-level overview, see the [README](../README.md).

## Table of Contents

- [Environment Setup](#environment-setup)
- [Running Locally](#running-locally)
- [Building for Production](#building-for-production)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Path Aliases](#path-aliases)
- [Adding an Example Game](#adding-an-example-game)
- [Managing Assets](#managing-assets)
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

This installs Phaser 3.x as a runtime dependency and TypeScript, Vite, and Vitest as dev dependencies.

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

**Note:** The Phaser library produces a ~1.4 MB chunk. This is expected and can be addressed with code-splitting when needed.

## Deployment

The project deploys automatically to **GitHub Pages** at:

> **https://thewizardscode.github.io/Tableau-Card-Engine/**

### How it works

A GitHub Actions workflow (`.github/workflows/deploy.yml`) runs on every push to `main`:

1. Installs dependencies (`npm ci`)
2. Installs Playwright Chromium (required for browser tests)
3. Runs `npm test` -- deployment stops if any test fails
4. Runs `npm run build` -- deployment stops if the build fails
5. Uploads the `dist/` directory as a Pages artifact
6. Deploys to GitHub Pages via the `actions/deploy-pages@v4` action

Only one deployment runs at a time; if a new push arrives while a deployment is in progress, the previous run is cancelled.

### Vite base path

GitHub Pages serves the site at `/<repo>/` rather than `/`. The Vite config sets the `base` option conditionally:

- **Production** (`npm run build`): `base: '/Tableau-Card-Engine/'`
- **Development** (`npm run dev`): `base: '/'`

This is handled automatically via Vite's `mode` parameter in `vite.config.ts`. Game scenes use relative asset paths (e.g., `assets/cards/card_back.svg`), which resolve correctly under either base.

### First-time setup

A repository administrator must enable GitHub Pages once:

1. Go to **Settings > Pages** in the repository
2. Under **Source**, select **GitHub Actions**
3. No custom domain is needed -- the default URL is used

After this, every push to `main` will automatically deploy.

### Verifying a deployment

1. Check the **Actions** tab in the repository for the latest workflow run
2. Visit `https://thewizardscode.github.io/Tableau-Card-Engine/` to confirm the site loads
3. Verify all games (9-Card Golf, Beleaguered Castle, Sushi Go!, Splendor, Lost Cities) are playable and card assets load correctly

## Testing

```bash
npm test            # run all tests once (unit + browser)
```

Tests use [Vitest](https://vitest.dev/) configured inline in `vite.config.ts` with two test projects:

| Project | Environment | File Pattern | Purpose |
|---------|-------------|-------------|---------|
| `unit` | Node.js | `tests/**/*.test.ts` | Logic, data, and integration tests |
| `browser` | Chromium (Playwright) | `tests/**/*.browser.test.ts` | Phaser UI and rendering tests |

Both projects run together via `npm test`. The browser project runs in headless Chromium using `@vitest/browser` with the Playwright provider.

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

## Project Structure

```
src/
├── core-engine/            Game loop, state management, turn sequencing
│   ├── GameState.ts        GameState<T>, createGameState
│   ├── TurnSequencer.ts    advanceTurn, getCurrentPlayer, startGame, endGame
│   └── index.ts            Barrel file / public API
├── card-system/            Card, Deck, Pile abstractions
│   ├── Card.ts             Rank, Suit, Card type, createCard
│   ├── Deck.ts             createStandardDeck, shuffle, draw, drawOrThrow
│   ├── Pile.ts             Pile class (push, pop, peek, isEmpty, size)
│   └── index.ts            Barrel file / public API
├── rule-engine/index.ts    Rule definitions (stub -- game-specific rules live with games)
└── ui/
    ├── GameSelectorScene.ts Game selector landing page (GameEntry, REGISTRY_KEY_GAMES)
    ├── HelpPanel.ts         Reusable help panel component
    ├── HelpButton.ts        Help button component
    └── index.ts             Barrel file / public API

example-games/
├── hello-world/
│   ├── main.ts                 Game entry point (Phaser.Game config)
│   └── scenes/
│       └── HelloWorldScene.ts  Phaser.Scene subclass
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
├── splendor/
│   ├── main.ts                 Game entry point
│   ├── createSplendorGame.ts   Factory function (used by main.ts and tests)
│   ├── SplendorCards.ts        Development cards, nobles, gem types, tier data
│   ├── SplendorGame.ts         Game orchestration (token collection, purchases, nobles)
│   ├── AiStrategy.ts           AI strategies (RandomStrategy, GreedyStrategy)
│   ├── help-content.json       Help panel content
│   └── scenes/
│       └── SplendorScene.ts    Phaser scene (gem tokens, card market, purchases)
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

public/assets/
├── cards/                  52 standard card SVGs + card_back.svg (140x190px, CC0)
│   └── lost-cities/        60 Lost Cities expedition card SVGs + lc-back.svg (140x190px)
└── CREDITS.md              Asset attribution

tests/
├── smoke.test.ts           Toolchain smoke test
├── card-system/            Card, Deck, Pile unit tests
├── core-engine/            GameState, TurnSequencer, UndoRedoManager unit tests
├── golf/                   Golf game unit + integration + browser tests
├── beleaguered-castle/     Beleaguered Castle unit + integration tests
├── sushi-go/               Sushi Go! cards, scoring, game, AI tests
├── splendor/               Splendor cards, game, AI tests
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
| `@ui/*` | `src/ui/*` |

Usage in code:

```typescript
import { ENGINE_VERSION } from '@core-engine/index';
```

## Adding an Example Game

1. Create a directory: `example-games/<game-name>/`
2. Add a standalone entry point: `example-games/<game-name>/main.ts`
3. Add a factory function: `example-games/<game-name>/createXxxGame.ts` (for browser tests)
4. Add scenes: `example-games/<game-name>/scenes/<SceneName>.ts` (extend `Phaser.Scene`)
5. Place assets in `public/assets/<game-name>/` and document attribution in `public/assets/CREDITS.md`
6. Add game-specific tests under `tests/<game-name>/`
7. Register the game in the unified entry point (`main.ts` at the project root):
   - Import the scene class
   - Add it to the `scene` array in the Phaser config
   - Add a `GameEntry` to the `GAMES` catalogue array
8. Add a `[ Menu ]` button to the game scene that calls `this.scene.start('GameSelectorScene')` for navigation back to the selector

Follow the Golf and Beleaguered Castle examples as reference implementations.

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

- **Single-player support**: Core engine's `createGameState()` now accepts 1 player
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

## Splendor

Splendor is an engine-building card game demonstrating:

- **Resource management**: Collect gem tokens to purchase development cards
- **Custom card types**: Development cards with costs, gem bonuses, and prestige points across 3 tiers
- **Noble attraction**: Automatically attract noble tiles when development card bonuses meet thresholds
- **Multi-action turns**: Take gems, reserve cards, or purchase developments
- **AI strategies**: Random (valid actions) and Greedy (prioritizes purchases and high-value cards)

### Running Splendor

```bash
npm run dev
```

Open `http://localhost:3000` and click the **Splendor** card on the game selector page.

### Splendor game files

| File | Purpose |
|------|---------|
| `example-games/splendor/main.ts` | Phaser game config entry point |
| `example-games/splendor/createSplendorGame.ts` | Factory function for tests |
| `example-games/splendor/SplendorCards.ts` | Development cards, nobles, gem types, tier data |
| `example-games/splendor/SplendorGame.ts` | Game orchestration (token collection, purchases, nobles, win detection) |
| `example-games/splendor/AiStrategy.ts` | AI strategies (RandomStrategy, GreedyStrategy) |
| `example-games/splendor/help-content.json` | Help panel content |
| `example-games/splendor/scenes/SplendorScene.ts` | Phaser scene (gem market, card tiers, token UI) |

### Splendor tests

Tests are in `tests/splendor/`:

| File | Tests |
|------|-------|
| `SplendorCards.test.ts` | Card data, noble data, gem types (50 tests) |
| `SplendorGame.test.ts` | Game setup, turn execution, win detection, noble attraction (55 tests) |
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

## Managing Assets

- All assets go in `public/assets/` and are served by Vite at the `/assets/` URL path
- Assets must be **CC0, MIT, Apache 2.0, or similarly permissive** -- no restrictive licenses
- Document every asset source and license in `public/assets/CREDITS.md`
- Prefer SVG for card art (resolution-independent, small file size)

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
