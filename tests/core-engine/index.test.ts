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
  createSeededRng,
  SaveLoadStore,
  serializeWithVersion,
  deserializeWithVersion,
  selectChallenges,
  evaluateChallenges,
  createPresetLookup,
  getPresetNames,
  Grid,
  neighbors,
  shortestPath,
  pathExists,
  computeAdjacencyBonus,
  makeTextureKey,
  rasteriseSvgToTexture,
  getOrCreateTexture,
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

  it('should export createSeededRng', () => {
    expect(typeof createSeededRng).toBe('function');
    const rng = createSeededRng(42);
    const val = rng();
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(1);
  });

  it('should export save/load infrastructure', () => {
    expect(typeof SaveLoadStore).toBe('function');
    expect(typeof serializeWithVersion).toBe('function');
    expect(typeof deserializeWithVersion).toBe('function');
  });

  it('should export challenge system functions', () => {
    expect(typeof selectChallenges).toBe('function');
    expect(typeof evaluateChallenges).toBe('function');
  });

  it('should export difficulty presets functions', () => {
    expect(typeof createPresetLookup).toBe('function');
    expect(typeof getPresetNames).toBe('function');
  });

  it('should export spatial rules primitives', () => {
    expect(typeof Grid).toBe('function');
    expect(typeof neighbors).toBe('function');
    expect(typeof shortestPath).toBe('function');
    expect(typeof pathExists).toBe('function');
    expect(typeof computeAdjacencyBonus).toBe('function');
  });

  it('should export SVG helper functions', () => {
    expect(typeof makeTextureKey).toBe('function');
    expect(typeof rasteriseSvgToTexture).toBe('function');
    expect(typeof getOrCreateTexture).toBe('function');
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
