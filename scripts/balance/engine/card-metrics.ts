/**
 * Card Metrics Engine (M1–M7) for Main Street balance analysis.
 *
 * Implements all 7 micro-level per-card metrics as pure computation functions.
 *
 * @module engine/card-metrics
 */

import type { MonteCarloRunSummary } from '../../../example-games/main-street/MainStreetMonteCarlo';

/**
 * Card template data, modelled on the `card-data.csv` structure.
 */
export interface CardTemplate {
  /** Unique card identifier (e.g., 'biz-bakery', 'evt-rain'). */
  id: string;
  /** Display name. */
  name: string;
  /** Card family: business, event, upgrade, community-space, staff. */
  family: string;
  /** Purchase cost in coins. */
  cost: number;
  /** Base income per turn (for business cards). */
  baseIncome: number;
  /** Synergy types (e.g., ['Food', 'Culture']). */
  synergyTypes: string[];
  /** Net coin delta for event cards. */
  coinDelta: number;
  /** Net reputation delta for event cards. */
  reputationDelta: number;
  /** Upgrade path parent card ID (for upgrade cards). */
  upgradePath: string;
  /** Additional properties (extensible). */
  [key: string]: unknown;
}

/**
 * Result of a single card metric computation.
 */
export interface CardMetricResult {
  /** Name of the metric (e.g., 'pickRate', 'winRateDelta'). */
  metricName: string;
  /** Computed metric value. */
  value: number;
  /** Human-readable note about the result. */
  note?: string;
  /** If this metric depends on Phase 1 data, describes what's needed. */
  dependentMetric?: string;
}

/**
 * Checks if any run in the dataset has non-empty cardsOwned.
 */
function hasCardsOwned(runs: MonteCarloRunSummary[]): boolean {
  return runs.some((r) => r.cardsOwned.length > 0);
}

/**
 * Checks if any run in the dataset has non-empty marketOffers.
 */
function hasMarketOffers(runs: MonteCarloRunSummary[]): boolean {
  return runs.some((r) => r.marketOffers.length > 0);
}

/**
 * M1: Pick Rate
 *
 * Measures how often a card is purchased when it appears in the market.
 * Returns null gracefully when `marketOffers` data is absent.
 *
 * @param cardId - The card ID to compute the metric for.
 * @param runs - Per-run Monte Carlo summaries.
 * @returns Pick rate or null if data is absent.
 */
export function computePickRate(
  cardId: string,
  runs: MonteCarloRunSummary[],
): CardMetricResult | null {
  if (runs.length === 0) {
    return { metricName: 'pickRate', value: 0, note: 'No runs data available' };
  }

  if (!hasMarketOffers(runs)) {
    return null;
  }

  let purchases = 0;
  let appearances = 0;

  for (const run of runs) {
    if (run.marketOffers.includes(cardId)) {
      appearances++;
      if (run.cardsOwned.includes(cardId)) {
        purchases++;
      }
    }
  }

  const value = appearances > 0 ? purchases / appearances : 0;
  return {
    metricName: 'pickRate',
    value,
    note: appearances === 0
      ? 'Card never appeared in market across all runs'
      : `${purchases} purchases / ${appearances} appearances`,
  };
}

/**
 * M2: Win-Rate Delta
 *
 * Measures whether purchasing a card correlates with winning or losing.
 * Returns null gracefully when `cardsOwned` data is absent.
 *
 * @param cardId - The card ID to compute the metric for.
 * @param runs - Per-run Monte Carlo summaries.
 * @returns Win-rate delta or null if data is absent.
 */
export function computeWinRateDelta(
  cardId: string,
  runs: MonteCarloRunSummary[],
): CardMetricResult | null {
  if (!hasCardsOwned(runs)) {
    return null;
  }

  let ownedWin = 0;
  let ownedTotal = 0;
  let notOwnedWin = 0;
  let notOwnedTotal = 0;

  for (const run of runs) {
    const hasCard = run.cardsOwned.includes(cardId);
    if (hasCard) {
      ownedTotal++;
      if (run.result === 'win') ownedWin++;
    } else {
      notOwnedTotal++;
      if (run.result === 'win') notOwnedWin++;
    }
  }

  const winRateWhenOwned = ownedTotal > 0 ? ownedWin / ownedTotal : 0;
  const winRateWhenNotOwned = notOwnedTotal > 0 ? notOwnedWin / notOwnedTotal : 0;
  const value = winRateWhenOwned - winRateWhenNotOwned;

  return {
    metricName: 'winRateDelta',
    value,
    note: `Owned: ${ownedWin}/${ownedTotal} = ${(winRateWhenOwned * 100).toFixed(1)}% | Not owned: ${notOwnedWin}/${notOwnedTotal} = ${(winRateWhenNotOwned * 100).toFixed(1)}%`,
  };
}

/**
 * M3: Cost-to-Income Ratio
 *
 * Measures the number of turns required for a card to pay back its purchase cost.
 * Can be computed statically from card template data alone.
 *
 * @param card - The card template.
 * @returns Cost-to-income ratio.
 */
export function computeCostToIncomeRatio(
  card: CardTemplate,
): CardMetricResult {
  if (card.baseIncome === 0) {
    return {
      metricName: 'costToIncomeRatio',
      value: Infinity,
      note: 'Card has zero base income; ratio is infinite',
    };
  }
  return {
    metricName: 'costToIncomeRatio',
    value: card.cost / card.baseIncome,
    note: `${card.cost} cost / ${card.baseIncome} income = ${(card.cost / card.baseIncome).toFixed(2)} turns`,
  };
}

/**
 * M4: Synergy Utilization Rate
 *
 * Measures how effectively a card's synergy potential is realised in actual play.
 * Requires per-run income breakdown (Phase 1 extension). Returns null when absent.
 *
 * @param cardId - The card ID to compute the metric for.
 * @param runs - Per-run Monte Carlo summaries.
 * @param card - The card template (for max possible synergy count).
 * @returns Synergy utilization or null if data absent.
 */
export function computeSynergyUtilization(
  cardId: string,
  runs: MonteCarloRunSummary[],
  card: CardTemplate,
): CardMetricResult | null {
  // Returns null when `economyHistory` or per-source income breakdown is absent
  if (runs.length === 0) {
    return null;
  }

  const hasHistory = runs.some((r) => r.economyHistory.length > 0);
  if (!hasHistory) {
    return null;
  }

  // Income breakdown by source is not yet captured in current harness
  return null;
}

/**
 * M5: Upgrade Adoption Rate
 *
 * For business cards that have an upgrade path, measures how often
 * players invest in the upgrade. Returns null when `cardsOwned` absent.
 *
 * @param upgradeCardId - The upgrade card ID (e.g., 'upg-bakery-1').
 * @param parentCardId - The parent business card ID (e.g., 'biz-bakery').
 * @param runs - Per-run Monte Carlo summaries.
 * @returns Upgrade adoption rate or null if data absent.
 */
export function computeUpgradeAdoption(
  upgradeCardId: string,
  parentCardId: string,
  runs: MonteCarloRunSummary[],
): CardMetricResult | null {
  if (!hasCardsOwned(runs)) {
    return null;
  }

  let parentPurchases = 0;
  let upgradesApplied = 0;

  for (const run of runs) {
    const hasParent = run.cardsOwned.includes(parentCardId);
    const hasUpgrade = run.cardsOwned.includes(upgradeCardId);
    if (hasParent) parentPurchases++;
    if (hasParent && hasUpgrade) upgradesApplied++;
  }

  const value = parentPurchases > 0 ? upgradesApplied / parentPurchases : 0;
  return {
    metricName: 'upgradeAdoption',
    value,
    note: `${upgradesApplied} upgrades / ${parentPurchases} parent purchases`,
  };
}

/**
 * M6: Event Impact Score
 *
 * Measures the average net economic impact when an event occurs.
 * Uses CSV static deltas with reputation weight.
 *
 * @param eventCardId - The event card ID.
 * @param runs - Per-run Monte Carlo summaries (used for frequency weighting).
 * @param allCards - All card templates (used to look up CSV deltas).
 * @returns Event impact score or null if card not found.
 */
export function computeEventImpactScore(
  eventCardId: string,
  runs: MonteCarloRunSummary[],
  allCards: CardTemplate[],
): CardMetricResult | null {
  const card = allCards.find((c) => c.id === eventCardId);
  if (!card) return null;

  const REPUTATION_WEIGHT = 5;
  const impact = card.coinDelta + card.reputationDelta * REPUTATION_WEIGHT;

  const occurrences = runs.filter((r) => r.cardsOwned.includes(eventCardId)).length;

  return {
    metricName: 'eventImpactScore',
    value: impact,
    note: `coinDelta(${card.coinDelta}) + repDelta(${card.reputationDelta}) × ${REPUTATION_WEIGHT} = ${impact}. Occurred in ${occurrences}/${runs.length} runs`,
  };
}

/**
 * M7: Survival Rate (Card-Specific)
 *
 * Given that a card was purchased, the probability the player still won.
 * Returns null when `cardsOwned` data is absent.
 *
 * @param cardId - The card ID to compute the metric for.
 * @param runs - Per-run Monte Carlo summaries.
 * @returns Survival rate or null if card was never owned.
 */
export function computeSurvivalRate(
  cardId: string,
  runs: MonteCarloRunSummary[],
): CardMetricResult | null {
  if (!hasCardsOwned(runs)) {
    return null;
  }

  let ownedAndWon = 0;
  let ownedTotal = 0;

  for (const run of runs) {
    if (run.cardsOwned.includes(cardId)) {
      ownedTotal++;
      if (run.result === 'win') ownedAndWon++;
    }
  }

  if (ownedTotal === 0) return null;

  return {
    metricName: 'survivalRate',
    value: ownedAndWon / ownedTotal,
    note: `${ownedAndWon} wins / ${ownedTotal} runs where card owned = ${((ownedAndWon / ownedTotal) * 100).toFixed(1)}%`,
  };
}
