/**
 * Main Street: Reputation-based Coin Multiplier Tests
 *
 * Unit tests for reputationCoinMultiplier() and applyReputationMultiplier(),
 * plus integration tests verifying that coin rewards scale correctly with
 * reputation during income and event resolution.
 *
 * Work item: CG-0MMLR38NJ1N11DOS
 */
import { describe, it, expect } from 'vitest';

import {
  reputationCoinMultiplier,
  applyReputationMultiplier,
} from '../../example-games/main-street/MainStreetDifficulty';

import {
  EASY_PRESET,
  MEDIUM_PRESET,
  HARD_PRESET,
  type GameConfig,
} from '../../example-games/main-street/MainStreetDifficulty';

import {
  setupMainStreetGame,
} from '../../example-games/main-street/MainStreetState';

import {
  applyIncome,
} from '../../example-games/main-street/MainStreetAdjacency';

import {
  resolveEvent,
} from '../../example-games/main-street/MainStreetEngine';

import type { BusinessCard, EventCard } from '../../example-games/main-street/MainStreetCards';

// ── Helper: pick only the fields reputationCoinMultiplier needs ──────
type MultiplierConfig = Pick<GameConfig, 'reputationCoinDivisor' | 'maxReputationCoinMultiplier'>;

const DEFAULT_CFG: MultiplierConfig = {
  reputationCoinDivisor: 20,
  maxReputationCoinMultiplier: 3.0,
};

// ── Unit tests: reputationCoinMultiplier() ──────────────────────────

describe('reputationCoinMultiplier', () => {
  it('returns 1.0 when reputation is 0', () => {
    expect(reputationCoinMultiplier(0, DEFAULT_CFG)).toBe(1.0);
  });

  it('returns 1.0 when reputation is negative', () => {
    expect(reputationCoinMultiplier(-5, DEFAULT_CFG)).toBe(1.0);
    expect(reputationCoinMultiplier(-100, DEFAULT_CFG)).toBe(1.0);
  });

  it('scales linearly with positive reputation', () => {
    // rep=5  → 1 + 5/20 = 1.25
    expect(reputationCoinMultiplier(5, DEFAULT_CFG)).toBeCloseTo(1.25);
    // rep=10 → 1 + 10/20 = 1.5
    expect(reputationCoinMultiplier(10, DEFAULT_CFG)).toBeCloseTo(1.5);
    // rep=20 → 1 + 20/20 = 2.0
    expect(reputationCoinMultiplier(20, DEFAULT_CFG)).toBeCloseTo(2.0);
    // rep=40 → 1 + 40/20 = 3.0 (at cap)
    expect(reputationCoinMultiplier(40, DEFAULT_CFG)).toBeCloseTo(3.0);
  });

  it('caps at maxReputationCoinMultiplier', () => {
    // rep=60 → raw = 1 + 60/20 = 4.0, capped to 3.0
    expect(reputationCoinMultiplier(60, DEFAULT_CFG)).toBe(3.0);
    // rep=100 → raw = 6.0, capped to 3.0
    expect(reputationCoinMultiplier(100, DEFAULT_CFG)).toBe(3.0);
  });

  it('respects custom divisor and cap', () => {
    const custom: MultiplierConfig = {
      reputationCoinDivisor: 10,
      maxReputationCoinMultiplier: 2.0,
    };
    // rep=10, divisor=10 → 1 + 10/10 = 2.0 (at cap)
    expect(reputationCoinMultiplier(10, custom)).toBe(2.0);
    // rep=20, divisor=10 → raw = 3.0, capped to 2.0
    expect(reputationCoinMultiplier(20, custom)).toBe(2.0);
    // rep=5, divisor=10 → 1 + 5/10 = 1.5
    expect(reputationCoinMultiplier(5, custom)).toBeCloseTo(1.5);
  });

  it('returns 1.0 for NaN and Infinity', () => {
    expect(reputationCoinMultiplier(NaN, DEFAULT_CFG)).toBe(1.0);
    expect(reputationCoinMultiplier(Infinity, DEFAULT_CFG)).toBe(1.0);
    expect(reputationCoinMultiplier(-Infinity, DEFAULT_CFG)).toBe(1.0);
  });
});

// ── Unit tests: applyReputationMultiplier() ─────────────────────────

describe('applyReputationMultiplier', () => {
  it('scales positive coin deltas', () => {
    // delta=10, rep=10 → multiplier=1.5 → floor(15) = 15
    expect(applyReputationMultiplier(10, 10, DEFAULT_CFG)).toBe(15);
  });

  it('floors the result for non-integer products', () => {
    // delta=7, rep=3 → multiplier=1.15 → 7*1.15=8.05 → floor=8
    expect(applyReputationMultiplier(7, 3, DEFAULT_CFG)).toBe(8);
    // delta=5, rep=5 → multiplier=1.25 → 5*1.25=6.25 → floor=6
    expect(applyReputationMultiplier(5, 5, DEFAULT_CFG)).toBe(6);
    // delta=3, rep=7 → multiplier=1.35 → 3*1.35=4.05 → floor=4
    expect(applyReputationMultiplier(3, 7, DEFAULT_CFG)).toBe(4);
  });

  it('does not scale negative coin deltas', () => {
    // Penalties pass through unchanged regardless of reputation
    expect(applyReputationMultiplier(-5, 20, DEFAULT_CFG)).toBe(-5);
    expect(applyReputationMultiplier(-10, 40, DEFAULT_CFG)).toBe(-10);
  });

  it('does not scale zero coin delta', () => {
    expect(applyReputationMultiplier(0, 20, DEFAULT_CFG)).toBe(0);
  });

  it('returns base delta when reputation is 0', () => {
    // Multiplier=1.0 → no change
    expect(applyReputationMultiplier(10, 0, DEFAULT_CFG)).toBe(10);
  });

  it('returns base delta when reputation is negative', () => {
    // Negative rep clamps multiplier to 1.0
    expect(applyReputationMultiplier(10, -5, DEFAULT_CFG)).toBe(10);
  });

  it('caps multiplied value at max multiplier', () => {
    // delta=10, rep=100 → multiplier capped at 3.0 → 10*3=30
    expect(applyReputationMultiplier(10, 100, DEFAULT_CFG)).toBe(30);
  });
});

// ── Integration: multiplier applied in applyIncome ──────────────────

describe('Reputation multiplier: income integration', () => {
  function makeBiz(overrides: Partial<BusinessCard> & { id: string }): BusinessCard {
    return {
      family: 'business' as const,
      id: overrides.id,
      name: overrides.name ?? overrides.id,
      cost: overrides.cost ?? 5,
      baseIncome: overrides.baseIncome ?? 1,
      synergyTypes: overrides.synergyTypes ?? [],
      maxLevel: overrides.maxLevel ?? 3,
      description: overrides.description ?? '',
      level: overrides.level ?? 0,
      incomeBonus: overrides.incomeBonus ?? 0,
      synergyRangeBonus: overrides.synergyRangeBonus ?? 0,
    };
  }

  it('income is scaled by reputation multiplier', () => {
    const state = setupMainStreetGame({ seed: 'rep-income-test' });
    // Use a single business so income is predictable
    state.streetGrid.fill(null);
    state.streetGrid[0] = makeBiz({ id: 'shop-1', baseIncome: 10, synergyTypes: [] });
    state.resourceBank.reputation = 10; // multiplier = 1.5

    const coinsBefore = state.resourceBank.coins;
    const result = applyIncome(state);

    // Base income = 10 (no synergy). Multiplied: floor(10 * 1.5) = 15
    expect(result.total).toBe(10); // computeIncome total is raw
    expect(state.resourceBank.coins).toBe(coinsBefore + 15);
  });

  it('income is unchanged at reputation 0', () => {
    const state = setupMainStreetGame({ seed: 'rep-zero-income' });
    state.streetGrid.fill(null);
    state.streetGrid[0] = makeBiz({ id: 'shop-1', baseIncome: 10, synergyTypes: [] });
    state.resourceBank.reputation = 0; // multiplier = 1.0

    const coinsBefore = state.resourceBank.coins;
    applyIncome(state);

    expect(state.resourceBank.coins).toBe(coinsBefore + 10);
  });

  it('income is unchanged at negative reputation', () => {
    const state = setupMainStreetGame({ seed: 'rep-neg-income' });
    state.streetGrid.fill(null);
    state.streetGrid[0] = makeBiz({ id: 'shop-1', baseIncome: 10, synergyTypes: [] });
    state.resourceBank.reputation = -3; // multiplier clamped to 1.0

    const coinsBefore = state.resourceBank.coins;
    applyIncome(state);

    expect(state.resourceBank.coins).toBe(coinsBefore + 10);
  });
});

// ── Integration: multiplier applied in resolveEvent ─────────────────

describe('Reputation multiplier: event resolution integration', () => {
  it('positive event coinDelta is scaled by reputation (target: All)', () => {
    const state = setupMainStreetGame({ seed: 'rep-event-all' });
    state.resourceBank.reputation = 20; // multiplier = 2.0
    const coinsBefore = state.resourceBank.coins;

    const event: EventCard = {
      family: 'event',
      id: 'evt-rep-test-1',
      name: 'Festival',
      trigger: 'Incident',
      effect: '+5 coins',
      target: 'All',
      coinDelta: 5,
      reputationDelta: 0,
      cost: 0,
    };

    resolveEvent(state, event);
    // floor(5 * 2.0) = 10
    expect(state.resourceBank.coins).toBe(coinsBefore + 10);
  });

  it('negative event coinDelta is NOT scaled', () => {
    const state = setupMainStreetGame({ seed: 'rep-event-neg' });
    state.resourceBank.reputation = 20; // multiplier = 2.0 (should not apply)
    const coinsBefore = state.resourceBank.coins;

    const event: EventCard = {
      family: 'event',
      id: 'evt-rep-test-2',
      name: 'Robbery',
      trigger: 'Incident',
      effect: '-3 coins',
      target: 'All',
      coinDelta: -3,
      reputationDelta: 0,
      cost: 0,
    };

    resolveEvent(state, event);
    // Negative delta passes through unchanged
    expect(state.resourceBank.coins).toBe(coinsBefore - 3);
  });

  it('event coinDelta=0 remains 0 regardless of reputation', () => {
    const state = setupMainStreetGame({ seed: 'rep-event-zero' });
    state.resourceBank.reputation = 40; // multiplier at cap
    const coinsBefore = state.resourceBank.coins;

    const event: EventCard = {
      family: 'event',
      id: 'evt-rep-test-3',
      name: 'Nothing Happens',
      trigger: 'Incident',
      effect: 'no coins',
      target: 'All',
      coinDelta: 0,
      reputationDelta: 1,
      cost: 0,
    };

    resolveEvent(state, event);
    expect(state.resourceBank.coins).toBe(coinsBefore);
  });
});

// ── Preset sanity checks: multiplier config present in all presets ───

describe('Reputation multiplier: preset configuration', () => {
  for (const [name, preset] of Object.entries({ EASY_PRESET, MEDIUM_PRESET, HARD_PRESET })) {
    it(`${name} has reputationCoinDivisor > 0`, () => {
      expect(preset.reputationCoinDivisor).toBeGreaterThan(0);
    });
    it(`${name} has maxReputationCoinMultiplier >= 1.0`, () => {
      expect(preset.maxReputationCoinMultiplier).toBeGreaterThanOrEqual(1.0);
    });
  }

  it('Medium preset starting rep produces a modest multiplier', () => {
    // Medium: startingReputation=3, divisor=20 → 1.15
    const m = reputationCoinMultiplier(MEDIUM_PRESET.startingReputation, MEDIUM_PRESET);
    expect(m).toBeCloseTo(1.15);
  });

  it('Easy preset starting rep produces a slightly higher multiplier', () => {
    // Easy: startingReputation=5, divisor=20 → 1.25
    const m = reputationCoinMultiplier(EASY_PRESET.startingReputation, EASY_PRESET);
    expect(m).toBeCloseTo(1.25);
  });

  it('Hard preset starting rep produces the smallest multiplier', () => {
    // Hard: startingReputation=2, divisor=20 → 1.10
    const m = reputationCoinMultiplier(HARD_PRESET.startingReputation, HARD_PRESET);
    expect(m).toBeCloseTo(1.10);
  });
});
