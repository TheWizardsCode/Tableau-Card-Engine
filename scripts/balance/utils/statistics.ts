/**
 * Statistics helpers — re-export from engine for backward compatibility.
 *
 * This module re-exports the core statistics functions from the engine
 * module to maintain a consistent API surface for consumers that import
 * from `scripts/balance/utils/statistics`.
 *
 * @module
 */

export { median, iqr, gini, hhi, confidenceInterval } from '../engine/statistics';
export type { IqrResult, ConfidenceIntervalResult } from '../engine/statistics';
