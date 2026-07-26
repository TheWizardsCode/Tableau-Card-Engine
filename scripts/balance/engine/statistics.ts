/**
 * Statistical helper functions for the Main Street balance analysis library.
 *
 * @module statistics
 */

/**
 * Computes the median of a numeric array.
 *
 * @param data - Numeric array. If empty, returns NaN.
 * @returns Median value (average of two middle values for even-length arrays).
 */
export function median(data: number[]): number {
  if (data.length === 0) return NaN;
  const sorted = [...data].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Computes the interquartile range (IQR), Q1, and Q3 of a numeric array.
 *
 * Uses the inclusive median-based method (type R-6 / SAS 4) for consistency
 * with statistical standards.
 *
 * @param data - Numeric array.
 * @returns Object with q1, q3, and iqr properties.
 */
export function iqr(data: number[]): { q1: number; q3: number; iqr: number } {
  if (data.length === 0) {
    return { q1: NaN, q3: NaN, iqr: NaN };
  }
  if (data.length === 1) {
    return { q1: data[0], q3: data[0], iqr: 0 };
  }
  const sorted = [...data].sort((a, b) => a - b);
  const n = sorted.length;
  // Inclusive median-based method: for odd n, include the median in both halves
  const lowerHalf = sorted.slice(0, Math.ceil(n / 2));
  const upperHalf = sorted.slice(Math.floor(n / 2));
  const q1 = median(lowerHalf);
  const q3 = median(upperHalf);
  return { q1, q3, iqr: q3 - q1 };
}

/**
 * Computes the Gini coefficient of a numeric array.
 *
 * The Gini coefficient measures inequality of a distribution.
 * Returns 0 for perfect equality and 1 for perfect inequality.
 *
 * @param values - Non-negative numeric array. Must not be empty.
 * @returns Gini coefficient in the range [0, 1].
 * @throws {TypeError} If the array is empty, contains negative values, or contains NaN.
 */
export function gini(values: number[]): number {
  if (values.length === 0) {
    throw new TypeError('Input array must not be empty');
  }
  for (const v of values) {
    if (typeof v !== 'number' || isNaN(v)) {
      throw new TypeError('Input values must not contain NaN');
    }
    if (v < 0) {
      throw new TypeError('Input values must be non-negative');
    }
  }
  if (values.length === 1) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  // Handle all-zero case
  if (sum === 0) return 0;
  // Compute Gini using the efficient formula:
  // G = (2 * sum(i * y_i)) / (n * sum(y_i)) - (n+1)/n
  // Then apply Bessel's correction for sample Gini: multiply by n/(n-1)
  let weightedSum = 0;
  for (let i = 0; i < n; i++) {
    weightedSum += (i + 1) * sorted[i];
  }
  const g = (2 * weightedSum) / (n * sum) - (n + 1) / n;
  // Apply sample correction factor to ensure [0, 1] range
  return (n / (n - 1)) * g;
}

/**
 * Computes the Herfindahl-Hirschman Index (HHI) from an array of shares or counts.
 *
 * HHI measures market concentration. Accepts either proportions (0–1) or raw counts.
 * Returns a value between 0 and 10000.
 *
 * @param shares - Numeric array of shares or counts (must be non-negative).
 * @returns HHI value (0-10000).
 * @throws {TypeError} If any value is negative.
 */
export function hhi(shares: number[]): number {
  if (shares.length === 0) return 0;
  for (const s of shares) {
    if (s < 0) {
      throw new TypeError('Share values must be non-negative');
    }
  }
  const total = shares.reduce((sum, s) => sum + s, 0);
  if (total === 0) {
    // All zeros — equal share of nothing; return 0
    return 0;
  }
  const hhi = shares.reduce((sum, s) => {
    const proportion = s / total;
    return sum + proportion * proportion;
  }, 0);
  return Math.round(hhi * 10000);
}

/**
 * Confidence interval result.
 */
export interface ConfidenceIntervalResult {
  /** Sample mean. */
  mean: number;
  /** Standard deviation of the sample. */
  stdDev: number;
  /** Lower bound of the confidence interval. */
  lower: number;
  /** Upper bound of the confidence interval. */
  upper: number;
  /** Margin of error (half-width of the interval). */
  marginOfError: number;
}

/**
 * Computes a confidence interval for the given data and z-score.
 *
 * Uses a normal distribution approximation. For small samples (n < 30),
 * consider using a t-distribution instead.
 *
 * @param data - Numeric array of sample values.
 * @param zScore - Z-score for the desired confidence level (e.g., 1.96 for 95%).
 * @returns Confidence interval result with mean, stdDev, lower, upper, and marginOfError.
 */
export function confidenceInterval(
  data: number[],
  zScore: number,
): ConfidenceIntervalResult {
  if (data.length === 0) {
    return { mean: NaN, stdDev: NaN, lower: NaN, upper: NaN, marginOfError: NaN };
  }
  const n = data.length;
  const mean = data.reduce((s, v) => s + v, 0) / n;
  if (n === 1) {
    return { mean, stdDev: 0, lower: mean, upper: mean, marginOfError: 0 };
  }
  const variance =
    data.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  const standardError = stdDev / Math.sqrt(n);
  const marginOfError = zScore * standardError;
  return {
    mean,
    stdDev,
    lower: mean - marginOfError,
    upper: mean + marginOfError,
    marginOfError,
  };
}
