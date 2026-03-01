/**
 * Main Street: Game State Tests
 *
 * Tests for MainStreetState creation, field defaults, seed determinism,
 * and card type definitions.
 */
import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  seedToNumber,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';

import {
  GRID_SIZE,
  STARTING_COINS,
  STARTING_REPUTATION,
  MARKET_BUSINESS_SLOTS,
  MARKET_EVENT_SLOTS,
  MARKET_UPGRADE_SLOTS,
  createBusinessDeck,
  createEventDeck,
  createUpgradeDeck,
} from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'test42'): MainStreetState {
  return setupMainStreetGame({ seed });
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreetCards', () => {
  describe('createBusinessDeck', () => {
    it('should create 15 cards with 3 copies of 5 templates', () => {
      const deck = createBusinessDeck(3);
      expect(deck).toHaveLength(15);
    });

    it('should create cards with correct family', () => {
      const deck = createBusinessDeck(1);
      for (const card of deck) {
        expect(card.family).toBe('business');
      }
    });

    it('should create cards with unique IDs per copy', () => {
      const deck = createBusinessDeck(3);
      const ids = deck.map(c => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(15);
    });

    it('should create cards with initial level 0 and no bonuses', () => {
      const deck = createBusinessDeck(1);
      for (const card of deck) {
        expect(card.level).toBe(0);
        expect(card.incomeBonus).toBe(0);
        expect(card.synergyRangeBonus).toBe(0);
      }
    });
  });

  describe('createEventDeck', () => {
    it('should create 9 cards with 3 copies of 3 templates', () => {
      const deck = createEventDeck(3);
      expect(deck).toHaveLength(9);
    });

    it('should create cards with correct family', () => {
      const deck = createEventDeck(1);
      for (const card of deck) {
        expect(card.family).toBe('event');
      }
    });
  });

  describe('createUpgradeDeck', () => {
    it('should create 6 cards with 2 copies of 3 templates', () => {
      const deck = createUpgradeDeck(2);
      expect(deck).toHaveLength(6);
    });

    it('should create cards with correct family', () => {
      const deck = createUpgradeDeck(1);
      for (const card of deck) {
        expect(card.family).toBe('upgrade');
      }
    });
  });
});

describe('MainStreetState', () => {
  describe('seedToNumber', () => {
    it('should return a consistent number for the same string', () => {
      expect(seedToNumber('hello')).toBe(seedToNumber('hello'));
    });

    it('should return different numbers for different strings', () => {
      expect(seedToNumber('hello')).not.toBe(seedToNumber('world'));
    });

    it('should return a number for empty string', () => {
      expect(typeof seedToNumber('')).toBe('number');
    });
  });

  describe('setupMainStreetGame', () => {
    it('should create a state with turn 1', () => {
      const state = createTestState();
      expect(state.turn).toBe(1);
    });

    it('should start in DayStart phase', () => {
      const state = createTestState();
      expect(state.phase).toBe('DayStart');
    });

    it('should create an empty street grid of GRID_SIZE slots', () => {
      const state = createTestState();
      expect(state.streetGrid).toHaveLength(GRID_SIZE);
      for (const slot of state.streetGrid) {
        expect(slot).toBeNull();
      }
    });

    it('should initialise resource bank with starting values', () => {
      const state = createTestState();
      expect(state.resourceBank.coins).toBe(STARTING_COINS);
      expect(state.resourceBank.reputation).toBe(STARTING_REPUTATION);
    });

    it('should populate market with correct slot counts', () => {
      const state = createTestState();
      expect(state.market.business.length).toBeLessThanOrEqual(MARKET_BUSINESS_SLOTS);
      expect(state.market.business.length).toBeGreaterThan(0);
      expect(state.market.event.length).toBeLessThanOrEqual(MARKET_EVENT_SLOTS);
      expect(state.market.event.length).toBeGreaterThan(0);
      expect(state.market.upgrade.length).toBeLessThanOrEqual(MARKET_UPGRADE_SLOTS);
      expect(state.market.upgrade.length).toBeGreaterThan(0);
    });

    it('should have non-empty decks after market fill', () => {
      const state = createTestState();
      // Business: 15 total - 4 market = 11 remaining
      expect(state.decks.business.length).toBe(15 - MARKET_BUSINESS_SLOTS);
      // Event: 9 total - 2 market = 7 remaining
      expect(state.decks.event.length).toBe(9 - MARKET_EVENT_SLOTS);
      // Upgrade: 6 total - 2 market = 4 remaining
      expect(state.decks.upgrade.length).toBe(6 - MARKET_UPGRADE_SLOTS);
    });

    it('should have no challenges completed initially', () => {
      const state = createTestState();
      expect(state.challengesCompleted).toHaveLength(0);
    });

    it('should have no pending events initially', () => {
      const state = createTestState();
      expect(state.pendingEvents).toHaveLength(0);
    });

    it('should be in playing state', () => {
      const state = createTestState();
      expect(state.gameResult).toBe('playing');
      expect(state.endReason).toBeNull();
    });

    it('should store the seed string', () => {
      const state = createTestState('mySeed');
      expect(state.seed).toBe('mySeed');
    });

    it('should provide an rng function', () => {
      const state = createTestState();
      expect(typeof state.rng).toBe('function');
      const val = state.rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    });

    it('should generate a seed when none is provided', () => {
      const state = setupMainStreetGame();
      expect(state.seed).toBeDefined();
      expect(state.seed.length).toBe(6);
    });
  });

  describe('determinism', () => {
    it('should produce identical initial states for the same seed', () => {
      const state1 = createTestState('deterministic');
      const state2 = createTestState('deterministic');

      // Compare structural fields (exclude rng function)
      expect(state1.turn).toBe(state2.turn);
      expect(state1.phase).toBe(state2.phase);
      expect(state1.resourceBank).toEqual(state2.resourceBank);
      expect(state1.seed).toBe(state2.seed);

      // Market should have same cards in same order
      expect(state1.market.business.map(c => c.id)).toEqual(
        state2.market.business.map(c => c.id),
      );
      expect(state1.market.event.map(c => c.id)).toEqual(
        state2.market.event.map(c => c.id),
      );
      expect(state1.market.upgrade.map(c => c.id)).toEqual(
        state2.market.upgrade.map(c => c.id),
      );

      // Decks should have same card order
      expect(state1.decks.business.map(c => c.id)).toEqual(
        state2.decks.business.map(c => c.id),
      );
      expect(state1.decks.event.map(c => c.id)).toEqual(
        state2.decks.event.map(c => c.id),
      );
      expect(state1.decks.upgrade.map(c => c.id)).toEqual(
        state2.decks.upgrade.map(c => c.id),
      );
    });

    it('should produce different initial states for different seeds', () => {
      const state1 = createTestState('seedA');
      const state2 = createTestState('seedB');

      // At least the market or deck order should differ
      const ids1 = state1.decks.business.map(c => c.id).join(',');
      const ids2 = state2.decks.business.map(c => c.id).join(',');
      expect(ids1).not.toBe(ids2);
    });

    it('should produce identical RNG sequences for the same seed', () => {
      const state1 = createTestState('rngTest');
      const state2 = createTestState('rngTest');

      const seq1 = Array.from({ length: 10 }, () => state1.rng());
      const seq2 = Array.from({ length: 10 }, () => state2.rng());

      expect(seq1).toEqual(seq2);
    });

    it('should produce deterministic results across multiple seeds', () => {
      const seeds = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
      for (const seed of seeds) {
        const s1 = createTestState(seed);
        const s2 = createTestState(seed);
        expect(s1.market.business.map(c => c.id)).toEqual(
          s2.market.business.map(c => c.id),
        );
      }
    });
  });

  describe('card integrity', () => {
    it('should have all market + deck cards equal total deck size (business)', () => {
      const state = createTestState();
      const total = state.market.business.length + state.decks.business.length;
      expect(total).toBe(15); // 5 templates * 3 copies
    });

    it('should have all market + deck cards equal total deck size (event)', () => {
      const state = createTestState();
      const total = state.market.event.length + state.decks.event.length;
      expect(total).toBe(9); // 3 templates * 3 copies
    });

    it('should have all market + deck cards equal total deck size (upgrade)', () => {
      const state = createTestState();
      const total = state.market.upgrade.length + state.decks.upgrade.length;
      expect(total).toBe(6); // 3 templates * 2 copies
    });

    it('should have all unique card IDs across market and decks', () => {
      const state = createTestState();
      const allIds = [
        ...state.market.business.map(c => c.id),
        ...state.market.event.map(c => c.id),
        ...state.market.upgrade.map(c => c.id),
        ...state.decks.business.map(c => c.id),
        ...state.decks.event.map(c => c.id),
        ...state.decks.upgrade.map(c => c.id),
      ];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });

    it('should have business cards with valid synergy types', () => {
      const deck = createBusinessDeck(1);
      const validTypes = new Set(['Food', 'Culture', 'Commerce']);
      for (const card of deck) {
        expect(card.synergyTypes.length).toBeGreaterThan(0);
        for (const st of card.synergyTypes) {
          expect(validTypes.has(st)).toBe(true);
        }
      }
    });

    it('should have event cards with valid triggers', () => {
      const deck = createEventDeck(1);
      const validTriggers = new Set(['Day', 'Night']);
      for (const card of deck) {
        expect(validTriggers.has(card.trigger)).toBe(true);
      }
    });

    it('should have upgrade cards that reference valid business names', () => {
      const businesses = createBusinessDeck(1);
      const businessNames = new Set(businesses.map(b => b.name));
      const upgrades = createUpgradeDeck(1);
      for (const upg of upgrades) {
        expect(businessNames.has(upg.targetBusiness)).toBe(true);
      }
    });
  });
});
