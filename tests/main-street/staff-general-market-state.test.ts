/**
 * Main Street: Staff in the General Market — State, Serialization & Refill
 * (CG-0MT3KZNQB0053K55)
 *
 * Feature 1 of "Remove dedicated staff market; route staff cards into general
 * market selection" (CG-0MT2WTN0L004JA53).
 *
 * Coverage:
 *   AC1  `staffCardMarket` removed from MainStreetState and
 *        MainStreetSerializedState (runtime + serialized form).
 *   AC2  `decks.staff` / `discards.staff` exist; setupMainStreetGame creates
 *        the staff deck via createStaffDeck(1, unlockedCardIds) — tier-
 *        filtered — and shuffles it with the seeded RNG.
 *   AC3  refillSingleRowMarket draws staff into the row within the
 *        MARKET_STAFF_MAX (0-1) composition bound, reshuffles from
 *        discards.staff, and conserves un-drawn staff in decks.staff.
 *   AC4  serialize/deserialize round-trip preserves decks.staff /
 *        discards.staff and never carries staffCardMarket.
 *   AC5  migration folds legacy staffCardMarket into decks.staff; old saves
 *        without the field load cleanly.
 *   AC6  seeded determinism preserved (same seed ⇒ same game).
 *
 * Also guards the discard/cycle pipeline (refreshMarket / cycleMarketCards
 * route row staff cards to discards.staff — never dropped) and moveToHand
 * (staff cards are hired directly, never moved into the hand).
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  serializeMainStreetState,
  deserializeMainStreetState,
  refillSingleRowMarket,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  MARKET_TOTAL_SLOTS,
  MARKET_STAFF_MAX,
} from '../../example-games/main-street/MainStreetCards';
import {
  refreshMarket,
  cycleMarketCards,
  moveToHand,
} from '../../example-games/main-street/MainStreetMarket';
import { executeDayStart } from '../../example-games/main-street/MainStreetEngine';

function countStaffInRow(state: MainStreetState): number {
  return state.market.cards.filter(c => c.family === 'staff').length;
}

// ── AC1: staffCardMarket removed ─────────────────────────────

describe('AC1: no dedicated staff market state', () => {
  it('runtime state has no staffCardMarket field', () => {
    const state = setupMainStreetGame({ seed: 'no-staff-market' });
    expect((state as unknown as Record<string, unknown>).staffCardMarket).toBeUndefined();
  });

  it('serialized state has no staffCardMarket field', () => {
    const state = setupMainStreetGame({ seed: 'no-staff-market-s' });
    const serialized = serializeMainStreetState(state) as unknown as Record<string, unknown>;
    expect(serialized.staffCardMarket).toBeUndefined();
  });
});

// ── AC2: decks.staff / discards.staff ────────────────────────

describe('AC2: staff deck in the general deck pool', () => {
  it('setupMainStreetGame creates decks.staff with staff-family cards and an empty discards.staff', () => {
    const state = setupMainStreetGame({ seed: 'staff-deck' });
    expect(state.decks.staff.length).toBeGreaterThan(0);
    for (const card of state.decks.staff) {
      expect(card.family).toBe('staff');
    }
    expect(state.discards.staff).toEqual([]);
  });

  it('staff deck is tier-filtered by unlockedCardIds (CG-0MT2WU0CX005Z143)', () => {
    const state = setupMainStreetGame({
      seed: 'staff-tier',
      unlockedCardIds: ['staff-assistant'],
    });
    expect(state.decks.staff.map(c => c.id)).toEqual(['staff-assistant-0']);
  });

  it('shuffles the staff deck with the seeded RNG (deterministic order per seed)', () => {
    const a = setupMainStreetGame({ seed: 'staff-shuffle' });
    const b = setupMainStreetGame({ seed: 'staff-shuffle' });
    expect(a.decks.staff.map(c => c.id)).toEqual(b.decks.staff.map(c => c.id));
  });
});

// ── AC3: market refill composition ───────────────────────────

describe('AC3: refill draws staff within the MARKET_STAFF_MAX bound', () => {
  it('every full row stays within 0-1 staff across many seeds', () => {
    for (let i = 0; i < 20; i++) {
      const state = setupMainStreetGame({ seed: `staff-comp-${i}` });
      expect(state.market.cards).toHaveLength(MARKET_TOTAL_SLOTS);
      expect(countStaffInRow(state), `seed staff-comp-${i}`).toBeLessThanOrEqual(MARKET_STAFF_MAX);
    }
  });

  it('draws a staff card into the row when staff is the only legal non-business draw', () => {
    const state = setupMainStreetGame({ seed: 'staff-only-option' });
    state.market.cards = [];
    state.decks.business = state.decks.business.slice(0, 1);
    state.decks.communitySpace = [];
    state.discards.communitySpace = [];
    state.decks.upgrade = [];
    state.discards.upgrade = [];
    state.decks.event = state.decks.event.filter(e => e.trigger !== 'Investment');
    state.discards.event = [];
    refillSingleRowMarket(state);
    expect(state.market.cards.filter(c => c.family === 'staff')).toHaveLength(1);
  });

  it('conserves un-drawn staff in decks.staff across repeated re-draws', () => {
    const state = setupMainStreetGame({ seed: 'staff-conservation' });
    const initialStaff = state.decks.staff.length;
    expect(initialStaff).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) {
      // Discard visible staff before clearing, mirroring the refresh/cycle
      // pipeline, so the conservation tally tracks every card.
      for (const card of state.market.cards) {
        if (card.family === 'staff') state.discards.staff.push(card as never);
      }
      state.market.cards = [];
      refillSingleRowMarket(state);
      const total = state.decks.staff.length + countStaffInRow(state) + state.discards.staff.length;
      expect(total, `re-draw ${i}`).toBe(initialStaff);
    }
  });

  it('reshuffles discards.staff back into the deck when the staff deck is empty', () => {
    const state = setupMainStreetGame({ seed: 'staff-reshuffle' });
    // Empty the staff deck and discard every staff card so the refill must
    // come from the reshuffled discards.
    const staffPool = state.decks.staff.splice(0, state.decks.staff.length);
    state.discards.staff.push(...staffPool);
    state.market.cards = [];
    state.decks.business = state.decks.business.slice(0, 1);
    state.decks.communitySpace = [];
    state.discards.communitySpace = [];
    state.decks.upgrade = [];
    state.discards.upgrade = [];
    state.decks.event = state.decks.event.filter(e => e.trigger !== 'Investment');
    state.discards.event = [];
    refillSingleRowMarket(state);
    const inRow = state.market.cards.filter(c => c.family === 'staff');
    expect(inRow).toHaveLength(1);
    expect(staffPool.some(c => c.id === inRow[0].id)).toBe(true);
  });
});

// ── AC4: serialize/deserialize round-trip ────────────────────

describe('AC4: serialization round-trip', () => {
  it('preserves decks.staff and discards.staff and drops staffCardMarket', () => {
    const state = setupMainStreetGame({ seed: 'roundtrip-staff' });
    const staff = state.decks.staff.pop()!;
    state.discards.staff.push({ ...staff });

    const serialized = serializeMainStreetState(state);
    expect(serialized.decks.staff.map(c => c.id)).toEqual(state.decks.staff.map(c => c.id));
    expect(serialized.discards.staff.map(c => c.id)).toEqual([staff.id]);
    expect((serialized as unknown as Record<string, unknown>).staffCardMarket).toBeUndefined();

    const restored = deserializeMainStreetState(serialized);
    expect(restored.decks.staff.map(c => c.id)).toEqual(state.decks.staff.map(c => c.id));
    expect(restored.discards.staff.map(c => c.id)).toEqual([staff.id]);
    expect((restored as unknown as Record<string, unknown>).staffCardMarket).toBeUndefined();
  });

  it('restored state can refill the market without staff errors', () => {
    const state = setupMainStreetGame({ seed: 'roundtrip-refill' });
    const serialized = serializeMainStreetState(state);
    const restored = deserializeMainStreetState(serialized);
    expect(() => {
      restored.market.cards = [];
      refillSingleRowMarket(restored);
    }).not.toThrow();
    expect(restored.market.cards.length).toBeGreaterThan(0);
  });
});

// ── AC5: save migration ──────────────────────────────────────

describe('AC5: legacy save migration', () => {
  /** Builds a legacy-style save: no decks.staff/discards.staff, with an optional staffCardMarket. */
  function makeLegacySave(
    withStaffCardMarket: boolean,
    seed = 'legacy-save',
  ): Record<string, unknown> {
    const state = setupMainStreetGame({ seed });
    const serialized = serializeMainStreetState(state) as unknown as Record<string, unknown>;
    const decks = serialized.decks as Record<string, unknown>;
    const discards = serialized.discards as Record<string, unknown>;
    delete decks.staff;
    delete discards.staff;
    if (withStaffCardMarket) {
      serialized.staffCardMarket = state.decks.staff.map(c => ({ ...c }));
    }
    return serialized;
  }

  it('folds legacy staffCardMarket cards into decks.staff', () => {
    const legacy = makeLegacySave(true, 'legacy-with-staff-market');
    expect(Array.isArray(legacy.staffCardMarket)).toBe(true);
    expect((legacy.staffCardMarket as unknown[]).length).toBeGreaterThan(0);
    // Capture ids BEFORE deserialize — migration deletes staffCardMarket from
    // the legacy object in place.
    const legacyStaffIds = (legacy.staffCardMarket as { id: string }[])
      .map(c => c.id)
      .sort();

    const restored = deserializeMainStreetState(legacy as never);

    // The staff cards survive the migration — they are available for future
    // market refills from decks.staff.
    expect(restored.decks.staff.map(c => c.id).sort()).toEqual(legacyStaffIds);
    expect(restored.discards.staff).toEqual([]);
    expect((restored as unknown as Record<string, unknown>).staffCardMarket).toBeUndefined();
  });

  it('loads old saves without staffCardMarket cleanly (staff fields backfilled empty)', () => {
    const legacy = makeLegacySave(false, 'legacy-no-staff-field');
    expect('staffCardMarket' in legacy).toBe(false);

    const restored = deserializeMainStreetState(legacy as never);
    expect(restored.decks.staff).toEqual([]);
    expect(restored.discards.staff).toEqual([]);
    expect(restored.gameResult).toBe('playing');
  });
});

// ── AC6: seeded determinism ──────────────────────────────────

describe('AC6: seeded determinism', () => {
  it('same seed ⇒ identical staff deck, market row, and RNG consumption', () => {
    const a = setupMainStreetGame({ seed: 'staff-determinism' });
    const b = setupMainStreetGame({ seed: 'staff-determinism' });
    expect(a.decks.staff.map(c => c.id)).toEqual(b.decks.staff.map(c => c.id));
    expect(a.market.cards.map(c => c.id)).toEqual(b.market.cards.map(c => c.id));
    expect(a.rngCalls).toBe(b.rngCalls);
  });
});

// ── Discard/cycle pipeline regression ────────────────────────

describe('staff cards in the market cycle pipeline (CG-0MT3KZNQB0053K55)', () => {
  it('refreshMarket routes a staff row card to discards.staff (never dropped)', () => {
    const state = setupMainStreetGame({ seed: 'refresh-staff' });
    executeDayStart(state);
    state.phase = 'MarketPhase';
    state.resourceBank.coins = 100;
    const staff = state.decks.staff.pop()!;
    state.market.cards.push(staff);

    refreshMarket(state);

    expect(state.discards.staff.some(c => c.id === staff.id)).toBe(true);
    // The refreshed row still satisfies the composition bounds.
    expect(state.market.cards).toHaveLength(MARKET_TOTAL_SLOTS);
    expect(countStaffInRow(state)).toBeLessThanOrEqual(MARKET_STAFF_MAX);
  });

  it('cycleMarketCards routes a staff row card to discards.staff (never dropped)', () => {
    const state = setupMainStreetGame({ seed: 'cycle-staff' });
    const staff = state.decks.staff.pop()!;
    state.market.cards.push(staff);

    cycleMarketCards(state);

    expect(state.discards.staff.some(c => c.id === staff.id)).toBe(true);
  });

  it('moveToHand rejects staff cards — they are hired directly, never held', () => {
    const state = setupMainStreetGame({ seed: 'move-staff-block' });
    const staff = state.decks.staff.pop()!;
    state.discards.staff.push({ ...staff }); // conserve the pool
    state.market.cards.push(staff);

    expect(() => moveToHand(state, staff.id)).toThrow(/hire/i);

    // The card stays in the market row and never enters the hand.
    expect(state.market.cards.some(c => c.id === staff.id)).toBe(true);
    expect(state.hand).toHaveLength(0);
  });
});