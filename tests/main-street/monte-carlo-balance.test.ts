import { describe, expect, it } from 'vitest';
import { runMonteCarlo } from '../../example-games/main-street/MainStreetMonteCarlo';

// Work item: CG-0MMJ8S8ME1LYX4DJ
// Configurable via env vars:
//   MONTE_SEEDS         — number of deterministic seeds to run (default: 20)
//   MONTE_MIN_WIN_RATE  — minimum acceptable win rate (default: 0.20)
//   MONTE_MAX_WIN_RATE  — maximum acceptable win rate (default: 0.90)
//
// This is the *regression guardrail* for the whole game (market-greedy smoke
// strategy): a deliberately wide band that catches gross breakage without
// being flaky at the 20-seed PR-CI seed count. The 0.90 cap was raised from
// 0.80 by the CG-0MSVYPEZ90085SHE re-baseline (business ongoing costs +
// income raise): hand costs make winning market-greedy runs reach the score
// threshold more reliably (measured 0.79–0.85 post-rebalance on the
// mc-balance seed set).
//
// The *tuned target* bands (design intent, per difficulty) are enforced
// separately in monte-carlo-greedy-guardrail.test.ts; see
// docs/main-street/balance-guardrail-recommendations.md.
//
// Minimum seed count for detailed pacing/distribution metric assertions.
// Below this threshold the sample is too small for the tighter bounds to be reliable.
const DETAILED_METRICS_MIN_SEEDS = 50;

const monteSeeds = Number.parseInt(process.env['MONTE_SEEDS'] ?? '20', 10);
const monteMinWinRate = Number.parseFloat(process.env['MONTE_MIN_WIN_RATE'] ?? '0.20');
const monteMaxWinRate = Number.parseFloat(process.env['MONTE_MAX_WIN_RATE'] ?? '0.90');

describe('Main Street Monte Carlo balance heuristics', () => {
  it(`stays within CI guardrails over ${monteSeeds} deterministic seeds`, () => {
    const seeds = Array.from({ length: monteSeeds }, (_, i) => `mc-balance-${i}`);
    const { metrics } = runMonteCarlo({ seeds, maxTurns: 60, strategy: 'market-greedy' });

    expect(metrics.runs).toBe(monteSeeds);
    expect(metrics.winRate).toBeGreaterThanOrEqual(monteMinWinRate);
    expect(metrics.winRate).toBeLessThanOrEqual(monteMaxWinRate);

    // Detailed pacing and distribution metrics require a sufficient sample size to be
    // statistically reliable. These are only asserted for runs of 50+ seeds (local dev
    // runs with MONTE_SEEDS>=50; PR CI at 20 seeds skips them).
    //
    // Bounds recalibrated by CG-0MSVYPEZ90085SHE (business ongoing costs +
    // income raise): hand costs speed up games (winning runs end ~10 turns),
    // so grids fill earlier than the long-game baseline. Measured on the
    // canonical 200-seed set: noAction 4.83, gridHalf 7.92, gridFull 13.02.
    //
    // Note: medianScore is intentionally NOT asserted here — the market-greedy score
    // distribution is bimodal (loss cluster ~10-60 vs win cluster ~140+), so the median
    // jumps discontinuously once the win rate crosses 50%, making any fixed band flaky.
    // Median score bands for the primary balance strategy (greedy/Medium, 120-180) are
    // enforced in monte-carlo-greedy-guardrail.test.ts.
    if (monteSeeds >= DETAILED_METRICS_MIN_SEEDS) {
      const dominantLossRate = Math.max(0, ...Object.values(metrics.lossReasonRates));
      expect(dominantLossRate).toBeGreaterThanOrEqual(0.75);

      expect(metrics.averageNoActionTurns).toBeGreaterThanOrEqual(3);

      expect(metrics.averageTurnWhenGridHalf).not.toBeNull();
      expect(metrics.averageTurnWhenGridHalf!).toBeGreaterThanOrEqual(6);
      expect(metrics.averageTurnWhenGridHalf!).toBeLessThanOrEqual(10);

      expect(metrics.averageTurnWhenGridFull).not.toBeNull();
      expect(metrics.averageTurnWhenGridFull!).toBeGreaterThanOrEqual(11);
      expect(metrics.averageTurnWhenGridFull!).toBeLessThanOrEqual(16);
    }
  });
});
