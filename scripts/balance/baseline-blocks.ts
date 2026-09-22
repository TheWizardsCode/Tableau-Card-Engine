/**
 * Baseline-block selection for the Main Street Monte Carlo drift tooling.
 *
 * `docs/main-street/monte-carlo-baseline.json` records the greedy baseline at
 * the top level and the additive banking-aware snapshot under `bankingGreedy`
 * (CG-0MT3JMGA60091J8W AC5). These helpers resolve one strategy's block so the
 * drift report (`scripts/balance/drift-report.ts`) and its tests share a single
 * definition of the baseline schema.
 */

import type { MonteCarloStrategy } from '../../example-games/main-street/MainStreetMonteCarlo';

export interface DifficultyBaseline {
  difficulty: 'Easy' | 'Medium' | 'Hard';
  winRate: number;
  averageCoinsPerTurn: number;
  medianScore: number;
}

/**
 * One strategy's recorded snapshot — the greedy top-level block, or the
 * additive `bankingGreedy` block.
 */
export interface BaselineBlock {
  source?: string;
  generatedAt?: string;
  strategy: MonteCarloStrategy;
  metrics: {
    winRate: number;
    averageCoinsPerTurn: number;
  };
  difficultyMatrix: DifficultyBaseline[];
}

export interface MonteBaseline extends BaselineBlock {
  seeds: number;
  maxTurns: number;
  /**
   * Additive banking-aware regression snapshot
   * (CG-0MT3JMGA60091J8W AC5). Never replaces the greedy block above.
   */
  bankingGreedy?: BaselineBlock;
}

/**
 * Selects the recorded snapshot for the requested strategy.
 *
 * Defaults to the top-level block (the greedy baseline); `banking-greedy`
 * resolves to the additive `bankingGreedy` block. Any other strategy without a
 * recorded block — or a `banking-greedy` request against a baseline that
 * predates the additive snapshot — throws, so the CLI fails loudly instead of
 * silently comparing against the wrong strategy.
 */
export function selectBaselineBlock(baseline: MonteBaseline, strategy?: string): BaselineBlock {
  if (!strategy || strategy === baseline.strategy) return baseline;
  if (strategy === 'banking-greedy' && baseline.bankingGreedy) return baseline.bankingGreedy;
  throw new Error(
    `No baseline block for strategy "${strategy}" in docs/main-street/monte-carlo-baseline.json`,
  );
}
