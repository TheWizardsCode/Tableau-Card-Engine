# Tableau Card Engine -- Capabilities Audit for "The Build"

**Date:** 2026-02-27
**Purpose:** Comprehensive audit of the Tableau Card Engine's current capabilities, existing example games, and identified gaps relevant to designing and building "The Build" -- a single-player buildy/crafty/simulation card game.

---

## Table of Contents

1. [Current Engine Features (Available Today)](#1-current-engine-features-available-today)
2. [Existing Example Games](#2-existing-example-games)
3. [Minor Extensions (< 1 day each)](#3-minor-extensions--1-day-each)
4. [Major Gaps (Multi-day efforts)](#4-major-gaps-multi-day-efforts)
5. [Reusability Assessment](#5-reusability-assessment)

---

## 1. Current Engine Features (Available Today)

### Core Engine (`src/core-engine/`)

| Export | Kind | Description |
|--------|------|-------------|
| `ENGINE_VERSION` | constant | Semver string identifying the engine release (`'0.1.0'`). |
| `BaseSetupOptions` | type | Optional seed + player-name fields shared by all game setups. |
| `MultiplayerSetupOptions` | type | Extends `BaseSetupOptions` with an AI-strategy picker callback. |
| `ResolvedBaseSetup` | type | Fully resolved (no optionals) base setup with generated seed/names. |
| `ResolvedSetup` | type | Fully resolved multiplayer setup including AI strategy. |
| `resolveBaseSetupOptions()` | function | Fills in defaults for a `BaseSetupOptions`, auto-generating seed if absent. |
| `resolveSetupOptions()` | function | Fills in defaults for a `MultiplayerSetupOptions`. |
| `GamePhase` | type | Union literal `'setup' | 'playing' | 'ended'`. |
| `PlayerInfo` | interface | Holds `name` and numeric `score` for one player. |
| `GameState<T>` | interface | Generic top-level state container: phase, players, turn index, per-player state array, optional winner. |
| `GameStateOptions<T>` | type | Options bag for `createGameState()`. |
| `createGameState()` | function | Factory that builds an initial `GameState<T>` (deprecated in favor of direct construction). |
| `HasCurrentPlayer<P>` | interface | Constraint requiring `currentPlayerIndex` and `playerStates: P[]`. |
| `getCurrentPlayer()` | function | Returns the `PlayerInfo` for the active player. |
| `getCurrentPlayerState()` | function | Returns the per-player state `T` for the active player. |
| `isGameOver()` | function | Predicate: true when `phase === 'ended'`. |
| `isPlaying()` | function | Predicate: true when `phase === 'playing'`. |
| `advanceTurn()` | function | Increments `currentPlayerIndex` modulo player count, emits `turnStarted`. |
| `transitionTo()` | function | Sets `phase` to any `GamePhase` value. |
| `startGame()` | function | Sets phase to `'playing'` and emits `turnStarted` for the first player. |
| `endGame()` | function | Sets phase to `'ended'`, records winner, emits `gameEnded`. |
| `Command` | interface | Undo/redo contract: `execute()` and `undo()` methods. |
| `CompoundCommand` | class | Groups multiple `Command` objects into a single atomic undo/redo unit. |
| `UndoRedoManager` | class | Unlimited linear undo/redo stack; tracks `canUndo`/`canRedo`, exposes `execute`, `undo`, `redo`, `clear`. |
| `StoredTranscript` | type | Shape of a persisted transcript (id, date, payload). |
| `TranscriptStoreOptions` | type | Config for `TranscriptStore` (DB name, store name, max items). |
| `TranscriptStore` | class | IndexedDB-backed (localStorage fallback) rolling-window transcript persistence with `save`, `list`, `load`, `delete`. |
| `GameEventMap` | type | Map of 21 typed event names to their payload types. |
| `GameEventName` | type | Union of all 21 event-name string literals. |
| `GameEventListener` | type | Callback signature for a given event name. |
| `GameEventEmitter` | class | Typed, zero-dependency pub/sub emitter: `on`, `off`, `emit`, supports all 21 game events. |
| 21 event payload types | types | `TurnStartedPayload`, `TurnCompletedPayload`, `AnimationCompletePayload`, `StateSettledPayload`, `GameEndedPayload`, `CardDrawnPayload`, `CardFlippedPayload`, `CardSwappedPayload`, `CardDiscardedPayload`, `UIInteractionPayload`, `CardToFoundationPayload`, `CardToTableauPayload`, `CardPickupPayload`, `CardSnapBackPayload`, `AutoCompleteStartPayload`, `AutoCompleteCardPayload`, `UndoPayload`, `RedoPayload`, `CardSelectedPayload`, `CardDeselectedPayload`, `DealCardPayload`. |
| `CardSnapshot` | type | Serializable snapshot of a card (rank, suit, faceUp). |
| `snapshotCard()` | function | Creates a `CardSnapshot` from a `Card`. |
| `BaseTranscript<TInitialState, TEvent, TResult>` | interface | Generic transcript shape: initial state, ordered events, optional result. |
| `TranscriptRecorderBase<T>` | abstract class | Base recorder that timestamps events, snapshots initial state, and serializes to `BaseTranscript<T>`. |
| `PhaserLikeEventEmitter` | interface | Minimal `on`/`off`/`emit` contract matching Phaser's event API. |
| `PhaserEventBridge` | class | Bidirectional bridge that forwards events between `GameEventEmitter` and a Phaser `EventEmitter`. |
| `SoundPlayer` | interface | Minimal `play(key)` contract for sound playback. |
| `EventSoundMapping` | type | Record mapping `GameEventName` to sound-asset keys. |
| `StorageLike` | interface | Minimal `getItem`/`setItem` contract for mute-state persistence. |
| `SoundManagerOptions` | type | Config for `SoundManager` (player, mapping, storage, mute key). |
| `SoundManager` | class | Listens to `GameEventEmitter` events and plays mapped sounds; supports mute toggle with persistence. |
| `createSeededRng()` | function | Returns a deterministic LCG-based `() => number` PRNG from a numeric seed. |
| `autoSaveTranscript()` | function | Convenience helper that saves a transcript to `TranscriptStore` with a single call. |

### Card System (`src/card-system/`)

| Export | Kind | Description |
|--------|------|-------------|
| `CARD_SYSTEM_VERSION` | constant | Module version string (`'0.1.0'`). |
| `Card` | interface | Standard playing card: `rank: Rank`, `suit: Suit`, `faceUp: boolean`. |
| `Rank` | type | Union of `'A' | '2' | ... | 'K'` (13 values). |
| `Suit` | type | Union of `'hearts' | 'diamonds' | 'clubs' | 'spades'`. |
| `RANKS` | constant | Readonly array of all 13 ranks. |
| `SUITS` | constant | Readonly array of all 4 suits. |
| `createCard()` | function | Factory: `(rank, suit, faceUp?) => Card`. |
| `createStandardDeck()` | function | Returns a 52-card deck (all combinations of `RANKS` x `SUITS`), all face-down by default. |
| `createDeckFrom()` | function | Creates a deck from an array of `{rank, suit}` specs. |
| `shuffleArray()` | function | Fisher-Yates in-place shuffle using a provided `() => number` RNG. |
| `shuffle()` | function | Deprecated alias for `shuffleArray()`. |
| `draw()` | function | Pops the top card from an array, returns `undefined` if empty. |
| `drawOrThrow()` | function | Same as `draw()` but throws if the array is empty. |
| `rankValue()` | function | Maps a `Rank` to a number: A=0, 2=1, ..., K=12. |
| `Pile<T=Card>` | class | Generic LIFO stack: `push`, `pop`, `popOrThrow`, `peek`, `isEmpty`, `size`, `toArray`, `clear`. |

### Rule Engine (`src/rule-engine/`)

| Export | Kind | Description |
|--------|------|-------------|
| `RULE_ENGINE_VERSION` | constant | Module version string (`'0.1.0'`). |
| `LegalityResult` | type | Discriminated union: `{ legal: true }` or `{ legal: false; reason: string }`. Used for move validation. |

### AI (`src/ai/`)

| Export | Kind | Description |
|--------|------|-------------|
| `AiStrategyBase` | interface | Minimal strategy contract: just a `name: string` property. |
| `AiPlayer<TStrategy>` | class | Binds a strategy instance to an RNG; exposes `strategy`, `strategyName`, and `rng`. |
| `pickRandom()` | function | Uniformly selects one element from an array using a provided RNG. |
| `pickBest()` | function | Selects the highest-scoring element (with random tie-breaking) using a scoring function and RNG. |

### UI (`src/ui/`)

| Export | Kind | Description |
|--------|------|-------------|
| `UI_VERSION` | constant | Module version string (`'0.1.0'`). |
| `CardGameScene` | abstract class | Extends `Phaser.Scene`; wires up `GameEventEmitter`, `SoundManager`, help/settings panels, replay-mode detection, `stateSettled` emission, and shutdown cleanup. Base class for all game scenes. |
| `PhaseManager<T>` | class | Generic turn-phase state machine; displays status text, fires callbacks on transitions. |
| `PhaseManagerConfig` | type | Config for `PhaseManager` (phases, initial phase, text object, callbacks). |
| `flipCard()` | function | Two-phase scaleX tween that visually flips a card sprite, with optional positional translation. |
| `FlipCardOptions` | type | Options for `flipCard()`. |
| `shakeIllegalMove()` | function | Red-tint + horizontal-shake feedback animation for illegal moves. |
| `ShakeIllegalMoveOptions` | type | Options for `shakeIllegalMove()`. |
| `moveGameObject()` | function | Positional tween wrapper for moving any Phaser game object. |
| `MoveGameObjectOptions` | type | Options for `moveGameObject()`. |
| `layoutCardPositions()` | function | Computes evenly-spaced or compressed X positions for a row of cards, centered around a midpoint. |
| `LayoutCardPositionsOptions` | type | Options: count, startX, spacing, maxWidth, cardWidth. |
| `LayoutCardPositionsResult` | type | Result: array of x positions + effective spacing. |
| `createCardGame()` | function | Shared Phaser `Game` factory with standard resolution, scale mode, and scene config. |
| `CardGameOptions` | type | Options for `createCardGame()`. |
| `HelpPanel` | class | Full-screen overlay panel displaying help sections with scrollable content. |
| `HelpSection` | type | `{ title: string; body: string }` for help content. |
| `HelpPanelConfig` | type | Config for `HelpPanel` (sections, styling). |
| `DEPTH_HELP_BUTTON` | constant | Z-depth for the help button. |
| `HelpButton` | class | Clickable "?" button that toggles the `HelpPanel`. |
| `HelpButtonConfig` | type | Config for `HelpButton` (position, panel config). |
| `SettingsPanel` | class | Full-screen overlay for settings (currently: mute toggle). |
| `SettingsPanelConfig` | type | Config for `SettingsPanel`. |
| `DEPTH_SETTINGS_BUTTON` | constant | Z-depth for the settings button. |
| `SettingsButton` | class | Gear-icon button that toggles the `SettingsPanel`. |
| `SettingsButtonConfig` | type | Config for `SettingsButton`. |
| `GameSelectorScene` | class | Landing-page scene that displays a menu of available games. |
| `REGISTRY_KEY_GAMES` | constant | Phaser registry key used to pass game entries to `GameSelectorScene`. |
| `GameEntry` | type | `{ title: string; sceneKey: string; description?: string }` for the selector menu. |
| `CARD_W`, `CARD_H` | constants | Standard card dimensions in pixels (48x65). |
| `GAME_W`, `GAME_H` | constants | Default game canvas dimensions (1280x720). |
| `FONT_FAMILY` | constant | Default font family string. |
| `rankFileName()` | function | Maps a `Rank` to the corresponding SVG filename component. |
| `cardTextureKey()` | function | Returns the Phaser texture key for a given rank+suit. |
| `cardFileName()` | function | Returns the full asset path for a card SVG. |
| `getCardTexture()` | function | Returns the texture key for a `Card`, accounting for face-up/face-down. |
| `preloadCardAssets()` | function | Preloads all 52 card-face SVGs plus the card-back SVG into the Phaser asset cache. |
| `createOverlayButton()` | function | Factory for styled overlay buttons with hover effects. |
| `OverlayButtonConfig` | type | Config for `createOverlayButton()`. |
| `OVERLAY_BUTTON_COLOR`, `OVERLAY_BUTTON_HOVER_COLOR`, `OVERLAY_BUTTON_FONT_SIZE` | constants | Default overlay button styling values. |
| `createOverlayBackground()` | function | Creates a semi-transparent fullscreen background with optional centered box. |
| `dismissOverlay()` | function | Destroys all overlay game objects and optionally runs a callback. |
| `OverlayBackgroundOptions`, `OverlayBoxOptions`, `OverlayResult` | types | Options/result types for the overlay system. |
| `createOverlayMenuButton()` | function | Creates a "Main Menu" button pre-configured for overlays. |
| `TEXT_DPR` | constant | Device-pixel-ratio multiplier for hi-DPI text rendering. |
| `createSceneTitle()` | function | Creates a styled title text at the standard header position. |
| `createSceneMenuButton()` | function | Creates a "Menu" button at the standard header position. |
| `createSceneHeader()` | function | Convenience: creates both title + menu button in one call. |
| `SCENE_HEADER_Y`, `SCENE_MENU_BUTTON_X` | constants | Standard Y and X positions for the scene header area. |
| Various styling constants | constants | Font sizes, colors for header elements. |
| `SceneTitleConfig`, `SceneMenuButtonConfig`, `SceneHeaderResult` | types | Config/result types for the scene header system. |

---

## 2. Existing Example Games

### Gym (`example-games/gym/`)
A curated suite of interactive demo scenes, each demonstrating a specific core-engine feature. Replaces the original minimal Hello World scene with comprehensive, testable demos.

- **Engine APIs used:** `createStandardDeck`, `shuffleArray`, `createSeededRng`, `Pile`, `UndoRedoManager`, `CompoundCommand`, `TranscriptRecorderBase`, `SaveLoadStore`, `SoundManager`, `GameEventEmitter`, `createOverlayBackground`, `dismissOverlay`, `createSceneHeader`
- **Notable patterns:** Each scene is self-contained; deterministic headless smoke tests for every demonstrated API; event-driven UI with live state display.

### Golf (`example-games/golf/`)
A 2-player card game where each player has a 5x4 grid of mostly face-down cards. Players take turns swapping grid cards with drawn cards or discarding, aiming for the lowest total. Features a column-clearing bonus, stock/discard draw mechanic, and a full AI opponent with Random and Greedy strategies.

- **Engine APIs used:** `Card`, `createStandardDeck`, `shuffleArray`, `draw`, `rankValue`, `createSeededRng`, `MultiplayerSetupOptions`, `resolveSetupOptions`, `GameState`, `advanceTurn`, `endGame`, `GameEventEmitter`, `PhaserEventBridge`, `TranscriptRecorderBase`, `TranscriptStore`, `autoSaveTranscript`, `SoundManager`, `AiPlayer`, `pickRandom`, `CardGameScene`, `flipCard`, `shakeIllegalMove`, `layoutCardPositions`, `preloadCardAssets`, `HelpPanel`, `SettingsPanel`, overlay helpers, `createSceneHeader`
- **Notable patterns:** First game to use the full transcript/replay pipeline end-to-end; separate `GolfMockScene` for headless testing; AI strategies as pluggable objects; event-driven animation sequencing.

### Beleaguered Castle (`example-games/beleaguered-castle/`)
A classic single-player patience/solitaire game with 4 foundations (building A-K by suit) and 8 tableau columns (all cards face-up). Features drag-and-drop plus click-to-move dual input, full undo/redo, auto-move heuristics, and auto-complete detection for trivially winnable positions.

- **Engine APIs used:** `Card`, `Pile`, `createStandardDeck`, `shuffleArray`, `rankValue`, `createSeededRng`, `BaseSetupOptions`, `resolveBaseSetupOptions`, `UndoRedoManager`, `Command`, `CompoundCommand`, `GameEventEmitter`, `TranscriptRecorderBase`, `SoundManager`, `EventSoundMapping`, `CardGameScene`, `preloadCardAssets`, `cardTextureKey`, `flipCard`, `shakeIllegalMove`, `HelpPanel`, `SettingsPanel`, overlay helpers, `createSceneHeader`
- **Notable patterns:** `MoveCommand`/`AutoMoveCommand` command pattern for undo/redo; `hasValuableMoves()` one-ply lookahead for stuck detection; `isTriviallyWinnable()` auto-complete heuristic; replay mode with `loadBoardState()`; most complex single-player example and closest to "The Build"'s single-player architecture.

### Sushi Go! (`example-games/sushi-go/`)
A 2-player card-drafting game with 108 custom-typed cards (8 types). Players simultaneously draft cards over 3 rounds, with complex per-category scoring (set collection, diminishing returns, majority bonuses).

- **Engine APIs used:** `shuffleArray`, `MultiplayerSetupOptions`, `resolveSetupOptions`, `CardGameScene`, `PhaseManager`, `layoutCardPositions`, `TranscriptRecorderBase`, `TranscriptStore`, `autoSaveTranscript`, `SoundManager`, `AiPlayer`, `pickRandom`, `HelpPanel`, `SettingsPanel`, overlay/button helpers, `createSceneHeader`
- **Notable patterns:** Completely custom card types (not standard `Card` interface); custom card rendering as colored rectangles with icons; chopsticks two-card pick mechanic; tooltip system; first game to use `PhaseManager` for multi-phase turns. Demonstrates that the engine supports arbitrary card types beyond standard playing cards.

### Feudalism (`example-games/feudalism/`)
A 2-player engine-building game with 90 development cards across 3 tiers, gem tokens, noble tiles, and a 15-prestige win threshold. **The closest existing example to a "buildy" resource-management game.**

- **Engine APIs used:** `shuffleArray`, `MultiplayerSetupOptions`, `resolveSetupOptions`, `getCurrentPlayer`, `CardGameScene`, `AiPlayer`, `pickRandom`, `TranscriptRecorderBase`, overlay helpers, `createSceneHeader`, `HelpPanel`, `SettingsPanel`
- **Notable patterns:** Resource economy system (`ResourceTokens` with add/subtract helpers); market system (3 tier decks with 4 visible each); purchase validation with bonus discounts and gold wildcards; token limit (10) with discard mechanic; noble auto-visit; final-round trigger; `GreedyStrategy` AI with noble-progress scoring. Most relevant precedent for "The Build."

### Lost Cities (`example-games/lost-cities/`)
A 2-player expedition card game with 60 custom cards (5 colors, investment multipliers + numbered 2-10), played over 3 rounds. Features two-phase turns and ascending-play constraints.

- **Engine APIs used:** `shuffleArray`, `MultiplayerSetupOptions`, `resolveSetupOptions`, `LegalityResult`, `CardGameScene`, `AiPlayer`, `pickRandom`, `TranscriptRecorderBase`, overlay helpers, `createSceneHeader`, `HelpPanel`, `SettingsPanel`
- **Notable patterns:** Only game to use `LegalityResult` from rule-engine; two-phase turn system; discard-then-draw restriction enforcement; `VisibleState` for information hiding; opponent draw-history tracking for AI; investment multiplier scoring.

---

## 3. Minor Extensions (< 1 day each)

### 3.1 Generic Resource/Token Container
**What:** Extract Feudalism's `ResourceTokens` helper (add/subtract/canAfford/total) into a generic `ResourceBank<K extends string>` class in `src/core-engine/` that works with any set of named resource types.
**How it helps "The Build":** A crafty/buildy game needs resource tracking (wood, stone, iron, food, etc.). A generic container avoids every game re-implementing arithmetic and validation for named resources.
**Effort:** ~4 hours.

### 3.2 Card Zone / Named Pile Registry
**What:** Create a `Zone` or `CardZone` abstraction in `src/card-system/` that associates a string name with a `Pile<T>`, along with a `ZoneRegistry` to look up zones by name.
**How it helps "The Build":** Buildy games have many distinct card areas (construction sites, supply markets, completed buildings, player tableaux). A registry makes state management, serialization, and rule checking much cleaner.
**Effort:** ~3-4 hours.

### 3.3 Weighted / Conditional `pickBest` with Multiple Criteria
**What:** Extend `pickBest()` in `src/ai/` to accept a vector of weighted scoring functions (or a composite scorer builder) rather than a single `(item) => number`.
**How it helps "The Build":** AI for a buildy game must balance multiple objectives (resource efficiency, building chain value, end-game scoring). A multi-criteria scorer simplifies strategy authoring.
**Effort:** ~3 hours.

### 3.4 Timer / Countdown Utility for Timed Phases
**What:** Create a reusable `GameTimer` class in `src/core-engine/` that emits `tick`, `expired`, and `paused` events through the `GameEventEmitter`.
**How it helps "The Build":** Timed building phases, production cycles, or real-time market events become trivial to implement with a shared timer that integrates with the existing event system.
**Effort:** ~4 hours.

### 3.5 Tooltip / Info-Card Popover Component
**What:** Extract Sushi Go's tooltip rendering into a reusable `Tooltip` UI component in `src/ui/` that accepts arbitrary content and positions itself relative to a target game object.
**How it helps "The Build":** Cards in a crafty game have rich data (costs, production values, chain bonuses, flavor text). A shared tooltip system avoids every game re-implementing hover-info display.
**Effort:** ~4-5 hours.

### 3.6 Drag-and-Drop Mixin / Helper
**What:** Extract Beleaguered Castle's drag-and-drop input handling (pickup, snap-back, valid-drop-zone highlighting) into a composable helper or mixin in `src/ui/` that any scene can apply to card sprites.
**How it helps "The Build":** Dragging cards from a hand to a construction zone, or resources from a supply to a recipe slot, is fundamental to a buildy card game's UX.
**Effort:** ~5-6 hours.

---

## 4. Major Gaps (Multi-day Efforts)

### 4.1 Resource Economy & Production Engine
**What:** A first-class subsystem for defining resources, production chains, recipes/costs, and conversion rules. Includes: `Resource` type definitions, a `Recipe` type (`inputs -> outputs`), a `ProductionResolver` that validates and executes recipes against a player's resource bank, and event integration (`resourceProduced`, `resourceConsumed`).
**Why "The Build" needs it:** The core loop of a buildy/crafty game is "gather resources, convert them into buildings/upgrades, earn victory points." No existing engine module handles production chains, recipe validation, or resource transformation.
**Effort:** ~3-5 days.

### 4.2 Declarative Rule Engine (Beyond LegalityResult)
**What:** The current rule-engine module exports only a single type (`LegalityResult`). It needs: a `Rule` interface with `evaluate(state, action) => LegalityResult`, a `RuleSet` container that composes multiple rules, a `RuleEvaluator` that runs all applicable rules against a proposed action, and event integration.
**Why "The Build" needs it:** A crafty card game has many interacting constraints (building prerequisites, resource minimums, placement adjacency rules, turn-phase restrictions). Without a declarative rule framework, all validation is scattered as ad-hoc `if` statements.
**Effort:** ~4-6 days.

### 4.3 Tableau / Persistent-Card-Area System
**What:** A subsystem for managing persistent card areas where played cards remain visible and provide ongoing effects. Includes: a `Tableau` container, an `EffectResolver` for continuous/triggered/activated card effects each turn, and a `CardEffect` type system supporting modifiers, triggers, and activated abilities.
**Why "The Build" needs it:** The defining feature of a tableau-building game is that cards stay in play and create an engine of ongoing effects. The current engine has no concept of persistent card effects -- all games treat played cards as static scoring tokens.
**Effort:** ~5-8 days.

### 4.4 Market / Supply Row with Dynamic Replenishment
**What:** A reusable `Market<T>` component managing a row of N visible cards from a supply deck, with configurable replenishment, purchase/acquisition rules, and optional pricing. Includes both data model and UI renderer.
**Why "The Build" needs it:** Feudalism hard-codes its 3-tier market. A buildy game needs a central market where players acquire cards. This needs to be configurable and reusable.
**Effort:** ~3-4 days.

### 4.5 Save/Load & Campaign Persistence
**What:** A serialization framework for snapshots and restoration of complete game state (not just transcripts). Includes: `Serializer<T>` interface, `SaveManager`, save-slot management, and optional campaign-level persistence (cross-game progression, unlocks, statistics).
**Why "The Build" needs it:** Current transcript recording cannot restore mid-game state. A buildy game with 20-30 minute sessions needs save/resume. Campaign mode is a strong engagement hook.
**Effort:** ~4-6 days.

### 4.6 Card-Effect / Modifier Pipeline
**What:** A pipeline system processing card effects in defined order, supporting modifiers (temporary and permanent stat changes), interrupts (cancel/redirect effects), and chains (one effect triggering another).
**Why "The Build" needs it:** In a crafty tableau game, multiple cards interact simultaneously -- a building produces resources, triggering a bonus from another card, reducing the cost of a third. Without a formal pipeline, these become untestable nested callbacks.
**Effort:** ~5-7 days.

### 4.7 Multiplayer Scaling (3-4+ Players)
**What:** True N-player support. While `GameState` supports N players in theory, every example game is hard-coded for exactly 2 players. Requires: validated >2 player setup, adaptive UI layouts, N-way AI strategies.
**Why "The Build" needs it:** Not immediately -- "The Build" is single-player. But validating N-player support prevents painting the engine into a corner for future games.
**Effort:** ~3-5 days.

---

## 5. Reusability Assessment

| Gap | Effort | Games That Benefit | Rationale |
|-----|--------|--------------------|-----------|
| **Resource Economy & Production Engine** | 3-5 days | 4-6 future games | Any game with crafting, engine-building, or resource conversion. Retroactively simplifies Feudalism's gem system. |
| **Declarative Rule Engine** | 4-6 days | All future games | Every card game needs move validation. Replaces scattered `if` statements in all existing and future games. Highest reuse potential. |
| **Tableau / Persistent-Card-Area System** | 5-8 days | 3-5 future games | Core to any tableau-builder (the engine's namesake): Wingspan-like, Race for the Galaxy-like, Imperial Settlers-like. |
| **Market / Supply Row** | 3-4 days | 4-5 future games | Central to most modern card games. Retroactively cleans up Feudalism's hard-coded market. |
| **Save/Load & Campaign Persistence** | 4-6 days | All future games | Every game benefits from save/resume. Campaign persistence enables roguelike deck-builders. |
| **Card-Effect / Modifier Pipeline** | 5-7 days | 3-4 future games | Essential for any game where cards have ongoing effects, triggers, or modifiers. |
| **Multiplayer Scaling (3-4+ Players)** | 3-5 days | 5-6 future games | Most tabletop card games support 3-4 players. Unlocks the majority of board-game adaptations. |

### Priority Recommendation for "The Build"

For a buildy/crafty/simulation card game, the recommended implementation order is:

1. **Declarative Rule Engine** -- foundation that everything else builds on; highest cross-game reuse.
2. **Resource Economy & Production Engine** -- the core gameplay loop of any crafty game.
3. **Tableau / Persistent-Card-Area System** -- the engine's namesake feature and defining mechanic.
4. **Market / Supply Row** -- the primary card-acquisition mechanism.
5. **Card-Effect / Modifier Pipeline** -- enables rich card interactions (can be deferred to v2 if initial cards are simple).
6. **Save/Load & Campaign Persistence** -- quality-of-life; can ship MVP without it.
7. **Multiplayer Scaling** -- can ship as single-player first; extend later.
