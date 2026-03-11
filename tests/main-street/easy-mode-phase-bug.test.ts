/**
 * Main Street: Easy Mode Phase Bug Regression Tests
 *
 * Verifies that the async campaign load race condition (CG-0MMM3EX2E0VD02N0)
 * is properly handled: when a new game state is created (simulating the async
 * campaign reload), executeDayStart must be called on the new state before the
 * player can interact.
 *
 * Work items: CG-0MMM3EX2E0VD02N0, CG-0MMM3VJNQ1O43G56, CG-0MMM3VQIS039HTA5
 */
import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  processEndOfTurn,
  executeAction,
  type PlayerAction,
} from '../../example-games/main-street/MainStreetEngine';
import type { DifficultyName } from '../../example-games/main-street/MainStreetDifficulty';

// ── Helpers ─────────────────────────────────────────────────

function createState(
  seed: string,
  difficulty: DifficultyName = 'Easy',
): MainStreetState {
  return setupMainStreetGame({ seed, difficulty });
}

// ── Tests ───────────────────────────────────────────────────

describe('Easy mode: round-1 market phase reachability', () => {
  it('should start in DayStart phase', () => {
    const state = createState('easy-phase-1');
    expect(state.phase).toBe('DayStart');
    expect(state.turn).toBe(1);
  });

  it('should transition to MarketPhase after executeDayStart', () => {
    const state = createState('easy-phase-2');
    executeDayStart(state);
    expect(state.phase).toBe('MarketPhase');
    expect(state.turn).toBe(1);
  });

  it('should allow End Turn action after executeDayStart on Easy', () => {
    const state = createState('easy-phase-3');
    executeDayStart(state);
    expect(state.phase).toBe('MarketPhase');

    // processEndOfTurn should not throw
    const result = processEndOfTurn(state);
    expect(result).toBeDefined();
    expect(['playing', 'win', 'loss']).toContain(result.gameResult);
  });

  it('should reject End Turn when still in DayStart (the bug scenario)', () => {
    const state = createState('easy-phase-4');
    // Do NOT call executeDayStart -- simulating the race condition
    expect(state.phase).toBe('DayStart');

    expect(() => processEndOfTurn(state)).toThrow(
      /Cannot end turn during DayStart/,
    );
  });

  it('should reject buy-business action when still in DayStart', () => {
    const state = createState('easy-phase-5');
    // Do NOT call executeDayStart
    expect(state.phase).toBe('DayStart');

    const action: PlayerAction = {
      type: 'buy-business',
      cardId: 'any-card',
      slotIndex: 0,
    };
    expect(() => executeAction(state, action)).toThrow(
      /Cannot perform buy-business during DayStart/,
    );
  });
});

describe('Async state replacement race condition (regression)', () => {
  it('replacing state after executeDayStart leaves new state in DayStart', () => {
    // Simulate the exact sequence from the bug:
    // 1. Create state (DayStart) -> executeDayStart -> MarketPhase
    // 2. Replace state with a new one (simulating async campaign load)
    // 3. New state is back in DayStart

    const state1 = createState('race-1');
    executeDayStart(state1);
    expect(state1.phase).toBe('MarketPhase');

    // Simulate async callback replacing the state
    const state2 = createState('race-2');
    expect(state2.phase).toBe('DayStart');

    // The fix: calling executeDayStart on the new state
    executeDayStart(state2);
    expect(state2.phase).toBe('MarketPhase');

    // Now processEndOfTurn should work on the new state
    const result = processEndOfTurn(state2);
    expect(result).toBeDefined();
  });

  it('works for all difficulty levels', () => {
    for (const difficulty of ['Easy', 'Medium', 'Hard'] as DifficultyName[]) {
      const state = createState(`phase-${difficulty}`, difficulty);
      expect(state.phase).toBe('DayStart');

      executeDayStart(state);
      expect(state.phase).toBe('MarketPhase');

      const result = processEndOfTurn(state);
      expect(result).toBeDefined();
      expect(['playing', 'win', 'loss']).toContain(result.gameResult);
    }
  });
});
