/**
 * Main Street: Cash Line Overlay Tests (CG-0MTCP76MP0088TQW)
 *
 * Validates that `buildUpgradeOverlaySpec()` produces a combined cash line
 * ("Cash: +{income} / -{cost}") instead of a separate income text overlay.
 *
 * Acceptance criteria:
 *   AC1  Income and ongoing cost are displayed on one line as
 *        "Cash: +{income} / -{cost}" with consistent formatting.
 *   AC2  The combined line does not overlap reputation, level badge, or other
 *        card overlays.
 *   AC3  The cash line is shown only when income > 0 or cost > 0.
 *   AC4  Ongoing cost is now included via the overlay pipeline.
 *   AC5  Reputation overlay remains unchanged.
 *   AC6  Full test suite passes.
 *   AC7  Documentation updated.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import { buildUpgradeOverlaySpec } from '../../example-games/main-street/scenes/UpgradeOverlaySpec';
import type { BusinessCard, CommunitySpaceCard } from '../../example-games/main-street/MainStreetCards';

// ── Test helpers ──────────────────────────────────────────────

const WIDTH = 120;
const HEIGHT = 160;

function makeBusiness(overrides: Partial<BusinessCard> = {}): BusinessCard {
  const base: BusinessCard = {
    family: 'business',
    id: 'test-biz',
    name: 'Test Business',
    cost: 3,
    baseIncome: 0,
    synergyTypes: [],
    maxLevel: 2,
    description: 'A test business.',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    reputationPerTurn: 0,
    ongoingCost: 0,
    appliedUpgrades: [],
    ...overrides,
  };
  return base;
}

function makeCommunitySpace(overrides: Partial<CommunitySpaceCard> = {}): CommunitySpaceCard {
  const base: CommunitySpaceCard = {
    family: 'community-space',
    id: 'test-cs',
    name: 'Test Community Space',
    cost: 4,
    baseIncome: 0,
    ongoingCost: 0,
    synergyTypes: [],
    maxLevel: 2,
    description: 'A test community space.',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    reputationPerTurn: 0,
    appliedUpgrades: [],
    ...overrides,
  };
  return base;
}

// ── AC1: Single combined cash line ────────────────────────────

describe('AC1: Single combined cash line format', () => {
  it('shows "Cash: +2" when income is 2 and cost is 0', () => {
    const biz = makeBusiness({ level: 1, baseIncome: 2, ongoingCost: 0 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.cashLine).not.toBeNull();
    expect(spec.cashLine!.text).toBe('Cash: +2');
  });

  it('shows "Cash: +2 / -0.75" when income is 2 and cost is 0.75', () => {
    const biz = makeBusiness({ level: 1, baseIncome: 2, ongoingCost: 0.75 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.cashLine).not.toBeNull();
    expect(spec.cashLine!.text).toBe('Cash: +2 / -0.75');
  });

  it('shows "Cash: +1.5 / -0.5" when income is 1.5 and cost is 0.5', () => {
    const biz = makeBusiness({ level: 1, baseIncome: 1, incomeBonus: 0.5, ongoingCost: 0.5 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.cashLine).not.toBeNull();
    expect(spec.cashLine!.text).toBe('Cash: +1.5 / -0.5');
  });

  it('shows only cost portion when income is 0 but cost > 0', () => {
    const biz = makeBusiness({ level: 1, baseIncome: 0, ongoingCost: 0.5 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.cashLine).not.toBeNull();
    expect(spec.cashLine!.text).toBe('Cash: -0.5');
  });

  it('shows "Cash: +2 / -1" when both income and cost are integers', () => {
    const biz = makeBusiness({ level: 1, baseIncome: 2, ongoingCost: 1 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.cashLine).not.toBeNull();
    expect(spec.cashLine!.text).toBe('Cash: +2 / -1');
  });

  it('omits cost portion when ongoingCost is 0 (income only)', () => {
    const biz = makeBusiness({ level: 1, baseIncome: 3, ongoingCost: 0 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.cashLine).not.toBeNull();
    expect(spec.cashLine!.text).toBe('Cash: +3');
    expect(spec.cashLine!.text).not.toContain('/');
  });

  it('handles fractional income with decimal formatting', () => {
    const biz = makeBusiness({ level: 1, baseIncome: 0.25, ongoingCost: 0 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.cashLine).not.toBeNull();
    expect(spec.cashLine!.text).toBe('Cash: +0.25');
  });

  it('handles both fractional income and cost', () => {
    const biz = makeBusiness({ level: 1, baseIncome: 0.25, ongoingCost: 0.15 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.cashLine).not.toBeNull();
    expect(spec.cashLine!.text).toBe('Cash: +0.25 / -0.15');
  });
});

// ── AC2: No overlap with other overlays ───────────────────────

describe('AC2: Cash line does not overlap other overlays', () => {
  it('cashLine y-position is above reputation text y-position', () => {
    const biz = makeBusiness({
      level: 1, baseIncome: 2, ongoingCost: 0.5,
      reputationPerTurn: 0.3, reputationBonus: 0,
    });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.cashLine).not.toBeNull();
    expect(spec.reputationText).not.toBeNull();
    // Both y values are relative to card centre.
    // Cash line should be above reputation (more negative y = higher on screen).
    expect(spec.cashLine!.y).toBeLessThan(spec.reputationText!.y);
  });

  it('cashLine is horizontally centred (originX 0.5)', () => {
    const biz = makeBusiness({ level: 1, baseIncome: 2, ongoingCost: 0 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.cashLine!.originX).toBe(0.5);
    expect(spec.cashLine!.originY).toBe(0.5);
  });

  it('cashLine x is centred at 0', () => {
    const biz = makeBusiness({ level: 1, baseIncome: 2, ongoingCost: 0 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.cashLine!.x).toBe(0);
  });
});

// ── AC3: Conditional display ──────────────────────────────────

describe('AC3: Cash line shown only when income or cost > 0', () => {
  it('cashLine is null when both income and cost are 0', () => {
    const biz = makeBusiness({ level: 1, baseIncome: 0, ongoingCost: 0 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.cashLine).toBeNull();
  });

  it('cashLine is null for a base card with 0 income and 0 cost', () => {
    const biz = makeBusiness({ level: 0, baseIncome: 0, ongoingCost: 0 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.cashLine).toBeNull();
  });

  it('cashLine is present when income > 0 even if cost is 0', () => {
    const biz = makeBusiness({ level: 1, baseIncome: 1, ongoingCost: 0 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.cashLine).not.toBeNull();
  });

  it('cashLine is present when cost > 0 even if income is 0', () => {
    const biz = makeBusiness({ level: 1, baseIncome: 0, ongoingCost: 0.5 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.cashLine).not.toBeNull();
  });
});

// ── AC4: Ongoing cost included in overlay pipeline ────────────

describe('AC4: Ongoing cost included in overlay pipeline', () => {
  it('CommunitySpaceCard with ongoing cost shows cash line', () => {
    const cs = makeCommunitySpace({ level: 1, baseIncome: 1, ongoingCost: 0.25 });
    const spec = buildUpgradeOverlaySpec(cs, WIDTH, HEIGHT);
    expect(spec.cashLine).not.toBeNull();
    expect(spec.cashLine!.text).toBe('Cash: +1 / -0.25');
  });

  it('ongoingCost from CSV data is reflected in cash line', () => {
    const biz = makeBusiness({ level: 1, baseIncome: 0, ongoingCost: 0.75 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.cashLine).not.toBeNull();
    expect(spec.cashLine!.text).toBe('Cash: -0.75');
  });
});

// ── AC5: Reputation overlay unchanged ─────────────────────────

describe('AC5: Reputation overlay unchanged', () => {
  it('reputationText still renders correctly', () => {
    const biz = makeBusiness({ level: 1, baseIncome: 2, ongoingCost: 0, reputationPerTurn: 0.3 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.reputationText).not.toBeNull();
    expect(spec.reputationText!.text).toBe('+0.3/turn');
    expect(spec.reputationText!.color).toBe('#88bbff');
  });

  it('reputationText is null when reputation is 0', () => {
    const biz = makeBusiness({ level: 1, baseIncome: 2, ongoingCost: 0, reputationPerTurn: 0 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.reputationText).toBeNull();
  });
});

// ── Structural: incomeText replaced by cashLine ───────────────

describe('Structural: incomeText replaced by cashLine', () => {
  it('UpgradeOverlaySpec no longer has incomeText field', () => {
    const biz = makeBusiness({ level: 1, baseIncome: 2 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec).not.toHaveProperty('incomeText');
    expect(spec).toHaveProperty('cashLine');
  });

  it('base card with income: cashLine present, but no levelBadge/upgradeBorder', () => {
    const biz = makeBusiness({ level: 0, baseIncome: 2, ongoingCost: 0 });
    const spec = buildUpgradeOverlaySpec(biz, WIDTH, HEIGHT);
    expect(spec.cashLine).not.toBeNull();
    expect(spec.cashLine!.text).toBe('Cash: +2');
    expect(spec.levelBadge).toBeNull();
    expect(spec.upgradeBorder).toBeNull();
    expect(spec.reputationText).toBeNull();
  });
});
