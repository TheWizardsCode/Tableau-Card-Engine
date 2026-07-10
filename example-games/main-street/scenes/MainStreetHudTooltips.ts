/**
 * MainStreetHudTooltips -- Tooltip content builders for the HUD status bar.
 *
 * Provides localisable string keys and builder functions for the Coins,
 * Reputation, and Score tooltips shown when hovering/tapping HUD values.
 *
 * ## i18n integration
 * Every user-facing string is looked up via the core-engine `t()` function
 * which resolves the active locale bundle and falls back to English defaults.
 * The English defaults are registered at module load time so they are always
 * available, even without an explicit locale setup.
 *
 * ## ARIA labels
 * Each interactive zone carries a static `aria-label` for screen readers.
 * These are also localisable through the same i18n system.
 *
 * @module
 */

import { computeIncome, type IncomeResult } from '../MainStreetAdjacency';
import { reputationCoinMultiplier, applyReputationMultiplier } from '../MainStreetDifficulty';
import { ORDERED_TIER_DEFINITIONS } from '../MainStreetTiers';
import { computeScore } from '../MainStreetEngine';
import type { MainStreetState, MainStreetCampaignProgress } from '../MainStreetState';
import { t, registerLocale } from '../../../src/core-engine/I18n';

// ── i18n Keys ───────────────────────────────────────────────

/** The set of i18n keys used by HUD tooltips.  A future localisation layer can
 *  swap implementations for these keys. */
export const HUD_TOOLTIP_I18N_KEYS = {
  coinsTitle: 'hud.tooltip.coins.title',
  coinsIncomeLabel: 'hud.tooltip.coins.income',
  coinsPreMultiplierLabel: 'hud.tooltip.coins.preMultiplier',
  coinsPostMultiplierLabel: 'hud.tooltip.coins.postMultiplier',
  coinsCalcNote: 'hud.tooltip.coins.calcNote',
  repTitle: 'hud.tooltip.rep.title',
  repValueLabel: 'hud.tooltip.rep.value',
  repMultiplierLabel: 'hud.tooltip.rep.multiplier',
  repEffectLabel: 'hud.tooltip.rep.effect',
  scoreTitle: 'hud.tooltip.score.title',
  scoreEstimateLabel: 'hud.tooltip.score.estimate',
  scoreBreakdownCoins: 'hud.tooltip.score.breakdownCoins',
  scoreBreakdownReputation: 'hud.tooltip.score.breakdownReputation',
  scoreBreakdownChallenges: 'hud.tooltip.score.breakdownChallenges',
  scoreRemainingToWin: 'hud.tooltip.score.remainingToWin',
  scoreThresholdMet: 'hud.tooltip.score.thresholdMet',
  scoreNextTierLabel: 'hud.tooltip.score.nextTier',
  scoreAllTiersUnlocked: 'hud.tooltip.score.allTiersUnlocked',
} as const;

/** ARIA label i18n keys (for screen-reader accessibility). */
export const HUD_ARIA_I18N_KEYS = {
  coins: 'hud.aria.coins',
  rep: 'hud.aria.rep',
  score: 'hud.aria.score',
} as const;

// ── ARIA label lookup via i18n ──────────────────────────────

/** ARIA labels for HUD interactive zones — resolved through the i18n system. */
export const HUD_ARIA_LABELS = {
  get coins() { return t(HUD_ARIA_I18N_KEYS.coins); },
  get rep() { return t(HUD_ARIA_I18N_KEYS.rep); },
  get score() { return t(HUD_ARIA_I18N_KEYS.score); },
};

// ── Default English strings (registered as the 'en' locale bundle) ────

/** Default English string templates. Registered as the `en` locale bundle. */
export const HUD_TOOLTIP_STRINGS = {
  coinsTitle: 'Income This Turn',
  coinsIncomeLabel: 'Base income',
  coinsPreMultiplierLabel: 'Before reputation',
  coinsPostMultiplierLabel: 'After reputation',
  coinsCalcNote: 'Sum of business incomes + synergy bonuses',
  repTitle: 'Reputation',
  repValueLabel: 'Reputation',
  repMultiplierLabel: 'Coin multiplier',
  repEffectLabel: 'Higher reputation multiplies coin income (capped)',
  scoreTitle: 'Score Estimate',
  scoreEstimateLabel: 'Estimated score',
  scoreBreakdownCoins: 'Coins',
  scoreBreakdownReputation: 'Reputation ×',
  scoreBreakdownChallenges: 'Challenges',
  scoreRemainingToWin: 'more needed to win',
  scoreThresholdMet: 'Win threshold met!',
  scoreNextTierLabel: 'Next tier',
  scoreAllTiersUnlocked: 'All tiers unlocked',
} as const;

/** ARIA label default English strings. Registered as the `en` locale bundle. */
export const HUD_ARIA_STRINGS = {
  coins: 'Coins status — hover for expected income breakdown',
  rep: 'Reputation status — hover for multiplier details',
  score: 'Score status — hover for next tier threshold',
} as const;

// ── Register the English locale bundle ────────────────────────────────
// This is done at module-load time so the default strings are always available.
// The i18n keys (HUD_TOOLTIP_I18N_KEYS / HUD_ARIA_I18N_KEYS) are used as the
// lookup keys; HUD_TOOLTIP_STRINGS and HUD_ARIA_STRINGS supply the values.

const enBundle: Record<string, string> = {};
for (const [k, v] of Object.entries(HUD_TOOLTIP_STRINGS)) {
  enBundle[HUD_TOOLTIP_I18N_KEYS[k as keyof typeof HUD_TOOLTIP_STRINGS]] = v;
}
for (const [k, v] of Object.entries(HUD_ARIA_STRINGS)) {
  enBundle[HUD_ARIA_I18N_KEYS[k as keyof typeof HUD_ARIA_STRINGS]] = v;
}
registerLocale('en', enBundle);

// ── Tooltip Content Builders ─────────────────────────────────

/**
 * Builds the tooltip content string for the Coins HUD element.
 *
 * Shows:
 * - Base income this turn (pre-reputation multiplier)
 * - Multiplied income (post-reputation multiplier)
 * - Brief calculation note
 */
export function buildCoinsTooltip(state: MainStreetState): string {
  const incomeResult = computeIncome(state.streetGrid, state.config.synergyBonusPerNeighbor);
  const baseIncome = incomeResult.total;
  const multipliedIncome = applyReputationMultiplier(
    baseIncome,
    state.resourceBank.reputation,
    state.config,
  );
  const multiplier = reputationCoinMultiplier(state.resourceBank.reputation, state.config);
  const multiplierStr = Number.isFinite(multiplier) ? multiplier.toFixed(1) : '1.0';

  const preMultiplierStr = Number.isFinite(baseIncome) ? baseIncome.toFixed(1) : '0.0';
  const postMultiplierStr = Number.isFinite(multipliedIncome) ? multipliedIncome.toFixed(2) : '0.00';

  const lines = [
    t(HUD_TOOLTIP_I18N_KEYS.coinsTitle),
    `${t(HUD_TOOLTIP_I18N_KEYS.coinsPreMultiplierLabel)}: ${preMultiplierStr}`,
    `${t(HUD_TOOLTIP_I18N_KEYS.coinsPostMultiplierLabel)}: ${postMultiplierStr} (×${multiplierStr})`,
    t(HUD_TOOLTIP_I18N_KEYS.coinsCalcNote),
  ];

  return lines.join('\n');
}

/**
 * Builds the full IncomeResult for external use (e.g. tests).
 */
export function getIncomeResult(state: MainStreetState): IncomeResult {
  return computeIncome(state.streetGrid, state.config.synergyBonusPerNeighbor);
}

/**
 * Builds the tooltip content string for the Reputation HUD element.
 *
 * Shows:
 * - Current reputation value
 * - Active coin multiplier (numeric)
 * - Short explanation of reputation effect on income
 */
export function buildReputationTooltip(state: MainStreetState): string {
  const rep = state.resourceBank.reputation;
  const multiplier = reputationCoinMultiplier(rep, state.config);
  const multiplierStr = Number.isFinite(multiplier) ? multiplier.toFixed(1) : '1.0';

  const lines = [
    t(HUD_TOOLTIP_I18N_KEYS.repTitle),
    `${t(HUD_TOOLTIP_I18N_KEYS.repValueLabel)}: ${rep}`,
    `${t(HUD_TOOLTIP_I18N_KEYS.repMultiplierLabel)}: ×${multiplierStr}`,
    t(HUD_TOOLTIP_I18N_KEYS.repEffectLabel),
  ];

  return lines.join('\n');
}

/**
 * Builds the tooltip content string for the Score HUD element.
 *
 * Shows:
 * - Current final-score estimate in "x / y" format (where y is the win threshold)
 * - Score breakdown by source (coins, reputation multiplier, challenge bonus)
 * - How close the player is to the win threshold
 * - Next locked tier name and reputation threshold (or "All tiers unlocked")
 */
export function buildScoreTooltip(
  state: MainStreetState,
  campaign: MainStreetCampaignProgress | null,
): string {
  const score = computeScore(state);
  const threshold = state.config.winThreshold;

  // Score breakdown components
  const coins = state.resourceBank.coins;
  const rep = state.resourceBank.reputation;
  const repContribution = rep * state.config.reputationScoreMultiplier;
  const challengeContribution = state.challengesCompleted.length * state.config.challengeBonusPoints;
  const remaining = threshold - score;

  // Determine next locked tier
  const unlockedTiers = campaign?.unlockedTiers ?? ['tier-1'];
  const nextTier = findNextLockedTier(unlockedTiers);

  const lines = [
    t(HUD_TOOLTIP_I18N_KEYS.scoreTitle),
    `${t(HUD_TOOLTIP_I18N_KEYS.scoreEstimateLabel)}: ${score}/${threshold}`,
    '',
    `${t(HUD_TOOLTIP_I18N_KEYS.scoreBreakdownCoins)}: ${coins}`,
    `${t(HUD_TOOLTIP_I18N_KEYS.scoreBreakdownReputation)} ${state.config.reputationScoreMultiplier}: ${repContribution}`,
    `${t(HUD_TOOLTIP_I18N_KEYS.scoreBreakdownChallenges)}: ${challengeContribution}`,
  ];

  if (remaining > 0) {
    lines.push(
      '',
      `${remaining} ${t(HUD_TOOLTIP_I18N_KEYS.scoreRemainingToWin)}`,
    );
  } else {
    lines.push(
      '',
      t(HUD_TOOLTIP_I18N_KEYS.scoreThresholdMet),
    );
  }

  if (nextTier) {
    lines.push(
      '',
      `${t(HUD_TOOLTIP_I18N_KEYS.scoreNextTierLabel)}: ${nextTier.name} (requires Rep ≥ ${nextTier.reputationThreshold})`,
    );
  } else {
    lines.push(
      '',
      t(HUD_TOOLTIP_I18N_KEYS.scoreAllTiersUnlocked),
    );
  }

  return lines.join('\n');
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Finds the next tier that is NOT yet unlocked.
 * Returns the tier definition, or undefined if all tiers are unlocked.
 */
export function findNextLockedTier(
  unlockedTiers: string[],
): { id: string; name: string; reputationThreshold: number } | undefined {
  const unlockedSet = new Set(unlockedTiers);
  for (const tier of ORDERED_TIER_DEFINITIONS) {
    if (!unlockedSet.has(tier.id)) {
      return {
        id: tier.id,
        name: tier.name,
        reputationThreshold: tier.reputationThreshold,
      };
    }
  }
  return undefined;
}