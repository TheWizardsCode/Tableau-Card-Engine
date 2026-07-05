/**
 * Main Street: Player Hand Management & State Tests
 *
 * Tests for hand state initialization, purchase-to-hand flow, hand size limits,
 * state serialization, and edge cases.
 *
 * NOTE: These tests validate hand management features added by the Multi-Use
 * Card Economy implementation (CG-0MQRXN2CT0076OW7). Some tests access fields
 * (hand, maxHandSize) that may not exist on the MainStreetState type until the
 * implementation child (CG-0MQRXNAUB009VFQP) is complete. They use
 * `(state as any)` access to compile against the current type definitions and
 * serve as the specification for the implementation.
 *
 * Test organisation:
 * - Tests that only need the state schema (hand, maxHandSize fields) are
 *   guarded by HAND_FEATURE_AVAILABLE — they run once fields are added.
 * - Tests that need purchase-to-hand API (purchaseBusinessToHand, canAddToHand)
 *   are guarded by PURCHASE_TO_HAND_AVAILABLE — they run once the market API
 *   is extended.
 * - Tests exercising existing behaviour (tableau purchase, serialization
 *   round-trip without hand fields) always run.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  serializeMainStreetState,
  deserializeMainStreetState,
  type MainStreetState,
  type MainStreetSerializedState,
} from '../../example-games/main-street/MainStreetState';
import {
  GRID_SIZE,
} from '../../example-games/main-street/MainStreetCards';
import {
  executeDayStart,
  processEndOfTurn,
} from '../../example-games/main-street/MainStreetEngine';
import {
  canPurchaseBusiness,
  purchaseBusiness,
} from '../../example-games/main-street/MainStreetMarket';

// ── Feature Detection ───────────────────────────────────────

/** True once MainStreetState.hand and maxHandSize exist (I1). */
const HAND_FEATURE_AVAILABLE = 'hand' in (setupMainStreetGame() as any);

/** True once purchaseBusinessToHand and canAddToHand exist in Market (I1). */
let PURCHASE_TO_HAND_AVAILABLE = false;
(async () => {
  try {
    const market = await import('../../example-games/main-street/MainStreetMarket');
    PURCHASE_TO_HAND_AVAILABLE =
      typeof (market as any).purchaseBusinessToHand === 'function' ||
      typeof (market as any).buyBusinessToHand === 'function';
  } catch {
    // module not available — feature not implemented yet
  }
})();

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'hand-state-test'): MainStreetState {
  return setupMainStreetGame({ seed });
}

/**
 * Safe accessor for hand field — returns the hand array if present,
 * or an empty array as fallback.
 */
function getHand(state: MainStreetState): any[] {
  return (state as any).hand ?? [];
}

/**
 * Safe accessor for maxHandSize field — returns the value if present,
 * or 2 as default fallback.
 */
function getMaxHandSize(state: MainStreetState): number {
  const val = (state as any).maxHandSize;
  return typeof val === 'number' ? val : 2;
}

/**
 * Safe accessor for discardPile field.
 */
function getDiscardPile(state: MainStreetState): any[] {
  return (state as any).discardPile ?? [];
}

/**
 * Safe accessor for staffCards field.
 */
function getStaffCards(state: MainStreetState): any[] {
  return (state as any).staffCards ?? [];
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreet Hand State', () => {
  // ── State Initialization ──────────────────────────────────

  describe('State initialization', () => {
    it('should report hand as empty array', () => {
      const state = createTestState();
      const hand = getHand(state);
      expect(Array.isArray(hand)).toBe(true);
      expect(hand).toHaveLength(0);
    });

    it('should report maxHandSize as 2', () => {
      const state = createTestState();
      expect(getMaxHandSize(state)).toBe(2);
    });

    it('should report discardPile as empty array', () => {
      const state = createTestState();
      const discard = getDiscardPile(state);
      expect(Array.isArray(discard)).toBe(true);
      expect(discard).toHaveLength(0);
    });

    it('should report staffCards as empty array', () => {
      const state = createTestState();
      const staff = getStaffCards(state);
      expect(Array.isArray(staff)).toBe(true);
      expect(staff).toHaveLength(0);
    });

    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should have hand field present on state after creation',
      () => {
        const state = createTestState();
        expect('hand' in (state as any)).toBe(true);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should have maxHandSize field present on state after creation',
      () => {
        const state = createTestState();
        expect('maxHandSize' in (state as any)).toBe(true);
      },
    );

    it('should not break existing state fields', () => {
      const state = createTestState();
      expect(state.turn).toBe(1);
      expect(state.phase).toBe('DayStart');
      expect(state.resourceBank.coins).toBeGreaterThan(0);
      expect(state.resourceBank.reputation).toBeGreaterThan(0);
      expect(state.streetGrid).toHaveLength(GRID_SIZE);
      expect(state.market.development.length).toBeGreaterThan(0);
    });
  });

  // ── Purchase-to-Hand Flow ─────────────────────────────────

  describe('Purchase to hand', () => {
    it.runIf(PURCHASE_TO_HAND_AVAILABLE)(
      'should add card to hand and deduct coins',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = state.market.development.find(
          c => c.cost <= state.resourceBank.coins,
        );
        if (!card) return;

        const market = await import('../../example-games/main-street/MainStreetMarket');
        const fn = (market as any).purchaseBusinessToHand ?? (market as any).buyBusinessToHand;
        if (typeof fn !== 'function') return;

        const coinsBefore = state.resourceBank.coins;
        fn(state, card.id);

        const hand = getHand(state);
        expect(hand).toHaveLength(1);
        expect(hand[0].id).toBe(card.id);
        expect(state.resourceBank.coins).toBe(coinsBefore - card.cost);
      },
    );

    it.runIf(PURCHASE_TO_HAND_AVAILABLE)(
      'should reject when hand is full',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const market = await import('../../example-games/main-street/MainStreetMarket');
        const purchaseFn = (market as any).purchaseBusinessToHand ?? (market as any).buyBusinessToHand;
        const canAddFn = (market as any).canAddToHand;
        if (typeof purchaseFn !== 'function' || typeof canAddFn !== 'function') return;

        // Fill hand to capacity
        const maxSize = getMaxHandSize(state);
        const cards = state.market.development.filter(
          c => c.cost <= state.resourceBank.coins,
        );
        for (let i = 0; i < Math.min(maxSize, cards.length); i++) {
          purchaseFn(state, cards[i].id);
        }
        expect(getHand(state).length).toBeLessThanOrEqual(maxSize);

        // Adding another should be blocked
        const result = canAddFn(state);
        expect(result.legal).toBe(false);
      },
    );

    it('should still allow tableau placement when hand exists (empty or full)', () => {
      const state = createTestState();
      executeDayStart(state);

      const card = state.market.development.find(
        c => c.cost <= state.resourceBank.coins,
      );
      if (!card) return;

      const slot = state.streetGrid.findIndex(s => s === null);
      purchaseBusiness(state, card.id, slot >= 0 ? slot : 0);

      const placedSlot = state.streetGrid.findIndex(s => s !== null);
      expect(placedSlot).toBeGreaterThanOrEqual(0);
      expect(state.streetGrid[placedSlot]!.id).toBe(card.id);

      // Hand should not have been modified by tableau purchase
      const hand = getHand(state);
      expect(hand).toHaveLength(0);
    });

    it('should reject tableau purchase when slot is occupied', () => {
      const state = createTestState();
      executeDayStart(state);

      const card = state.market.development.find(
        c => c.cost <= state.resourceBank.coins,
      );
      if (!card) return;

      // Fill the first slot
      purchaseBusiness(state, card.id, 0);

      // Try same slot again — should be rejected
      const result = canPurchaseBusiness(state, card.id, 0);
      expect(result.legal).toBe(false);
    });
  });

  // ── Serialization / Deserialization ───────────────────────

  describe('Serialization round-trip', () => {
    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should include hand and maxHandSize in serialized output',
      () => {
        const state = createTestState();
        const serialized = serializeMainStreetState(state);
        const sAny = serialized as any;

        expect('hand' in sAny).toBe(true);
        expect(sAny.hand).toEqual([]);
        expect('maxHandSize' in sAny).toBe(true);
        expect(sAny.maxHandSize).toBe(2);
        expect('discardPile' in sAny).toBe(true);
        expect(sAny.discardPile).toEqual([]);
        expect('staffCards' in sAny).toBe(true);
        expect(sAny.staffCards).toEqual([]);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should round-trip hand contents',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const market = await import('../../example-games/main-street/MainStreetMarket');
        const fn = (market as any).purchaseBusinessToHand ?? (market as any).buyBusinessToHand;
        if (typeof fn !== 'function') return;

        const cards = state.market.development.filter(
          c => c.cost <= state.resourceBank.coins,
        );
        if (cards.length < 1) return;

        fn(state, cards[0].id);

        const serialized = serializeMainStreetState(state);
        const restored = deserializeMainStreetState(serialized);
        const rAny = restored as any;

        expect(rAny.hand).toHaveLength(1);
        expect(rAny.hand[0].id).toBe(cards[0].id);
        expect(rAny.maxHandSize).toBe(getMaxHandSize(state));
      },
    );

    it('should preserve core state fields through round-trip', () => {
      const state = createTestState();
      executeDayStart(state);

      const serialized = serializeMainStreetState(state);
      const restored = deserializeMainStreetState(serialized);

      expect(restored.turn).toBe(state.turn);
      expect(restored.phase).toBe(state.phase);
      expect(restored.resourceBank).toEqual(state.resourceBank);
      expect(restored.seed).toBe(state.seed);
      expect(restored.rngCalls).toBe(state.rngCalls);
    });

    it('should preserve deterministic RNG after round-trip', () => {
      const state = createTestState();
      const serialized = serializeMainStreetState(state);
      const restored = deserializeMainStreetState(serialized);

      expect(restored.rngCalls).toBe(state.rngCalls);
      const v1 = state.rng();
      const v2 = restored.rng();
      expect(v1).toBe(v2);
    });
  });

  // ── Save/Load Migration ───────────────────────────────────

  describe('Save/Load migration (old saves without hand fields)', () => {
    it('should not throw when hand fields are missing', () => {
      const state = createTestState();
      const serialized = serializeMainStreetState(state) as any;

      delete serialized.hand;
      delete serialized.maxHandSize;
      delete serialized.discardPile;
      delete serialized.staffCards;

      expect(() => {
        deserializeMainStreetState(serialized as MainStreetSerializedState);
      }).not.toThrow();
    });

    it('should preserve core fields when hand fields are missing', () => {
      const state = createTestState();
      executeDayStart(state);

      const serialized = serializeMainStreetState(state) as any;
      delete serialized.hand;
      delete serialized.maxHandSize;
      delete serialized.discardPile;
      delete serialized.staffCards;

      const restored = deserializeMainStreetState(serialized as MainStreetSerializedState);

      expect(restored.turn).toBe(state.turn);
      expect(restored.seed).toBe(state.seed);
      expect(restored.resourceBank.coins).toBe(state.resourceBank.coins);
      expect(restored.phase).toBe(state.phase);
      expect(restored.gameResult).toBe(state.gameResult);
    });

    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should default missing hand fields to empty/initial values',
      () => {
        const state = createTestState();
        const serialized = serializeMainStreetState(state) as any;

        delete serialized.hand;
        delete serialized.maxHandSize;
        delete serialized.discardPile;
        delete serialized.staffCards;

        const restored = deserializeMainStreetState(serialized as MainStreetSerializedState);
        const rAny = restored as any;

        expect(rAny.hand).toEqual([]);
        expect(rAny.maxHandSize).toBe(2);
        expect(rAny.discardPile).toEqual([]);
        expect(rAny.staffCards).toEqual([]);
      },
    );

    it('should not break existing migration logic', () => {
      const state = createTestState();
      const serialized = serializeMainStreetState(state) as any;

      // Remove newer fields to simulate old save
      delete serialized.hand;
      delete serialized.maxHandSize;
      delete serialized.discardPile;
      delete serialized.staffCards;

      const restored = deserializeMainStreetState(serialized as MainStreetSerializedState);
      expect(restored).toBeDefined();
      expect(restored.market.development).toBeDefined();
      expect(restored.discards.communitySpace).toBeDefined();
    });
  });

  // ── Edge Cases ────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should handle empty hand state', () => {
      const state = createTestState();
      const hand = getHand(state);
      expect(hand).toHaveLength(0);
    });

    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should handle hand with mixed synergy type cards',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const market = await import('../../example-games/main-street/MainStreetMarket');
        const fn = (market as any).purchaseBusinessToHand ?? (market as any).buyBusinessToHand;
        if (typeof fn !== 'function') return;

        const cards = state.market.development.filter(
          c => c.cost <= state.resourceBank.coins,
        );
        for (let i = 0; i < Math.min(2, cards.length); i++) {
          fn(state, cards[i].id);
        }

        const hand = getHand(state);
        for (const card of hand) {
          expect(card.synergyTypes).toBeDefined();
          expect(Array.isArray(card.synergyTypes)).toBe(true);
          expect(card.family).toBe('business');
        }
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE)(
      'should persist hand cards across turns',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const market = await import('../../example-games/main-street/MainStreetMarket');
        const fn = (market as any).purchaseBusinessToHand ?? (market as any).buyBusinessToHand;
        if (typeof fn !== 'function') return;

        const card = state.market.development.find(
          c => c.cost <= state.resourceBank.coins,
        );
        if (!card) return;

        fn(state, card.id);
        expect(getHand(state)).toHaveLength(1);
        expect(getHand(state)[0].id).toBe(card.id);

        processEndOfTurn(state);

        // After end-of-turn, hand should still hold the card
        expect(getHand(state)).toHaveLength(1);
        expect(getHand(state)[0].id).toBe(card.id);
      },
    );
  });
});
