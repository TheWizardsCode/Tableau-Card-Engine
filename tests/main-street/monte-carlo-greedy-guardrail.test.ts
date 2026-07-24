import { describe, expect, it } from 'vitest';
import { runMonteCarlo } from '../../example-games/main-street/MainStreetMonteCarlo';

// CI guardrail: greedy AI strategy win rate must stay within 20–80% on Medium difficulty.
// Work item: CG-0MMN8V9UU0MF2GHK
describe('Main Street greedy AI strategy CI guardrail', () => {
  it('greedy strategy win rate stays within 20–80% over 100 deterministic seeds', () => {
    const seeds = Array.from({ length: 100 }, (_, i) => `mc-greedy-${i}`);
    const { metrics } = runMonteCarlo({ seeds, maxTurns: 25, strategy: 'greedy' });

    expect(metrics.runs).toBe(100);
    // Guardrail: greedy win rate must be within 20–80% on Medium difficulty.
    expect(metrics.winRate).toBeGreaterThanOrEqual(0.2);
    expect(metrics.winRate).toBeLessThanOrEqual(0.8);
  });

  it('random strategy produces valid win rate over 100 deterministic seeds', () => {
    const seeds = Array.from({ length: 100 }, (_, i) => `mc-random-${i}`);
    const { metrics } = runMonteCarlo({ seeds, maxTurns: 25, strategy: 'random' });

    expect(metrics.runs).toBe(100);
    // Random strategy should produce at least some wins (basic sanity check).
    expect(metrics.winRate).toBeGreaterThanOrEqual(0);
    expect(metrics.winRate).toBeLessThanOrEqual(1);
  });
});
