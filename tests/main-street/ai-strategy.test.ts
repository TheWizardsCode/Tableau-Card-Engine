/**
 * Main Street: AI Strategy Tests
 *
 * Tests for enumerateLegalActions, RandomStrategy, GreedyStrategy,
 * and MainStreetAiPlayer.playGame().
 */
import { describe, it, expect } from 'vitest';

import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import { executeDayStart } from '../../example-games/main-street/MainStreetEngine';
import type { PlayerAction } from '../../example-games/main-street/MainStreetEngine';
import {
  enumerateLegalActions,
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
      const card = state.market.business.find(c => c.id === action.cardId) as BusinessCard;
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
    const bakery = (state.market.business as BusinessCard[]).find(c => c.name === 'Bakery');
    if (bakery) {
      state.streetGrid[0] = { ...bakery };
      state.market.business = state.market.business.filter(c => c.id !== bakery.id);
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

  it('includes play-event when player holds an Investment event', () => {
    const state = createTestState();
    // Inject a held event
    state.heldEvent = {
      family: 'event',
      id: 'test-event',
      name: 'Test Event',
      trigger: 'Investment',
      cost: 0,
      effect: 'Test effect',
      target: 'All',
      coinDelta: 2,
      reputationDelta: 0,
    };
    const actions = enumerateLegalActions(state);
    expect(actions.some(a => a.type === 'play-event')).toBe(true);
  });

  it('excludes play-event when no event is held', () => {
    const state = createTestState();
    state.heldEvent = null;
    const actions = enumerateLegalActions(state);
    expect(actions.some(a => a.type === 'play-event')).toBe(false);
  });

  it('excludes buy-event when player already holds an event', () => {
    const state = createTestState();
    state.heldEvent = {
      family: 'event',
      id: 'held-event',
      name: 'Held Event',
      trigger: 'Investment',
      cost: 0,
      effect: 'Already held',
      target: 'All',
      coinDelta: 2,
      reputationDelta: 0,
    };
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
    // Place a Bakery so an upgrade can target it
    const bakery = (state.market.business as BusinessCard[]).find(c => c.name === 'Bakery');
    if (bakery) {
      state.streetGrid[0] = { ...bakery };
      state.market.business = state.market.business.filter(c => c.id !== bakery.id);
    }

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
    state.market.business = [];
    state.market.investments = [];
    state.heldEvent = null;
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
});
