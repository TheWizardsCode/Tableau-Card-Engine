import { describe, expect, it } from 'vitest';
import { runMonteCarlo } from '../../example-games/main-street/MainStreetMonteCarlo';

// Work item: CG-0MMJ8S8ME1LYX4DJ
describe('Main Street Monte Carlo balance heuristics', () => {
  it('stays within CI guardrails over 100 deterministic seeds', () => {
    const seeds = Array.from({ length: 100 }, (_, i) => `mc-balance-${i}`);
    const { metrics } = runMonteCarlo({ seeds, maxTurns: 25, strategy: 'market-greedy' });

    expect(metrics.runs).toBe(100);
    expect(metrics.winRate).toBeGreaterThanOrEqual(0.3);
    expect(metrics.winRate).toBeLessThanOrEqual(0.5);

    expect(metrics.medianScore).toBeGreaterThanOrEqual(20);
    expect(metrics.medianScore).toBeLessThanOrEqual(40);

    const dominantLossRate = Math.max(0, ...Object.values(metrics.lossReasonRates));
    expect(dominantLossRate).toBeGreaterThanOrEqual(0.75);

    expect(metrics.averageNoActionTurns).toBeGreaterThanOrEqual(6);

    expect(metrics.averageTurnWhenGridHalf).not.toBeNull();
    expect(metrics.averageTurnWhenGridHalf!).toBeGreaterThanOrEqual(11);
    expect(metrics.averageTurnWhenGridHalf!).toBeLessThanOrEqual(15);

    expect(metrics.averageTurnWhenGridFull).not.toBeNull();
    expect(metrics.averageTurnWhenGridFull!).toBeGreaterThanOrEqual(15);
    expect(metrics.averageTurnWhenGridFull!).toBeLessThanOrEqual(19);
  });
});
