import { describe, it, expect } from 'vitest';
import { pickRandom, pickBest } from '../../src/ai/AiUtils';
import { createSeededRng } from '../../src/core-engine/SeededRng';

// ═══════════════════════════════════════════════════════════
// pickRandom
// ═══════════════════════════════════════════════════════════

describe('pickRandom', () => {
  it('returns the only element for a single-element array', () => {
    const rng = createSeededRng(1);
    expect(pickRandom([42], rng)).toBe(42);
  });

  it('throws on empty array', () => {
    const rng = createSeededRng(1);
    expect(() => pickRandom([], rng)).toThrow('Cannot pick from empty array');
  });

  it('returns an element from the array', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const rng = createSeededRng(7);
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(pickRandom(items, rng));
    }
  });

  it('uses rng to select (deterministic for same seed)', () => {
    const items = [10, 20, 30, 40, 50];
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);
    const seq1 = Array.from({ length: 20 }, () => pickRandom(items, rng1));
    const seq2 = Array.from({ length: 20 }, () => pickRandom(items, rng2));
    expect(seq1).toEqual(seq2);
  });

  it('covers all elements given enough calls', () => {
    const items = [0, 1, 2, 3, 4];
    const seen = new Set<number>();
    const rng = createSeededRng(99);
    for (let i = 0; i < 500; i++) {
      seen.add(pickRandom(items, rng));
    }
    expect(seen.size).toBe(items.length);
  });

  it('works with readonly arrays', () => {
    const items: readonly string[] = ['x', 'y', 'z'];
    const rng = createSeededRng(1);
    expect(items).toContain(pickRandom(items, rng));
  });
});

// ═══════════════════════════════════════════════════════════
// pickBest
// ═══════════════════════════════════════════════════════════

describe('pickBest', () => {
  it('returns the highest-scoring candidate', () => {
    const rng = createSeededRng(1);
    const result = pickBest([1, 5, 3, 2, 4], x => x, rng);
    expect(result).toBe(5);
  });

  it('throws on empty candidates', () => {
    const rng = createSeededRng(1);
    expect(() => pickBest([], () => 0, rng)).toThrow('No candidates to evaluate');
  });

  it('breaks ties using rng (deterministic)', () => {
    // All candidates have equal score
    const candidates = ['a', 'b', 'c', 'd'];
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);
    const result1 = pickBest(candidates, () => 1, rng1);
    const result2 = pickBest(candidates, () => 1, rng2);
    expect(result1).toBe(result2);
  });

  it('returns the single candidate when only one exists', () => {
    const rng = createSeededRng(1);
    expect(pickBest(['only'], () => 0, rng)).toBe('only');
  });

  it('uses the scoring function correctly', () => {
    const items = [
      { name: 'low', value: 1 },
      { name: 'high', value: 100 },
      { name: 'mid', value: 50 },
    ];
    const rng = createSeededRng(1);
    const result = pickBest(items, item => item.value, rng);
    expect(result.name).toBe('high');
  });

  it('selects among tied winners (coverage check)', () => {
    // Two items tied at max score; verify both can be selected
    const items = ['A', 'B'];
    const picked = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      picked.add(pickBest(items, () => 10, createSeededRng(seed)));
    }
    expect(picked.size).toBe(2);
  });

  it('ignores lower-scoring candidates', () => {
    const rng = createSeededRng(1);
    const result = pickBest(
      [10, 20, 30],
      x => (x === 30 ? 100 : 0),
      rng,
    );
    expect(result).toBe(30);
  });

  it('works with negative scores', () => {
    const rng = createSeededRng(1);
    const result = pickBest(
      ['bad', 'worse', 'worst'],
      (s) => (s === 'bad' ? -1 : s === 'worse' ? -10 : -100),
      rng,
    );
    expect(result).toBe('bad');
  });
});
