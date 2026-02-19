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
npm test            # run all tests once
```

Tests use [Vitest](https://vitest.dev/) configured inline in `vite.config.ts`. Test files live under `tests/` and follow the pattern `*.test.ts`.

**Writing tests:**

- Place test files in `tests/` (engine-level) or alongside example game code
- Import from `vitest` directly: `import { describe, it, expect } from 'vitest'`
- Vitest globals are enabled -- `describe`, `it`, `expect` are available without imports in test files

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
└── golf/
    ├── main.ts                 Game entry point (Phaser.Game config)
    ├── GolfGrid.ts             3x3 grid type and utilities
    ├── GolfRules.ts            Turn legality, move application, round-end detection
    ├── GolfScoring.ts          Card point values, grid scoring, column matching
    ├── GolfGame.ts             Game orchestration (session setup, turn execution)
    ├── AiStrategy.ts           AI strategies (RandomStrategy, GreedyStrategy)
    ├── GameTranscript.ts       Transcript recording (TranscriptRecorder)
    └── scenes/
        └── GolfScene.ts        Phaser scene (full visual interface)

public/assets/
├── cards/                  52 card face SVGs + card_back.svg (140x190px, CC0)
└── CREDITS.md              Asset attribution

tests/
├── smoke.test.ts           Toolchain smoke test
├── card-system/            Card, Deck, Pile unit tests
├── core-engine/            GameState, TurnSequencer unit tests
└── golf/                   Golf game unit + integration tests
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
- Ensure Vitest config in `vite.config.ts` includes the `test` block
- Verify the test file pattern matches `tests/**/*.test.ts`

**Large bundle warning:**
- The Phaser library is ~1.4 MB minified -- this is expected
- Code-splitting can be added later via `build.rollupOptions.output.manualChunks` in `vite.config.ts`
