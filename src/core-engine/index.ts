/**
 * Core Engine Module
 *
 * Provides foundational framework functionalities including
 * game loop management, state management, and rendering helpers.
 */
export const ENGINE_VERSION = '0.1.0';

// Game state types and factory
export type { GamePhase, PlayerInfo, GameState, GameStateOptions } from './GameState';
export { createGameState } from './GameState';

// Turn sequencer functions
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

// Phaser event bridge
export type { PhaserLikeEventEmitter } from './PhaserEventBridge';
export { PhaserEventBridge } from './PhaserEventBridge';

// Sound management
export type { SoundPlayer, EventSoundMapping, StorageLike, SoundManagerOptions } from './SoundManager';
export { SoundManager } from './SoundManager';
