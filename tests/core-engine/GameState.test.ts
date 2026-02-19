import { describe, it, expect } from 'vitest';
import { createGameState } from '../../src/core-engine/GameState';
import type { PlayerInfo } from '../../src/core-engine/GameState';

/** Helper: two-player setup. */
function twoPlayers(): PlayerInfo[] {
  return [
    { name: 'Human', isAI: false },
    { name: 'Bot', isAI: true },
  ];
}

describe('GameState', () => {
  describe('createGameState', () => {
    it('should create state with default options', () => {
      const state = createGameState<number>({
        players: twoPlayers(),
        createPlayerState: () => 0,
      });

      expect(state.players).toHaveLength(2);
      expect(state.playerStates).toHaveLength(2);
      expect(state.currentPlayerIndex).toBe(0);
      expect(state.phase).toBe('setup');
      expect(state.turnNumber).toBe(0);
    });

    it('should use the provided initial phase', () => {
      const state = createGameState<number>({
        players: twoPlayers(),
        createPlayerState: () => 0,
        initialPhase: 'playing',
      });

      expect(state.phase).toBe('playing');
    });

    it('should use the provided first player index', () => {
      const state = createGameState<number>({
        players: twoPlayers(),
        createPlayerState: () => 0,
        firstPlayerIndex: 1,
      });

      expect(state.currentPlayerIndex).toBe(1);
    });

    it('should call createPlayerState for each player', () => {
      const state = createGameState<string>({
        players: twoPlayers(),
        createPlayerState: (i) => `player-${i}`,
      });

      expect(state.playerStates[0]).toBe('player-0');
      expect(state.playerStates[1]).toBe('player-1');
    });

    it('should throw if fewer than 2 players', () => {
      expect(() =>
        createGameState<number>({
          players: [{ name: 'Solo', isAI: false }],
          createPlayerState: () => 0,
        }),
      ).not.toThrow();
    });

    it('should throw if no players', () => {
      expect(() =>
        createGameState<number>({
          players: [],
          createPlayerState: () => 0,
        }),
      ).toThrow('at least 1 player');
    });

    it('should throw if firstPlayerIndex is out of bounds', () => {
      expect(() =>
        createGameState<number>({
          players: twoPlayers(),
          createPlayerState: () => 0,
          firstPlayerIndex: 5,
        }),
      ).toThrow('out of bounds');
    });

    it('should throw if firstPlayerIndex is negative', () => {
      expect(() =>
        createGameState<number>({
          players: twoPlayers(),
          createPlayerState: () => 0,
          firstPlayerIndex: -1,
        }),
      ).toThrow('out of bounds');
    });

    it('should support more than 2 players', () => {
      const players: PlayerInfo[] = [
        { name: 'Alice', isAI: false },
        { name: 'Bob', isAI: false },
        { name: 'Charlie', isAI: true },
      ];
      const state = createGameState<number>({
        players,
        createPlayerState: () => 0,
      });

      expect(state.players).toHaveLength(3);
      expect(state.playerStates).toHaveLength(3);
    });

    it('should preserve player info', () => {
      const state = createGameState<number>({
        players: twoPlayers(),
        createPlayerState: () => 0,
      });

      expect(state.players[0].name).toBe('Human');
      expect(state.players[0].isAI).toBe(false);
      expect(state.players[1].name).toBe('Bot');
      expect(state.players[1].isAI).toBe(true);
    });

    it('should create state with a single player', () => {
      const state = createGameState<number>({
        players: [{ name: 'Solo', isAI: false }],
        createPlayerState: () => 42,
      });

      expect(state.players).toHaveLength(1);
      expect(state.playerStates).toHaveLength(1);
      expect(state.playerStates[0]).toBe(42);
      expect(state.currentPlayerIndex).toBe(0);
      expect(state.phase).toBe('setup');
      expect(state.turnNumber).toBe(0);
    });

    it('should preserve single player info', () => {
      const state = createGameState<number>({
        players: [{ name: 'Solo', isAI: false }],
        createPlayerState: () => 0,
      });

      expect(state.players[0].name).toBe('Solo');
      expect(state.players[0].isAI).toBe(false);
    });
  });
});
