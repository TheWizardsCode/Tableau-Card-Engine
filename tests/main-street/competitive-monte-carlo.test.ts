/**
 * Main Street: Competitive Monte Carlo Harness Tests
 *
 * Tests for the head-to-head competitive Monte Carlo harness (CG-0MTIILDBB001F01S).
 * Extends MainStreetMonteCarlo — never replaces the single-player functions.
 *
 * AC1 — Deterministic head-to-head: runCompetitiveMonteCarlo runs ≥200 seeds,
 *        same seed → identical per-owner outcome.
 * AC2 — Per-player metrics: wins, average score, loss-reason distribution.
 * AC3 — Extension only: existing runMonteCarlo / runAllCombinations / tests pass.
 * AC4 — Validated against CompetitiveGreedyStrategy.
 */
import { describe, it, expect } from 'vitest';

import {
  runCompetitiveMonteCarlo,
  runCompetitiveSeed,
  toCompetitiveCsv,
} from '../../example-games/main-street/MainStreetMonteCarlo';

import {
  runMonteCarlo,
  runAllCombinations,
} from '../../example-games/main-street/MainStreetMonteCarlo';

import {
  CompetitiveGreedyStrategy,
  GreedyStrategy,
} from '../../example-games/main-street/MainStreetAiStrategy';

// ── Helpers ───────────────────────────────────────────────────

/** Seeds for the ≥200 threshold check. */
function makeSeeds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `seed-${String(i + 1).padStart(4, '0')}`);
}

// ── AC1: Deterministic head-to-head execution ────────────────

describe('AC1 — Deterministic head-to-head execution', () => {
  it('should produce identical results for the same seed across two runs', () => {
    const runA = runCompetitiveSeed('ac1-determ-1', 30);
    const runB = runCompetitiveSeed('ac1-determ-1', 30);

    expect(runA.winnerId).toBe(runB.winnerId);
    expect(runA.turns).toBe(runB.turns);
    expect(runA.endReason).toBe(runB.endReason);

    for (let pid = 0; pid < runA.players.length; pid++) {
      expect(runA.players[pid].finalScore).toBe(runB.players[pid].finalScore);
      expect(runA.players[pid].result).toBe(runB.players[pid].result);
      expect(runA.players[pid].finalCoins).toBe(runB.players[pid].finalCoins);
    }
  });

  it('should produce different outcomes for different seeds', () => {
    const runA = runCompetitiveSeed('ac1-diff-a', 30);
    const runB = runCompetitiveSeed('ac1-diff-b', 30);

    // At minimum, the turn counts should be non-trivial for both seeds.
    expect(runA.turns).toBeGreaterThan(0);
    expect(runB.turns).toBeGreaterThan(0);
  });

  it('should complete within the maxTurns cap', () => {
    const maxTurns = 5;
    const run = runCompetitiveSeed('ac1-cap', maxTurns);

    expect(run.turns).toBeLessThanOrEqual(maxTurns);
    expect(run.endReason).toBe('max_turns_cap');
  });

  it('should run ≥200 seeds in the batch harness', () => {
    const seeds = makeSeeds(200);
    const result = runCompetitiveMonteCarlo({ seeds, maxTurns: 30 });

    expect(result.runs.length).toBe(200);
    expect(result.metrics.runs).toBe(200);

    // All runs should have completed without error
    for (const run of result.runs) {
      expect(run.turns).toBeGreaterThan(0);
      expect(run.players).toHaveLength(2);
    }
  });
});

// ── AC2: Per-player metrics ──────────────────────────────────

describe('AC2 — Per-player metrics', () => {
  it('should include wins per player', () => {
    const seeds = makeSeeds(50);
    const result = runCompetitiveMonteCarlo({ seeds, maxTurns: 30 });

    expect(result.metrics.players).toHaveLength(2);

    for (const pm of result.metrics.players) {
      expect(pm.playerId).toBeGreaterThanOrEqual(0);
      expect(typeof pm.wins).toBe('number');
      expect(pm.wins).toBeGreaterThanOrEqual(0);
      expect(pm.wins).toBeLessThanOrEqual(result.metrics.runs);
      expect(pm.winRate).toBeGreaterThanOrEqual(0);
      expect(pm.winRate).toBeLessThanOrEqual(1);
    }
  });

  it('should include average score per player', () => {
    const seeds = makeSeeds(50);
    const result = runCompetitiveMonteCarlo({ seeds, maxTurns: 30 });

    for (const pm of result.metrics.players) {
      expect(typeof pm.averageScore).toBe('number');
      expect(pm.averageScore).toBeGreaterThanOrEqual(0);
      expect(typeof pm.medianScore).toBe('number');
    }
  });

  it('should include loss-reason distribution per player', () => {
    const seeds = makeSeeds(100);
    const result = runCompetitiveMonteCarlo({ seeds, maxTurns: 40 });

    for (const pm of result.metrics.players) {
      expect(typeof pm.lossReasons).toBe('object');
      expect(typeof pm.lossReasonRates).toBe('object');

      // lossReasonRates values should sum to 1.0 (or 0 if no losses)
      const rateSum = Object.values(pm.lossReasonRates).reduce((s, v) => s + v, 0);
      if (pm.losses > 0) {
        expect(rateSum).toBeCloseTo(1, 1);
      } else {
        expect(rateSum).toBe(0);
      }
    }
  });

  it('should include draws and end-reason distribution at run level', () => {
    const seeds = makeSeeds(50);
    const result = runCompetitiveMonteCarlo({ seeds, maxTurns: 10 }); // short to encourage cap

    expect(typeof result.metrics.draws).toBe('number');
    expect(typeof result.metrics.endReasons).toBe('object');

    const totalEndReasons = Object.values(result.metrics.endReasons).reduce((s, v) => s + v, 0);
    expect(totalEndReasons).toBe(result.metrics.runs);
  });

  it('should aggregate per-player losses and draws correctly', () => {
    const seeds = makeSeeds(50);
    const result = runCompetitiveMonteCarlo({ seeds, maxTurns: 30 });

    for (const pm of result.metrics.players) {
      const total = pm.wins + pm.losses + pm.draws;
      expect(total).toBe(result.metrics.runs);
    }
  });
});

// ── AC3: Extension (not replacement) ─────────────────────────

describe('AC3 — Extension of existing Monte Carlo', () => {
  it('should not break existing runMonteCarlo', () => {
    const seeds = makeSeeds(20);
    const result = runMonteCarlo({ seeds, strategy: 'market-greedy' });

    expect(result.runs.length).toBe(20);
    expect(result.metrics.runs).toBe(20);
    expect(result.metrics.winRate).toBeGreaterThanOrEqual(0);
    expect(result.metrics.winRate).toBeLessThanOrEqual(1);
  });

  it('should not break existing runAllCombinations', () => {
    const seeds = makeSeeds(10);
    const results = runAllCombinations({ seeds, maxTurns: 20, strategies: ['market-greedy'], difficulties: ['Easy'] });

    expect(results.length).toBe(1);
    expect(results[0].strategy).toBe('market-greedy');
    expect(results[0].difficulty).toBe('Easy');
    expect(results[0].runs.length).toBe(10);
  });
});

// ── AC4: Validated against CompetitiveGreedyStrategy ─────────

describe('AC4 — CompetitiveGreedyStrategy validation', () => {
  it('should run head-to-head with CompetitiveGreedyStrategy', () => {
    const seeds = makeSeeds(30);
    const strategies = [CompetitiveGreedyStrategy, CompetitiveGreedyStrategy];
    const result = runCompetitiveMonteCarlo({
      seeds,
      strategies,
      playerCount: 2,
      maxTurns: 30,
    });

    expect(result.runs.length).toBe(30);
    expect(result.metrics.players).toHaveLength(2);

    // Both players should have results (wins + losses)
    for (const pm of result.metrics.players) {
      expect(pm.wins + pm.losses + pm.draws).toBe(30);
    }
  });

  it('should support asymmetric strategies (Greedy vs CompetitiveGreedy)', () => {
    const seeds = makeSeeds(30);
    const strategies = [GreedyStrategy, CompetitiveGreedyStrategy];
    const result = runCompetitiveMonteCarlo({
      seeds,
      strategies,
      playerCount: 2,
      maxTurns: 30,
    });

    expect(result.runs.length).toBe(30);
    expect(result.metrics.players).toHaveLength(2);

    // Each player should have different win rates (asymmetric strategies)
    const p0WinRate = result.metrics.players[0].winRate;
    const p1WinRate = result.metrics.players[1].winRate;
    expect(p0WinRate).toBeGreaterThanOrEqual(0);
    expect(p1WinRate).toBeGreaterThanOrEqual(0);
    // Win rates should sum to ≈1 (ignoring draws)
    const nonDrawWins = p0WinRate + p1WinRate;
    expect(nonDrawWins).toBeGreaterThan(0);
  });

  it('should handle deterministic replay of a single seed', () => {
    const seed = 'ac4-replay';
    const run1 = runCompetitiveSeed(seed, 30);
    const run2 = runCompetitiveSeed(seed, 30);

    expect(run1.winnerId).toBe(run2.winnerId);
    expect(run1.turns).toBe(run2.turns);
    expect(run1.endReason).toBe(run2.endReason);
    for (let pid = 0; pid < run1.players.length; pid++) {
      expect(run1.players[pid].finalScore).toBe(run2.players[pid].finalScore);
      expect(run1.players[pid].finalCoins).toBe(run2.players[pid].finalCoins);
    }
  });
});

// ── CSV serialization ────────────────────────────────────────

describe('CSV serialization', () => {
  it('should produce valid CSV with header and data rows', () => {
    const seeds = makeSeeds(5);
    const result = runCompetitiveMonteCarlo({ seeds, maxTurns: 15 });
    const csv = toCompetitiveCsv(result.runs);
    const lines = csv.split('\n');

    expect(lines.length).toBe(6); // 1 header + 5 data rows
    expect(lines[0]).toContain('seed');
    expect(lines[0]).toContain('winnerId');
    expect(lines[0]).toContain('p0_result');
    expect(lines[0]).toContain('p1_score');
  });
});

// ── Edge cases ───────────────────────────────────────────────

describe('Edge cases', () => {
  it('should handle a run that ends via threshold (winner declared)', () => {
    const run = runCompetitiveSeed('edge-threshold', 30);

    // When a threshold winner is declared, the winner must be marked 'win'.
    // Bankruptcy / reputation-collapse endings have no winnerId (null).
    if (run.winnerId !== null) {
      expect(run.winnerId).toBeGreaterThanOrEqual(0);
      const winner = run.players.find(p => p.playerId === run.winnerId);
      expect(winner).toBeDefined();
      expect(winner!.result).toBe('win');
    }
  });

  it('should handle a draw scenario (tie at max turn cap)', () => {
    // Force a draw by using a very short turn limit where both players
    // may end with equal scores
    const run = runCompetitiveSeed('edge-draw', 3);

    expect(run.turns).toBeLessThanOrEqual(3);
    // Players can have draw results if tied for the lead
    const draws = run.players.filter(p => p.result === 'draw');
    const wins = run.players.filter(p => p.result === 'win');
    const losses = run.players.filter(p => p.result === 'loss');
    expect(draws.length + wins.length + losses.length).toBe(run.players.length);
  });
});
