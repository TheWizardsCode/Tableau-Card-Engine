/**
 * Community Favour (CG-0MSTOATDQ005XDET): AI strategy tests.
 *
 * Covers:
 * - AC1: enumerateLegalActions includes both directions when affordable,
 *   gate unused, and in MarketPhase
 * - AC1: excludes when resource insufficient, gate spent, or not in
 *   MarketPhase
 * - AC2: scoreAction gives a sensible heuristic (higher when cash-strapped)
 * - AC3/AC4: AI can execute a free favour action when the market is
 *   unaffordable, so the turn never stalls
 */
import { describe, it, expect } from 'vitest';

import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import { executeDayStart, executeAction } from '../../example-games/main-street/MainStreetEngine';
import type { PlayerAction } from '../../example-games/main-street/MainStreetEngine';
import {
  enumerateLegalActions,
  scoreAction,
  GreedyStrategy,
  MainStreetAiPlayer,
} from '../../example-games/main-street/MainStreetAiStrategy';
import { createSeededRng } from '../../src/core-engine/SeededRng';

function createTestState(seed: string = 'cf-ai-test'): MainStreetState {
  const state = setupMainStreetGame({ seed });
  executeDayStart(state);
  return state;
}

function favourActions(actions: PlayerAction[]): Array<{ type: 'community-favour'; direction: 'coins-to-rep' | 'rep-to-coins' }> {
  return actions.filter(a => a.type === 'community-favour') as Array<{ type: 'community-favour'; direction: 'coins-to-rep' | 'rep-to-coins' }>;
}

// ── AC1: Enumerated when legal ──────────────────────────────

describe('enumerateLegalActions: Community Favour', () => {
  it('includes both directions when resources suffice and gate unused', () => {
    const state = createTestState();
    state.resourceBank.coins = 1000;
    state.resourceBank.reputation = 1000;
    state.favourUsedThisTurn = false;

    const favs = favourActions(enumerateLegalActions(state));
    expect(favs.map(f => f.direction).sort()).toEqual(['coins-to-rep', 'rep-to-coins']);
  });

  it('excludes coins-to-rep when coins are insufficient', () => {
    const state = createTestState();
    state.resourceBank.coins = state.config.favourCoinsToRepCost - 1;
    state.resourceBank.reputation = 1000;
    state.favourUsedThisTurn = false;

    const favs = favourActions(enumerateLegalActions(state));
    expect(favs.some(f => f.direction === 'coins-to-rep')).toBe(false);
    expect(favs.some(f => f.direction === 'rep-to-coins')).toBe(true);
  });

  it('excludes rep-to-coins when reputation is insufficient', () => {
    const state = createTestState();
    state.resourceBank.coins = 1000;
    state.resourceBank.reputation = state.config.favourRepToCoinsRepCost - 1;
    state.favourUsedThisTurn = false;

    const favs = favourActions(enumerateLegalActions(state));
    expect(favs.some(f => f.direction === 'rep-to-coins')).toBe(false);
    expect(favs.some(f => f.direction === 'coins-to-rep')).toBe(true);
  });

  it('excludes both when the once-per-turn gate is spent', () => {
    const state = createTestState();
    state.resourceBank.coins = 1000;
    state.resourceBank.reputation = 1000;
    state.favourUsedThisTurn = true;

    expect(favourActions(enumerateLegalActions(state))).toHaveLength(0);
  });

  it('excludes both outside MarketPhase', () => {
    const state = createTestState();
    state.resourceBank.coins = 1000;
    state.resourceBank.reputation = 1000;
    state.favourUsedThisTurn = false;
    state.phase = 'IncomePhase';

    expect(favourActions(enumerateLegalActions(state))).toHaveLength(0);
  });

  it('is NOT available when the daily action budget is spent (now costs an action)', () => {
    const state = createTestState();
    state.resourceBank.coins = 1000;
    state.resourceBank.reputation = 1000;
    state.favourUsedThisTurn = false;
    state.actionsRemaining = 0;

    // Community Favour now consumes an action, so it should NOT be available
    // when actionsRemaining === 0 (consumeAction would throw).
    const favs = favourActions(enumerateLegalActions(state));
    expect(favs.length).toBe(0);
    // end-turn still present so the AI loop terminates.
    expect(enumerateLegalActions(state).some(a => a.type === 'end-turn')).toBe(true);
  });
});

// ── AC2: scoreAction heuristic ──────────────────────────────

describe('scoreAction: Community Favour', () => {
  it('scores rep-to-coins above the default when cash-strapped with rep to spare', () => {
    const state = createTestState();
    // Make every market card unaffordable (stalled turn) and provide a
    // reputation buffer, so the rep→coins fallback is genuinely valuable.
    state.resourceBank.coins = 0;
    state.market.cards.forEach(c => { (c as { cost: number }).cost = 10; });
    state.resourceBank.reputation = state.config.favourRepToCoinsRepCost + 1; // safe buffer
    state.favourUsedThisTurn = false;

    const score = scoreAction(state, { type: 'community-favour', direction: 'rep-to-coins' });
    expect(score).toBeGreaterThan(1);
  });

  it('scores rep-to-coins at the low default when the player can afford a market card', () => {
    const state = createTestState();
    // Cheapest card costs 1 and the player has 5 coins — not stalled.
    state.market.cards.forEach(c => { (c as { cost: number }).cost = 1; });
    state.resourceBank.coins = state.config.favourCoinsToRepCost + 1; // enough to buy
    state.resourceBank.reputation = 1000;
    state.favourUsedThisTurn = false;

    const score = scoreAction(state, { type: 'community-favour', direction: 'rep-to-coins' });
    expect(score).toBe(1);
  });

  it('scores rep-to-coins at the low default when converting would leave no reputation buffer', () => {
    const state = createTestState();
    state.resourceBank.coins = 0;
    state.market.cards.forEach(c => { (c as { cost: number }).cost = 10; });
    // Exactly the rep cost: converting would drop reputation to 0 and
    // trigger reputation-collapse loss — must NOT be recommended.
    state.resourceBank.reputation = state.config.favourRepToCoinsRepCost;
    state.favourUsedThisTurn = false;

    const score = scoreAction(state, { type: 'community-favour', direction: 'rep-to-coins' });
    expect(score).toBe(1);
  });

  it('scores coins-to-rep at the low default', () => {
    const state = createTestState();
    state.resourceBank.coins = 1000;
    state.resourceBank.reputation = 1000;
    state.favourUsedThisTurn = false;

    const score = scoreAction(state, { type: 'community-favour', direction: 'coins-to-rep' });
    expect(score).toBe(1);
  });

  it('rep-to-coins scores at default when coins are not low', () => {
    const state = createTestState();
    state.resourceBank.coins = state.config.startingCoins + 10;
    state.resourceBank.reputation = state.config.favourRepToCoinsRepCost; // barely legal, converting leaves 0 rep → unattractive
    state.favourUsedThisTurn = false;

    const score = scoreAction(state, { type: 'community-favour', direction: 'rep-to-coins' });
    expect(score).toBe(1);
  });

  it('the hint action is legal and scoreable in an unaffordable market', () => {
    const state = createTestState();
    state.resourceBank.coins = 0;
    state.resourceBank.reputation = 1000;
    state.favourUsedThisTurn = false;
    state.actionsRemaining = 1;

    // With no coins the market is unaffordable; a legal non-end-turn action
    // must exist (AC4 — no stall).
    const legal = enumerateLegalActions(state);
    expect(legal.some(a => a.type === 'end-turn')).toBe(true);
    expect(legal.some(a => a.type === 'community-favour' && a.direction === 'rep-to-coins')).toBe(true);
  });
});

// ── AC3/AC4: AI executes the favour fallback without stalling ──

describe('AI Community Favour integration', () => {
  it('an AI turn without move options makes progress via Community Favour', () => {
    const state = createTestState();
    // Deplete coins so no market purchase is affordable.
    state.resourceBank.coins = 0;
    state.resourceBank.reputation = 1000;
    state.favourUsedThisTurn = false;
    // Start with 2 actions: one for Community Favour, one for end-turn.
    state.actionsRemaining = 2;
    // Empty the market and hand so the AI is genuinely stalled at
    // Community Favour priority (no purchases/plays/moves to outrank it).
    state.market.cards = [];
    state.hand = [];

    const beforeCoins = state.resourceBank.coins;
    const aiPlayer = new MainStreetAiPlayer(GreedyStrategy, createSeededRng(1234));

    let action: PlayerAction = aiPlayer.chooseAction(state);
    let executedFavour = false;
    let safety = 0;
    while (action.type !== 'end-turn' && state.gameResult === 'playing' && safety < 5) {
      if (action.type === 'community-favour') {
        executedFavour = true;
      }
      executeAction(state, action);
      if (executedFavour) break; // gate now spent; stop to assert a single exchange
      action = aiPlayer.chooseAction(state);
      safety += 1;
    }

    // The AI should have used Community Favour to gain coins (action-gated
    // fallback), setting the gate, rather than stalling with nothing to do.
    expect(state.favourUsedThisTurn).toBe(true);
    expect(state.resourceBank.coins).toBeGreaterThan(beforeCoins);
    expect(state.resourceBank.coins).toBe(
      beforeCoins + state.config.favourRepToCoinsCoinGain,
    );
  });
});