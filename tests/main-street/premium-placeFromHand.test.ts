/**
 * Main Street: Premium-aware placeFromHand tests
 *
 * Verifies the engine-level changes for premium pricing on same-day composite
 * buy-and-play (parent CG-0MT24X0SX007RLHN). These tests cover the core
 * `placeFromHand` signature change and the `playBusinessFromHand` path used
 * by commands.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  createCommunitySpaceDeck,
  type BusinessCard,
} from '../../example-games/main-street/MainStreetCards';
import {
  executeDayStart,
  placeFromHand,
  canPlaceFromHand,
} from '../../example-games/main-street/MainStreetEngine';
import { playBusinessFromHand } from '../../example-games/main-street/MainStreetMarket';

// ── Helpers ─────────────────────────────────────────────────

/** Builds a minimal business card with a known cost. */
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

/**
 * Create a game state with one known business card in the hand.
 * Returns the card and the hand index.
 */
function setupStateWithCard(): { state: MainStreetState; card: BusinessCard; slot: number; handIndex: number } {
  const state = setupMainStreetGame();
  const card = makeBiz('test-biz', 'Test Bakery', 3);
  const slot = 0;

  state.hand!.push(card);
  const handIndex = state.hand!.length - 1;
  state.resourceBank.coins = card.cost * 2;

  return { state, card, slot, handIndex };
}

/**
 * Create a community-space card and place it in the hand.
 */
function setupStateWithCommunityCard(): { state: MainStreetState; card: any; slot: number; handIndex: number } {
  const state = setupMainStreetGame();
  // Build a community-space card from the real deck (Library)
  const card = createCommunitySpaceDeck(1)[0];
  const slot = 0;

  state.hand!.push(card);
  const handIndex = state.hand!.length - 1;
  state.resourceBank.coins = card.cost * 2;

  return { state, card, slot, handIndex };
}

// ── placeFromHand with premiumCost parameter ────────────────

describe('placeFromHand with premiumCost', () => {
  it('charges listed cost when premiumCost is not provided (held-card path)', () => {
    const { state, card, slot, handIndex } = setupStateWithCard();
    executeDayStart(state);

    const coinsBefore = state.resourceBank.coins;
    placeFromHand(state, handIndex, slot);

    expect(state.resourceBank.coins).toBe(coinsBefore - card.cost);
    expect(state.streetGrid[slot]).toBe(card);
    expect(state.hand!.find((c: any) => c.id === card.id)).toBeUndefined();
  });

  it('charges premium when premiumCost is provided', () => {
    const { state, card, slot, handIndex } = setupStateWithCard();
    executeDayStart(state);

    const premiumCost = Math.ceil(card.cost * 1.5 * 2) / 2;
    const coinsBefore = state.resourceBank.coins;

    placeFromHand(state, handIndex, slot, premiumCost);

    expect(state.resourceBank.coins).toBe(coinsBefore - premiumCost);
    expect(state.streetGrid[slot]).toBe(card);
    expect(state.hand!.find((c: any) => c.id === card.id)).toBeUndefined();
  });

  it('rejects when player cannot afford premium cost', () => {
    const { state, card, slot, handIndex } = setupStateWithCard();
    executeDayStart(state);

    const premiumCost = Math.ceil(card.cost * 1.5 * 2) / 2;
    // Set coins to exactly the listed cost — enough for listed, not premium
    state.resourceBank.coins = card.cost;

    expect(() => placeFromHand(state, handIndex, slot, premiumCost)).toThrow(
      /Not enough coins/,
    );

    // Verify no state mutation
    expect(state.resourceBank.coins).toBe(card.cost);
    expect(state.hand!.find((c: any) => c.id === card.id)).toBeDefined();
    expect(state.streetGrid[slot]).toBeNull();
  });

  it('rejects when player cannot afford listed cost (no premiumCost)', () => {
    const { state, card, slot, handIndex } = setupStateWithCard();
    executeDayStart(state);

    // Set coins to one less than listed cost
    state.resourceBank.coins = card.cost - 1;

    expect(() => placeFromHand(state, handIndex, slot)).toThrow(
      /Not enough coins to place/,
    );

    expect(state.resourceBank.coins).toBe(card.cost - 1);
    expect(state.hand!.find((c: any) => c.id === card.id)).toBeDefined();
  });

  it('works for community-space cards with premiumCost', () => {
    const { state, card, slot, handIndex } = setupStateWithCommunityCard();
    executeDayStart(state);

    const premiumCost = Math.ceil(card.cost * 1.5 * 2) / 2;
    const coinsBefore = state.resourceBank.coins;

    placeFromHand(state, handIndex, slot, premiumCost);

    expect(state.resourceBank.coins).toBe(coinsBefore - premiumCost);
    expect(state.streetGrid[slot]).toBe(card);
  });

  it('premium formula: Math.ceil(cost * 1.5 * 2) / 2', () => {
    const { state, card, slot, handIndex } = setupStateWithCard();
    executeDayStart(state);

    // Verify the premium formula produces expected values
    const premiumCost = Math.ceil(card.cost * 1.5 * 2) / 2;

    const coinsBefore = state.resourceBank.coins;
    placeFromHand(state, handIndex, slot, premiumCost);

    expect(state.resourceBank.coins).toBe(coinsBefore - premiumCost);
  });

  it('log includes premium annotation when premiumCost differs from card.cost', () => {
    const { state, card, slot, handIndex } = setupStateWithCard();
    executeDayStart(state);

    const premiumCost = Math.ceil(card.cost * 1.5 * 2) / 2;
    placeFromHand(state, handIndex, slot, premiumCost);

    // Check that the activity log contains the premium annotation
    const logEntry = state.activityLog[state.activityLog.length - 1];
    expect(logEntry.text).toContain(card.name);
    expect(logEntry.text).toContain('premium');
  });
});

// ── canPlaceFromHand with premium ───────────────────────────

describe('canPlaceFromHand with premiumCost', () => {
  it('returns legal when player can afford listed cost (no premiumCost)', () => {
    const { state, card, slot, handIndex } = setupStateWithCard();
    state.resourceBank.coins = card.cost;

    const result = canPlaceFromHand(state, handIndex, slot);
    expect(result.legal).toBe(true);
  });

  it('returns illegal when player cannot afford listed cost (no premiumCost)', () => {
    const { state, card, slot, handIndex } = setupStateWithCard();
    state.resourceBank.coins = card.cost - 1;

    const result = canPlaceFromHand(state, handIndex, slot);
    expect(result.legal).toBe(false);
  });

  it('returns legal when player can afford premium cost', () => {
    const { state, card, slot, handIndex } = setupStateWithCard();
    const premiumCost = Math.ceil(card.cost * 1.5 * 2) / 2;
    state.resourceBank.coins = premiumCost;

    const result = canPlaceFromHand(state, handIndex, slot, premiumCost);
    expect(result.legal).toBe(true);
  });

  it('returns illegal when player cannot afford premium cost', () => {
    const { state, card, slot, handIndex } = setupStateWithCard();
    const premiumCost = Math.ceil(card.cost * 1.5 * 2) / 2;
    // Can afford listed but not premium
    state.resourceBank.coins = card.cost;

    const result = canPlaceFromHand(state, handIndex, slot, premiumCost);
    expect(result.legal).toBe(false);
  });
});

// ── playBusinessFromHand with premiumCost ──────────────────

describe('playBusinessFromHand with premiumCost', () => {
  it('charges listed cost when premiumCost is not provided', () => {
    const { state, card, slot, handIndex } = setupStateWithCard();
    executeDayStart(state);

    const coinsBefore = state.resourceBank.coins;
    const result = playBusinessFromHand(state, handIndex, slot);

    expect(state.resourceBank.coins).toBe(coinsBefore - card.cost);
    expect(result.cost).toBe(card.cost);
  });

  it('charges premium when premiumCost is provided', () => {
    const { state, card, slot, handIndex } = setupStateWithCard();
    executeDayStart(state);

    const premiumCost = Math.ceil(card.cost * 1.5 * 2) / 2;
    const coinsBefore = state.resourceBank.coins;
    const result = playBusinessFromHand(state, handIndex, slot, premiumCost);

    expect(state.resourceBank.coins).toBe(coinsBefore - premiumCost);
    expect(result.cost).toBe(premiumCost);
  });

  it('rejects when player cannot afford premium cost', () => {
    const { state, card, slot, handIndex } = setupStateWithCard();
    executeDayStart(state);

    const premiumCost = Math.ceil(card.cost * 1.5 * 2) / 2;
    state.resourceBank.coins = card.cost; // enough for listed, not premium

    expect(() => playBusinessFromHand(state, handIndex, slot, premiumCost))
      .toThrow(/Not enough coins/);
  });

  it('works for community-space cards with premiumCost', () => {
    const { state, card, slot, handIndex } = setupStateWithCommunityCard();
    executeDayStart(state);

    const premiumCost = Math.ceil(card.cost * 1.5 * 2) / 2;
    const coinsBefore = state.resourceBank.coins;
    const result = playBusinessFromHand(state, handIndex, slot, premiumCost);

    expect(state.resourceBank.coins).toBe(coinsBefore - premiumCost);
    expect(result.cost).toBe(premiumCost);
    expect(state.streetGrid[slot]).toBe(card);
  });
});
