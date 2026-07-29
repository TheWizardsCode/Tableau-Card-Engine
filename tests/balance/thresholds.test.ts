import { describe, it, expect } from 'vitest';
import {
  GUARDRAIL_THRESHOLDS,
  evaluateGuardrails,
} from '../../scripts/balance/guards/thresholds';

describe('GUARDRAIL_THRESHOLDS', () => {
  it('defines thresholds for winRate_greedy_medium (critical)', () => {
    const t = GUARDRAIL_THRESHOLDS['winRate_greedy_medium'];
    expect(t).toBeDefined();
    expect(t.metric).toBe('winRate_greedy_medium');
    expect(t.min).toBe(30);
    expect(t.max).toBe(60);
    expect(t.severity).toBe('critical');
  });

  it('defines all required threshold entries from PRD §3.3', () => {
    const expectedMetrics = [
      'winRate_greedy_medium',
      'winRate_greedy_easy',
      'winRate_greedy_hard',
      'winRate_random_medium',
      'medianScore_greedy_medium',
      'avgTurns_greedy_medium',
      'bankruptcyRate_greedy_medium',
      'reputationCollapseRate_greedy_medium',
      'timeoutRate_greedy_medium',
      'giniCoefficient_greedy_medium',
    ];
    for (const metric of expectedMetrics) {
      expect(GUARDRAIL_THRESHOLDS[metric]).toBeDefined();
    }
  });

  it('each threshold has required fields', () => {
    for (const [key, t] of Object.entries(GUARDRAIL_THRESHOLDS)) {
      expect(t.metric).toBe(key);
      expect(typeof t.min).toBe('number');
      expect(typeof t.max).toBe('number');
      expect(['critical', 'warning', 'info']).toContain(t.severity);
    }
  });
});

describe('evaluateGuardrails', () => {
  it('returns all-pass when all metrics within ranges', () => {
    const metrics: Record<string, number> = {
      winRate_greedy_medium: 45,
      winRate_greedy_easy: 72,
      winRate_greedy_hard: 28,
      winRate_random_medium: 12,
      medianScore_greedy_medium: 150,
      avgTurns_greedy_medium: 18,
      bankruptcyRate_greedy_medium: 55,
      reputationCollapseRate_greedy_medium: 30,
      timeoutRate_greedy_medium: 10,
      giniCoefficient_greedy_medium: 0.45,
    };
    const result = evaluateGuardrails(metrics);
    expect(result.passed).toBeGreaterThan(0);
    expect(result.flagged).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.overall).toBe('pass');
  });

  it('flags warning thresholds outside range', () => {
    const metrics: Record<string, number> = {
      winRate_greedy_medium: 45,
      winRate_greedy_easy: 72,
      winRate_greedy_hard: 10, // Below warning range (15-40)
      winRate_random_medium: 12,
      medianScore_greedy_medium: 150,
      avgTurns_greedy_medium: 18,
      bankruptcyRate_greedy_medium: 55,
      reputationCollapseRate_greedy_medium: 30,
      timeoutRate_greedy_medium: 10,
      giniCoefficient_greedy_medium: 0.45,
    };
    const result = evaluateGuardrails(metrics);
    // winRate_greedy_hard is warning severity below 15%
    // That should result in flagged=1 and overall=flag
    expect(result.flagged).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);
    expect(result.overall).toBe('flag');

    // Check the specific flagged metric
    const flaggedMetric = result.perMetric.find(m => m.status === 'flag');
    expect(flaggedMetric).toBeDefined();
    expect(flaggedMetric?.metric).toBe('winRate_greedy_hard');
  });

  it('fails critical thresholds outside range', () => {
    const metrics: Record<string, number> = {
      winRate_greedy_medium: 65, // Above critical range (30-60)
      winRate_greedy_easy: 72,
      winRate_greedy_hard: 28,
      winRate_random_medium: 12,
      medianScore_greedy_medium: 150,
      avgTurns_greedy_medium: 18,
      bankruptcyRate_greedy_medium: 55,
      reputationCollapseRate_greedy_medium: 30,
      timeoutRate_greedy_medium: 10,
      giniCoefficient_greedy_medium: 0.45,
    };
    const result = evaluateGuardrails(metrics);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.overall).toBe('fail');

    const failedMetric = result.perMetric.find(m => m.status === 'fail');
    expect(failedMetric).toBeDefined();
    expect(failedMetric?.metric).toBe('winRate_greedy_medium');
  });

  it('returns empty-safe result for no matching thresholds', () => {
    const result = evaluateGuardrails({ some_unknown_metric: 42 });
    expect(result.passed).toBe(0);
    expect(result.flagged).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.overall).toBe('pass');
    expect(result.perMetric).toEqual([]);
  });

  it('handles mixed pass/flag/fail correctly', () => {
    const metrics: Record<string, number> = {
      winRate_greedy_medium: 65, // FAIL: critical, above 60
      winRate_greedy_easy: 90, // FLAG: warning, above 85
      winRate_greedy_hard: 28,
      winRate_random_medium: 12,
      medianScore_greedy_medium: 150,
      avgTurns_greedy_medium: 18,
      bankruptcyRate_greedy_medium: 55,
      reputationCollapseRate_greedy_medium: 30,
      timeoutRate_greedy_medium: 10,
      giniCoefficient_greedy_medium: 0.45,
    };
    const result = evaluateGuardrails(metrics);
    expect(result.failed).toBe(1);
    expect(result.flagged).toBe(1);
    expect(result.passed).toBeGreaterThan(0);
    // Critical failure takes precedence
    expect(result.overall).toBe('fail');
  });

  it('info thresholds never cause fail', () => {
    // info thresholds, even outside range, should not cause fail
    const metrics: Record<string, number> = {
      winRate_greedy_medium: 45,
      winRate_greedy_easy: 72,
      winRate_greedy_hard: 28,
      winRate_random_medium: 12,
      medianScore_greedy_medium: 150,
      avgTurns_greedy_medium: 30, // Outside info range (14-22), should be noted
      bankruptcyRate_greedy_medium: 55,
      reputationCollapseRate_greedy_medium: 30,
      timeoutRate_greedy_medium: 10,
      giniCoefficient_greedy_medium: 0.45,
    };
    const result = evaluateGuardrails(metrics);
    // avgTurns is info severity — outside range means it's noted but doesn't fail or flag
    const avgTurnsResult = result.perMetric.find(m => m.metric === 'avgTurns_greedy_medium');
    // Info thresholds: outside range = flag, inside = pass
    expect(avgTurnsResult).toBeDefined();
    if (avgTurnsResult) {
      expect(['pass', 'flag']).toContain(avgTurnsResult.status);
    }
  });

  it('returns empty perMetric for empty metrics object', () => {
    const result = evaluateGuardrails({});
    expect(result.perMetric).toEqual([]);
    expect(result.passed).toBe(0);
    expect(result.overall).toBe('pass');
  });
});
