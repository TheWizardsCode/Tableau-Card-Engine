import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

import { selectBaselineBlock, currentCommitSha, currentCommitShaFull } from '../../example-games/main-street/scripts/balance/baseline-blocks';
import type { MonteBaseline } from '../../example-games/main-street/scripts/balance/baseline-blocks';

/**
 * Baseline-block selection for the Monte Carlo drift tooling
 * (CG-0MT3JMGA60091J8W AC5).
 *
 * The committed baseline records the greedy snapshot at the top level and the
 * banking-aware snapshot beside it (`bankingGreedy`). These tests pin the
 * selection contract the drift report relies on: the default stays greedy, the
 * banking-aware variant resolves to its own block, and an unknown or missing
 * strategy fails loudly instead of silently comparing against the wrong
 * strategy.
 */

const DIFFICULTY_MATRIX = [
  { difficulty: 'Easy' as const, winRate: 0.9, averageCoinsPerTurn: 900, medianScore: 11_000 },
  { difficulty: 'Medium' as const, winRate: 0.85, averageCoinsPerTurn: 700, medianScore: 13_000 },
  { difficulty: 'Hard' as const, winRate: 0.6, averageCoinsPerTurn: 450, medianScore: 15_000 },
];

function makeBaseline(withBankingGreedy = true): MonteBaseline {
  return {
    seeds: 200,
    maxTurns: 60,
    strategy: 'greedy',
    metrics: { winRate: 0.83, averageCoinsPerTurn: 640 },
    difficultyMatrix: DIFFICULTY_MATRIX,
    ...(withBankingGreedy
      ? {
          bankingGreedy: {
            strategy: 'banking-greedy' as const,
            metrics: { winRate: 0.845, averageCoinsPerTurn: 720 },
            difficultyMatrix: DIFFICULTY_MATRIX,
          },
        }
      : {}),
  };
}

describe('selectBaselineBlock', () => {
  it('defaults to the top-level block so existing greedy runs are unchanged', () => {
    const block = selectBaselineBlock(makeBaseline());
    expect(block.strategy).toBe('greedy');
    expect(block.metrics.winRate).toBe(0.83);
  });

  it('resolves an explicit request for the top-level strategy to the greedy block', () => {
    const block = selectBaselineBlock(makeBaseline(), 'greedy');
    expect(block.strategy).toBe('greedy');
    expect(block.metrics.averageCoinsPerTurn).toBe(640);
  });

  it('resolves banking-greedy to its additive snapshot, not the greedy baseline', () => {
    const block = selectBaselineBlock(makeBaseline(), 'banking-greedy');
    expect(block.strategy).toBe('banking-greedy');
    expect(block.metrics.winRate).toBe(0.845);
    expect(block.difficultyMatrix).toHaveLength(3);
  });

  it('throws when no block is recorded for the requested strategy', () => {
    expect(() => selectBaselineBlock(makeBaseline(), 'random')).toThrow(/No baseline block for strategy "random"/);
  });

  it('throws for banking-greedy when the baseline predates the additive snapshot', () => {
    expect(() => selectBaselineBlock(makeBaseline(false), 'banking-greedy')).toThrow(
      /No baseline block for strategy "banking-greedy"/,
    );
  });

  it('resolves both blocks from the committed baseline artifact', () => {
    const baseline = JSON.parse(
      readFileSync(resolve(process.cwd(), 'docs/main-street/monte-carlo-baseline.json'), 'utf-8'),
    ) as MonteBaseline;

    // The greedy entry point is never replaced by the banking-aware variant.
    expect(selectBaselineBlock(baseline).strategy).toBe('greedy');
    expect(selectBaselineBlock(baseline).metrics).toEqual(baseline.metrics);

    const banking = selectBaselineBlock(baseline, 'banking-greedy');
    expect(banking.strategy).toBe('banking-greedy');
    expect(banking.metrics).toEqual(baseline.bankingGreedy?.metrics);
    expect(banking.difficultyMatrix.map(entry => entry.difficulty)).toEqual(['Easy', 'Medium', 'Hard']);
  });
});

/**
 * Commit-SHA stamping (AC4, CG-0MUE03DGQ005KPZ7).
 *
 * Drift reports and regenerated baselines must record the commit under test so
 * a `baseline → control → current` attribution is reproducible. These tests pin
 * the helper contract: the short SHA is the 7+ char abbreviation of the full
 * SHA, and both match `git rev-parse`.
 */
describe('commit SHA stamping', () => {
  const fullSha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();

  it('currentCommitShaFull returns the repo HEAD SHA', () => {
    expect(currentCommitShaFull()).toBe(fullSha);
  });

  it('currentCommitSha returns the abbreviated form of the same HEAD', () => {
    const short = currentCommitSha();
    expect(short).toBeTruthy();
    expect(fullSha.startsWith(short as string)).toBe(true);
    expect((short as string).length).toBeGreaterThanOrEqual(7);
    expect((short as string).length).toBeLessThan(fullSha.length);
  });
});
