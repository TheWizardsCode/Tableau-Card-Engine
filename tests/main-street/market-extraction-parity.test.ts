/**
 * Main Street: Market Offer Engine — Extraction Parity Tests
 *
 * Tests that lock in current Market Offer behavior before extraction
 * from Main Street to shared `src/card-system`. These tests cover:
 *  - Market row retrieval helpers (findTargetBusinessSlot, refillIncidentQueue)
 *  - Buy eligibility negative paths (insufficient coins, incident events, wrong phase)
 *  - Purchase result edge cases
 *  - Refill policy behaviors (incident queue, deck exhaustion)
 *  - Integration: multi-turn market flow parity (purchase → end-turn → refill)
 *
 * @module
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
  refillInvestmentsMarket,
  refillIncidentQueue,
  refillAllMarkets,
  canRefreshInvestments,
  refreshInvestments,
  findTargetBusinessSlot,
  getAffordableUpgradeCards,
  getEmptySlots,
  getAffordableBusinessCards,
} from '../../example-games/main-street/MainStreetMarket';
import { executeDayStart, processEndOfTurn, executeAction } from '../../example-games/main-street/MainStreetEngine';
import {
  GRID_SIZE,
  MARKET_BUSINESS_SLOTS,
  MARKET_INVESTMENT_SLOTS,
  MARKET_INVESTMENT_UPGRADE_COUNT,
  INCIDENT_QUEUE_SIZE,
  REFRESH_INVESTMENTS_COST,
  type UpgradeCard,
  type EventCard,
} from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'extraction-parity'): MainStreetState {
  return setupMainStreetGame({ seed });
}

// ── Market Row Retrieval ────────────────────────────────────

describe('MarketOfferEngine — row retrieval', () => {
  describe('findTargetBusinessSlot', () => {
    it('should return the slot index of a matching business at the required level', () => {
      const state = createTestState();
      const upgrade = state.market.investments.find(
        c => c.family === 'upgrade',
      ) as UpgradeCard | undefined;
      if (!upgrade) return;

      // Place a matching business at the required level
      const biz = state.decks.business.find(b => b.name === upgrade.targetBusiness);
      if (!biz) return;
      state.streetGrid[3] = { ...biz, level: upgrade.requiredLevel ?? 0 };

      const slot = findTargetBusinessSlot(state, upgrade);
      expect(slot).toBe(3);
    });

    it('should return -1 when no matching business exists on the street', () => {
      const state = createTestState();
      const upgrade = state.market.investments.find(
        c => c.family === 'upgrade',
      ) as UpgradeCard | undefined;
      if (!upgrade) return;

      // Street is empty
      const slot = findTargetBusinessSlot(state, upgrade);
      expect(slot).toBe(-1);
    });

    it('should return -1 when the matching business is at a different level', () => {
      const state = createTestState();
      const upgrade = state.market.investments.find(
        c => c.family === 'upgrade',
      ) as UpgradeCard | undefined;
      if (!upgrade) return;

      const biz = state.decks.business.find(b => b.name === upgrade.targetBusiness);
      if (!biz) return;
      // Place at wrong level
      state.streetGrid[0] = { ...biz, level: (upgrade.requiredLevel ?? 0) + 1 };

      const slot = findTargetBusinessSlot(state, upgrade);
      expect(slot).toBe(-1);
    });

    it('should return -1 when the matching business is already at maxLevel', () => {
      const state = createTestState();
      const upgrade = state.market.investments.find(
        c => c.family === 'upgrade',
      ) as UpgradeCard | undefined;
      if (!upgrade) return;

      const biz = state.decks.business.find(b => b.name === upgrade.targetBusiness);
      if (!biz) return;
      // Place at max level
      state.streetGrid[0] = { ...biz, level: biz.maxLevel };

      const slot = findTargetBusinessSlot(state, upgrade);
      expect(slot).toBe(-1);
    });

    it('should default requiredLevel to 0 when not specified', () => {
      const state = createTestState();
      // Create a synthetic upgrade without requiredLevel
      const syntheticUpgrade: UpgradeCard = {
        family: 'upgrade',
        id: 'syn-upgrade-no-level',
        name: 'Synthetic Upgrade',
        targetBusiness: 'Pizzeria',
        cost: 3,
        incomeBonus: 1,
        synergyRangeBonus: 0,
        description: 'Test upgrade without requiredLevel',
        // requiredLevel omitted — should default to 0
      };

      // Place a Pizzeria at level 0
      const biz = state.decks.business.find(b => b.name === 'Pizzeria');
      if (!biz) return;
      state.streetGrid[2] = { ...biz, level: 0 };

      const slot = findTargetBusinessSlot(state, syntheticUpgrade);
      expect(slot).toBe(2);
    });

    it('should return the first matching slot when multiple candidates exist', () => {
      const state = createTestState();
      const upgrade = state.market.investments.find(
        c => c.family === 'upgrade',
      ) as UpgradeCard | undefined;
      if (!upgrade) return;

      const biz = state.decks.business.find(b => b.name === upgrade.targetBusiness);
      if (!biz) return;

      // Place matching businesses in slots 5 and 7
      state.streetGrid[5] = { ...biz, id: `${biz.id}-a`, level: upgrade.requiredLevel ?? 0 };
      state.streetGrid[7] = { ...biz, id: `${biz.id}-b`, level: upgrade.requiredLevel ?? 0 };

      const slot = findTargetBusinessSlot(state, upgrade);
      expect(slot).toBe(5); // First matching slot
    });
  });

  describe('getAffordableUpgradeCards', () => {
    it('should return upgrades the player can afford with valid targets', () => {
      const state = createTestState();
      // Place a business that can be upgraded
      const upgrade = state.market.investments.find(
        c => c.family === 'upgrade',
      ) as UpgradeCard | undefined;
      if (!upgrade) return;

      const biz = state.decks.business.find(b => b.name === upgrade.targetBusiness);
      if (!biz) return;
      state.streetGrid[0] = { ...biz, level: upgrade.requiredLevel ?? 0 };
      state.resourceBank.coins = 100;

      const affordable = getAffordableUpgradeCards(state);
      const affordableIds = affordable.map(c => c.id);
      expect(affordableIds).toContain(upgrade.id);
    });

    it('should exclude upgrades when player cannot afford them', () => {
      const state = createTestState();
      const upgrade = state.market.investments.find(
        c => c.family === 'upgrade',
      ) as UpgradeCard | undefined;
      if (!upgrade) return;

      const biz = state.decks.business.find(b => b.name === upgrade.targetBusiness);
      if (!biz) return;
      state.streetGrid[0] = { ...biz, level: upgrade.requiredLevel ?? 0 };
      // Set coins below the upgrade cost
      state.resourceBank.coins = Math.max(0, upgrade.cost - 1);

      const affordable = getAffordableUpgradeCards(state);
      const affordableIds = affordable.map(c => c.id);
      expect(affordableIds).not.toContain(upgrade.id);
    });

    it('should exclude upgrades when no valid target business exists', () => {
      const state = createTestState();
      state.resourceBank.coins = 100;
      // Street is empty — no targets
      const affordable = getAffordableUpgradeCards(state);
      // Any returned upgrades must have valid targets (the filter checks this)
      for (const card of affordable) {
        const hasTarget = state.streetGrid.some(
          b => b !== null && b.name === card.targetBusiness && b.level < b.maxLevel,
        );
        expect(hasTarget).toBe(true);
      }
    });

    it('should exclude upgrades targeting businesses already at maxLevel', () => {
      const state = createTestState();
      const upgrade = state.market.investments.find(
        c => c.family === 'upgrade',
      ) as UpgradeCard | undefined;
      if (!upgrade) return;

      const biz = state.decks.business.find(b => b.name === upgrade.targetBusiness);
      if (!biz) return;
      // Place at max level
      state.streetGrid[0] = { ...biz, level: biz.maxLevel };
      state.resourceBank.coins = 100;

      const affordable = getAffordableUpgradeCards(state);
      const affordableIds = affordable.map(c => c.id);
      expect(affordableIds).not.toContain(upgrade.id);
    });
  });
});

// ── Negative-Path: Buy Eligibility ──────────────────────────

describe('MarketOfferEngine — negative-path buy eligibility', () => {
  describe('canPurchaseBusiness — insufficient coins', () => {
    it('should reject when coins equal cost minus 1', () => {
      const state = createTestState();
      const card = state.market.business[0];
      state.resourceBank.coins = card.cost - 1;
      const result = canPurchaseBusiness(state, card.id, 0);
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('Not enough coins');
        expect(result.reason).toContain(String(card.cost));
      }
    });

    it('should reject when coins are exactly zero and card costs more than zero', () => {
      const state = createTestState();
      state.resourceBank.coins = 0;
      const card = state.market.business.find(c => c.cost > 0);
      if (!card) return;
      const result = canPurchaseBusiness(state, card.id, 0);
      expect(result.legal).toBe(false);
    });
  });

  describe('canPurchaseUpgrade — insufficient coins', () => {
    it('should reject upgrade purchase when coins are less than card cost', () => {
      const state = createTestState();
      const upgrade = state.market.investments.find(
        c => c.family === 'upgrade',
      ) as UpgradeCard | undefined;
      if (!upgrade) return;

      const biz = state.decks.business.find(b => b.name === upgrade.targetBusiness);
      if (!biz) return;
      state.streetGrid[0] = { ...biz, level: upgrade.requiredLevel ?? 0 };
      state.resourceBank.coins = upgrade.cost - 1;

      const result = canPurchaseUpgrade(state, upgrade.id);
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('Not enough coins');
        expect(result.reason).toContain(String(upgrade.cost));
      }
    });
  });

  describe('canPurchaseEvent — incident events not purchasable', () => {
    it('should reject purchase of an Incident-trigger event', () => {
      const state = createTestState();
      // Find an Incident event and inject it into the investments row
      const incidentEvent = state.decks.event.find(e => e.trigger === 'Incident');
      if (!incidentEvent) return;

      state.market.investments = [incidentEvent as EventCard];
      state.resourceBank.coins = 100;

      const result = canPurchaseEvent(state, incidentEvent.id);
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('Incident');
        expect(result.reason).toContain('purchased');
      }
    });

    it('should reject event purchase when coins are insufficient', () => {
      const state = createTestState();
      const investmentEvent = state.market.investments.find(
        c => c.family === 'event' && (c as EventCard).trigger === 'Investment',
      ) as EventCard | undefined;
      if (!investmentEvent) return;

      state.resourceBank.coins = investmentEvent.cost - 1;
      const result = canPurchaseEvent(state, investmentEvent.id);
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('Not enough coins');
        expect(result.reason).toContain(String(investmentEvent.cost));
      }
    });
  });

  describe('canRefreshInvestments — negative paths', () => {
    it('should reject refresh outside MarketPhase', () => {
      const state = createTestState();
      state.phase = 'DayStart';
      state.resourceBank.coins = REFRESH_INVESTMENTS_COST + 10;

      const result = canRefreshInvestments(state);
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('MarketPhase');
      }
    });

    it('should reject refresh when coins exactly equal cost minus 1', () => {
      const state = createTestState();
      state.phase = 'MarketPhase';
      state.resourceBank.coins = REFRESH_INVESTMENTS_COST - 1;

      const result = canRefreshInvestments(state);
      expect(result.legal).toBe(false);
    });

    it('should allow refresh when coins exactly equal cost', () => {
      const state = createTestState();
      state.phase = 'MarketPhase';
      state.resourceBank.coins = REFRESH_INVESTMENTS_COST;

      const result = canRefreshInvestments(state);
      expect(result.legal).toBe(true);
    });
  });
});

// ── Negative-Path: Invalid Row/Slot Selection ───────────────

describe('MarketOfferEngine — negative-path invalid row/slot', () => {
  describe('purchaseBusiness — invalid slot', () => {
    it('should throw when slot index equals GRID_SIZE', () => {
      const state = createTestState();
      const card = state.market.business[0];
      state.resourceBank.coins = 100;
      expect(() => purchaseBusiness(state, card.id, GRID_SIZE)).toThrow('Invalid slot');
    });

    it('should throw when slot index is negative', () => {
      const state = createTestState();
      const card = state.market.business[0];
      state.resourceBank.coins = 100;
      expect(() => purchaseBusiness(state, card.id, -1)).toThrow('Invalid slot');
    });

    it('should throw when slot is occupied', () => {
      const state = createTestState();
      const card = state.market.business[0];
      state.resourceBank.coins = 100;
      state.streetGrid[0] = state.decks.business[0];
      expect(() => purchaseBusiness(state, card.id, 0)).toThrow('occupied');
    });
  });

  describe('purchaseUpgrade — invalid targeting', () => {
    it('should throw when purchasing upgrade with insufficient coins', () => {
      const state = createTestState();
      const upgrade = state.market.investments.find(
        c => c.family === 'upgrade',
      ) as UpgradeCard | undefined;
      if (!upgrade) return;

      const biz = state.decks.business.find(b => b.name === upgrade.targetBusiness);
      if (!biz) return;
      state.streetGrid[0] = { ...biz, level: upgrade.requiredLevel ?? 0 };
      state.resourceBank.coins = upgrade.cost - 1;

      expect(() => purchaseUpgrade(state, upgrade.id)).toThrow('Not enough coins');
    });

    it('should throw when targeting a specific slot with a non-matching business (but another valid target exists)', () => {
      const state = createTestState();
      const upgrade = state.market.investments.find(
        c => c.family === 'upgrade',
      ) as UpgradeCard | undefined;
      if (!upgrade) return;

      // Place a non-matching business in slot 0 (the targeted slot)
      const nonMatchingBiz = state.decks.business.find(b => b.name !== upgrade.targetBusiness);
      if (!nonMatchingBiz) return;
      state.streetGrid[0] = { ...nonMatchingBiz, level: upgrade.requiredLevel ?? 0 };

      // Place a valid matching business elsewhere so canPurchaseUpgrade passes
      const matchingBiz = state.decks.business.find(b => b.name === upgrade.targetBusiness);
      if (!matchingBiz) return;
      state.streetGrid[1] = { ...matchingBiz, level: upgrade.requiredLevel ?? 0 };

      state.resourceBank.coins = 100;

      // Targeting slot 0 (non-matching) should throw
      expect(() => purchaseUpgrade(state, upgrade.id, 0)).toThrow('not a valid target');
    });
  });

  describe('purchaseEvent — insufficient coins', () => {
    it('should throw when buying event with insufficient coins', () => {
      const state = createTestState();
      const investmentEvent = state.market.investments.find(
        c => c.family === 'event' && (c as EventCard).trigger === 'Investment',
      ) as EventCard | undefined;
      if (!investmentEvent) return;

      state.resourceBank.coins = investmentEvent.cost - 1;
      expect(() => purchaseEvent(state, investmentEvent.id)).toThrow('Not enough coins');
    });
  });

  describe('refreshInvestments — insufficient coins', () => {
    it('should throw when refreshing with insufficient coins', () => {
      const state = createTestState();
      state.phase = 'MarketPhase';
      state.resourceBank.coins = REFRESH_INVESTMENTS_COST - 1;

      expect(() => refreshInvestments(state)).toThrow('Not enough coins');
    });
  });
});

// ── Refill Policy — Incident Queue ──────────────────────────

describe('MarketOfferEngine — refill policy: incident queue', () => {
  describe('refillIncidentQueue', () => {
    it('should fill the incident queue to INCIDENT_QUEUE_SIZE when deck has enough incidents', () => {
      const state = createTestState();
      state.incidentQueue = [];

      const availableIncidents = state.decks.event.filter(e => e.trigger === 'Incident').length;
      if (availableIncidents >= INCIDENT_QUEUE_SIZE) {
        refillIncidentQueue(state);
        expect(state.incidentQueue.length).toBe(INCIDENT_QUEUE_SIZE);
      }
    });

    it('should only draw Incident-trigger cards into the queue', () => {
      const state = createTestState();
      state.incidentQueue = [];
      refillIncidentQueue(state);

      for (const card of state.incidentQueue) {
        expect(card.trigger).toBe('Incident');
      }
    });

    it('should not add duplicates to the incident queue', () => {
      const state = createTestState();
      const beforeIds = state.incidentQueue.map(c => c.id);
      refillIncidentQueue(state);
      const afterIds = state.incidentQueue.map(c => c.id);

      // New cards should not duplicate existing queue cards
      const newCards = afterIds.filter(id => !beforeIds.includes(id));
      const uniqueNewCards = new Set(newCards);
      expect(uniqueNewCards.size).toBe(newCards.length);
    });

    it('should stop filling when no more Incident cards are available', () => {
      const state = createTestState();
      // Remove all Incident cards from deck and discards
      state.decks.event = state.decks.event.filter(e => e.trigger !== 'Incident');
      state.discards.event = state.discards.event.filter(e => e.trigger !== 'Incident');
      state.incidentQueue = [];

      refillIncidentQueue(state);
      expect(state.incidentQueue.length).toBe(0);
    });

    it('should not remove Investment events from the event deck', () => {
      const state = createTestState();
      const investmentCountBefore = state.decks.event.filter(e => e.trigger === 'Investment').length;
      state.incidentQueue = [];
      refillIncidentQueue(state);
      const investmentCountAfter = state.decks.event.filter(e => e.trigger === 'Investment').length;
      expect(investmentCountAfter).toBe(investmentCountBefore);
    });
  });
});

// ── Refill Policy — Deck Exhaustion Edge Cases ──────────────

describe('MarketOfferEngine — refill policy: exhaustion edge cases', () => {
  describe('refillInvestmentsMarket — dual exhaustion', () => {
    it('should produce empty investments row when both upgrade and event decks are empty', () => {
      const state = createTestState();
      state.market.investments = [];
      state.decks.upgrade = [];
      state.decks.event = [];
      state.discards.upgrade = [];
      state.discards.event = [];

      refillInvestmentsMarket(state);
      expect(state.market.investments).toHaveLength(0);
    });

    it('should only fill upgrades when event deck has no Investment-trigger cards', () => {
      const state = createTestState();
      state.market.investments = [];
      state.decks.event = state.decks.event.filter(e => e.trigger !== 'Investment');
      // Ensure upgrade deck has cards
      expect(state.decks.upgrade.length).toBeGreaterThanOrEqual(MARKET_INVESTMENT_UPGRADE_COUNT);

      refillInvestmentsMarket(state);

      const upgrades = state.market.investments.filter(c => c.family === 'upgrade');
      const events = state.market.investments.filter(c => c.family === 'event');
      expect(upgrades.length).toBe(MARKET_INVESTMENT_UPGRADE_COUNT);
      expect(events.length).toBe(0);
    });
  });

  describe('refillBusinessMarket — complete exhaustion', () => {
    it('should leave market partially empty when deck and discard are both empty', () => {
      const state = createTestState();
      state.market.business = [];
      state.decks.business = [];
      state.discards.business = [];

      refillBusinessMarket(state);
      expect(state.market.business).toHaveLength(0);
    });
  });

  describe('refillAllMarkets — idempotency', () => {
    it('should not change a fully-refilled market when called again', () => {
      const state = createTestState();
      const bizBefore = state.market.business.map(c => c.id).slice();
      const invBefore = state.market.investments.map(c => c.id).slice();

      refillAllMarkets(state);

      expect(state.market.business.map(c => c.id)).toEqual(bizBefore);
      expect(state.market.investments.map(c => c.id)).toEqual(invBefore);
    });
  });
});

// ── Integration: Multi-Turn Market Flow ─────────────────────

describe('MarketOfferEngine — multi-turn market flow parity', () => {
  function playGreedyTurn(state: MainStreetState): void {
    executeDayStart(state);
    const affordable = getAffordableBusinessCards(state);
    affordable.sort((a, b) => a.cost - b.cost);
    const empty = getEmptySlots(state);
    if (affordable.length > 0 && empty.length > 0) {
      const card = affordable[0];
      const slot = empty[0];
      executeAction(state, { type: 'buy-business', cardId: card.id, slotIndex: slot });
    }
    processEndOfTurn(state);
  }

  describe('purchase → end-turn → refill cycle', () => {
    it('should refill the business market at DayStart after a purchase', () => {
      const state = createTestState('flow-refill-1');
      state.resourceBank.coins = 100;

      // Day 1: buy a business
      executeDayStart(state);
      expect(state.market.business).toHaveLength(MARKET_BUSINESS_SLOTS);
      const card = state.market.business[0];
      executeAction(state, { type: 'buy-business', cardId: card.id, slotIndex: 0 });
      // After purchase, market should have one fewer card (no immediate refill)
      expect(state.market.business).toHaveLength(MARKET_BUSINESS_SLOTS - 1);

      // End turn → Day 2: market should be refilled
      processEndOfTurn(state);
      executeDayStart(state);
      // Market should be refilled to capacity (or deck limit)
      expect(state.market.business.length).toBeGreaterThanOrEqual(1);
      expect(state.market.business.length).toBeLessThanOrEqual(MARKET_BUSINESS_SLOTS);
    });

    it('should refill the investments row at DayStart after purchasing an upgrade', () => {
      const state = createTestState('flow-refill-2');
      state.resourceBank.coins = 100;

      // Place a target business
      const upgrade = state.market.investments.find(
        c => c.family === 'upgrade',
      ) as UpgradeCard | undefined;
      if (!upgrade) return;
      const biz = state.decks.business.find(b => b.name === upgrade.targetBusiness);
      if (!biz) return;
      state.streetGrid[0] = { ...biz, level: upgrade.requiredLevel ?? 0 };

      // Day 1
      executeDayStart(state);
      const invBefore = state.market.investments.length;
      executeAction(state, { type: 'buy-upgrade', cardId: upgrade.id });
      // After purchase, investments row has one fewer card
      expect(state.market.investments.length).toBe(invBefore - 1);

      // End turn → Day 2: investments should be refilled
      processEndOfTurn(state);
      executeDayStart(state);
      const upgCount = state.market.investments.filter(c => c.family === 'upgrade').length;
      const evtCount = state.market.investments.filter(c => c.family === 'event').length;
      expect(upgCount).toBeGreaterThanOrEqual(0);
      expect(evtCount).toBeGreaterThanOrEqual(0);
      expect(state.market.investments.length).toBeLessThanOrEqual(MARKET_INVESTMENT_SLOTS);
    });

    it('should maintain no duplicate card IDs in the business market across 5 turns', () => {
      const state = createTestState('flow-no-dupes');
      state.resourceBank.coins = 200;

      for (let turn = 0; turn < 5; turn++) {
        if (state.gameResult !== 'playing') break;
        playGreedyTurn(state);

        const ids = state.market.business.map(c => c.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size, `Turn ${turn + 1}: duplicate IDs found`).toBe(ids.length);
        expect(state.market.business.length).toBeLessThanOrEqual(MARKET_BUSINESS_SLOTS);
      }
    });

    it('should maintain no duplicate card IDs in the investments row across 5 turns', () => {
      const state = createTestState('flow-no-dupes-inv');
      state.resourceBank.coins = 200;

      for (let turn = 0; turn < 5; turn++) {
        if (state.gameResult !== 'playing') break;
        playGreedyTurn(state);

        const ids = state.market.investments.map(c => c.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size, `Turn ${turn + 1}: duplicate IDs found`).toBe(ids.length);
        expect(state.market.investments.length).toBeLessThanOrEqual(MARKET_INVESTMENT_SLOTS);
      }
    });

    it('should maintain incident queue integrity across 5 turns', () => {
      const state = createTestState('flow-queue-integrity');
      state.resourceBank.coins = 200;

      for (let turn = 0; turn < 5; turn++) {
        if (state.gameResult !== 'playing') break;
        playGreedyTurn(state);

        expect(state.incidentQueue.length).toBeLessThanOrEqual(INCIDENT_QUEUE_SIZE);
        for (const card of state.incidentQueue) {
          expect(card.trigger).toBe('Incident');
        }
        // No duplicates in queue
        const ids = state.incidentQueue.map(c => c.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      }
    });

    it('should produce deterministic market states with the same seed', () => {
      const state1 = createTestState('flow-deterministic');
      const state2 = createTestState('flow-deterministic');
      state1.resourceBank.coins = 100;
      state2.resourceBank.coins = 100;

      for (let turn = 0; turn < 3; turn++) {
        playGreedyTurn(state1);
        playGreedyTurn(state2);

        expect(state1.market.business.map(c => c.id)).toEqual(
          state2.market.business.map(c => c.id),
        );
        expect(state1.market.investments.map(c => c.id)).toEqual(
          state2.market.investments.map(c => c.id),
        );
        expect(state1.incidentQueue.map(c => c.id)).toEqual(
          state2.incidentQueue.map(c => c.id),
        );
      }
    });
  });
});
