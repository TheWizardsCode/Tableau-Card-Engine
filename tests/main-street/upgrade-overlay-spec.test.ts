/**
 * Unit tests for UpgradeOverlaySpec — the pure-data spec builder that
 * describes what visual overlays to render on Main Street business cards.
 *
 * These tests run in any JS environment (no Phaser dependency).
 */

import { describe, it, expect } from 'vitest';
import { buildUpgradeOverlaySpec } from '../../example-games/main-street/scenes/UpgradeOverlaySpec';
import type { BusinessCard, CommunitySpaceCard } from '../../example-games/main-street/MainStreetCards';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CARD_W = 140;
const CARD_H = 80;

/** Create a minimal BusinessCard with overrides. */
function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business',
    id: 'biz-test-0',
    name: 'Test Business',
    cost: 6,
    baseIncome: 1,
    synergyTypes: ['Food'],
    maxLevel: 2,
    description: 'A test business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
    ...overrides,
  };
}

/** Create a minimal CommunitySpaceCard with overrides. */
function makeCommunitySpace(overrides: Partial<CommunitySpaceCard> = {}): CommunitySpaceCard {
  return {
    family: 'community-space',
    id: 'cs-test-0',
    name: 'Test Community Space',
    cost: 4,
    baseIncome: 0,
    synergyTypes: ['Culture'],
    maxLevel: 1,
    description: 'A test community space',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildUpgradeOverlaySpec - base cards (level === 0)', () => {
  it('should show income text when baseIncome > 0', () => {
    const biz = makeBiz({ baseIncome: 2, level: 0 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.incomeText).not.toBeNull();
    expect(spec.incomeText!.text).toBe('Income: +2/turn');
  });

  it('should omit income text when total income is 0', () => {
    const biz = makeBiz({ baseIncome: 0, incomeBonus: 0, level: 0 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.incomeText).toBeNull();
  });

  it('should show reputation text when reputationPerTurn > 0', () => {
    const biz = makeBiz({ reputationPerTurn: 0.2, level: 0 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.reputationText).not.toBeNull();
    expect(spec.reputationText!.text).toBe('+0.2/turn');
  });

  it('should omit reputation text when reputationPerTurn is 0 and no bonus', () => {
    const biz = makeBiz({ baseIncome: 1, level: 0 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.reputationText).toBeNull();
  });

  it('should omit reputation text when reputationPerTurn is undefined and no bonus', () => {
    const biz = makeBiz({ baseIncome: 1, level: 0, reputationPerTurn: undefined });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.reputationText).toBeNull();
  });

  it('should not show level badge for base cards', () => {
    const biz = makeBiz({ level: 0 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.levelBadge).toBeNull();
  });

  it('should not show name overlay for base cards', () => {
    const biz = makeBiz({ level: 0 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.nameText).toBeNull();
  });

  it('should not show upgrade border for base cards', () => {
    const biz = makeBiz({ level: 0 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.upgradeBorder).toBeNull();
  });

  it('should show both income and reputation when both are present', () => {
    const biz = makeBiz({ baseIncome: 1, reputationPerTurn: 0.2, level: 0 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.incomeText).not.toBeNull();
    expect(spec.incomeText!.text).toBe('Income: +1/turn');
    expect(spec.reputationText).not.toBeNull();
    expect(spec.reputationText!.text).toBe('+0.2/turn');
  });
});

describe('buildUpgradeOverlaySpec - upgraded cards (level > 0)', () => {
  it('should show income text with combined base + bonus', () => {
    const biz = makeBiz({ baseIncome: 1, incomeBonus: 2, level: 1 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.incomeText).not.toBeNull();
    expect(spec.incomeText!.text).toBe('Income: +3/turn');
  });

  it('should show reputation text when reputationPerTurn + bonus > 0', () => {
    const biz = makeBiz({ reputationPerTurn: 0.2, reputationBonus: 0.1, level: 1 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.reputationText).not.toBeNull();
    expect(spec.reputationText!.text).toBe('+0.3/turn');
  });

  it('should show level badge for upgraded cards', () => {
    const biz = makeBiz({ level: 2 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.levelBadge).not.toBeNull();
    expect(spec.levelBadge!.text).toBe('Lvl 2');
  });

  it('should show name text for upgraded cards', () => {
    const biz = makeBiz({ name: 'Patisserie', level: 1 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.nameText).not.toBeNull();
    expect(spec.nameText!.text).toBe('Patisserie');
  });

  it('should show upgrade border for upgraded cards', () => {
    const biz = makeBiz({ level: 1 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.upgradeBorder).not.toBeNull();
  });

  it('should omit income text if total income is 0 even when upgraded', () => {
    const biz = makeBiz({ baseIncome: 0, incomeBonus: 0, level: 1, reputationPerTurn: 0.1 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.incomeText).toBeNull();
    expect(spec.reputationText).not.toBeNull();
  });

  it('should omit reputation text if total reputation is 0 even when upgraded', () => {
    const biz = makeBiz({ baseIncome: 1, incomeBonus: 1, level: 1, reputationPerTurn: 0, reputationBonus: 0 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.incomeText).not.toBeNull();
    expect(spec.incomeText!.text).toBe('Income: +2/turn');
    expect(spec.reputationText).toBeNull();
  });
});

describe('buildUpgradeOverlaySpec - community space cards', () => {
  it('should show income text for community space with income', () => {
    const cs = makeCommunitySpace({ baseIncome: 1, level: 0 });
    const spec = buildUpgradeOverlaySpec(cs, CARD_W, CARD_H);

    expect(spec.incomeText).not.toBeNull();
    expect(spec.incomeText!.text).toBe('Income: +1/turn');
  });

  it('should show reputation text for community space with reputation', () => {
    const cs = makeCommunitySpace({ reputationPerTurn: 0.1, level: 0 });
    const spec = buildUpgradeOverlaySpec(cs, CARD_W, CARD_H);

    expect(spec.reputationText).not.toBeNull();
    expect(spec.reputationText!.text).toBe('+0.1/turn');
  });

  it('should show level badge and upgrade border when upgraded', () => {
    const cs = makeCommunitySpace({ level: 1, baseIncome: 1 });
    const spec = buildUpgradeOverlaySpec(cs, CARD_W, CARD_H);

    expect(spec.levelBadge).not.toBeNull();
    expect(spec.nameText).not.toBeNull();
    expect(spec.upgradeBorder).not.toBeNull();
  });
});

describe('buildUpgradeOverlaySpec - positioning', () => {
  it('should position income text centred on card', () => {
    const biz = makeBiz({ baseIncome: 2, level: 0 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.incomeText).not.toBeNull();
    // Income should be horizontally centred (x=0 in container-local space)
    expect(spec.incomeText!.x).toBe(0);
    // Income should be slightly above centre vertically (negative y)
    expect(spec.incomeText!.y).toBeLessThan(0);
    expect(spec.incomeText!.y).toBeGreaterThan(-CARD_H / 4);
  });

  it('should position reputation text centred below income', () => {
    const biz = makeBiz({ baseIncome: 1, reputationPerTurn: 0.2, level: 0 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.reputationText).not.toBeNull();
    // Reputation should be horizontally centred (x=0 in container-local space)
    expect(spec.reputationText!.x).toBe(0);
    // Reputation should be below centre (positive y)
    expect(spec.reputationText!.y).toBeGreaterThan(0);
    expect(spec.reputationText!.y).toBeLessThanOrEqual(CARD_H / 4);
  });

  it('should position level badge at top-right', () => {
    const biz = makeBiz({ level: 1 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.levelBadge).not.toBeNull();
    // In container-local space, right edge is at +width/2; badge should be near it
    expect(spec.levelBadge!.x).toBeGreaterThan(0);
    expect(spec.levelBadge!.x).toBeLessThanOrEqual(CARD_W / 2);
    // At top: y should be negative (above centre in container space)
    expect(spec.levelBadge!.y).toBeLessThan(0);
  });

  it('should position name text at top-centre for upgraded cards', () => {
    const biz = makeBiz({ name: 'Patisserie', level: 1 });
    const spec = buildUpgradeOverlaySpec(biz, CARD_W, CARD_H);

    expect(spec.nameText).not.toBeNull();
    // Name should be horizontally centred (x=0 in container-local space)
    expect(spec.nameText!.x).toBe(0);
    // Name should be above centre (negative y, near top of card)
    expect(spec.nameText!.y).toBeLessThan(0);
  });
});
