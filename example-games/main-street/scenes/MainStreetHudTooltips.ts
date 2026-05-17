/**
 * MainStreetHudTooltips -- Tooltip content builders for the HUD status bar.
 *
 * Provides localizable string keys and builder functions for the Coins,
 * Reputation, and Score tooltips shown when hovering/tapping HUD values.
 *
 * ## i18n key convention
 * Each tooltip string is keyed under `hud.tooltip.<field>` so that a future
 * i18n system can swap implementations. For now the strings are built with
 * template functions that embed computed numeric values.
 *
 * ## ARIA labels
 * Each interactive zone carries a static `aria-label` for screen readers.
 * These are also localizable via the same key convention.
 *
 * @module
 */

import { computeIncome, type IncomeResult } from '../MainStreetAdjacency';
import { reputationCoinMultiplier, applyReputationMultiplier } from '../MainStreetDifficulty';
import { ORDERED_TIER_DEFINITIONS } from '../MainStreetTiers';
import { computeScore } from '../MainStreetEngine';
import type { MainStreetState, MainStreetCampaignProgress } from '../MainStreetState';

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
  scoreNextTierLabel: 'hud.tooltip.score.nextTier',
  scoreAllTiersUnlocked: 'hud.tooltip.score.allTiersUnlocked',
} as const;

/** ARIA label i18n keys (for screen-reader accessibility). */
export const HUD_ARIA_I18N_KEYS = {
  coins: 'hud.aria.coins',
  rep: 'hud.aria.rep',
  score: 'hud.aria.score',
} as const;

// ── ARIA label defaults (localize here) ─────────────────────

/** Default ARIA labels for each HUD interactive zone. */
export const HUD_ARIA_LABELS = {
  coins: 'Coins status — hover for	expected income breakdown',
  rep: 'Reputation status — hover for multiplier details',
  score: 'Score status — hover for next tier threshold',
} as const;

// ── Default string templates (localize here) ──────────────────

/** Default English string templates. Swappable via i18n key map. */
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
  scoreNextTierLabel: 'Next tier',
  scoreAllTiersUnlocked: 'All tiers unlocked',
} as const;

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

  const lines = [
    HUD_TOOLTIP_STRINGS.coinsTitle,
    `${HUD_TOOLTIP_STRINGS.coinsPreMultiplierLabel}: ${baseIncome}`,
    `${HUD_TOOLTIP_STRINGS.coinsPostMultiplierLabel}: ${multipliedIncome} (×${multiplierStr})`,
    HUD_TOOLTIP_STRINGS.coinsCalcNote,
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
    HUD_TOOLTIP_STRINGS.repTitle,
    `${HUD_TOOLTIP_STRINGS.repValueLabel}: ${rep}`,
    `${HUD_TOOLTIP_STRINGS.repMultiplierLabel}: ×${multiplierStr}`,
    HUD_TOOLTIP_STRINGS.repEffectLabel,
  ];

  return lines.join('\n');
}

/**
 * Builds the tooltip content string for the Score HUD element.
 *
 * Shows:
 * - Current final-score estimate
 * - Next locked tier name and reputation threshold (or "All tiers unlocked")
 */
export function buildScoreTooltip(
  state: MainStreetState,
  campaign: MainStreetCampaignProgress | null,
): string {
  const score = computeScore(state);

  // Determine next locked tier
  const unlockedTiers = campaign?.unlockedTiers ?? ['tier-1'];
  const nextTier = findNextLockedTier(unlockedTiers);

  const lines = [
    HUD_TOOLTIP_STRINGS.scoreTitle,
    `${HUD_TOOLTIP_STRINGS.scoreEstimateLabel}: ${score}`,
  ];

  if (nextTier) {
    lines.push(
      `${HUD_TOOLTIP_STRINGS.scoreNextTierLabel}: ${nextTier.name} (requires Rep ≥ ${nextTier.reputationThreshold})`,
    );
  } else {
    lines.push(HUD_TOOLTIP_STRINGS.scoreAllTiersUnlocked);
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