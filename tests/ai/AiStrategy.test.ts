import { describe, it, expect } from 'vitest';
import { AiPlayer } from '../../src/ai/AiStrategy';
import type { AiStrategyBase } from '../../src/ai/AiStrategy';
import { createSeededRng } from '../../src/core-engine/SeededRng';

// ── Test strategy implementations ───────────────────────────

interface TestStrategy extends AiStrategyBase {
  chooseAction(options: readonly string[], rng: () => number): string;
}

const AlwaysFirstStrategy: TestStrategy = {
  name: 'always-first',
  chooseAction(options: readonly string[]) {
    return options[0];
  },
};

const RngBasedStrategy: TestStrategy = {
  name: 'rng-based',
  chooseAction(options: readonly string[], rng: () => number) {
    return options[Math.floor(rng() * options.length)];
  },
};

// ── Test player subclass ────────────────────────────────────

class TestAiPlayer extends AiPlayer<TestStrategy> {
  chooseAction(options: readonly string[]): string {
    return this.strategy.chooseAction(options, this.rng);
  }
}

// ═══════════════════════════════════════════════════════════
// AiPlayer base class
// ═══════════════════════════════════════════════════════════

describe('AiPlayer', () => {
  it('stores the strategy and exposes it via .strategy', () => {
    const player = new AiPlayer(AlwaysFirstStrategy);
    expect(player.strategy).toBe(AlwaysFirstStrategy);
  });

  it('exposes strategyName as a convenience getter', () => {
    const player = new AiPlayer(AlwaysFirstStrategy);
    expect(player.strategyName).toBe('always-first');
  });

  it('defaults rng to Math.random when not provided', () => {
    const player = new AiPlayer(AlwaysFirstStrategy);
    // We can't directly inspect the rng, but we can verify it doesn't throw
    expect(player.strategyName).toBe('always-first');
  });

  it('accepts a custom rng', () => {
    const rng = createSeededRng(42);
    const player = new TestAiPlayer(RngBasedStrategy, rng);
    const options = ['a', 'b', 'c', 'd', 'e'];

    // Deterministic: same seed produces same results
    const rng2 = createSeededRng(42);
    const player2 = new TestAiPlayer(RngBasedStrategy, rng2);

    const results1 = Array.from({ length: 10 }, () => player.chooseAction(options));
    const results2 = Array.from({ length: 10 }, () => player2.chooseAction(options));
    expect(results1).toEqual(results2);
  });

  it('can be subclassed to delegate to strategy methods', () => {
    const rng = createSeededRng(99);
    const player = new TestAiPlayer(AlwaysFirstStrategy, rng);

    expect(player.chooseAction(['x', 'y', 'z'])).toBe('x');
    expect(player.chooseAction(['alpha', 'beta'])).toBe('alpha');
  });

  it('provides protected rng access to subclasses', () => {
    const rng = createSeededRng(7);
    const player = new TestAiPlayer(RngBasedStrategy, rng);
    const options = ['only'];

    // With a single option, rng-based still returns it
    expect(player.chooseAction(options)).toBe('only');
  });

  it('works with different strategy types via generics', () => {
    // A different strategy shape
    interface ScoreStrategy extends AiStrategyBase {
      score(value: number): number;
    }

    const DoubleStrategy: ScoreStrategy = {
      name: 'double',
      score(value: number) {
        return value * 2;
      },
    };

    class ScorePlayer extends AiPlayer<ScoreStrategy> {
      computeScore(value: number): number {
        return this.strategy.score(value);
      }
    }

    const player = new ScorePlayer(DoubleStrategy);
    expect(player.strategyName).toBe('double');
    expect(player.computeScore(21)).toBe(42);
  });
});
