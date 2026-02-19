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
