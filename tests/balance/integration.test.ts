/**
 * Integration tests for the balance analysis library.
 *
 * Exercises the full pipeline: statistics → card metrics + global metrics → comparison.
 * Uses synthetic data matching the MonteCarloRunSummary shape from Phase 1.
 */
import { describe, it, expect } from 'vitest';
import type { MonteCarloRunSummary } from '../../example-games/main-street/MainStreetMonteCarlo';

import { median, iqr, gini, hhi, confidenceInterval } from '../../scripts/balance/engine/statistics';
import {
  computePickRate,
  computeWinRateDelta,
  computeCostToIncomeRatio,
  computeEventImpactScore,
  type CardTemplate,
} from '../../scripts/balance/engine/card-metrics';
import {
  computeWinRateByStrategy,
  computeScoreDistribution,
  computeLossModeDecomposition,
  computeCardUsageDiversity,
  computeTrapCardPrevalence,
  type MetricsInput,
} from '../../scripts/balance/engine/global-metrics';
import { compareMetrics } from '../../scripts/balance/engine/comparison';
import { evaluateGuardrails, GUARDRAIL_DEFINITIONS } from '../../scripts/balance/guards/thresholds';
import { captureBaseline, validateBaselineShape } from '../../scripts/balance/engine/baseline';

// ---------------------------------------------------------------------------
// Shared synthetic data
// ---------------------------------------------------------------------------

function makeRun(overrides: Partial<MonteCarloRunSummary> = {}): MonteCarloRunSummary {
  return {
    seed: 'seed-001',
    result: 'win',
    endReason: 'score_threshold',
    finalScore: 150,
    finalCoins: 30,
    turns: 15,
    turnWhenGridHalf: 7,
    turnWhenGridFull: 12,
    noActionTurns: 0,
    cardsOwned: ['biz-bakery', 'biz-diner', 'biz-cafe'],
    marketOffers: ['biz-bakery', 'biz-diner', 'biz-cafe', 'biz-bookshop'],
    economyHistory: [
      { turn: 1, coins: 10, reputation: 0, score: 0 },
      { turn: 2, coins: 15, reputation: 1, score: 10 },
      { turn: 3, coins: 22, reputation: 2, score: 25 },
    ],
    ...overrides,
  };
}

function makeCard(overrides: Partial<CardTemplate> = {}): CardTemplate {
  return {
    id: 'biz-test',
    name: 'Test Card',
    family: 'business',
    cost: 5,
    baseIncome: 1,
    synergyTypes: ['Food'],
    coinDelta: 0,
    reputationDelta: 0,
    upgradePath: '',
    ...overrides,
  };
}

function makeCombo(overrides: Partial<MetricsInput> & { runs: MonteCarloRunSummary[] }): MetricsInput {
  return {
    strategy: 'greedy',
    difficulty: 'Medium',
    totalGames: 200,
    wins: 100,
    winRate: 0.5,
    medianScore: 150,
    averageScore: 148,
    maxScore: 300,
    minScore: 20,
    lossReasons: { bankruptcy: 50, reputationCollapse: 30, timeout: 20 },
    averageTurns: 18,
    averageNoActionTurns: 1,
    averageTurnWhenGridHalf: 8,
    averageTurnWhenGridFull: 14,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Integration: Statistics → Card Metrics
// ---------------------------------------------------------------------------

describe('Integration: statistics → card metrics', () => {
  it('uses median() indirectly through score distribution for card context', () => {
    const scores = [100, 120, 140, 160, 180];
    const med = median(scores);
    expect(med).toBe(140);
    // IQR: Q3(160) - Q1(120) = 40 (inclusive method)
    const iqrResult = iqr(scores);
    expect(iqrResult.iqr).toBe(40);
    expect(iqrResult.q1).toBeLessThan(iqrResult.q3);
  });

  it('computes cost-to-income ratio using static values', () => {
    const card = makeCard({ cost: 10, baseIncome: 2 });
    const ratio = computeCostToIncomeRatio(card);
    expect(ratio.value).toBe(5);
    // Verify with statistics infrastructure
    expect(ratio.value).toBe(card.cost / card.baseIncome);
  });

  it('uses gini() for measuring card usage concentration in pick rate data', () => {
    // Simulate card pick frequency distribution
    const pickCounts = [80, 60, 40, 20, 5, 3, 2, 1];
    const usageGini = gini(pickCounts);
    expect(usageGini).toBeGreaterThan(0);
    expect(usageGini).toBeLessThan(1);
    // Uneven distribution => Gini > 0.5
    expect(usageGini).toBeGreaterThan(0.5);
  });

  it('computes HHI for synergy diversity alongside card metrics', () => {
    // HHI treats shares as percentages: [0.3, 0.25, 0.2, 0.15, 0.1]
    // => (30^2 + 25^2 + 20^2 + 15^2 + 10^2) = 2250 on 0-10000 scale
    const shares = [0.3, 0.25, 0.2, 0.15, 0.1];
    const synergyHhi = hhi(shares);
    expect(synergyHhi).toBe(2250);
    expect(synergyHhi).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: Statistics → Global Metrics
// ---------------------------------------------------------------------------

describe('Integration: statistics → global metrics', () => {
  it('uses median/iqr in score distribution computation', () => {
    const runs = [100, 200, 300, 400, 500].map((s) => makeRun({ finalScore: s }));
    const dist = computeScoreDistribution(runs);
    expect(dist).not.toBeNull();
    expect(dist!.median).toBe(300);
    expect(dist!.iqr).toBeGreaterThan(0);
    expect(dist!.min).toBe(100);
    expect(dist!.max).toBe(500);
  });

  it('uses gini() in card usage diversity', () => {
    const runs = [
      makeRun({ cardsOwned: ['biz-a', 'biz-b', 'biz-c'], result: 'win' }),
      makeRun({ cardsOwned: ['biz-a', 'biz-a', 'biz-b'], result: 'win' }),
      makeRun({ cardsOwned: ['biz-a', 'biz-d'], result: 'win' }),
    ];
    const diversity = computeCardUsageDiversity(runs);
    expect(diversity).not.toBeNull();
    expect(diversity!.value).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: Full pipeline with comparison
// ---------------------------------------------------------------------------

describe('Integration: full pipeline (card metrics + global metrics → comparison)', () => {
  it('builds comparison report from card and global metrics', () => {
    // Step 1: Compute card-level metrics
    const runs = Array.from({ length: 10 }, (_, i) =>
      makeRun({
        seed: `seed-${i}`,
        result: i < 6 ? 'win' : 'loss',
        cardsOwned: ['biz-bakery', 'biz-diner'],
        marketOffers: ['biz-bakery', 'biz-diner', 'biz-cafe'],
      }),
    );

    const pickRate = computePickRate('biz-bakery', runs);
    expect(pickRate).not.toBeNull();

    // Step 2: Compute global metrics
    const dist = computeScoreDistribution(runs);
    expect(dist).not.toBeNull();

    // Step 3: Build comparison inputs from both
    const comparisonInputs = [
      { id: 'winRate_greedy_medium', baseline: 45, current: (pickRate!.value * 100) },
      { id: 'medianScore_greedy_medium', baseline: 150, current: dist!.median },
    ];

    const report = compareMetrics(comparisonInputs);
    expect(report.meta).toBeDefined();
    expect(report.summary.total).toBe(2);
    expect(report.guardrails).toBeDefined();
  });

  it('guardrail evaluation works end-to-end', () => {
    const metrics = {
      winRate_greedy_medium: 55,
      medianScore_greedy_medium: 160,
      avgTurns_greedy_medium: 18,
    };
    const result = evaluateGuardrails(metrics);
    expect(result.overall).toBe('pass');
    expect(result.passed).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: Baseline module
// ---------------------------------------------------------------------------

describe('Integration: baseline module', () => {
  it('validates and captures a baseline from real data shape', () => {
    const baseline = captureBaseline(
      [{
        strategy: 'greedy',
        difficulty: 'Medium',
        metrics: {
          winRate: 0.5,
          medianScore: 150,
          averageScore: 148,
          maxScore: 300,
          minScore: 20,
          lossReasons: { bankruptcy: 50, reputationCollapse: 30, timeout: 20 },
          averageTurns: 18,
          averageNoActionTurns: 1,
        },
        runs: [makeRun()],
      }],
      { tool: 'test-integration' },
    );
    const validation = validateBaselineShape(baseline);
    expect(validation.valid).toBe(true);
    expect(baseline.meta.tool).toBe('test-integration');
    expect(baseline.combinations).toHaveLength(1);
    expect(baseline.combinations[0].runs).toHaveLength(1);
  });
});
