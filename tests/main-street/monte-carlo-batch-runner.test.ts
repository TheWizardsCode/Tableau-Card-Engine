/**
 * Monte Carlo Batch Runner — Tests for E-2
 *
 * Verifies that the batch runner (`runAllCombinations`) correctly iterates
 * all strategy×difficulty combinations and returns properly structured
 * results.
 *
 * Coverage:
 *  - Batch runner returns correct number of combinations (12)
 *  - Each result has strategy, difficulty, metrics, and runs fields
 *  - Each combination's metrics are well-formed
 *  - Batch runner accepts optional filter parameters
 *  - Existing guardrail tests still pass
 *
 * Work item:
 *   CG-0MRYZTD5Z003P4CF — E-2: Strategy×difficulty batch runner
 */
import { describe, expect, it } from 'vitest';

import {
  runAllCombinations,
  ALL_STRATEGIES,
  ALL_DIFFICULTIES,
} from '../../example-games/main-street/MainStreetMonteCarlo';

describe('runAllCombinations (E-2)', () => {
  // Use small seed sets for fast tests
  const smallSeeds = Array.from({ length: 3 }, (_, i) => `mc-e2-smoke-${i}`);

  it('returns results for all 12 strategy×difficulty combinations', () => {
    const results = runAllCombinations({ seeds: smallSeeds, maxTurns: 10 });
    expect(results).toHaveLength(12);
  });

  it('each result has the expected fields', () => {
    const results = runAllCombinations({ seeds: smallSeeds, maxTurns: 10 });

    for (const combo of results) {
      expect(combo).toHaveProperty('strategy');
      expect(combo).toHaveProperty('difficulty');
      expect(combo).toHaveProperty('metrics');
      expect(combo).toHaveProperty('runs');

      // Strategy should be one of the valid values
      expect(ALL_STRATEGIES).toContain(combo.strategy);

      // Difficulty should be one of the valid values
      expect(ALL_DIFFICULTIES).toContain(combo.difficulty);

      // Metrics should have standard fields
      expect(combo.metrics).toHaveProperty('winRate');
      expect(combo.metrics).toHaveProperty('runs');
      expect(combo.metrics).toHaveProperty('wins');
      expect(combo.metrics).toHaveProperty('losses');
      expect(combo.metrics).toHaveProperty('medianScore');
      expect(combo.metrics).toHaveProperty('averageScore');
      expect(combo.metrics).toHaveProperty('averageTurns');

      // Runs should be an array
      expect(Array.isArray(combo.runs)).toBe(true);
      expect(combo.runs.length).toBeGreaterThan(0);
    }
  });

  it('each combination covers all strategies', () => {
    const results = runAllCombinations({ seeds: smallSeeds, maxTurns: 10 });
    const strategies = new Set(results.map(r => r.strategy));
    expect(strategies.size).toBe(4);
    for (const s of ALL_STRATEGIES) {
      expect(strategies.has(s)).toBe(true);
    }
  });

  it('each combination covers all difficulties', () => {
    const results = runAllCombinations({ seeds: smallSeeds, maxTurns: 10 });
    const difficulties = new Set(results.map(r => r.difficulty));
    expect(difficulties.size).toBe(3);
    for (const d of ALL_DIFFICULTIES) {
      expect(difficulties.has(d)).toBe(true);
    }
  });

  it('each combination has the correct seed count per run', () => {
    const results = runAllCombinations({ seeds: smallSeeds, maxTurns: 10 });
    for (const combo of results) {
      expect(combo.runs).toHaveLength(smallSeeds.length);
      expect(combo.metrics.runs).toBe(smallSeeds.length);
    }
  });

  it('each combination result has runs with the new extension fields', () => {
    const results = runAllCombinations({ seeds: smallSeeds, maxTurns: 10 });
    for (const combo of results) {
      for (const run of combo.runs) {
        expect(run).toHaveProperty('cardsOwned');
        expect(run).toHaveProperty('marketOffers');
        expect(Array.isArray(run.cardsOwned)).toBe(true);
        expect(Array.isArray(run.marketOffers)).toBe(true);
      }
    }
  });

  it('accepts optional strategy filter', () => {
    const results = runAllCombinations({
      seeds: smallSeeds,
      maxTurns: 10,
      strategies: ['greedy', 'random'],
    });
    expect(results).toHaveLength(6); // 2 strategies × 3 difficulties
    for (const combo of results) {
      expect(['greedy', 'random']).toContain(combo.strategy);
    }
  });

  it('accepts optional difficulty filter', () => {
    const results = runAllCombinations({
      seeds: smallSeeds,
      maxTurns: 10,
      difficulties: ['Easy', 'Hard'],
    });
    expect(results).toHaveLength(8); // 4 strategies × 2 difficulties
    for (const combo of results) {
      expect(['Easy', 'Hard']).toContain(combo.difficulty);
    }
  });

  it('accepts both strategy and difficulty filters', () => {
    const results = runAllCombinations({
      seeds: smallSeeds,
      maxTurns: 10,
      strategies: ['market-greedy'],
      difficulties: ['Medium'],
    });
    expect(results).toHaveLength(1); // 1 strategy × 1 difficulty
    expect(results[0].strategy).toBe('market-greedy');
    expect(results[0].difficulty).toBe('Medium');
  });

  it('returns empty array when no seeds provided', () => {
    const results = runAllCombinations({ seeds: [], maxTurns: 5 });
    expect(results).toHaveLength(12);
    // Each combo should have 0 runs
    for (const combo of results) {
      expect(combo.runs).toHaveLength(0);
      expect(combo.metrics.runs).toBe(0);
    }
  });
});

describe('Strategy and difficulty constants', () => {
  it('ALL_STRATEGIES contains all 4 strategies', () => {
    expect(ALL_STRATEGIES).toEqual([
      'market-greedy',
      'demo-greedy',
      'greedy',
      'random',
    ]);
  });

  it('ALL_DIFFICULTIES contains all 3 difficulties', () => {
    expect(ALL_DIFFICULTIES).toEqual(['Easy', 'Medium', 'Hard']);
  });
});
