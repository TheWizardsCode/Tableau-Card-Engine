import { describe, it, expect } from 'vitest';
import type { MonteCarloRunSummary } from '../../example-games/main-street/MainStreetMonteCarlo';
import {
  computePickRate,
  computeWinRateDelta,
  computeCostToIncomeRatio,
  computeSynergyUtilization,
  computeUpgradeAdoption,
  computeEventImpactScore,
  computeSurvivalRate,
  type CardTemplate,
  type CardMetricResult,
} from '../../scripts/balance/engine/card-metrics';

// Helper factories
function makeRun(
  overrides: Partial<MonteCarloRunSummary> = {},
): MonteCarloRunSummary {
  return {
    seed: 'test-seed',
    result: 'win',
    endReason: 'score_threshold',
    finalScore: 150,
    finalCoins: 30,
    turns: 15,
    turnWhenGridHalf: 7,
    turnWhenGridFull: 12,
    noActionTurns: 0,
    cardsOwned: [],
    marketOffers: [],
    economyHistory: [],
    ...overrides,
  };
}

function makeCard(overrides: Partial<CardTemplate> = {}): CardTemplate {
  return {
    id: 'biz-test',
    name: 'Test Card',
    family: 'business',
    cost: 5,
    baseIncome: 1,
    synergyTypes: ['Food'],
    coinDelta: 0,
    reputationDelta: 0,
    upgradePath: '',
    ...overrides,
  };
}

// M1: Pick Rate
describe('computePickRate (M1)', () => {
  it('returns ratio of purchases to market appearances', () => {
    const runs = [
      makeRun({ cardsOwned: ['biz-bakery'], marketOffers: ['biz-bakery', 'biz-diner'] }),
      makeRun({ cardsOwned: ['biz-diner'], marketOffers: ['biz-bakery', 'biz-diner'] }),
      makeRun({ cardsOwned: ['biz-bakery', 'biz-cafe'], marketOffers: ['biz-bakery', 'biz-cafe'] }),
    ];
    // biz-bakery: purchased 2 times, appeared 3 times → 2/3 = 0.667
    const result = computePickRate('biz-bakery', runs);
    expect(result?.value).toBeCloseTo(2 / 3, 2);
  });

  it('returns 0 when card never appears in market', () => {
    const runs = [makeRun({ cardsOwned: ['biz-other'], marketOffers: ['biz-other'] })];
    const result = computePickRate('biz-never', runs);
    expect(result?.value).toBe(0);
  });

  it('returns null when marketOffers data is absent', () => {
    const runs = [makeRun({ marketOffers: [] as string[] })];
    const result = computePickRate('biz-bakery', runs);
    expect(result).toBeNull();
  });

  it('returns 1 when purchased every time it appears', () => {
    const runs = [
      makeRun({ cardsOwned: ['biz-bakery'], marketOffers: ['biz-bakery'] }),
      makeRun({ cardsOwned: ['biz-bakery'], marketOffers: ['biz-bakery', 'biz-diner'] }),
    ];
    const result = computePickRate('biz-bakery', runs);
    expect(result?.value).toBe(1);
  });

  it('handles empty runs array', () => {
    const result = computePickRate('biz-bakery', []);
    expect(result?.value).toBe(0);
  });
});

// M2: Win-Rate Delta
describe('computeWinRateDelta (M2)', () => {
  it('returns positive delta when card helps win rate', () => {
    const runs = [
      makeRun({ cardsOwned: ['biz-bakery'], result: 'win' }),
      makeRun({ cardsOwned: ['biz-bakery'], result: 'win' }),
      makeRun({ cardsOwned: ['biz-bakery'], result: 'loss' }),
      makeRun({ cardsOwned: [] as string[], result: 'loss' }),
      makeRun({ cardsOwned: [] as string[], result: 'loss' }),
    ];
    // Win rate when owned: 2/3 = 0.667
    // Win rate when not owned: 0/2 = 0
    // Delta: 0.667 - 0 = 0.667
    const result = computeWinRateDelta('biz-bakery', runs);
    expect(result?.value).toBeCloseTo(2 / 3, 2);
  });

  it('returns negative delta when card hurts win rate', () => {
    const runs = [
      makeRun({ cardsOwned: ['biz-bakery'], result: 'loss' }),
      makeRun({ cardsOwned: ['biz-bakery'], result: 'loss' }),
      makeRun({ cardsOwned: [] as string[], result: 'win' }),
      makeRun({ cardsOwned: [] as string[], result: 'win' }),
    ];
    // Owned: 0/2 = 0, Not owned: 2/2 = 1
    // Delta: 0 - 1 = -1
    const result = computeWinRateDelta('biz-bakery', runs);
    expect(result?.value).toBe(-1);
  });

  it('returns null when cardsOwned data is absent for all runs', () => {
    const runs = [makeRun({ cardsOwned: [] as string[] })];
    const result = computeWinRateDelta('biz-bakery', runs);
    expect(result).toBeNull();
  });

  it('handles card owned in all runs', () => {
    const runs = [
      makeRun({ cardsOwned: ['biz-bakery'], result: 'win' }),
      makeRun({ cardsOwned: ['biz-bakery'], result: 'win' }),
    ];
    // When owned: 2/2 = 1, When not owned: 0/0 = 0 (no runs without card)
    const result = computeWinRateDelta('biz-bakery', runs);
    expect(result?.value).toBe(1);
  });
});

// M3: Cost-to-Income Ratio
describe('computeCostToIncomeRatio (M3)', () => {
  it('returns cost / baseIncome', () => {
    const card = makeCard({ cost: 6, baseIncome: 2 });
    const result = computeCostToIncomeRatio(card);
    expect(result?.value).toBe(3);
  });

  it('handles zero baseIncome gracefully', () => {
    const card = makeCard({ cost: 5, baseIncome: 0 });
    const result = computeCostToIncomeRatio(card);
    expect(result?.value).toBe(Infinity);
    expect(result?.note).toContain('zero');
  });

  it('returns lower ratio for cheap high-income cards', () => {
    const cheap = makeCard({ cost: 3, baseIncome: 2 }); // 1.5
    const expensive = makeCard({ cost: 10, baseIncome: 1 }); // 10
    expect(computeCostToIncomeRatio(cheap)?.value).toBe(1.5);
    expect(computeCostToIncomeRatio(expensive)?.value).toBe(10);
  });
});

// M4: Synergy Utilization
describe('computeSynergyUtilization (M4)', () => {
  it('returns null when income breakdown is absent', () => {
    const runs = [makeRun()];
    const result = computeSynergyUtilization('biz-bakery', runs, makeCard());
    expect(result).toBeNull();
  });

  it('returns null for empty runs', () => {
    const result = computeSynergyUtilization('biz-test', [], makeCard());
    expect(result).toBeNull();
  });
});

// M5: Upgrade Adoption
describe('computeUpgradeAdoption (M5)', () => {
  it('returns upgrades / parent purchases', () => {
    const runs = [
      makeRun({ cardsOwned: ['biz-bakery'] }),
      makeRun({ cardsOwned: ['biz-bakery', 'upg-bakery-1'] }),
      makeRun({ cardsOwned: ['biz-bakery', 'upg-bakery-1'] }),
    ];
    // Parent purchased 3 times, upgraded 2 times → 2/3
    const result = computeUpgradeAdoption('upg-bakery-1', 'biz-bakery', runs);
    expect(result?.value).toBeCloseTo(2 / 3, 2);
  });

  it('returns 0 when parent never purchased', () => {
    const runs = [makeRun({ cardsOwned: ['biz-other'] })];
    const result = computeUpgradeAdoption('upg-bakery-1', 'biz-bakery', runs);
    expect(result?.value).toBe(0);
  });

  it('returns null when cardsOwned absent', () => {
    const runs = [makeRun({ cardsOwned: [] as string[] })];
    const result = computeUpgradeAdoption('upg-bakery-1', 'biz-bakery', runs);
    expect(result).toBeNull();
  });
});

// M6: Event Impact Score
describe('computeEventImpactScore (M6)', () => {
  it('computes average impact from CSV deltas', () => {
    // Event with coinDelta=3 and reputationDelta=1 → 3 + 1*5 = 8
    const cards: CardTemplate[] = [
      makeCard({
        id: 'evt-festival',
        name: 'Festival',
        family: 'event',
        coinDelta: 3,
        reputationDelta: 1,
      }),
    ];
    const runs = [makeRun()];
    const result = computeEventImpactScore('evt-festival', runs, cards);
    expect(result?.value).toBe(8);
  });

  it('handles negative deltas for incidents', () => {
    const cards: CardTemplate[] = [
      makeCard({
        id: 'evt-rain',
        name: 'Rainy Day',
        family: 'event',
        coinDelta: -2,
        reputationDelta: -1,
      }),
    ];
    const runs = [makeRun()];
    const result = computeEventImpactScore('evt-rain', runs, cards);
    // -2 + (-1 * 5) = -7
    expect(result?.value).toBe(-7);
  });

  it('returns null for unknown card', () => {
    const result = computeEventImpactScore('evt-unknown', [], []);
    expect(result).toBeNull();
  });
});

// M7: Survival Rate
describe('computeSurvivalRate (M7)', () => {
  it('returns wins(card owned) / runs(card owned)', () => {
    const runs = [
      makeRun({ cardsOwned: ['biz-bakery'], result: 'win' }),
      makeRun({ cardsOwned: ['biz-bakery'], result: 'win' }),
      makeRun({ cardsOwned: ['biz-bakery'], result: 'loss' }),
      makeRun({ cardsOwned: [] as string[], result: 'win' }),
    ];
    // Owned in 3 runs, won in 2 of those → 2/3
    const result = computeSurvivalRate('biz-bakery', runs);
    expect(result?.value).toBeCloseTo(2 / 3, 2);
  });

  it('returns 0 when card owned but never wins', () => {
    const runs = [
      makeRun({ cardsOwned: ['biz-bakery'], result: 'loss' }),
      makeRun({ cardsOwned: ['biz-bakery'], result: 'loss' }),
    ];
    const result = computeSurvivalRate('biz-bakery', runs);
    expect(result?.value).toBe(0);
  });

  it('returns null when card never owned', () => {
    const runs = [makeRun({ cardsOwned: [] as string[], result: 'win' })];
    const result = computeSurvivalRate('biz-bakery', runs);
    expect(result).toBeNull();
  });
});

// Result type structure
describe('CardMetricResult type', () => {
  it('includes value, metricName, and optional note', () => {
    const result = computeCostToIncomeRatio(makeCard({ cost: 5, baseIncome: 2 }));
    expect(result).not.toBeNull();
    expect(result!.value).toBe(2.5);
    expect(result!.metricName).toBe('costToIncomeRatio');
    expect(typeof result!.note).toBe('string');
  });

  it('returns null when input data is missing', () => {
    const runs = [makeRun({ marketOffers: [] as string[] })];
    const result = computePickRate('biz-bakery', runs);
    expect(result).toBeNull();
  });
});
