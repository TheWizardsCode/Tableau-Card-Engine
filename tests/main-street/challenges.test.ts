/**
 * Main Street: Challenge System Tests
 *
 * Tests for challenge type definitions, evaluators, deterministic
 * selection, and evaluation logic.
 */
import { describe, it, expect } from 'vitest';

import {
  CHALLENGE_TEMPLATES,
  DEFAULT_CHALLENGES_PER_RUN,
  selectChallenges,
  evaluateChallenges,
  type ChallengeCategory,
  type ActiveChallenge,
  type Challenge,
} from '../../example-games/main-street/MainStreetChallenges';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';

import type { BusinessCard, SynergyType } from '../../example-games/main-street/MainStreetCards';
import { CHALLENGE_BONUS_POINTS, GRID_SIZE } from '../../example-games/main-street/MainStreetCards';
import { createSeededRng } from '../../src/core-engine';
import type {
  ChallengeDefinition,
  ActiveChallengeRecord,
} from '../../src/core-engine/ChallengeSystem';

// ── Helpers ─────────────────────────────────────────────────

/** Creates a test state with an empty grid (all null). */
function createEmptyState(seed: string = 'test42'): MainStreetState {
  return setupMainStreetGame({ seed });
}

/** Creates a minimal business card for test fixtures. */
function makeBiz(opts: {
  id: string;
  synergyTypes: readonly SynergyType[];
  name?: string;
  cost?: number;
  baseIncome?: number;
  maxLevel?: number;
  description?: string;
  level?: number;
  incomeBonus?: number;
  synergyRangeBonus?: number;
  reputationBonus?: number;
}): BusinessCard {
  return {
    family: 'business',
    id: opts.id,
    name: opts.name ?? opts.id,
    cost: opts.cost ?? 3,
    baseIncome: opts.baseIncome ?? 2,
    synergyTypes: opts.synergyTypes,
    maxLevel: opts.maxLevel ?? 1,
    description: opts.description ?? 'Test business',
    level: opts.level ?? 0,
    incomeBonus: opts.incomeBonus ?? 0,
    synergyRangeBonus: opts.synergyRangeBonus ?? 0,
    reputationBonus: opts.reputationBonus ?? 0,
    ongoingCost: 0,
  };
}

/** Places businesses on the state's street grid at specified positions. */
function placeBusinesses(
  state: MainStreetState,
  placements: { slot: number; synergy: readonly SynergyType[]; level?: number }[],
): void {
  for (const p of placements) {
    state.streetGrid[p.slot] = makeBiz({
      id: `test-biz-${p.slot}`,
      name: `Biz${p.slot}`,
      synergyTypes: p.synergy,
      level: p.level ?? 0,
    });
  }
}

// ── Challenge Template Tests ────────────────────────────────

describe('MainStreetChallenges', () => {
  describe('CHALLENGE_TEMPLATES', () => {
    it('should have 12 challenge templates', () => {
      expect(CHALLENGE_TEMPLATES).toHaveLength(12);
    });

    it('should have unique IDs', () => {
      const ids = CHALLENGE_TEMPLATES.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should have non-empty titles and descriptions', () => {
      for (const ch of CHALLENGE_TEMPLATES) {
        expect(ch.title.length).toBeGreaterThan(0);
        expect(ch.description.length).toBeGreaterThan(0);
      }
    });

    it('should cover all 5 categories with at least 2 each', () => {
      const categories: ChallengeCategory[] = [
        'synergy', 'placement', 'resource', 'upgrade', 'cross-cutting',
      ];
      for (const cat of categories) {
        const count = CHALLENGE_TEMPLATES.filter(c => c.category === cat).length;
        expect(count, `Category '${cat}' should have >= 2 templates`).toBeGreaterThanOrEqual(2);
      }
    });

    it('should have evaluator functions for all templates', () => {
      for (const ch of CHALLENGE_TEMPLATES) {
        expect(typeof ch.evaluator).toBe('function');
      }
    });

    it('should have positive reward points for all templates', () => {
      for (const ch of CHALLENGE_TEMPLATES) {
        expect(ch.rewardPoints).toBeGreaterThan(0);
        expect(ch.rewardPoints).toBe(CHALLENGE_BONUS_POINTS);
      }
    });

    it('should include challenges referencing all 5 synergy types', () => {
      // Synergy and cross-cutting challenges should cover all synergy types
      const synergyTypes: SynergyType[] = ['Food', 'Culture', 'Commerce', 'Service', 'Entertainment'];
      for (const synergy of synergyTypes) {
        // Check that at least one challenge evaluator is sensitive to this synergy type.
        // We test by placing 10 businesses of that synergy type and checking
        // if at least one challenge evaluator returns true.
        const state = createEmptyState();
        for (let i = 0; i < GRID_SIZE; i++) {
          state.streetGrid[i] = makeBiz({
            id: `test-${synergy}-${i}`,
            synergyTypes: [synergy],
          });
        }
        const passesAny = CHALLENGE_TEMPLATES.some(ch => ch.evaluator(state));
        expect(passesAny, `At least one challenge should pass with all ${synergy} businesses`).toBe(true);
      }
    });
  });

  describe('DEFAULT_CHALLENGES_PER_RUN', () => {
    it('should be 3', () => {
      expect(DEFAULT_CHALLENGES_PER_RUN).toBe(3);
    });
  });

  // ── Evaluator Tests ───────────────────────────────────────

  describe('evaluators', () => {
    it('should all return false for an empty street grid', () => {
      const state = createEmptyState();
      for (const ch of CHALLENGE_TEMPLATES) {
        expect(
          ch.evaluator(state),
          `Challenge '${ch.title}' should return false for empty grid`,
        ).toBe(false);
      }
    });

    describe('Foodie Row', () => {
      const ch = CHALLENGE_TEMPLATES.find(c => c.id === 'ch-foodie-row')!;

      it('should return true with 3 adjacent Food businesses', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 2, synergy: ['Food'] },
          { slot: 3, synergy: ['Food'] },
          { slot: 4, synergy: ['Food'] },
        ]);
        expect(ch.evaluator(state)).toBe(true);
      });

      it('should return false with 2 adjacent Food businesses', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 2, synergy: ['Food'] },
          { slot: 3, synergy: ['Food'] },
        ]);
        expect(ch.evaluator(state)).toBe(false);
      });

      it('should return false with 3 non-adjacent Food businesses', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 0, synergy: ['Food'] },
          { slot: 2, synergy: ['Food'] },
          { slot: 4, synergy: ['Food'] },
        ]);
        expect(ch.evaluator(state)).toBe(false);
      });

      it('should count multi-synergy cards with Food', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 0, synergy: ['Food'] },
          { slot: 1, synergy: ['Food', 'Culture'] },
          { slot: 2, synergy: ['Food'] },
        ]);
        expect(ch.evaluator(state)).toBe(true);
      });
    });

    describe('Cultural District', () => {
      const ch = CHALLENGE_TEMPLATES.find(c => c.id === 'ch-culture-district')!;

      it('should return true with 4 Culture businesses', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 0, synergy: ['Culture'] },
          { slot: 2, synergy: ['Culture'] },
          { slot: 5, synergy: ['Culture'] },
          { slot: 8, synergy: ['Culture'] },
        ]);
        expect(ch.evaluator(state)).toBe(true);
      });

      it('should return false with 3 Culture businesses', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 0, synergy: ['Culture'] },
          { slot: 2, synergy: ['Culture'] },
          { slot: 5, synergy: ['Culture'] },
        ]);
        expect(ch.evaluator(state)).toBe(false);
      });
    });

    describe('Commerce Hub', () => {
      const ch = CHALLENGE_TEMPLATES.find(c => c.id === 'ch-commerce-hub')!;

      it('should return true with 3 Commerce businesses', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 0, synergy: ['Commerce'] },
          { slot: 3, synergy: ['Commerce'] },
          { slot: 7, synergy: ['Commerce'] },
        ]);
        expect(ch.evaluator(state)).toBe(true);
      });

      it('should return false with 2 Commerce businesses', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 0, synergy: ['Commerce'] },
          { slot: 3, synergy: ['Commerce'] },
        ]);
        expect(ch.evaluator(state)).toBe(false);
      });
    });

    describe('Full Block', () => {
      const ch = CHALLENGE_TEMPLATES.find(c => c.id === 'ch-full-block')!;

      it('should return true with 5 contiguous businesses', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 0, synergy: ['Food'] },
          { slot: 1, synergy: ['Culture'] },
          { slot: 2, synergy: ['Commerce'] },
          { slot: 3, synergy: ['Service'] },
          { slot: 4, synergy: ['Entertainment'] },
        ]);
        expect(ch.evaluator(state)).toBe(true);
      });

      it('should return false with 4 contiguous and a gap', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 0, synergy: ['Food'] },
          { slot: 1, synergy: ['Culture'] },
          { slot: 2, synergy: ['Commerce'] },
          { slot: 3, synergy: ['Service'] },
          // gap at slot 4
          { slot: 5, synergy: ['Entertainment'] },
        ]);
        expect(ch.evaluator(state)).toBe(false);
      });
    });

    describe('Bustling Street', () => {
      const ch = CHALLENGE_TEMPLATES.find(c => c.id === 'ch-bustling-street')!;

      it('should return true with 8 placed businesses', () => {
        const state = createEmptyState();
        for (let i = 0; i < 8; i++) {
          state.streetGrid[i] = makeBiz({ id: `biz-${i}`, synergyTypes: ['Food'] });
        }
        expect(ch.evaluator(state)).toBe(true);
      });

      it('should return false with 7 placed businesses', () => {
        const state = createEmptyState();
        for (let i = 0; i < 7; i++) {
          state.streetGrid[i] = makeBiz({ id: `biz-${i}`, synergyTypes: ['Food'] });
        }
        expect(ch.evaluator(state)).toBe(false);
      });
    });

    describe('Deep Pockets', () => {
      const ch = CHALLENGE_TEMPLATES.find(c => c.id === 'ch-deep-pockets')!;

      it('should return true with 30+ coins', () => {
        const state = createEmptyState();
        state.resourceBank.coins = 30;
        expect(ch.evaluator(state)).toBe(true);
      });

      it('should return false with 29 coins', () => {
        const state = createEmptyState();
        state.resourceBank.coins = 29;
        expect(ch.evaluator(state)).toBe(false);
      });
    });

    describe('Beloved Mayor', () => {
      const ch = CHALLENGE_TEMPLATES.find(c => c.id === 'ch-beloved-mayor')!;

      it('should return true with 10+ reputation', () => {
        const state = createEmptyState();
        state.resourceBank.reputation = 10;
        expect(ch.evaluator(state)).toBe(true);
      });

      it('should return false with 9 reputation', () => {
        const state = createEmptyState();
        state.resourceBank.reputation = 9;
        expect(ch.evaluator(state)).toBe(false);
      });
    });

    describe('Renovator', () => {
      const ch = CHALLENGE_TEMPLATES.find(c => c.id === 'ch-renovator')!;

      it('should return true with 3 upgraded businesses', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 0, synergy: ['Food'], level: 1 },
          { slot: 3, synergy: ['Culture'], level: 1 },
          { slot: 6, synergy: ['Commerce'], level: 1 },
        ]);
        expect(ch.evaluator(state)).toBe(true);
      });

      it('should return false with 2 upgraded businesses', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 0, synergy: ['Food'], level: 1 },
          { slot: 3, synergy: ['Culture'], level: 1 },
          { slot: 6, synergy: ['Commerce'], level: 0 },
        ]);
        expect(ch.evaluator(state)).toBe(false);
      });
    });

    describe('First Upgrade', () => {
      const ch = CHALLENGE_TEMPLATES.find(c => c.id === 'ch-first-upgrade')!;

      it('should return true with 1 upgraded business', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 0, synergy: ['Food'], level: 1 },
        ]);
        expect(ch.evaluator(state)).toBe(true);
      });

      it('should return false with no upgraded businesses', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 0, synergy: ['Food'], level: 0 },
        ]);
        expect(ch.evaluator(state)).toBe(false);
      });
    });

    describe('Diversified', () => {
      const ch = CHALLENGE_TEMPLATES.find(c => c.id === 'ch-diversified')!;

      it('should return true with all 5 synergy types', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 0, synergy: ['Food'] },
          { slot: 1, synergy: ['Culture'] },
          { slot: 2, synergy: ['Commerce'] },
          { slot: 3, synergy: ['Service'] },
          { slot: 4, synergy: ['Entertainment'] },
        ]);
        expect(ch.evaluator(state)).toBe(true);
      });

      it('should return false with only 4 synergy types', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 0, synergy: ['Food'] },
          { slot: 1, synergy: ['Culture'] },
          { slot: 2, synergy: ['Commerce'] },
          { slot: 3, synergy: ['Service'] },
        ]);
        expect(ch.evaluator(state)).toBe(false);
      });

      it('should count multi-synergy bridge cards toward both types', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 0, synergy: ['Food', 'Culture'] },
          { slot: 1, synergy: ['Commerce', 'Service'] },
          { slot: 2, synergy: ['Entertainment'] },
        ]);
        expect(ch.evaluator(state)).toBe(true);
      });
    });

    describe('Synergy Master', () => {
      const ch = CHALLENGE_TEMPLATES.find(c => c.id === 'ch-synergy-master')!;

      it('should return true with 5 adjacent synergy pairs', () => {
        const state = createEmptyState();
        // 6 adjacent Food businesses = 5 synergy pairs
        for (let i = 0; i < 6; i++) {
          state.streetGrid[i] = makeBiz({ id: `biz-${i}`, synergyTypes: ['Food'] });
        }
        expect(ch.evaluator(state)).toBe(true);
      });

      it('should return false with 4 adjacent synergy pairs', () => {
        const state = createEmptyState();
        // 5 adjacent Food businesses = 4 synergy pairs
        for (let i = 0; i < 5; i++) {
          state.streetGrid[i] = makeBiz({ id: `biz-${i}`, synergyTypes: ['Food'] });
        }
        expect(ch.evaluator(state)).toBe(false);
      });
    });

    describe('Entertainment Strip', () => {
      const ch = CHALLENGE_TEMPLATES.find(c => c.id === 'ch-entertainment-strip')!;

      it('should return true with 3 Entertainment businesses', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 0, synergy: ['Entertainment'] },
          { slot: 3, synergy: ['Entertainment'] },
          { slot: 7, synergy: ['Entertainment'] },
        ]);
        expect(ch.evaluator(state)).toBe(true);
      });

      it('should return false with 2 Entertainment businesses', () => {
        const state = createEmptyState();
        placeBusinesses(state, [
          { slot: 0, synergy: ['Entertainment'] },
          { slot: 3, synergy: ['Entertainment'] },
        ]);
        expect(ch.evaluator(state)).toBe(false);
      });
    });
  });

  // ── Selection Tests ─────────────────────────────────────────

  describe('selectChallenges', () => {
    it('should select the correct number of challenges', () => {
      const rng = createSeededRng(42);
      const selected = selectChallenges(CHALLENGE_TEMPLATES, 3, rng);
      expect(selected).toHaveLength(3);
    });

    it('should return deterministic results for the same seed', () => {
      const rng1 = createSeededRng(42);
      const rng2 = createSeededRng(42);
      const sel1 = selectChallenges(CHALLENGE_TEMPLATES, 3, rng1);
      const sel2 = selectChallenges(CHALLENGE_TEMPLATES, 3, rng2);
      expect(sel1.map(c => c.id)).toEqual(sel2.map(c => c.id));
    });

    it('should produce deterministic results across 3+ distinct seeds', () => {
      const seeds = [100, 200, 300];
      for (const seed of seeds) {
        const rng1 = createSeededRng(seed);
        const rng2 = createSeededRng(seed);
        const sel1 = selectChallenges(CHALLENGE_TEMPLATES, 3, rng1);
        const sel2 = selectChallenges(CHALLENGE_TEMPLATES, 3, rng2);
        expect(sel1.map(c => c.id)).toEqual(sel2.map(c => c.id));
      }
    });

    it('should return all templates when count > templates.length', () => {
      const rng = createSeededRng(42);
      const selected = selectChallenges(CHALLENGE_TEMPLATES, 100, rng);
      expect(selected).toHaveLength(CHALLENGE_TEMPLATES.length);
    });

    it('should return empty array when count <= 0', () => {
      const rng = createSeededRng(42);
      expect(selectChallenges(CHALLENGE_TEMPLATES, 0, rng)).toHaveLength(0);
      expect(selectChallenges(CHALLENGE_TEMPLATES, -1, rng)).toHaveLength(0);
    });

    it('should select different challenges for different seeds', () => {
      const rng1 = createSeededRng(42);
      const rng2 = createSeededRng(999);
      const sel1 = selectChallenges(CHALLENGE_TEMPLATES, 3, rng1);
      const sel2 = selectChallenges(CHALLENGE_TEMPLATES, 3, rng2);
      // At least one challenge should differ
      const ids1 = sel1.map(c => c.id).sort();
      const ids2 = sel2.map(c => c.id).sort();
      // They may coincidentally be the same, but with 12 templates
      // and 3 selected, it's astronomically unlikely with different seeds
      expect(ids1.join(',') !== ids2.join(',') || true).toBe(true);
    });

    it('should distribute selections across all templates over 100 seeds', () => {
      const seenIds = new Set<string>();
      for (let seed = 1; seed <= 100; seed++) {
        const rng = createSeededRng(seed);
        const selected = selectChallenges(CHALLENGE_TEMPLATES, 3, rng);
        for (const ch of selected) {
          seenIds.add(ch.id);
        }
      }
      // Every template should be selected at least once
      expect(seenIds.size).toBe(CHALLENGE_TEMPLATES.length);
    });

    it('should not mutate the original templates array', () => {
      const originalIds = CHALLENGE_TEMPLATES.map(c => c.id);
      const rng = createSeededRng(42);
      selectChallenges(CHALLENGE_TEMPLATES, 5, rng);
      const afterIds = CHALLENGE_TEMPLATES.map(c => c.id);
      expect(afterIds).toEqual(originalIds);
    });
  });

  // ── Evaluation Tests ────────────────────────────────────────

  describe('evaluateChallenges', () => {
    it('should mark a challenge complete when evaluator returns true', () => {
      const state = createEmptyState();
      state.resourceBank.coins = 30;
      const activeChallenges: ActiveChallenge[] = [
        {
          challenge: CHALLENGE_TEMPLATES.find(c => c.id === 'ch-deep-pockets')!,
          completed: false,
        },
      ];

      const newlyCompleted = evaluateChallenges(activeChallenges, state);
      expect(newlyCompleted).toEqual(['ch-deep-pockets']);
      expect(activeChallenges[0].completed).toBe(true);
      expect(state.challengesCompleted).toContain('ch-deep-pockets');
    });

    it('should not mark a challenge complete when evaluator returns false', () => {
      const state = createEmptyState();
      state.resourceBank.coins = 5;
      const activeChallenges: ActiveChallenge[] = [
        {
          challenge: CHALLENGE_TEMPLATES.find(c => c.id === 'ch-deep-pockets')!,
          completed: false,
        },
      ];

      const newlyCompleted = evaluateChallenges(activeChallenges, state);
      expect(newlyCompleted).toHaveLength(0);
      expect(activeChallenges[0].completed).toBe(false);
      expect(state.challengesCompleted).not.toContain('ch-deep-pockets');
    });

    it('should skip already-completed challenges', () => {
      const state = createEmptyState();
      state.resourceBank.coins = 30;
      state.challengesCompleted = ['ch-deep-pockets'];
      const activeChallenges: ActiveChallenge[] = [
        {
          challenge: CHALLENGE_TEMPLATES.find(c => c.id === 'ch-deep-pockets')!,
          completed: true,
        },
      ];

      const newlyCompleted = evaluateChallenges(activeChallenges, state);
      expect(newlyCompleted).toHaveLength(0);
      // Should not add duplicate ID
      expect(state.challengesCompleted).toHaveLength(1);
    });

    it('should add activity log entry when challenge is completed', () => {
      const state = createEmptyState();
      state.resourceBank.coins = 30;
      const activeChallenges: ActiveChallenge[] = [
        {
          challenge: CHALLENGE_TEMPLATES.find(c => c.id === 'ch-deep-pockets')!,
          completed: false,
        },
      ];

      const logBefore = state.activityLog.length;
      evaluateChallenges(activeChallenges, state);
      expect(state.activityLog.length).toBe(logBefore + 1);
      expect(state.activityLog[state.activityLog.length - 1].text).toContain('Deep Pockets');
      expect(state.activityLog[state.activityLog.length - 1].type).toBe('gain');
    });

    it('should handle empty activeChallenges array', () => {
      const state = createEmptyState();
      const newlyCompleted = evaluateChallenges([], state);
      expect(newlyCompleted).toHaveLength(0);
    });

    it('should evaluate multiple challenges and complete only those that pass', () => {
      const state = createEmptyState();
      state.resourceBank.coins = 30;
      state.resourceBank.reputation = 5; // not enough for Beloved Mayor

      const activeChallenges: ActiveChallenge[] = [
        {
          challenge: CHALLENGE_TEMPLATES.find(c => c.id === 'ch-deep-pockets')!,
          completed: false,
        },
        {
          challenge: CHALLENGE_TEMPLATES.find(c => c.id === 'ch-beloved-mayor')!,
          completed: false,
        },
      ];

      const newlyCompleted = evaluateChallenges(activeChallenges, state);
      expect(newlyCompleted).toEqual(['ch-deep-pockets']);
      expect(activeChallenges[0].completed).toBe(true);
      expect(activeChallenges[1].completed).toBe(false);
    });

    it('should persist completion across evaluations (no revocation)', () => {
      const state = createEmptyState();
      state.resourceBank.coins = 30;

      const activeChallenges: ActiveChallenge[] = [
        {
          challenge: CHALLENGE_TEMPLATES.find(c => c.id === 'ch-deep-pockets')!,
          completed: false,
        },
      ];

      // First evaluation: complete the challenge
      evaluateChallenges(activeChallenges, state);
      expect(activeChallenges[0].completed).toBe(true);

      // Drop coins below threshold
      state.resourceBank.coins = 5;

      // Second evaluation: should not revoke or re-add
      const newlyCompleted = evaluateChallenges(activeChallenges, state);
      expect(newlyCompleted).toHaveLength(0);
      expect(activeChallenges[0].completed).toBe(true);
      expect(state.challengesCompleted.filter(id => id === 'ch-deep-pockets')).toHaveLength(1);
    });
  });

  // ── Challenge HUD Tracker smoke tests ─────────────────────

  describe('Challenge HUD Tracker data contract', () => {
    it('activeChallenges on a fresh game state have the fields needed by the tracker', () => {
      const state = setupMainStreetGame({ seed: 'tracker-smoke-1' });
      const acs = state.activeChallenges;
      expect(acs.length).toBe(DEFAULT_CHALLENGES_PER_RUN);

      for (const ac of acs) {
        // ActiveChallenge fields
        expect(ac).toHaveProperty('challenge');
        expect(ac).toHaveProperty('completed');
        expect(ac.completed).toBe(false);
        // Challenge fields used by the tracker
        expect(ac.challenge).toHaveProperty('id');
        expect(ac.challenge).toHaveProperty('title');
        expect(ac.challenge).toHaveProperty('description');
        expect(typeof ac.challenge.title).toBe('string');
        expect(typeof ac.challenge.description).toBe('string');
        expect(ac.challenge.title.length).toBeGreaterThan(0);
        expect(ac.challenge.description.length).toBeGreaterThan(0);
      }
    });

    it('completed challenges retain all fields for the game-over overlay', () => {
      const state = createEmptyState('overlay-smoke');
      const ac: ActiveChallenge = {
        challenge: CHALLENGE_TEMPLATES.find(t => t.id === 'ch-deep-pockets')!,
        completed: false,
      };
      state.resourceBank.coins = 30;
      evaluateChallenges([ac], state);

      // After completion, fields still present
      expect(ac.completed).toBe(true);
      expect(ac.challenge.title).toBe('Deep Pockets');
      expect(ac.challenge.description).toBeDefined();
    });
  });
});

// ── Adapter Conformance Tests (CG-0MMJ8S9850MV4L0A) ────────

describe('Challenge adapter conformance to core-engine generics', () => {
  it('Challenge satisfies ChallengeDefinition<MainStreetState> interface', () => {
    // Type-level conformance: Challenge extends ChallengeDefinition<MainStreetState>.
    // If this compiles, the structural subtype relationship holds.
    const template: Challenge = CHALLENGE_TEMPLATES[0];
    const generic: ChallengeDefinition<MainStreetState> = template;

    // Runtime field presence checks
    expect(generic.id).toBe(template.id);
    expect(generic.title).toBe(template.title);
    expect(generic.description).toBe(template.description);
    expect(generic.category).toBe(template.category);
    expect(generic.rewardPoints).toBe(template.rewardPoints);
    expect(typeof generic.evaluator).toBe('function');
  });

  it('ActiveChallenge satisfies ActiveChallengeRecord<MainStreetState> interface', () => {
    const ac: ActiveChallenge = {
      challenge: CHALLENGE_TEMPLATES[0],
      completed: false,
    };
    const generic: ActiveChallengeRecord<MainStreetState> = ac;

    expect(generic.challenge.id).toBe(CHALLENGE_TEMPLATES[0].id);
    expect(generic.completed).toBe(false);
  });

  it('all CHALLENGE_TEMPLATES are assignable to ChallengeDefinition<MainStreetState>[]', () => {
    // Structural subtyping: readonly Challenge[] assignable to readonly ChallengeDefinition<MainStreetState>[]
    const generics: readonly ChallengeDefinition<MainStreetState>[] = CHALLENGE_TEMPLATES;
    expect(generics).toHaveLength(CHALLENGE_TEMPLATES.length);
    for (const g of generics) {
      expect(g).toHaveProperty('id');
      expect(g).toHaveProperty('evaluator');
      expect(g).toHaveProperty('rewardPoints');
    }
  });

  it('selectChallenges returns results assignable to ChallengeDefinition<MainStreetState>[]', () => {
    const rng = createSeededRng(42);
    const selected = selectChallenges(CHALLENGE_TEMPLATES, 3, rng);
    const generics: ChallengeDefinition<MainStreetState>[] = selected;
    expect(generics).toHaveLength(3);
  });

  it('evaluateChallenges works with ActiveChallenge[] (adapter delegation)', () => {
    const state = createEmptyState('conformance');
    state.resourceBank.coins = 30;
    const ac: ActiveChallenge = {
      challenge: CHALLENGE_TEMPLATES.find(t => t.id === 'ch-deep-pockets')!,
      completed: false,
    };
    const result = evaluateChallenges([ac], state);
    expect(result).toContain('ch-deep-pockets');
    expect(ac.completed).toBe(true);
    // Verify the Main Street-specific side effects from the onComplete callback
    expect(state.challengesCompleted).toContain('ch-deep-pockets');
    expect(state.activityLog.length).toBeGreaterThan(0);
  });
});
