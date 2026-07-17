/**
 * Gym AI Strategy demo scene unit tests.
 *
 * Validates the demo logic that the GymAiStrategyScene interactive
 * buttons invoke — numeric strategy definitions, AiPlayer wrapping,
 * pickRandom/pickBest utilities, and seeded RNG reproducibility.
 *
 * The scene itself is smoke-tested in GymSceneSmoke.browser.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { AiPlayer } from '../../src/ai/AiStrategy';
import type { AiStrategyBase } from '../../src/ai/AiStrategy';
import { pickRandom, pickBest } from '../../src/ai/AiUtils';
import { createSeededRng } from '../../src/core-engine/SeededRng';

// ── Numeric strategy interface (mirrors the scene's definition) ─────────

interface NumericStrategy extends AiStrategyBase {
  pick(numbers: number[], rng: () => number): number;
}

// ── Strategy implementations ────────────────────────────────────────────

class HighestStrategy implements NumericStrategy {
  readonly name = 'Always Pick Highest';

  pick(numbers: number[], rng: () => number): number {
    const max = Math.max(...numbers);
    const tied = numbers.filter((n) => n === max);
    return pickRandom(tied, rng);
  }
}

class LowestStrategy implements NumericStrategy {
  readonly name = 'Always Pick Lowest';

  pick(numbers: number[], rng: () => number): number {
    const min = Math.min(...numbers);
    const tied = numbers.filter((n) => n === min);
    return pickRandom(tied, rng);
  }
}

class RandomStrategy implements NumericStrategy {
  readonly name = 'Random';

  pick(numbers: number[], rng: () => number): number {
    return pickRandom(numbers, rng);
  }
}

// ── Demo state fixture ──────────────────────────────────────────────────

const DEMO_NUMBERS = [3, 7, 1, 9, 4, 9, 2, 6];

const SCORED_OPTIONS = [
  { label: 'A', score: 10 },
  { label: 'B', score: 25 },
  { label: 'C', score: 15 },
  { label: 'D', score: 25 },
  { label: 'E', score: 5 },
];

// ── Strategy tests ──────────────────────────────────────────────────────

describe('GymAiStrategyScene / Numeric strategies', () => {
  it('HighestStrategy picks the maximum value', () => {
    const rng = createSeededRng(42);
    const strategy = new HighestStrategy();
    const result = strategy.pick(DEMO_NUMBERS, rng);
    expect(result).toBe(9); // max is 9, tied with another 9
  });

  it('HighestStrategy breaks ties using RNG', () => {
    // With a specific seed, the tie between the two 9s should be
    // deterministically resolved.
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);
    const strategy = new HighestStrategy();
    const result1 = strategy.pick(DEMO_NUMBERS, rng1);
    const result2 = strategy.pick(DEMO_NUMBERS, rng2);
    expect(result1).toBe(result2); // deterministic with same seed
  });

  it('LowestStrategy picks the minimum value', () => {
    const rng = createSeededRng(42);
    const strategy = new LowestStrategy();
    const result = strategy.pick(DEMO_NUMBERS, rng);
    expect(result).toBe(1); // min is 1
  });

  it('LowestStrategy breaks ties using RNG', () => {
    const numbersWithTie = [3, 1, 7, 1, 9];
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);
    const strategy = new LowestStrategy();
    const result1 = strategy.pick(numbersWithTie, rng1);
    const result2 = strategy.pick(numbersWithTie, rng2);
    expect(result1).toBe(result2);
  });

  it('RandomStrategy picks a value from the array', () => {
    const rng = createSeededRng(42);
    const strategy = new RandomStrategy();
    const result = strategy.pick(DEMO_NUMBERS, rng);
    expect(DEMO_NUMBERS).toContain(result);
  });

  it('RandomStrategy is deterministic with same seed', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);
    const strategy = new RandomStrategy();
    const result1 = strategy.pick(DEMO_NUMBERS, rng1);
    const result2 = strategy.pick(DEMO_NUMBERS, rng2);
    expect(result1).toBe(result2);
  });

  it('RandomStrategy produces different results with different seeds', () => {
    const strategy = new RandomStrategy();
    const results = new Set<number>();
    // With different seeds, there's a high chance of different first picks
    for (let i = 0; i < 20; i++) {
      results.add(strategy.pick(DEMO_NUMBERS, createSeededRng(42 + i)));
    }
    // Over 20 different seeds, we expect more than 1 unique pick
    expect(results.size).toBeGreaterThan(1);
  });
});

// ── AiPlayer wrapping tests ─────────────────────────────────────────────

describe('GymAiStrategyScene / AiPlayer wrapping', () => {
  it('AiPlayer stores and exposes the strategy name', () => {
    const rng = createSeededRng(42);
    const strategy = new HighestStrategy();
    const player = new AiPlayer(strategy, rng);
    expect(player.strategyName).toBe('Always Pick Highest');
    expect(player.strategy).toBe(strategy);
  });

  it('AiPlayer can switch strategy at runtime', () => {
    const rng = createSeededRng(42);
    let strategy: NumericStrategy = new HighestStrategy();
    const player = new AiPlayer(strategy, rng);

    const highestPick = strategy.pick(DEMO_NUMBERS, player['rng']);
    expect(highestPick).toBe(9);

    // Switch strategy
    strategy = new LowestStrategy();
    (player as any).strategy = strategy;
    expect(player.strategyName).toBe('Always Pick Lowest');

    const lowestPick = strategy.pick(DEMO_NUMBERS, player['rng']);
    expect(lowestPick).toBe(1);
  });

  it('AiPlayer with same strategy and seed produces same pick', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);
    const strategy1 = new HighestStrategy();
    const strategy2 = new HighestStrategy();
    const player1 = new AiPlayer(strategy1, rng1);
    const player2 = new AiPlayer(strategy2, rng2);

    const pick1 = player1.strategy.pick(DEMO_NUMBERS, player1['rng']);
    const pick2 = player2.strategy.pick(DEMO_NUMBERS, player2['rng']);
    expect(pick1).toBe(pick2);
  });
});

// ── pickRandom and pickBest tests ───────────────────────────────────────

describe('GymAiStrategyScene / pickRandom', () => {
  it('pickRandom selects from the array', () => {
    const rng = createSeededRng(42);
    const selected = pickRandom(DEMO_NUMBERS, rng);
    expect(DEMO_NUMBERS).toContain(selected);
  });

  it('pickRandom is deterministic with same seed', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);
    expect(pickRandom(DEMO_NUMBERS, rng1)).toBe(
      pickRandom(DEMO_NUMBERS, rng2),
    );
  });

  it('pickRandom throws on empty array', () => {
    const rng = createSeededRng(42);
    expect(() => pickRandom([], rng)).toThrow('Cannot pick from empty array');
  });
});

describe('GymAiStrategyScene / pickBest', () => {
  it('pickBest selects the highest-scored option', () => {
    const rng = createSeededRng(42);
    const selected = pickBest(
      SCORED_OPTIONS,
      (opt) => opt.score,
      rng,
    );
    expect(selected.score).toBe(25);
  });

  it('pickBest breaks ties deterministically with same seed', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);
    const selected1 = pickBest(SCORED_OPTIONS, (opt) => opt.score, rng1);
    const selected2 = pickBest(SCORED_OPTIONS, (opt) => opt.score, rng2);
    expect(selected1.label).toBe(selected2.label);
  });

  it('pickBest throws on empty array', () => {
    const rng = createSeededRng(42);
    expect(() =>
      pickBest([], (_: never) => 0, rng),
    ).toThrow('No candidates to evaluate');
  });

  it('pickBest works with a custom scoring function', () => {
    const rng = createSeededRng(42);
    // Score by label length
    const selected = pickBest(
      SCORED_OPTIONS,
      (opt) => opt.label.charCodeAt(0),
      rng,
    );
    // 'E' has the highest char code
    expect(selected.label).toBe('E');
  });

  it('pickBest produces different results with different seeds for ties', () => {
    // Both B and D have score 25, so tie-breaking depends on RNG
    const results = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const rng = createSeededRng(100 + i);
      const selected = pickBest(SCORED_OPTIONS, (opt) => opt.score, rng);
      results.add(selected.label);
    }
    // With enough seeds, both tied options should be selected
    expect(results.size).toBeGreaterThan(1);
    expect(results.has('B')).toBe(true);
    expect(results.has('D')).toBe(true);
  });
});

// ── Seeded RNG reproducibility ─────────────────────────────────────────

describe('GymAiStrategyScene / Seeded RNG reproducibility', () => {
  it('same seed produces same sequence across two RNG instances', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);

    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it('different seeds produce different sequences', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(99);

    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());

    // Sequences should differ in at least one position
    const different = seq1.some((v, i) => v !== seq2[i]);
    expect(different).toBe(true);
  });

  it('highest strategy with same seed produces same choices repeatedly', () => {
    const strategy = new HighestStrategy();
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);

    for (let i = 0; i < 5; i++) {
      const pick1 = strategy.pick(DEMO_NUMBERS, rng1);
      const pick2 = strategy.pick(DEMO_NUMBERS, rng2);
      expect(pick1).toBe(pick2);
    }
  });
});

// ── Strategy name display tests ─────────────────────────────────────────

describe('GymAiStrategyScene / Strategy name display', () => {
  it('HighestStrategy has correct display name', () => {
    expect(new HighestStrategy().name).toBe('Always Pick Highest');
  });

  it('LowestStrategy has correct display name', () => {
    expect(new LowestStrategy().name).toBe('Always Pick Lowest');
  });

  it('RandomStrategy has correct display name', () => {
    expect(new RandomStrategy().name).toBe('Random');
  });

  it('AiPlayer exposes strategy name for display', () => {
    const rng = createSeededRng(42);
    const player = new AiPlayer(new HighestStrategy(), rng);
    expect(player.strategyName).toBe('Always Pick Highest');
  });
});
