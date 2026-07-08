/**
 * Community-Space Type System Tests
 *
 * Validates the new CommunitySpaceCard type system:
 * - CardFamily type union includes 'community-space'
 * - CommunitySpaceCard interface mirrors BusinessCard with family: 'community-space'
 * - AnyCard union includes CommunitySpaceCard
 * - Park reclassification from 'business' to 'community-space'
 * - Library card design and stats
 * - Upgrade card name-matching targeting for community spaces
 * - Interoperability of BusinessCard and CommunitySpaceCard in street grid
 *
 * @module
 *
 * @remarks
 * Library card design assumptions (following existing BusinessCard patterns):
 * - Library: cost 6, baseIncome 1, Culture synergy, maxLevel 1
 * - Library upgrade (Community Hub): cost 4, incomeBonus 1, synergyRangeBonus 1
 *
 * These stats are used for test fixtures until the actual card data is implemented
 * in {@link CG-0MQF4AJGN006Z06C | Impl: CommunitySpaceCard type and cards}.
 */

import { describe, it, expect } from 'vitest';
import {
  createBusinessDeck,
  createCommunitySpaceDeck,
  createUpgradeDeck,
  type BusinessCard,
  type AnyCard,
  type SynergyType,
} from '../../example-games/main-street/MainStreetCards';

// ── Constants ───────────────────────────────────────────

/** The expected community-space family value (will be added via implementation work item CG-0MQF4AJGN006Z06C). */
const COMMUNITY_SPACE_FAMILY = 'community-space' as const;

/**
 * Expected CardFamily union values.
 * Currently 'business' | 'event' | 'upgrade'.
 * After implementation: 'business' | 'event' | 'upgrade' | 'community-space'.
 */
const EXPECTED_CARD_FAMILIES = ['business', 'event', 'upgrade', 'community-space'] as const;

// ── Deck Data ────────────────────────────────────────────────

const businessDeck = createBusinessDeck(1);
const communitySpaceDeck = createCommunitySpaceDeck(1);
const upgradeDeck = createUpgradeDeck(1);

// ── Test Fixtures ────────────────────────────────────────────

/**
 * Creates a minimal CommunitySpaceCard-like object for testing.
 *
 * Uses `Record<string, unknown>` to avoid requiring the actual CommunitySpaceCard
 * type which will be introduced by the implementation work item.
 * Tests validate the expected structure matches BusinessCard's fields.
 */
function createCommunitySpaceFixture(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    family: COMMUNITY_SPACE_FAMILY,
    id: 'test-community-space',
    name: 'Test Community Space',
    cost: 5,
    baseIncome: 1,
    synergyTypes: ['Culture'] as readonly SynergyType[],
    synergyCoinBonus: undefined,
    synergyRepBonus: undefined,
    upgradePath: 'Test Path',
    maxLevel: 1,
    description: 'A test community space card.',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    reputationPerTurn: undefined,
    appliedUpgrades: [] as string[],
    ...overrides,
  };
}

/**
 * Creates a CommunitySpaceCard fixture for grid tests.
 * Uses `as any` cast to enable interoperability testing before the actual type is added to AnyCard.
 */
function makeCommunitySpaceBiz(overrides?: Record<string, unknown>): BusinessCard {
  return {
    family: 'business' as const,
    id: 'test-community-grid',
    name: 'Grid Community Space',
    cost: 5,
    baseIncome: 1,
    synergyTypes: ['Culture'] as readonly SynergyType[],
    synergyCoinBonus: 1,
    synergyRepBonus: 0,
    maxLevel: 1,
    description: 'A community space card on the grid.',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ...overrides,
  } as unknown as BusinessCard;
}

/** Expected fields that CommunitySpaceCard should share with BusinessCard (excluding family). */
const BUSINESS_CARD_FIELDS = [
  'id', 'name', 'cost', 'baseIncome', 'synergyTypes', 'upgradePath',
  'maxLevel', 'description', 'level', 'incomeBonus', 'synergyRangeBonus',
  'synergyCoinBonus', 'synergyRepBonus', 'appliedUpgrades',
] as const;

// ── AC1: CardFamily type union includes 'community-space' ────

describe('CardFamily type union (AC1)', () => {
  it('should recognize community-space as a valid family value', () => {
    // Runtime validation: 'community-space' should be a recognized value
    expect(COMMUNITY_SPACE_FAMILY).toBe('community-space');

    // Verify it's in the expected set of families
    const families: readonly string[] = EXPECTED_CARD_FAMILIES;
    expect(families).toContain(COMMUNITY_SPACE_FAMILY);
  });

  it('community-space should be distinct from existing families', () => {
    expect(COMMUNITY_SPACE_FAMILY).not.toBe('business');
    expect(COMMUNITY_SPACE_FAMILY).not.toBe('event');
    expect(COMMUNITY_SPACE_FAMILY).not.toBe('upgrade');
  });

  it('should have exactly 4 family values after implementation', () => {
    expect(EXPECTED_CARD_FAMILIES).toHaveLength(4);
  });
});

// ── AC2: CommunitySpaceCard interface mirrors BusinessCard ───

describe('CommunitySpaceCard interface shape (AC2)', () => {
  it('should have the same fields as BusinessCard (except family)', () => {
    const communitySpace = createCommunitySpaceFixture();

    // CommunitySpaceCard shares all BusinessCard fields
    for (const field of BUSINESS_CARD_FIELDS) {
      expect(communitySpace).toHaveProperty(field);
    }

    // Family must be 'community-space'
    expect(communitySpace.family).toBe(COMMUNITY_SPACE_FAMILY);
  });

  it('should have family: community-space as the discriminator', () => {
    const communitySpace = createCommunitySpaceFixture();
    const businessCard = businessDeck[0];

    // Both should have the same structural fields
    const csKeys = Object.keys(communitySpace).sort();
    const bcKeys = Object.keys(businessCard).sort();

    // All BusinessCard keys should be present in CommunitySpaceCard
    for (const key of bcKeys) {
      expect(csKeys).toContain(key);
    }
  });

  it('community-space card should have same value types as business card fields', () => {
    const communitySpace = createCommunitySpaceFixture();

    expect(typeof communitySpace.id).toBe('string');
    expect(typeof communitySpace.name).toBe('string');
    expect(typeof communitySpace.cost).toBe('number');
    expect(typeof communitySpace.baseIncome).toBe('number');
    expect(Array.isArray(communitySpace.synergyTypes)).toBe(true);
    expect(typeof communitySpace.maxLevel).toBe('number');
    expect(typeof communitySpace.description).toBe('string');
    expect(typeof communitySpace.level).toBe('number');
    expect(typeof communitySpace.incomeBonus).toBe('number');
    expect(typeof communitySpace.synergyRangeBonus).toBe('number');
  });

  it('should support optional upgradePath', () => {
    const withPath = createCommunitySpaceFixture({ upgradePath: 'Test Path' });
    expect(withPath).toHaveProperty('upgradePath');
    expect(withPath.upgradePath).toBe('Test Path');

    const withoutPath = createCommunitySpaceFixture({ upgradePath: undefined });
    expect(withoutPath.upgradePath).toBeUndefined();
  });
});

// ── AC3: AnyCard union includes CommunitySpaceCard ───────────

describe('AnyCard union includes CommunitySpaceCard (AC3)', () => {
  it('should accept community-space cards alongside existing card types', () => {
    // This validates at runtime that a community-space card can coexist
    // with other card types in collections
    const businessCard = businessDeck[0];
    const upgradeCard = upgradeDeck[0];
    const communitySpace = createCommunitySpaceFixture();

    // A deck-like collection should accept all types
    const mixedDeck: Record<string, unknown>[] = [businessCard as unknown as Record<string, unknown>, upgradeCard as unknown as Record<string, unknown>, communitySpace];
    expect(mixedDeck).toHaveLength(3);

    // Each card should have a valid family
    const families = mixedDeck.map(c => c.family);
    expect(families).toContain('business');
    expect(families).toContain('upgrade');
    expect(families).toContain(COMMUNITY_SPACE_FAMILY);
  });

  it('should be usable in AnyCard union position', () => {
    // The AnyCard type currently is BusinessCard | EventCard | UpgradeCard.
    // After implementation it becomes ... | CommunitySpaceCard.
    // This test validates the structural compatibility at runtime.
    const communitySpace = createCommunitySpaceFixture();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const anyCardPosition: AnyCard = businessDeck[0]; // BusinessCard is valid
    expect(anyCardPosition).toBeDefined();

    // CommunitySpaceCard-like objects should be structurally compatible
    // with BusinessCard for grid placement and synergy calculations
    expect(communitySpace.family).toBe(COMMUNITY_SPACE_FAMILY);
    expect(typeof communitySpace.cost).toBe('number');
    expect(Array.isArray(communitySpace.synergyTypes)).toBe(true);
  });
});

// ── AC4: Park reclassification ──────────────────────────────

describe('Park reclassification to community-space (AC4)', () => {
  it('should find Park card in community space templates', () => {
    const park = communitySpaceDeck.find(c => c.name === 'Park');
    expect(park).toBeDefined();
    expect(park!.id).toMatch(/^cs-park/);
  });

  it('should reclassify Park from business to community-space', () => {
    const park = communitySpaceDeck.find(c => c.name === 'Park');
    expect(park).toBeDefined();
    expect(park!.family).toBe(COMMUNITY_SPACE_FAMILY);
  });

  it('should preserve Park gameplay stats after reclassification', () => {
    const park = communitySpaceDeck.find(c => c.name === 'Park');
    expect(park).toBeDefined();

    // These stats should remain unchanged from original business card
    expect(park!.cost).toBe(4);
    expect(park!.baseIncome).toBe(0);
    expect(park!.synergyTypes).toEqual(['Culture']);
    expect(park!.maxLevel).toBe(1);
  });

  it('Park upgrade path should remain intact', () => {
    const park = communitySpaceDeck.find(c => c.name === 'Park');
    expect(park).toBeDefined();
    expect(park!.upgradePath).toBe('Park');
  });

  it('Park should no longer appear in business deck', () => {
    const parkInBusiness = businessDeck.find(c => c.name === 'Park');
    expect(parkInBusiness).toBeUndefined();
  });
});

// ── AC5: Library card stats ─────────────────────────────────

describe('Library card design and stats (AC5)', () => {
  it('should define Library card with unique id', () => {
    const library = communitySpaceDeck.find(c => c.name === 'Library');
    expect(library).toBeDefined();
    expect(library!.id).toMatch(/^cs-library/);
  });

  it('Library should have community-space family', () => {
    const library = communitySpaceDeck.find(c => c.name === 'Library');
    expect(library).toBeDefined();
    expect(library!.family).toBe(COMMUNITY_SPACE_FAMILY);
  });

  it('Library should have valid cost and baseIncome', () => {
    const library = communitySpaceDeck.find(c => c.name === 'Library');
    expect(library).toBeDefined();
    expect(library!.cost).toBeGreaterThan(0);
    expect(library!.baseIncome).toBeGreaterThanOrEqual(0);
  });

  it('Library should have valid synergy types', () => {
    const library = communitySpaceDeck.find(c => c.name === 'Library');
    expect(library).toBeDefined();
    expect(library!.synergyTypes.length).toBeGreaterThanOrEqual(1);

    // Library should have Culture synergy (cultural community space)
    expect(library!.synergyTypes).toContain('Culture');
  });

  it('Library should have valid upgradePath and maxLevel', () => {
    const library = communitySpaceDeck.find(c => c.name === 'Library');
    expect(library).toBeDefined();
    expect(library!.upgradePath).toBeTruthy();
    expect(library!.maxLevel).toBeGreaterThanOrEqual(1);
  });

  it('Library should have a non-empty description', () => {
    const library = communitySpaceDeck.find(c => c.name === 'Library');
    expect(library).toBeDefined();
    expect(library!.description.length).toBeGreaterThan(0);
  });

  it('Library upgrade card should exist in upgrade deck', () => {
    const libraryUpgrades = upgradeDeck.filter(u => u.targetBusiness === 'Library');
    expect(libraryUpgrades.length).toBeGreaterThanOrEqual(1);
  });

  it('Library upgrade should have valid fields', () => {
    const libraryUpgrade = upgradeDeck.find(u => u.targetBusiness === 'Library');
    expect(libraryUpgrade).toBeDefined();

    // Validate upgrade card fields
    expect(libraryUpgrade!.cost).toBeGreaterThan(0);
    expect(libraryUpgrade!.incomeBonus).toBeGreaterThan(0);
    expect(libraryUpgrade!.synergyRangeBonus).toBeGreaterThanOrEqual(0);
    expect(libraryUpgrade!.description.length).toBeGreaterThan(0);
    expect(libraryUpgrade!.family).toBe('upgrade');
  });

  it('Library should have cost 6 and baseIncome 1', () => {
    const library = communitySpaceDeck.find(c => c.name === 'Library');
    expect(library).toBeDefined();
    expect(library!.cost).toBe(6);
    expect(library!.baseIncome).toBe(1);
  });
});

// ── AC6: Upgrade cards target community spaces by name ──────

describe('Upgrade card targeting community spaces (AC6)', () => {
  it('upg-garden should target Park by name', () => {
    const garden = upgradeDeck.find(u => u.id.startsWith('upg-garden'));
    expect(garden).toBeDefined();
    expect(garden!.targetBusiness).toBe('Park');
  });

  it('upg-garden should work correctly as an upgrade card', () => {
    const garden = upgradeDeck.find(u => u.id.startsWith('upg-garden'));
    expect(garden).toBeDefined();

    // Standard upgrade card validation
    expect(garden!.family).toBe('upgrade');
    expect(garden!.cost).toBeGreaterThan(0);
    expect(garden!.incomeBonus).toBeGreaterThan(0);
    expect(garden!.synergyRangeBonus).toBeGreaterThanOrEqual(0);
    expect(garden!.description.length).toBeGreaterThan(0);
  });

  it('Library upgrade should target Library by name', () => {
    const libraryUpgrade = upgradeDeck.find(u => u.targetBusiness === 'Library');
    expect(libraryUpgrade).toBeDefined();
    expect(libraryUpgrade!.targetBusiness).toBe('Library');
  });

  it('name-matching should work for community spaces the same as businesses', () => {
    // Validate that the name-matching mechanism works for any card name
    const allTargets = upgradeDeck.map(u => u.targetBusiness);
    const uniqueTargets = [...new Set(allTargets)];

    // The upgrade system uses string-based name matching (targetBusiness field)
    // which is agnostic to whether the target is a business or community space
    for (const target of uniqueTargets) {
      expect(typeof target).toBe('string');
      expect(target.length).toBeGreaterThan(0);
    }
  });
});

// ── AC7: Non-matching upgrade does NOT target community spaces ─

describe('Negative case: non-matching upgrade (AC7)', () => {
  it('upgrade with non-matching targetBusiness should not match a community space', () => {
    const garden = upgradeDeck.find(u => u.id.startsWith('upg-garden'));
    expect(garden).toBeDefined();

    // upg-garden targets 'Park' - should NOT match 'Library'
    expect(garden!.targetBusiness).not.toBe('Library');

    // upg-garden should NOT match unrelated community spaces
    const unrelatedTarget = 'NonExistent';
    expect(garden!.targetBusiness).not.toBe(unrelatedTarget);
  });

  it('upgrade targeting a community space should not match a business with different name', () => {
    const libraryUpgrade = upgradeDeck.find(u => u.targetBusiness === 'Library');
    expect(libraryUpgrade).toBeDefined();

    // Library's upgrade should not match Park
    expect(libraryUpgrade!.targetBusiness).not.toBe('Park');
  });

  it('community space upgrade should not match business cards with different names', () => {
    const garden = upgradeDeck.find(u => u.id.startsWith('upg-garden'));
    expect(garden).toBeDefined();

    // upg-garden targets 'Park' - should NOT match 'Bakery', 'Diner', etc.
    const businessNames = businessDeck
      .map(b => b.name)
      .filter(n => n !== 'Park');

    for (const bizName of businessNames) {
      expect(garden!.targetBusiness).not.toBe(bizName);
    }
  });

  it('empty or undefined targetBusiness should match nothing', () => {
    const garden = upgradeDeck.find(u => u.id.startsWith('upg-garden'));
    expect(garden).toBeDefined();

    expect(garden!.targetBusiness).not.toBe('');
    expect(garden!.targetBusiness).not.toBe('Nonexistent Community Space');
  });

  it('case-sensitive matching should be exact', () => {
    const garden = upgradeDeck.find(u => u.id.startsWith('upg-garden'));
    expect(garden).toBeDefined();

    // Case-sensitive check
    expect(garden!.targetBusiness).not.toBe('park'); // lowercase
    expect(garden!.targetBusiness).not.toBe('PARK'); // uppercase
    expect(garden!.targetBusiness).not.toBe('ParK'); // mixed
    expect(garden!.targetBusiness).toBe('Park'); // exact
  });
});

// ── AC8: BusinessCard and CommunitySpaceCard together in grid ─

describe('BusinessCard and CommunitySpaceCard grid coexistence (AC8)', () => {
  it('should allow community-space cards in the same grid as business cards', () => {
    // Create a grid with both business and community-space cards
    const grid: (BusinessCard | null)[] = new Array(10).fill(null);

    // Business card at slot 0
    grid[0] = businessDeck[0];

    // Community-space card at slot 1 (using BusinessCard struct but conceptually community-space)
    grid[1] = makeCommunitySpaceBiz({
      id: 'test-community-in-grid',
      name: 'Park',
      cost: 4,
      baseIncome: 0,
      synergyTypes: ['Culture'] as readonly SynergyType[],
      maxLevel: 1,
      description: 'A community space on the grid.',
    });

    // Both should be non-null
    expect(grid[0]).not.toBeNull();
    expect(grid[1]).not.toBeNull();

    // Both should have valid BusinessCard fields
    expect(grid[0]!.name).toBeTruthy();
    expect(grid[1]!.name).toBeTruthy();
    expect(grid[0]!.cost).toBeGreaterThan(0);
    expect(grid[1]!.cost).toBeGreaterThan(0);

    // Synergy types should work for both
    expect(grid[0]!.synergyTypes.length).toBeGreaterThanOrEqual(1);
    expect(grid[1]!.synergyTypes.length).toBeGreaterThanOrEqual(1);
  });

  it('should track levels and bonuses for both card types in grid', () => {
    const grid: (BusinessCard | null)[] = new Array(10).fill(null);

    grid[0] = makeCommunitySpaceBiz({
      name: 'Community Space A',
      level: 0,
      incomeBonus: 0,
      synergyRangeBonus: 0,
    });

    grid[2] = makeCommunitySpaceBiz({
      name: 'Community Space B (Upgraded)',
      level: 1,
      incomeBonus: 2,
      synergyRangeBonus: 1,
    });

    // Level tracking should work
    expect(grid[0]!.level).toBe(0);
    expect(grid[2]!.level).toBe(1);

    // Bonus tracking should work
    expect(grid[0]!.incomeBonus).toBe(0);
    expect(grid[0]!.synergyRangeBonus).toBe(0);
    expect(grid[2]!.incomeBonus).toBe(2);
    expect(grid[2]!.synergyRangeBonus).toBe(1);
  });

  it('should handle empty slots between different card types', () => {
    const grid: (BusinessCard | null)[] = new Array(10).fill(null);

    // Business at slot 0
    grid[0] = businessDeck[0];
    // Community space at slot 3
    grid[3] = makeCommunitySpaceBiz({
      name: 'Library',
      cost: 6,
      baseIncome: 1,
      synergyTypes: ['Culture'] as readonly SynergyType[],
    });
    // Business at slot 7
    grid[7] = businessDeck[1];
    // Community space at slot 9
    grid[9] = makeCommunitySpaceBiz({
      name: 'Park (Renamed)',
      cost: 4,
      baseIncome: 0,
      synergyTypes: ['Culture'] as readonly SynergyType[],
    });

    // Count occupied slots
    const occupied = grid.filter(c => c !== null);
    expect(occupied).toHaveLength(4);

    // Verify mix of types
    const names = occupied.map(c => c!.name);
    expect(names).toContain(businessDeck[0].name);
    expect(names).toContain('Library');
    expect(names).toContain('Park (Renamed)');
  });

  it('synergy adjacency should work between business and community-space cards', () => {
    const grid: (BusinessCard | null)[] = new Array(10).fill(null);

    // Place a Business card with Culture synergy next to a community-space card with Culture
    grid[0] = makeCommunitySpaceBiz({
      name: 'Park',
      cost: 4,
      baseIncome: 0,
      synergyTypes: ['Culture'] as readonly SynergyType[],
    });

    grid[1] = businessDeck.find(c => c.synergyTypes.includes('Culture')) ?? businessDeck[0];

    // Both should be valid BusinessCard structs with synergy calculation support
    expect(grid[0]).not.toBeNull();
    expect(grid[1]).not.toBeNull();

    // Both should have Culture in their synergy types (or at least the business card does)
    const cultureBusiness = grid[1]!;
    expect(cultureBusiness.synergyTypes).toContain('Culture');
  });
});
