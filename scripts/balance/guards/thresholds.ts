/**
 * Guardrail threshold definitions and evaluation for Main Street balance analysis.
 *
 * Guardrails define normal operating ranges for each metric. Values outside
 * these ranges trigger a PASS, FLAG, or FAIL decision based on severity.
 *
 * @module guards/thresholds
 */

/**
 * Severity level for a guardrail threshold.
 * - `critical`: Breach causes a FAIL status (blocks release).
 * - `warning`: Breach causes a FLAG status (requires documentation).
 * - `info`: Always passes (informational only).
 */
export type GuardrailSeverity = 'critical' | 'warning' | 'info';

/**
 * A single guardrail threshold definition.
 */
export interface GuardrailDefinition {
  /** Unique identifier for the guardrail (e.g., 'winRate_greedy_medium'). */
  readonly id: string;
  /** Human-readable description of what this guardrail measures. */
  readonly description: string;
  /** Acceptable range as [lower, upper] inclusive. */
  readonly range: [number, number];
  /** Severity level for breaches. */
  readonly severity: GuardrailSeverity;
}

/**
 * All guardrail definitions from PRD §3.3.
 *
 * These define the normal operating ranges for each balance metric
 * used in the comparison and CI guardrail check tools.
 */
export const GUARDRAIL_DEFINITIONS: readonly GuardrailDefinition[] = [
  {
    id: 'winRate_greedy_medium',
    description: 'Win rate for Greedy strategy on Medium difficulty',
    range: [30, 60],
    severity: 'critical',
  },
  {
    id: 'winRate_greedy_easy',
    description: 'Win rate for Greedy strategy on Easy difficulty',
    range: [60, 85],
    severity: 'warning',
  },
  {
    id: 'winRate_greedy_hard',
    description: 'Win rate for Greedy strategy on Hard difficulty',
    range: [15, 40],
    severity: 'warning',
  },
  {
    id: 'winRate_random_medium',
    description: 'Win rate for Random strategy on Medium difficulty',
    range: [5, 20],
    severity: 'warning',
  },
  {
    id: 'medianScore_greedy_medium',
    description: 'Median score for Greedy strategy on Medium difficulty',
    range: [120, 180],
    severity: 'warning',
  },
  {
    id: 'avgTurns_greedy_medium',
    description: 'Average turns for Greedy strategy on Medium difficulty',
    range: [14, 22],
    severity: 'info',
  },
  {
    id: 'bankruptcyRate_greedy_medium',
    description: 'Bankruptcy share of losses for Greedy/Medium',
    range: [40, 70],
    severity: 'info',
  },
  {
    id: 'reputationCollapseRate_greedy_medium',
    description: 'Reputation collapse share of losses for Greedy/Medium',
    range: [20, 40],
    severity: 'info',
  },
  {
    id: 'timeoutRate_greedy_medium',
    description: 'Timeout share of losses for Greedy/Medium',
    range: [0, 15],
    severity: 'warning',
  },
  {
    id: 'giniCoefficient_greedy_medium',
    description: 'Gini coefficient of card usage for Greedy/Medium',
    range: [0.3, 0.6],
    severity: 'info',
  },
];

/**
 * Result of evaluating a single guardrail against a metric value.
 */
export interface GuardrailResultItem {
  /** Guardrail definition that was evaluated. */
  readonly def: GuardrailDefinition;
  /** Short identifier (same as def.id). */
  readonly id: string;
  /** Human-readable description. */
  readonly description: string;
  /** The actual metric value that was evaluated. */
  readonly value: number | undefined;
  /**
   * Evaluation status:
   * - `pass`: Value is within the acceptable range.
   * - `flag`: Value is outside the range for a warning-level guardrail.
   * - `fail`: Value is outside the range for a critical-level guardrail.
   * - `unknown`: No value was provided for this guardrail.
   */
  readonly status: 'pass' | 'flag' | 'fail' | 'unknown';
  /**
   * Distance from the nearest boundary of the acceptable range.
   * 0 if within range, positive if outside (how far beyond the boundary).
   * undefined if no value was provided.
   */
  readonly delta: number | undefined;
}

/**
 * Aggregate result of evaluating all guardrails.
 */
export interface GuardrailResult {
  /** Number of guardrails that passed. */
  readonly passed: number;
  /** Number of guardrails that were flagged (warning breach). */
  readonly flagged: number;
  /** Number of guardrails that failed (critical breach). */
  readonly failed: number;
  /** Total number of guardrails evaluated. */
  readonly total: number;
  /**
   * Overall evaluation:
   * - `pass`: All guardrails pass or at worst are flagged (no critical failures).
   * - `flag`: One or more warning guardrails breached, no critical failures.
   * - `fail`: One or more critical guardrails breached.
   */
  readonly overall: 'pass' | 'flag' | 'fail';
  /** Per-metric guardrail evaluation results. */
  readonly results: GuardrailResultItem[];
}

/**
 * Evaluates a set of metric values against guardrail thresholds.
 *
 * @param values - Map of metric IDs to their numeric values.
 * @param overrides - Optional custom guardrail definitions that override the defaults.
 * @returns Aggregate guardrail evaluation result.
 */
export function evaluateGuardrails(
  values: Record<string, number>,
  overrides?: readonly GuardrailDefinition[],
): GuardrailResult {
  const definitions = overrides ?? GUARDRAIL_DEFINITIONS;
  const results: GuardrailResultItem[] = definitions.map((def) => {
    const value = values[def.id];
    if (value === undefined) {
      return {
        def,
        id: def.id,
        description: def.description,
        value: undefined,
        status: 'unknown',
        delta: undefined,
      };
    }
    const inRange = value >= def.range[0] && value <= def.range[1];
    if (inRange) {
      return {
        def,
        id: def.id,
        description: def.description,
        value,
        status: 'pass',
        delta: 0,
      };
    }
    // Compute delta: distance to nearest boundary
    const delta =
      value < def.range[0]
        ? def.range[0] - value
        : value - def.range[1];

    if (def.severity === 'critical') {
      return {
        def,
        id: def.id,
        description: def.description,
        value,
        status: 'fail',
        delta,
      };
    }
    if (def.severity === 'warning') {
      return {
        def,
        id: def.id,
        description: def.description,
        value,
        status: 'flag',
        delta,
      };
    }
    // info severity always passes
    return {
      def,
      id: def.id,
      description: def.description,
      value,
      status: 'pass',
      delta: 0,
    };
  });

  const passed = results.filter((r) => r.status === 'pass').length;
  const flagged = results.filter((r) => r.status === 'flag').length;
  const failed = results.filter((r) => r.status === 'fail').length;

  let overall: 'pass' | 'flag' | 'fail';
  if (failed > 0) {
    overall = 'fail';
  } else if (flagged > 0) {
    overall = 'flag';
  } else {
    overall = 'pass';
  }

  return {
    passed,
    flagged,
    failed,
    total: definitions.length,
    overall,
    results,
  };
}
