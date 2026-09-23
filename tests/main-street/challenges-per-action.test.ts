/**
 * Main Street: Per-Action Challenge Evaluation Tests
 *
 * These tests verify that challenges are evaluated after each action
 * (not only at end-of-turn), producing immediate feedback. This covers
 * the per-action evaluation path used by both interactive commands and
 * the engine executeAction (AI/Monte Carlo/headless) paths.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import {
  CHALLENGE_TEMPLATES,
  evaluateChallenges,
  type ActiveChallenge,
} from '../../example-games/main-street/MainStreetChallenges';
import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';

// ── Helpers ─────────────────────────────────────────────

/** Creates a test state with challenges pre-selected from the template pool. */
function createGameState(
  seed: string = 'per-action-42',
): MainStreetState {
  const state = setupMainStreetGame({ seed });
  return state;
}

/**
 * Creates a subset of active challenges from the template pool by ID.
 * Only challenges whose IDs are included are activated.
 */
function createActiveChallenges(ids: string[]): ActiveChallenge[] {
  return ids.map((id) => {
    const template = CHALLENGE_TEMPLATES.find((t) => t.id === id);
    if (!template) {
      throw new Error(`Unknown challenge template: ${id}`);
    }
    return {
      challenge: template,
      completed: false,
    };
  });
}

/**
 * Simulates placing N contiguous Food businesses starting at the given slot.
 */
function placeFoodRun(
  state: MainStreetState,
  startSlot: number,
  length: number,
): void {
  for (let i = 0; i < length; i++) {
    state.streetGrid[startSlot + i] = {
      family: 'business',
      id: `food-${startSlot + i}`,
      name: `Food${startSlot + i}`,
      cost: 3,
      baseIncome: 2,
      synergyTypes: ['Food'],
      maxLevel: 0,
      description: 'Food business',
      level: 0,
      incomeBonus: 0,
      synergyRangeBonus: 0,
      reputationBonus: 0,
      ongoingCost: 0,
    };
  }
}

// ── Per-Action Evaluation Tests ─────────────────────────────

describe('Per-Action Challenge Evaluation', () => {
  // ── Resource Challenge: Deep Pockets ──────────────────────

  describe('resource challenge (Deep Pockets)', () => {
    const challengeId = 'ch-deep-pockets';

    it('should return newly completed challenge ID after action that meets the condition', () => {
      const state = createGameState('resource-deep-1');
      const activeChallenges = createActiveChallenges([challengeId]);
      expect(activeChallenges[0].completed).toBe(false);
      expect(state.challengesCompleted).not.toContain(challengeId);

      // Action: add 3000 coins (simulating a business placement that grants income)
      state.resourceBank.coins = 3000;

      // Per-action evaluation: evaluateChallenges is called after the action
      const newlyCompleted = evaluateChallenges(activeChallenges, state);

      expect(newlyCompleted).toEqual([challengeId]);
      expect(activeChallenges[0].completed).toBe(true);
      expect(state.challengesCompleted).toContain(challengeId);
      expect(state.challengesCompleted).toHaveLength(1);
    });

    it('should return empty array when condition not met', () => {
      const state = createGameState('resource-deep-2');
      const activeChallenges = createActiveChallenges([challengeId]);

      state.resourceBank.coins = 2999; // just below threshold

      const newlyCompleted = evaluateChallenges(activeChallenges, state);

      expect(newlyCompleted).toHaveLength(0);
      expect(activeChallenges[0].completed).toBe(false);
      expect(state.challengesCompleted).not.toContain(challengeId);
    });

    it('should not re-add challenge to completed list on subsequent evaluations', () => {
      const state = createGameState('resource-deep-3');
      const activeChallenges = createActiveChallenges([challengeId]);

      state.resourceBank.coins = 3000;

      // First per-action evaluation completes the challenge
      const firstResult = evaluateChallenges(activeChallenges, state);
      expect(firstResult).toEqual([challengeId]);

      // Second evaluation (e.g., after another action)
      const secondResult = evaluateChallenges(activeChallenges, state);
      expect(secondResult).toHaveLength(0);
      expect(state.challengesCompleted.filter((id) => id === challengeId)).toHaveLength(1);
    });
  });

  // ── Placement Challenge: Bustling Street ──────────────────

  describe('placement challenge (Bustling Street)', () => {
    const challengeId = 'ch-bustling-street';

    it('should return newly completed challenge ID after placing the 8th business', () => {
      const state = createGameState('placement-bustling-1');
      const activeChallenges = createActiveChallenges([challengeId]);

      // Place 7 businesses (not enough yet)
      for (let i = 0; i < 7; i++) {
        state.streetGrid[i] = {
          family: 'business',
          id: `biz-${i}`,
          name: `Biz${i}`,
          cost: 3,
          baseIncome: 2,
          synergyTypes: ['Food'],
          maxLevel: 0,
          description: 'Test business',
          level: 0,
          incomeBonus: 0,
          synergyRangeBonus: 0,
          reputationBonus: 0,
          ongoingCost: 0,
        };
      }

      // Per-action evaluation with 7 placed: not completed
      let newlyCompleted = evaluateChallenges(activeChallenges, state);
      expect(newlyCompleted).toHaveLength(0);
      expect(activeChallenges[0].completed).toBe(false);

      // Place the 8th business (action that completes the challenge)
      state.streetGrid[7] = {
        family: 'business',
        id: 'biz-7',
        name: 'Biz7',
        cost: 3,
        baseIncome: 2,
        synergyTypes: ['Commerce'],
        maxLevel: 0,
        description: 'Test business',
        level: 0,
        incomeBonus: 0,
        synergyRangeBonus: 0,
        reputationBonus: 0,
        ongoingCost: 0,
      };

      // Per-action evaluation: challenge should now be completed
      newlyCompleted = evaluateChallenges(activeChallenges, state);
      expect(newlyCompleted).toEqual([challengeId]);
      expect(activeChallenges[0].completed).toBe(true);
      expect(state.challengesCompleted).toContain(challengeId);
    });

    it('should return empty array when fewer than 8 businesses placed', () => {
      const state = createGameState('placement-bustling-2');
      const activeChallenges = createActiveChallenges([challengeId]);

      for (let i = 0; i < 7; i++) {
        state.streetGrid[i] = {
          family: 'business',
          id: `biz-${i}`,
          name: `Biz${i}`,
          cost: 3,
          baseIncome: 2,
          synergyTypes: ['Food'],
          maxLevel: 0,
          description: 'Test business',
          level: 0,
          incomeBonus: 0,
          synergyRangeBonus: 0,
          reputationBonus: 0,
          ongoingCost: 0,
        };
      }

      const newlyCompleted = evaluateChallenges(activeChallenges, state);
      expect(newlyCompleted).toHaveLength(0);
    });
  });

  // ── Synergy Challenge: Foodie Row ─────────────────────────

  describe('synergy challenge (Foodie Row)', () => {
    const challengeId = 'ch-foodie-row';

    it('should return newly completed challenge ID after placing 3rd adjacent Food business', () => {
      const state = createGameState('synergy-foodie-1');
      const activeChallenges = createActiveChallenges([challengeId]);

      // Place 2 adjacent Food businesses
      placeFoodRun(state, 2, 2);

      // Per-action evaluation: not completed yet
      let newlyCompleted = evaluateChallenges(activeChallenges, state);
      expect(newlyCompleted).toHaveLength(0);
      expect(activeChallenges[0].completed).toBe(false);

      // Place the 3rd adjacent Food business (action that completes the challenge)
      state.streetGrid[4] = {
        family: 'business',
        id: 'food-4',
        name: 'Food4',
        cost: 3,
        baseIncome: 2,
        synergyTypes: ['Food'],
        maxLevel: 0,
        description: 'Food business',
        level: 0,
        incomeBonus: 0,
        synergyRangeBonus: 0,
        reputationBonus: 0,
        ongoingCost: 0,
      };

      // Per-action evaluation: challenge should now be completed
      newlyCompleted = evaluateChallenges(activeChallenges, state);
      expect(newlyCompleted).toEqual([challengeId]);
      expect(activeChallenges[0].completed).toBe(true);
      expect(state.challengesCompleted).toContain(challengeId);
    });

    it('should not complete when businesses are non-adjacent', () => {
      const state = createGameState('synergy-foodie-2');
      const activeChallenges = createActiveChallenges([challengeId]);

      // Place 3 Food businesses but not adjacent
      state.streetGrid[0] = {
        family: 'business',
        id: 'food-0',
        name: 'Food0',
        cost: 3,
        baseIncome: 2,
        synergyTypes: ['Food'],
        maxLevel: 0,
        description: 'Food business',
        level: 0,
        incomeBonus: 0,
        synergyRangeBonus: 0,
        reputationBonus: 0,
        ongoingCost: 0,
      };
      state.streetGrid[3] = {
        family: 'business',
        id: 'food-3',
        name: 'Food3',
        cost: 3,
        baseIncome: 2,
        synergyTypes: ['Food'],
        maxLevel: 0,
        description: 'Food business',
        level: 0,
        incomeBonus: 0,
        synergyRangeBonus: 0,
        reputationBonus: 0,
        ongoingCost: 0,
      };
      state.streetGrid[6] = {
        family: 'business',
        id: 'food-6',
        name: 'Food6',
        cost: 3,
        baseIncome: 2,
        synergyTypes: ['Food'],
        maxLevel: 0,
        description: 'Food business',
        level: 0,
        incomeBonus: 0,
        synergyRangeBonus: 0,
        reputationBonus: 0,
        ongoingCost: 0,
      };

      const newlyCompleted = evaluateChallenges(activeChallenges, state);
      expect(newlyCompleted).toHaveLength(0);
      expect(activeChallenges[0].completed).toBe(false);
    });
  });

  // ── End-of-Turn Safety Net (No Double-Reporting) ──────────

  describe('end-of-turn safety net (no double-reporting)', () => {
    it('should not report a challenge already completed mid-turn during end-of-turn evaluation', () => {
      const state = createGameState('safety-net-1');
      state.resourceBank.coins = 3000;
      const activeChallenges = createActiveChallenges(['ch-deep-pockets']);

      // Per-action evaluation: challenge completed mid-turn
      const midTurnResult = evaluateChallenges(activeChallenges, state);
      expect(midTurnResult).toEqual(['ch-deep-pockets']);
      expect(state.challengesCompleted).toContain('ch-deep-pockets');
      expect(state.challengesCompleted).toHaveLength(1);

      // End-of-turn safety net evaluation: challenge already completed
      const endTurnResult = evaluateChallenges(activeChallenges, state);
      expect(endTurnResult).toHaveLength(0);
      // Should not have added a duplicate entry
      expect(state.challengesCompleted.filter((id) => id === 'ch-deep-pockets')).toHaveLength(1);
    });

    it('should handle mixed completions: some mid-turn, some at end-of-turn', () => {
      const state = createGameState('safety-net-2');
      state.resourceBank.coins = 3000;

      const activeChallenges = createActiveChallenges(
        ['ch-deep-pockets', 'ch-beloved-mayor'],
      );

      // Per-action evaluation: only Deep Pockets is met
      const midTurnResult = evaluateChallenges(activeChallenges, state);
      expect(midTurnResult).toEqual(['ch-deep-pockets']);
      expect(activeChallenges[0].completed).toBe(true); // Deep Pockets
      expect(activeChallenges[1].completed).toBe(false); // Beloved Mayor

      // Simulate a later action that grants reputation
      state.resourceBank.reputation = 1000;

      // End-of-turn safety net: only Beloved Mayor should complete
      const endTurnResult = evaluateChallenges(activeChallenges, state);
      expect(endTurnResult).toEqual(['ch-beloved-mayor']);
      expect(activeChallenges[1].completed).toBe(true);
    });

    it('should return empty array from end-of-turn when all challenges were already completed mid-turn', () => {
      const state = createGameState('safety-net-3');
      state.resourceBank.coins = 3000;

      const activeChallenges = createActiveChallenges(['ch-deep-pockets']);

      // Mid-turn completes all active challenges
      evaluateChallenges(activeChallenges, state);

      // End-of-turn: nothing left to complete
      const endTurnResult = evaluateChallenges(activeChallenges, state);
      expect(endTurnResult).toHaveLength(0);
    });
  });

  // ── Multiple Active Challenges ────────────────────────────

  describe('multiple active challenges', () => {
    it('should complete multiple challenges in a single per-action evaluation', () => {
      const state = createGameState('multi-1');
      state.resourceBank.coins = 3000;
      state.resourceBank.reputation = 1000;

      const activeChallenges = createActiveChallenges(
        ['ch-deep-pockets', 'ch-beloved-mayor'],
      );

      // Both conditions met by the same state
      const newlyCompleted = evaluateChallenges(activeChallenges, state);
      expect(newlyCompleted).toHaveLength(2);
      expect(newlyCompleted).toContain('ch-deep-pockets');
      expect(newlyCompleted).toContain('ch-beloved-mayor');

      for (const ac of activeChallenges) {
        expect(ac.completed).toBe(true);
      }
      expect(state.challengesCompleted).toContain('ch-deep-pockets');
      expect(state.challengesCompleted).toContain('ch-beloved-mayor');
      expect(state.challengesCompleted).toHaveLength(2);
    });

    it('should handle 3 challenges with only 1 completing mid-turn', () => {
      const state = createGameState('multi-2');

      const activeChallenges = createActiveChallenges(
        ['ch-deep-pockets', 'ch-beloved-mayor', 'ch-bustling-street'],
      );

      // Only Deep Pockets is met
      state.resourceBank.coins = 3000;

      const newlyCompleted = evaluateChallenges(activeChallenges, state);
      expect(newlyCompleted).toEqual(['ch-deep-pockets']);
      expect(activeChallenges[0].completed).toBe(true);
      expect(activeChallenges[1].completed).toBe(false);
      expect(activeChallenges[2].completed).toBe(false);
    });
  });
});
