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
  refillDevelopmentMarket,
  refillInvestmentsMarket,
  refillAllMarkets,
  refillIncidentQueue,
  getAffordableBusinessCards,
  getEmptySlots,
} from '../../example-games/main-street/MainStreetMarket';
import {
  GRID_SIZE,
  MARKET_BUSINESS_SLOTS,
  MARKET_INVESTMENT_SLOTS,
  MARKET_INVESTMENT_UPGRADE_COUNT,
  MARKET_INVESTMENT_EVENT_COUNT,
  type UpgradeCard,
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
      const card = state.market.development[0];
      state.resourceBank.coins = card.cost;
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
      const card = state.market.development[0];
      const result = canPurchaseBusiness(state, card.id, 0);
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('coins');
      }
    });

    it('should reject purchase when slot is occupied', () => {
      const state = createTestState();
      state.resourceBank.coins = 100;
      const card = state.market.development[0];
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
      state.resourceBank.coins = 100;
      const card = state.market.development[0];
      const result = canPurchaseBusiness(state, card.id, GRID_SIZE);
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('Invalid slot');
      }
    });

    it('should reject purchase when slot index is negative', () => {
      const state = createTestState();
      state.resourceBank.coins = 100;
      const card = state.market.development[0];
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
      const card = state.market.development[0];
      state.resourceBank.coins = card.cost;
      const coinsBefore = state.resourceBank.coins;

      const result = purchaseBusiness(state, card.id, 0);

      expect(result.card.id).toBe(card.id);
      expect(result.cost).toBe(card.cost);
      expect(state.resourceBank.coins).toBe(coinsBefore - card.cost);
      expect(state.streetGrid[0]).not.toBeNull();
      expect(state.streetGrid[0]!.id).toBe(card.id);
    });

    it('should not refill the market slot immediately (refill occurs at start of next turn)', () => {
      const state = createTestState();
      state.resourceBank.coins = 100;
      const deckSizeBefore = state.decks.business.length;
      const card = state.market.development[0];

      const result = purchaseBusiness(state, card.id, 0);

      expect(result.refilled).toBe(false);
      // Market should have one fewer visible card until end of turn
      expect(state.market.development).toHaveLength(MARKET_BUSINESS_SLOTS - 1);
      // Deck should be unchanged until refill
      expect(state.decks.business.length).toBe(deckSizeBefore);
    });

    it('should not refill when deck is empty', () => {
      const state = createTestState();
      state.resourceBank.coins = 100;
      // Empty the deck
      state.decks.business.length = 0;
      const card = state.market.development[0];

      const result = purchaseBusiness(state, card.id, 0);

      expect(result.refilled).toBe(false);
      expect(state.market.development).toHaveLength(MARKET_BUSINESS_SLOTS - 1);
    });

    it('should throw on illegal purchase', () => {
      const state = createTestState();
      expect(() => purchaseBusiness(state, 'nonexistent', 0)).toThrow('not found');
    });

    it('should deterministically update markets after purchase (no immediate refill)', () => {
      const state1 = createTestState('deterministic-market');
      const state2 = createTestState('deterministic-market');

      const card1 = state1.market.development[0];
      const card2 = state2.market.development[0];
      expect(card1.id).toBe(card2.id);

      purchaseBusiness(state1, card1.id, 0);
      purchaseBusiness(state2, card2.id, 0);

      // After purchase, visible markets (with one slot removed) should be identical
      expect(state1.market.development.map(c => c.id)).toEqual(
        state2.market.development.map(c => c.id),
      );
    });
  });

  // ── Upgrade Purchase ─────────────────────────────────────

  describe('canPurchaseUpgrade', () => {
    it('should allow upgrade when target business is on the street', () => {
      const state = createTestState();
      // Place a business that matches an upgrade target
      const upgrade = state.market.investments.find(c => c.family === 'upgrade') as UpgradeCard | undefined;
      if (!upgrade) return; // no upgrade in investments row for this seed
      const targetName = upgrade.targetBusiness;

      // Find a business card matching the target and place it
      const biz = state.market.development.find(b => b.name === targetName)
        || state.decks.business.find(b => b.name === targetName);
      if (biz) {
        // Ensure the placed business meets the upgrade's requiredLevel
        state.streetGrid[0] = { ...biz, level: (upgrade.requiredLevel ?? 0) };
        state.resourceBank.coins = 100; // Ensure enough coins
        const result = canPurchaseUpgrade(state, upgrade.id);
        expect(result.legal).toBe(true);
      }
    });

    it('should reject upgrade when no matching business is placed', () => {
      const state = createTestState();
      const upgrade = state.market.investments.find(c => c.family === 'upgrade') as UpgradeCard | undefined;
      if (!upgrade) return;
      // Street is empty, no targets
      const result = canPurchaseUpgrade(state, upgrade.id);
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('No eligible');
      }
    });

    it('should reject upgrade when business is already at max level', () => {
      const state = createTestState();
      const upgrade = state.market.investments.find(c => c.family === 'upgrade') as UpgradeCard | undefined;
      if (!upgrade) return;
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
      const upgrade = state.market.investments.find(c => c.family === 'upgrade') as UpgradeCard | undefined;
      expect(upgrade).toBeDefined();
      const targetName = upgrade!.targetBusiness;

      // Place a matching business
      const biz = state.decks.business.find(b => b.name === targetName);
      expect(biz).toBeDefined();
      // Ensure the placed business meets the upgrade's requiredLevel
      state.streetGrid[0] = { ...biz!, level: (upgrade!.requiredLevel ?? 0) };
      state.resourceBank.coins = 100;

      const incomeBefore = state.streetGrid[0]!.incomeBonus;
      const rangeBefore = state.streetGrid[0]!.synergyRangeBonus;
      const levelBefore = state.streetGrid[0]!.level;

      purchaseUpgrade(state, upgrade!.id);

      expect(state.streetGrid[0]!.level).toBe(levelBefore + 1);
      expect(state.streetGrid[0]!.incomeBonus).toBe(incomeBefore + upgrade!.incomeBonus);
      expect(state.streetGrid[0]!.synergyRangeBonus).toBe(rangeBefore + upgrade!.synergyRangeBonus);
    });

    it('should target a specific slot when provided', () => {
      const state = createTestState();
      const upgrade = state.market.investments.find(c => c.family === 'upgrade') as UpgradeCard | undefined;
      expect(upgrade).toBeDefined();
      const targetName = upgrade!.targetBusiness;

      // Place matching businesses in slots 2 and 5
      const biz = state.decks.business.find(b => b.name === targetName);
      expect(biz).toBeDefined();
      // Ensure placed businesses meet the upgrade's requiredLevel so the
      // purchase is legal regardless of which upgrade variant appears in the market.
      state.streetGrid[2] = { ...biz!, id: 'target-2', level: (upgrade!.requiredLevel ?? 0) };
      state.streetGrid[5] = { ...biz!, id: 'target-5', level: (upgrade!.requiredLevel ?? 0) };
      state.resourceBank.coins = 100;

      const level2Before = state.streetGrid[2]!.level;
      const level5Before = state.streetGrid[5]!.level;

      purchaseUpgrade(state, upgrade!.id, 5);

      // Slot 5 should be incremented by 1, slot 2 should remain unchanged
      expect(state.streetGrid[5]!.level).toBe(level5Before + 1);
      expect(state.streetGrid[2]!.level).toBe(level2Before);
    });
  });

  // ── Event Purchase ─────────────────────────────────────────

  describe('canPurchaseEvent', () => {
    it('should allow purchase of Investment-trigger events', () => {
      const state = createTestState();
      // Find an Investment-trigger event in investments row
      const investmentEvent = state.market.investments.find(
        c => c.family === 'event' && (c as import('../../example-games/main-street/MainStreetCards').EventCard).trigger === 'Investment',
      );
      if (investmentEvent) {
        const result = canPurchaseEvent(state, investmentEvent.id);
        expect(result.legal).toBe(true);
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
        cost: 0,
      };
      // Find an Investment event in investments row
      const investmentEvent = state.market.investments.find(
        c => c.family === 'event' && (c as import('../../example-games/main-street/MainStreetCards').EventCard).trigger === 'Investment',
      );
      if (investmentEvent) {
        const result = canPurchaseEvent(state, investmentEvent.id);
        expect(result.legal).toBe(false);
        if (!result.legal) {
          expect(result.reason).toContain('Already holding');
        }
      }
    });
  });

  describe('purchaseEvent', () => {
    it('should hold event as heldEvent and not refill market immediately', () => {
      const state = createTestState();
      // Ensure we have an Investment event by injecting into the investments row
      const investmentTemplate = {
        family: 'event' as const,
        id: 'evt-festival-test',
        name: 'Local Festival',
        trigger: 'Investment' as const,
        effect: '+2 coins to all Culture businesses and +1 reputation.',
        target: 'SpecificSynergy' as const,
        targetSynergy: 'Culture' as const,
        coinDelta: 2,
        reputationDelta: 1,
        cost: 3,
      };
      state.market.investments = [investmentTemplate];

      const beforeLen = state.market.investments.length;

      purchaseEvent(state, 'evt-festival-test');

      expect(state.heldEvent).not.toBeNull();
      expect(state.heldEvent!.id).toBe('evt-festival-test');
      // Market should have one fewer visible investment until end of turn
      expect(state.market.investments).toHaveLength(beforeLen - 1);
    });
  });

  // ── Market Refill ─────────────────────────────────────────

  describe('refill', () => {
    it('should refill business market to full slot count', () => {
      const state = createTestState();
      state.market.development = state.market.development.slice(0, 2); // Remove 2
      refillDevelopmentMarket(state);
      expect(state.market.development).toHaveLength(MARKET_BUSINESS_SLOTS);
    });

    it('should refill investments market to correct slot counts', () => {
      const state = createTestState();
      state.market.investments = [];
      refillInvestmentsMarket(state);
      const upgrades = state.market.investments.filter(c => c.family === 'upgrade');
      const events = state.market.investments.filter(c => c.family === 'event');
      expect(upgrades.length).toBeLessThanOrEqual(MARKET_INVESTMENT_UPGRADE_COUNT);
      expect(events.length).toBeLessThanOrEqual(MARKET_INVESTMENT_EVENT_COUNT);
      expect(state.market.investments.length).toBeLessThanOrEqual(MARKET_INVESTMENT_SLOTS);
    });

    it('should not exceed slot count when already full', () => {
      const state = createTestState();
      refillAllMarkets(state);
      expect(state.market.development.length).toBeLessThanOrEqual(MARKET_BUSINESS_SLOTS);
      expect(state.market.investments.length).toBeLessThanOrEqual(MARKET_INVESTMENT_SLOTS);
    });

    it('should partially fill when deck has fewer cards than slots', () => {
      const state = createTestState();
      state.market.development = [];
      state.decks.business = state.decks.business.slice(0, 2); // Only 2 left
      state.decks.communitySpace.length = 0; // No community space cards either
      state.discards.communitySpace.length = 0;
      refillDevelopmentMarket(state);
      expect(state.market.development).toHaveLength(2);
    });

    it('should produce exactly MARKET_INVESTMENT_UPGRADE_COUNT upgrades + MARKET_INVESTMENT_EVENT_COUNT events', () => {
      const state = createTestState();
      state.market.investments = [];
      // Ensure decks have enough cards
      expect(state.decks.upgrade.length).toBeGreaterThanOrEqual(MARKET_INVESTMENT_UPGRADE_COUNT);
      expect(state.decks.event.filter(e => e.trigger === 'Investment').length).toBeGreaterThanOrEqual(MARKET_INVESTMENT_EVENT_COUNT);

      refillInvestmentsMarket(state);

      const upgrades = state.market.investments.filter(c => c.family === 'upgrade');
      const events = state.market.investments.filter(c => c.family === 'event');
      expect(upgrades.length).toBe(MARKET_INVESTMENT_UPGRADE_COUNT);
      expect(events.length).toBe(MARKET_INVESTMENT_EVENT_COUNT);
      expect(state.market.investments.length).toBe(MARKET_INVESTMENT_SLOTS);
    });

    it('should decrease investments row size by one after purchasing an upgrade (no immediate refill)', () => {
      const state = createTestState();
      const upgrade = state.market.investments.find(c => c.family === 'upgrade') as UpgradeCard | undefined;
      if (!upgrade) return;
      const targetName = upgrade.targetBusiness;

      // Place a matching business so the upgrade purchase is legal
      const biz = state.decks.business.find(b => b.name === targetName);
      if (!biz) return;
      // Ensure the placed business meets the upgrade's requiredLevel
      state.streetGrid[0] = { ...biz, level: (upgrade.requiredLevel ?? 0) };
      state.resourceBank.coins = 100;

      const beforeLen = state.market.investments.length;
      purchaseUpgrade(state, upgrade.id);

      // After purchase, investments row should have one fewer visible card
      expect(state.market.investments.length).toBe(beforeLen - 1);
    });

    it('should remove the purchased event from the investments row (no immediate refill)', () => {
      const state = createTestState();
      // Inject a known Investment event into the investments row
      const investmentEvt = {
        family: 'event' as const,
        id: 'evt-test-purchase',
        name: 'Test Festival',
        trigger: 'Investment' as const,
        effect: '+1 coin',
        target: 'All' as const,
        coinDelta: 1,
        reputationDelta: 0,
        cost: 3,
      };
      // Replace any existing event in the investments row
      state.market.investments = state.market.investments.filter(c => c.family !== 'event');
      state.market.investments.push(investmentEvt);

      // Ensure deck has replacement Investment events
      state.decks.event.push({
        family: 'event',
        id: 'evt-festival-replacement',
        name: 'Local Festival',
        trigger: 'Investment',
        effect: '+2 coins',
        target: 'SpecificSynergy',
        targetSynergy: 'Culture',
        coinDelta: 2,
        reputationDelta: 1,
        cost: 3,
      });

      const beforeLen = state.market.investments.length;

      purchaseEvent(state, 'evt-test-purchase');

      // heldEvent should be set
      expect(state.heldEvent).not.toBeNull();
      expect(state.heldEvent!.id).toBe('evt-test-purchase');

      // Market should have one fewer visible event until end of turn
      const events = state.market.investments.filter(c => c.family === 'event');
      expect(state.market.investments.length).toBe(beforeLen - 1);
      expect(events.length).toBeLessThanOrEqual(MARKET_INVESTMENT_EVENT_COUNT);
    });

    it('should partially fill investments row when upgrade deck is exhausted', () => {
      const state = createTestState();
      state.market.investments = [];
      state.decks.upgrade = []; // No upgrades available
      // Keep Investment events in event deck
      refillInvestmentsMarket(state);

      const upgrades = state.market.investments.filter(c => c.family === 'upgrade');
      const events = state.market.investments.filter(c => c.family === 'event');
      expect(upgrades.length).toBe(0);
      expect(events.length).toBeLessThanOrEqual(MARKET_INVESTMENT_EVENT_COUNT);
    });

    it('should partially fill investments row when event deck has no Investment cards', () => {
      const state = createTestState();
      state.market.investments = [];
      // Remove all Investment-trigger events from the deck
      state.decks.event = state.decks.event.filter(e => e.trigger !== 'Investment');
      refillInvestmentsMarket(state);

      const upgrades = state.market.investments.filter(c => c.family === 'upgrade');
      const events = state.market.investments.filter(c => c.family === 'event');
      expect(upgrades.length).toBe(MARKET_INVESTMENT_UPGRADE_COUNT);
      expect(events.length).toBe(0);
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
      const card = state.market.development[0];
      state.streetGrid[3] = card;
      state.streetGrid[7] = card;
      const empty = getEmptySlots(state);
      expect(empty).toHaveLength(GRID_SIZE - 2);
      expect(empty).not.toContain(3);
      expect(empty).not.toContain(7);
    });
  });

  describe('reshuffle behavior', () => {
    it('should reshuffle business discards into deck when deck empty and refill', () => {
      const state = createTestState();
      // Move some business cards into the discard pile and empty both decks
      const moved = state.decks.business.splice(0, 3);
      state.discards.business.push(...moved);
      state.decks.business.length = 0;
      // Also empty the community space deck to avoid mixed-deck refill
      state.decks.communitySpace.length = 0;
      state.discards.communitySpace.length = 0;
      // Clear visible market so refill must draw
      state.market.development = [];
      refillDevelopmentMarket(state);
      expect(state.market.development.length).toBeGreaterThan(0);
      expect(state.discards.business.length).toBe(0);
    });

    it('should reshuffle upgrade discards when upgrade deck empty and refill investments', () => {
      const state = createTestState();
      const moved = state.decks.upgrade.splice(0, 2);
      state.discards.upgrade.push(...moved);
      state.decks.upgrade.length = 0;
      state.market.investments = [];
      refillInvestmentsMarket(state);
      const upgrades = state.market.investments.filter(c => c.family === 'upgrade');
      expect(upgrades.length).toBeGreaterThanOrEqual(0);
      expect(state.discards.upgrade.length).toBe(0);
    });

    it('should reshuffle event discards into event deck for incident queue filling', () => {
      const state = createTestState();
      // Pull out some incident cards and put them into discards
      const incidentCards = state.decks.event.filter(e => e.trigger === 'Incident').slice(0, 2);
      // Empty the event deck and place incident cards into discards so reshuffle is required
      state.decks.event = [];
      state.discards.event.push(...incidentCards);
      state.incidentQueue = [];
      refillIncidentQueue(state);
      expect(state.incidentQueue.length).toBeGreaterThan(0);
      expect(state.discards.event.length).toBe(0);
    });

    it('should leave slots empty when both deck and discard are empty', () => {
      const state = createTestState();
      state.decks.business = [];
      state.discards.business = [];
      state.decks.communitySpace = [];
      state.discards.communitySpace = [];
      state.market.development = [];
      refillDevelopmentMarket(state);
      expect(state.market.development.length).toBe(0);
    });

    it('should reshuffle event discards when no Investment events remain in deck (but Incident cards still exist)', () => {
      const state = createTestState();
      // Remove all Investment-trigger events from the deck, but keep Incidents
      const investmentEvents = state.decks.event.filter(e => e.trigger === 'Investment');
      // Put some into discards (simulating refresh-investments) and remove the rest
      state.discards.event.push(...investmentEvents.slice(0, 2));
      // The rest of investment events are removed (purchased/resolved)
      state.decks.event = state.decks.event.filter(e => e.trigger !== 'Investment');
      // Deck now has only Incident cards, discards have some Investment cards
      expect(state.decks.event.every(e => e.trigger === 'Incident')).toBe(true);
      expect(state.decks.event.length).toBeGreaterThan(0);
      expect(state.discards.event.length).toBeGreaterThan(0);

      // Clear investments row so refill must draw
      state.market.investments = [];
      state.heldEvent = null;
      refillInvestmentsMarket(state);

      // Should have drawn an Investment event from the reshuffled discards
      const investEvents = state.market.investments.filter(c => c.family === 'event' && c.trigger === 'Investment');
      expect(investEvents.length).toBe(1);
    });

    it('should reshuffle event discards when no Incident events remain in deck (but Investment cards still exist)', () => {
      const state = createTestState();
      // Remove all Incident-trigger events from the deck, but keep Investments
      const incidentEvents = state.decks.event.filter(e => e.trigger === 'Incident');
      // Put some into discards
      state.discards.event.push(...incidentEvents.slice(0, 2));
      // Remove the rest of incident events
      state.decks.event = state.decks.event.filter(e => e.trigger !== 'Incident');
      // Deck now has only Investment cards, discards have some Incident cards
      expect(state.decks.event.every(e => e.trigger === 'Investment')).toBe(true);
      expect(state.decks.event.length).toBeGreaterThan(0);
      expect(state.discards.event.length).toBeGreaterThan(0);

      // Clear incident queue so refill must draw
      state.incidentQueue = [];
      refillIncidentQueue(state);

      // Should have drawn Incident events from the reshuffled discards
      expect(state.incidentQueue.length).toBeGreaterThan(0);
      expect(state.discards.event.length).toBe(0);
    });
  });

  describe('unique event templates', () => {
    it('should have doubled unique event templates (36 instead of 18)', () => {
      const state = createTestState();
      // Count unique event templates by stripping the copy-number suffix
      const uniqueTemplateIds = new Set(
        state.decks.event.map(e => e.id.replace(/-\d+$/, '')),
      );
      // Should now have 37 unique event templates (one added: Recession)
      expect(uniqueTemplateIds.size).toBe(37);
    });
  });
});
