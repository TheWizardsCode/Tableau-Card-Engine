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

Starts the Vite dev server at `http://localhost:3000` with hot module replacement (HMR). The root `index.html` currently loads the 9-Card Golf example game.

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
└── ui/index.ts             Reusable UI components (stub)

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
└── beleaguered-castle/
    ├── main.ts                         Game entry point
    ├── createBeleagueredCastleGame.ts   Factory function (used by main.ts)
    ├── BeleagueredCastleState.ts        State types, move types, constants
    ├── BeleagueredCastleRules.ts        Pure game logic (deal, moves, win/loss)
    ├── GameTranscript.ts               Transcript recording (BCTranscriptRecorder)
    ├── help-content.json               Help panel content (rules, controls, tips)
    └── scenes/
        └── BeleagueredCastleScene.ts   Phaser scene (full visual interface)

public/assets/
├── cards/                  52 card face SVGs + card_back.svg (140x190px, CC0)
└── CREDITS.md              Asset attribution

tests/
├── smoke.test.ts           Toolchain smoke test
├── card-system/            Card, Deck, Pile unit tests
├── core-engine/            GameState, TurnSequencer, UndoRedoManager unit tests
├── golf/                   Golf game unit + integration + browser tests
└── beleaguered-castle/     Beleaguered Castle unit + integration tests
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
2. Add an entry point: `example-games/<game-name>/main.ts`
3. Add scenes: `example-games/<game-name>/scenes/<SceneName>.ts` (extend `Phaser.Scene`)
4. Place assets in `public/assets/<game-name>/` and document attribution in `public/assets/CREDITS.md`
5. Add game-specific tests under `tests/` or alongside the game code
6. Update `index.html` or implement multi-game routing as needed

Follow the `hello-world` example as a reference implementation.

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

Open `http://localhost:3000` -- the Golf game loads by default. Click the stock or discard pile to draw, click a grid card to swap, or click the discard pile after drawing to discard and flip a face-down card.

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

To play Beleaguered Castle, update the `index.html` entry point to import from `example-games/beleaguered-castle/main.ts` instead of the Golf game, then:

```bash
npm run dev
```

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
