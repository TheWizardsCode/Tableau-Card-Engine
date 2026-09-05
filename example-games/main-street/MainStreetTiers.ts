/**
 * Main Street: Tier Definition Registry
 *
 * Defines the 12-tier meta-progression system. Each tier maps to a set of
 * unlock thresholds (reputation or challenge-based) and card assignments.
 *
 * **Card-to-tier assignments** are read from the `tier` column in
 * `card-data.csv` via `CARD_TIER_MAP` (exported from `MainStreetCards.ts`).
 * This keeps per-card tier data colocated with card templates and editable
 * without TypeScript. Tier new-card arrays are built generically from the
 * map (tiers '1'..'12'), so adding a card in the CSV is enough to register
 * it in the progression.
 *
 * **Tier structure** (thresholds, challenge conditions, ordering) remains
 * in TypeScript and is defined below in `TIER_CONFIG`, from which
 * `TIER_DEFINITIONS` is generated.
 *
 * Expansion CG-0MT3C744B009DS84: 5 -> 12 tiers. Reputation thresholds form
 * an anchored ladder (old 5-tier anchors 800/1600/3200/6400 preserved at T3/T5/
 * T7/T11) extended to an aspirational T12=8000.
 *
 * See docs/main-street/prd-milestone-2.md Section 2 and 4.3.5.
 *
 * @module
 */

import type { MainStreetState } from './MainStreetState';
import type { ChallengeCategory } from './MainStreetChallenges';
import { CARD_TIER_MAP } from './MainStreetCards';

// ── Tier Types ──────────────────────────────────────────────

/** Definition of a single progression tier. */
export interface TierDefinition {
  /** Tier identifier, e.g. 'tier-1'. */
  id: string;
  /** Human-readable tier name, e.g. 'Foundation'. */
  name: string;
  /** Evaluation order (1-12). Lower tiers are evaluated first. */
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

// ── Tier Card IDs (from CSV) ───────────────────────────────

/**
 * Builds the per-tier new-card arrays generically from `CARD_TIER_MAP`.
 * Tiers are keyed '1'..'12' (the CSV `tier` column). Any card without a
 * tier in 1..12 is skipped (defensive; the CSV is validated at design time).
 */
function buildTierNewCardIds(): string[][] {
  const byTier: string[][] = Array.from({ length: 12 }, () => []);
  for (const [cardId, tier] of CARD_TIER_MAP) {
    const idx = Number(tier);
    if (Number.isInteger(idx) && idx >= 1 && idx <= 12) {
      byTier[idx - 1].push(cardId);
    }
  }
  return byTier;
}

const TIER_NEW_CARD_IDS: string[][] = buildTierNewCardIds();

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

// ── Tier Configuration ──────────────────────────────────────

/**
 * Per-tier static configuration: order, name, reputation threshold and
 * challenge-based unlock condition. IDs are derived ('tier-1'..'tier-12')
 * and card arrays are injected from `TIER_NEW_CARD_IDS`.
 *
 * Challenge path is progressive (CG-0MT3C744B009DS84):
 *   T2-T3  easy counts, T4-T6/8 category combinations, T7/9 counts with
 *   category gates, T10-T12 specific flagship cross-cutting challenges.
 */
interface TierConfig {
  name: string;
  reputationThreshold: number;
  challengeCondition: (state: MainStreetState) => boolean;
}

const TIER_CONFIG: readonly TierConfig[] = [
  // tier-1 — always unlocked
  {
    name: 'Foundation',
    reputationThreshold: 0,
    challengeCondition: () => false,
  },
  // tier-2 — Rising Street: any 1 completed challenge
  {
    name: 'Rising Street',
    reputationThreshold: 400,
    challengeCondition: (state) => completedChallengeCount(state) >= 1,
  },
  // tier-3 — Neighborhood: any 2 completed challenges
  {
    name: 'Neighborhood',
    reputationThreshold: 800,
    challengeCondition: (state) => completedChallengeCount(state) >= 2,
  },
  // tier-4 — District: 1 synergy AND 1 resource challenge
  {
    name: 'District',
    reputationThreshold: 1200,
    challengeCondition: (state) =>
      hasCompletedChallengeInCategory(state, 'synergy') &&
      hasCompletedChallengeInCategory(state, 'resource'),
  },
  // tier-5 — Midtown: 3 challenges (at least 1 cross-cutting or placement)
  {
    name: 'Midtown',
    reputationThreshold: 1600,
    challengeCondition: (state) =>
      completedChallengeCount(state) >= 3 &&
      hasCompletedChallengeInCategory(state, 'cross-cutting', 'placement'),
  },
  // tier-6 — Metropolitan: synergy + placement + upgrade
  {
    name: 'Metropolitan',
    reputationThreshold: 2400,
    challengeCondition: (state) =>
      hasCompletedChallengeInCategory(state, 'synergy') &&
      hasCompletedChallengeInCategory(state, 'placement') &&
      hasCompletedChallengeInCategory(state, 'upgrade'),
  },
  // tier-7 — City Center: any 4 completed challenges
  {
    name: 'City Center',
    reputationThreshold: 3200,
    challengeCondition: (state) => completedChallengeCount(state) >= 4,
  },
  // tier-8 — Capital: synergy + resource + upgrade
  {
    name: 'Capital',
    reputationThreshold: 4000,
    challengeCondition: (state) =>
      hasCompletedChallengeInCategory(state, 'synergy') &&
      hasCompletedChallengeInCategory(state, 'resource') &&
      hasCompletedChallengeInCategory(state, 'upgrade'),
  },
  // tier-9 — Iconic Quarter: 4 challenges incl. a cross-cutting one
  {
    name: 'Iconic Quarter',
    reputationThreshold: 4800,
    challengeCondition: (state) =>
      completedChallengeCount(state) >= 4 &&
      hasCompletedChallengeInCategory(state, 'cross-cutting'),
  },
  // tier-10 — Historic Mile: complete ch-diversified (all 5 synergy types)
  {
    name: 'Historic Mile',
    reputationThreshold: 5600,
    challengeCondition: (state) => state.challengesCompleted.includes('ch-diversified'),
  },
  // tier-11 — National Street: complete ch-synergy-master (5+ synergy pairs)
  {
    name: 'National Street',
    reputationThreshold: 6400,
    challengeCondition: (state) => state.challengesCompleted.includes('ch-synergy-master'),
  },
  // tier-12 — Legendary Main Street: both flagship cross-cutting challenges
  {
    name: 'Legendary Main Street',
    reputationThreshold: 8000,
    challengeCondition: (state) =>
      state.challengesCompleted.includes('ch-diversified') &&
      state.challengesCompleted.includes('ch-synergy-master'),
  },
];

// ── Tier Definitions ────────────────────────────────────────

/**
 * The authoritative tier definition registry (built from TIER_CONFIG +
 * generic per-tier card arrays). Maps tier IDs to their full definitions
 * including thresholds, challenge conditions, and card assignments.
 */
export const TIER_DEFINITIONS: Record<string, TierDefinition> = (() => {
  const defs: Record<string, TierDefinition> = {};
  let cumulative: string[] = [];
  for (let i = 0; i < TIER_CONFIG.length; i++) {
    const tierId = `tier-${i + 1}`;
    const newCardIds = TIER_NEW_CARD_IDS[i];
    cumulative = [...cumulative, ...newCardIds];
    defs[tierId] = {
      id: tierId,
      name: TIER_CONFIG[i].name,
      order: i + 1,
      reputationThreshold: TIER_CONFIG[i].reputationThreshold,
      challengeCondition: TIER_CONFIG[i].challengeCondition,
      newCardIds,
      cumulativeCardIds: [...cumulative],
    };
  }
  return defs;
})();

/**
 * Tier definitions sorted by evaluation order (ascending).
 * Tier 1 is first, Tier 12 is last.
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