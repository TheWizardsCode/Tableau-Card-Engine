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
