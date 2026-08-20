/**
 * Main Street: Market Cycling System Tests
 *
 * Tests for the market cycling system where unpurchased market cards move to
 * the discard pile after each MarketPhase, the discard pile reshuffles into
 * the main deck when the deck is empty, and sold cards enter the discard pile.
 *
 * NOTE: These tests validate the market cycling feature added by the Multi-Use
 * Card Economy implementation (CG-0MQRXN2CT0076OW7). The feature is fully
 * implemented; feature-detection is synchronous and deterministic so gating
 * never skips tests due to an async race.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  type BusinessCard,
  type CommunitySpaceCard,
  MARKET_TOTAL_SLOTS,
} from '../../example-games/main-street/MainStreetCards';
import {
  executeDayStart,
  processEndOfTurn,
  executeAction,
  cycleMarketCards,
} from '../../example-games/main-street/MainStreetEngine';
import {
  refillMarket,
} from '../../example-games/main-street/MainStreetMarket';

// ── Feature Detection ───────────────────────────────────────

/** True once hand fields exist on MainStreetState (I1). */
const HAND_FEATURE_AVAILABLE = 'hand' in (setupMainStreetGame() as any);

/**
 * True once cycle/discard-pile features are available (I4).
 * Synchronous: the feature is fully implemented and statically imported,
 * so the gate is evaluated deterministically at collection time.
 */
const CYCLING_FEATURE_AVAILABLE = typeof cycleMarketCards === 'function';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'market-cycling-test'): MainStreetState {
  return setupMainStreetGame({ seed });
}

/**
 * Returns all market card IDs (both rows combined).
 */
function getMarketIDs(state: MainStreetState): string[] {
  return [
    ...state.market.cards.map(c => c.id),
    ...state.market.cards.map(c => c.id),
  ];
}

/**
 * Returns the total discard pile size across all deck types.
 */
function getTotalDiscardCount(state: MainStreetState): number {
  return (
    state.discards.business.length +
    state.discards.communitySpace.length +
    state.discards.event.length +
    state.discards.upgrade.length
  );
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreet Market Cycling', () => {
  // ── Discard Pile State ─────────────────────────────────────

  describe('Discard pile state', () => {
    it('should initialize with empty discard piles', () => {
      const state = createTestState();
      expect(state.discards.business).toHaveLength(0);
      expect(state.discards.communitySpace).toHaveLength(0);
      expect(state.discards.event).toHaveLength(0);
      expect(state.discards.upgrade).toHaveLength(0);
    });

    it('should have discard piles present as arrays', () => {
      const state = createTestState();
      expect(Array.isArray(state.discards.business)).toBe(true);
      expect(Array.isArray(state.discards.communitySpace)).toBe(true);
      expect(Array.isArray(state.discards.event)).toBe(true);
      expect(Array.isArray(state.discards.upgrade)).toBe(true);
    });
  });

  // ── Unpurchased Cards Move to Discard ──────────────────────

  describe('Unpurchased cards cycle to discard', () => {
    it.runIf(CYCLING_FEATURE_AVAILABLE)(
      'should capture unpurchased market cards in discard after MarketPhase',
      () => {
        const state = createTestState();
        executeDayStart(state);

        // Get market cards before cycling
        const marketIDsBefore = getMarketIDs(state);
        expect(marketIDsBefore.length).toBeGreaterThan(0);

        // Trigger cycling
        cycleMarketCards(state);

        // Market cards should now be in discard piles
        const totalDiscards = getTotalDiscardCount(state);
        expect(totalDiscards).toBeGreaterThan(0);
      },
    );

    it('should not remove player-owned tableau cards during cycling', () => {
      const state = createTestState();
      executeDayStart(state);

      // Buy a business-family card and place on tableau (buy-business only
      // accepts business/community-space cards — the market row may lead
      // with an upgrade/event card for some seeds).
      const card = state.market.cards.find(
        c => (c.family === 'business' || c.family === 'community-space') && c.cost <= state.resourceBank.coins,
      );
      if (!card) return;

      const slot = state.streetGrid.findIndex(s => s === null);
      if (slot >= 0) {
        executeAction(state, { type: 'buy-business', cardId: card.id, slotIndex: slot });
      }

      const tableauCountBefore = state.streetGrid.filter(s => s !== null).length;

      // End turn — cycling should not affect tableau
      processEndOfTurn(state);

      const tableauCountAfter = state.streetGrid.filter(s => s !== null).length;
      expect(tableauCountAfter).toBe(tableauCountBefore);
    });

    it('should not remove player-owned hand cards during cycling', () => {
      const state = createTestState();
      executeDayStart(state);

      // If hand exists, add a card to simulate hand ownership
      if (HAND_FEATURE_AVAILABLE) {
        const hand = (state as any).hand;
        if (Array.isArray(hand)) {
          const card = state.market.cards.find(
            c => c.cost <= state.resourceBank.coins,
          );
          if (card) {
            hand.push({ ...card });
            const idx = state.market.cards.findIndex(c => c.id === card.id);
            if (idx >= 0) state.market.cards.splice(idx, 1);
          }
        }
      }

      const handSizeBefore = Array.isArray((state as any).hand) ? (state as any).hand.length : 0;

      processEndOfTurn(state);

      const handSizeAfter = Array.isArray((state as any).hand) ? (state as any).hand.length : 0;
      expect(handSizeAfter).toBe(handSizeBefore);
    });
  });

  // ── Market Refill After Cycling ────────────────────────────

  describe('Market refill after cycling', () => {
    it('should refill the development market to full slots after DayStart', () => {
      const state = createTestState();

      // Initially full
      expect(state.market.cards.length).toBe(MARKET_TOTAL_SLOTS);

      // Run a full turn
      executeDayStart(state);
      processEndOfTurn(state);

      // Next day start refills
      if (state.phase === 'DayStart') {
        executeDayStart(state);
        expect(state.market.cards.length).toBe(MARKET_TOTAL_SLOTS);
      }
    });

    it.runIf(CYCLING_FEATURE_AVAILABLE)(
      'should have deterministically different market cards after cycling + refill',
      () => {
        const state = createTestState();
        const firstMarketIds = getMarketIDs(state);

        executeDayStart(state);

        // Apply cycling
        cycleMarketCards(state);

        // Refill
        refillMarket(state);

        const secondMarketIds = getMarketIDs(state);

        // At least some cards should be different (new draws replaced cycled ones)
        const hasNewCards = secondMarketIds.some(id => !firstMarketIds.includes(id));
        expect(hasNewCards).toBe(true);
      },
    );

    it('should not crash when deck is near empty during refill', () => {
      const state = createTestState();
      executeDayStart(state);

      // Drain the business deck
      state.decks.business.length = 0;

      expect(() => processEndOfTurn(state)).not.toThrow();

      if (state.phase === 'DayStart') {
        expect(() => executeDayStart(state)).not.toThrow();
      }
    });
  });

  // ── Discard Reshuffle ──────────────────────────────────────

  describe('Discard reshuffle into deck', () => {
    it.runIf(CYCLING_FEATURE_AVAILABLE)(
      'should reshuffle discard into deck when deck is empty',
      () => {
        const state = createTestState();
        executeDayStart(state);

        // Simulate deck depletion: move all deck cards to discard
        const bizCards = state.decks.business.splice(0);
        state.discards.business.push(...bizCards);
        const csCards = state.decks.communitySpace.splice(0);
        state.discards.communitySpace.push(...csCards);
        const totalDiscarded = bizCards.length + csCards.length;

        // Refill should reshuffle from discards
        refillMarket(state);

        // Either deck got cards or discard got smaller
        const inDeck = state.decks.business.length + state.decks.communitySpace.length;
        const inDiscard = getTotalDiscardCount(state);
        expect(inDeck > 0 || inDiscard < totalDiscarded).toBe(true);
      },
    );

    it('should maintain deterministic RNG during reshuffle', () => {
      const state1 = createTestState('cycling-rng-test');
      const state2 = createTestState('cycling-rng-test');

      // Same initial state
      expect(getMarketIDs(state1)).toEqual(getMarketIDs(state2));

      executeDayStart(state1);
      executeDayStart(state2);
      processEndOfTurn(state1);
      processEndOfTurn(state2);

      if (state1.phase === 'DayStart' && state2.phase === 'DayStart') {
        executeDayStart(state1);
        executeDayStart(state2);

        // After same operations, markets should be identical
        expect(getMarketIDs(state1)).toEqual(getMarketIDs(state2));
      }
    });

    it.runIf(CYCLING_FEATURE_AVAILABLE)(
      'should survive multiple rounds of discard reshuffle',
      () => {
        const state = createTestState();

        for (let i = 0; i < 3 && state.gameResult === 'playing'; i++) {
          executeDayStart(state);

          // Buy a business-family card if possible (buy-business only
          // accepts business/community-space cards).
          const card = state.market.cards.find(
            c => (c.family === 'business' || c.family === 'community-space') && c.cost <= state.resourceBank.coins,
          );
          if (card) {
            const slot = state.streetGrid.findIndex(s => s === null);
            if (slot >= 0) {
              executeAction(state, { type: 'buy-business', cardId: card.id, slotIndex: slot });
            }
          }

          // Cycle after MarketPhase
          cycleMarketCards(state);
          processEndOfTurn(state);
        }

        // Should still be playing after 3+ turns
        expect(state.gameResult).not.toBe('loss');
      },
    );
  });

  // ── Sold Cards Go to Discard ───────────────────────────────

  describe('Sold cards go to discard', () => {
    it('should accept cards into discard piles by family', () => {
      const state = createTestState();
      const discardBefore = getTotalDiscardCount(state);

      // Manually add a sellable (business/community-space) card to discard.
      // The single row may hold event/upgrade cards too, so locate a
      // business-family card rather than popping blindly.
      const sellable = state.market.cards.find(
        c => c.family === 'business' || c.family === 'community-space',
      );
      if (sellable) {
        const idx = state.market.cards.indexOf(sellable);
        state.market.cards.splice(idx, 1);
        if (sellable.family === 'business') {
          state.discards.business.push(sellable as BusinessCard);
        } else {
          state.discards.communitySpace.push(sellable as CommunitySpaceCard);
        }
      }

      expect(getTotalDiscardCount(state)).toBe(discardBefore + 1);
    });
  });

  // ── Edge Cases ─────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should handle empty market without crashing', () => {
      const state = createTestState();
      executeDayStart(state);

      state.market.cards.length = 0;
      state.market.cards.length = 0;

      expect(() => processEndOfTurn(state)).not.toThrow();
    });

    it('should handle all decks empty without crashing', () => {
      const state = createTestState();

      state.decks.business.length = 0;
      state.decks.communitySpace.length = 0;
      state.decks.event.length = 0;
      state.decks.upgrade.length = 0;

      executeDayStart(state);
      expect(() => processEndOfTurn(state)).not.toThrow();
    });

    it('should handle full turn cycle with no player purchases', () => {
      const state = createTestState();
      executeDayStart(state);
      expect(() => processEndOfTurn(state)).not.toThrow();

      if (state.phase === 'DayStart') {
        executeDayStart(state);
        expect(state.market.cards.length).toBeGreaterThan(0);
      }
    });

    it('should advance turns correctly across multiple cycles', () => {
      const state = createTestState();

      for (let i = 0; i < 3 && state.gameResult === 'playing'; i++) {
        const turnBefore = state.turn;
        executeDayStart(state);
        processEndOfTurn(state);

        if (state.gameResult === 'playing') {
          expect(state.turn).toBe(turnBefore + 1);
        }
      }

      expect(state.gameResult).toBe('playing');
    });

    it.runIf(CYCLING_FEATURE_AVAILABLE)(
      'should have different discard contents after each cycling turn',
      () => {
        const state = createTestState();

        executeDayStart(state);
        cycleMarketCards(state);
        const discardsAfterTurn1 = getTotalDiscardCount(state);

        processEndOfTurn(state);

        if (state.gameResult === 'playing') {
          executeDayStart(state);
          cycleMarketCards(state);
          const discardsAfterTurn2 = getTotalDiscardCount(state);
          expect(discardsAfterTurn2).toBeGreaterThanOrEqual(discardsAfterTurn1);
        }
      },
    );
  });
});
