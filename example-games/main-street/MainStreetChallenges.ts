/**
 * Main Street: Challenge System
 *
 * Defines challenge types, the template catalog, deterministic selection,
 * and evaluation logic. Challenges provide varied meta-goals across runs,
 * awarding bonus points when their conditions are met.
 *
 * Categories:
 *   - synergy:      Rewards building adjacency clusters of specific types
 *   - placement:    Rewards spatial arrangement on the street grid
 *   - resource:     Rewards accumulating coins or reputation
 *   - upgrade:      Rewards upgrading businesses
 *   - cross-cutting: Rewards diversity or multi-category achievements
 *
 * ## Engine Component Adapter (CG-0MMJ8S9850MV4L0A)
 *
 * This module's types implement the generic `ChallengeDefinition<TState>`
 * and `ActiveChallengeRecord<TState>` interfaces from `@core-engine`.
 * The `Challenge` type is a `ChallengeDefinition<MainStreetState>` and
 * `ActiveChallenge` is an `ActiveChallengeRecord<MainStreetState>`.
 *
 * Selection and evaluation delegate to the generic `@core-engine`
 * functions, with Main Street-specific wrappers for backward compatibility.
 *
 * **M6 Extraction TODO:** When extracting to a shared engine module,
 * remove the game-specific re-exports and import directly from
 * `@core-engine/ChallengeSystem`. The evaluator functions, template
 * catalog, and helper functions remain game-specific.
 *
 * @module
 */

import type { MainStreetState } from './MainStreetState';
import type { SynergyType } from './MainStreetCards';
import { CHALLENGE_BONUS_POINTS } from './MainStreetCards';
import type {
  ChallengeDefinition,
  ActiveChallengeRecord,
} from '../../src/core-engine/ChallengeSystem';
import {
  selectChallenges as genericSelectChallenges,
  evaluateChallenges as genericEvaluateChallenges,
} from '../../src/core-engine/ChallengeSystem';

// ── Challenge Types ─────────────────────────────────────────

/** Categories for organizing Main Street challenges. */
export type ChallengeCategory =
  | 'synergy'
  | 'placement'
  | 'resource'
  | 'upgrade'
  | 'cross-cutting';

/**
 * A Main Street challenge template: a meta-goal that can be selected for a run.
 *
 * Implements `ChallengeDefinition<MainStreetState>` from the core engine.
 * Each challenge has a pure evaluator function that returns true
 * when the challenge condition is met based on the current game state.
 */
export interface Challenge extends ChallengeDefinition<MainStreetState> {
  /** Category narrowed to Main Street's challenge categories. */
  readonly category: ChallengeCategory;
}

/**
 * An active challenge during a game run, tracking completion state.
 *
 * Implements `ActiveChallengeRecord<MainStreetState>` from the core engine.
 */
export interface ActiveChallenge extends ActiveChallengeRecord<MainStreetState> {
  /** The challenge template (narrowed to Main Street's Challenge type). */
  readonly challenge: Challenge;
}

// ── Evaluator Helpers ───────────────────────────────────────

/**
 * Counts placed businesses matching a specific synergy type.
 */
function countBusinessesBySynergy(state: MainStreetState, synergy: SynergyType): number {
  return state.streetGrid.filter(
    b => b !== null && b.synergyTypes.includes(synergy),
  ).length;
}

/**
 * Counts total placed businesses on the street grid.
 */
function countPlacedBusinesses(state: MainStreetState): number {
  return state.streetGrid.filter(b => b !== null).length;
}

/**
 * Counts the number of adjacent pairs sharing at least one synergy type.
 */
function countAdjacentSynergyPairs(state: MainStreetState): number {
  let pairs = 0;
  for (let i = 0; i < state.streetGrid.length - 1; i++) {
    const a = state.streetGrid[i];
    const b = state.streetGrid[i + 1];
    if (a && b) {
      const shared = a.synergyTypes.some(st => b.synergyTypes.includes(st));
      if (shared) pairs++;
    }
  }
  return pairs;
}

/**
 * Counts distinct synergy types represented on the street grid.
 */
function countDistinctSynergyTypes(state: MainStreetState): number {
  const types = new Set<SynergyType>();
  for (const biz of state.streetGrid) {
    if (biz) {
      for (const st of biz.synergyTypes) {
        types.add(st);
      }
    }
  }
  return types.size;
}

/**
 * Counts placed businesses that have been upgraded (level > 0).
 */
function countUpgradedBusinesses(state: MainStreetState): number {
  return state.streetGrid.filter(b => b !== null && b.level > 0).length;
}

/**
 * Finds the longest contiguous run of occupied slots on the grid.
 */
function longestContiguousRun(state: MainStreetState): number {
  let maxRun = 0;
  let current = 0;
  for (const slot of state.streetGrid) {
    if (slot !== null) {
      current++;
      if (current > maxRun) maxRun = current;
    } else {
      current = 0;
    }
  }
  return maxRun;
}

// ── Challenge Templates ─────────────────────────────────────

/**
 * The full catalog of challenge templates.
 *
 * 12 challenges across 5 categories, with at least 2 per category.
 * Every synergy type appears in at least one synergy-focused challenge.
 */
export const CHALLENGE_TEMPLATES: readonly Challenge[] = [
  // ── Synergy Challenges (3) ──────────────────────────────────
  {
    id: 'ch-foodie-row',
    title: 'Foodie Row',
    description: 'Place 3 or more adjacent Food businesses.',
    category: 'synergy',
    evaluator: (state: MainStreetState): boolean => {
      // Check for 3+ contiguous Food businesses
      let run = 0;
      for (const slot of state.streetGrid) {
        if (slot && slot.synergyTypes.includes('Food')) {
          run++;
          if (run >= 3) return true;
        } else {
          run = 0;
        }
      }
      return false;
    },
    rewardPoints: CHALLENGE_BONUS_POINTS,
  },
  {
    id: 'ch-culture-district',
    title: 'Cultural District',
    description: 'Have 4 or more Culture businesses on your street.',
    category: 'synergy',
    evaluator: (state: MainStreetState): boolean => {
      return countBusinessesBySynergy(state, 'Culture') >= 4;
    },
    rewardPoints: CHALLENGE_BONUS_POINTS,
  },
  {
    id: 'ch-commerce-hub',
    title: 'Commerce Hub',
    description: 'Have 3 or more Commerce businesses on your street.',
    category: 'synergy',
    evaluator: (state: MainStreetState): boolean => {
      return countBusinessesBySynergy(state, 'Commerce') >= 3;
    },
    rewardPoints: CHALLENGE_BONUS_POINTS,
  },

  // ── Placement Challenges (2) ────────────────────────────────
  {
    id: 'ch-full-block',
    title: 'Full Block',
    description: 'Fill 5 or more contiguous street slots with businesses.',
    category: 'placement',
    evaluator: (state: MainStreetState): boolean => {
      return longestContiguousRun(state) >= 5;
    },
    rewardPoints: CHALLENGE_BONUS_POINTS,
  },
  {
    id: 'ch-bustling-street',
    title: 'Bustling Street',
    description: 'Place businesses in at least 8 of the 10 street slots.',
    category: 'placement',
    evaluator: (state: MainStreetState): boolean => {
      return countPlacedBusinesses(state) >= 8;
    },
    rewardPoints: CHALLENGE_BONUS_POINTS,
  },

  // ── Resource Challenges (2) ─────────────────────────────────
  {
    id: 'ch-deep-pockets',
    title: 'Deep Pockets',
    description: 'Accumulate 3000 or more coins at any point.',
    category: 'resource',
    evaluator: (state: MainStreetState): boolean => {
      return state.resourceBank.coins >= 3000;
    },
    rewardPoints: CHALLENGE_BONUS_POINTS,
  },
  {
    id: 'ch-beloved-mayor',
    title: 'Beloved Mayor',
    description: 'Reach 1000 or more reputation.',
    category: 'resource',
    evaluator: (state: MainStreetState): boolean => {
      return state.resourceBank.reputation >= 1000;
    },
    rewardPoints: CHALLENGE_BONUS_POINTS,
  },

  // ── Upgrade Challenges (2) ──────────────────────────────────
  {
    id: 'ch-renovator',
    title: 'Renovator',
    description: 'Upgrade at least 3 different businesses.',
    category: 'upgrade',
    evaluator: (state: MainStreetState): boolean => {
      return countUpgradedBusinesses(state) >= 3;
    },
    rewardPoints: CHALLENGE_BONUS_POINTS,
  },
  {
    id: 'ch-first-upgrade',
    title: 'First Upgrade',
    description: 'Upgrade at least 1 business.',
    category: 'upgrade',
    evaluator: (state: MainStreetState): boolean => {
      return countUpgradedBusinesses(state) >= 1;
    },
    rewardPoints: CHALLENGE_BONUS_POINTS,
  },

  // ── Cross-Cutting Challenges (3) ────────────────────────────
  {
    id: 'ch-diversified',
    title: 'Diversified',
    description: 'Have all 5 synergy types represented on your street.',
    category: 'cross-cutting',
    evaluator: (state: MainStreetState): boolean => {
      return countDistinctSynergyTypes(state) >= 5;
    },
    rewardPoints: CHALLENGE_BONUS_POINTS,
  },
  {
    id: 'ch-synergy-master',
    title: 'Synergy Master',
    description: 'Create 5 or more adjacent synergy pairs on your street.',
    category: 'cross-cutting',
    evaluator: (state: MainStreetState): boolean => {
      return countAdjacentSynergyPairs(state) >= 5;
    },
    rewardPoints: CHALLENGE_BONUS_POINTS,
  },
  {
    id: 'ch-entertainment-strip',
    title: 'Entertainment Strip',
    description: 'Have 3 or more Entertainment businesses on your street.',
    category: 'cross-cutting',
    evaluator: (state: MainStreetState): boolean => {
      return countBusinessesBySynergy(state, 'Entertainment') >= 3;
    },
    rewardPoints: CHALLENGE_BONUS_POINTS,
  },
];

/** Default number of challenges selected per run. */
export const DEFAULT_CHALLENGES_PER_RUN = 3;

// ── Selection ───────────────────────────────────────────────

/**
 * Selects N challenges from the template pool using seeded RNG.
 *
 * Delegates to the generic `selectChallenges` from `@core-engine`.
 * This wrapper preserves the Main Street `Challenge` return type
 * for backward compatibility.
 *
 * Edge cases:
 * - count > templates.length -> returns all templates
 * - count <= 0 -> returns empty array
 *
 * @param templates  The challenge template pool to select from.
 * @param count      Number of challenges to select.
 * @param rng        Seeded RNG function returning values in [0, 1).
 * @returns Array of selected challenges.
 */
export function selectChallenges(
  templates: readonly Challenge[],
  count: number,
  rng: () => number,
): Challenge[] {
  // Delegate to the generic core-engine implementation.
  // The cast is safe because Challenge extends ChallengeDefinition<MainStreetState>
  // and the generic function preserves element identity (no transformation).
  return genericSelectChallenges(templates, count, rng) as Challenge[];
}

// ── Evaluation ──────────────────────────────────────────────

/**
 * Evaluates all active challenges against the current game state.
 *
 * Delegates to the generic `evaluateChallenges` from `@core-engine`
 * with a Main Street-specific completion callback that:
 * - Pushes the challenge ID to `state.challengesCompleted`
 * - Adds an activity log entry
 *
 * Once a challenge is marked complete it stays complete (no revocation).
 *
 * @param activeChallenges  The active challenges to evaluate.
 * @param state             Current game state (mutated in-place: challengesCompleted, activityLog).
 * @returns Array of challenge IDs that were newly completed this call.
 */
export function evaluateChallenges(
  activeChallenges: ActiveChallenge[],
  state: MainStreetState,
): string[] {
  return genericEvaluateChallenges(
    activeChallenges,
    state,
    (challenge, s) => {
      s.challengesCompleted.push(challenge.id);
      s.activityLog.push({
        turn: s.turn,
        text: `Challenge completed: ${challenge.title} (+${challenge.rewardPoints} pts)`,
        type: 'gain',
      });
    },
  );
}
