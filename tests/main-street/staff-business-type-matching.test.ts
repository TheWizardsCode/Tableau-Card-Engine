/**
 * Main Street: Staff business-type matching engine tests
 * (CG-0MU3BNO590066H75, parent CG-0MTIOLY2A0092OT1 — "Staff for businesses").
 *
 * Covers the foundation slice of the staff-specialisation feature:
 *   AC1  CSV schema: every staff row carries a valid `allowedBusinessTypes`
 *        column whose tokens are synergy type names or real business names.
 *   AC2  Existing staff updated: specialists get targeted lists (Barista →
 *        Cafe|Food); generalist hand-slot staff get broad type coverage.
 *   AC3  New specialist rows added with income-buff effects (Florist →
 *        Florist, Baker → Bakery, etc.).
 *   AC4  `staffMatchesBusiness()` matches by exact business name OR synergy
 *        type; staff without the field behave as generalists (additive).
 *   AC5  State model: `BusinessCard.employedStaff` is populated per business,
 *        drives `getEmployedStaffCountAt`, round-trips save/load, and is
 *        backfilled from legacy `employedAtSlot` references on deserialize.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import {
  getCsvRows,
  getStaffCardTemplates,
  createStaffDeck,
  staffMatchesBusiness,
  getAllowedBusinessTypesForStaff,
  SYNERGY_TYPE_NAMES,
  type StaffCard,
  type BusinessCard,
  type CommunitySpaceCard,
} from '../../example-games/main-street/MainStreetCards';
import {
  setupMainStreetGame,
  serializeMainStreetState,
  deserializeMainStreetState,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  getEmployedStaffCountAt,
  getEmployedStaffForBusiness,
  hireStaffApplicant,
  letGoStaffMember,
  layoffStaffCard,
} from '../../example-games/main-street/MainStreetEngine';
import { executeDayStart } from '../../example-games/main-street/MainStreetEngine';

// ── Fixtures ────────────────────────────────────────────────

/** Finds the template for the given staff id (throws when missing). */
function staffTemplate(id: string): StaffCard {
  const t = getStaffCardTemplates().find(c => c.id === id);
  if (!t) throw new Error(`Missing staff template: ${id}`);
  return t;
}

/** All business names from the CSV (for token validation). */
function businessNames(): Set<string> {
  const names = new Set<string>();
  for (const row of getCsvRows()) {
    if (row.family === 'business' && row.name) names.add(row.name.trim());
  }
  return names;
}

/** Builds a minimal business (or community-space) card for matching tests. */
function biz(name: string, synergyTypes: BusinessCard['synergyTypes']): BusinessCard {
  return {
    family: 'business',
    id: `biz-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    cost: 3,
    baseIncome: 2,
    synergyTypes: [...synergyTypes],
    maxLevel: 0,
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    description: 'Matching fixture.',
    ongoingCost: 0,
    employedStaff: [],
  };
}

// ── AC1: CSV schema ─────────────────────────────────────────

describe('AC1: CSV schema — allowedBusinessTypes on every staff row', () => {
  it('every staff row in card-data.csv has a non-empty allowedBusinessTypes', () => {
    const staffRows = getCsvRows().filter(r => r.family === 'staff');
    expect(staffRows.length).toBeGreaterThanOrEqual(25); // original ~21 + new specialists
    for (const row of staffRows) {
      const types = (row.allowedBusinessTypes ?? '').trim();
      expect(types, `staff ${row.id} missing allowedBusinessTypes`).not.toBe('');
      expect(types.split('|').filter(Boolean).length).toBeGreaterThan(0);
    }
  });

  it('every allowedBusinessTypes token is a synergy type or a real business name', () => {
    const names = businessNames();
    for (const row of getCsvRows().filter(r => r.family === 'staff')) {
      for (const token of (row.allowedBusinessTypes ?? '').split('|').filter(Boolean)) {
        const t = token.trim();
        const isSynergy = (SYNERGY_TYPE_NAMES as readonly string[]).includes(t);
        const isBusiness = names.has(t);
        expect(isSynergy || isBusiness, `staff ${row.id} token "${t}" invalid`).toBe(true);
      }
    }
  });

  it('the CSV column header exposes allowedBusinessTypes', () => {
    const header = getCsvRows().length > 0 ? Object.keys(getCsvRows()[0]!) : [];
    expect(header).toContain('allowedBusinessTypes');
  });
});

// ── AC2: existing staff updated ─────────────────────────────

describe('AC2: existing staff receive targeted or broad type lists', () => {
  it('Barista specialises to Cafe plus the Food synergy type', () => {
    const types = getAllowedBusinessTypesForStaff(staffTemplate('staff-barista'));
    expect(types).toContain('Cafe');
    expect(types).toContain('Food');
  });

  it('generalist hand-slot staff cover every synergy type', () => {
    for (const id of ['staff-assistant', 'staff-manager', 'staff-director', 'staff-executive', 'staff-general-manager']) {
      const types = new Set(getAllowedBusinessTypesForStaff(staffTemplate(id)));
      for (const s of SYNERGY_TYPE_NAMES) {
        expect(types, `${id} should cover ${s}`).toContain(s);
      }
    }
  });

  it('Health & Safety Inspector is targeted to Health only', () => {
    const types = new Set(getAllowedBusinessTypesForStaff(staffTemplate('staff-health-safety')));
    expect(types).toEqual(new Set(['Health']));
  });

  it('all ~21 original staff ids still exist as templates', () => {
    const templateIds = new Set(getStaffCardTemplates().map(t => t.id));
    for (const id of [
      'staff-assistant', 'staff-manager', 'staff-director', 'staff-apprentice',
      'staff-executive', 'staff-socialite', 'staff-accountant', 'staff-general-manager',
      'staff-lookout', 'staff-barista', 'staff-security', 'staff-marketing',
      'staff-bookkeeper', 'staff-customer-rep', 'staff-it', 'staff-health-safety',
      'staff-event-planner', 'staff-delivery', 'staff-pr', 'staff-financial',
      'staff-maintenance',
    ]) {
      expect(templateIds, `missing template ${id}`).toContain(id);
    }
  });
});

// ── AC3: new specialist rows ────────────────────────────────

describe('AC3: new specialist staff rows with income-buff effects', () => {
  it('Florist and Baker are added with their business-specific restriction', () => {
    expect(getAllowedBusinessTypesForStaff(staffTemplate('staff-florist'))).toContain('Florist');
    expect(getAllowedBusinessTypesForStaff(staffTemplate('staff-baker'))).toContain('Bakery');
    expect(getAllowedBusinessTypesForStaff(staffTemplate('staff-mechanic'))).toContain('Service');
  });

  it('specialist rows describe an income/coin/reputation buff effect', () => {
    for (const id of ['staff-florist', 'staff-baker', 'staff-chef', 'staff-mechanic']) {
      const desc = staffTemplate(id).description ?? '';
      const mentionsBuff = /coins|income|reputation|bonus/i.test(desc);
      expect(mentionsBuff, `${id} description should describe a buff`).toBe(true);
    }
  });

  it('new specialist cards are drawn by createStaffDeck with allowedBusinessTypes intact', () => {
    const deck = createStaffDeck(1);
    const florist = deck.find(c => c.id.startsWith('staff-florist'));
    expect(florist).toBeDefined();
    expect(getAllowedBusinessTypesForStaff(florist!)).toContain('Florist');
  });
});

// ── AC4: staffMatchesBusiness ───────────────────────────────

describe('AC4: staffMatchesBusiness matches name or synergy type', () => {
  it('matches by exact business name (Barista → Cafe)', () => {
    const barista = staffTemplate('staff-barista');
    expect(staffMatchesBusiness(barista, biz('Cafe', ['Food', 'Culture']))).toBe(true);
  });

  it('matches by synergy type when the name differs (Chef → Food business)', () => {
    const chef = staffTemplate('staff-chef');
    // No name match — but the Food synergy type is in the allowed list.
    expect(staffMatchesBusiness(chef, biz('Deli', ['Food']))).toBe(true);
    expect(staffMatchesBusiness(chef, biz('Arcade', ['Entertainment']))).toBe(false);
  });

  it('rejects non-matching businesses (Barista → Hardware Store)', () => {
    const barista = staffTemplate('staff-barista');
    expect(staffMatchesBusiness(barista, biz('Hardware Store', ['Service']))).toBe(false);
  });

  it('generalist staff match any business', () => {
    const assistant = staffTemplate('staff-assistant');
    for (const name of ['Cafe', 'Gym', 'Boutique', 'Diner']) {
      expect(staffMatchesBusiness(assistant, biz(name, ['Food']))).toBe(true);
    }
  });

  it('staff without allowedBusinessTypes (legacy/hand-built) behave as generalists', () => {
    const legacy: StaffCard = { ...staffTemplate('staff-barista'), allowedBusinessTypes: undefined as never };
    expect(getAllowedBusinessTypesForStaff(legacy)).toEqual([]);
    expect(staffMatchesBusiness(legacy, biz('Hardware Store', ['Service']))).toBe(true);
  });

  it('returns false for null/undefined businesses', () => {
    const barista = staffTemplate('staff-barista');
    expect(staffMatchesBusiness(barista, null)).toBe(false);
    expect(staffMatchesBusiness(barista, undefined)).toBe(false);
  });

  it('matching is case-insensitive on business names and types', () => {
    const florist = staffTemplate('staff-florist');
    const lowercase: BusinessCard = { ...biz('florist', ['Commerce']), name: 'florist' };
    expect(staffMatchesBusiness(florist, lowercase)).toBe(true);
    const lowerType: BusinessCard = { ...biz('Shop', ['Commerce']), synergyTypes: ['commerce'] as unknown as BusinessCard['synergyTypes'] };
    expect(staffMatchesBusiness(florist, lowerType)).toBe(true);
  });

  it('accepts community-space cards as placement targets', () => {
    const cs: CommunitySpaceCard = {
      family: 'community-space',
      id: 'cs-park',
      name: 'Park',
      cost: 3,
      baseIncome: 0,
      ongoingCost: 0,
      synergyTypes: ['Entertainment'],
      maxLevel: 0,
      level: 0,
      incomeBonus: 0,
      synergyRangeBonus: 0,
      reputationBonus: 0,
      description: 'CS fixture.',
    };
    const generalist = staffTemplate('staff-assistant');
    expect(staffMatchesBusiness(generalist, cs)).toBe(true);
  });
});

// ── AC5: state model — employedStaff per business ───────────

describe('AC5: per-business employedStaff state model', () => {
  /** Places a business at slot 0 and syncs the income caches. */
  function placeBusiness(state: MainStreetState): BusinessCard {
    const card = biz('Cafe', ['Food', 'Culture']);
    card.currentIncome = card.baseIncome;
    card.currentReputationPerTurn = card.reputationPerTurn;
    state.streetGrid[0] = card;
    return card;
  }

  it('a placed business carries an empty employedStaff array (explicit from setup)', () => {
    const state = setupMainStreetGame({ seed: 'staff-model' });
    executeDayStart(state);
    placeBusiness(state);
    expect(Array.isArray(state.streetGrid[0]!.employedStaff)).toBe(true);
    expect(state.streetGrid[0]!.employedStaff).toHaveLength(0);
  });

  it('getEmployedStaffCountAt reads business.employedStaff', () => {
    const state = setupMainStreetGame({ seed: 'staff-count' });
    executeDayStart(state);
    const card = placeBusiness(state);
    card.employedStaff = [staffTemplate('staff-chef')];
    expect(getEmployedStaffCountAt(state, 0)).toBe(1);
    expect(getEmployedStaffForBusiness(state, 0)).toEqual([staffTemplate('staff-chef')]);
  });

  it('getEmployedStaffCountAt falls back to employedAtSlot for legacy in-memory states', () => {
    const state = setupMainStreetGame({ seed: 'staff-fallback' });
    executeDayStart(state);
    const card = placeBusiness(state);
    // Legacy shape: no employedStaff field, staff linked via employedAtSlot only.
    card.employedStaff = undefined;
    state.staffCards.push({ ...staffTemplate('staff-chef'), employedAtSlot: 0 });
    expect(getEmployedStaffCountAt(state, 0)).toBe(1);
    expect(getEmployedStaffForBusiness(state, 0)).toHaveLength(1);
  });

  it('employedStaff survives serialize → deserialize', () => {
    const state = setupMainStreetGame({ seed: 'staff-save' });
    executeDayStart(state);
    const card = placeBusiness(state);
    card.employedStaff = [
      { ...staffTemplate('staff-chef'), employedAtSlot: 0 },
      { ...staffTemplate('staff-barista'), employedAtSlot: 0 },
    ];
    const restored = deserializeMainStreetState(serializeMainStreetState(state));
    expect(restored.streetGrid[0]!.employedStaff).toHaveLength(2);
    expect(getEmployedStaffCountAt(restored, 0)).toBe(2);
  });

  it('deserialization backfills employedStaff from legacy employedAtSlot references', () => {
    const state = setupMainStreetGame({ seed: 'staff-migrate' });
    executeDayStart(state);
    const card = placeBusiness(state);
    card.employedStaff = undefined; // legacy save shape
    const chef = { ...staffTemplate('staff-chef'), employedAtSlot: 0, specializationSkillIds: ['skill-chef'] };
    state.staffCards.push(chef);
    const saved = serializeMainStreetState(state);
    // Strip any embedded employedStaff to emulate a pre-feature save.
    (saved.streetGrid[0] as unknown as Record<string, unknown>).employedStaff = undefined;
    const restored = deserializeMainStreetState(saved);
    expect(getEmployedStaffCountAt(restored, 0)).toBe(1);
    expect(restored.streetGrid[0]!.employedStaff).toHaveLength(1);
    // The backfilled member is the same object as the hired staffCards entry.
    expect(restored.streetGrid[0]!.employedStaff![0]).toBe(restored.staffCards[0]);
  });

  it('hiring the pending applicant registers the staff member on the business', () => {
    const state = setupMainStreetGame({ seed: 'staff-hire' });
    executeDayStart(state);
    const card = placeBusiness(state);
    card.employedStaff = [];
    const applicant = { card: { ...staffTemplate('staff-chef') }, targetSlotIndex: 0 };
    (state as unknown as { pendingApplicant: typeof applicant }).pendingApplicant = applicant;
    hireStaffApplicant(state);
    expect(state.streetGrid[0]!.employedStaff).toHaveLength(1);
    expect(getEmployedStaffCountAt(state, 0)).toBe(1);
  });

  it('laying off or letting go removes the member from the business employedStaff', () => {
    const state = setupMainStreetGame({ seed: 'staff-go' });
    executeDayStart(state);
    const card = placeBusiness(state);
    const chef = { ...staffTemplate('staff-chef'), employedAtSlot: 0 };
    const barista = { ...staffTemplate('staff-barista'), employedAtSlot: 0 };
    state.staffCards.push(chef, barista);
    card.employedStaff = [chef, barista];

    // letGoStaffMember by index 0 (the chef).
    letGoStaffMember(state, 0);
    expect(getEmployedStaffCountAt(state, 0)).toBe(1);
    expect(state.streetGrid[0]!.employedStaff!.map(m => m.id)).not.toContain(chef.id);

    // layoffStaffCard by id (the barista).
    layoffStaffCard(state, barista.id);
    expect(getEmployedStaffCountAt(state, 0)).toBe(0);
    expect(state.streetGrid[0]!.employedStaff).toHaveLength(0);
  });
});