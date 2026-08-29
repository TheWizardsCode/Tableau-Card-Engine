/**
 * Business Card Ongoing-Cost Tests (CG-0MSVYPEZ90085SHE)
 *
 * Validates that every business card gains a `ongoingCost` field that is
 * deducted from coins every turn during the income phase — whether the card
 * is placed on the street grid or held in the player's hand.
 *
 * Acceptance criteria covered:
 *   (a) `ongoingCost` is parsed from CSV for business cards
 *   (b) `applyBusinessOngoingCosts` deducts from both hand and street cards
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

  it('should parse ongoingCost from CSV as 1/4 of purchase price (min 0.25)', () => {
    // Every business row in card-data.csv carries ongoingCost = max(0.25, cost / 4).
    const templates = getBusinessTemplates();
    const byId = new Map(templates.map(t => [t.id, t]));
    expect(byId.get('biz-bakery')!.ongoingCost).toBe(0.75);   // cost 3 -> 0.75
    expect(byId.get('biz-laundromat')!.ongoingCost).toBe(1);   // cost 4 -> 1
    expect(byId.get('biz-barbershop')!.ongoingCost).toBe(1.25); // cost 5 -> 1.25
    expect(byId.get('biz-teahouse')!.ongoingCost).toBe(1.75);   // cost 7 -> 1.75
    expect(byId.get('biz-gallery')!.ongoingCost).toBe(3.5);     // cost 14 -> 3.5
    expect(byId.get('biz-hotel')!.ongoingCost).toBe(4);         // cost 16 -> 4
  });

  it('should carry ongoingCost through to deck cards created from templates', () => {
    const deck = createBusinessDeck(1);
    const teahouse = deck.find(c => c.id.startsWith('biz-teahouse'));
    expect(teahouse).toBeDefined();
    expect(teahouse!.ongoingCost).toBe(1.75);
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
    addBusinessToHand(state, legacyNoField);

    const coinsBefore = state.resourceBank.coins;
    applyBusinessOngoingCosts(state);
    expect(state.resourceBank.coins).toBe(coinsBefore);
  });
});

// ── AC (b)-(c): applyBusinessOngoingCosts ──────────────────

describe('applyBusinessOngoingCosts — deduction logic', () => {
  it('should deduct ongoing costs from both hand and street business cards', () => {
    const state = createTestState('hand-street-costs');
    // Give the player enough coins to cover all costs
    state.resourceBank.coins = 100;

    // Create business cards with known ongoing costs
    const streetBiz: BusinessCard = {
      family: 'business',
      ...getBusinessTemplates()[0],
      ongoingCost: 1.0,
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };
    const handBiz1: BusinessCard = {
      family: 'business',
      ...getBusinessTemplates()[1] ?? getBusinessTemplates()[0],
      ongoingCost: 0.5,
      id: 'test-hand-biz-1',
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };
    const handBiz2: BusinessCard = {
      family: 'business',
      ...getBusinessTemplates()[0],
      ongoingCost: 0.5,
      id: 'test-hand-biz-2',
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };

    placeBusinessOnGrid(state, streetBiz);
    addBusinessToHand(state, handBiz1);
    addBusinessToHand(state, handBiz2);

    const coinsBefore = state.resourceBank.coins;
    applyBusinessOngoingCosts(state);

    // Total ongoing cost = 1.0 (street) + 0.5 (hand1) + 0.5 (hand2) = 2.0
    expect(state.resourceBank.coins).toBe(coinsBefore - 2.0);
  });

  it('should clamp coins at 0 when costs exceed available coins', () => {
    const state = createTestState('clamp-at-zero');
    state.resourceBank.coins = 0.5;

    const biz: BusinessCard = {
      family: 'business',
      ...getBusinessTemplates()[0],
      ongoingCost: 2.0,
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };

    addBusinessToHand(state, biz);

    applyBusinessOngoingCosts(state);

    // Coins should be clamped at 0, not go negative
    expect(state.resourceBank.coins).toBe(0);
  });

  it('should deduct only from business cards (not staff or community-space)', () => {
    const state = createTestState('business-only');
    state.resourceBank.coins = 100;

    // Only business cards should be charged
    const biz: BusinessCard = {
      family: 'business',
      ...getBusinessTemplates()[0],
      ongoingCost: 0.5,
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };

    addBusinessToHand(state, biz);

    const coinsBefore = state.resourceBank.coins;
    applyBusinessOngoingCosts(state);

    expect(state.resourceBank.coins).toBe(coinsBefore - 0.5);
  });

  it('should be a no-op when there are no business cards in hand or on grid', () => {
    const state = createTestState('no-business-cards');
    state.resourceBank.coins = 100;

    const coinsBefore = state.resourceBank.coins;
    applyBusinessOngoingCosts(state);

    expect(state.resourceBank.coins).toBe(coinsBefore);
  });

  it('should be a no-op when all business cards have ongoingCost of 0', () => {
    const state = createTestState('zero-cost');
    state.resourceBank.coins = 100;

    const biz: BusinessCard = {
      family: 'business',
      ...getBusinessTemplates()[0],
      ongoingCost: 0,
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };

    addBusinessToHand(state, biz);

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
      ongoingCost: 0.5,
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };

    const svg = generateBusinessCardSvg(biz);
    // The `-X/turn` label is no longer baked into the card face — the overlay
    // cash line (`Cash: +X / -Y`) now carries the cost (CG-0MTDMOYOL008IQVO).
    expect(svg).not.toContain('-0.5/turn');
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
      ongoingCost: 0.5,
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };

    const tooltip = buildCardTooltipInfo(biz, { synergyBonusPerNeighbor: 1 });
    expect(tooltip).toContain('Ongoing cost: -0.5/turn');
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

// ── Producer regression: Tea house held in hand (real CSV data) ──────

describe('producer regression — business card in hand costs 1/4 purchase price per turn', () => {
  it('should deduct 1.75/turn for the Tea house (cost 7) held in hand', () => {
    // Producer scenario: a business card in hand, no income from built
    // businesses, 6 coins in the bank. Expected loss: 7 * 0.25 = 1.75.
    const state = createTestState('teahouse-in-hand');
    state.resourceBank.coins = 6;
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
    expect(state.resourceBank.coins).toBeCloseTo(6 - 1.75, 5);
    expect(state.activityLog.some(l => l.text.includes('Business costs: -1.75'))).toBe(true);
  });

  it('should clamp coins at 0 when a hand card costs more than available coins', () => {
    const state = createTestState('teahouse-clamp');
    state.resourceBank.coins = 0.5;
    state.streetGrid = [];
    state.incidentDeck = [];

    const deck = createBusinessDeck(1);
    const teahouse = deck.find(c => c.id.startsWith('biz-teahouse'));
    addBusinessToHand(state, teahouse!);
    state.phase = 'MarketPhase';

    processEndOfTurn(state);

    expect(state.resourceBank.coins).toBe(0);
    expect(state.activityLog.some(l => l.text.includes('Insufficient coins'))).toBe(true);
  });
});

// ── AC (e): processEndOfTurn integration ────────────────────

describe('processEndOfTurn — income phase chains applyBusinessOngoingCosts', () => {
  it('should deduct business ongoing costs during the IncomePhase of processEndOfTurn', () => {
    const state = createTestState('end-of-turn-chain');
    state.resourceBank.coins = 20;

    const biz: BusinessCard = {
      family: 'business',
      ...getBusinessTemplates()[0],
      ongoingCost: 1.0,
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
    // With baseIncome 0 and ongoingCost 1.0, coins drop by exactly 1.0.
    const result = processEndOfTurn(state);

    expect(result.income).toBeDefined();
    expect(state.resourceBank.coins).toBeCloseTo(19, 5);
    expect(state.activityLog.some(l => l.text.includes('Business costs'))).toBe(true);
  });

  it('should deduct both hand and street business costs through the full turn loop', () => {
    const state = createTestState('end-of-turn-hand-and-street');
    state.resourceBank.coins = 20;

    const streetBiz: BusinessCard = {
      family: 'business',
      ...getBusinessTemplates()[0],
      ongoingCost: 1.0,
      baseIncome: 0,
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };
    const handBiz: BusinessCard = {
      family: 'business',
      ...getBusinessTemplates()[0],
      ongoingCost: 0.5,
      baseIncome: 0,
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };

    placeBusinessOnGrid(state, streetBiz);
    addBusinessToHand(state, handBiz);

    state.incidentDeck = [];
    state.phase = 'MarketPhase';

    processEndOfTurn(state);

    // Total business ongoing cost = 1.0 (street) + 0.5 (hand) = 1.5
    expect(state.resourceBank.coins).toBeCloseTo(18.5, 5);
    expect(state.activityLog.some(l => l.text.includes('Business costs'))).toBe(true);
  });
});
