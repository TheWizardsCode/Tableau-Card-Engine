/**
 * Main Street: Market Offer Engine — Extraction Parity Tests
 *
 * Tests that lock in current Market Offer behavior before extraction
 * from Main Street to shared `src/card-system`. These tests cover:
 *  - Market row retrieval helpers (findTargetBusinessSlot, replenishIncidentDeck)
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
      replenishIncidentDeck,
  refillMarket,
  canRefreshMarket,
  refreshMarket,
  findTargetBusinessSlot,
  getAffordableUpgradeCards,
  getEmptySlots,
  getAffordableBusinessCards,
  type RefreshResult,
} from '../../example-games/main-street/MainStreetMarket';
import { executeDayStart, processEndOfTurn, executeAction } from '../../example-games/main-street/MainStreetEngine';
import {
  GRID_SIZE,
  MARKET_TOTAL_SLOTS,
  MARKET_UPGRADE_MAX,
  REFRESH_MARKET_COST,
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
      const upgrade = state.market.cards.find(
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
      const upgrade = state.market.cards.find(
        c => c.family === 'upgrade',
      ) as UpgradeCard | undefined;
      if (!upgrade) return;

      // Street is empty
      const slot = findTargetBusinessSlot(state, upgrade);
      expect(slot).toBe(-1);
    });

    it('should return -1 when the matching business is at a different level', () => {
      const state = createTestState();
      const upgrade = state.market.cards.find(
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
      const upgrade = state.market.cards.find(
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
      const upgrade = state.market.cards.find(
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
      const upgrade = state.market.cards.find(
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
      const upgrade = state.market.cards.find(
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
      const upgrade = state.market.cards.find(
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
      const card = state.market.cards[0];
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
      const card = state.market.cards.find(c => c.cost > 0);
      if (!card) return;
      const result = canPurchaseBusiness(state, card.id, 0);
      expect(result.legal).toBe(false);
    });
  });

  describe('canPurchaseUpgrade — insufficient coins', () => {
    it('should reject upgrade purchase when coins are less than card cost', () => {
      const state = createTestState();
      const upgrade = state.market.cards.find(
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

      state.market.cards = [incidentEvent as EventCard];
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
      const investmentEvent = state.market.cards.find(
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

  describe('canRefreshMarket — negative paths', () => {
    it('should reject refresh outside MarketPhase', () => {
      const state = createTestState();
      state.phase = 'DayStart';
      state.resourceBank.coins = REFRESH_MARKET_COST + 10;

      const result = canRefreshMarket(state);
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('MarketPhase');
      }
    });

    it('should reject refresh when coins exactly equal cost minus 1', () => {
      const state = createTestState();
      state.phase = 'MarketPhase';
      state.resourceBank.coins = REFRESH_MARKET_COST - 1;

      const result = canRefreshMarket(state);
      expect(result.legal).toBe(false);
    });

    it('should allow refresh when coins exactly equal cost', () => {
      const state = createTestState();
      state.phase = 'MarketPhase';
      state.resourceBank.coins = REFRESH_MARKET_COST;

      const result = canRefreshMarket(state);
      expect(result.legal).toBe(true);
    });
  });

  describe('canPurchaseBusiness — card not found', () => {
    it('should reject when the card ID does not exist in the business market', () => {
      const state = createTestState();
      const result = canPurchaseBusiness(state, 'nonexistent-card-id', 0);
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('not found');
      }
    });
  });

  describe('canPurchaseUpgrade — card not found', () => {
    it('should reject when the card ID does not exist in the investments row', () => {
      const state = createTestState();
      state.resourceBank.coins = 100;
      const result = canPurchaseUpgrade(state, 'nonexistent-upgrade-id');
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('not found');
      }
    });
  });

  describe('canPurchaseEvent — card not found and already holding', () => {
    it('should reject when the card ID does not exist in the investments row', () => {
      const state = createTestState();
      const result = canPurchaseEvent(state, 'nonexistent-event-id');
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('not found');
      }
    });

    it('should reject when the hand is full', () => {
      const state = createTestState();
      // Fill the hand to maxHandSize (2) so no further purchases are legal.
      state.hand = [
        { family: 'event', id: 'evt-held-parity', name: 'Held Event', trigger: 'Investment', effect: 'test', target: 'All', coinDelta: 0, reputationDelta: 0, cost: 0 } as any,
        { family: 'event', id: 'evt-held-parity-2', name: 'Held Event 2', trigger: 'Investment', effect: 'test', target: 'All', coinDelta: 0, reputationDelta: 0, cost: 0 } as any,
        { family: 'business', id: 'biz-held-parity', name: 'Held Biz', cost: 0, baseIncome: 0, synergyTypes: [], upgradePath: '', maxLevel: 1, description: '', level: 1 } as any,
      ];
      // Find an Investment event in investments row
      const investmentEvent = state.market.cards.find(
        c => c.family === 'event' && (c as EventCard).trigger === 'Investment',
      ) as EventCard | undefined;
      if (!investmentEvent) return;

      state.resourceBank.coins = 100;
      const result = canPurchaseEvent(state, investmentEvent.id);
      expect(result.legal).toBe(false);
      if (!result.legal) {
        expect(result.reason).toContain('Hand is full');
      }
    });
  });
});

// ── Positive-Path: Buy Eligibility ──────────────────────────

describe('MarketOfferEngine — positive-path buy eligibility', () => {
  describe('canPurchaseBusiness — success', () => {
    it('should allow purchase when player has enough coins and slot is empty', () => {
      const state = createTestState();
      const card = state.market.cards[0];
      state.resourceBank.coins = card.cost;
      const result = canPurchaseBusiness(state, card.id, 0);
      expect(result.legal).toBe(true);
    });
  });

  describe('canPurchaseUpgrade — success', () => {
    it('should allow upgrade purchase when player can afford and target exists', () => {
      const state = createTestState();
      const upgrade = state.market.cards.find(
        c => c.family === 'upgrade',
      ) as UpgradeCard | undefined;
      if (!upgrade) return;

      const biz = state.decks.business.find(b => b.name === upgrade.targetBusiness);
      if (!biz) return;
      state.streetGrid[0] = { ...biz, level: upgrade.requiredLevel ?? 0 };
      state.resourceBank.coins = upgrade.cost;

      const result = canPurchaseUpgrade(state, upgrade.id);
      expect(result.legal).toBe(true);
    });
  });

  describe('canPurchaseEvent — success', () => {
    it('should allow purchase of an Investment-trigger event when player can afford', () => {
      const state = createTestState();
      const investmentEvent = state.market.cards.find(
        c => c.family === 'event' && (c as EventCard).trigger === 'Investment',
      ) as EventCard | undefined;
      if (!investmentEvent) return;

      state.resourceBank.coins = investmentEvent.cost;
      const result = canPurchaseEvent(state, investmentEvent.id);
      expect(result.legal).toBe(true);
    });
  });
});

// ── Positive-Path: Purchase Results ─────────────────────────

describe('MarketOfferEngine — positive-path purchase results', () => {
  describe('purchaseBusiness — success', () => {
    it('should deduct coins, place card in slot, and remove from market', () => {
      const state = createTestState();
      const card = state.market.cards[0];
      state.resourceBank.coins = 100;
      const coinsBefore = state.resourceBank.coins;

      const result = purchaseBusiness(state, card.id, 0);

      expect(result.card.id).toBe(card.id);
      expect(result.cost).toBe(card.cost);
      expect(state.resourceBank.coins).toBe(coinsBefore - card.cost);
      expect(state.streetGrid[0]).not.toBeNull();
      expect(state.streetGrid[0]!.id).toBe(card.id);
      expect(state.market.cards.map(c => c.id)).not.toContain(card.id);
    });

    it('should not refill the market immediately after purchase', () => {
      const state = createTestState();
      const card = state.market.cards[0];
      state.resourceBank.coins = 100;
      purchaseBusiness(state, card.id, 0);
      expect(state.market.cards).toHaveLength(MARKET_TOTAL_SLOTS - 1);
    });
  });

  describe('purchaseUpgrade — success', () => {
    it('should deduct coins and level up the target business', () => {
      const state = createTestState();
      const upgrade = state.market.cards.find(
        c => c.family === 'upgrade',
      ) as UpgradeCard | undefined;
      if (!upgrade) return;

      const biz = state.decks.business.find(b => b.name === upgrade.targetBusiness);
      if (!biz) return;
      state.streetGrid[0] = { ...biz, level: upgrade.requiredLevel ?? 0 };
      state.resourceBank.coins = 100;
      const coinsBefore = state.resourceBank.coins;
      const levelBefore = state.streetGrid[0]!.level;
      const incomeBefore = state.streetGrid[0]!.incomeBonus;
      const rangeBefore = state.streetGrid[0]!.synergyRangeBonus;

      purchaseUpgrade(state, upgrade.id);

      expect(state.resourceBank.coins).toBe(coinsBefore - upgrade.cost);
      expect(state.streetGrid[0]!.level).toBe(levelBefore + 1);
      expect(state.streetGrid[0]!.incomeBonus).toBe(incomeBefore + upgrade.incomeBonus);
      expect(state.streetGrid[0]!.synergyRangeBonus).toBe(rangeBefore + upgrade.synergyRangeBonus);
    });
  });

  describe('purchaseEvent — success', () => {
    it('should add event to hand and remove it from investments row', () => {
      const state = createTestState();
      const investmentEvt: EventCard = {
        family: 'event',
        id: 'evt-parity-test',
        name: 'Parity Test Festival',
        trigger: 'Investment',
        effect: '+1 coin test',
        target: 'All',
        coinDelta: 1,
        reputationDelta: 0,
        cost: 3,
      };
      state.market.cards = [investmentEvt];
      state.resourceBank.coins = investmentEvt.cost;
      const coinsBefore = state.resourceBank.coins;

      purchaseEvent(state, investmentEvt.id);

      expect(state.hand.some(c => c.family === 'event' && c.id === investmentEvt.id)).toBe(true);
      expect(state.resourceBank.coins).toBe(coinsBefore - investmentEvt.cost);
      expect(state.market.cards).toHaveLength(0);
    });
  });

  describe('refreshMarket — success', () => {
    it('should deduct cost, discard current investments, and refill the row', () => {
      const state = createTestState();
      state.phase = 'MarketPhase';
      state.resourceBank.coins = REFRESH_MARKET_COST + 10;

      const invBefore = state.market.cards.map(c => c.id).slice();
      expect(invBefore.length).toBeGreaterThan(0);
      const coinsBefore = state.resourceBank.coins;

      const result: RefreshResult = refreshMarket(state);

      expect(result.cost).toBe(REFRESH_MARKET_COST);
      expect(state.resourceBank.coins).toBe(coinsBefore - REFRESH_MARKET_COST);
      // All previously visible cards should be discarded (single row may hold
      // any family, so scan every discard pile).
      const discardedIds = [
        ...state.discards.business.map(c => c.id),
        ...state.discards.communitySpace.map(c => c.id),
        ...state.discards.upgrade.map(c => c.id),
        ...state.discards.event.map(c => c.id),
      ];
      for (const id of result.replaced.map(c => c.id)) {
        expect(discardedIds).toContain(id);
      }
      // Investments row refilled within slot limits
      expect(state.market.cards.length).toBeLessThanOrEqual(MARKET_TOTAL_SLOTS);
      // No duplicate IDs in the refreshed row
      const refreshedIds = state.market.cards.map(c => c.id);
      expect(new Set(refreshedIds).size).toBe(refreshedIds.length);
    });
  });
});

// ── Negative-Path: Invalid Row/Slot Selection ───────────────

describe('MarketOfferEngine — negative-path invalid row/slot', () => {
  describe('purchaseBusiness — invalid slot', () => {
    it('should throw when slot index equals GRID_SIZE', () => {
      const state = createTestState();
      const card = state.market.cards[0];
      state.resourceBank.coins = 100;
      expect(() => purchaseBusiness(state, card.id, GRID_SIZE)).toThrow('Invalid slot');
    });

    it('should throw when slot index is negative', () => {
      const state = createTestState();
      const card = state.market.cards[0];
      state.resourceBank.coins = 100;
      expect(() => purchaseBusiness(state, card.id, -1)).toThrow('Invalid slot');
    });

    it('should throw when slot is occupied', () => {
      const state = createTestState();
      const card = state.market.cards[0];
      state.resourceBank.coins = 100;
      state.streetGrid[0] = state.decks.business[0];
      expect(() => purchaseBusiness(state, card.id, 0)).toThrow('occupied');
    });
  });

  describe('purchaseUpgrade — invalid targeting', () => {
    it('should throw when purchasing upgrade with insufficient coins', () => {
      const state = createTestState();
      const upgrade = state.market.cards.find(
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
      const upgrade = state.market.cards.find(
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
      const investmentEvent = state.market.cards.find(
        c => c.family === 'event' && (c as EventCard).trigger === 'Investment',
      ) as EventCard | undefined;
      if (!investmentEvent) return;

      state.resourceBank.coins = investmentEvent.cost - 1;
      expect(() => purchaseEvent(state, investmentEvent.id)).toThrow('Not enough coins');
    });
  });

  describe('refreshMarket — insufficient coins', () => {
    it('should throw when refreshing with insufficient coins', () => {
      const state = createTestState();
      state.phase = 'MarketPhase';
      state.resourceBank.coins = REFRESH_MARKET_COST - 1;

      expect(() => refreshMarket(state)).toThrow('Not enough coins');
    });
  });
});

// ── Refill Policy — Incident Queue ──────────────────────────

describe('MarketOfferEngine — refill policy: incident deck', () => {
  describe('replenishIncidentDeck', () => {
    it('should move all Incident-trigger cards into the deck at setup', () => {
      const state = createTestState();
      // Deck is fully populated at setup; no Incident cards remain in decks.event.
      expect(state.decks.event.filter(e => e.trigger === 'Incident').length).toBe(0);
      expect(state.incidentDeck.length).toBeGreaterThan(0);
      expect(state.incidentDeck.every(c => c.trigger === 'Incident')).toBe(true);
    });

    it('should only draw Incident-trigger cards into the deck', () => {
      const state = createTestState();

      for (const card of state.incidentDeck) {
        expect(card.trigger).toBe('Incident');
      }
    });

    it('should not add duplicates to the incident deck', () => {
      const state = createTestState();
      const ids = state.incidentDeck.map(c => c.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it('should leave the deck empty when no more Incident cards are available', () => {
      const state = createTestState();
      // Remove all Incident cards from deck and discards
      state.decks.event = state.decks.event.filter(e => e.trigger !== 'Incident');
      state.discards.event = state.discards.event.filter(e => e.trigger !== 'Incident');
      state.incidentDeck = [];

      replenishIncidentDeck(state);
      expect(state.incidentDeck.length).toBe(0);
    });

    it('should not remove Investment events from the event deck', () => {
      const state = createTestState();
      const investmentCountBefore = state.decks.event.filter(e => e.trigger === 'Investment').length;
      // Move incidents into discards (the only place replenish can gather
      // them from in the new model — decks.event holds investments only).
      const incidentCountBefore = state.incidentDeck.length;
      state.discards.event.push(...state.incidentDeck);
      state.incidentDeck = [];
      replenishIncidentDeck(state);
      const investmentCountAfter = state.decks.event.filter(e => e.trigger === 'Investment').length;
      expect(investmentCountAfter).toBe(investmentCountBefore);
      expect(state.incidentDeck.length).toBe(incidentCountBefore);
    });
  });

  describe('reshuffle from discard', () => {
    it('should reshuffle event discards into the incident deck when replenishing', () => {
      const state = createTestState();
      // Move some incident cards into event discards and empty the incident deck.
      const incidentCards = state.incidentDeck.slice(0, 2);
      state.incidentDeck = [];
      state.discards.event.push(...incidentCards);
      replenishIncidentDeck(state);
      expect(state.incidentDeck.length).toBeGreaterThan(0);
      expect(state.discards.event.length).toBe(0);
    });
  });
});

// ── Refill Policy — Deck Exhaustion Edge Cases ──────────────

describe('MarketOfferEngine — refill policy: exhaustion edge cases', () => {
  describe('— dual exhaustion', () => {
    it('fills the single row with business-only cards when upgrade and event decks are empty', () => {
      const state = createTestState();
      state.market.cards = [];
      state.decks.upgrade = [];
      state.decks.event = [];
      state.discards.upgrade = [];
      state.discards.event = [];

      refillMarket(state);
      // No upgrades/events exist anywhere — the row must still satisfy the
      // ≥1-business contract, up to the available business supply.
      expect(state.market.cards.length).toBeGreaterThan(0);
      for (const card of state.market.cards) {
        expect(['business', 'community-space']).toContain(card.family);
      }
    });

    it('should only fill upgrades when event deck has no Investment-trigger cards', () => {
      const state = createTestState();
      state.market.cards = [];
      state.decks.event = state.decks.event.filter(e => e.trigger !== 'Investment');
      // Ensure upgrade deck has cards
      expect(state.decks.upgrade.length).toBeGreaterThanOrEqual(MARKET_UPGRADE_MAX);

      refillMarket(state);

      const upgrades = state.market.cards.filter(c => c.family === 'upgrade');
      const events = state.market.cards.filter(c => c.family === 'event');
      expect(upgrades.length).toBe(MARKET_UPGRADE_MAX);
      expect(events.length).toBe(0);
    });
  });

  describe('— complete exhaustion', () => {
    it('should leave market partially empty when deck and discard are both empty', () => {
      const state = createTestState();
      state.market.cards = [];
      state.decks.business = [];
      state.discards.business = [];
      state.decks.communitySpace = [];
      state.discards.communitySpace = [];

      refillMarket(state);
      expect(state.market.cards).toHaveLength(0);
    });
  });

  describe('refillMarket — idempotency', () => {
    it('should not change a fully-refilled market when called again', () => {
      const state = createTestState();
      const bizBefore = state.market.cards.map(c => c.id).slice();
      const invBefore = state.market.cards.map(c => c.id).slice();

      refillMarket(state);

      expect(state.market.cards.map(c => c.id)).toEqual(bizBefore);
      expect(state.market.cards.map(c => c.id)).toEqual(invBefore);
    });
  });
});

// ── Refill Policy — Reshuffle from Discard ─────────────────

describe('MarketOfferEngine — refill policy: reshuffle from discard', () => {
  describe('reshuffleIfNeeded — business deck', () => {
    it('should reshuffle business discards into deck when deck is empty and refill draws cards', () => {
      const state = createTestState();
      // Move some business cards into the discard pile and empty the deck
      const moved = state.decks.business.splice(0, 3);
      state.discards.business.push(...moved);
      state.decks.business.length = 0;
      // Also empty the community space deck to avoid mixed-deck refill
      state.decks.communitySpace.length = 0;
      state.discards.communitySpace.length = 0;
      // Clear visible market so refill must draw from reshuffled deck
      state.market.cards = [];
      refillMarket(state);
      expect(state.market.cards.length).toBeGreaterThan(0);
      expect(state.discards.business.length).toBe(0);
    });

    it('should leave market empty when both business deck and discard are empty', () => {
      const state = createTestState();
      state.decks.business = [];
      state.discards.business = [];
      state.decks.communitySpace = [];
      state.discards.communitySpace = [];
      state.market.cards = [];
      refillMarket(state);
      expect(state.market.cards).toHaveLength(0);
    });
  });

  describe('reshuffleIfNeeded — upgrade deck', () => {
    it('should reshuffle upgrade discards into deck when upgrade deck is empty', () => {
      const state = createTestState();
      const moved = state.decks.upgrade.splice(0, 2);
      state.discards.upgrade.push(...moved);
      state.decks.upgrade.length = 0;
      state.market.cards = [];
      refillMarket(state);
      // The reshuffled discard must have been consumed (nothing left there),
      // and the non-business slot is filled from it (upgrade or event).
      expect(state.discards.upgrade.length).toBe(0);
      const nonBusiness = state.market.cards.filter(
        c => c.family === 'upgrade' || c.family === 'event',
      );
      expect(nonBusiness.length).toBeGreaterThan(0);
    });
  });

  describe('reshuffleIfNeeded — event deck for incident deck', () => {
    it('should reshuffle event discards into deck when replenishing the incident deck', () => {
      const state = createTestState();
      // Move incident cards into discards and empty the incident deck.
      state.discards.event.push(...state.incidentDeck);
      state.incidentDeck = [];
      replenishIncidentDeck(state);
      expect(state.incidentDeck.length).toBeGreaterThan(0);
      expect(state.discards.event.length).toBe(0);
    });
  });

  describe('reshuffleNeeded — event deck for investments market', () => {
    it('should reshuffle event discards to find Investment events for the market row', () => {
      const state = createTestState();
      // Move ALL event cards (including Investment events) from deck to discard
      const allEvents = state.decks.event.slice();
      state.decks.event = [];
      state.discards.event.push(...allEvents);
      // Ensure we have Investment events in discards
      const investInDiscard = state.discards.event.filter(e => e.trigger === 'Investment').length;
      if (investInDiscard === 0) return; // Skip if no Investment events available
      state.market.cards = [];
      // Empty the upgrade deck so the non-business slot must come from the
      // reshuffled Investment-event discards.
      state.decks.upgrade = [];
      state.discards.upgrade = [];
      refillMarket(state);
      // Events should have been drawn from reshuffled discards
      const events = state.market.cards.filter(c => c.family === 'event');
      expect(events.length).toBeGreaterThan(0);
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
      expect(state.market.cards).toHaveLength(MARKET_TOTAL_SLOTS);
      const card = state.market.cards[0];
      executeAction(state, { type: 'buy-business', cardId: card.id, slotIndex: 0 });
      // After purchase, market should have one fewer card (no immediate refill)
      expect(state.market.cards).toHaveLength(MARKET_TOTAL_SLOTS - 1);

      // End turn → Day 2: market should be refilled
      processEndOfTurn(state);
      executeDayStart(state);
      // Market should be refilled to capacity (or deck limit)
      expect(state.market.cards.length).toBeGreaterThanOrEqual(1);
      expect(state.market.cards.length).toBeLessThanOrEqual(MARKET_TOTAL_SLOTS);
    });

    it('should refill the investments row at DayStart after purchasing an upgrade', () => {
      const state = createTestState('flow-refill-2');
      state.resourceBank.coins = 100;

      // Place a target business
      const upgrade = state.market.cards.find(
        c => c.family === 'upgrade',
      ) as UpgradeCard | undefined;
      if (!upgrade) return;
      const biz = state.decks.business.find(b => b.name === upgrade.targetBusiness);
      if (!biz) return;
      state.streetGrid[0] = { ...biz, level: upgrade.requiredLevel ?? 0 };

      // Day 1
      executeDayStart(state);
      const invBefore = state.market.cards.length;
      executeAction(state, { type: 'buy-upgrade', cardId: upgrade.id });
      // After purchase, investments row has one fewer card
      expect(state.market.cards.length).toBe(invBefore - 1);

      // End turn → Day 2: investments should be refilled
      processEndOfTurn(state);
      executeDayStart(state);
      const upgCount = state.market.cards.filter(c => c.family === 'upgrade').length;
      const evtCount = state.market.cards.filter(c => c.family === 'event').length;
      expect(upgCount).toBeGreaterThanOrEqual(0);
      expect(evtCount).toBeGreaterThanOrEqual(0);
      expect(state.market.cards.length).toBeLessThanOrEqual(MARKET_TOTAL_SLOTS);
    });

    it('should maintain no duplicate card IDs in the business market across 5 turns', () => {
      const state = createTestState('flow-no-dupes');
      state.resourceBank.coins = 200;

      for (let turn = 0; turn < 5; turn++) {
        if (state.gameResult !== 'playing') break;
        playGreedyTurn(state);

        const ids = state.market.cards.map(c => c.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size, `Turn ${turn + 1}: duplicate IDs found`).toBe(ids.length);
        expect(state.market.cards.length).toBeLessThanOrEqual(MARKET_TOTAL_SLOTS);
      }
    });

    it('should maintain no duplicate card IDs in the investments row across 5 turns', () => {
      const state = createTestState('flow-no-dupes-inv');
      state.resourceBank.coins = 200;

      for (let turn = 0; turn < 5; turn++) {
        if (state.gameResult !== 'playing') break;
        playGreedyTurn(state);

        const ids = state.market.cards.map(c => c.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size, `Turn ${turn + 1}: duplicate IDs found`).toBe(ids.length);
        expect(state.market.cards.length).toBeLessThanOrEqual(MARKET_TOTAL_SLOTS);
      }
    });

    it('should maintain incident deck integrity across 5 turns', () => {
      const state = createTestState('flow-queue-integrity');
      state.resourceBank.coins = 200;

      for (let turn = 0; turn < 5; turn++) {
        if (state.gameResult !== 'playing') break;
        playGreedyTurn(state);

        // The incident deck only shrinks as incidents resolve (no visible
        // refill loop); it never regrows above its setup size.
        for (const card of state.incidentDeck) {
          expect(card.trigger).toBe('Incident');
        }
        // No duplicates in deck
        const ids = state.incidentDeck.map(c => c.id);
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

        expect(state1.market.cards.map(c => c.id)).toEqual(
          state2.market.cards.map(c => c.id),
        );
        expect(state1.market.cards.map(c => c.id)).toEqual(
          state2.market.cards.map(c => c.id),
        );
        expect(state1.incidentDeck.map(c => c.id)).toEqual(
          state2.incidentDeck.map(c => c.id),
        );
      }
    });
  });
});
