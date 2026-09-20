/**
 * Main Street: Market integration for specialist staff tests
 * (CG-0MU3BTS3K000DGIK, parent CG-0MTIOLY2A0092OT1 — "Staff for businesses").
 *
 * Child 3 is a verification slice: the business-specialist staff (Florist,
 * Baker, Chef, Mechanic) already live in the staff deck via the general
 * `createStaffDeck` template pool (child 1), so the market refill pipeline
 * draws them like any other staff. These tests pin that behaviour down so it
 * cannot regress when the deck/refill composition changes:
 *
 *   AC1  Specialist staff templates appear in decks.staff at setup and are
 *        drawable into the market row.
 *   AC2  hireStaffCard() hires a specialist staff card from the market row
 *        through the existing flow (0 new purchase paths).
 *   AC3  Market refill never drops specialists from the pool (deck + row +
 *        discards conservation across re-draws).
 *   AC4  Staff cards without allowedBusinessTypes (legacy templates/
 *        hand-built) still draw and hire as before — the field is additive
 *        and placement-gating only.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  refillSingleRowMarket,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  createStaffDeck,
  getAllowedBusinessTypesForStaff,
  type StaffCard,
} from '../../example-games/main-street/MainStreetCards';
import {
  canPurchaseStaff,
} from '../../example-games/main-street/MainStreetMarket';
import {
  hireStaffCard,
} from '../../example-games/main-street/MainStreetEngine';

/** The business-specialist staff added by child 1. */
const SPECIALIST_IDS = ['staff-florist', 'staff-baker', 'staff-chef', 'staff-mechanic'];

/** Staff cards visible in the market row. */
function staffInRow(state: MainStreetState): StaffCard[] {
  return state.market.cards.filter(c => c.family === 'staff') as StaffCard[];
}

const baseId = (id: string): string => id.replace(/-\d+$/, '');

// ── AC1: specialist staff in the deck & market ──────────────

describe('AC1: specialist staff are market-visible', () => {
  it('specialist templates are in the staff deck at setup', () => {
    const state = setupMainStreetGame({ seed: 'specialist-deck' });
    const deckIds = new Set(state.decks.staff.map(c => baseId(c.id)));
    for (const id of SPECIALIST_IDS) {
      expect(deckIds, `${id} should be in decks.staff`).toContain(id);
    }
  });

  it('specialist templates carry non-empty allowedBusinessTypes from the CSV', () => {
    const deck = createStaffDeck(1);
    for (const id of SPECIALIST_IDS) {
      const card = deck.find(c => c.id.startsWith(id));
      expect(card, `${id} template missing`).toBeDefined();
      expect(getAllowedBusinessTypesForStaff(card!).length).toBeGreaterThan(0);
    }
  });

  it('a specialist card can be drawn into the market row (deterministic seed)', () => {
    // Seed chosen so a fresh refill places staff-chef in the row (deck
    // composition shifts which seed does this; spec-market-29 verified
    // against the calendar-expanded pool, CG-0MTT0K9RX0004QTE).
    const state = setupMainStreetGame({ seed: 'spec-market-29' });
    // Discard any visible staff and re-draw the row fresh (mirrors refresh).
    for (const card of state.market.cards) {
      if (card.family === 'staff') state.discards.staff.push(card as never);
    }
    state.market.cards = [];
    refillSingleRowMarket(state);
    const row = staffInRow(state);
    expect(row.length).toBeGreaterThan(0);
    expect(SPECIALIST_IDS).toContain(baseId(row[0]!.id));
  });
});

// ── AC2: hire flow for specialists ──────────────────────────

describe('AC2: hireStaffCard hires specialists through the existing flow', () => {
  it('hires a specialist staff card from the market row', () => {
    const state = setupMainStreetGame({ seed: 'specialist-hire' });
    state.resourceBank.coins = 10000;
    // Inject the specialist into the row so the hire path is deterministic.
    const florist = createStaffDeck(1).find(c => c.id.startsWith('staff-florist'))!;
    state.market.cards = [{ ...florist }];
    state.phase = 'MarketPhase';

    expect(canPurchaseStaff(state, florist.id).legal).toBe(true);
    hireStaffCard(state, florist.id);

    const hired = state.staffCards.find(c => c.id === florist.id);
    expect(hired).toBeDefined();
    expect(state.market.cards).toHaveLength(0); // consumed from the row
  });

  it('does not require a new purchase path (only coins are deducted)', () => {
    const state = setupMainStreetGame({ seed: 'specialist-hire2' });
    const coinsBefore = state.resourceBank.coins;
    const baker = createStaffDeck(1).find(c => c.id.startsWith('staff-baker'))!;
    state.market.cards = [{ ...baker }];
    state.phase = 'MarketPhase';

    hireStaffCard(state, baker.id);
    expect(state.resourceBank.coins).toBeLessThan(coinsBefore);
    expect(state.staffCards.some(c => c.id === baker.id)).toBe(true);
  });
});

// ── AC3: refill conserves specialists in the pool ───────────

describe('AC3: market refill conserves specialist staff', () => {
  it('specialists stay in decks.staff + row + discards across re-draws', () => {
    const state = setupMainStreetGame({ seed: 'specialist-conserve' });
    // Count the FULL specialist pool (deck + row + discards): the setup draw
    // may already have a specialist in the row, so deck-only counts drift.
    const countSpecialists = (): number => {
      const seen = new Set<string>();
      for (const c of state.decks.staff) seen.add(baseId(c.id));
      for (const c of state.market.cards) {
        if (c.family === 'staff') seen.add(baseId(c.id));
      }
      for (const c of state.discards.staff) seen.add(baseId(c.id));
      return SPECIALIST_IDS.filter(id => seen.has(id)).length;
    };
    expect(countSpecialists()).toBe(SPECIALIST_IDS.length);

    for (let i = 0; i < 10; i++) {
      for (const card of state.market.cards) {
        if (card.family === 'staff') state.discards.staff.push(card as never);
      }
      state.market.cards = [];
      refillSingleRowMarket(state);
      expect(countSpecialists()).toBe(SPECIALIST_IDS.length);
    }
  });
});

// ── AC4: staff without allowedBusinessTypes still draw/hire ──

describe('AC4: legacy staff without allowedBusinessTypes are unaffected', () => {
  it('a hand-built staff card without the field draws and hires normally', () => {
    const state = setupMainStreetGame({ seed: 'specialist-legacy' });
    state.resourceBank.coins = 10000;
    // Legacy-shaped template: all fields present EXCEPT allowedBusinessTypes.
    const base = createStaffDeck(1).find(c => c.id.startsWith('staff-assistant'))!;
    const legacy: StaffCard = { ...base, allowedBusinessTypes: undefined as never };
    state.market.cards = [{ ...legacy }];
    state.phase = 'MarketPhase';

    expect(canPurchaseStaff(state, legacy.id).legal).toBe(true);
    hireStaffCard(state, legacy.id);
    expect(state.staffCards.some(c => c.id === legacy.id)).toBe(true);
  });

  it('generalist staff (broad allowedBusinessTypes) still appear in the deck', () => {
    const state = setupMainStreetGame({ seed: 'specialist-generalist' });
    const deckIds = new Set(state.decks.staff.map(c => baseId(c.id)));
    expect(deckIds).toContain('staff-assistant');
    expect(deckIds).toContain('staff-manager');
  });
});