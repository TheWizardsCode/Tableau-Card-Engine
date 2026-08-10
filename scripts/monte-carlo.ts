#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  runMonteCarlo,
  runAllCombinations,
  toCsv,
  ALL_STRATEGIES,
  ALL_DIFFICULTIES,
  type MonteCarloStrategy,
  type CombinationResult,
} from '../example-games/main-street/MainStreetMonteCarlo';
import type { DifficultyName } from '../example-games/main-street/MainStreetDifficulty';

interface CliArgs {
  runs: number;
  out: string;
  csvOut?: string;
  seedPrefix: string;
  maxTurns: number;
  seedFile?: string;
  strategy: MonteCarloStrategy;
  /** If true, run all strategy×difficulty combinations. */
  sweep: boolean;
  /** Filter strategies for sweep mode (default: all). */
  sweepStrategies: MonteCarloStrategy[];
  /** Filter difficulties for sweep mode (default: all). */
  sweepDifficulties: DifficultyName[];
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args = [...argv];
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    if (idx === -1) return undefined;
    return args[idx + 1];
  };

  // Precedence: --seeds / --runs CLI arg > MONTE_SEEDS env var > default 200
  const runs = Number.parseInt(get('--seeds') ?? get('--runs') ?? process.env['MONTE_SEEDS'] ?? '200', 10);
  const out = get('--out') ?? 'results/main-street-monte-carlo.json';
  const csvOut = get('--csv-out');
  const seedPrefix = get('--seed-prefix') ?? 'mc-balance';
  // Harness-only termination cap (CG-0MSLXJCHH001DLIO): default presets impose
  // no turn limit, so the harness needs a generous explicit bound.
  const maxTurns = Number.parseInt(get('--maxTurns') ?? get('--max-turns') ?? '60', 10);
  const seedFile = get('--seed-file');
  const strategyArg = (get('--strategy') ?? 'greedy') as MonteCarloStrategy;
  const sweep = args.includes('--sweep');
  const sweepStrategiesRaw = get('--sweep-strategies');
  const sweepDifficultiesRaw = get('--sweep-difficulties');

  if (!Number.isFinite(runs) || runs <= 0) {
    throw new Error('--seeds/--runs must be a positive integer');
  }
  if (!Number.isFinite(maxTurns) || maxTurns <= 0) {
    throw new Error('--maxTurns/--max-turns must be a positive integer');
  }

  const validStrategies: MonteCarloStrategy[] = ['market-greedy', 'demo-greedy', 'greedy', 'random'];
  if (!validStrategies.includes(strategyArg)) {
    throw new Error(`--strategy must be one of: ${validStrategies.join(', ')}`);
  }

  // Parse optional sweep strategy/difficulty filters
  let sweepStrategies: MonteCarloStrategy[] = [...ALL_STRATEGIES];
  let sweepDifficulties: DifficultyName[] = [...ALL_DIFFICULTIES];

  if (sweepStrategiesRaw) {
    sweepStrategies = sweepStrategiesRaw.split(',').map(s => s.trim() as MonteCarloStrategy);
    for (const s of sweepStrategies) {
      if (!validStrategies.includes(s)) {
        throw new Error(`Invalid strategy in --sweep-strategies: ${s}. Must be one of: ${validStrategies.join(', ')}`);
      }
    }
  }

  if (sweepDifficultiesRaw) {
    sweepDifficulties = sweepDifficultiesRaw.split(',').map(s => s.trim() as DifficultyName);
    for (const d of sweepDifficulties) {
      if (!ALL_DIFFICULTIES.includes(d)) {
        throw new Error(`Invalid difficulty in --sweep-difficulties: ${d}. Must be one of: ${ALL_DIFFICULTIES.join(', ')}`);
      }
    }
  }

  if (sweep && sweepStrategies.length === 0) {
    throw new Error('--sweep-strategies must contain at least one strategy');
  }
  if (sweep && sweepDifficulties.length === 0) {
    throw new Error('--sweep-difficulties must contain at least one difficulty');
  }

  return {
    runs, out, csvOut, seedPrefix, maxTurns, seedFile, strategy: strategyArg,
    sweep, sweepStrategies, sweepDifficulties,
  };
}

function loadSeeds(seedFile: string, fallbackRuns: number, seedPrefix: string): string[] {
  if (!fs.existsSync(seedFile)) {
    throw new Error(`Seed file not found: ${seedFile}`);
  }
  const raw = fs.readFileSync(seedFile, 'utf8');
  const parsed = raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
  if (parsed.length > 0) {
    return parsed;
  }
  return Array.from({ length: fallbackRuns }, (_, i) => `${seedPrefix}-${i}`);
}

function ensureParentDir(filePath: string): void {
  const abs = path.resolve(filePath);
  const dir = path.dirname(abs);
  fs.mkdirSync(dir, { recursive: true });
}

function writeCombinationResult(
  combo: CombinationResult,
  parsed: CliArgs,
  basePath: string,
): void {
  const slug = `${combo.strategy}-${combo.difficulty.toLowerCase()}`;
  const outPath = basePath.replace('.json', `-${slug}.json`);
  const csvPath = parsed.csvOut ? parsed.csvOut.replace('.csv', `-${slug}.csv`) : undefined;

  const output = {
    generatedAt: new Date().toISOString(),
    runsRequested: parsed.runs,
    runsExecuted: combo.metrics.runs,
    seedPrefix: parsed.seedPrefix,
    maxTurns: parsed.maxTurns,
    strategy: combo.strategy,
    difficulty: combo.difficulty,
    metrics: combo.metrics,
    runs: combo.runs,
  };

  ensureParentDir(outPath);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  if (csvPath) {
    ensureParentDir(csvPath);
    fs.writeFileSync(csvPath, toCsv(combo.runs));
  }

  process.stderr.write(
    `  ${slug}: ${combo.metrics.runs} runs, winRate=${(combo.metrics.winRate * 100).toFixed(1)}%, ` +
    `medianScore=${combo.metrics.medianScore.toFixed(1)}\n`,
  );
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  const seeds = parsed.seedFile
    ? loadSeeds(parsed.seedFile, parsed.runs, parsed.seedPrefix)
    : Array.from({ length: parsed.runs }, (_, i) => `${parsed.seedPrefix}-${i}`);

  if (parsed.sweep) {
    // Sweep mode: run all requested strategy×difficulty combinations
    const results = runAllCombinations({
      seeds,
      maxTurns: parsed.maxTurns,
      strategies: parsed.sweepStrategies,
      difficulties: parsed.sweepDifficulties,
    });

    const basePath = parsed.out;
    process.stderr.write(`Sweep mode: ${results.length} combinations\n`);
    for (const combo of results) {
      writeCombinationResult(combo, parsed, basePath);
    }
    process.stderr.write(`Sweep complete. Results written to ${basePath.replace('.json', '-*.json')}\n`);
    return;
  }

  // Single mode (original behaviour)
  const result = runMonteCarlo({ seeds, maxTurns: parsed.maxTurns, strategy: parsed.strategy });

  const output = {
    generatedAt: new Date().toISOString(),
    runsRequested: parsed.runs,
    runsExecuted: result.metrics.runs,
    seedPrefix: parsed.seedPrefix,
    maxTurns: parsed.maxTurns,
    strategy: parsed.strategy,
    metrics: result.metrics,
    runs: result.runs,
  };

  ensureParentDir(parsed.out);
  fs.writeFileSync(parsed.out, JSON.stringify(output, null, 2));

  if (parsed.csvOut) {
    ensureParentDir(parsed.csvOut);
    fs.writeFileSync(parsed.csvOut, toCsv(result.runs));
  }

  const line1 = `Monte Carlo complete: ${result.metrics.runs} runs, winRate=${(result.metrics.winRate * 100).toFixed(1)}%`;
  const line2 = `medianScore=${result.metrics.medianScore.toFixed(1)}, avgNoActionTurns=${result.metrics.averageNoActionTurns.toFixed(2)}`;
  const line3 = `JSON written: ${parsed.out}`;
  process.stderr.write(`${line1}\n${line2}\n${line3}\n`);
  if (parsed.csvOut) {
    process.stderr.write(`CSV written: ${parsed.csvOut}\n`);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`monte-carlo.ts failed: ${(error as Error).message}\n`);
  process.exit(1);
}
