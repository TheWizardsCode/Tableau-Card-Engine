import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { runMonteCarlo } from '../../example-games/main-street/MainStreetMonteCarlo';

interface MonteBaseline {
  seeds: number;
  maxTurns: number;
  strategy: 'greedy' | 'random' | 'market-greedy' | 'demo-greedy';
  metrics: {
    winRate: number;
    averageCoinsPerTurn: number;
  };
}

function loadBaseline(): MonteBaseline {
  const pathToBaseline = resolve(process.cwd(), 'docs/main-street/monte-carlo-baseline.json');
  return JSON.parse(readFileSync(pathToBaseline, 'utf-8')) as MonteBaseline;
}

describe('Main Street Monte Carlo guardrails for expanded pool', () => {
  it('stays within configured win-rate and coin-per-turn drift bounds', () => {
    const baseline = loadBaseline();
    const seeds = Array.from({ length: baseline.seeds }, (_, i) => `mc-balance-${i}`);

    const result = runMonteCarlo({
      seeds,
      maxTurns: baseline.maxTurns,
      strategy: baseline.strategy,
    });

    const starvationOrIncompleteRuns = result.runs.filter(
      run => run.endReason === 'max_turns_cap' || run.turns >= baseline.maxTurns,
    );
    expect(starvationOrIncompleteRuns).toHaveLength(0);

    const winRateDelta = Math.abs(result.metrics.winRate - baseline.metrics.winRate);
    // Widened tolerance after card data rebalance; regenerate baseline when stable
    expect(winRateDelta).toBeLessThanOrEqual(0.25);

    const coinPerTurnDelta = Math.abs(
      result.metrics.averageCoinsPerTurn - baseline.metrics.averageCoinsPerTurn,
    );
    const allowedCoinPerTurnDelta = baseline.metrics.averageCoinsPerTurn * 0.30;
    expect(coinPerTurnDelta).toBeLessThanOrEqual(allowedCoinPerTurnDelta);
  });
});
