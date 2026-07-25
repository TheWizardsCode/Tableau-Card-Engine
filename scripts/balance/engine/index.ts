/**
 * Balance Analysis Engine — barrel file.
 *
 * Re-exports all public functions from engine sub-modules.
 *
 * @module
 */

export { median, iqr, gini, hhi, confidenceInterval } from './statistics';
export type { IqrResult, ConfidenceIntervalResult } from './statistics';

export { captureBaseline, loadBaseline, validateBaseline } from './baseline';
export type { Baseline, BaselineMetadata, LoadBaselineResult } from './baseline';

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
  PickRateResult,
  WinRateDeltaResult,
  CostToIncomeInput,
  SynergyUtilizationResult,
  UpgradeAdoptionResult,
  EventImpactResult,
  SurvivalRateResult,
  CardDeltas,
} from './card-metrics';
