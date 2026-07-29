import { describe, it, expect } from 'vitest';
import {
  median,
  iqr,
  gini,
  hhi,
  confidenceInterval,
} from '../../scripts/balance/engine/statistics';

describe('median', () => {
  it('returns NaN for empty array', () => {
    expect(median([])).toBeNaN();
  });

  it('returns the single element for single-element array', () => {
    expect(median([5])).toBe(5);
  });

  it('returns correct median for odd-length array', () => {
    expect(median([1, 3, 5])).toBe(3);
  });

  it('returns correct median for even-length array', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('returns correct median for unsorted input', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('handles negative values', () => {
    expect(median([-5, -1, 0, 2, 10])).toBe(0);
  });

  it('handles floating point values', () => {
    expect(median([1.5, 2.5, 3.5])).toBe(2.5);
  });

  it('does not mutate the original array', () => {
    const arr = [3, 1, 2];
    const copy = [...arr];
    median(arr);
    expect(arr).toEqual(copy);
  });
});

describe('iqr', () => {
  it('returns zeros for empty array', () => {
    const result = iqr([]);
    expect(result.q1).toBeNaN();
    expect(result.q3).toBeNaN();
    expect(result.iqr).toBeNaN();
  });

  it('returns same value for single-element array', () => {
    const result = iqr([5]);
    expect(result.q1).toBe(5);
    expect(result.q3).toBe(5);
    expect(result.iqr).toBe(0);
  });

  it('returns correct Q1, Q3, IQR for odd-length array', () => {
    // Exclusive method (Moore & McCabe): median excluded from both halves
    // Lower: [1, 2], Upper: [4, 5]
    const result = iqr([1, 2, 3, 4, 5]);
    expect(result.q1).toBe(1.5);
    expect(result.q3).toBe(4.5);
    expect(result.iqr).toBe(3);
  });

  it('returns correct Q1, Q3, IQR for even-length array', () => {
    const result = iqr([1, 2, 3, 4, 5, 6]);
    expect(result.q1).toBe(2);
    expect(result.q3).toBe(5);
    expect(result.iqr).toBe(3);
  });

  it('handles unsorted input', () => {
    const result = iqr([5, 3, 1, 4, 2]);
    expect(result.q1).toBe(1.5);
    expect(result.q3).toBe(4.5);
    expect(result.iqr).toBe(3);
  });

  it('handles duplicate values', () => {
    const result = iqr([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(result.q1).toBe(1.5);
    expect(result.q3).toBe(3.5);
    expect(result.iqr).toBe(2);
  });

  it('returns expected IQR for known dataset', () => {
    // Using the dataset: 1, 4, 6, 8, 9, 10, 14
    // Q1 = 4, Q3 = 10, IQR = 6
    const result = iqr([1, 4, 6, 8, 9, 10, 14]);
    expect(result.q1).toBe(4);
    expect(result.q3).toBe(10);
    expect(result.iqr).toBe(6);
  });

  it('does not mutate the original array', () => {
    const arr = [3, 1, 2, 4, 5];
    const copy = [...arr];
    iqr(arr);
    expect(arr).toEqual(copy);
  });
});

describe('gini', () => {
  it('returns 0 for equal distribution', () => {
    expect(gini([10, 10, 10, 10])).toBe(0);
  });

  it('returns near 1 for perfect inequality (single non-zero)', () => {
    const result = gini([0, 0, 100]);
    // Gini = (2 * 100 - 99 - 100) / (3 * 100) ≈ 0.6667
    expect(result).toBeCloseTo(0.6667, 3);
  });

  it('returns 0 for single-element array', () => {
    expect(gini([42])).toBe(0);
  });

  it('returns 0 for all-equal single-element', () => {
    expect(gini([1])).toBe(0);
  });

  it('throws TypeError for negative values', () => {
    expect(() => gini([1, -2, 3])).toThrow(TypeError);
  });

  it('throws TypeError for empty array', () => {
    expect(() => gini([])).toThrow(TypeError);
  });

  it('computes intermediate inequality correctly', () => {
    // Dataset: 1, 2, 3, 4, 5
    // Gini = (2 * (1*5 + 2*4 + 3*3 + 4*2 + 5*1) - (5+1)*15) / (5*15)
    // = (2 * (5 + 8 + 9 + 8 + 5) - 6*15) / 75
    // = (2 * 35 - 90) / 75 = (70 - 90) / 75 = -20/75 ... hmm, let me recalculate
    // Actually Gini = (2 * sum(i * y_i)) / (n * sum(y_i)) - (n+1)/n
    // where y_i is sorted ascending
    // Let me just test approximate value
    const result = gini([1, 2, 3, 4, 5]);
    // Expected: (2*(1*1 + 2*2 + 3*3 + 4*4 + 5*5))/(5*15) - 6/5
    // = (2*55)/75 - 1.2 = 110/75 - 1.2 = 1.4667 - 1.2 = 0.2667
    expect(result).toBeCloseTo(0.2667, 3);
  });

  it('handles large values without overflow', () => {
    const result = gini([1000000, 2000000, 3000000]);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('returns 0 for two equal values', () => {
    expect(gini([5, 5])).toBe(0);
  });

  it('returns 0.5 for two values with one zero', () => {
    expect(gini([0, 10])).toBe(0.5);
  });
});

describe('hhi', () => {
  it('returns 0 for empty array', () => {
    expect(hhi([])).toBe(0);
  });

  it('returns 10000 for single element', () => {
    expect(hhi([1])).toBe(10000);
  });

  it('returns 5000 for two equal shares', () => {
    // shares: [0.5, 0.5] => 0.25 + 0.25 = 0.5 => * 10000 = 5000
    expect(hhi([0.5, 0.5])).toBe(5000);
  });

  it('computes HHI for unequal shares', () => {
    // shares: [0.6, 0.3, 0.1] => 0.36 + 0.09 + 0.01 = 0.46 => * 10000 = 4600
    expect(hhi([0.6, 0.3, 0.1])).toBe(4600);
  });

  it('computes HHI from raw counts (shares summed to 1)', () => {
    // counts: [10, 20, 70] => total = 100
    // shares: [0.1, 0.2, 0.7] => 0.01 + 0.04 + 0.49 = 0.54 => * 10000 = 5400
    expect(hhi([10, 20, 70], true)).toBeCloseTo(5400, 5);
  });

  it('returns 10000 for dominant share of 1', () => {
    expect(hhi([1, 0, 0])).toBe(10000);
  });

  it('throws TypeError for negative values', () => {
    expect(() => hhi([0.5, -0.2, 0.7])).toThrow(TypeError);
  });

  it('handles very small values', () => {
    const result = hhi([0.0001, 0.9999]);
    expect(result).toBeGreaterThan(5000);
    expect(result).toBeCloseTo(9998, 0);
  });
});

describe('confidenceInterval', () => {
  it('returns NaN bounds for empty array', () => {
    const result = confidenceInterval([], 1.96);
    expect(result.lower).toBeNaN();
    expect(result.upper).toBeNaN();
    expect(result.marginOfError).toBeNaN();
  });

  it('returns the value itself for single-element array', () => {
    const result = confidenceInterval([10], 1.96);
    expect(result.lower).toBe(10);
    expect(result.upper).toBe(10);
    expect(result.marginOfError).toBe(0);
  });

  it('computes correct confidence interval', () => {
    // Dataset: [10, 12, 14, 16, 18]
    // mean = 14, n = 5
    // variance = ((16+4+0+4+16)/5) = 40/5 = 8
    // stdDev = sqrt(8) ≈ 2.828
    // SE = 2.828/sqrt(5) ≈ 1.265
    // z=1.96 => MoE = 1.96 * 1.265 ≈ 2.479
    // CI: 14 ± 2.479 => [11.521, 16.479]
    const result = confidenceInterval([10, 12, 14, 16, 18], 1.96);
    expect(result.lower).toBeCloseTo(11.521, 1);
    expect(result.upper).toBeCloseTo(16.479, 1);
    expect(result.marginOfError).toBeCloseTo(2.479, 1);
  });

  it('uses provided z-score', () => {
    const result95 = confidenceInterval([10, 12, 14, 16, 18], 1.96);
    const result99 = confidenceInterval([10, 12, 14, 16, 18], 2.576);
    expect(result99.marginOfError).toBeGreaterThan(result95.marginOfError);
  });

  it('handles two-element array', () => {
    const result = confidenceInterval([5, 7], 1.96);
    expect(result.lower).toBeLessThan(result.upper);
    expect(result.marginOfError).toBeGreaterThan(0);
  });

  it('throws TypeError for z-score ≤ 0', () => {
    expect(() => confidenceInterval([1, 2, 3], 0)).toThrow(TypeError);
    expect(() => confidenceInterval([1, 2, 3], -1)).toThrow(TypeError);
  });

  it('computes population variance (not sample)', () => {
    // With population variance (dividing by n, not n-1):
    // data: [2, 4, 4, 4, 5, 5, 7, 9], n=8
    // mean = 5
    // variance = (9+1+1+1+0+0+4+16)/8 = 32/8 = 4
    // stdDev = 2
    // SE = 2/sqrt(8) ≈ 0.707
    // z=1.96 => MoE ≈ 1.386
    // CI: [3.614, 6.386]
    const result = confidenceInterval([2, 4, 4, 4, 5, 5, 7, 9], 1.96);
    expect(result.lower).toBeCloseTo(3.614, 1);
    expect(result.upper).toBeCloseTo(6.386, 1);
    expect(result.marginOfError).toBeCloseTo(1.386, 1);
  });
});
