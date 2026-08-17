/**
 * Main Street: HUD Tooltip Content Builder Tests
 *
 * Unit tests for the HUD tooltip content builders in MainStreetHudTooltips
 * and integration-style tests verifying tooltip zone attachment in the
 * browser test suite (MainStreetScene.browser.test.ts).
 *
 * Work item: CG-0MP2A0X0K007JRU4
 */
import { describe, it, expect } from 'vitest';

import {
  buildCoinsTooltip,
  buildReputationTooltip,
  buildScoreTooltip,
  findNextLockedTier,
  HUD_TOOLTIP_I18N_KEYS,
  HUD_ARIA_I18N_KEYS,
  HUD_TOOLTIP_STRINGS,
  HUD_ARIA_STRINGS,
  HUD_ARIA_LABELS,
} from '../../example-games/main-street/scenes/MainStreetHudTooltips';
import { t, setLocale, registerLocale, resetI18n } from '../../src/core-engine/I18n';

import {
  setupMainStreetGame,
  type MainStreetCampaignProgress,
} from '../../example-games/main-street/MainStreetState';

import {
  reputationCoinMultiplier,
} from '../../example-games/main-street/MainStreetDifficulty';

import { ORDERED_TIER_DEFINITIONS } from '../../example-games/main-street/MainStreetTiers';
import { computeIncome } from '../../example-games/main-street/MainStreetAdjacency';
import { computeScore } from '../../example-games/main-street/MainStreetEngine';

// ── Unit tests: i18n key consistency ─────────────────────────

describe('HUD tooltip i18n keys', () => {
  it('has a key for every tooltip string', () => {
    const stringKeys = Object.keys(HUD_TOOLTIP_STRINGS);
    const i18nKeys = Object.keys(HUD_TOOLTIP_I18N_KEYS);
    // Each tooltip string should have a corresponding i18n key
    for (const key of stringKeys) {
      expect(i18nKeys).toContain(key);
    }
  });

  it('has a key for every ARIA label', () => {
    const ariaKeys = Object.keys(HUD_ARIA_I18N_KEYS);
    expect(ariaKeys).toContain('coins');
    expect(ariaKeys).toContain('rep');
    expect(ariaKeys).toContain('score');
  });

  it('t() resolves every tooltip i18n key to its English default', () => {
    for (const [key, i18nKey] of Object.entries(HUD_TOOLTIP_I18N_KEYS)) {
      const expected = HUD_TOOLTIP_STRINGS[key as keyof typeof HUD_TOOLTIP_STRINGS];
      expect(t(i18nKey as string)).toBe(expected);
    }
  });

  it('t() resolves every ARIA i18n key to its English default', () => {
    for (const [key, i18nKey] of Object.entries(HUD_ARIA_I18N_KEYS)) {
      const expected = HUD_ARIA_STRINGS[key as keyof typeof HUD_ARIA_STRINGS];
      expect(t(i18nKey as string)).toBe(expected);
    }
  });

  it('HUD_ARIA_LABELS resolves through i18n', () => {
    expect(HUD_ARIA_LABELS.coins).toBe(HUD_ARIA_STRINGS.coins);
    expect(HUD_ARIA_LABELS.rep).toBe(HUD_ARIA_STRINGS.rep);
    expect(HUD_ARIA_LABELS.score).toBe(HUD_ARIA_STRINGS.score);
  });

  it('tooltip builders use i18n — overriding locale changes content', () => {
    const state = setupMainStreetGame({ seed: 'test-i18n-override' });

    // Register a German locale that overrides a few keys
    registerLocale('de', {
      [HUD_TOOLTIP_I18N_KEYS.coinsTitle]: 'Einkommen Diese Runde',
    });
    setLocale('de');

    const tooltip = buildCoinsTooltip(state);
    expect(tooltip).toContain('Einkommen Diese Runde');
    // Non-overridden keys should fall back to English
    expect(tooltip).toContain('Before reputation');

    // Reset to English for other tests
    resetI18n();
    // Re-register en bundle since resetI18n cleared everything
    const enBundle: Record<string, string> = {};
    for (const [k, v] of Object.entries(HUD_TOOLTIP_STRINGS)) {
      enBundle[HUD_TOOLTIP_I18N_KEYS[k as keyof typeof HUD_TOOLTIP_I18N_KEYS]] = v;
    }
    for (const [k, v] of Object.entries(HUD_ARIA_STRINGS)) {
      enBundle[HUD_ARIA_I18N_KEYS[k as keyof typeof HUD_ARIA_I18N_KEYS]] = v;
    }
    registerLocale('en', enBundle);
    setLocale('en');
  });
});

// ── Unit tests: findNextLockedTier ────────────────────────────

describe('findNextLockedTier', () => {
  it('returns tier-2 when only tier-1 is unlocked', () => {
    const result = findNextLockedTier(['tier-1']);
    expect(result).toBeDefined();
    expect(result!.id).toBe('tier-2');
    expect(result!.name).toBe('Rising Street');
    expect(result!.reputationThreshold).toBe(8);
  });

  it('returns tier-3 when tier-1 and tier-2 are unlocked', () => {
    const result = findNextLockedTier(['tier-1', 'tier-2']);
    expect(result).toBeDefined();
    expect(result!.id).toBe('tier-3');
    expect(result!.reputationThreshold).toBe(16);
  });

  it('returns tier-5 when tier-1 through tier-4 are unlocked', () => {
    const result = findNextLockedTier(['tier-1', 'tier-2', 'tier-3', 'tier-4']);
    expect(result).toBeDefined();
    expect(result!.id).toBe('tier-5');
    expect(result!.reputationThreshold).toBe(64);
  });

  it('returns undefined when all tiers are unlocked', () => {
    const allTiers = ORDERED_TIER_DEFINITIONS.map(t => t.id);
    const result = findNextLockedTier(allTiers);
    expect(result).toBeUndefined();
  });

  it('handles empty unlockedTiers gracefully (returns tier-1)', () => {
    const result = findNextLockedTier([]);
    expect(result).toBeDefined();
    expect(result!.id).toBe('tier-1');
  });
});

// ── Unit tests: buildCoinsTooltip ───────────────────────────

describe('buildCoinsTooltip', () => {
  it('shows base income and multiplied income for the default state', () => {
    const state = setupMainStreetGame({ seed: 'test-coins' });
    const tooltip = buildCoinsTooltip(state);

    // Should contain title
    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.coinsTitle);
    // Should contain pre-multiplier label
    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.coinsPreMultiplierLabel);
    // Should contain post-multiplier label
    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.coinsPostMultiplierLabel);
    // Should contain the calculation note
    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.coinsCalcNote);
  });

  it('shows base income of 0 for a fresh game with no businesses placed', () => {
    const state = setupMainStreetGame({ seed: 'test-zero' });
    // Fresh game: no businesses on the street, so base income is 0
    const incomeResult = computeIncome(state.streetGrid, state.config.synergyBonusPerNeighbor);
    expect(incomeResult.total).toBe(0);

    const tooltip = buildCoinsTooltip(state);
    // Pre-multiplier income should be 0
    expect(tooltip).toContain(`${HUD_TOOLTIP_STRINGS.coinsPreMultiplierLabel}: 0`);
    // Post-multiplier should also be 0 (0 * any multiplier = 0)
    expect(tooltip).toContain(`${HUD_TOOLTIP_STRINGS.coinsPostMultiplierLabel}: 0`);
  });

  it('includes the multiplier value in the post-multiplier line', () => {
    const state = setupMainStreetGame({ seed: 'test-mult' });
    const tooltip = buildCoinsTooltip(state);
    // Should contain "×1." pattern (multiplier is at least 1.0)
    expect(tooltip).toMatch(/×\d+\.\d/);
  });

  it('reflects multiplier changes with different reputation values', () => {
    const state = setupMainStreetGame({ seed: 'test-rep' });
    state.resourceBank.reputation = 20; // should give 2.0x multiplier

    const mult = reputationCoinMultiplier(20, state.config);
    expect(mult).toBeCloseTo(2.0);

    const tooltip = buildCoinsTooltip(state);
    expect(tooltip).toContain('×2.0');
  });

  it('excludes sold cards from income display', () => {
    const state = setupMainStreetGame({ seed: 'test-sold-income' });

    // Place a business card on the grid
    const card = state.market.cards.find(
      c => c.cost <= state.resourceBank.coins && c.family === 'business',
    );
    if (!card || card.family !== 'business') return;
    const marketIdx = state.market.cards.findIndex(c => c.id === card.id);
    state.resourceBank.coins -= card.cost;
    state.market.cards.splice(marketIdx, 1);
    state.streetGrid[0] = { ...card };
    state.streetGrid[0]!.currentIncome = card.baseIncome;

    // Compute income before selling — should be > 0
    const incomeBefore = computeIncome(
      state.streetGrid,
      state.config.synergyBonusPerNeighbor,
      undefined,
      state.soldSlots,
    );
    expect(incomeBefore.total).toBeGreaterThan(0);

    // Mark the slot as sold
    state.soldSlots[0] = true;

    // Compute income after selling — should be 0
    const incomeAfter = computeIncome(
      state.streetGrid,
      state.config.synergyBonusPerNeighbor,
      undefined,
      state.soldSlots,
    );
    expect(incomeAfter.total).toBe(0);

    // Tooltip should show 0 income after selling
    const tooltip = buildCoinsTooltip(state);
    expect(tooltip).toContain(`${HUD_TOOLTIP_STRINGS.coinsPreMultiplierLabel}: 0`);
    expect(tooltip).toContain(`${HUD_TOOLTIP_STRINGS.coinsPostMultiplierLabel}: 0`);
  });
});

// ── Unit tests: buildReputationTooltip ───────────────────────

describe('buildReputationTooltip', () => {
  it('shows current reputation and multiplier for default state', () => {
    const state = setupMainStreetGame({ seed: 'test-rep-tooltip' });
    const tooltip = buildReputationTooltip(state);

    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.repTitle);
    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.repMultiplierLabel);
    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.repEffectLabel);

    // Should contain the current reputation value
    const rep = state.resourceBank.reputation;
    expect(tooltip).toContain(`${HUD_TOOLTIP_STRINGS.repValueLabel}: ${rep}`);
  });

  it('shows 1.0 multiplier when reputation is 0', () => {
    const state = setupMainStreetGame({ seed: 'test-rep-zero' });
    state.resourceBank.reputation = 0;

    const tooltip = buildReputationTooltip(state);
    expect(tooltip).toContain('×1.0');
  });

  it('shows capped multiplier for high reputation', () => {
    const state = setupMainStreetGame({ seed: 'test-rep-high' });
    state.resourceBank.reputation = 100; // capped at maxReputationCoinMultiplier

    const tooltip = buildReputationTooltip(state);
    // With default config, max multiplier is 3.0
    expect(tooltip).toContain('×3.0');
  });
});

// ── Unit tests: buildScoreTooltip ───────────────────────────

describe('buildScoreTooltip', () => {
  it('shows current score and next tier for a new campaign', () => {
    const state = setupMainStreetGame({ seed: 'test-score' });
    const campaign: MainStreetCampaignProgress = {
      schemaVersion: 1,
      unlockedTiers: ['tier-1'],
      unlockedCardIds: [],
      milestoneHistory: [],
      persistentReputation: 0,
      highestScore: 0,
      totalRuns: 0,
      totalWins: 0,
      lastUpdatedAt: new Date().toISOString(),
    };

    const tooltip = buildScoreTooltip(state, campaign);

    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.scoreTitle);
    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.scoreEstimateLabel);
    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.scoreNextTierLabel);

    // Should mention tier-2 (next locked after tier-1)
    expect(tooltip).toContain('Rising Street');
    expect(tooltip).toContain('Rep ≥ 8');
  });

  it('shows "All tiers unlocked" when all tiers are unlocked', () => {
    const state = setupMainStreetGame({ seed: 'test-score-all' });
    const allTiers = ORDERED_TIER_DEFINITIONS.map(t => t.id);
    const campaign: MainStreetCampaignProgress = {
      schemaVersion: 1,
      unlockedTiers: allTiers,
      unlockedCardIds: [],
      milestoneHistory: [],
      persistentReputation: 0,
      highestScore: 0,
      totalRuns: 0,
      totalWins: 0,
      lastUpdatedAt: new Date().toISOString(),
    };

    const tooltip = buildScoreTooltip(state, campaign);
    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.scoreAllTiersUnlocked);
  });

  it('handles null campaign gracefully (defaults to tier-1 only)', () => {
    const state = setupMainStreetGame({ seed: 'test-score-null' });
    const tooltip = buildScoreTooltip(state, null);

    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.scoreTitle);
    // With null campaign, should default to tier-1 unlocked, next tier is tier-2
    expect(tooltip).toContain('Rising Street');
  });

  it('includes numeric score estimate (rounded)', () => {
    const state = setupMainStreetGame({ seed: 'test-score-num' });
    state.resourceBank.coins = 50;
    state.resourceBank.reputation = 10;

    const expectedScore = computeScore(state);
    const tooltip = buildScoreTooltip(state, null);

    // Score estimate should be rounded to nearest whole number
    expect(tooltip).toContain(`${HUD_TOOLTIP_STRINGS.scoreEstimateLabel}: ${Math.round(expectedScore)}`);
  });

  it('includes the win threshold as the target score', () => {
    const state = setupMainStreetGame({ seed: 'test-score-target' });
    const expectedThreshold = state.config.winThreshold;

    const tooltip = buildScoreTooltip(state, null);

    // Should contain the win threshold (shown in x/y format)
    expect(tooltip).toContain(`/${expectedThreshold}`);
    // Should contain a line about remaining score needed to win
    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.scoreRemainingToWin);
  });

  it('includes score breakdown with coins, reputation, and challenge contributions', () => {
    const state = setupMainStreetGame({ seed: 'test-score-breakdown' });
    // Set values to get a meaningful breakdown
    state.resourceBank.coins = 30;
    state.resourceBank.reputation = 8;
    state.challengesCompleted = ['ch-1'];

    const repContribution = state.resourceBank.reputation * state.config.reputationScoreMultiplier;
    const challengeContribution = state.challengesCompleted.length * state.config.challengeBonusPoints;

    const tooltip = buildScoreTooltip(state, null);

    // Should contain breakdown labels
    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.scoreBreakdownCoins);
    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.scoreBreakdownReputation);
    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.scoreBreakdownChallenges);

    // Should contain contribution values (coins value 30 is already a whole number)
    expect(tooltip).toContain(`${30}`);
    expect(tooltip).toContain(`${HUD_TOOLTIP_STRINGS.scoreBreakdownCoins}: 30`);
    expect(tooltip).toContain(`${repContribution}`);
    expect(tooltip).toContain(`${challengeContribution}`);
  });

  it('shows remaining score needed to reach win threshold when score is below target (rounded)', () => {
    const state = setupMainStreetGame({ seed: 'test-score-remaining' });
    // Starting game: score should be well below threshold
    const score = computeScore(state);
    const remaining = state.config.winThreshold - score;

    const tooltip = buildScoreTooltip(state, null);

    if (remaining > 0) {
      // Remaining score should be rounded to nearest whole number
      expect(tooltip).toContain(`${Math.round(remaining)} ${HUD_TOOLTIP_STRINGS.scoreRemainingToWin}`);
    }
  });

  it('shows that win threshold is met when score is at or above target', () => {
    const state = setupMainStreetGame({ seed: 'test-score-won' });
    // Give enough resources to meet or exceed the win threshold
    const threshold = state.config.winThreshold;
    state.resourceBank.coins = threshold;
    state.resourceBank.reputation = 0;

    const score = computeScore(state);
    expect(score).toBeGreaterThanOrEqual(threshold);

    const tooltip = buildScoreTooltip(state, null);

    expect(tooltip).toContain(HUD_TOOLTIP_STRINGS.scoreThresholdMet);
  });

  it('rounds score values to nearest whole number in tooltip', () => {
    const state = setupMainStreetGame({ seed: 'test-rounding' });
    // Set fractional values that produce a non-integer score
    state.resourceBank.coins = 123.456;
    state.resourceBank.reputation = 15;

    const score = computeScore(state);
    const tooltip = buildScoreTooltip(state, null);

    // The estimate line should show the rounded score
    expect(tooltip).toContain(`${HUD_TOOLTIP_STRINGS.scoreEstimateLabel}: ${Math.round(score)}`);
    // Score should not contain fractional part in the estimate line
    const estimateLine = tooltip.split('\n').find(l => l.startsWith(HUD_TOOLTIP_STRINGS.scoreEstimateLabel));
    expect(estimateLine).toBeDefined();
    const match = estimateLine!.match(/: (\d+)\/\d+/);
    expect(match).not.toBeNull();
    const displayedScore = parseInt(match![1], 10);
    expect(displayedScore).toBe(Math.round(score));
    // Breakdown coins should be rounded to nearest whole number; other breakdown values stay raw
    expect(tooltip).toContain(`${HUD_TOOLTIP_STRINGS.scoreBreakdownCoins}: 123`);
    expect(tooltip).not.toContain(`${HUD_TOOLTIP_STRINGS.scoreBreakdownCoins}: 123.456`);
  });

  it('score estimate label includes win threshold as x of y format (rounded)', () => {
    const state = setupMainStreetGame({ seed: 'test-score-xy' });
    const score = computeScore(state);
    const threshold = state.config.winThreshold;

    const tooltip = buildScoreTooltip(state, null);

    // The score estimate should show rounded "score / threshold"
    expect(tooltip).toContain(`${Math.round(score)}/${threshold}`);
  });
});

// ── Integration-style tests: tooltip zone attachment ─────────
//
// These tests verify that MainStreetRenderer.attachHudTooltipZone is called
// correctly through the text-based tooltip content. Since MainStreetRenderer
// imports Phaser (which is not available in node-only tests), the integration
// tests live in the browser test file where a full Phaser game can be booted.
//
// See: tests/main-street/MainStreetScene.browser.test.ts