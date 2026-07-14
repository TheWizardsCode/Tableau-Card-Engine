import { describe, it, expect } from 'vitest';
import { createCard } from '../../src/card-system/Card';
import { createGolfGrid } from '../../example-games/golf/GolfGrid';
import type { GolfGrid } from '../../example-games/golf/GolfGrid';
import {
  checkMoveLegality,
  isLegalMove,
  applyMove,
  checkInitialReveal,
  applyInitialReveal,
  createRoundEndState,
  checkRoundEnd,
  isInFinalTurns,
  needsFinalTurn,
} from '../../example-games/golf/GolfRules';
import type { GolfMove } from '../../example-games/golf/GolfRules';

/** Helper: create a 9-card grid, all face-down. */
function makeGrid(): GolfGrid {
  return createGolfGrid([
    createCard('A', 'spades'),
    createCard('2', 'hearts'),
    createCard('3', 'diamonds'),
    createCard('4', 'clubs'),
    createCard('5', 'spades'),
    createCard('6', 'hearts'),
    createCard('7', 'diamonds'),
    createCard('8', 'clubs'),
    createCard('9', 'spades'),
  ]);
}

/** Helper: create a grid with all cards face-up. */
function makeRevealedGrid(): GolfGrid {
  return createGolfGrid([
    createCard('A', 'spades', true),
    createCard('2', 'hearts', true),
    createCard('3', 'diamonds', true),
    createCard('4', 'clubs', true),
    createCard('5', 'spades', true),
    createCard('6', 'hearts', true),
    createCard('7', 'diamonds', true),
    createCard('8', 'clubs', true),
    createCard('9', 'spades', true),
  ]);
}

describe('GolfRules', () => {
  describe('checkMoveLegality', () => {
    it('should accept a valid swap move', () => {
      const grid = makeGrid();
      const move: GolfMove = { kind: 'swap', row: 1, col: 1 };
      const result = checkMoveLegality(grid, move);
      expect(result.legal).toBe(true);
    });

    it('should accept a valid discard-and-flip on a face-down card', () => {
      const grid = makeGrid();
      const move: GolfMove = { kind: 'discard-and-flip', row: 0, col: 0 };
      const result = checkMoveLegality(grid, move);
      expect(result.legal).toBe(true);
    });

    it('should reject discard-and-flip on a face-up card', () => {
      const grid = makeGrid();
      grid[0].faceUp = true; // (0,0) is now face-up
      const move: GolfMove = { kind: 'discard-and-flip', row: 0, col: 0 };
      const result = checkMoveLegality(grid, move);
      expect(result.legal).toBe(false);
      expect(result.legal === false && result.reason).toContain('already face-up');
    });

    it('should reject out-of-bounds positions', () => {
      const grid = makeGrid();
      const move: GolfMove = { kind: 'swap', row: 3, col: 0 };
      const result = checkMoveLegality(grid, move);
      expect(result.legal).toBe(false);
      expect(result.legal === false && result.reason).toContain('out of bounds');
    });

    it('should reject negative positions', () => {
      const grid = makeGrid();
      const move: GolfMove = { kind: 'swap', row: -1, col: 0 };
      const result = checkMoveLegality(grid, move);
      expect(result.legal).toBe(false);
    });

    it('should allow swap on a face-up card (replacing it)', () => {
      const grid = makeGrid();
      grid[4].faceUp = true; // (1,1) is face-up
      const move: GolfMove = { kind: 'swap', row: 1, col: 1 };
      expect(isLegalMove(grid, move)).toBe(true);
    });
  });

  describe('isLegalMove', () => {
    it('should return true for legal moves', () => {
      expect(isLegalMove(makeGrid(), { kind: 'swap', row: 0, col: 0 })).toBe(true);
    });

    it('should return false for illegal moves', () => {
      expect(isLegalMove(makeGrid(), { kind: 'swap', row: 5, col: 0 })).toBe(false);
    });
  });

  describe('applyMove', () => {
    it('should swap a drawn card into the grid (swap move)', () => {
      const grid = makeGrid();
      const drawnCard = createCard('K', 'hearts');
      const result = applyMove(grid, drawnCard, { kind: 'swap', row: 0, col: 0 });

      // The old card (A of spades) should be discarded
      expect(result.discardedCard.rank).toBe('A');
      expect(result.discardedCard.suit).toBe('spades');
      expect(result.discardedCard.faceUp).toBe(true);

      // The drawn card should now be in the grid at (0,0)
      expect(grid[0].rank).toBe('K');
      expect(grid[0].suit).toBe('hearts');
      expect(grid[0].faceUp).toBe(true);
    });

    it('should discard drawn card and flip grid card (discard-and-flip)', () => {
      const grid = makeGrid();
      const drawnCard = createCard('Q', 'diamonds');
      const result = applyMove(grid, drawnCard, {
        kind: 'discard-and-flip',
        row: 1,
        col: 2,
      });

      // The drawn card should be discarded
      expect(result.discardedCard.rank).toBe('Q');
      expect(result.discardedCard.faceUp).toBe(true);

      // The grid card at (1,2) = index 5 should be flipped face-up
      expect(grid[5].faceUp).toBe(true);
      expect(grid[5].rank).toBe('6'); // original card unchanged
    });

    it('should throw on an illegal move', () => {
      const grid = makeGrid();
      grid[0].faceUp = true;
      const drawnCard = createCard('K', 'hearts');
      expect(() =>
        applyMove(grid, drawnCard, { kind: 'discard-and-flip', row: 0, col: 0 }),
      ).toThrow('Illegal move');
    });
  });

  describe('initialReveal', () => {
    it('should accept flipping exactly 3 face-down cards', () => {
      const grid = makeGrid();
      const positions = [
        { row: 0, col: 0 },
        { row: 1, col: 1 },
        { row: 2, col: 2 },
      ];
      const result = checkInitialReveal(grid, positions);
      expect(result.legal).toBe(true);
    });

    it('should reject fewer than 3 positions', () => {
      const grid = makeGrid();
      const result = checkInitialReveal(grid, [{ row: 0, col: 0 }]);
      expect(result.legal).toBe(false);
    });

    it('should reject more than 3 positions', () => {
      const grid = makeGrid();
      const positions = [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
        { row: 1, col: 0 },
      ];
      const result = checkInitialReveal(grid, positions);
      expect(result.legal).toBe(false);
    });

    it('should reject duplicate positions', () => {
      const grid = makeGrid();
      const positions = [
        { row: 0, col: 0 },
        { row: 0, col: 0 },
        { row: 1, col: 1 },
      ];
      const result = checkInitialReveal(grid, positions);
      expect(result.legal).toBe(false);
    });

    it('should reject out-of-bounds positions', () => {
      const grid = makeGrid();
      const positions = [
        { row: 0, col: 0 },
        { row: 3, col: 0 },
        { row: 1, col: 1 },
      ];
      const result = checkInitialReveal(grid, positions);
      expect(result.legal).toBe(false);
    });

    it('should apply reveal and flip cards face-up', () => {
      const grid = makeGrid();
      applyInitialReveal(grid, [
        { row: 0, col: 0 },
        { row: 1, col: 1 },
        { row: 2, col: 2 },
      ]);
      expect(grid[0].faceUp).toBe(true);
      expect(grid[4].faceUp).toBe(true);
      expect(grid[8].faceUp).toBe(true);
      // Others still face-down
      expect(grid[1].faceUp).toBe(false);
      expect(grid[3].faceUp).toBe(false);
    });

    it('should throw on illegal reveal', () => {
      const grid = makeGrid();
      expect(() => applyInitialReveal(grid, [])).toThrow('Illegal initial reveal');
    });
  });

  describe('round ending', () => {
    it('should not end when no player is fully revealed', () => {
      const roundEnd = createRoundEndState(2);
      const grid = makeGrid(); // all face-down
      expect(checkRoundEnd(roundEnd, 0, grid)).toBe(false);
      expect(isInFinalTurns(roundEnd)).toBe(false);
    });

    it('should trigger final turns when a player reveals all cards', () => {
      const roundEnd = createRoundEndState(2);
      const revealedGrid = makeRevealedGrid();

      // Player 0 finishes their grid
      const ended = checkRoundEnd(roundEnd, 0, revealedGrid);
      expect(ended).toBe(false); // not over yet, player 1 gets a final turn
      expect(isInFinalTurns(roundEnd)).toBe(true);
      expect(roundEnd.triggeringPlayerIndex).toBe(0);
      expect(needsFinalTurn(roundEnd, 1)).toBe(true);
      expect(needsFinalTurn(roundEnd, 0)).toBe(false);
    });

    it('should end the round after all other players take final turns', () => {
      const roundEnd = createRoundEndState(2);
      const revealedGrid = makeRevealedGrid();
      const partialGrid = makeGrid();

      // Player 0 reveals all cards
      checkRoundEnd(roundEnd, 0, revealedGrid);

      // Player 1 takes their final turn
      const ended = checkRoundEnd(roundEnd, 1, partialGrid);
      expect(ended).toBe(true);
    });

    it('should handle 3 players correctly', () => {
      const roundEnd = createRoundEndState(3);
      const revealedGrid = makeRevealedGrid();
      const partialGrid = makeGrid();

      // Player 1 reveals all cards
      checkRoundEnd(roundEnd, 1, revealedGrid);
      expect(needsFinalTurn(roundEnd, 0)).toBe(true);
      expect(needsFinalTurn(roundEnd, 1)).toBe(false);
      expect(needsFinalTurn(roundEnd, 2)).toBe(true);

      // Player 2 takes final turn
      let ended = checkRoundEnd(roundEnd, 2, partialGrid);
      expect(ended).toBe(false); // player 0 still needs their turn

      // Player 0 takes final turn
      ended = checkRoundEnd(roundEnd, 0, partialGrid);
      expect(ended).toBe(true);
    });
  });
});
