/**
 * Main Street: Challenge Celebration Tests
 *
 * Tests that challenge completion during processEndOfTurn correctly
 * captures newly completed challenge IDs and surfaces them in TurnResult.
 */
import { describe, it, expect } from 'vitest';

import {
  CHALLENGE_TEMPLATES,
} from '../../example-games/main-street/MainStreetChallenges';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';

import { processEndOfTurn, executeDayStart } from '../../example-games/main-street/MainStreetEngine';

import { type BusinessCard, GRID_SIZE } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

/** Creates a test state with an empty grid (all null). */
function createState(seed: string = 'celebrate-test'): MainStreetState {
  return setupMainStreetGame({ seed });
}

/**
 * Creates a minimal business card for test fixtures.
 */
function makeBiz(id: string): BusinessCard {
  return {
    id,
    name: 'Test Biz',
    cost: 5,
    baseIncome: 2,
    synergyTypes: ['Food'],
    level: 0,
    family: 'business',
    description: 'A test business card.',
    maxLevel: 3,
    incomeBonus: 1,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
    appliedUpgrades: [],
  };
}

/** Fills the entire street grid with businesses so synergy/placement challenges are met. */
function fillGrid(state: MainStreetState): void {
  for (let i = 0; i < GRID_SIZE; i++) {
    state.streetGrid[i] = makeBiz(`test-biz-${i}`);
  }
}

/** Manually give the state enough coins so resource challenges pass. */
function giveWealth(state: MainStreetState): void {
  state.resourceBank.coins = 10000;
}

// ── Tests ───────────────────────────────────────────────────

describe('Challenge Celebration Integration', () => {
  describe('TurnResult.newlyCompletedChallenges', () => {
    it('should return newly completed challenge IDs when challenges are completed during end-of-turn', () => {
      const state = createState('celebrate-1');

      // Set up a challenge that will definitively pass: ch-deep-pockets (coins >= 3000)
      state.activeChallenges = [
        {
          challenge: CHALLENGE_TEMPLATES.find(c => c.id === 'ch-deep-pockets')!,
          completed: false,
        },
      ];
      giveWealth(state);
      executeDayStart(state);

      const result = processEndOfTurn(state);

      // Verify the challenge was completed
      expect(state.activeChallenges[0].completed).toBe(true);
      expect(state.challengesCompleted).toContain('ch-deep-pockets');
      // Verify the result includes the newly completed challenge
      expect(result.newlyCompletedChallenges).toContain('ch-deep-pockets');
    });

    it('should return an empty array when no challenges are completed', () => {
      const state = createState('celebrate-2');

      // Set up a challenge that will NOT pass: ch-deep-pockets requires coins >= 3000
      state.activeChallenges = [
        {
          challenge: CHALLENGE_TEMPLATES.find(c => c.id === 'ch-deep-pockets')!,
          completed: false,
        },
      ];
      state.resourceBank.coins = 5; // Below 3000 threshold
      executeDayStart(state);

      const result = processEndOfTurn(state);

      expect(result.newlyCompletedChallenges).toEqual([]);
    });

    it('should include multiple newly completed challenge IDs when multiple challenges complete in one turn', () => {
      const state = createState('celebrate-3');

      // Set up two challenges that will both pass
      state.activeChallenges = [
        {
          challenge: CHALLENGE_TEMPLATES.find(c => c.id === 'ch-deep-pockets')!,
          completed: false,
        },
        {
          challenge: CHALLENGE_TEMPLATES.find(c => c.id === 'ch-bustling-street')!,
          completed: false,
        },
      ];
      giveWealth(state);
      fillGrid(state); // Fill all 10 slots for ch-bustling-street (requires >= 8)
      executeDayStart(state);

      const result = processEndOfTurn(state);

      expect(result.newlyCompletedChallenges).toContain('ch-deep-pockets');
      expect(result.newlyCompletedChallenges).toContain('ch-bustling-street');
      expect(result.newlyCompletedChallenges.length).toBe(2);
    });

    it('should not include already-completed challenges in newlyCompletedChallenges', () => {
      const state = createState('celebrate-4');

      // Challenge already completed
      state.activeChallenges = [
        {
          challenge: CHALLENGE_TEMPLATES.find(c => c.id === 'ch-deep-pockets')!,
          completed: true, // Already completed
        },
      ];
      giveWealth(state);
      executeDayStart(state);

      const result = processEndOfTurn(state);

      // Challenge stays completed but should NOT appear as newly completed
      expect(state.activeChallenges[0].completed).toBe(true);
      expect(result.newlyCompletedChallenges).toEqual([]);
    });

    it('should not crash with no active challenges', () => {
      const state = createState('celebrate-5');
      state.activeChallenges = [];
      executeDayStart(state);

      // Should not throw
      const result = processEndOfTurn(state);

      expect(result.newlyCompletedChallenges).toEqual([]);
    });
  });

  describe('SFX_KEYS.CELEBRATE', () => {
    it('should have the celebration SFX key exported from MainStreetConstants', async () => {
      const { SFX_KEYS } = await import('../../example-games/main-street/scenes/MainStreetConstants');
      expect(SFX_KEYS.CELEBRATE).toBe('sfx-challenge-complete');
    });
  });

  describe('sfx-tf-mapping', () => {
    it('should include a mapping for sfx-challenge-complete', async () => {
      const { MAIN_STREET_TF_SFX_MAPPING } = await import('../../example-games/main-street/sfx-tf-mapping');
      expect(MAIN_STREET_TF_SFX_MAPPING['sfx-challenge-complete']).toBeDefined();
      expect(typeof MAIN_STREET_TF_SFX_MAPPING['sfx-challenge-complete']).toBe('string');
    });
  });
});
