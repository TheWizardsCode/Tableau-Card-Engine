/**
 * Comparison Engine — diff/comparison for balance analysis.
 *
 * Compares current computed metrics against a committed baseline,
 * computes absolute and percentage deltas, evaluates each against
 * guardrail thresholds, and produces a structured JSON report
 * conforming to PRD §6.5.
 *
 * @module
 */

import {
  GUARDRAIL_THRESHOLDS,
  evaluateGuardrails,
} from '../guards/thresholds';
import type { GuardrailThreshold, GuardrailStatus } from '../guards/thresholds';

// =========================================================================
// Types
// =========================================================================

/**
 * A single comparison result.
 */
export interface ComparisonEntry {
  /** Metric identifier (e.g., 'winRate_greedy_medium'). */
  metric: string;
  /** Human-readable label. */
  label: string;
  /** Current metric value. */
  current: number;
  /** Baseline metric value. */
  baseline: number;
  /** Absolute delta: current - baseline. */
  delta: number;
  /** Percentage delta: (current - baseline) / |baseline| × 100. */
  deltaPct: number;
  /** Guardrail evaluation status. */
  status: GuardrailStatus;
  /** Severity of the threshold. */
  severity: string;
}

/**
 * Summary of guardrail results.
 */
export interface ComparisonSummary {
  /** Number of passing metrics. */
  passed: number;
  /** Number of flagged metrics. */
  flagged: number;
  /** Number of failed metrics. */
  failed: number;
  /** Overall result. */
  overall: 'pass' | 'flag' | 'fail';
}

/**
 * Metadata for a comparison report.
 */
export interface ComparisonMeta {
  /** ISO 8601 timestamp of when the comparison was generated. */
  timestamp: string;
  /** Number of metrics in the current run. */
  currentCount: number;
  /** Number of metrics in the baseline. */
  baselineCount: number;
}

/**
 * Complete comparison report.
 */
export interface ComparisonReport {
  /** Report metadata. */
  meta: ComparisonMeta;
  /** Aggregate summary. */
  summary: ComparisonSummary;
  /** Per-metric comparisons. */
  comparisons: ComparisonEntry[];
}

// =========================================================================
// Helpers
// =========================================================================

/**
 * Compute percentage delta with zero-baseline handling.
 *
 * Returns `±Infinity` when baseline is 0 (signed by the direction of delta),
 * returns `0` when both are 0.
 */
function computeDeltaPct(current: number, baseline: number): number {
  if (baseline === 0) {
    if (current === 0) return 0;
    return current > 0 ? Infinity : -Infinity;
  }
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

/**
 * Map a threshold severity to a fallback label.
 */
function thresholdLabel(name: string, threshold?: GuardrailThreshold): string {
  return threshold?.label ?? name;
}

// =========================================================================
// Main Function
// =========================================================================

/**
 * Compares current metrics against a baseline, evaluates guardrails, and
 * produces a structured comparison report conforming to PRD §6.5.
 *
 * @param current - Current computed metrics (metric-name → value).
 * @param baseline - Baseline committed metrics (metric-name → value).
 * @param thresholds - Optional threshold overrides. Defaults to `GUARDRAIL_THRESHOLDS`.
 * @returns A typed `ComparisonReport`.
 */
export function compareMetrics(
  current: Record<string, number>,
  baseline: Record<string, number>,
  thresholds: Record<string, GuardrailThreshold> = GUARDRAIL_THRESHOLDS,
): ComparisonReport {
  const now = new Date().toISOString();

  // Determine which metrics to compare: intersection of current and baseline keys
  const metricNames = Object.keys(current).filter(key => key in baseline);

  // Build comparison entries
  const comparisons: ComparisonEntry[] = [];

  for (const metric of metricNames) {
    const curVal = current[metric];
    const baseVal = baseline[metric];
    const delta = curVal - baseVal;
    const deltaPct = computeDeltaPct(curVal, baseVal);

    const threshold = thresholds[metric];
    let entryStatus: GuardrailStatus;
    let severity: string;

    if (threshold) {
      // Use guardrail evaluation to determine status
      const guardrailResult = evaluateGuardrails({ [metric]: curVal }, { [metric]: threshold });
      const perMetric = guardrailResult.perMetric[0];
      entryStatus = perMetric?.status ?? 'pass';
      severity = threshold.severity;
    } else {
      // No threshold defined — pass by default
      entryStatus = 'pass';
      severity = 'info';
    }

    comparisons.push({
      metric,
      label: thresholdLabel(metric, threshold),
      current: curVal,
      baseline: baseVal,
      delta,
      deltaPct,
      status: entryStatus,
      severity,
    });
  }

  // Build summary
  const passed = comparisons.filter(c => c.status === 'pass').length;
  const flagged = comparisons.filter(c => c.status === 'flag').length;
  const failed = comparisons.filter(c => c.status === 'fail').length;

  let overall: 'pass' | 'flag' | 'fail';
  if (failed > 0) {
    overall = 'fail';
  } else if (flagged > 0) {
    overall = 'flag';
  } else {
    overall = 'pass';
  }

  return {
    meta: {
      timestamp: now,
      currentCount: Object.keys(current).length,
      baselineCount: Object.keys(baseline).length,
    },
    summary: { passed, flagged, failed, overall },
    comparisons,
  };
}
