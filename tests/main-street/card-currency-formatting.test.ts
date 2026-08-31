/**
 * Card currency formatting tests
 *
 * Verifies that card tooltips and card-face cost badges render costs via
 * the i18n `formatCurrency()` helper so the currency symbol follows the
 * active locale (default `€`; locales can override with `currency.symbol`,
 * e.g. `$` for en-US). See CG-0MSBSC3PL002OA4G.
 *
 * Covers:
 * - `buildCardTooltipInfo()` — all card-family tooltip branches use
 *   `formatCurrency()` for the cost line (AC1).
 * - Locale switching changes the symbol rendered in tooltips (AC3).
 * - SVG card-face cost badges (business/community-space, event, upgrade,
 *   staff) use the same currency formatting path (AC2).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildCardTooltipInfo,
  type SynergyFormatConfig,
} from '../../example-games/main-street/MainStreetFormatting';
import {
  generateBusinessCardSvg,
  generateEventCardSvg,
  generateUpgradeCardSvg,
  generateStaffCardSvg,
} from '../../example-games/main-street/scenes/MainStreetCardSvgGenerator';
import type {
  BusinessCard,
  CommunitySpaceCard,
  EventCard,
  UpgradeCard,
  StaffCard,
} from '../../example-games/main-street/MainStreetCards';
import { resetI18n, registerLocale, setLocale } from '../../src/core-engine/I18n';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CARD_W = 140;
const CARD_H = 80;

const config: SynergyFormatConfig = { synergyBonusPerNeighbor: 1 };

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
    ongoingCost: 0,
    appliedUpgrades: [],
    ...overrides,
  };
}

function makeCommunitySpace(overrides: Partial<CommunitySpaceCard> = {}): CommunitySpaceCard {
  return {
    family: 'community-space',
    id: 'cs-test-0',
    name: 'Test Community Space',
    cost: 4,
    baseIncome: 0,
    ongoingCost: 0,
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

function makeEvent(overrides: Partial<EventCard> = {}): EventCard {
  return {
    family: 'event',
    id: 'evt-test-0',
    name: 'Test Event',
    trigger: 'Investment',
    cost: 5,
    effect: 'Gain coins',
    target: 'All',
    coinDelta: 2,
    reputationDelta: 0.5,
    ...overrides,
  };
}

function makeUpgrade(overrides: Partial<UpgradeCard> = {}): UpgradeCard {
  return {
    family: 'upgrade',
    id: 'upg-test-0',
    name: 'Test Upgrade',
    targetBusiness: 'Bakery',
    cost: 8,
    incomeBonus: 1,
    synergyRangeBonus: 0,
    description: 'Improves the bakery',
    ...overrides,
  };
}

function makeStaff(overrides: Partial<StaffCard> = {}): StaffCard {
  return {
    family: 'staff',
    id: 'staff-test-0',
    name: 'Test Staff',
    cost: 3,
    ongoingCost: 0.5,
    handSlotsAdded: 1,
    description: 'Hired hand',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tooltip branches (AC1)
// ---------------------------------------------------------------------------

describe('buildCardTooltipInfo - cost formatting', () => {
  beforeEach(() => {
    resetI18n();
  });
  afterEach(() => {
    resetI18n();
  });

  it('business tooltip renders cost via formatCurrency (default €)', () => {
    const info = buildCardTooltipInfo(makeBiz({ cost: 6 }), config);
    expect(info).toContain('Cost: €6');
    expect(info).not.toContain('Cost: 6\n');
  });

  it('business tooltip preserves income, synergy and description lines', () => {
    const info = buildCardTooltipInfo(makeBiz({ baseIncome: 1, cost: 6 }), config);
    expect(info).toContain('Business: Test Business');
    expect(info).toContain('Income: +1/turn');
    expect(info).toContain('Synergy: Food');
    expect(info).toContain('A test business');
  });

  it('community-space tooltip renders cost via formatCurrency', () => {
    const info = buildCardTooltipInfo(makeCommunitySpace({ cost: 4 }), config);
    expect(info).toContain('Cost: €4');
    expect(info).not.toContain('Cost: 4\n');
  });

  it('event tooltip (hand) renders cost via formatCurrency and omits detail lines', () => {
    const info = buildCardTooltipInfo(makeEvent({ cost: 5 }), config);
    expect(info).toContain('Event: Test Event');
    expect(info).toContain('Cost: €5');
    expect(info).not.toContain('Cost: 5\n');
    expect(info).not.toContain('Coins:');
  });

  it('event tooltip (market, includeEventDetail) adds coin/reputation lines', () => {
    const info = buildCardTooltipInfo(
      makeEvent({ cost: 5, coinDelta: 2, reputationDelta: 0.5 }),
      config,
      { includeEventDetail: true },
    );
    expect(info).toContain('Cost: €5');
    // CG-0MT5Y9AD2001MKWZ: formatted cleanly, no spurious trailing zeros.
    expect(info).toContain('Coins: +2');
    expect(info).toContain('Rep: +0.5');
  });

  it('upgrade tooltip renders cost via formatCurrency', () => {
    const info = buildCardTooltipInfo(makeUpgrade({ cost: 8 }), config);
    expect(info).toContain('Upgrade: Test Upgrade');
    expect(info).toContain('Cost: €8');
    expect(info).not.toContain('Cost: 8\n');
  });

  it('staff cards produce a hire-relevant tooltip with locale-aware cost (CG-0MT3KZOUX007GQ44)', () => {
    const info = buildCardTooltipInfo(makeStaff(), config);
    expect(info).toContain('Staff: Test Staff');
    expect(info).toContain('Cost: €3');
    expect(info).toContain('Hand slots: +1');
    expect(info).not.toBe('');
  });

  it('unknown card families produce an empty tooltip (existing behaviour)', () => {
    expect(buildCardTooltipInfo({ family: 'unknown' } as any, config)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Locale switching (AC3)
// ---------------------------------------------------------------------------

describe('buildCardTooltipInfo - locale-aware currency symbol', () => {
  afterEach(() => {
    resetI18n();
  });

  it('switching to a locale with a different currency.symbol changes the tooltip symbol', () => {
    resetI18n();
    registerLocale('en-US', { 'currency.symbol': '$' });
    setLocale('en-US');

    const info = buildCardTooltipInfo(makeBiz({ cost: 6 }), config);
    expect(info).toContain('Cost: $6');
    expect(info).not.toContain('€');
  });

  it('falls back to € when no locale overrides the currency symbol', () => {
    resetI18n();
    const info = buildCardTooltipInfo(makeBiz({ cost: 6 }), config);
    expect(info).toContain('Cost: €6');
  });
});

// ---------------------------------------------------------------------------
// SVG card faces (AC2)
// ---------------------------------------------------------------------------

describe('MainStreetCardSvgGenerator - cost badge currency formatting', () => {
  beforeEach(() => {
    resetI18n();
  });
  afterEach(() => {
    resetI18n();
  });

  it('business card face badge renders cost via formatCurrency (default €)', () => {
    const svg = generateBusinessCardSvg(makeBiz({ cost: 6 }), CARD_W, CARD_H);
    expect(svg).toContain('>€6<');
    expect(svg).not.toContain('>6<');
  });

  it('event card face badge renders cost via formatCurrency', () => {
    const svg = generateEventCardSvg(makeEvent({ cost: 5 }), CARD_W, CARD_H);
    expect(svg).toContain('>€5<');
    expect(svg).not.toContain('>5<');
  });

  it('upgrade card face badge renders cost via formatCurrency', () => {
    const svg = generateUpgradeCardSvg(makeUpgrade({ cost: 8 }), CARD_W, CARD_H);
    expect(svg).toContain('>€8<');
    expect(svg).not.toContain('>8<');
  });

  it('staff card face badge renders cost via formatCurrency', () => {
    const svg = generateStaffCardSvg(makeStaff({ cost: 3 }), CARD_W, CARD_H);
    expect(svg).toContain('>€3<');
    expect(svg).not.toContain('>3<');
  });

  it('switching locale changes the symbol in card-face badges', () => {
    resetI18n();
    registerLocale('en-US', { 'currency.symbol': '$' });
    setLocale('en-US');

    const svg = generateBusinessCardSvg(makeBiz({ cost: 6 }), CARD_W, CARD_H);
    expect(svg).toContain('>$6<');
    expect(svg).not.toContain('€');
  });
});
