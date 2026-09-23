/**
 * Main Street: Easy Mode Phase Bug Regression Tests
 *
 * Verifies that the async campaign load race condition (CG-0MMM3EX2E0VD02N0)
 * is properly handled: when a new game state is created (simulating the async
 * campaign reload), executeWeekStart must be called on the new state before the
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
  executeWeekStart,
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
  it('should start in WeekStart phase', () => {
    const state = createState('easy-phase-1');
    expect(state.phase).toBe('WeekStart');
    expect(state.turn).toBe(1);
  });

  it('should transition to MarketPhase after executeWeekStart', () => {
    const state = createState('easy-phase-2');
    executeWeekStart(state);
    expect(state.phase).toBe('MarketPhase');
    expect(state.turn).toBe(1);
  });

  it('should allow End Turn action after executeWeekStart on Easy', () => {
    const state = createState('easy-phase-3');
    executeWeekStart(state);
    expect(state.phase).toBe('MarketPhase');

    // processEndOfTurn should not throw
    const result = processEndOfTurn(state);
    expect(result).toBeDefined();
    expect(['playing', 'win', 'loss']).toContain(result.gameResult);
  });

  it('should reject End Turn when still in WeekStart (the bug scenario)', () => {
    const state = createState('easy-phase-4');
    // Do NOT call executeWeekStart -- simulating the race condition
    expect(state.phase).toBe('WeekStart');

    expect(() => processEndOfTurn(state)).toThrow(
      /Cannot end turn during WeekStart/,
    );
  });

  it('should reject buy-business action when still in WeekStart', () => {
    const state = createState('easy-phase-5');
    // Do NOT call executeWeekStart
    expect(state.phase).toBe('WeekStart');

    const action: PlayerAction = {
      type: 'buy-business',
      cardId: 'any-card',
      slotIndex: 0,
    };
    expect(() => executeAction(state, action)).toThrow(
      /Cannot perform buy-business during WeekStart/,
    );
  });
});

describe('Async state replacement race condition (regression)', () => {
  it('replacing state after executeWeekStart leaves new state in WeekStart', () => {
    // Simulate the exact sequence from the bug:
    // 1. Create state (WeekStart) -> executeWeekStart -> MarketPhase
    // 2. Replace state with a new one (simulating async campaign load)
    // 3. New state is back in WeekStart

    const state1 = createState('race-1');
    executeWeekStart(state1);
    expect(state1.phase).toBe('MarketPhase');

    // Simulate async callback replacing the state
    const state2 = createState('race-2');
    expect(state2.phase).toBe('WeekStart');

    // The fix: calling executeWeekStart on the new state
    executeWeekStart(state2);
    expect(state2.phase).toBe('MarketPhase');

    // Now processEndOfTurn should work on the new state
    const result = processEndOfTurn(state2);
    expect(result).toBeDefined();
  });

  it('works for all difficulty levels', () => {
    for (const difficulty of ['Easy', 'Medium', 'Hard'] as DifficultyName[]) {
      const state = createState(`phase-${difficulty}`, difficulty);
      expect(state.phase).toBe('WeekStart');

      executeWeekStart(state);
      expect(state.phase).toBe('MarketPhase');

      const result = processEndOfTurn(state);
      expect(result).toBeDefined();
      expect(['playing', 'win', 'loss']).toContain(result.gameResult);
    }
  });
});
