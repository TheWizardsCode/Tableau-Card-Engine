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
import type { BusinessCard, CommunitySpaceCard, UpgradeCard, EventCard, AnyCard } from './MainStreetCards';
import {
  GRID_SIZE,
  REFRESH_MARKET_COST,
  orderIncidentDeck,
} from './MainStreetCards';
import { updateNeighborsOnPlacement, updateNeighborsOnSale } from './MainStreetAdjacency';
import { refillSingleRowMarket } from './MainStreetState';
import { resolveEvent } from './MainStreetEngine';

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

/** Result returned after refreshing the single market row. */
export interface RefreshResult {
  replaced: AnyCard[];
  cost: number;
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
  const card = state.market.cards.find(c => c.id === cardId);
  if (!card) {
    return { legal: false, reason: 'Card not found in the market.' };
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
 * Searches the single market row for upgrade-family cards.
 * The upgrade's `requiredLevel` must be ≤ the target business's current `level`.
 *
 * @param state   Current game state.
 * @param cardId  ID of the Upgrade card in the market row.
 * @returns LegalityResult indicating whether the action is permitted.
 */
export function canPurchaseUpgrade(
  state: MainStreetState,
  cardId: string,
): LegalityResult {
  // Find card in the market (must be an upgrade)
  const card = state.market.cards.find(
    c => c.id === cardId && c.family === 'upgrade',
  ) as UpgradeCard | undefined;
  if (!card) {
    return { legal: false, reason: 'Card not found in the upgrade market.' };
  }

  // Check coins
  if (state.resourceBank.coins < card.cost) {
    return { legal: false, reason: `Not enough coins. Need ${card.cost}, have ${state.resourceBank.coins}.` };
  }

  // Check a matching business is placed on the street at the required level
  const requiredLevel = card.requiredLevel ?? 0;
  const hasTarget = state.streetGrid.some(
    b =>
      b !== null &&
      b.name === card.targetBusiness &&
      b.level === requiredLevel &&
      b.level < b.maxLevel,
  );
  if (!hasTarget) {
    return {
      legal: false,
      reason: `No eligible ${card.targetBusiness} on the street to upgrade (requires level ${requiredLevel}, below max level).`,
    };
  }

  return { legal: true };
}

/**
 * Checks whether the player can purchase an Event card from the market.
 *
 * Investment events are purchased from the market and added to the player's
 * hand (any mix of business and event cards, up to `maxHandSize` total) until
 * the player chooses to play them during the MarketPhase.
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
  // Find card in the market (must be an event)
  const card = state.market.cards.find(
    c => c.id === cardId && c.family === 'event',
  ) as EventCard | undefined;
  if (!card) {
    return { legal: false, reason: 'Card not found in the event market.' };
  }

  // Only Investment-trigger events can be purchased
  if (card.trigger !== 'Investment') {
    return { legal: false, reason: 'Incident events cannot be purchased; they are drawn automatically.' };
  }

  // Hand capacity is the only limit — no separate "max 1 held Investment" rule
  const handCheck = canAddToHand(state);
  if (!handCheck.legal) {
    return handCheck;
  }

  // Check coins
  if (state.resourceBank.coins < card.cost) {
    return { legal: false, reason: `Not enough coins. Need ${card.cost}, have ${state.resourceBank.coins}.` };
  }

  return { legal: true };
}

// ── Market Refill ───────────────────────────────────────────

/**
 * Refills all empty slots in the business market from the business deck.
 * Called after initial setup or if the market is partially empty.
 */


/**
 * Refills the single-row marketplace toward `MARKET_TOTAL_SLOTS` cards with
 * the target composition (CG-0MSTOATDT009BRX2): at most 3 cards, always ≥1
 * business card (community-space counts as business), the remainder random
 * within "1–2 business, 0–1 upgrade, 0–1 event".
 *
 * TOP-UP semantics: currently-visible cards are preserved and only missing
 * slots are drawn (mirrors the legacy day-start refill; the tutorial relies
 * on this to keep scenario-placed cards alive across the day boundary).
 * Callers wanting a full re-draw discard/clear the row first:
 * `refreshMarket` (re-roll) and `cycleMarketCards` (end-of-day cycle) do.
 */
export function refillMarket(state: MainStreetState): void {
  refillSingleRowMarket(state);
}

/**
 * Checks whether the player can re-roll the single-row market.
 */
export function canRefreshMarket(state: MainStreetState): LegalityResult {
  if (state.phase !== 'MarketPhase') {
    return { legal: false, reason: 'Re-rolling the market is only allowed during MarketPhase.' };
  }
  const cost = refreshMarketCost(state);
  if (state.resourceBank.coins < cost) {
    return { legal: false, reason: `Not enough coins. Need ${cost}, have ${state.resourceBank.coins}.` };
  }
  return { legal: true };
}

/**
 * Effective cost to re-roll the single-row market, after staff discounts
 * (e.g. the Accountant's "refresh costs 1 less" ability — Group F,
 * CG-0MSQJ7VL9009JHF4 / CG-0MSTOATDT009BRX2). Discounts are summed across
 * hired staff and the result is clamped at 0 (never negative).
 */
export function refreshMarketCost(state: MainStreetState): number {
  const discount = (state.staffCards ?? []).reduce(
    (sum, card) => sum + (card.refreshCostDiscount ?? 0),
    0,
  );
  return Math.max(0, REFRESH_MARKET_COST - discount);
}

/**
 * Re-rolls the single-row market: charges the player, discards all
 * currently-visible (unmoved/unpurchased) cards to their respective discard
 * piles, and refills the whole line to full composition. Unlimited per turn
 * while affordable (same cadence as the legacy per-row refreshes).
 */
export function refreshMarket(state: MainStreetState): RefreshResult {
  const legality = canRefreshMarket(state);
  if (!legality.legal) throw new Error(legality.reason);

  // Deduct cost (after staff refresh discounts, e.g. Accountant)
  const cost = refreshMarketCost(state);
  state.resourceBank.coins -= cost;

  // Move visible market cards to their respective discard piles
  const removed: AnyCard[] = state.market.cards.slice();
  for (const c of removed) {
    if (c.family === 'business') {
      state.discards.business.push(c as any);
    } else if (c.family === 'community-space') {
      state.discards.communitySpace.push(c as any);
    } else if (c.family === 'upgrade') {
      state.discards.upgrade.push(c as any);
    } else if (c.family === 'event') {
      state.discards.event.push(c as any);
    }
  }

  // Clear the visible row and draw a fresh full line
  state.market.cards.length = 0;
  refillSingleRowMarket(state);

  // Build a detailed replacement summary for the activity log
  const replacedStrings = removed.map(c => {
    const name = (c as any).name ?? c.id;
    return `${c.id}${name ? ` (${name})` : ''}`;
  });
  addLog(state, `Re-rolled market (-€${cost}): replaced ${replacedStrings.join(', ')}`, 'loss');

  return { replaced: removed, cost };
}

// ── Market Cycling (Multi-Use Card Economy) ──────────────────

/**
 * Cycles all unpurchased market cards to their respective discard piles
 * and refills the market from the decks.
 *
 * Called at the end of each MarketPhase (before IncomePhase) to ensure
 * fresh cards are available each turn. Player-owned cards (hand, tableau)
 * are not affected.
 *
 * Uses the existing seeded RNG for any reshuffles that occur during refill.
 *
 * @param state  Current game state (mutated in-place).
 */
export function cycleMarketCards(state: MainStreetState): void {
  // ── Cycle the single-row market cards to discards ────────
  const visibleCards = state.market.cards.splice(0);
  for (const card of visibleCards) {
    if (card.family === 'business') {
      state.discards.business.push(card as BusinessCard);
    } else if (card.family === 'community-space') {
      state.discards.communitySpace.push(card as CommunitySpaceCard);
    } else if (card.family === 'upgrade') {
      state.discards.upgrade.push(card as UpgradeCard);
    } else if (card.family === 'event') {
      state.discards.event.push(card as EventCard);
    }
  }

  // Log the cycle
  if (visibleCards.length > 0) {
    addLog(state, `Market cycled: ${visibleCards.length} unpurchased cards moved to discard`, 'neutral');
  }

  // ── Refill the single row from decks ─────────────────────
  // (refillMarket would also cycle the already-emptied row; call the raw
  //  refill so the log line above is the canonical cycle record.)
  refillSingleRowMarket(state);
}

/**
 * Replenishes the face-down incident deck when it is exhausted: gathers
 * remaining Incident-trigger cards from the event deck and event discards
 * and rebuilds the deck constraint-aware via `orderIncidentDeck` (seeded
 * from the resolved-draw balance history, so the rebuilt deck stays
 * consistent with what was already resolved) — CG-0MSTOATDP000JNHH,
 * option (a). No RNG is consumed here: the pool order is deterministic
 * (gather order from the seeded decks/discards) and the selector scans
 * deterministically.
 *
 * No visible refill loop: the deck is face-down and only its remaining
 * count is shown. Called by `resolveIncident` when `incidentDeck` is empty.
 * Does nothing when no Incident-trigger cards are available anywhere.
 */
export function replenishIncidentDeck(state: MainStreetState): void {
  if (state.incidentDeck.length > 0) return;

  const pool: EventCard[] = [];
  const eventDeck = state.decks.event;
  for (let i = eventDeck.length - 1; i >= 0; i--) {
    if (eventDeck[i].trigger === 'Incident') {
      pool.push(eventDeck.splice(i, 1)[0]);
    }
  }
  const eventDiscards = state.discards.event;
  for (let i = eventDiscards.length - 1; i >= 0; i--) {
    if (eventDiscards[i].trigger === 'Incident') {
      pool.push(eventDiscards.splice(i, 1)[0]);
    }
  }
  if (pool.length === 0) return;

  state.incidentDeck = orderIncidentDeck(pool, state.incidentBalance);
  addLog(state, 'Reshuffled incident deck from event cards', 'neutral');
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

  const marketIndex = state.market.cards.findIndex(c => c.id === cardId);
  const card = state.market.cards[marketIndex];

  // Deduct cost
  state.resourceBank.coins -= card.cost;

  // Remove from market
  state.market.cards.splice(marketIndex, 1);

  // Place on grid (card may be BusinessCard or CommunitySpaceCard; both have same grid mechanics)
  state.streetGrid[slotIndex] = card as BusinessCard;

  // Incrementally update the new card's and all affected neighbors' cached values
  updateNeighborsOnPlacement(state, slotIndex);

  // Note: market is not refilled immediately. Replenishment occurs at start of next turn.
  const refilled = false;

  addLog(state, `Placed ${card.name} in slot ${slotIndex} (-€${card.cost})`, 'loss');

  return { card, cost: card.cost, refilled };
}

// ── Purchase-to-Hand (Multi-Use Card Economy) ────────────────

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
 * Moves a card from the single-row market into the player's hand for free
 * (CG-0MSTOATDT009BRX2). Bounded only by hand capacity (`maxHandSize`); the
 * market is NOT refilled mid-turn after moves (day-start refill unchanged).
 * Payment is deferred — the card's listed cost is paid when it is played
 * from hand (business on placement; upgrade/event when played/triggered).
 */
export function moveToHand(state: MainStreetState, cardId: string): PurchaseResult {
  const marketIndex = state.market.cards.findIndex(c => c.id === cardId);
  const card = state.market.cards[marketIndex];
  if (!card) {
    throw new Error(`Card ${cardId} not found in the market.`);
  }

  // Hand capacity is the only constraint; the move itself is free of coins.
  const handCheck = canAddToHand(state);
  if (!handCheck.legal) {
    throw new Error(handCheck.reason);
  }

  state.market.cards.splice(marketIndex, 1);
  state.hand.push({ ...card } as any);

  addLog(state, `Moved ${card.name} to hand (free, pay on play)`, 'neutral');

  return { card, cost: 0, refilled: false };
}

// ── Play / Discard from Hand (CG-0MSTOATDT009BRX2) ───────────

/**
 * Legality gate shared by the from-hand helpers: must be the player's turn
 * (MarketPhase) and the hand index must point at a card.
 */
function validateHandIndex(state: MainStreetState, handIndex: number): AnyCard {
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
 */
export function playBusinessFromHand(
  state: MainStreetState,
  handIndex: number,
  slotIndex: number,
): PurchaseResult {
  const card = validateHandIndex(state, handIndex);
  if (card.family !== 'business' && card.family !== 'community-space') {
    throw new Error(`Card at hand index ${handIndex} is not a business/community-space card.`);
  }
  if (state.resourceBank.coins < card.cost) {
    throw new Error(`Not enough coins to play ${card.name} from hand. Need ${card.cost}, have ${state.resourceBank.coins}.`);
  }
  if (slotIndex < 0 || slotIndex >= GRID_SIZE) {
    throw new Error(`Invalid slot index: ${slotIndex}. Must be 0-${GRID_SIZE - 1}.`);
  }
  if (state.streetGrid[slotIndex] !== null) {
    throw new Error(`Slot ${slotIndex} is already occupied.`);
  }

  state.resourceBank.coins -= card.cost;
  state.hand.splice(handIndex, 1);
  state.streetGrid[slotIndex] = card as BusinessCard;
  updateNeighborsOnPlacement(state, slotIndex);

  addLog(state, `Played ${card.name} from hand into slot ${slotIndex} (-€${card.cost})`, 'loss');

  return { card, cost: card.cost, refilled: false };
}

/**
 * Plays an upgrade card from the player's hand onto a matching business,
 * charging its listed cost at play time (CG-0MSTOATDT009BRX2).
 */
export function playUpgradeFromHand(
  state: MainStreetState,
  handIndex: number,
  targetSlot?: number,
): PurchaseResult {
  const card = validateHandIndex(state, handIndex);
  if (card.family !== 'upgrade') {
    throw new Error(`Card at hand index ${handIndex} is not an upgrade card.`);
  }
  const upgrade = card as UpgradeCard;
  if (state.resourceBank.coins < upgrade.cost) {
    throw new Error(`Not enough coins to play ${upgrade.name} from hand. Need ${upgrade.cost}, have ${state.resourceBank.coins}.`);
  }

  // Locate the target business (mirror purchaseUpgrade's matching rules).
  let businessIndex: number;
  const requiredLevel = upgrade.requiredLevel ?? 0;
  if (targetSlot !== undefined) {
    const biz = state.streetGrid[targetSlot];
    if (
      !biz ||
      biz.name !== upgrade.targetBusiness ||
      biz.level !== requiredLevel ||
      biz.level >= biz.maxLevel
    ) {
      throw new Error(`Business at slot ${targetSlot} is not a valid target for this upgrade.`);
    }
    businessIndex = targetSlot;
  } else {
    businessIndex = findTargetBusinessSlot(state, upgrade);
    if (businessIndex === -1) {
      throw new Error(`No eligible ${upgrade.targetBusiness} on the street to upgrade (requires level ${requiredLevel}).`);
    }
  }

  const business = state.streetGrid[businessIndex]!;
  state.resourceBank.coins -= upgrade.cost;
  state.hand.splice(handIndex, 1);

  business.level += 1;
  business.incomeBonus += upgrade.incomeBonus;
  business.synergyRangeBonus += upgrade.synergyRangeBonus;
  business.reputationBonus += upgrade.reputationBonus ?? 0;
  if (!business.appliedUpgrades) {
    business.appliedUpgrades = [];
  }
  business.appliedUpgrades.push(upgrade.id);
  (business as any).totalUpgradeCost = ((business as any).totalUpgradeCost ?? 0) + upgrade.cost;
  business.displayName = upgrade.newDisplayName || business.displayName;
  updateNeighborsOnPlacement(state, businessIndex);

  addLog(state, `Played upgrade ${upgrade.name} from hand onto ${business.name} (-€${upgrade.cost})`, 'loss');

  return { card: upgrade, cost: upgrade.cost, refilled: false };
}

/**
 * Plays an Investment-trigger event card from the player's hand, charging its
 * listed cost at play time and resolving its effects (CG-0MSTOATDT009BRX2
 * cost-at-play deferral).
 */
export function playEventFromHand(
  state: MainStreetState,
  handIndex: number,
): PurchaseResult {
  const card = validateHandIndex(state, handIndex);
  if (card.family !== 'event') {
    throw new Error(`Card at hand index ${handIndex} is not an event card.`);
  }
  const event = card as EventCard;
  if (event.trigger !== 'Investment') {
    throw new Error('Incident events cannot be played from hand.');
  }
  if (state.resourceBank.coins < event.cost) {
    throw new Error(`Not enough coins to play ${event.name} from hand. Need ${event.cost}, have ${state.resourceBank.coins}.`);
  }

  state.resourceBank.coins -= event.cost;
  resolveEvent(state, event);
  state.hand.splice(handIndex, 1);

  addLog(state, `Played event ${event.name} from hand (-€${event.cost})`, 'loss');

  return { card: event, cost: event.cost, refilled: false };
}

/**
 * Discards a card from the player's hand for free, any time during the
 * player's turn; the card goes to its corresponding discard pile
 * (CG-0MSTOATDT009BRX2).
 */
export function discardFromHand(state: MainStreetState, handIndex: number): void {
  const card = validateHandIndex(state, handIndex);
  state.hand.splice(handIndex, 1);
  if (card.family === 'business') {
    state.discards.business.push(card as BusinessCard);
  } else if (card.family === 'community-space') {
    state.discards.communitySpace.push(card as CommunitySpaceCard);
  } else if (card.family === 'upgrade') {
    state.discards.upgrade.push(card as UpgradeCard);
  } else if (card.family === 'event') {
    state.discards.event.push(card as EventCard);
  }
  addLog(state, `Discarded ${card.name} from hand (free)`, 'neutral');
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

  const marketIndex = state.market.cards.findIndex(
    c => c.id === cardId && c.family === 'upgrade',
  );
  const card = state.market.cards[marketIndex] as UpgradeCard;

  // Find the target business
  const requiredLevel = card.requiredLevel ?? 0;
  let businessIndex: number;
  if (targetSlot !== undefined) {
    const biz = state.streetGrid[targetSlot];
    if (
      !biz ||
      biz.name !== card.targetBusiness ||
      biz.level !== requiredLevel ||
      biz.level >= biz.maxLevel
    ) {
      throw new Error(`Business at slot ${targetSlot} is not a valid target for this upgrade.`);
    }
    businessIndex = targetSlot;
  } else {
    businessIndex = findTargetBusinessSlot(state, card);
  }

  const business = state.streetGrid[businessIndex]!;

  // Deduct cost
  state.resourceBank.coins -= card.cost;

  // Remove from market
  state.market.cards.splice(marketIndex, 1);

  // Apply upgrade to business
  business.level += 1;
  business.incomeBonus += card.incomeBonus;
  business.synergyRangeBonus += card.synergyRangeBonus;
  business.reputationBonus += card.reputationBonus ?? 0;
  if (!business.appliedUpgrades) {
    business.appliedUpgrades = [];
  }
  business.appliedUpgrades.push(card.id);
  (business as any).totalUpgradeCost = ((business as any).totalUpgradeCost ?? 0) + card.cost;
  business.displayName = card.newDisplayName || business.displayName;

  // Recalculate the upgraded card's cached values (incomeBonus and reputationBonus changed)
  // Import is at top of file via updateNeighborsOnPlacement/updateNeighborsOnSale
  // We use recalculateCard to update the upgraded card and all neighbors
  updateNeighborsOnPlacement(state, businessIndex);

  // Note: market is not refilled immediately. Replenishment occurs at start of next turn.
  const refilled = false;

  addLog(state, `Upgraded ${business.name} with ${card.name} (-€${card.cost})`, 'loss');

  return { card, cost: card.cost, refilled };
}

/**
 * Purchases an Investment-trigger Event card from the market and adds it to
 * the player's hand for the player to play later during the MarketPhase.
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

  const marketIndex = state.market.cards.findIndex(
    c => c.id === cardId && c.family === 'event',
  );
  const card = state.market.cards[marketIndex] as EventCard;

  // Deduct cost
  state.resourceBank.coins -= card.cost;

  // Remove from market
  state.market.cards.splice(marketIndex, 1);

  // Add the event to the shared hand (appended like any other card)
  state.hand.push(card);

  // Note: market is not refilled immediately. Replenishment occurs at start of next turn.
  const refilled = false;

  const costLabel = card.cost > 0 ? ` (-€${card.cost})` : '';
  addLog(state, `Bought event: ${card.name}${costLabel} (to hand)`, 'neutral');

  return { card, cost: card.cost, refilled };
}

/**
 * Returns the list of Business cards in the market that the player can
 * currently afford (has enough coins for).
 */
export function getAffordableBusinessCards(state: MainStreetState): (BusinessCard | CommunitySpaceCard)[] {
  return state.market.cards.filter(
    c => (c.family === 'business' || c.family === 'community-space') && c.cost <= state.resourceBank.coins,
  ) as (BusinessCard | CommunitySpaceCard)[];
}

/**
 * Returns the list of Upgrade cards in the market that the player can
 * currently afford and has a valid target for.
 */
export function getAffordableUpgradeCards(state: MainStreetState): UpgradeCard[] {
  return (state.market.cards.filter(c => c.family === 'upgrade') as UpgradeCard[]).filter(card => {
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

/**
 * Finds the first street grid slot containing a business that is a valid
 * target for `card` — i.e. the business name matches, the business level
 * equals the card's `requiredLevel` (defaulting to 0), and the business is
 * below its `maxLevel`.
 *
 * Used by both the market logic and the UI to locate the default target
 * slot without duplicating the matching conditions.
 *
 * @param state Current game state.
 * @param card  The UpgradeCard to match.
 * @returns The slot index of the first eligible business, or -1 if none.
 */
export function findTargetBusinessSlot(
  state: MainStreetState,
  card: UpgradeCard,
): number {
  const requiredLevel = card.requiredLevel ?? 0;
  return state.streetGrid.findIndex(
    b =>
      b !== null &&
      b.name === card.targetBusiness &&
      b.level === requiredLevel &&
      b.level < b.maxLevel,
  );
}

/**
 * Returns all upgrade cards currently in the market that are valid for
 * the business occupying `slotIndex` — i.e. cards whose `targetBusiness`
 * matches and whose `requiredLevel` equals the business's current level.
 *
 * The upgrade the player clicks is applied directly; this helper is
 * used for validation and display purposes.
 *
 * @param state     Current game state.
 * @param slotIndex Street grid slot index of the target business.
 * @returns Array of eligible UpgradeCards (may be empty or have multiple entries).
 */
export function getUpgradeBranchesForBusiness(
  state: MainStreetState,
  slotIndex: number,
): UpgradeCard[] {
  const business = state.streetGrid[slotIndex];
  if (!business) return [];
  if (business.level >= business.maxLevel) return [];

  return (state.market.cards.filter(c => c.family === 'upgrade') as UpgradeCard[]).filter(
    card =>
      card.targetBusiness === business.name &&
      (card.requiredLevel ?? 0) === business.level,
  );
}

// ── Staff Card Operations (Multi-Use Card Economy) ───────────

/**
 * Purchases a staff card from the staff card market.
 * Deducts coins, adds the staff card to active staffCards[],
 * and increases maxHandSize by the card's handSlotsAdded.
 *
 * @param state  Current game state (mutated in-place).
 * @param cardId ID of the staff card in the staff card market.
 * @throws Error if the card is not found or player cannot afford it.
 */
export function purchaseStaffCard(
  state: MainStreetState,
  cardId: string,
): void {
  const marketIndex = state.staffCardMarket.findIndex(c => c.id === cardId);
  if (marketIndex === -1) {
    throw new Error(`Staff card ${cardId} not found in the market.`);
  }

  const card = state.staffCardMarket[marketIndex];

  if (state.resourceBank.coins < card.cost) {
    throw new Error(`Not enough coins. Need ${card.cost}, have ${state.resourceBank.coins}.`);
  }

  // Deduct cost
  state.resourceBank.coins -= card.cost;

  // Remove from market
  state.staffCardMarket.splice(marketIndex, 1);

  // Add to active staff cards
  state.staffCards.push({ ...card });

  // Increase max hand size
  state.maxHandSize += card.handSlotsAdded;

  addLog(state, `Hired ${card.name} (+${card.handSlotsAdded} hand slots, -€${card.cost}, ongoing €${card.ongoingCost}/turn)`, 'loss');
}

// ── Sell Business (Street Grid) ──────────────────────────────

/** Result returned after selling a business from the street grid. */
export interface SellResult {
  /** The card that was sold. */
  card: BusinessCard | CommunitySpaceCard;
  /** Coins refunded to the player. */
  refund: number;
  /** The slot index of the sold card. */
  slotIndex: number;
}

/**
 * Sells a business or community-space card from the street grid.
 *
 * The card remains on the grid but is marked as sold (non-functional).
 * The player receives `Math.ceil((card.cost + totalUpgradeCost) / 2)` coins.
 * Upgrades are lost (included in the refund calculation but no longer provide benefits).
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
  if (slotIndex < 0 || slotIndex >= GRID_SIZE) {
    throw new Error(`Invalid slot index: ${slotIndex}. Must be 0-${GRID_SIZE - 1}.`);
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

  // Calculate refund: Math.ceil((purchasePrice + sumOfAllUpgradeCosts) / 2)
  const purchasePrice = card.cost;
  const upgradeCosts = (card as any).totalUpgradeCost ?? 0;
  const refund = Math.ceil((purchasePrice + upgradeCosts) / 2);

  // Credit coins
  state.resourceBank.coins += refund;

  // Mark slot as sold
  state.soldSlots[slotIndex] = true;

  // Incrementally update all affected neighbors' cached values (they lost synergy/same-type from this card)
  updateNeighborsOnSale(state, slotIndex);

  addLog(state, `Sold ${card.name} from slot ${slotIndex} for +${refund} coins (50% of €${purchasePrice + upgradeCosts})`, 'gain');

  return { card, refund, slotIndex };
}

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
  if (slotIndex < 0 || slotIndex >= GRID_SIZE) {
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
