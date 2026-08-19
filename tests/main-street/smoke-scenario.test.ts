/**
 * Main Street: Smoke-Scenario Integration Test
 *
 * Runs a deterministic headless playthrough with the canonical smoke seed
 * ("smoke-1") and validates that the run completes without error and that
 * the final transcript contains all expected summary fields.
 *
 * Runs inside Vitest so it is part of the standard `npm test` quality gate.
 *
 * Usage:
 *   npx vitest run --project unit tests/main-street/smoke-scenario.test.ts
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  executeAction,
  processEndOfTurn,
  computeScore,
  type PlayerAction,
  type TurnResult,
} from '../../example-games/main-street/MainStreetEngine';
import {
  getAffordableBusinessCards,
  getAffordableUpgradeCards,
  getEmptySlots,
  canPurchaseEvent,
} from '../../example-games/main-street/MainStreetMarket';

// ── Canonical smoke seeds ─────────────────────────────────────

/** Canonical seed used by the Tutorial scenario smoke test. */
const SMOKE_SEED = 'smoke-1';

/**
 * Additional seeds exercised as regression targets.
 */
const REGRESSION_SEEDS = ['DemoSeed42', 'sweep-63', 'sweep-14', 'Bridge-Master-7'];

// ── Greedy strategy ────────────────────────────────────────────

interface TurnRecord {
  turn: number;
  actions: { type: string; detail: string }[];
  income: number | null;
  incident: string | null;
  coinsAfter: number;
  reputationAfter: number;
  score: number;
  gridOccupied: number;
}

interface RunSummary {
  game: 'main-street';
  version: '1.0.0';
  seed: string;
  totalTurns: number;
  result: 'win' | 'loss';
  endReason: string | null;
  finalScore: number;
  turns: TurnRecord[];
}

/**
 * Runs a full greedy headless game from a given seed.
 * Returns a RunSummary equivalent to the demo script output.
 */
function runGreedyGame(seed: string, maxTurns = 30): RunSummary {
  const state = setupMainStreetGame({ seed });
  const turns: TurnRecord[] = [];

  while (state.gameResult === 'playing' && state.turn <= maxTurns) {
    executeDayStart(state);

    const actions: PlayerAction[] = [];
    const executed: { type: string; detail: string }[] = [];

    // Buy cheapest affordable business and place in first empty slot
    const emptySlots = getEmptySlots(state);
    const affordable = getAffordableBusinessCards(state);
    affordable.sort((a, b) => a.cost - b.cost);
    if (affordable.length > 0 && emptySlots.length > 0) {
      const card = affordable[0];
      const slot = emptySlots[0];
      actions.push({ type: 'buy-business', cardId: card.id, slotIndex: slot });
    }

    // Play held event if any
    if ((state.hand ?? []).some(c => c.family === 'event')) {
      actions.push({ type: 'play-event' });
    }

    // Buy affordable investment event if none held
    for (const card of state.market.cards) {
      if (card.family !== 'event') continue;
      const result = canPurchaseEvent(state, card.id);
      if (result.legal) {
        actions.push({ type: 'buy-event', cardId: card.id });
        break;
      }
    }

    // Buy upgrade if available
    const upgrades = getAffordableUpgradeCards(state);
    if (upgrades.length > 0) {
      const upg = upgrades[0];
      const matchSlot = state.streetGrid.findIndex(
        b => b !== null && b.upgradePath === upg.targetBusiness && b.level < b.maxLevel,
      );
      if (matchSlot >= 0) {
        actions.push({ type: 'buy-upgrade', cardId: upg.id, targetSlot: matchSlot });
      }
    }

    actions.push({ type: 'end-turn' });

    for (const action of actions) {
      if (action.type === 'end-turn') break;
      try {
        executeAction(state, action);
        switch (action.type) {
          case 'buy-business': {
            const a = action as { type: string; cardId: string; slotIndex: number };
            executed.push({ type: 'buy-business', detail: `${a.cardId} -> slot ${a.slotIndex}` });
            break;
          }
          case 'buy-upgrade': {
            const a = action as { type: string; cardId: string; targetSlot?: number };
            executed.push({ type: 'buy-upgrade', detail: `${a.cardId} -> slot ${a.targetSlot}` });
            break;
          }
          case 'buy-event': {
            const a = action as { type: string; cardId: string };
            executed.push({ type: 'buy-event', detail: a.cardId });
            break;
          }
        }
      } catch {
        // Illegal action — skip
      }
    }

    if (executed.length === 0) {
      executed.push({ type: 'skip', detail: 'No affordable actions' });
    }

    const turnResult: TurnResult = processEndOfTurn(state);

    turns.push({
      turn: turns.length + 1,
      actions: executed,
      income: turnResult.income ? turnResult.income.total : null,
      incident: turnResult.incident ? turnResult.incident.name : null,
      coinsAfter: state.resourceBank.coins,
      reputationAfter: state.resourceBank.reputation,
      score: computeScore(state),
      gridOccupied: state.streetGrid.filter(s => s !== null).length,
    });

    if (state.gameResult !== 'playing') break;
  }

  return {
    game: 'main-street',
    version: '1.0.0',
    seed,
    totalTurns: turns.length,
    result: state.gameResult === 'win' ? 'win' : 'loss',
    endReason: state.endReason,
    finalScore: state.finalScore,
    turns,
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe('Smoke: Main Street Scenario (seed "smoke-1")', () => {
  it('completes without errors and emits all required summary fields', () => {
    const summary = runGreedyGame(SMOKE_SEED);

    // ── Required summary fields must be present ───────────────
    expect(summary.game).toBe('main-street');
    expect(summary.version).toBe('1.0.0');
    expect(summary.seed).toBe(SMOKE_SEED);
    expect(typeof summary.totalTurns).toBe('number');
    expect(summary.totalTurns).toBeGreaterThanOrEqual(1);
    expect(['win', 'loss']).toContain(summary.result);
    expect(summary.endReason).not.toBeUndefined();
    expect(typeof summary.finalScore).toBe('number');
    expect(Array.isArray(summary.turns)).toBe(true);
  });

  it('is deterministic: two runs with the same seed produce identical results', () => {
    const run1 = runGreedyGame(SMOKE_SEED);
    const run2 = runGreedyGame(SMOKE_SEED);

    expect(run1.result).toBe(run2.result);
    expect(run1.finalScore).toBe(run2.finalScore);
    expect(run1.totalTurns).toBe(run2.totalTurns);
    expect(run1.endReason).toBe(run2.endReason);
  });

  it('each turn record has the expected fields', () => {
    const summary = runGreedyGame(SMOKE_SEED);
    for (const turn of summary.turns) {
      expect(typeof turn.turn).toBe('number');
      expect(Array.isArray(turn.actions)).toBe(true);
      expect(typeof turn.coinsAfter).toBe('number');
      expect(typeof turn.reputationAfter).toBe('number');
      expect(typeof turn.score).toBe('number');
      expect(typeof turn.gridOccupied).toBe('number');
    }
  });
});

describe('Smoke: Main Street Easy difficulty (Tutorial scenario baseline)', () => {
  it('completes an Easy game with seed "smoke-1"', () => {
    const state = setupMainStreetGame({ seed: SMOKE_SEED, difficulty: 'Easy' });
    let turns = 0;
    // Harness-only termination guard (CG-0MSLXJCHH001DLIO): default presets
    // impose no turn limit, so the simulation loop uses a fixed safety cap.
    const safetyLimit = 60;

    while (state.gameResult === 'playing' && turns < safetyLimit) {
      executeDayStart(state);
      const affordable = getAffordableBusinessCards(state);
      const emptySlots = getEmptySlots(state);
      if (affordable.length > 0 && emptySlots.length > 0) {
        try {
          executeAction(state, { type: 'buy-business', cardId: affordable[0].id, slotIndex: emptySlots[0] });
        } catch { /* ignore illegal moves */ }
      }
      processEndOfTurn(state);
      turns++;
    }

    expect(state.gameResult).not.toBe('playing');
    expect(['win', 'loss']).toContain(state.gameResult);
    expect(state.endReason).not.toBeNull();
    expect(typeof state.finalScore).toBe('number');
    expect(turns).toBeGreaterThanOrEqual(1);
    expect(turns).toBeLessThanOrEqual(safetyLimit);
  });
});

describe('Smoke: Regression seeds complete without errors', () => {
  for (const seed of REGRESSION_SEEDS) {
    it(`seed "${seed}" runs to completion`, () => {
      const summary = runGreedyGame(seed);
      expect(summary.totalTurns).toBeGreaterThanOrEqual(1);
      expect(['win', 'loss']).toContain(summary.result);
      expect(summary.endReason).not.toBeUndefined();
      expect(typeof summary.finalScore).toBe('number');
    });
  }
});
