import { describe, it, expect } from 'vitest';
import {
  captureBaseline,
  loadBaseline,
  validateBaseline,
} from '../../scripts/balance/engine/baseline';
import type { MonteCarloMetrics, MonteCarloRunSummary } from '../../example-games/main-street/MainStreetMonteCarlo';

describe('validateBaseline', () => {
  it('accepts well-formed baseline object', () => {
    const baseline = {
      tag: 'test-baseline',
      timestamp: '2026-07-25T00:00:00Z',
      strategy: 'greedy' as const,
      difficulty: 'medium' as const,
      metrics: {
        runs: 200,
        wins: 90,
        losses: 110,
        winRate: 0.45,
        medianScore: 150,
        averageScore: 148,
        averageCoinsPerTurn: 6.5,
        averageTurns: 18,
        averageNoActionTurns: 1.2,
        averageTurnWhenGridHalf: 7.5,
        averageTurnWhenGridFull: 13.2,
        lossReasons: { bankruptcy: 60, reputation_collapse: 35, turn_exhaustion: 15 },
        lossReasonRates: { bankruptcy: 0.545, reputation_collapse: 0.318, turn_exhaustion: 0.136 },
      } satisfies MonteCarloMetrics,
      runs: [] as MonteCarloRunSummary[],
    };
    expect(validateBaseline(baseline)).toBe(true);
  });

  it('rejects object missing required fields', () => {
    expect(validateBaseline({})).toBe(false);
    expect(validateBaseline({ tag: 'test' })).toBe(false);
  });

  it('rejects null/undefined', () => {
    expect(validateBaseline(null)).toBe(false);
    expect(validateBaseline(undefined)).toBe(false);
  });

  it('rejects non-object types', () => {
    expect(validateBaseline('string')).toBe(false);
    expect(validateBaseline(42)).toBe(false);
    expect(validateBaseline([])).toBe(false);
  });

  it('rejects baseline with invalid metric types', () => {
    const baseline = {
      tag: 'test',
      timestamp: '2026-07-25T00:00:00Z',
      strategy: 'greedy',
      difficulty: 'medium',
      metrics: {
        runs: 'not-a-number', // invalid
      },
      runs: [],
    };
    expect(validateBaseline(baseline)).toBe(false);
  });
});

describe('captureBaseline', () => {
  it('returns a baseline object with correct shape', () => {
    const metrics: MonteCarloMetrics = {
      runs: 200,
      wins: 90,
      losses: 110,
      winRate: 0.45,
      medianScore: 150,
      averageScore: 148,
      averageCoinsPerTurn: 6.5,
      averageTurns: 18,
      averageNoActionTurns: 1.2,
      averageTurnWhenGridHalf: 7.5,
      averageTurnWhenGridFull: 13.2,
      lossReasons: { bankruptcy: 60 },
      lossReasonRates: { bankruptcy: 0.545 },
    };
    const runs: MonteCarloRunSummary[] = [
      {
        seed: 'test-001', result: 'win', endReason: 'score_threshold',
        finalScore: 158, finalCoins: 42, turns: 13,
        turnWhenGridHalf: 5, turnWhenGridFull: 10, noActionTurns: 1,
      },
    ];

    const baseline = captureBaseline(metrics, runs, {
      tag: 'v1',
      strategy: 'greedy',
      difficulty: 'medium',
    });

    expect(baseline.tag).toBe('v1');
    expect(baseline.strategy).toBe('greedy');
    expect(baseline.difficulty).toBe('medium');
    expect(baseline.metrics.winRate).toBe(0.45);
    expect(baseline.runs).toHaveLength(1);
    expect(baseline.timestamp).toBeDefined();
    expect(validateBaseline(baseline)).toBe(true);
  });

  it('auto-generates tag when not provided', () => {
    const metrics: MonteCarloMetrics = {
      runs: 100, wins: 50, losses: 50, winRate: 0.5,
      medianScore: 140, averageScore: 138, averageCoinsPerTurn: 5,
      averageTurns: 16, averageNoActionTurns: 1,
      averageTurnWhenGridHalf: 7, averageTurnWhenGridFull: 12,
      lossReasons: {}, lossReasonRates: {},
    };

    const baseline = captureBaseline(metrics, [], {
      strategy: 'random',
      difficulty: 'hard',
    });

    expect(baseline.tag).toMatch(/^baseline-/);
    expect(baseline.strategy).toBe('random');
    expect(baseline.difficulty).toBe('hard');
  });

  it('includes extended MonteCarloRunSummary fields if present', () => {
    const metrics: MonteCarloMetrics = {
      runs: 1, wins: 1, losses: 0, winRate: 1,
      medianScore: 150, averageScore: 150, averageCoinsPerTurn: 5,
      averageTurns: 15, averageNoActionTurns: 0,
      averageTurnWhenGridHalf: null, averageTurnWhenGridFull: null,
      lossReasons: {}, lossReasonRates: {},
    };
    // Extended run with Phase 1 fields
    const extendedRun = {
      seed: 'ext-001',
      result: 'win' as const,
      endReason: 'score_threshold',
      finalScore: 150,
      finalCoins: 30,
      turns: 15,
      turnWhenGridHalf: null,
      turnWhenGridFull: null,
      noActionTurns: 0,
      cardsOwned: ['biz-bakery', 'biz-laundromat'],
      marketOffers: ['biz-bakery', 'biz-laundromat', 'biz-hardware'],
      economyHistory: [
        { turn: 1, coins: 12, reputation: 0, score: 0 },
        { turn: 5, coins: 8, reputation: 2, score: 30 },
      ],
    };

    const baseline = captureBaseline(metrics, [extendedRun], {
      strategy: 'greedy',
      difficulty: 'medium',
    });

    expect((baseline.runs[0] as any).cardsOwned).toBeDefined();
    expect((baseline.runs[0] as any).cardsOwned).toContain('biz-bakery');
    expect((baseline.runs[0] as any).economyHistory).toHaveLength(2);
  });
});

describe('loadBaseline', () => {
  it('parses and validates a valid JSON baseline string', () => {
    const json = JSON.stringify({
      tag: 'test',
      timestamp: '2026-07-25T00:00:00Z',
      strategy: 'greedy',
      difficulty: 'medium',
      metrics: {
        runs: 200, wins: 90, losses: 110, winRate: 0.45,
        medianScore: 150, averageScore: 148, averageCoinsPerTurn: 6.5,
        averageTurns: 18, averageNoActionTurns: 1.2,
        averageTurnWhenGridHalf: 7.5, averageTurnWhenGridFull: 13.2,
        lossReasons: {}, lossReasonRates: {},
      },
      runs: [],
    });

    const result = loadBaseline(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.baseline.tag).toBe('test');
      expect(result.baseline.metrics.winRate).toBe(0.45);
    }
  });

  it('returns error for invalid JSON', () => {
    const result = loadBaseline('not valid json');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('parse');
    }
  });

  it('returns error for invalid baseline shape', () => {
    const result = loadBaseline(JSON.stringify({ invalid: true }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('validation');
    }
  });
});
