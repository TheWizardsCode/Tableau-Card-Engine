/**
 * Main Street: Walk-on applicant business-type gating tests
 * (CG-0MU3BTRGY0086CM9, parent CG-0MTIOLY2A0092OT1 — "Staff for businesses").
 *
 *   AC1  A specialist applicant only walks on when the player owns a
 *        deployed business whose name or synergy type matches the staff's
 *        `allowedBusinessTypes`.
 *   AC2  With no matching business type, specialist applicants do not appear
 *        (the chance roll is consumed; a generalist may instead).
 *   AC3  Generalist staff (broad type coverage) still walk on when no
 *        specialist match exists, preserving the walk-on flow.
 *   AC4  The applicant chance formula is unchanged; only the card pool is
 *        filtered.
 *
 * Determinism: each test replaces `decks.staff` with a controlled pool and
 * pins `state.rng` to `() => 0` — the forced-flag cheat (CG-0MTY9PB51008OG5A)
 * BYPASSES the type gate, so tests here drive the roll + draw through the
 * seeded RNG instead.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import {
  resolveStaffApplicant,
  computeApplicantChance,
  hireStaffApplicant,
} from '../../example-games/main-street/MainStreetEngine';
import {
  createStaffDeck,
  type BusinessCard,
  type StaffCard,
} from '../../example-games/main-street/MainStreetCards';

/** Builds a staff card from a template id (fresh copy). */
function staffOf(...prefixes: string[]): StaffCard[] {
  const deck = createStaffDeck(1);
  return prefixes.map(p => deck.find(c => c.id.startsWith(p))!).map(c => ({ ...c }));
}

/** Sets a controlled staff pool + a deterministic RNG, then triggers. */
function triggerWith(state: MainStreetState, pool: StaffCard[]): void {
  state.decks.staff = pool;
  state.rng = () => 0.0; // roll 0 < chance; draw index 0
  (state as unknown as { forcedStaffApplicant: boolean }).forcedStaffApplicant = false;
  resolveStaffApplicant(state);
}

function deploy(state: MainStreetState, slot: number, name: string, synergy: string[]): BusinessCard {
  const biz: BusinessCard = {
    family: 'business',
    id: `biz-${slot}`,
    name,
    cost: 3,
    baseIncome: 2,
    synergyTypes: [...synergy] as BusinessCard['synergyTypes'],
    maxLevel: 0,
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    description: 'Gating fixture.',
    ongoingCost: 0,
    employedStaff: [],
  };
  state.streetGrid[slot] = biz;
  return biz;
}

function pendingCard(state: MainStreetState): StaffCard | null {
  return (state as unknown as { pendingApplicant?: { card: StaffCard } | null }).pendingApplicant?.card ?? null;
}

// ── AC1: specialist applicants need a matching deployed business ──

describe('AC1: walk-on requires a matching deployed business type', () => {
  it('a Food specialist walks on when a Food business is deployed (synergy match)', () => {
    const state = setupMainStreetGame({ seed: 'gate-chef-food' });
    deploy(state, 0, 'The Diner', ['Food']);
    // Pool: Florist (no Food), Barista (Cafe|Food — matches), Chef (Food).
    triggerWith(state, staffOf('staff-florist', 'staff-barista', 'staff-chef'));
    const card = pendingCard(state);
    expect(card).not.toBeNull();
    // The FIRST eligible card is the Barista (draw index 0). It must match.
    expect(card!.id.startsWith('staff-barista')).toBe(true);
  });

  it('a Florist specialist walks on when a Florist business is deployed (name match)', () => {
    const state = setupMainStreetGame({ seed: 'gate-florist' });
    deploy(state, 0, 'Florist', ['Commerce', 'Culture']);
    // Pool: Chef (no Florist/Commerce/Culture), Florist (matches by name).
    triggerWith(state, staffOf('staff-chef', 'staff-florist'));
    const card = pendingCard(state);
    expect(card).not.toBeNull();
    expect(card!.id.startsWith('staff-florist')).toBe(true);
  });
});

// ── AC2: no matching type → no specialist (roll consumed) ──

describe('AC2: without a matching type, specialists do not appear', () => {
  it('with only a Service business, Food-only specialists are excluded', () => {
    const state = setupMainStreetGame({ seed: 'gate-service-only' });
    deploy(state, 0, 'Hardware Store', ['Service']);
    // Pool is entirely Food/Cafe specialists + a generalist.
    triggerWith(state, staffOf('staff-chef', 'staff-barista', 'staff-assistant'));
    const card = pendingCard(state);
    expect(card).not.toBeNull();
    // Only the generalist is eligible for a Service business.
    expect(card!.id.startsWith('staff-assistant')).toBe(true);
  });

  it('with NO matching business at all, no applicant walks on', () => {
    const state = setupMainStreetGame({ seed: 'gate-no-match' });
    deploy(state, 0, 'Hardware Store', ['Service']);
    // Pool has no generalist and no Service-matching staff.
    triggerWith(state, staffOf('staff-chef', 'staff-florist', 'staff-barista'));
    expect(pendingCard(state)).toBeNull();
  });

  it('with NO deployed business, no applicant walks on at all', () => {
    const state = setupMainStreetGame({ seed: 'gate-empty' });
    triggerWith(state, staffOf('staff-assistant'));
    expect(pendingCard(state)).toBeNull();
  });
});

// ── AC3: generalist fallback ────────────────────────────────

describe('AC3: generalist staff remain walk-on eligible', () => {
  it('with only a Service business deployed, a generalist walks on', () => {
    const state = setupMainStreetGame({ seed: 'gate-generalist' });
    deploy(state, 0, 'Gym', ['Health']);
    // Pool: food specialists (no Health) + the generalist Assistant.
    triggerWith(state, staffOf('staff-chef', 'staff-barista', 'staff-assistant'));
    const card = pendingCard(state);
    expect(card).not.toBeNull();
    expect(getAllowedTypes(card!).length).toBe(6); // generalist covers all types
  });
});

// ── AC4: the chance formula is unchanged ────────────────────

describe('AC4: applicant chance formula is unchanged', () => {
  it('computeApplicantChance still returns min(baseIncome + rep, 15)', () => {
    const state = setupMainStreetGame({ seed: 'gate-chance' });
    deploy(state, 0, 'Bakery', ['Food']);
    // Bakery fixture baseIncome 2 → chance 2 (cap 15).
    expect(computeApplicantChance(state)).toBe(2);
  });

  it('hiring a gated applicant consumes it and clears pendingApplicant', () => {
    const state = setupMainStreetGame({ seed: 'gate-hire' });
    deploy(state, 0, 'Bakery', ['Food']);
    triggerWith(state, staffOf('staff-chef', 'staff-assistant'));
    const card = pendingCard(state);
    expect(card).not.toBeNull();
    hireStaffApplicant(state);
    expect(state.staffCards.some(c => c.id === card!.id)).toBe(true);
    expect(pendingCard(state)).toBeNull();
  });
});

/** Helper: the member's allowed types (empty = legacy generalist). */
function getAllowedTypes(card: StaffCard): string[] {
  return Array.isArray(card.allowedBusinessTypes) ? [...card.allowedBusinessTypes] : [];
}