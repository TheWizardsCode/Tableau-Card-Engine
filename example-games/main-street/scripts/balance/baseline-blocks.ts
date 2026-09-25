/**
 * Baseline-block selection for the Main Street Monte Carlo drift tooling.
 *
 * `docs/main-street/monte-carlo-baseline.json` records the greedy baseline at
 * the top level and the additive banking-aware snapshot under `bankingGreedy`
 * (CG-0MT3JMGA60091J8W AC5). These helpers resolve one strategy's block so the
 * drift report (`scripts/balance/drift-report.ts`) and its tests share a single
 * definition of the baseline schema.
 */

import type { MonteCarloStrategy } from '../../MainStreetMonteCarlo';
import { execSync } from 'node:child_process';

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
  /**
   * Commit SHA the snapshot was generated from (AC4, CG-0MUE03DGQ005KPZ7).
   * Recorded so `baseline → control → current` attribution is reproducible and
   * a stale figure cannot be mistaken for the current dev state.
   */
  commitSha?: string;
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

/**
 * Returns the current git commit SHA (short form), or `undefined` when git is
 * unavailable (e.g. a source export). Used to stamp baselines and drift
 * reports with the exact commit under test (AC4, CG-0MUE03DGQ005KPZ7).
 *
 * The lookup is best-effort: a failure never blocks a drift report.
 */
export function currentCommitSha(): string | undefined {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

export function currentCommitShaFull(): string | undefined {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}
