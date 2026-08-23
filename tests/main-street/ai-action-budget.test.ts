/**
 * Main Street: AI & Monte Carlo Action Budget Awareness (CG-0MSX41S7I009MMZN).
 *
 * Validates that the AI strategy and Monte Carlo harness respect the
 * 1–2 daily action budget:
 * - `enumerateLegalActions` filters action-type moves when the budget is
 *   spent (only `end-turn` is legal);
 * - `GreedyStrategy` / `RandomStrategy` auto-select `end-turn` when the
 *   budget is spent;
 * - a day-runner mirroring the harness loop executes at most 1 action-type
 *   action per day without a General Manager, and up to 2 with one;
 * - `playGame()` completes without error (no infinite loop).
 *
 * @module tests/main-street/ai-action-budget
 */

import { describe, it, expect } from 'vitest';

import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import {
  processEndOfTurn,
  executeDayStart,
  executeAction,
  type PlayerAction,
} from '../../example-games/main-street/MainStreetEngine';
import {
  enumerateLegalActions,
  RandomStrategy,
  GreedyStrategy,
  MainStreetAiPlayer,
} from '../../example-games/main-street/MainStreetAiStrategy';
import { hireStaffCard } from '../../example-games/main-street/MainStreetEngine';

// ── Helpers ─────────────────────────────────────────────────

/** Fresh setup in DayStart, ready for a day to begin. Not advanced yet. */
function setupState(seed = 'ai-budget-test'): MainStreetState {
  return setupMainStreetGame({ seed });
}

/** Deterministic RNG seeded with a constant. */
function makeRng(seed = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

const ACTION_TYPES = new Set<string>([
  'buy-business', 'move-to-hand', 'play-business-from-hand',
  'buy-and-place', 'hire-staff',
]);

function isActionType(a: PlayerAction): boolean {
  return ACTION_TYPES.has(a.type);
}

/**
 * Run the game for up to `maxDays` days mirroring the Monte Carlo harness:
 * executeDayStart → choose/execute actions until end-turn → processEndOfTurn.
 * Returns the maximum number of action-type actions executed in a single day.
 */
function runDays(state: MainStreetState, chooseAction: (s: MainStreetState) => PlayerAction, maxDays = 100): number {
  let maxPerDay = 0;
  let dayGuard = 0;
  let actionGuard = 0;
  while (state.gameResult === 'playing' && dayGuard < maxDays) {
    dayGuard++;
    executeDayStart(state);
    let actionCount = 0;
    let action = chooseAction(state);
    while (action.type !== 'end-turn' && state.gameResult === 'playing') {
      actionGuard++;
      if (actionGuard > 500) throw new Error('Action loop did not terminate');
      if (isActionType(action)) actionCount++;
      executeAction(state, action);
      if (state.gameResult !== 'playing') break;
      action = chooseAction(state);
    }
    maxPerDay = Math.max(maxPerDay, actionCount);
    processEndOfTurn(state);
  }
  return maxPerDay;
}

// ── enumerateLegalActions budget filtering ──────────────────

describe('enumerateLegalActions respects the action budget', () => {
  it('returns only end-turn when the budget is spent', () => {
    const state = setupState();
    state.actionsRemaining = 0;
    const actions = enumerateLegalActions(state);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('end-turn');
  });

  it('includes action-type moves when the budget is positive', () => {
    const state = setupState();
    state.actionsRemaining = 1;
    const actions = enumerateLegalActions(state);
    expect(actions.some(a => a.type === 'end-turn')).toBe(true);
    expect(actions.some(isActionType)).toBe(true);
  });
});

// ── Strategy chooseAction auto end-turn ─────────────────────

describe('strategies auto-select end-turn when the budget is spent', () => {
  it('RandomStrategy returns end-turn when budget is spent', () => {
    const state = setupState();
    state.actionsRemaining = 0;
    expect(RandomStrategy.chooseAction(state, makeRng()).type).toBe('end-turn');
  });

  it('GreedyStrategy returns end-turn when budget is spent', () => {
    const state = setupState();
    state.actionsRemaining = 0;
    expect(GreedyStrategy.chooseAction(state, makeRng()).type).toBe('end-turn');
  });
});

// ── MainStreetAiPlayer playGame budget discipline ───────────

describe('MainStreetAiPlayer respects the action budget', () => {
  it('playGame() with GreedyStrategy completes without error and makes progress', () => {
    const state = setupState('ai-budget-playgame');
    // maxTurns is read-only; use the default unlimited preset and a modest
    // guard inside playGame is not needed — the game loop must terminate.
    const player = new MainStreetAiPlayer(GreedyStrategy, makeRng(7));
    player.playGame(state);
    // No infinite loop: the game ended (win/loss) or reached a terminal state.
    expect(state.turn).toBeGreaterThan(0);
  });

  it('each day the AI executes at most 1 action-type action (no GM)', () => {
    const state = setupState('ai-budget-day');
    const player = new MainStreetAiPlayer(GreedyStrategy, makeRng(11));
    const maxPerDay = runDays(state, (s) => player.chooseAction(s));
    expect(maxPerDay).toBeLessThanOrEqual(1);
  });
});

// ── Monte Carlo-style loop respects the cap ─────────────────

describe('Monte Carlo-style loop respects the action cap', () => {
  it('executes at most actionsRemaining action-type actions per day', () => {
    const state = setupState('mc-budget-cap');
    // First legal action each time (end-turn only when the budget is spent).
    const maxPerDay = runDays(state, (s) => enumerateLegalActions(s)[0]);
    expect(maxPerDay).toBeLessThanOrEqual(1);
  });

  it('hiring a General Manager allows up to 2 action-type actions per day', () => {
    const state = setupState('mc-budget-gm');
    executeDayStart(state); // Day 1
    // Staff are hired from the general market row (CG-0MT3KZOBZ005IRYE);
    // if the seeded row lacks the GM, move one from the staff deck into it.
    let gm = state.market.cards.find((c: any) => c.id.startsWith('staff-general-manager'));
    if (!gm) {
      const deckGm = state.decks.staff.find((c: any) => c.id.startsWith('staff-general-manager'));
      if (deckGm) state.market.cards.push({ ...deckGm });
      gm = state.market.cards.find((c: any) => c.id.startsWith('staff-general-manager'));
    }
    expect(gm).toBeTruthy();
    state.resourceBank.coins = 30; // enough for the GM (cost 20), far below the win threshold
    hireStaffCard(state, gm!.id);
    processEndOfTurn(state); // Day 1 ends
    expect(state.phase).toBe('DayStart'); // game not ended by the hire

    // Day 2 → GM bonus applies: 1 base + 1 GM + 1 banked (from Day 1 idle remainder)
    // Day 1: 2 actions total, 1 spent hiring GM → 1 banks → Day 2 budget = 3.
    executeDayStart(state);
    expect(state.actionsRemaining).toBe(3); // 1 base + 1 GM + 1 banked (CG-0MT3IOPZB005LNAR)

    // With the 3-action budget the AI can execute up to 3 action-type
    // actions before end-turn is forced (banking-aware: CG-0MT3IOPZB005LNAR).
    let count = 0;
    let guard = 0;
    let action = enumerateLegalActions(state)[0];
    while (action.type !== 'end-turn' && state.gameResult === 'playing' && guard < 50) {
      guard++;
      if (isActionType(action)) count++;
      executeAction(state, action);
      action = enumerateLegalActions(state)[0];
    }
    expect(count).toBeLessThanOrEqual(3); // banking-aware upper bound (was 2 pre-banking)
    expect(count).toBeGreaterThan(0);
    processEndOfTurn(state);
  });
});
