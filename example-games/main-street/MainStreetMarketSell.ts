/**
 * Main Street: Sell, Close, and Refunds
 *
 * Refund computation, sale legality/execution, and full close (demolition).
 *
 * Import graph: depends on `MainStreetMarketTypes`.
 *
 * @module
 */

import type { LegalityResult } from '@rule-engine';
import type { MainStreetState } from './MainStreetState';
import { addLog, describeEventEffects, classifyEffect } from './MainStreetState';
import type { BusinessCard, CommunitySpaceCard } from './MainStreetCards';
import { updateNeighborsOnSale, updateNeighborsOnClose, hasAdjacentSameType } from './MainStreetAdjacency';
import { roundInt } from './MainStreetDifficulty';
import type { CloseResult, SellRefundBreakdown, SellResult } from './MainStreetMarketTypes';

/**
 * Computes the sell refund for a card using the new formula (CG-0MT5XO7DI0066QCT).
 *
 * Refund = baseRefund + synergyIncomeComponent + synergyRepComponent
 *
 * Where:
 *   baseRefund = Math.ceil((card.cost + totalUpgradeCost) * 1.5)
 *   synergyIncomeComponent = Math.max(0, currentIncome - effectiveBase)
 *   synergyRepComponent = Math.max(0, currentReputationPerTurn - (repPerTurn + repBonus))
 *   effectiveBase = (baseIncome + incomeBonus) * (hasAdjacentSameType ? 0.6 : 1)
 *
 * Synergy components use Math.max(0, ...) to avoid negative contributions
 * (e.g. when same-type penalty reduces income below base).
 * If currentIncome or currentReputationPerTurn is undefined, the respective
 * component is treated as 0 (defensive guard).
 *
 * @param state     Current game state.
 * @param card      The card being sold.
 * @param slotIndex The grid slot index of the card.
 * @returns SellRefundBreakdown with the total refund and component breakdown.
 */
export function computeSellRefund(
  state: MainStreetState,
  card: BusinessCard | CommunitySpaceCard,
  slotIndex: number,
): SellRefundBreakdown {
  const upgradeCosts = (card as any).totalUpgradeCost ?? 0;

  // Base refund: 1.5× the total cost (purchase + upgrades)
  const baseRefund = Math.ceil((card.cost + upgradeCosts) * 1.5);

  // Compute effectiveBase (base income + upgrade bonus, with same-type penalty)
  const soldSlots: boolean[] = state.soldSlots ?? [];
  const gridDims = state.streetGridCols && state.streetGridRows
    ? { cols: state.streetGridCols, rows: state.streetGridRows }
    : undefined;
  let effectiveBase = card.baseIncome + card.incomeBonus;
  if (hasAdjacentSameType(state.streetGrid, slotIndex, soldSlots, gridDims)) {
    effectiveBase = roundInt(effectiveBase * 0.6);
  }

  // Synergy income component: the portion of currentIncome above effectiveBase
  const synergyIncomeComponent = Math.max(0, (card.currentIncome ?? 0) - effectiveBase);

  // Synergy reputation component: the portion above base rep + upgrade bonus
  const synergyRepComponent = Math.max(
    0,
    (card.currentReputationPerTurn ?? 0) - (card.reputationPerTurn ?? 0) - card.reputationBonus,
  );

  const totalRefund = baseRefund + synergyIncomeComponent + synergyRepComponent;

  return { baseRefund, synergyIncomeComponent, synergyRepComponent, totalRefund };
}

/**
 * Sells a business or community-space card from the street grid.
 *
 * The card remains on the grid but is marked as sold (non-functional).
 * The player receives a refund calculated as:
 *   baseRefund = Math.ceil((card.cost + totalUpgradeCost) * 1.5)
 *   + synergy income component (currentIncome - effectiveBase, clamped ≥ 0)
 *   + synergy reputation component (currentRep - (repPerTurn + repBonus), clamped ≥ 0)
 *
 * where effectiveBase = (baseIncome + incomeBonus) × (same-type adjacent ? 0.6 : 1).
 *
 * This is the same +50% premium multiplier used for same-week composite
 * and drag-and-drop placements (CG-0MT5XO7DI0066QCT).
 *
 * @param state     Current game state (mutated in-place).
 * @param slotIndex Street grid slot index of the card to sell.
 * @returns SellResult on success.
 * @throws Error if the slot is empty, already sold, or not in MarketPhase.
 */
export function sellBusiness(
  state: MainStreetState,
  slotIndex: number,
): SellResult {
  // Validate slot index
  if (slotIndex < 0 || slotIndex >= state.streetGrid.length) {
    throw new Error(`Invalid slot index: ${slotIndex}. Must be 0-${state.streetGrid.length - 1}.`);
  }

  const card = state.streetGrid[slotIndex];

  // Check slot is occupied
  if (card === null) {
    throw new Error(`Slot ${slotIndex} is empty. Nothing to sell.`);
  }

  // Check not already sold
  const soldSlots: boolean[] = state.soldSlots ?? [];
  if (soldSlots[slotIndex]) {
    throw new Error(`Slot ${slotIndex} has already been sold.`);
  }

  // Calculate refund using the new formula (CG-0MT5XO7DI0066QCT)
  const breakdown = computeSellRefund(state, card, slotIndex);
  const refund = breakdown.totalRefund;

  // Credit coins
  state.resourceBank.coins += refund;

  // Mark slot as sold
  state.soldSlots[slotIndex] = true;

  // Incrementally update all affected neighbors' cached values.
  // With the sold-neighbour-synergy fix, sold cards remain synergy anchors
  // — neighbours typically retain their synergy bonuses (values stay stable),
  // but recalculation ensures consistency for same-type penalty and type-matching.
  updateNeighborsOnSale(state, slotIndex);

  addLog(
    state,
    `Sold ${card.name} from slot ${slotIndex} for +${refund} coins (€${breakdown.baseRefund} base + ${breakdown.synergyIncomeComponent} synergy income + ${breakdown.synergyRepComponent} synergy rep) (${describeEventEffects(refund, 0)})`,
    classifyEffect(refund, 0),
  );

  return { card, refund, slotIndex };
}

// ── Dev-mode Cheat: Replace Random Market Card ───────────────


/**
 * Checks whether a business at the given slot can be sold.
 *
 * @param state         Current game state.
 * @param slotIndex     Street grid slot index to check.
 * @param isPlacingMode Whether the player is currently in card-placement mode (selling not allowed).
 * @returns LegalityResult indicating whether the action is permitted.
 */
export function canSellBusiness(
  state: MainStreetState,
  slotIndex: number,
  isPlacingMode: boolean = false,
): LegalityResult {
  // Must be in MarketPhase
  if (state.phase !== 'MarketPhase') {
    return { legal: false, reason: 'Selling is only allowed during the MarketPhase.' };
  }

  // Must not be in card-placement mode
  if (isPlacingMode) {
    return { legal: false, reason: 'Cannot sell a card while in card-placement mode.' };
  }

  // Validate slot index
  if (slotIndex < 0 || slotIndex >= state.streetGrid.length) {
    return { legal: false, reason: `Invalid slot index: ${slotIndex}.` };
  }

  const card = state.streetGrid[slotIndex];

  // Check slot is occupied
  if (card === null) {
    return { legal: false, reason: `Slot ${slotIndex} is empty. Nothing to sell.` };
  }

  // Check not already sold
  const soldSlots: boolean[] = state.soldSlots ?? [];
  if (soldSlots[slotIndex]) {
    return { legal: false, reason: `Slot ${slotIndex} has already been sold.` };
  }

  return { legal: true };
}

// ── Close Business (Street Grid) ─────────────────────────────

/** Result returned after closing a business on the street grid. */

/**
 * Checks whether a business or community-space card at the given slot can be
 * closed.
 *
 * Closing is the counterpart to selling: it costs one daily action (charged
 * by `closeBusinessCommand` via the shared `consumeAction` helper) and grants
 * no coins, but removes the card from the street entirely so the slot becomes
 * immediately placeable again. Sold cards are inert and must not be closeable.
 *
 * Gates on MarketPhase, not-placing-mode, slot bounds, slot occupied, card
 * non-sold, and >=1 daily action available — the same `LegalityResult`
 * pattern as `canSellBusiness`, plus the action-budget check.
 *
 * @param state         Current game state.
 * @param slotIndex     Street grid slot index to check.
 * @param isPlacingMode Whether the player is currently in card-placement mode (closing not allowed).
 * @returns LegalityResult indicating whether the action is permitted.
 */
export function canCloseBusiness(
  state: MainStreetState,
  slotIndex: number,
  isPlacingMode: boolean = false,
): LegalityResult {
  if (state.phase !== 'MarketPhase') {
    return { legal: false, reason: 'Closing is only allowed during the MarketPhase.' };
  }

  if (isPlacingMode) {
    return { legal: false, reason: 'Cannot close a card while in card-placement mode.' };
  }

  if (slotIndex < 0 || slotIndex >= state.streetGrid.length) {
    return { legal: false, reason: `Invalid slot index: ${slotIndex}.` };
  }

  const card = state.streetGrid[slotIndex];
  if (card === null) {
    return { legal: false, reason: `Slot ${slotIndex} is empty. Nothing to close.` };
  }

  const soldSlots: boolean[] = state.soldSlots ?? [];
  if (soldSlots[slotIndex]) {
    return { legal: false, reason: `Slot ${slotIndex} has already been sold and cannot be closed.` };
  }

  if ((state.actionsRemaining ?? 0) <= 0) {
    return { legal: false, reason: 'No actions remaining this week. Closing costs 1 action.' };
  }

  return { legal: true };
}

/**
 * Closes (demolishes without refund) a business or community-space card on the
 * street grid.
 *
 * The card is fully removed: the slot becomes `null` (immediately placeable
 * again), the card is pushed to the unified `discardPile` (it is not removed
 * from the game), affected neighbours' cached income/reputation are
 * recalculated with the closed card no longer present, and an activity-log
 * entry is written. No coins are credited and no action is consumed at this
 * layer — the daily action is charged by `closeBusinessCommand` so that the
 * engine and command paths share the single `consumeAction` enforcement point
 * (CG-0MTCP7F9S009HARC).
 *
 * @param state     Current game state (mutated in-place).
 * @param slotIndex Street grid slot index of the card to close.
 * @returns CloseResult on success.
 * @throws Error if the slot is out of bounds, empty, or already sold.
 */
export function closeBusiness(
  state: MainStreetState,
  slotIndex: number,
): CloseResult {
  if (slotIndex < 0 || slotIndex >= state.streetGrid.length) {
    throw new Error(`Invalid slot index: ${slotIndex}. Must be 0-${state.streetGrid.length - 1}.`);
  }

  const card = state.streetGrid[slotIndex];
  if (card === null) {
    throw new Error(`Slot ${slotIndex} is empty. Nothing to close.`);
  }

  const soldSlots: boolean[] = state.soldSlots ?? [];
  if (soldSlots[slotIndex]) {
    throw new Error(`Slot ${slotIndex} has already been sold and cannot be closed.`);
  }

  // Send the card to the unified discard pile (community-space cards share the
  // business card shape; the pile is typed as BusinessCard[]).
  state.discardPile.push(card as unknown as BusinessCard);

  // Remove from the grid; the slot becomes immediately placeable.
  state.streetGrid[slotIndex] = null;
  state.soldSlots[slotIndex] = false;

  // Recalculate neighbours with the closed card fully removed (unlike a sale,
  // where the card stays on the grid as an inert synergy anchor).
  updateNeighborsOnClose(state, slotIndex);

  addLog(
    state,
    `Closed ${card.name} from slot ${slotIndex} (no refund, 1 action) (${describeEventEffects(0, 0)})`,
    classifyEffect(0, 0),
  );

  return { card, slotIndex };
}

