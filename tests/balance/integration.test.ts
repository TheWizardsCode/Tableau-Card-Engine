/**
 * Integration tests for the Balance Analysis Library.
 *
 * Exercises cross-component pipelines from raw Monte Carlo data through
 * card metrics, global metrics, and comparison/guardrail evaluation.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import type { MonteCarloRunSummary } from '../../example-games/main-street/MainStreetMonteCarlo';

import { median, iqr, gini, hhi, confidenceInterval } from '../../scripts/balance/engine/statistics';
import { computePickRate, computeWinRateDelta, computeCostToIncomeRatio, computeSurvivalRate } from '../../scripts/balance/engine/card-metrics';
import { computeWinRateByStrategyDifficulty, computeScoreDistribution, computeLossModeDecomposition } from '../../scripts/balance/engine/global-metrics';
import { compareMetrics } from '../../scripts/balance/engine/comparison';
import { captureBaseline, validateBaseline } from '../../scripts/balance/engine/baseline';
import { evaluateGuardrails } from '../../scripts/balance/guards/thresholds';

/**
 * Build a synthetic Phase 1-extended run summary.
 */
function syntheticRun(overrides: Partial<MonteCarloRunSummary> & {
  cardsOwned?: string[];
  marketOffers?: string[];
  finalGrid?: string[];
  economyHistory?: Array<{ turn: number; coins: number; reputation: number; score: number }>;
}): MonteCarloRunSummary {
  const base: MonteCarloRunSummary = {
    seed: overrides.seed ?? 'syn-001',
    result: overrides.result ?? 'win',
    endReason: overrides.endReason ?? 'score_threshold',
    finalScore: overrides.finalScore ?? 150,
    finalCoins: overrides.finalCoins ?? 25,
    turns: overrides.turns ?? 15,
    turnWhenGridHalf: overrides.turnWhenGridHalf ?? null,
    turnWhenGridFull: overrides.turnWhenGridFull ?? null,
    noActionTurns: overrides.noActionTurns ?? 0,
    cardsOwned: overrides.cardsOwned ?? [],
    marketOffers: overrides.marketOffers ?? [],
    economyHistory: overrides.economyHistory ?? [],
  };
  const ext: Record<string, unknown> = {};
  if (overrides.finalGrid) ext.finalGrid = overrides.finalGrid;
  return { ...base, ...ext };
}

// ========================================================================
// Pipeline: Statistics → Global Metrics (G2 Score Distribution)
// ========================================================================
describe('Statistics → Global Metrics (G2)', () => {
  it('uses median() and iqr() for score distribution', () => {
    const scores = [80, 100, 120, 140, 160, 180, 200];
    expect(median(scores)).toBe(140);
    // Exclusive method: lowerHalf=[80,100,120]→Q1=100, upperHalf=[160,180,200]→Q3=180
    expect(iqr(scores).iqr).toBe(80);

    const runs = scores.map(s => syntheticRun({ seed: `s${s}`, finalScore: s }));
    const dist = computeScoreDistribution(runs);
    expect(dist.median).toBe(140);
    expect(dist.iqr).toBe(80);
  });
});

// ========================================================================
// Pipeline: Statistics → Card Metrics (M2 Win-Rate Delta)
// ========================================================================
describe('Statistics → Card Metrics (M2)', () => {
  it('computes winRateDelta using conditional probability', () => {
    const runs = [
      syntheticRun({ seed: 's1', result: 'win', cardsOwned: ['biz-bakery'] }),
      syntheticRun({ seed: 's2', result: 'win', cardsOwned: ['biz-bakery'] }),
      syntheticRun({ seed: 's3', result: 'win', cardsOwned: ['biz-bakery'] }),
      syntheticRun({ seed: 's4', result: 'loss', cardsOwned: ['biz-bakery'] }),
      syntheticRun({ seed: 's5', result: 'win', cardsOwned: [] }),
      syntheticRun({ seed: 's6', result: 'loss', cardsOwned: ['biz-laundromat'] }),
    ];
    const result = computeWinRateDelta('biz-bakery', runs);
    expect(result).not.toBeNull();
    if (result) {
      // Owned: s1-s4 → 3/4 = 0.75
      // Not owned: s5, s6 → 1/2 = 0.5
      // Delta: 0.75 - 0.5 = 0.25
      expect(result.winRateWhenOwned).toBeCloseTo(0.75, 2);
      expect(result.winRateWhenNotOwned).toBeCloseTo(0.5, 2);
      expect(result.value).toBeCloseTo(0.25, 2);
    }
  });

  it('uses gini() for card usage diversity (G6)', () => {
    const frequencies = [5, 5, 1, 1];
    const giniCoeff = gini(frequencies);
    // Perfectly equal: gini=0, so >0 means some skew
    expect(giniCoeff).toBeGreaterThan(0);
    expect(giniCoeff).toBeLessThan(1);
  });
});

// ========================================================================
// Pipeline: Card Metrics + Global Metrics → Comparison
// ========================================================================
describe('Card Metrics + Global Metrics → Comparison', () => {
  it('compares full metric set against baseline', () => {
    const current: Record<string, number> = {
      winRate_greedy_medium: 50,
      medianScore_greedy_medium: 140,
      bankruptcyRate_greedy_medium: 55,
      'pickRate_biz-bakery': 0.6,
      'winRateDelta_biz-bakery': 0.15,
    };
    const baseline: Record<string, number> = {
      winRate_greedy_medium: 45,
      medianScore_greedy_medium: 130,
      bankruptcyRate_greedy_medium: 50,
      'pickRate_biz-bakery': 0.55,
      'winRateDelta_biz-bakery': 0.10,
    };
    const result = compareMetrics(current, baseline);
    expect(result.comparisons).toHaveLength(5);
    expect(result.meta.currentCount).toBe(5);
    expect(result.meta.baselineCount).toBe(5);

    // Verify specific deltas
    const wrComp = result.comparisons.find(c => c.metric === 'winRate_greedy_medium');
    expect(wrComp).toBeDefined();
    expect(wrComp!.delta).toBe(5);
    expect(wrComp!.deltaPct).toBeCloseTo(11.11, 1);
  });
});

// ========================================================================
// Full Pipeline: Synthetic Runs → All Metrics → Baseline → Comparison
// ========================================================================
describe('Full pipeline: runs → metrics → baseline → comparison', () => {
  it('processes synthetic runs through the full balance analysis workflow', () => {
    // 1. Create synthetic runs with Phase 1 data
    const runs = [
      // Three wins with bakery, cafe, hardware grid
      syntheticRun({
        seed: 's1', result: 'win', finalScore: 180, finalCoins: 35, turns: 16,
        cardsOwned: ['biz-bakery', 'biz-cafe', 'biz-hardware'],
        marketOffers: ['biz-bakery', 'biz-cafe', 'biz-hardware', 'biz-laundromat'],
      }),
      syntheticRun({
        seed: 's2', result: 'win', finalScore: 160, finalCoins: 28, turns: 14,
        cardsOwned: ['biz-bakery', 'biz-cafe'],
        marketOffers: ['biz-bakery', 'biz-cafe', 'biz-hardware'],
      }),
      // One loss with only bakery
      syntheticRun({
        seed: 's3', result: 'loss', endReason: 'bankruptcy', finalScore: 80, finalCoins: 5, turns: 10,
        cardsOwned: ['biz-bakery'],
        marketOffers: ['biz-bakery', 'biz-cafe'],
      }),
    ];

    // 2. Compute card-level metrics
    const pickRateBakery = computePickRate('biz-bakery', runs);
    expect(pickRateBakery).not.toBeNull();
    if (pickRateBakery) {
      // bakery appeared in all 3, purchased in all 3 → 100%
      expect(pickRateBakery.value).toBe(1);
      expect(pickRateBakery.appearances).toBe(3);
      expect(pickRateBakery.purchases).toBe(3);
    }

    const winDeltaBakery = computeWinRateDelta('biz-bakery', runs);
    expect(winDeltaBakery).not.toBeNull();
    if (winDeltaBakery) {
      // Owned in all 3 → winRateWhenOwned = 2/3 ≈ 0.667
      // Not owned in 0 → winRateWhenNotOwned = 0
      expect(winDeltaBakery.winRateWhenOwned).toBeCloseTo(0.6667, 3);
      expect(winDeltaBakery.value).toBeCloseTo(0.6667, 3);
    }

    // 3. Compute global metrics
    const winRate = computeWinRateByStrategyDifficulty(runs, {
      strategy: 'greedy', difficulty: 'medium',
    });
    expect(winRate.wins).toBe(2);
    expect(winRate.winRate).toBeCloseTo(0.6667, 3);

    const scoreDist = computeScoreDistribution(runs);
    expect(scoreDist.median).toBe(160);
    expect(scoreDist.mean).toBe(140);
    expect(scoreDist.min).toBe(80);
    expect(scoreDist.max).toBe(180);

    const lossModes = computeLossModeDecomposition(runs);
    expect(lossModes.totalLosses).toBe(1);
    expect(lossModes.shares.bankruptcy).toBe(1);

    // 4. Build current metrics map
    const currentMetrics: Record<string, number> = {
      winRate_greedy_medium: winRate.winRate,
      medianScore_greedy_medium: scoreDist.median,
      avgScore_greedy_medium: scoreDist.mean,
      'pickRate_biz-bakery': pickRateBakery!.value,
      'pickRate_biz-cafe': computePickRate('biz-cafe', runs)!.value,
      'winRateDelta_biz-bakery': winDeltaBakery!.value,
    };

    // 5. Capture baseline
    const metrics = {
      runs: 3, wins: 2, losses: 1, winRate: winRate.winRate,
      medianScore: scoreDist.median, averageScore: scoreDist.mean,
      scoreStdDev: scoreDist.stdDev, winRateByStrategy: {},
      lossReasons: { bankruptcy: 1, reputation_collapse: 0, turn_exhaustion: 0 },
      lossReasonRates: { bankruptcy: 1, reputation_collapse: 0, turn_exhaustion: 0 },
      averageCoinsPerTurn: 0, economyTightnessIndex: 0,
      giniCoefficient: 0,
    };
    const baseline = captureBaseline(metrics as any, runs, {
      strategy: 'greedy', difficulty: 'medium', tag: 'test-v1',
    });
    expect(baseline.tag).toBe('test-v1');
    expect(validateBaseline(baseline)).toBe(true);
    expect(baseline.metrics.wins).toBe(2);
    expect(baseline.metrics.losses).toBe(1);

    // 6. Compare
    const baselineMetrics: Record<string, number> = {
      winRate_greedy_medium: 0.6, // 60% vs current 66.67%
      medianScore_greedy_medium: 150,
      avgScore_greedy_medium: 135,
      'pickRate_biz-bakery': 0.9,
      'pickRate_biz-cafe': 0.8,
      'winRateDelta_biz-bakery': 0.5,
    };
    const comparison = compareMetrics(currentMetrics, baselineMetrics);
    expect(comparison.meta.currentCount).toBe(6);
    expect(comparison.meta.baselineCount).toBe(6);
    expect(comparison.comparisons).toHaveLength(6);

    // 7. Evaluate guardrails on the current metrics
    // Use a fixed value above the revised critical band (45–95) to exercise
    // the critical-severity failure path (CG-0MTC31LN3000UHDY re-baseline).
    const guardResult = evaluateGuardrails({ winRate_greedy_medium: 97 });
    expect(guardResult.perMetric).toHaveLength(1);
    // 97 > 95 → breached; winRate_greedy_medium is critical severity
    if (guardResult.perMetric[0]) {
      expect(guardResult.perMetric[0].breached).toBe(true);
      expect(guardResult.perMetric[0].status).toBe('fail');
    }
  });
});

// ========================================================================
// Edge Case: Phase 1 Data Absent
// ========================================================================
describe('Phase 1 data absent — graceful degradation', () => {
  it('card metrics return null when Phase 1 fields missing', () => {
    // Create a run with Phase 1 fields, then delete them to simulate pre-Phase-1 data
    const runs = [syntheticRun({ seed: 'bare' })];
    delete (runs[0] as any).cardsOwned;
    delete (runs[0] as any).marketOffers;
    expect(computePickRate('biz-bakery', runs)).toBeNull();
    expect(computeWinRateDelta('biz-bakery', runs)).toBeNull();
    expect(computeSurvivalRate('biz-bakery', runs)).toBeNull();
  });

  it('global metrics work without Phase 1 data', () => {
    const runs = [
      syntheticRun({ seed: 's1', result: 'win', finalScore: 150 }),
      syntheticRun({ seed: 's2', result: 'loss', finalScore: 80 }),
    ];
    const wr = computeWinRateByStrategyDifficulty(runs, { strategy: 'greedy', difficulty: 'medium' });
    expect(wr.winRate).toBe(0.5);

    const sd = computeScoreDistribution(runs);
    expect(sd.median).toBe(115);
    expect(sd.mean).toBe(115);

    const lm = computeLossModeDecomposition(runs);
    expect(lm.totalLosses).toBe(1);
  });
});

// ========================================================================
// Edge Case: Comparison with No Matching Metrics
// ========================================================================
describe('Comparison with non-overlapping metric sets', () => {
  it('compares only intersection of current and baseline keys', () => {
    const current: Record<string, number> = {
      winRate_greedy_medium: 50,
      customMetric: 42,
    };
    const baseline: Record<string, number> = {
      winRate_greedy_medium: 45,
      otherMetric: 99,
    };
    const result = compareMetrics(current, baseline);
    expect(result.comparisons).toHaveLength(1); // only winRate_greedy_medium matches
    expect(result.comparisons[0].metric).toBe('winRate_greedy_medium');
  });
});

// ========================================================================
// Static Metrics: HHI and Cost-to-Income
// ========================================================================
describe('Static metrics (HHI, Cost-to-Income)', () => {
  it('computes HHI from synergy type shares', () => {
    const shares = [0.4, 0.3, 0.2, 0.1];
    expect(hhi(shares)).toBeCloseTo(3000, 0); // 1600 + 900 + 400 + 100
  });

  it('computes cost-to-income ratio for various cards', () => {
    // Premium card: expensive, modest income
    expect(computeCostToIncomeRatio({ cost: 8, baseIncome: 2 })).toBe(4);

    // Income card: cheap, good income
    expect(computeCostToIncomeRatio({ cost: 2, baseIncome: 3 })).toBeCloseTo(0.667, 2);

    // Free card (starter)
    expect(computeCostToIncomeRatio({ cost: 0, baseIncome: 1 })).toBe(0);

    // Zero income edge case
    expect(computeCostToIncomeRatio({ cost: 5, baseIncome: 0 })).toBe(Infinity);
  });
});

// ========================================================================
// Confidence intervals with descriptiveStats
// ========================================================================
describe('Statistics: confidence intervals', () => {
  it('computes CI for win rates across runs', () => {
    const runResults = [1, 0, 1, 1, 0, 1, 1, 1, 0, 1]; // 7/10 wins
    const ci = confidenceInterval(runResults, 1.96);
    // mean = 0.7, n=10, stddev ≈ 0.483
    // sem ≈ 0.483/sqrt(10) ≈ 0.153
    // moe ≈ 1.96 * 0.153 ≈ 0.300
    expect(ci.lower).toBeGreaterThan(0.3);
    expect(ci.upper).toBeLessThan(1.1);
    expect(ci.marginOfError).toBeGreaterThan(0.25);
    expect(ci.marginOfError).toBeLessThan(0.35);
  });
});
