#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { runMonteCarlo, toCsv, type MonteCarloStrategy } from '../example-games/main-street/MainStreetMonteCarlo';

interface CliArgs {
  runs: number;
  out: string;
  csvOut?: string;
  seedPrefix: string;
  maxTurns: number;
  seedFile?: string;
  strategy: MonteCarloStrategy;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args = [...argv];
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    if (idx === -1) return undefined;
    return args[idx + 1];
  };

  const runs = Number.parseInt(get('--seeds') ?? get('--runs') ?? '200', 10);
  const out = get('--out') ?? 'results/main-street-monte-carlo.json';
  const csvOut = get('--csv-out');
  const seedPrefix = get('--seed-prefix') ?? 'mc-balance';
  const maxTurns = Number.parseInt(get('--maxTurns') ?? get('--max-turns') ?? '25', 10);
  const seedFile = get('--seed-file');
  const strategyArg = (get('--strategy') ?? 'greedy') as MonteCarloStrategy;

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

  return { runs, out, csvOut, seedPrefix, maxTurns, seedFile, strategy: strategyArg };
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

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  const seeds = parsed.seedFile
    ? loadSeeds(parsed.seedFile, parsed.runs, parsed.seedPrefix)
    : Array.from({ length: parsed.runs }, (_, i) => `${parsed.seedPrefix}-${i}`);

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
