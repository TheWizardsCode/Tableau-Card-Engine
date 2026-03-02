/**
 * Main Street: Market Logic
 *
 * Implements purchasing Business/Event/Upgrade cards from the market,
 * market replenishment after purchases, and legality validation for
 * all market-related actions.
 *
 * All functions mutate state in-place (following engine conventions)
 * and return a `LegalityResult` for validation or a `PurchaseResult`
 * for executed purchases.
 *
 * @module
 */

import type { LegalityResult } from '../../src/rule-engine';
import type { MainStreetState } from './MainStreetState';
import { addLog } from './MainStreetState';
import type { BusinessCard, UpgradeCard, AnyCard } from './MainStreetCards';
import { GRID_SIZE } from './MainStreetCards';

// ── Result Types ────────────────────────────────────────────

/** Result returned after a successful purchase action. */
export interface PurchaseResult {
  /** The card that was purchased. */
  card: AnyCard;
  /** Coins spent. */
  cost: number;
  /** Whether the market slot was refilled from the deck. */
  refilled: boolean;
}

// ── Legality Checks ─────────────────────────────────────────

/**
 * Checks whether the player can purchase a Business card from the market
 * and place it on a specific grid slot.
 *
 * @param state   Current game state.
 * @param cardId  ID of the Business card in the market.
 * @param slotIndex  Target street grid slot (0-based).
 * @returns LegalityResult indicating whether the action is permitted.
 */
export function canPurchaseBusiness(
  state: MainStreetState,
  cardId: string,
  slotIndex: number,
): LegalityResult {
  // Find card in market
  const card = state.market.business.find(c => c.id === cardId);
  if (!card) {
    return { legal: false, reason: 'Card not found in the business market.' };
  }

  // Check coins
  if (state.resourceBank.coins < card.cost) {
    return { legal: false, reason: `Not enough coins. Need ${card.cost}, have ${state.resourceBank.coins}.` };
  }

  // Validate slot index
  if (slotIndex < 0 || slotIndex >= GRID_SIZE) {
    return { legal: false, reason: `Invalid slot index: ${slotIndex}. Must be 0-${GRID_SIZE - 1}.` };
  }

  // Check slot is empty
  if (state.streetGrid[slotIndex] !== null) {
    return { legal: false, reason: `Slot ${slotIndex} is already occupied.` };
  }

  return { legal: true };
}

/**
 * Checks whether the player can purchase an Upgrade card and apply it
 * to a matching business on the street.
 *
 * @param state   Current game state.
 * @param cardId  ID of the Upgrade card in the market.
 * @returns LegalityResult indicating whether the action is permitted.
 */
export function canPurchaseUpgrade(
  state: MainStreetState,
  cardId: string,
): LegalityResult {
  // Find card in market
  const card = state.market.upgrade.find(c => c.id === cardId);
  if (!card) {
    return { legal: false, reason: 'Card not found in the upgrade market.' };
  }

  // Check coins
  if (state.resourceBank.coins < card.cost) {
    return { legal: false, reason: `Not enough coins. Need ${card.cost}, have ${state.resourceBank.coins}.` };
  }

  // Check a matching business is placed on the street
  const hasTarget = state.streetGrid.some(
    b => b !== null && b.name === card.targetBusiness && b.level < b.maxLevel,
  );
  if (!hasTarget) {
    return { legal: false, reason: `No eligible ${card.targetBusiness} on the street to upgrade.` };
  }

  return { legal: true };
}

/**
 * Checks whether the player can purchase an Event card from the market.
 *
 * Investment events are purchased from the market and held (max 1 at a time)
 * until the player chooses to play them during the MarketPhase.
 * Incident events are drawn automatically (not purchased).
 *
 * @param state   Current game state.
 * @param cardId  ID of the Event card in the market.
 * @returns LegalityResult indicating whether the action is permitted.
 */
export function canPurchaseEvent(
  state: MainStreetState,
  cardId: string,
): LegalityResult {
  // Find card in market
  const card = state.market.event.find(c => c.id === cardId);
  if (!card) {
    return { legal: false, reason: 'Card not found in the event market.' };
  }

  // Only Investment-trigger events can be purchased
  if (card.trigger !== 'Investment') {
    return { legal: false, reason: 'Incident events cannot be purchased; they are drawn automatically.' };
  }

  // Only one held Investment at a time
  if (state.heldEvent !== null) {
    return { legal: false, reason: 'Already holding an Investment event. Play or discard it before buying another.' };
  }

  // Events in the walking skeleton are free (cost = coinDelta applied on resolution),
  // but purchasing still requires being in the right phase.
  // No coin check needed for event purchase itself.

  return { legal: true };
}

// ── Market Refill ───────────────────────────────────────────

/**
 * Refills all empty slots in the business market from the business deck.
 * Called after initial setup or if the market is partially empty.
 */
export function refillBusinessMarket(state: MainStreetState): void {
  const { market, decks } = state;
  while (market.business.length < 4 && decks.business.length > 0) {
    market.business.push(decks.business.pop()!);
  }
}

/**
 * Refills all empty slots in the event market from the event deck.
 */
export function refillEventMarket(state: MainStreetState): void {
  const { market, decks } = state;
  while (market.event.length < 2 && decks.event.length > 0) {
    market.event.push(decks.event.pop()!);
  }
}

/**
 * Refills all empty slots in the upgrade market from the upgrade deck.
 */
export function refillUpgradeMarket(state: MainStreetState): void {
  const { market, decks } = state;
  while (market.upgrade.length < 2 && decks.upgrade.length > 0) {
    market.upgrade.push(decks.upgrade.pop()!);
  }
}

/**
 * Refills all market rows to their maximum slot counts.
 */
export function refillAllMarkets(state: MainStreetState): void {
  refillBusinessMarket(state);
  refillEventMarket(state);
  refillUpgradeMarket(state);
}

// ── Purchase Execution ──────────────────────────────────────

/**
 * Purchases a Business card from the market, places it on the street grid,
 * deducts coins, and refills the market slot.
 *
 * @param state     Current game state (mutated in-place).
 * @param cardId    ID of the Business card in the market.
 * @param slotIndex Target street grid slot (0-based).
 * @returns PurchaseResult on success.
 * @throws Error if the action is illegal.
 */
export function purchaseBusiness(
  state: MainStreetState,
  cardId: string,
  slotIndex: number,
): PurchaseResult {
  const legality = canPurchaseBusiness(state, cardId, slotIndex);
  if (!legality.legal) {
    throw new Error(legality.reason);
  }

  const marketIndex = state.market.business.findIndex(c => c.id === cardId);
  const card = state.market.business[marketIndex];

  // Deduct cost
  state.resourceBank.coins -= card.cost;

  // Remove from market
  state.market.business.splice(marketIndex, 1);

  // Place on grid
  state.streetGrid[slotIndex] = card;

  // Refill market
  const refilled = state.decks.business.length > 0;
  refillBusinessMarket(state);

  addLog(state, `Placed ${card.name} in slot ${slotIndex} (-$${card.cost})`, 'loss');

  return { card, cost: card.cost, refilled };
}

/**
 * Purchases an Upgrade card from the market and applies it to the first
 * matching eligible business on the street.
 *
 * @param state     Current game state (mutated in-place).
 * @param cardId    ID of the Upgrade card in the market.
 * @param targetSlot Optional: specific grid slot of the business to upgrade.
 *                   If omitted, applies to the first eligible match.
 * @returns PurchaseResult on success.
 * @throws Error if the action is illegal.
 */
export function purchaseUpgrade(
  state: MainStreetState,
  cardId: string,
  targetSlot?: number,
): PurchaseResult {
  const legality = canPurchaseUpgrade(state, cardId);
  if (!legality.legal) {
    throw new Error(legality.reason);
  }

  const marketIndex = state.market.upgrade.findIndex(c => c.id === cardId);
  const card = state.market.upgrade[marketIndex];

  // Find the target business
  let businessIndex: number;
  if (targetSlot !== undefined) {
    const biz = state.streetGrid[targetSlot];
    if (!biz || biz.name !== card.targetBusiness || biz.level >= biz.maxLevel) {
      throw new Error(`Business at slot ${targetSlot} is not a valid target for this upgrade.`);
    }
    businessIndex = targetSlot;
  } else {
    businessIndex = state.streetGrid.findIndex(
      b => b !== null && b.name === card.targetBusiness && b.level < b.maxLevel,
    );
  }

  const business = state.streetGrid[businessIndex]!;

  // Deduct cost
  state.resourceBank.coins -= card.cost;

  // Remove from market
  state.market.upgrade.splice(marketIndex, 1);

  // Apply upgrade to business
  business.level += 1;
  business.incomeBonus += card.incomeBonus;
  business.synergyRangeBonus += card.synergyRangeBonus;

  // Refill market
  const refilled = state.decks.upgrade.length > 0;
  refillUpgradeMarket(state);

  addLog(state, `Upgraded ${business.name} with ${card.name} (-$${card.cost})`, 'loss');

  return { card, cost: card.cost, refilled };
}

/**
 * Purchases an Investment-trigger Event card from the market and holds it
 * for the player to play later during the MarketPhase.
 *
 * @param state   Current game state (mutated in-place).
 * @param cardId  ID of the Event card in the market.
 * @returns PurchaseResult on success.
 * @throws Error if the action is illegal.
 */
export function purchaseEvent(
  state: MainStreetState,
  cardId: string,
): PurchaseResult {
  const legality = canPurchaseEvent(state, cardId);
  if (!legality.legal) {
    throw new Error(legality.reason);
  }

  const marketIndex = state.market.event.findIndex(c => c.id === cardId);
  const card = state.market.event[marketIndex];

  // Remove from market
  state.market.event.splice(marketIndex, 1);

  // Hold the Investment event (max 1)
  state.heldEvent = card;

  // Refill market
  const refilled = state.decks.event.length > 0;
  refillEventMarket(state);

  addLog(state, `Bought event: ${card.name} (held)`, 'neutral');

  return { card, cost: 0, refilled };
}

/**
 * Returns the list of Business cards in the market that the player can
 * currently afford (has enough coins for).
 */
export function getAffordableBusinessCards(state: MainStreetState): BusinessCard[] {
  return state.market.business.filter(c => c.cost <= state.resourceBank.coins);
}

/**
 * Returns the list of Upgrade cards in the market that the player can
 * currently afford and has a valid target for.
 */
export function getAffordableUpgradeCards(state: MainStreetState): UpgradeCard[] {
  return state.market.upgrade.filter(card => {
    if (card.cost > state.resourceBank.coins) return false;
    return state.streetGrid.some(
      b => b !== null && b.name === card.targetBusiness && b.level < b.maxLevel,
    );
  });
}

/**
 * Returns available empty slots on the street grid.
 */
export function getEmptySlots(state: MainStreetState): number[] {
  const slots: number[] = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    if (state.streetGrid[i] === null) slots.push(i);
  }
  return slots;
}
