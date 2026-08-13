import { describe, expect, it } from 'vitest';
import { runAllCombinations } from '../../example-games/main-street/MainStreetMonteCarlo';

/**
 * Per-difficulty design-intent guardrails (CG-0MSRKN325004ELH2).
 *
 * These assertions enforce the *tuned target bands* (design intent) for the
 * greedy AI across all three difficulty presets, using the canonical harness
 * profile (200 seeds, 60 max turns — the same profile recorded in
 * `docs/main-street/monte-carlo-baseline.json`).
 *
 * Band values and their rationale (industry practice + measured data) are
 * documented in `docs/main-street/balance-guardrail-recommendations.md` and
 * mirrored in PRD §3.3 and `scripts/balance/guards/thresholds.ts`.
 *
 * Catch-breakage *regression* guardrails live in separate tests:
 *  - `monte-carlo-guardrails.test.ts` — drift vs the committed baseline
 *    (Medium + per-difficulty matrix);
 *  - `monte-carlo-balance.test.ts`    — wide 20–80% smoke band (market-greedy,
 *    PR CI).
 *
 * Original work item: CG-0MMN8V9UU0MF2GHK (20–80% medium-only assertion,
 * superseded by the per-difficulty design-intent bands below).
 */
const SEEDS = Array.from({ length: 200 }, (_, i) => `mc-balance-${i}`);
const MAX_TURNS = 60;

/** Tuned target win-rate bands per difficulty (design intent). */
const WIN_RATE_BANDS: Record<'Easy' | 'Medium' | 'Hard', { min: number; max: number }> = {
  Easy: { min: 0.6, max: 0.9 },
  Medium: { min: 0.45, max: 0.75 },
  Hard: { min: 0.15, max: 0.4 },
};

describe('Main Street greedy AI per-difficulty design-intent guardrails', () => {
  it('greedy win rate stays within the tuned band on Easy, Medium and Hard', () => {
    const results = runAllCombinations({
      seeds: SEEDS,
      maxTurns: MAX_TURNS,
      strategies: ['greedy'],
    });
    expect(results).toHaveLength(3);

    for (const combo of results) {
      const band = WIN_RATE_BANDS[combo.difficulty];
      expect(combo.metrics.runs).toBe(SEEDS.length);
      // Design intent: a monotone-decreasing win-rate ladder across presets.
      expect(combo.metrics.winRate).toBeGreaterThanOrEqual(band.min);
      expect(combo.metrics.winRate).toBeLessThanOrEqual(band.max);
    }
  });

  it('greedy Medium economy: net liquidity 0–2 and median score 120–180', () => {
    const [medium] = runAllCombinations({
      seeds: SEEDS,
      maxTurns: MAX_TURNS,
      strategies: ['greedy'],
      difficulties: ['Medium'],
    });
    expect(medium.metrics.runs).toBe(SEEDS.length);

    // Producer ruling (CG-0MSP26Q5N002EH8P): net liquidity
    // (avgCoinsPerTurn = finalCoins/turns) must stay in 0–2.
    expect(medium.metrics.averageCoinsPerTurn).toBeGreaterThanOrEqual(0);
    expect(medium.metrics.averageCoinsPerTurn).toBeLessThanOrEqual(2);

    // PRD warning band for Greedy/Medium median score (PRD §3.3).
    expect(medium.metrics.medianScore).toBeGreaterThanOrEqual(120);
    expect(medium.metrics.medianScore).toBeLessThanOrEqual(180);
  });
});
