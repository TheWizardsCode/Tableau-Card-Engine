/**
 * Main Street: AI discard evaluation weighs the reputation cost
 * (CG-0MTQ7KUVF009ELQK — parent AC4).
 *
 * The AI no longer treats discard as free: its discard score subtracts the
 * card's coin value (the reputation loss) from the capacity benefit of the
 * freed hand slot, so it prefers lower-cost cards and only discards when the
 * capacity benefit outweighs the reputation loss.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { scoreAction } from '../../example-games/main-street/MainStreetAiStrategy';
import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ────────────────────────────────────────────────────

function makeBiz(id: string, name: string, cost: number): BusinessCard {
  return {
    family: 'business',
    id,
    name,
    cost,
    baseIncome: 0.5,
    synergyTypes: [],
    maxLevel: 1,
    description: 'test card',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
    appliedUpgrades: [],
  };
}

/** Builds a market state with a full hand and the given market cards. */
function makeAiState(hand: BusinessCard[], market: BusinessCard[], coins: number) {
  const state = setupMainStreetGame({ seed: 'ai-discard-rep' });
  state.phase = 'MarketPhase';
  state.hand = hand as never;
  state.maxHandSize = hand.length;
  state.market.cards = market as never;
  state.resourceBank.coins = coins;
  return state;
}

// ── Preference for lower-cost cards ────────────────────────────

describe('AI discard scoring weighs the reputation cost', () => {
  it('scores discarding a lower-cost card higher than a higher-cost card', () => {
    const state = makeAiState(
      [makeBiz('low', 'Low Cost', 1), makeBiz('high', 'High Cost', 5)],
      [makeBiz('mkt', 'Market Card', 6)],
      100,
    );
    const lowScore = scoreAction(state, { type: 'discard-from-hand', handIndex: 0 });
    const highScore = scoreAction(state, { type: 'discard-from-hand', handIndex: 1 });
    expect(lowScore).toBeGreaterThan(highScore);
  });

  it('values a 0-cost discard when a valuable acquisition is affordable', () => {
    const state = makeAiState(
      [makeBiz('free', 'Free Card', 0)],
      [makeBiz('mkt', 'Market Card', 5)],
      100,
    );
    const score = scoreAction(state, { type: 'discard-from-hand', handIndex: 0 });
    expect(score).toBeGreaterThan(0);
  });

  it('does not value discarding when no affordable acquisition exists', () => {
    const state = makeAiState(
      [makeBiz('card', 'Card', 2)],
      [makeBiz('mkt', 'Market Card', 9)],
      0,
    );
    const score = scoreAction(state, { type: 'discard-from-hand', handIndex: 0 });
    expect(score).toBeLessThanOrEqual(0);
  });

  it('does not value discarding an expensive card when the capacity benefit is smaller', () => {
    const state = makeAiState(
      [makeBiz('expensive', 'Expensive', 8)],
      [makeBiz('mkt', 'Market Card', 3)],
      100,
    );
    const score = scoreAction(state, { type: 'discard-from-hand', handIndex: 0 });
    expect(score).toBeLessThanOrEqual(0);
  });

  it('does not treat the capacity benefit as valuable when the hand is not full', () => {
    const state = makeAiState(
      [makeBiz('only', 'Only Card', 0)],
      [makeBiz('mkt', 'Market Card', 5)],
      100,
    );
    // Hand has a free slot — freeing another has no value, so only the
    // reputation cost remains (0 for this card).
    state.maxHandSize = 3;
    const score = scoreAction(state, { type: 'discard-from-hand', handIndex: 0 });
    expect(score).toBe(0);
  });
});
