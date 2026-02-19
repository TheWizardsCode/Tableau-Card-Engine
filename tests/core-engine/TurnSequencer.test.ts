import { describe, it, expect } from 'vitest';
import { createGameState } from '../../src/core-engine/GameState';
import type { GameState } from '../../src/core-engine/GameState';
import {
  getCurrentPlayer,
  getCurrentPlayerState,
  isGameOver,
  isPlaying,
  advanceTurn,
  transitionTo,
  startGame,
  endGame,
} from '../../src/core-engine/TurnSequencer';

/** Helper: two-player game in playing phase. */
function playingGame(): GameState<number> {
  return createGameState<number>({
    players: [
      { name: 'Human', isAI: false },
      { name: 'Bot', isAI: true },
    ],
    createPlayerState: (i) => i * 10,
    initialPhase: 'playing',
  });
}

/** Helper: two-player game in setup phase. */
function setupGame(): GameState<number> {
  return createGameState<number>({
    players: [
      { name: 'Human', isAI: false },
      { name: 'Bot', isAI: true },
    ],
    createPlayerState: () => 0,
  });
}

describe('TurnSequencer', () => {
  describe('getCurrentPlayer', () => {
    it('should return the active player info', () => {
      const state = playingGame();
      const player = getCurrentPlayer(state);
      expect(player.name).toBe('Human');
      expect(player.isAI).toBe(false);
    });

    it('should reflect changes after advancing turn', () => {
      const state = playingGame();
      advanceTurn(state);
      const player = getCurrentPlayer(state);
      expect(player.name).toBe('Bot');
      expect(player.isAI).toBe(true);
    });
  });

  describe('getCurrentPlayerState', () => {
    it('should return the active player state', () => {
      const state = playingGame();
      expect(getCurrentPlayerState(state)).toBe(0);
    });

    it('should reflect the correct player after advancing', () => {
      const state = playingGame();
      advanceTurn(state);
      expect(getCurrentPlayerState(state)).toBe(10);
    });
  });

  describe('isGameOver', () => {
    it('should return false during setup', () => {
      expect(isGameOver(setupGame())).toBe(false);
    });

    it('should return false during playing', () => {
      expect(isGameOver(playingGame())).toBe(false);
    });

    it('should return true when ended', () => {
      const state = playingGame();
      endGame(state);
      expect(isGameOver(state)).toBe(true);
    });
  });

  describe('isPlaying', () => {
    it('should return false during setup', () => {
      expect(isPlaying(setupGame())).toBe(false);
    });

    it('should return true during playing', () => {
      expect(isPlaying(playingGame())).toBe(true);
    });

    it('should return false when ended', () => {
      const state = playingGame();
      endGame(state);
      expect(isPlaying(state)).toBe(false);
    });
  });

  describe('advanceTurn', () => {
    it('should rotate to next player', () => {
      const state = playingGame();
      expect(state.currentPlayerIndex).toBe(0);

      advanceTurn(state);
      expect(state.currentPlayerIndex).toBe(1);
    });

    it('should wrap around to first player', () => {
      const state = playingGame();
      advanceTurn(state); // -> player 1
      advanceTurn(state); // -> player 0
      expect(state.currentPlayerIndex).toBe(0);
    });

    it('should increment the turn counter', () => {
      const state = playingGame();
      expect(state.turnNumber).toBe(0);

      advanceTurn(state);
      expect(state.turnNumber).toBe(1);

      advanceTurn(state);
      expect(state.turnNumber).toBe(2);
    });

    it('should work with 3+ players', () => {
      const state = createGameState<number>({
        players: [
          { name: 'A', isAI: false },
          { name: 'B', isAI: false },
          { name: 'C', isAI: true },
        ],
        createPlayerState: () => 0,
        initialPhase: 'playing',
      });

      advanceTurn(state); // -> 1
      expect(state.currentPlayerIndex).toBe(1);
      advanceTurn(state); // -> 2
      expect(state.currentPlayerIndex).toBe(2);
      advanceTurn(state); // -> 0
      expect(state.currentPlayerIndex).toBe(0);
    });

    it('should throw if game has ended', () => {
      const state = playingGame();
      endGame(state);
      expect(() => advanceTurn(state)).toThrow('game has ended');
    });

    it('should throw during setup phase', () => {
      const state = setupGame();
      expect(() => advanceTurn(state)).toThrow('setup phase');
    });
  });

  describe('transitionTo', () => {
    it('should transition from setup to playing', () => {
      const state = setupGame();
      transitionTo(state, 'playing');
      expect(state.phase).toBe('playing');
    });

    it('should transition from playing to ended', () => {
      const state = playingGame();
      transitionTo(state, 'ended');
      expect(state.phase).toBe('ended');
    });

    it('should transition from setup to ended (abort)', () => {
      const state = setupGame();
      transitionTo(state, 'ended');
      expect(state.phase).toBe('ended');
    });

    it('should throw when transitioning to same phase', () => {
      const state = playingGame();
      expect(() => transitionTo(state, 'playing')).toThrow(
        'already in phase',
      );
    });

    it('should throw on invalid transition: ended -> playing', () => {
      const state = playingGame();
      endGame(state);
      expect(() => transitionTo(state, 'playing')).toThrow(
        'Invalid phase transition',
      );
    });

    it('should throw on invalid transition: ended -> setup', () => {
      const state = playingGame();
      endGame(state);
      expect(() => transitionTo(state, 'setup')).toThrow(
        'Invalid phase transition',
      );
    });

    it('should throw on invalid transition: playing -> setup', () => {
      const state = playingGame();
      expect(() => transitionTo(state, 'setup')).toThrow(
        'Invalid phase transition',
      );
    });
  });

  describe('startGame', () => {
    it('should transition from setup to playing', () => {
      const state = setupGame();
      startGame(state);
      expect(state.phase).toBe('playing');
    });

    it('should throw if already playing', () => {
      const state = playingGame();
      expect(() => startGame(state)).toThrow('already in phase');
    });
  });

  describe('endGame', () => {
    it('should transition from playing to ended', () => {
      const state = playingGame();
      endGame(state);
      expect(state.phase).toBe('ended');
    });

    it('should transition from setup to ended', () => {
      const state = setupGame();
      endGame(state);
      expect(state.phase).toBe('ended');
    });

    it('should throw if already ended', () => {
      const state = playingGame();
      endGame(state);
      expect(() => endGame(state)).toThrow('already in phase');
    });
  });

  describe('2-player turn alternation integration', () => {
    it('should alternate turns correctly over a full round', () => {
      const state = setupGame();
      startGame(state);

      // Turn 0: Human's turn
      expect(getCurrentPlayer(state).name).toBe('Human');
      expect(state.turnNumber).toBe(0);

      advanceTurn(state);

      // Turn 1: Bot's turn
      expect(getCurrentPlayer(state).name).toBe('Bot');
      expect(state.turnNumber).toBe(1);

      advanceTurn(state);

      // Turn 2: Human again
      expect(getCurrentPlayer(state).name).toBe('Human');
      expect(state.turnNumber).toBe(2);

      advanceTurn(state);

      // Turn 3: Bot again
      expect(getCurrentPlayer(state).name).toBe('Bot');
      expect(state.turnNumber).toBe(3);

      // End the game
      endGame(state);
      expect(isGameOver(state)).toBe(true);
      expect(() => advanceTurn(state)).toThrow();
    });
  });
});
