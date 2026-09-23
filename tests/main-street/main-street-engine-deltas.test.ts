/**
 * Main Street: Deferred End-of-Turn Mutation Engine Tests
 * (CG-0MTR72P14000VO6Q — "Don't add coins/reputation/score until the end of
 * the end of turn cycle")
 *
 * Unit tests pinning the engine contract behind the deferred-mutation
 * pattern: with `deferResourceApplication`, the end-of-turn engine functions
 * COMPUTE resource deltas without mutating `state.resourceBank` /
 * `state.finalScore`, `processEndOfTurn` returns them in
 * `TurnResult.pending*Delta`, and the headless/AI path (no deferral) keeps
 * its legacy immediate-apply behaviour and determinism.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import { recalculateCard, applyIncome } from '../../example-games/main-street/MainStreetAdjacency';
import {
  processEndOfTurn,
  resolveIncident,
  applyStaffOngoingCosts,
  applyCommunitySpaceOngoingCosts,
  applyBusinessOngoingCosts,
  applyEndOfTurnDeltas,
  finishDeferredTurnClosing,
  endTurnHeadless,
  updateScore,
} from '../../example-games/main-street/MainStreetEngine';
import type { BusinessCard, EventCard } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed = 'deferred-deltas'): MainStreetState {
  const state = setupMainStreetGame({ seed });
  state.phase = 'MarketPhase';
  return state;
}

function makeBiz(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business',
    id: overrides.id ?? 'test-biz',
    name: overrides.name ?? 'Test Biz',
    cost: overrides.cost ?? 3,
    baseIncome: overrides.baseIncome ?? 10,
    synergyTypes: overrides.synergyTypes ?? ['Food'],
    maxLevel: overrides.maxLevel ?? 1,
    description: overrides.description ?? 'A test business',
    level: overrides.level ?? 0,
    incomeBonus: overrides.incomeBonus ?? 0,
    synergyRangeBonus: overrides.synergyRangeBonus ?? 0,
    reputationBonus: overrides.reputationBonus ?? 0,
    ongoingCost: overrides.ongoingCost ?? 0,
  };
}

function makeIncident(overrides: Partial<EventCard> = {}): EventCard {
  return {
    family: 'event' as const,
    id: overrides.id ?? 'evt-test-incident',
    name: overrides.name ?? 'Test Incident',
    trigger: 'Incident' as const,
    cost: 0,
    effect: 'test effect',
    target: 'All' as const,
    coinDelta: overrides.coinDelta ?? -20,
    reputationDelta: overrides.reputationDelta ?? 0,
    hasChoices: overrides.hasChoices ?? false,
    acceptNextCardId: overrides.acceptNextCardId ?? undefined,
    rejectNextCardId: overrides.rejectNextCardId ?? undefined,
  };
}

/** Places a producing business and syncs its cached income. */
function placeIncomeBusiness(state: MainStreetState, slot = 0, income = 10): void {
  state.streetGrid[slot] = makeBiz({ id: `biz-${slot}`, baseIncome: income });
  recalculateCard(state, slot);
}

// ── applyIncome: delta-returning, non-mutating ─────────────

describe('applyIncome (deferred-mutation)', () => {
  it('returns coinDelta/repDelta and does NOT mutate resourceBank when apply === false', () => {
    const state = createTestState('income-defer');
    placeIncomeBusiness(state, 0, 10);
    const coinsBefore = state.resourceBank.coins;
    const repBefore = state.resourceBank.reputation;

    const result = applyIncome(state, { apply: false });

    // Deltas are positive (income earned) and reported.
    expect(result.coinDelta).toBeGreaterThan(0);
    expect(result.repDelta).toBe(0);
    // No mutation happened.
    expect(state.resourceBank.coins).toBe(coinsBefore);
    expect(state.resourceBank.reputation).toBe(repBefore);
  });

  it('applies the deltas when apply is defaulted (legacy headless contract)', () => {
    const state = createTestState('income-legacy');
    placeIncomeBusiness(state, 0, 10);
    const coinsBefore = state.resourceBank.coins;

    const result = applyIncome(state);

    expect(state.resourceBank.coins).toBe(coinsBefore + (result.coinDelta ?? 0));
  });

  it('applying the reported deltas reproduces the legacy end state', () => {
    const state = createTestState('income-parity');
    placeIncomeBusiness(state, 0, 10);

    // Deferred computation + applyEndOfTurnDeltas…
    const deferred = applyIncome(state, { apply: false });
    const coinsAfterDeferred = state.resourceBank.coins;
    applyEndOfTurnDeltas(state, {
      pendingCoinDelta: deferred.coinDelta,
      pendingRepDelta: deferred.repDelta,
      pendingScoreDelta: 0,
    });

    // …must equal the legacy immediate-apply end state.
    const state2 = createTestState('income-parity');
    placeIncomeBusiness(state2, 0, 10);
    applyIncome(state2);

    expect(state.resourceBank.coins).toBe(state2.resourceBank.coins);
    void coinsAfterDeferred;
  });
});

// ── Ongoing costs: delta-returning, non-mutating ───────────

describe('ongoing costs (deferred-mutation)', () => {
  it('applyStaffOngoingCosts returns a negative delta without mutating when apply === false', () => {
    const state = createTestState('staff-cost-defer');
    state.resourceBank.coins = 200;
    // Staff with an ongoing salary.
    state.staffCards = [{
      family: 'staff',
      id: 'staff-1',
      name: 'Tester',
      cost: 0,
      ongoingCost: 50,
      role: 'crew',
      specializationSkillIds: [],
    } as unknown as NonNullable<MainStreetState['staffCards']>[number]];
    const coinsBefore = state.resourceBank.coins;

    const delta = applyStaffOngoingCosts(state, { apply: false });

    expect(delta).toBe(-50);
    expect(state.resourceBank.coins).toBe(coinsBefore);
  });

  it('applyCommunitySpaceOngoingCosts returns a negative delta without mutating when apply === false', () => {
    const state = createTestState('community-cost-defer');
    state.resourceBank.coins = 200;
    state.streetGrid[0] = {
      family: 'community-space',
      id: 'lib-1',
      name: 'Library',
      cost: 0,
      ongoingCost: 25,
    } as unknown as NonNullable<MainStreetState['streetGrid']>[number];
    const coinsBefore = state.resourceBank.coins;

    const delta = applyCommunitySpaceOngoingCosts(state, { apply: false });

    expect(delta).toBe(-25);
    expect(state.resourceBank.coins).toBe(coinsBefore);
  });

  it('applyBusinessOngoingCosts returns a negative delta without mutating when apply === false', () => {
    const state = createTestState('biz-cost-defer');
    state.resourceBank.coins = 200;
    state.streetGrid[0] = makeBiz({ id: 'biz-cost', ongoingCost: 40 });
    const coinsBefore = state.resourceBank.coins;

    const delta = applyBusinessOngoingCosts(state, { apply: false });

    expect(delta).toBe(-40);
    expect(state.resourceBank.coins).toBe(coinsBefore);
  });

  it('legacy calls (no opts) still deduct immediately', () => {
    const state = createTestState('staff-cost-legacy');
    state.resourceBank.coins = 200;
    state.staffCards = [{
      family: 'staff',
      id: 'staff-1',
      name: 'Tester',
      cost: 0,
      ongoingCost: 50,
      role: 'crew',
      specializationSkillIds: [],
    } as unknown as NonNullable<MainStreetState['staffCards']>[number]];
    const coinsBefore = state.resourceBank.coins;

    applyStaffOngoingCosts(state);

    expect(state.resourceBank.coins).toBe(coinsBefore - 50);
  });
});

// ── resolveIncident: delta-returning, non-mutating ─────────

describe('resolveIncident (deferred-mutation)', () => {
  it('computes deltas via deltasOut without mutating resourceBank when apply === false', () => {
    const state = createTestState('incident-defer');
    state.resourceBank.coins = 500;
    state.incidentDeck = [makeIncident({ id: 'evt-loss', name: 'Loss', coinDelta: -50 })];
    const deltasOut = { coinChange: 0, repChange: 0 };

    const event = resolveIncident(state, { apply: false, deltasOut });

    expect(event).not.toBeNull();
    expect(event!.id).toBe('evt-loss');
    expect(deltasOut.coinChange).toBeLessThan(0);
    expect(state.resourceBank.coins).toBe(500); // not mutated
  });

  it('mutates resourceBank in legacy mode (no opts)', () => {
    const state = createTestState('incident-legacy');
    state.resourceBank.coins = 500;
    state.incidentDeck = [makeIncident({ id: 'evt-loss', name: 'Loss', coinDelta: -50 })];
    const coinsBefore = state.resourceBank.coins;

    resolveIncident(state);

    expect(state.resourceBank.coins).toBeLessThan(coinsBefore);
  });
});

// ── processEndOfTurn: deferred collection of deltas ────────

describe('processEndOfTurn (deferResourceApplication)', () => {
  it('populates pending deltas and does NOT mutate resources or score', () => {
    const state = createTestState('eot-defer');
    placeIncomeBusiness(state, 0, 10); // +10 income
    state.incidentDeck = []; // deterministic: no random incident
    state.resourceBank.coins = 100;
    const coinsBefore = state.resourceBank.coins;
    const fadeAtStart = state.resourceBank.reputation;
    const scoreBefore = state.finalScore;

    const result = processEndOfTurn(state, { deferResourceApplication: true });

    expect(result.requiresDeferredClosing).toBe(true);
    expect(result.pendingCoinDelta).toBeGreaterThan(0);
    expect(result.pendingRepDelta).toBe(0);
    // Nothing applied yet.
    expect(state.resourceBank.coins).toBe(coinsBefore);
    expect(state.resourceBank.reputation).toBe(fadeAtStart);
    expect(state.finalScore).toBe(scoreBefore);
  });

  it('applies deltas and closes deterministically in legacy mode', () => {
    const state = createTestState('eot-legacy');
    placeIncomeBusiness(state, 0, 10);
    state.incidentDeck = []; // deterministic: no random incident
    state.resourceBank.coins = 100;
    const coinsBefore = state.resourceBank.coins;

    const result = processEndOfTurn(state);

    expect(result.requiresDeferredClosing ?? false).toBe(false);
    expect(state.resourceBank.coins).toBeGreaterThan(coinsBefore);
  });

  it('finishDeferredTurnClosing applies deltas then evaluates end conditions and advances the day once', () => {
    const state = createTestState('eot-close');
    placeIncomeBusiness(state, 0, 10);
    state.incidentDeck = [];
    state.resourceBank.coins = 100;
    const turnBefore = state.turn;
    const coinsBefore = state.resourceBank.coins;

    const deferred = processEndOfTurn(state, { deferResourceApplication: true });
    // Simulate the scene: apply exactly once, then run the closing tail.
    applyEndOfTurnDeltas(state, deferred);
    const final = finishDeferredTurnClosing(state, deferred);

    expect(final.gameResult).toBe('playing');
    expect(state.resourceBank.coins).toBe(coinsBefore + (deferred.pendingCoinDelta ?? 0));
    // Day advanced exactly once.
    expect(state.turn).toBe(turnBefore + 1);
    expect(state.phase).toBe('WeekStart');
    expect(final.finalScore).toBeGreaterThanOrEqual(0);
  });

  it('applyEndOfTurnDeltas is idempotent-safe to call twice on the same snapshot? no — applying twice double-adds, so the scene guard is required', () => {
    const state = createTestState('eot-twice');
    placeIncomeBusiness(state, 0, 10);
    state.incidentDeck = [];
    state.resourceBank.coins = 100;
    const deferred = processEndOfTurn(state, { deferResourceApplication: true });

    applyEndOfTurnDeltas(state, deferred);
    const afterFirst = state.resourceBank.coins;
    applyEndOfTurnDeltas(state, deferred); // the scene guard must prevent this
    expect(state.resourceBank.coins).toBe(afterFirst + (deferred.pendingCoinDelta ?? 0));
  });

  it('finishDeferredTurnClosing runs the game-over evaluation only after application (score includes income)', () => {
    const state = createTestState('eot-win');
    // Start exactly at the difficulty's win threshold — the closing's EndCheck
    // must see the score at/over it and declare the win. (Read the threshold:
    // config fields are read-only by design.)
    state.resourceBank.coins = state.config.winThreshold;
    state.incidentDeck = [];
    state.phase = 'MarketPhase';

    const deferred = processEndOfTurn(state, { deferResourceApplication: true });
    applyEndOfTurnDeltas(state, deferred);
    const final = finishDeferredTurnClosing(state, deferred);

    expect(final.gameResult).toBe('win');
    expect(deferred.gameResult).toBe('playing'); // pre-closing result was stale
  });
});

// ── Headless / AI regression suite ─────────────────────────

describe('endTurnHeadless (AI/sim contract preserved — AC6)', () => {
  it('still mutates state and produces deterministic results', () => {
    const state = createTestState('headless-1');
    placeIncomeBusiness(state, 0, 10);
    state.resourceBank.coins = 100;
    const coinsBefore = state.resourceBank.coins;

    const result = endTurnHeadless(state);

    expect(result.requiresDeferredClosing ?? false).toBe(false);
    expect(state.resourceBank.coins).toBeGreaterThan(coinsBefore);
  });

  it('same seed → same result (determinism unchanged)', () => {
    const run = (seed: string): { coins: number; turn: number } => {
      const state = createTestState(seed);
      placeIncomeBusiness(state, 0, 10);
      state.resourceBank.coins = 100;
      endTurnHeadless(state);
      return { coins: state.resourceBank.coins, turn: state.turn };
    };
    expect(run('det-a')).toEqual(run('det-a'));
  });

  it('headless deltas match the deferred closing deltas (parity)', () => {
    // Same seed, same board: the interactive deferred path (compute →
    // apply → close) must produce the same resources as the legacy headless
    // path, so browser and sim results never diverge.
    const stateHeadless = createTestState('parity');
    stateHeadless.resourceBank.coins = 100;
    placeIncomeBusiness(stateHeadless, 0, 0); // no income (incident-only turn)
    stateHeadless.incidentDeck = [makeIncident({ id: 'evt-loss', name: 'Loss', coinDelta: -20 })];
    const headlessResult = endTurnHeadless(stateHeadless);

    const stateDeferred = createTestState('parity');
    stateDeferred.resourceBank.coins = 100;
    placeIncomeBusiness(stateDeferred, 0, 0);
    stateDeferred.incidentDeck = [makeIncident({ id: 'evt-loss', name: 'Loss', coinDelta: -20 })];
    const deferredResult = processEndOfTurn(stateDeferred, { deferResourceApplication: true });
    applyEndOfTurnDeltas(stateDeferred, deferredResult);
    finishDeferredTurnClosing(stateDeferred, deferredResult);

    expect(stateDeferred.resourceBank.coins).toBe(stateHeadless.resourceBank.coins);
    expect(stateDeferred.resourceBank.reputation).toBe(stateHeadless.resourceBank.reputation);
    expect(stateDeferred.turn).toBe(stateHeadless.turn);
    expect(stateDeferred.gameResult).toBe(stateHeadless.gameResult);
    // The deferred pending deltas must match the legacy applied deltas.
    expect(deferredResult.pendingCoinDelta).toBe(
      stateHeadless.resourceBank.coins - 100,
    );
    void headlessResult;
  });

  it('updateScore reflects the deferred resources only after application', () => {
    const state = createTestState('score-defer');
    state.resourceBank.coins = 40;
    updateScore(state);
    const scoreBefore = state.finalScore;

    const result = processEndOfTurn(state, { deferResourceApplication: true });

    // Legacy: processEndOfTurn → runSinglePlayerTurnClosing → checkEndConditions
    // calls updateScore internally. Deferred: score is untouched until the
    // closing applies the deltas.
    expect(state.finalScore).toBe(scoreBefore);
    expect(result.pendingScoreDelta ?? 0).toBe(0);
  });
});