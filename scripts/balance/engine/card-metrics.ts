/**
 * Card Metrics Engine (M1–M7).
 *
 * Implements all 7 micro-level per-card metrics as pure computation functions
 * accepting typed Monte Carlo run summaries + card data and returning typed output.
 *
 * Metrics requiring Phase 1 harness data (M1, M2, M4, M5, M7) degrade gracefully
 * by returning `null` when the required data is absent.
 *
 * @module
 */

import type { MonteCarloRunSummary } from '../../../example-games/main-street/MainStreetMonteCarlo';

// =========================================================================
// Shared Types
// =========================================================================

/**
 * Indicates that a metric requires Phase 1 extended data.
 */
export interface DependentMetricInfo {
  /** Name of the metric whose value depends on Phase 1 data. */
  metric: string;
  /** Human-readable explanation. */
  message: string;
}

/**
 * A metric result whose value depends on Phase 1 harness extensions.
 */
export interface DependentMetricResult<T = number> {
  value: T | null;
  dependentMetric: DependentMetricInfo;
}

// =========================================================================
// M1: Pick Rate
// =========================================================================

/**
 * Input for M1 (Pick Rate) computation.
 */
export interface PickRateInput {
  /** Card ID to compute pick rate for. */
  cardId: string;
  /** Monte Carlo run summaries (must include `marketOffers` from Phase 1). */
  runs: MonteCarloRunSummary[];
}

/**
 * Result type for M1 (Pick Rate).
 */
export interface PickRateResult {
  /** Pick rate (purchases / market appearances), 0 to 1. */
  value: number;
  /** Number of runs where the card was purchased. */
  purchases: number;
  /** Number of runs where the card appeared in the market. */
  appearances: number;
}

/**
 * Computes M1: Pick Rate = timesPurchased / timesAvailableInMarket.
 *
 * Requires Phase 1 `marketOffers` field on run summaries. Returns `null`
 * with a descriptive `dependentMetric` when data is absent.
 *
 * @param cardId - Card ID to compute pick rate for.
 * @param runs - Monte Carlo run summaries with (optional) `marketOffers`.
 * @returns Pick rate result, or `null` if Phase 1 data absent.
 */
export function computePickRate(
  cardId: string,
  runs: MonteCarloRunSummary[],
): PickRateResult | null {
  if (runs.length === 0) {
    return { value: 0, purchases: 0, appearances: 0 };
  }

  // Check for Phase 1 data
  const hasMarketOffers = runs.some(run => 'marketOffers' in run);
  if (!hasMarketOffers) {
    return null;
  }

  let purchases = 0;
  let appearances = 0;

  for (const run of runs) {
    const offers = (run as any).marketOffers as string[] | undefined;
    const owned = (run as any).cardsOwned as string[] | undefined;

    if (offers && offers.includes(cardId)) {
      appearances++;
      if (owned && owned.includes(cardId)) {
        purchases++;
      }
    }
  }

  return {
    value: appearances > 0 ? purchases / appearances : 0,
    purchases,
    appearances,
  };
}

// =========================================================================
// M2: Win-Rate Delta
// =========================================================================

/**
 * Input for M2 (Win-Rate Delta) computation.
 */
export interface WinRateDeltaInput {
  /** Card ID to compute delta for. */
  cardId: string;
  /** Monte Carlo run summaries (must include `cardsOwned` from Phase 1). */
  runs: MonteCarloRunSummary[];
}

/**
 * Result type for M2 (Win-Rate Delta).
 */
export interface WinRateDeltaResult {
  /** Win-rate delta: winRateWhenOwned - winRateWhenNotOwned. */
  value: number;
  /** Win rate when the card was owned. */
  winRateWhenOwned: number;
  /** Win rate when the card was not owned. */
  winRateWhenNotOwned: number;
  /** Number of runs where the card was owned. */
  ownedRuns: number;
  /** Number of runs where the card was not owned. */
  notOwnedRuns: number;
}

/**
 * Computes M2: Win-Rate Delta = winRateWhenOwned - winRateWhenNotOwned.
 *
 * Requires Phase 1 `cardsOwned` field on run summaries. Returns `null`
 * when data is absent.
 *
 * Negative delta may indicate a "trap" card (frequently purchased but
 * negatively correlated with winning).
 *
 * @param cardId - Card ID to compute delta for.
 * @param runs - Monte Carlo run summaries with (optional) `cardsOwned`.
 * @returns Win-rate delta result, or `null` if Phase 1 data absent.
 */
export function computeWinRateDelta(
  cardId: string,
  runs: MonteCarloRunSummary[],
): WinRateDeltaResult | null {
  if (runs.length === 0) {
    return { value: 0, winRateWhenOwned: 0, winRateWhenNotOwned: 0, ownedRuns: 0, notOwnedRuns: 0 };
  }

  // Check for Phase 1 data
  const hasCardsOwned = runs.some(run => 'cardsOwned' in run);
  if (!hasCardsOwned) {
    return null;
  }

  let ownedRuns = 0;
  let ownedWins = 0;
  let notOwnedRuns = 0;
  let notOwnedWins = 0;

  for (const run of runs) {
    const owned = (run as any).cardsOwned as string[] | undefined;
    const isOwned = owned ? owned.includes(cardId) : false;

    if (isOwned) {
      ownedRuns++;
      if (run.result === 'win') ownedWins++;
    } else {
      notOwnedRuns++;
      if (run.result === 'win') notOwnedWins++;
    }
  }

  const winRateWhenOwned = ownedRuns > 0 ? ownedWins / ownedRuns : 0;
  const winRateWhenNotOwned = notOwnedRuns > 0 ? notOwnedWins / notOwnedRuns : 0;

  return {
    value: winRateWhenOwned - winRateWhenNotOwned,
    winRateWhenOwned,
    winRateWhenNotOwned,
    ownedRuns,
    notOwnedRuns,
  };
}

// =========================================================================
// M3: Cost-to-Income Ratio
// =========================================================================

/**
 * Input for M3 (Cost-to-Income Ratio) computation.
 */
export interface CostToIncomeInput {
  /** Card purchase cost. */
  cost: number;
  /** Card base income per turn. */
  baseIncome: number;
}

/**
 * Computes M3: Cost-to-Income Ratio = cost / baseIncome.
 *
 * This metric can be computed statically from card data — no Monte Carlo
 * run needed. A higher ratio means more turns to recoup the investment.
 *
 * - Handles zero `baseIncome` by returning `Infinity` (the card never
 *   pays back through base income alone).
 * - Handles zero `cost` by returning 0 (free card).
 *
 * @param input - Card cost and base income.
 * @returns Cost-to-income ratio.
 * @throws {TypeError} If cost or baseIncome are negative.
 */
export function computeCostToIncomeRatio(input: CostToIncomeInput): number {
  if (input.cost < 0 || input.baseIncome < 0) {
    throw new TypeError('computeCostToIncomeRatio: cost and baseIncome must be non-negative');
  }
  if (input.baseIncome === 0) {
    return Infinity;
  }
  return input.cost / input.baseIncome;
}

// =========================================================================
// M4: Synergy Utilization
// =========================================================================

/**
 * Income breakdown data (Phase 1 extension).
 */
export interface IncomeBreakdown {
  /** Income from base (non-synergy) sources. */
  base: number;
  /** Income from synergy bonuses. */
  synergy: number;
  /** Income from events. */
  event: number;
  /** Maximum possible synergy bonuses. */
  maxPossibleSynergy: number;
}

/**
 * Result type for M4 (Synergy Utilization).
 */
export interface SynergyUtilizationResult {
  /** Utilization rate: actual / max possible. */
  value: number;
  /** Total actual synergy bonuses received (across all runs). */
  actualBonuses: number;
  /** Total maximum possible synergy bonuses. */
  maxPossibleBonuses: number;
}

/**
 * Computes M4: Synergy Utilization = actualAdjacencyBonuses / maxPossibleBonuses.
 *
 * Requires Phase 1 `incomeBreakdown` on run summaries (or equivalent data).
 * Returns `null` when income breakdown is absent.
 *
 * Measures how effectively a card's synergy potential is realised in play.
 *
 * @param _cardId - Card ID (currently unused; reserved for per-card filtering).
 * @param runs - Monte Carlo run summaries with (optional) `incomeBreakdown`.
 * @returns Synergy utilization result, or `null` if data absent.
 */
export function computeSynergyUtilization(
  _cardId: string,
  runs: MonteCarloRunSummary[],
): SynergyUtilizationResult | null {
  const hasBreakdown = runs.some(run => 'incomeBreakdown' in run);
  if (!hasBreakdown) return null;

  let totalActual = 0;
  let totalMax = 0;

  for (const run of runs) {
    const breakdown = (run as any).incomeBreakdown as IncomeBreakdown | undefined;
    if (!breakdown) continue;
    totalActual += breakdown.synergy;
    totalMax += breakdown.maxPossibleSynergy;
  }

  return {
    value: totalMax > 0 ? totalActual / totalMax : 0,
    actualBonuses: totalActual,
    maxPossibleBonuses: totalMax,
  };
}

// =========================================================================
// M5: Upgrade Adoption
// =========================================================================

/**
 * Result type for M5 (Upgrade Adoption).
 */
export interface UpgradeAdoptionResult {
  /** Upgrade adoption rate: upgrades / parent purchases. */
  value: number;
  /** Number of runs where the parent was purchased. */
  parentPurchases: number;
  /** Number of runs where the upgrade was applied. */
  upgrades: number;
}

/**
 * Computes M5: Upgrade Adoption = timesUpgraded / timesParentPurchased.
 *
 * Requires Phase 1 `cardsOwned` field on run summaries.
 * Returns `null` when `cardsOwned` is absent.
 *
 * @param upgradeCardId - ID of the upgrade card (e.g., "upg-bakery-v2").
 * @param parentCardId - ID of the parent business card (e.g., "biz-bakery").
 * @param runs - Monte Carlo run summaries with (optional) `cardsOwned`.
 * @returns Upgrade adoption result, or `null` if Phase 1 data absent.
 */
export function computeUpgradeAdoption(
  upgradeCardId: string,
  parentCardId: string,
  runs: MonteCarloRunSummary[],
): UpgradeAdoptionResult | null {
  const hasCardsOwned = runs.some(run => 'cardsOwned' in run);
  if (!hasCardsOwned) return null;

  let parentPurchases = 0;
  let upgrades = 0;

  for (const run of runs) {
    const owned = (run as any).cardsOwned as string[] | undefined;
    if (!owned) continue;

    const hasParent = owned.includes(parentCardId);
    const hasUpgrade = owned.includes(upgradeCardId);

    if (hasParent) parentPurchases++;
    if (hasUpgrade) upgrades++;
  }

  return {
    value: parentPurchases > 0 ? upgrades / parentPurchases : 0,
    parentPurchases,
    upgrades,
  };
}

// =========================================================================
// M6: Event Impact Score
// =========================================================================

/**
 * Static card delta values (from `card-data.csv`) for fallback.
 */
export interface CardDeltas {
  /** Coin delta from the event. */
  coinDelta: number;
  /** Reputation delta from the event. */
  reputationDelta: number;
}

/**
 * Event occurrence data from a run.
 */
export interface EventOccurrence {
  /** Card ID of the event. */
  cardId: string;
  /** Coin change from the event. */
  coinDelta: number;
  /** Reputation change from the event. */
  repDelta: number;
  /** Turn when the event occurred. */
  turn: number;
}

/**
 * Result type for M6 (Event Impact Score).
 */
export interface EventImpactResult {
  /** Average impact score: avg(coinDelta + repDelta * 5). */
  value: number;
  /** Number of occurrences of this event across all runs. */
  occurrences: number;
  /** Reputation weight used in calculation. */
  reputationWeight: number;
}

/**
 * Computes M6: Event Impact Score = avg(coinDelta + repDelta * 5).
 *
 * Uses per-run event data when available (Phase 1 `events` field).
 * Falls back to static CSV deltas from `card-data.csv` when run data
 * is absent.
 *
 * Reputation weight defaults to 5 (the economic value of 1 reputation
 * in score contribution).
 *
 * @param cardId - Event card ID to compute impact for.
 * @param runs - Monte Carlo run summaries with (optional) `events` data.
 * @param fallbackDeltas - Static deltas from CSV (used if run data absent).
 * @param reputationWeight - Weight for reputation delta (default: 5).
 * @returns Event impact score result.
 */
export function computeEventImpactScore(
  cardId: string,
  runs: MonteCarloRunSummary[],
  fallbackDeltas?: CardDeltas,
  reputationWeight = 5,
): EventImpactResult {
  const events: EventOccurrence[] = [];

  // Collect event occurrences from run data
  for (const run of runs) {
    const runEvents = (run as any).events as EventOccurrence[] | undefined;
    if (!runEvents) continue;

    for (const evt of runEvents) {
      if (evt.cardId === cardId) {
        events.push(evt);
      }
    }
  }

  // If no run data found, use fallback
  if (events.length === 0 && fallbackDeltas) {
    return {
      value: fallbackDeltas.coinDelta + fallbackDeltas.reputationDelta * reputationWeight,
      occurrences: 0,
      reputationWeight,
    };
  }

  if (events.length === 0) {
    return { value: 0, occurrences: 0, reputationWeight };
  }

  const totalScore = events.reduce(
    (sum, evt) => sum + evt.coinDelta + evt.repDelta * reputationWeight,
    0,
  );

  return {
    value: totalScore / events.length,
    occurrences: events.length,
    reputationWeight,
  };
}

// =========================================================================
// M7: Survival Rate
// =========================================================================

/**
 * Result type for M7 (Survival Rate).
 */
export interface SurvivalRateResult {
  /** Survival rate: wins(card owned) / runs(card owned). */
  value: number;
  /** Number of runs where the card was owned. */
  ownedRuns: number;
  /** Number of wins where the card was owned. */
  wins: number;
}

/**
 * Computes M7: Survival Rate = winsWhenOwned / runsWhenOwned.
 *
 * Requires Phase 1 `cardsOwned` field on run summaries.
 * Returns `null` when `cardsOwned` is absent.
 *
 * @param cardId - Card ID to compute survival rate for.
 * @param runs - Monte Carlo run summaries with (optional) `cardsOwned`.
 * @returns Survival rate result, or `null` if Phase 1 data absent.
 */
export function computeSurvivalRate(
  cardId: string,
  runs: MonteCarloRunSummary[],
): SurvivalRateResult | null {
  if (runs.length === 0) {
    return { value: 0, ownedRuns: 0, wins: 0 };
  }
  const hasCardsOwned = runs.some(run => 'cardsOwned' in run);
  if (!hasCardsOwned) return null;

  let ownedRuns = 0;
  let wins = 0;

  for (const run of runs) {
    const owned = (run as any).cardsOwned as string[] | undefined;
    if (!owned || !owned.includes(cardId)) continue;

    ownedRuns++;
    if (run.result === 'win') wins++;
  }

  return {
    value: ownedRuns > 0 ? wins / ownedRuns : 0,
    ownedRuns,
    wins,
  };
}
