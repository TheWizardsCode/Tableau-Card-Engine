/**
 * Main Street: Competitive AI Strategy Tests
 *
 * Leaf CG-0MT5X3N79002S038 (epic CG-0MT5X3GMA007EG30): the balancing AI's
 * decision layer made ownership-aware and staff-free for shared-street play.
 *
 * AC1 — Ownership-aware scoring: placement/upgrade/event value is evaluated
 *        against the acting player's own resources and owned businesses, with
 *        the planning horizon derived from the acting player's own score.
 * AC2 — Competitive legal-action enumeration excludes staff actions
 *        (hire-staff, peek-incident-deck); single-player enumeration unchanged.
 * AC3 — Determinism: same seed + same strategy → identical action sequences.
 * AC4 — Single-player paths unchanged (N=1 falls back to the legacy helpers).
 */
import { describe, it, expect } from 'vitest';

import {
  createCompetitiveState,
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import { createSeededRng } from '@core-engine';
import {
  enumerateCompetitiveLegalActions,
  enumerateLegalActions,
  scoreCompetitiveAction,
  scoreAction,
  aiCompetitivePlanningHorizon,
  aiPlanningHorizon,
  computeCompetitiveEventValue,
  isCompetitiveMode,
  bindCompetitiveSeat,
  restoreCompetitiveSeat,
  CompetitiveGreedyStrategy,
} from '../../example-games/main-street/MainStreetAiStrategy';
import {
  executeWeekStart,
  executeCompetitiveWeekStart,
  endCompetitiveMarketTurn,
  executeAction,
  updateCompetitiveScores,
  type PlayerAction,
} from '../../example-games/main-street/MainStreetEngine';
import type {
  BusinessCard,
  UpgradeCard,
  EventCard,
  StaffCard,
} from '../../example-games/main-street/MainStreetCards';

// ── Fixtures ─────────────────────────────────────────────────

function compState(seed = 'comp-ai', playerCount = 2): MainStreetState {
  return createCompetitiveState({ seed, playerCount });
}

function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business' as const,
    id: overrides.id ?? 'test-biz',
    name: overrides.name ?? 'Test Biz',
    cost: overrides.cost ?? 100,
    baseIncome: overrides.baseIncome ?? 50,
    synergyTypes: overrides.synergyTypes ?? [],
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

function makeUpgrade(overrides: Partial<UpgradeCard> = {}): UpgradeCard {
  return {
    family: 'upgrade' as const,
    id: overrides.id ?? 'test-upgrade',
    name: overrides.name ?? 'Test Upgrade',
    targetBusiness: overrides.targetBusiness ?? 'Test Biz',
    cost: overrides.cost ?? 40,
    incomeBonus: overrides.incomeBonus ?? 60,
    synergyRangeBonus: overrides.synergyRangeBonus ?? 0,
    description: overrides.description ?? 'A test upgrade',
    requiredLevel: overrides.requiredLevel ?? 0,
    ...overrides,
  } as UpgradeCard;
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

function makeStaff(overrides: Partial<StaffCard> = {}): StaffCard {
  return {
    family: 'staff' as const,
    id: overrides.id ?? 'staff-test',
    name: overrides.name ?? 'Test Staff',
    cost: overrides.cost ?? 20,
    ongoingCost: overrides.ongoingCost ?? 10,
    handSlotsAdded: overrides.handSlotsAdded ?? 0,
    description: overrides.description ?? 'A test staff member',
    specializationSkillIds: overrides.specializationSkillIds ?? [],
    ...overrides,
  } as StaffCard;
}

/** Places a card at a slot and tags its owner (mirrors engine placement). */
function place(state: MainStreetState, card: BusinessCard, slot: number, ownerId: number): void {
  state.streetGrid[slot] = card;
  state.ownerTaggedGrid![slot] = { card, ownerId };
}

/** Pads both players' wallets so acquisitions stay affordable. */
function padWallets(state: MainStreetState, amount: number): void {
  for (const p of state.players ?? []) p.coins += amount;
}

// ── AC1: Ownership-aware scoring ─────────────────────────────

describe('AC1 — Ownership-aware planning horizon', () => {
  it('uses the acting player\'s own score, not the shared wallet', () => {
    const s = compState('ac1-horizon');
    s.players![0].coins = 10;
    s.players![1].coins = s.config.winThreshold - 100;
    updateCompetitiveScores(s);

    const h0 = aiCompetitivePlanningHorizon(s, 0);
    const h1 = aiCompetitivePlanningHorizon(s, 1);

    // Far from the threshold → larger horizon; near it → smaller.
    expect(h0).toBeGreaterThan(h1);
    expect(h0).toBeGreaterThanOrEqual(5);
    expect(h1).toBeGreaterThanOrEqual(5);
    expect(h0).toBeLessThanOrEqual(25);
  });

  it('defaults to the active player', () => {
    const s = compState('ac1-active');
    s.players![0].coins = 10;
    s.players![1].coins = s.config.winThreshold - 100;
    updateCompetitiveScores(s);
    s.activePlayerId = 1;
    expect(aiCompetitivePlanningHorizon(s)).toBe(aiCompetitivePlanningHorizon(s, 1));
  });

  it('N=1 competitive states use the legacy shared-wallet horizon (AC4)', () => {
    const seed = 'ac1-n1-horizon';
    const single = createCompetitiveState({ seed, playerCount: 1 });
    expect(isCompetitiveMode(single)).toBe(false);
    expect(aiCompetitivePlanningHorizon(single)).toBe(aiPlanningHorizon(single));
  });
});

describe('AC1 — Own-resource scoring', () => {
  it('scores the same placement differently for each player\'s own horizon', () => {
    const s = compState('ac1-own-resources');
    const business = makeBiz({ id: 'biz-hand', baseIncome: 100, cost: 40 });
    // Identical card at hand index 0 for both players.
    s.players![0].hand = [business];
    s.players![1].hand = [{ ...business }];
    s.players![0].coins = 100;
    s.players![1].coins = 100;
    s.players![0].score = 0;
    s.players![1].score = s.config.winThreshold - 100;

    const action: PlayerAction = { type: 'play-business-from-hand', handIndex: 0, slotIndex: 0 };
    const farScore = scoreCompetitiveAction(s, action, 0);
    const nearScore = scoreCompetitiveAction(s, action, 1);

    expect(farScore).toBeGreaterThan(nearScore);
  });

  it('restricts upgrade targets to the acting player\'s own businesses', () => {
    const s = compState('ac1-upgrade-ownership');
    padWallets(s, 500);
    s.market.cards.push(
      makeUpgrade({ id: 'upg-bakery', targetBusiness: 'Bakery', cost: 30 }),
    );
    // P1 owns the Bakery; P0 owns an unrelated business.
    place(s, makeBiz({ id: 'bakery', name: 'Bakery', level: 0, maxLevel: 1 }), 0, 1);
    place(s, makeBiz({ id: 'cafe', name: 'Cafe', level: 0, maxLevel: 1 }), 1, 0);

    const p0UpgradeActions = enumerateCompetitiveLegalActions(s, 0).filter(
      a => a.type === 'buy-upgrade' && a.cardId === 'upg-bakery',
    );
    const p1UpgradeActions = enumerateCompetitiveLegalActions(s, 1).filter(
      a => a.type === 'buy-upgrade' && a.cardId === 'upg-bakery',
    );

    expect(p0UpgradeActions).toHaveLength(0);
    expect(p1UpgradeActions).toHaveLength(1);
    expect(p1UpgradeActions[0]).toMatchObject({ targetSlot: 0 });
  });

  it('values an event using only the acting player\'s own matching businesses', () => {
    const s = compState('ac1-event-value');
    place(s, makeBiz({ id: 'f1', synergyTypes: ['Food'] }), 0, 0);
    place(s, makeBiz({ id: 'f2', synergyTypes: ['Food'] }), 1, 0);
    place(s, makeBiz({ id: 'f3', synergyTypes: ['Food'] }), 2, 1);

    const synergy = makeEvent({
      id: 'evt-synergy',
      target: 'SpecificSynergy',
      targetSynergy: 'Food',
      coinDelta: 100,
      reputationDelta: 5,
    });

    // P0 has 2 matching businesses; P1 has 1.
    expect(computeCompetitiveEventValue(s, synergy, 0)).toBe(100 * 2 + 5);
    expect(computeCompetitiveEventValue(s, synergy, 1)).toBe(100 * 1 + 5);

    // Street-wide (All) credits the full delta to both owners.
    const all = makeEvent({ id: 'evt-all', target: 'All', coinDelta: 50, reputationDelta: 2 });
    expect(computeCompetitiveEventValue(s, all, 0)).toBe(52);
    expect(computeCompetitiveEventValue(s, all, 1)).toBe(52);

    // Duration events are board-wide (host-applied) → no per-owner value.
    const duration = { ...makeEvent({ id: 'evt-dur', target: 'All', coinDelta: 30 }), duration: 2 };
    expect(computeCompetitiveEventValue(s, duration as EventCard, 0)).toBe(0);
  });
});

// ── AC2: Staff-free competitive enumeration ──────────────────

describe('AC2 — Competitive enumeration excludes staff actions', () => {
  it('never offers hire-staff even when a staff card is affordable', () => {
    const s = compState('ac2-hire');
    padWallets(s, 1000);
    s.market.cards.push(makeStaff({ id: 'staff-affordable', cost: 20 }));

    const actions = enumerateCompetitiveLegalActions(s, 0);
    expect(actions.some(a => a.type === 'hire-staff')).toBe(false);
  });

  it('never offers peek-incident-deck even with peek-capable staff', () => {
    const s = compState('ac2-peek');
    padWallets(s, 1000);
    s.players![0].staffCards = [
      makeStaff({ id: 'peek-staff', specializationSkillIds: ['peek-incident-deck'] }),
    ];

    const actions = enumerateCompetitiveLegalActions(s, 0);
    expect(actions.some(a => a.type === 'peek-incident-deck')).toBe(false);
  });

  it('single-player enumeration still offers hire-staff (unchanged)', () => {
    const single = setupMainStreetGame({ seed: 'ac2-single-staff' });
    executeWeekStart(single);
    single.resourceBank.coins = 1000;
    single.market.cards.push(makeStaff({ id: 'staff-market', cost: 20 }));

    const actions = enumerateLegalActions(single);
    expect(actions.some(a => a.type === 'hire-staff')).toBe(true);
  });
});

// ── AC3: Deterministic action sequences ──────────────────────

describe('AC3 — Deterministic competitive replay', () => {
  /** Compact, comparable signature of an action. */
  function signature(action: PlayerAction): string {
    const a = action as unknown as Record<string, unknown>;
    return [
      a.type,
      a.cardId ?? '',
      a.slotIndex ?? '',
      a.handIndex ?? '',
      a.targetSlot ?? '',
      a.direction ?? '',
    ].join(':');
  }

  /**
   * Plays one shared day of MarketPhases with the competitive greedy
   * strategy, binding/restoring each player's seat around every action so
   * the engine's shared fields track the acting wallet. Returns the recorded
   * action signatures. Stops before the shared closing phases so the
   * comparison isolates the AI decision sequence.
   */
  function playSharedMarketWeek(state: MainStreetState, rng: () => number): string[] {
    executeCompetitiveWeekStart(state);
    const recorded: string[] = [];
    const n = state.players!.length;

    for (let playerId = 0; playerId < n; playerId++) {
      state.activePlayerId = playerId;
      let guard = 0;
      for (;;) {
        bindCompetitiveSeat(state, playerId);
        const action = CompetitiveGreedyStrategy.chooseAction(state, rng);
        recorded.push(`P${playerId}=${signature(action)}`);
        if (action.type === 'end-turn') break;
        expect(guard++).toBeLessThan(16);
        executeAction(state, action);
        restoreCompetitiveSeat(state, playerId);
      }
      endCompetitiveMarketTurn(state);
    }
    return recorded;
  }

  function run(seed: string): string[] {
    const state = createCompetitiveState({ seed, playerCount: 2 });
    padWallets(state, 2000);
    return playSharedMarketWeek(state, createSeededRng(987654321));
  }

  it('same seed + same strategy produces identical action sequences', () => {
    const a = run('det-competitive-42');
    const b = run('det-competitive-42');

    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
    // Both players acted within the shared day.
    expect(a.some(sig => sig.startsWith('P0='))).toBe(true);
    expect(a.some(sig => sig.startsWith('P1='))).toBe(true);
  });

  it('a different seed still produces a valid, terminating sequence', () => {
    const actions = run('det-competitive-other');
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.filter(sig => sig.includes('end-turn')).length).toBe(2);
  });
});

// ── AC4: Single-player paths unchanged ───────────────────────

describe('AC4 — N=1 falls back to the legacy single-player helpers', () => {
  it('enumerateCompetitiveLegalActions(N=1) equals enumerateLegalActions', () => {
    const state = createCompetitiveState({ seed: 'ac4-enum', playerCount: 1 });
    executeWeekStart(state);
    expect(isCompetitiveMode(state)).toBe(false);
    expect(enumerateCompetitiveLegalActions(state, 0)).toEqual(enumerateLegalActions(state));
  });

  it('scoreCompetitiveAction(N=1) equals scoreAction for every legal action', () => {
    const state = createCompetitiveState({ seed: 'ac4-score', playerCount: 1 });
    executeWeekStart(state);
    const legal = enumerateLegalActions(state);
    expect(legal.length).toBeGreaterThan(0);
    for (const action of legal) {
      expect(scoreCompetitiveAction(state, action, 0)).toBe(scoreAction(state, action));
    }
  });
});
