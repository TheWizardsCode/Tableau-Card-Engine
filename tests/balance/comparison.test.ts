import { describe, it, expect } from 'vitest';
import { compareMetrics } from '../../scripts/balance/engine/comparison';
import type { GuardrailThreshold } from '../../scripts/balance/guards/thresholds';

// ========================================================================
// Comparison Engine
// ========================================================================
describe('compareMetrics', () => {
  it('returns pass for metrics within threshold ranges', () => {
    const current: Record<string, number> = {
      winRate_greedy_medium: 45,
      bankruptcyRate_greedy_medium: 55,
    };
    const baseline: Record<string, number> = {
      winRate_greedy_medium: 42,
      bankruptcyRate_greedy_medium: 52,
    };
    const result = compareMetrics(current, baseline);

    expect(result.meta.currentCount).toBe(2);
    expect(result.meta.baselineCount).toBe(2);
    expect(result.summary.overall).toBe('pass');
    expect(result.summary.passed).toBe(2);
    expect(result.summary.flagged).toBe(0);
    expect(result.summary.failed).toBe(0);
  });

  it('flags metrics with warning severity breaches', () => {
    const current: Record<string, number> = {
      medianScore_greedy_medium: 200, // warning: max is 180
    };
    const baseline: Record<string, number> = {
      medianScore_greedy_medium: 150,
    };
    const result = compareMetrics(current, baseline);

    expect(result.summary.overall).toBe('flag');
    expect(result.summary.flagged).toBe(1);
    expect(result.summary.passed).toBe(0);

    const comp = result.comparisons[0];
    expect(comp.metric).toBe('medianScore_greedy_medium');
    expect(comp.status).toBe('flag');
    expect(comp.delta).toBe(50);
    expect(comp.deltaPct).toBeCloseTo(33.33, 1);
  });

  it('fails metrics with critical severity breaches', () => {
    const current: Record<string, number> = {
      winRate_greedy_medium: 25, // critical: min is 45
    };
    const baseline: Record<string, number> = {
      winRate_greedy_medium: 45,
    };
    const result = compareMetrics(current, baseline);

    expect(result.summary.overall).toBe('fail');
    expect(result.summary.failed).toBe(1);

    const comp = result.comparisons[0];
    expect(comp.metric).toBe('winRate_greedy_medium');
    expect(comp.status).toBe('fail');
  });

  it('produces mixed statuses across multiple metrics', () => {
    const current: Record<string, number> = {
      winRate_greedy_medium: 25,     // fail (critical, min 45)
      winRate_greedy_hard: 10,       // flag (warning, min 15)
      winRate_random_medium: 12,     // pass (warning, min 5, max 20)
    };
    const baseline: Record<string, number> = {
      winRate_greedy_medium: 45,
      winRate_greedy_hard: 22,
      winRate_random_medium: 10,
    };
    const result = compareMetrics(current, baseline);

    expect(result.summary.passed).toBe(1);
    expect(result.summary.flagged).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.summary.overall).toBe('fail');
  });

  it('computed delta and deltaPct correctly', () => {
    const current: Record<string, number> = { score_greedy_medium: 150 };
    const baseline: Record<string, number> = { score_greedy_medium: 100 };
    const result = compareMetrics(current, baseline);

    expect(result.comparisons[0].delta).toBe(50);
    expect(result.comparisons[0].deltaPct).toBe(50);
  });

  it('handles negative delta', () => {
    const current: Record<string, number> = { score_greedy_medium: 80 };
    const baseline: Record<string, number> = { score_greedy_medium: 100 };
    const result = compareMetrics(current, baseline);

    expect(result.comparisons[0].delta).toBe(-20);
    expect(result.comparisons[0].deltaPct).toBe(-20);
  });

  it('handles zero baseline returning ±Infinity deltaPct', () => {
    const current: Record<string, number> = { score_greedy_medium: 50 };
    const baseline: Record<string, number> = { score_greedy_medium: 0 };
    const result = compareMetrics(current, baseline);

    expect(result.comparisons[0].delta).toBe(50);
    expect(result.comparisons[0].deltaPct).toBe(Infinity);
  });

  it('handles zero current and non-zero baseline', () => {
    const current: Record<string, number> = { score_greedy_medium: 0 };
    const baseline: Record<string, number> = { score_greedy_medium: 50 };
    const result = compareMetrics(current, baseline);

    expect(result.comparisons[0].delta).toBe(-50);
    expect(result.comparisons[0].deltaPct).toBe(-100);
  });

  it('handles empty current metrics gracefully', () => {
    const result = compareMetrics({}, { winRate_greedy_medium: 45 });

    expect(result.summary.overall).toBe('pass');
    expect(result.meta.currentCount).toBe(0);
    expect(result.comparisons).toHaveLength(0);
  });

  it('handles empty baseline metrics gracefully', () => {
    const result = compareMetrics({ winRate_greedy_medium: 45 }, {});

    expect(result.summary.overall).toBe('pass');
    expect(result.meta.baselineCount).toBe(0);
    expect(result.comparisons).toHaveLength(0);
  });

  it('handles both empty gracefully', () => {
    const result = compareMetrics({}, {});

    expect(result.summary.overall).toBe('pass');
    expect(result.meta.currentCount).toBe(0);
    expect(result.meta.baselineCount).toBe(0);
    expect(result.comparisons).toHaveLength(0);
  });

  it('supports threshold overrides', () => {
    const overrideThresholds: Record<string, GuardrailThreshold> = {
      customMetric: {
        metric: 'customMetric',
        label: 'Custom Metric',
        min: 10,
        max: 20,
        severity: 'critical',
      },
    };
    const current: Record<string, number> = { customMetric: 5 };
    const baseline: Record<string, number> = { customMetric: 15 };
    const result = compareMetrics(current, baseline, overrideThresholds);

    expect(result.comparisons[0].status).toBe('fail');
    expect(result.summary.failed).toBe(1);
    expect(result.summary.overall).toBe('fail');
  });

  it('reports metrics not in thresholds as pass with informational status', () => {
    const current: Record<string, number> = { unknownMetric: 42 };
    const baseline: Record<string, number> = { unknownMetric: 40 };
    const result = compareMetrics(current, baseline);

    expect(result.comparisons[0].status).toBe('pass');
    expect(result.comparisons[0].severity).toBe('info');
  });

  it('produces valid ISO timestamp in meta', () => {
    const result = compareMetrics({}, {});
    expect(result.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('delta and deltaPct are zero when current equals baseline', () => {
    const current: Record<string, number> = { winRate_greedy_medium: 45 };
    const baseline: Record<string, number> = { winRate_greedy_medium: 45 };
    const result = compareMetrics(current, baseline);

    expect(result.comparisons[0].delta).toBe(0);
    expect(result.comparisons[0].deltaPct).toBe(0);
  });
});
