import { describe, it, expect } from 'vitest';

describe('AI module barrel exports', () => {
  it('exports AiPlayer class', async () => {
    const mod = await import('../../src/ai/index');
    expect(mod.AiPlayer).toBeDefined();
    expect(typeof mod.AiPlayer).toBe('function');
  });

  it('exports pickRandom function', async () => {
    const mod = await import('../../src/ai/index');
    expect(mod.pickRandom).toBeDefined();
    expect(typeof mod.pickRandom).toBe('function');
  });

  it('exports pickBest function', async () => {
    const mod = await import('../../src/ai/index');
    expect(mod.pickBest).toBeDefined();
    expect(typeof mod.pickBest).toBe('function');
  });

  it('AiStrategyBase is usable as a type (compile-time check)', async () => {
    // AiStrategyBase is exported as `export type`, so it won't appear
    // as a runtime value. We verify the barrel re-exports AiPlayer
    // which requires AiStrategyBase to be importable for generics.
    const mod = await import('../../src/ai/index');
    const player = new mod.AiPlayer({ name: 'test' });
    expect(player.strategyName).toBe('test');
  });

  it('AiPlayer instances work through barrel import', async () => {
    const { AiPlayer, pickRandom } = await import('../../src/ai/index');
    const strategy = { name: 'barrel-test' };
    let callCount = 0;
    const rng = () => {
      callCount++;
      return 0.5;
    };
    const player = new AiPlayer(strategy, rng);
    expect(player.strategyName).toBe('barrel-test');

    // Verify pickRandom also works through barrel
    const result = pickRandom(['a', 'b', 'c'], rng);
    expect(['a', 'b', 'c']).toContain(result);
  });
});
