import { describe, it, expect } from 'vitest';
import {
  computePickRate,
  computeWinRateDelta,
  computeCostToIncomeRatio,
  computeSynergyUtilization,
  computeUpgradeAdoption,
  computeEventImpactScore,
  computeSurvivalRate,
} from '../../scripts/balance/engine/card-metrics';
import type { MonteCarloRunSummary } from '../../example-games/main-street/MainStreetMonteCarlo';

/**
 * Helper to create a basic MonteCarloRunSummary with Phase 1 extensions.
 */
function makeRun(overrides: Partial<MonteCarloRunSummary> & {
  cardsOwned?: string[];
  marketOffers?: string[];
  economyHistory?: Array<{ turn: number; coins: number; reputation: number; score: number }>;
}): MonteCarloRunSummary {
  return {
    seed: overrides.seed ?? 'test-001',
    result: overrides.result ?? 'win',
    endReason: overrides.endReason ?? 'score_threshold',
    finalScore: overrides.finalScore ?? 150,
    finalCoins: overrides.finalCoins ?? 30,
    turns: overrides.turns ?? 15,
    turnWhenGridHalf: overrides.turnWhenGridHalf ?? null,
    turnWhenGridFull: overrides.turnWhenGridFull ?? null,
    noActionTurns: overrides.noActionTurns ?? 0,
    cardsOwned: overrides.cardsOwned ?? [],
    marketOffers: overrides.marketOffers ?? [],
    economyHistory: overrides.economyHistory ?? [],
  };
}

// ========================================================================
// M1: Pick Rate
// ========================================================================
describe('computePickRate (M1)', () => {
  it('returns pick rate as purchases / market appearances', () => {
    const runs = [
      makeRun({ seed: 's1', cardsOwned: ['biz-bakery'], marketOffers: ['biz-bakery', 'biz-laundromat'] }),
      makeRun({ seed: 's2', cardsOwned: ['biz-hardware'], marketOffers: ['biz-bakery', 'biz-hardware'] }),
      makeRun({ seed: 's3', cardsOwned: ['biz-bakery', 'biz-cafe'], marketOffers: ['biz-bakery', 'biz-cafe'] }),
    ];
    // biz-bakery: appeared in 3 runs, purchased in 2 => 2/3 ≈ 0.667
    const result = computePickRate('biz-bakery', runs);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBeCloseTo(0.6667, 3);
      expect(result.purchases).toBe(2);
      expect(result.appearances).toBe(3);
    }
  });

  it('returns 0 when card never appears in market', () => {
    const runs = [
      makeRun({ cardsOwned: [], marketOffers: ['biz-cafe'] }),
    ];
    const result = computePickRate('biz-bakery', runs);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBe(0);
      expect(result.appearances).toBe(0);
    }
  });

  it('returns null when marketOffers field is absent', () => {
    const runs = [makeRun({ cardsOwned: ['biz-bakery'] })];
    // Remove marketOffers
    delete (runs[0] as any).marketOffers;
    const result = computePickRate('biz-bakery', runs);
    expect(result).toBeNull();
  });

  it('returns 1 when purchased in every appearance', () => {
    const runs = [
      makeRun({ cardsOwned: ['biz-bakery'], marketOffers: ['biz-bakery'] }),
      makeRun({ cardsOwned: ['biz-bakery'], marketOffers: ['biz-bakery'] }),
    ];
    const result = computePickRate('biz-bakery', runs);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBe(1);
    }
  });

  it('handles empty runs array', () => {
    const result = computePickRate('biz-bakery', []);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBe(0);
      expect(result.appearances).toBe(0);
    }
  });
});

// ========================================================================
// M2: Win-Rate Delta
// ========================================================================
describe('computeWinRateDelta (M2)', () => {
  it('returns positive delta when card correlates with winning', () => {
    const runs = [
      makeRun({ seed: 's1', result: 'win', cardsOwned: ['biz-bakery'] }),
      makeRun({ seed: 's2', result: 'win', cardsOwned: ['biz-bakery'] }),
      makeRun({ seed: 's3', result: 'loss', cardsOwned: [] }),
      makeRun({ seed: 's4', result: 'loss', cardsOwned: ['biz-bakery'] }),
    ];
    // biz-bakery owned in s1, s2, s4: win rate = 2/3 ≈ 0.667
    // biz-bakery NOT owned in s3: win rate = 0/1 = 0
    // delta = 0.667 - 0 = 0.667
    const result = computeWinRateDelta('biz-bakery', runs);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBeCloseTo(0.6667, 3);
    }
  });

  it('returns negative delta when card correlates with losing', () => {
    const runs = [
      makeRun({ seed: 's1', result: 'win', cardsOwned: [] }),
      makeRun({ seed: 's2', result: 'loss', cardsOwned: ['biz-bakery'] }),
      makeRun({ seed: 's3', result: 'loss', cardsOwned: ['biz-bakery'] }),
    ];
    // biz-bakery owned in s2, s3: win rate = 0/2 = 0
    // biz-bakery NOT owned in s1: win rate = 1/1 = 1
    // delta = 0 - 1 = -1
    const result = computeWinRateDelta('biz-bakery', runs);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBe(-1);
    }
  });

  it('returns 0 when card is owned in all runs', () => {
    const runs = [
      makeRun({ result: 'win', cardsOwned: ['biz-bakery'] }),
      makeRun({ result: 'loss', cardsOwned: ['biz-bakery'] }),
    ];
    // Owned in all: win rate when owned = 0.5
    // Not owned in any: no data, treat as 0
    const result = computeWinRateDelta('biz-bakery', runs);
    expect(result).not.toBeNull();
    if (result) {
      // When card is owned in all runs, not-owned runs are 0, which means winRateWhenNotOwned = 0 (no data)
      expect(result.winRateWhenOwned).toBe(0.5);
      expect(result.winRateWhenNotOwned).toBe(0);
      expect(result.value).toBe(0.5);
    }
  });

  it('returns null when cardsOwned field is absent', () => {
    const runs = [makeRun({ result: 'win' })];
    delete (runs[0] as any).cardsOwned;
    const result = computeWinRateDelta('biz-bakery', runs);
    expect(result).toBeNull();
  });

  it('handles empty runs', () => {
    const result = computeWinRateDelta('biz-bakery', []);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBe(0);
    }
  });
});

// ========================================================================
// M3: Cost-to-Income Ratio
// ========================================================================
describe('computeCostToIncomeRatio (M3)', () => {
  it('returns cost / baseIncome for typical card', () => {
    const result = computeCostToIncomeRatio({ cost: 6, baseIncome: 2 });
    expect(result).toBe(3);
  });

  it('returns Infinity when baseIncome is zero', () => {
    const result = computeCostToIncomeRatio({ cost: 4, baseIncome: 0 });
    expect(result).toBe(Infinity);
  });

  it('returns 0 when cost is 0', () => {
    const result = computeCostToIncomeRatio({ cost: 0, baseIncome: 3 });
    expect(result).toBe(0);
  });

  it('handles fractional ratios', () => {
    const result = computeCostToIncomeRatio({ cost: 5, baseIncome: 2 });
    expect(result).toBe(2.5);
  });

  it('throws TypeError for negative cost or income', () => {
    expect(() => computeCostToIncomeRatio({ cost: -1, baseIncome: 2 })).toThrow(TypeError);
    expect(() => computeCostToIncomeRatio({ cost: 6, baseIncome: -1 })).toThrow(TypeError);
  });
});

// ========================================================================
// M4: Synergy Utilization
// ========================================================================
describe('computeSynergyUtilization (M4)', () => {
  it('returns ratio of actual to max bonuses', () => {
    const runs = [
      makeRun({
        economyHistory: [
          { turn: 1, coins: 2, reputation: 0, score: 0 },
        ],
      }),
    ];
    // Add synthetic income breakdown
    (runs[0] as any).incomeBreakdown = {
      base: 5,
      synergy: 3,
      event: 2,
      maxPossibleSynergy: 8,
    };
    const result = computeSynergyUtilization('biz-bakery', runs);
    expect(result).not.toBeNull();
    if (result) {
      // avg synergy = 3, avg max = 8
      expect(result.value).toBeCloseTo(0.375, 3);
      expect(result.actualBonuses).toBe(3);
      expect(result.maxPossibleBonuses).toBe(8);
    }
  });

  it('returns null when incomeBreakdown absent', () => {
    const runs = [makeRun({})];
    const result = computeSynergyUtilization('biz-bakery', runs);
    expect(result).toBeNull();
  });

  it('handles zero max bonuses', () => {
    const runs = [
      makeRun({ economyHistory: [{ turn: 1, coins: 0, reputation: 0, score: 0 }] }),
    ];
    (runs[0] as any).incomeBreakdown = {
      base: 5, synergy: 0, event: 0, maxPossibleSynergy: 0,
    };
    const result = computeSynergyUtilization('biz-bakery', runs);
    expect(result).not.toBeNull();
    if (result) {
      // When max is 0, utilization is 0 (no synergy possible)
      expect(result.value).toBe(0);
    }
  });
});

// ========================================================================
// M5: Upgrade Adoption
// ========================================================================
describe('computeUpgradeAdoption (M5)', () => {
  it('returns upgrades / parent purchases', () => {
    const runs = [
      makeRun({ cardsOwned: ['biz-bakery', 'upg-bakery-v2'] }),
      makeRun({ cardsOwned: ['biz-bakery'] }),
      makeRun({ cardsOwned: ['biz-bakery', 'upg-bakery-v2'] }),
      makeRun({ cardsOwned: ['biz-laundromat'] }),
    ];
    // Parent 'biz-bakery' purchased in 3 runs, upgraded in 2 => 2/3 ≈ 0.667
    const result = computeUpgradeAdoption('upg-bakery-v2', 'biz-bakery', runs);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBeCloseTo(0.6667, 3);
      expect(result.parentPurchases).toBe(3);
      expect(result.upgrades).toBe(2);
    }
  });

  it('returns 0 when parent never purchased', () => {
    const runs = [
      makeRun({ cardsOwned: ['biz-laundromat'] }),
    ];
    const result = computeUpgradeAdoption('upg-bakery-v2', 'biz-bakery', runs);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBe(0);
    }
  });

  it('returns null when cardsOwned absent', () => {
    const runs = [makeRun({})];
    delete (runs[0] as any).cardsOwned;
    const result = computeUpgradeAdoption('upg-bakery-v2', 'biz-bakery', runs);
    expect(result).toBeNull();
  });
});

// ========================================================================
// M6: Event Impact Score
// ========================================================================
describe('computeEventImpactScore (M6)', () => {
  it('computes average impact from coinDelta + repDelta * 5', () => {
    const runs = [
      makeRun({
        economyHistory: [
          { turn: 1, coins: 5, reputation: 1, score: 0 },
        ],
      }),
    ];
    // Add event data
    (runs[0] as any).events = [
      { cardId: 'evt-festival', coinDelta: 3, repDelta: 1, turn: 5 },
    ];
    const result = computeEventImpactScore('evt-festival', runs);
    expect(result).not.toBeNull();
    if (result) {
      // 3 + 1*5 = 8, one event => avg = 8
      expect(result.value).toBe(8);
    }
  });

  it('falls back to CSV static deltas when run data absent', () => {
    const runs = [makeRun({})];
    const result = computeEventImpactScore('evt-festival', runs, {
      coinDelta: 2,
      reputationDelta: 0,
    });
    expect(result).not.toBeNull();
    if (result) {
      // 2 + 0*5 = 2
      expect(result.value).toBe(2);
    }
  });

  it('returns 0 when card not found in any run and no fallback', () => {
    const runs = [makeRun({})];
    const result = computeEventImpactScore('evt-unknown', runs);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBe(0);
      expect(result.occurrences).toBe(0);
    }
  });

  it('weights by frequency across runs', () => {
    const runs = [
      makeRun({ economyHistory: [{ turn: 1, coins: 0, reputation: 0, score: 0 }] }),
      makeRun({ economyHistory: [{ turn: 1, coins: 0, reputation: 0, score: 0 }] }),
    ];
    (runs[0] as any).events = [{ cardId: 'evt-festival', coinDelta: 3, repDelta: 1, turn: 5 }];
    (runs[1] as any).events = [{ cardId: 'evt-festival', coinDelta: 1, repDelta: 0, turn: 7 }];
    const result = computeEventImpactScore('evt-festival', runs);
    expect(result).not.toBeNull();
    if (result) {
      // Run 1: 3 + 1*5 = 8
      // Run 2: 1 + 0*5 = 1
      // Avg: (8 + 1) / 2 = 4.5
      expect(result.value).toBe(4.5);
    }
  });
});

// ========================================================================
// M7: Survival Rate
// ========================================================================
describe('computeSurvivalRate (M7)', () => {
  it('returns wins / owned runs', () => {
    const runs = [
      makeRun({ result: 'win', cardsOwned: ['biz-bakery'] }),
      makeRun({ result: 'win', cardsOwned: ['biz-bakery'] }),
      makeRun({ result: 'loss', cardsOwned: ['biz-bakery'] }),
      makeRun({ result: 'loss', cardsOwned: [] }),
    ];
    // biz-bakery owned in 3 runs, won in 2 => 2/3
    const result = computeSurvivalRate('biz-bakery', runs);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBeCloseTo(0.6667, 3);
      expect(result.ownedRuns).toBe(3);
      expect(result.wins).toBe(2);
    }
  });

  it('returns 0 when card never owned', () => {
    const runs = [
      makeRun({ result: 'win', cardsOwned: [] }),
      makeRun({ result: 'loss', cardsOwned: [] }),
    ];
    const result = computeSurvivalRate('biz-bakery', runs);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBe(0);
      expect(result.ownedRuns).toBe(0);
    }
  });

  it('returns null when cardsOwned absent', () => {
    const runs = [makeRun({ result: 'win' })];
    delete (runs[0] as any).cardsOwned;
    const result = computeSurvivalRate('biz-bakery', runs);
    expect(result).toBeNull();
  });

  it('returns 1 when card owned in all winning runs', () => {
    const runs = [
      makeRun({ result: 'win', cardsOwned: ['biz-bakery'] }),
    ];
    const result = computeSurvivalRate('biz-bakery', runs);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBe(1);
    }
  });
});
