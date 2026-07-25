import { describe, it, expect } from 'vitest';
import {
  computeWinRateByStrategyDifficulty,
  computeScoreDistribution,
  computeEconomyHealth,
  computeSynergyDiversity,
  computeLossModeDecomposition,
  computeCardUsageDiversity,
  computeTurnByTurnSnapshots,
  computeTrapCardPrevalence,
} from '../../scripts/balance/engine/global-metrics';
import type { MonteCarloRunSummary } from '../../example-games/main-street/MainStreetMonteCarlo';

/**
 * Helper to create a MonteCarloRunSummary with optional extended fields.
 */
function makeRun(overrides: Partial<MonteCarloRunSummary> & {
  cardsOwned?: string[];
  marketOffers?: string[];
  finalGrid?: string[];
  economyHistory?: Array<{ turn: number; coins: number; reputation: number; score: number }>;
  incomeBreakdown?: { base: number; synergy: number; event: number; maxPossibleSynergy: number };
}): MonteCarloRunSummary {
  const base: MonteCarloRunSummary = {
    seed: overrides.seed ?? 'test-001',
    result: overrides.result ?? 'win',
    endReason: overrides.endReason ?? 'score_threshold',
    finalScore: overrides.finalScore ?? 150,
    finalCoins: overrides.finalCoins ?? 30,
    turns: overrides.turns ?? 15,
    turnWhenGridHalf: overrides.turnWhenGridHalf ?? null,
    turnWhenGridFull: overrides.turnWhenGridFull ?? null,
    noActionTurns: overrides.noActionTurns ?? 0,
  };
  const extended: Record<string, unknown> = {};
  if (overrides.cardsOwned) extended.cardsOwned = overrides.cardsOwned;
  if (overrides.marketOffers) extended.marketOffers = overrides.marketOffers;
  if (overrides.finalGrid) extended.finalGrid = overrides.finalGrid;
  if (overrides.economyHistory) extended.economyHistory = overrides.economyHistory;
  if (overrides.incomeBreakdown) extended.incomeBreakdown = overrides.incomeBreakdown;
  return { ...base, ...extended };
}

// ========================================================================
// G1: Win Rate by Strategy × Difficulty
// ========================================================================
describe('computeWinRateByStrategyDifficulty (G1)', () => {
  it('returns win rate matrix from labeled runs', () => {
    const runs: MonteCarloRunSummary[] = [
      makeRun({ seed: 's1', result: 'win' }),
      makeRun({ seed: 's2', result: 'loss' }),
      makeRun({ seed: 's3', result: 'win' }),
    ];
    const result = computeWinRateByStrategyDifficulty(runs, {
      strategy: 'greedy',
      difficulty: 'medium',
    });
    expect(result.strategy).toBe('greedy');
    expect(result.difficulty).toBe('medium');
    expect(result.winRate).toBeCloseTo(0.6667, 3);
    expect(result.wins).toBe(2);
    expect(result.totalRuns).toBe(3);
  });

  it('returns 0 win rate for all-loss runs', () => {
    const runs = [makeRun({ result: 'loss' }), makeRun({ result: 'loss' })];
    const result = computeWinRateByStrategyDifficulty(runs, { strategy: 'random', difficulty: 'hard' });
    expect(result.winRate).toBe(0);
    expect(result.wins).toBe(0);
    expect(result.totalRuns).toBe(2);
  });

  it('handles empty runs', () => {
    const result = computeWinRateByStrategyDifficulty([], { strategy: 'greedy', difficulty: 'medium' });
    expect(result.winRate).toBe(0);
    expect(result.totalRuns).toBe(0);
  });
});

// ========================================================================
// G2: Score Distribution
// ========================================================================
describe('computeScoreDistribution (G2)', () => {
  it('returns full statistics from score array', () => {
    const runs = [
      makeRun({ finalScore: 100 }),
      makeRun({ finalScore: 120 }),
      makeRun({ finalScore: 150 }),
      makeRun({ finalScore: 180 }),
      makeRun({ finalScore: 200 }),
    ];
    const result = computeScoreDistribution(runs);
    // Lower half: [100, 120], Upper half: [180, 200] (exclusive method)
    expect(result.median).toBe(150);
    expect(result.mean).toBe(150);
    expect(result.q1).toBe(110);
    expect(result.q3).toBe(190);
    expect(result.iqr).toBe(80);
    expect(result.min).toBe(100);
    expect(result.max).toBe(200);
    // Population stddev: sqrt(6800/5) ≈ 36.878
    expect(result.stdDev).toBeCloseTo(36.878, 2);
  });

  it('handles single run gracefully', () => {
    const runs = [makeRun({ finalScore: 150 })];
    const result = computeScoreDistribution(runs);
    expect(result.median).toBe(150);
    expect(result.mean).toBe(150);
    expect(result.min).toBe(150);
    expect(result.max).toBe(150);
    expect(result.stdDev).toBe(0);
  });

  it('handles two runs', () => {
    const runs = [
      makeRun({ finalScore: 100 }),
      makeRun({ finalScore: 200 }),
    ];
    const result = computeScoreDistribution(runs);
    expect(result.median).toBe(150);
    expect(result.mean).toBe(150);
    expect(result.min).toBe(100);
    expect(result.max).toBe(200);
  });

  it('handles empty runs', () => {
    const result = computeScoreDistribution([]);
    expect(result.median).toBeNaN();
    expect(result.mean).toBeNaN();
    expect(result.min).toBeNaN();
    expect(result.max).toBeNaN();
  });
});

// ========================================================================
// G3: Economy Health
// ========================================================================
describe('computeEconomyHealth (G3)', () => {
  it('computes avg coins/turn and bankruptcy rate', () => {
    const runs = [
      makeRun({
        finalCoins: 30, turns: 15,
        economyHistory: [
          { turn: 1, coins: 12, reputation: 0, score: 0 },
          { turn: 8, coins: 8, reputation: 5, score: 75 },
        ],
      }),
      makeRun({
        finalCoins: 45, turns: 18, result: 'loss', endReason: 'bankruptcy',
        economyHistory: [
          { turn: 1, coins: 8, reputation: 0, score: 0 },
        ],
      }),
    ];
    const result = computeEconomyHealth(runs);
    expect(result).not.toBeNull();
    if (result) {
      // totalCoinsSum/totalTurnsSum = 75/33 ≈ 2.2727
      expect(result.avgCoinsPerTurn).toBeCloseTo(2.273, 2);
      expect(result.bankruptcyRate).toBe(0.5);
      expect(result.economyTightnessIndex).toBeGreaterThan(0);
    }
  });

  it('returns null when economyHistory absent', () => {
    const runs = [makeRun({})];
    const result = computeEconomyHealth(runs);
    expect(result).toBeNull();
  });

  it('handles empty runs', () => {
    const result = computeEconomyHealth([]);
    expect(result).toBeNull();
  });
});

// ========================================================================
// G4: Synergy Diversity
// ========================================================================
describe('computeSynergyDiversity (G4)', () => {
  it('computes HHI from synergy types in final grids', () => {
    const runs = [
      makeRun({ finalGrid: ['biz-bakery', 'biz-cafe', 'biz-hardware'] }),
      makeRun({ finalGrid: ['biz-bookshop', 'biz-gallery'] }),
    ];
    // Mock synergyTypeMap lookup
    const synergyTypeMap: Record<string, string> = {
      'biz-bakery': 'Food',
      'biz-cafe': 'Food',
      'biz-hardware': 'Commerce',
      'biz-bookshop': 'Culture',
      'biz-gallery': 'Entertainment',
    };
    const result = computeSynergyDiversity(runs, synergyTypeMap);
    expect(result).not.toBeNull();
    if (result) {
      // Shares: Food=2/5, Commerce=1/5, Culture=1/5, Entertainment=1/5
      // HHI = 0.4^2 + 0.2^2 + 0.2^2 + 0.2^2 = 0.16 + 0.04 + 0.04 + 0.04 = 0.28 => 2800
      expect(result.hhi).toBeCloseTo(2800, 0);
      expect(result.synergyTypeShares.Food).toBeCloseTo(0.4, 1);
    }
  });

  it('returns null when finalGrid absent', () => {
    const runs = [makeRun({})];
    const result = computeSynergyDiversity(runs, {});
    expect(result).toBeNull();
  });

  it('handles empty runs', () => {
    const result = computeSynergyDiversity([], {});
    expect(result).toBeNull();
  });
});

// ========================================================================
// G5: Loss Mode Decomposition
// ========================================================================
describe('computeLossModeDecomposition (G5)', () => {
  it('computes shares from loss reasons', () => {
    const runs = [
      makeRun({ result: 'loss', endReason: 'bankruptcy' }),
      makeRun({ result: 'loss', endReason: 'bankruptcy' }),
      makeRun({ result: 'loss', endReason: 'reputation_collapse' }),
      makeRun({ result: 'loss', endReason: 'turn_exhaustion' }),
      makeRun({ result: 'win', endReason: 'score_threshold' }),
    ];
    const result = computeLossModeDecomposition(runs);
    // 4 losses: bankruptcy=2, reputation=1, timeout=1
    expect(result.totalLosses).toBe(4);
    expect(result.shares.bankruptcy).toBe(0.5);
    expect(result.shares.reputation_collapse).toBe(0.25);
    expect(result.shares.turn_exhaustion).toBe(0.25);
  });

  it('handles all wins (no losses)', () => {
    const runs = [makeRun({ result: 'win' })];
    const result = computeLossModeDecomposition(runs);
    expect(result.totalLosses).toBe(0);
    expect(Object.values(result.shares).every(v => v === 0)).toBe(true);
  });

  it('handles empty runs', () => {
    const result = computeLossModeDecomposition([]);
    expect(result.totalLosses).toBe(0);
  });
});

// ========================================================================
// G6: Card Usage Diversity
// ========================================================================
describe('computeCardUsageDiversity (G6)', () => {
  it('computes Gini coefficient from card appearance frequencies', () => {
    const runs = [
      makeRun({ result: 'win', finalGrid: ['biz-a', 'biz-b'] }),
      makeRun({ result: 'win', finalGrid: ['biz-a', 'biz-c'] }),
      makeRun({ result: 'win', finalGrid: ['biz-b', 'biz-d'] }),
      makeRun({ result: 'loss', finalGrid: ['biz-a'] }),
    ];
    const result = computeCardUsageDiversity(runs);
    expect(result).not.toBeNull();
    if (result) {
      // Won runs: 3, appearances: biz-a=2, biz-b=2, biz-c=1, biz-d=1
      // Total appearances = 6
      // Shares: biz-a=2/6, biz-b=2/6, biz-c=1/6, biz-d=1/6
      // Gini should be > 0 (not perfectly equal)
      expect(result.value).toBeGreaterThan(0);
      expect(result.value).toBeLessThan(1);
      expect(result.wonRuns).toBe(3);
    }
  });

  it('returns null when finalGrid absent', () => {
    const runs = [makeRun({ result: 'win' })];
    const result = computeCardUsageDiversity(runs);
    expect(result).toBeNull();
  });

  it('handles empty runs', () => {
    const result = computeCardUsageDiversity([]);
    expect(result).toBeNull();
  });

  it('handles no won runs', () => {
    const runs = [
      makeRun({ result: 'loss', finalGrid: ['biz-a'] }),
    ];
    const result = computeCardUsageDiversity(runs);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBe(0);
      expect(result.wonRuns).toBe(0);
    }
  });
});

// ========================================================================
// G7: Turn-by-Turn Snapshots
// ========================================================================
describe('computeTurnByTurnSnapshots (G7)', () => {
  it('computes average economy trajectory across runs', () => {
    const runs = [
      makeRun({
        economyHistory: [
          { turn: 1, coins: 12, reputation: 0, score: 0 },
          { turn: 5, coins: 8, reputation: 2, score: 30 },
        ],
      }),
      makeRun({
        economyHistory: [
          { turn: 1, coins: 8, reputation: 0, score: 0 },
          { turn: 5, coins: 10, reputation: 3, score: 35 },
        ],
      }),
    ];
    const result = computeTurnByTurnSnapshots(runs);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.averages.length).toBeGreaterThan(0);
      // Turn 1: avg coins = (12+8)/2 = 10
      expect(result.averages[0].turn).toBe(1);
      expect(result.averages[0].avgCoins).toBe(10);
      expect(result.averages[0].avgReputation).toBe(0);
      // Turn 5: avg coins = (8+10)/2 = 9
      const turn5 = result.averages.find(t => t.turn === 5);
      expect(turn5).toBeDefined();
      expect(turn5?.avgCoins).toBe(9);
      expect(turn5?.avgReputation).toBe(2.5);
    }
  });

  it('returns null when economyHistory absent', () => {
    const runs = [makeRun({})];
    const result = computeTurnByTurnSnapshots(runs);
    expect(result).toBeNull();
  });

  it('handles empty runs', () => {
    const result = computeTurnByTurnSnapshots([]);
    expect(result).toBeNull();
  });
});

// ========================================================================
// G8: Trap Card Prevalence
// ========================================================================
describe('computeTrapCardPrevalence (G8)', () => {
  it('counts cards with winRateDelta < -10% AND pickRate > 20%', () => {
    const cardMetrics: Array<{ cardId: string; winRateDelta: number | null; pickRate: number | null }> = [
      { cardId: 'biz-trap1', winRateDelta: -0.15, pickRate: 0.30 },
      { cardId: 'biz-trap2', winRateDelta: -0.12, pickRate: 0.25 },
      { cardId: 'biz-good', winRateDelta: 0.05, pickRate: 0.50 },
      { cardId: 'biz-niche', winRateDelta: -0.15, pickRate: 0.10 },
    ];
    const result = computeTrapCardPrevalence(cardMetrics);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.trapCardCount).toBe(2);
      expect(result.trapCardIds).toEqual(['biz-trap1', 'biz-trap2']);
      expect(result.trapCardImpact).toBeCloseTo(-0.135, 3);
    }
  });

  it('returns null when any card metric is null', () => {
    const cardMetrics: Array<{ cardId: string; winRateDelta: number | null; pickRate: number | null }> = [
      { cardId: 'biz-unknown', winRateDelta: null, pickRate: 0.30 },
    ];
    const result = computeTrapCardPrevalence(cardMetrics);
    expect(result).toBeNull();
  });

  it('returns zero traps when all metrics healthy', () => {
    const cardMetrics: Array<{ cardId: string; winRateDelta: number | null; pickRate: number | null }> = [
      { cardId: 'biz-a', winRateDelta: 0.10, pickRate: 0.40 },
      { cardId: 'biz-b', winRateDelta: -0.05, pickRate: 0.20 },
    ];
    const result = computeTrapCardPrevalence(cardMetrics);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.trapCardCount).toBe(0);
    }
  });

  it('handles empty card metrics', () => {
    const result = computeTrapCardPrevalence([]);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.trapCardCount).toBe(0);
    }
  });
});
