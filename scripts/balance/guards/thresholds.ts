/**
 * Guardrail threshold definitions and evaluation engine.
 *
 * Defines the balance guardrails from PRD §3.3 and provides a function
 * to evaluate a set of computed metrics against these thresholds.
 *
 * @module
 */

/**
 * Severity level for a guardrail threshold.
 * - `critical`: Breach blocks release (status `fail`).
 * - `warning`: Breach flags for review (status `flag`).
 * - `info`: Breach is informational only (status `flag` / `pass`).
 */
export type ThresholdSeverity = 'critical' | 'warning' | 'info';

/**
 * Status of a single guardrail evaluation.
 * - `pass`: Within threshold range.
 * - `flag`: Outside warning/info threshold range.
 * - `fail`: Outside critical threshold range.
 */
export type GuardrailStatus = 'pass' | 'flag' | 'fail';

/**
 * A single guardrail threshold definition.
 */
export interface GuardrailThreshold {
  /** Metric identifier (e.g., `winRate_greedy_medium`). */
  metric: string;
  /** Human-readable label. */
  label: string;
  /** Minimum acceptable value (inclusive). */
  min: number;
  /** Maximum acceptable value (inclusive). */
  max: number;
  /** Severity of this threshold. */
  severity: ThresholdSeverity;
}

/**
 * Per-metric guardrail evaluation result.
 */
export interface PerMetricGuardrailResult {
  /** Metric identifier. */
  metric: string;
  /** Human-readable label. */
  label: string;
  /** Current value of the metric. */
  value: number;
  /** Minimum acceptable value. */
  min: number;
  /** Maximum acceptable value. */
  max: number;
  /** Severity of this threshold. */
  severity: ThresholdSeverity;
  /** Evaluation status. */
  status: GuardrailStatus;
  /** Whether the value falls outside the threshold range. */
  breached: boolean;
}

/**
 * Result of a full guardrail evaluation.
 */
export interface GuardrailResult {
  /** Count of passing metrics. */
  passed: number;
  /** Count of flagged metrics (warning/info breaches). */
  flagged: number;
  /** Count of failed metrics (critical breaches). */
  failed: number;
  /**
   * Overall result.
   * - `pass`: All thresholds satisfied.
   * - `flag`: Warning/info thresholds breached, no critical.
   * - `fail`: Critical threshold breached.
   */
  overall: 'pass' | 'flag' | 'fail';
  /** Per-metric evaluation details. */
  perMetric: PerMetricGuardrailResult[];
}

/**
 * All guardrail threshold definitions from PRD §3.3.
 *
 * Keyed by `{metric}_{strategy}_{difficulty}` for easy lookup.
 *
 * Bands revised by CG-0MSRKN325004ELH2 (2026-08-13) to match industry
 * practice for casual solo play and the measured post-re-tune baseline
 * (see docs/main-street/balance-guardrail-recommendations.md):
 *  - winRate_greedy_medium: 30–60 → 45–75 (measured 62 on the canonical 200-seed set)
 *  - winRate_greedy_easy:   60–85 → 60–90 (measured 83.5; Easy is the learning preset)
 *  - avgCoinsPerTurn_greedy_medium: 0–2, formalizing the producer ruling from
 *    CG-0MSP26Q5N002EH8P (net liquidity = finalCoins/turns).
 */
export const GUARDRAIL_THRESHOLDS: Record<string, GuardrailThreshold> = {
  'winRate_greedy_medium': {
    metric: 'winRate_greedy_medium',
    label: 'Win Rate (Greedy, Medium)',
    min: 45,
    max: 75,
    severity: 'critical',
  },
  'winRate_greedy_easy': {
    metric: 'winRate_greedy_easy',
    label: 'Win Rate (Greedy, Easy)',
    min: 60,
    max: 90,
    severity: 'warning',
  },
  'winRate_greedy_hard': {
    metric: 'winRate_greedy_hard',
    label: 'Win Rate (Greedy, Hard)',
    min: 15,
    max: 40,
    severity: 'warning',
  },
  'winRate_random_medium': {
    metric: 'winRate_random_medium',
    label: 'Win Rate (Random, Medium)',
    min: 5,
    max: 20,
    severity: 'warning',
  },
  'avgCoinsPerTurn_greedy_medium': {
    metric: 'avgCoinsPerTurn_greedy_medium',
    label: 'Avg Coins Per Turn (Net Liquidity, Greedy, Medium)',
    min: 0,
    max: 2,
    severity: 'critical',
  },
  'medianScore_greedy_medium': {
    metric: 'medianScore_greedy_medium',
    label: 'Median Score (Greedy, Medium)',
    min: 120,
    max: 180,
    severity: 'warning',
  },
  'avgTurns_greedy_medium': {
    metric: 'avgTurns_greedy_medium',
    label: 'Average Turns (Greedy, Medium)',
    min: 14,
    max: 22,
    severity: 'info',
  },
  'bankruptcyRate_greedy_medium': {
    metric: 'bankruptcyRate_greedy_medium',
    label: 'Bankruptcy Rate (Greedy, Medium)',
    min: 40,
    max: 70,
    severity: 'info',
  },
  'reputationCollapseRate_greedy_medium': {
    metric: 'reputationCollapseRate_greedy_medium',
    label: 'Reputation Collapse Rate (Greedy, Medium)',
    min: 20,
    max: 40,
    severity: 'info',
  },
  'timeoutRate_greedy_medium': {
    metric: 'timeoutRate_greedy_medium',
    label: 'Timeout Rate (Greedy, Medium)',
    min: 0,
    max: 15,
    severity: 'warning',
  },
  'giniCoefficient_greedy_medium': {
    metric: 'giniCoefficient_greedy_medium',
    label: 'Gini Coefficient (Card Usage, Greedy, Medium)',
    min: 0.3,
    max: 0.6,
    severity: 'info',
  },
};

/**
 * Evaluates a set of named metrics against the defined guardrail thresholds.
 *
 * @param metrics - Record of metric-name → current-value pairs.
 * @param thresholds - Optional threshold overrides. Defaults to `GUARDRAIL_THRESHOLDS`.
 * @returns A `GuardrailResult` with per-metric status and overall assessment.
 */
export function evaluateGuardrails(
  metrics: Record<string, number>,
  thresholds: Record<string, GuardrailThreshold> = GUARDRAIL_THRESHOLDS,
): GuardrailResult {
  const perMetric: PerMetricGuardrailResult[] = [];

  for (const [name, value] of Object.entries(metrics)) {
    const threshold = thresholds[name];
    if (!threshold) continue;

    const breached = value < threshold.min || value > threshold.max;

    let status: GuardrailStatus;
    if (!breached) {
      status = 'pass';
    } else {
      switch (threshold.severity) {
        case 'critical':
          status = 'fail';
          break;
        case 'warning':
          status = 'flag';
          break;
        case 'info':
          status = 'flag';
          break;
      }
    }

    perMetric.push({
      metric: name,
      label: threshold.label,
      value,
      min: threshold.min,
      max: threshold.max,
      severity: threshold.severity,
      status,
      breached,
    });
  }

  const passed = perMetric.filter(m => m.status === 'pass').length;
  const flagged = perMetric.filter(m => m.status === 'flag').length;
  const failed = perMetric.filter(m => m.status === 'fail').length;

  let overall: 'pass' | 'flag' | 'fail';
  if (failed > 0) {
    overall = 'fail';
  } else if (flagged > 0) {
    overall = 'flag';
  } else {
    overall = 'pass';
  }

  return { passed, flagged, failed, overall, perMetric };
}
