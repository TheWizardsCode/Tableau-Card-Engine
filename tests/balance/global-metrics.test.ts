import { describe, it, expect } from 'vitest';
import type { MonteCarloRunSummary, MonteCarloMetrics } from '../../example-games/main-street/MainStreetMonteCarlo';
import {
  computeWinRateByStrategy,
  computeScoreDistribution,
  computeEconomyHealth,
  computeSynergyDiversityIndex,
  computeLossModeDecomposition,
  computeCardUsageDiversity,
  computeTurnByTurnSnapshots,
  computeTrapCardPrevalence,
  type ComboLabel,
  type ScoreDistribution,
} from '../../scripts/balance/engine/global-metrics';

// Helper factory
function makeRun(overrides: Partial<MonteCarloRunSummary> = {}): MonteCarloRunSummary {
  return {
    seed: 'test-seed',
    result: 'win',
    endReason: 'score_threshold',
    finalScore: 150,
    finalCoins: 30,
    turns: 15,
    turnWhenGridHalf: 7,
    turnWhenGridFull: 12,
    noActionTurns: 0,
    cardsOwned: [],
    marketOffers: [],
    economyHistory: [],
    ...overrides,
  };
}

function makeCombo(
  overrides: Partial<MonteCarloMetrics> & { strategy: string; difficulty: string; runs: MonteCarloRunSummary[] },
) {
  return {
    strategy: overrides.strategy,
    difficulty: overrides.difficulty,
    totalGames: overrides.totalGames ?? 200,
    wins: overrides.wins ?? 100,
    winRate: overrides.winRate ?? 0.5,
    medianScore: overrides.medianScore ?? 150,
    averageScore: overrides.averageScore ?? 148,
    maxScore: overrides.maxScore ?? 300,
    minScore: overrides.minScore ?? 20,
    lossReasons: overrides.lossReasons ?? { bankruptcy: 50, reputationCollapse: 30, timeout: 20 },
    averageTurns: overrides.averageTurns ?? 18,
    averageNoActionTurns: overrides.averageNoActionTurns ?? 1,
    averageTurnWhenGridHalf: overrides.averageTurnWhenGridHalf ?? 8,
    averageTurnWhenGridFull: overrides.averageTurnWhenGridFull ?? 14,
    runs: overrides.runs,
  };
}

// G1: Win Rate by Strategy × Difficulty
describe('computeWinRateByStrategy (G1)', () => {
  it('computes win rate matrix from combinations', () => {
    const combos = [
      makeCombo({ strategy: 'greedy', difficulty: 'Medium', runs: [], wins: 120, totalGames: 200, winRate: 0.6 }),
      makeCombo({ strategy: 'random', difficulty: 'Medium', runs: [], wins: 30, totalGames: 200, winRate: 0.15 }),
    ];
    const result = computeWinRateByStrategy(combos as Parameters<typeof computeWinRateByStrategy>[0]);
    expect(result.greedy.Medium).toBeCloseTo(0.6, 2);
    expect(result.random.Medium).toBeCloseTo(0.15, 2);
  });

  it('has undefined for missing combinations', () => {
    const result = computeWinRateByStrategy([]);
    expect(Object.keys(result.random ?? {})).toHaveLength(0);
  });

  it('handles all 12 combos', () => {
    const combos = [
      makeCombo({ strategy: 'greedy', difficulty: 'Easy', runs: [], winRate: 0.7 }),
      makeCombo({ strategy: 'greedy', difficulty: 'Medium', runs: [], winRate: 0.45 }),
      makeCombo({ strategy: 'greedy', difficulty: 'Hard', runs: [], winRate: 0.25 }),
      makeCombo({ strategy: 'random', difficulty: 'Easy', runs: [], winRate: 0.2 }),
      makeCombo({ strategy: 'random', difficulty: 'Medium', runs: [], winRate: 0.1 }),
      makeCombo({ strategy: 'random', difficulty: 'Hard', runs: [], winRate: 0.05 }),
    ];
    const result = computeWinRateByStrategy(combos as Parameters<typeof computeWinRateByStrategy>[0]);
    expect(result.greedy.Easy).toBeCloseTo(0.7, 1);
    expect(result.random.Hard).toBeCloseTo(0.05, 2);
  });
});

// G2: Score Distribution
describe('computeScoreDistribution (G2)', () => {
  it('computes median, mean, Q1, Q3, IQR, min, max from finalScore', () => {
    const runs = [
      makeRun({ finalScore: 100 }),
      makeRun({ finalScore: 150 }),
      makeRun({ finalScore: 200 }),
      makeRun({ finalScore: 250 }),
      makeRun({ finalScore: 300 }),
    ];
    const result = computeScoreDistribution(runs);
    expect(result?.median).toBe(200);
    expect(result?.mean).toBe(200);
    expect(result?.min).toBe(100);
    expect(result?.max).toBe(300);
    expect(result?.iqr).toBe(100); // Q3(250) - Q1(150) = 100 (inclusive method)
  });

  it('handles empty runs array', () => {
    const result = computeScoreDistribution([]);
    expect(result).toBeNull();
  });

  it('handles single run', () => {
    const runs = [makeRun({ finalScore: 175 })];
    const result = computeScoreDistribution(runs);
    expect(result?.median).toBe(175);
    expect(result?.iqr).toBe(0);
    expect(result?.stdDev).toBe(0);
  });

  it('handles even number of runs', () => {
    const runs = [
      makeRun({ finalScore: 50 }),
      makeRun({ finalScore: 100 }),
      makeRun({ finalScore: 150 }),
      makeRun({ finalScore: 200 }),
    ];
    const result = computeScoreDistribution(runs);
    expect(result?.median).toBe(125); // avg of 100+150
    expect(result?.mean).toBe(125);
  });
});

// G3: Economy Health
describe('computeEconomyHealth (G3)', () => {
  it('returns avg coins/turn from economyHistory', () => {
    const runs = [
      makeRun({
        economyHistory: [
          { turn: 1, coins: 10, reputation: 0, score: 0 },
          { turn: 2, coins: 15, reputation: 1, score: 10 },
        ],
        turns: 2,
        finalCoins: 15,
      }),
      makeRun({
        economyHistory: [
          { turn: 1, coins: 10, reputation: 0, score: 0 },
          { turn: 2, coins: 25, reputation: 2, score: 20 },
        ],
        turns: 2,
        finalCoins: 25,
      }),
    ];
    const result = computeEconomyHealth(runs);
    expect(result?.avgCoinsPerTurn).toBeCloseTo(15, 2);
  });

  it('returns null when economyHistory is absent', () => {
    const runs = [makeRun({ economyHistory: [] as Array<{turn: number; coins: number; reputation: number; score: number}> })];
    const result = computeEconomyHealth(runs);
    expect(result).toBeNull();
  });

  it('handles empty runs array', () => {
    const result = computeEconomyHealth([]);
    expect(result).toBeNull();
  });
});

// G4: Synergy Diversity (HHI)
describe('computeSynergyDiversityIndex (G4)', () => {
  it('returns null when synergy data absent', () => {
    const runs = [makeRun()];
    const result = computeSynergyDiversityIndex(runs, []);
    expect(result).toBeNull();
  });
});

// G5: Loss Mode Decomposition
describe('computeLossModeDecomposition (G5)', () => {
  it('computes shares from lossReasons', () => {
    const combos = [
      { strategy: 'greedy', difficulty: 'Medium', lossReasons: { bankruptcy: 50, reputationCollapse: 30, timeout: 20 } },
    ];
    const result = computeLossModeDecomposition(combos as Parameters<typeof computeLossModeDecomposition>[0]);
    expect(result?.lossShares?.bankruptcy).toBeCloseTo(0.5, 1);
    expect(result?.lossShares?.reputationCollapse).toBeCloseTo(0.3, 1);
    expect(result?.lossShares?.timeout).toBeCloseTo(0.2, 1);
  });

  it('handles empty array', () => {
    const result = computeLossModeDecomposition([]);
    expect(result).toBeNull();
  });

  it('handles zero losses gracefully', () => {
    const combos = [
      { strategy: 'greedy', difficulty: 'Medium', lossReasons: { bankruptcy: 0, reputationCollapse: 0, timeout: 0 } },
    ];
    const result = computeLossModeDecomposition(combos as Parameters<typeof computeLossModeDecomposition>[0]);
    expect(result?.lossShares?.bankruptcy).toBe(0);
  });
});

// G6: Card Usage Diversity (Gini)
describe('computeCardUsageDiversity (G6)', () => {
  it('returns null when card ownership data absent', () => {
    const runs = [makeRun({ cardsOwned: [] as string[] })];
    const result = computeCardUsageDiversity(runs);
    expect(result).toBeNull();
  });

  it('computes gini from card appearance frequencies', () => {
    const runs = [
      makeRun({ cardsOwned: ['biz-a', 'biz-b'], result: 'win' }),
      makeRun({ cardsOwned: ['biz-a', 'biz-c'], result: 'win' }),
      makeRun({ cardsOwned: ['biz-a', 'biz-b', 'biz-c'], result: 'win' }),
    ];
    const result = computeCardUsageDiversity(runs);
    expect(result).not.toBeNull();
    expect(result!.value).toBeGreaterThan(0); // some inequality since biz-a appears most
    expect(result!.value).toBeLessThan(1);
  });
});

// G7: Turn-by-Turn Snapshots
describe('computeTurnByTurnSnapshots (G7)', () => {
  it('returns null when economyHistory absent', () => {
    const runs = [makeRun({ economyHistory: [] as Array<{turn: number; coins: number; reputation: number; score: number}> })];
    const result = computeTurnByTurnSnapshots(runs);
    expect(result).toBeNull();
  });

  it('computes average coins/rep/score per turn', () => {
    const runs = [
      makeRun({
        economyHistory: [
          { turn: 1, coins: 10, reputation: 0, score: 0 },
          { turn: 2, coins: 15, reputation: 1, score: 10 },
        ],
      }),
      makeRun({
        economyHistory: [
          { turn: 1, coins: 12, reputation: 0, score: 0 },
          { turn: 2, coins: 18, reputation: 2, score: 15 },
        ],
      }),
    ];
    const result = computeTurnByTurnSnapshots(runs);
    expect(result).not.toBeNull();
    expect(result!.avgCoinsByTurn[1]).toBeCloseTo(11, 1); // (10+12)/2
    expect(result!.avgCoinsByTurn[2]).toBeCloseTo(16.5, 1); // (15+18)/2
  });
});

// G8: Trap Card Prevalence
describe('computeTrapCardPrevalence (G8)', () => {
  it('counts cards with winRateDelta < -0.1 and pickRate > 0.2', () => {
    const cardResults = [
      { id: 'biz-bakery', winRateDelta: -0.15, pickRate: 0.3 },
      { id: 'biz-diner', winRateDelta: 0.05, pickRate: 0.4 },
      { id: 'biz-cafe', winRateDelta: -0.2, pickRate: 0.1 }, // pickRate too low
    ];
    const result = computeTrapCardPrevalence(cardResults as Parameters<typeof computeTrapCardPrevalence>[0]);
    expect(result).not.toBeNull();
    expect(result!.trapCardCount).toBe(1);
    expect(result!.trapCardIds).toContain('biz-bakery');
    expect(result!.averageTrapWinRateDelta).toBeCloseTo(-0.15, 2);
  });

  it('returns null when card results empty', () => {
    const result = computeTrapCardPrevalence([]);
    expect(result).toBeNull();
  });

  it('returns zero traps when no cards qualify', () => {
    const cardResults = [
      { id: 'biz-a', winRateDelta: -0.05, pickRate: 0.5 },
      { id: 'biz-b', winRateDelta: 0.1, pickRate: 0.1 },
    ];
    const result = computeTrapCardPrevalence(cardResults as Parameters<typeof computeTrapCardPrevalence>[0]);
    expect(result?.trapCardCount).toBe(0);
    expect(result?.trapCardIds).toHaveLength(0);
  });
});
