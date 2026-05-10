/**
 * Core Engine Module
 *
 * Provides foundational framework functionalities including
 * game loop management, state management, and rendering helpers.
 */
export const ENGINE_VERSION = '0.1.0';

// Shared setup option types and helpers
export type { BaseSetupOptions, MultiplayerSetupOptions, ResolvedBaseSetup, ResolvedSetup } from './SetupOptions';
export { resolveBaseSetupOptions, resolveSetupOptions } from './SetupOptions';

// Game state types and factory
export type { GamePhase, PlayerInfo, GameState, GameStateOptions } from './GameState';
export { createGameState } from './GameState';

// Turn sequencer functions
export type { HasCurrentPlayer } from './TurnSequencer';
export {
  getCurrentPlayer,
  getCurrentPlayerState,
  isGameOver,
  isPlaying,
  advanceTurn,
  transitionTo,
  startGame,
  endGame,
} from './TurnSequencer';

// Undo/Redo system
export type { Command } from './UndoRedoManager';
export { CompoundCommand, UndoRedoManager } from './UndoRedoManager';

// Transcript persistence
export type { StoredTranscript, TranscriptStoreOptions } from './TranscriptStore';
export { TranscriptStore } from './TranscriptStore';

// Save/load persistence
export type {
  SaveDomain,
  StoredSave,
  SaveLoadStoreOptions,
  VersionedPayload,
  SaveSerializer,
} from './SaveLoad';
export {
  SaveLoadStore,
  serializeWithVersion,
  deserializeWithVersion,
} from './SaveLoad';

// Game event system
export type {
  TurnStartedPayload,
  TurnCompletedPayload,
  AnimationCompletePayload,
  StateSettledPayload,
  GameEndedPayload,
  CardDrawnPayload,
  CardFlippedPayload,
  CardSwappedPayload,
  CardDiscardedPayload,
  UIInteractionPayload,
  CardToFoundationPayload,
  CardToTableauPayload,
  CardPickupPayload,
  CardSnapBackPayload,
  AutoCompleteStartPayload,
  AutoCompleteCardPayload,
  UndoPayload,
  RedoPayload,
  CardSelectedPayload,
  CardDeselectedPayload,
  DealCardPayload,
  GameEventMap,
  GameEventName,
  GameEventListener,
} from './GameEventEmitter';
export { GameEventEmitter } from './GameEventEmitter';

// Shared transcript snapshot types
export type { CardSnapshot } from './TranscriptTypes';
export { snapshotCard } from './TranscriptTypes';

// Shared transcript recorder base
export type { BaseTranscript } from './TranscriptRecorder';
export { TranscriptRecorderBase } from './TranscriptRecorder';

// Phaser event bridge
export type { PhaserLikeEventEmitter } from './PhaserEventBridge';
export { PhaserEventBridge } from './PhaserEventBridge';

// Sound management
export type { SoundPlayer, EventSoundMapping, StorageLike, SoundManagerOptions } from './SoundManager';
export { SoundManager } from './SoundManager';

// ToneForge runtime adapter
export type {
  TfVoice,
  TfFactory,
  TfGeneratedModule,
  TfAdapterLogger,
  CreateTfPlayerOptions,
  TfPlayer,
} from './tfAdapter';
export { createTfPlayer } from './tfAdapter';

// Seeded RNG factory
export { createSeededRng } from './SeededRng';

// Transcript auto-save helper
export { autoSaveTranscript } from './autoSaveTranscript';

// Challenge system generic API (CG-0MMJ8S9850MV4L0A)
export type {
  ChallengeDefinition,
  ActiveChallengeRecord,
  ChallengeCompletionCallback,
} from './ChallengeSystem';
export {
  selectChallenges,
  evaluateChallenges,
} from './ChallengeSystem';

// Difficulty presets generic API (CG-0MMJ8S9850MV4L0A)
export type {
  DifficultyConfig,
  DifficultyPresetRegistry,
} from './DifficultyPresets';
export {
  createPresetLookup,
  getPresetNames,
} from './DifficultyPresets';

// Spatial rules API (CG-0MM5ZG7071KO7PVG)
export type {
  Position,
  DistanceMetric,
  NeighborOptions,
  PathOptions,
  PathExistsOptions,
  AdjacencyBonusOptions,
  AdjacencyPredicate,
} from './SpatialRules';
export {
  Grid,
  neighbors,
  shortestPath,
  pathExists,
  computeAdjacencyBonus,
} from './SpatialRules';

// Shared SVG rasterisation helpers (CG-0MOZNXU4Y0043NR3)
export {
  markSceneValid,
  markSceneInvalid,
  fetchSvgText,
  makeTextureKey,
  rasteriseSvgToTexture,
  getOrCreateTexture,
} from './SvgHelpers';
