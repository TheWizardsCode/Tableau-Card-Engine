/**
 * Main Street: Tier Definition Registry
 *
 * Defines the 5-tier meta-progression system. Each tier maps to a set of
 * unlock thresholds (reputation or challenge-based) and card assignments.
 *
 * This is the authoritative source for tier thresholds and card assignments.
 * See docs/main-street/prd-milestone-2.md Section 2 and 4.3.5.
 *
 * @module
 */

import type { MainStreetState } from './MainStreetState';
import type { ChallengeCategory } from './MainStreetChallenges';

// ── Tier Types ──────────────────────────────────────────────

/** Definition of a single progression tier. */
export interface TierDefinition {
  /** Tier identifier, e.g. 'tier-1'. */
  id: string;
  /** Human-readable tier name, e.g. 'Foundation'. */
  name: string;
  /** Evaluation order (1-5). Lower tiers are evaluated first. */
  order: number;
  /** Minimum reputation at end-of-run to unlock this tier. 0 for Tier 1 (always unlocked). */
  reputationThreshold: number;
  /**
   * Challenge-based unlock condition. Returns true if the run's completed
   * challenges satisfy this tier's challenge path. Always returns false for
   * Tier 1 (baseline, always unlocked).
   */
  challengeCondition: (state: MainStreetState) => boolean;
  /** Card IDs added by THIS tier only (not cumulative). */
  newCardIds: string[];
  /** All card IDs available at this tier (cumulative from all lower tiers). */
  cumulativeCardIds: string[];
}

// ── Tier 1 Card IDs (M1 Baseline) ──────────────────────────

const TIER_1_CARD_IDS: string[] = [
  // M1 baseline (13)
  // Business (5)
  'biz-bakery',
  'biz-diner',
  'biz-bookshop',
  'biz-park',
  'biz-hardware',
  // Event (5)
  'evt-festival',
  'evt-rainy',
  'evt-tax',
  'evt-award',
  'evt-inspection',
  // Upgrade (3)
  'upg-patisserie',
  'upg-bistro',
  'upg-library',

  // Early expanded sample (~10% of expanded set => 5 cards)
  'biz-pawnshop',
  'biz-laundromat',
  'evt-grand-opening',
  'upg-garden',
  'upg-vintage-shop',
];

// ── Tier 2 Card IDs (Rising Street) ────────────────────────

const TIER_2_NEW_CARD_IDS: string[] = [
  'biz-boutique',
  'biz-cafe',
  'biz-arcade',
  'evt-wellness-fair',
  'evt-block-party',
  'upg-bread-factory',
  'upg-designer-store',
  'upg-drive-in',
  'upg-dry-cleaners',
  'upg-fast-food',
];

// ── Tier 3 Card IDs (Neighborhood) ─────────────────────────

const TIER_3_NEW_CARD_IDS: string[] = [
  'biz-barbershop',
  'biz-cinema',
  'biz-food-truck',
  'evt-charity-drive',
  'evt-construction',
  'evt-food-critic',
  'upg-gaming-lounge',
  'upg-imax',
  'upg-garden-center',
  'upg-gourmet-truck',
];

// ── Tier 4 Card IDs (District) ─────────────────────────────

const TIER_4_NEW_CARD_IDS: string[] = [
  'biz-gallery',
  'biz-florist',
  'biz-clinic',
  'evt-noise-complaint',
  'evt-pipe-burst',
  'evt-power-outage',
  'upg-grand-bakehouse',
  'upg-home-improvement',
  'upg-medical-center',
  'upg-museum',
];

// ── Tier 5 Card IDs (Landmark) ─────────────────────────────

const TIER_5_NEW_CARD_IDS: string[] = [
  'biz-spa',
  'evt-shoplifting',
  'evt-vandalism',
  'evt-viral-review',
  'upg-luxury-retreat',
  'upg-multiplex',
  'upg-resort-spa',
  'upg-restaurant',
  'upg-roastery',
  'upg-salon',
  'upg-wellness-center',
];

// ── Challenge Condition Helpers ─────────────────────────────

/**
 * Returns the number of completed challenges in the run.
 */
function completedChallengeCount(state: MainStreetState): number {
  return state.challengesCompleted.length;
}

/**
 * Returns the categories of the completed challenges.
 */
function completedChallengeCategories(state: MainStreetState): Set<ChallengeCategory> {
  const categories = new Set<ChallengeCategory>();
  for (const ac of state.activeChallenges) {
    if (ac.completed) {
      categories.add(ac.challenge.category);
    }
  }
  return categories;
}

/**
 * Returns true if at least one completed challenge has one of the given categories.
 */
function hasCompletedChallengeInCategory(
  state: MainStreetState,
  ...categories: ChallengeCategory[]
): boolean {
  const completed = completedChallengeCategories(state);
  return categories.some((cat) => completed.has(cat));
}

// ── Tier Definitions ────────────────────────────────────────

/**
 * The authoritative tier definition registry.
 *
 * Maps tier IDs to their full definitions including thresholds, challenge
 * conditions, and card assignments.
 */
export const TIER_DEFINITIONS: Record<string, TierDefinition> = {
  'tier-1': {
    id: 'tier-1',
    name: 'Foundation',
    order: 1,
    reputationThreshold: 0,
    challengeCondition: () => false, // Tier 1 is always unlocked by default
    newCardIds: TIER_1_CARD_IDS,
    cumulativeCardIds: [...TIER_1_CARD_IDS],
  },

  'tier-2': {
    id: 'tier-2',
    name: 'Rising Street',
    order: 2,
    reputationThreshold: 6,
    // Challenge path: Complete any 2 challenges in a single run
    challengeCondition: (state) => completedChallengeCount(state) >= 2,
    newCardIds: TIER_2_NEW_CARD_IDS,
    cumulativeCardIds: [...TIER_1_CARD_IDS, ...TIER_2_NEW_CARD_IDS],
  },

  'tier-3': {
    id: 'tier-3',
    name: 'Neighborhood',
    order: 3,
    reputationThreshold: 8,
    // Challenge path: Complete 1 synergy challenge AND 1 resource challenge
    challengeCondition: (state) =>
      hasCompletedChallengeInCategory(state, 'synergy') &&
      hasCompletedChallengeInCategory(state, 'resource'),
    newCardIds: TIER_3_NEW_CARD_IDS,
    cumulativeCardIds: [...TIER_1_CARD_IDS, ...TIER_2_NEW_CARD_IDS, ...TIER_3_NEW_CARD_IDS],
  },

  'tier-4': {
    id: 'tier-4',
    name: 'District',
    order: 4,
    reputationThreshold: 10,
    // Challenge path: Complete any 3 challenges (at least 1 must be cross-cutting or placement)
    challengeCondition: (state) =>
      completedChallengeCount(state) >= 3 &&
      hasCompletedChallengeInCategory(state, 'cross-cutting', 'placement'),
    newCardIds: TIER_4_NEW_CARD_IDS,
    cumulativeCardIds: [
      ...TIER_1_CARD_IDS,
      ...TIER_2_NEW_CARD_IDS,
      ...TIER_3_NEW_CARD_IDS,
      ...TIER_4_NEW_CARD_IDS,
    ],
  },

  'tier-5': {
    id: 'tier-5',
    name: 'Landmark',
    order: 5,
    reputationThreshold: 12,
    // Challenge path: Complete the "Diversified" challenge
    challengeCondition: (state) => state.challengesCompleted.includes('ch-diversified'),
    newCardIds: TIER_5_NEW_CARD_IDS,
    cumulativeCardIds: [
      ...TIER_1_CARD_IDS,
      ...TIER_2_NEW_CARD_IDS,
      ...TIER_3_NEW_CARD_IDS,
      ...TIER_4_NEW_CARD_IDS,
      ...TIER_5_NEW_CARD_IDS,
    ],
  },
};

/**
 * Tier definitions sorted by evaluation order (ascending).
 * Tier 1 is first, Tier 5 is last.
 */
export const ORDERED_TIER_DEFINITIONS: readonly TierDefinition[] = Object.values(
  TIER_DEFINITIONS,
).sort((a, b) => a.order - b.order);

// ── Utility Functions ───────────────────────────────────────

/**
 * Derives the full list of unlocked card IDs from a list of unlocked tier IDs.
 *
 * This is used both for campaign persistence (deriving unlockedCardIds from
 * unlockedTiers) and for v1->v2 migration.
 *
 * @param unlockedTiers  Array of tier IDs, e.g. ['tier-1', 'tier-2'].
 * @returns Flat array of all card IDs available at the highest unlocked tier.
 */
export function deriveUnlockedCardIds(unlockedTiers: string[]): string[] {
  const allCardIds = new Set<string>();
  for (const tierId of unlockedTiers) {
    const tier = TIER_DEFINITIONS[tierId];
    if (tier) {
      for (const cardId of tier.newCardIds) {
        allCardIds.add(cardId);
      }
    }
  }
  return [...allCardIds];
}

/**
 * Returns the highest-order `TierDefinition` among the given unlocked tier IDs,
 * or `undefined` if `unlockedTiers` is empty / contains no valid IDs.
 */
export function highestUnlockedTier(
  unlockedTiers: string[],
): TierDefinition | undefined {
  let best: TierDefinition | undefined;
  for (const id of unlockedTiers) {
    const def = TIER_DEFINITIONS[id];
    if (def && (!best || def.order > best.order)) best = def;
  }
  return best;
}
