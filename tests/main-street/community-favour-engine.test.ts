/**
 * Community Favour (CG-0MSTOATDQ005XDET): Engine unit tests.
 *
 * Covers:
 * - Legal exchange in both directions
 * - Insufficient funds rejection
 * - Once-per-turn enforcement + DayStart reset
 * - MarketPhase gating
 * - Config rates per difficulty
 * - Legacy save backfill (favourUsedThisTurn default)
 */
import { describe, it, expect } from 'vitest';

import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import { executeAction, executeDayStart, type PlayerAction } from '../../example-games/main-street/MainStreetEngine';
import { getPreset, DIFFICULTY_PRESETS, type DifficultyName } from '../../example-games/main-street/MainStreetDifficulty';
import { serializeMainStreetState, deserializeMainStreetState } from '../../example-games/main-street/MainStreetState';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(
  difficulty: DifficultyName = 'Medium',
  seed: string = 'cf-engine-test',
): MainStreetState {
  const state = setupMainStreetGame({ difficulty, seed });
  // Setup leaves the phase at DayStart; advance to MarketPhase where the
  // Community Favour action is legal.
  if (state.phase !== 'MarketPhase') {
    executeDayStart(state);
  }
  return state;
}

function makeCommunityFavourAction(
  direction: 'coins-to-rep' | 'rep-to-coins',
): PlayerAction {
  return { type: 'community-favour', direction };
}

// ── AC1 + AC5: Config constants exist on all presets ────────

describe('GameConfig Community Favour constants', () => {
  for (const [name, preset] of Object.entries(DIFFICULTY_PRESETS)) {
    it(`${name} preset has favourCoinsToRepCost`, () => {
      expect(preset.favourCoinsToRepCost).toBe(2);
    });
    it(`${name} preset has favourRepToCoinsRepCost`, () => {
      expect(preset.favourRepToCoinsRepCost).toBe(2);
    });
    it(`${name} preset has favourRepToCoinsCoinGain`, () => {
      expect(preset.favourRepToCoinsCoinGain).toBe(3);
    });
  }

  it('getPreset returns config with favour fields', () => {
    const cfg = getPreset('Easy');
    expect(cfg.favourCoinsToRepCost).toBe(2);
  });
});

// ── AC2: Legal exchange - coins to reputation ──────────────

describe('coins-to-rep exchange', () => {
  it('converts coins to reputation at the configured rate', () => {
    const state = createTestState();
    const beforeCoins = state.resourceBank.coins;
    const beforeRep = state.resourceBank.reputation;
    const cost = state.config.favourCoinsToRepCost;

    const action = makeCommunityFavourAction('coins-to-rep');
    expect(executeAction(state, action)).toBeNull();

    expect(state.resourceBank.coins).toBe(beforeCoins - cost);
    expect(state.resourceBank.reputation).toBe(beforeRep + 1);
    // Ledger should be synced
    expect(state.ledger.get('coins')).toBe(state.resourceBank.coins);
    expect(state.ledger.get('reputation')).toBe(state.resourceBank.reputation);
  });

  it('sets favourUsedThisTurn flag', () => {
    const state = createTestState();
    expect(state.favourUsedThisTurn).toBe(false);

    executeAction(state, makeCommunityFavourAction('coins-to-rep'));

    expect(state.favourUsedThisTurn).toBe(true);
  });

  it('does not decrement actionsRemaining', () => {
    const state = createTestState();
    const actionsBefore = state.actionsRemaining;

    executeAction(state, makeCommunityFavourAction('coins-to-rep'));

    expect(state.actionsRemaining).toBe(actionsBefore);
  });
});

// ── AC2: Legal exchange - reputation to coins ──────────────

describe('rep-to-coins exchange', () => {
  it('converts reputation to coins at the configured rate', () => {
    const state = createTestState();
    const beforeCoins = state.resourceBank.coins;
    const beforeRep = state.resourceBank.reputation;
    const repCost = state.config.favourRepToCoinsRepCost;
    const coinGain = state.config.favourRepToCoinsCoinGain;

    const action = makeCommunityFavourAction('rep-to-coins');
    expect(executeAction(state, action)).toBeNull();

    expect(state.resourceBank.reputation).toBe(beforeRep - repCost);
    expect(state.resourceBank.coins).toBe(beforeCoins + coinGain);
    expect(state.ledger.get('reputation')).toBe(state.resourceBank.reputation);
    expect(state.ledger.get('coins')).toBe(state.resourceBank.coins);
  });

  it('sets favourUsedThisTurn flag', () => {
    const state = createTestState();
    expect(state.favourUsedThisTurn).toBe(false);

    executeAction(state, makeCommunityFavourAction('rep-to-coins'));

    expect(state.favourUsedThisTurn).toBe(true);
  });
});

// ── AC6: MarketPhase gating ────────────────────────────────

describe('MarketPhase gating', () => {
  it('rejects coins-to-rep during IncomePhase', () => {
    const state = createTestState();
    // Force to a non-MarketPhase
    state.phase = 'IncomePhase';

    expect(() =>
      executeAction(state, makeCommunityFavourAction('coins-to-rep')),
    ).toThrow('Cannot perform community-favour during IncomePhase');
  });

  it('rejects rep-to-coins during EndCheck phase', () => {
    const state = createTestState();
    state.phase = 'EndCheck';

    expect(() =>
      executeAction(state, makeCommunityFavourAction('rep-to-coins')),
    ).toThrow('Cannot perform community-favour during EndCheck');
  });
});

// ── AC2: Insufficient funds ────────────────────────────────

describe('Insufficient funds rejection', () => {
  it('rejects coins-to-rep when coins are insufficient', () => {
    const state = createTestState();
    // Set coins to 0 — definitely insufficient for cost=2
    state.resourceBank.coins = 0;

    expect(() =>
      executeAction(state, makeCommunityFavourAction('coins-to-rep')),
    ).toThrow('Not enough coins for Community Favour');
  });

  it('rejects rep-to-coins when reputation is insufficient', () => {
    const state = createTestState();
    // Set reputation to 0 — insufficient for repCost=2
    state.resourceBank.reputation = 0;

    expect(() =>
      executeAction(state, makeCommunityFavourAction('rep-to-coins')),
    ).toThrow('Not enough reputation for Community Favour');
  });
});

// ── AC7: Once-per-turn enforcement ─────────────────────────

describe('Once-per-turn enforcement', () => {
  it('rejects a second exchange after one was used', () => {
    const state = createTestState();

    executeAction(state, makeCommunityFavourAction('coins-to-rep'));

    expect(state.favourUsedThisTurn).toBe(true);
    expect(() =>
      executeAction(state, makeCommunityFavourAction('rep-to-coins')),
    ).toThrow('You have already used Community Favour this turn.');
  });

  it('allows exchange on the next day after DayStart reset', () => {
    const state = createTestState();

    executeAction(state, makeCommunityFavourAction('coins-to-rep'));
    expect(state.favourUsedThisTurn).toBe(true);

    // Simulate DayStart for a new day
    state.phase = 'DayStart';
    state.turn = 2;
    executeDayStart(state);

    // After DayStart, the flag should be reset
    expect(state.favourUsedThisTurn).toBe(false);
    expect(state.phase).toBe('MarketPhase');

    // Now the exchange should be allowed again
    expect(() =>
      executeAction(state, makeCommunityFavourAction('rep-to-coins')),
    ).not.toThrow();
  });
});

// ── AC6 + AC2: Game over check ─────────────────────────────

describe('Game over check', () => {
  it('rejects exchange when game is over', () => {
    const state = createTestState();
    state.gameResult = 'loss';
    state.endReason = 'bankruptcy';

    expect(() =>
      executeAction(state, makeCommunityFavourAction('coins-to-rep')),
    ).toThrow('Game is over. No more actions allowed.');
  });
});

// ── AC3: Legacy save backfill ──────────────────────────────

describe('Legacy save backfill', () => {
  it('defaults favourUsedThisTurn to false for saves without the field', () => {
    const state = createTestState();
    const serialized = serializeMainStreetState(state);

    // Remove the field to simulate a legacy save
    delete (serialized as unknown as Record<string, unknown>).favourUsedThisTurn;

    const restored = deserializeMainStreetState(serialized);

    expect(restored.favourUsedThisTurn).toBe(false);
  });

  it('preserves favourUsedThisTurn=true through serialize/deserialize', () => {
    const state = createTestState();
    executeAction(state, makeCommunityFavourAction('coins-to-rep'));
    expect(state.favourUsedThisTurn).toBe(true);

    const serialized = serializeMainStreetState(state);
    const restored = deserializeMainStreetState(serialized);

    expect(restored.favourUsedThisTurn).toBe(true);
  });
});

// ── AC5: Round-trip is lossy (no arbitrage) ─────────────────

describe('Round-trip is lossy (no arbitrage)', () => {
  it('default rates make a round trip lossy', () => {
    const state = createTestState();
    const cost = state.config.favourCoinsToRepCost;
    const repCost = state.config.favourRepToCoinsRepCost;
    const coinGain = state.config.favourRepToCoinsCoinGain;

    // Precondition: defaults are 2 coins → 1 rep and 2 rep → 3 coins.
    // A full 2-coin → 1-rep → 1.5-coin cycle is lossy (0.5 coins lost),
    // so the exchange cannot be arbitraged for profit.
    expect(cost).toBe(2);
    expect(repCost).toBe(2);
    expect(coinGain).toBe(3);

    // Value check: the coins gained from spending 1 rep (coinGain / repCost
    // = 1.5) is strictly less than the coins spent to buy 1 rep (cost = 2).
    // Hence a full cycle destroys value: no infinite arbitrage.
    const coinPerRepGained = coinGain / repCost; // 1.5
    const coinPerRepCost = cost; // 2
    expect(coinPerRepGained).toBeLessThan(coinPerRepCost);

    // Confirm the exchange works in isolation (single exchange only — the
    // once-per-turn gate prevents cycling within a turn, reinforcing the
    // anti-arbitrage guarantee).
    state.resourceBank.coins = 10;
    state.resourceBank.reputation = 5;

    executeAction(state, makeCommunityFavourAction('coins-to-rep'));
    expect(state.resourceBank.coins).toBe(8);
    expect(state.resourceBank.reputation).toBe(6);
  });
});