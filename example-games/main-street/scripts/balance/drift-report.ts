#!/usr/bin/env tsx
/**
 * Drift report — compare current Monte Carlo results against the committed baseline.
 *
 * Usage:
 *   npx vite-node scripts/balance/drift-report.ts [--json] [--difficulties easy,medium,hard]
 *   npx vite-node scripts/balance/drift-report.ts --strategy=banking-greedy       # banking-aware snapshot
 *   npm run balance:drift-report -- --json
 *
 * `--strategy` selects which recorded snapshot to compare against: the
 * top-level block (the default greedy baseline) or the additive
 * `bankingGreedy` block (CG-0MT3JMGA60091J8W AC5).
 *
 * Reuses `runAllCombinations` from `MainStreetMonteCarlo` to ensure
 * consistency with the guardrail test harness (CG-0MTD0F66A0005BEX).
 *
 * Outputs per-difficulty drift deltas (winRate, coins/turn, medianScore) with
 * percentage deviation, in human-readable or JSON format.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAllCombinations } from '../../MainStreetMonteCarlo';
import type { DifficultyName } from '../../MainStreetDifficulty';
import { selectBaselineBlock, currentCommitShaFull } from './baseline-blocks';
import type { BaselineBlock, MonteBaseline } from './baseline-blocks';

// ---------------------------------------------------------------------------
// Types (mirrors the baseline schema)
// ---------------------------------------------------------------------------

interface DriftEntry {
  difficulty: string;
  current: {
    winRate: number;
    averageCoinsPerTurn: number;
    medianScore: number;
  };
  baseline: {
    winRate: number;
    averageCoinsPerTurn: number;
    medianScore: number;
  };
  delta: {
    winRate: number;
    averageCoinsPerTurn: number;
    medianScore: number;
  };
  pctChange: {
    winRate: number;
    averageCoinsPerTurn: number;
    medianScore: number;
  };
  exceedsTolerance: boolean;
}

interface DriftReport {
  timestamp: string;
  /** Full commit SHA of the checkout under test (AC4, CG-0MUE03DGQ005KPZ7). */
  currentCommitSha: string | null;
  baseline: {
    winRate: number;
    averageCoinsPerTurn: number;
    medianScore: number | null;
    generatedAt: string | undefined;
    commitSha: string | undefined;
    seeds: number;
    maxTurns: number;
    strategy: string;
  };
  current: {
    winRate: number;
    averageCoinsPerTurn: number;
    medianScore: number | null;
  };
  currentMeta: {
    seeds: number;
    maxTurns: number;
    strategy: string;
  };
  perDifficulty: DriftEntry[];
  summary: {
    totalDifficulties: number;
    drifted: number;
    maxWinRateDrift: number;
    maxCoinsDrift: number;
    maxMedianScoreDrift: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadBaseline(): MonteBaseline {
  const pathToBaseline = resolve(process.cwd(), 'docs/main-street/monte-carlo-baseline.json');
  return JSON.parse(readFileSync(pathToBaseline, 'utf-8')) as MonteBaseline;
}

function pctChange(current: number, baseline: number): number {
  if (baseline === 0) return current === 0 ? 0 : Infinity;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

/**
 * Run the Monte Carlo simulation and return per-difficulty results.
 */
// ---------------------------------------------------------------------------
// Format output
// ---------------------------------------------------------------------------

function formatDriftReport(report: DriftReport, asJson = false): string {
  if (asJson) {
    return JSON.stringify(report, null, 2);
  }

  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('  Monte Carlo Drift Report');
  lines.push(`  Generated: ${report.timestamp}`);
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');

  lines.push(`Baseline: ${report.baseline.strategy}, ${report.baseline.seeds} seeds, ${report.baseline.maxTurns} max turns`);
  if (report.baseline.generatedAt) {
    lines.push(`  Baseline generated: ${report.baseline.generatedAt}`);
  }
  if (report.baseline.commitSha) {
    lines.push(`  Baseline commit: ${report.baseline.commitSha}`);
  }
  lines.push(`  Baseline winRate: ${report.baseline.winRate.toFixed(4)}`);
  lines.push(`  Baseline avg coins/turn: ${report.baseline.averageCoinsPerTurn.toFixed(4)}`);
  lines.push('');

  lines.push(`Current: ${report.currentMeta.strategy}, ${report.currentMeta.seeds} seeds, ${report.currentMeta.maxTurns} max turns`);
  lines.push(`  Current commit: ${report.currentCommitSha ?? 'unknown (git unavailable)'}`);
  lines.push(`  Current winRate: ${report.current.winRate.toFixed(4)}`);
  lines.push(`  Current avg coins/turn: ${report.current.averageCoinsPerTurn.toFixed(4)}`);
  lines.push('');

  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  Per-Difficulty Drift');
  lines.push('───────────────────────────────────────────────────────────');

  for (const entry of report.perDifficulty) {
    const toleranceFlag = entry.exceedsTolerance ? ' ⚠️ EXCEEDS TOLERANCE' : '';
    lines.push('');
    lines.push(`  ${entry.difficulty}${toleranceFlag}`);
    lines.push('  ─────────────────────────────────');
    lines.push(`    winRate:       ${entry.current.winRate.toFixed(4)}  (baseline: ${entry.baseline.winRate.toFixed(4)})  Δ=${entry.delta.winRate.toFixed(4)} (${entry.pctChange.winRate >= 0 ? '+' : ''}${entry.pctChange.winRate.toFixed(1)}%)`);
    lines.push(`    coins/turn:    ${entry.current.averageCoinsPerTurn.toFixed(4)}  (baseline: ${entry.baseline.averageCoinsPerTurn.toFixed(4)})  Δ=${entry.delta.averageCoinsPerTurn.toFixed(4)} (${entry.pctChange.averageCoinsPerTurn >= 0 ? '+' : ''}${entry.pctChange.averageCoinsPerTurn.toFixed(1)}%)`);
    lines.push(`    medianScore:   ${entry.current.medianScore.toFixed(2)}  (baseline: ${entry.baseline.medianScore.toFixed(2)})  Δ=${entry.delta.medianScore.toFixed(2)} (${entry.pctChange.medianScore >= 0 ? '+' : ''}${entry.pctChange.medianScore.toFixed(1)}%)`);
  }

  lines.push('');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  Summary');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push(`  Difficulties checked: ${report.summary.totalDifficulties}`);
  lines.push(`  Drifting (exceeds tolerance): ${report.summary.drifted}`);
  lines.push(`  Max winRate drift: ${report.summary.maxWinRateDrift.toFixed(4)}`);
  lines.push(`  Max coins/turn drift: ${report.summary.maxCoinsDrift.toFixed(4)}`);
  lines.push(`  Max medianScore drift: ${report.summary.maxMedianScoreDrift.toFixed(2)}`);
  lines.push('');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  Action: review drift, decide regenerate vs investigate');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const difficultiesArg = args.find(a => a.startsWith('--difficulties='));
  const difficulties = difficultiesArg
    ? difficultiesArg.split('=')[1].split(',').map(d => d.trim() as DifficultyName)
    : undefined;
  const strategyArg = args.find(a => a.startsWith('--strategy='));
  const requestedStrategy = strategyArg ? strategyArg.split('=')[1].trim() : undefined;

  // Load baseline
  let baseline: MonteBaseline;
  try {
    baseline = loadBaseline();
  } catch (err) {
    console.error(`Error: could not load baseline from docs/main-street/monte-carlo-baseline.json`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Resolve which recorded snapshot to compare against.
  let block: BaselineBlock;
  try {
    block = selectBaselineBlock(baseline, requestedStrategy);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  console.error(`Running Monte Carlo simulation: ${baseline.seeds} seeds, ${block.strategy} strategy, ${baseline.maxTurns} max turns...`);
  if (difficulties) {
    console.error(`  Filtering to difficulties: ${difficulties.join(', ')}`);
  }

  // Run simulation and compute drift
  const seeds = Array.from({ length: baseline.seeds }, (_, i) => `mc-balance-${i}`);
  const allResults = runAllCombinations({
    seeds,
    maxTurns: baseline.maxTurns,
    strategies: [block.strategy],
    difficulties,
  });

  const perDifficulty: DriftEntry[] = [];

  for (const combo of allResults) {
    const baselineEntry = block.difficultyMatrix.find(
      d => d.difficulty === combo.difficulty,
    );
    if (!baselineEntry) {
      console.error(`Warning: no baseline entry for difficulty "${combo.difficulty}", skipping.`);
      continue;
    }

    const deltaWr = combo.metrics.winRate - baselineEntry.winRate;
    const deltaCoins = combo.metrics.averageCoinsPerTurn - baselineEntry.averageCoinsPerTurn;
    const deltaScore = combo.metrics.medianScore - baselineEntry.medianScore;

    // Tolerance checks (same as guardrail test)
    const wrTolerance = 0.25;
    const coinsTolerance = baselineEntry.averageCoinsPerTurn * 0.30;

    const exceedsTolerance = Math.abs(deltaWr) > wrTolerance || Math.abs(deltaCoins) > coinsTolerance;

    perDifficulty.push({
      difficulty: combo.difficulty,
      current: {
        winRate: combo.metrics.winRate,
        averageCoinsPerTurn: combo.metrics.averageCoinsPerTurn,
        medianScore: combo.metrics.medianScore,
      },
      baseline: {
        winRate: baselineEntry.winRate,
        averageCoinsPerTurn: baselineEntry.averageCoinsPerTurn,
        medianScore: baselineEntry.medianScore,
      },
      delta: {
        winRate: deltaWr,
        averageCoinsPerTurn: deltaCoins,
        medianScore: deltaScore,
      },
      pctChange: {
        winRate: pctChange(combo.metrics.winRate, baselineEntry.winRate),
        averageCoinsPerTurn: pctChange(combo.metrics.averageCoinsPerTurn, baselineEntry.averageCoinsPerTurn),
        medianScore: pctChange(combo.metrics.medianScore, baselineEntry.medianScore),
      },
      exceedsTolerance,
    });
  }

  const mediumCurrent = allResults.find(r => r.difficulty === 'Medium')!;
  const mediumBaseline = block.difficultyMatrix.find(d => d.difficulty === 'Medium')!;

  const report: DriftReport = {
    timestamp: new Date().toISOString(),
    currentCommitSha: currentCommitShaFull() ?? null,
    baseline: {
      winRate: block.metrics.winRate,
      averageCoinsPerTurn: block.metrics.averageCoinsPerTurn,
      medianScore: mediumBaseline.medianScore,
      generatedAt: block.generatedAt,
      commitSha: block.commitSha,
      seeds: baseline.seeds,
      maxTurns: baseline.maxTurns,
      strategy: block.strategy,
    },
    current: {
      winRate: mediumCurrent.metrics.winRate,
      averageCoinsPerTurn: mediumCurrent.metrics.averageCoinsPerTurn,
      medianScore: mediumCurrent.metrics.medianScore,
    },
    currentMeta: {
      seeds: baseline.seeds,
      maxTurns: baseline.maxTurns,
      strategy: block.strategy,
    },
    perDifficulty,
    summary: {
      totalDifficulties: perDifficulty.length,
      drifted: perDifficulty.filter(e => e.exceedsTolerance).length,
      maxWinRateDrift: Math.max(...perDifficulty.map(e => Math.abs(e.delta.winRate))),
      maxCoinsDrift: Math.max(...perDifficulty.map(e => Math.abs(e.delta.averageCoinsPerTurn))),
      maxMedianScoreDrift: Math.max(...perDifficulty.map(e => Math.abs(e.delta.medianScore))),
    },
  };

  const output = formatDriftReport(report, jsonMode);
  console.log(output);

  // If any drift detected, print a reminder
  if (report.summary.drifted > 0) {
    console.error('');
    console.error(`⚠️  ${report.summary.drifted} difficulty(ies) exceed tolerance.`);
    console.error('   Review the drift report and decide: regenerate baseline or investigate regression.');
    console.error('   See docs/main-street/balance-guardrail-recommendations.md for the decision tree.');
  }
}

main();
