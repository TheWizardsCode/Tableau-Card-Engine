## Global agent guidance

Read the global agent instructions at `~/.pi/agent/AGENTS.md` — they define the core principles, the Worklog (wl) work-item workflow, and the coding disciplines that apply to every project. That file is installed from this repository's `AGENTS_GLOBAL.md` by `scripts/install_pi.sh`, which symlinks it into place.

## Project-specific guidance

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

#### When to run which tests

`npm test` runs the full suite via `scripts/run-ci-tests.sh` in three stages, in this order:

1. **Unit tests** (`--project unit`, Node.js) — logic, data, and integration tests in `tests/**/*.test.ts`. Fast (seconds); run them frequently during implementation.
2. **Non-tutorial browser tests** (`--project browser`, headless Chromium) — Phaser UI/rendering tests in `tests/**/*.browser.test.ts`. Phaser needs a real browser (WebGL/Canvas) and cannot run under Node/JSDOM.
3. **Tutorial E2E tests** (`scripts/run-tutorial-tests.sh`) — Main Street tutorial flows in `tests/e2e/main-street-tutorial-e2e-part{1-6}.browser.test.ts`, each part in its own browser instance to avoid Phaser 4 canvas/GPU context exhaustion.

The unit and browser stages run through `scripts/vitest-run-with-retry.ts`, which retries once on Vitest's transient contention-induced failures (worker RPC timeout, browser WebSocket drop) only when every file actually passed. A `replay-e2e` project (`tests/e2e/replay-*.test.ts`) is also defined for Playwright-driven replay checks. See `docs/DEVELOPER.md#testing` for the full project table, CPU-contention mitigations, and guidance on writing unit and browser tests.

- **During implementation** — prefer targeted runs for fast feedback (seconds, not minutes):
  - Unit: `npx vitest run --project unit tests/<game>/` or `npx vitest run --project unit tests/<game>/<name>.test.ts`
  - Browser: `npx vitest run --project browser tests/<game>/<name>.browser.test.ts`
- **Before any push to origin** — always run the full `npm test` and `npm run build` (see the quality gates above).

#### Browser tests

- Cover Phaser UI/rendering and interactions: `tests/**/*.browser.test.ts` (non-tutorial).
- Run in headless Chromium via Playwright; one-time prerequisite: `npx playwright install chromium`.
- Slower than unit tests (~8-10s each) — use targeted `--project browser` runs while developing, not the full suite.

#### Audit test-cache interaction

A full-suite green run at the current commit via the test skill (`/skill:test`, quiet mode, triaged) populates the per-repo **read-only test cache** (`.worklog/cache/`, 2-hour TTL). Audits of that same git state consume the cache without executing anything (`query_cached()`); when every suite command has a cached exit-0 entry at the matching commit, execution-dependent acceptance criteria (e.g. "full test suite passes") are auto-verified. So before requesting an audit, run the full suite green at the commit under review.

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

## Game Architecture Best Practices

This section documents architectural patterns, design decisions, and usage guidance extracted from the Gym demo scenes. Each pattern identifies the Gym scene(s) that serve as canonical reference implementations and links to the relevant core-engine API(s). The help panel text in each Gym scene is the authoritative source for "what this feature does and when to use it."

> **Reference:** See [`docs/gym/GYM_INDEX.md`](docs/gym/GYM_INDEX.md) for the complete scene-to-API mapping, and `docs/DEVELOPER.md` for subsystem-specific deep-dive guidance.

> **Maintenance note:** This section should be reviewed when new Gym scenes are added or existing ones substantially change, to keep patterns aligned with the latest implementations.

### 1. Seeded RNG for Deterministic Randomness

Use `createSeededRng()` and `shuffleArray()` from `@core-engine` to produce deterministic, reproducible random sequences. The same seed always produces the same card order, which is essential for debugging, replay systems, and fairness.

- **Gym scene:** `GymDeckRngScene` — `example-games/gym/scenes/GymDeckRngScene.ts`
- **Key APIs:** `createSeededRng()`, `shuffleArray()`, `createStandardDeck()`
- **When to use:** "In a game like Golf or Beleaguered Castle, seeded RNG ensures that a player can replay a specific deal for debugging or fair competition." (GymDeckRngScene Features help text)
- **Usage example:** By setting the seed to the same value used during a game session, a developer can reproduce the exact same deck order and inspect the deal sequence to verify correctness.

### 2. View/Model Separation with HandView and PileView

**Requirement:** Example games **must** render hands and piles through the core engine's hand-management components — `HandView`, `PileView`, and related helpers such as `flipCard()`. Bespoke hand/pile rendering (manual sprite arrays, hardcoded row positioning, hand-rolled deal/flip tweens) is **not** an accepted pattern: improvements to the shared components (animations, reduced-motion, DPR-aware textures, selection) propagate to every game automatically instead of being re-implemented per game.

**Documented exceptions:** Layouts that genuinely don't fit the single-row `HandView` model may keep bespoke card rendering, but only where the exception is documented in code comments and/or the scene's help text:

- **Golf** — the 3×3 tableau grid (see the exception note in `example-games/golf/scenes/GolfRenderer.ts`); Golf's stock/discard piles still use `PileView`.
- **Feudalism** — token/crop counters rendered via `CropIconRenderer` (a non-card token visual model, not a hand).

New example games must not introduce bespoke hand rendering; `example-games/blackjack/scenes/BlackjackScene.ts` (migrated to `HandView` + `flipCard()`) is the canonical reference for standard hand rendering.

- **Gym scene:** `GymHandPileScene` — `example-games/gym/scenes/GymHandPileScene.ts`
- **Key APIs:** `HandView`, `PileView`, `flipCard()`, `discardCard()`, `moveGameObject()`, `shakeIllegalMove()`
- **When to use:** "In a real game like Golf or Lost Cities, HandView renders the player hand and PileView shows draw/discard piles with click-to-interact support." (GymHandPileScene Features help text)
- **Key features:** Arc layout with live sliders (arc, spacing, rotation, selection raise), vertical cascade toggle, drag-and-drop, card animations (deal from deck, flip in-place, discard to pile, illegal-move shake), reduced-motion fallbacks. Selected cards raise out of the hand (`HandView.setSelectionLift()`) perpendicular to their rotation in horizontal layout, and shift right in vertical cascade. Card sprites use per-index depth (`sprite.setDepth(index)`) so the Canvas-compatible selection highlight (depth `index + 0.01`) can never render over the card to the right / below; labels sit at `index + 0.005`.

### 3. Command Pattern for Reversible Actions (Undo/Redo)

Use `UndoRedoManager` and `Command` from `@core-engine` to implement reversible actions. Compound commands group multiple sub-actions into a single undo step. New actions after an undo invalidate the redo stack (standard stack semantics).

- **Gym scene:** `GymUndoRedoScene` — `example-games/gym/scenes/GymUndoRedoScene.ts`
- **Key APIs:** `UndoRedoManager`, `CompoundCommand`, `Command`
- **When to use:** "In a real card game, undo/redo lets a player reverse a mistaken move — for example, undoing a discard and returning the card to hand, or undoing a series of actions that were grouped as a single turn." (GymUndoRedoScene Features help text)
- **Usage example:** "Compound commands group an entire turn's actions (e.g., draw + discard + score) into a single undo step, letting the player reverse the whole turn at once."

### 4. Strategy Pattern for AI Decision-Making

Use `AiStrategyBase` (the strategy interface), `AiPlayer<TStrategy>` (generic player wrapper with seeded RNG), `pickRandom<T>()`, and `pickBest<T>()` from `@ai` to build AI players with interchangeable decision-making strategies.

- **Gym scene:** `GymAiStrategyScene` — `example-games/gym/scenes/GymAiStrategyScene.ts`
- **Key APIs:** `AiStrategyBase`, `AiPlayer<TStrategy>`, `pickRandom<T>()`, `pickBest<T>()`, `createSeededRng()`
- **When to use:** "In a real game like Lost Cities, an AI strategy implements AiStrategyBase { choosePhase1Action(state, rng): Phase1Action; choosePhase2Action(state, rng): Phase2Action; }. The AiPlayer wraps these strategies and calls them during the game loop." (GymAiStrategyScene Usage Example help text)
- **Key features:** Same strategy + same seed = same pick (deterministic); `pickBest()` breaks ties randomly using the seeded RNG; strategies can be swapped at runtime.

### 5. Overlay Lifecycle and GeometryMask Clipping

Use `createOverlayBackground()` and `dismissOverlay()` from `@ui` for modal overlays. Overlays use a semi-transparent background with depth-ordering conventions (backdrop 199, box 200, interactive elements 201). GeometryMask scrollable content regions are cleaned up on dismiss.

- **Gym scenes:** `GymOverlayUiScene` — `example-games/gym/scenes/GymOverlayUiScene.ts`, `GymParameterizedOverlayScene` — `example-games/gym/scenes/GymParameterizedOverlayScene.ts`
- **Key APIs:** `createOverlayBackground()`, `dismissOverlay()`, `createParameterizedOverlay()`, `dismissParameterizedOverlay()`, GeometryMask (Phaser built-in)
- **When to use:** "In a real card game, overlays are used for confirmation dialogs ('Are you sure you want to quit?'), rule reminders, or modal messages that temporarily block interaction with the game board." (GymOverlayUiScene Features help text)
- **Lifecycle:** Create overlay via `createOverlayBackground`, parent all interactive elements into `hudContainer`, handle dismiss with proper cleanup (GeometryMask destroy, event listener removal, object array reset). The refined depth convention for modal dialogs is documented in the [UI Best Practices section](#ui-best-practices-creating-modal-dialogs) above.

### 6. Event Sourcing via Transcript Recording

Extend `TranscriptRecorderBase<T>` from `@core-engine` to record game events as an auditable transcript. A transcript is an array of structured events that can be inspected for replay, debugging, or headless validation.

- **Gym scene:** `GymTranscriptScene` — `example-games/gym/scenes/GymTranscriptScene.ts`
- **Key APIs:** `TranscriptRecorderBase<T>`, `TranscriptStore`, `autoSaveTranscript()`
- **When to use:** Use transcript recording whenever game state history needs to be captured for replay, debugging, or headless deterministic testing. The Blackjack simulation in this scene demonstrates a realistic multi-event transcript (deal, hit, stick, bust, result) with auto-save on hand end.
- **Test linkage:** The headless deterministic test suite validates that same seed produces identical transcript sequences.

### 7. Versioned Serialization and Persistence (Save/Load)

Use `SaveLoadStore`, `serializeWithVersion()`, and `deserializeWithVersion()` from `@core-engine` for versioned game state persistence. The version field ensures forward compatibility — deserialization fails on version mismatch instead of silently corrupting data.

- **Gym scene:** `GymSaveLoadScene` — `example-games/gym/scenes/GymSaveLoadScene.ts`
- **Key APIs:** `SaveLoadStore`, `serializeWithVersion()`, `deserializeWithVersion()`, `RenderTexture.saveTexture()` / `RenderTexture.snapshot()`
- **When to use:** Any game that needs to persist state between sessions. The scene demonstrates saving a hand of cards along with a RenderTexture screenshot as a visual thumbnail, then restoring both on load.
- **Key features:** Versioned serialization with mismatch detection, full-screen screenshot snapshot, load from storage with HandView integration.

### 8. Event-Driven Audio and Visual Feedback

**Requirement:** Every player **and** AI action that uses a core engine animation/feedback helper — `dealCard`, `discardCard`, `flipCard`, `placeCard`, `moveGameObject`, `shakeIllegalMove`, `popTextOrIcon`, and any future helpers — **must** be rendered with the corresponding animation and wired with a sound effect (SFX), so the action is both animated and audible. Satisfy both via each helper's `soundManager` + `sfx` (`start`/`move`/`end`) parameters, or an equivalent event-driven `GameEventEmitter`/`SoundManager` mapping. SFX keys must follow the shared convention — `COMMON_SFX_KEYS` from `src/core-engine/SoundManager.ts` with the `sfx-` prefix per `docs/SFX_CONVENTION.md`; no game-scoped string literals. (`shakeIllegalMove` plays `COMMON_SFX_KEYS.ILLEGAL_MOVE` automatically; `popTextOrIcon()` is the lightweight score/notification popup.)

**AI actions:** AI turns must be animated with a brief delay so the player can see and hear what the AI did (e.g. card placement / row take). Coloretto is the in-repo precedent — `example-games/coloretto/scenes/ColorettoScene.ts` runs AI turns via `time.delayedCall` (750ms, 150ms under reduced motion) then executes the AI's action through the same animated/sounded path as a human turn.

**Accessibility preserved:** Reduced-motion preferences (explicit flag → SettingsStore toggle → `prefers-reduced-motion`) and the settings-panel mute/volume controls must be respected — pass the helper's `reducedMotion` flag and play SFX through `SoundManager` (or `safePlaySound()`); this rule reinforces, never weakens, that behaviour.

**Documented exceptions:** Actions that legitimately have no visible or audible effect, and headless/replay/test/transcript modes (no rendering or audio), are exempt — but the exemption must be documented in code comments and/or the scene's help text.

**Compliant references (not modified):** Golf's `GolfAnimator` (`example-games/golf/scenes/GolfAnimator.ts`) wires `soundManager` + `sfx` into its deal/discard/flip helpers; Coloretto animates AI turns with a short delay (above); Blackjack preserves flip-sound timing and a delayed dealer-AI run (`example-games/blackjack/scenes/BlackjackScene.ts`). New example games must follow these patterns.

- **Gym scene:** `GymAudioFeedbackScene` — `example-games/gym/scenes/GymAudioFeedbackScene.ts`
- **Key APIs:** `SoundManager`, `GameEventEmitter`, `EventSoundMapping`, `popTextOrIcon()`, particle emitters
- **When to use:** Wire `SoundManager` to `GameEventEmitter` for event-driven audio (e.g., card deal → play deal sound). Use `popTextOrIcon()` for lightweight score-change or undo/redo notifications. Add particle effects for celebrations. Provide mute toggle and volume slider with immediate effect.
- **Key features:** Auto-discovery of sound keys, mute toggling with immediate effect, invalid sound handled safely, volume slider, pop text/icon feedback, particle celebration with reduced-motion fallback.

### 9. Screen Layout Language (SLL) for Declarative Positioning

Define UI layouts declaratively using JSON layout files with **Screen Layout Language (SLL)** instead of hardcoded pixel positions. SLL provides a responsive layout system with zones, anchors, and viewport normalization.

- **Gym scene:** `GymSllScene` — `example-games/gym/scenes/GymSllScene.ts`
- **Key APIs:** `parseScreenLayoutDocument()`, `validateScreenLayoutDocument()`, `normalizedToPixels()`, `composeResolvedLayouts()`, `getZoneRect()`, `anchorPoint()`, `VisibilityOwnershipController`
- **When to use:** Every new example game **must** use SLL for all UI layouts. Avoid absolute pixel coordinates for positioning. Reference `src/ui/screen-layout.ts`, `src/ui/screen-layout-compose.ts`, and `src/ui/screen-layout-schema.ts` for the core modules.
- **Composition:** Multiple SLL layouts can be composed via `composeResolvedLayouts()` to separate scene-specific chrome from scene-specific content.
- **All Gym scenes** use SLL (via `anchorPoint()` in their `resolve*Anchor()` helpers) as a reference pattern.

### 10. Economy and Legality Pattern for Resource Constraints

Use `EconomyLedger` from `@rule-engine` for resource tracking with constraint enforcement (min/max limits). Use a `LegalityResult` discriminated union (`legalAction` / `illegalAction`) for validating game actions with structured error reasons.

- **Gym scene:** `GymRuleEngineScene` — `example-games/gym/scenes/GymRuleEngineScene.ts`
- **Key APIs:** `createEconomyLedger()`, `EconomyLedger`, `ResourceDelta`, leglity result helpers
- **When to use:** Any game with resources (currency, health, points) that need constraint validation. The scene demonstrates illegality for multiple reasons: not your turn, insufficient funds, out of bounds, wrong phase. Use `EconomyLedger` to add/subtract resources with automatic constraint enforcement.

### 11. Tooltip System (DOM and Phaser Modes)

Use `TooltipManager` from `@ui` for contextual information on hover. Supports two rendering modes: **DOM mode** (HTML overlay over the canvas) and **Phaser mode** (game-object containers rendered within the scene).

- **Gym scene:** `GymTooltipScene` — `example-games/gym/scenes/GymTooltipScene.ts`
- **Key APIs:** `TooltipManager`, `setTooltips()`/`getTooltips()` from SettingsStore
- **When to use:** Add tooltips to interactive elements (cards, buttons, zones) to explain their function without cluttering the UI. Toggle between modes at runtime via the settings store.

### 12. Grid and Pathfinding with SpatialRules

Use `Grid`, `neighbors()`, `shortestPath()`, and `pathExists()` from `@core-engine/SpatialRules` for tile-based grid mechanics, pathfinding, and adjacency computation.

- **Gym scene:** `GymSpatialRulesScene` — `example-games/gym/scenes/GymSpatialRulesScene.ts`
- **Key APIs:** `Grid`, `neighbors()`, `shortestPath()`, `pathExists()`, `computeAdjacencyBonus()`, `Position`, `DistanceMetric`
- **When to use:** Any game with a spatial board (grid-based card layout, token positioning, pathfinding obstacles). Supports Manhattan, Chebyshev, and Euclidean distance metrics.

### 13. HUD Component Architecture (HelpPanel, SettingsPanel)

Use `HelpPanel`, `SettingsPanel`, `HelpButton`, and `SettingsButton` from `@ui` for standard HUD chrome. These provide consistent open/close lifecycle, depth management, and content integration.

- **Gym scene:** `GymHudComponentsScene` — `example-games/gym/scenes/GymHudComponentsScene.ts`
- **Key APIs:** `HelpPanel`, `SettingsPanel`, `HelpButton`, `SettingsButton`
- **When to use:** Every game scene should use these components for its help and settings UI rather than building custom panels. The base class `GymSceneBase` provides `initHelp()` which integrates the `HelpPanel` lifecycle.

### 14. Token Pile System for Non-Card Counters

Use `TokenPileView` from `@ui` for token/counter piles where cards are not the visual model. Supports multiple renderers (colored tokens, card-back tokens, custom shape renderers).

- **Gym scene:** `GymTokenPileViewScene` — `example-games/gym/scenes/GymTokenPileViewScene.ts`
- **Key APIs:** `TokenPileView`, `createSimpleTokenRenderer()`, `createCardBackTokenRenderer()`, `createFeudalismTokenRenderer()`
- **When to use:** For resource counters, victory point tracks, or any non-card pile that needs add/remove operations with live count labels and click interaction.

### 15. Market/Offer Engine for Purchase Mechanics

Use `MarketOfferEngine` from `@card-system` for generic market/offer systems with rows, slots (occupied/empty/locked), visibility toggles, and purchase processing.

- **Gym scene:** `GymMarketOfferEngineScene` — `example-games/gym/scenes/GymMarketOfferEngineScene.ts`
- **Key APIs:** `createMarketOfferEngine()`, `MarketOfferEngine`, `PurchaseResult`
- **When to use:** Any game with a market board — offer rows of purchasable items, refill from a deck, lock/unlock slots, and process purchases with result feedback (success vs failure with reason).

### 16. SVG Rasterisation Pipeline

Use `SvgHelpers` from `@core-engine` (fetchSvgText, rasteriseSvgToTexture, getOrCreateTexture) for rendering SVG assets as Phaser textures with configurable output size and caching.

- **Gym scene:** `GymSvgHelpersScene` — `example-games/gym/scenes/GymSvgHelpersScene.ts`
- **Key APIs:** `fetchSvgText()`, `rasteriseSvgToTexture()`, `getOrCreateTexture()`, `makeTextureKey()`
- **When to use:** When card faces or game assets are delivered as SVG files that need to be rasterised to Phaser textures at a specific resolution. Textures are cached by key to avoid redundant rasterisation.

### 17. Internationalisation (I18n)

Use the `I18n` module from `@core-engine` for locale switching with key-based string lookup and fallback support.

- **Gym scene:** `GymI18nScene` — `example-games/gym/scenes/GymI18nScene.ts`
- **Key APIs:** `registerLocale()`, `setLocale()`, `getLocale()`, `t()`, `resetI18n()`
- **When to use:** Any game that needs to support multiple languages. Register locale bundles at runtime, switch between locales interactively, and use `t('key')` for automatic lookup. Missing keys return a fallback or the key itself.

### 18. Feasibility Spikes for Graphics Features

Use isolated spike scenes for evaluating new graphics pipelines (shaders, lighting) before integrating into shared engine modules. Document findings (capabilities, limitations, fallback paths) in the scene itself.

- **Gym scenes:** `GymGraphicsShaderSpikeScene` — `example-games/gym/scenes/GymGraphicsShaderSpikeScene.ts`, `GymGraphicsLightingSpikeScene` — `example-games/gym/scenes/GymGraphicsLightingSpikeScene.ts`
- **Key APIs:** Phaser sprite tinting, blend modes (ADD, MULTIPLY, SCREEN, NORMAL), LightPlugin, point lights
- **When to use:** When evaluating whether a new graphics feature (custom shaders, lighting pipeline) can be used safely in the engine. Spikes should: attempt the feature, document findings in help text, fall back gracefully when unavailable, and be peer-reviewed before shared code is refactored.

### Scene Base Class Pattern

All Gym demo scenes extend `GymSceneBase` (`example-games/gym/scenes/GymSceneBase.ts`), which provides shared utilities:
- Standard scene header with title, menu button, prev/next navigation
- `initHelp()` — structured help panel with Features, Controls, Usage Example, and Test Plan sections
- `initButtonBar()` — automated button layout via `GymButtonBar`
- `initReducedMotion()` — reads from SettingsStore and browser prefers-reduced-motion
- SLL layout loading helpers (`resolve*Anchor()` pattern)

**When to extend:** Any new Gym scene should extend `GymSceneBase`. Non-Gym example game scenes should follow the same patterns (header, help panel, SLL layout, HUD components) to ensure consistency.

---

**Related documentation:**
- `docs/gym/GYM_INDEX.md` — Complete scene-to-API mapping with source paths and test references
- `docs/DEVELOPER.md` — Subsystem-specific deep-dive guidance (SLL, HUD, card system, etc.)
- [UI Best Practices: Creating Modal Dialogs](#ui-best-practices-creating-modal-dialogs) — Depth-ordering convention and overlay implementation patterns

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

