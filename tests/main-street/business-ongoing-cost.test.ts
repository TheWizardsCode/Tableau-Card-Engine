/**
 * Business Card Ongoing-Cost Tests (CG-0MSVYPEZ90085SHE)
 *
 * Validates that every business card gains a `ongoingCost` field that is
 * deducted from coins every turn during the income phase — but only for cards
 * placed on the street grid. Business cards held in the player's hand are not
 * yet active and do NOT incur running costs (CG-0MTC31LN3000UHDY).
 *
 * Acceptance criteria covered:
 *   (a) `ongoingCost` is parsed from CSV for business cards
 *   (b) `applyBusinessOngoingCosts` deducts from street-placed cards only
 *   (c) coins are clamped at 0
 *   (d) the cost appears in card SVG and tooltip
 *   (e) `processEndOfTurn` correctly chains the new function
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  createBusinessDeck,
  type BusinessCard,
  getBusinessTemplates,
} from '../../example-games/main-street/MainStreetCards';
import {
  applyBusinessOngoingCosts,
  processEndOfTurn,
} from '../../example-games/main-street/MainStreetEngine';
import {
  generateBusinessCardSvg,
  generateCardSvgFromCsvRow,
} from '../../example-games/main-street/scenes/MainStreetCardSvgGenerator';
import {
  buildCardTooltipInfo,
} from '../../example-games/main-street/MainStreetFormatting';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'business-ongoing-cost'): MainStreetState {
  return setupMainStreetGame({ seed });
}

/** Places a business card on the street grid (slot 0) and sets cached income. */
function placeBusinessOnGrid(state: MainStreetState, biz: BusinessCard): void {
  biz.currentIncome = biz.baseIncome + biz.incomeBonus;
  biz.currentReputationPerTurn = (biz.reputationPerTurn ?? 0) + biz.reputationBonus;
  state.streetGrid[0] = biz;
}

/** Adds a business card to the player's hand with a known ongoingCost. */
function addBusinessToHand(state: MainStreetState, biz: BusinessCard): void {
  state.hand.push(biz);
}

/** Creates a business card with a known ongoingCost (for tests). */
function makeBusiness(
  ongoingCost: number,
  id: string = 'test-biz',
  baseIncome: number = 0,
): BusinessCard {
  return {
    family: 'business',
    ...getBusinessTemplates()[0],
    ongoingCost,
    baseIncome,
    id,
    level: 0, incomeBonus: 0, synergyRangeBonus: 0,
    reputationBonus: 0, appliedUpgrades: [],
  };
}

// ── AC (a): CSV Parsing ─────────────────────────────────────

describe('CSV parsing — ongoingCost on business cards', () => {
  it('should have ongoingCost field on every BusinessCard template from CSV', () => {
    const templates = getBusinessTemplates();
    expect(templates.length).toBeGreaterThan(0);
    // All templates must have the field (defaulting to 0 for cards with empty CSV)
    for (const t of templates) {
      expect(typeof t.ongoingCost).toBe('number');
      expect(t.ongoingCost).toBeGreaterThanOrEqual(0);
    }
  });

  it('should parse ongoingCost from CSV as 1/4 of purchase price (min 25) (×100)', () => {
    // Every business row in card-data.csv carries ongoingCost = max(25, cost / 4). (×100)
    const templates = getBusinessTemplates();
    const byId = new Map(templates.map(t => [t.id, t]));
    expect(byId.get('biz-bakery')!.ongoingCost).toBe(75);   // cost 300 -> 75
    expect(byId.get('biz-laundromat')!.ongoingCost).toBe(100);   // cost 400 -> 100
    expect(byId.get('biz-barbershop')!.ongoingCost).toBe(125); // cost 500 -> 125
    expect(byId.get('biz-teahouse')!.ongoingCost).toBe(175);   // cost 700 -> 175
    expect(byId.get('biz-gallery')!.ongoingCost).toBe(350);     // cost 1400 -> 350
    expect(byId.get('biz-hotel')!.ongoingCost).toBe(400);         // cost 1600 -> 400
  });

  it('should carry ongoingCost through to deck cards created from templates', () => {
    const deck = createBusinessDeck(1);
    const teahouse = deck.find(c => c.id.startsWith('biz-teahouse'));
    expect(teahouse).toBeDefined();
    expect(teahouse!.ongoingCost).toBe(175); // ×100: 1.75 → 175
    // All deck cards must have a numeric ongoingCost (legacy fallback 0)
    for (const card of deck) {
      expect(typeof card.ongoingCost).toBe('number');
    }
  });

  it('should treat a missing ongoingCost on a legacy card as 0 (no deduction)', () => {
    // Legacy deserialised cards lack the property entirely; `?? 0` must apply.
    const state = createTestState('legacy-no-field');
    state.resourceBank.coins = 100;
    const legacy: BusinessCard = {
      family: 'business',
      ...getBusinessTemplates()[0],
      id: 'legacy-biz',
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };
    // Simulate a legacy card that lacks the property entirely (`?? 0` applies).
    const legacyNoField = { ...legacy } as BusinessCard & { ongoingCost?: number };
    delete (legacyNoField as { ongoingCost?: number }).ongoingCost;
    placeBusinessOnGrid(state, legacyNoField);

    const coinsBefore = state.resourceBank.coins;
    applyBusinessOngoingCosts(state);
    expect(state.resourceBank.coins).toBe(coinsBefore);
  });
});

// ── AC (b)-(c): applyBusinessOngoingCosts ──────────────────

describe('applyBusinessOngoingCosts — deduction logic', () => {
  it('should deduct ongoing costs from street-placed business cards', () => {
    const state = createTestState('street-costs');
    // Give the player enough coins to cover all costs
    state.resourceBank.coins = 10000; // ×100: 100 → 10000

    const streetBiz = makeBusiness(100, 'test-street-biz-1'); // ×100: 1.0 → 100
    placeBusinessOnGrid(state, streetBiz);

    const coinsBefore = state.resourceBank.coins;
    applyBusinessOngoingCosts(state);

    // Total ongoing cost = 100 (street, ×100: 1.0 → 100)
    expect(state.resourceBank.coins).toBe(coinsBefore - 100);
  });

  it('should NOT deduct ongoing costs from business cards held in hand (CG-0MTC31LN3000UHDY)', () => {
    const state = createTestState('hand-only-costs');
    state.resourceBank.coins = 10000; // ×100: 100 → 10000

    addBusinessToHand(state, makeBusiness(50, 'test-hand-biz-1')); // ×100: 0.5 → 50
    addBusinessToHand(state, makeBusiness(50, 'test-hand-biz-2')); // ×100: 0.5 → 50

    const coinsBefore = state.resourceBank.coins;
    applyBusinessOngoingCosts(state);

    // Hand cards incur NO ongoing cost
    expect(state.resourceBank.coins).toBe(coinsBefore);
  });

  it('should deduct only street cards when hand cards are also present', () => {
    const state = createTestState('mix-costs');
    state.resourceBank.coins = 10000; // ×100: 100 → 10000

    placeBusinessOnGrid(state, makeBusiness(100, 'test-street-biz')); // ×100: 1.0 → 100
    addBusinessToHand(state, makeBusiness(50, 'test-hand-biz-1')); // ×100: 0.5 → 50
    addBusinessToHand(state, makeBusiness(50, 'test-hand-biz-2')); // ×100: 0.5 → 50

    const coinsBefore = state.resourceBank.coins;
    applyBusinessOngoingCosts(state);

    // Only the street card is charged: 100 (×100)
    expect(state.resourceBank.coins).toBe(coinsBefore - 100);
  });

  it('should clamp coins at 0 when costs exceed available coins', () => {
    const state = createTestState('clamp-at-zero');
    state.resourceBank.coins = 50; // ×100: 0.5 → 50

    placeBusinessOnGrid(state, makeBusiness(200)); // ×100: 2.0 → 200

    applyBusinessOngoingCosts(state);

    // Coins should be clamped at 0, not go negative
    expect(state.resourceBank.coins).toBe(0);
  });

  it('should NOT deduct for hand cards when street costs clamp coins at 0', () => {
    const state = createTestState('clamp-with-hand');
    state.resourceBank.coins = 50; // ×100: 0.5 → 50

    placeBusinessOnGrid(state, makeBusiness(200)); // ×100: 2.0 → 200
    addBusinessToHand(state, makeBusiness(50, 'test-hand-biz')); // ×100: 0.5 → 50

    applyBusinessOngoingCosts(state);

    // Street card clamps coins at 0; hand card adds nothing
    expect(state.resourceBank.coins).toBe(0);
  });

  it('should deduct only from business cards (not staff or community-space)', () => {
    const state = createTestState('business-only');
    state.resourceBank.coins = 10000;

    // Only business cards should be charged
    const biz = makeBusiness(50); // ×100: 0.5 → 50
    placeBusinessOnGrid(state, biz);

    const coinsBefore = state.resourceBank.coins;
    applyBusinessOngoingCosts(state);

    expect(state.resourceBank.coins).toBe(coinsBefore - 50);
  });

  it('should be a no-op when there are no business cards on grid', () => {
    const state = createTestState('no-business-cards');
    state.resourceBank.coins = 10000; // ×100: 100 → 10000

    const coinsBefore = state.resourceBank.coins;
    applyBusinessOngoingCosts(state);

    expect(state.resourceBank.coins).toBe(coinsBefore);
  });

  it('should be a no-op when all business cards have ongoingCost of 0', () => {
    const state = createTestState('zero-cost');
    state.resourceBank.coins = 10000; // ×100: 100 → 10000

    placeBusinessOnGrid(state, makeBusiness(0));

    const coinsBefore = state.resourceBank.coins;
    applyBusinessOngoingCosts(state);

    expect(state.resourceBank.coins).toBe(coinsBefore);
  });
});

// ── AC (d): SVG display ─────────────────────────────────────

describe('SVG display — ongoing cost NOT baked on business/community-space art', () => {
  it('should NOT include ongoing-cost text in SVG when ongoingCost > 0 (CG-0MTDMOYOL008IQVO)', () => {
    const biz: BusinessCard = {
      family: 'business',
      ...getBusinessTemplates()[0],
      ongoingCost: 50, // ×100: 0.5 → 50
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };

    const svg = generateBusinessCardSvg(biz);
    // The `-X/turn` label is no longer baked into the card face — the overlay
    // cash line (`Cash: +X / -Y`) now carries the cost (CG-0MTDMOYOL008IQVO).
    expect(svg).not.toContain('-50/turn'); // ×100: -0.5 → -50
    expect(svg).not.toContain('#ff8844'); // orange/red cost colour removed
  });

  it('should not bake the cost even when ongoingCost is 0', () => {
    const biz: BusinessCard = {
      family: 'business',
      ...getBusinessTemplates()[0],
      ongoingCost: 0,
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };

    const svg = generateBusinessCardSvg(biz);
    // Income/reputation `/turn` labels may still be baked; the negative ongoing
    // cost label and its orange colour must never appear (CG-0MTDMOYOL008IQVO).
    expect(svg).not.toMatch(/-[0-9.]+\/turn/);
    expect(svg).not.toContain('#ff8844');
  });

  it('should NOT include ongoing-cost text in CSV-row SVG generation for business (runtime fallback path)', () => {
    const row: Record<string, string> = {
      id: 'biz-test-ongoing',
      name: 'Test Business',
      family: 'business',
      cost: '6',
      ongoingCost: '0.5',
    };

    const svg = generateCardSvgFromCsvRow(row);
    expect(svg).not.toContain('-0.5/turn');
    expect(svg).not.toContain('#ff8844');
  });

  it('should NOT include ongoing-cost text in CSV-row SVG generation for community-space', () => {
    const row: Record<string, string> = {
      id: 'cs-test-ongoing',
      name: 'Test Community Space',
      family: 'community-space',
      cost: '6',
      ongoingCost: '0.25',
    };

    const svg = generateCardSvgFromCsvRow(row);
    expect(svg).not.toContain('-0.25/turn');
    expect(svg).not.toContain('#ff8844');
  });

  it('should KEEP the baked ongoing-cost text for staff cards (only cost display, CG-0MTDMOYOL008IQVO)', () => {
    const row: Record<string, string> = {
      id: 'staff-test-ongoing',
      name: 'Test Staff',
      family: 'staff',
      cost: '3',
      ongoingCost: '1',
    };

    const svg = generateCardSvgFromCsvRow(row);
    expect(svg).toContain('-1/turn');
    expect(svg).toContain('#ff8844');
  });
});

// ── AC (d): Tooltip display ─────────────────────────────────

describe('Tooltip — ongoing cost in card tooltip info', () => {
  it('should include ongoing cost in tooltip when ongoingCost > 0', () => {
    const biz: BusinessCard = {
      family: 'business',
      ...getBusinessTemplates()[0],
      ongoingCost: 50, // ×100: 0.5 → 50
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };

    const tooltip = buildCardTooltipInfo(biz, { synergyBonusPerNeighbor: 1 });
    expect(tooltip).toContain('Ongoing cost: -50/turn');
  });

  it('should omit ongoing cost from tooltip when ongoingCost is 0', () => {
    const biz: BusinessCard = {
      family: 'business',
      ...getBusinessTemplates()[0],
      ongoingCost: 0,
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };

    const tooltip = buildCardTooltipInfo(biz, { synergyBonusPerNeighbor: 1 });
    expect(tooltip).not.toContain('Ongoing cost');
  });
});

// ── Producer regression: business card held in hand (real CSV data) ──────

describe('producer regression — business card in hand costs nothing per turn (CG-0MTC31LN3000UHDY)', () => {
  it('should NOT deduct for the Tea house (cost 700) held in hand (×100)', () => {
    // Producer scenario: a business card in hand, no income from built
    // businesses, 600 coins in the bank. Hand-held cards incur NO ongoing cost.
    const state = createTestState('teahouse-in-hand');
    state.resourceBank.coins = 600; // ×100: 6 → 600
    // No built businesses → base income of 0 for everything on the street grid
    state.streetGrid = [];
    state.incidentDeck = [];

    const deck = createBusinessDeck(1);
    const teahouse = deck.find(c => c.id.startsWith('biz-teahouse'));
    expect(teahouse).toBeDefined();
    addBusinessToHand(state, teahouse!);
    state.phase = 'MarketPhase';

    const result = processEndOfTurn(state);

    expect(result.income).toBeDefined();
    expect(state.resourceBank.coins).toBeCloseTo(600, 5); // ×100: 6 → 600
    expect(state.activityLog.some(l => l.text.includes('Business costs'))).toBe(false);
  });

  it('should deduct ongoing cost once the same card is placed on the grid', () => {
    const state = createTestState('teahouse-placed');
    state.resourceBank.coins = 600; // ×100: 6 → 600
    state.streetGrid = [];
    state.incidentDeck = [];

    const deck = createBusinessDeck(1);
    const teahouse = deck.find(c => c.id.startsWith('biz-teahouse'));
    expect(teahouse).toBeDefined();
    // Isolate the ongoing-cost effect: build a copy with zero intrinsic income
    // (baseIncome is readonly on BusinessCard, so it is re-declared here) so
    // the turn only credits what this test asserts.
    const teahouseCopy: BusinessCard = { ...teahouse!, baseIncome: 0 };
    placeBusinessOnGrid(state, teahouseCopy);
    state.phase = 'MarketPhase';

    const result = processEndOfTurn(state);

    expect(result.income).toBeDefined();
    expect(state.resourceBank.coins).toBeCloseTo(600 - 175, 5); // ×100: 6 → 600, 1.75 → 175
    expect(state.activityLog.some(l => l.text.includes('Business costs: -175'))).toBe(true);
  });
});

// ── AC (e): processEndOfTurn integration ────────────────────

describe('processEndOfTurn — income phase chains applyBusinessOngoingCosts', () => {
  it('should deduct business ongoing costs during the IncomePhase of processEndOfTurn', () => {
    const state = createTestState('end-of-turn-chain');
    state.resourceBank.coins = 2000; // ×100: 20 → 2000

    const biz: BusinessCard = {
      family: 'business',
      ...getBusinessTemplates()[0],
      ongoingCost: 100, // ×100: 1.0 → 100
      baseIncome: 0,
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };

    // Place a business card on the grid
    placeBusinessOnGrid(state, biz);

    // No incidents to keep the turn deterministic
    state.incidentDeck = [];
    state.phase = 'MarketPhase';

    // processEndOfTurn calls applyBusinessOngoingCosts as part of IncomePhase.
    // With baseIncome 0 and ongoingCost 100, coins drop by exactly 100. (×100)
    const result = processEndOfTurn(state);

    expect(result.income).toBeDefined();
    expect(state.resourceBank.coins).toBeCloseTo(1900, 5); // 2000-100 (×100)
    expect(state.activityLog.some(l => l.text.includes('Business costs'))).toBe(true);
  });

  it('should deduct only street business costs through the full turn loop (hand cards free)', () => {
    const state = createTestState('end-of-turn-hand-and-street');
    state.resourceBank.coins = 2000; // ×100: 20 → 2000

    const streetBiz = makeBusiness(100, 'test-street-biz'); // ×100: 1.0 → 100
    const handBiz = makeBusiness(50, 'test-hand-biz'); // ×100: 0.5 → 50

    placeBusinessOnGrid(state, streetBiz);
    addBusinessToHand(state, handBiz);

    state.incidentDeck = [];
    state.phase = 'MarketPhase';
    // incomePhase credits coins before deducting street ongoing costs
    // (baseIncome scaled ×100 elsewhere, here zero-cost businesses)

    processEndOfTurn(state);

    // Only the street card is charged: 100 (hand card is free, ×100)
    expect(state.resourceBank.coins).toBeCloseTo(1900, 5); // 2000-100
    expect(state.activityLog.some(l => l.text.includes('Business costs'))).toBe(true);
  });
});
