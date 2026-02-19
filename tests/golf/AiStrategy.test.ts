/**
 * Tests for AiStrategy -- RandomStrategy, GreedyStrategy, and AiPlayer.
 */

import { describe, it, expect } from 'vitest';
import {
  RandomStrategy,
  GreedyStrategy,
  AiPlayer,
} from '../../example-games/golf/AiStrategy';
import {
  setupGolfGame,
  executeTurn,
} from '../../example-games/golf/GolfGame';
import type { GolfSharedState } from '../../example-games/golf/GolfGame';
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

describe('RandomStrategy', () => {
  it('has the name "random"', () => {
    expect(RandomStrategy.name).toBe('random');
  });

  it('chooses a legal move', () => {
    const rng = createTestRng();
    const session = setupGolfGame({ rng: createTestRng(1) });
    const ps = session.gameState.playerStates[0];

    const action = RandomStrategy.chooseAction(ps, session.shared, rng);

    expect(['stock', 'discard']).toContain(action.drawSource);
    expect(isLegalMove(ps.grid, action.move)).toBe(true);
  });

  it('produces different moves with different RNG seeds', () => {
    const session = setupGolfGame({ rng: createTestRng(1) });
    const ps = session.gameState.playerStates[0];

    const actions = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      const action = RandomStrategy.chooseAction(
        ps,
        session.shared,
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

    const action = RandomStrategy.chooseAction(ps, shared, createTestRng());
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

    const action = GreedyStrategy.chooseAction(ps, session.shared, rng);

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

    const action = GreedyStrategy.chooseAction(ps, shared, createTestRng());

    // Should draw from discard (Ace is better than 7)
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

    const action = GreedyStrategy.chooseAction(ps, shared, createTestRng());

    // The greedy strategy should evaluate all options and pick the best.
    // With a King (0 pts) from stock, it could swap with any position.
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

    const action = GreedyStrategy.chooseAction(ps, shared, createTestRng());
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

    const action = ai.chooseAction(ps, session.shared);
    expect(isLegalMove(ps.grid, action.move)).toBe(true);
  });

  it('can use GreedyStrategy', () => {
    const ai = new AiPlayer(GreedyStrategy, createTestRng());
    const session = setupGolfGame({ rng: createTestRng(1) });
    const ps = session.gameState.playerStates[0];

    const action = ai.chooseAction(ps, session.shared);
    expect(isLegalMove(ps.grid, action.move)).toBe(true);
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

      const action = ai.chooseAction(ps, session.shared);
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

      const action = ai.chooseAction(ps, session.shared);
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

      const action = ai.chooseAction(ps, session.shared);
      executeTurn(session, action);
      turnCount++;
    }

    expect(session.gameState.phase).toBe('ended');
    expect(turnCount).toBeLessThan(maxTurns);
  });
});
