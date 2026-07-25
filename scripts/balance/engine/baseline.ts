/**
 * Baseline capture, validation, and loading utilities.
 *
 * A baseline is a committed snapshot of Monte Carlo results representing
 * the "known good" balance state, used for regression comparison.
 *
 * @module
 */

import type { MonteCarloMetrics, MonteCarloRunSummary } from '../../../example-games/main-street/MainStreetMonteCarlo';

/**
 * Metadata for a baseline snapshot.
 */
export interface BaselineMetadata {
  /** Strategy used for the Monte Carlo run. */
  strategy: string;
  /** Difficulty setting used. */
  difficulty: string;
}

/**
 * A complete balance baseline snapshot.
 *
 * Mirrors the `MonteCarloResult` output format but includes metadata
 * (tag, timestamp, strategy, difficulty) and validation support.
 */
export interface Baseline {
  /** Human-readable tag for the baseline (e.g., "v1", "pre-v0.2.0"). */
  tag: string;
  /** ISO 8601 timestamp of when the baseline was captured. */
  timestamp: string;
  /** AI strategy used for the run. */
  strategy: string;
  /** Difficulty setting for the run. */
  difficulty: string;
  /** Aggregated Monte Carlo metrics. */
  metrics: MonteCarloMetrics;
  /** Per-run summaries. */
  runs: MonteCarloRunSummary[];
}

/**
 * Result of a `loadBaseline` operation.
 */
export type LoadBaselineResult = { success: true; baseline: Baseline } | { success: false; error: string };

/**
 * Validates that a value is a well-formed `Baseline` object.
 *
 * Checks for the presence and correct types of all required fields.
 * This is a structural type guard — it verifies shape, not exact schema.
 *
 * @param value - Value to validate.
 * @returns `true` if the value is a valid Baseline.
 */
export function validateBaseline(value: unknown): value is Baseline {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const b = value as Record<string, unknown>;

  // Check required string fields
  if (typeof b.tag !== 'string') return false;
  if (typeof b.timestamp !== 'string') return false;
  if (typeof b.strategy !== 'string') return false;
  if (typeof b.difficulty !== 'string') return false;

  // Check metrics object
  if (!b.metrics || typeof b.metrics !== 'object' || Array.isArray(b.metrics)) {
    return false;
  }
  const m = b.metrics as Record<string, unknown>;
  // MonteCarloMetrics required numeric fields
  const requiredMetricFields = ['runs', 'wins', 'losses', 'winRate', 'medianScore', 'averageScore'];
  for (const field of requiredMetricFields) {
    if (typeof m[field] !== 'number') return false;
  }
  if (typeof m.lossReasons !== 'object' || m.lossReasons === null) return false;
  if (typeof m.lossReasonRates !== 'object' || m.lossReasonRates === null) return false;

  // Check runs array
  if (!Array.isArray(b.runs)) return false;

  return true;
}

/**
 * Generates an ISO timestamp string for "now".
 */
function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Captures a balance baseline from Monte Carlo results.
 *
 * @param metrics - Aggregated Monte Carlo metrics.
 * @param runs - Per-run Monte Carlo summaries.
 * @param metadata - Metadata about the baseline (strategy, difficulty, optional tag).
 * @returns A typed `Baseline` object ready for serialization.
 */
export function captureBaseline(
  metrics: MonteCarloMetrics,
  runs: MonteCarloRunSummary[],
  metadata: BaselineMetadata & { tag?: string },
): Baseline {
  const tag = metadata.tag ?? `baseline-${nowISO().slice(0, 10)}`;

  return {
    tag,
    timestamp: nowISO(),
    strategy: metadata.strategy,
    difficulty: metadata.difficulty,
    metrics,
    runs,
  };
}

/**
 * Parses and validates a JSON string into a `Baseline` object.
 *
 * @param json - JSON string containing baseline data.
 * @returns A `LoadBaselineResult` indicating success or failure.
 */
export function loadBaseline(json: string): LoadBaselineResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    return { success: false, error: 'Failed to parse baseline JSON' };
  }

  if (!validateBaseline(parsed)) {
    return { success: false, error: 'Baseline validation failed: missing or invalid fields' };
  }

  return { success: true, baseline: parsed };
}
