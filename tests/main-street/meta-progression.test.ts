/**
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
  highestUnlockedTier,
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
  createEventDeck,
  createUpgradeDeck,
  CARD_TEMPLATE_NAMES,
} from '../../example-games/main-street/MainStreetCards';
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
    it('defines exactly 5 tiers', () => {
      expect(Object.keys(TIER_DEFINITIONS)).toHaveLength(5);
    });

    it('has tiers named tier-1 through tier-5', () => {
      for (let i = 1; i <= 5; i++) {
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

    it('Tier 1 has 13 cards (5 biz + 5 evt + 3 upg)', () => {
      expect(TIER_DEFINITIONS['tier-1'].newCardIds).toHaveLength(13);
      expect(TIER_DEFINITIONS['tier-1'].cumulativeCardIds).toHaveLength(13);
    });

    it('each subsequent tier adds exactly 3 new cards', () => {
      for (let i = 2; i <= 5; i++) {
        expect(TIER_DEFINITIONS[`tier-${i}`].newCardIds).toHaveLength(3);
      }
    });

    it('Tier 5 cumulative pool has 25 cards (13 + 3*4)', () => {
      expect(TIER_DEFINITIONS['tier-5'].cumulativeCardIds).toHaveLength(25);
    });

    it('cumulative card IDs are actually cumulative', () => {
      const tier1 = new Set(TIER_DEFINITIONS['tier-1'].cumulativeCardIds);
      const tier2 = new Set(TIER_DEFINITIONS['tier-2'].cumulativeCardIds);
      const tier3 = new Set(TIER_DEFINITIONS['tier-3'].cumulativeCardIds);
      const tier4 = new Set(TIER_DEFINITIONS['tier-4'].cumulativeCardIds);
      const tier5 = new Set(TIER_DEFINITIONS['tier-5'].cumulativeCardIds);

      // Each tier's cumulative set is a superset of the previous
      for (const id of tier1) expect(tier2.has(id)).toBe(true);
      for (const id of tier2) expect(tier3.has(id)).toBe(true);
      for (const id of tier3) expect(tier4.has(id)).toBe(true);
      for (const id of tier4) expect(tier5.has(id)).toBe(true);
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

    it('specific reputation thresholds match PRD (0, 6, 8, 10, 12)', () => {
      expect(TIER_DEFINITIONS['tier-1'].reputationThreshold).toBe(0);
      expect(TIER_DEFINITIONS['tier-2'].reputationThreshold).toBe(6);
      expect(TIER_DEFINITIONS['tier-3'].reputationThreshold).toBe(8);
      expect(TIER_DEFINITIONS['tier-4'].reputationThreshold).toBe(10);
      expect(TIER_DEFINITIONS['tier-5'].reputationThreshold).toBe(12);
    });

    it('all card IDs in tier definitions reference valid template IDs', () => {
      // Build the set of template IDs from unfiltered deck builders (1 copy each)
      const allBizIds = createBusinessDeck(1).map((c) => c.id.replace(/-\d+$/, ''));
      const allEvtIds = createEventDeck(1).map((c) => c.id.replace(/-\d+$/, ''));
      const allUpgIds = createUpgradeDeck(1).map((c) => c.id.replace(/-\d+$/, ''));
      const allTemplateIds = new Set([...allBizIds, ...allEvtIds, ...allUpgIds]);

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
    it('unlocks Tier 2 when reputation >= 6', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({ reputation: 6 });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-2');
    });

    it('does NOT unlock Tier 2 when reputation < 6 and no challenges', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({ reputation: 5 });

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

    it('unlocks Tier 4 when reputation >= 10', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({ reputation: 10 });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-4');
    });

    it('unlocks Tier 5 when reputation >= 12', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({ reputation: 12 });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-5');
    });

    it('unlocks multiple tiers in a single high-reputation run', async () => {
      const campaign = freshCampaign();
      // A run with reputation 12 should unlock tiers 2, 3, 4, and 5 in one go
      const state = createCompletedRunState({ reputation: 12 });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-2');
      expect(campaign.unlockedTiers).toContain('tier-3');
      expect(campaign.unlockedTiers).toContain('tier-4');
      expect(campaign.unlockedTiers).toContain('tier-5');
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
    it('unlocks Tier 2 with 2 completed challenges (any category)', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0, // Low rep, challenge path only
        challengesCompleted: ['ch-foodie-row', 'ch-deep-pockets'],
      });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).toContain('tier-2');
    });

    it('does NOT unlock Tier 2 with only 1 challenge', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-foodie-row'],
      });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.unlockedTiers).not.toContain('tier-2');
    });

    it('unlocks Tier 3 with 1 synergy + 1 resource challenge', async () => {
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

    it('does NOT unlock Tier 3 with only synergy challenges (no resource)', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-foodie-row', 'ch-culture-district'],
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
      ];

      await updateCampaignAfterRun(campaign, state);

      // May unlock tier-2 (2 challenges) but NOT tier-3 (needs resource)
      expect(campaign.unlockedTiers).toContain('tier-2');
      expect(campaign.unlockedTiers).not.toContain('tier-3');
    });

    it('unlocks Tier 4 with 3 challenges including cross-cutting', async () => {
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

      expect(campaign.unlockedTiers).toContain('tier-4');
    });

    it('unlocks Tier 4 with 3 challenges including placement', async () => {
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

      expect(campaign.unlockedTiers).toContain('tier-4');
    });

    it('does NOT unlock Tier 4 with 3 challenges but none cross-cutting/placement', async () => {
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

      expect(campaign.unlockedTiers).not.toContain('tier-4');
    });

    it('unlocks Tier 5 via the Diversified challenge', async () => {
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

      expect(campaign.unlockedTiers).toContain('tier-5');
    });

    it('does NOT unlock Tier 5 via a non-Diversified challenge', async () => {
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

      expect(campaign.unlockedTiers).not.toContain('tier-5');
    });

    it('reputation and challenge paths are OR: either unlocks the tier', async () => {
      // Reputation path for tier 2
      const campaignA = freshCampaign();
      const stateA = createCompletedRunState({ reputation: 6 });
      await updateCampaignAfterRun(campaignA, stateA);
      expect(campaignA.unlockedTiers).toContain('tier-2');

      // Challenge path for tier 2
      const campaignB = freshCampaign();
      const stateB = createCompletedRunState({
        reputation: 0,
        challengesCompleted: ['ch-foodie-row', 'ch-deep-pockets'],
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

      // First run: unlock tier-2 and tier-3
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
      const run1 = createCompletedRunState({ reputation: 6 });
      await updateCampaignAfterRun(campaign, run1);
      const run2 = createCompletedRunState({ reputation: 7 });
      await updateCampaignAfterRun(campaign, run2);

      const tier2Count = campaign.unlockedTiers.filter((t) => t === 'tier-2').length;
      expect(tier2Count).toBe(1);
    });

    it('tiers accumulate across multiple runs', async () => {
      const campaign = freshCampaign();

      // Run 1: unlock tier-2 only
      const run1 = createCompletedRunState({ reputation: 6 });
      await updateCampaignAfterRun(campaign, run1);
      expect(campaign.unlockedTiers).toEqual(['tier-1', 'tier-2']);

      // Run 2: unlock tier-3 (tier-2 was already unlocked)
      const run2 = createCompletedRunState({ reputation: 8 });
      await updateCampaignAfterRun(campaign, run2);
      expect(campaign.unlockedTiers).toEqual(['tier-1', 'tier-2', 'tier-3']);

      // Run 3: unlock tier-5 (skipping tier-4? No—rep 12 meets tier-4 threshold too)
      const run3 = createCompletedRunState({ reputation: 12 });
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
      const deck = createEventDeck(1, tier1CardIds);
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

      // All market business cards should also be from tier-1
      for (const card of state.market.business) {
        const baseId = card.id.replace(/-\d+$/, '');
        expect(tier1BizIds).toContain(baseId);
      }

      // Remaining deck biz cards should all be from tier-1
      for (const baseId of bizBaseIds) {
        expect(tier1BizIds).toContain(baseId);
      }
    });

    it('Tier 5 pool yields all 25 unique template IDs across all deck builders', () => {
      const tier5CardIds = TIER_DEFINITIONS['tier-5'].cumulativeCardIds;

      const bizDeck = createBusinessDeck(1, tier5CardIds);
      const evtDeck = createEventDeck(1, tier5CardIds);
      const upgDeck = createUpgradeDeck(1, tier5CardIds);

      const allBaseIds = new Set([
        ...bizDeck.map((c) => c.id.replace(/-\d+$/, '')),
        ...evtDeck.map((c) => c.id.replace(/-\d+$/, '')),
        ...upgDeck.map((c) => c.id.replace(/-\d+$/, '')),
      ]);

      expect(allBaseIds.size).toBe(25);
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

    it('default campaign has tier-1 unlocked with 13 card IDs', () => {
      const campaign = createDefaultCampaignProgress();
      expect(campaign.unlockedTiers).toEqual(['tier-1']);
      expect(campaign.unlockedCardIds).toHaveLength(13);
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
        persistentReputation: 6,
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
      expect(migrated.persistentReputation).toBe(6);
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
        reputationAtUnlock: 6,
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
      const state = createCompletedRunState({ reputation: 8 });

      await updateCampaignAfterRun(campaign, state, store);

      const loaded = await loadCampaignProgress(store);
      expect(loaded).not.toBeNull();
      expect(loaded!.unlockedTiers).toContain('tier-2');
      expect(loaded!.unlockedTiers).toContain('tier-3');
      expect(loaded!.totalRuns).toBe(1);
    });

    it('updateCampaignAfterRun works without store (no persistence)', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({ reputation: 6 });

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
      const fullDeck = createEventDeck(1);
      const tier1Deck = createEventDeck(1, TIER_DEFINITIONS['tier-1'].cumulativeCardIds);
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
        reputation: 6,
        finalScore: 120,
        seed: 'ms-rep-test',
      });

      await updateCampaignAfterRun(campaign, state);

      expect(campaign.milestoneHistory).toHaveLength(1);
      const record = campaign.milestoneHistory[0];
      expect(record.tierId).toBe('tier-2');
      expect(record.triggerType).toBe('reputation');
      expect(record.reputationAtUnlock).toBe(6);
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
        challengesCompleted: ['ch-foodie-row', 'ch-deep-pockets'],
        finalScore: 80,
        seed: 'ms-ch-test',
      });

      await updateCampaignAfterRun(campaign, state);

      const tier2Records = campaign.milestoneHistory.filter(
        (r) => r.tierId === 'tier-2',
      );
      expect(tier2Records).toHaveLength(1);
      expect(tier2Records[0].triggerType).toBe('challenge');
      expect(tier2Records[0].reputationAtUnlock).toBeNull();
      expect(tier2Records[0].challengeIdsAtUnlock).toEqual([
        'ch-foodie-row',
        'ch-deep-pockets',
      ]);
    });

    it('multiple tier unlocks in one run each produce a MilestoneRecord', async () => {
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 12,
        finalScore: 500,
      });

      await updateCampaignAfterRun(campaign, state);

      // Should have 4 records (tier-2, tier-3, tier-4, tier-5)
      expect(campaign.milestoneHistory).toHaveLength(4);
      const tierIds = campaign.milestoneHistory.map((r) => r.tierId);
      expect(tierIds).toContain('tier-2');
      expect(tierIds).toContain('tier-3');
      expect(tierIds).toContain('tier-4');
      expect(tierIds).toContain('tier-5');
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

      // Run 1: unlock tier-2
      const run1 = createCompletedRunState({ reputation: 6, seed: 'run1' });
      await updateCampaignAfterRun(campaign, run1);
      expect(campaign.milestoneHistory).toHaveLength(1);

      // Run 2: unlock tier-3
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
      const state = createCompletedRunState({ reputation: 6 });

      await updateCampaignAfterRun(campaign, state);

      const record = campaign.milestoneHistory[0];
      expect(record.triggerType).toBe('reputation');
      expect(record.reputationAtUnlock).toBe(6);
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

      // Find the tier-5 record (Diversified unlocks tier-5)
      const tier5Record = campaign.milestoneHistory.find((r) => r.tierId === 'tier-5');
      expect(tier5Record).toBeDefined();
      expect(tier5Record!.triggerType).toBe('challenge');
      expect(tier5Record!.reputationAtUnlock).toBeNull();
      expect(tier5Record!.challengeIdsAtUnlock).toEqual(['ch-diversified']);
    });

    it('milestone history survives save/load round-trip', async () => {
      const store = new SaveLoadStore();
      const campaign = freshCampaign();
      const state = createCompletedRunState({
        reputation: 10,
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
      expect(ids).toHaveLength(13);
      expect(new Set(ids).size).toBe(13); // no duplicates
    });

    it('returns cumulative cards for ["tier-1", "tier-2"]', () => {
      const ids = deriveUnlockedCardIds(['tier-1', 'tier-2']);
      expect(ids).toHaveLength(16); // 13 + 3
    });

    it('returns all 25 cards for all 5 tiers', () => {
      const ids = deriveUnlockedCardIds(['tier-1', 'tier-2', 'tier-3', 'tier-4', 'tier-5']);
      expect(ids).toHaveLength(25);
    });

    it('handles empty array', () => {
      const ids = deriveUnlockedCardIds([]);
      expect(ids).toHaveLength(0);
    });

    it('ignores unknown tier IDs gracefully', () => {
      const ids = deriveUnlockedCardIds(['tier-1', 'tier-99']);
      expect(ids).toHaveLength(13); // only tier-1 cards
    });

    it('does not produce duplicates even if tiers are listed twice', () => {
      const ids = deriveUnlockedCardIds(['tier-1', 'tier-1', 'tier-2']);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it('matches cumulativeCardIds from TIER_DEFINITIONS', () => {
      for (let i = 1; i <= 5; i++) {
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
        reputation: 8,
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
      for (const card of nextRun.market.business) {
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

// ── Meta-Progression UI Logic Tests ─────────────────────────

describe('Meta-Progression UI Logic', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── CARD_TEMPLATE_NAMES lookup ──────────────────────────

  describe('CARD_TEMPLATE_NAMES', () => {
    it('contains entries for every card ID in all tier definitions', () => {
      for (const tierDef of ORDERED_TIER_DEFINITIONS) {
        for (const cardId of tierDef.newCardIds) {
          expect(
            CARD_TEMPLATE_NAMES.has(cardId),
            `Missing template name for card ID "${cardId}" in tier "${tierDef.id}"`,
          ).toBe(true);
        }
      }
    });

    it('returns non-empty names for all entries', () => {
      for (const [id, name] of CARD_TEMPLATE_NAMES) {
        expect(name.length, `Empty name for card ID "${id}"`).toBeGreaterThan(0);
      }
    });

    it('maps known IDs to correct display names', () => {
      // Spot-check a few known mappings
      expect(CARD_TEMPLATE_NAMES.get('biz-bakery')).toBe('Bakery');
      expect(CARD_TEMPLATE_NAMES.get('biz-cafe')).toBe('Cafe');
      expect(CARD_TEMPLATE_NAMES.get('evt-grand-opening')).toBe('Grand Opening Sale');
    });
  });

  // ── highestUnlockedTier ─────────────────────────────────

  describe('highestUnlockedTier', () => {
    it('returns tier-1 when only tier-1 is unlocked', () => {
      const result = highestUnlockedTier(['tier-1']);
      expect(result).toBeDefined();
      expect(result!.id).toBe('tier-1');
      expect(result!.order).toBe(1);
    });

    it('returns the highest tier when multiple are unlocked', () => {
      const result = highestUnlockedTier(['tier-1', 'tier-2', 'tier-3']);
      expect(result).toBeDefined();
      expect(result!.id).toBe('tier-3');
      expect(result!.order).toBe(3);
    });

    it('returns tier-5 when all tiers are unlocked (regardless of order)', () => {
      const result = highestUnlockedTier(['tier-3', 'tier-5', 'tier-1', 'tier-4', 'tier-2']);
      expect(result).toBeDefined();
      expect(result!.id).toBe('tier-5');
      expect(result!.name).toBe('Landmark');
    });

    it('returns undefined for empty array', () => {
      expect(highestUnlockedTier([])).toBeUndefined();
    });

    it('returns undefined for invalid tier IDs', () => {
      expect(highestUnlockedTier(['tier-999', 'not-a-tier'])).toBeUndefined();
    });
  });

  // ── Tier diff (newly unlocked tiers) ────────────────────

  describe('Tier diff computation', () => {
    it('computes newly unlocked tiers correctly for single unlock', async () => {
      const campaign = freshCampaign();
      const tiersBefore = [...campaign.unlockedTiers];

      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ reputation: 7 }), // meets tier-2 threshold (6)
      );

      const newlyUnlocked = campaign.unlockedTiers.filter(
        (t) => !tiersBefore.includes(t),
      );

      expect(newlyUnlocked).toEqual(['tier-2']);
    });

    it('computes newly unlocked tiers correctly for multiple unlocks', async () => {
      const campaign = freshCampaign();
      const tiersBefore = [...campaign.unlockedTiers];

      // Reputation 10 meets tier-2 (6), tier-3 (8), and tier-4 (10)
      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ reputation: 10 }),
      );

      const newlyUnlocked = campaign.unlockedTiers.filter(
        (t) => !tiersBefore.includes(t),
      );

      expect(newlyUnlocked).toContain('tier-2');
      expect(newlyUnlocked).toContain('tier-3');
      expect(newlyUnlocked).toContain('tier-4');
      expect(newlyUnlocked).not.toContain('tier-1'); // was already unlocked
    });

    it('returns empty diff when no new tiers are unlocked', async () => {
      const campaign = freshCampaign();
      const tiersBefore = [...campaign.unlockedTiers];

      // Low reputation, no challenges — no new tiers
      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ reputation: 3 }),
      );

      const newlyUnlocked = campaign.unlockedTiers.filter(
        (t) => !tiersBefore.includes(t),
      );

      expect(newlyUnlocked).toEqual([]);
    });

    it('returns empty diff when tiers are already unlocked', async () => {
      const campaign = freshCampaign();
      // Unlock tier-2 first
      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ reputation: 7 }),
      );

      const tiersBefore = [...campaign.unlockedTiers];

      // Same reputation again — no new tiers
      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ reputation: 7 }),
      );

      const newlyUnlocked = campaign.unlockedTiers.filter(
        (t) => !tiersBefore.includes(t),
      );

      expect(newlyUnlocked).toEqual([]);
    });
  });

  // ── Campaign stats for overlay ──────────────────────────

  describe('Campaign stats for overlay', () => {
    it('tracks total runs and wins correctly', async () => {
      const campaign = freshCampaign();

      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ gameResult: 'win', finalScore: 100 }),
      );
      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ gameResult: 'loss', finalScore: 50 }),
      );
      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ gameResult: 'win', finalScore: 150 }),
      );

      expect(campaign.totalRuns).toBe(3);
      expect(campaign.totalWins).toBe(2);
    });

    it('computes win rate correctly', async () => {
      const campaign = freshCampaign();

      for (let i = 0; i < 4; i++) {
        await updateCampaignAfterRun(
          campaign,
          createCompletedRunState({ gameResult: i < 3 ? 'win' : 'loss', finalScore: 100 }),
        );
      }

      const winRate = campaign.totalRuns > 0
        ? Math.round((campaign.totalWins / campaign.totalRuns) * 100)
        : 0;

      expect(winRate).toBe(75);
    });

    it('tracks highest score correctly across runs', async () => {
      const campaign = freshCampaign();

      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ finalScore: 80 }),
      );
      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ finalScore: 200 }),
      );
      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ finalScore: 120 }),
      );

      expect(campaign.highestScore).toBe(200);
    });

    it('tracks persistent reputation (best rep across all runs)', async () => {
      const campaign = freshCampaign();

      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ reputation: 5 }),
      );
      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ reputation: 9 }),
      );
      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ reputation: 4 }),
      );

      expect(campaign.persistentReputation).toBe(9);
    });

    it('win rate is 0% for a fresh campaign with no runs', () => {
      const campaign = freshCampaign();
      const winRate = campaign.totalRuns > 0
        ? Math.round((campaign.totalWins / campaign.totalRuns) * 100)
        : 0;
      expect(winRate).toBe(0);
    });
  });

  // ── Integration: tier unlock → overlay data ─────────────

  describe('Integration: tier unlock produces correct overlay data', () => {
    it('newly unlocked tier-2 includes correct card names', async () => {
      const campaign = freshCampaign();
      const tiersBefore = [...campaign.unlockedTiers];

      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ reputation: 7 }),
      );

      const newlyUnlocked = campaign.unlockedTiers.filter(
        (t) => !tiersBefore.includes(t),
      );
      expect(newlyUnlocked).toEqual(['tier-2']);

      // Verify we can look up card names for the newly unlocked tier
      const tier2Def = TIER_DEFINITIONS['tier-2'];
      const cardNames = tier2Def.newCardIds.map(
        (id) => CARD_TEMPLATE_NAMES.get(id) ?? id,
      );
      expect(cardNames.length).toBe(3);
      // All names should be resolved (not fallback to IDs)
      for (const name of cardNames) {
        expect(name).not.toMatch(/^biz-|^evt-|^upg-/);
      }
    });

    it('highest unlocked tier reflects the campaign state after update', async () => {
      const campaign = freshCampaign();

      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ reputation: 9 }), // tier-2 + tier-3
      );

      const highest = highestUnlockedTier(campaign.unlockedTiers);
      expect(highest).toBeDefined();
      expect(highest!.id).toBe('tier-3');
      expect(highest!.name).toBe('Neighborhood');
    });

    it('milestone history records trigger type for UI display', async () => {
      const campaign = freshCampaign();

      // Unlock via reputation
      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({ reputation: 7 }),
      );

      const tier2Milestone = campaign.milestoneHistory.find(
        (m) => m.tierId === 'tier-2',
      );
      expect(tier2Milestone).toBeDefined();
      expect(tier2Milestone!.triggerType).toBe('reputation');

      // Unlock via challenges (tier-2 already unlocked, try tier-3 via challenges)
      await updateCampaignAfterRun(
        campaign,
        createCompletedRunState({
          reputation: 0,
          challengesCompleted: ['ch-synergy-pair', 'ch-full-coffers'],
          activeChallenges: [
            {
              challenge: {
                id: 'ch-synergy-pair',
                title: 'Synergy Pair',
                description: 'Test',
                category: 'synergy' as const,
                evaluator: () => true,
                rewardPoints: 10,
              },
              completed: true,
            },
            {
              challenge: {
                id: 'ch-full-coffers',
                title: 'Full Coffers',
                description: 'Test',
                category: 'resource' as const,
                evaluator: () => true,
                rewardPoints: 10,
              },
              completed: true,
            },
          ],
        }),
      );

      const tier3Milestone = campaign.milestoneHistory.find(
        (m) => m.tierId === 'tier-3',
      );
      expect(tier3Milestone).toBeDefined();
      expect(tier3Milestone!.triggerType).toBe('challenge');
    });
  });
});
