import { describe, it, expect } from 'vitest';
import {
  compareMetrics,
  type ComparisonInput,
  type ComparisonReport,
  type MetricComparison,
} from '../../scripts/balance/engine/comparison';

// Helper factories
function makeMetric(
  overrides: Partial<MetricComparison['baseline']> & { id: string },
): MetricComparison {
  return {
    id: overrides.id,
    baseline: { value: 100, label: `Baseline ${overrides.id}` },
    current: { value: 110, label: `Current ${overrides.id}` },
    delta: 10,
    deltaPct: 10,
    status: 'pass',
    ...overrides,
  } as MetricComparison;
}

function makeInput(id: string, baselineVal: number, currentVal: number): ComparisonInput {
  return {
    id,
    baseline: baselineVal,
    current: currentVal,
  };
}

// Core comparison
describe('compareMetrics', () => {
  it('returns correct delta and deltaPct for basic comparison', () => {
    const inputs = [makeInput('winRate_greedy_medium', 100, 110)];
    const result = compareMetrics(inputs);
    expect(result.comparisons).toHaveLength(1);
    expect(result.comparisons[0].delta).toBe(10);
    expect(result.comparisons[0].deltaPct).toBe(10);
    expect(result.comparisons[0].id).toBe('winRate_greedy_medium');
  });

  it('handles negative delta (regression)', () => {
    const inputs = [makeInput('winRate_greedy_medium', 100, 80)];
    const result = compareMetrics(inputs);
    expect(result.comparisons[0].delta).toBe(-20);
    expect(result.comparisons[0].deltaPct).toBe(-20);
  });

  it('handles zero delta (no change)', () => {
    // Use a value within guardrail range [30, 60] so status is pass
    const inputs = [makeInput('winRate_greedy_medium', 45, 45)];
    const result = compareMetrics(inputs);
    expect(result.comparisons[0].delta).toBe(0);
    expect(result.comparisons[0].deltaPct).toBe(0);
    expect(result.comparisons[0].status).toBe('pass');
  });

  it('handles zero baseline gracefully (Infinity delta)', () => {
    const inputs = [makeInput('winRate_greedy_medium', 0, 50)];
    const result = compareMetrics(inputs);
    expect(result.comparisons[0].deltaPct).toBe(Infinity);
    expect(result.comparisons[0].note).toContain('zero');
  });

  it('handles negative baseline gracefully', () => {
    const inputs = [makeInput('someMetric', -100, -80)];
    const result = compareMetrics(inputs);
    // deltaPct = (-80 - (-100)) / |-100| * 100 = 20/100 * 100 = 20
    expect(result.comparisons[0].deltaPct).toBe(20);
  });

  it('handles multiple metrics', () => {
    const inputs = [
      makeInput('winRate_greedy_medium', 45, 50),
      makeInput('winRate_random_medium', 15, 10),
      makeInput('medianScore_greedy_medium', 150, 160),
    ];
    const result = compareMetrics(inputs);
    expect(result.comparisons).toHaveLength(3);
    expect(result.summary.total).toBe(3);
  });

  // Guardrail evaluation
  describe('guardrail evaluation integration', () => {
    it('applies default guardrails from thresholds.ts', () => {
      // winRate_greedy_medium range is [30, 60]; value 45 -> pass
      const inputs = [makeInput('winRate_greedy_medium', 45, 45)];
      const result = compareMetrics(inputs);
      const comp = result.comparisons[0];
      expect(comp.status).toBe('pass');
    });

    it('flags warning-level breaches', () => {
      // winRate_random_medium range is [5, 20]; value 25 -> breach
      const inputs = [makeInput('winRate_random_medium', 5, 25)];
      const result = compareMetrics(inputs, []);
      // No custom overrides -> tries default guardrails
      const comp = result.comparisons[0];
      expect(comp.id).toBe('winRate_random_medium');
    });

    it('fails on critical breaches', () => {
      // winRate_greedy_medium is critical, range [30, 60]
      const inputs = [makeInput('winRate_greedy_medium', 35, 25)];
      const result = compareMetrics(inputs);
      const comp = result.comparisons.find((c) => c.id === 'winRate_greedy_medium');
      expect(comp?.status).toBe('fail');
    });
  });

  // Edge cases
  it('returns structured error report for empty inputs', () => {
    const result = compareMetrics([]);
    expect(result.summary.total).toBe(0);
    expect(result.summary.passed).toBe(0);
    expect(result.summary.overall).toBe('pass');
    expect(result.comparisons).toHaveLength(0);
  });

  it('includes meta section in report', () => {
    const inputs = [makeInput('winRate_greedy_medium', 45, 50)];
    const result = compareMetrics(inputs);
    expect(result.meta).toBeDefined();
    expect(result.meta.tool).toBe('balance-comparison');
    expect(result.meta.timestamp).toBeDefined();
    expect(typeof result.meta.timestamp).toBe('string');
  });

  // Report structure
  it('produces output matching PRD §6.5 format', () => {
    const inputs = [
      makeInput('winRate_greedy_medium', 45, 50),
      makeInput('medianScore_greedy_medium', 150, 145),
    ];
    const result = compareMetrics(inputs);
    expect(result.meta).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.comparisons).toBeInstanceOf(Array);
    expect(result.guardrails).toBeDefined();
    // Each comparison has required fields
    for (const comp of result.comparisons) {
      expect(comp.id).toBeDefined();
      expect(comp.baseline).toBeDefined();
      expect(comp.current).toBeDefined();
      expect(comp.delta).toBeDefined();
      expect(typeof comp.deltaPct).toBe('number');
      expect(['pass', 'flag', 'fail', 'unknown']).toContain(comp.status);
    }
  });

  // Threshold overrides
  it('uses custom threshold override function when provided', () => {
    const inputs = [makeInput('winRate_greedy_medium', 50, 55)];
    const customThresholds = [
      { id: 'winRate_greedy_medium', range: [10, 30], severity: 'warning' as const },
    ];
    const result = compareMetrics(inputs, customThresholds);
    const comp = result.comparisons[0];
    // Current is 55, outside [10, 30], warning -> flag
    expect(comp.status).toBe('flag');
  });
});
