/**
 * Tests for GolfGame -- game setup, legal move enumeration, and turn execution.
 */

import { describe, it, expect } from 'vitest';
import {
  setupGolfGame,
  enumerateLegalMoves,
  enumerateDrawSources,
  executeTurn,
} from '../../example-games/golf/GolfGame';
import { countFaceUp, isGridFullyRevealed } from '../../example-games/golf/GolfGrid';
import { createCard } from '../../src/card-system/Card';
import { createGolfGrid } from '../../example-games/golf/GolfGrid';
import type { GolfSharedState } from '../../example-games/golf/GolfGame';
import { Pile } from '../../src/card-system/Pile';
import { createRoundEndState } from '../../example-games/golf/GolfRules';

// Deterministic RNG for testing (simple LCG)
function createTestRng(seed: number = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('setupGolfGame', () => {
  it('creates a 2-player game by default', () => {
    const session = setupGolfGame({ rng: createTestRng() });
    expect(session.gameState.players).toHaveLength(2);
    expect(session.gameState.playerStates).toHaveLength(2);
    expect(session.gameState.phase).toBe('playing');
    expect(session.gameState.currentPlayerIndex).toBe(0);
    expect(session.gameState.turnNumber).toBe(0);
  });

  it('deals 9 cards per player', () => {
    const session = setupGolfGame({ rng: createTestRng() });
    for (const ps of session.gameState.playerStates) {
      expect(ps.grid).toHaveLength(9);
    }
  });

  it('reveals 3 cards per player initially', () => {
    const session = setupGolfGame({ rng: createTestRng() });
    for (const ps of session.gameState.playerStates) {
      expect(countFaceUp(ps.grid)).toBe(3);
    }
  });

  it('has a non-empty discard pile with a face-up card', () => {
    const session = setupGolfGame({ rng: createTestRng() });
    expect(session.shared.discardPile.isEmpty()).toBe(false);
    const top = session.shared.discardPile.peek()!;
    expect(top.faceUp).toBe(true);
  });

  it('has remaining stock after dealing', () => {
    const session = setupGolfGame({ rng: createTestRng() });
    // 52 - 9*2 (dealt) - 1 (discard) = 33
    expect(session.shared.stockPile.length).toBe(33);
  });

  it('sets player names and AI flags', () => {
    const session = setupGolfGame({
      playerNames: ['Alice', 'Bot'],
      isAI: [false, true],
      rng: createTestRng(),
    });
    expect(session.gameState.players[0].name).toBe('Alice');
    expect(session.gameState.players[0].isAI).toBe(false);
    expect(session.gameState.players[1].name).toBe('Bot');
    expect(session.gameState.players[1].isAI).toBe(true);
  });

  it('supports custom initial reveals', () => {
    const session = setupGolfGame({
      rng: createTestRng(),
      initialReveals: [
        [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }],
        [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
      ],
    });
    // Player 0: bottom row revealed
    const g0 = session.gameState.playerStates[0].grid;
    expect(g0[6].faceUp).toBe(true);
    expect(g0[7].faceUp).toBe(true);
    expect(g0[8].faceUp).toBe(true);
    expect(g0[0].faceUp).toBe(false);

    // Player 1: middle row revealed
    const g1 = session.gameState.playerStates[1].grid;
    expect(g1[3].faceUp).toBe(true);
    expect(g1[4].faceUp).toBe(true);
    expect(g1[5].faceUp).toBe(true);
    expect(g1[0].faceUp).toBe(false);
  });
});

describe('enumerateLegalMoves', () => {
  it('returns 9 swap + 6 discard-and-flip moves for a grid with 3 face-up cards', () => {
    const session = setupGolfGame({ rng: createTestRng() });
    const grid = session.gameState.playerStates[0].grid;
    // 3 face-up, 6 face-down
    const moves = enumerateLegalMoves(grid);
    const swaps = moves.filter((m) => m.kind === 'swap');
    const daf = moves.filter((m) => m.kind === 'discard-and-flip');
    expect(swaps).toHaveLength(9); // can swap any position
    expect(daf).toHaveLength(6); // can only flip face-down cards
    expect(moves).toHaveLength(15);
  });

  it('returns 9 swap + 0 discard-and-flip for a fully revealed grid', () => {
    // All face-up
    const cards = Array.from({ length: 9 }, () =>
      createCard('A', 'clubs', true),
    );
    const grid = createGolfGrid(cards);
    const moves = enumerateLegalMoves(grid);
    const swaps = moves.filter((m) => m.kind === 'swap');
    const daf = moves.filter((m) => m.kind === 'discard-and-flip');
    expect(swaps).toHaveLength(9);
    expect(daf).toHaveLength(0);
  });
});

describe('enumerateDrawSources', () => {
  it('returns both sources when discard pile is non-empty', () => {
    const shared: GolfSharedState = {
      stockPile: [createCard('A', 'clubs')],
      discardPile: new Pile([createCard('K', 'hearts', true)]),
      roundEnd: createRoundEndState(2),
    };
    const sources = enumerateDrawSources(shared);
    expect(sources).toContain('stock');
    expect(sources).toContain('discard');
  });

  it('returns only stock when discard pile is empty', () => {
    const shared: GolfSharedState = {
      stockPile: [createCard('A', 'clubs')],
      discardPile: new Pile(),
      roundEnd: createRoundEndState(2),
    };
    const sources = enumerateDrawSources(shared);
    expect(sources).toEqual(['stock']);
  });
});

describe('executeTurn', () => {
  it('executes a swap turn from stock', () => {
    const session = setupGolfGame({ rng: createTestRng() });
    const stockSizeBefore = session.shared.stockPile.length;
    const discardSizeBefore = session.shared.discardPile.size();

    const result = executeTurn(session, {
      drawSource: 'stock',
      move: { kind: 'swap', row: 1, col: 0 },
    });

    expect(result.playerIndex).toBe(0);
    expect(result.drawnCard).toBeDefined();
    expect(result.discardedCard).toBeDefined();
    expect(session.shared.stockPile.length).toBe(stockSizeBefore - 1);
    // Discard pile: removed nothing, added 1
    expect(session.shared.discardPile.size()).toBe(discardSizeBefore + 1);
    // Turn advanced
    expect(session.gameState.currentPlayerIndex).toBe(1);
    expect(session.gameState.turnNumber).toBe(1);
  });

  it('executes a discard-and-flip turn from discard pile', () => {
    const session = setupGolfGame({ rng: createTestRng() });
    const discardSizeBefore = session.shared.discardPile.size();

    const result = executeTurn(session, {
      drawSource: 'discard',
      move: { kind: 'discard-and-flip', row: 1, col: 0 },
    });

    expect(result.playerIndex).toBe(0);
    // Drew from discard, then put a card back => net size same
    expect(session.shared.discardPile.size()).toBe(discardSizeBefore);
    // The card at (1,0) should now be face-up
    expect(session.gameState.playerStates[0].grid[3].faceUp).toBe(true);
  });

  it('ends the round when all final turns are taken', () => {
    const rng = createTestRng();
    const session = setupGolfGame({ rng });

    // Force player 0's grid to be mostly face-up (6 more to reveal)
    const grid0 = session.gameState.playerStates[0].grid;
    for (let i = 0; i < 9; i++) {
      grid0[i].faceUp = true;
    }
    // Make one face-down so we can control the trigger
    grid0[8].faceUp = false;

    // Player 0 flips the last card -> triggers final turns
    executeTurn(session, {
      drawSource: 'stock',
      move: { kind: 'swap', row: 2, col: 2 },
    });

    // Player 0's grid should be fully revealed now
    expect(isGridFullyRevealed(session.gameState.playerStates[0].grid)).toBe(true);
    // Game not ended yet -- player 1 still needs a final turn
    expect(session.gameState.phase).toBe('playing');

    // Player 1 takes their final turn
    const finalResult = executeTurn(session, {
      drawSource: 'stock',
      move: { kind: 'swap', row: 0, col: 0 },
    });

    expect(finalResult.roundEnded).toBe(true);
    expect(session.gameState.phase).toBe('ended');
  });
});
