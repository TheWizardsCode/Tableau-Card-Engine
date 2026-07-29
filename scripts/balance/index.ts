/**
 * Balance Analysis Library — entry point.
 *
 * Re-exports all public APIs from the balance analysis engine,
 * guardrail thresholds, and utility modules.
 *
 * @module
 */

export * from './engine';
export { GUARDRAIL_THRESHOLDS, evaluateGuardrails } from './guards/thresholds';
export type {
  GuardrailThreshold,
  GuardrailResult,
  PerMetricGuardrailResult,
  GuardrailStatus,
  ThresholdSeverity,
} from './guards/thresholds';
