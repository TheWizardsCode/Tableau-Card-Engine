import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { runMonteCarlo } from '../example-games/main-street/MainStreetMonteCarlo';

const seeds = 200;
const maxTurns = 25;
const strategy = 'greedy' as const;

const runSeeds = Array.from({ length: seeds }, (_, i) => `mc-balance-${i}`);
const result = runMonteCarlo({ seeds: runSeeds, maxTurns, strategy });

const baseline = {
  source: 'Generated from MainStreetMonteCarlo.runMonteCarlo',
  generatedAt: new Date().toISOString(),
  seeds,
  maxTurns,
  strategy,
  metrics: {
    winRate: result.metrics.winRate,
    averageCoinsPerTurn: result.metrics.averageCoinsPerTurn,
  },
};

const outputPath = resolve(process.cwd(), 'docs/main-street/monte-carlo-baseline.json');
writeFileSync(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf-8');
console.log(`Wrote ${outputPath}`);
