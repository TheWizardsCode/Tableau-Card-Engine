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
  serializeMainStreetState,
  deserializeMainStreetState,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';

import {
  GRID_SIZE,
  STARTING_COINS,
  STARTING_REPUTATION,
  MARKET_TOTAL_SLOTS,
  INCIDENT_QUEUE_SIZE,
  createBusinessDeck,
  createCommunitySpaceDeck,
  createEventDeck,
  createUpgradeDeck,
} from '../../example-games/main-street/MainStreetCards';
import { createSeededRng } from '../../src/core-engine';

import { DEFAULT_CHALLENGES_PER_RUN } from '../../example-games/main-street/MainStreetChallenges';

// ── Template Counts (M1 + M2 + M3 + Community Spaces) ──────
// Business:  5 (M1) + 12 (M2) - 1 (Park moved to community-space) = 16 templates
// Event:     5 (M1) + 12 (M2) + 18 (M3) + 1 (Evt Recession) = 36 templates  (actual array length: 37)
// Upgrade:   3 (M1) + 14 (M2) + 4 branching + 4 level-2 + 1 (Community Hub) = 26 templates
// Community: 2 (Park, Library) = 2 templates
const BUSINESS_TEMPLATE_COUNT = 30;
const EVENT_TEMPLATE_COUNT = 56; // +1 Graffiti Art (CG-0MSRC9UR9006FBXC)
const UPGRADE_TEMPLATE_COUNT = 39;
const DEFAULT_BUSINESS_COPIES = 3;
const DEFAULT_EVENT_COPIES = 3;
const DEFAULT_UPGRADE_COPIES = 2;

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'test42'): MainStreetState {
  return setupMainStreetGame({ seed });
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreetCards', () => {
  describe('createBusinessDeck', () => {
    it('should create correct number of cards from templates and copies', () => {
      const deck = createBusinessDeck(DEFAULT_BUSINESS_COPIES);
      expect(deck).toHaveLength(BUSINESS_TEMPLATE_COUNT * DEFAULT_BUSINESS_COPIES);
    });

    it('should create cards with correct family', () => {
      const deck = createBusinessDeck(1);
      for (const card of deck) {
        expect(card.family).toBe('business');
      }
    });

    it('should create cards with unique IDs per copy', () => {
      const deck = createBusinessDeck(DEFAULT_BUSINESS_COPIES);
      const ids = deck.map(c => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(BUSINESS_TEMPLATE_COUNT * DEFAULT_BUSINESS_COPIES);
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
    it('should create correct number of cards from templates and copies', () => {
      const deck = createEventDeck(DEFAULT_EVENT_COPIES, undefined, createSeededRng(42));
      expect(deck).toHaveLength(EVENT_TEMPLATE_COUNT * DEFAULT_EVENT_COPIES);
    });

    it('should create cards with correct family', () => {
      const deck = createEventDeck(1, undefined, createSeededRng(42));
      for (const card of deck) {
        expect(card.family).toBe('event');
      }
    });
  });

  describe('createUpgradeDeck', () => {
    it('should create correct number of cards from templates and copies', () => {
      const deck = createUpgradeDeck(DEFAULT_UPGRADE_COPIES);
      expect(deck).toHaveLength(UPGRADE_TEMPLATE_COUNT * DEFAULT_UPGRADE_COPIES);
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
      expect(state.market.cards.length).toBeLessThanOrEqual(MARKET_TOTAL_SLOTS);
      expect(state.market.cards.length).toBeGreaterThan(0);
      expect(state.market.cards.length).toBeLessThanOrEqual(MARKET_TOTAL_SLOTS);
      expect(state.market.cards.length).toBeGreaterThan(0);
    });

    it('should have non-empty decks after market fill', () => {
      const state = createTestState();
      const totalBusiness = BUSINESS_TEMPLATE_COUNT * DEFAULT_BUSINESS_COPIES;
      const totalUpgrade = UPGRADE_TEMPLATE_COUNT * DEFAULT_UPGRADE_COPIES;
      // Business: business-family market cards + deck = total (the single row
      // may also show community-space/upgrade/event cards, CG-0MSTOATDT009BRX2).
      const businessInMarket = state.market.cards.filter(c => c.family === 'business').length;
      expect(state.decks.business.length + businessInMarket).toBe(totalBusiness);
      // Event: total - investment events in market - incident queue = remaining in deck
      const investmentEventsInMarket = state.market.cards.filter(c => c.family === 'event').length;
      const eventAccountedFor = investmentEventsInMarket + state.decks.event.length + state.incidentQueue.length;
      // Account for positiveIncidentMultiplier in runtime preset
      const multiplier = (state.config && 'positiveIncidentMultiplier' in state.config)
        ? state.config.positiveIncidentMultiplier
        : 1;
      expect(eventAccountedFor).toBe(createEventDeck(DEFAULT_EVENT_COPIES, undefined, createSeededRng(42), multiplier).length);
      // Upgrade: total - upgrades in investments row = remaining
      const upgradesInMarket = state.market.cards.filter(c => c.family === 'upgrade').length;
      expect(state.decks.upgrade.length).toBe(totalUpgrade - upgradesInMarket);
    });

    it('should have no challenges completed initially', () => {
      const state = createTestState();
      expect(state.challengesCompleted).toHaveLength(0);
    });

    it('should populate activeChallenges with DEFAULT_CHALLENGES_PER_RUN items', () => {
      const state = createTestState();
      expect(state.activeChallenges).toHaveLength(DEFAULT_CHALLENGES_PER_RUN);
      for (const ac of state.activeChallenges) {
        expect(ac.completed).toBe(false);
        expect(ac.challenge).toBeDefined();
        expect(ac.challenge.id).toBeDefined();
        expect(ac.challenge.title).toBeDefined();
      }
    });

    it('should have no held event initially', () => {
      const state = createTestState();
      expect(state.hand.some(c => c.family === 'event')).toBe(false);
    });

    it('should have incident queue pre-filled with Incident-trigger events', () => {
      const state = createTestState();
      expect(state.incidentQueue.length).toBe(INCIDENT_QUEUE_SIZE);
      for (const card of state.incidentQueue) {
        expect(card.family).toBe('event');
        expect(card.trigger).toBe('Incident');
      }
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
      expect(state1.market.cards.map(c => c.id)).toEqual(
        state2.market.cards.map(c => c.id),
      );
      expect(state1.market.cards.map(c => c.id)).toEqual(
        state2.market.cards.map(c => c.id),
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

      // Incident queue should have same cards in same order
      expect(state1.incidentQueue.map(c => c.id)).toEqual(
        state2.incidentQueue.map(c => c.id),
      );

      // Active challenges should be identical for same seed
      expect(state1.activeChallenges.map(ac => ac.challenge.id)).toEqual(
        state2.activeChallenges.map(ac => ac.challenge.id),
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

    it('should select different activeChallenges for different seeds (statistical)', () => {
      // With 12 templates choosing 3, different seeds should usually produce different sets.
      // Test across several seed pairs to guard against false negatives.
      let diffCount = 0;
      const pairs = [['cA', 'cB'], ['cC', 'cD'], ['cE', 'cF'], ['cG', 'cH']];
      for (const [seedA, seedB] of pairs) {
        const s1 = createTestState(seedA);
        const s2 = createTestState(seedB);
        const ids1 = s1.activeChallenges.map(ac => ac.challenge.id).join(',');
        const ids2 = s2.activeChallenges.map(ac => ac.challenge.id).join(',');
        if (ids1 !== ids2) diffCount++;
      }
      // At least half of the pairs should differ
      expect(diffCount).toBeGreaterThanOrEqual(2);
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
        expect(s1.market.cards.map(c => c.id)).toEqual(
          s2.market.cards.map(c => c.id),
        );
      }
    });
  });

  describe('card integrity', () => {
    it('should have all market + deck cards equal total deck size (business)', () => {
      const state = createTestState();
      const businessInMarket = state.market.cards.filter(c => c.family === 'business').length;
      const total = businessInMarket + state.decks.business.length;
      expect(total).toBe(BUSINESS_TEMPLATE_COUNT * DEFAULT_BUSINESS_COPIES);
    });

    it('should have all market + deck + queue cards equal total deck size (event)', () => {
      const state = createTestState();
      const investmentEventsInMarket = state.market.cards.filter(c => c.family === 'event').length;
      const total = investmentEventsInMarket + state.decks.event.length + state.incidentQueue.length;
      const multiplier = (state.config && 'positiveIncidentMultiplier' in state.config)
        ? state.config.positiveIncidentMultiplier
        : 1;
      expect(total).toBe(createEventDeck(DEFAULT_EVENT_COPIES, undefined, createSeededRng(42), multiplier).length);
    });

    it('should have all market + deck cards equal total deck size (upgrade)', () => {
      const state = createTestState();
      const upgradesInMarket = state.market.cards.filter(c => c.family === 'upgrade').length;
      const total = upgradesInMarket + state.decks.upgrade.length;
      expect(total).toBe(UPGRADE_TEMPLATE_COUNT * DEFAULT_UPGRADE_COPIES);
    });

    it('should have all unique card IDs across market, decks, and queues', () => {
      const state = createTestState();
      const allIds = [
        ...state.market.cards.map(c => c.id),
        ...state.decks.business.map(c => c.id),
        ...state.decks.communitySpace.map(c => c.id),
        ...state.decks.event.map(c => c.id),
        ...state.decks.upgrade.map(c => c.id),
        ...state.incidentQueue.map(c => c.id),
      ];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });

    it('should have business cards with valid synergy types', () => {
      const deck = createBusinessDeck(1);
      const validTypes = new Set(['Food', 'Culture', 'Commerce', 'Service', 'Entertainment', 'Health']);
      for (const card of deck) {
        expect(card.synergyTypes.length).toBeGreaterThan(0);
        for (const st of card.synergyTypes) {
          expect(validTypes.has(st)).toBe(true);
        }
      }
    });

    it('should have event cards with valid triggers', () => {
      const deck = createEventDeck(1, undefined, createSeededRng(42));
      const validTriggers = new Set(['Investment', 'Incident']);
      for (const card of deck) {
        expect(validTriggers.has(card.trigger)).toBe(true);
      }
    });

    it('should have upgrade cards that reference valid business or community space names', () => {
      const businesses = createBusinessDeck(1);
      const communitySpaces = createCommunitySpaceDeck(1);
      const allNames = new Set([...businesses.map(b => b.name), ...communitySpaces.map(cs => cs.name)]);
      const upgrades = createUpgradeDeck(1);
      for (const upg of upgrades) {
        expect(allNames.has(upg.targetBusiness), `${upg.id} targets "${upg.targetBusiness}" which is not a known card name`).toBe(true);
      }
    });
  });

  describe('Legacy heldEvent migration (CG-0MSKU0BE5003I2ZD)', () => {
    it('folds a legacy heldEvent into the merged hand on deserialize', () => {
      const state = setupMainStreetGame({ seed: 'migration-held-event' });
      // Simulate a legacy save that still carries the heldEvent field
      const legacyEvent = {
        family: 'event',
        id: 'evt-legacy-held',
        name: 'Legacy Held Event',
        trigger: 'Investment',
        cost: 3,
        effect: 'test',
        target: 'All',
        coinDelta: 2,
        reputationDelta: 0,
      };
      const serialized = serializeMainStreetState(state) as unknown as Record<string, unknown>;
      serialized.heldEvent = legacyEvent;

      const restored = deserializeMainStreetState(serialized as any);

      // The event must land in the hand and the heldEvent field must be gone
      expect((restored as any).heldEvent).toBeUndefined();
      expect(restored.hand.some(c => c.family === 'event' && c.id === 'evt-legacy-held')).toBe(true);
    });

    it('leaves hand untouched when legacy heldEvent is null', () => {
      const state = setupMainStreetGame({ seed: 'migration-held-null' });
      state.hand = [];
      const serialized = serializeMainStreetState(state) as unknown as Record<string, unknown>;
      serialized.heldEvent = null;

      const restored = deserializeMainStreetState(serialized as any);
      expect((restored as any).heldEvent).toBeUndefined();
      expect(restored.hand.some(c => c.family === 'event')).toBe(false);
    });
  });
});
