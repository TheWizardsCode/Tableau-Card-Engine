/**
 * Main Street: Market Tests
 *
 * Tests for market purchase legality, execution, refill, and edge cases.
 */
import { describe, it, expect } from 'vitest';

import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import {
  canPurchaseBusiness,
  canPurchaseUpgrade,
  canPurchaseEvent,
  purchaseBusiness,
  purchaseUpgrade,
  purchaseEvent,
  refillBusinessMarket,
  refillEventMarket,
  refillUpgradeMarket,
  refillAllMarkets,
  getAffordableBusinessCards,
  getEmptySlots,
} from '../../example-games/main-street/MainStreetMarket';
import {
  GRID_SIZE,
  MARKET_BUSINESS_SLOTS,
  MARKET_EVENT_SLOTS,
  MARKET_UPGRADE_SLOTS,
} from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'market-test'): MainStreetState {
  return setupMainStreetGame({ seed });
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreetMarket', () => {
  // ── Business Purchase Legality ─────────────────────────────

  describe('canPurchaseBusiness', () => {
    it('should allow purchase when player has enough coins and slot is empty', () => {
      const state = createTestState();
      const card = state.market.business[0];
      const result = canPurchaseBusiness(state, card.id, 0);
      expect(result.legal).toBe(true);
    });

    it('should reject purchase when card is not in the market', () => {
      const state = createTestState();
      const result = canPurchaseBusiness(state, 'nonexistent-id', 0);
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('not found');
      }
    });

    it('should reject purchase when player lacks coins', () => {
      const state = createTestState();
      state.resourceBank.coins = 0;
      const card = state.market.business[0];
      const result = canPurchaseBusiness(state, card.id, 0);
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('coins');
      }
    });

    it('should reject purchase when slot is occupied', () => {
      const state = createTestState();
      const card = state.market.business[0];
      // Place a dummy business in slot 0
      state.streetGrid[0] = { ...card, id: 'dummy' };
      const result = canPurchaseBusiness(state, card.id, 0);
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('occupied');
      }
    });

    it('should reject purchase when slot index is out of range', () => {
      const state = createTestState();
      const card = state.market.business[0];
      const result = canPurchaseBusiness(state, card.id, GRID_SIZE);
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('Invalid slot');
      }
    });

    it('should reject purchase when slot index is negative', () => {
      const state = createTestState();
      const card = state.market.business[0];
      const result = canPurchaseBusiness(state, card.id, -1);
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('Invalid slot');
      }
    });
  });

  // ── Business Purchase Execution ─────────────────────────────

  describe('purchaseBusiness', () => {
    it('should deduct coins, place card, and remove from market', () => {
      const state = createTestState();
      const card = state.market.business[0];
      const coinsBefore = state.resourceBank.coins;

      const result = purchaseBusiness(state, card.id, 0);

      expect(result.card.id).toBe(card.id);
      expect(result.cost).toBe(card.cost);
      expect(state.resourceBank.coins).toBe(coinsBefore - card.cost);
      expect(state.streetGrid[0]).not.toBeNull();
      expect(state.streetGrid[0]!.id).toBe(card.id);
    });

    it('should refill the market slot from the deck', () => {
      const state = createTestState();
      const deckSizeBefore = state.decks.business.length;
      const card = state.market.business[0];

      const result = purchaseBusiness(state, card.id, 0);

      expect(result.refilled).toBe(true);
      expect(state.market.business).toHaveLength(MARKET_BUSINESS_SLOTS);
      expect(state.decks.business.length).toBe(deckSizeBefore - 1);
    });

    it('should not refill when deck is empty', () => {
      const state = createTestState();
      // Empty the deck
      state.decks.business.length = 0;
      const card = state.market.business[0];

      const result = purchaseBusiness(state, card.id, 0);

      expect(result.refilled).toBe(false);
      expect(state.market.business).toHaveLength(MARKET_BUSINESS_SLOTS - 1);
    });

    it('should throw on illegal purchase', () => {
      const state = createTestState();
      expect(() => purchaseBusiness(state, 'nonexistent', 0)).toThrow('not found');
    });

    it('should deterministically refill after purchase', () => {
      const state1 = createTestState('deterministic-market');
      const state2 = createTestState('deterministic-market');

      const card1 = state1.market.business[0];
      const card2 = state2.market.business[0];
      expect(card1.id).toBe(card2.id);

      purchaseBusiness(state1, card1.id, 0);
      purchaseBusiness(state2, card2.id, 0);

      // After purchase and refill, markets should be identical
      expect(state1.market.business.map(c => c.id)).toEqual(
        state2.market.business.map(c => c.id),
      );
    });
  });

  // ── Upgrade Purchase ─────────────────────────────────────

  describe('canPurchaseUpgrade', () => {
    it('should allow upgrade when target business is on the street', () => {
      const state = createTestState();
      // Place a business that matches an upgrade target
      const upgrade = state.market.upgrade[0];
      const targetName = upgrade.targetBusiness;

      // Find a business card matching the target and place it
      const biz = state.market.business.find(b => b.name === targetName)
        || state.decks.business.find(b => b.name === targetName);
      if (biz) {
        state.streetGrid[0] = { ...biz };
        state.resourceBank.coins = 100; // Ensure enough coins
        const result = canPurchaseUpgrade(state, upgrade.id);
        expect(result.legal).toBe(true);
      }
    });

    it('should reject upgrade when no matching business is placed', () => {
      const state = createTestState();
      const upgrade = state.market.upgrade[0];
      // Street is empty, no targets
      const result = canPurchaseUpgrade(state, upgrade.id);
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('No eligible');
      }
    });

    it('should reject upgrade when business is already at max level', () => {
      const state = createTestState();
      const upgrade = state.market.upgrade[0];
      const targetName = upgrade.targetBusiness;

      // Place a business at max level
      const biz = state.decks.business.find(b => b.name === targetName);
      if (biz) {
        state.streetGrid[0] = { ...biz, level: biz.maxLevel };
        state.resourceBank.coins = 100;
        const result = canPurchaseUpgrade(state, upgrade.id);
        expect(result.legal).toBe(false);
      }
    });
  });

  describe('purchaseUpgrade', () => {
    it('should apply income and synergy bonuses to the target business', () => {
      const state = createTestState();
      const upgrade = state.market.upgrade[0];
      const targetName = upgrade.targetBusiness;

      // Place a matching business
      const biz = state.decks.business.find(b => b.name === targetName);
      expect(biz).toBeDefined();
      state.streetGrid[0] = { ...biz! };
      state.resourceBank.coins = 100;

      const incomeBefore = state.streetGrid[0]!.incomeBonus;
      const rangeBefore = state.streetGrid[0]!.synergyRangeBonus;
      const levelBefore = state.streetGrid[0]!.level;

      purchaseUpgrade(state, upgrade.id);

      expect(state.streetGrid[0]!.level).toBe(levelBefore + 1);
      expect(state.streetGrid[0]!.incomeBonus).toBe(incomeBefore + upgrade.incomeBonus);
      expect(state.streetGrid[0]!.synergyRangeBonus).toBe(rangeBefore + upgrade.synergyRangeBonus);
    });

    it('should target a specific slot when provided', () => {
      const state = createTestState();
      const upgrade = state.market.upgrade[0];
      const targetName = upgrade.targetBusiness;

      // Place matching businesses in slots 2 and 5
      const biz = state.decks.business.find(b => b.name === targetName);
      expect(biz).toBeDefined();
      state.streetGrid[2] = { ...biz!, id: 'target-2' };
      state.streetGrid[5] = { ...biz!, id: 'target-5' };
      state.resourceBank.coins = 100;

      purchaseUpgrade(state, upgrade.id, 5);

      // Slot 5 should be upgraded, slot 2 should not
      expect(state.streetGrid[5]!.level).toBe(1);
      expect(state.streetGrid[2]!.level).toBe(0);
    });
  });

  // ── Event Purchase ─────────────────────────────────────────

  describe('canPurchaseEvent', () => {
    it('should allow purchase of Investment-trigger events', () => {
      const state = createTestState();
      // Find an Investment-trigger event in market
      const investmentEvent = state.market.event.find(e => e.trigger === 'Investment');
      if (investmentEvent) {
        const result = canPurchaseEvent(state, investmentEvent.id);
        expect(result.legal).toBe(true);
      }
    });

    it('should reject purchase of Incident-trigger events', () => {
      const state = createTestState();
      const incidentEvent = state.market.event.find(e => e.trigger === 'Incident');
      if (incidentEvent) {
        const result = canPurchaseEvent(state, incidentEvent.id);
        expect(result.legal).toBe(false);
        if (!result.legal) {
          expect(result.reason).toContain('Incident events');
        }
      }
    });

    it('should reject when card is not in market', () => {
      const state = createTestState();
      const result = canPurchaseEvent(state, 'nonexistent');
      expect(result.legal).toBe(false);
    });

    it('should reject purchase when heldEvent is already occupied', () => {
      const state = createTestState();
      // Set a held event
      state.heldEvent = {
        family: 'event',
        id: 'held-evt',
        name: 'Held Event',
        trigger: 'Investment',
        effect: 'test',
        target: 'All',
        coinDelta: 0,
        reputationDelta: 0,
      };
      // Find an Investment event in market
      const investmentEvent = state.market.event.find(e => e.trigger === 'Investment');
      if (investmentEvent) {
        const result = canPurchaseEvent(state, investmentEvent.id);
        expect(result.legal).toBe(false);
        if (!result.legal) {
          expect(result.reason).toContain('already holding');
        }
      }
    });
  });

  describe('purchaseEvent', () => {
    it('should hold event as heldEvent and refill market', () => {
      const state = createTestState();
      // Ensure we have an Investment event by manipulating the market
      const investmentTemplate = {
        family: 'event' as const,
        id: 'evt-tax-test',
        name: 'Tax Audit',
        trigger: 'Investment' as const,
        effect: 'Lose 3 coins.',
        target: 'All' as const,
        coinDelta: -3,
        reputationDelta: 0,
      };
      state.market.event = [investmentTemplate];

      purchaseEvent(state, 'evt-tax-test');

      expect(state.heldEvent).not.toBeNull();
      expect(state.heldEvent!.id).toBe('evt-tax-test');
    });
  });

  // ── Market Refill ─────────────────────────────────────────

  describe('refill', () => {
    it('should refill business market to full slot count', () => {
      const state = createTestState();
      state.market.business = state.market.business.slice(0, 2); // Remove 2
      refillBusinessMarket(state);
      expect(state.market.business).toHaveLength(MARKET_BUSINESS_SLOTS);
    });

    it('should refill event market to full slot count', () => {
      const state = createTestState();
      state.market.event = [];
      refillEventMarket(state);
      expect(state.market.event).toHaveLength(MARKET_EVENT_SLOTS);
    });

    it('should refill upgrade market to full slot count', () => {
      const state = createTestState();
      state.market.upgrade = [];
      refillUpgradeMarket(state);
      expect(state.market.upgrade).toHaveLength(MARKET_UPGRADE_SLOTS);
    });

    it('should not exceed slot count when already full', () => {
      const state = createTestState();
      refillAllMarkets(state);
      expect(state.market.business.length).toBeLessThanOrEqual(MARKET_BUSINESS_SLOTS);
      expect(state.market.event.length).toBeLessThanOrEqual(MARKET_EVENT_SLOTS);
      expect(state.market.upgrade.length).toBeLessThanOrEqual(MARKET_UPGRADE_SLOTS);
    });

    it('should partially fill when deck has fewer cards than slots', () => {
      const state = createTestState();
      state.market.business = [];
      state.decks.business = state.decks.business.slice(0, 2); // Only 2 left
      refillBusinessMarket(state);
      expect(state.market.business).toHaveLength(2);
    });
  });

  // ── Query Helpers ─────────────────────────────────────────

  describe('getAffordableBusinessCards', () => {
    it('should return cards the player can afford', () => {
      const state = createTestState();
      state.resourceBank.coins = 3;
      const affordable = getAffordableBusinessCards(state);
      for (const card of affordable) {
        expect(card.cost).toBeLessThanOrEqual(3);
      }
    });

    it('should return empty array when player has no coins', () => {
      const state = createTestState();
      state.resourceBank.coins = 0;
      const affordable = getAffordableBusinessCards(state);
      expect(affordable).toHaveLength(0);
    });
  });

  describe('getEmptySlots', () => {
    it('should return all slots when grid is empty', () => {
      const state = createTestState();
      const empty = getEmptySlots(state);
      expect(empty).toHaveLength(GRID_SIZE);
      expect(empty).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should exclude occupied slots', () => {
      const state = createTestState();
      const card = state.market.business[0];
      state.streetGrid[3] = card;
      state.streetGrid[7] = card;
      const empty = getEmptySlots(state);
      expect(empty).toHaveLength(GRID_SIZE - 2);
      expect(empty).not.toContain(3);
      expect(empty).not.toContain(7);
    });
  });
});
