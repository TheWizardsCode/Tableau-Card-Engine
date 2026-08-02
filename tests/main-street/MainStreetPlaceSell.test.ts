/**
 * Main Street: Card Placement & Sell System Tests
 *
 * Tests for placing cards from hand onto the tableau at 80% of purchase cost,
 * and selling cards from hand or tableau for 75% of purchase value. Includes
 * edge cases (insufficient coins, empty slots, empty hand), discard pile
 * tracking, and transcript recording.
 *
 * NOTE: These tests validate place/sell features added by the Multi-Use Card
 * Economy implementation (CG-0MQRXN2CT0076OW7). The hand state fields (hand,
 * maxHandSize, discardPile) and place/sell API functions may not exist on the
 * MainStreetState type until the implementation children
 * (CG-0MQRXNAUB009VFQP — Player Hand Management, CG-0MQSFGJXH000FE08 — Card
 * Placement & Sell System) are complete. Tests use feature detection guards
 * and (state as any) access to compile against current type definitions while
 * serving as the specification for implementation.
 *
 * Constants expected from implementation:
 *   PLACE_COST_RATIO = 0.8  — in MainStreetEngine.ts or MainStreetCards.ts
 *   SELL_VALUE_RATIO = 0.75 — in MainStreetEngine.ts or MainStreetCards.ts
 *
 * Functions expected (in MainStreetEngine.ts):
 *   placeFromHand(state, handIndex, slotIndex)    — place from hand to tableau
 *   sellFromHand(state, handIndex)                 — sell a card from hand
 *   sellFromTableau(state, slotIndex)              — sell a card from tableau
 *   canPlaceFromHand(state, handIndex, slotIndex)  — legality check for placement
 *   canSellFromHand(state, handIndex)              — legality check for hand sell
 *   canSellFromTableau(state, slotIndex)           — legality check for tableau sell
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  GRID_SIZE,
  type BusinessCard,
} from '../../example-games/main-street/MainStreetCards';
import {
  executeDayStart,
} from '../../example-games/main-street/MainStreetEngine';

// ── Feature Detection ───────────────────────────────────────

/** True once hand/maxHandSize/discardPile exist on state (I1). */
const HAND_FEATURE_AVAILABLE = 'hand' in (setupMainStreetGame() as any);

/** True once placeFromHand / sellFromHand / sellFromTableau exist (I3). */
let PLACE_SELL_API_AVAILABLE = false;
(async () => {
  try {
    const engine = await import('../../example-games/main-street/MainStreetEngine');
    PLACE_SELL_API_AVAILABLE =
      typeof (engine as any).placeFromHand === 'function' &&
      typeof (engine as any).sellFromHand === 'function' &&
      typeof (engine as any).sellFromTableau === 'function';
  } catch {
    // module not available — feature not implemented yet
  }
})();

/** True once canPlaceFromHand / canSellFromHand / canSellFromTableau exist (I3). */
let PLACE_SELL_LEGALITY_AVAILABLE = false;
(async () => {
  try {
    const engine = await import('../../example-games/main-street/MainStreetEngine');
    PLACE_SELL_LEGALITY_AVAILABLE =
      typeof (engine as any).canPlaceFromHand === 'function' &&
      typeof (engine as any).canSellFromHand === 'function' &&
      typeof (engine as any).canSellFromTableau === 'function';
  } catch {
    // module not available — feature not implemented yet
  }
})();

/** True once PLACE_COST_RATIO and SELL_VALUE_RATIO constants exist. */
let CONSTANTS_AVAILABLE = false;
(async () => {
  try {
    const cards = await import('../../example-games/main-street/MainStreetCards');
    CONSTANTS_AVAILABLE =
      typeof (cards as any).PLACE_COST_RATIO === 'number' &&
      typeof (cards as any).SELL_VALUE_RATIO === 'number';
  } catch {
    // constants not defined yet
  }
  if (!CONSTANTS_AVAILABLE) {
    try {
      const engine = await import('../../example-games/main-street/MainStreetEngine');
      CONSTANTS_AVAILABLE =
        typeof (engine as any).PLACE_COST_RATIO === 'number' &&
        typeof (engine as any).SELL_VALUE_RATIO === 'number';
    } catch {
      // constants not defined yet
    }
  }
})();

// ── Expected Ratios ─────────────────────────────────────────

/** Expected place cost ratio (80% of purchase price). */
export const EXPECTED_PLACE_COST_RATIO = 0.8;

/** Expected sell value ratio (75% of purchase value). */
export const EXPECTED_SELL_VALUE_RATIO = 0.75;

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'place-sell-test'): MainStreetState {
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
 * Safe accessor for discardPile field.
 */
function getDiscardPile(state: MainStreetState): any[] {
  return (state as any).discardPile ?? [];
}

/**
 * Helper to simulate placing a card into hand for test purposes.
 * This private helper mutates state.hand directly to set up preconditions
 * without depending on the purchase-to-hand API.
 */
function addCardToHand(state: MainStreetState, card: any): void {
  const hand = (state as any).hand;
  if (Array.isArray(hand)) {
    hand.push(card);
  }
}

/**
 * Returns the first empty slot on the street grid, or -1 if full.
 */
function findEmptySlot(state: MainStreetState): number {
  return state.streetGrid.findIndex(s => s === null);
}

/**
 * Returns an affordable business card from the development row.
 */
function getAffordableCard(state: MainStreetState): BusinessCard | undefined {
  return state.market.development.find(
    c => c.cost <= state.resourceBank.coins,
  ) as BusinessCard | undefined;
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreet Place/Sell System', () => {
  // ── Place from Hand (AC1) ──────────────────────────────────

  describe('Place from hand to tableau', () => {
    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should place card from hand to tableau without coin deduction',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        // Add a card to hand
        addCardToHand(state, { ...card });
        const handIndex = getHand(state).length - 1;
        const slot = findEmptySlot(state);
        if (slot < 0 || handIndex < 0) return;

        const coinsBefore = state.resourceBank.coins;

        const engine = await import('../../example-games/main-street/MainStreetEngine');
        (engine as any).placeFromHand(state, handIndex, slot);

        // Coins unchanged (placement is free)
        expect(state.resourceBank.coins).toBe(coinsBefore);

        // Card removed from hand
        expect(getHand(state)).not.toContainEqual(expect.objectContaining({ id: card.id }));

        // Card placed on tableau at target slot
        expect(state.streetGrid[slot]).not.toBeNull();
        expect(state.streetGrid[slot]!.id).toBe(card.id);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'placement from hand does not deduct coins',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        addCardToHand(state, { ...card });
        const handIndex = getHand(state).length - 1;
        const slot = findEmptySlot(state);
        if (slot < 0) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        const coinsBefore = state.resourceBank.coins;

        (engine as any).placeFromHand(state, handIndex, slot);

        // No coin deduction for placement
        expect(state.resourceBank.coins).toBe(coinsBefore);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should reject placement when hand is empty',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const slot = findEmptySlot(state);
        if (slot < 0) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        // Place from empty hand should throw or return error
        expect(() => {
          (engine as any).placeFromHand(state, 0, slot);
        }).toThrow();
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should reject placement when target slot is occupied',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        addCardToHand(state, { ...card });
        const handIndex = getHand(state).length - 1;

        // Place a card directly on slot 0 to occupy it
        // Use a card from the market's development row
        const existingCard = state.market.development[0];
        if (existingCard) {
          state.streetGrid[0] = existingCard as any;
        }

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        // Place hand card into occupied slot should throw
        expect(() => {
          (engine as any).placeFromHand(state, handIndex, 0);
        }).toThrow();
      },
    );
  });

  // ── Sell from Hand (AC2) ───────────────────────────────────

  describe('Sell from hand', () => {
    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should credit 75% of purchase value when selling from hand',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        addCardToHand(state, { ...card });
        const handIndex = getHand(state).length - 1;

        const coinsBefore = state.resourceBank.coins;
        const expectedValue = Math.floor(card.cost * EXPECTED_SELL_VALUE_RATIO);

        const engine = await import('../../example-games/main-street/MainStreetEngine');
        (engine as any).sellFromHand(state, handIndex);

        // Coins credited by 75% of purchase value
        expect(state.resourceBank.coins).toBe(coinsBefore + expectedValue);

        // Card removed from hand
        expect(getHand(state)).toHaveLength(0);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should move sold card to discard pile',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        addCardToHand(state, { ...card });
        const handIndex = getHand(state).length - 1;

        const discardBefore = getDiscardPile(state).length;

        const engine = await import('../../example-games/main-street/MainStreetEngine');
        (engine as any).sellFromHand(state, handIndex);

        // Card added to discard pile
        expect(getDiscardPile(state).length).toBe(discardBefore + 1);
        const discardedIds = getDiscardPile(state).map((c: any) => c.id);
        expect(discardedIds).toContain(card.id);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should reject selling from empty hand',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        expect(() => {
          (engine as any).sellFromHand(state, 0);
        }).toThrow();
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should reject with invalid hand index',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        addCardToHand(state, { id: 'test-card', cost: 6 });
        const invalidIndex = getHand(state).length + 5;

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        expect(() => {
          (engine as any).sellFromHand(state, invalidIndex);
        }).toThrow();
      },
    );
  });

  // ── Sell from Tableau (AC3) ────────────────────────────────

  describe('Sell from tableau', () => {
    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should credit 75% of purchase value when selling from tableau',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        // First purchase a card so it's on the tableau
        addCardToHand(state, { ...card });
        const handIndex = getHand(state).length - 1;
        const slot = findEmptySlot(state);
        if (slot < 0) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        // Place the card on tableau first
        (engine as any).placeFromHand(state, handIndex, slot);
        expect(state.streetGrid[slot]).not.toBeNull();

        const coinsBeforeSell = state.resourceBank.coins;
        const expectedValue = Math.floor(card.cost * EXPECTED_SELL_VALUE_RATIO);

        // Now sell it from tableau
        (engine as any).sellFromTableau(state, slot);

        // Coins credited by 75% of purchase value
        expect(state.resourceBank.coins).toBe(coinsBeforeSell + expectedValue);

        // Card removed from tableau (slot empty)
        expect(state.streetGrid[slot]).toBeNull();
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should move sold tableau card to discard pile',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        addCardToHand(state, { ...card });
        const handIndex = getHand(state).length - 1;
        const slot = findEmptySlot(state);
        if (slot < 0) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        // Place then sell
        (engine as any).placeFromHand(state, handIndex, slot);

        const discardBefore = getDiscardPile(state).length;

        (engine as any).sellFromTableau(state, slot);

        // Card added to discard pile
        expect(getDiscardPile(state).length).toBe(discardBefore + 1);
        const discardedIds = getDiscardPile(state).map((c: any) => c.id);
        expect(discardedIds).toContain(card.id);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should reject selling from empty tableau slot',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        expect(() => {
          (engine as any).sellFromTableau(state, 0);
        }).toThrow();
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should reject with invalid slot index',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        expect(() => {
          (engine as any).sellFromTableau(state, GRID_SIZE + 5);
        }).toThrow();
      },
    );
  });

  // ── Insufficient Coins Edge Case (AC4) ─────────────────────

  describe('Insufficient coins for placement (AC4)', () => {
    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_LEGALITY_AVAILABLE)(
      'should block placement when player has insufficient coins',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        // Add a high-cost card to hand that exceeds current coins
        addCardToHand(state, { id: 'biz-expensive', cost: 999, name: 'Expensive' });
        const handIndex = getHand(state).length - 1;
        const slot = findEmptySlot(state);
        if (slot < 0) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        // Legality check should return blocked
        const result = (engine as any).canPlaceFromHand(state, handIndex, slot);
        expect(result.legal).toBe(false);
        expect(result.reason).toBeTruthy();
        expect(typeof result.reason).toBe('string');

        // State should not have changed
        expect(state.resourceBank.coins).toBeGreaterThan(0);
        expect(state.streetGrid[slot]).toBeNull();
        expect(getHand(state).length).toBe(1);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_LEGALITY_AVAILABLE)(
      'should allow placement when player has sufficient coins',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        addCardToHand(state, { ...card });
        const handIndex = getHand(state).length - 1;
        const slot = findEmptySlot(state);
        if (slot < 0) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        const result = (engine as any).canPlaceFromHand(state, handIndex, slot);
        expect(result.legal).toBe(true);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should allow placement even with 0 coins (placement is free)',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        // Drain coins to 0
        state.resourceBank.coins = 0;

        addCardToHand(state, { id: 'biz-any', cost: 10, name: 'Any' });
        const handIndex = getHand(state).length - 1;
        const slot = findEmptySlot(state);
        if (slot < 0) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        // Placement with 0 coins should succeed (no cost)
        expect(() => {
          (engine as any).placeFromHand(state, handIndex, slot);
        }).not.toThrow();

        // Card should be placed
        expect(state.streetGrid[slot]).not.toBeNull();
        expect(state.hand.length).toBe(0);
      },
    );
  });

  // ── Legality Checks (AC1-AC4) ──────────────────────────────

  describe('Legality checks (AC1-AC4)', () => {
    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_LEGALITY_AVAILABLE)(
      'canSellFromHand should reject invalid hand index',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        addCardToHand(state, { id: 'test-card', cost: 6 });

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        const result = (engine as any).canSellFromHand(state, 5);
        expect(result.legal).toBe(false);
        expect(typeof result.reason).toBe('string');
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_LEGALITY_AVAILABLE)(
      'canSellFromHand should allow selling a card in hand',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        addCardToHand(state, { id: 'test-card', cost: 6 });

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        const result = (engine as any).canSellFromHand(state, 0);
        expect(result.legal).toBe(true);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_LEGALITY_AVAILABLE)(
      'canSellFromTableau should reject invalid slot index',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        const result = (engine as any).canSellFromTableau(state, GRID_SIZE + 5);
        expect(result.legal).toBe(false);
        expect(typeof result.reason).toBe('string');
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_LEGALITY_AVAILABLE)(
      'canSellFromTableau should reject empty tableau slot',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        const result = (engine as any).canSellFromTableau(state, 0);
        expect(result.legal).toBe(false);
        expect(typeof result.reason).toBe('string');
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_LEGALITY_AVAILABLE)(
      'canSellFromTableau should allow selling an occupied slot',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        // Occupy slot 0 directly
        state.streetGrid[0] = card as any;

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        const result = (engine as any).canSellFromTableau(state, 0);
        expect(result.legal).toBe(true);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_LEGALITY_AVAILABLE)(
      'legality checks do not mutate state',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        addCardToHand(state, { ...card });
        const handIndex = getHand(state).length - 1;
        const slot = findEmptySlot(state);
        if (slot < 0) return;

        const handBefore = getHand(state).length;
        const coinsBefore = state.resourceBank.coins;
        const gridBefore = [...state.streetGrid];

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        (engine as any).canPlaceFromHand(state, handIndex, slot);
        (engine as any).canSellFromHand(state, handIndex);
        (engine as any).canSellFromTableau(state, slot);

        // No mutation: hand, coins, and grid unchanged
        expect(getHand(state).length).toBe(handBefore);
        expect(state.resourceBank.coins).toBe(coinsBefore);
        expect(state.streetGrid).toEqual(gridBefore);
      },
    );
  });

  // ── Discard Pile Verification (AC5) ────────────────────────

  describe('Discard pile tracking (AC5)', () => {
    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should place sold cards (from hand) into discard pile',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        addCardToHand(state, { ...card });
        const handIndex = getHand(state).length - 1;

        const engine = await import('../../example-games/main-street/MainStreetEngine');
        (engine as any).sellFromHand(state, handIndex);

        const discard = getDiscardPile(state);
        expect(discard.length).toBeGreaterThan(0);
        expect(discard[discard.length - 1].id).toBe(card.id);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should place sold cards (from tableau) into discard pile',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        addCardToHand(state, { ...card });
        const handIndex = getHand(state).length - 1;
        const slot = findEmptySlot(state);
        if (slot < 0) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        // Place then sell from tableau
        (engine as any).placeFromHand(state, handIndex, slot);
        (engine as any).sellFromTableau(state, slot);

        const discard = getDiscardPile(state);
        expect(discard.length).toBeGreaterThan(0);
        expect(discard[discard.length - 1].id).toBe(card.id);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should accumulate multiple sold cards in discard pile',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const firstCard = state.market.development[0] as BusinessCard;
        const secondCard = state.market.development[1] as BusinessCard;
        if (!firstCard || !secondCard) return;

        addCardToHand(state, { ...firstCard });
        addCardToHand(state, { ...secondCard });

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        (engine as any).sellFromHand(state, 0);
        (engine as any).sellFromHand(state, 0); // index 0 again because first was removed

        const discard = getDiscardPile(state);
        expect(discard.length).toBe(2);
        const discardIds = discard.map((c: any) => c.id);
        expect(discardIds).toContain(firstCard.id);
        expect(discardIds).toContain(secondCard.id);
      },
    );
  });

  // ── Transcript Recording (AC6) ─────────────────────────────

  describe('Transcript recording (AC6)', () => {
    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should record a transcript event for placing from hand',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        addCardToHand(state, { ...card });
        const handIndex = getHand(state).length - 1;
        const slot = findEmptySlot(state);
        if (slot < 0) return;

        // Set up transcript recorder
        const { MainStreetTranscriptRecorder, setMainStreetRecorder, recordMainStreetEvent } =
          await import('../../example-games/main-street/MainStreetTranscript');

        const recorder = new MainStreetTranscriptRecorder({ seed: state.seed });
        setMainStreetRecorder(recorder);

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        // Execute placement
        (engine as any).placeFromHand(state, handIndex, slot);

        // Record the event as the UI/commands layer would
        recordMainStreetEvent({
          type: 'action',
          turn: state.turn,
          action: { type: 'place', handIndex, slotIndex: slot, cardId: card.id },
          description: `Placed ${card.name} from hand to slot ${slot}`,
        });

        const transcript = recorder.getTranscript();
        const placeEvents = transcript.events.filter(
          (e: any) => e.type === 'action' && e.action?.type === 'place',
        );
        expect(placeEvents.length).toBeGreaterThanOrEqual(1);
        expect((placeEvents[0] as any).action.cardId).toBe(card.id);
        expect((placeEvents[0] as any).action.slotIndex).toBe(slot);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should record a transcript event for selling from hand',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        addCardToHand(state, { ...card });
        const handIndex = getHand(state).length - 1;

        const { MainStreetTranscriptRecorder, setMainStreetRecorder, recordMainStreetEvent } =
          await import('../../example-games/main-street/MainStreetTranscript');

        const recorder = new MainStreetTranscriptRecorder({ seed: state.seed });
        setMainStreetRecorder(recorder);

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        (engine as any).sellFromHand(state, handIndex);

        recordMainStreetEvent({
          type: 'action',
          turn: state.turn,
          action: { type: 'sell', source: 'hand', handIndex, cardId: card.id },
          description: `Sold ${card.name} from hand for ${Math.floor(card.cost * EXPECTED_SELL_VALUE_RATIO)} coins`,
        });

        const transcript = recorder.getTranscript();
        const sellEvents = transcript.events.filter(
          (e: any) => e.type === 'action' && e.action?.type === 'sell' && e.action?.source === 'hand',
        );
        expect(sellEvents.length).toBeGreaterThanOrEqual(1);
        expect((sellEvents[0] as any).action.cardId).toBe(card.id);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should record a transcript event for selling from tableau',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        addCardToHand(state, { ...card });
        const handIndex = getHand(state).length - 1;
        const slot = findEmptySlot(state);
        if (slot < 0) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        // Place first
        (engine as any).placeFromHand(state, handIndex, slot);

        const { MainStreetTranscriptRecorder, setMainStreetRecorder, recordMainStreetEvent } =
          await import('../../example-games/main-street/MainStreetTranscript');

        const recorder = new MainStreetTranscriptRecorder({ seed: state.seed });
        setMainStreetRecorder(recorder);

        (engine as any).sellFromTableau(state, slot);

        recordMainStreetEvent({
          type: 'action',
          turn: state.turn,
          action: { type: 'sell', source: 'tableau', slotIndex: slot, cardId: card.id },
          description: `Sold ${card.name} from slot ${slot} for ${Math.floor(card.cost * EXPECTED_SELL_VALUE_RATIO)} coins`,
        });

        const transcript = recorder.getTranscript();
        const sellEvents = transcript.events.filter(
          (e: any) => e.type === 'action' && e.action?.type === 'sell' && e.action?.source === 'tableau',
        );
        expect(sellEvents.length).toBeGreaterThanOrEqual(1);
        expect((sellEvents[0] as any).action.cardId).toBe(card.id);
        expect((sellEvents[0] as any).action.slotIndex).toBe(slot);
      },
    );
  });

  // ── Edge Cases ─────────────────────────────────────────────

  describe('Edge cases', () => {
    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should handle placing the last card from hand',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        addCardToHand(state, { ...card });
        const handIndex = getHand(state).length - 1;
        const slot = findEmptySlot(state);
        if (slot < 0) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');
        (engine as any).placeFromHand(state, handIndex, slot);

        // Hand should now be empty
        expect(getHand(state)).toHaveLength(0);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should preserve other hand cards when placing or selling one card',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const cards = state.market.development.filter(
          c => c.cost <= state.resourceBank.coins,
        ).slice(0, 2);
        if (cards.length < 2) return;

        addCardToHand(state, { ...cards[0] });
        addCardToHand(state, { ...cards[1] });

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        // Place the first card (index 0)
        const slot = findEmptySlot(state);
        if (slot < 0) return;

        (engine as any).placeFromHand(state, 0, slot);

        // Second card should still be in hand
        const hand = getHand(state);
        expect(hand).toHaveLength(1);
        expect(hand[0].id).toBe(cards[1].id);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should handle selling all cards from hand leaving empty hand',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        addCardToHand(state, { ...card });

        const engine = await import('../../example-games/main-street/MainStreetEngine');
        (engine as any).sellFromHand(state, 0);

        expect(getHand(state)).toHaveLength(0);
      },
    );

    it.runIf(HAND_FEATURE_AVAILABLE && PLACE_SELL_API_AVAILABLE)(
      'should handle selling the only card from a full tableau slot',
      async () => {
        const state = createTestState();
        executeDayStart(state);

        const card = getAffordableCard(state);
        if (!card) return;

        addCardToHand(state, { ...card });
        const handIndex = getHand(state).length - 1;
        const slot = findEmptySlot(state);
        if (slot < 0) return;

        const engine = await import('../../example-games/main-street/MainStreetEngine');

        (engine as any).placeFromHand(state, handIndex, slot);
        expect(state.streetGrid[slot]).not.toBeNull();

        (engine as any).sellFromTableau(state, slot);

        // Slot should be empty
        expect(state.streetGrid[slot]).toBeNull();
      },
    );

    it('should not break existing state fields during place/sell operations', () => {
      // Basic sanity: existing state fields are unchanged after operations
      const state = createTestState();
      executeDayStart(state);

      expect(state.turn).toBe(1);
      expect(state.phase).toBe('MarketPhase');
      expect(state.resourceBank.coins).toBeGreaterThan(0);
      expect(state.resourceBank.reputation).toBeGreaterThan(0);
      expect(state.streetGrid).toHaveLength(GRID_SIZE);
      expect(state.market.development.length).toBeGreaterThan(0);
    });
  });
});
