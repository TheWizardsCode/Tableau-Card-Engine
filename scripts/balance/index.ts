/**
 * Main Street Balance Analysis Library — entry point.
 *
 * This is the primary entry point for the balance analysis library.
 * It re-exports all public API from the engine and guards modules.
 *
 * @module balance
 */

// Re-export engine modules
export * from './engine/index';

// Re-export guardrail definitions
export {
  GUARDRAIL_DEFINITIONS,
  evaluateGuardrails,
} from './guards/thresholds';
export type {
  GuardrailSeverity,
  GuardrailDefinition,
  GuardrailResultItem,
  GuardrailResult,
} from './guards/thresholds';

// Re-export baseline types
export type {
  BaselineMeta,
  BaselineCombination,
  BaselineData,
  ValidationResult,
  LoadResult,
} from './engine/baseline';
