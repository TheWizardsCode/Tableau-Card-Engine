/**
 * Global Metrics Engine (G1–G8).
 *
 * Implements all 8 macro-level global metrics as pure computation functions
 * accepting typed Monte Carlo output and returning typed structured output.
 *
 * Metrics requiring Phase 1 data (G3, G4, G6, G7, G8) degrade gracefully
 * by returning `null` when the required data is absent. Static/aggregate
 * metrics (G1, G2, G5) work immediately on existing Monte Carlo output format.
 *
 * @module
 */

import type { MonteCarloRunSummary } from '../../../example-games/main-street/MainStreetMonteCarlo';
import { median, gini } from './statistics';

// =========================================================================
// G1: Win Rate by Strategy × Difficulty
// =========================================================================

/**
 * Result for G1 (Win Rate by Strategy × Difficulty).
 */
export interface WinRateMatrixEntry {
  /** AI strategy label. */
  strategy: string;
  /** Difficulty label. */
  difficulty: string;
  /** Win rate (0 to 1). */
  winRate: number;
  /** Number of wins. */
  wins: number;
  /** Total number of runs. */
  totalRuns: number;
}

/**
 * Computes G1: Win Rate for a single strategy × difficulty combination.
 *
 * Works immediately on existing Monte Carlo output format.
 *
 * @param runs - Monte Carlo run summaries.
 * @param labels - Strategy and difficulty labels for the matrix entry.
 * @returns Win rate matrix entry.
 */
export function computeWinRateByStrategyDifficulty(
  runs: MonteCarloRunSummary[],
  labels: { strategy: string; difficulty: string },
): WinRateMatrixEntry {
  const wins = runs.filter(r => r.result === 'win').length;
  return {
    strategy: labels.strategy,
    difficulty: labels.difficulty,
    winRate: runs.length > 0 ? wins / runs.length : 0,
    wins,
    totalRuns: runs.length,
  };
}

// =========================================================================
// G2: Score Distribution
// =========================================================================

/**
 * Result for G2 (Score Distribution).
 */
export interface ScoreDistributionResult {
  /** Median score. */
  median: number;
  /** Mean (average) score. */
  mean: number;
  /** First quartile (25th percentile). */
  q1: number;
  /** Third quartile (75th percentile). */
  q3: number;
  /** Interquartile range (Q3 - Q1). */
  iqr: number;
  /** Minimum score. */
  min: number;
  /** Maximum score. */
  max: number;
  /** Population standard deviation. */
  stdDev: number;
}

/**
 * Computes G2: Score Distribution statistics from final scores.
 *
 * Works immediately on existing Monte Carlo output format.
 *
 * @param runs - Monte Carlo run summaries (uses `finalScore` field).
 * @returns Score distribution statistics.
 */
export function computeScoreDistribution(runs: MonteCarloRunSummary[]): ScoreDistributionResult {
  const scores = runs.map(r => r.finalScore);
  const n = scores.length;

  if (n === 0) {
    return { median: NaN, mean: NaN, q1: NaN, q3: NaN, iqr: NaN, min: NaN, max: NaN, stdDev: NaN };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const mean = scores.reduce((acc, v) => acc + v, 0) / n;

  // Compute Q1, Q3 using median of halves
  const halfLen = Math.floor(n / 2);
  const lowerHalf = sorted.slice(0, halfLen);
  const upperHalf = n % 2 === 0 ? sorted.slice(halfLen) : sorted.slice(halfLen + 1);

  const q1 = lowerHalf.length > 0 ? median(lowerHalf) : sorted[0];
  const q3 = upperHalf.length > 0 ? median(upperHalf) : sorted[n - 1];

  // Population standard deviation
  const variance = scores.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;

  return {
    median: median(scores),
    mean,
    q1,
    q3,
    iqr: q3 - q1,
    min: sorted[0],
    max: sorted[n - 1],
    stdDev: Math.sqrt(variance),
  };
}

// =========================================================================
// G3: Economy Health
// =========================================================================

/**
 * Turn-by-turn economy data point (Phase 1 extension).
 */
export interface EconomyDataPoint {
  /** Turn number. */
  turn: number;
  /** Coin balance at this turn. */
  coins: number;
  /** Reputation at this turn. */
  reputation: number;
  /** Score at this turn. */
  score: number;
}

/**
 * Result for G3 (Economy Health).
 */
export interface EconomyHealthResult {
  /** Average coins per turn across all runs. */
  avgCoinsPerTurn: number;
  /** Fraction of runs ending in bankruptcy (0 to 1). */
  bankruptcyRate: number;
  /** Economy tightness index: (avg coins / avg card cost) × 100. */
  economyTightnessIndex: number;
}

/**
 * Computes G3: Economy Health indicators.
 *
 * Requires Phase 1 `economyHistory` on run summaries.
 * Returns `null` when `economyHistory` is absent.
 *
 * @param runs - Monte Carlo run summaries with (optional) `economyHistory`.
 * @returns Economy health result, or `null` if Phase 1 data absent.
 */
export function computeEconomyHealth(runs: MonteCarloRunSummary[]): EconomyHealthResult | null {
  if (runs.length === 0) return null;

  const hasHistory = runs.some(r => {
    const h = (r as any).economyHistory;
    return Array.isArray(h) && h.length > 0;
  });
  if (!hasHistory) return null;

  let totalCoinsPerTurn = 0;
  let bankruptcyCount = 0;
  let totalCoinsSum = 0;
  let totalTurnsSum = 0;

  for (const run of runs) {
    const history = (run as any).economyHistory as EconomyDataPoint[] | undefined;
    if (history && history.length > 0) {
      // Average coins across all recorded turns for this run
      const avgCoins = history.reduce((s, p) => s + p.coins, 0) / history.length;
      totalCoinsPerTurn += avgCoins;
    }

    if (run.endReason === 'bankruptcy') bankruptcyCount++;
    totalCoinsSum += run.finalCoins;
    totalTurnsSum += run.turns;
  }

  const avgCoinsPerTurn = totalTurnsSum > 0 ? totalCoinsSum / totalTurnsSum : 0;

  // Economy tightness index: higher = tighter (more constrained)
  // Uses avgCoinsPerTurn as proxy for available spend
  const economyTightnessIndex = avgCoinsPerTurn > 0 ? (avgCoinsPerTurn / 6) * 100 : 0;

  return {
    avgCoinsPerTurn,
    bankruptcyRate: runs.length > 0 ? bankruptcyCount / runs.length : 0,
    economyTightnessIndex,
  };
}

// =========================================================================
// G4: Synergy Diversity
// =========================================================================

/**
 * Result for G4 (Synergy Diversity).
 */
export interface SynergyDiversityResult {
  /** Herfindahl-Hirschman Index (0 to 10000). */
  hhi: number;
  /** Share of each synergy type (keyed by type name). */
  synergyTypeShares: Record<string, number>;
}

/**
 * Computes G4: Synergy Diversity Index (HHI of synergy type shares).
 *
 * Requires Phase 1 `finalGrid` on run summaries.
 * Returns `null` when `finalGrid` is absent.
 *
 * @param runs - Monte Carlo run summaries with (optional) `finalGrid`.
 * @param synergyTypeMap - Mapping from card ID to synergy type name.
 * @returns Synergy diversity result, or `null` if data absent.
 */
export function computeSynergyDiversity(
  runs: MonteCarloRunSummary[],
  synergyTypeMap: Record<string, string>,
): SynergyDiversityResult | null {
  if (runs.length === 0) return null;

  const hasFinalGrid = runs.some(r => 'finalGrid' in r);
  if (!hasFinalGrid) return null;

  // Count synergy type occurrences across all final grids
  const synergyCounts: Record<string, number> = {};
  let totalCards = 0;

  for (const run of runs) {
    const grid = (run as any).finalGrid as string[] | undefined;
    if (!grid) continue;

    for (const cardId of grid) {
      const type = synergyTypeMap[cardId] ?? 'Unknown';
      synergyCounts[type] = (synergyCounts[type] ?? 0) + 1;
      totalCards++;
    }
  }

  if (totalCards === 0) {
    return { hhi: 0, synergyTypeShares: {} };
  }

  // Compute shares and HHI
  const synergyTypeShares: Record<string, number> = {};
  let hhiSum = 0;

  for (const [type, count] of Object.entries(synergyCounts)) {
    const share = count / totalCards;
    synergyTypeShares[type] = share;
    hhiSum += share * share;
  }

  return {
    hhi: Math.round(hhiSum * 10000),
    synergyTypeShares,
  };
}

// =========================================================================
// G5: Loss Mode Decomposition
// =========================================================================

/**
 * Result for G5 (Loss Mode Decomposition).
 */
export interface LossModeDecompositionResult {
  /** Total number of losses. */
  totalLosses: number;
  /** Share of each loss mode (0 to 1). */
  shares: {
    bankruptcy: number;
    reputation_collapse: number;
    turn_exhaustion: number;
  };
  /** Raw counts for each loss mode. */
  counts: {
    bankruptcy: number;
    reputation_collapse: number;
    turn_exhaustion: number;
    other: number;
  };
}

/**
 * Computes G5: Loss Mode Decomposition.
 *
 * Works immediately on existing Monte Carlo output — `endReason` and
 * `result` fields are always present.
 *
 * Reachability model (CG-0MSLXJCHH001DLIO): `turn_exhaustion` is now only
 * reachable via a config that explicitly sets `maxTurns` (default presets
 * impose no turn limit). Harness runs from default-preset simulations that
 * hit the Monte Carlo loop cap end with `max_turns_cap` instead — both land
 * in the same `turn_exhaustion` bucket, preserving the "forced termination"
 * loss-mode meaning.
 *
 * @param runs - Monte Carlo run summaries.
 * @returns Loss mode decomposition result.
 */
export function computeLossModeDecomposition(runs: MonteCarloRunSummary[]): LossModeDecompositionResult {
  const counts = { bankruptcy: 0, reputation_collapse: 0, turn_exhaustion: 0, other: 0 };

  for (const run of runs) {
    if (run.result !== 'loss') continue;

    switch (run.endReason) {
      case 'bankruptcy':
        counts.bankruptcy++;
        break;
      case 'reputation_collapse':
        counts.reputation_collapse++;
        break;
      case 'turn_exhaustion':
      case 'max_turns_cap':
        counts.turn_exhaustion++;
        break;
      default:
        counts.other++;
        break;
    }
  }

  const totalLosses = counts.bankruptcy + counts.reputation_collapse + counts.turn_exhaustion + counts.other;

  const shares = {
    bankruptcy: totalLosses > 0 ? counts.bankruptcy / totalLosses : 0,
    reputation_collapse: totalLosses > 0 ? counts.reputation_collapse / totalLosses : 0,
    turn_exhaustion: totalLosses > 0 ? counts.turn_exhaustion / totalLosses : 0,
  };

  return { totalLosses, shares, counts };
}

// =========================================================================
// G6: Card Usage Diversity
// =========================================================================

/**
 * Result for G6 (Card Usage Diversity).
 */
export interface CardUsageDiversityResult {
  /** Gini coefficient of card appearance frequencies (0 to 1). */
  value: number;
  /** Number of won runs analysed. */
  wonRuns: number;
  /** Number of unique cards appearing in won runs. */
  uniqueCards: number;
}

/**
 * Computes G6: Card Usage Diversity (Gini coefficient).
 *
 * Requires Phase 1 `finalGrid` on run summaries.
 * Returns `null` when `finalGrid` is absent.
 *
 * @param runs - Monte Carlo run summaries with (optional) `finalGrid`.
 * @returns Card usage diversity result, or `null` if data absent.
 */
export function computeCardUsageDiversity(
  runs: MonteCarloRunSummary[],
): CardUsageDiversityResult | null {
  if (runs.length === 0) return null;

  const hasFinalGrid = runs.some(r => 'finalGrid' in r);
  if (!hasFinalGrid) return null;

  // Count card appearances in won runs only
  const cardCounts: Record<string, number> = {};
  let wonRuns = 0;

  for (const run of runs) {
    if (run.result !== 'win') continue;
    const grid = (run as any).finalGrid as string[] | undefined;
    if (!grid) continue;

    wonRuns++;
    for (const cardId of grid) {
      cardCounts[cardId] = (cardCounts[cardId] ?? 0) + 1;
    }
  }

  if (wonRuns === 0 || Object.keys(cardCounts).length === 0) {
    return { value: 0, wonRuns, uniqueCards: 0 };
  }

  const frequencies = Object.values(cardCounts);
  const uniqueCards = Object.keys(cardCounts).length;

  return {
    value: gini(frequencies),
    wonRuns,
    uniqueCards,
  };
}

// =========================================================================
// G7: Turn-by-Turn Snapshots
// =========================================================================

/**
 * A single turn's averaged economy data.
 */
export interface TurnSnapshot {
  /** Turn number. */
  turn: number;
  /** Average coin balance across runs at this turn. */
  avgCoins: number;
  /** Average reputation across runs at this turn. */
  avgReputation: number;
  /** Average score across runs at this turn. */
  avgScore: number;
  /** Number of runs that have data for this turn. */
  sampleSize: number;
}

/**
 * Result for G7 (Turn-by-Turn Snapshots).
 */
export interface TurnByTurnSnapshotsResult {
  /** Array of turn snapshots, averaged across runs. */
  averages: TurnSnapshot[];
}

/**
 * Computes G7: Turn-by-Turn Economy Snapshots.
 *
 * Requires Phase 1 `economyHistory` on run summaries.
 * Returns `null` when `economyHistory` is absent.
 *
 * @param runs - Monte Carlo run summaries with (optional) `economyHistory`.
 * @returns Turn-by-turn snapshots, or `null` if data absent.
 */
export function computeTurnByTurnSnapshots(
  runs: MonteCarloRunSummary[],
): TurnByTurnSnapshotsResult | null {
  if (runs.length === 0) return null;

  const hasHistory = runs.some(r => {
    const h = (r as any).economyHistory;
    return Array.isArray(h) && h.length > 0;
  });
  if (!hasHistory) return null;

  // Collect all data points keyed by turn
  const turnData: Record<number, { coins: number[]; reputation: number[]; score: number[] }> = {};

  for (const run of runs) {
    const history = (run as any).economyHistory as EconomyDataPoint[] | undefined;
    if (!history) continue;

    for (const point of history) {
      if (!turnData[point.turn]) {
        turnData[point.turn] = { coins: [], reputation: [], score: [] };
      }
      turnData[point.turn].coins.push(point.coins);
      turnData[point.turn].reputation.push(point.reputation);
      turnData[point.turn].score.push(point.score);
    }
  }

  const averages: TurnSnapshot[] = Object.entries(turnData)
    .map(([turnStr, data]) => {
      const turn = Number(turnStr);
      const n = data.coins.length;
      return {
        turn,
        avgCoins: data.coins.reduce((s, v) => s + v, 0) / n,
        avgReputation: data.reputation.reduce((s, v) => s + v, 0) / n,
        avgScore: data.score.reduce((s, v) => s + v, 0) / n,
        sampleSize: n,
      };
    })
    .sort((a, b) => a.turn - b.turn);

  return { averages };
}

// =========================================================================
// G8: Trap Card Prevalence
// =========================================================================

/**
 * Per-card micro metric summary for G8 computation.
 */
export interface CardMetricSummary {
  /** Card ID. */
  cardId: string;
  /** Win-rate delta (M2), or null if unavailable. */
  winRateDelta: number | null;
  /** Pick rate (M1), or null if unavailable. */
  pickRate: number | null;
}

/**
 * Result for G8 (Trap Card Prevalence).
 */
export interface TrapCardPrevalenceResult {
  /** Number of trap cards identified. */
  trapCardCount: number;
  /** IDs of trap cards. */
  trapCardIds: string[];
  /** Average win-rate delta across identified trap cards. */
  trapCardImpact: number;
}

/**
 * Computes G8: Trap Card Prevalence.
 *
 * Identifies cards where winRateDelta < -10% AND pickRate > 20%.
 * Returns `null` if any input metric is null (Phase 1 data unavailable).
 *
 * @param cardMetrics - Array of per-card metric summaries (from C-2).
 * @returns Trap card prevalence result, or `null` if any metric is null.
 */
export function computeTrapCardPrevalence(
  cardMetrics: CardMetricSummary[],
): TrapCardPrevalenceResult | null {
  const hasNullValues = cardMetrics.some(m => m.winRateDelta === null || m.pickRate === null);
  if (hasNullValues) return null;

  const trapCards = cardMetrics.filter(
    m => m.winRateDelta! < -0.10 && m.pickRate! > 0.20,
  );

  return {
    trapCardCount: trapCards.length,
    trapCardIds: trapCards.map(m => m.cardId),
    trapCardImpact: trapCards.length > 0
      ? trapCards.reduce((sum, m) => sum + m.winRateDelta!, 0) / trapCards.length
      : 0,
  };
}
