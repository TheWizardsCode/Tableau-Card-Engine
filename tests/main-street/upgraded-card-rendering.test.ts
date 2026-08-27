/**
 * Main Street: Upgraded Card Rendering Tests
 *
 * Validates that upgraded BusinessCards on the street grid display:
 * 1. A visible level badge when level > 0
 * 2. Updated income display (baseIncome + incomeBonus)
 * 3. Visual distinction from base cards (border/glow)
 *
 * These tests verify the rendering helper functions produce correct overlay
 * text content and styling for upgraded vs base cards.
 *
 * Related work-item: CG-0MP1VJVEK003I7VE "Cards not updated when upgraded"
 */
import { describe, it, expect } from 'vitest';

import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';
import {
  buildUpgradeOverlaySpec,
} from '../../example-games/main-street/scenes/UpgradeOverlaySpec';

// ── Helpers ─────────────────────────────────────────────────

/**
 * Builds a minimal BusinessCard with all required mutable fields set
 * to their starting values.
 */
function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business',
    id: 'biz-bakery-test',
    name: 'Bakery',
    cost: 3,
    baseIncome: 2,
    synergyTypes: ['Food'],
    upgradePath: 'Bakery',
    maxLevel: 2,
    description: 'Test bakery.',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
    appliedUpgrades: [],
    ...overrides,
  };
}

// ── Level Badge ──────────────────────────────────────────────

describe('buildUpgradeOverlaySpec', () => {
  describe('level badge', () => {
    it('returns no level badge for a base (level 0) card', () => {
      const biz = makeBiz({ level: 0 });
      const spec = buildUpgradeOverlaySpec(biz, 200, 280);
      expect(spec.levelBadge).toBeNull();
    });

    it('returns a level badge for a level 1 card', () => {
      const biz = makeBiz({ level: 1 });
      const spec = buildUpgradeOverlaySpec(biz, 200, 280);
      expect(spec.levelBadge).not.toBeNull();
      expect(spec.levelBadge!.text).toBe('Lvl 1');
    });

    it('returns a level badge for a level 2 card', () => {
      const biz = makeBiz({ level: 2 });
      const spec = buildUpgradeOverlaySpec(biz, 200, 280);
      expect(spec.levelBadge).not.toBeNull();
      expect(spec.levelBadge!.text).toBe('Lvl 2');
    });

    it('positions the level badge in the top-right corner', () => {
      const biz = makeBiz({ level: 1 });
      const width = 200;
      const height = 280;
      const spec = buildUpgradeOverlaySpec(biz, width, height);
      expect(spec.levelBadge).not.toBeNull();
      // In container-local space (0,0 = card centre), badge should be near
      // top-right: x positive (right side, near right edge at +width/2)
      expect(spec.levelBadge!.x).toBeGreaterThan(0);
      expect(spec.levelBadge!.x).toBeLessThanOrEqual(width / 2);
      // y negative (above centre, near top at -height/2)
      expect(spec.levelBadge!.y).toBeLessThan(0);
    });
  });

  describe('income display', () => {
    it('shows combined income for a card with incomeBonus', () => {
      const biz = makeBiz({ baseIncome: 3, incomeBonus: 5, level: 1 });
      const spec = buildUpgradeOverlaySpec(biz, 200, 280);
      expect(spec.incomeText).not.toBeNull();
      expect(spec.incomeText!.text).toBe('Income: +8/turn'); // 3 + 5 = 8
    });

    it('shows income overlay for an un-upgraded card when income > 0', () => {
      const biz = makeBiz({ baseIncome: 3, incomeBonus: 0, level: 0 });
      const spec = buildUpgradeOverlaySpec(biz, 200, 280);
      expect(spec.incomeText).not.toBeNull();
      expect(spec.incomeText!.text).toBe('Income: +3/turn');
    });

    it('positions the income text centred on the card', () => {
      const biz = makeBiz({ baseIncome: 3, incomeBonus: 5, level: 1 });
      const height = 280;
      const spec = buildUpgradeOverlaySpec(biz, 200, height);
      expect(spec.incomeText).not.toBeNull();
      // Income is now centred: x=0 horizontally, y slightly above centre
      expect(spec.incomeText!.x).toBe(0);
      // y should be negative (above centre) and near zero (centre of card)
      expect(spec.incomeText!.y).toBeLessThan(0);
      expect(spec.incomeText!.y).toBeGreaterThan(-height * 0.2);
    });
  });

  describe('visual distinction', () => {
    it('returns no upgrade border for a base (level 0) card', () => {
      const biz = makeBiz({ level: 0 });
      const spec = buildUpgradeOverlaySpec(biz, 200, 280);
      expect(spec.upgradeBorder).toBeNull();
    });

    it('returns an upgrade border for an upgraded card', () => {
      const biz = makeBiz({ level: 1 });
      const spec = buildUpgradeOverlaySpec(biz, 200, 280);
      expect(spec.upgradeBorder).not.toBeNull();
      expect(spec.upgradeBorder!.color).toBeDefined();
    });
  });

  describe('upgraded name display', () => {
    it('returns no name overlay for a base (level 0) card', () => {
      const biz = makeBiz({ level: 0, name: 'Bakery' });
      const spec = buildUpgradeOverlaySpec(biz, 200, 280);
      expect(spec.nameText).toBeNull();
    });

    it('returns the card name overlay for an upgraded card', () => {
      const biz = makeBiz({ level: 1, name: 'Patisserie' });
      const spec = buildUpgradeOverlaySpec(biz, 200, 280);
      expect(spec.nameText).not.toBeNull();
      expect(spec.nameText!.text).toBe('Patisserie');
    });
  });
});
