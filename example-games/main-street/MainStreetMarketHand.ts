/**
 * Main Street: Hand Management
 *
 * Adding/moving cards to hand, playing business cards from hand, discard,
 * and shared hand-index validation.
 *
 * Import graph: depends on `MainStreetMarketTypes`.
 *
 * @module
 */

import type { LegalityResult } from '@rule-engine';
import type { MainStreetState } from './MainStreetState';
import { addLog, describeEventEffects, classifyEffect } from './MainStreetState';
import type { BusinessCard, CommunitySpaceCard, UpgradeCard, EventCard, AnyCard } from './MainStreetCards';
import { updateNeighborsOnPlacement, tagSlotOwnerIfCompetitive } from './MainStreetAdjacency';
import type { PurchaseResult } from './MainStreetMarketTypes';

/**
 * Checks whether the player can add a card to their hand.
 *
 * The hand is full when its length >= maxHandSize.
 *
 * @param state  Current game state.
 * @returns LegalityResult indicating whether the action is permitted.
 */
export function canAddToHand(state: MainStreetState): LegalityResult {
  const hand = state.hand ?? [];
  const maxSize = state.maxHandSize ?? 3;
  if (hand.length >= maxSize) {
    return { legal: false, reason: `Hand is full (${hand.length}/${maxSize}). Place on tableau or sell a card first.` };
  }
  return { legal: true };
}

/**
 * Moves a card from the single-row market into the player's hand
 * (CG-0MSTOATDT009BRX2). The move itself costs **one daily action**
 * (CG-0MSTOF1N5005PK2R business, CG-0MTFWBNL30043ZBM event) but no coins.
 * Bounded by hand capacity (`maxHandSize`); the market is NOT refilled
 * mid-turn after moves (day-start refill unchanged). Payment is deferred —
 * the card's listed cost is paid when it is played from hand (business on
 * placement; upgrade/event when played/triggered).
 */
export function moveToHand(state: MainStreetState, cardId: string): PurchaseResult {
  const marketIndex = state.market.cards.findIndex(c => c.id === cardId);
  const card = state.market.cards[marketIndex];
  if (!card) {
    throw new Error(`Card ${cardId} not found in the market.`);
  }
  // Staff cards cannot be held in hand — they are hired directly from the
  // market row (CG-0MT3KZNQB0053K55). Guard so a staff card in the row is
  // never moved into the hand (the hand type excludes the staff family).
  if (card.family === 'staff') {
    throw new Error(`Staff card ${card.name} cannot be moved to hand — hire it directly.`);
  }

  // Hand capacity is the only constraint; the move itself is free of coins.
  const handCheck = canAddToHand(state);
  if (!handCheck.legal) {
    throw new Error(handCheck.reason);
  }

  state.market.cards.splice(marketIndex, 1);
  state.hand.push({ ...card } as any);

  // Track same-week composite for upgrades (CG-0MT3IYSRL001VVUP): when an
  // upgrade is moved to hand, record its id so `play-upgrade-from-hand`
  // can detect a same-week move+play composite and skip the action cost.
  if (card.family === 'upgrade') {
    state.justMovedUpgradeCardId = card.id;
  }

  addLog(state, `Moved ${card.name} to hand (1 action, pay on play)`, 'neutral');

  return { card, cost: 0, refilled: false };
}

/**
 * Legality gate shared by the from-hand helpers: must be the player's turn
 * (MarketPhase) and the hand index must point at a card.
 */
export function validateHandIndex(state: MainStreetState, handIndex: number): AnyCard {
  if (state.phase !== 'MarketPhase') {
    throw new Error('Playing from hand is only allowed during MarketPhase.');
  }
  const card = (state.hand ?? [])[handIndex];
  if (!card) {
    throw new Error(`No card at hand index ${handIndex}.`);
  }
  return card;
}

/**
 * Plays a business/community-space card from the player's hand onto the
 * street grid, charging its listed cost at placement time
 * (CG-0MSTOATDT009BRX2 cost-at-play deferral model).
 *
 * @param premiumCost Optional premium price to charge instead of the listed
 *                    `card.cost` (same-week composite buy-and-play when no
 *                    action is available — CG-0MT24X0SX007RLHN). When absent,
 *                    the listed cost is charged (held-card / plan-ahead path).
 */
export function playBusinessFromHand(
  state: MainStreetState,
  handIndex: number,
  slotIndex: number,
  premiumCost?: number,
): PurchaseResult {
  const card = validateHandIndex(state, handIndex);
  if (card.family !== 'business' && card.family !== 'community-space') {
    throw new Error(`Card at hand index ${handIndex} is not a business/community-space card.`);
  }
  const price = premiumCost ?? card.cost;
  if (state.resourceBank.coins < price) {
    throw new Error(`Not enough coins to play ${card.name} from hand. Need ${price}, have ${state.resourceBank.coins}.`);
  }
  if (slotIndex < 0 || slotIndex >= state.streetGrid.length) {
    throw new Error(`Invalid slot index: ${slotIndex}. Must be 0-${state.streetGrid.length - 1}.`);
  }
  if (state.streetGrid[slotIndex] !== null) {
    throw new Error(`Slot ${slotIndex} is already occupied.`);
  }

  state.resourceBank.coins -= price;
  state.hand.splice(handIndex, 1);
  state.streetGrid[slotIndex] = card as BusinessCard;
  updateNeighborsOnPlacement(state, slotIndex);
  // Record ownership on the owner-tagged grid (competitive; no-op single-player).
  tagSlotOwnerIfCompetitive(state, slotIndex);
  (state as any).businessPlacedThisTurn = true;

  addLog(
    state,
    premiumCost !== undefined
      ? `Played ${card.name} from hand into slot ${slotIndex} (-€${price}, 50% premium, ${describeEventEffects(-price, 0)})`
      : `Played ${card.name} from hand into slot ${slotIndex} (-€${price}, ${describeEventEffects(-price, 0)})`,
    classifyEffect(-price, 0),
  );

  return { card, cost: price, refilled: false };
}

/**
 * Discards a card from the player's hand at any time during the player's
 * turn, deducting the card's coin cost as reputation (clamped at 0).
 * The card goes to its corresponding family discard pile
 * (CG-0MSTOATDT009BRX2, CG-0MTQ7KUVF009ELQK).
 */
export function discardFromHand(state: MainStreetState, handIndex: number): void {
  const card = validateHandIndex(state, handIndex);
  state.hand.splice(handIndex, 1);
  // Reputation penalty: deduct the card's coin cost, clamped at 0.
  const repCost = card.cost ?? 0;
  state.resourceBank.reputation = Math.max(0, state.resourceBank.reputation - repCost);
  if (card.family === 'business') {
    state.discards.business.push(card as BusinessCard);
  } else if (card.family === 'community-space') {
    state.discards.communitySpace.push(card as CommunitySpaceCard);
  } else if (card.family === 'upgrade') {
    state.discards.upgrade.push(card as UpgradeCard);
  } else if (card.family === 'event') {
    state.discards.event.push(card as EventCard);
  }
  addLog(
    state,
    repCost > 0
      ? `Discarded ${card.name} from hand (-${repCost} rep)`
      : `Discarded ${card.name} from hand (no cost)`,
    'neutral',
  );
}

