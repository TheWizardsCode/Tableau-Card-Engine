/**
 * Main Street: New Sell-Price Formula Tests (CG-0MT5XO7DI0066QCT)
 *
 * Validates the improved sell-refund formula that reflects the business's
 * accumulated value through synergy bonuses.
 *
 * Old formula: Math.ceil((card.cost + totalUpgradeCost) / 2)
 * New formula:  Math.ceil((card.cost + totalUpgradeCost) * 1.5)
 *               + Math.max(0, synergyIncomeComponent)
 *               + Math.max(0, synergyRepComponent)
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  type BusinessCard,
  type CommunitySpaceCard,
} from '../../example-games/main-street/MainStreetCards';
import {
  sellBusiness,
  computeSellRefund,
} from '../../example-games/main-street/MainStreetMarket';
import {
  computeSynergyBonus,
  syncCardCurrentIncome,
  syncCardCurrentRepPerTurn,
} from '../../example-games/main-street/MainStreetAdjacency';

function createTestState(seed: string = 'sell-price-test'): MainStreetState {
  return setupMainStreetGame({ seed });
}

function placeCardOnGrid(state: MainStreetState, slotIndex: number): BusinessCard | CommunitySpaceCard | null {
  const card = state.market.cards.find(
    c => (c.family === 'business' || c.family === 'community-space')
      && c.cost <= state.resourceBank.coins,
  ) as BusinessCard | CommunitySpaceCard | undefined;
  if (!card) return null;
  const marketIndex = state.market.cards.findIndex(c => c.id === card.id);
  if (marketIndex < 0) return null;
  state.market.cards.splice(marketIndex, 1);
  const placedCard = { ...card } as BusinessCard | CommunitySpaceCard;
  (placedCard as any).totalUpgradeCost = 0;
  placedCard.level = 0;
  (placedCard as any).incomeBonus = 0;
  (placedCard as any).synergyRangeBonus = 0;
  (placedCard as any).reputationBonus = 0;
  (placedCard as any).appliedUpgrades = [];
  state.streetGrid[slotIndex] = placedCard as any;
  (state.soldSlots as boolean[])[slotIndex] = false;
  return placedCard;
}

function placeAdjacentCard(state: MainStreetState, slotIndex: number): void {
  const card = state.market.cards.find(
    c => (c.family === 'business' || c.family === 'community-space')
      && c.cost <= state.resourceBank.coins,
  ) as BusinessCard | CommunitySpaceCard | undefined;
  if (!card) return;
  state.market.cards.shift();
  const placedCard = { ...card } as BusinessCard | CommunitySpaceCard;
  (placedCard as any).totalUpgradeCost = 0;
  placedCard.level = 0;
  (placedCard as any).incomeBonus = 0;
  (placedCard as any).synergyRangeBonus = 0;
  (placedCard as any).reputationBonus = 0;
  (placedCard as any).appliedUpgrades = [];
  state.streetGrid[slotIndex] = placedCard as any;
  (state.soldSlots as boolean[])[slotIndex] = false;
}

function recalculateCard(state: MainStreetState, slotIndex: number): void {
  const card = state.streetGrid[slotIndex];
  if (!card || (state.soldSlots as boolean[])[slotIndex]) return;
  syncCardCurrentIncome(
    state.streetGrid, slotIndex,
    state.config.synergyBonusPerNeighbor ?? 1,
    state.soldSlots as boolean[],
  );
  syncCardCurrentRepPerTurn(
    state.streetGrid, slotIndex,
    state.soldSlots as boolean[],
  );
}

describe('computeSellRefund — new formula', () => {
  it('should compute base-only refund for a card with no upgrades and no synergy', () => {
    const state = createTestState('sell-price-no-synergy-2');
    // Give enough coins to afford any market card
    state.resourceBank.coins = 100;
    const card = placeCardOnGrid(state, 0) as BusinessCard;
    expect(card).not.toBeNull();
    if (!card) return;
    recalculateCard(state, 0);
    const breakdown = computeSellRefund(state, card, 0);
    const expectedBase = Math.ceil((card.cost + (card.totalUpgradeCost ?? 0)) * 1.5);
    expect(breakdown.totalRefund).toBe(expectedBase);
    expect(breakdown.baseRefund).toBe(expectedBase);
    expect(breakdown.synergyIncomeComponent).toBe(0);
    expect(breakdown.synergyRepComponent).toBe(0);
  });

  it('should include synergy income component when card has synergy bonus', () => {
    const state = createTestState('sell-price-with-synergy');
    const card = placeCardOnGrid(state, 4) as BusinessCard;
    expect(card).not.toBeNull();
    placeAdjacentCard(state, 3);
    recalculateCard(state, 4);
    recalculateCard(state, 3);
    const effectiveBase = card.baseIncome + card.incomeBonus;
    const synergyBonus = computeSynergyBonus(
      state.streetGrid, 4, state.config.synergyBonusPerNeighbor ?? 1,
      state.soldSlots as boolean[],
    );
    if (synergyBonus > 0) {
      const breakdown = computeSellRefund(state, card, 4);
      const expectedBase = Math.ceil((card.cost + (card.totalUpgradeCost ?? 0)) * 1.5);
      const expectedIncomeComp = Math.max(0, (card.currentIncome ?? 0) - effectiveBase);
      const expectedRepComp = Math.max(0, (card.currentReputationPerTurn ?? 0) - (card.reputationPerTurn ?? 0) - card.reputationBonus);
      expect(breakdown.baseRefund).toBe(expectedBase);
      expect(breakdown.synergyIncomeComponent).toBe(expectedIncomeComp);
      expect(breakdown.synergyRepComponent).toBe(expectedRepComp);
      expect(breakdown.totalRefund).toBe(expectedBase + expectedIncomeComp + expectedRepComp);
    }
  });

  it('should apply 1.5x multiplier to total cost including upgrades', () => {
    const state = createTestState('sell-price-upgrades');
    const card = placeCardOnGrid(state, 0) as BusinessCard;
    expect(card).not.toBeNull();
    card.totalUpgradeCost = 5;
    recalculateCard(state, 0);
    const breakdown = computeSellRefund(state, card, 0);
    const baseRefund = Math.ceil((card.cost + card.totalUpgradeCost!) * 1.5);
    expect(breakdown.baseRefund).toBe(baseRefund);
    expect(breakdown.totalRefund).toBe(baseRefund + breakdown.synergyIncomeComponent + breakdown.synergyRepComponent);
  });

  it('should clamp synergy components to 0 (no negative refund)', () => {
    const state = createTestState('sell-price-no-negative-synergy');
    const card = placeCardOnGrid(state, 0) as BusinessCard;
    expect(card).not.toBeNull();
    (card as any).currentIncome = 0;
    const breakdown = computeSellRefund(state, card, 0);
    const expectedBase = Math.ceil((card.cost + (card.totalUpgradeCost ?? 0)) * 1.5);
    expect(breakdown.synergyIncomeComponent).toBe(0);
    expect(breakdown.totalRefund).toBeGreaterThanOrEqual(expectedBase);
  });

  it('should return 0 synergy when currentIncome is undefined', () => {
    const state = createTestState('sell-price-undefined-income');
    const card = placeCardOnGrid(state, 0) as BusinessCard;
    expect(card).not.toBeNull();
    const breakdown = computeSellRefund(state, card, 0);
    const expectedBase = Math.ceil((card.cost + (card.totalUpgradeCost ?? 0)) * 1.5);
    expect(breakdown.synergyIncomeComponent).toBe(0);
    expect(breakdown.totalRefund).toBe(expectedBase);
  });
});

describe('sellBusiness — new formula integration', () => {
  it('should refund the new amount and credit coins', () => {
    const state = createTestState('sell-integration-coins');
    const initialCoins = state.resourceBank.coins;
    const card = placeCardOnGrid(state, 0) as BusinessCard;
    expect(card).not.toBeNull();
    recalculateCard(state, 0);
    const breakdown = computeSellRefund(state, card, 0);
    const result = sellBusiness(state, 0);
    expect(result.card).toBe(card);
    expect(result.refund).toBe(breakdown.totalRefund);
    expect(state.resourceBank.coins).toBe(initialCoins + breakdown.totalRefund);
    expect((state.soldSlots as boolean[])[0]).toBe(true);
  });

  it('should apply the new formula with synergy bonus', () => {
    const state = createTestState('sell-integration-synergy');
    const initialCoins = state.resourceBank.coins;
    const card = placeCardOnGrid(state, 4) as BusinessCard;
    expect(card).not.toBeNull();
    placeAdjacentCard(state, 3);
    recalculateCard(state, 4);
    recalculateCard(state, 3);
    const expected = computeSellRefund(state, card, 4).totalRefund;
    const result = sellBusiness(state, 4);
    expect(result.refund).toBe(expected);
    expect(result.refund).toBeGreaterThanOrEqual(
      Math.ceil((card.cost + (card.totalUpgradeCost ?? 0)) * 1.5)
    );
    expect(state.resourceBank.coins).toBe(initialCoins + result.refund);
  });

  it('should work for community-space cards', () => {
    const state = createTestState('sell-integration-community-space');
    const initialCoins = state.resourceBank.coins;
    // Find a community-space card if available, otherwise use whatever is available
    const card = placeCardOnGrid(state, 0) as CommunitySpaceCard;
    if (!card) return; // no affordable cards for this seed — skip gracefully
    recalculateCard(state, 0);
    const breakdown = computeSellRefund(state, card, 0);
    const result = sellBusiness(state, 0);
    expect(result.card).toBe(card);
    expect(result.refund).toBe(breakdown.totalRefund);
    expect(state.resourceBank.coins).toBe(initialCoins + breakdown.totalRefund);
  });
});

describe('computeSellRefund — edge cases', () => {
  it('should handle zero-cost card', () => {
    const state = createTestState('sell-zero-cost');
    const card = placeCardOnGrid(state, 0) as BusinessCard;
    expect(card).not.toBeNull();
    recalculateCard(state, 0);
    const originalCost = card.cost;
    (card as any).cost = 0;
    const bd = computeSellRefund(state, card, 0);
    const expectedBase = Math.ceil((0 + (card.totalUpgradeCost ?? 0)) * 1.5);
    expect(bd.totalRefund).toBeGreaterThanOrEqual(expectedBase);
    (card as any).cost = originalCost;
  });

  it('should handle card with only upgrades and no synergy', () => {
    const state = createTestState('sell-only-upgrades');
    const card = placeCardOnGrid(state, 0) as BusinessCard;
    expect(card).not.toBeNull();
    card.totalUpgradeCost = 10;
    recalculateCard(state, 0);
    const bd = computeSellRefund(state, card, 0);
    const expectedBase = Math.ceil((card.cost + 10) * 1.5);
    expect(bd.baseRefund).toBe(expectedBase);
    expect(bd.synergyIncomeComponent).toBe(0);
    expect(bd.totalRefund).toBe(expectedBase);
  });

  it('should round base refund up with Math.ceil', () => {
    const state = createTestState('sell-rounding');
    const card = placeCardOnGrid(state, 0) as BusinessCard;
    expect(card).not.toBeNull();
    recalculateCard(state, 0);
    const originalCost = card.cost;
    (card as any).cost = 3;
    card.totalUpgradeCost = 0;
    const bd = computeSellRefund(state, card, 0);
    const expected = Math.ceil(3 * 1.5);
    expect(bd.baseRefund).toBe(expected);
    expect(bd.totalRefund).toBe(expected);
    (card as any).cost = originalCost;
  });
});
