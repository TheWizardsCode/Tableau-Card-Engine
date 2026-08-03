/**
 * Unit tests for MainStreetCardSvgGenerator — generates SVG strings
 * dynamically for BusinessCard and CommunitySpaceCard based on state.
 *
 * These tests run in any JS environment (no Phaser dependency).
 */

import { describe, it, expect } from 'vitest';
import { generateBusinessCardSvg } from '../../example-games/main-street/scenes/MainStreetCardSvgGenerator';
import type { BusinessCard, CommunitySpaceCard } from '../../example-games/main-street/MainStreetCards';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CARD_W = 140;
const CARD_H = 80;

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateBusinessCardSvg - base cards (level === 0)', () => {
  it('should include the card name as title', () => {
    const biz = makeBiz({ name: 'Bakery', level: 0 });
    const svg = generateBusinessCardSvg(biz, CARD_W, CARD_H);
    expect(svg).toContain('Bakery');
  });

  it('should show income text with Income: prefix when baseIncome > 0', () => {
    const biz = makeBiz({ baseIncome: 2, level: 0 });
    const svg = generateBusinessCardSvg(biz, CARD_W, CARD_H);
    expect(svg).toContain('Income: +2/turn');
  });

  it('should omit income text when total income is 0', () => {
    const biz = makeBiz({ baseIncome: 0, incomeBonus: 0, level: 0 });
    const svg = generateBusinessCardSvg(biz, CARD_W, CARD_H);
    expect(svg).not.toContain('+0/turn');
    expect(svg).not.toContain('Income: +0/turn');
  });

  it('should show reputation text when reputationPerTurn > 0', () => {
    const biz = makeBiz({ reputationPerTurn: 0.2, level: 0 });
    const svg = generateBusinessCardSvg(biz, CARD_W, CARD_H);
    expect(svg).toContain('+0.2/turn');
  });

  it('should omit reputation text when total reputation is 0', () => {
    const biz = makeBiz({ baseIncome: 1, level: 0 });
    const svg = generateBusinessCardSvg(biz, CARD_W, CARD_H);
    expect(svg).not.toMatch(/reputation.*0\.0\/turn/);
    expect(svg).not.toMatch(/\+0\.0\/turn/);
  });

  it('should not show level badge for base cards', () => {
    const biz = makeBiz({ level: 0 });
    const svg = generateBusinessCardSvg(biz, CARD_W, CARD_H);
    expect(svg).not.toContain('Lvl 0');
  });

  it('should include cost value formatted with the currency symbol', () => {
    const biz = makeBiz({ cost: 6, level: 0 });
    const svg = generateBusinessCardSvg(biz, CARD_W, CARD_H);
    expect(svg).toContain('>€6<');
  });

  it('should include synergy icon', () => {
    const biz = makeBiz({ synergyTypes: ['Food'], level: 0 });
    const svg = generateBusinessCardSvg(biz, CARD_W, CARD_H);
    expect(svg).toContain('Food icon');
  });
});

describe('generateBusinessCardSvg - upgraded cards (level > 0)', () => {
  it('should show updated name on upgrade', () => {
    const biz = makeBiz({ name: 'Patisserie', level: 1 });
    const svg = generateBusinessCardSvg(biz, CARD_W, CARD_H);
    expect(svg).toContain('Patisserie');
  });

  it('should show level badge for upgraded cards', () => {
    const biz = makeBiz({ level: 2 });
    const svg = generateBusinessCardSvg(biz, CARD_W, CARD_H);
    expect(svg).toContain('Lvl 2');
  });

  it('should show combined income (base + bonus)', () => {
    const biz = makeBiz({ baseIncome: 1, incomeBonus: 2, level: 1 });
    const svg = generateBusinessCardSvg(biz, CARD_W, CARD_H);
    expect(svg).toContain('Income: +3/turn');
  });

  it('should show combined reputation (base + bonus)', () => {
    const biz = makeBiz({ reputationPerTurn: 0.2, reputationBonus: 0.1, level: 1 });
    const svg = generateBusinessCardSvg(biz, CARD_W, CARD_H);
    expect(svg).toContain('+0.3/turn');
  });

  it('should show cost value formatted with the currency symbol', () => {
    const biz = makeBiz({ cost: 4, level: 1 });
    const svg = generateBusinessCardSvg(biz, CARD_W, CARD_H);
    expect(svg).toContain('>€4<');
  });
});

describe('generateBusinessCardSvg - community space cards', () => {
  it('should include community space name', () => {
    const cs = makeCommunitySpace({ name: 'Park', level: 0 });
    const svg = generateBusinessCardSvg(cs, CARD_W, CARD_H);
    expect(svg).toContain('Park');
  });

  it('should show income for community spaces with income', () => {
    const cs = makeCommunitySpace({ baseIncome: 1, level: 0 });
    const svg = generateBusinessCardSvg(cs, CARD_W, CARD_H);
    expect(svg).toContain('Income: +1/turn');
  });

  it('should show reputation for community spaces with reputation', () => {
    const cs = makeCommunitySpace({ reputationPerTurn: 0.1, level: 0 });
    const svg = generateBusinessCardSvg(cs, CARD_W, CARD_H);
    expect(svg).toContain('+0.1/turn');
  });

  it('should show level badge when upgraded', () => {
    const cs = makeCommunitySpace({ level: 1, baseIncome: 1 });
    const svg = generateBusinessCardSvg(cs, CARD_W, CARD_H);
    expect(svg).toContain('Lvl 1');
  });
});

describe('generateBusinessCardSvg - formatting', () => {
  it('should format integer reputation without decimal', () => {
    const biz = makeBiz({ reputationPerTurn: 1.0, level: 0 });
    const svg = generateBusinessCardSvg(biz, CARD_W, CARD_H);
    expect(svg).toContain('+1/turn');
    expect(svg).not.toContain('+1.0/turn');
  });

  it('should format fractional reputation with one decimal', () => {
    const biz = makeBiz({ reputationPerTurn: 0.3, level: 0 });
    const svg = generateBusinessCardSvg(biz, CARD_W, CARD_H);
    expect(svg).toContain('+0.3/turn');
  });

  it('should produce valid SVG with proper XML structure', () => {
    const biz = makeBiz({ level: 0 });
    const svg = generateBusinessCardSvg(biz, CARD_W, CARD_H);
    expect(svg).toContain('<?xml version="1.0"');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
});
