import { describe, it, expect } from 'vitest';
import { rankValue } from '../../src/card-system/rankValue';
import { RANKS } from '../../src/card-system/Card';
import type { Rank } from '../../src/card-system/Card';

describe('rankValue', () => {
  it('should return 0 for Ace', () => {
    expect(rankValue('A')).toBe(0);
  });

  it('should return 12 for King', () => {
    expect(rankValue('K')).toBe(12);
  });

  it('should return correct values for all ranks', () => {
    const expected: [Rank, number][] = [
      ['A', 0],
      ['2', 1],
      ['3', 2],
      ['4', 3],
      ['5', 4],
      ['6', 5],
      ['7', 6],
      ['8', 7],
      ['9', 8],
      ['10', 9],
      ['J', 10],
      ['Q', 11],
      ['K', 12],
    ];

    for (const [rank, value] of expected) {
      expect(rankValue(rank)).toBe(value);
    }
  });

  it('should be consistent with the RANKS array order', () => {
    for (let i = 0; i < RANKS.length; i++) {
      expect(rankValue(RANKS[i])).toBe(i);
    }
  });

  it('should produce strictly increasing values across RANKS', () => {
    for (let i = 1; i < RANKS.length; i++) {
      expect(rankValue(RANKS[i])).toBeGreaterThan(rankValue(RANKS[i - 1]));
    }
  });
});
