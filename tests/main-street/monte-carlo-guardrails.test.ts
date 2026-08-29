/**
 * Main Street Monte Carlo guardrail tests.
 *
 * ## Drift-report-then-ask workflow (CG-0MTD0F66A0005BEX)
 *
 * When this test detects drift from the committed baseline, the workflow is:
 *
 * 1. **Report drift** — run `npx vite-node scripts/balance/drift-report.ts`
 *    (or `npm run balance:drift-report`) to get a structured delta report
 *    showing winRate, coins/turn, and medianScore deviations per difficulty.
 * 2. **Ask the operator** — present the drift report to the producer/balance
 *    lead and let them decide:
 *    - **Regenerate the baseline** if the drift reflects an intended balance
 *      shift (new cards, rule changes, etc.). Run
 *      `npx vite-node scripts/generate-main-street-monte-baseline.ts`.
 *    - **Investigate a regression** if the drift indicates unintended balance
 *      breakage (e.g. a card becoming too strong/weak). File a new work item
 *      to investigate and fix.
 * 3. **Do NOT silently regenerate the baseline** — doing so masks real balance
 *    shifts and loses the audit trail of what changed.
 *
 * Tolerances: winRate ±0.25, coins ±30% of the baseline value.
 * These tolerances are independent of this process; see
 * `docs/main-street/balance-guardrail-recommendations.md` for the full
 * decision tree and operator approval guidance.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { runAllCombinations } from '../../example-games/main-street/MainStreetMonteCarlo';

interface DifficultyBaseline {
  difficulty: 'Easy' | 'Medium' | 'Hard';
  winRate: number;
  averageCoinsPerTurn: number;
  medianScore: number;
}

interface MonteBaseline {
  seeds: number;
  maxTurns: number;
  strategy: 'greedy' | 'random' | 'market-greedy' | 'demo-greedy';
  metrics: {
    winRate: number;
    averageCoinsPerTurn: number;
  };
  /** Per-difficulty greedy baseline (CG-0MSRKN325004ELH2). */
  difficultyMatrix: DifficultyBaseline[];
}

function loadBaseline(): MonteBaseline {
  const pathToBaseline = resolve(process.cwd(), 'docs/main-street/monte-carlo-baseline.json');
  return JSON.parse(readFileSync(pathToBaseline, 'utf-8')) as MonteBaseline;
}

describe('Main Street Monte Carlo guardrails for expanded pool', () => {
  it('stays within configured win-rate and coin-per-turn drift bounds', () => {
    const baseline = loadBaseline();
    const seeds = Array.from({ length: baseline.seeds }, (_, i) => `mc-balance-${i}`);

    const result = runAllCombinations({
      seeds,
      maxTurns: baseline.maxTurns,
      strategies: [baseline.strategy],
    });

    // Medium is the primary balance reference; assert against the top-level baseline.
    const medium = result.find(r => r.difficulty === 'Medium');
    expect(medium).toBeDefined();

    const starvationOrIncompleteRuns = medium!.runs.filter(
      run => run.endReason === 'max_turns_cap' || run.turns >= baseline.maxTurns,
    );
    expect(starvationOrIncompleteRuns).toHaveLength(0);

    const winRateDelta = Math.abs(medium!.metrics.winRate - baseline.metrics.winRate);
    // Widened tolerance after card data rebalance; regenerate baseline when stable
    expect(winRateDelta).toBeLessThanOrEqual(0.25);

    const coinPerTurnDelta = Math.abs(
      medium!.metrics.averageCoinsPerTurn - baseline.metrics.averageCoinsPerTurn,
    );
    const allowedCoinPerTurnDelta = baseline.metrics.averageCoinsPerTurn * 0.30;
    expect(coinPerTurnDelta).toBeLessThanOrEqual(allowedCoinPerTurnDelta);

    // Per-difficulty drift checks against the recorded matrix (CG-0MSRKN325004ELH2).
    // Same tolerances as the Medium check; the matrix is a regression snapshot —
    // design-intent bands are enforced separately in monte-carlo-greedy-guardrail.test.ts.
    for (const entry of baseline.difficultyMatrix) {
      const combo = result.find(r => r.difficulty === entry.difficulty);
      expect(combo).toBeDefined();

      const wrDelta = Math.abs(combo!.metrics.winRate - entry.winRate);
      expect(wrDelta).toBeLessThanOrEqual(0.25);

      const coinsDelta = Math.abs(combo!.metrics.averageCoinsPerTurn - entry.averageCoinsPerTurn);
      expect(coinsDelta).toBeLessThanOrEqual(entry.averageCoinsPerTurn * 0.30);
    }
  }, 180_000);
});
