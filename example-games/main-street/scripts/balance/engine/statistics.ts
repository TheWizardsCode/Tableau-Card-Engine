/**
 * Statistics helpers for balance analysis.
 *
 * Provides reusable typed utility functions used by the global metrics
 * engine (Gini for G6: Card Usage Diversity, HHI for G4: Synergy Diversity)
 * and comparison engine (confidence intervals for baseline comparison).
 *
 * @module
 */

/**
 * Computes the median of a numeric array.
 *
 * @param values - Sorted or unsorted numeric array.
 * @returns The median value, or `NaN` for empty arrays.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Result of an IQR (Interquartile Range) computation.
 */
export interface IqrResult {
  /** First quartile (25th percentile). */
  q1: number;
  /** Third quartile (75th percentile). */
  q3: number;
  /** Interquartile range (Q3 - Q1). */
  iqr: number;
}

/**
 * Computes the interquartile range (IQR) of a numeric array.
 *
 * Uses the exclusive median method (Moore & McCabe):
 * - Q1 is the median of the lower half of the data.
 * - Q3 is the median of the upper half of the data.
 *
 * For odd-length arrays, the overall median is excluded from both halves.
 *
 * @param values - Sorted or unsorted numeric array.
 * @returns An object containing Q1, Q3, and IQR.
 */
export function iqr(values: readonly number[]): IqrResult {
  if (values.length === 0) {
    return { q1: NaN, q3: NaN, iqr: NaN };
  }
  if (values.length === 1) {
    return { q1: values[0], q3: values[0], iqr: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  // Exclusive method (Moore & McCabe):
  // - For even n, split into two equal halves.
  // - For odd n, exclude the median from both halves.
  const halfLen = Math.floor(n / 2);

  let lowerHalf: number[];
  let upperHalf: number[];

  if (n % 2 === 0) {
    // Even length: split into two equal halves
    lowerHalf = sorted.slice(0, halfLen);
    upperHalf = sorted.slice(halfLen);
  } else {
    // Odd length: exclude median from both halves
    const midIdx = Math.floor(n / 2);
    lowerHalf = sorted.slice(0, midIdx);
    upperHalf = sorted.slice(midIdx + 1);
  }

  const q1 = median(lowerHalf);
  const q3 = median(upperHalf);

  return { q1, q3, iqr: q3 - q1 };
}

/**
 * Computes the Gini coefficient for a set of non-negative values.
 *
 * The Gini coefficient measures inequality:
 * - 0 = perfect equality (all values equal)
 * - 1 = perfect inequality (one value holds everything)
 *
 * Formula: G = (2 * sum(i * y_i)) / (n * sum(y_i)) - (n + 1) / n
 * where y_i are sorted in ascending order.
 *
 * @param values - Array of non-negative numbers.
 * @returns The Gini coefficient (0 to 1).
 * @throws {TypeError} If the array is empty or contains negative values.
 */
export function gini(values: readonly number[]): number {
  if (values.length === 0) {
    throw new TypeError('gini: array must not be empty');
  }
  if (values.some(v => v < 0)) {
    throw new TypeError('gini: all values must be non-negative');
  }

  const n = values.length;
  if (n === 1) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);

  if (sum === 0) return 0;

  // Gini = (2 * sum(i * y_i)) / (n * sum) - (n + 1) / n
  let weightedSum = 0;
  for (let i = 0; i < n; i++) {
    weightedSum += (i + 1) * sorted[i];
  }

  return (2 * weightedSum) / (n * sum) - (n + 1) / n;
}

/**
 * Computes the Herfindahl-Hirschman Index (HHI) from a set of shares or counts.
 *
 * HHI measures market concentration:
 * - 0 = no concentration (many small equal participants)
 * - 10,000 = monopoly (single participant)
 *
 * When `fromCounts` is `true`, the input is treated as raw counts that are
 * converted to proportional shares before computing HHI.
 *
 * @param values - Array of non-negative shares (summing to 1) or raw counts.
 * @param fromCounts - If true, values are treated as raw counts and normalised.
 * @returns The HHI score (0 to 10000).
 * @throws {TypeError} If any value is negative.
 */
export function hhi(values: readonly number[], fromCounts = false): number {
  if (values.length === 0) return 0;
  if (values.some(v => v < 0)) {
    throw new TypeError('hhi: all values must be non-negative');
  }

  let shares: number[];

  if (fromCounts) {
    const total = values.reduce((acc, v) => acc + v, 0);
    if (total === 0) return 0;
    shares = values.map(v => v / total);
  } else {
    shares = [...values];
  }

  return shares.reduce((acc, v) => acc + v * v, 0) * 10000;
}

/**
 * Result of a confidence interval computation.
 */
export interface ConfidenceIntervalResult {
  /** Lower bound of the confidence interval. */
  lower: number;
  /** Upper bound of the confidence interval. */
  upper: number;
  /** Margin of error (half-width of the interval). */
  marginOfError: number;
}

/**
 * Computes a confidence interval for the population mean.
 *
 * Uses population variance (divides by n, not n-1) and assumes a normal
 * distribution. For small samples, consider using a t-distribution critical
 * value instead of a z-score.
 *
 * @param values - Sample data array.
 * @param zScore - Z-score for the desired confidence level (e.g., 1.96 for 95%).
 * @returns Lower and upper bounds and margin of error.
 * @throws {TypeError} If z-score is ≤ 0.
 */
export function confidenceInterval(
  values: readonly number[],
  zScore: number,
): ConfidenceIntervalResult {
  if (zScore <= 0) {
    throw new TypeError('confidenceInterval: zScore must be positive');
  }

  const n = values.length;
  if (n === 0) {
    return { lower: NaN, upper: NaN, marginOfError: NaN };
  }
  if (n === 1) {
    return { lower: values[0], upper: values[0], marginOfError: 0 };
  }

  const mean = values.reduce((acc, v) => acc + v, 0) / n;

  // Population variance (divide by n, not n-1)
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const standardError = stdDev / Math.sqrt(n);
  const marginOfError = zScore * standardError;

  return {
    lower: mean - marginOfError,
    upper: mean + marginOfError,
    marginOfError,
  };
}
