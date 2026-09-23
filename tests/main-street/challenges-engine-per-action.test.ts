/**
 * Main Street: Per-Action Challenge Evaluation (Engine Path)
 *
 * Verifies that the engine `executeAction` path evaluates challenges after
 * every successful action (producer decision Q2 = A: all paths), capturing
 * newly completed challenge IDs on the transient `_newlyCompletedThisAction`
 * field so the interactive scene can celebrate immediately. Also verifies
 * that the end-of-turn EndCheck safety net does not double-report (or
 * double-log) challenges completed mid-turn, and that `executeFullTurn`
 * surfaces mid-turn completions through `TurnResult`.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  syncResourceBankToLedger,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  executeAction,
  executeWeekStart,
  executeFullTurn,
  endTurnHeadless,
} from '../../example-games/main-street/MainStreetEngine';
import {
  CHALLENGE_TEMPLATES,
  type ActiveChallenge,
} from '../../example-games/main-street/MainStreetChallenges';
import {
  GRID_SIZE,
  type BusinessCard,
  type SynergyType,
} from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

/** Finds a challenge template by ID (throws if missing). */
function template(id: string): ActiveChallenge['challenge'] {
  const t = CHALLENGE_TEMPLATES.find(c => c.id === id);
  if (!t) throw new Error(`Challenge template '${id}' not found`);
  return t;
}

/** Replaces the active challenges with the given IDs (incomplete). */
function activate(state: MainStreetState, ...ids: string[]): void {
  state.activeChallenges = ids.map(id => ({ challenge: template(id), completed: false }));
}

/** Minimal business card fixture. */
function makeBiz(id: string, synergyTypes: readonly SynergyType[]): BusinessCard {
  return {
    family: 'business',
    id,
    name: id,
    cost: 100,
    baseIncome: 50,
    synergyTypes,
    maxLevel: 1,
    description: 'test business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
    appliedUpgrades: [],
  };
}

/** Fills the first `count` street slots with placeholder businesses. */
function fillStreet(state: MainStreetState, count: number): void {
  for (let i = 0; i < count && i < GRID_SIZE; i++) {
    state.streetGrid[i] = makeBiz(`fill-biz-${i}`, ['Food']);
  }
}

/** Starts the day (setupMainStreetGame leaves the game in WeekStart). */
function startTurn(state: MainStreetState): void {
  executeWeekStart(state);
}

/** Sets resources and mirrors them into the ledger (used by validators). */
function setResources(state: MainStreetState, coins: number, reputation: number): void {
  state.resourceBank.coins = coins;
  state.resourceBank.reputation = reputation;
  syncResourceBankToLedger(state);
}

/** Counts "Challenge completed" entries in the activity log. */
function challengeLogCount(state: MainStreetState, title: string): number {
  return state.activityLog.filter(
    e => e.text.includes('Challenge completed:') && e.text.includes(title),
  ).length;
}

// ── AC1 · Per-action completion via executeAction ───────────

describe('executeAction · per-action challenge evaluation', () => {
  it('completes a resource challenge immediately after a favour action', () => {
    const state = setupMainStreetGame({ seed: 'engine-per-action-resource' });
    startTurn(state);
    activate(state, 'ch-deep-pockets');

    // One rep→coins favour action away from the 3000-coin threshold.
    setResources(state, 2900, 200);

    executeAction(state, { type: 'community-favour', direction: 'rep-to-coins' });

    // Immediate completion: flag, list and activity log.
    expect(state.activeChallenges[0].completed).toBe(true);
    expect(state.challengesCompleted).toContain('ch-deep-pockets');
    expect(challengeLogCount(state, 'Deep Pockets')).toBe(1);
    // Transient per-action buffer surfaces the newly completed ID.
    expect(state._newlyCompletedThisAction).toEqual(['ch-deep-pockets']);
  });

  it('completes a placement challenge immediately after a placement action', () => {
    const state = setupMainStreetGame({ seed: 'engine-per-action-placement' });
    startTurn(state);
    activate(state, 'ch-bustling-street');

    setResources(state, 100000, 0);
    // Seven businesses placed — the next placement completes Bustling Street.
    fillStreet(state, 7);

    const card = state.market.cards.find(c => c.family === 'business');
    expect(card).toBeDefined();

    executeAction(state, {
      type: 'buy-and-place',
      cardId: card!.id,
      slotIndex: 7,
    });

    expect(state.activeChallenges[0].completed).toBe(true);
    expect(state.challengesCompleted).toContain('ch-bustling-street');
    expect(state._newlyCompletedThisAction).toEqual(['ch-bustling-street']);
  });

  it('clears the transient buffer for an action that completes nothing', () => {
    const state = setupMainStreetGame({ seed: 'engine-per-action-reset' });
    startTurn(state);
    activate(state, 'ch-deep-pockets');

    setResources(state, 2900, 200);
    executeAction(state, { type: 'community-favour', direction: 'rep-to-coins' });
    expect(state._newlyCompletedThisAction).toEqual(['ch-deep-pockets']);

    // A move-to-hand action leaves the (already-completed) challenge untouched.
    const card = state.market.cards.find(c => c.family === 'business')!;
    executeAction(state, { type: 'move-to-hand', cardId: card.id });

    expect(state._newlyCompletedThisAction).toEqual([]);
    expect(state.challengesCompleted.filter(id => id === 'ch-deep-pockets')).toHaveLength(1);
  });
});

// ── AC3/AC4 · Idempotency & end-of-turn safety net ──────────

describe('end-of-turn safety net · no double-reporting', () => {
  it('does not double-report a challenge completed mid-action at end of turn', () => {
    const state = setupMainStreetGame({ seed: 'engine-safety-net' });
    startTurn(state);
    activate(state, 'ch-deep-pockets');

    setResources(state, 2900, 200);
    executeAction(state, { type: 'community-favour', direction: 'rep-to-coins' });
    expect(state.challengesCompleted.filter(id => id === 'ch-deep-pockets')).toHaveLength(1);

    const result = endTurnHeadless(state);

    // The closing evaluation must NOT re-report the already-completed challenge.
    expect(result.newlyCompletedChallenges).not.toContain('ch-deep-pockets');
    expect(state.challengesCompleted.filter(id => id === 'ch-deep-pockets')).toHaveLength(1);
    expect(challengeLogCount(state, 'Deep Pockets')).toBe(1);
  });

  it('completes remaining challenges at end of turn without duplicating mid-turn ones', () => {
    const state = setupMainStreetGame({ seed: 'engine-safety-net-mixed' });
    startTurn(state);
    activate(state, 'ch-deep-pockets', 'ch-beloved-mayor');

    // Complete Deep Pockets mid-turn.
    setResources(state, 2900, 200);
    executeAction(state, { type: 'community-favour', direction: 'rep-to-coins' });
    expect(state.challengesCompleted).toContain('ch-deep-pockets');

    // Grant reputation so Beloved Mayor completes during the end-of-turn
    // safety-net evaluation.
    setResources(state, state.resourceBank.coins, 1000);

    const result = endTurnHeadless(state);
    expect(result.newlyCompletedChallenges).toContain('ch-beloved-mayor');
    expect(result.newlyCompletedChallenges).not.toContain('ch-deep-pockets');
    expect(state.challengesCompleted.filter(id => id === 'ch-deep-pockets')).toHaveLength(1);
    expect(state.challengesCompleted.filter(id => id === 'ch-beloved-mayor')).toHaveLength(1);
  });
});

// ── AC4 · executeFullTurn surfaces mid-turn completions ─────

describe('executeFullTurn · TurnResult carries mid-turn completions', () => {
  it('includes a challenge completed mid-turn in newlyCompletedChallenges', () => {
    const state = setupMainStreetGame({ seed: 'engine-full-turn' });
    activate(state, 'ch-deep-pockets');

    setResources(state, 2900, 200);

    const result = executeFullTurn(state, [
      { type: 'community-favour', direction: 'rep-to-coins' },
    ]);

    expect(result.newlyCompletedChallenges).toContain('ch-deep-pockets');
    expect(state.challengesCompleted.filter(id => id === 'ch-deep-pockets')).toHaveLength(1);
    expect(challengeLogCount(state, 'Deep Pockets')).toBe(1);
  });
});
