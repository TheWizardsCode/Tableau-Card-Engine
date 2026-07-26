import { describe, it, expect } from 'vitest';
import {
  GUARDRAIL_DEFINITIONS,
  evaluateGuardrails,
  type GuardrailResult,
} from '../../scripts/balance/guards/thresholds';

describe('GUARDRAIL_DEFINITIONS', () => {
  it('contains guardrail definitions from PRD §3.3', () => {
    expect(GUARDRAIL_DEFINITIONS.length).toBeGreaterThan(0);
  });

  it('has the winRate_greedy_medium guardrail', () => {
    const g = GUARDRAIL_DEFINITIONS.find(
      (d) => d.id === 'winRate_greedy_medium',
    );
    expect(g).toBeDefined();
    expect(g?.range).toEqual([30, 60]);
    expect(g?.severity).toBe('critical');
  });

  it('has all required severity levels', () => {
    const severities = new Set(
      GUARDRAIL_DEFINITIONS.map((d) => d.severity),
    );
    expect(severities.has('critical')).toBe(true);
    expect(severities.has('warning')).toBe(true);
    expect(severities.has('info')).toBe(true);
  });

  it('each definition has required fields', () => {
    for (const d of GUARDRAIL_DEFINITIONS) {
      expect(d.id).toBeTruthy();
      expect(typeof d.id).toBe('string');
      expect(d.description).toBeTruthy();
      expect(typeof d.description).toBe('string');
      expect(Array.isArray(d.range)).toBe(true);
      expect(d.range.length).toBe(2);
      expect(d.range[0]).toBeLessThanOrEqual(d.range[1]);
      expect(['critical', 'warning', 'info']).toContain(d.severity);
    }
  });

  it('defines guardrails from PRD §3.3 table', () => {
    const ids = GUARDRAIL_DEFINITIONS.map((d) => d.id);
    expect(ids).toContain('winRate_greedy_medium');
    expect(ids).toContain('winRate_greedy_easy');
    expect(ids).toContain('winRate_greedy_hard');
    expect(ids).toContain('winRate_random_medium');
    expect(ids).toContain('medianScore_greedy_medium');
    expect(ids).toContain('avgTurns_greedy_medium');
    expect(ids).toContain('bankruptcyRate_greedy_medium');
    expect(ids).toContain('reputationCollapseRate_greedy_medium');
    expect(ids).toContain('timeoutRate_greedy_medium');
    expect(ids).toContain('giniCoefficient_greedy_medium');
  });
});

describe('evaluateGuardrails', () => {
  it('returns all-pass when all values are within range', () => {
    const values: Record<string, number> = {
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
    const result = evaluateGuardrails(values);
    expect(result.passed).toBe(10);
    expect(result.flagged).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.overall).toBe('pass');
    for (const g of result.results) {
      expect(g.status).toBe('pass');
    }
  });

  it('flags warning-level breaches', () => {
    const values: Record<string, number> = {
      winRate_greedy_medium: 45,
      winRate_greedy_easy: 90, // Outside 60-85 (warning)
      winRate_greedy_hard: 28,
      winRate_random_medium: 12,
      medianScore_greedy_medium: 150,
      avgTurns_greedy_medium: 18,
      bankruptcyRate_greedy_medium: 55,
      reputationCollapseRate_greedy_medium: 30,
      timeoutRate_greedy_medium: 10,
      giniCoefficient_greedy_medium: 0.45,
    };
    const result = evaluateGuardrails(values);
    expect(result.flagged).toBeGreaterThanOrEqual(1);
    expect(result.overall).toBe('flag');
    const flagged = result.results.find(
      (g) => g.def.id === 'winRate_greedy_easy',
    );
    expect(flagged?.status).toBe('flag');
  });

  it('fails on critical breaches', () => {
    const values: Record<string, number> = {
      winRate_greedy_medium: 65, // Outside 30-60 (critical)
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
    const result = evaluateGuardrails(values);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.overall).toBe('fail');
    const failed = result.results.find(
      (g) => g.def.id === 'winRate_greedy_medium',
    );
    expect(failed?.status).toBe('fail');
  });

  it('handles mixed pass/flag/fail results', () => {
    const values: Record<string, number> = {
      winRate_greedy_medium: 65, // Critical fail (> 60)
      winRate_greedy_easy: 90, // Warning flag (> 85)
      winRate_greedy_hard: 28,
      winRate_random_medium: 12,
      medianScore_greedy_medium: 150,
      avgTurns_greedy_medium: 18,
      bankruptcyRate_greedy_medium: 55,
      reputationCollapseRate_greedy_medium: 30,
      timeoutRate_greedy_medium: 10,
      giniCoefficient_greedy_medium: 0.45,
    };
    const result = evaluateGuardrails(values);
    expect(result.passed).toBeGreaterThanOrEqual(7);
    expect(result.flagged).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.overall).toBe('fail'); // Overall is fail if any critical fails
  });

  it('handles missing metrics gracefully', () => {
    const values: Record<string, number> = {
      winRate_greedy_medium: 45,
    };
    const result = evaluateGuardrails(values);
    // Only the provided metric should be evaluated
    expect(result.total).toBe(10);
    expect(result.passed).toBe(1);
    expect(result.flagged).toBe(0);
    expect(result.failed).toBe(0);
    // Missing metrics should have status 'unknown'
    const unknown = result.results.find(
      (g) => g.id === 'winRate_greedy_easy',
    );
    expect(unknown?.status).toBe('unknown');
  });

  it('evaluates boundary values correctly', () => {
    // Range is [30, 60] for winRate_greedy_medium
    const atLower = evaluateGuardrails({ winRate_greedy_medium: 30 });
    const atUpper = evaluateGuardrails({ winRate_greedy_medium: 60 });
    const below = evaluateGuardrails({ winRate_greedy_medium: 29 });
    const above = evaluateGuardrails({ winRate_greedy_medium: 61 });

    expect(
      atLower.results.find((g) => g.id === 'winRate_greedy_medium')?.status,
    ).toBe('pass');
    expect(
      atUpper.results.find((g) => g.id === 'winRate_greedy_medium')?.status,
    ).toBe('pass');
    expect(
      below.results.find((g) => g.id === 'winRate_greedy_medium')?.status,
    ).toBe('fail');
    expect(
      above.results.find((g) => g.id === 'winRate_greedy_medium')?.status,
    ).toBe('fail');
  });

  it('uses custom guardrail overrides when provided', () => {
    // Override makes winRate_greedy_medium a warning with a wider range
    const overrides = [
      {
        id: 'winRate_greedy_medium',
        description: 'Override for testing',
        range: [20, 50],
        severity: 'warning' as const,
      },
    ];
    // 65 was a critical fail under default [30,60]; with override it's a warning flag
    const values = { winRate_greedy_medium: 65 };
    const result = evaluateGuardrails(values, overrides);
    const g = result.results.find(
      (r) => r.id === 'winRate_greedy_medium',
    );
    expect(g?.status).toBe('flag'); // Warning breach
    expect(g?.def.severity).toBe('warning');
  });

  it('returns empty results for empty values', () => {
    const result = evaluateGuardrails({});
    expect(result.total).toBe(10);
    expect(result.passed).toBe(0);
    expect(result.flagged).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.overall).toBe('pass');
    for (const g of result.results) {
      expect(g.status).toBe('unknown');
    }
  });

  it('reports actual value and delta in result', () => {
    const values = { winRate_greedy_medium: 45 };
    const result = evaluateGuardrails(values);
    const g = result.results.find(
      (r) => r.id === 'winRate_greedy_medium',
    );
    expect(g?.value).toBe(45);
    expect(g?.delta).toBeDefined();
    // 45 is within [30, 60], so delta to nearest boundary is 0
    expect(g!.delta).toBe(0);
  });

  it('computes correct delta for out-of-range values', () => {
    const values = { winRate_greedy_medium: 20 };
    const result = evaluateGuardrails(values);
    const g = result.results.find(
      (r) => r.id === 'winRate_greedy_medium',
    );
    // 20 is below lower bound 30, so delta = 30 - 20 = 10
    expect(g?.delta).toBe(10);
  });

  it('computes correct delta for above-range values', () => {
    const values = { winRate_greedy_medium: 70 };
    const result = evaluateGuardrails(values);
    const g = result.results.find(
      (r) => r.id === 'winRate_greedy_medium',
    );
    // 70 is above upper bound 60, so delta = 70 - 60 = 10
    expect(g?.delta).toBe(10);
  });
});

describe('GuardrailResult type structure', () => {
  it('has all required fields in each result', () => {
    const result = evaluateGuardrails({ winRate_greedy_medium: 45 });
    const g = result.results[0];
    expect(g).toHaveProperty('id');
    expect(g).toHaveProperty('description');
    expect(g).toHaveProperty('value');
    expect(g).toHaveProperty('status');
    expect(g).toHaveProperty('delta');
    expect(g).toHaveProperty('def');
    expect(g.def).toHaveProperty('id');
    expect(g.def).toHaveProperty('range');
    expect(g.def).toHaveProperty('severity');
  });
});
