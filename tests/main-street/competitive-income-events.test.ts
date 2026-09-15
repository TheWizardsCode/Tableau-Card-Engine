/**
 * Main Street: Competitive Per-Owner Income & Shared Event/Incident Routing
 *
 * Leaf CG-0MTIIL6J200291ZQ (epic CG-0MT5X3GMA007EG30): income accrues only to
 * the owning player of each placed business (base + adjacency synergy +
 * upgrades + salary/ongoing costs), and shared Investment events / Incidents
 * retain their existing resolution semantics but are routed per-owner.
 *
 * AC1 — Per-business income per owner (base + synergy + upgrade +
 *        salary/ongoing) routes only to the owning player.
 * AC2 — Shared Investment events and Incidents retain resolution semantics,
 *        routed per-owner (All → every owner / acting player; SpecificSynergy
 *        → per-business slot owners; Duration cards → board-wide, host-applied).
 * AC3 — Deterministic replay: same seed → identical per-owner sequences.
 * AC4 — N=1 regression: identical to the pre-competitive single-player path.
 *
 * Fixtures set owner reputation to 0 so the reputation coin multiplier is 1
 * and expected credits are exact integer values (deterministic math checks).
 */
import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  createCompetitiveState,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import type { BusinessCard, EventCard, DurationEventCard, StaffCard } from '../../example-games/main-street/MainStreetCards';
import {
  applyCompetitiveIncome,
  updateNeighborsOnPlacement,
} from '../../example-games/main-street/MainStreetAdjacency';
import {
  applyCompetitiveOngoingCosts,
  applyCompetitiveEventEffects,
  executeCompetitiveDay,
  executeFullTurn,
} from '../../example-games/main-street/MainStreetEngine';

// ── Helpers ───────────────────────────────────────────────────────

function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business' as const,
    id: overrides.id ?? 'test-biz',
    name: overrides.name ?? 'Test Biz',
    cost: overrides.cost ?? 100,
    baseIncome: overrides.baseIncome ?? 50,
    synergyTypes: overrides.synergyTypes ?? ['Food'],
    maxLevel: overrides.maxLevel ?? 1,
    description: overrides.description ?? 'A test business',
    level: overrides.level ?? 0,
    incomeBonus: overrides.incomeBonus ?? 0,
    synergyRangeBonus: overrides.synergyRangeBonus ?? 0,
    reputationBonus: overrides.reputationBonus ?? 0,
    ongoingCost: overrides.ongoingCost ?? 0,
    ...overrides,
  } as BusinessCard;
}

function makeEvent(overrides: Partial<EventCard> = {}): EventCard {
  return {
    family: 'event' as const,
    id: overrides.id ?? 'evt-test',
    name: overrides.name ?? 'Test Event',
    trigger: overrides.trigger ?? 'Incident',
    cost: overrides.cost ?? 0,
    effect: overrides.effect ?? 'Test effect',
    target: overrides.target ?? 'All',
    coinDelta: overrides.coinDelta ?? 0,
    reputationDelta: overrides.reputationDelta ?? 0,
    ...overrides,
  } as EventCard;
}

/**
 * Creates a 2-player competitive state with clean wallets:
 * players start at 1000 coins / 0 reputation (multiplier = 1); the shared
 * host wallet is padded so the host loss checks never fire during fixtures.
 */
function compState(seed: string = 'comp-income'): MainStreetState {
  const state = createCompetitiveState({ seed, playerCount: 2 });
  state.resourceBank.coins = 100000;
  state.resourceBank.reputation = 1000;
  for (const p of state.players!) {
    p.coins = 1000;
    p.reputation = 0;
  }
  return state;
}

/** Places a card at a slot, refreshes adjacency caches, tags its owner. */
function place(state: MainStreetState, card: BusinessCard, slot: number, ownerId: number): void {
  state.streetGrid[slot] = card;
  updateNeighborsOnPlacement(state, slot);
  state.ownerTaggedGrid![slot] = { card, ownerId };
}

function staffCard(overrides: Partial<StaffCard> = {}): StaffCard {
  return {
    family: 'staff' as const,
    id: overrides.id ?? 'staff-x',
    name: overrides.name ?? 'Staff X',
    cost: overrides.cost ?? 50,
    ongoingCost: overrides.ongoingCost ?? 150,
    actionsPerTurn: overrides.actionsPerTurn ?? 0,
    handSlotsAdded: overrides.handSlotsAdded ?? 0,
    reputationPerTurn: overrides.reputationPerTurn ?? 0,
    specializationSkillIds: overrides.specializationSkillIds ?? [],
    description: overrides.description ?? 'A test staff card',
    ...overrides,
  } as unknown as StaffCard;
}

// ── AC1: Per-business income routes only to the owning player ────

describe('AC1 — Per-owner income routing (CG-0MTIIL6J200291ZQ)', () => {
  it('credits base income only to the slot owner (single business)', () => {
    const state = compState('ac1-base');
    place(state, makeBiz({ baseIncome: 120 }), 0, 0);

    const results = applyCompetitiveIncome(state);
    expect(results).toHaveLength(2);
    const p0 = results.find(r => r.ownerId === 0)!;
    const p1 = results.find(r => r.ownerId === 1)!;

    // Reputation 0 → multiplier 1 → credit equals the card's cached income.
    expect(state.players![0].coins).toBe(1000 + 120);
    expect(state.players![1].coins).toBe(1000); // untouched
    expect(p0.income.total).toBe(120);
    expect(p1.income.total).toBe(0);
    expect(p0.income.breakdown[0].businessName).toBe('Test Biz');
    expect(p0.income.breakdown[0].slotIndex).toBe(0);
  });

  it('routes adjacency synergy income to each business OWNER independently', () => {
    const state = compState('ac1-synergy');
    // Two synergic Food businesses side by side — each currentIncome now
    // includes the adjacency bonus from its neighbour.
    const a = makeBiz({ id: 'biz-a', baseIncome: 100, synergyTypes: ['Food'] });
    const b = makeBiz({ id: 'biz-b', baseIncome: 100, synergyTypes: ['Food'] });
    place(state, a, 0, 0); // P0 owns slot 0
    place(state, b, 1, 1); // P1 owns slot 1 (adjacent → synergy flows both ways)

    // Sanity: the adjacency cache actually granted a synergy bonus.
    expect(a.currentIncome!).toBeGreaterThan(100);
    expect(b.currentIncome!).toBeGreaterThan(100);

    const results = applyCompetitiveIncome(state);
    const p0 = results.find(r => r.ownerId === 0)!;
    const p1 = results.find(r => r.ownerId === 1)!;

    // Each owner is credited exactly their own business's boosted income.
    expect(state.players![0].coins).toBe(1000 + (a.currentIncome ?? 0));
    expect(state.players![1].coins).toBe(1000 + (b.currentIncome ?? 0));
    expect(p0.income.total).toBe(a.currentIncome);
    expect(p1.income.total).toBe(b.currentIncome);
  });

  it('credits upgrade-boosted income to the slot owner', () => {
    const state = compState('ac1-upgrade');
    const biz = makeBiz({ baseIncome: 100 });
    place(state, biz, 3, 1); // P1 owns slot 3
    // Simulate an upgrade application: bump level + incomeBonus and refresh
    // the adjacency caches (mirrors the upgrade purchase path).
    biz.level = 1;
    biz.incomeBonus += 300;
    updateNeighborsOnPlacement(state, 3);

    applyCompetitiveIncome(state);
    expect(state.players![1].coins).toBe(1000 + (biz.currentIncome ?? 0));
    expect(state.players![0].coins).toBe(1000); // P0 owns nothing
  });

  it('per-owner results preserve the phaseBreakdown structure', () => {
    const state = compState('ac1-breakdown');
    place(state, makeBiz({ baseIncome: 80 }), 0, 0);
    place(state, makeBiz({ id: 'biz-b', baseIncome: 40, synergyTypes: ['Culture'] }), 6, 1);

    const results = applyCompetitiveIncome(state);
    for (const r of results) {
      expect(r.income.phaseBreakdown).toBeDefined();
      expect(r.income.phaseBreakdown.perSlotBreakdown).toBeInstanceOf(Array);
      expect(r.income.phaseBreakdown.perSlotBreakdown.length).toBe(r.income.breakdown.length);
      expect(r.income.handSynergyTotal).toBe(0);
    }
  });

  describe('per-owner ongoing costs (salary/upkeep)', () => {
    it('deducts staff salary only from the staff owner', () => {
      const state = compState('ac1-salary');
      state.players![1].staffCards = [staffCard({ ongoingCost: 150 })];
      state.players![0].staffCards = [staffCard({ id: 'staff-b', ongoingCost: 40 })];

      applyCompetitiveOngoingCosts(state);
      expect(state.players![0].coins).toBe(1000 - 40);
      expect(state.players![1].coins).toBe(1000 - 150);
    });

    it('charges business upkeep to each slot owner', () => {
      const state = compState('ac1-upkeep');
      place(state, makeBiz({ id: 'biz-a', ongoingCost: 100 }), 0, 0);
      place(state, makeBiz({ id: 'biz-b', ongoingCost: 40 }), 1, 1);

      applyCompetitiveOngoingCosts(state);
      expect(state.players![0].coins).toBe(1000 - 100);
      expect(state.players![1].coins).toBe(1000 - 40);
    });

    it('clamps per-owner deductions at the owner wallet (never negative)', () => {
      const state = compState('ac1-clamp');
      state.players![0].coins = 30;
      state.players![0].staffCards = [staffCard({ ongoingCost: 150 })];
      applyCompetitiveOngoingCosts(state);
      expect(state.players![0].coins).toBe(0);
      expect(state.players![1].coins).toBe(1000);
    });
  });
});

// ── AC2: Shared events / incidents routed per-owner ──────────────

describe('AC2 — Shared event/incident per-owner routing (CG-0MTIIL6J200291ZQ)', () => {
  it('All incident deducts from every owner wallet', () => {
    const state = compState('ac2-all-incident');
    const evt = makeEvent({
      id: 'evt-tax', name: 'Tax Day', trigger: 'Incident', target: 'All',
      coinDelta: -300, reputationDelta: 0,
    });
    applyCompetitiveEventEffects(state, evt);
    expect(state.players![0].coins).toBe(1000 - 300);
    expect(state.players![1].coins).toBe(1000 - 300);
  });

  it('All incident also scales positive reputation per owner', () => {
    const state = compState('ac2-all-rep');
    const evt = makeEvent({
      id: 'evt-charity', name: 'Community Award', trigger: 'Incident', target: 'All',
      coinDelta: 0, reputationDelta: 200,
    });
    applyCompetitiveEventEffects(state, evt);
    expect(state.players![0].reputation).toBe(200);
    expect(state.players![1].reputation).toBe(200);
  });

  it('SpecificSynergy incident applies per-match coins + per-owner rep to slot owners', () => {
    const state = compState('ac2-synergy-incident');
    place(state, makeBiz({ id: 'f1', synergyTypes: ['Food'] }), 0, 0);
    place(state, makeBiz({ id: 'f2', synergyTypes: ['Food'] }), 1, 0); // P0 × 2 Food
    place(state, makeBiz({ id: 'f3', synergyTypes: ['Food'] }), 6, 1); // P1 × 1 Food

    const evt = makeEvent({
      id: 'evt-rainy', name: 'Rainy Season', trigger: 'Incident', target: 'SpecificSynergy',
      targetSynergy: 'Food', coinDelta: -100, reputationDelta: -50,
    });
    applyCompetitiveEventEffects(state, evt);
    // P0: 2 matches → -200 coins, rep delta once → -50. P1: 1 match → -100, -50.
    expect(state.players![0].coins).toBe(1000 - 200);
    expect(state.players![1].coins).toBe(1000 - 100);
    expect(state.players![0].reputation).toBe(-50);
    expect(state.players![1].reputation).toBe(-50);
  });

  it('Investment All benefits only the acting player', () => {
    const state = compState('ac2-investment-all');
    const evt = makeEvent({
      id: 'evt-boom', name: 'Business Boom', trigger: 'Investment', target: 'All',
      coinDelta: 300, reputationDelta: 100,
    });
    // P1 plays the event during their MarketPhase → actingPlayerId = 1.
    applyCompetitiveEventEffects(state, evt, 1);
    expect(state.players![0].coins).toBe(1000);
    expect(state.players![1].coins).toBe(1000 + 300);
    expect(state.players![1].reputation).toBe(100);
    expect(state.players![0].reputation).toBe(0);
  });

  it('Investment SpecificSynergy routes coin deltas to the slot owners', () => {
    const state = compState('ac2-investment-synergy');
    place(state, makeBiz({ id: 'c1', synergyTypes: ['Culture'] }), 0, 0); // P0
    place(state, makeBiz({ id: 'c2', synergyTypes: ['Culture'] }), 1, 1); // P1
    place(state, makeBiz({ id: 'c3', synergyTypes: ['Culture'] }), 6, 1); // P1 × 2 total

    const evt = makeEvent({
      id: 'evt-festival', name: 'Culture Festival', trigger: 'Investment', target: 'SpecificSynergy',
      targetSynergy: 'Culture', coinDelta: 200, reputationDelta: 100,
    });
    applyCompetitiveEventEffects(state, evt, 1); // played by P1, but owners split
    expect(state.players![0].coins).toBe(1000 + 200);   // P0 owns 1 Culture business
    expect(state.players![1].coins).toBe(1000 + 400);   // P1 owns 2
    expect(state.players![0].reputation).toBe(100);
    expect(state.players![1].reputation).toBe(100);
  });

  it('Duration events are board-wide: not re-routed per-owner (host-applied)', () => {
    const state = compState('ac2-duration');
    const dEvt = {
      ...makeEvent({ id: 'evt-flu', name: 'Flu Season', trigger: 'Incident', target: 'All' }),
      duration: 3, effectType: 'income-multiplier', multiplier: 0.8,
    } as DurationEventCard;
    applyCompetitiveEventEffects(state, dEvt);
    // No wallet movement and no activeEffects mutation from the per-owner layer.
    expect(state.players![0].coins).toBe(1000);
    expect(state.players![1].coins).toBe(1000);
    expect(state.players![0].reputation).toBe(0);
    expect(state.activeEffects.length).toBe(0);
  });

  it('per-owner routing never mutates the shared host wallet', () => {
    const state = compState('ac2-host-untouched');
    place(state, makeBiz({ id: 'f1', synergyTypes: ['Food'] }), 0, 0);
    const coinsBefore = state.resourceBank.coins;
    const repBefore = state.resourceBank.reputation;
    applyCompetitiveEventEffects(state, makeEvent({ id: 'evt-x', target: 'All', coinDelta: -300 }));
    expect(state.resourceBank.coins).toBe(coinsBefore);
    expect(state.resourceBank.reputation).toBe(repBefore);
  });
});

// ── AC3: Deterministic replay ────────────────────────────────────

describe('AC3 — Deterministic replay of per-owner routing (CG-0MTIIL6J200291ZQ)', () => {
  function runTwoDays(seed: string) {
    const state = compState(seed);
    // Give players a modest starting wallet so first-to-threshold never fires
    // within two days (winThreshold 10000; ~200-500/day incomes).
    state.players![0].coins = 100;
    state.players![1].coins = 100;
    place(state, makeBiz({ id: 'biz-a', baseIncome: 250 }), 0, 0);
    place(state, makeBiz({ id: 'biz-b', baseIncome: 180, synergyTypes: ['Food'] }), 1, 0);
    place(state, makeBiz({ id: 'biz-c', baseIncome: 200, synergyTypes: ['Culture'] }), 6, 1);

    executeCompetitiveDay(state, [[], []]);
    const day1 = state.players!.map(p => ({ coins: p.coins, reputation: p.reputation, score: p.score }));
    executeCompetitiveDay(state, [[], []]);
    const day2 = state.players!.map(p => ({ coins: p.coins, reputation: p.reputation, score: p.score }));
    return { day1, day2, state };
  }

  it('same seed → identical per-owner sequences across independent runs', () => {
    const a = runTwoDays('replay42');
    const b = runTwoDays('replay42');
    expect(a.state.gameResult).toBe('playing');
    expect(a.day1).toEqual(b.day1);
    expect(a.day2).toEqual(b.day2);
    // Per-owner income actually accrued (wallets moved) in the full flow.
    expect(a.state.players![0].coins).not.toBe(100);
    expect(a.state.players![1].coins).not.toBe(100);
  });

  it('different seeds diverge (seed drives deck/incident order)', () => {
    const a = runTwoDays('replay-aaaa');
    const b = runTwoDays('replay-bbbb');
    // Both runs are valid continuous games.
    expect(a.state.gameResult).toBe('playing');
    expect(b.state.gameResult).toBe('playing');
    // Deterministic per seed: identical wallets within one seed is asserted
    // above; different seeds may (but need not) diverge — this guards that
    // the RNG is actually consulted (deck/incident order varies by seed).
    const diverged = a.day2.some((p, i) =>
      p.coins !== b.day2[i].coins || p.reputation !== b.day2[i].reputation,
    );
    expect(diverged).toBe(true);
  });
});

// ── AC4: N=1 regression identical to pre-competitive baseline ────

describe('AC4 — N=1 regression (CG-0MTIIL6J200291ZQ)', () => {
  it('N=1 competitive day is byte-identical to the single-player path', () => {
    const seed = 'n1-regression';
    const single = setupMainStreetGame({ seed });
    const comp = createCompetitiveState({ seed, playerCount: 1 });

    // Same business placed on the same slot in both states (pre-turn).
    const bizA = makeBiz({ id: 'biz-solo', baseIncome: 200 });
    single.streetGrid[0] = bizA;
    updateNeighborsOnPlacement(single, 0);
    const bizB = makeBiz({ id: 'biz-solo', baseIncome: 200 });
    comp.streetGrid[0] = bizB;
    updateNeighborsOnPlacement(comp, 0);

    const singleResult = executeFullTurn(single, []);
    const compResult = executeCompetitiveDay(comp, [[]]);

    // Identical host-wallet economics and turn results.
    expect(compResult.income?.total).toBe(singleResult.income?.total);
    expect(compResult.incident?.id).toBe(singleResult.incident?.id);
    expect(comp.resourceBank.coins).toBe(single.resourceBank.coins);
    expect(comp.resourceBank.reputation).toBe(single.resourceBank.reputation);
    expect(comp.turn).toBe(single.turn);
    expect(comp.gameResult).toBe(single.gameResult);
    expect(comp.phase).toBe(single.phase);
    // The per-owner wallet mirrors the shared wallet for the solo player
    // (income credited exactly once through the legacy host path).
    expect(compResult.income!.total).toBeGreaterThan(0);
  });
});
