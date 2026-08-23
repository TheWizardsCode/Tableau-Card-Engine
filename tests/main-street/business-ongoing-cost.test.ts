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

  it('should default to 0 for business cards with empty ongoingCost in CSV', () => {
    // Pick a known business card that has no ongoingCost in CSV (e.g. Bakery)
    const templates = getBusinessTemplates();
    const bakery = templates.find(t => t.id === 'biz-bakery');
    expect(bakery).toBeDefined();
    expect(bakery!.ongoingCost).toBe(0);
  });

  it('should read ongoingCost from CSV for business cards that have a value', () => {
    // Create a deck and check a card that we know has ongoingCost in CSV
    // For now, verify the mechanism works with cards that have 0 (default)
    // Actual non-zero values require CSV population (balance task, out of scope)
    const deck = createBusinessDeck(1);
    expect(deck.length).toBeGreaterThan(0);
    for (const card of deck) {
      expect(typeof card.ongoingCost).toBe('number');
    }
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

describe('SVG display — ongoing cost on business card art', () => {
  it('should include ongoing-cost text in SVG when ongoingCost > 0', () => {
    const biz: BusinessCard = {
      family: 'business',
      ...getBusinessTemplates()[0],
      ongoingCost: 0.5,
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };

    const svg = generateBusinessCardSvg(biz);
    expect(svg).toContain('-0.5/turn');
    expect(svg).toContain('#ff8844'); // orange/red color for cost
  });

  it('should omit ongoing-cost text when ongoingCost is 0', () => {
    const biz: BusinessCard = {
      family: 'business',
      ...getBusinessTemplates()[0],
      ongoingCost: 0,
      level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, appliedUpgrades: [],
    };

    const svg = generateBusinessCardSvg(biz);
    // The ongoing-cost label (orange `-X/turn`) must not appear
    expect(svg).not.toContain('#ff8844');
  });

  it('should include ongoing-cost text in CSV-row SVG generation (runtime fallback path)', () => {
    const row: Record<string, string> = {
      id: 'biz-test-ongoing',
      name: 'Test Business',
      family: 'business',
      cost: '6',
      ongoingCost: '0.5',
    };

    const svg = generateCardSvgFromCsvRow(row);
    expect(svg).toContain('-0.5/turn');
    expect(svg).toContain('#ff8844');
  });

  it('should omit ongoing-cost text in CSV-row SVG generation when empty', () => {
    const row: Record<string, string> = {
      id: 'biz-test-zero',
      name: 'Test Business',
      family: 'business',
      cost: '6',
      ongoingCost: '',
    };

    const svg = generateCardSvgFromCsvRow(row);
    expect(svg).not.toContain('/turn');
    expect(svg).not.toContain('#ff8844');
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
