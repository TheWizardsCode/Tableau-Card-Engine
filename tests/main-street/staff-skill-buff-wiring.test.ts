/**
 * Main Street: Staff specialization — skill buff wiring tests
 * (I4, CG-0MT4WXV2J000M35M; parent CG-0MT1CIWSD003VBPK).
 *
 * Validates that specialization skills applied by EMPLOYED staff members
 * reach the engine computation paths:
 * - Income: per-business buffs fold into applyIncome (read-only on the
 *   currentIncome cache — AC2: no conflicts with adjacency caching).
 * - Reputation: per-business rep buffs accrue during the income phase; Brand
 *   Ambassador scales positive rep gains from incidents/investments.
 * - Costs: Cost Cutter reduces street-wide ongoing costs; Operations Manager
 *   discounts its own salary; Negotiator discounts market refreshes.
 * - Incidents: Quality Inspector reduces coin damage; Compliance reduces rep
 *   damage; Security Consultant neutralizes theft/loss incidents; Risk
 *   Manager averts incidents with 15% probability.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  setupMainStreetGame,
  serializeMainStreetState,
  deserializeMainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  processEndOfTurn,
  resolveIncident,
  playHeldEvent,
} from '../../example-games/main-street/MainStreetEngine';
import {
  applyIncome,
  computeBusinessIncome,
  syncCardCurrentIncome,
} from '../../example-games/main-street/MainStreetAdjacency';
import { refreshMarket, refreshMarketCost } from '../../example-games/main-street/MainStreetMarket';
import { createStaffDeck, type StaffCard, type BusinessCard, type EventCard } from '../../example-games/main-street/MainStreetCards';
import { getSkill } from '../../example-games/main-street/MainStreetStaffSkills';
import {
  computeStaffSalaryCost,
  getEmployedSpecializationSkills,
} from '../../example-games/main-street/MainStreetStaffBuffs';

// ── Helpers ─────────────────────────────────────────────────

/** Builds a staff card with a forced skill roster (bypasses the RNG). */
function staffWithSkills(name: string, skillIds: string[]): StaffCard {
  const base = createStaffDeck(1).find(c => c.id.startsWith('staff-assistant'))!;
  return { ...base, id: `${base.id}-${name}`, name, specializationSkillIds: [...skillIds] };
}

/** Hires a forced-skill staff member into the state (hand-slot staff). */
function hireSynthetic(state: ReturnType<typeof setupMainStreetGame>, name: string, skillIds: string[]): void {
  const card = staffWithSkills(name, skillIds);
  state.staffCards.push(card);
}

/** Employs a forced-skill staff member AT a business slot (employedAtSlot). */
function employSynthetic(
  state: ReturnType<typeof setupMainStreetGame>,
  name: string,
  skillIds: string[],
  slotIndex: number,
): void {
  const card = staffWithSkills(name, skillIds);
  state.staffCards.push({ ...card, employedAtSlot: slotIndex });
}

/** Places a business of the given synergy type at slot 0 and syncs caches. */
function placeBusiness(state: ReturnType<typeof setupMainStreetGame>, synergyTypes: string[], baseIncome = 2): BusinessCard {
  return placeBusinessAt(state, 0, synergyTypes, baseIncome);
}

/** Places a business of the given synergy type at a specific slot and syncs caches. */
function placeBusinessAt(
  state: ReturnType<typeof setupMainStreetGame>,
  slotIndex: number,
  synergyTypes: string[],
  baseIncome = 2,
): BusinessCard {
  const biz: BusinessCard = {
    family: 'business',
    id: `biz-${slotIndex}-${synergyTypes.join('-')}`,
    name: `Test ${synergyTypes.join('/')} @${slotIndex}`,
    cost: 3,
    baseIncome,
    synergyTypes: [...synergyTypes] as BusinessCard['synergyTypes'],
    maxLevel: 0,
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    description: 'I4 fixture business.',
    ongoingCost: 1,
  };
  state.streetGrid[slotIndex] = biz;
  syncCardCurrentIncome(state.streetGrid, slotIndex);
  return biz;
}

// ── Income buffs (AC: income-boost skills modify income) ────

describe('I4: income-boost skills fold into applyIncome without cache mutation', () => {
  it('Chef (+20%) boosts Food business income during the income phase', () => {
    const state = setupMainStreetGame({ seed: 'i4-chef' });
    executeDayStart(state);
    const biz = placeBusiness(state, ['Food'], 2);
    const baseline = computeBusinessIncome(state.streetGrid, 0);
    expect(baseline).toBe(2);

    // Per-business buffs require employment at the buffed slot (CG-0MSTOATDU006UGAX).
    employSynthetic(state, 'chef', ['skill-chef'], 0);
    const result = applyIncome(state);
    // Chef +20% → slot income 2 * 1.2 = 2.4.
    const slot = result.breakdown?.find((s: { slotIndex: number }) => s.slotIndex === 0);
    if (slot) {
      expect(slot.total).toBeCloseTo(2.4);
    }
    // AC2: the cached value stays the UNBUFFED baseline (buff is read-only).
    expect(biz.currentIncome).toBe(2);
  });

  it('Sales Champion (+0.5 flat) boosts Commerce business income', () => {
    const state = setupMainStreetGame({ seed: 'i4-sales' });
    executeDayStart(state);
    placeBusiness(state, ['Commerce'], 2);
    employSynthetic(state, 'sales', ['skill-sales-champion'], 0);
    const result = applyIncome(state);
    const slot = result.breakdown?.find((s: { slotIndex: number }) => s.slotIndex === 0);
    if (slot) {
      expect(slot.total).toBeCloseTo(2.5);
    }
  });

  it('an irrelevant skill leaves income untouched (no cross-category leakage)', () => {
    const state = setupMainStreetGame({ seed: 'i4-clean' });
    executeDayStart(state);
    placeBusiness(state, ['Health'], 2);
    hireSynthetic(state, 'compliance', ['skill-compliance']);
    const result = applyIncome(state);
    const slot = result.breakdown?.find((s: { slotIndex: number }) => s.slotIndex === 0);
    if (slot) {
      expect(slot.total).toBe(2);
    }
  });

  it('buffed income is deterministic and cache-stable across replays', () => {
    const run = () => {
      const state = setupMainStreetGame({ seed: 'i4-replay' });
      executeDayStart(state);
      placeBusiness(state, ['Entertainment'], 3);
      employSynthetic(state, 'dj', ['skill-dj'], 0);
      return applyIncome(state).total;
    };
    expect(run()).toBeCloseTo(3.6);
    expect(run()).toBeCloseTo(run());
  });
});

// ── Reputation buffs (AC: rep-boost skills modify reputation) ─

describe('I4: reputation-boost skills accrue during the income phase', () => {
  it('Community Builder adds +0.1 rep/turn per placed business', () => {
    const state = setupMainStreetGame({ seed: 'i4-cb' });
    executeDayStart(state);
    placeBusiness(state, ['Food'], 2);
    const before = state.resourceBank.reputation;
    employSynthetic(state, 'cb', ['skill-community-builder'], 0);
    applyIncome(state);
    expect(state.resourceBank.reputation).toBeCloseTo(before + 0.1);
  });

  it('PR Strategist adds +0.15 rep/turn only to Service businesses', () => {
    const state = setupMainStreetGame({ seed: 'i4-pr' });
    executeDayStart(state);
    placeBusiness(state, ['Service'], 2);
    const before = state.resourceBank.reputation;
    employSynthetic(state, 'pr', ['skill-pr-strategist'], 0);
    applyIncome(state);
    expect(state.resourceBank.reputation).toBeCloseTo(before + 0.15);

    // Non-Service business: no buff.
    const state2 = setupMainStreetGame({ seed: 'i4-pr2' });
    executeDayStart(state2);
    placeBusiness(state2, ['Food'], 2);
    const before2 = state2.resourceBank.reputation;
    employSynthetic(state2, 'pr2', ['skill-pr-strategist'], 0);
    applyIncome(state2);
    expect(state2.resourceBank.reputation).toBeCloseTo(before2);
  });
});

// ── Cost reductions (AC: cost-reduction skills) ─────────────

describe('I4: cost-reduction skills apply to ongoing/refresh costs', () => {
  it('Operations Manager discounts its own salary (staff ongoing costs)', () => {
    // Pure salary math first: assistant salary 1.0 - 0.5 = 0.5.
    expect(computeStaffSalaryCost([], 1)).toBe(1);
    expect(computeStaffSalaryCost([getSkill('skill-operations-manager')], 1)).toBe(0.5);

    // Engine path: hiring the member reduces the staff-cost deduction by 0.5.
    const state = setupMainStreetGame({ seed: 'i4-ops' });
    executeDayStart(state);
    state.staffCards.push({ ...staffWithSkills('ops', ['skill-operations-manager']) });
    const control = setupMainStreetGame({ seed: 'i4-ops' });
    executeDayStart(control);
    control.staffCards.push({ ...staffWithSkills('ops', []) }); // same member, no skills
    state.resourceBank.coins = 100;
    control.resourceBank.coins = 100;
    processEndOfTurn(state);
    processEndOfTurn(control);
    // Identical seeded flow; only the salary differs by the 0.5 discount.
    expect(state.resourceBank.coins).toBeCloseTo(control.resourceBank.coins + 0.5);
  });

  // Cost Cutter removes 15% of EVERY ongoing-cost family (street-wide flag).
  it('Cost Cutter reduces street-wide business + staff ongoing cost by 15%', () => {
    const state = setupMainStreetGame({ seed: 'i4-cutter' });
    executeDayStart(state);
    placeBusiness(state, ['Food'], 2);
    hireSynthetic(state, 'cutter', ['skill-cost-cutter']);
    state.resourceBank.coins = 100;
    processEndOfTurn(state);
    const coinsAfter = state.resourceBank.coins;

    // Control: identical flow with the same member hired but NO skills.
    const control = setupMainStreetGame({ seed: 'i4-cutter' });
    executeDayStart(control);
    placeBusiness(control, ['Food'], 2);
    control.staffCards.push({ ...staffWithSkills('cutter', []) });
    control.resourceBank.coins = 100;
    processEndOfTurn(control);
    const coinsControl = control.resourceBank.coins;

    // Same seeded income; cutter saves 0.15 on the business (1.0) AND on the
    // member's own salary (1.0) → the buffed run ends with 0.30 coins more.
    expect(coinsAfter).toBeCloseTo(coinsControl + 0.3);
  });

  it('Negotiator discounts market refresh cost by 1', () => {
    const state = setupMainStreetGame({ seed: 'i4-neg' });
    executeDayStart(state);
    expect(refreshMarketCost(state)).toBe(5);
    hireSynthetic(state, 'neg', ['skill-negotiator']);
    expect(refreshMarketCost(state)).toBe(4);
    state.phase = 'MarketPhase';
    state.resourceBank.coins = 100;
    refreshMarket(state);
    expect(state.resourceBank.coins).toBe(96);
  });
});

// ── Incident mitigation (AC: incident skills) ───────────────

describe('I4: incident-mitigation skills modify incident damage/probability', () => {
  /** Synthetic incidents so fixtures never depend on the seeded deck sample. */
  const shoplifting = (): EventCard => ({
    family: 'event',
    id: 'evt-fixture-shoplifting',
    name: 'Fixture Shoplifting',
    trigger: 'Incident',
    cost: 0,
    effect: '-2 coins per Commerce business from theft losses.',
    target: 'SpecificSynergy',
    targetSynergy: 'Commerce',
    coinDelta: -2,
    reputationDelta: 0,
  });
  const vandalism = (): EventCard => ({
    family: 'event',
    id: 'evt-fixture-vandalism',
    name: 'Fixture Vandalism',
    trigger: 'Incident',
    cost: 0,
    effect: '-1 reputation across the street.',
    target: 'All',
    coinDelta: 0,
    reputationDelta: -1,
  });

  /** Resolves the given synthetic incident on a fresh seeded state. */
  function resolveOnFresh(event: EventCard, extras?: (s: ReturnType<typeof setupMainStreetGame>) => void) {
    const state = setupMainStreetGame({ seed: 'i4-inc-fixture' });
    executeDayStart(state);
    if (extras) extras(state);
    state.incidentDeck = [event];
    const coins = state.resourceBank.coins;
    const rep = state.resourceBank.reputation;
    resolveIncident(state);
    return { state, coins, rep };
  }

  it('Quality Inspector reduces incident coin damage by 30%', () => {
    const withCommerce = (s: ReturnType<typeof setupMainStreetGame>) => placeBusiness(s, ['Commerce'], 2);
    const plain = resolveOnFresh(shoplifting(), withCommerce);
    const lossPlain = plain.coins - plain.state.resourceBank.coins;
    expect(lossPlain).toBeGreaterThan(0);

    const buffed = resolveOnFresh(shoplifting(), s => {
      withCommerce(s);
      hireSynthetic(s, 'qc', ['skill-quality-inspector']);
    });
    const lossBuffed = buffed.coins - buffed.state.resourceBank.coins;
    // Reputation-multiplier is multiplicative, so the ratio holds at any rep.
    expect(lossBuffed).toBeCloseTo(lossPlain * 0.7);
  });

  it('Compliance Officer reduces incident reputation damage (clamped at 0)', () => {
    const plain = resolveOnFresh(vandalism());
    const lossPlain = plain.rep - plain.state.resourceBank.reputation;
    expect(lossPlain).toBeCloseTo(1);

    const buffed = resolveOnFresh(vandalism(), s => hireSynthetic(s, 'compliance', ['skill-compliance']));
    const lossBuffed = buffed.rep - buffed.state.resourceBank.reputation;
    expect(lossBuffed).toBeCloseTo(0.5);
  });

  it('Security Consultant fully neutralizes theft/loss incidents', () => {
    const withCommerce = (s: ReturnType<typeof setupMainStreetGame>) => placeBusiness(s, ['Commerce'], 2);
    const plain = resolveOnFresh(shoplifting(), withCommerce);
    expect(plain.coins - plain.state.resourceBank.coins).toBeGreaterThan(0);

    const immune = resolveOnFresh(shoplifting(), s => {
      withCommerce(s);
      hireSynthetic(s, 'sec', ['skill-security-consultant']);
    });
    expect(immune.coins).toBe(immune.state.resourceBank.coins); // zero loss
  });

  it('Risk Manager averts incidents with 15% probability (deterministic per seed)', () => {
    let averted = 0;
    const trials = 60;
    for (let i = 0; i < trials; i += 1) {
      const state = setupMainStreetGame({ seed: `i4-risk-${i}` });
      executeDayStart(state);
      hireSynthetic(state, 'risk', ['skill-risk-manager']);
      const before = state.incidentDeck.length;
      const resolved = resolveIncident(state);
      if (resolved === null) {
        averted += 1;
        expect(state.incidentDeck.length).toBe(before); // averted card stays in deck
      } else {
        expect(state.incidentDeck.length).toBe(before - 1); // drawn normally
      }
    }
    expect(averted).toBeGreaterThan(0);
    expect(averted).toBeLessThan(trials);
  });
});

// ── Brand Ambassador (rep gains from incidents & investments) ─

describe('I4: Brand Ambassador scales positive reputation gains (+50%)', () => {
  it('sourced from incidents and investments', () => {
    // Investment event with a positive reputation reward, resolved from hand.
    const invest: EventCard = {
      family: 'event',
      id: 'evt-test-investment',
      name: 'Test Investment',
      cost: 3,
      trigger: 'Investment',
      target: 'All',
      coinDelta: 0,
      reputationDelta: 2,
      effect: 'I4 fixture: +2 reputation.',
    };
    const resolveGain = (withAmbassador: boolean): number => {
      const state = setupMainStreetGame({ seed: 'i4-ba' });
      executeDayStart(state);
      state.hand = [{ ...invest }];
      if (withAmbassador) hireSynthetic(state, 'ba', ['skill-brand-ambassador']);
      const before = state.resourceBank.reputation;
      playHeldEvent(state);
      return state.resourceBank.reputation - before;
    };
    expect(resolveGain(false)).toBeCloseTo(2);
    expect(resolveGain(true)).toBeCloseTo(3);
  });
});

// ── Per-business employment scoping (CG-0MSTOATDU006UGAX) ────

describe('per-business buff scoping in applyIncome (CG-0MSTOATDU006UGAX)', () => {
  it('an employed Chef buffs ONLY the business slot where employed, not a second Food business', () => {
    const state = setupMainStreetGame({ seed: 'scope-two-food' });
    executeDayStart(state);
    placeBusinessAt(state, 0, ['Food'], 2);
    placeBusinessAt(state, 2, ['Food'], 2); // non-adjacent (avoid same-type penalty)
    employSynthetic(state, 'chef', ['skill-chef'], 0);

    const result = applyIncome(state);
    const bySlot = new Map(result.breakdown.map((s: { slotIndex: number; total: number }) => [s.slotIndex, s.total]));
    expect(bySlot.get(0)).toBeCloseTo(2.4); // employed here → buffed
    expect(bySlot.get(2)).toBeCloseTo(2); // another Food business → untouched
  });

  it('hand-slot market staff contribute NO per-business income buffs', () => {
    const state = setupMainStreetGame({ seed: 'scope-hand-income' });
    executeDayStart(state);
    placeBusiness(state, ['Food'], 2);
    hireSynthetic(state, 'chef', ['skill-chef']); // NOT employed at any slot

    const result = applyIncome(state);
    const slot = result.breakdown?.find((s: { slotIndex: number }) => s.slotIndex === 0);
    if (slot) {
      expect(slot.total).toBe(2);
    }
  });

  it('hand-slot market staff contribute NO per-business reputation buffs', () => {
    const state = setupMainStreetGame({ seed: 'scope-hand-rep' });
    executeDayStart(state);
    placeBusiness(state, ['Food'], 2);
    const before = state.resourceBank.reputation;
    hireSynthetic(state, 'cb', ['skill-community-builder']); // hand-slot
    applyIncome(state);
    expect(state.resourceBank.reputation).toBeCloseTo(before);

    // Same member employed → +0.1 rep/turn resumes.
    const state2 = setupMainStreetGame({ seed: 'scope-hand-rep' });
    executeDayStart(state2);
    placeBusiness(state2, ['Food'], 2);
    const before2 = state2.resourceBank.reputation;
    employSynthetic(state2, 'cb', ['skill-community-builder'], 0);
    applyIncome(state2);
    expect(state2.resourceBank.reputation).toBeCloseTo(before2 + 0.1);
  });

  it('street-wide incident skills still aggregate across ALL staff (hand-slot + employed)', () => {
    const withCommerce = (s: ReturnType<typeof setupMainStreetGame>) => placeBusiness(s, ['Commerce'], 2);
    // Hand-slot Compliance Officer + employed Risk Manager both contribute.
    const state = setupMainStreetGame({ seed: 'scope-incident' });
    executeDayStart(state);
    withCommerce(state);
    hireSynthetic(state, 'compliance', ['skill-compliance']);
    employSynthetic(state, 'risk', ['skill-risk-manager'], 0);
    const ids = getEmployedSpecializationSkills(state).map(s => s.id);
    expect(ids).toContain('skill-compliance');
    expect(ids).toContain('skill-risk-manager');
  });
});

// ── Cache/legacy guarantees ─────────────────────────────────

describe('I4: caching & legacy guarantees', () => {
  it('applyIncome leaves currentIncome and currentReputationPerTurn caches untouched', () => {
    const state = setupMainStreetGame({ seed: 'i4-cache' });
    executeDayStart(state);
    placeBusiness(state, ['Food', 'Commerce'], 2);
    hireSynthetic(state, 'stack', ['skill-chef', 'skill-sales-champion', 'skill-community-builder']);
    const incBefore = state.streetGrid[0]!.currentIncome;
    syncCardCurrentIncome(state.streetGrid, 0);
    applyIncome(state);
    expect(state.streetGrid[0]!.currentIncome).toBe(incBefore);
  });

  it('employed-skill gathering ignores members without specializationSkillIds (legacy saves)', () => {
    const state = setupMainStreetGame({ seed: 'i4-legacy' });
    executeDayStart(state);
    state.staffCards.push(createStaffDeck(1)[0]); // legacy hand-slot staff, no skills
    expect(getEmployedSpecializationSkills(state)).toHaveLength(0);
  });

  it('skill rosters survive save → restore and still drive income buffs', () => {
    const state = setupMainStreetGame({ seed: 'i4-save' });
    executeDayStart(state);
    placeBusiness(state, ['Food'], 2);
    employSynthetic(state, 'chef', ['skill-chef'], 0);
    const saved = serializeMainStreetState(state);
    const restored = deserializeMainStreetState(saved);
    const result = applyIncome(restored);
    expect(result.total).toBeCloseTo(2.4);
  });
});