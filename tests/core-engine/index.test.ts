import { describe, it, expect } from 'vitest';
import {
  ENGINE_VERSION,
  createGameState,
  getCurrentPlayer,
  getCurrentPlayerState,
  isGameOver,
  isPlaying,
  advanceTurn,
  transitionTo,
  startGame,
  endGame,
  UndoRedoManager,
  CompoundCommand,
} from '../../src/core-engine/index';

describe('core-engine barrel exports', () => {
  it('should export the module version', () => {
    expect(ENGINE_VERSION).toBe('0.1.0');
  });

  it('should export createGameState', () => {
    expect(typeof createGameState).toBe('function');
  });

  it('should export turn sequencer functions', () => {
    expect(typeof getCurrentPlayer).toBe('function');
    expect(typeof getCurrentPlayerState).toBe('function');
    expect(typeof isGameOver).toBe('function');
    expect(typeof isPlaying).toBe('function');
    expect(typeof advanceTurn).toBe('function');
    expect(typeof transitionTo).toBe('function');
    expect(typeof startGame).toBe('function');
    expect(typeof endGame).toBe('function');
  });

  it('should export UndoRedoManager and CompoundCommand', () => {
    expect(typeof UndoRedoManager).toBe('function');
    expect(typeof CompoundCommand).toBe('function');
  });

  it('should work end-to-end through barrel exports', () => {
    const state = createGameState<null>({
      players: [
        { name: 'P1', isAI: false },
        { name: 'P2', isAI: true },
      ],
      createPlayerState: () => null,
    });

    expect(isPlaying(state)).toBe(false);
    startGame(state);
    expect(isPlaying(state)).toBe(true);
    expect(getCurrentPlayer(state).name).toBe('P1');

    advanceTurn(state);
    expect(getCurrentPlayer(state).name).toBe('P2');

    endGame(state);
    expect(isGameOver(state)).toBe(true);
  });
});
