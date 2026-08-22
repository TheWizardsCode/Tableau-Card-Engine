/**
 * Main Street: Upgrade Overlay Spec Tests (CG-0MT24MHGZ0025O20)
 *
 * Validates that `buildUpgradeOverlaySpec()` returns the correct name overlay
 * text for both base (un-upgraded) and upgraded business/community-space cards.
 *
 * Acceptance criteria:
 *   AC1  Upgraded cards display the upgraded name (not the base name).
 *   AC2  The upgraded name is derived from the BusinessCard's `displayName`
 *        field, which is populated when upgrades are applied.
 *   AC3  Multi-level upgrades show the name from the most recently applied upgrade.
 *   AC4  Base (un-upgraded) cards have no name overlay (`nameText` is null).
 *   AC5  Works for all business upgrade paths.
 *   AC6  Works for community-space upgrade paths.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import { buildUpgradeOverlaySpec } from '../../example-games/main-street/scenes/UpgradeOverlaySpec';
import type { BusinessCard, CommunitySpaceCard } from '../../example-games/main-street/MainStreetCards';
import {
  getUpgradeTemplates,
  createBusinessDeck,
} from '../../example-games/main-street/MainStreetCards';

// ── Test helpers ──────────────────────────────────────────────

const WIDTH = 120;
const HEIGHT = 160;

/** Creates a minimal BusinessCard for testing. */
function makeBusiness(overrides: Partial<BusinessCard> = {}): BusinessCard {
  const base: BusinessCard = {
    family: 'business',
    id: 'test-biz',
    name: 'Test Business',
    cost: 3,
    baseIncome: 0.5,
    synergyTypes: [],
    maxLevel: 2,
    description: 'A test business.',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
    ...overrides,
  };
  return base;
}

/** Creates a minimal CommunitySpaceCard for testing. */
function makeCommunitySpace(overrides: Partial<CommunitySpaceCard> = {}): CommunitySpaceCard {
  const base: CommunitySpaceCard = {
    family: 'community-space',
    id: 'test-cs',
    name: 'Test Community Space',
    cost: 4,
    baseIncome: 0.3,
    ongoingCost: 0,
    synergyTypes: [],
    maxLevel: 2,
    description: 'A test community space.',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
    ...overrides,
  };
  return base;
}

// ── AC4: Base cards have no name overlay ──────────────────────

describe('Base cards (level 0): no name overlay (AC4)', () => {
  it('returns null nameText for a base BusinessCard', () => {
    const biz = makeBusiness({ level: 0 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.nameText).toBeNull();
  });

  it('returns null nameText for a base CommunitySpaceCard', () => {
    const cs = makeCommunitySpace({ level: 0 });
    const spec = buildUpgradeOverlaySpec(cs, WIDTH, HEIGHT);
    expect(spec.nameText).toBeNull();
  });
});

// ── AC1, AC2: Upgraded cards show the upgraded name ───────────

describe('Upgraded BusinessCard: displays upgraded name (AC1, AC2)', () => {
  it('shows displayName when set (upgraded Bakery → Patisserie)', () => {
    const biz = makeBusiness({
      level: 1,
      name: 'Bakery',
      displayName: 'Patisserie',
    });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);

    expect(spec.nameText).not.toBeNull();
    expect(spec.nameText!.text).toBe('Patisserie');
    expect(spec.nameText!.text).not.toBe('Bakery');
  });

  it('falls back to base name when displayName is not set', () => {
    const biz = makeBusiness({
      level: 1,
      name: 'Bakery',
    });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);

    expect(spec.nameText).not.toBeNull();
    expect(spec.nameText!.text).toBe('Bakery');
  });
});

describe('Upgraded CommunitySpaceCard: displays upgraded name (AC1, AC2)', () => {
  it('shows displayName for upgraded community space', () => {
    const cs = makeCommunitySpace({
      level: 1,
      name: 'Park',
      displayName: 'Garden',
    });
    const spec = buildUpgradeOverlaySpec(cs, WIDTH, HEIGHT);

    expect(spec.nameText).not.toBeNull();
    expect(spec.nameText!.text).toBe('Garden');
    expect(spec.nameText!.text).not.toBe('Park');
  });
});

// ── AC3: Multi-level upgrades show the most recent name ───────

describe('Multi-level upgrades: most recent displayName (AC3)', () => {
  it('shows the name from the last applied upgrade', () => {
    const biz = makeBusiness({
      level: 2,
      name: 'Hardware Store',
      appliedUpgrades: ['upg-home-improvement', 'upg-lumber-yard'],
      displayName: 'Lumber Yard',
    });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);

    expect(spec.nameText).not.toBeNull();
    expect(spec.nameText!.text).toBe('Lumber Yard');
  });

  it('updates displayName when a second upgrade is applied', () => {
    // Level 1: Hardware Store → Home Improvement
    const bizLvl1 = makeBusiness({
      level: 1,
      name: 'Hardware Store',
      displayName: 'Home Improvement',
    });
    expect(buildUpgradeOverlaySpec(bizLvl1, WIDTH, HEIGHT).nameText!.text).toBe('Home Improvement');

    // Level 2: Home Improvement → Lumber Yard
    const bizLvl2 = makeBusiness({
      level: 2,
      name: 'Hardware Store',
      appliedUpgrades: ['upg-home-improvement', 'upg-lumber-yard'],
      displayName: 'Lumber Yard',
    });
    expect(buildUpgradeOverlaySpec(bizLvl2, WIDTH, HEIGHT).nameText!.text).toBe('Lumber Yard');
  });
});

// ── AC5: All business upgrade paths ───────────────────────────

describe('All business upgrade paths (AC5)', () => {
  const businessUpgradeTests = [
    { base: 'Bakery', upgraded: 'Patisserie' },
    { base: 'Diner', upgraded: 'Bistro' },
    { base: 'Bookshop', upgraded: "Reader's Café" },
    { base: 'Pawn Shop', upgraded: 'Vintage Shop' },
    { base: 'Barbershop', upgraded: 'Salon' },
    { base: 'Laundromat', upgraded: 'Dry Cleaners' },
    { base: 'Juice Bar', upgraded: 'Smoothie Bar' },
    { base: 'Toy Store', upgraded: 'Toy Warehouse' },
    { base: 'Arcade', upgraded: 'Gaming Lounge' },
    { base: 'Tailor', upgraded: 'Bespoke Tailor' },
  ];

  for (const { base, upgraded } of businessUpgradeTests) {
    it(`${base} → ${upgraded} shows upgraded name`, () => {
      const biz = makeBusiness({
        level: 1,
        name: base,
        displayName: upgraded,
      });
      const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
      expect(spec.nameText).not.toBeNull();
      expect(spec.nameText!.text).toBe(upgraded);
      expect(spec.nameText!.text).not.toBe(base);
    });
  }
});

// ── AC6: Community-space upgrade paths ────────────────────────

describe('Community-space upgrade paths (AC6)', () => {
  const csUpgradeTests = [
    { base: 'Park', upgraded: 'Garden' },
    { base: 'Town Fountain', upgraded: 'Grand Fountain' },
    { base: 'Community Garden', upgraded: 'Orchard' },
  ];

  for (const { base, upgraded } of csUpgradeTests) {
    it(`${base} → ${upgraded} shows upgraded name`, () => {
      const cs = makeCommunitySpace({
        level: 1,
        name: base,
        displayName: upgraded,
      });
      const spec = buildUpgradeOverlaySpec(cs, WIDTH, HEIGHT);
      expect(spec.nameText).not.toBeNull();
      expect(spec.nameText!.text).toBe(upgraded);
      expect(spec.nameText!.text).not.toBe(base);
    });
  }
});

// ── AC2: CSV data-driven newDisplayName ───────────────────────

describe('CSV data: upgrade templates carry newDisplayName (AC2)', () => {
  it('every upgrade template has a non-empty newDisplayName', () => {
    const templates = getUpgradeTemplates();
    const missing = templates.filter(t => !t.newDisplayName || t.newDisplayName.trim() === '');
    if (missing.length > 0) {
      console.warn(`Missing newDisplayName for: ${missing.map(t => t.id).join(', ')}`);
    }
    expect(missing.length).toBe(0);
  });

  it('Bakery upgrade (upg-patisserie) has displayName "Patisserie"', () => {
    const upg = getUpgradeTemplates().find(t => t.id === 'upg-patisserie');
    expect(upg).toBeDefined();
    expect(upg!.newDisplayName).toBe('Patisserie');
  });

  it('Diner upgrade (upg-bistro) has displayName "Bistro"', () => {
    const upg = getUpgradeTemplates().find(t => t.id === 'upg-bistro');
    expect(upg).toBeDefined();
    expect(upg!.newDisplayName).toBe('Bistro');
  });

  it('multi-level upgrade (upg-home-improvement) has displayName "Home Improvement"', () => {
    const upg = getUpgradeTemplates().find(t => t.id === 'upg-home-improvement');
    expect(upg).toBeDefined();
    expect(upg!.newDisplayName).toBe('Home Improvement');
  });
});

// ── Overlay spec structural integrity ─────────────────────────

describe('Overlay spec structure', () => {
  it('base card: levelBadge and upgradeBorder are null, incomeText is present', () => {
    const biz = makeBusiness({ level: 0, baseIncome: 1 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);

    expect(spec.levelBadge).toBeNull();
    expect(spec.nameText).toBeNull();
    expect(spec.upgradeBorder).toBeNull();
    expect(spec.incomeText).not.toBeNull();
    expect(spec.incomeText!.text).toBe('Income: +1/turn');
  });

  it('upgraded card: all overlays present when income > 0', () => {
    const biz = makeBusiness({
      level: 1,
      name: 'Bakery',
      displayName: 'Patisserie',
      baseIncome: 0.5,
      incomeBonus: 1,
    });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);

    expect(spec.levelBadge).not.toBeNull();
    expect(spec.levelBadge!.text).toBe('Lvl 1');
    expect(spec.incomeText).not.toBeNull();
    expect(spec.incomeText!.text).toBe('Income: +1.5/turn');
    expect(spec.nameText).not.toBeNull();
    expect(spec.nameText!.text).toBe('Patisserie');
    expect(spec.upgradeBorder).not.toBeNull();
  });
});

// ── Real-world scenario: upgrade application flow ─────────────

describe('Real-world upgrade flow: business gets displayName', () => {
  it('applying upg-patisserie to a Bakery sets displayName to "Patisserie"', () => {
    // Create a Bakery at level 0
    const bakeryCards = createBusinessDeck(1);
    const bakery = bakeryCards.find(b => b.name === 'Bakery');
    expect(bakery).toBeDefined();
    expect(bakery!.level).toBe(0);
    expect(bakery!.displayName).toBeUndefined();

    // Simulate applying the upgrade (what purchaseUpgrade does)
    const upgTemplates = getUpgradeTemplates();
    const patisserieUpg = upgTemplates.find(t => t.id === 'upg-patisserie');
    expect(patisserieUpg).toBeDefined();

    bakery!.level += 1;
    bakery!.appliedUpgrades = ['upg-patisserie'];
    bakery!.displayName = patisserieUpg!.newDisplayName || bakery!.displayName;

    // Verify displayName is set
    expect(bakery!.displayName).toBe('Patisserie');

    // Verify overlay spec shows the upgraded name
    const spec = buildUpgradeOverlaySpec(bakery!, WIDTH, HEIGHT);
    expect(spec.nameText).not.toBeNull();
    expect(spec.nameText!.text).toBe('Patisserie');
    expect(spec.nameText!.text).not.toBe('Bakery');
  });
});
