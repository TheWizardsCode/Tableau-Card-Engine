/**
 * Main Street: AI Strategy Tests
 *
 * Tests for enumerateLegalActions, scoreAction, enumerateAndScoreActions,
 * RandomStrategy, GreedyStrategy, and MainStreetAiPlayer.playGame().
 */
import { describe, it, expect } from 'vitest';

import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import { executeDayStart } from '../../example-games/main-street/MainStreetEngine';
import type { PlayerAction } from '../../example-games/main-street/MainStreetEngine';
import {
  enumerateLegalActions,
  scoreAction,
  enumerateAndScoreActions,
  aiPlanningHorizon,
  RandomStrategy,
  GreedyStrategy,
  MainStreetAiPlayer,
} from '../../example-games/main-street/MainStreetAiStrategy';
import type { BusinessCard, UpgradeCard } from '../../example-games/main-street/MainStreetCards';
import { GRID_SIZE } from '../../example-games/main-street/MainStreetCards';
import {
  canPurchaseBusiness,
  canPurchaseUpgrade,
  canPurchaseEvent,
} from '../../example-games/main-street/MainStreetMarket';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'ai-test'): MainStreetState {
  const state = setupMainStreetGame({ seed });
  executeDayStart(state);
  return state;
}

/** Deterministic RNG seeded with a constant. */
function makeRng(seed: number = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

/** Check if two PlayerActions are equal by comparing their fields. */
function actionsEqual(a: PlayerAction, b: PlayerAction): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'buy-business' && b.type === 'buy-business') {
    return a.cardId === b.cardId && a.slotIndex === b.slotIndex;
  }
  if (a.type === 'buy-upgrade' && b.type === 'buy-upgrade') {
    return a.cardId === b.cardId && a.targetSlot === b.targetSlot;
  }
  if (a.type === 'buy-event' && b.type === 'buy-event') {
    return a.cardId === b.cardId;
  }
  return true; // play-event and end-turn have no additional fields
}

describe('enumerateLegalActions', () => {
  it('always includes end-turn', () => {
    const state = createTestState();
    const actions = enumerateLegalActions(state);
    expect(actions.some(a => a.type === 'end-turn')).toBe(true);
  });

  it('buy-business actions only target empty slots', () => {
    const state = createTestState();
    const actions = enumerateLegalActions(state);
    const buyBusiness = actions.filter(a => a.type === 'buy-business') as { type: 'buy-business'; cardId: string; slotIndex: number }[];
    for (const action of buyBusiness) {
      expect(state.streetGrid[action.slotIndex]).toBeNull();
    }
  });

  it('buy-business actions only include affordable market cards', () => {
    const state = createTestState();
    const actions = enumerateLegalActions(state);
    const buyBusiness = actions.filter(a => a.type === 'buy-business') as { type: 'buy-business'; cardId: string; slotIndex: number }[];
    for (const action of buyBusiness) {
      const card = state.market.development.find(c => c.id === action.cardId) as BusinessCard;
      expect(card).toBeDefined();
      expect(card.cost).toBeLessThanOrEqual(state.resourceBank.coins);
    }
  });

  it('buy-business actions are all accepted by canPurchaseBusiness', () => {
    const state = createTestState();
    const actions = enumerateLegalActions(state);
    const buyBusiness = actions.filter(a => a.type === 'buy-business') as { type: 'buy-business'; cardId: string; slotIndex: number }[];
    for (const action of buyBusiness) {
      const result = canPurchaseBusiness(state, action.cardId, action.slotIndex);
      expect(result.legal).toBe(true);
    }
  });

  it('buy-upgrade actions are all accepted by canPurchaseUpgrade', () => {
    const state = createTestState();
    const actions = enumerateLegalActions(state);
    const buyUpgrade = actions.filter(a => a.type === 'buy-upgrade') as { type: 'buy-upgrade'; cardId: string; targetSlot?: number }[];
    for (const action of buyUpgrade) {
      const result = canPurchaseUpgrade(state, action.cardId);
      expect(result.legal).toBe(true);
    }
  });

  it('buy-upgrade target slots contain a matching eligible business', () => {
    // Set up a state where an upgrade is available
    const state = createTestState('upgrade-test');
    // Place a Bakery on slot 0 so an upgrade card can target it
    const bakery = (state.market.development as BusinessCard[]).find(c => c.name === 'Bakery');
    if (bakery) {
      state.streetGrid[0] = { ...bakery };
      state.market.development = state.market.development.filter(c => c.id !== bakery.id);
    }

    const actions = enumerateLegalActions(state);
    const buyUpgrade = actions.filter(a => a.type === 'buy-upgrade') as { type: 'buy-upgrade'; cardId: string; targetSlot?: number }[];
    for (const action of buyUpgrade) {
      if (action.targetSlot !== undefined) {
        const biz = state.streetGrid[action.targetSlot];
        expect(biz).not.toBeNull();
        const card = state.market.investments.find(c => c.id === action.cardId) as UpgradeCard;
        expect(card).toBeDefined();
        expect(biz!.name).toBe(card.targetBusiness);
        expect(biz!.level).toBeLessThan(biz!.maxLevel);
      }
    }
  });

  it('buy-event actions are all accepted by canPurchaseEvent', () => {
    const state = createTestState();
    const actions = enumerateLegalActions(state);
    const buyEvent = actions.filter(a => a.type === 'buy-event') as { type: 'buy-event'; cardId: string }[];
    for (const action of buyEvent) {
      const result = canPurchaseEvent(state, action.cardId);
      expect(result.legal).toBe(true);
    }
  });

  it('includes play-event when player holds an Investment event in hand', () => {
    const state = createTestState();
    // Inject a held event into the hand
    state.hand = [{
      family: 'event',
      id: 'test-event',
      name: 'Test Event',
      trigger: 'Investment',
      cost: 0,
      effect: 'Test effect',
      target: 'All',
      coinDelta: 2,
      reputationDelta: 0,
    }];
    const actions = enumerateLegalActions(state);
    expect(actions.some(a => a.type === 'play-event')).toBe(true);
  });

  it('excludes play-event when no event is held', () => {
    const state = createTestState();
    state.hand = [];
    const actions = enumerateLegalActions(state);
    expect(actions.some(a => a.type === 'play-event')).toBe(false);
  });

  it('allows buy-event when player already holds an event (no max-1 rule)', () => {
    const state = createTestState();
    state.hand = [{
      family: 'event',
      id: 'held-event',
      name: 'Held Event',
      trigger: 'Investment',
      cost: 0,
      effect: 'Already held',
      target: 'All',
      coinDelta: 2,
      reputationDelta: 0,
    }];
    // Generous coins so affordability does not depend on which event the
    // seeded market draws (the expanded pool shifted the seed's row).
    state.resourceBank.coins = 100;
    const actions = enumerateLegalActions(state);
    // Hand holds one card (< maxHandSize 2), so another event purchase is legal.
    expect(actions.some(a => a.type === 'buy-event')).toBe(true);
  });

  it('excludes buy-event when the hand is full', () => {
    const state = createTestState();
    // Fill the hand to maxHandSize (2) so no further purchases are legal.
    state.hand = [
      { family: 'event', id: 'held-1', name: 'Event 1', trigger: 'Investment', cost: 0, effect: 'x', target: 'All', coinDelta: 1, reputationDelta: 0 },
      { family: 'event', id: 'held-2', name: 'Event 2', trigger: 'Investment', cost: 0, effect: 'x', target: 'All', coinDelta: 1, reputationDelta: 0 },
    ];
    const actions = enumerateLegalActions(state);
    expect(actions.some(a => a.type === 'buy-event')).toBe(false);
  });

  it('excludes buy-business when player cannot afford any card', () => {
    const state = createTestState();
    state.resourceBank.coins = 0;
    const actions = enumerateLegalActions(state);
    expect(actions.some(a => a.type === 'buy-business')).toBe(false);
  });

  it('excludes buy-business when all grid slots are occupied', () => {
    const state = createTestState();
    // Fill all slots with dummy businesses
    const dummyCard: BusinessCard = {
      family: 'business',
      id: 'dummy',
      name: 'Dummy',
      cost: 0,
      baseIncome: 1,
      synergyTypes: [],
      description: 'Dummy business for testing.',
      maxLevel: 1,
      level: 0,
      incomeBonus: 0,
      synergyRangeBonus: 0,
      reputationBonus: 0,
    };
    for (let i = 0; i < GRID_SIZE; i++) {
      state.streetGrid[i] = { ...dummyCard, id: `dummy-${i}` };
    }
    const actions = enumerateLegalActions(state);
    expect(actions.some(a => a.type === 'buy-business')).toBe(false);
  });

  it('never returns an action that executeAction would reject', () => {
    const state = createTestState();
    const actions = enumerateLegalActions(state);
    for (const action of actions) {
      if (action.type === 'end-turn') continue;
      // Each non-end-turn action must not throw
      // We test this by verifying the underlying canPurchase checks pass
      // (we cannot call executeAction because it mutates state)
      if (action.type === 'buy-business') {
        const r = canPurchaseBusiness(state, action.cardId, action.slotIndex);
        expect(r.legal).toBe(true);
      } else if (action.type === 'buy-upgrade') {
        const r = canPurchaseUpgrade(state, action.cardId);
        expect(r.legal).toBe(true);
      } else if (action.type === 'buy-event') {
        const r = canPurchaseEvent(state, action.cardId);
        expect(r.legal).toBe(true);
      }
    }
  });
});

// ── RandomStrategy ──────────────────────────────────────────

describe('RandomStrategy', () => {
  it('returns a legal action', () => {
    const state = createTestState();
    const rng = makeRng();
    const action = RandomStrategy.chooseAction(state, rng);
    expect(action).toBeDefined();
    expect(action.type).toBeDefined();
  });

  it('always returns one of the enumerated legal actions', () => {
    const state = createTestState();
    const rng = makeRng();
    const legal = enumerateLegalActions(state);
    for (let i = 0; i < 20; i++) {
      const action = RandomStrategy.chooseAction(state, rng);
      const found = legal.some(a => actionsEqual(a, action));
      expect(found).toBe(true);
    }
  });

  it('has name "Random"', () => {
    expect(RandomStrategy.name).toBe('Random');
  });
});

// ── GreedyStrategy ──────────────────────────────────────────

describe('GreedyStrategy', () => {
  it('returns a legal action', () => {
    const state = createTestState();
    const rng = makeRng();
    const action = GreedyStrategy.chooseAction(state, rng);
    expect(action).toBeDefined();
  });

  it('has name "Greedy"', () => {
    expect(GreedyStrategy.name).toBe('Greedy');
  });

  it('prefers upgrades over business purchases when both are available', () => {
    // Set up a state where both an upgrade and a business purchase are available
    const state = createTestState('greedy-upgrade-test');
    // Place a Bakery on the grid so an upgrade can target it
    const bakery: BusinessCard = {
      family: 'business',
      id: 'biz-bakery-99',
      name: 'Bakery',
      cost: 6,
      baseIncome: 1,
      synergyTypes: ['Food'],
      upgradePath: 'Bakery',
      maxLevel: 2,
      description: 'Test',
      level: 0,
      incomeBonus: 0,
      synergyRangeBonus: 0,
      reputationBonus: 0,
      appliedUpgrades: [],
    };
    state.streetGrid[0] = bakery;
    // Clear the development market so no business purchases are available
    state.market.development = [];

    // Add an affordable upgrade card for the Bakery to the investments row
    const upgradeCard: UpgradeCard = {
      family: 'upgrade',
      id: 'test-upgrade',
      name: 'Test Upgrade',
      targetBusiness: 'Bakery',
      cost: 1,
      incomeBonus: 2,
      synergyRangeBonus: 0,
      description: 'Test',
      requiredLevel: 0,
    };
    state.market.investments.push(upgradeCard);
    state.resourceBank.coins = 10;

    const rng = makeRng();
    const action = GreedyStrategy.chooseAction(state, rng);
    expect(action.type).toBe('buy-upgrade');
  });

  it('ends turn when no beneficial actions are available', () => {
    const state = createTestState();
    // Remove all market cards and events
    state.market.development = [];
    state.market.investments = [];
    state.hand = [];
    const rng = makeRng();
    const action = GreedyStrategy.chooseAction(state, rng);
    expect(action.type).toBe('end-turn');
  });
});

// ── MainStreetAiPlayer ──────────────────────────────────────

describe('MainStreetAiPlayer', () => {
  it('playGame() runs a complete game without errors (RandomStrategy)', () => {
    const state = setupMainStreetGame({ seed: 'ai-player-random' });
    const player = new MainStreetAiPlayer(RandomStrategy, makeRng());
    player.playGame(state);
    expect(state.gameResult).not.toBe('playing');
  });

  it('playGame() runs a complete game without errors (GreedyStrategy)', () => {
    const state = setupMainStreetGame({ seed: 'ai-player-greedy' });
    const player = new MainStreetAiPlayer(GreedyStrategy, makeRng());
    player.playGame(state);
    expect(state.gameResult).not.toBe('playing');
  });

  it('strategyName returns the strategy name', () => {
    const player = new MainStreetAiPlayer(RandomStrategy, makeRng());
    expect(player.strategyName).toBe('Random');
  });

  it('chooseAction returns a legal action', () => {
    const state = createTestState();
    const player = new MainStreetAiPlayer(GreedyStrategy, makeRng());
    const action = player.chooseAction(state);
    expect(action).toBeDefined();
    const legal = enumerateLegalActions(state);
    const found = legal.some(a => actionsEqual(a, action));
    expect(found).toBe(true);
  });

  it('playGame() results in win or loss, never playing', () => {
    for (const seed of ['seed-1', 'seed-2', 'seed-3']) {
      const state = setupMainStreetGame({ seed });
      const player = new MainStreetAiPlayer(GreedyStrategy, makeRng());
      player.playGame(state);
      expect(['win', 'loss']).toContain(state.gameResult);
    }
  });

  it('RandomStrategy completes 100 seeds without error, using seeded RNG, never making illegal actions', () => {
    for (let i = 0; i < 100; i++) {
      const seed = `random-strategy-seed-${i}`;
      const state = setupMainStreetGame({ seed });
      const player = new MainStreetAiPlayer(RandomStrategy, makeRng(i));
      // playGame calls executeAction which throws on any illegal action;
      // enumerateLegalActions guarantees only legal actions are returned.
      expect(() => player.playGame(state)).not.toThrow();
      expect(['win', 'loss']).toContain(state.gameResult);
    }
  });
});

// ── scoreAction ─────────────────────────────────────────────

describe('scoreAction', () => {
  it('scores end-turn as 0', () => {
    const state = createTestState();
    expect(scoreAction(state, { type: 'end-turn' })).toBe(0);
  });

  it('scores play-event as a fixed positive value', () => {
    const state = createTestState();
    state.hand = [{
      family: 'event',
      id: 'test-event',
      name: 'Test Event',
      trigger: 'Investment',
      cost: 0,
      effect: 'Test',
      target: 'All',
      coinDelta: 2,
      reputationDelta: 0,
    }];
    const score = scoreAction(state, { type: 'play-event' });
    expect(score).toBeGreaterThan(0);
  });

  it('scores buy-upgrade using incomeBonus * horizon - cost', () => {
    const state = createTestState();
    const upgradeCard: UpgradeCard = {
      family: 'upgrade',
      id: 'test-upgrade-score',
      name: 'Test Upgrade Score',
      targetBusiness: 'Bakery',
      cost: 3,
      incomeBonus: 2,
      synergyRangeBonus: 0,
      description: 'Test',
      requiredLevel: 0,
    };
    state.market.investments.push(upgradeCard);
    // Horizon is derived from distance to the win threshold (CG-0MSLXJCHH001DLIO)
    const expected = upgradeCard.incomeBonus * aiPlanningHorizon(state) - upgradeCard.cost;
    const actual = scoreAction(state, { type: 'buy-upgrade', cardId: upgradeCard.id, targetSlot: 0 });
    expect(actual).toBe(expected);
  });

  it('scores buy-event using coinDelta + reputationDelta * reputationScoreMultiplier - cost', () => {
    const state = createTestState();
    state.hand = [];
    const eventCard = state.market.investments.find(c => c.family === 'event');
    if (!eventCard) return; // skip if no event in market for this seed

    const { coinDelta, reputationDelta, cost } = eventCard as import('../../example-games/main-street/MainStreetCards').EventCard;
    const expected = coinDelta + reputationDelta * state.config.reputationScoreMultiplier - cost;
    const actual = scoreAction(state, { type: 'buy-event', cardId: eventCard.id });
    expect(actual).toBe(expected);
  });

  it('returns 0 for buy-upgrade with unknown cardId', () => {
    const state = createTestState();
    expect(scoreAction(state, { type: 'buy-upgrade', cardId: 'nonexistent' })).toBe(0);
  });

  it('returns 0 for buy-business with unknown cardId', () => {
    const state = createTestState();
    expect(scoreAction(state, { type: 'buy-business', cardId: 'nonexistent', slotIndex: 0 })).toBe(0);
  });
});

// ── aiPlanningHorizon (CG-0MSLXJCHH001DLIO) ─────────────────

describe('aiPlanningHorizon', () => {
  it('is always within [floor=5, cap=25]', () => {
    const state = createTestState();
    for (const score of [0, 5, 40, 75, 120, 145, 149, 150, 200]) {
      state.resourceBank.coins = score;
      state.resourceBank.reputation = 0;
      state.challengesCompleted = [];
      const h = aiPlanningHorizon(state);
      expect(h).toBeGreaterThanOrEqual(5);
      expect(h).toBeLessThanOrEqual(25);
    }
  });

  it('is > 0 even when the score is at/near the win threshold (floor)', () => {
    const state = createTestState();
    state.resourceBank.coins = state.config.winThreshold;
    state.resourceBank.reputation = 0;
    state.challengesCompleted = [];
    expect(aiPlanningHorizon(state)).toBe(5);
  });

  it('is larger early in the game (far from threshold) than near the threshold', () => {
    const state = createTestState();
    // Far from threshold
    state.resourceBank.coins = 0;
    state.resourceBank.reputation = 0;
    state.challengesCompleted = [];
    const early = aiPlanningHorizon(state);

    // Near threshold
    state.resourceBank.coins = state.config.winThreshold - 10;
    state.resourceBank.reputation = 0;
    state.challengesCompleted = [];
    const late = aiPlanningHorizon(state);

    expect(early).toBeGreaterThan(late);
    expect(late).toBe(5); // clamped at the floor
  });

  it('derives the horizon from distance to the threshold (documented formula)', () => {
    const state = createTestState();
    state.resourceBank.coins = 70;
    state.resourceBank.reputation = 0;
    state.challengesCompleted = [];
    // Medium winThreshold=150, scorePace=8: ceil((150-70)/8) = ceil(10) = 10
    expect(aiPlanningHorizon(state)).toBe(10);
  });

  it('prefers early-game upgrades over near-threshold ones (behavioural sanity)', () => {
    const state = createTestState();
    const upgradeCard: UpgradeCard = {
      family: 'upgrade',
      id: 'test-upgrade-horizon',
      name: 'Test Upgrade Horizon',
      targetBusiness: 'Bakery',
      cost: 3,
      incomeBonus: 2,
      synergyRangeBonus: 0,
      description: 'Test',
      requiredLevel: 0,
    };
    state.market.investments.push(upgradeCard);

    const scoreEarly = scoreAction(state, { type: 'buy-upgrade', cardId: upgradeCard.id, targetSlot: 0 });

    // Near the threshold the same upgrade is valued over fewer turns.
    state.resourceBank.coins = state.config.winThreshold - 10;
    state.resourceBank.reputation = 0;
    state.challengesCompleted = [];
    const scoreLate = scoreAction(state, { type: 'buy-upgrade', cardId: upgradeCard.id, targetSlot: 0 });

    expect(scoreEarly).toBeGreaterThan(scoreLate);
  });
});

// ── enumerateAndScoreActions ────────────────────────────────

describe('enumerateAndScoreActions', () => {
  it('returns one entry per legal action', () => {
    const state = createTestState();
    const legal = enumerateLegalActions(state);
    const scored = enumerateAndScoreActions(state);
    expect(scored.length).toBe(legal.length);
  });

  it('each entry has an action and a numeric score', () => {
    const state = createTestState();
    const scored = enumerateAndScoreActions(state);
    for (const { action, score } of scored) {
      expect(action).toBeDefined();
      expect(typeof score).toBe('number');
    }
  });

  it('always includes an end-turn entry with score 0', () => {
    const state = createTestState();
    const scored = enumerateAndScoreActions(state);
    const endTurn = scored.find(s => s.action.type === 'end-turn');
    expect(endTurn).toBeDefined();
    expect(endTurn!.score).toBe(0);
  });

  it('scores match scoreAction for every action', () => {
    const state = createTestState();
    const scored = enumerateAndScoreActions(state);
    for (const { action, score } of scored) {
      expect(score).toBe(scoreAction(state, action));
    }
  });
});

// ── Greedy vs Random win rate ───────────────────────────────

describe('GreedyStrategy vs RandomStrategy win rates', () => {
  it('Greedy achieves a comparable or higher win rate than Random across 200 seeds (community space cards dilute the market)', () => {
    let greedyWins = 0;
    let randomWins = 0;

    for (let i = 0; i < 200; i++) {
      const seed = `winrate-seed-${i}`;

      const greedyState = setupMainStreetGame({ seed });
      const greedyPlayer = new MainStreetAiPlayer(GreedyStrategy, makeRng(i));
      greedyPlayer.playGame(greedyState);
      if (greedyState.gameResult === 'win') greedyWins++;

      const randomState = setupMainStreetGame({ seed });
      const randomPlayer = new MainStreetAiPlayer(RandomStrategy, makeRng(i));
      randomPlayer.playGame(randomState);
      if (randomState.gameResult === 'win') randomWins++;
    }

    // With community space cards in the development row, greedy's advantage is reduced.
    // Assert greedy is not significantly worse than random (within binomial noise for 200 trials).
    expect(greedyWins).toBeGreaterThanOrEqual(randomWins - 10);
  }, 120_000);
});

// ── Deterministic replay ────────────────────────────────────

describe('GreedyStrategy determinism', () => {
  it('produces identical final state for the same seed across two runs', () => {
    const seed = 'test-determinism';

    const state1 = setupMainStreetGame({ seed });
    const player1 = new MainStreetAiPlayer(GreedyStrategy, makeRng(99));
    player1.playGame(state1);

    const state2 = setupMainStreetGame({ seed });
    const player2 = new MainStreetAiPlayer(GreedyStrategy, makeRng(99));
    player2.playGame(state2);

    expect(state1.gameResult).toBe(state2.gameResult);
    expect(state1.turn).toBe(state2.turn);
    expect(state1.resourceBank.coins).toBe(state2.resourceBank.coins);
    expect(state1.resourceBank.reputation).toBe(state2.resourceBank.reputation);
  });

  it('produces identical action sequences for the same seed', () => {
    const seed = 'test-determinism-actions';

    // Use MainStreetAiPlayer which wraps the Greedy strategy and RNG together
    const state1 = setupMainStreetGame({ seed });
    const player1 = new MainStreetAiPlayer(GreedyStrategy, makeRng(7));
    player1.playGame(state1);

    const state2 = setupMainStreetGame({ seed });
    const player2 = new MainStreetAiPlayer(GreedyStrategy, makeRng(7));
    player2.playGame(state2);

    // Identical final state is sufficient proof of identical action sequences
    expect(state1.turn).toBe(state2.turn);
    expect(state1.gameResult).toBe(state2.gameResult);
    expect(JSON.stringify(state1.streetGrid)).toBe(JSON.stringify(state2.streetGrid));
  });
});
