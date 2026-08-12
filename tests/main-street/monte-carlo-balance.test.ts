import { describe, expect, it } from 'vitest';
import { runMonteCarlo } from '../../example-games/main-street/MainStreetMonteCarlo';

// Work item: CG-0MMJ8S8ME1LYX4DJ
// Configurable via env vars:
//   MONTE_SEEDS         — number of deterministic seeds to run (default: 20)
//   MONTE_MIN_WIN_RATE  — minimum acceptable win rate (default: 0.20)
//   MONTE_MAX_WIN_RATE  — maximum acceptable win rate (default: 0.80)
// PR CI uses the defaults; main branch CI overrides to stricter values (200 seeds, 0.30–0.60).
// Minimum seed count for detailed pacing/distribution metric assertions.
// Below this threshold the sample is too small for the tighter bounds to be reliable.
const DETAILED_METRICS_MIN_SEEDS = 50;

const monteSeeds = Number.parseInt(process.env['MONTE_SEEDS'] ?? '20', 10);
const monteMinWinRate = Number.parseFloat(process.env['MONTE_MIN_WIN_RATE'] ?? '0.20');
const monteMaxWinRate = Number.parseFloat(process.env['MONTE_MAX_WIN_RATE'] ?? '0.80');

describe('Main Street Monte Carlo balance heuristics', () => {
  it(`stays within CI guardrails over ${monteSeeds} deterministic seeds`, () => {
    const seeds = Array.from({ length: monteSeeds }, (_, i) => `mc-balance-${i}`);
    const { metrics } = runMonteCarlo({ seeds, maxTurns: 60, strategy: 'market-greedy' });

    expect(metrics.runs).toBe(monteSeeds);
    expect(metrics.winRate).toBeGreaterThanOrEqual(monteMinWinRate);
    expect(metrics.winRate).toBeLessThanOrEqual(monteMaxWinRate);

    // Detailed pacing and distribution metrics require a sufficient sample size to be
    // statistically reliable. These are only asserted for runs of 50+ seeds (i.e., main branch CI).
    if (monteSeeds >= DETAILED_METRICS_MIN_SEEDS) {
      expect(metrics.medianScore).toBeGreaterThanOrEqual(20);
      // Adjusted upper bound to reflect tuned Medium preset which increases
      // positive incidents and thus typical scores. Observed median ~58.
      expect(metrics.medianScore).toBeLessThanOrEqual(65);

      const dominantLossRate = Math.max(0, ...Object.values(metrics.lossReasonRates));
      expect(dominantLossRate).toBeGreaterThanOrEqual(0.75);

      expect(metrics.averageNoActionTurns).toBeGreaterThanOrEqual(6);

      expect(metrics.averageTurnWhenGridHalf).not.toBeNull();
      expect(metrics.averageTurnWhenGridHalf!).toBeGreaterThanOrEqual(11);
      expect(metrics.averageTurnWhenGridHalf!).toBeLessThanOrEqual(15);

      expect(metrics.averageTurnWhenGridFull).not.toBeNull();
      expect(metrics.averageTurnWhenGridFull!).toBeGreaterThanOrEqual(15);
      expect(metrics.averageTurnWhenGridFull!).toBeLessThanOrEqual(19);
    }
  });
});
