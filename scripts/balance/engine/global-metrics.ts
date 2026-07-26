/**
 * Global Metrics Engine (G1–G8) for Main Street balance analysis.
 *
 * Implements all 8 macro-level global metrics as pure computation functions
 * accepting typed Monte Carlo output and returning typed structured results.
 *
 * @module engine/global-metrics
 */

import type { MonteCarloRunSummary } from '../../../example-games/main-street/MainStreetMonteCarlo';
import { median, iqr, gini, hhi } from './statistics';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/**
 * Label for a strategy×difficulty combination.
 */
export interface ComboLabel {
  strategy: string;
  difficulty: string;
}

/**
 * Loss mode breakdown.
 */
export interface LossReasons {
  bankruptcy: number;
  reputationCollapse: number;
  timeout: number;
}

/**
 * Input structure for a single strategy×difficulty combination.
 */
export interface MetricsInput {
  strategy: string;
  difficulty: string;
  totalGames: number;
  wins: number;
  winRate: number;
  medianScore: number;
  averageScore: number;
  maxScore: number;
  minScore: number;
  lossReasons: LossReasons;
  averageTurns: number;
  averageNoActionTurns: number;
  averageTurnWhenGridHalf: number;
  averageTurnWhenGridFull: number;
  runs: MonteCarloRunSummary[];
  [key: string]: unknown;
}

/**
 * Result of G2: Score Distribution.
 */
export interface ScoreDistribution {
  median: number;
  mean: number;
  q1: number;
  q3: number;
  iqr: number;
  min: number;
  max: number;
  stdDev: number;
  n: number;
}

/**
 * Result of G3: Economy Health.
 */
export interface EconomyHealthResult {
  avgCoinsPerTurn: number;
  avgFinalCoins: number;
  avgTurns: number;
  note: string;
}

/**
 * Result of G4: Synergy Diversity Index.
 */
export interface SynergyDiversityResult {
  hhi: number;
  synergyShares: Record<string, number>;
}

/**
 * Result of G5: Loss Mode Decomposition.
 */
export interface LossModeResult {
  lossShares: {
    bankruptcy: number;
    reputationCollapse: number;
    timeout: number;
  };
  totalLosses: number;
}

/**
 * Result of G6: Card Usage Diversity.
 */
export interface CardUsageDiversityResult {
  value: number;
  uniqueCardsUsed: number;
  totalAppearances: number;
  metricName: string;
}

/**
 * Result of G7: Turn-by-Turn Snapshots.
 */
export interface TurnByTurnSnapshot {
  avgCoinsByTurn: Record<number, number>;
  avgReputationByTurn: Record<number, number>;
  avgScoreByTurn: Record<number, number>;
  maxTurnObserved: number;
}

/**
 * Input for G8: Trap Card Prevalence.
 * Each entry represents aggregated card-level metrics from C-2.
 */
export interface CardLevelResult {
  id: string;
  winRateDelta: number;
  pickRate: number;
  [key: string]: unknown;
}

/**
 * Result of G8: Trap Card Prevalence.
 */
export interface TrapCardResult {
  trapCardCount: number;
  trapCardIds: string[];
  averageTrapWinRateDelta: number;
}

// ---------------------------------------------------------------------------
// G1: Win Rate by Strategy × Difficulty
// ---------------------------------------------------------------------------

/**
 * Computes the win rate matrix across all provided strategy×difficulty combos.
 *
 * @param combos - Array of metrics inputs for each combination.
 * @returns Record of strategy → difficulty → win rate.
 */
export function computeWinRateByStrategy(
  combos: MetricsInput[],
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const combo of combos) {
    if (!result[combo.strategy]) {
      result[combo.strategy] = {};
    }
    result[combo.strategy][combo.difficulty] = combo.winRate;
  }
  return result;
}

// ---------------------------------------------------------------------------
// G2: Score Distribution
// ---------------------------------------------------------------------------

/**
 * Computes a full score distribution from per-run final scores.
 * Returns null when fewer than 1 run is provided.
 *
 * @param runs - Per-run Monte Carlo summaries.
 * @returns Score distribution or null if no data.
 */
export function computeScoreDistribution(
  runs: MonteCarloRunSummary[],
): ScoreDistribution | null {
  const scores = runs.map((r) => r.finalScore).filter((s) => !isNaN(s));
  if (scores.length < 1) return null;

  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;

  const variance =
    sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  const med = median(sorted);
  const iqrResult = iqr(sorted);

  return {
    median: med,
    mean,
    q1: iqrResult.q1,
    q3: iqrResult.q3,
    iqr: iqrResult.iqr,
    min: sorted[0],
    max: sorted[n - 1],
    stdDev,
    n,
  };
}

// ---------------------------------------------------------------------------
// G3: Economy Health
// ---------------------------------------------------------------------------

/**
 * Computes economy health indicators from per-run economy history.
 * Returns null when `economyHistory` is absent for all runs.
 *
 * @param runs - Per-run Monte Carlo summaries.
 * @returns Economy health result or null if data absent.
 */
export function computeEconomyHealth(
  runs: MonteCarloRunSummary[],
): EconomyHealthResult | null {
  if (runs.length === 0) {
    return null;
  }

  const runsWithHistory = runs.filter((r) => r.economyHistory.length > 0);
  if (runsWithHistory.length === 0) {
    return null;
  }

  let totalCoinsSum = 0;
  let totalHistoryEntries = 0;

  for (const run of runsWithHistory) {
    for (const entry of run.economyHistory) {
      totalCoinsSum += entry.coins;
      totalHistoryEntries++;
    }
  }

  const avgCoinsPerTurn =
    totalHistoryEntries > 0 ? totalCoinsSum / totalHistoryEntries : 0;
  const avgFinalCoins =
    runsWithHistory.reduce((s, r) => s + r.finalCoins, 0) / runsWithHistory.length;
  const avgTurns =
    runsWithHistory.reduce((s, r) => s + r.turns, 0) / runsWithHistory.length;

  return {
    avgCoinsPerTurn,
    avgFinalCoins,
    avgTurns,
    note: `Averaged over ${totalHistoryEntries} economy snapshots from ${runsWithHistory.length} runs`,
  };
}

// ---------------------------------------------------------------------------
// G4: Synergy Diversity Index (HHI)
// ---------------------------------------------------------------------------

/**
 * Computes the Herfindahl-Hirschman Index of synergy type distribution.
 * Returns null when synergy composition data is absent.
 *
 * @param runs - Per-run Monte Carlo summaries.
 * @param allCards - All card templates (for synergy type lookup).
 * @returns Synergy diversity result or null.
 */
export function computeSynergyDiversityIndex(
  runs: MonteCarloRunSummary[],
  allCards: { id: string; synergyTypes: string[] }[],
): SynergyDiversityResult | null {
  // Requires per-run final grid composition with synergy type tracking,
  // which is not yet available in MonteCarloRunSummary.
  // Return null gracefully.
  return null;
}

// ---------------------------------------------------------------------------
// G5: Loss Mode Decomposition
// ---------------------------------------------------------------------------

/**
 * Computes the share of each loss mode (bankruptcy, reputation, timeout)
 * across all provided combinations.
 *
 * @param combos - Array of metrics inputs containing lossReasons.
 * @returns Aggregated loss mode shares or null if no data.
 */
export function computeLossModeDecomposition(
  combos: { strategy: string; difficulty: string; lossReasons: LossReasons }[],
): LossModeResult | null {
  if (combos.length === 0) return null;

  let totalBankruptcy = 0;
  let totalRepCollapse = 0;
  let totalTimeout = 0;

  for (const combo of combos) {
    totalBankruptcy += combo.lossReasons.bankruptcy;
    totalRepCollapse += combo.lossReasons.reputationCollapse;
    totalTimeout += combo.lossReasons.timeout;
  }

  const totalLosses = totalBankruptcy + totalRepCollapse + totalTimeout;

  if (totalLosses === 0) {
    return {
      lossShares: { bankruptcy: 0, reputationCollapse: 0, timeout: 0 },
      totalLosses: 0,
    };
  }

  return {
    lossShares: {
      bankruptcy: totalBankruptcy / totalLosses,
      reputationCollapse: totalRepCollapse / totalLosses,
      timeout: totalTimeout / totalLosses,
    },
    totalLosses,
  };
}

// ---------------------------------------------------------------------------
// G6: Card Usage Diversity (Gini)
// ---------------------------------------------------------------------------

/**
 * Computes the Gini coefficient of card appearance frequencies across won runs.
 * Returns null when `cardsOwned` data is absent or no won runs exist.
 *
 * @param runs - Per-run Monte Carlo summaries.
 * @returns Card usage diversity result or null.
 */
export function computeCardUsageDiversity(
  runs: MonteCarloRunSummary[],
): CardUsageDiversityResult | null {
  const wonRuns = runs.filter((r) => r.result === 'win' && r.cardsOwned.length > 0);
  if (wonRuns.length === 0) return null;

  // Count card appearances across all won runs
  const frequencyMap = new Map<string, number>();
  for (const run of wonRuns) {
    for (const cardId of run.cardsOwned) {
      frequencyMap.set(cardId, (frequencyMap.get(cardId) ?? 0) + 1);
    }
  }

  const frequencies = Array.from(frequencyMap.values());
  const total = frequencies.reduce((s, v) => s + v, 0);
  if (total === 0) return null;

  // Gini coefficient of inequality in card usage
  const giniValue = gini(frequencies);

  return {
    value: giniValue,
    uniqueCardsUsed: frequencyMap.size,
    totalAppearances: total,
    metricName: 'cardUsageDiversity',
  };
}

// ---------------------------------------------------------------------------
// G7: Turn-by-Turn Economy Snapshots
// ---------------------------------------------------------------------------

/**
 * Computes the average coins, reputation, and score at each turn across runs.
 * Returns null when `economyHistory` is absent.
 *
 * @param runs - Per-run Monte Carlo summaries.
 * @returns Turn-by-turn snapshots or null if data absent.
 */
export function computeTurnByTurnSnapshots(
  runs: MonteCarloRunSummary[],
): TurnByTurnSnapshot | null {
  const runsWithHistory = runs.filter((r) => r.economyHistory.length > 0);
  if (runsWithHistory.length === 0) return null;

  // Aggregate economy history entries by turn number
  const coinByTurn = new Map<number, number[]>();
  const repByTurn = new Map<number, number[]>();
  const scoreByTurn = new Map<number, number[]>();

  for (const run of runsWithHistory) {
    for (const entry of run.economyHistory) {
      if (!coinByTurn.has(entry.turn)) coinByTurn.set(entry.turn, []);
      if (!repByTurn.has(entry.turn)) repByTurn.set(entry.turn, []);
      if (!scoreByTurn.has(entry.turn)) scoreByTurn.set(entry.turn, []);
      coinByTurn.get(entry.turn)!.push(entry.coins);
      repByTurn.get(entry.turn)!.push(entry.reputation);
      scoreByTurn.get(entry.turn)!.push(entry.score);
    }
  }

  const avgCoinsByTurn: Record<number, number> = {};
  const avgReputationByTurn: Record<number, number> = {};
  const avgScoreByTurn: Record<number, number> = {};
  let maxTurnObserved = 0;

  for (const [turn, coins] of coinByTurn) {
    avgCoinsByTurn[turn] = coins.reduce((s, v) => s + v, 0) / coins.length;
    maxTurnObserved = Math.max(maxTurnObserved, turn);
  }
  for (const [turn, reps] of repByTurn) {
    avgReputationByTurn[turn] = reps.reduce((s, v) => s + v, 0) / reps.length;
  }
  for (const [turn, scores] of scoreByTurn) {
    avgScoreByTurn[turn] = scores.reduce((s, v) => s + v, 0) / scores.length;
  }

  return { avgCoinsByTurn, avgReputationByTurn, avgScoreByTurn, maxTurnObserved };
}

// ---------------------------------------------------------------------------
// G8: Trap Card Prevalence
// ---------------------------------------------------------------------------

/**
 * Identifies "trap" cards: those with winRateDelta < -10% and pickRate > 20%.
 *
 * @param cardResults - Aggregated card-level results (from C-2 M1/M2).
 * @returns Trap card prevalence result or null if no data.
 */
export function computeTrapCardPrevalence(
  cardResults: CardLevelResult[],
): TrapCardResult | null {
  if (cardResults.length === 0) return null;

  const trapCards = cardResults.filter(
    (c) => c.winRateDelta < -0.1 && c.pickRate > 0.2,
  );

  if (trapCards.length === 0) {
    return { trapCardCount: 0, trapCardIds: [], averageTrapWinRateDelta: 0 };
  }

  const avgDelta =
    trapCards.reduce((s, c) => s + c.winRateDelta, 0) / trapCards.length;

  return {
    trapCardCount: trapCards.length,
    trapCardIds: trapCards.map((c) => c.id),
    averageTrapWinRateDelta: avgDelta,
  };
}
