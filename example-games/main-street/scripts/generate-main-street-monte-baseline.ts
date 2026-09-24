import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { runAllCombinations } from '../MainStreetMonteCarlo';

/**
 * Regenerates `docs/main-street/monte-carlo-baseline.json` — the regression
 * snapshot consumed by `tests/main-street/monte-carlo-guardrails.test.ts`.
 *
 * Uses `runAllCombinations` (greedy + banking-greedy, Easy/Medium/Hard) so the
 * per-difficulty matrices match the guardrail test's own harness. The greedy
 * block is the primary baseline; the `bankingGreedy` block is the additive
 * snapshot for the banking-aware variant (CG-0MT3JMGA60091J8W AC5) and never
 * replaces it. Regenerate when the game balance deliberately shifts (e.g. staff
 * cards entering the general market, CG-0MT3KZNQB0053K55) and the drift
 * guardrails fail — report the drift and get operator sign-off first, never
 * accept it silently.
 *
 * Runner note: MainStreetCards imports `card-data.csv?raw` (a Vite-specific
 * import), so plain `tsx` cannot load the module graph — run this generator
 * through a `?raw`-aware runner (e.g. a temporary vitest test invoking the
 * same runAllCombinations call, as monte-carlo-guardrails.test.ts does).
 */
const seeds = 200;
// Harness-only termination cap (CG-0MSLXJCHH001DLIO): default presets impose
// no turn limit, so the baseline generator uses a generous explicit bound.
const maxTurns = 60;
const strategy = 'greedy' as const;
const bankingStrategy = 'banking-greedy' as const;

const runSeeds = Array.from({ length: seeds }, (_, i) => `mc-balance-${i}`);
const results = runAllCombinations({
  seeds: runSeeds,
  maxTurns,
  strategies: [strategy],
});
const bankingResults = runAllCombinations({
  seeds: runSeeds,
  maxTurns,
  strategies: [bankingStrategy],
});

const medium = results.find(r => r.difficulty === 'Medium');
if (!medium) throw new Error('Medium combination missing from runAllCombinations output');

const bankingMedium = bankingResults.find(r => r.difficulty === 'Medium');
if (!bankingMedium) {
  throw new Error('Medium banking-greedy combination missing from runAllCombinations output');
}

const baseline = {
  source: 'Generated from MainStreetMonteCarlo.runAllCombinations',
  generatedAt: new Date().toISOString(),
  seeds,
  maxTurns,
  strategy,
  metrics: {
    winRate: medium.metrics.winRate,
    averageCoinsPerTurn: medium.metrics.averageCoinsPerTurn,
  },
  difficultyMatrix: results.map(r => ({
    difficulty: r.difficulty,
    winRate: r.metrics.winRate,
    averageCoinsPerTurn: r.metrics.averageCoinsPerTurn,
    medianScore: r.metrics.medianScore,
  })),
  // Additive banking-aware snapshot (CG-0MT3JMGA60091J8W AC5). Recorded on the
  // same canonical profile as the greedy block above; keeps the banking-greedy
  // drift guardrail reproducible across regenerations.
  bankingGreedy: {
    source: 'Generated from MainStreetMonteCarlo.runAllCombinations',
    generatedAt: new Date().toISOString(),
    strategy: bankingStrategy,
    note:
      'Additive regression snapshot for BankingGreedyStrategy (CG-0MT3JMGA60091J8W AC5). ' +
      'Recorded on the same 200-seed / 60-turn canonical profile as the greedy block ' +
      'above; the greedy block is unchanged and is never replaced by this variant. ' +
      'Drift is reported, never silently accepted — see the drift-report workflow in ' +
      'tests/main-street/monte-carlo-guardrails.test.ts and ' +
      'docs/main-street/balance-guardrail-recommendations.md.',
    metrics: {
      winRate: bankingMedium.metrics.winRate,
      averageCoinsPerTurn: bankingMedium.metrics.averageCoinsPerTurn,
    },
    difficultyMatrix: bankingResults.map(r => ({
      difficulty: r.difficulty,
      winRate: r.metrics.winRate,
      averageCoinsPerTurn: r.metrics.averageCoinsPerTurn,
      medianScore: r.metrics.medianScore,
    })),
  },
};

const outputPath = resolve(process.cwd(), 'docs/main-street/monte-carlo-baseline.json');
writeFileSync(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf-8');
console.log(`Wrote ${outputPath}`);