/*
 * Meta-Progression System Tests
 *
 * Comprehensive tests covering all 7 user stories from the PRD
 * (docs/main-street/prd-milestone-2.md Section 4.3.5).
 *
 * US-1: Tier evaluation at end of run (reputation thresholds)
 * US-2: Challenge-based tier unlock (alternative unlock path)
 * US-3: Milestone latch permanence (unlocks never removed)
 * US-4: Card pool filtering by tier (deck builders accept unlockedCardIds)
 * US-5: Campaign persistence round-trip (schema v2, v1→v2 migration)
 * US-6: Backward-compatible defaults (all existing tests pass unchanged)
 * US-7: Milestone history tracking (append MilestoneRecord on unlock)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SaveLoadStore } from '../../src/core-engine';
import {
  setupMainStreetGame,
  type MainStreetState,
  type MainStreetCampaignProgress,
} from '../../example-games/main-street/MainStreetState';
import {
  TIER_DEFINITIONS,
  ORDERED_TIER_DEFINITIONS,
  deriveUnlockedCardIds,
} from '../../example-games/main-street/MainStreetTiers';
import {
  createDefaultCampaignProgress,
  mainStreetCampaignSerializer,
  updateCampaignAfterRun,
  saveCampaignProgress,
  loadCampaignProgress,
  MAIN_STREET_CAMPAIGN_SCHEMA_VERSION,
} from '../../example-games/main-street/MainStreetSaveLoad';
import {
  createBusinessDeck,
  createCommunitySpaceDeck,
  createEventDeck,
  createUpgradeDeck,
  createStaffDeck,
} from '../../example-games/main-street/MainStreetCards';
import { createSeededRng } from '../../src/core-engine';
import { CHALLENGE_TEMPLATES } from '../../example-games/main-street/MainStreetChallenges';

// ── Test Helpers ────────────────────────────────────────────

function createLocalStorageMock(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
  };
}

/**
 * Creates a minimal completed MainStreetState suitable for tier evaluation.
 * Allows overriding reputation, completed challenges, finalScore, and gameResult.
 */
function createCompletedRunState(overrides: {
  reputation?: number;
  challengesCompleted?: string[];
  activeChallenges?: MainStreetState['activeChallenges'];
  finalScore?: number;
  gameResult?: MainStreetState['gameResult'];
  seed?: string;
}): MainStreetState {
  const state = setupMainStreetGame({ seed: overrides.seed ?? 'test-meta' });
  state.gameResult = overrides.gameResult ?? 'win';
  state.resourceBank.reputation = overrides.reputation ?? 0;
  state.challengesCompleted = overrides.challengesCompleted ?? [];
  state.finalScore = overrides.finalScore ?? 100;

  // If activeChallenges are provided, use them. Otherwise build from challengesCompleted.
  if (overrides.activeChallenges) {
    state.activeChallenges = overrides.activeChallenges;
  } else if (overrides.challengesCompleted && overrides.challengesCompleted.length > 0) {
    // Map completed challenge IDs to ActiveChallenge objects
    state.activeChallenges = overrides.challengesCompleted.map((id) => {
      const template = CHALLENGE_TEMPLATES.find((t) => t.id === id);
      if (!template) {
        // Create a minimal challenge template for testing
        return {
          challenge: {
            id,
            title: id,
            description: 'Test challenge',
            category: 'synergy' as const,
            evaluator: () => true,
            rewardPoints: 10,
          },
          completed: true,
        };
      }
      return { challenge: template, completed: true };
    });
  }

  return state;
}

/**
 * Creates a fresh default campaign for testing.
 */
function freshCampaign(): MainStreetCampaignProgress {
  return createDefaultCampaignProgress();
}

// ── Test Suites ─────────────────────────────────────────────

describe('Meta-Progression System', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', createLocalStorageMock());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ────────────────────────────────────────────────────────────
  // TIER REGISTRY STRUCTURE
  // ────────────────────────────────────────────────────────────

  describe('Tier registry structure', () => {
    it('defines exactly 12 tiers', () => {
      expect(Object.keys(TIER_DEFINITIONS)).toHaveLength(12);
    });

    it('has tiers named tier-1 through tier-12', () => {
      for (let i = 1; i <= 12; i++) {
        expect(TIER_DEFINITIONS[`tier-${i}`]).toBeDefined();
        expect(TIER_DEFINITIONS[`tier-${i}`].id).toBe(`tier-${i}`);
        expect(TIER_DEFINITIONS[`tier-${i}`].order).toBe(i);
      }
    });

    it('ORDERED_TIER_DEFINITIONS is sorted by ascending order', () => {
      for (let i = 1; i < ORDERED_TIER_DEFINITIONS.length; i++) {
        expect(ORDERED_TIER_DEFINITIONS[i].order).toBeGreaterThan(
          ORDERED_TIER_DEFINITIONS[i - 1].order,
        );
      }
    });

    it('Tier 1 has the starter set (15 cards incl. tutorial-pinned cards)', () => {
      // 15 = 4 business + 2 community-space + 4 events + 1 staff + 4 upgrades.
      // Includes the tutorial-pinned tier-1 cards (bakery, laundromat,
      // bookshop, library, festival, award, rainy) - CG-0MT3C744B009DS84.
      expect(TIER_DEFINITIONS['tier-1'].newCardIds).toHaveLength(15);
      expect(TIER_DEFINITIONS['tier-1'].cumulativeCardIds).toHaveLength(15);
      const tier1 = new Set(TIER_DEFINITIONS['tier-1'].newCardIds);
      for (const pinned of ['biz-bakery', 'biz-laundromat', 'biz-bookshop',
        'cs-library', 'evt-festival', 'evt-award', 'evt-rainy']) {
        expect(tier1.has(pinned), `tier-1 missing tutorial pin ${pinned}`).toBe(true);
      }
    });

    it('each subsequent tier adds additional cards', () => {
      for (let i = 2; i <= 12; i++) {
        expect(TIER_DEFINITIONS[`tier-${i}`].newCardIds.length).toBeGreaterThan(0);
      }
    });

    it('Tier 12 cumulative pool covers full catalog (142 tiered templates)', () => {
      // 142 = 133 (post-Group-D tiered catalog) + 9 staff cards now assigned a
      // tier. 12-tier expansion re-distributes across tiers 1-12.
      expect(TIER_DEFINITIONS['tier-12'].cumulativeCardIds).toHaveLength(142);
    });

    it('cumulative card IDs are actually cumulative', () => {
      for (let i = 2; i <= 12; i++) {
        const prev = new Set(TIER_DEFINITIONS[`tier-${i - 1}`].cumulativeCardIds);
        const cur = new Set(TIER_DEFINITIONS[`tier-${i}`].cumulativeCardIds);
        for (const id of prev) expect(cur.has(id)).toBe(true);
      }
    });

    it('Tier 1 reputation threshold is 0', () => {
      expect(TIER_DEFINITIONS['tier-1'].reputationThreshold).toBe(0);
    });

    it('reputation thresholds increase monotonically', () => {
      const thresholds = ORDERED_TIER_DEFINITIONS.map((t) => t.reputationThreshold);
      for (let i = 1; i < thresholds.length; i++) {
        expect(thresholds[i]).toBeGreaterThanOrEqual(thresholds[i - 1]);
      }
    });

    it('specific reputation thresholds follow the 12-tier ladder (0, 4, 8, 12, 16, 24, 32, 40, 48, 56, 64, 80)', () => {
      // Anchors 8/16/32/64 preserved from the 5-tier ladder (8, 16, 32, 64)
      // at T3/T5/T7/T11; extended to aspirational T12=80 - CG-0MT3C744B009DS84.
      const expected = [0, 4, 8, 12, 16, 24, 32, 40, 48, 56, 64, 80];
      for (let i = 0; i < 12; i++) {
        expect(TIER_DEFINITIONS[`tier-${i + 1}`].reputationThreshold).toBe(expected[i]);
      }
    });

    it('all card IDs in tier definitions reference valid template IDs', () => {
      // Build the set of template IDs from unfiltered deck builders (1 copy each)
      const allBizIds = createBusinessDeck(1).map((c) => c.id.replace(/-\d+$/, ''));
      const allCsIds = createCommunitySpaceDeck(1).map((c) => c.id.replace(/-\d+$/, ''));
      const allEvtIds = createEventDeck(1, undefined, createSeededRng(42)).map((c) => c.id.replace(/-\d+$/, ''));
      const allUpgIds = createUpgradeDeck(1).map((c) => c.id.replace(/-\d+$/, ''));
      // Staff are tier-registered since the rebalance (CG-0MT2WU0CX005Z143).
      const allStaffIds = createStaffDeck(1).map((c) => c.id.replace(/-\d+$/, ''));
      const allTemplateIds = new Set([...allBizIds, ...allCsIds, ...allEvtIds, ...allUpgIds, ...allStaffIds]);

      for (const tierDef of ORDERED_TIER_DEFINITIONS) {
        for (const cardId of tierDef.newCardIds) {
          expect(allTemplateIds.has(cardId)).toBe(true);
        }
      }
    });
  });

  // ────────────────────────────────────────────────────────────
  // US-1: TIER EVALUATION VIA REPUTATION THRESHOLDS
  // ────────────────────────────────────────────────────────────

  describe('US-1: Tier evaluation via reputation thresholds', () => {
    it('unlocks Tier 2 when reputation >= 4', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({ reputation: 4 });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-2');
    });

    it('does NOT unlock Tier 2 when reputation < 4 and no challenges', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({ reputation: 3 });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).not.toContain('tier-2');
    });

    it('unlocks Tier 3 when reputation >= 8', async () => {
      const campaign = freshCampaign();
      campaign.unlockedTiers.push('tier-2'); // Must already have tier 2 or not - tiers are independent
      const state = createCompletedRunState({ reputation: 8 });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-3');
    });

    it('unlocks Tier 4 when reputation >= 12', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({ reputation: 12 });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-4');
    });

    it('unlocks Tier 5 when reputation >= 16', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({ reputation: 16 });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-5');
    });

    it('unlocks Tier 12 only at the aspirational end-reputation (80)', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({ reputation: 80 });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-12');
    });

    it('does NOT unlock Tier 12 below 80 reputation', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({ reputation: 79 });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).not.toContain('tier-12');
    });

    it('unlocks multiple tiers in a single high-reputation run', async () => {
      const campaign = freshCampaign();
      // A run with reputation 64 should unlock tiers 2 through 11 in one go
      // (T12 needs 80; thresholds go 4, 8, 12, 16, 24, 32, 40, 48, 56, 64).
      const state = createCompletedRunState({ reputation: 64 });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-2');
      expect(campaign.unlockedTiers).toContain('tier-5');
      expect(campaign.unlockedTiers).toContain('tier-7');
      expect(campaign.unlockedTiers).toContain('tier-11');
      expect(campaign.unlockedTiers).not.toContain('tier-12');
    });

    it('updates persistentReputation to highest seen value', async () => {
      const campaign = freshCampaign();
      campaign.persistentReputation = 3;
      const state = createCompletedRunState({ reputation: 7 });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.persistentReputation).toBe(7);
    });

    it('does not lower persistentReputation on a worse run', async () => {
      const campaign = freshCampaign();
      campaign.persistentReputation = 10;
      const state = createCompletedRunState({ reputation: 4 });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.persistentReputation).toBe(10);
    });

    it('updates highestScore when new score exceeds record', async () => {
      const campaign = freshCampaign();
      campaign.highestScore = 50;
      const state = createCompletedRunState({ finalScore: 200 });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.highestScore).toBe(200);
    });

    it('does not lower highestScore on a worse run', async () => {
      const campaign = freshCampaign();
      campaign.highestScore = 200;
      const state = createCompletedRunState({ finalScore: 50 });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.highestScore).toBe(200);
    });

    it('increments totalRuns on each run', async () => {
      const campaign = freshCampaign();
      expect(campaign.totalRuns).toBe(0);

      await updateCampaignAfterRun(campaign, createCompletedRunState({}));
      expect(campaign.totalRuns).toBe(1);

      await updateCampaignAfterRun(campaign, createCompletedRunState({}));
      expect(campaign.totalRuns).toBe(2);
    });

    it('increments totalWins only on win', async () => {
      const campaign = freshCampaign();

      await updateCampaignAfterRun(campaign, createCompletedRunState({ gameResult: 'loss' }));
      expect(campaign.totalWins).toBe(0);

      await updateCampaignAfterRun(campaign, createCompletedRunState({ gameResult: 'win' }));
      expect(campaign.totalWins).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────
  // US-2: CHALLENGE-BASED TIER UNLOCK (ALTERNATIVE PATH)
  // ────────────────────────────────────────────────────────────

  describe('US-2: Challenge-based tier unlock', () => {
    it('unlocks Tier 2 with 1 completed challenge (any category)', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0, // Low rep, challenge path only
        challengesCompleted: ['ch-foodie-row'],
      });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-2');
    });

    it('does NOT unlock Tier 2 with 0 challenges', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0,
        challengesCompleted: [],
      });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).not.toContain('tier-2');
    });

    it('unlocks Tier 3 with 2 completed challenges (any category)', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-foodie-row', 'ch-deep-pockets'],
      });
      // Build activeChallenges that match the completed IDs with correct categories
      state.activeChallenges = [
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-foodie-row')!,
          completed: true,
        },
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-deep-pockets')!,
          completed: true,
        },
      ];

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-3');
    });

    it('does NOT unlock Tier 3 with only 1 challenge', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-foodie-row'],
      });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-2');
      expect(campaign.unlockedTiers).not.toContain('tier-3');
    });

    it('unlocks Tier 4 with 1 synergy + 1 resource challenge', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-foodie-row', 'ch-deep-pockets'],
      });
      state.activeChallenges = [
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-foodie-row')!,
          completed: true,
        },
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-deep-pockets')!,
          completed: true,
        },
      ];

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-4');
    });

    it('does NOT unlock Tier 4 with only synergy challenges (no resource)', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-foodie-row', 'ch-culture-district', 'ch-commerce-hub'],
      });
      state.activeChallenges = [
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-foodie-row')!,
          completed: true,
        },
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-culture-district')!,
          completed: true,
        },
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-commerce-hub')!,
          completed: true,
        },
      ];

      await updateCampaignAfterRun(campaign, state);

      // May unlock tier-2/tier-3 (3 challenges) but NOT tier-4 (needs resource)
      expect(campaign.unlockedTiers).toContain('tier-3');
      expect(campaign.unlockedTiers).not.toContain('tier-4');
    });

    it('unlocks Tier 5 with 3 challenges including cross-cutting', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-foodie-row', 'ch-deep-pockets', 'ch-diversified'],
      });
      state.activeChallenges = [
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-foodie-row')!,
          completed: true,
        },
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-deep-pockets')!,
          completed: true,
        },
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-diversified')!,
          completed: true,
        },
      ];

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-5');
    });

    it('unlocks Tier 5 with 3 challenges including placement', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-foodie-row', 'ch-deep-pockets', 'ch-full-block'],
      });
      state.activeChallenges = [
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-foodie-row')!,
          completed: true,
        },
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-deep-pockets')!,
          completed: true,
        },
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-full-block')!,
          completed: true,
        },
      ];

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-5');
    });

    it('does NOT unlock Tier 5 with 3 challenges but none cross-cutting/placement', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-foodie-row', 'ch-deep-pockets', 'ch-renovator'],
      });
      state.activeChallenges = [
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-foodie-row')!,
          completed: true,
        },
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-deep-pockets')!,
          completed: true,
        },
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-renovator')!,
          completed: true,
        },
      ];

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-4'); // synergy+resource
      expect(campaign.unlockedTiers).not.toContain('tier-5');
    });

    it('unlocks Tier 10 via the Diversified challenge (5 synergy types)', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-diversified'],
      });
      state.activeChallenges = [
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-diversified')!,
          completed: true,
        },
      ];

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-10');
    });

    it('unlocks Tier 11 via the Synergy Master challenge (5+ synergy pairs)', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-synergy-master'],
      });
      state.activeChallenges = [
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-synergy-master')!,
          completed: true,
        },
      ];

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-11');
    });

    it('does NOT unlock Tier 10 via a non-Diversified challenge', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-synergy-master'],
      });
      state.activeChallenges = [
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-synergy-master')!,
          completed: true,
        },
      ];

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).not.toContain('tier-10');
    });

    it('unlocks Tier 12 only via BOTH flagship cross-cutting challenges', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-diversified', 'ch-synergy-master'],
      });
      state.activeChallenges = [
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-diversified')!,
          completed: true,
        },
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-synergy-master')!,
          completed: true,
        },
      ];

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-12');
    });

    it('does NOT unlock Tier 12 with only one flagship challenge', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-diversified'],
      });
      state.activeChallenges = [
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-diversified')!,
          completed: true,
        },
      ];

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-10');
      expect(campaign.unlockedTiers).not.toContain('tier-12');
    });

    it('reputation and challenge paths are OR: either unlocks the tier', async () => {
      // Reputation path for tier 2
      const campaignA = freshCampaign();
      const stateA = createCompletedRunState({ reputation: 4 });
      await updateCampaignAfterRun(campaignA, stateA);
      expect(campaignA.unlockedTiers).toContain('tier-2');

      // Challenge path for tier 2
      const campaignB = freshCampaign();
      const stateB = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-foodie-row'],
      });
      await updateCampaignAfterRun(campaignB, stateB);
      expect(campaignB.unlockedTiers).toContain('tier-2');
    });
  });

  // ────────────────────────────────────────────────────────────
  // US-3: MILESTONE LATCH PERMANENCE
  // ────────────────────────────────────────────────────────────

  describe('US-3: Milestone latch permanence', () => {
    it('unlocks are never removed by subsequent runs', async () => {
      const campaign = freshCampaign();

      // First run: unlock tier-2 and tier-3 (thresholds 4 and 8)
      const run1 = createCompletedRunState({ reputation: 8 });
      await updateCampaignAfterRun(campaign, run1);
      expect(campaign.unlockedTiers).toContain('tier-2');
      expect(campaign.unlockedTiers).toContain('tier-3');

      // Second run: much lower reputation, should NOT lose tiers
      const run2 = createCompletedRunState({ reputation: 0 });
      await updateCampaignAfterRun(campaign, run2);
      expect(campaign.unlockedTiers).toContain('tier-2');
      expect(campaign.unlockedTiers).toContain('tier-3');
    });

    it('already-unlocked tiers are skipped (no duplicate entries)', async () => {
      const campaign = freshCampaign();

      // Unlock tier-2 twice with high rep
      const run1 = createCompletedRunState({ reputation: 4 });
      await updateCampaignAfterRun(campaign, run1);
      const run2 = createCompletedRunState({ reputation: 9 });
      await updateCampaignAfterRun(campaign, run2);

      const tier2Count = campaign.unlockedTiers.filter((t) => t === 'tier-2').length;
      expect(tier2Count).toBe(1);
    });

    it('tiers accumulate across multiple runs', async () => {
      const campaign = freshCampaign();

      // Run 1: unlock tier-2 only
      const run1 = createCompletedRunState({ reputation: 4 });
      await updateCampaignAfterRun(campaign, run1);
      expect(campaign.unlockedTiers).toEqual(['tier-1', 'tier-2']);

      // Run 2: unlock tier-3 (tier-2 was already unlocked)
      const run2 = createCompletedRunState({ reputation: 8 });
      await updateCampaignAfterRun(campaign, run2);
      expect(campaign.unlockedTiers).toEqual(['tier-1', 'tier-2', 'tier-3']);

      // Run 3: unlock tier-5 (rep 16 meets tier-4 (12) and tier-5 (16) too)
      const run3 = createCompletedRunState({ reputation: 16 });
      await updateCampaignAfterRun(campaign, run3);
      expect(campaign.unlockedTiers).toContain('tier-4');
      expect(campaign.unlockedTiers).toContain('tier-5');
    });
  });

  // ────────────────────────────────────────────────────────────
  // US-4: CARD POOL FILTERING BY TIER
  // ────────────────────────────────────────────────────────────

  describe('US-4: Card pool filtering by tier', () => {
    it('createBusinessDeck with tier-1 IDs returns only tier-1 business cards', () => {
      const tier1CardIds = TIER_DEFINITIONS['tier-1'].cumulativeCardIds;
      const deck = createBusinessDeck(1, tier1CardIds);
      const tier1BizIds = tier1CardIds.filter((id) => id.startsWith('biz-'));

      // Each card in the deck should have a base ID that's in tier-1
      for (const card of deck) {
        const baseId = card.id.replace(/-\d+$/, '');
        expect(tier1BizIds).toContain(baseId);
      }

      // The deck should have exactly the right number of cards
      expect(deck).toHaveLength(tier1BizIds.length * 1); // 1 copy
    });

    it('createEventDeck with tier-1 IDs returns only tier-1 event cards', () => {
      const tier1CardIds = TIER_DEFINITIONS['tier-1'].cumulativeCardIds;
      const deck = createEventDeck(1, tier1CardIds, createSeededRng(42));
      const tier1EvtIds = tier1CardIds.filter((id) => id.startsWith('evt-'));

      for (const card of deck) {
        const baseId = card.id.replace(/-\d+$/, '');
        expect(tier1EvtIds).toContain(baseId);
      }

      expect(deck).toHaveLength(tier1EvtIds.length * 1);
    });

    it('createUpgradeDeck with tier-1 IDs returns only tier-1 upgrade cards', () => {
      const tier1CardIds = TIER_DEFINITIONS['tier-1'].cumulativeCardIds;
      const deck = createUpgradeDeck(1, tier1CardIds);
      const tier1UpgIds = tier1CardIds.filter((id) => id.startsWith('upg-'));

      for (const card of deck) {
        const baseId = card.id.replace(/-\d+$/, '');
        expect(tier1UpgIds).toContain(baseId);
      }

      expect(deck).toHaveLength(tier1UpgIds.length * 1);
    });

    it('tier-2 card pool includes tier-1 cards plus new tier-2 cards', () => {
      const tier2CardIds = TIER_DEFINITIONS['tier-2'].cumulativeCardIds;
      const deck = createBusinessDeck(1, tier2CardIds);
      const tier2BizIds = tier2CardIds.filter((id) => id.startsWith('biz-'));

      // Should include tier-1 business cards AND tier-2 additions
      expect(tier2BizIds.length).toBeGreaterThan(
        TIER_DEFINITIONS['tier-1'].cumulativeCardIds.filter((id) => id.startsWith('biz-')).length,
      );

      expect(deck).toHaveLength(tier2BizIds.length);
    });

    it('setupMainStreetGame passes unlockedCardIds through to deck builders', () => {
      const tier1CardIds = TIER_DEFINITIONS['tier-1'].cumulativeCardIds;
      const state = setupMainStreetGame({
        seed: 'filter-test',
        unlockedCardIds: tier1CardIds,
      });

      // Count unique base IDs in each deck
      const bizBaseIds = new Set(state.decks.business.map((c) => c.id.replace(/-\d+$/, '')));
      const tier1BizIds = tier1CardIds.filter((id) => id.startsWith('biz-'));

      // All market business-family cards should also be from tier-1 (the
      // single row may hold community-space/upgrade/event cards too, which
      // belong to their own tier pools, CG-0MSTOATDT009BRX2).
      for (const card of state.market.cards) {
        if (card.family !== 'business') continue;
        const baseId = card.id.replace(/-\d+$/, '');
        expect(tier1BizIds).toContain(baseId);
      }

      // Remaining deck biz cards should all be from tier-1
      for (const baseId of bizBaseIds) {
        expect(tier1BizIds).toContain(baseId);
      }
    });

    it('Tier 12 pool yields all unique template IDs across all deck builders (incl. staff)', () => {
      // 134 = business (30) + event (56) + upgrade (39) + staff (9);
      // community-space (8) is not part of these builders.
      const tier12CardIds = TIER_DEFINITIONS['tier-12'].cumulativeCardIds;

      const bizDeck = createBusinessDeck(1, tier12CardIds);
      const evtDeck = createEventDeck(1, tier12CardIds, createSeededRng(42));
      const upgDeck = createUpgradeDeck(1, tier12CardIds);
      // Staff are tier-gated like every other family (CG-0MT2WU0CX005Z143).
      const staffDeck = createStaffDeck(1, tier12CardIds);

      const allBaseIds = new Set([
        ...bizDeck.map((c) => c.id.replace(/-\d+$/, '')),
        ...evtDeck.map((c) => c.id.replace(/-\d+$/, '')),
        ...upgDeck.map((c) => c.id.replace(/-\d+$/, '')),
        ...staffDeck.map((c) => c.id.replace(/-\d+$/, '')),
      ]);

      expect(allBaseIds.size).toBe(134); // +1 Graffiti Art over 133 (incl. 9 staff)
    });
  });

  // ────────────────────────────────────────────────────────────
  // US-5: CAMPAIGN PERSISTENCE ROUND-TRIP (SCHEMA V2, V1→V2 MIGRATION)
  // ────────────────────────────────────────────────────────────

  describe('US-5: Campaign persistence round-trip', () => {
    it('createDefaultCampaignProgress returns schema version 2', () => {
      const campaign = createDefaultCampaignProgress();
      expect(campaign.schemaVersion).toBe(MAIN_STREET_CAMPAIGN_SCHEMA_VERSION);
      expect(campaign.schemaVersion).toBe(2);
    });

    it('default campaign has tier-1 unlocked with all 15 tier-1 card IDs', () => {
      const campaign = createDefaultCampaignProgress();
      expect(campaign.unlockedTiers).toEqual(['tier-1']);
      // 15 tier-1 cards in the 12-tier design (CG-0MT3C744B009DS84).
      const expected = deriveUnlockedCardIds(['tier-1']);
      expect(campaign.unlockedCardIds).toHaveLength(expected.length);
      expect(campaign.unlockedCardIds).toHaveLength(15);
      expect(campaign.milestoneHistory).toEqual([]);
    });

    it('saves and loads campaign progress via SaveLoadStore', async () => {
      const store = new SaveLoadStore();
      const campaign = createDefaultCampaignProgress();
      campaign.unlockedTiers = ['tier-1', 'tier-2'];
      campaign.unlockedCardIds = deriveUnlockedCardIds(campaign.unlockedTiers);
      campaign.totalRuns = 5;
      campaign.totalWins = 3;
      campaign.highestScore = 250;
      campaign.persistentReputation = 7;

      await saveCampaignProgress(store, campaign);
      const loaded = await loadCampaignProgress(store);

      expect(loaded).not.toBeNull();
      expect(loaded!.schemaVersion).toBe(2);
      expect(loaded!.unlockedTiers).toEqual(['tier-1', 'tier-2']);
      expect(loaded!.unlockedCardIds).toEqual(campaign.unlockedCardIds);
      expect(loaded!.totalRuns).toBe(5);
      expect(loaded!.totalWins).toBe(3);
      expect(loaded!.highestScore).toBe(250);
      expect(loaded!.persistentReputation).toBe(7);
    });

    it('v1 campaign data is migrated to v2 on load', () => {
      // Simulate v1 data (no schemaVersion, no unlockedCardIds, no milestoneHistory)
      const v1Data = {
        unlockedTiers: ['tier-1', 'tier-2'],
        persistentReputation: 8,
        highestScore: 150,
        totalRuns: 3,
        totalWins: 1,
        lastUpdatedAt: '2025-01-01T00:00:00Z',
      } as unknown as MainStreetCampaignProgress;

      const migrated = mainStreetCampaignSerializer.deserialize(v1Data);

      expect(migrated.schemaVersion).toBe(2);
      expect(migrated.unlockedCardIds).toEqual(
        deriveUnlockedCardIds(['tier-1', 'tier-2']),
      );
      expect(migrated.milestoneHistory).toEqual([]);
      // Original fields preserved
      expect(migrated.unlockedTiers).toEqual(['tier-1', 'tier-2']);
      expect(migrated.persistentReputation).toBe(8);
    });

    it('v1 data with explicit schemaVersion: 1 is also migrated', () => {
      const v1Data = {
        schemaVersion: 1,
        unlockedTiers: ['tier-1'],
        persistentReputation: 0,
        highestScore: 0,
        totalRuns: 0,
        totalWins: 0,
        lastUpdatedAt: '2025-01-01T00:00:00Z',
      } as unknown as MainStreetCampaignProgress;

      const migrated = mainStreetCampaignSerializer.deserialize(v1Data);

      expect(migrated.schemaVersion).toBe(2);
      expect(migrated.unlockedCardIds).toEqual(deriveUnlockedCardIds(['tier-1']));
      expect(migrated.milestoneHistory).toEqual([]);
    });

    it('v2 data passes through without modification', () => {
      const v2Data = createDefaultCampaignProgress();
      v2Data.milestoneHistory.push({
        tierId: 'tier-2',
        triggerType: 'reputation',
        reputationAtUnlock: 8,
        challengeIdsAtUnlock: null,
        runFinalScore: 120,
        runSeed: 'test',
        unlockedAt: '2025-06-01T00:00:00Z',
      });

      const result = mainStreetCampaignSerializer.deserialize(v2Data);

      expect(result.schemaVersion).toBe(2);
      expect(result.milestoneHistory).toHaveLength(1);
    });

    it('updateCampaignAfterRun persists to store when provided', async () => {
      const store = new SaveLoadStore();
      const campaign = freshCampaign();
      const state = createCompletedRunState({ reputation: 16 });

      await updateCampaignAfterRun(campaign, state, store);

      const loaded = await loadCampaignProgress(store);
      expect(loaded).not.toBeNull();
      expect(loaded!.unlockedTiers).toContain('tier-2');
      expect(loaded!.unlockedTiers).toContain('tier-3');
      expect(loaded!.totalRuns).toBe(1);
    });

    it('updateCampaignAfterRun works without store (no persistence)', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({ reputation: 8 });

      // Should not throw when store is undefined
      const result = await updateCampaignAfterRun(campaign, state);

      expect(result.unlockedTiers).toContain('tier-2');
    });

    it('lastUpdatedAt is set after updateCampaignAfterRun', async () => {
      const campaign = freshCampaign();
      const oldTimestamp = campaign.lastUpdatedAt;
      const state = createCompletedRunState({});

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 5));
      await updateCampaignAfterRun(campaign, state);

      expect(campaign.lastUpdatedAt).not.toBe(oldTimestamp);
    });
  });

  // ────────────────────────────────────────────────────────────
  // US-6: BACKWARD-COMPATIBLE DEFAULTS
  // ────────────────────────────────────────────────────────────

  describe('US-6: Backward-compatible defaults', () => {
    it('setupMainStreetGame without unlockedCardIds uses full card pool', () => {
      const stateNoFilter = setupMainStreetGame({ seed: 'compat-test' });
      const stateUndefined = setupMainStreetGame({
        seed: 'compat-test',
        unlockedCardIds: undefined,
      });

      // Verify decks are using full pool (should be same as explicit undefined)
      expect(stateNoFilter.decks.business.length).toBe(stateUndefined.decks.business.length);
      expect(stateNoFilter.decks.event.length).toBe(stateUndefined.decks.event.length);
      expect(stateNoFilter.decks.upgrade.length).toBe(stateUndefined.decks.upgrade.length);
    });

    it('createBusinessDeck without unlockedCardIds includes more cards than tier-1 alone', () => {
      const fullDeck = createBusinessDeck(1);
      const tier1Deck = createBusinessDeck(1, TIER_DEFINITIONS['tier-1'].cumulativeCardIds);
      // Full pool should have more templates than just tier-1
      expect(fullDeck.length).toBeGreaterThan(tier1Deck.length);
    });

    it('createEventDeck without unlockedCardIds includes more cards than tier-1 alone', () => {
      const fullDeck = createEventDeck(1, undefined, createSeededRng(42));
      const tier1Deck = createEventDeck(1, TIER_DEFINITIONS['tier-1'].cumulativeCardIds, createSeededRng(42));
      expect(fullDeck.length).toBeGreaterThan(tier1Deck.length);
    });

    it('createUpgradeDeck without unlockedCardIds includes more cards than tier-1 alone', () => {
      const fullDeck = createUpgradeDeck(1);
      const tier1Deck = createUpgradeDeck(1, TIER_DEFINITIONS['tier-1'].cumulativeCardIds);
      expect(fullDeck.length).toBeGreaterThan(tier1Deck.length);
    });

    it('createBusinessDeck with empty array returns empty deck', () => {
      const deck = createBusinessDeck(3, []);
      expect(deck).toHaveLength(0);
    });

    it('Tier 1 challenge condition always returns false', () => {
      const state = createCompletedRunState({});
      expect(TIER_DEFINITIONS['tier-1'].challengeCondition(state)).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // US-7: MILESTONE HISTORY TRACKING
  // ────────────────────────────────────────────────────────────

  describe('US-7: Milestone history tracking', () => {
    it('appends MilestoneRecord when a tier is unlocked via reputation', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 4,
        finalScore: 120,
        seed: 'ms-rep-test',
      });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.milestoneHistory).toHaveLength(1);
      const record = campaign.milestoneHistory[0];
      expect(record.tierId).toBe('tier-2');
      expect(record.triggerType).toBe('reputation');
      expect(record.reputationAtUnlock).toBe(4);
      expect(record.challengeIdsAtUnlock).toBeNull();
      expect(record.runFinalScore).toBe(120);
      expect(record.runSeed).toBe('ms-rep-test');
      expect(record.unlockedAt).toBeTruthy();
      // Verify ISO 8601 timestamp format
      expect(() => new Date(record.unlockedAt)).not.toThrow();
      expect(new Date(record.unlockedAt).toISOString()).toBe(record.unlockedAt);
    });

    it('appends MilestoneRecord when a tier is unlocked via challenges', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-foodie-row'],
        finalScore: 80,
        seed: 'ms-ch-test',
      });

      await updateCampaignAfterRun(campaign, state);

      const tier2Records = campaign.milestoneHistory.filter((r) => r.tierId === 'tier-2');
      expect(tier2Records).toHaveLength(1);
      expect(tier2Records[0].triggerType).toBe('challenge');
      expect(tier2Records[0].reputationAtUnlock).toBeNull();
      expect(tier2Records[0].challengeIdsAtUnlock).toEqual(['ch-foodie-row']);
    });

    it('multiple tier unlocks in one run each produce a MilestoneRecord', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({ reputation: 64, finalScore: 500 });

      await updateCampaignAfterRun(campaign, state);

      // Rep 64 clears thresholds 4,8,12,16,24,32,40,48,56,64 => tiers 2-11
      // (10 records); tier-12 needs 80.
      expect(campaign.milestoneHistory).toHaveLength(10);
      const tierIds = campaign.milestoneHistory.map((r) => r.tierId);
      expect(tierIds).toContain('tier-2');
      expect(tierIds).toContain('tier-5');
      expect(tierIds).toContain('tier-7');
      expect(tierIds).toContain('tier-11');
      expect(tierIds).not.toContain('tier-12');
    });

    it('no MilestoneRecord is added when no new tier is unlocked', async () => {
      const campaign = freshCampaign();
      // Low reputation, no challenges -> no new tiers
      const state = createCompletedRunState({ reputation: 2 });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.milestoneHistory).toHaveLength(0);
    });

    it('MilestoneRecords accumulate across runs', async () => {
      const campaign = freshCampaign();

      // Run 1: unlock tier-2 (rep 4)
      const run1 = createCompletedRunState({ reputation: 4, seed: 'run1' });
      await updateCampaignAfterRun(campaign, run1);
      expect(campaign.milestoneHistory).toHaveLength(1);

      // Run 2: unlock tier-3 (rep 8)
      const run2 = createCompletedRunState({ reputation: 8, seed: 'run2' });
      await updateCampaignAfterRun(campaign, run2);
      expect(campaign.milestoneHistory).toHaveLength(2);

      // Run 3: no new unlock
      const run3 = createCompletedRunState({ reputation: 4, seed: 'run3' });
      await updateCampaignAfterRun(campaign, run3);
      expect(campaign.milestoneHistory).toHaveLength(2); // unchanged

      // Verify different seeds recorded
      expect(campaign.milestoneHistory[0].runSeed).toBe('run1');
      expect(campaign.milestoneHistory[1].runSeed).toBe('run2');
    });

    it('reputation trigger records reputation value; challenge trigger records null', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({ reputation: 4 });

      await updateCampaignAfterRun(campaign, state);

      const record = campaign.milestoneHistory[0];
      expect(record.triggerType).toBe('reputation');
      expect(record.reputationAtUnlock).toBe(4);
      expect(record.challengeIdsAtUnlock).toBeNull();
    });

    it('challenge trigger records challenge IDs; reputation field is null', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-diversified'],
      });
      state.activeChallenges = [
        {
          challenge: CHALLENGE_TEMPLATES.find((t) => t.id === 'ch-diversified')!,
          completed: true,
        },
      ];

      await updateCampaignAfterRun(campaign, state);

      // Find the tier-10 record (Diversified unlocks tier-10)
      const tier10Record = campaign.milestoneHistory.find((r) => r.tierId === 'tier-10');
      expect(tier10Record).toBeDefined();
      expect(tier10Record!.triggerType).toBe('challenge');
      expect(tier10Record!.reputationAtUnlock).toBeNull();
      expect(tier10Record!.challengeIdsAtUnlock).toEqual(['ch-diversified']);
    });

    it('milestone history survives save/load round-trip', async () => {
      const store = new SaveLoadStore();
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 32,
        finalScore: 300,
        seed: 'persist-ms',
      });

      await updateCampaignAfterRun(campaign, state, store);

      const loaded = await loadCampaignProgress(store);
      expect(loaded).not.toBeNull();
      expect(loaded!.milestoneHistory.length).toBeGreaterThan(0);

      // Verify milestone data integrity after round-trip
      for (const record of loaded!.milestoneHistory) {
        expect(record.tierId).toBeTruthy();
        expect(record.triggerType).toMatch(/^(reputation|challenge)$/);
        expect(record.runFinalScore).toBe(300);
        expect(record.runSeed).toBe('persist-ms');
        expect(record.unlockedAt).toBeTruthy();
      }
    });
  });

  // ────────────────────────────────────────────────────────────
  // DERIVE UNLOCKED CARD IDS
  // ────────────────────────────────────────────────────────────

  describe('deriveUnlockedCardIds', () => {
    it('returns tier-1 cards for ["tier-1"]', () => {
      const ids = deriveUnlockedCardIds(['tier-1']);
      expect(ids).toHaveLength(15); // 12-tier starter set (CG-0MT3C744B009DS84)
      expect(new Set(ids).size).toBe(15); // no duplicates
    });

    it('returns cumulative cards for ["tier-1", "tier-2"]', () => {
      const ids = deriveUnlockedCardIds(['tier-1', 'tier-2']);
      expect(ids).toHaveLength(27); // 15 (T1) + 12 (T2 new)
    });

    it('returns all 142 cards for all 12 tiers', () => {
      const allTierIds = Array.from({ length: 12 }, (_, i) => `tier-${i + 1}`);
      const ids = deriveUnlockedCardIds(allTierIds);
      expect(ids).toHaveLength(142); // full catalog incl. 9 staff
    });

    it('handles empty array', () => {
      const ids = deriveUnlockedCardIds([]);
      expect(ids).toHaveLength(0);
    });

    it('ignores unknown tier IDs gracefully', () => {
      const ids = deriveUnlockedCardIds(['tier-1', 'tier-99']);
      expect(ids).toHaveLength(15); // only tier-1 cards
    });

    it('does not produce duplicates even if tiers are listed twice', () => {
      const ids = deriveUnlockedCardIds(['tier-1', 'tier-1', 'tier-2']);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it('matches cumulativeCardIds from TIER_DEFINITIONS', () => {
      for (let i = 1; i <= 12; i++) {
        const tierIds = Array.from({ length: i }, (_, j) => `tier-${j + 1}`);
        const derived = deriveUnlockedCardIds(tierIds);
        const expected = TIER_DEFINITIONS[`tier-${i}`].cumulativeCardIds;
        expect(new Set(derived)).toEqual(new Set(expected));
      }
    });
  });

  // ────────────────────────────────────────────────────────────
  // INTEGRATION: FULL CAMPAIGN LIFECYCLE
  // ────────────────────────────────────────────────────────────

  describe('Integration: full campaign lifecycle', () => {
    it('fresh campaign -> run -> unlock -> save -> load -> verify cards -> next run uses filter', async () => {
      const store = new SaveLoadStore();

      // Start fresh campaign
      let campaign = createDefaultCampaignProgress();
      expect(campaign.unlockedTiers).toEqual(['tier-1']);

      // Simulate a winning run with high reputation
      const state = createCompletedRunState({
        reputation: 16,
        finalScore: 200,
        gameResult: 'win',
        seed: 'lifecycle-test',
      });

      // Update campaign after run and persist
      await updateCampaignAfterRun(campaign, state, store);
      expect(campaign.unlockedTiers).toContain('tier-2');
      expect(campaign.unlockedTiers).toContain('tier-3');

      // Load campaign from storage
      const loadedCampaign = await loadCampaignProgress(store);
      expect(loadedCampaign).not.toBeNull();

      // Verify unlockedCardIds match derived values
      const expectedCardIds = deriveUnlockedCardIds(loadedCampaign!.unlockedTiers);
      expect(new Set(loadedCampaign!.unlockedCardIds)).toEqual(new Set(expectedCardIds));

      // Start a new game with the loaded campaign's card filter
      const nextRun = setupMainStreetGame({
        seed: 'next-run',
        unlockedCardIds: loadedCampaign!.unlockedCardIds,
      });

      // Verify the new run's decks only contain cards from unlocked tiers
      const allowedIds = new Set(loadedCampaign!.unlockedCardIds);
      for (const card of nextRun.decks.business) {
        const baseId = card.id.replace(/-\d+$/, '');
        expect(allowedIds.has(baseId)).toBe(true);
      }
      for (const card of nextRun.market.cards) {
        const baseId = card.id.replace(/-\d+$/, '');
        expect(allowedIds.has(baseId)).toBe(true);
      }
    });

    it('campaign statistics are correct after multiple runs', async () => {
      const campaign = freshCampaign();

      // Run 1: win, moderate score
      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ gameResult: 'win', finalScore: 100, reputation: 5 }),
      );

      // Run 2: loss, high score
      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ gameResult: 'loss', finalScore: 200, reputation: 3 }),
      );

      // Run 3: win, low score but high rep
      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ gameResult: 'win', finalScore: 50, reputation: 9 }),
      );

      expect(campaign.totalRuns).toBe(3);
      expect(campaign.totalWins).toBe(2);
      expect(campaign.highestScore).toBe(200);
      expect(campaign.persistentReputation).toBe(9);
    });
  });
});
