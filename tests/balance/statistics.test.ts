import { describe, it, expect } from 'vitest';
import {
  median,
  iqr,
  gini,
  hhi,
  confidenceInterval,
} from '../../scripts/balance/engine/statistics';

describe('median', () => {
  it('returns the middle value for odd-length arrays', () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([5, 1, 9])).toBe(5);
    expect(median([100, 0, 50])).toBe(50);
  });

  it('returns the average of two middle values for even-length arrays', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(median([1, 1, 1, 100])).toBe(1);
  });

  it('returns the single element for single-element arrays', () => {
    expect(median([42])).toBe(42);
    expect(median([-5])).toBe(-5);
  });

  it('returns NaN for empty arrays', () => {
    expect(median([])).toBeNaN();
  });

  it('returns correct median for already-sorted arrays', () => {
    expect(median([1, 2, 3, 4, 5])).toBe(3);
    expect(median([1, 2, 3, 4, 5, 6])).toBe(3.5);
  });

  it('handles negative numbers correctly', () => {
    expect(median([-10, -5, 0, 5, 10])).toBe(0);
    expect(median([-10, -5, 0, 5])).toBe(-2.5);
  });

  it('handles floating point numbers', () => {
    expect(median([1.5, 2.5, 3.5])).toBe(2.5);
    expect(median([0.1, 0.2, 0.3, 0.4])).toBeCloseTo(0.25);
  });
});

describe('iqr', () => {
  it('returns correct Q1, Q3, and IQR for a basic dataset', () => {
    const data = [1, 2, 3, 4, 5, 6, 7];
    const result = iqr(data);
    expect(result.q1).toBeCloseTo(2.5);
    expect(result.q3).toBeCloseTo(5.5);
    expect(result.iqr).toBeCloseTo(3);
  });

  it('handles even-length datasets', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = iqr(data);
    expect(result.q1).toBe(2.5);
    expect(result.q3).toBe(6.5);
    expect(result.iqr).toBe(4);
  });

  it('handles single-element arrays', () => {
    const result = iqr([42]);
    expect(result.q1).toBe(42);
    expect(result.q3).toBe(42);
    expect(result.iqr).toBe(0);
  });

  it('returns NaN for empty arrays', () => {
    const result = iqr([]);
    expect(result.q1).toBeNaN();
    expect(result.q3).toBeNaN();
    expect(result.iqr).toBeNaN();
  });

  it('handles two-element arrays', () => {
    const result = iqr([5, 10]);
    expect(result.q1).toBe(5);
    expect(result.q3).toBe(10);
    expect(result.iqr).toBe(5);
  });

  it('handles datasets with duplicate values', () => {
    const data = [1, 1, 2, 2, 3, 3, 4, 4];
    const result = iqr(data);
    expect(result.q1).toBe(1.5);
    expect(result.q3).toBe(3.5);
    expect(result.iqr).toBe(2);
  });
});

describe('gini', () => {
  it('returns 0 for perfectly equal distribution', () => {
    expect(gini([10, 10, 10])).toBe(0);
    expect(gini([5, 5, 5, 5])).toBe(0);
    expect(gini([100])).toBe(0);
  });

  it('returns close to 1 for highly unequal distribution', () => {
    // For [0, 0, 100], Gini should be very close to 1
    const result = gini([0, 0, 100]);
    expect(result).toBeGreaterThan(0.95);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('returns 1 for perfect inequality (one has everything)', () => {
    // For [0, 0, 1], Gini should be 1
    expect(gini([0, 0, 1])).toBe(1);
  });

  it('returns 0 for single-element array', () => {
    expect(gini([42])).toBe(0);
  });

  it('throws TypeError for empty array', () => {
    expect(() => gini([])).toThrow(TypeError);
    expect(() => gini([])).toThrow(/empty/i);
  });

  it('throws TypeError for negative values', () => {
    expect(() => gini([-1, 2, 3])).toThrow(TypeError);
    expect(() => gini([1, -2, 3])).toThrow(TypeError);
  });

  it('throws TypeError for NaN values', () => {
    expect(() => gini([NaN, 1, 2])).toThrow(TypeError);
  });

  it('handles moderate inequality', () => {
    // Equal distribution should give 0
    // Some inequality should give a value between 0 and 1
    const equal = gini([10, 10, 10, 10]);
    const moderate = gini([1, 2, 3, 4]);
    const high = gini([0.1, 0.1, 0.1, 10]);
    expect(equal).toBe(0);
    expect(moderate).toBeGreaterThan(0);
    expect(moderate).toBeLessThan(1);
    expect(high).toBeGreaterThan(moderate);
  });
});

describe('hhi', () => {
  it('returns 10000 for a single entity with 100% market share', () => {
    expect(hhi([1])).toBe(10000);
  });

  it('returns correct value for two equal entities', () => {
    // 50%^2 + 50%^2 = 2500 + 2500 = 5000
    expect(hhi([0.5, 0.5])).toBe(5000);
  });

  it('returns correct value for three equal entities', () => {
    // ~33.3%^2 * 3 ≈ 3333
    const result = hhi([1 / 3, 1 / 3, 1 / 3]);
    expect(result).toBeCloseTo(3333, -1); // approximately 3333
  });

  it('handles shares that are not proportions', () => {
    // The function should accept raw counts and normalize internally
    expect(hhi([10, 10])).toBe(5000);
  });

  it('returns 0 for empty array', () => {
    expect(hhi([])).toBe(0);
  });

  it('throws TypeError for negative values', () => {
    expect(() => hhi([-1, 2])).toThrow(TypeError);
  });

  it('handles zero values without dividing by zero', () => {
    expect(hhi([0, 10, 0])).toBe(10000);
  });

  it('produces reasonable value for diverse distribution', () => {
    const result = hhi([0.1, 0.2, 0.3, 0.4]);
    // HHI of 0.01 + 0.04 + 0.09 + 0.16 = 0.3 → scaled to 3000
    expect(result).toBeCloseTo(3000, -1);
  });
});

describe('confidenceInterval', () => {
  it('returns correct interval for known data', () => {
    const data = [1, 2, 3, 4, 5];
    const result = confidenceInterval(data, 1.96);
    expect(result.lower).toBeLessThan(result.mean);
    expect(result.upper).toBeGreaterThan(result.mean);
    expect(result.marginOfError).toBeGreaterThan(0);
  });

  it('has zero margin of error for single element', () => {
    const result = confidenceInterval([42], 1.96);
    expect(result.lower).toBe(42);
    expect(result.upper).toBe(42);
    expect(result.marginOfError).toBe(0);
  });

  it('returns NaN bounds for empty array', () => {
    const result = confidenceInterval([], 1.96);
    expect(result.lower).toBeNaN();
    expect(result.upper).toBeNaN();
    expect(result.mean).toBeNaN();
    expect(result.marginOfError).toBeNaN();
  });

  it('wider interval with higher z-score', () => {
    const data = [1, 2, 3, 4, 5];
    const lowZ = confidenceInterval(data, 1);
    const highZ = confidenceInterval(data, 2);
    expect(highZ.marginOfError).toBeGreaterThan(lowZ.marginOfError);
  });

  it('narrower interval with more data', () => {
    const smallSample = [1, 2, 3, 4, 5];
    const largeSample = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5];
    const resultSmall = confidenceInterval(smallSample, 1.96);
    const resultLarge = confidenceInterval(largeSample, 1.96);
    // More data should give smaller margin of error (lower std error)
    expect(resultLarge.marginOfError).toBeLessThan(resultSmall.marginOfError);
  });

  it('interval is symmetric around the mean', () => {
    const data = [10, 20, 30, 40, 50];
    const result = confidenceInterval(data, 1.96);
    expect(result.upper - result.mean).toBeCloseTo(result.mean - result.lower);
  });

  it('handles floating-point precision correctly', () => {
    const data = [1.1, 2.2, 3.3, 4.4];
    const result = confidenceInterval(data, 1.96);
    expect(result.lower).toBeLessThan(result.mean);
    expect(result.mean).toBe(2.75);
  });
});
