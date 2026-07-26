/**
 * Statistics helpers — re-export alias for backward compatibility.
 *
 * This module re-exports all statistical helper functions from
 * `scripts/balance/engine/statistics.ts` for convenience and
 * backward compatibility.
 *
 * Consumers should prefer importing directly from the engine module:
 * ```ts
 * import { median } from 'scripts/balance/engine/statistics';
 * ```
 *
 * @module utils/statistics
 */

export {
  median,
  iqr,
  gini,
  hhi,
  confidenceInterval,
} from '../engine/statistics';
export type { ConfidenceIntervalResult } from '../engine/statistics';
