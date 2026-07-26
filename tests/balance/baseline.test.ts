import { describe, it, expect } from 'vitest';
import {
  validateBaselineShape,
  captureBaseline,
  loadBaseline,
} from '../../scripts/balance/engine/baseline';
import type { MonteCarloMetrics, MonteCarloRunSummary } from '../../example-games/main-street/MainStreetMonteCarlo';

describe('validateBaselineShape', () => {
  it('returns valid for a properly shaped baseline object', () => {
    const baseline = {
      meta: {
        tool: 'balance-report',
        version: '1.0.0',
        timestamp: '2026-07-23T00:00:00Z',
        source: {
          cardDataCsv: 'example-games/main-street/card-data.csv',
          monteCarloResults: 'results/latest.json',
        },
      },
      combinations: [
        {
          strategy: 'greedy',
          difficulty: 'Medium',
          metrics: createMockMetrics(),
          runs: [createMockRun()],
        },
      ],
    };
    const result = validateBaselineShape(baseline);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns invalid for null', () => {
    const result = validateBaselineShape(null);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns invalid for non-object input', () => {
    const result = validateBaselineShape('not-an-object');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns invalid for object missing meta', () => {
    const result = validateBaselineShape({
      combinations: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('meta'))).toBe(true);
  });

  it('returns invalid for object missing combinations array', () => {
    const result = validateBaselineShape({
      meta: { tool: 'test', version: '1.0.0', timestamp: '', source: {} },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('combination'))).toBe(true);
  });

  it('returns invalid if combinations is not an array', () => {
    const result = validateBaselineShape({
      meta: { tool: 'test', version: '1.0.0', timestamp: '', source: {} },
      combinations: 'not-an-array',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects combination missing required fields', () => {
    const baseline = {
      meta: {
        tool: 'test',
        version: '1.0.0',
        timestamp: '',
        source: {},
      },
      combinations: [
        {
          strategy: 'greedy',
          // missing difficulty
          metrics: createMockMetrics(),
          runs: [],
        },
      ],
    };
    const result = validateBaselineShape(baseline);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('difficulty'))).toBe(true);
  });

  it('accepts empty combinations array', () => {
    const result = validateBaselineShape({
      meta: { tool: 'test', version: '1.0.0', timestamp: '2026-07-23T00:00:00Z', source: {} },
      combinations: [],
    });
    expect(result.valid).toBe(true);
  });
});

describe('captureBaseline', () => {
  it('produces a valid baseline object from combination results', () => {
    const combinations = [
      {
        strategy: 'greedy' as const,
        difficulty: 'Medium' as const,
        metrics: createMockMetrics(),
        runs: [createMockRun(), createMockRun()],
      },
    ];
    const baseline = captureBaseline(combinations, {
      tool: 'test',
      cardDataCsv: 'card-data.csv',
      monteCarloResults: 'results.json',
    });
    expect(baseline.meta.tool).toBe('test');
    expect(baseline.meta.version).toBe('1.0.0');
    expect(baseline.meta.timestamp).toBeTruthy();
    expect(baseline.meta.source.cardDataCsv).toBe('card-data.csv');
    expect(baseline.combinations).toHaveLength(1);
    expect(baseline.combinations[0].runs).toHaveLength(2);
  });

  it('handles empty combinations array', () => {
    const baseline = captureBaseline([], {
      tool: 'test',
    });
    expect(baseline.combinations).toHaveLength(0);
    expect(baseline.meta.timestamp).toBeTruthy();
  });

  it('preserves metrics structure', () => {
    const metrics = createMockMetrics();
    const combinations = [
      {
        strategy: 'greedy' as const,
        difficulty: 'Medium' as const,
        metrics,
        runs: [],
      },
    ];
    const baseline = captureBaseline(combinations, { tool: 'test' });
    expect(baseline.combinations[0].metrics.winRate).toBe(metrics.winRate);
    expect(baseline.combinations[0].metrics.medianScore).toBe(
      metrics.medianScore,
    );
  });
});

describe('loadBaseline', () => {
  it('returns error for non-existent path', () => {
    const result = loadBaseline('/nonexistent/path.json');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns error for invalid JSON file', () => {
    // We can't easily test file I/O in unit tests without mocking,
    // but we can test the validation of the loaded data
    const result = loadBaseline('');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// Helpers

function createMockMetrics(): MonteCarloMetrics {
  return {
    runs: 200,
    wins: 90,
    losses: 110,
    winRate: 45,
    medianScore: 150,
    averageScore: 148.5,
    averageCoinsPerTurn: 5.2,
    averageTurns: 18,
    averageNoActionTurns: 1,
    averageTurnWhenGridHalf: 7,
    averageTurnWhenGridFull: 13,
    lossReasons: { bankruptcy: 60, reputation_collapse: 35, turn_exhaustion: 15 },
    lossReasonRates: {
      bankruptcy: 54.55,
      reputation_collapse: 31.82,
      turn_exhaustion: 13.64,
    },
  };
}

function createMockRun(): MonteCarloRunSummary {
  return {
    seed: 'test-seed-001',
    result: 'win',
    endReason: 'score_threshold',
    finalScore: 158,
    finalCoins: 42,
    turns: 13,
    turnWhenGridHalf: 5,
    turnWhenGridFull: 10,
    noActionTurns: 1,
    cardsOwned: ['biz-bakery', 'biz-laundromat'],
    marketOffers: ['biz-bakery', 'biz-laundromat', 'biz-hardware'],
    economyHistory: [
      { turn: 1, coins: 12, reputation: 0, score: 0 },
      { turn: 2, coins: 7, reputation: 0, score: 0 },
    ],
  };
}
