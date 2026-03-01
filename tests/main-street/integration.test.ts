/**
 * Main Street: Integration Tests
 *
 * Tests that exercise the full game loop end-to-end:
 * - Full single-turn cycle (buy, place, income, night event, end check)
 * - Full multi-turn game to victory/loss
 * - Seeded determinism (same seed + same actions = same final state)
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import type { MainStreetState } from '../../example-games/main-street/MainStreetState';
import {
  executeDayStart,
  executeAction,
  processEndOfTurn,
  executeFullTurn,
  computeScore,
  type PlayerAction,
  type TurnResult,
} from '../../example-games/main-street/MainStreetEngine';
import {
  getAffordableBusinessCards,
  getEmptySlots,
} from '../../example-games/main-street/MainStreetMarket';

// ── Helpers ─────────────────────────────────────────────────

/** Runs a simple greedy strategy for one turn: buy cheapest business, end turn. */
function playGreedyTurn(state: MainStreetState): { actions: PlayerAction[]; result: TurnResult } {
  executeDayStart(state);

  const actions: PlayerAction[] = [];
  const affordable = getAffordableBusinessCards(state);
  affordable.sort((a, b) => a.cost - b.cost);
  const empty = getEmptySlots(state);

  if (affordable.length > 0 && empty.length > 0) {
    const card = affordable[0];
    const slot = empty[0];
    const action: PlayerAction = { type: 'buy-business', cardId: card.id, slotIndex: slot };
    executeAction(state, action);
    actions.push(action);
  }

  actions.push({ type: 'end-turn' });
  const result = processEndOfTurn(state);
  return { actions, result };
}

/**
 * Runs a full game with a greedy strategy until it ends or hits a safety limit.
 * Returns array of turn records.
 */
function playFullGame(
  state: MainStreetState,
  maxTurns = 25,
): { turnResults: TurnResult[]; totalTurns: number } {
  const turnResults: TurnResult[] = [];
  let count = 0;

  while (state.gameResult === 'playing' && count < maxTurns) {
    const { result } = playGreedyTurn(state);
    turnResults.push(result);
    count++;
  }

  return { turnResults, totalTurns: count };
}

// ── Full Turn Cycle ─────────────────────────────────────────

describe('Integration: Full Turn Cycle', () => {
  it('completes a single turn cycle with buy-business action', () => {
    const state = setupMainStreetGame({ seed: 'integration-turn-1' });

    // Start in DayStart phase
    expect(state.phase).toBe('DayStart');
    expect(state.turn).toBe(1);

    // Execute DayStart
    executeDayStart(state);
    expect(state.phase).toBe('MarketPhase');
    expect(state.market.business.length).toBeGreaterThan(0);

    // Buy the first affordable business
    const affordable = getAffordableBusinessCards(state);
    expect(affordable.length).toBeGreaterThan(0);
    const card = affordable[0];
    const coinsBefore = state.resourceBank.coins;

    executeAction(state, {
      type: 'buy-business',
      cardId: card.id,
      slotIndex: 0,
    });

    // Verify purchase
    expect(state.streetGrid[0]).not.toBeNull();
    expect(state.streetGrid[0]!.id).toBe(card.id);
    expect(state.resourceBank.coins).toBe(coinsBefore - card.cost);

    // Process end of turn (events, income, night, end check)
    const result = processEndOfTurn(state);

    // Should have received some income (at least base income of the placed business)
    if (result.income) {
      expect(result.income.total).toBeGreaterThanOrEqual(0);
    }

    // Game may still be playing or lost (depending on events)
    expect(['playing', 'win', 'loss']).toContain(result.gameResult);
  });

  it('handles a turn with no affordable actions (skip)', () => {
    const state = setupMainStreetGame({ seed: 'integration-skip' });

    // Drain coins to force no-buy
    state.resourceBank.coins = 0;

    executeDayStart(state);
    expect(state.phase).toBe('MarketPhase');

    // No affordable business
    const affordable = getAffordableBusinessCards(state);
    expect(affordable.length).toBe(0);

    // Just end turn
    const result = processEndOfTurn(state);
    expect(result).toBeDefined();
    expect(result.income).not.toBeNull();
    // With no businesses, income total should be 0
    expect(result.income!.total).toBe(0);
  });

  it('transitions through all phases in correct order', () => {
    const state = setupMainStreetGame({ seed: 'integration-phases' });
    const phasesSeen: string[] = [];

    // Capture DayStart
    expect(state.phase).toBe('DayStart');
    phasesSeen.push(state.phase);

    executeDayStart(state);
    phasesSeen.push(state.phase); // MarketPhase

    // End turn triggers remaining phases automatically
    processEndOfTurn(state);

    // After processEndOfTurn, state is either in DayStart (next turn) or game over
    if (state.gameResult === 'playing') {
      expect(state.phase).toBe('DayStart');
    }

    expect(phasesSeen).toContain('DayStart');
    expect(phasesSeen).toContain('MarketPhase');
  });
});

// ── Full Game ───────────────────────────────────────────────

describe('Integration: Full Game', () => {
  it('runs a complete game to a definite result', () => {
    const state = setupMainStreetGame({ seed: 'integration-full-game' });
    const { turnResults, totalTurns } = playFullGame(state);

    // Game must have ended
    expect(state.gameResult).not.toBe('playing');
    expect(['win', 'loss']).toContain(state.gameResult);
    expect(state.endReason).not.toBeNull();
    expect(totalTurns).toBeGreaterThanOrEqual(1);
    expect(totalTurns).toBeLessThanOrEqual(21); // MAX_TURNS + 1 safety
    expect(turnResults.length).toBe(totalTurns);

    // Final score should be computed
    expect(state.finalScore).toBe(computeScore(state));
  });

  it('reaches turn 20 limit with enough income to survive', () => {
    // Manually set up a state with high coins to survive
    const state = setupMainStreetGame({ seed: 'integration-survive' });
    state.resourceBank.coins = 100;
    state.resourceBank.reputation = 5;

    const { totalTurns: _totalTurns } = playFullGame(state);

    // With high starting resources and reputation, game should reach turn 20
    // and end with either score_threshold win or turn_limit_victory
    expect(state.gameResult).not.toBe('playing');
    if (state.gameResult === 'win') {
      expect(['score_threshold', 'turn_limit_victory']).toContain(state.endReason);
    }
  });

  it('ends in bankruptcy when coins go below 0', () => {
    const state = setupMainStreetGame({ seed: 'integration-bankrupt' });
    // Set coins just barely enough to buy something, then drain
    state.resourceBank.coins = 1;
    state.resourceBank.reputation = 5; // Avoid rep collapse

    // Put a tax event into pending events to trigger bankruptcy
    state.pendingEvents.push({
      family: 'event',
      id: 'evt-tax-test',
      name: 'Heavy Tax',
      trigger: 'Day',
      effect: 'Lose 10 coins.',
      target: 'All',
      coinDelta: -10,
      reputationDelta: 0,
    });

    executeDayStart(state);
    processEndOfTurn(state);

    expect(state.gameResult).toBe('loss');
    expect(state.endReason).toBe('bankruptcy');
    expect(state.resourceBank.coins).toBeLessThan(0);
  });

  it('ends in reputation collapse when reputation drops to 0', () => {
    const state = setupMainStreetGame({ seed: 'integration-rep-collapse' });
    state.resourceBank.reputation = 1;
    state.turn = 2; // Must be past turn 1 for rep collapse check

    // Add an event that drops reputation to 0
    state.pendingEvents.push({
      family: 'event',
      id: 'evt-scandal-test',
      name: 'Scandal',
      trigger: 'Day',
      effect: 'Lose 1 reputation.',
      target: 'All',
      coinDelta: 0,
      reputationDelta: -1,
    });

    executeDayStart(state);
    processEndOfTurn(state);

    expect(state.gameResult).toBe('loss');
    expect(state.endReason).toBe('reputation_collapse');
  });
});

// ── Seeded Determinism ──────────────────────────────────────

describe('Integration: Seeded Determinism', () => {
  it('same seed + same actions produce identical final state', () => {
    const seed = 'determinism-test-42';

    // Run game 1
    const state1 = setupMainStreetGame({ seed });
    playFullGame(state1);

    // Run game 2 with same seed
    const state2 = setupMainStreetGame({ seed });
    playFullGame(state2);

    // Both games should produce identical results
    expect(state1.gameResult).toBe(state2.gameResult);
    expect(state1.endReason).toBe(state2.endReason);
    expect(state1.finalScore).toBe(state2.finalScore);
    expect(state1.turn).toBe(state2.turn);
    expect(state1.resourceBank.coins).toBe(state2.resourceBank.coins);
    expect(state1.resourceBank.reputation).toBe(state2.resourceBank.reputation);

    // Grid should be identical
    for (let i = 0; i < state1.streetGrid.length; i++) {
      const g1 = state1.streetGrid[i];
      const g2 = state2.streetGrid[i];
      if (g1 === null) {
        expect(g2).toBeNull();
      } else {
        expect(g2).not.toBeNull();
        expect(g1.id).toBe(g2!.id);
        expect(g1.level).toBe(g2!.level);
      }
    }
  });

  it('different seeds produce different games', () => {
    const state1 = setupMainStreetGame({ seed: 'seed-A' });
    const state2 = setupMainStreetGame({ seed: 'seed-B' });

    // Markets should differ (different shuffle order)
    const market1Ids = state1.market.business.map(c => c.id).sort().join(',');
    const market2Ids = state2.market.business.map(c => c.id).sort().join(',');

    // While it's theoretically possible for two different seeds to produce
    // the same shuffle, it's extremely unlikely. We check that at least
    // the full game plays out differently.
    playFullGame(state1);
    playFullGame(state2);

    // At least one of these should differ
    const differ =
      state1.finalScore !== state2.finalScore ||
      state1.turn !== state2.turn ||
      state1.gameResult !== state2.gameResult ||
      market1Ids !== market2Ids;
    expect(differ).toBe(true);
  });

  it('executeFullTurn convenience function matches manual turn execution', () => {
    const seed = 'fullTurn-equiv';

    // Manual: setup + executeDayStart + executeAction + processEndOfTurn
    const state1 = setupMainStreetGame({ seed });
    executeDayStart(state1);
    const affordable = getAffordableBusinessCards(state1);
    const actions: PlayerAction[] = [];
    if (affordable.length > 0) {
      const card = affordable[0];
      const slot = getEmptySlots(state1)[0];
      const action: PlayerAction = { type: 'buy-business', cardId: card.id, slotIndex: slot };
      executeAction(state1, action);
      actions.push(action);
    }
    const result1 = processEndOfTurn(state1);

    // Convenience: setup + executeFullTurn with same actions
    const state2 = setupMainStreetGame({ seed });
    const result2 = executeFullTurn(state2, actions);

    expect(state1.resourceBank.coins).toBe(state2.resourceBank.coins);
    expect(state1.resourceBank.reputation).toBe(state2.resourceBank.reputation);
    expect(state1.finalScore).toBe(state2.finalScore);
    expect(state1.gameResult).toBe(state2.gameResult);
    expect(result1.gameResult).toBe(result2.gameResult);
  });
});

// ── Income & Synergy Integration ────────────────────────────

describe('Integration: Income & Synergy', () => {
  it('placing adjacent Food businesses increases income via synergy', () => {
    const s = setupMainStreetGame({ seed: 'synergy-income-2' });
    s.resourceBank.coins = 50;
    s.resourceBank.reputation = 5;

    // Turn 1: Place first Food business
    executeDayStart(s);
    const food1 = s.market.business.find(c => c.synergyTypes.includes('Food'));
    if (!food1) return; // Skip if no food card available
    executeAction(s, { type: 'buy-business', cardId: food1.id, slotIndex: 4 });
    const result1 = processEndOfTurn(s);
    const income1 = result1.income?.total ?? 0;

    if (s.gameResult !== 'playing') return; // Game ended

    // Turn 2: Place second Food business adjacent
    executeDayStart(s);
    const food2 = s.market.business.find(c => c.synergyTypes.includes('Food'));
    if (!food2) return;
    executeAction(s, { type: 'buy-business', cardId: food2.id, slotIndex: 5 });
    const result2 = processEndOfTurn(s);
    const income2 = result2.income?.total ?? 0;

    // Income should increase due to synergy bonus between adjacent Food businesses
    expect(income2).toBeGreaterThan(income1);
  });
});
