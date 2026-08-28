/**
 * Main Street: Upgrade Overlay Spec Tests (CG-0MT24MHGZ0025O20)
 *
 * Validates that `buildUpgradeOverlaySpec()` produces NO name overlay for
 * either base or upgraded cards — the upgraded name is baked into the card's
 * SVG texture (display-name variant) rather than rendered as a Phaser overlay.
 *
 * Acceptance criteria (as updated per manual review — the name must be part
 * of the card image, not an overlay):
 *   AC1  Upgraded cards display the upgraded name as part of the card face.
 *   AC2  The upgraded name is derived from the BusinessCard's `displayName`
 *        field, which is populated when upgrades are applied.
 *   AC3  Multi-level upgrades show the name from the most recently applied upgrade.
 *   AC4  Base (un-upgraded) cards have no name overlay (`nameText` absent).
 *   AC6  `buildUpgradeOverlaySpec` no longer carries a `nameText` overlay
 *        (the name moved into the card SVG); the upgraded-name display is
 *        covered by card-face tests (card-svg-generator.replaceCardTitleInSvg /
 *        generateBusinessCardSvg).
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import { buildUpgradeOverlaySpec } from '../../example-games/main-street/scenes/UpgradeOverlaySpec';
import type { BusinessCard, CommunitySpaceCard } from '../../example-games/main-street/MainStreetCards';
import { getUpgradeTemplates } from '../../example-games/main-street/MainStreetCards';

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
    ongoingCost: 0,
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

// ── AC1, AC2, AC4: No name overlay on any card ────────────────

describe('No nameText overlay (name is part of the card face, AC1/AC2/AC4)', () => {
  it('returns no nameText for a base BusinessCard', () => {
    const biz = makeBusiness({ level: 0 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec).not.toHaveProperty('nameText');
  });

  it('returns no nameText for a base CommunitySpaceCard', () => {
    const cs = makeCommunitySpace({ level: 0 });
    const spec = buildUpgradeOverlaySpec(cs, WIDTH, HEIGHT);
    expect(spec).not.toHaveProperty('nameText');
  });

  it('returns no nameText for an upgraded card (Bakery → Patisserie)', () => {
    const biz = makeBusiness({
      level: 1,
      name: 'Bakery',
      displayName: 'Patisserie',
    });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    // The upgraded name is baked into the card SVG, so the overlay spec must
    // not carry a name overlay at all (AC1 mechanism per manual review).
    expect(spec).not.toHaveProperty('nameText');
  });

  it('keeps the non-name overlay fields intact for upgraded cards', () => {
    const biz = makeBusiness({
      level: 1,
      name: 'Bakery',
      displayName: 'Patisserie',
    });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.levelBadge).not.toBeNull();
    expect(spec.levelBadge!.text).toBe('Lvl 1');
    expect(spec.upgradeBorder).not.toBeNull();
  });
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
    expect(spec.upgradeBorder).toBeNull();
    expect(spec.incomeText).not.toBeNull();
    expect(spec.incomeText!.text).toBe('Income: +1/turn');
  });

  it('upgraded card: income/reputation/level/border overlays present when income > 0', () => {
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
    expect(spec.upgradeBorder).not.toBeNull();
  });

  it('reputation overlay reflects upgrade reputationBonus', () => {
    const biz = makeBusiness({
      level: 1,
      reputationPerTurn: 0.2,
      reputationBonus: 0.1,
    });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.reputationText).not.toBeNull();
    expect(spec.reputationText!.text).toBe('+0.3/turn');
  });
});