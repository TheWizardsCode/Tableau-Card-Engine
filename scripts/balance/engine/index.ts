/**
 * Balance Analysis Engine — barrel file.
 *
 * Re-exports all public functions from the engine sub-modules.
 *
 * @module engine
 */

export {
  median,
  iqr,
  gini,
  hhi,
  confidenceInterval,
} from './statistics';
export type { ConfidenceIntervalResult } from './statistics';

export {
  validateBaselineShape,
  captureBaseline,
  loadBaseline,
} from './baseline';
export type {
  BaselineMeta,
  BaselineCombination,
  BaselineData,
  ValidationResult,
  LoadResult,
} from './baseline';

export {
  computePickRate,
  computeWinRateDelta,
  computeCostToIncomeRatio,
  computeSynergyUtilization,
  computeUpgradeAdoption,
  computeEventImpactScore,
  computeSurvivalRate,
} from './card-metrics';
export type {
  CardTemplate,
  CardMetricResult,
} from './card-metrics';
