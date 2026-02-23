import { describe, it, expect } from 'vitest';
import { createSeededRng } from '../../src/core-engine/SeededRng';

describe('createSeededRng', () => {
  it('produces deterministic sequences for the same seed', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);
    const seq1 = Array.from({ length: 20 }, () => rng1());
    const seq2 = Array.from({ length: 20 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(99);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).not.toEqual(seq2);
  });

  it('returns values in [0, 1)', () => {
    const rng = createSeededRng(123);
    for (let i = 0; i < 1000; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('produces values in [0, 1) for negative seeds', () => {
    const rng = createSeededRng(-7);
    for (let i = 0; i < 100; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('produces values in [0, 1) for seed 0', () => {
    const rng = createSeededRng(0);
    for (let i = 0; i < 100; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('has reasonable distribution (no extreme clustering)', () => {
    const rng = createSeededRng(777);
    const buckets = new Array(10).fill(0);
    const n = 10000;
    for (let i = 0; i < n; i++) {
      const bucket = Math.floor(rng() * 10);
      buckets[bucket]++;
    }
    // Each bucket should have roughly n/10 = 1000 values.
    // Allow a generous margin of +/- 30%.
    for (const count of buckets) {
      expect(count).toBeGreaterThan(n / 10 * 0.7);
      expect(count).toBeLessThan(n / 10 * 1.3);
    }
  });

  it('is compatible with shuffleArray (same contract as Math.random)', () => {
    // Verify the function returns a plain number each call
    const rng = createSeededRng(1);
    const val = rng();
    expect(typeof val).toBe('number');
    expect(Number.isFinite(val)).toBe(true);
  });

  it('handles large seeds correctly', () => {
    const rng = createSeededRng(Number.MAX_SAFE_INTEGER);
    for (let i = 0; i < 100; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });
});
