Follow the global AGENTS.md in addition to the rules below. The local rules below take priority in the event of a conflict.

## Project Overview

You are a producer for the Tableau Card Engine (TCE), a game engine designed to support building single-player tableau card games. Your primary goal is to create a fully modular and reusable engine. You achieve this through building increasingly complex card games and extracting reusable components from each.

This project follows a **spike-driven development** approach: example games are built first to validate gameplay mechanics and engine APIs, then reusable components are extracted and refined into the shared engine modules. The project is organized as a **flat monorepo** with a single `package.json` at the root.

## Components

- **Core Engine** (`src/core-engine/`): The foundational framework that provides essential functionalities such as game loop management, state management, rendering helpers, and shared utilities (e.g. deterministic seeded RNG, `TranscriptRecorderBase<T>` for game transcript recording).
- **Card System** (`src/card-system/`): A flexible system for defining and managing cards, including their attributes, effects, and interactions. Includes abstractions for Card, Deck, Hand, and Pile.
- **Rule Engine** (`src/rule-engine/`): A component that allows for the creation and enforcement of game rules, enabling complex gameplay mechanics, turn logic, and validation.
- **AI** (`src/ai/`): Shared AI strategy abstractions and utility functions. Provides `AiStrategyBase` (base interface), `AiPlayer<TStrategy>` (generic player wrapper that binds a strategy to an RNG), `pickRandom<T>()` (uniform random selection), and `pickBest<T>()` (scored selection with random tie-breaking). Game-specific strategies extend the base types.
- **User Interface** (`src/ui/`): A modular UI system with reusable components (buttons, menus, overlays) that can be customized and extended to fit different card game themes and styles.
- **Example Games** (`example-games/`): A collection of sample card games built using the engine, demonstrating its capabilities and serving as templates for future game development. Each example game has its own entry point, scenes, and tests. The **Gym** (`example-games/gym/`) is a curated set of demo scenes that comprehensively showcase core-engine features, including direct and composed Screen Layout Language (SLL) examples.

## Directory Structure

```
tableau-card-engine/
├── src/
│   ├── core-engine/       # Game loop, state management, rendering helpers
│   │   └── index.ts       # Barrel file / public API
│   ├── card-system/       # Card, Deck, Hand, Pile abstractions
│   │   └── index.ts
│   ├── rule-engine/       # Rule definitions, validation, turn logic
│   │   └── index.ts
│   ├── ai/                # Shared AI strategy abstractions and utilities
│   │   └── index.ts       # Barrel file / public API
│   └── ui/                # Reusable UI components
│       └── index.ts
├── example-games/
│   └── gym/               Gym demo scenes for core-engine features
│       ├── README.md
│       ├── GymRegistry.ts
│       ├── index.ts
│       └── scenes/
│           ├── GymRouterScene.ts
│           ├── GymSceneBase.ts
│           ├── GymDeckRngScene.ts
│           ├── GymHandPileScene.ts
│           ├── GymOverlayUiScene.ts
│           ├── GymUndoRedoScene.ts
│           ├── GymTranscriptScene.ts
│           ├── GymSaveLoadScene.ts
│           └── GymAudioFeedbackScene.ts
├── public/                # Static assets (images, fonts, etc.)
│   └── assets/
│       ├── cards/         # Card sprite assets (CC0/permissive)
│       └── CREDITS.md     # Asset attribution
├── tests/                 # Vitest test files
│   └── smoke.test.ts
├── dist/                  # Production build output (gitignored)
├── AGENTS.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html             # Single entry point for Vite
└── .gitignore
```

## Development Workflow

When building a new example game, focus first on making it playable, reusing as many components as possible, and then iteratively refactor and extract reusable components as needed. Always ensure that new components are designed with modularity and reusability in mind, adhering to the principles of clean code and software design.

### Quick Start

```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server with hot-reload (port 3000)
npm test             # Run Vitest test suite (non-destructive: does not modify tracked assets)
npm run build        # TypeScript check + production build to dist/
npm run preview      # Serve production build locally
npm run monte-carlo  # Run Main Street Monte Carlo harness (JSON + CSV)
npm run tf:generate  # Generate ToneForge audio artifacts into build/tf-synths/
```

### Quality Gates

Before pushing any change to the git origin you must have ensured that:

1. `npm test` passes -- all tests across the core engine AND example games must pass.
2. `npm run build` succeeds -- TypeScript compilation and Vite production build must complete without errors.

Each example game should have its own set of tests to ensure that the game mechanics work as expected and to prevent regressions as the engine evolves. Additionally, the core engine should have comprehensive tests covering all critical functionalities.

### Example Games

Each example game is a standalone game that can independently demonstrate the capabilities of the engine. They also serve as reference implementations for how to use the engine's features and components effectively.

Example games live in `example-games/<game-name>/` with their own `main.ts` entry point and `scenes/` directory. The root `index.html` loads a unified entry point (`main.ts`) that boots the **Game Selector** landing page, allowing players to choose between available games. The games are deployed to GitHub Pages at `https://thewizardscode.github.io/Tableau-Card-Engine/` via a GitHub Actions workflow that runs on every push to `main`.

#### Screen Layout Language (SLL) Requirement

All new example games **must** use the **Screen Layout Language (SLL)** for their UI layouts instead of hardcoded pixel positions. SLL provides a declarative, responsive layout system that ensures consistency, adaptability, and reusability across example games.

- **Do not** use absolute pixel coordinates for positioning UI elements within scenes.
- **Do** define UI layouts using SLL composition in your scene code.
- Reference the SLL modules for guidance:
  - `src/ui/screen-layout.ts` — Core SLL layout engine and utilities
  - `src/ui/screen-layout-compose.ts` — SLL composition helpers
  - `src/ui/screen-layout-schema.ts` — SLL schema definitions and type contracts
- The Gym (`example-games/gym/`) contains SLL examples (see `GymOverlayUiScene.ts`) that demonstrate both direct and composed SLL usage patterns.

## Technology Stack

- **Phaser 4 RC** (currently 4.0.0-rc.7): The current release-candidate line of the Phaser HTML5 game framework used by this repository. Provides a foundation for building 2D games, including card games, with WebGL/Canvas rendering, input handling, tweens, and scene management.
- **TypeScript** (strict mode, ES2020 target): A statically typed superset of JavaScript that enhances code quality and maintainability, making it easier to manage complex codebases and catch errors early in the development process.
- **Vite**: A fast build tool and dev server with native ESM support, hot module replacement (HMR), and optimized production builds. Replaces Webpack for faster development iteration.
- **Vitest**: A Vite-native testing framework with a Jest-compatible API. Integrates seamlessly with the Vite build pipeline and avoids ESM/CJS compatibility issues.

### Path Aliases

The project defines path aliases for engine modules in both `tsconfig.json` and `vite.config.ts`:

- `@core-engine/*` -> `src/core-engine/*`
- `@card-system/*` -> `src/card-system/*`
- `@rule-engine/*` -> `src/rule-engine/*`
- `@ai/*` -> `src/ai/*`
- `@ui/*` -> `src/ui/*`

## Licensing

All assets and code used in this project must be open and freely available for commercial use. Licenses must be permissive (MIT, Apache 2.0, CC0, or similar). Asset attribution is documented in `public/assets/CREDITS.md`.

## Documentation

- **`README.md`** -- Project overview, quick-start commands, repository layout, and contribution summary. This is the first thing a new developer or contributor should read.
- **`docs/DEVELOPER.md`** -- Detailed developer guide covering environment setup, running/building/testing, adding example games, managing assets, path aliases, troubleshooting, and the doc-update policy.
- **`AGENTS.md`** (this file) -- Agent/producer guidance, project architecture, tech stack, and Worklog rules.

### Doc-Update Policy

Any change that alters developer workflows **must** include a corresponding documentation update. This includes changes to:

- npm scripts, dependencies, or `package.json` structure
- `tsconfig.json`, `vite.config.ts`, or build/test configuration
- Directory structure or path aliases
- New tooling, CI/CD pipelines, or developer-facing infrastructure

**Enforcement:**

1. Update `docs/DEVELOPER.md` and the relevant section of this file (`AGENTS.md`) in the same commit or PR as the infrastructure change.
2. If the doc update cannot be included in the same commit, create a **child work item** in Worklog for the doc update. The parent work item **cannot be closed** until the doc-update child is also closed.
3. Reviewers should verify that docs are updated before approving any PR that touches infrastructure or workflow files.

## UI Best Practices: Creating Modal Dialogs

When adding a new modal dialog overlay (e.g. a sell confirmation dialog, settings panel, or any popup), follow the established pattern used by `showSellConfirmation` in `MainStreetOverlayContent.ts`. The key rules are:

### 1. Use the overlay infrastructure from `@ui/`

```ts
import { createOverlayBackground, createOverlayButton, dismissOverlay } from '../../../src/ui';
```

### 2. Create the background + box with `createOverlayBackground`

```ts
const boxConfig = { width: 360, height: 260, color: 0x000000, alpha: 1.0, depth: 200 };
const overlay = createOverlayBackground(
  s,
  { depth: 199, alpha: 0.6 },  // backdrop: darker, slightly lower depth
  boxConfig,                     // visible centered box
);
s.overlayObjects.push(...overlay.objects);
```

### 3. Parent ALL text and button objects into `hudContainer` (CRITICAL)

This is the single most common mistake. Every text label, button, or interactive element you add to the overlay **must** be parented into `s.hudContainer`, otherwise it renders **behind** the overlay box and becomes invisible:

```ts
const titleText = s.add.text(x, y, 'My Title', { ... })
  .setOrigin(0.5).setDepth(201);
if (s.hudContainer) s.hudContainer.add(titleText);   // ← REQUIRED
s.overlayObjects.push(titleText);

const btn = createOverlayButton(s, x, y, '[ OK ]', 201);
if (s.hudContainer) s.hudContainer.add(btn);          // ← REQUIRED
s.overlayObjects.push(btn);
```

### 4. Depth ordering

Use consistent depth values to ensure correct z-ordering:

| Layer | Depth |
|-------|-------|
| Backdrop (semi-transparent overlay) | 199 |
| Visible overlay box | 200 |
| Text labels, buttons, interactive elements | 201 |

### 5. Cleanup on dismiss

When the user confirms or cancels, call `dismissOverlay` and reset the objects array:

```ts
dismissOverlay(s.overlayObjects);
s.overlayObjects = [];
s.refreshAll();  // re-render the game state if it changed
```

### 6. Reference the sell dialog for a complete example

The best reference implementation is `showSellConfirmation` in `example-games/main-street/scenes/MainStreetOverlayContent.ts`. It demonstrates:
- Using `createOverlayBackground` for the backdrop + box
- Parenting all text and buttons into `hudContainer`
- Using `createOverlayButton` for styled interactive buttons
- Handling both confirm (sell) and cancel actions
- Proper cleanup and state refresh

<!-- Start base Worklog AGENTS.md file -->

## Worklog Rules

This project follows the standard Worklog (wl) workflow for work-item tracking. The full ruleset is defined in the global AGENTS.md at `~/.pi/agent/AGENTS.md` under these sections:

- **Work-item Tracking with Worklog (wl)** — Core principles for using wl
- **CRITICAL RULES** — Mandatory rules for commits, tests, and work-item hygiene
- **Important Rules** — Recommended practices for effective wl usage
- **Stage vs Status distinction** — Understanding the two lifecycle axes
- **work-item Types, Descriptions, Priorities, Dependencies** — Template definitions
- **Workflow management** — Stage progression and team coordination
- **Work-Item Management** — CLI reference for `wl create`, `wl update`, `wl close`, etc.
- **Project Status** — CLI reference for `wl list`, `wl show`, `wl next`, etc.
- **Coding Disciplines** — Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution

### TCE Project Conventions

- Work-item prefix: **CG** (Tableau-Card-Engine)
- Priority levels: critical → high → medium → low
- Stage progression: idea → intake_complete → plan_complete → in_progress → in_review → done
- See project `docs/DEVELOPER.md` for additional TCE-specific development workflows.

<!-- End base Worklog AGENTS.md file -->