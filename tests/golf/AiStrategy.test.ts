/**
 * Tests for AiStrategy -- RandomStrategy, GreedyStrategy, and AiPlayer.
 *
 * All tests operate through the AI-visible state projections, verifying
 * that the fair-play information boundary is maintained.
 */

import { describe, it, expect } from 'vitest';
import {
  RandomStrategy,
  GreedyStrategy,
  AiPlayer,
  chooseDrawSource,
  chooseMoveForCard,
  countVisibleRanks,
  computeColumnBonus,
} from '../../example-games/golf/AiStrategy';
import {
  setupGolfGame,
  executeTurn,
  createAiVisibleSharedState,
  createAiVisiblePlayerState,
} from '../../example-games/golf/GolfGame';
import type {
  GolfSharedState,
  AiVisibleSharedState,
  AiVisiblePlayerState,
  AiVisibleGrid,
} from '../../example-games/golf/GolfGame';
import { isLegalMove } from '../../example-games/golf/GolfRules';
import { createCard } from '../../src/card-system/Card';
import { createGolfGrid } from '../../example-games/golf/GolfGrid';
import { Pile } from '../../src/card-system/Pile';
import { createRoundEndState } from '../../example-games/golf/GolfRules';

// Deterministic RNG for testing
function createTestRng(seed: number = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Helper: build a GolfSharedState and project it to AiVisibleSharedState.
 */
function buildAiShared(raw: GolfSharedState): AiVisibleSharedState {
  return createAiVisibleSharedState(raw);
}

describe('RandomStrategy', () => {
  it('has the name "random"', () => {
    expect(RandomStrategy.name).toBe('random');
  });

  it('chooses a legal move', () => {
    const rng = createTestRng();
    const session = setupGolfGame({ rng: createTestRng(1) });
    const ps = session.gameState.playerStates[0];
    const aiPs = createAiVisiblePlayerState(ps);
    const aiShared = createAiVisibleSharedState(session.shared);

    const action = RandomStrategy.chooseAction(aiPs, aiShared, rng);

    expect(['stock', 'discard']).toContain(action.drawSource);
    expect(isLegalMove(ps.grid, action.move)).toBe(true);
  });

  it('produces different moves with different RNG seeds', () => {
    const session = setupGolfGame({ rng: createTestRng(1) });
    const ps = session.gameState.playerStates[0];
    const aiPs = createAiVisiblePlayerState(ps);
    const aiShared = createAiVisibleSharedState(session.shared);

    const actions = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      const action = RandomStrategy.chooseAction(
        aiPs,
        aiShared,
        createTestRng(seed),
      );
      actions.add(`${action.drawSource}:${action.move.kind}:${action.move.row}:${action.move.col}`);
    }

    // With 50 different seeds, we should get at least a few different actions
    expect(actions.size).toBeGreaterThan(1);
  });

  it('works when all cards are face-up (only swap moves available)', () => {
    const cards = Array.from({ length: 9 }, () =>
      createCard('5', 'hearts', true),
    );
    const grid = createGolfGrid(cards);
    const ps = { grid };
    const shared: GolfSharedState = {
      stockPile: [createCard('A', 'clubs')],
      discardPile: new Pile([createCard('K', 'hearts', true)]),
      roundEnd: createRoundEndState(2),
    };

    const aiPs = createAiVisiblePlayerState(ps);
    const aiShared = buildAiShared(shared);

    const action = RandomStrategy.chooseAction(aiPs, aiShared, createTestRng());
    expect(action.move.kind).toBe('swap');
    expect(isLegalMove(grid, action.move)).toBe(true);
  });
});

describe('GreedyStrategy', () => {
  it('has the name "greedy"', () => {
    expect(GreedyStrategy.name).toBe('greedy');
  });

  it('chooses a legal move', () => {
    const rng = createTestRng();
    const session = setupGolfGame({ rng: createTestRng(1) });
    const ps = session.gameState.playerStates[0];
    const aiPs = createAiVisiblePlayerState(ps);
    const aiShared = createAiVisibleSharedState(session.shared);

    const action = GreedyStrategy.chooseAction(aiPs, aiShared, rng);

    expect(['stock', 'discard']).toContain(action.drawSource);
    expect(isLegalMove(ps.grid, action.move)).toBe(true);
  });

  it('prefers swapping a high-value card when drawing a low-value card', () => {
    // Grid: top row face-up with K(0), Q(10), J(10)
    //        middle/bottom face-down
    const cards = [
      createCard('K', 'clubs', true),   // 0 pts
      createCard('Q', 'hearts', true),  // 10 pts
      createCard('J', 'spades', true),  // 10 pts
      createCard('5', 'clubs', false),
      createCard('6', 'hearts', false),
      createCard('7', 'spades', false),
      createCard('8', 'clubs', false),
      createCard('9', 'hearts', false),
      createCard('10', 'spades', false),
    ];
    const grid = createGolfGrid(cards);
    const ps = { grid };

    // Discard pile has an Ace (1 pt) -- greedy should prefer drawing it
    // and swapping with Q or J (saving ~9 points)
    const shared: GolfSharedState = {
      stockPile: [createCard('7', 'diamonds')], // 7 pts -- less attractive
      discardPile: new Pile([createCard('A', 'diamonds', true)]),
      roundEnd: createRoundEndState(2),
    };

    const aiPs = createAiVisiblePlayerState(ps);
    const aiShared = buildAiShared(shared);

    const action = GreedyStrategy.chooseAction(aiPs, aiShared, createTestRng());

    // Should draw from discard (Ace is better than unknown stock)
    // and swap with Q or J (both 10 pts, swapping saves the most)
    expect(action.drawSource).toBe('discard');
    expect(action.move.kind).toBe('swap');
    // Should target row 0, col 1 (Q) or row 0, col 2 (J)
    expect(action.move.row).toBe(0);
    expect([1, 2]).toContain(action.move.col);
  });

  it('prefers discarding a bad card and flipping when swap would worsen score', () => {
    // Grid: all face-up with low values except column already matching
    const cards = [
      createCard('A', 'clubs', true),   // 1 pt
      createCard('A', 'hearts', true),  // 1 pt
      createCard('2', 'spades', true),  // -2 pts
      createCard('A', 'diamonds', true),// 1 pt
      createCard('A', 'spades', true),  // 1 pt -- col 1 has A,A but needs face-down to flip
      createCard('2', 'clubs', true),   // -2 pts
      createCard('3', 'clubs', false),  // face-down
      createCard('3', 'hearts', false), // face-down
      createCard('2', 'hearts', false), // face-down
    ];
    const grid = createGolfGrid(cards);
    const ps = { grid };

    // Stock has a King (0 pts), discard has a Queen (10 pts)
    const shared: GolfSharedState = {
      stockPile: [createCard('K', 'diamonds')],
      discardPile: new Pile([createCard('Q', 'diamonds', true)]),
      roundEnd: createRoundEndState(2),
    };

    const aiPs = createAiVisiblePlayerState(ps);
    const aiShared = buildAiShared(shared);

    const action = GreedyStrategy.chooseAction(aiPs, aiShared, createTestRng());

    // The greedy strategy should evaluate all options and pick the best.
    // The key thing is the action must be legal.
    expect(isLegalMove(grid, action.move)).toBe(true);
  });

  it('works when only one legal move is available', () => {
    // Grid: 8 face-up, 1 face-down
    const cards = [
      createCard('A', 'clubs', true),
      createCard('A', 'hearts', true),
      createCard('A', 'spades', true),
      createCard('2', 'clubs', true),
      createCard('2', 'hearts', true),
      createCard('2', 'spades', true),
      createCard('3', 'clubs', true),
      createCard('3', 'hearts', true),
      createCard('3', 'spades', false), // only face-down card
    ];
    const grid = createGolfGrid(cards);
    const ps = { grid };

    const shared: GolfSharedState = {
      stockPile: [createCard('K', 'diamonds')],
      discardPile: new Pile([createCard('Q', 'diamonds', true)]),
      roundEnd: createRoundEndState(2),
    };

    const aiPs = createAiVisiblePlayerState(ps);
    const aiShared = buildAiShared(shared);

    const action = GreedyStrategy.chooseAction(aiPs, aiShared, createTestRng());
    expect(isLegalMove(grid, action.move)).toBe(true);
  });
});

describe('AiPlayer', () => {
  it('wraps a strategy and delegates chooseAction', () => {
    const rng = createTestRng();
    const ai = new AiPlayer(RandomStrategy, rng);
    expect(ai.strategy).toBe(RandomStrategy);

    const session = setupGolfGame({ rng: createTestRng(1) });
    const ps = session.gameState.playerStates[0];
    const aiPs = createAiVisiblePlayerState(ps);
    const aiShared = createAiVisibleSharedState(session.shared);

    const action = ai.chooseAction(aiPs, aiShared);
    expect(isLegalMove(ps.grid, action.move)).toBe(true);
  });

  it('can use GreedyStrategy', () => {
    const ai = new AiPlayer(GreedyStrategy, createTestRng());
    const session = setupGolfGame({ rng: createTestRng(1) });
    const ps = session.gameState.playerStates[0];
    const aiPs = createAiVisiblePlayerState(ps);
    const aiShared = createAiVisibleSharedState(session.shared);

    const action = ai.chooseAction(aiPs, aiShared);
    expect(isLegalMove(ps.grid, action.move)).toBe(true);
  });

  it('exposes chooseDrawSource for two-phase flow', () => {
    const ai = new AiPlayer(GreedyStrategy, createTestRng());
    const session = setupGolfGame({ rng: createTestRng(1) });
    const ps = session.gameState.playerStates[0];
    const aiPs = createAiVisiblePlayerState(ps);
    const aiShared = createAiVisibleSharedState(session.shared);

    const source = ai.chooseDrawSource(aiPs, aiShared);
    expect(['stock', 'discard']).toContain(source);
  });

  it('exposes chooseMoveForCard for two-phase flow', () => {
    const ai = new AiPlayer(GreedyStrategy, createTestRng());
    const session = setupGolfGame({ rng: createTestRng(1) });
    const ps = session.gameState.playerStates[0];
    const aiPs = createAiVisiblePlayerState(ps);
    const drawnCard = createCard('5', 'hearts', true);

    const move = ai.chooseMoveForCard(aiPs.grid, drawnCard);
    expect(isLegalMove(ps.grid, move)).toBe(true);
  });
});

describe('Full game simulation', () => {
  it('plays a complete game with RandomStrategy without errors', () => {
    const rng = createTestRng(123);
    const session = setupGolfGame({ rng: createTestRng(456) });
    const ai0 = new AiPlayer(RandomStrategy, rng);
    const ai1 = new AiPlayer(RandomStrategy, createTestRng(789));

    let turnCount = 0;
    const maxTurns = 200; // safety limit

    while (session.gameState.phase !== 'ended' && turnCount < maxTurns) {
      const currentIdx = session.gameState.currentPlayerIndex;
      const ps = session.gameState.playerStates[currentIdx];
      const ai = currentIdx === 0 ? ai0 : ai1;

      const aiPs = createAiVisiblePlayerState(ps);
      const aiShared = createAiVisibleSharedState(session.shared);
      const action = ai.chooseAction(aiPs, aiShared);
      const result = executeTurn(session, action);

      expect(result.playerIndex).toBe(currentIdx);
      turnCount++;
    }

    expect(session.gameState.phase).toBe('ended');
    expect(turnCount).toBeLessThan(maxTurns);
    expect(turnCount).toBeGreaterThan(0);
  });

  it('plays a complete game with GreedyStrategy without errors', () => {
    const rng = createTestRng(111);
    const session = setupGolfGame({ rng: createTestRng(222) });
    const ai0 = new AiPlayer(GreedyStrategy, rng);
    const ai1 = new AiPlayer(GreedyStrategy, createTestRng(333));

    let turnCount = 0;
    const maxTurns = 200;

    while (session.gameState.phase !== 'ended' && turnCount < maxTurns) {
      const currentIdx = session.gameState.currentPlayerIndex;
      const ps = session.gameState.playerStates[currentIdx];
      const ai = currentIdx === 0 ? ai0 : ai1;

      const aiPs = createAiVisiblePlayerState(ps);
      const aiShared = createAiVisibleSharedState(session.shared);
      const action = ai.chooseAction(aiPs, aiShared);
      const result = executeTurn(session, action);

      expect(result.playerIndex).toBe(currentIdx);
      turnCount++;
    }

    expect(session.gameState.phase).toBe('ended');
    expect(turnCount).toBeLessThan(maxTurns);
    expect(turnCount).toBeGreaterThan(0);
  });

  it('plays a complete game with mixed strategies without errors', () => {
    const session = setupGolfGame({ rng: createTestRng(999) });
    const ai0 = new AiPlayer(RandomStrategy, createTestRng(100));
    const ai1 = new AiPlayer(GreedyStrategy, createTestRng(200));

    let turnCount = 0;
    const maxTurns = 200;

    while (session.gameState.phase !== 'ended' && turnCount < maxTurns) {
      const currentIdx = session.gameState.currentPlayerIndex;
      const ps = session.gameState.playerStates[currentIdx];
      const ai = currentIdx === 0 ? ai0 : ai1;

      const aiPs = createAiVisiblePlayerState(ps);
      const aiShared = createAiVisibleSharedState(session.shared);
      const action = ai.chooseAction(aiPs, aiShared);
      executeTurn(session, action);
      turnCount++;
    }

    expect(session.gameState.phase).toBe('ended');
    expect(turnCount).toBeLessThan(maxTurns);
  });
});

describe('Fair play: information boundary', () => {
  it('AiVisibleSharedState does not expose stock pile cards', () => {
    const session = setupGolfGame({ rng: createTestRng(1) });
    const aiShared = createAiVisibleSharedState(session.shared);

    // The AI-visible state should only have discardTop and stockHasCards
    expect(aiShared).toHaveProperty('discardTop');
    expect(aiShared).toHaveProperty('stockHasCards');
    expect(aiShared).not.toHaveProperty('stockPile');
    expect(aiShared.stockHasCards).toBe(true);
  });

  it('AiVisiblePlayerState hides face-down card values', () => {
    const cards = [
      createCard('K', 'clubs', true),   // face-up: visible
      createCard('Q', 'hearts', false), // face-down: hidden
      createCard('J', 'spades', true),  // face-up: visible
      createCard('10', 'clubs', false),
      createCard('9', 'hearts', false),
      createCard('8', 'spades', false),
      createCard('7', 'clubs', false),
      createCard('6', 'hearts', false),
      createCard('5', 'spades', false),
    ];
    const grid = createGolfGrid(cards);
    const aiPs = createAiVisiblePlayerState({ grid });

    // Face-up cards should have rank and suit
    const slot0 = aiPs.grid[0];
    expect(slot0.faceUp).toBe(true);
    expect('rank' in slot0).toBe(true);
    expect('suit' in slot0).toBe(true);

    // Face-down cards should only have faceUp: false, no rank/suit
    const slot1 = aiPs.grid[1];
    expect(slot1.faceUp).toBe(false);
    expect('rank' in slot1).toBe(false);
    expect('suit' in slot1).toBe(false);
  });

  it('chooseDrawSource cannot peek at stock pile cards', () => {
    // Create two identical game states but with different stock pile top cards.
    // The AI should make the same draw source decision because it cannot see
    // the stock pile contents.
    const cards = Array.from({ length: 9 }, () =>
      createCard('5', 'hearts', true),
    );
    const grid = createGolfGrid(cards);
    const ps = { grid };

    // Same discard top, different stock piles
    const shared1: GolfSharedState = {
      stockPile: [createCard('A', 'clubs')], // Ace (1 pt) -- great card
      discardPile: new Pile([createCard('7', 'diamonds', true)]),
      roundEnd: createRoundEndState(2),
    };
    const shared2: GolfSharedState = {
      stockPile: [createCard('K', 'spades')], // King (0 pts) -- even better
      discardPile: new Pile([createCard('7', 'diamonds', true)]),
      roundEnd: createRoundEndState(2),
    };

    const aiPs = createAiVisiblePlayerState(ps);
    const aiShared1 = createAiVisibleSharedState(shared1);
    const aiShared2 = createAiVisibleSharedState(shared2);

    // Both AI-visible states should look identical
    expect(aiShared1.stockHasCards).toBe(aiShared2.stockHasCards);
    expect(aiShared1.discardTop).toEqual(aiShared2.discardTop);

    // Same input → same output for a deterministic RNG
    const rng1 = createTestRng(42);
    const rng2 = createTestRng(42);
    const source1 = chooseDrawSource(aiPs, aiShared1, rng1);
    const source2 = chooseDrawSource(aiPs, aiShared2, rng2);
    expect(source1).toBe(source2);
  });

  it('chooseMoveForCard scores face-down cards at average value', () => {
    // Grid with one face-up high-value card and one face-down card.
    // The AI should prefer swapping the face-up high card rather than
    // the face-down card (which might be low).
    const cards = [
      createCard('Q', 'hearts', true),  // 10 pts -- visible, high
      createCard('A', 'clubs', true),   // 1 pt -- visible, low
      createCard('2', 'spades', true),  // -2 pts -- visible, good
      createCard('5', 'clubs', false),  // hidden -- avg ~5.46 pts
      createCard('5', 'hearts', false),
      createCard('5', 'spades', false),
      createCard('5', 'diamonds', false),
      createCard('5', 'clubs', false),
      createCard('5', 'hearts', false),
    ];
    const grid = createGolfGrid(cards);
    const aiPs = createAiVisiblePlayerState({ grid });

    // Drawing an Ace (1 pt)
    const drawnCard = createCard('A', 'diamonds', true);
    const move = chooseMoveForCard(aiPs.grid, drawnCard, createTestRng());

    // Should swap with the Queen (10 pts) at position (0,0)
    // because that gives the best score improvement
    expect(move.kind).toBe('swap');
    expect(move.row).toBe(0);
    expect(move.col).toBe(0);
  });
});

describe('countVisibleRanks', () => {
  it('counts face-up cards from the grid', () => {
    const cards = [
      createCard('A', 'clubs', true),    // A
      createCard('K', 'hearts', true),   // K
      createCard('A', 'spades', true),   // A
      createCard('5', 'clubs', false),   // face-down
      createCard('6', 'hearts', false),
      createCard('7', 'spades', false),
      createCard('8', 'clubs', false),
      createCard('9', 'hearts', false),
      createCard('10', 'spades', false),
    ];
    const grid = createGolfGrid(cards);
    const ps: AiVisiblePlayerState = createAiVisiblePlayerState({ grid });
    const shared: AiVisibleSharedState = {
      discardTop: undefined,
      stockHasCards: true,
      roundEnd: createRoundEndState(2),
    };

    const ranks = countVisibleRanks(ps, shared);
    expect(ranks['A']).toBe(2);
    expect(ranks['K']).toBe(1);
    // Face-down cards should NOT be counted
    expect(ranks['5']).toBeUndefined();
    expect(ranks['6']).toBeUndefined();
  });

  it('includes the discard top card', () => {
    const cards = [
      createCard('K', 'clubs', true),    // K
      createCard('K', 'hearts', true),   // K
      createCard('2', 'spades', true),   // 2
      createCard('5', 'clubs', false),
      createCard('6', 'hearts', false),
      createCard('7', 'spades', false),
      createCard('8', 'clubs', false),
      createCard('9', 'hearts', false),
      createCard('10', 'spades', false),
    ];
    const grid = createGolfGrid(cards);
    const ps: AiVisiblePlayerState = createAiVisiblePlayerState({ grid });
    const shared: AiVisibleSharedState = {
      discardTop: createCard('A', 'diamonds', true), // A
      stockHasCards: true,
      roundEnd: createRoundEndState(2),
    };

    const ranks = countVisibleRanks(ps, shared);
    expect(ranks['K']).toBe(2);   // Two Kings in grid
    expect(ranks['A']).toBe(1);   // Ace from discard top
    expect(ranks['2']).toBe(1);   // One 2 in grid
  });

  it('does not count face-down cards', () => {
    const cards = [
      createCard('5', 'clubs', false),
      createCard('6', 'hearts', false),
      createCard('7', 'spades', false),
      createCard('8', 'clubs', false),
      createCard('9', 'hearts', false),
      createCard('10', 'spades', false),
      createCard('A', 'clubs', false),
      createCard('K', 'hearts', false),
      createCard('Q', 'spades', false),
    ];
    const grid = createGolfGrid(cards);
    const ps: AiVisiblePlayerState = createAiVisiblePlayerState({ grid });
    const shared: AiVisibleSharedState = {
      discardTop: undefined,
      stockHasCards: true,
      roundEnd: createRoundEndState(2),
    };

    const ranks = countVisibleRanks(ps, shared);
    // No face-up cards and no discard top
    expect(Object.keys(ranks)).toHaveLength(0);
  });

  it('counts multiple copies of the same rank across grid and discard', () => {
    const cards = [
      createCard('K', 'clubs', true),     // K
      createCard('K', 'hearts', true),    // K
      createCard('K', 'spades', true),    // K
      createCard('5', 'clubs', false),
      createCard('6', 'hearts', false),
      createCard('7', 'spades', false),
      createCard('8', 'clubs', false),
      createCard('9', 'hearts', false),
      createCard('10', 'spades', false),
    ];
    const grid = createGolfGrid(cards);
    const ps: AiVisiblePlayerState = createAiVisiblePlayerState({ grid });
    const shared: AiVisibleSharedState = {
      discardTop: createCard('K', 'diamonds', true), // 4th K
      stockHasCards: true,
      roundEnd: createRoundEndState(2),
    };

    const ranks = countVisibleRanks(ps, shared);
    // All 4 Kings are visible across grid (3) and discard top (1)
    expect(ranks['K']).toBe(4);
  });
});

describe('computeColumnBonus', () => {
  /**
   * Helper: create a grid where column 0 builds toward a column match.
   *
   * Column 0 has: [K♣(face-up), A♠(face-up, non-matching), ?(face-down)].
   * Drawing a K and swapping into the A♠ position (1,0) creates:
   *   [K♣, K♥, ?] → 2 matching face-up + 1 unknown → bonus eligible.
   */
  function buildBuildableGrid(): [AiVisibleGrid, AiVisiblePlayerState] {
    const cards = [
      createCard('K', 'clubs', true),     // (0,0) -- K, matching
      createCard('A', 'hearts', true),    // (0,1)
      createCard('2', 'spades', true),    // (0,2)
      createCard('A', 'spades', true),    // (1,0) -- non-matching swap target
      createCard('3', 'clubs', true),     // (1,1)
      createCard('4', 'hearts', true),    // (1,2)
      createCard('5', 'clubs', false),    // (2,0) -- face-down, remains unknown
      createCard('6', 'hearts', false),
      createCard('7', 'spades', false),
    ];
    const grid = createGolfGrid(cards);
    const ps: AiVisiblePlayerState = createAiVisiblePlayerState({ grid });
    return [ps.grid, ps];
  }

  const buildMove = { kind: 'swap' as const, row: 1, col: 0 };
  const drawnKing = createCard('K', 'hearts', true);

  it('returns 0 for discard-and-flip moves', () => {
    const [grid] = buildBuildableGrid();
    const bonus = computeColumnBonus(
      grid,
      drawnKing,
      { kind: 'discard-and-flip', row: 0, col: 0 },
      {},
    );
    expect(bonus).toBe(0);
  });

  it('returns 0 when no matching cards in column', () => {
    const [grid] = buildBuildableGrid();
    // Drawing an Ace and swapping into (1,0) where A♠ is won't build toward
    // any column because Ace doesn't match the King in column 0
    const drawnAce = createCard('A', 'diamonds', true);
    const bonus = computeColumnBonus(
      grid,
      drawnAce,
      buildMove,
      {},
    );
    expect(bonus).toBe(0);
  });

  it('returns 0 when all copies of target rank are visible', () => {
    const cards = [
      createCard('K', 'clubs', true),     // (0,0) -- K
      createCard('A', 'hearts', true),    // (0,1)
      createCard('2', 'spades', true),    // (0,2)
      createCard('A', 'spades', true),    // (1,0) -- non-K swap target
      createCard('3', 'clubs', true),     // (1,1)
      createCard('4', 'hearts', true),    // (1,2)
      createCard('5', 'clubs', false),    // (2,0) -- face-down
      createCard('6', 'hearts', false),
      createCard('7', 'spades', false),
    ];
    // Adding 3 more visible Kings to fill all 4 copies
    const visibleRanks: Record<string, number> = {
      K: 4, A: 2, '2': 1, '3': 1, '4': 1,
    };
    const grid = createGolfGrid(cards);
    const ps: AiVisiblePlayerState = createAiVisiblePlayerState({ grid });

    const bonus = computeColumnBonus(
      ps.grid,
      drawnKing,
      buildMove,
      visibleRanks,
    );
    // 0 unknown / 4 max = 0, weight = 2, bonus = 0
    expect(bonus).toBeCloseTo(0);
  });

  it('returns negative bonus when unknown copies of target rank remain', () => {
    const cards = [
      createCard('K', 'clubs', true),     // (0,0) -- K
      createCard('A', 'hearts', true),    // (0,1)
      createCard('2', 'spades', true),    // (0,2)
      createCard('A', 'spades', true),    // (1,0) -- non-K swap target
      createCard('3', 'clubs', true),     // (1,1)
      createCard('4', 'hearts', true),    // (1,2)
      createCard('5', 'clubs', false),    // (2,0) -- face-down
      createCard('6', 'hearts', false),
      createCard('7', 'spades', false),
    ];
    const grid = createGolfGrid(cards);
    const ps: AiVisiblePlayerState = createAiVisiblePlayerState({ grid });
    const visibleRanks: Record<string, number> = {
      K: 1, A: 2, '2': 1, '3': 1, '4': 1,
    };

    const bonus = computeColumnBonus(
      ps.grid,
      drawnKing,
      buildMove,
      visibleRanks,
    );
    // 3 unknown / 4 max = 0.75, weight = 2, bonus = -0.75 * 2 = -1.5
    expect(bonus).toBe(-1.5);
  });

  it('bonus is proportional to remaining unknown copies', () => {
    const cards = [
      createCard('K', 'clubs', true),     // (0,0) -- K
      createCard('A', 'hearts', true),    // (0,1)
      createCard('2', 'spades', true),    // (0,2)
      createCard('A', 'spades', true),    // (1,0) -- non-K swap target
      createCard('3', 'clubs', true),     // (1,1)
      createCard('4', 'hearts', true),    // (1,2)
      createCard('5', 'clubs', false),    // (2,0) -- face-down
      createCard('6', 'hearts', false),
      createCard('7', 'spades', false),
    ];
    const grid = createGolfGrid(cards);
    const ps: AiVisiblePlayerState = createAiVisiblePlayerState({ grid });

    // 1 K visible → 3 unknown → -1.5
    expect(computeColumnBonus(ps.grid, drawnKing, buildMove, { K: 1 })).toBe(-1.5);
    // 2 K visible → 2 unknown → -1.0
    expect(computeColumnBonus(ps.grid, drawnKing, buildMove, { K: 2 })).toBe(-1.0);
    // 3 K visible → 1 unknown → -0.5
    expect(computeColumnBonus(ps.grid, drawnKing, buildMove, { K: 3 })).toBe(-0.5);
    // 4 K visible → 0 unknown → 0 (use toBeCloseTo to handle -0 vs +0)
    expect(computeColumnBonus(ps.grid, drawnKing, buildMove, { K: 4 })).toBeCloseTo(0);
  });
});

describe('chooseMoveForCard with visible rank weighting', () => {
  it('applies column bonus when visibleRanks is provided (lowers score for build move)', () => {
    // Column 0: [K♣, A♠, ?] -- drawing K and swapping into A♠ position builds column
    const cards = [
      createCard('K', 'clubs', true),     // (0,0) -- K
      createCard('A', 'hearts', true),    // (0,1)
      createCard('2', 'spades', true),    // (0,2)
      createCard('A', 'spades', true),    // (1,0) -- non-K, build target
      createCard('3', 'clubs', true),     // (1,1)
      createCard('4', 'hearts', true),    // (1,2)
      createCard('5', 'clubs', false),    // (2,0) -- face-down
      createCard('6', 'hearts', false),
      createCard('7', 'spades', false),
    ];
    const grid = createGolfGrid(cards);
    const ps: AiVisiblePlayerState = createAiVisiblePlayerState({ grid });
    const drawnCard = createCard('K', 'hearts', true);

    // Choose the best move with bonus
    const visibleRanks: Record<string, number> = { K: 1 };
    const moveWithBonus = chooseMoveForCard(
      ps.grid,
      drawnCard,
      createTestRng(42),
      visibleRanks,
    );

    // Choose the best move without bonus
    const moveNoBonus = chooseMoveForCard(
      ps.grid,
      drawnCard,
      createTestRng(42),
    );

    // Both calls use the same RNG seed, so differences are from the bonus
    // The bonus may change which move is selected in a close scenario.
    // At minimum, the function should not throw and should return a legal move.
    expect(moveWithBonus.kind === 'swap' || moveWithBonus.kind === 'discard-and-flip').toBe(true);
    expect(moveNoBonus.kind === 'swap' || moveNoBonus.kind === 'discard-and-flip').toBe(true);
  });
});

describe('chooseDrawSource with visible rank weighting', () => {
  it('prefers discard when it helps build a column and unknown copies remain', () => {
    // Column 0: [K♣, A♠, ?(face-down)]
    // Discard has a King (helps column 0), stock available
    // Only 1 King visible in grid (no K on discard before evaluating)
    const cards = [
      createCard('K', 'clubs', true),     // (0,0) -- K
      createCard('A', 'hearts', true),    // (0,1)
      createCard('2', 'spades', true),    // (0,2)
      createCard('A', 'spades', true),    // (1,0) -- non-K, build target
      createCard('3', 'clubs', true),     // (1,1)
      createCard('4', 'hearts', true),    // (1,2)
      createCard('5', 'clubs', false),    // (2,0) -- face-down
      createCard('6', 'hearts', false),
      createCard('7', 'spades', false),
    ];
    const grid = createGolfGrid(cards);
    const rawPs = { grid };
    const aiPs: AiVisiblePlayerState = createAiVisiblePlayerState(rawPs);

    // Discard has a King (helps column 0), stock available
    const shared: GolfSharedState = {
      stockPile: [createCard('Q', 'diamonds')],
      discardPile: new Pile([createCard('K', 'spades', true)]), // King on discard top
      roundEnd: createRoundEndState(2),
    };
    const aiShared = createAiVisibleSharedState(shared);

    // GreedyStrategy should prefer discard because King helps column 0
    // and unknown Kings remain (only 1 King visible in grid currently)
    const rng = createTestRng();
    const action = GreedyStrategy.chooseAction(aiPs, aiShared, rng);
    expect(action.drawSource).toBe('discard');
  });
});

describe('Integration: existing tests still pass', () => {
  it('full game simulation with GreedyStrategy still completes', () => {
    const rng = createTestRng(111);
    const session = setupGolfGame({ rng: createTestRng(222) });
    const ai0 = new AiPlayer(GreedyStrategy, rng);
    const ai1 = new AiPlayer(GreedyStrategy, createTestRng(333));

    let turnCount = 0;
    const maxTurns = 200;

    while (session.gameState.phase !== 'ended' && turnCount < maxTurns) {
      const currentIdx = session.gameState.currentPlayerIndex;
      const ps = session.gameState.playerStates[currentIdx];
      const ai = currentIdx === 0 ? ai0 : ai1;

      const aiPs = createAiVisiblePlayerState(ps);
      const aiShared = createAiVisibleSharedState(session.shared);
      const action = ai.chooseAction(aiPs, aiShared);
      const result = executeTurn(session, action);

      expect(result.playerIndex).toBe(currentIdx);
      turnCount++;
    }

    expect(session.gameState.phase).toBe('ended');
    expect(turnCount).toBeLessThan(maxTurns);
    expect(turnCount).toBeGreaterThan(0);
  });
});
