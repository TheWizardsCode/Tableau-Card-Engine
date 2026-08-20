/**
 * Main Street: Group F — Staff ability expansion tests (CG-0MSQJ7VL9009JHF4)
 *
 * Validates the 4 new staff cards added by the "Main Street: design 50+ new
 * cards of varying types" epic (CG-0MSQE2NLX003ADIY), Group F:
 *
 * - Staff template count grows from 3 to 7 (AC1).
 * - Staff abilities are engine-supported and unit-tested (AC2): the
 *   Socialite's +0.1 rep/turn accrues during the income phase, and the
 *   Accountant reduces the investments-refresh cost by 1.
 * - Staff without abilities (Apprentice, Executive, and the existing
 *   Assistant/Manager/Director) behave exactly as before (AC3).
 * - All IDs unique (AC4); staff cards carry no tier (existing convention).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  getCsvRows,
  createStaffDeck,
  createBusinessDeck,
  createCommunitySpaceDeck,
  createEventDeck,
  createUpgradeDeck,
  CARD_TIER_MAP,
  CARD_TEMPLATE_NAMES,
  type StaffCard,
} from '../../example-games/main-street/MainStreetCards';
import { validateCsvRows } from '../../src/balance-cards';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { applyIncome, recalculateCard } from '../../example-games/main-street/MainStreetAdjacency';
import { canRefreshMarket, refreshMarket, refreshMarketCost } from '../../example-games/main-street/MainStreetMarket';
import { createSeededRng } from '../../src/core-engine';
import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';

// ── Design contract (from epic CG-0MSQE2NLX003ADIY, Group F) ──────────

interface NewStaffContract {
  id: string;
  name: string;
  cost: number;
  ongoingCost: number;
  handSlotsAdded: number;
  reputationPerTurn?: number;
  refreshCostDiscount?: number;
}

const NEW_STAFF_CONTRACTS: NewStaffContract[] = [
  { id: 'staff-apprentice', name: 'Apprentice', cost: 2, ongoingCost: 0.5, handSlotsAdded: 1 },
  { id: 'staff-executive', name: 'Executive', cost: 20, ongoingCost: 5, handSlotsAdded: 4 },
  { id: 'staff-socialite', name: 'Socialite', cost: 8, ongoingCost: 1.5, handSlotsAdded: 1, reputationPerTurn: 0.1 },
  { id: 'staff-accountant', name: 'Accountant', cost: 8, ongoingCost: 1.5, handSlotsAdded: 1, refreshCostDiscount: 1 },
];

function findStaff(deck: readonly StaffCard[], id: string): StaffCard | undefined {
  return deck.find(c => c.id.startsWith(id));
}

// ── AC1: Template count ───────────────────────────────────────────────

describe('Group F staff expansion: template count (AC1)', () => {
  it('grows staff templates from 3 to exactly 9 (incl. General Manager + Lookout)', () => {
    expect(createStaffDeck(1)).toHaveLength(9);
  });

  it('adds exactly the 4 contracted card IDs', () => {
    const existingIds = new Set(getCsvRows().filter(r => r.family === 'staff').map(r => r.id));
    for (const c of NEW_STAFF_CONTRACTS) {
      expect(existingIds.has(c.id), `${c.id} missing from card-data.csv`).toBe(true);
    }
  });
});

// ── AC4: Uniqueness & tier convention ─────────────────────────────────

describe('Group F staff expansion: uniqueness & tier convention (AC4)', () => {
  it('keeps every card ID in the CSV unique', () => {
    const ids = getCsvRows().map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('staff cards carry no tier (existing convention)', () => {
    for (const c of NEW_STAFF_CONTRACTS) {
      expect(CARD_TIER_MAP.has(c.id), `${c.id} should not be tier-assigned`).toBe(false);
    }
  });

  it('staff cards are not tier-registered (existing convention)', () => {
    // CARD_TEMPLATE_NAMES/CARD_TIER_MAP cover tiered families only; staff
    // cards carry no tier and are intentionally absent from both maps.
    for (const c of NEW_STAFF_CONTRACTS) {
      expect(CARD_TEMPLATE_NAMES.has(c.id), `${c.id} should not be in CARD_TEMPLATE_NAMES`).toBe(false);
      expect(CARD_TIER_MAP.has(c.id), `${c.id} should not be tier-assigned`).toBe(false);
    }
  });
});

// ── Design contract stats ─────────────────────────────────────────────

describe('Group F staff expansion: design contract stats', () => {
  const deck = createStaffDeck(1);

  for (const contract of NEW_STAFF_CONTRACTS) {
    it(`matches the contract for ${contract.id} (${contract.name})`, () => {
      const card = findStaff(deck, contract.id);
      expect(card, `${contract.id} missing`).toBeDefined();
      expect(card!.family).toBe('staff');
      expect(card!.name).toBe(contract.name);
      expect(card!.cost).toBe(contract.cost);
      expect(card!.ongoingCost).toBe(contract.ongoingCost);
      expect(card!.handSlotsAdded).toBe(contract.handSlotsAdded);
      expect(card!.reputationPerTurn ?? 0).toBe(contract.reputationPerTurn ?? 0);
      expect(card!.refreshCostDiscount ?? 0).toBe(contract.refreshCostDiscount ?? 0);
      expect(card!.description.length).toBeGreaterThan(0);
    });
  }
});

// ── AC2: Socialite reputation ability ─────────────────────────────────

/** Minimal BusinessCard helper (needed for a non-empty income phase). */
function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business',
    id: overrides.id ?? 'test-biz',
    name: overrides.name ?? 'Test Biz',
    cost: 3,
    baseIncome: 0,
    synergyTypes: ['Food'],
    upgradePath: undefined,
    maxLevel: 1,
    description: 'Test business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
    ...overrides,
  };
}

describe('Group F: Socialite reputation ability (AC2)', () => {
  it('grants +0.1 reputation per turn during the income phase', () => {
    const state = setupMainStreetGame({ seed: 'group-f-socialite' });
    // Place one zero-income business so the income phase runs normally.
    state.streetGrid[0] = makeBiz({ baseIncome: 0, id: 'biz-test-staff' });
    recalculateCard(state, 0);

    const socialite = findStaff(createStaffDeck(1), 'staff-socialite')!;
    state.staffCards.push({ ...socialite });

    const repBefore = state.resourceBank.reputation;
    applyIncome(state);
    const repGain = state.resourceBank.reputation - repBefore;
    expect(repGain).toBeCloseTo(0.1, 5);
  });

  it('adds no reputation for staff without the ability', () => {
    const state = setupMainStreetGame({ seed: 'group-f-no-ability' });
    state.streetGrid[0] = makeBiz({ baseIncome: 0, id: 'biz-test-staff-2' });
    recalculateCard(state, 0);

    const apprentice = findStaff(createStaffDeck(1), 'staff-apprentice')!;
    state.staffCards.push({ ...apprentice });

    const repBefore = state.resourceBank.reputation;
    applyIncome(state);
    expect(state.resourceBank.reputation).toBe(repBefore);
  });
});

// ── AC2: Accountant refresh discount ──────────────────────────────────

describe('Group F: Accountant refresh discount (AC2)', () => {
  it('reduces the market refresh cost by 1', () => {
    const state = setupMainStreetGame({ seed: 'group-f-accountant' });
    state.phase = 'MarketPhase';

    // Baseline: REFRESH_MARKET_COST (5) per refresh (CG-0MSTOATDT009BRX2).
    expect(refreshMarketCost(state)).toBe(5);

    const accountant = findStaff(createStaffDeck(1), 'staff-accountant')!;
    state.staffCards.push({ ...accountant });

    expect(refreshMarketCost(state)).toBe(4);
  });

  it('allows a refresh and deducts only the discounted cost', () => {
    const state = setupMainStreetGame({ seed: 'group-f-accountant-deduct' });
    state.phase = 'MarketPhase';
    state.resourceBank.coins = 4;

    const accountant = findStaff(createStaffDeck(1), 'staff-accountant')!;
    state.staffCards.push({ ...accountant });

    // 4 coins is exactly enough with the discount (base 5 - 1).
    expect(canRefreshMarket(state).legal).toBe(true);

    refreshMarket(state);
    expect(state.resourceBank.coins).toBe(0);
  });

  it('without the accountant, 1 coin is not enough to refresh', () => {
    const state = setupMainStreetGame({ seed: 'group-f-no-discount' });
    state.phase = 'MarketPhase';
    state.resourceBank.coins = 1;

    expect(canRefreshMarket(state).legal).toBe(false);
    expect(refreshMarketCost(state)).toBe(5);
  });
});

// ── AC3: No regression for existing staff ─────────────────────────────

describe('Group F: existing staff no-regression (AC3)', () => {
  it('Assistant/Manager/Director keep their original stats and no abilities', () => {
    const deck = createStaffDeck(1);
    const expected = [
      { id: 'staff-assistant', cost: 3, ongoingCost: 1, slots: 1 },
      { id: 'staff-manager', cost: 7, ongoingCost: 2.5, slots: 2 },
      { id: 'staff-director', cost: 14, ongoingCost: 4, slots: 3 },
    ];
    for (const e of expected) {
      const card = findStaff(deck, e.id)!;
      expect(card.cost).toBe(e.cost);
      expect(card.ongoingCost).toBe(e.ongoingCost);
      expect(card.handSlotsAdded).toBe(e.slots);
      expect(card.reputationPerTurn).toBeUndefined();
      expect(card.refreshCostDiscount).toBeUndefined();
    }
  });

  it('Apprentice and Executive carry no abilities either', () => {
    const deck = createStaffDeck(1);
    for (const id of ['staff-apprentice', 'staff-executive']) {
      const card = findStaff(deck, id)!;
      expect(card.reputationPerTurn).toBeUndefined();
      expect(card.refreshCostDiscount).toBeUndefined();
    }
  });
});

// ── Balance guardrails ────────────────────────────────────────────────

describe('Group F: balance guardrails (AC5/AC6)', () => {
  it('keeps the staff cost spread within the 1/3 rule', () => {
    const staff = getCsvRows().filter(r => r.family === 'staff');
    const threshold = Math.ceil(staff.length / 3);
    const freq = new Map<number, number>();
    for (const r of staff) {
      const cost = Number(r.cost) || 0;
      freq.set(cost, (freq.get(cost) ?? 0) + 1);
    }
    for (const [cost, count] of freq) {
      expect(count, `cost ${cost} appears ${count} times (threshold ${threshold})`).toBeLessThanOrEqual(threshold);
    }
  });

  it('validates cleanly through the balance tool CSV validator', () => {
    const rows = getCsvRows().map(r => ({ ...r }));
    expect(() => validateCsvRows(rows as never)).not.toThrow();
  });

  it('keeps other families unchanged in count (data-driven scope)', () => {
    expect(createBusinessDeck(1).length).toBe(30);
    expect(createCommunitySpaceDeck(1).length).toBe(8);
    expect(createEventDeck(1, undefined, createSeededRng(42), 1).length).toBe(56); // +1 Graffiti Art
    expect(createUpgradeDeck(1).length).toBe(39);
  });
});
