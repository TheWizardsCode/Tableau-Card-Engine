/**
 * Main Street: Staff placement & removal commands tests
 * (CG-0MU3BTSQ8006ZRCU, parent CG-0MTIOLY2A0092OT1 — "Staff for businesses").
 *
 * Covers the engine/command layer every staff-placement interaction funnels
 * through (click-to-place and drag-and-drop share these entry points):
 *   AC3  Business-type validation: placement is rejected when the business
 *        name or synergy type does not match `allowedBusinessTypes`.
 *   AC4  Employment-slot capacity: `getEmploymentCapacity` bounds members.
 *   AC1/2 Placement state: `placeStaffOnBusiness` sets employedAtSlot and
 *        registers the member on the business's employedStaff list.
 *   AC5  Removal: `removeStaffFromBusiness` clears employment (member stays
 *        hired); `layoffStaffCard` sells the member off entirely (buff stops).
 *   AC6  Undo/redo: placement and layoff commands are undoable via the
 *        UndoRedoManager snapshot.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { UndoRedoManager } from '@core-engine';

import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import {
  createStaffDeck,
  type StaffCard,
  type BusinessCard,
} from '../../example-games/main-street/MainStreetCards';
import {
  canPlaceStaffOnBusiness,
  placeStaffOnBusiness,
  removeStaffFromBusiness,
  layoffStaffCard,
  getEmployedStaffCountAt,
} from '../../example-games/main-street/MainStreetEngine';
import {
  placeStaffOnBusinessCommand,
  removeStaffFromBusinessCommand,
  layoffStaffCommand,
} from '../../example-games/main-street/MainStreetCommands';
import { executeWeekStart } from '../../example-games/main-street/MainStreetEngine';

// ── Fixtures ────────────────────────────────────────────────

/** Builds a business card fixture at a given slot. */
function placeBusinessAt(state: MainStreetState, slot: number, name: string, synergy: string[]): BusinessCard {
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
    description: 'Placement fixture.',
    ongoingCost: 0,
    employedStaff: [],
  };
  state.streetGrid[slot] = biz;
  return biz;
}

/** Hires a staff template into the state's staffCards. */
function hire(state: MainStreetState, id: string): StaffCard {
  const tpl = createStaffDeck(1).find(c => c.id.startsWith(id))!;
  const card = { ...tpl, id: `${tpl.id}-fixture` };
  state.staffCards.push(card);
  return card;
}

function freshState(seed = 'staff-place'): MainStreetState {
  const state = setupMainStreetGame({ seed });
  executeWeekStart(state);
  return state;
}

// ── AC3: business-type validation ───────────────────────────

describe('AC3: placement validates allowedBusinessTypes', () => {
  it('accepts a specialist whose synergy type matches (Chef → Bakery/Food)', () => {
    const state = freshState();
    placeBusinessAt(state, 0, 'Bakery', ['Food']);
    const chef = hire(state, 'staff-chef');
    expect(canPlaceStaffOnBusiness(state, chef.id, 0).legal).toBe(true);
    placeStaffOnBusiness(state, chef.id, 0);
    expect(chef.employedAtSlot).toBe(0);
  });

  it('accepts a specialist whose business NAME matches (Florist → Florist)', () => {
    const state = freshState();
    placeBusinessAt(state, 0, 'Florist', ['Commerce', 'Culture']);
    const florist = hire(state, 'staff-florist');
    expect(canPlaceStaffOnBusiness(state, florist.id, 0).legal).toBe(true);
    placeStaffOnBusiness(state, florist.id, 0);
    expect(florist.employedAtSlot).toBe(0);
  });

  it('rejects a mismatch (Barista → Hardware Store) with a clear reason', () => {
    const state = freshState();
    placeBusinessAt(state, 0, 'Hardware Store', ['Service']);
    const barista = hire(state, 'staff-barista'); // Cafe|Food
    const legality = canPlaceStaffOnBusiness(state, barista.id, 0);
    expect(legality.legal).toBe(false);
    expect((legality as { reason?: string }).reason ?? '').toMatch(/type does not match/i);
    expect(() => placeStaffOnBusiness(state, barista.id, 0)).toThrow(/type does not match/i);
    expect(barista.employedAtSlot).toBeUndefined();
    expect(getEmployedStaffCountAt(state, 0)).toBe(0);
  });

  it('generalist staff (no restriction) place on any business', () => {
    const state = freshState();
    placeBusinessAt(state, 0, 'Gym', ['Health']);
    const assistant = hire(state, 'staff-assistant'); // all six synergy types
    expect(canPlaceStaffOnBusiness(state, assistant.id, 0).legal).toBe(true);
    placeStaffOnBusiness(state, assistant.id, 0);
    expect(assistant.employedAtSlot).toBe(0);
  });

  it('rejects placement on empty slots and un-hired ids', () => {
    const state = freshState();
    const chef = hire(state, 'staff-chef');
    // Empty slot 3.
    expect(canPlaceStaffOnBusiness(state, chef.id, 3).legal).toBe(false);
    expect(() => placeStaffOnBusiness(state, chef.id, 3)).toThrow(/empty slot/i);
    // Not-hired id.
    expect(canPlaceStaffOnBusiness(state, 'staff-nobody-0', 0).legal).toBe(false);
  });
});

// ── AC4: employment-slot capacity ───────────────────────────

describe('AC4: placement respects employment capacity', () => {
  it('a level-0 business accepts exactly one member', () => {
    const state = freshState();
    placeBusinessAt(state, 0, 'Bakery', ['Food']);
    const chef = hire(state, 'staff-chef');
    const baker = hire(state, 'staff-baker');
    placeStaffOnBusiness(state, chef.id, 0);
    expect(getEmployedStaffCountAt(state, 0)).toBe(1);

    const legality = canPlaceStaffOnBusiness(state, baker.id, 0);
    expect(legality.legal).toBe(false);
    expect((legality as { reason?: string }).reason ?? '').toMatch(/no free employment slots/i);
    expect(() => placeStaffOnBusiness(state, baker.id, 0)).toThrow(/no free employment slots/i);
  });

  it('a level-1 business accepts a second member (capacity = level + 1)', () => {
    const state = freshState();
    const biz = placeBusinessAt(state, 0, 'Bakery', ['Food']);
    biz.level = 1;
    const chef = hire(state, 'staff-chef');
    const baker = hire(state, 'staff-baker');
    placeStaffOnBusiness(state, chef.id, 0);
    placeStaffOnBusiness(state, baker.id, 0);
    expect(getEmployedStaffCountAt(state, 0)).toBe(2);
  });
});

// ── AC1/AC2: placement state via the shared command path ────

describe('AC1/AC2: placement registers employment on the business', () => {
  it('placeStaffOnBusiness sets employedAtSlot and pushes onto employedStaff', () => {
    const state = freshState();
    const biz = placeBusinessAt(state, 0, 'Cafe', ['Food', 'Culture']);
    const chef = hire(state, 'staff-chef');
    placeStaffOnBusiness(state, chef.id, 0);
    expect(chef.employedAtSlot).toBe(0);
    expect(biz.employedStaff!.map(m => m.id)).toContain(chef.id);
    expect(getEmployedStaffCountAt(state, 0)).toBe(1);
  });

  it('a member moved to another business is deregistered from the first', () => {
    const state = freshState();
    placeBusinessAt(state, 0, 'Bakery', ['Food']);
    placeBusinessAt(state, 2, 'Diner', ['Food']);
    const chef = hire(state, 'staff-chef'); // Cafe|Diner|Food|Delicatessen
    placeStaffOnBusiness(state, chef.id, 0);
    placeStaffOnBusiness(state, chef.id, 2);
    expect(chef.employedAtSlot).toBe(2);
    expect((state.streetGrid[0] as BusinessCard)!.employedStaff!.length).toBe(0);
    expect((state.streetGrid[2] as BusinessCard)!.employedStaff!.map(m => m.id)).toContain(chef.id);
    expect(getEmployedStaffCountAt(state, 0)).toBe(0);
    expect(getEmployedStaffCountAt(state, 2)).toBe(1);
  });
});

// ── AC5: removal flow ───────────────────────────────────────

describe('AC5: removal stops the employment contribution', () => {
  it('removeStaffFromBusiness clears employment while keeping the member hired', () => {
    const state = freshState();
    const biz = placeBusinessAt(state, 0, 'Bakery', ['Food']);
    const chef = hire(state, 'staff-chef');
    placeStaffOnBusiness(state, chef.id, 0);
    expect(biz.employedStaff!.length).toBe(1);

    removeStaffFromBusiness(state, chef.id);
    expect(chef.employedAtSlot).toBeUndefined();
    expect(biz.employedStaff!.length).toBe(0);
    expect(state.staffCards.some(c => c.id === chef.id)).toBe(true); // still hired
  });

  it('layoffStaffCard removes the member entirely (buff stops, card to discards)', () => {
    const state = freshState();
    const biz = placeBusinessAt(state, 0, 'Bakery', ['Food']);
    const chef = hire(state, 'staff-chef');
    placeStaffOnBusiness(state, chef.id, 0);

    layoffStaffCard(state, chef.id);
    expect(state.staffCards.some(c => c.id === chef.id)).toBe(false);
    expect(biz.employedStaff!.length).toBe(0);
    expect(getEmployedStaffCountAt(state, 0)).toBe(0);
    expect(state.discards.staff.some(c => c.id === chef.id)).toBe(true);
  });

  it('layoff throws for an unknown staff id', () => {
    const state = freshState();
    expect(() => layoffStaffCard(state, 'staff-nobody-0')).toThrow(/not found/i);
  });
});

// ── AC6: undo/redo ──────────────────────────────────────────

describe('AC6: placement and removal are undoable commands', () => {
  it('undo/redo of placeStaffOnBusinessCommand restores employment state', () => {
    const state = freshState();
    placeBusinessAt(state, 0, 'Bakery', ['Food']);
    const chef = hire(state, 'staff-chef');

    const mgr = new UndoRedoManager();
    mgr.execute(placeStaffOnBusinessCommand(state, chef.id, 0));
    expect(getEmployedStaffCountAt(state, 0)).toBe(1);

    mgr.undo();
    // Snapshot restore replaces state arrays — re-query the member by id.
    expect(state.staffCards.find(c => c.id === chef.id)!.employedAtSlot).toBeUndefined();
    expect(getEmployedStaffCountAt(state, 0)).toBe(0);

    mgr.redo();
    expect(state.staffCards.find(c => c.id === chef.id)!.employedAtSlot).toBe(0);
    expect(getEmployedStaffCountAt(state, 0)).toBe(1);
  });

  it('undo of layoffStaffCommand restores the hired member and employment', () => {
    const state = freshState();
    placeBusinessAt(state, 0, 'Bakery', ['Food']);
    const chef = hire(state, 'staff-chef');
    placeStaffOnBusiness(state, chef.id, 0);

    const mgr = new UndoRedoManager();
    mgr.execute(layoffStaffCommand(state, chef.id));
    expect(state.staffCards.some(c => c.id === chef.id)).toBe(false);
    expect((state.streetGrid[0] as BusinessCard)!.employedStaff!.length).toBe(0);

    mgr.undo();
    const restored = state.staffCards.find(c => c.id === chef.id);
    expect(restored).toBeDefined();
    expect(restored!.employedAtSlot).toBe(0);
    expect((state.streetGrid[0] as BusinessCard)!.employedStaff!.map(m => m.id)).toContain(chef.id);
  });

  it('undo of removeStaffFromBusinessCommand restores employment', () => {
    const state = freshState();
    placeBusinessAt(state, 0, 'Bakery', ['Food']);
    const chef = hire(state, 'staff-chef');
    placeStaffOnBusiness(state, chef.id, 0);

    const mgr = new UndoRedoManager();
    mgr.execute(removeStaffFromBusinessCommand(state, chef.id));
    expect(state.staffCards.find(c => c.id === chef.id)!.employedAtSlot).toBeUndefined();

    mgr.undo();
    expect(state.staffCards.find(c => c.id === chef.id)!.employedAtSlot).toBe(0);
    expect((state.streetGrid[0] as BusinessCard)!.employedStaff!.map(m => m.id)).toContain(chef.id);
  });
});