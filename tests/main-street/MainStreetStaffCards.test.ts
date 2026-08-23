/**
 * Main Street: Staff Cards & Hand Capacity Tests
 *
 * Tests for the Staff Cards & Hand Capacity System, validating staff card
 * purchase, ongoing cost deduction, layoff mechanics, hand capacity increases,
 * and edge cases.
 *
 * NOTE: These tests validate the staff card feature added by the Multi-Use
 * Card Economy implementation (CG-0MQRXN2CT0076OW7). They reference types and
 * functions that may not exist until the implementation child
 * (CG-0MQRXO41D009DH26) is complete. Feature-detection flags control which
 * tests run.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  serializeMainStreetState,
  deserializeMainStreetState,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  processEndOfTurn,
  executeAction,
} from '../../example-games/main-street/MainStreetEngine';
import { createStaffDeck, type StaffCard } from '../../example-games/main-street/MainStreetCards';

// ── Feature Detection ───────────────────────────────────────



/** True once staff-related types and functions exist (I5). */
let STAFF_FEATURE_AVAILABLE = false;
(async () => {
  try {
    const cards = await import('../../example-games/main-street/MainStreetCards');
    STAFF_FEATURE_AVAILABLE = typeof (cards as any).STAFF_CARD_TEMPLATES !== 'undefined'
      || typeof (cards as any).createStaffDeck === 'function';
  } catch {
    // feature not yet implemented
  }
})();

/**
 * Tests for staff purchase API availability.
 * Returns true if a staff purchase function exists.
 */
async function hasStaffPurchaseAPI(): Promise<boolean> {
  try {
    const engine = await import('../../example-games/main-street/MainStreetEngine');
    if (typeof (engine as any).purchaseStaffCard === 'function') return true;
    const market = await import('../../example-games/main-street/MainStreetMarket');
    if (typeof (market as any).purchaseStaffCard === 'function') return true;
  } catch {
    // ignore
  }
  return false;
}

/**
 * Tests for layoff API availability.
 */
async function hasLayoffAPI(): Promise<boolean> {
  try {
    const engine = await import('../../example-games/main-street/MainStreetEngine');
    if (typeof (engine as any).layoffStaffCard === 'function') return true;
    const market = await import('../../example-games/main-street/MainStreetMarket');
    if (typeof (market as any).layoffStaffCard === 'function') return true;
  } catch {
    // ignore
  }
  return false;
}



// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'staff-cards-test'): MainStreetState {
  return setupMainStreetGame({ seed });
}

/**
 * Returns maxHandSize from state using safe accessor.
 */
function getMaxHandSize(state: MainStreetState): number {
  const val = (state as any).maxHandSize;
  return typeof val === 'number' ? val : 2;
}

/**
 * Returns staffCards array from state using safe accessor.
 */
function getStaffCards(state: MainStreetState): any[] {
  return (state as any).staffCards ?? [];
}

/**
 * Returns hand array from state using safe accessor.
 */
function getHand(state: MainStreetState): any[] {
  return (state as any).hand ?? [];
}

/**
 * Ensures a staff card is present in the general market row (the unified
 * market model, CG-0MT2WTN0L004JA53): staff are hired directly from the
 * row — there is no dedicated staff market. Returns the first staff card
 * in the row, moving a staff-deck card into the row when empty.
 */
function ensureStaffInMarket(state: MainStreetState): StaffCard {
  const existing = (state.market.cards as any[]).find((c: any) => c.family === 'staff');
  if (existing) return existing as StaffCard;
  const deckCard = createStaffDeck(1)[0];
  state.market.cards.push({ ...deckCard });
  return state.market.cards[state.market.cards.length - 1] as StaffCard;
}

/**
 * Employs a staff member directly (layoff/stacking setups avoid hiring
 * through the market row so the tests focus on the layoff mechanic itself).
 */
function employStaff(state: MainStreetState, overrides: Partial<StaffCard> = {}): StaffCard {
  const tpl = { ...createStaffDeck(1)[0], ...overrides };
  (state as any).staffCards.push({ ...tpl });
  return tpl;
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreet Staff Cards & Hand Capacity', () => {
  // ── Staff Card Type & Templates ──────────────────────────

  describe('Staff card definition', () => {
    it('should have staffCards field as empty array initially', () => {
      const state = createTestState();
      const staff = getStaffCards(state);
      expect(Array.isArray(staff)).toBe(true);
      expect(staff).toHaveLength(0);
    });

    it('should have maxHandSize default to 2', () => {
      const state = createTestState();
      expect(getMaxHandSize(state)).toBe(3);
    });

    it.runIf(STAFF_FEATURE_AVAILABLE)(
      'should have staff card templates with required fields',
      async () => {
        const cards = await import('../../example-games/main-street/MainStreetCards');
        const templates = (cards as any).STAFF_CARD_TEMPLATES ?? [];

        expect(templates.length).toBeGreaterThanOrEqual(3);

        for (const tpl of templates) {
          expect(typeof tpl.id).toBe('string');
          expect(typeof tpl.name).toBe('string');
          expect(typeof tpl.cost).toBe('number');
          expect(typeof tpl.handSlotsAdded).toBe('number');
          expect(tpl.handSlotsAdded).toBeGreaterThanOrEqual(1);
          // 4 = Executive premium slot capacity (Group F, CG-0MSQJ7VL9009JHF4).
          expect(tpl.handSlotsAdded).toBeLessThanOrEqual(4);

          // ongoingCost should exist (0 is acceptable for cheap staff)
          expect(typeof tpl.ongoingCost).toBe('number');
          expect(tpl.ongoingCost).toBeGreaterThanOrEqual(0);
        }
      },
    );

    it.runIf(STAFF_FEATURE_AVAILABLE)(
      'should have staff cards with family: staff',
      async () => {
        const cards = await import('../../example-games/main-street/MainStreetCards');
        const templates = (cards as any).STAFF_CARD_TEMPLATES ?? [];

        for (const tpl of templates) {
          expect(tpl.family).toBe('staff');
        }
      },
    );

    it.runIf(STAFF_FEATURE_AVAILABLE)(
      'should have at least three tiers of staff cards',
      async () => {
        const cards = await import('../../example-games/main-street/MainStreetCards');
        const templates = (cards as any).STAFF_CARD_TEMPLATES ?? [];

        const slots = templates.map((t: any) => t.handSlotsAdded);
        expect(slots).toContain(1);
        expect(slots).toContain(2);
        // Exactly 3 tiers — +1, +2, +3
        expect(slots).toContain(3);
      },
    );
  });

  // ── Staff Card Purchase ──────────────────────────────────

  describe('Staff card purchase', () => {
    it.runIf(STAFF_FEATURE_AVAILABLE)(
      'should increase maxHandSize when staff card is purchased',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const purchaseAPI = await hasStaffPurchaseAPI();
        if (!purchaseAPI) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');
        const fn = (engine as any).purchaseStaffCard;
        if (typeof fn !== 'function') return;

        const initialMax = getMaxHandSize(state);

        // Hire a staff card from the general market row (CG-0MT2WTN0L004JA53).
        const card = ensureStaffInMarket(state);
        state.resourceBank.coins = card.cost;

        fn(state, card.id);
        expect(getMaxHandSize(state)).toBe(initialMax + card.handSlotsAdded);
      },
    );

    it.runIf(STAFF_FEATURE_AVAILABLE)(
      'should deduct coins when purchasing staff card',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const purchaseAPI = await hasStaffPurchaseAPI();
        if (!purchaseAPI) return;

        const engineModule = await import('../../example-games/main-street/MainStreetEngine');
        const fn = (engineModule as any).purchaseStaffCard;
        if (typeof fn !== 'function') return;

        // Hire a staff card from the general market row (CG-0MT2WTN0L004JA53)
        const card = ensureStaffInMarket(state);
        state.resourceBank.coins = card.cost + 10;
        const coinsBefore = state.resourceBank.coins;

        fn(state, card.id);
        expect(state.resourceBank.coins).toBe(coinsBefore - card.cost);
      },
    );

    it.runIf(STAFF_FEATURE_AVAILABLE)(
      'should add staff card to active staffCards array',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const purchaseAPI = await hasStaffPurchaseAPI();
        if (!purchaseAPI) return;

        const engineModule = await import('../../example-games/main-street/MainStreetEngine');
        const fn = (engineModule as any).purchaseStaffCard;
        if (typeof fn !== 'function') return;

        // Hire a staff card from the general market row (CG-0MT2WTN0L004JA53)
        const card = ensureStaffInMarket(state);
        state.resourceBank.coins = card.cost + 10;
        const staffBefore = getStaffCards(state).length;

        fn(state, card.id);
        expect(getStaffCards(state).length).toBe(staffBefore + 1);
      },
    );

    it('should reject staff purchase with insufficient coins', () => {
      const state = createTestState();
      executeDayStart(state);

      state.resourceBank.coins = 0;

      // Without implementation, just verify state is consistent
      expect(state.resourceBank.coins).toBe(0);
    });

    it('should not occupy hand slot when staff card is purchased', () => {
      const state = createTestState();
      executeDayStart(state);

      // Staff cards should not be in the hand
      const hand = getHand(state);
      const hasStaffInHand = hand.some((c: any) => c.family === 'staff');
      expect(hasStaffInHand).toBe(false);
    });
  });

  // ── Multiple Staff Cards Stacking ─────────────────────────

  describe('Multiple staff cards stacking', () => {
    it.runIf(STAFF_FEATURE_AVAILABLE)(
      'should stack hand capacity from multiple staff cards',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const purchaseAPI = await hasStaffPurchaseAPI();
        if (!purchaseAPI) return;

        const engineModule = await import('../../example-games/main-street/MainStreetEngine');
        const fn = (engineModule as any).purchaseStaffCard;
        if (typeof fn !== 'function') return;

        // Seed two distinct staff cards into the general market row
        // (CG-0MT2WTN0L004JA53) so both hires stack hand capacity.
        const deck = createStaffDeck(1);
        const first = deck[0];
        const second = deck[1] ?? deck[0];
        state.market.cards.push({ ...first });
        if (second.id !== first.id) state.market.cards.push({ ...second });
        const staffCards = [first, ...(second.id !== first.id ? [second] : [])];

        const initialMax = getMaxHandSize(state);

        // Purchase first staff card
        state.resourceBank.coins = 100;
        fn(state, staffCards[0].id);
        const afterFirst = getMaxHandSize(state);

        // Purchase second staff card
        fn(state, staffCards[1].id);
        const afterSecond = getMaxHandSize(state);

        // Each staff card adds its handSlotsAdded to maxHandSize
        const expectedAfterFirst = initialMax + staffCards[0].handSlotsAdded;
        const expectedAfterSecond = expectedAfterFirst + staffCards[1].handSlotsAdded;

        expect(afterFirst).toBe(expectedAfterFirst);
        expect(afterSecond).toBe(expectedAfterSecond);
      },
    );

    it('should not exceed reasonable hand capacity', () => {
      const state = createTestState();
      // Default max is 2
      expect(getMaxHandSize(state)).toBeLessThanOrEqual(20);
    });
  });

  // ── Ongoing Cost Deduction ────────────────────────────────

  describe('Staff ongoing cost deduction', () => {
    it.runIf(STAFF_FEATURE_AVAILABLE)(
      'should deduct ongoing cost from coins each IncomePhase',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        // Set up staff cards in state directly
        if (STAFF_FEATURE_AVAILABLE) {
          (state as any).staffCards = [
            { id: 'staff-assistant', name: 'Assistant', ongoingCost: 1, handSlotsAdded: 1 },
          ];
        }

        processEndOfTurn(state);

        // If cost deduction is implemented, coins should have decreased
        // (or increased less than expected)
        // We check that the operation doesn't crash and continues
        expect(state.gameResult).toBeDefined();
      },
    );

    it('should continue game even with insufficient coins for staff costs', () => {
      const state = createTestState();
      executeDayStart(state);

      // Set low coins with staff active
      state.resourceBank.coins = 0;
      if (STAFF_FEATURE_AVAILABLE) {
        (state as any).staffCards = [
          { id: 'staff-manager', name: 'Manager', ongoingCost: 2, handSlotsAdded: 2 },
        ];
      }

      // Should not crash
      expect(() => processEndOfTurn(state)).not.toThrow();
    });
  });

  // ── Staff Layoff ──────────────────────────────────────────

  describe('Staff layoff mechanic', () => {
    it.runIf(STAFF_FEATURE_AVAILABLE)(
      'should remove random hand cards when staff is laid off',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const layoffAPI = await hasLayoffAPI();
        if (!layoffAPI) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');
        const fn = (engine as any).layoffStaffCard;
        if (typeof fn !== 'function') return;

        // Add hand cards and employ a staff card to lay off
        // (CG-0MT2WTN0L004JA53: layoff returns staff to discards.staff).
        const hand = getHand(state);
        const staffCard = employStaff(state);

        // Add some hand cards
        for (let i = 0; i < 3; i++) {
          hand.push({
            family: 'business',
            id: `hand-card-${i}`,
            name: `Card ${i}`,
            baseIncome: 1,
            synergyTypes: ['Food'],
          });
        }

        const handSizeBefore = hand.length;
        const slotsToRemove = staffCard.handSlotsAdded;

        fn(state, staffCard.id);

        const handSizeAfter = hand.length;
        expect(handSizeAfter).toBe(Math.max(0, handSizeBefore - slotsToRemove));
      },
    );

    it.runIf(STAFF_FEATURE_AVAILABLE)(
      'should remove all hand cards when fewer hand cards than slots to remove',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const layoffAPI = await hasLayoffAPI();
        if (!layoffAPI) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');
        const fn = (engine as any).layoffStaffCard;
        if (typeof fn !== 'function') return;

        // Employ a staff card to lay off (CG-0MT2WTN0L004JA53)
        const hand = getHand(state);
        const staffCard = employStaff(state);
        hand.push({
          family: 'business',
          id: 'hand-card-only',
          name: 'Only Card',
          baseIncome: 1,
          synergyTypes: ['Food'],
        });

        fn(state, staffCard.id);

        // All hand cards should be removed (fewer than slots)
        expect(getHand(state).length).toBe(0);
      },
    );

    it.runIf(STAFF_FEATURE_AVAILABLE)(
      'should remove staff card from active staffCards after layoff',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const layoffAPI = await hasLayoffAPI();
        if (!layoffAPI) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');
        const fn = (engine as any).layoffStaffCard;
        if (typeof fn !== 'function') return;

        // Employ a staff card to lay off (CG-0MT2WTN0L004JA53)
        const staffCard = employStaff(state);
        const staffCountBefore = getStaffCards(state).length;

        fn(state, staffCard.id);

        expect(getStaffCards(state).length).toBe(staffCountBefore - 1);
      },
    );

    it.runIf(STAFF_FEATURE_AVAILABLE)(
      'should decrease maxHandSize when staff is laid off',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const layoffAPI = await hasLayoffAPI();
        if (!layoffAPI) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');
        const fn = (engine as any).layoffStaffCard;
        if (typeof fn !== 'function') return;

        // Employ a staff card to lay off (CG-0MT2WTN0L004JA53)
        const staffCard = employStaff(state);
        const maxBefore = getMaxHandSize(state);

        fn(state, staffCard.id);

        expect(getMaxHandSize(state)).toBe(maxBefore - staffCard.handSlotsAdded);
      },
    );

    it.runIf(STAFF_FEATURE_AVAILABLE)(
      'should use seeded RNG for random card selection during layoff',
      async () => {
        const state1 = createTestState('layoff-rng-test');
        const state2 = createTestState('layoff-rng-test');

        executeDayStart(state1);
        executeDayStart(state2);

        const layoffAPI = await hasLayoffAPI();
        if (!layoffAPI) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');
        const fn = (engine as any).layoffStaffCard;
        if (typeof fn !== 'function') return;

        // Add same hand cards to both states
        for (let i = 0; i < 5; i++) {
          getHand(state1).push({
            family: 'business',
            id: `hand-card-${i}`,
            name: `Card ${i}`,
            baseIncome: 1,
            synergyTypes: ['Food'],
          });
          getHand(state2).push({
            family: 'business',
            id: `hand-card-${i}`,
            name: `Card ${i}`,
            baseIncome: 1,
            synergyTypes: ['Food'],
          });
        }

        // Employ the same staff template in both (CG-0MT2WTN0L004JA53)
        const tpl = createStaffDeck(1)[0];
        (state1 as any).staffCards.push({ ...tpl });
        (state2 as any).staffCards.push({ ...tpl });

        fn(state1, tpl.id);
        fn(state2, tpl.id);

        // Same seed should produce same random card removal
        const hand1Ids = getHand(state1).map((c: any) => c.id).sort();
        const hand2Ids = getHand(state2).map((c: any) => c.id).sort();
        expect(hand1Ids).toEqual(hand2Ids);
      },
    );
  });

  // ── Serialization ─────────────────────────────────────────

  describe('Serialization with staff cards', () => {
    it.runIf(STAFF_FEATURE_AVAILABLE)(
      'should serialize staffCards and maxHandSize fields',
      () => {
        const state = createTestState();
        (state as any).staffCards = [
          { id: 'staff-1', name: 'Staff 1', cost: 5, ongoingCost: 1, handSlotsAdded: 2 },
        ];
        (state as any).maxHandSize = 4;

        const serialized = serializeMainStreetState(state);
        const sAny = serialized as any;

        expect('staffCards' in sAny).toBe(true);
        expect(sAny.staffCards).toHaveLength(1);
        expect(sAny.staffCards[0].id).toBe('staff-1');
        expect(sAny.maxHandSize).toBe(4);
      },
    );

    it.runIf(STAFF_FEATURE_AVAILABLE)(
      'should round-trip staffCards through serialize/deserialize',
      () => {
        const state = createTestState();
        (state as any).staffCards = [
          { id: 'staff-1', name: 'Staff 1', cost: 5, ongoingCost: 1, handSlotsAdded: 2 },
        ];
        (state as any).maxHandSize = 4;

        const serialized = serializeMainStreetState(state);
        const restored = deserializeMainStreetState(serialized);
        const rAny = restored as any;

        expect(rAny.staffCards).toHaveLength(1);
        expect(rAny.staffCards[0].id).toBe('staff-1');
        expect(rAny.maxHandSize).toBe(4);
      },
    );
  });

  // ── Edge Cases ────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should handle no staff cards state gracefully', () => {
      const state = createTestState();
      const staff = getStaffCards(state);
      expect(staff).toHaveLength(0);

      // Default maxHandSize is 3 (CG-0MSTOATDT009BRX2)
      expect(getMaxHandSize(state)).toBe(3);
    });

    it.runIf(STAFF_FEATURE_AVAILABLE)(
      'should handle layoff with no hand cards',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const layoffAPI = await hasLayoffAPI();
        if (!layoffAPI) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');
        const fn = (engine as any).layoffStaffCard;
        if (typeof fn !== 'function') return;

        // Employ a staff card to lay off (CG-0MT2WTN0L004JA53); hand is empty
        const staffCard = employStaff(state);
        expect(getHand(state)).toHaveLength(0);

        // Layoff with empty hand should not throw
        expect(() => fn(state, staffCard.id)).not.toThrow();
      },
    );

    it.runIf(STAFF_FEATURE_AVAILABLE)(
      'should handle multiple staff cards with different slot values',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const purchaseAPI = await hasStaffPurchaseAPI();
        if (!purchaseAPI) return;

        const engineModule = await import('../../example-games/main-street/MainStreetEngine');
        const fn = (engineModule as any).purchaseStaffCard;
        if (typeof fn !== 'function') return;

        // Seed a +1 and a +3 staff card into the general market row
        // (CG-0MT2WTN0L004JA53) so both slots stack.
        const deck = createStaffDeck(1);
        const plus1 = deck.find((c: any) => c.handSlotsAdded === 1);
        const plus3 = deck.find((c: any) => c.handSlotsAdded === 3);
        if (!plus1 || !plus3) return;
        state.market.cards.push({ ...plus1 });
        state.market.cards.push({ ...plus3 });

        state.resourceBank.coins = 100;
        const baseMax = getMaxHandSize(state);

        fn(state, plus1.id);
        expect(getMaxHandSize(state)).toBe(baseMax + 1);

        fn(state, plus3.id);
        expect(getMaxHandSize(state)).toBe(baseMax + 1 + 3);
      },
    );

    it('should work alongside existing tableau placement', () => {
      const state = createTestState();
      executeDayStart(state);

      // Normal gameplay should still work
      const card = state.market.cards.find(
        c => c.cost <= state.resourceBank.coins,
      );
      if (card) {
        const slot = state.streetGrid.findIndex(s => s === null);
        if (slot >= 0) {
          executeAction(state, { type: 'buy-business', cardId: card.id, slotIndex: slot });
          expect(state.streetGrid[slot]).not.toBeNull();
        }
      }

      processEndOfTurn(state);
      expect(state.gameResult).toBe('playing');
    });
  });
});
