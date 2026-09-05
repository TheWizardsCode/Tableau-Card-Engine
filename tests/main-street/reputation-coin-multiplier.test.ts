/**
 * Main Street: Reputation-based Coin Multiplier Tests
 *
 * Unit tests for reputationCoinMultiplier() and applyReputationMultiplier(),
 * plus integration tests verifying that coin rewards scale correctly with
 * reputation during income and event resolution.
 *
 * Work item: CG-0MMLR38NJ1N11DOS
 *
 * CG-0MT3J80HV0084IF1: reputation coin multiplier quartered — divisor 20→80,
 * cap 3.0→1.5 in all presets. Reference points below use the quartered values
 * (rep=10 → 1.125x, rep=20 → 1.25x, rep=40 → 1.5x cap).
 *
 * CG-0MTIO1M15001E9Y6: integer economy — every coin/reputation value is a
 * whole number (×100). The divisor is 8000 in the presets so the same
 * multipliers are produced at ×100 reputation (rep=1000 → 1.125x,
 * rep=2000 → 1.25x, rep=4000 → 1.5x cap). `applyReputationMultiplier`
 * rounds its product to the nearest integer (AC3) so fractional drift never
 * accumulates in `state.resourceBank`.
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
  recalculateCard,
} from '../../example-games/main-street/MainStreetAdjacency';

import {
  resolveEvent,
} from '../../example-games/main-street/MainStreetEngine';

import type { BusinessCard, EventCard } from '../../example-games/main-street/MainStreetCards';

// ── Helper: pick only the fields reputationCoinMultiplier needs ──────
type MultiplierConfig = Pick<GameConfig, 'reputationCoinDivisor' | 'maxReputationCoinMultiplier'>;

// Integer economy divisor (80 × 100): rep=1000 → 1.125x.
const DEFAULT_CFG: MultiplierConfig = {
  reputationCoinDivisor: 8000,
  maxReputationCoinMultiplier: 1.5,
};

// ── Unit tests: reputationCoinMultiplier() ──────────────────────────

describe('reputationCoinMultiplier', () => {
  it('returns 1.0 when reputation is 0', () => {
    expect(reputationCoinMultiplier(0, DEFAULT_CFG)).toBe(1.0);
  });

  it('returns 1.0 when reputation is negative', () => {
    expect(reputationCoinMultiplier(-500, DEFAULT_CFG)).toBe(1.0);
    expect(reputationCoinMultiplier(-10000, DEFAULT_CFG)).toBe(1.0);
  });

  it('scales linearly with positive reputation', () => {
    // rep=500  → 1 + 500/8000 = 1.0625
    expect(reputationCoinMultiplier(500, DEFAULT_CFG)).toBeCloseTo(1.0625);
    // rep=1000 → 1 + 1000/8000 = 1.125
    expect(reputationCoinMultiplier(1000, DEFAULT_CFG)).toBeCloseTo(1.125);
    // rep=2000 → 1 + 2000/8000 = 1.25 (regression pin: quartered value)
    expect(reputationCoinMultiplier(2000, DEFAULT_CFG)).toBeCloseTo(1.25);
    // rep=4000 → 1 + 4000/8000 = 1.5 (at cap)
    expect(reputationCoinMultiplier(4000, DEFAULT_CFG)).toBeCloseTo(1.5);
  });

  it('caps at maxReputationCoinMultiplier', () => {
    // rep=6000 → raw = 1 + 6000/8000 = 1.75, capped to 1.5
    expect(reputationCoinMultiplier(6000, DEFAULT_CFG)).toBe(1.5);
    // rep=10000 → raw = 1 + 10000/8000 = 2.25, capped to 1.5 (regression pin)
    expect(reputationCoinMultiplier(10000, DEFAULT_CFG)).toBe(1.5);
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
  it('scales positive coin deltas to the nearest integer', () => {
    // delta=1000, rep=1000 → multiplier=1.125 → 1125.0 → 1125 (integer, AC3)
    expect(applyReputationMultiplier(1000, 1000, DEFAULT_CFG)).toBe(1125);
  });

  it('rounds fractional products to the nearest integer (no drift)', () => {
    // delta=700, rep=300 → multiplier=1.0375 → 726.25 → 726
    expect(applyReputationMultiplier(700, 300, DEFAULT_CFG)).toBe(726);
    // delta=500, rep=500 → multiplier=1.0625 → 531.25 → 531
    expect(applyReputationMultiplier(500, 500, DEFAULT_CFG)).toBe(531);
    // delta=300, rep=700 → multiplier=1.0875 → 326.25 → 326
    expect(applyReputationMultiplier(300, 700, DEFAULT_CFG)).toBe(326);
  });

  it('does not scale negative coin deltas', () => {
    // Penalties pass through unchanged regardless of reputation
    expect(applyReputationMultiplier(-500, 2000, DEFAULT_CFG)).toBe(-500);
    expect(applyReputationMultiplier(-1000, 4000, DEFAULT_CFG)).toBe(-1000);
  });

  it('does not scale zero coin delta', () => {
    expect(applyReputationMultiplier(0, 2000, DEFAULT_CFG)).toBe(0);
  });

  it('returns base delta when reputation is 0', () => {
    // Multiplier=1.0 → no change
    expect(applyReputationMultiplier(1000, 0, DEFAULT_CFG)).toBe(1000);
  });

  it('returns base delta when reputation is negative', () => {
    // Negative rep clamps multiplier to 1.0
    expect(applyReputationMultiplier(1000, -500, DEFAULT_CFG)).toBe(1000);
  });

  it('caps multiplied value at max multiplier', () => {
    // delta=1000, rep=10000 → multiplier capped at 1.5 → 1500 (regression pin)
    expect(applyReputationMultiplier(1000, 10000, DEFAULT_CFG)).toBe(1500);
  });

  // ── Integer accumulation tests (CG-0MTIO1M15001E9Y6) ────────────

  it('integer income accumulates without loss with multiplier=1.0', () => {
    // Two turns of 100 income with multiplier=1.0 → 200
    const turn1 = applyReputationMultiplier(100, 0, DEFAULT_CFG);
    const turn2 = applyReputationMultiplier(100, 0, DEFAULT_CFG);
    expect(turn1 + turn2).toBe(200);
  });

  it('accumulates reputation-multiplied income with integer rounding', () => {
    // rep=300 → multiplier=1.0375
    // Each turn: 5000 * 1.0375 = 5187.5 → 5188 (rounded up)
    const turn1 = applyReputationMultiplier(5000, 300, DEFAULT_CFG);
    const turn2 = applyReputationMultiplier(5000, 300, DEFAULT_CFG);
    expect(turn1).toBe(5188);
    expect(turn2).toBe(5188);
    // After 2 turns: 5188 + 5188 = 10376
    expect(turn1 + turn2).toBe(10376);
  });

  it('integer baseIncome values remain unchanged (backward compat)', () => {
    // Integer baseIncome with multiplier=1.0 → same integer
    expect(applyReputationMultiplier(1, 0, DEFAULT_CFG)).toBe(1);
    expect(applyReputationMultiplier(2, 0, DEFAULT_CFG)).toBe(2);
    expect(applyReputationMultiplier(3, 0, DEFAULT_CFG)).toBe(3);
    expect(applyReputationMultiplier(10, 0, DEFAULT_CFG)).toBe(10);
  });

  it('integer baseIncome with reputation still produces expected values', () => {
    // delta=10000, rep=300 → multiplier=1.0375 → 10375
    expect(applyReputationMultiplier(10000, 300, DEFAULT_CFG)).toBe(10375);
    // delta=20000, rep=1000 → multiplier=1.125 → 22500
    expect(applyReputationMultiplier(20000, 1000, DEFAULT_CFG)).toBe(22500);
  });
});

// ── Integration: multiplier applied in applyIncome ──────────────────

describe('Reputation multiplier: income integration', () => {
  function makeBiz(overrides: Partial<BusinessCard> & { id: string }): BusinessCard {
    return {
      family: 'business' as const,
      id: overrides.id,
      name: overrides.name ?? overrides.id,
      cost: overrides.cost ?? 500,
      baseIncome: overrides.baseIncome ?? 100,
      synergyTypes: overrides.synergyTypes ?? [],
      maxLevel: overrides.maxLevel ?? 3,
      description: overrides.description ?? '',
      level: overrides.level ?? 0,
      incomeBonus: overrides.incomeBonus ?? 0,
      synergyRangeBonus: overrides.synergyRangeBonus ?? 0,
      reputationBonus: overrides.reputationBonus ?? 0,
    ongoingCost: overrides.ongoingCost ?? 0,
    };
  }

  it('income is scaled by reputation multiplier', () => {
    const state = setupMainStreetGame({ seed: 'rep-income-test' });
    // Use a single business so income is predictable
    state.streetGrid.fill(null);
    state.streetGrid[0] = makeBiz({ id: 'shop-1', baseIncome: 1000, synergyTypes: [] });
    recalculateCard(state, 0);
    state.resourceBank.reputation = 1000; // multiplier = 1.125

    const coinsBefore = state.resourceBank.coins;
    const result = applyIncome(state);

    // Base income = 1000 (no synergy). Multiplied: 1000 * 1.125 = 1125
    expect(result.total).toBe(1000); // computeIncome total is raw
    expect(state.resourceBank.coins).toBe(coinsBefore + 1125);
  });

  it('income is unchanged at reputation 0', () => {
    const state = setupMainStreetGame({ seed: 'rep-zero-income' });
    state.streetGrid.fill(null);
    state.streetGrid[0] = makeBiz({ id: 'shop-1', baseIncome: 1000, synergyTypes: [] });
    recalculateCard(state, 0);
    state.resourceBank.reputation = 0; // multiplier = 1.0

    const coinsBefore = state.resourceBank.coins;
    applyIncome(state);

    expect(state.resourceBank.coins).toBe(coinsBefore + 1000);
  });

  it('income is unchanged at negative reputation', () => {
    const state = setupMainStreetGame({ seed: 'rep-neg-income' });
    state.streetGrid.fill(null);
    state.streetGrid[0] = makeBiz({ id: 'shop-1', baseIncome: 1000, synergyTypes: [] });
    recalculateCard(state, 0);
    state.resourceBank.reputation = -300; // multiplier clamped to 1.0

    const coinsBefore = state.resourceBank.coins;
    applyIncome(state);

    expect(state.resourceBank.coins).toBe(coinsBefore + 1000);
  });

  // ── Integer income integration tests (CG-0MTIO1M15001E9Y6) ──

  it('accumulates income over multiple turns (no rep)', () => {
    const state = setupMainStreetGame({ seed: 'frac-income-no-rep' });
    state.streetGrid.fill(null);
    state.streetGrid[0] = makeBiz({ id: 'biz-1', baseIncome: 100, synergyTypes: [] });
    recalculateCard(state, 0);
    state.resourceBank.reputation = 0;

    // Set initial coins to 0 for predictable counting
    state.resourceBank.coins = 0;

    // Turn 1: 100 * 1.0 = 100
    applyIncome(state);
    expect(state.resourceBank.coins).toBe(100);

    // Turn 2: 100 * 1.0 = 100 → total = 200
    applyIncome(state);
    expect(state.resourceBank.coins).toBe(200);
  });

  it('accumulates income with reputation multiplier (rounded per turn)', () => {
    const state = setupMainStreetGame({ seed: 'frac-income-rep' });
    state.streetGrid.fill(null);
    state.streetGrid[0] = makeBiz({ id: 'biz-1', baseIncome: 100, synergyTypes: [] });
    recalculateCard(state, 0);
    state.resourceBank.reputation = 300; // multiplier ≈ 1.0375

    state.resourceBank.coins = 0;

    // Turn 1: 100 * 1.0375 = 103.75 → 104 (rounded per turn, AC3)
    applyIncome(state);
    expect(state.resourceBank.coins).toBe(104);

    // Turn 2: 104 again → total = 208
    applyIncome(state);
    expect(state.resourceBank.coins).toBe(208);
    expect(state.resourceBank.coins).toBeGreaterThanOrEqual(200);
  });
});

// ── Integration: multiplier applied in resolveEvent ─────────────────

describe('Reputation multiplier: event resolution integration', () => {
  it('positive event coinDelta is scaled by reputation (target: All)', () => {
    const state = setupMainStreetGame({ seed: 'rep-event-all' });
    state.resourceBank.reputation = 2000; // multiplier = 1.25 (regression pin)
    const coinsBefore = state.resourceBank.coins;

    const event: EventCard = {
      family: 'event',
      id: 'evt-rep-test-1',
      name: 'Festival',
      trigger: 'Incident',
      effect: '+500 coins',
      target: 'All',
      coinDelta: 500,
      reputationDelta: 0,
      cost: 0,
    };

    resolveEvent(state, event);
    // 500 * 1.25 = 625
    expect(state.resourceBank.coins).toBe(coinsBefore + 625);
  });

  it('negative event coinDelta is NOT scaled', () => {
    const state = setupMainStreetGame({ seed: 'rep-event-neg' });
    state.resourceBank.reputation = 2000; // multiplier = 1.25 (should not apply)
    const coinsBefore = state.resourceBank.coins;

    const event: EventCard = {
      family: 'event',
      id: 'evt-rep-test-2',
      name: 'Robbery',
      trigger: 'Incident',
      effect: '-300 coins',
      target: 'All',
      coinDelta: -300,
      reputationDelta: 0,
      cost: 0,
    };

    resolveEvent(state, event);
    // Negative delta passes through unchanged
    expect(state.resourceBank.coins).toBe(coinsBefore - 300);
  });

  it('event coinDelta=0 remains 0 regardless of reputation', () => {
    const state = setupMainStreetGame({ seed: 'rep-event-zero' });
    state.resourceBank.reputation = 4000; // multiplier at cap
    const coinsBefore = state.resourceBank.coins;

    const event: EventCard = {
      family: 'event',
      id: 'evt-rep-test-3',
      name: 'Nothing Happens',
      trigger: 'Incident',
      effect: 'no coins',
      target: 'All',
      coinDelta: 0,
      reputationDelta: 100,
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
    // Medium: startingReputation=300, divisor=8000 → 1.0375
    const m = reputationCoinMultiplier(MEDIUM_PRESET.startingReputation, MEDIUM_PRESET);
    expect(m).toBeCloseTo(1.0375);
  });

  it('Easy preset starting rep produces a slightly higher multiplier', () => {
    // Easy: startingReputation=500, divisor=8000 → 1.0625
    const m = reputationCoinMultiplier(EASY_PRESET.startingReputation, EASY_PRESET);
    expect(m).toBeCloseTo(1.0625);
  });

  it('Hard preset starting rep produces the smallest multiplier', () => {
    // Hard: startingReputation=200, divisor=8000 → 1.025
    const m = reputationCoinMultiplier(HARD_PRESET.startingReputation, HARD_PRESET);
    expect(m).toBeCloseTo(1.025);
  });
});
