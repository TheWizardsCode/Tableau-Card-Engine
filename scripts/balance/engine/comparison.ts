/**
 * Comparison Engine for Main Street balance analysis.
 *
 * Compares current Monte Carlo metrics against a committed baseline,
 * computes absolute and percentage deltas, evaluates against guardrail
 * thresholds, and produces a structured JSON report conforming to PRD §6.5.
 *
 * @module engine/comparison
 */

import {
  GUARDRAIL_DEFINITIONS,
  evaluateGuardrails,
  type GuardrailDefinition,
} from '../guards/thresholds';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input for a single metric comparison.
 */
export interface ComparisonInput {
  /** Metric ID matching a guardrail definition key. */
  id: string;
  /** Baseline value. */
  baseline: number;
  /** Current value. */
  current: number;
}

/**
 * A single metric comparison result.
 */
export interface MetricComparison {
  /** Metric identifier (matches guardrail definition id). */
  id: string;
  /** Baseline value snapshot. */
  baseline: { value: number; label?: string };
  /** Current value snapshot. */
  current: { value: number; label?: string };
  /** Absolute delta: current - baseline. */
  delta: number;
  /** Percentage delta: (current - baseline) / |baseline| × 100. */
  deltaPct: number;
  /**
   * Evaluation status:
   * - pass: within guardrail range, or info severity
   * - flag: warning-level breach
   * - fail: critical-level breach
   * - unknown: no guardrail defined for this metric
   */
  status: 'pass' | 'flag' | 'fail' | 'unknown';
  /** Human-readable note (e.g., for edge cases like zero baseline). */
  note?: string;
}

/**
 * Summary of the comparison report.
 */
export interface ComparisonSummary {
  /** Number of metrics that passed. */
  passed: number;
  /** Number of metrics that were flagged (warning breach). */
  flagged: number;
  /** Number of metrics that failed (critical breach). */
  failed: number;
  /** Number of metrics with unknown status (no guardrail). */
  unknown: number;
  /** Total number of metrics compared. */
  total: number;
  /**
   * Overall evaluation:
   * - pass: no critical failures
   * - flag: at least one warning, no critical failures
   * - fail: at least one critical failure
   */
  overall: 'pass' | 'flag' | 'fail';
}

/**
 * Guardrail summary from the comparison.
 */
export interface GuardrailSummary {
  /** Number of guardrails that passed. */
  passed: number;
  /** Number of guardrails flagged. */
  flagged: number;
  /** Number of guardrails failed. */
  failed: number;
  /** Total guardrails evaluated. */
  total: number;
  /** Overall guardrail status. */
  overall: 'pass' | 'flag' | 'fail';
}

/**
 * Metadata section of the comparison report.
 */
export interface ComparisonMeta {
  /** Tool that generated the report. */
  tool: string;
  /** Version of the tool. */
  version: string;
  /** ISO timestamp when the report was generated. */
  timestamp: string;
}

/**
 * Complete comparison report, conforming to PRD §6.5 T1 output format.
 */
export interface ComparisonReport {
  /** Report metadata. */
  meta: ComparisonMeta;
  /** Summary of comparison results. */
  summary: ComparisonSummary;
  /** Per-metric comparison details. */
  comparisons: MetricComparison[];
  /** Guardrail evaluation summary. */
  guardrails: GuardrailSummary;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Computes percentage delta between two values.
 * Handles zero baseline gracefully (returns Infinity).
 */
function computeDeltaPct(baseline: number, delta: number): number {
  if (baseline === 0) {
    return delta === 0 ? 0 : Infinity;
  }
  return (delta / Math.abs(baseline)) * 100;
}

// ---------------------------------------------------------------------------
// Main comparison function
// ---------------------------------------------------------------------------

/**
 * Compares current metrics against a baseline, evaluates guardrails,
 * and returns a structured comparison report.
 *
 * @param inputs - Array of metric comparisons (id, baseline, current).
 * @param thresholdOverrides - Optional custom guardrail definitions.
 * @returns ComparisonReport with meta, summary, comparisons, guardrails.
 */
export function compareMetrics(
  inputs: ComparisonInput[],
  thresholdOverrides?: GuardrailDefinition[],
): ComparisonReport {
  const meta: ComparisonMeta = {
    tool: 'balance-comparison',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  };

  // Build a value map for guardrail evaluation (using current values)
  const currentValues: Record<string, number> = {};
  for (const input of inputs) {
    currentValues[input.id] = input.current;
  }

  // Evaluate guardrails
  const guardrailResult = evaluateGuardrails(currentValues, thresholdOverrides);

  // Compute per-metric comparisons
  const comparisons: MetricComparison[] = inputs.map((input) => {
    const delta = input.current - input.baseline;
    const deltaPct = computeDeltaPct(input.baseline, delta);

    // Find guardrail status for this metric
    const guardrail = guardrailResult.results.find(
      (r) => r.id === input.id,
    );
    let status: MetricComparison['status'];
    if (!guardrail) {
      status = 'unknown';
    } else {
      status = guardrail.status === 'unknown' ? 'unknown' : guardrail.status;
    }

    const note =
      input.baseline === 0 && input.current !== 0
        ? 'Baseline is zero; percentage delta is infinite'
        : undefined;

    return {
      id: input.id,
      baseline: { value: input.baseline },
      current: { value: input.current },
      delta,
      deltaPct,
      status,
      ...(note ? { note } : {}),
    };
  });

  // Compute summary
  const passed = comparisons.filter((c) => c.status === 'pass').length;
  const flagged = comparisons.filter((c) => c.status === 'flag').length;
  const failed = comparisons.filter((c) => c.status === 'fail').length;
  const unknown = comparisons.filter((c) => c.status === 'unknown').length;

  let overall: ComparisonSummary['overall'];
  if (failed > 0) {
    overall = 'fail';
  } else if (flagged > 0) {
    overall = 'flag';
  } else {
    overall = 'pass';
  }

  const summary: ComparisonSummary = {
    passed,
    flagged,
    failed,
    unknown,
    total: comparisons.length,
    overall,
  };

  const guardrails: GuardrailSummary = {
    passed: guardrailResult.passed,
    flagged: guardrailResult.flagged,
    failed: guardrailResult.failed,
    total: guardrailResult.total,
    overall: guardrailResult.overall,
  };

  return { meta, summary, comparisons, guardrails };
}
