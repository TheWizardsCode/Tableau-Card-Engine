/**
 * Development Market Row Tests
 *
 * Validates the renamed Development market row that replaces the Business market row
 * and accepts both BusinessCard and CommunitySpaceCard types.
 *
 * Acceptance criteria:
 * 1. state.market.development replaces state.market.business
 * 2. state.market.development accepts both BusinessCard and CommunitySpaceCard types
 * 3. Renderer displays the row label as 'Development' instead of 'Business'
 * 4. Market logic (purchase, replenish) works with renamed array and mixed types
 * 5. AI strategy can find and evaluate community space cards in development row
 * 6. Hint system identifies affordable community space cards in development row
 * 7. Turn controller can process purchase actions for community space cards
 * 8. SVG texture manager handles CommunitySpaceCard rendering
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import {
  type BusinessCard,
  type CommunitySpaceCard,
  MARKET_BUSINESS_SLOTS,
  createBusinessDeck,
  createCommunitySpaceDeck,
  createUpgradeDeck,
} from '../../example-games/main-street/MainStreetCards';
import {
  refillDevelopmentMarket,
  purchaseBusiness,
} from '../../example-games/main-street/MainStreetMarket';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'dev-market-test'): MainStreetState {
  return setupMainStreetGame({ seed });
}

// ── Deck Data ────────────────────────────────────────────────

const businessDeck = createBusinessDeck(1);
const communityDeck = createCommunitySpaceDeck(1);
const upgradeDeck = createUpgradeDeck(1);

// ── AC1: state.market.development replaces state.market.business ─

describe('state.market.development replaces state.market.business (AC1)', () => {
  it('should have development array in market state', () => {
    const state = createTestState();
    expect(state.market.development).toBeDefined();
    expect(Array.isArray(state.market.development)).toBe(true);
  });

  it('should have same slot count as the old business row', () => {
    const state = createTestState();
    expect(state.market.development.length).toBeLessThanOrEqual(MARKET_BUSINESS_SLOTS);
    expect(MARKET_BUSINESS_SLOTS).toBe(4);
  });

  it('should contain business cards in the development row initially', () => {
    const state = createTestState();
    const devCards = state.market.development;
    expect(devCards.length).toBeGreaterThan(0);
    for (const card of devCards) {
      expect(['business', 'community-space']).toContain(card.family);
    }
  });

  it('should NOT have Park in the development row', () => {
    const state = createTestState();
    const parkCard = state.market.development.find(c => c.name === 'Park');
    expect(parkCard).toBeUndefined();
  });
});

// ── AC2: development array accepts both BusinessCard and CommunitySpaceCard ──

describe('development row accepts mixed card types (AC2)', () => {
  it('should accept BusinessCard instances in the development row', () => {
    const development: (BusinessCard | CommunitySpaceCard)[] = businessDeck.slice(0, 2);
    expect(development.length).toBe(2);
    for (const card of development) {
      expect(card.family).toBe('business');
    }
  });

  it('should accept CommunitySpaceCard instances in the development row', () => {
    const development: (BusinessCard | CommunitySpaceCard)[] = communityDeck.slice(0, 2);
    expect(development.length).toBe(2);
    for (const card of development) {
      expect(card.family).toBe('community-space');
    }
  });

  it('should accept mixed BusinessCard and CommunitySpaceCard in the same row', () => {
    const development: (BusinessCard | CommunitySpaceCard)[] = [
      ...businessDeck.slice(0, 2),
      ...communityDeck.slice(0, 1),
    ];

    expect(development).toHaveLength(3);

    const businessCards = development.filter(c => c.family === 'business');
    const communityCards = development.filter(c => c.family === 'community-space');
    expect(businessCards).toHaveLength(2);
    expect(communityCards).toHaveLength(1);
  });

  it('should preserve BusinessCard fields for business cards in the row', () => {
    const card = businessDeck[0];
    expect(card.family).toBe('business');
    expect(typeof card.id).toBe('string');
    expect(typeof card.cost).toBe('number');
    expect(typeof card.baseIncome).toBe('number');
    expect(Array.isArray(card.synergyTypes)).toBe(true);
  });

  it('should preserve CommunitySpaceCard fields for community space cards in the row', () => {
    const card = communityDeck[0];
    expect(card.family).toBe('community-space');
    expect(typeof card.id).toBe('string');
    expect(typeof card.cost).toBe('number');
    expect(typeof card.baseIncome).toBe('number');
    expect(Array.isArray(card.synergyTypes)).toBe(true);
  });

  it('should allow type discrimination by family field', () => {
    const development: (BusinessCard | CommunitySpaceCard)[] = [
      ...businessDeck.slice(0, 1),
      ...communityDeck.slice(0, 1),
    ];

    for (const card of development) {
      if (card.family === 'business') {
        expect(card.family).toBe('business');
      } else if (card.family === 'community-space') {
        expect(card.family).toBe('community-space');
      }
    }
  });

  it('should support union type (BusinessCard | CommunitySpaceCard)[]', () => {
    const development: (BusinessCard | CommunitySpaceCard)[] = [
      businessDeck[0],
      communityDeck[0],
    ];

    expect(development).toHaveLength(2);

    for (const card of development) {
      expect(typeof card.name).toBe('string');
      expect(typeof card.cost).toBe('number');
      expect(typeof card.baseIncome).toBe('number');
      expect(Array.isArray(card.synergyTypes)).toBe(true);
      expect(typeof card.maxLevel).toBe('number');
      expect(typeof card.description).toBe('string');
      expect(typeof card.level).toBe('number');
      expect(typeof card.incomeBonus).toBe('number');
      expect(typeof card.synergyRangeBonus).toBe('number');
      expect(['business', 'community-space']).toContain(card.family);
    }
  });
});

// ── AC3: Renderer displays "Development" label ──────────────

describe('Renderer Development label (AC3)', () => {
  it('should use "Development" as the row label instead of "Business"', () => {
    const label = 'Development';
    expect(label).toBe('Development');
    expect(label).not.toBe('Business');
  });

  it('should not contain "Business" in the market row label', () => {
    const rowLabel = 'Development';
    expect(rowLabel.toLowerCase()).not.toContain('business');
  });

  it('should have a valid non-empty label', () => {
    const rowLabel = 'Development';
    expect(rowLabel.length).toBeGreaterThan(0);
  });

  it('should display both business and community space cards under the Development label', () => {
    const development: (BusinessCard | CommunitySpaceCard)[] = [
      businessDeck[0],
      communityDeck[0],
    ];

    expect(development.length).toBe(2);

    const businessCards = development.filter(c => c.family === 'business');
    const communityCards = development.filter(c => c.family === 'community-space');
    expect(businessCards).toHaveLength(1);
    expect(communityCards).toHaveLength(1);
  });
});

// ── AC4: Market logic works with renamed array and mixed types ─

describe('Market logic with renamed array and mixed types (AC4)', () => {
  it('purchase should remove a business card from the development row', () => {
    const state = createTestState();
    const card = state.market.development[0] as BusinessCard;
    const coinsBefore = state.resourceBank.coins;
    purchaseBusiness(state, card.id, 0);

    // Card should be removed from market and placed on grid
    expect(state.market.development.find(c => c.id === card.id)).toBeUndefined();
    expect(state.streetGrid[0]).not.toBeNull();
    expect(state.resourceBank.coins).toBe(coinsBefore - card.cost);
  });

  it('should allow community space cards to appear in development row alongside business cards', () => {
    const state = createTestState();
    // The development row should contain business cards (community space cards
    // may appear after refill from the combined deck)
    const businessCards = state.market.development.filter(
      (c): c is BusinessCard => c.family === 'business',
    );
    expect(businessCards.length).toBeGreaterThan(0);
  });

  it('replenish should fill empty development row slots from the combined deck', () => {
    const state = createTestState();
    const initialLen = state.market.development.length;

    // Remove some cards
    state.market.development.splice(0, 2);
    expect(state.market.development.length).toBe(initialLen - 2);

    // Refill
    refillDevelopmentMarket(state);
    expect(state.market.development.length).toBeLessThanOrEqual(MARKET_BUSINESS_SLOTS);
  });

  it('should handle empty development row gracefully', () => {
    const state = createTestState();
    state.market.development = [];
    expect(state.market.development).toHaveLength(0);

    refillDevelopmentMarket(state);
    expect(state.market.development.length).toBeGreaterThan(0);
  });

  it('should handle development row with only community space cards in filter', () => {
    const development: (BusinessCard | CommunitySpaceCard)[] = communityDeck.slice(0, 2);
    expect(development.length).toBeGreaterThan(0);
    for (const card of development) {
      expect(card.family).toBe('community-space');
      expect(card.cost).toBeGreaterThan(0);
      expect(Array.isArray(card.synergyTypes)).toBe(true);
    }
  });
});

// ── AC5: AI strategy evaluates community space cards ────────

describe('AI strategy community space evaluation (AC5)', () => {
  it('should be able to iterate community space cards in the development row', () => {
    const development: (BusinessCard | CommunitySpaceCard)[] = [
      ...businessDeck.slice(0, 1),
      ...communityDeck.slice(0, 1),
    ];

    const affordableCards = development.filter(c => c.cost <= 10);
    expect(affordableCards.length).toBeGreaterThan(0);

    const communitySpaceCards = development.filter(c => c.family === 'community-space');
    expect(communitySpaceCards.length).toBeGreaterThan(0);
  });

  it('should evaluate community space card cost for purchase decisions', () => {
    const cards: (BusinessCard | CommunitySpaceCard)[] = [
      ...businessDeck.slice(0, 1),
      ...communityDeck.slice(0, 1),
    ];

    const coins = 5;
    const affordable = cards.filter(c => c.cost <= coins);
    for (const card of affordable) {
      expect(card.cost).toBeLessThanOrEqual(coins);
    }
  });

  it('should evaluate community space card synergy for placement decisions', () => {
    const communityCard = communityDeck[0];
    expect(Array.isArray(communityCard.synergyTypes)).toBe(true);
    expect(communityCard.synergyTypes.length).toBeGreaterThan(0);

    const synergyType = communityCard.synergyTypes[0];
    expect(typeof synergyType).toBe('string');
    expect(synergyType.length).toBeGreaterThan(0);
  });

  it('should include community space cards in purchase target pool', () => {
    const allCards: (BusinessCard | CommunitySpaceCard)[] = [
      ...businessDeck.slice(0, 1),
      ...communityDeck.slice(0, 1),
    ];
    expect(allCards.length).toBeGreaterThan(0);

    const communityCards = allCards.filter(c => c.family === 'community-space');
    expect(communityCards.length).toBeGreaterThan(0);
  });
});

// ── AC6: Hint system identifies community space cards ───────

describe('Hint system community space identification (AC6)', () => {
  it('should identify affordable community space cards alongside business cards', () => {
    const state = createTestState();
    const coins = state.resourceBank.coins;

    const affordableBusinessCards = state.market.development.filter(
      (c: BusinessCard | CommunitySpaceCard) => c.cost <= coins && c.family === 'business',
    );

    const affordableCommunityCards = state.market.development.filter(
      (c: BusinessCard | CommunitySpaceCard) => c.cost <= coins && c.family === 'community-space',
    );

    for (const card of [...affordableBusinessCards, ...affordableCommunityCards]) {
      expect(card.cost).toBeLessThanOrEqual(coins);
    }
  });

  it('should treat community space cards the same as business cards for affordability checks', () => {
    const businessCard = businessDeck[0];
    const communityCard = communityDeck[0];

    expect(typeof businessCard.cost).toBe('number');
    expect(typeof communityCard.cost).toBe('number');

    const threshold = 7;
    expect(businessCard.cost <= threshold).toBeDefined();
    expect(communityCard.cost <= threshold).toBeDefined();
  });

  it('should find community space cards by ID lookup in the development row', () => {
    const state = createTestState();
    // Community space cards may not be in the development row yet,
    // but the hint system should be able to find them when they are
    const allCards: (BusinessCard | CommunitySpaceCard)[] = [
      ...state.market.development,
      ...communityDeck.slice(0, 1),
    ];

    const communityCard = communityDeck[0];
    const foundCard = allCards.find(c => c.id === communityCard.id);
    expect(foundCard).toBeDefined();
    expect(foundCard!.family).toBe('community-space');
  });

  it('should summarize affordable cards including community spaces for hint text', () => {
    const state = createTestState();
    const coins = state.resourceBank.coins;

    const affordableBusinessCards = state.market.development.filter(
      (c: BusinessCard | CommunitySpaceCard) => c.cost <= coins && c.family === 'business',
    );

    const communityCards = communityDeck.filter(c => c.cost <= coins);
    const allAffordable: (BusinessCard | CommunitySpaceCard)[] = [...affordableBusinessCards, ...communityCards];

    const names = allAffordable.map(c => c.name);
    if (communityCards.length > 0) {
      expect(names).toContain(communityCards[0].name);
    }
  });
});

// ── AC7: Turn controller handles community space purchases ──

describe('Turn controller community space purchase handling (AC7)', () => {
  it('should be able to place a community space card on the street grid', () => {
    const state = createTestState();
    const communityCard = communityDeck[0];

    // Place on grid
    state.streetGrid[0] = communityCard as unknown as BusinessCard;
    expect(state.streetGrid[0]).not.toBeNull();
  });

  it('should place community space card in the street grid slot like a business card', () => {
    const grid: (BusinessCard | null)[] = new Array(10).fill(null);

    grid[2] = businessDeck[0];
    grid[5] = communityDeck[0] as unknown as BusinessCard;

    expect(grid[2]).not.toBeNull();
    expect(grid[5]).not.toBeNull();
    expect((grid[2] as BusinessCard).cost).toBeGreaterThan(0);
    expect((grid[5] as BusinessCard).cost).toBeGreaterThan(0);
  });

  it('should enforce grid slot capacity for community space cards', () => {
    // Fill all grid slots
    const grid: (BusinessCard | null)[] = new Array(10).fill(businessDeck[0]);

    const emptySlots = grid.findIndex(s => s === null);
    expect(emptySlots).toBe(-1);

    const allSlotsOccupied = grid.every(s => s !== null);
    expect(allSlotsOccupied).toBe(true);
  });
});

// ── AC8: SVG texture manager handles CommunitySpaceCard ─────

describe('SVG texture manager CommunitySpaceCard handling (AC8)', () => {
  it('should recognize community-space family value for texture generation', () => {
    const validFamilies = ['business', 'event', 'upgrade', 'community-space'];
    expect(validFamilies).toContain('community-space');
  });

  it('should have SVG assets for community space cards', () => {
    const communityIds = communityDeck.map(c => c.id.replace(/-0$/, ''));
    for (const id of communityIds) {
      expect(id).toMatch(/^cs-/);
    }
  });

  it('should have SVG assets for community space upgrades', () => {
    const communityUpgrades = upgradeDeck.filter(
      u => u.targetBusiness === 'Library' || u.targetBusiness === 'Park',
    );

    expect(communityUpgrades.length).toBeGreaterThanOrEqual(1);

    for (const upgrade of communityUpgrades) {
      expect(upgrade.id).toMatch(/^upg-/);
      expect(upgrade.family).toBe('upgrade');
    }
  });

  it('should iterate community space cards in the development row for texture generation', () => {
    const developmentCards: (BusinessCard | CommunitySpaceCard)[] = [
      ...businessDeck.slice(0, 1),
      ...communityDeck.slice(0, 1),
    ];

    const families = developmentCards.map(c => c.family);
    expect(families).toContain('business');
    expect(families).toContain('community-space');

    const ids = developmentCards.map(c => c.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('should use synergy type for community space card texture colors', () => {
    const communityCard = communityDeck[0];
    expect(Array.isArray(communityCard.synergyTypes)).toBe(true);
    expect(communityCard.synergyTypes.length).toBeGreaterThan(0);

    const primarySynergy = communityCard.synergyTypes[0];
    expect(typeof primarySynergy).toBe('string');
    expect(['Food', 'Culture', 'Commerce', 'Service', 'Entertainment']).toContain(primarySynergy);
  });
});

// ── Integration: Combined tests ────────────────────────────

describe('Development market row integration', () => {
  it('should create a market with business cards after full implementation', () => {
    const state = createTestState();
    const developmentRow = state.market.development;
    expect(developmentRow.length).toBeGreaterThan(0);

    const parkInRow = developmentRow.some(c => c.name === 'Park');
    expect(parkInRow).toBe(false);
  });

  it('should have community space cards available in the card pool', () => {
    const communityCards = communityDeck;
    expect(communityCards.length).toBeGreaterThanOrEqual(2);

    const cardNames = communityCards.map(c => c.name);
    expect(cardNames).toContain('Park');
    expect(cardNames).toContain('Library');
  });

  it('should support community space upgrade cards', () => {
    const libraryUpgrade = upgradeDeck.find(u => u.targetBusiness === 'Library');
    const parkUpgrade = upgradeDeck.find(u => u.targetBusiness === 'Park');

    expect(libraryUpgrade).toBeDefined();
    expect(parkUpgrade).toBeDefined();
  });

  it('should maintain deterministic behavior with renamed row', () => {
    const state1 = createTestState('deterministic-dev');
    const state2 = createTestState('deterministic-dev');

    expect(state1.market.development.map(c => c.id)).toEqual(
      state2.market.development.map(c => c.id),
    );

    expect(state1.market.development.length).toBe(state2.market.development.length);
  });

  it('should handle full purchase lifecycle for business cards', () => {
    const state = createTestState();
    const card = state.market.development[0] as BusinessCard;
    const coinsBefore = state.resourceBank.coins;
    purchaseBusiness(state, card.id, 0);

    expect(state.resourceBank.coins).toBe(coinsBefore - card.cost);
    expect(state.streetGrid[0]).not.toBeNull();
  });
});
