/**
 * Main Street: Expanded Card Pool Tests (M2)
 *
 * Validates the M2 expanded card pool:
 * - Template completeness and field validation for all 17 Business, 17 Event, 17 Upgrade templates
 * - New synergy types (Service, Entertainment) work correctly
 * - Multi-synergy bridge cards earn adjacency bonuses from both types
 * - Every business has a matching upgrade card
 * - Deck build produces expected sizes with seeded shuffling
 * - synergyColor returns correct values for all synergy types
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import {
  createBusinessDeck,
  createCommunitySpaceDeck,
  createEventDeck,
  createUpgradeDeck,
  synergyColor,
  type BusinessCard,
  type SynergyType,
} from '../../example-games/main-street/MainStreetCards';
import { getPreset } from '../../example-games/main-street/MainStreetDifficulty';
import { computeSynergyBonus, computeBusinessIncome } from '../../example-games/main-street/MainStreetAdjacency';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { GRID_SIZE } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

/** Helper to create a BusinessCard for testing adjacency. */
function makeBiz(overrides: Partial<BusinessCard> & { name: string; synergyTypes: SynergyType[] }): BusinessCard {
  return {
    family: 'business',
    id: `test-${overrides.name.toLowerCase().replace(/\s+/g, '-')}`,
    name: overrides.name,
    cost: overrides.cost ?? 3,
    baseIncome: overrides.baseIncome ?? 2,
    synergyTypes: overrides.synergyTypes,
    maxLevel: overrides.maxLevel ?? 1,
    description: overrides.description ?? 'Test business',
    level: overrides.level ?? 0,
    incomeBonus: overrides.incomeBonus ?? 0,
    synergyRangeBonus: overrides.synergyRangeBonus ?? 0,
    reputationBonus: overrides.reputationBonus ?? 0,
    ongoingCost: overrides.ongoingCost ?? 0,
  };
}

// Build decks once for template validation (use multiplier=1 to test raw templates)
import { createSeededRng } from '../../src/core-engine';
const _rng = createSeededRng(42);
const businessDeck = createBusinessDeck(1); // 1 copy = template count
const eventDeck = createEventDeck(1, undefined, _rng, 1); // template-only view
const upgradeDeck = createUpgradeDeck(1);

// ── Template Completeness ───────────────────────────────────

describe('Expanded Card Pool: Template Completeness', () => {
  it('should have exactly 30 business templates', () => {
    expect(businessDeck).toHaveLength(30);
  });

  it('should have exactly 56 event templates', () => {
    expect(eventDeck).toHaveLength(56); // +1 Graffiti Art (CG-0MSRC9UR9006FBXC)
  });

  it('should have exactly 39 upgrade templates', () => {
    expect(upgradeDeck).toHaveLength(39);
  });

  it('should have unique business IDs', () => {
    const ids = businessDeck.map(c => c.id.replace(/-\d+$/, ''));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have unique event IDs', () => {
    const ids = eventDeck.map(c => c.id.replace(/-\d+$/, ''));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have unique upgrade IDs', () => {
    const ids = upgradeDeck.map(c => c.id.replace(/-\d+$/, ''));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Business Card Validation ────────────────────────────────

describe('Expanded Card Pool: Business Card Fields', () => {
  it('all business cards should have family "business"', () => {
    for (const card of businessDeck) {
      expect(card.family).toBe('business');
    }
  });

  it('all business cards should have positive cost', () => {
    for (const card of businessDeck) {
      expect(card.cost).toBeGreaterThan(0);
    }
  });

  it('all business cards should have non-negative baseIncome', () => {
    for (const card of businessDeck) {
      expect(card.baseIncome).toBeGreaterThanOrEqual(0);
    }
  });

  it('all business cards should have at least one synergy type', () => {
    for (const card of businessDeck) {
      expect(card.synergyTypes.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('all synergy types should be valid', () => {
    const validTypes: SynergyType[] = ['Food', 'Culture', 'Commerce', 'Service', 'Entertainment', 'Health'];
    for (const card of businessDeck) {
      for (const st of card.synergyTypes) {
        expect(validTypes).toContain(st);
      }
    }
  });

  it('all business cards should have a non-empty description', () => {
    for (const card of businessDeck) {
      expect(card.description.length).toBeGreaterThan(0);
    }
  });

  it('all business cards should have maxLevel >= 0', () => {
    for (const card of businessDeck) {
      expect(card.maxLevel).toBeGreaterThanOrEqual(0);
    }
  });

  it('all business cards should start at level 0 with no bonuses', () => {
    for (const card of businessDeck) {
      expect(card.level).toBe(0);
      expect(card.incomeBonus).toBe(0);
      expect(card.synergyRangeBonus).toBe(0);
    }
  });
});

// ── New Synergy Types ───────────────────────────────────────

describe('Expanded Card Pool: New Synergy Types', () => {
  const serviceCards = businessDeck.filter(c => c.synergyTypes.includes('Service'));
  const entertainmentCards = businessDeck.filter(c => c.synergyTypes.includes('Entertainment'));

  it('should have at least 3 Service businesses (including bridge cards)', () => {
    expect(serviceCards.length).toBeGreaterThanOrEqual(3);
  });

  it('should have at least 3 Entertainment businesses (including bridge cards)', () => {
    expect(entertainmentCards.length).toBeGreaterThanOrEqual(3);
  });

  it('should have Service-only businesses', () => {
    const serviceOnly = serviceCards.filter(c => c.synergyTypes.length === 1);
    expect(serviceOnly.length).toBeGreaterThanOrEqual(2);
  });

  it('should have Entertainment-only businesses', () => {
    const entOnly = entertainmentCards.filter(c => c.synergyTypes.length === 1);
    expect(entOnly.length).toBeGreaterThanOrEqual(2);
  });

  it('should have Service-targeted events', () => {
    const serviceEvents = eventDeck.filter(e => e.targetSynergy === 'Service');
    expect(serviceEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('should have Entertainment-targeted events', () => {
    const entEvents = eventDeck.filter(e => e.targetSynergy === 'Entertainment');
    expect(entEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Multi-Synergy Bridge Cards ──────────────────────────────

describe('Expanded Card Pool: Multi-Synergy Bridge Cards', () => {
  const bridgeCards = businessDeck.filter(c => c.synergyTypes.length >= 2);

  it('should have at least 5 bridge cards', () => {
    expect(bridgeCards.length).toBeGreaterThanOrEqual(5);
  });

  it('bridge cards should have exactly 2 synergy types', () => {
    for (const card of bridgeCards) {
      expect(card.synergyTypes).toHaveLength(2);
    }
  });

  it('bridge cards should have two distinct synergy types', () => {
    for (const card of bridgeCards) {
      expect(card.synergyTypes[0]).not.toBe(card.synergyTypes[1]);
    }
  });

  it('Cafe should bridge Food and Culture', () => {
    const cafe = businessDeck.find(c => c.name === 'Cafe');
    expect(cafe).toBeDefined();
    expect(cafe!.synergyTypes).toContain('Food');
    expect(cafe!.synergyTypes).toContain('Culture');
  });

  it('Food Truck should bridge Food and Entertainment', () => {
    const truck = businessDeck.find(c => c.name === 'Food Truck');
    expect(truck).toBeDefined();
    expect(truck!.synergyTypes).toContain('Food');
    expect(truck!.synergyTypes).toContain('Entertainment');
  });

  it('Day Spa should bridge Service and Entertainment', () => {
    const spa = businessDeck.find(c => c.name === 'Day Spa');
    expect(spa).toBeDefined();
    expect(spa!.synergyTypes).toContain('Service');
    expect(spa!.synergyTypes).toContain('Entertainment');
  });

  it('Art Gallery should bridge Culture and Entertainment', () => {
    const gallery = businessDeck.find(c => c.name === 'Art Gallery');
    expect(gallery).toBeDefined();
    expect(gallery!.synergyTypes).toContain('Culture');
    expect(gallery!.synergyTypes).toContain('Entertainment');
  });

  it('Florist should bridge Commerce and Culture', () => {
    const florist = businessDeck.find(c => c.name === 'Florist');
    expect(florist).toBeDefined();
    expect(florist!.synergyTypes).toContain('Commerce');
    expect(florist!.synergyTypes).toContain('Culture');
  });
});

// ── Bridge Card Adjacency Bonuses ───────────────────────────

describe('Expanded Card Pool: Bridge Card Adjacency', () => {
  it('bridge card should earn bonus from either synergy type neighbor', () => {
    const grid: (BusinessCard | null)[] = new Array(GRID_SIZE).fill(null);
    // Slot 0: Bakery (Food), Slot 1: Cafe (Food+Culture), Slot 2: Bookshop (Culture)
    grid[0] = makeBiz({ name: 'Bakery', synergyTypes: ['Food'] });
    grid[1] = makeBiz({ name: 'Cafe', synergyTypes: ['Food', 'Culture'] });
    grid[2] = makeBiz({ name: 'Bookshop', synergyTypes: ['Culture'] });

    // Cafe should get bonus from both neighbors (Food match with Bakery, Culture match with Bookshop)
    const cafeBonus = computeSynergyBonus(grid, 1);
    expect(cafeBonus).toBe(2); // +1 from Bakery (Food), +1 from Bookshop (Culture)
  });

  it('bridge card should earn bonus from same-type neighbor only once', () => {
    const grid: (BusinessCard | null)[] = new Array(GRID_SIZE).fill(null);
    // Slot 0: Cafe (Food+Culture), Slot 1: Cafe (Food+Culture)
    grid[0] = makeBiz({ name: 'Cafe A', synergyTypes: ['Food', 'Culture'] });
    grid[1] = makeBiz({ name: 'Cafe B', synergyTypes: ['Food', 'Culture'] });

    // Each cafe should get +1 from the other (shared synergy, counted once per neighbor)
    expect(computeSynergyBonus(grid, 0)).toBe(1);
    expect(computeSynergyBonus(grid, 1)).toBe(1);
  });

  it('Service bridge card earns bonus from Service neighbor', () => {
    const grid: (BusinessCard | null)[] = new Array(GRID_SIZE).fill(null);
    grid[0] = makeBiz({ name: 'Laundromat', synergyTypes: ['Service'] });
    grid[1] = makeBiz({ name: 'Day Spa', synergyTypes: ['Service', 'Entertainment'] });
    grid[2] = makeBiz({ name: 'Arcade', synergyTypes: ['Entertainment'] });

    // Day Spa gets bonus from Laundromat (Service match) and Arcade (Entertainment match)
    expect(computeSynergyBonus(grid, 1)).toBe(2);
  });

  it('single-synergy card earns bonus from bridge card neighbor sharing its type', () => {
    const grid: (BusinessCard | null)[] = new Array(GRID_SIZE).fill(null);
    grid[0] = makeBiz({ name: 'Bakery', synergyTypes: ['Food'] });
    grid[1] = makeBiz({ name: 'Food Truck', synergyTypes: ['Food', 'Entertainment'] });

    // Bakery should get +1 from Food Truck (Food match)
    expect(computeSynergyBonus(grid, 0)).toBe(1);
  });

  it('single-synergy card does not earn bonus from bridge card with no shared type', () => {
    const grid: (BusinessCard | null)[] = new Array(GRID_SIZE).fill(null);
    grid[0] = makeBiz({ name: 'Bakery', synergyTypes: ['Food'] });
    grid[1] = makeBiz({ name: 'Art Gallery', synergyTypes: ['Culture', 'Entertainment'] });

    // Bakery should get 0 (no Food match)
    expect(computeSynergyBonus(grid, 0)).toBe(0);
  });
});

// ── Service and Entertainment Income ────────────────────────

describe('Expanded Card Pool: Service & Entertainment Income', () => {
  it('Service cluster should generate synergy income', () => {
    const grid: (BusinessCard | null)[] = new Array(GRID_SIZE).fill(null);
    grid[0] = makeBiz({ name: 'Laundromat', synergyTypes: ['Service'], baseIncome: 2 });
    grid[1] = makeBiz({ name: 'Barbershop', synergyTypes: ['Service'], baseIncome: 2 });
    grid[2] = makeBiz({ name: 'Clinic', synergyTypes: ['Service'], baseIncome: 3 });

    // Laundromat: base 2 + 1 (Barbershop) = 3
    expect(computeBusinessIncome(grid, 0)).toBe(3);
    // Barbershop: base 2 + 2 (Laundromat+Clinic) = 4
    expect(computeBusinessIncome(grid, 1)).toBe(4);
    // Clinic: base 3 + 1.5 (Barbershop 50%) = 4.5
    expect(computeBusinessIncome(grid, 2)).toBe(4.5);
  });

  it('Entertainment cluster should generate synergy income', () => {
    const grid: (BusinessCard | null)[] = new Array(GRID_SIZE).fill(null);
    grid[0] = makeBiz({ name: 'Arcade', synergyTypes: ['Entertainment'], baseIncome: 2 });
    grid[1] = makeBiz({ name: 'Cinema', synergyTypes: ['Entertainment'], baseIncome: 3 });

    expect(computeBusinessIncome(grid, 0)).toBe(3); // 2 + 1
    expect(computeBusinessIncome(grid, 1)).toBe(4.5); // 3 + 1.5
  });
});

// ── Upgrade Coverage ────────────────────────────────────────

describe('Expanded Card Pool: Upgrade Coverage', () => {
  it('every business with an upgradePath should have a matching upgrade card', () => {
    const upgradeTargets = new Set(upgradeDeck.map(u => u.targetBusiness));
    for (const biz of businessDeck) {
      if (biz.upgradePath) {
        expect(upgradeTargets.has(biz.upgradePath)).toBe(true);
      }
    }
  });

  it('every business with maxLevel >= 1 has at least one upgrade targeting it (US-10 AC#1)', () => {
    const upgradeable = businessDeck.filter(b => b.maxLevel >= 1);
    expect(upgradeable.length).toBeGreaterThan(0);
    for (const biz of upgradeable) {
      const matchingUpgrades = upgradeDeck.filter(u => u.targetBusiness === biz.name);
      expect(matchingUpgrades.length, `${biz.name} (${biz.id}) has no upgrades`).toBeGreaterThanOrEqual(1);
    }
  });

  it('every upgrade card should reference a valid business or community space name', () => {
    const businessNames = new Set(businessDeck.map(b => b.name));
    const communitySpaceNames = new Set(createCommunitySpaceDeck(1).map(cs => cs.name));
    const allNames = new Set([...businessNames, ...communitySpaceNames]);
    for (const upg of upgradeDeck) {
      expect(allNames.has(upg.targetBusiness), `${upg.id} targets "${upg.targetBusiness}" which is neither a business nor a community space`).toBe(true);
    }
  });

  it('all upgrade cards should have positive cost', () => {
    for (const upg of upgradeDeck) {
      expect(upg.cost).toBeGreaterThan(0);
    }
  });

  it('all upgrade cards should have non-negative incomeBonus', () => {
    for (const upg of upgradeDeck) {
      expect(upg.incomeBonus).toBeGreaterThanOrEqual(0);
    }
  });

  it('all upgrade cards should have non-negative synergyRangeBonus', () => {
    for (const upg of upgradeDeck) {
      expect(upg.synergyRangeBonus).toBeGreaterThanOrEqual(0);
    }
  });

  it('all upgrade cards should have a non-empty description', () => {
    for (const upg of upgradeDeck) {
      expect(upg.description.length).toBeGreaterThan(0);
    }
  });
});

// ── Event Card Validation ───────────────────────────────────

describe('Expanded Card Pool: Event Card Fields', () => {
  it('all event cards should have family "event"', () => {
    for (const evt of eventDeck) {
      expect(evt.family).toBe('event');
    }
  });

  it('Investment events should have positive cost', () => {
    const investments = eventDeck.filter(e => e.trigger === 'Investment');
    expect(investments.length).toBeGreaterThanOrEqual(5);
    for (const evt of investments) {
      expect(evt.cost).toBeGreaterThan(0);
    }
  });

  it('Incident events should have cost >= 0 (some rebalanced to cost 1)', () => {
    const incidents = eventDeck.filter(e => e.trigger === 'Incident');
    expect(incidents.length).toBeGreaterThanOrEqual(10);
    for (const evt of incidents) {
      expect(evt.cost).toBeGreaterThanOrEqual(0);
    }
  });

  it('Investment events should have net-positive effects', () => {
    const investments = eventDeck.filter(e => e.trigger === 'Investment');
    for (const evt of investments) {
      // Duration events (e.g. Tourist Season, Community Renovation) carry
      // zero one-shot deltas — their value comes from the ActiveEffect
      // multiplier, so they are excluded from the delta assertion.
      const netValue = evt.coinDelta + evt.reputationDelta;
      if (netValue === 0 && 'duration' in evt) continue;
      expect(netValue).toBeGreaterThanOrEqual(1);
    }
  });

  it('all event cards should have a non-empty effect description', () => {
    for (const evt of eventDeck) {
      expect(evt.effect.length).toBeGreaterThan(0);
    }
  });

  it('SpecificSynergy events should have a targetSynergy', () => {
    const targeted = eventDeck.filter(e => e.target === 'SpecificSynergy');
    for (const evt of targeted) {
      expect(evt.targetSynergy).toBeDefined();
    }
  });

  it('all 5 synergy types should have at least one targeted event', () => {
    const types: SynergyType[] = ['Food', 'Culture', 'Commerce', 'Service', 'Entertainment'];
    for (const st of types) {
      const events = eventDeck.filter(e => e.targetSynergy === st);
      expect(events.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('at least 25% of incident templates are positive (US-9 AC#3)', () => {
    const incidents = eventDeck.filter(e => e.trigger === 'Incident');
    // Exclude neutral events (0/0 deltas, e.g. duration-based incidents)
    // from the ratio since they are neither positive nor negative.
    const effectful = incidents.filter(i => i.coinDelta !== 0 || i.reputationDelta !== 0);
    const positive = effectful.filter(i => i.coinDelta > 0 || i.reputationDelta > 0);
    // Template pool intentionally skews negative; positiveIncidentMultiplier
    // boosts positive frequency at runtime per difficulty preset.
    expect(positive.length / effectful.length).toBeGreaterThanOrEqual(0.25);
  });

  it('at least 25% of incident templates are positive (US-21 AC#1)', () => {
    const incidents = eventDeck.filter(e => e.trigger === 'Incident');
    // Exclude neutral events from the ratio.
    const effectful = incidents.filter(i => i.coinDelta !== 0 || i.reputationDelta !== 0);
    const positive = effectful.filter(i => i.coinDelta > 0 || i.reputationDelta > 0);
    expect(positive.length / effectful.length).toBeGreaterThanOrEqual(0.25);
  });
});

// ── Deck Building ───────────────────────────────────────────

describe('Expanded Card Pool: Deck Building', () => {
  it('business deck with 3 copies should have 90 cards', () => {
    expect(createBusinessDeck(3)).toHaveLength(90);
  });

    it('event deck with 3 copies should have 168 cards', () => {
    expect(createEventDeck(3, undefined, _rng, 1)).toHaveLength(168); // 56 x 3 (+1 Graffiti Art)
  });

  it('upgrade deck with 2 copies should have 78 cards', () => {
    expect(createUpgradeDeck(2)).toHaveLength(78);
  });

  it('deck copies should have distinct IDs', () => {
    const deck = createBusinessDeck(3);
    const ids = deck.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('deck copies should preserve template fields', () => {
    const deck = createBusinessDeck(2);
    const bakeries = deck.filter(c => c.name === 'Bakery');
    expect(bakeries).toHaveLength(2);
    for (const b of bakeries) {
      expect(b.cost).toBe(3);
      expect(b.baseIncome).toBe(2.3); // raised 0.5 → 2.3 by CG-0MSVYPEZ90085SHE
      expect(b.synergyTypes).toEqual(['Food']);
    }
  });
});

// ── synergyColor ────────────────────────────────────────────

describe('Expanded Card Pool: synergyColor', () => {
  it('should return a color for Food', () => {
    expect(synergyColor('Food')).toBe(0xE67E22);
  });

  it('should return a color for Culture', () => {
    expect(synergyColor('Culture')).toBe(0x3498DB);
  });

  it('should return a color for Commerce', () => {
    expect(synergyColor('Commerce')).toBe(0x27AE60);
  });

  it('should return a color for Service (M2)', () => {
    expect(synergyColor('Service')).toBe(0x9B59B6);
  });

  it('should return a color for Entertainment (M2)', () => {
    expect(synergyColor('Entertainment')).toBe(0xE74C3C);
  });

  it('all synergy colors should be distinct', () => {
    const types: SynergyType[] = ['Food', 'Culture', 'Commerce', 'Service', 'Entertainment'];
    const colors = types.map(t => synergyColor(t));
    expect(new Set(colors).size).toBe(types.length);
  });
});

// ── Seeded Game Setup ───────────────────────────────────────

describe('Expanded Card Pool: Seeded Deck Resolution', () => {
  it('should produce deterministic deck ordering for the same seed', () => {
    const state1 = setupMainStreetGame({ seed: 'expanded-pool-test' });
    const state2 = setupMainStreetGame({ seed: 'expanded-pool-test' });

    // Market should be identical
    expect(state1.market.cards.map(c => c.id)).toEqual(state2.market.cards.map(c => c.id));
    expect(state1.market.cards.map(c => c.id)).toEqual(state2.market.cards.map(c => c.id));
    expect(state1.incidentDeck.map(c => c.id)).toEqual(state2.incidentDeck.map(c => c.id));
  });

  it('should produce different deck ordering for different seeds', () => {
    const state1 = setupMainStreetGame({ seed: 'seed-alpha' });
    const state2 = setupMainStreetGame({ seed: 'seed-beta' });

    // At least one market row should differ
    const biz1 = state1.market.cards.map(c => c.id).join(',');
    const biz2 = state2.market.cards.map(c => c.id).join(',');
    const inv1 = state1.market.cards.map(c => c.id).join(',');
    const inv2 = state2.market.cards.map(c => c.id).join(',');

    expect(biz1 !== biz2 || inv1 !== inv2).toBe(true);
  });

  it('setup should account for all cards (market + deck + queue = total)', () => {
    const state = setupMainStreetGame({ seed: 'accounting-test' });

    const bizTotal = state.market.cards.filter(c => c.family === 'business').length + state.decks.business.length;
    expect(bizTotal).toBe(createBusinessDeck().length);

    const eventTotal = state.market.cards.filter(c => c.family === 'event').length
      + state.decks.event.length
      + state.incidentDeck.length
      + (state.hand ?? []).filter(c => c.family === 'event').length;
    const multiplier = getPreset(undefined).positiveIncidentMultiplier;
    expect(eventTotal).toBe(createEventDeck(3, undefined, _rng, multiplier).length);

    const upgTotal = state.market.cards.filter(c => c.family === 'upgrade').length
      + state.decks.upgrade.length;
    expect(upgTotal).toBe(createUpgradeDeck().length);
  });
});

// ── Synergy Coverage Distribution ───────────────────────────

describe('Expanded Card Pool: Synergy Coverage', () => {
  it('all 5 synergy types should be represented in business cards', () => {
    const types: SynergyType[] = ['Food', 'Culture', 'Commerce', 'Service', 'Entertainment'];
    for (const st of types) {
      const cards = businessDeck.filter(c => c.synergyTypes.includes(st));
      expect(cards.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('no synergy type should exceed 10 business cards (expansion cap)', () => {
    // Bound relaxed from 6 to 10 by Group A (CG-0MSQJ1XIB0004QVN): the Health
    // bridge expansion adds 5 Health cards (8 total), Food and Culture reach 7
    // each, while Commerce/Service/Entertainment stay at 5-6. The cap keeps
    // any single type from dominating the pool while allowing the contracted
    // bridge cards (which count toward two types each).
    const types: SynergyType[] = ['Food', 'Culture', 'Commerce', 'Service', 'Entertainment', 'Health'];
    for (const st of types) {
      const count = businessDeck.filter(c => c.synergyTypes.includes(st)).length;
      expect(count).toBeLessThanOrEqual(10);
    }
  });

  it('cost distribution should span at least 4-10 range', () => {
    const costs = businessDeck.map(c => c.cost);
    expect(Math.min(...costs)).toBeLessThanOrEqual(4);
    expect(Math.max(...costs)).toBeGreaterThanOrEqual(10);
  });
});
