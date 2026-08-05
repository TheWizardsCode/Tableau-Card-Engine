---
name: tce-game-dev
description: "Tableau Card Engine (TCE) game-development best practices. Design the architecture for new example games, review existing game implementations for compliance with TCE conventions, and identify missing features and integration points. Trigger on queries like: 'design a new game for TCE', 'review this game against TCE conventions', 'add a new scene to the Gym', 'what patterns does TCE use?'"
---

# TCE Game Development — Agent Skill

## 1. Overview

This skill is a **self-contained reference** for building games on the Tableau
Card Engine (TCE), a modular engine for single-player tableau card games built
with Phaser 4 RC and TypeScript. It captures every convention, pattern, and
infrastructure component found across the project's Gym demo scenes and example
games (Golf, Beleaguered Castle, Blackjack, Sushi Go, Feudalism, Lost Cities,
Main Street).

**When to use this skill:**

- **Designing** the initial architecture for a new example game.
- **Reviewing** an existing game implementation for compliance with TCE conventions.
- **Identifying** missing features and integration points (SLL, transcript
  recording, save/load, replay, settings/help panels, accessibility, testing).
- **Adding a new Gym scene** to demonstrate an engine feature.

**Target audience:** AI agents building, reviewing, or extending TCE games.

The authoritative in-repo sources are `AGENTS.md`, `docs/DEVELOPER.md`, and the
Gym scene index `docs/gym/GYM_INDEX.md`. This skill distils those plus the
actual source code into one document. If a detail is unclear, consult the
referenced source files — they always win.

## 2. Project Structure

The project is a **flat monorepo** with a single `package.json` at the root.

```
tableau-card-engine/
├── src/
│   ├── core-engine/       # Game loop, state, RNG, transcripts, save/load, sound, events, SLL ownership
│   ├── card-system/       # Card, Deck, Pile, MarketOfferEngine, rankValue
│   ├── rule-engine/       # EconomyLedger, LegalityResult helpers
│   ├── ai/                # AiStrategyBase, AiPlayer, pickRandom, pickBest, CardMemoryTracker
│   └── ui/                # CardGameScene, HandView, PileView, SLL, HUD components, overlays
├── example-games/
│   ├── gym/               # Demo scenes (one per core feature) + GymRegistry
│   ├── golf/              # 9-Card Golf
│   ├── beleaguered-castle/
│   ├── blackjack/
│   ├── sushi-go/
│   ├── feudalism/
│   ├── lost-cities/
│   └── main-street/
├── main.ts                # Unified entry point: Game Selector + all game scenes
├── index.html             # Single Vite entry
├── public/assets/         # Static assets (cards, audio, games/<game>/thumbnails)
├── tests/                 # Vitest tests (unit + browser + e2e)
├── scripts/               # Tooling: adapters, monte-carlo, fixture generators, SFX
└── .github/workflows/     # deploy.yml + pr-checks.yml
```

### Path aliases (tsconfig.json + vite.config.ts)

| Alias | Target |
|-------|--------|
| `@core-engine/*` | `src/core-engine/*` |
| `@card-system/*` | `src/card-system/*` |
| `@rule-engine/*` | `src/rule-engine/*` |
| `@ai/*` | `src/ai/*` |
| `@ui/*` | `src/ui/*` |

Note: in practice, example games import via **relative paths** (e.g.
`../../../src/ui`), while tests and shared code may use the aliases.

### Game directory structure (per example game)

```
example-games/<game>/
├── main.ts                    # Standalone entry point
├── create<Game>Game.ts        # Factory using createCardGame() — used by browser tests
├── <Game>Game.ts              # Pure game logic / session / state machine
├── <Game>Rules.ts             # Move legality + scoring
├── AiStrategy.ts              # Strategy interface + Random/Greedy strategies + AiPlayer
├── GameTranscript.ts          # Transcript types + TranscriptRecorder extends TranscriptRecorderBase
├── <Game>SaveLoad.ts          # SaveSerializer + SaveLoadStore integration (games with persistence)
├── help-content.json          # Help panel sections
├── layouts/<game>.layout.json # SLL layout document
└── scenes/
    ├── <Game>Scene.ts         # Extends CardGameScene — orchestrator
    ├── <Game>Renderer.ts      # Board layout + sprite refresh
    ├── <Game>Animator.ts      # Card animations/tweens
    ├── <Game>TurnController.ts# Human turn logic + phase machine
    ├── <Game>AiController.ts  # AI opponent turn execution (games with AI)
    ├── <Game>ReplayController.ts  # Replay mode state injection (games with replay)
    ├── <Game>LayoutAdapter.ts # SLL zone → game layout shape mapping
    └── <Game>Constants.ts     # Card dims, timings, SFX keys, phase types
```

### Unified entry point (main.ts)

`main.ts` boots a single `Phaser.Game` with `GameSelectorScene` as the landing
page. All example game scenes are registered so the selector can transition to
them. The game catalogue is stored in the Phaser registry under
`REGISTRY_KEY_GAMES = 'gameSelector.games'` via a `preBoot` callback.

**Adding a new game:** import the scene, add it to the `GAMES: GameEntry[]`
array (include a `thumbnail` texture key once available), and ensure the scene
has a `[ Menu ]` button that calls `this.scene.start('GameSelectorScene')`.

## 3. Game Architecture

### CardGameScene base class

All game scenes extend `CardGameScene` (which extends `Phaser.Scene`) from
`src/ui/CardGameScene.ts`. It provides:

- Event system (`GameEventEmitter` + `PhaserEventBridge` + `window.__GAME_EVENTS__`)
- Sound system setup (`initSoundSystem()`)
- Help and Settings panels (`initHelpPanel()` / `initSettingsPanel()`)
- Replay mode detection (`?mode=replay` URL param → `this.replayMode`)
- `state-settled` event emission (`emitStateSettled()`)
- Shared HUD container at depth 1000 (`initHUDContainer()`)
- Menu button in the header (`initMenuButton()`)
- Card design-change listener (`tce:card-design-changed` → texture reload)
- Undo/Redo buttons (`initUndoRedoButtons()` / `refreshUndoRedoButtons()`)
- Standard shutdown cleanup (`shutdownBase()`)

```ts
export class MyGameScene extends CardGameScene {
  constructor() { super({ key: 'MyGameScene' }); }

  create(): void {
    super.create();   // MUST be called first
    // game-specific setup...
  }
}
```

### Game logic is separate from the scene

Pure game logic (rules, state, session, scoring, AI decision space) lives in
dedicated modules outside `scenes/` (e.g. `GolfGame.ts`, `GolfRules.ts`,
`GolfScoring.ts`, `BeleagueredCastleState.ts`, `SushiGoGame.ts`). The scene
orchestrates UI and delegates to these modules. This enables headless unit
testing without a browser.

### Composable helper classes

Complex games split the scene into composable helpers under `scenes/`:

| Game | Helpers |
|------|---------|
| Golf | `GolfRenderer`, `GolfAnimator`, `GolfTurnController`, `GolfAiController`, `GolfReplayController`, `GolfOverlayHelper` |
| Beleaguered Castle | `BeleagueredCastleRenderer`, `BeleagueredCastleTurnController` |
| Sushi Go | `SushiGoRenderer`, `SushiGoReplayController`, `SushiGoCardFactory`, `SushiGoTableauRenderer`, `SushiGoOverlayContent` |
| Feudalism | `FeudalismRenderer`, `FeudalismAnimator`, `FeudalismTurnController`, `FeudalismReplayController`, `FeudalismOverlays` |
| Lost Cities | `LostCitiesRenderer`, `LostCitiesAnimator`, `LostCitiesTurnController`, `LostCitiesReplayController`, `LostCitiesOverlays` |
| Main Street | `MainStreetRenderer`, `MainStreetAnimator`, `MainStreetTurnController`, `MainStreetInputManager`, `MainStreetOverlayContent`, `MainStreetSvgTextureManager`, `MainStreetLifecycleManager`, `MainStreetTutorialHints` |

Typical dependency wiring in `create()`:

```ts
this.golfRenderer = new GolfRenderer(this, this.session, this.replayMode);
this.animator = new GolfAnimator(this, this.session, this.golfRenderer, this.soundManager);
this.turnController = new GolfTurnController(this.session, this.recorder, this.phaseManager, this.gameEvents);
this.aiController = new GolfAiController(this, this.session, this.recorder, this.aiPlayer, this.phaseManager, this.gameEvents);
```

Display objects are exposed on the scene for test compatibility (e.g.
`this.humanCardSprites = this.golfRenderer.humanCardSprites`).

### Game-state collections use Pile<T>

Use the card-system `Pile<T>` LIFO abstraction for decks, hands, foundations,
tableaus, and discard piles. `createStandardDeck()` + `shuffleArray()` (with a
seeded RNG) produce deterministic deals.

### AI strategies extend AiStrategyBase / AiPlayer<TStrategy>

See Section 10.

### Feasibility spikes for graphics features

Evaluate new graphics pipelines (custom shaders, lighting) in **isolated spike
scenes** before integrating anything into shared engine modules. Spikes should:
attempt the feature, document findings (capabilities, limitations, fallback
paths) in the scene's help text, and fall back gracefully when the feature is
unavailable (headless / WebGL-disabled environments). Peer-review the spike
before refactoring shared code.

- **Gym scenes:** `GymGraphicsShaderSpikeScene` —
  `example-games/gym/scenes/GymGraphicsShaderSpikeScene.ts`;
  `GymGraphicsLightingSpikeScene` —
  `example-games/gym/scenes/GymGraphicsLightingSpikeScene.ts`
- **Key APIs:** `sprite.setTint()` / `clearTint()` (tint highlights valid/invalid
targets, e.g. green for playable cards), `sprite.setBlendMode(Phaser.BlendModes.NORMAL | ADD | MULTIPLY | SCREEN)`
(layering/glow effects), `this.lights.enable()` +
`this.lights.addLight(x, y, radius, color, intensity)` + `light.setIntensity()`
(point lights; WebGL only, lit sprites call `setLighting(true)`)
- **When to use:** when deciding whether a graphics feature can be used safely in
the engine (e.g. glow around playable cards, foil card borders, dynamic
backgrounds). The shader spike generates its own textures via
`add.graphics()` + `generateTexture()` rather than card assets; the lighting
spike records findings in its event log and shows plain fallback sprites when
WebGL is unavailable. Recommend making lighting optional behind a feature flag
in production.

## 4. Scene Lifecycle

### Boot sequence

1. **preload()** — call `preloadCardAssets(this, CARD_W, CARD_H)` for card SVGs,
   then load game-specific audio with `audioPathWithFallback(gameDir, filename)`.
   Audio keys are namespace-scoped: `${ns}:${SFX_KEY}`.
2. **create()** — call `super.create()` **first** (auto-runs replay detection,
   event system, HUD container, menu button, card-design listener). Then:
   - Reset display-object arrays (stale refs from previous run on restart).
   - Create `PhaseManager<TurnPhase>` with `initialPhase`, `phaseTextMap`,
     `onPhaseChange`.
   - Select AI strategy and build the session/game state (`setupGolfGame(...)` etc.).
   - Create the transcript recorder.
   - If `!this.replayMode`: `initSoundSystem(...)`, `initHelpPanel(helpContent)`,
     `initSettingsPanel(...)`, optionally `initUndoRedoButtons(...)`.
   - Create the helper classes (renderer, animator, turn controller, etc.).
   - Create UI (labels, piles, grids, score display, instructions).
   - Wire PhaseManager text object, refresh all, then start the game loop.
3. **shutdown()** — call `this.shutdownBase()` for proper cleanup
   (soundManager, eventBridge, panels, buttons, hudContainer, card-design listener).

### Replay mode

- `detectReplayMode()` reads `?mode=replay` from the URL.
- In replay mode, skip input/sound/panel init and emit `state-settled` after
  board injection.
- Games expose `loadBoardState(...)` / `enableInteractiveMode(...)` /
  `showTakeoverOverlay(...)` (see Golf `GolfReplayController`, BC, Sushi Go,
  Feudalism, Lost Cities, Main Street).

### Scene transitions

Use `runSceneTransition({ scene, mode, type, duration, reducedMotion })`
(GymSceneBase pattern) for enter/exit animations. Reduced-motion skips the
transition.

## 5. SLL Layout (Screen Layout Language)

**All new example games MUST use SLL for UI layouts** — no hardcoded pixel
positions.

### Core modules

- `src/ui/screen-layout-schema.ts` — schema, types, `validateScreenLayoutDocument()`, `parseScreenLayoutDocument()`
- `src/ui/screen-layout.ts` — `normalizedToPixels()`, `pixelToNormalized()`, `getZoneRect()`, `anchorPoint()`, `adaptLayoutWithFallback()`
- `src/ui/screen-layout-compose.ts` — `composeResolvedLayouts()`
- `src/core-engine/VisibilityOwnership.ts` — `VisibilityOwnershipController` (also re-exported from `@ui`)

### Conventions

- Layout JSON files live in `example-games/<game>/layouts/<game>.layout.json`.
- Parse the document **once at module load** with `parseScreenLayoutDocument()`;
  validate and throw a clear error on invalid layout.
- Zones use **normalized fractions (0–1)** of the base viewport.
- Base viewport is **1280×720** (`src/ui/constants.ts`: `GAME_W`, `GAME_H`).
- A `resolveXxxAnchor(zone, anchor)` helper resolves positions with **fallback
  coordinates** when the layout is unavailable:

```ts
function resolveDeckRngAnchor(zone: string, anchor: string, fallbackX: number, fallbackY: number): { x: number; y: number } {
  if (!DECK_RNG_LAYOUT) return { x: fallbackX, y: fallbackY };
  const pt = anchorPoint(DECK_RNG_LAYOUT, zone, anchor, DEFAULT_VIEWPORT, 1);
  return { x: pt.x, y: pt.y };
}
```

### Layout adapter pattern (games)

Each game has a `*LayoutAdapter.ts` that maps SLL zones to the game-specific
layout shape and exports a `compute<Game>Layout()` function plus derived
position helpers (grid cells, pile centres). It is the single source of truth
for placement.

### Composition (shell + scene)

Use `composeResolvedLayouts(baseLayout, sceneLayout, viewport, dpr,
{ policy: 'sceneWins' })` to merge a shared shell layout (header/menu/help)
with a scene-specific layout. Register objects into ownership groups
(`shell` / `scene` / `shared` / `ungrouped`) via `VisibilityOwnershipController`
so visibility is managed per mode. See `GymSllScene` and `GymLayoutOwnershipScene`.

### Layout JSON structure

```json
{
  "version": 1,
  "id": "game-canonical",
  "baseViewport": { "width": 1280, "height": 720 },
  "requiredZones": ["humanGrid", "stockPile"],
  "zones": {
    "humanGrid": {
      "rect": { "x": 0.05, "y": 0.20 },
      "anchors": { "center": { "x": 0.20, "y": 0.55 }, "topCenter": { "x": 0.20, "y": 0.20 } }
    }
  }
}
```

Zones support position-only (`x`,`y`) or dimensioned (`x`,`y`,`w`,`h`) rects,
plus optional `pixelOverride` for exact pixel positioning (used by tutorial
highlight areas). Every zone's anchors are `NormalizedPoint` values.

## 6. HUD & UI Components

### Shared components (src/ui)

| Component | Purpose |
|-----------|---------|
| `HelpPanel` + `HelpButton` | Slide-out help panel; sections from `help-content.json`; optional custom `render` for complex content |
| `SettingsPanel` + `SettingsButton` | Volume/mute, difficulty, reduced-motion, tooltips toggle, AI skill rating slider, debug tools (dev mode) |
| `TooltipManager` | Contextual tooltips — DOM mode (HTML overlay) or Phaser mode (game-object containers) |
| `OverlayManager` | Game-state overlay lifecycle (win/loss/game-over/round-end) at depth 2000 |
| `createOverlayBackground()` / `dismissOverlay()` | Modal overlay primitives |
| `createParameterizedOverlay()` / `dismissParameterizedOverlay()` | Declarative config-driven overlays with `overlayCenterY` offset |
| `createGameOverOverlay()` | End-of-game screen with stats and buttons |
| `GymButtonBar` | Automated button bars with zones and row wrapping |
| `HighlightManager` | Highlight zones for tutorials/targeting |
| `HintBar` | Shared hint/instruction text |
| `createSceneHeader()` | Title + menu button header bar |
| `createVersionLabel()` | Version badge |
| `createOverlayButton()` | Styled overlay buttons |
| `createHudText()` | Consistent HUD text rendering |
| `createActionButton()` | Action buttons |
| `Slider` | Horizontal slider widget |
| `createHudContainer()` / `createGameZone()` / `attachHudTooltipZone()` | Renderer helpers |

### Depth conventions

| Layer | Depth |
|-------|-------|
| Gameplay content | default (0+) |
| HUD container (help/settings/buttons) | 1000 |
| Game-state overlays (game-over/win/loss) | 2000 |
| Modal dialog backdrop | 199 (or `depthBase`) |
| Modal dialog box | 200 (or `depthBase + 1`) |
| Modal dialog content/buttons | 201 (or `depthBase + 2`) |

### HUD wiring in CardGameScene

```ts
if (!this.replayMode) {
  this.initHelpPanel(helpContent as HelpSection[]);
  this.initSoundSystem(Object.values(SFX_KEYS), mapping, { namespace: AUDIO_NS });
  this.initSettingsPanel();
}
```

`initSettingsPanel()` accepts optional `difficultyNames`, `defaultDifficulty`,
`hasTooltips`, `skillRating` (AI skill slider), and `debugTools`. It requires
`initSoundSystem()` to have run first.

### Events system

`gameEvents.emit(...)` / `gameEvents.on(...)` via `GameEventEmitter` (typed
payloads: `card-drawn`, `card-flipped`, `game-ended`, `ui-interaction`,
`state-settled`, `turn-started`, etc.). `PhaserEventBridge` forwards events to
Phaser scene events. `window.__GAME_EVENTS__` exposes the emitter for the
replay tool (dev).

## 7. Audio & Sound

### Conventions

- SFX keys use the **`sfx-` prefix with no game identifier** — see
  `docs/SFX_CONVENTION.md`. Shared keys come from `COMMON_SFX_KEYS` in
  `src/core-engine/SoundManager.ts` (`UI_CLICK`, `TURN_CHANGE`, `ROUND_END`,
  `SCORE_REVEAL`, `ILLEGAL_MOVE`).
- Audio assets live in `public/assets/audio/<gameDir>/` with a fallback in
  `public/assets/audio/default/`. `audioPathWithFallback(gameDir, filename)`
  returns `[game-specific, default]` URLs — Phaser tries each in order.
- Load audio in `preload()` with namespace-scoped keys: `${ns}:${SFX_KEY}`.

### Wiring

```ts
this.initSoundSystem(Object.values(SFX_KEYS), {
  'card-drawn': SFX_KEYS.CARD_DEAL,
  'card-flipped': SFX_KEYS.CARD_FLIP,
  'game-ended': SFX_KEYS.ROUND_WIN,
  'ui-interaction': SFX_KEYS.UI_CLICK,
}, { namespace: AUDIO_NS });
```

`EventSoundMapping` maps game events to SFX keys. **Avoid double-play**: if the
animator already plays movement sounds, do NOT map those events to sounds too
(Golf does this deliberately — only turn-started and game-ended are mapped).

`SoundManager` supports mute, volume, register/stop, and a synth player adapter
(ToneForge, used by Main Street). `safePlaySound()` guards against missing
keys. `GymAudioFeedbackScene` demonstrates event-driven audio, mute toggle, and
volume sliders.

## 8. Accessibility

- **Reduced motion:** read from `SettingsStore` (`getReducedMotion()` /
  `setReducedMotion()`) AND the browser `prefers-reduced-motion` media query.
  `GymSceneBase.initReducedMotion()` combines both; scenes consult
  `this.reducedMotion` to skip or shorten animations (helpers like `flipCard`,
  `dealCard`, `moveGameObject`, `runSceneTransition` accept a `reducedMotion`
  override).
- `SettingsPanel` exposes a reduced-motion toggle with immediate effect.
- Use `getEffectiveReducedMotion()` from `src/ui/ReducedMotion.ts` for
  non-scene contexts.

## 9. Data Persistence

### SaveLoadStore

`SaveLoadStore` from `@core-engine` — IndexedDB with localStorage fallback.
API: `save(domain, gameType, slotId, schemaVersion, payload)`, `load<T>()`,
`list<T>()`, `remove()`, `clear()`, plus `saveRunCheckpoint()` /
`loadRunCheckpoint()` helpers. Use `serializeWithVersion()` /
`deserializeWithVersion()` for versioned payloads — deserialization **throws on
version mismatch** instead of silently corrupting data.

### Custom serializers

Games define a `SaveSerializer<TState, TSerialized>` (e.g. `bcStateSerializer`
in Beleaguered Castle, `createFeudalismSerializer` in Feudalism,
`MainStreetSaveLoad.ts`). Serialized state is JSON-safe (cards as
`{ rank, suit }` arrays, seeds, move counts). Schema version constants like
`BC_SAVE_SCHEMA_VERSION` gate compatibility.

### CheckpointManager

`CheckpointManager<TState, TSerialized>` pairs with SaveLoadStore for
checkpoint autosave + resume. `checkAndResume(freshStartFn, resumeFn,
createResumeOverlay?)` offers resume/new-game UI via
`createDefaultResumeOverlay()`. Used by Beleaguered Castle (after each move),
Feudalism (after each turn, human + AI), and Main Street (run checkpoints).

### TranscriptStore + autoSaveTranscript

- `TranscriptStore` persists finalized transcripts (IndexedDB + localStorage
  fallback) with rolling-window eviction.
- `autoSaveTranscript(store, gameType, transcript)` is a fire-and-forget save
  helper (all transcript-persisting games use it).
- `TranscriptRecorderBase<T>` / `BaseTranscript<TInitialState, TEvent, TResult>`
  is the shared recorder base — see `src/core-engine/transcript/`.
- Each game's `GameTranscript.ts` defines its own recorder with `recordTurn()`
  / `recordAction()`, `finalize()`, board snapshots, and `CardSnapshot` /
  `snapshotCard()` helpers.
- Dev server persists transcripts to `data/transcripts/<gameType>/` via a Vite
  plugin (`scripts/vite-transcript-plugin.ts`).

### Undo/Redo

`UndoRedoManager` + `Command` + `CompoundCommand` from `@core-engine`.
`CompoundCommand` groups an entire turn into one undo step. New actions after
an undo invalidate the redo stack. `ActionCommands` provides `toCommand()`,
`createSnapshotAction()`, and `ReversibleAction` for snapshot-based commands
(Main Street uses this).

## 10. AI Strategies

### Base abstractions (`src/ai`)

- `AiStrategyBase` — interface with a `name`; game-specific strategy interfaces
  extend it with decision methods that take `(state, rng)`.
- `AiPlayer<TStrategy>` — generic wrapper binding a strategy to an RNG
  (`strategy`, `rng`, `strategyName`). Game-specific players extend it and
  expose decision methods that hide the `rng` parameter.
- `pickRandom<T>(items, rng)` — uniform random selection (throws on empty).
- `pickBest<T>(candidates, scoreFn, rng)` — highest-scoring candidate, ties
  broken uniformly at random.
- `CardMemoryTracker` — probabilistic card memory (used by Golf's AI skill
  rating).

### Game-specific patterns

```ts
export interface AiStrategy extends AiStrategyBase {
  chooseAction(playerState: AiVisiblePlayerState, shared: AiVisibleSharedState, rng: () => number, memoryTracker?: CardMemoryTracker): GolfAction;
}
```

- **Fair-play guarantee:** strategies receive **filtered state projections**
  that hide face-down cards and stock pile contents — cheating is structurally
  impossible.
- Same strategy + same seed = same pick (deterministic) — verified by tests.
- Strategies can be swapped at runtime (`this.aiStrategyName`), and an AI
  skill rating (1–100) can be exposed via the Settings panel slider.

## 11. Testing

### Structure

- Unit tests: `tests/<game>/*.test.ts` (Node environment, fast).
- Browser tests: `tests/**/*.browser.test.ts` (Playwright + Chromium via
  Vitest browser mode).
- E2E replay tests: `tests/e2e/replay-*.test.ts`.
- Tutorial E2E: `tests/e2e/main-street-tutorial-e2e-part{1..6}.browser.test.ts`
  (each part in its own browser context to prevent canvas/GPU exhaustion).
- Test fixtures: `tests/fixtures/transcripts/<game-name>/fixture-game.json`.
- Shared helpers: `tests/helpers/` (e.g. `makeHand()`).

### Deterministic testing

- Use `createSeededRng(seed)` for reproducible shuffles/deals — same seed =
  same sequence (validated by `GymHeadlessDeterminism.test.ts`).
- `GymSceneSmoke.browser.test.ts` verifies every Gym scene boots headlessly
  and renders an active canvas.
- Games expose display objects on the scene for test assertions.

### Mocks & patterns

- Mock `SoundManager` / `StorageLike` for settings panel and sound tests.
- Mock Phaser scene objects to test pure layout/component logic (e.g.
  `GymButtonBar.test.ts`).
- Headless tests assert transcript event sequences for a fixed seed.

### Anti-patterns (never do these)

Per the shared test-writing guidelines (32 low-value test files removed):

1. Grep source code instead of asserting behaviour.
2. `expect(true).toBe(true)` or zero-assertion placeholder tests.
3. Re-implement production logic inside the test (self-referential
   simulations).
4. Duplicate an existing core test under a different name.
5. Assert type-level satisfaction the compiler already checks.
6. Boot a browser/scene without asserting anything.

### Non-destructive guarantee

`npm test` is non-destructive — it does not modify tracked assets.
`tests/test-workflow-safety.test.ts` guards against destructive pretest hooks.

### Commands

```bash
npm test             # Full suite (unit + browser + tutorial e2e)
npm run build        # tsc --noEmit && vite build
npx vitest run tests/gym/*.test.ts
MONTE_SEEDS=200 npm test   # strict Monte Carlo gates (main branch CI)
```

## 12. CI/CD & Deployment

### Quality gates (required before any push)

1. `npm test` passes — all tests across core engine AND example games.
2. `npm run build` succeeds — TS compilation + Vite production build.

### GitHub Actions

- **`.github/workflows/pr-checks.yml`** — runs on PRs to `main`: `npm ci`,
  Playwright Chromium install, `npm test` (reduced Monte Carlo:
  `MONTE_SEEDS=20`), `npm run build`.
- **`.github/workflows/deploy.yml`** — runs on push to `main`: quality gates
  then deploys `dist/` to GitHub Pages at
  `https://thewizardscode.github.io/Tableau-Card-Engine/`. Only one concurrent
  deployment; in-flight runs are cancelled. Vite `base` is set to
  `/Tableau-Card-Engine/` in production mode.

### Release process

- Push to **`dev`** only — never `main`. The `ship` skill's release pipeline
  (`scripts/release/merge-dev-to-main.sh`) promotes `dev` → `main`.
- `CHANGELOG.md` is managed automatically by the release pipeline — do not
  edit it manually.

### package.json scripts (relevant subset)

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server (port 3000, HMR) |
| `npm run build` | `tsc --noEmit && vite build` |
| `npm run preview` | Serve production build |
| `npm test` | `bash scripts/run-ci-tests.sh` (unit → browser → tutorial) |
| `npm run monte-carlo` | Main Street Monte Carlo harness (JSON + CSV) |
| `npm run replay` | Replay a transcript from disk |
| `npm run tf:generate` | Generate ToneForge audio artifacts |

## 13. Card System Patterns

### Core abstractions (`src/card-system`)

- `Card` — `{ rank, suit, faceUp }`; `createCard()`, `RANKS`, `SUITS`.
- `createStandardDeck()` — 52 cards; `shuffleArray()` / `shuffle()` (seeded RNG
  compatible); `draw()` / `drawOrThrow()`.
- `Pile<T>` — LIFO stack with `push`/`pop`/`peek`/`clear`/`isEmpty`/`size`.
- `rankValue(rank)` — numeric rank mapping (games override for scoring, e.g.
  Golf: A=1, 2=-2, J/Q=10, K=0).

### View components (`src/ui`)

| Component | Use |
|-----------|-----|
| `HandView` | Interactive card hand — arc layout, drag-and-drop, selection lift (`setSelectionLift()`), rotation (`setMaxRotationDegrees()`), vertical cascade mode, `renderCard` custom renderer, `CardTextureResolver` |
| `PileView` | Card pile display with click-to-interact, count labels |
| `TokenPileView` | Non-card token piles — `createSimpleTokenRenderer()`, `createCardBackTokenRenderer()`, `createFeudalismTokenRenderer()` |
| `MarketOfferEngine` | Generic market/offer engine — rows, slots (occupied/empty/locked), refill from deck, purchase processing (`PurchaseResult`) |

### Custom card models

`HandView`/`PileView` accept a `CardTextureResolver` callback to render
non-standard card models (tokens, expedition cards, sushi icons). `HandView`
also accepts a `renderCard` callback for fully custom visuals (Sushi Go,
Main Street SVG cards). See `docs/ui/ADAPTER-GUIDE.md`.

### Card assets & textures

- `preloadCardAssets(scene, w, h)` loads card SVGs; `cardTextureKey()`,
  `getCardTexture()`, `rankFileName()`, `cardFileName()` resolve textures.
- Card designs are switchable via `SettingsStore` (`tce-card-design`,
  `getAvailableCardDesigns()`, `setCardDesign()`) — default Classic +
  alternative (webisso). Changing the design emits `tce:card-design-changed`
  and reloads textures in-place.
- `SvgHelpers` (`@core-engine`): `fetchSvgText()`, `rasteriseSvgToTexture()`,
  `getOrCreateTexture()` (cached), `makeTextureKey()`, `markSceneValid()` /
  `markSceneInvalid()` — for procedural SVG card generation (Lost Cities,
  Main Street).

## 14. Shared Engine Modules

### Core Engine (`src/core-engine`)

| Module | Key APIs |
|--------|----------|
| Seeded RNG | `createSeededRng(seed)` |
| Game state | `createGameState()`, `GameState<T>`, phases |
| Turn sequencing | `getCurrentPlayer()`, `advanceTurn()`, `transitionTo()`, `startGame()`, `endGame()`, `isGameOver()`, `isPlaying()` |
| Undo/Redo | `UndoRedoManager`, `Command`, `CompoundCommand` |
| Action commands | `toCommand()`, `createSnapshotAction()`, `ReversibleAction` |
| Transcripts | `TranscriptRecorderBase`, `BaseTranscript`, `TranscriptStore`, `autoSaveTranscript()`, `snapshotCard()`, `CardSnapshot` |
| Save/Load | `SaveLoadStore`, `serializeWithVersion()`, `deserializeWithVersion()`, `SaveSerializer` |
| Checkpoints | `CheckpointManager`, `createDefaultResumeOverlay()` |
| Events | `GameEventEmitter` (typed payload map), `PhaserEventBridge` |
| Sound | `SoundManager`, `COMMON_SFX_KEYS`, `EventSoundMapping`, `safePlaySound()`, `createTfPlayer()` (ToneForge) |
| Effects | `createActiveEffect()`, `decayActiveEffects()`, `applyActiveEffectMultiplier()`, `hasActiveEffectOfType()` |
| Challenges | `selectChallenges()`, `evaluateChallenges()` |
| Difficulty | `createPresetLookup()`, `getPresetNames()` |
| I18n | `registerLocale()`, `setLocale()`, `getLocale()`, `t()`, `resetI18n()`, `getCurrencySymbol()`, `formatCurrency()` |
| Spatial | `Grid<T>`, `neighbors()`, `shortestPath()`, `pathExists()`, `computeAdjacencyBonus()` (Manhattan/Chebyshev/Euclidean) |
| CSV | `parseCsv()` |
| SVG helpers | `fetchSvgText()`, `rasteriseSvgToTexture()`, `getOrCreateTexture()`, `makeTextureKey()`, `markSceneValid()`, `markSceneInvalid()` |
| Ownership | `VisibilityOwnershipController` |
| Setup options | `resolveBaseSetupOptions()`, `resolveSetupOptions()` |

### Rule Engine (`src/rule-engine`)

- `LegalityResult` discriminated union: `{ legal: true }` | `{ legal: false; reason: string }` with helpers `legalAction()` / `illegalAction()`.
- `EconomyLedger` — resource tracking with min/max constraints
  (`createEconomyLedger()`, `ResourceDelta`, `ResourceSnapshot`). Illegal
  results can carry multiple reasons (not your turn, insufficient funds, out
  of bounds, wrong phase).

### AI (`src/ai`)

`AiStrategyBase`, `AiPlayer<TStrategy>`, `pickRandom()`, `pickBest()`,
`CardMemoryTracker` — see Section 10.

### UI (`src/ui`)

Sections 5, 6, and 13 cover UI. Also note: `createCardGame()` factory
(standard Phaser config: 1280×720, `Phaser.Scale.FIT`, DOM container enabled,
HiDPI text), `PhaseManager<T>` (turn-phase state machine with phase text and
change callbacks), `moveGameObject()`, `flipCard()`, `dealCard()`,
`discardCard()`, `placeCard()`, `shakeIllegalMove()`, `popTextOrIcon()`,
`layoutCardPositions()`, `attachSelection()` / `createSingleSelectionManager()`,
`GymSceneUtils` (`createEventLog()`, `createDeckGrid()`), `isDevMode()`.

## 15. Modal Dialogs

Follow the established pattern (reference: `showSellConfirmation` in
`example-games/main-street/scenes/MainStreetOverlayContent.ts`):

### 1. Use overlay infrastructure from `@ui/`

```ts
import { createOverlayBackground, createOverlayButton, dismissOverlay } from '../../../src/ui';
```

### 2. Create background + box

```ts
const boxConfig = { width: 360, height: 260, color: 0x000000, alpha: 1.0, depth: 200 };
const overlay = createOverlayBackground(
  s,
  { depth: 199, alpha: 0.6 },  // backdrop
  boxConfig,                    // visible centered box
);
s.overlayObjects.push(...overlay.objects);
```

### 3. Parent ALL text/buttons into `hudContainer` (CRITICAL)

Every label, button, or interactive element **must** be parented into
`s.hudContainer` — otherwise it renders **behind** the overlay box:

```ts
const titleText = s.add.text(x, y, 'Title', { ... }).setOrigin(0.5).setDepth(201);
if (s.hudContainer) s.hudContainer.add(titleText);   // ← REQUIRED
s.overlayObjects.push(titleText);

const btn = createOverlayButton(s, x, y, '[ OK ]', 201);
if (s.hudContainer) s.hudContainer.add(btn);          // ← REQUIRED
s.overlayObjects.push(btn);
```

### 4. Depth ordering

| Layer | Depth |
|-------|-------|
| Backdrop (semi-transparent) | 199 |
| Visible overlay box | 200 |
| Text, buttons, interactive elements | 201 |

### 5. Cleanup on dismiss

```ts
dismissOverlay(s.overlayObjects);
s.overlayObjects = [];
s.refreshAll();  // re-render game state if it changed
```

For scrollable content regions inside overlays, use a **GeometryMask** and
destroy it on dismiss (see `GymOverlayUiScene`).

For declarative config-driven dialogs, use `createParameterizedOverlay()` /
`dismissParameterizedOverlay()` with `overlayCenterY(offset)` positioning (see
`GymParameterizedOverlayScene`).

## 16. Common Pitfalls

1. **Missing `super.create()`** in scene `create()` — breaks event system, HUD,
   menu button, replay detection.
2. **Not parenting overlay elements into `hudContainer`** — UI renders behind
   the overlay box and is invisible. This is the single most common modal
   dialog bug.
3. **Hardcoded pixel positions** instead of SLL zones/anchors — fails the SLL
   requirement and breaks responsive layouts.
4. **Double-playing SFX** — mapping card-movement events to sounds while the
   animator already plays them (Golf explicitly avoids this).
5. **Non-seeded randomness in tests/game logic** — always use
   `createSeededRng(seed)` for reproducible deals and AI picks.
6. **AI peeking at hidden state** — strategies must only receive filtered
   state projections (Golf enforces this structurally).
7. **Stale display-object arrays on scene restart** — reset arrays in
   `create()` before re-rendering.
8. **Missing `shutdownBase()`** in `shutdown()` — leaks sound, panels, HUD.
9. **Unversioned serialization** — always use `serializeWithVersion()` /
   `deserializeWithVersion()` so version mismatches throw instead of corrupting
   data.
10. **Ignoring `reducedMotion`** — animations must be skippable/shortenable.
11. **Editing `CHANGELOG.md`** — it is managed by the release pipeline.
12. **Pushing to `main`** — push to `dev` only; the ship skill promotes to main.
13. **Zero-assertion or self-referential tests** — see test anti-patterns
    (Section 11).
14. **Reusing a single browser context for sequential Phaser games in tests** —
    use one project/browser instance per game (tutorial E2E parts).
15. **Not registering new scenes** in `main.ts` AND the GymRegistry
    (for Gym scenes) — scenes must be exported from `example-games/gym/index.ts`
    and added to `GYM_SCENE_CATALOGUE`.
16. **Integrating graphics features without a feasibility spike** — evaluate
    shaders/lighting in an isolated spike scene first; document findings and
    fall back gracefully when unavailable (headless/WebGL-disabled).

## 17. Checklist — Reviewing a New Game Against TCE Conventions

### Completeness verification (mandatory before declaring a game or scene compliant)

When this skill is used to **review an implementation for completeness** or to
**capture patterns**, run the following checks. The goal is to catch patterns
that exist in the codebase but are not yet documented or applied.

1. **Review ALL Gym scenes** — every file in `example-games/gym/scenes/`
   (except `GymSceneBase.ts` and `GymConstants.ts`). Cross-check against
   `GYM_SCENE_CATALOGUE` in `example-games/gym/GymRegistry.ts` and the scene
   index in `docs/gym/GYM_INDEX.md`. Every scene must map to a documented
   pattern/API in this skill. 21 Gym demo scenes + Blackjack (22 entries) are
   registered in `GYM_SCENE_CATALOGUE`; the Router navigation scene is excluded
   from the catalogue.
2. **Review ALL example games** — `example-games/golf/`, `beleaguered-castle/`,
   `blackjack/`, `sushi-go/`, `feudalism/`, `lost-cities/`, `main-street/`.
   Verify each game's helper-class split, transcript/save-load/replay
   integration, and AI strategy pattern is documented (Section 3, 9, 10).
3. **Review the GymRegistry** (`example-games/gym/GymRegistry.ts`) — confirm
   every new scene key/entry is registered, exported from
   `example-games/gym/index.ts`, and present in `main.ts`.
4. **Review `package.json` scripts and `vite.config.ts`** — check for new
   build/test/tooling scripts and aliases not yet reflected in Section 12.
5. **Review CI/CD config** — `.github/workflows/deploy.yml` and
   `pr-checks.yml`; verify gates documented in Section 12 match reality.
6. **Review barrel files** — `src/*/index.ts` for newly exported APIs not yet
   captured in Section 14. New Gym scenes imply new exports.

If any of the above review steps uncover an undocumented pattern, update the
corresponding section of this skill before declaring the review complete.

**Architecture**
- [ ] Scene extends `CardGameScene` and calls `super.create()` first.
- [ ] Game logic separated from scene (rules/state/scoring in dedicated modules).
- [ ] Complex scenes split into Renderer/Animator/TurnController (+AiController/ReplayController as needed).
- [ ] State collections use `Pile<T>`; deck built with `createStandardDeck()` + seeded `shuffleArray()`.
- [ ] AI extends `AiStrategyBase` / `AiPlayer<TStrategy>`; strategies receive only visible state.
- [ ] Graphics features (shaders, lighting) evaluated in isolated spike scenes with documented findings and graceful fallback.

**SLL Layout**
- [ ] Layout JSON exists at `example-games/<game>/layouts/<game>.layout.json`.
- [ ] Parsed once at module load with `parseScreenLayoutDocument()`; invalid layout throws a clear error.
- [ ] `resolveXxxAnchor()` helpers provide fallback positions.
- [ ] No hardcoded pixel positions for UI elements.
- [ ] `*LayoutAdapter.ts` maps SLL zones to game layout (if the game has spatial layout).

**Lifecycle**
- [ ] `preload()` calls `preloadCardAssets()` and loads audio with `audioPathWithFallback()`.
- [ ] `shutdown()` calls `shutdownBase()`.
- [ ] Replay mode handled (`?mode=replay`, `loadBoardState`, `state-settled` emission) if applicable.
- [ ] Scene transitions use `runSceneTransition()`.

**HUD / Audio / Accessibility**
- [ ] Help panel via `initHelpPanel(helpContent)`.
- [ ] Settings panel via `initSettingsPanel()` (after `initSoundSystem()`).
- [ ] Sound system with namespace-scoped keys and event mapping; no double-play.
- [ ] Reduced-motion respected (`this.reducedMotion`, SettingsStore, media query).

**Persistence / Transcripts**
- [ ] Transcript recorder extends `TranscriptRecorderBase`; auto-saved via `autoSaveTranscript()`.
- [ ] Save/load (if applicable) via `SaveLoadStore` + `serializeWithVersion()`; custom serializer documented.
- [ ] Checkpoint autosave + resume (if applicable) via `CheckpointManager`.

**Testing / CI**
- [ ] Unit tests in `tests/<game>/` with deterministic seeds.
- [ ] Browser smoke tests assert scene boots and renders (if scene-level).
- [ ] `npm test` passes (full suite).
- [ ] `npm run build` succeeds.
- [ ] Game registered in `main.ts` `GAMES` catalogue (with thumbnail when available).

**Docs**
- [ ] `docs/DEVELOPER.md` game reference table updated.
- [ ] Assets attributed in `public/assets/CREDITS.md`.
- [ ] Help content (`help-content.json`) present and accurate.
