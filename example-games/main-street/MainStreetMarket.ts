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
  INCIDENT_QUEUE_SIZE,
  MARKET_BUSINESS_SLOTS,
  MARKET_INVESTMENT_SLOTS,
  MARKET_INVESTMENT_UPGRADE_COUNT,
  MARKET_INVESTMENT_EVENT_COUNT,
  REFRESH_INVESTMENTS_COST,
} from './MainStreetCards';
import { shuffleArray } from '../../src/card-system';
import {
  createMarketOfferEngine,
  type MarketOfferEngine,
} from '../../src/card-system/MarketOfferEngine';

// Shared reshuffle helper: when a draw/refill needs cards and the deck is
// empty but the matching discard pile is non-empty, shuffle the discard
// into the deck using the game's seeded RNG and continue.
function reshuffleIfNeeded<T>(state: MainStreetState, deck: T[], discard: T[], name: string): void {
  if (deck.length === 0 && discard.length > 0) {
    // Shuffle the discard pile deterministically using the game's RNG
    shuffleArray(discard, state.rng);
    // Move all shuffled cards into the deck (draw from end = top)
    while (discard.length > 0) {
      deck.push(discard.pop()!);
    }
    // Log the reshuffle for visibility in tests and UI
    addLog(state, `Reshuffled ${name} discard into deck`, 'neutral');
  }
}

// ── Shared Market Engine Integration ──────────────────────

/**
 * Builds a MarketOfferEngine snapshot from the current Main Street state.
 * The engine provides row-based access to development and investments markets.
 */
function buildMarketEngine(state: MainStreetState): MarketOfferEngine<AnyCard> {
  return createMarketOfferEngine<AnyCard>([
    {
      id: 'development',
      slots: MARKET_BUSINESS_SLOTS,
      cards: state.market.development,
    },
    {
      id: 'investments',
      slots: MARKET_INVESTMENT_SLOTS,
      cards: state.market.investments,
    },
  ]);
}

/**
 * Syncs only the development row from the engine back to state.market.development.
 */
function syncDevelopmentFromEngine(
  state: MainStreetState,
  engine: MarketOfferEngine<AnyCard>,
): void {
  const devRow = engine.getRow('development');
  if (devRow) {
    state.market.development = [];
    for (const slot of devRow.slots) {
      if (slot.card !== null) {
        state.market.development.push(slot.card as BusinessCard | CommunitySpaceCard);
      }
    }
  }
}

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

/** Result returned after refreshing the investments row. */
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
  const card = state.market.development.find(c => c.id === cardId);
  if (!card) {
    return { legal: false, reason: 'Card not found in the development market.' };
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
 * Searches the mixed investments row for upgrade-family cards.
 * The upgrade's `requiredLevel` must be ≤ the target business's current `level`.
 *
 * @param state   Current game state.
 * @param cardId  ID of the Upgrade card in the investments row.
 * @returns LegalityResult indicating whether the action is permitted.
 */
export function canPurchaseUpgrade(
  state: MainStreetState,
  cardId: string,
): LegalityResult {
  // Find card in investments row (must be an upgrade)
  const card = state.market.investments.find(
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
  // Find card in investments row (must be an event)
  const card = state.market.investments.find(
    c => c.id === cardId && c.family === 'event',
  ) as EventCard | undefined;
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
 * Refills the mixed investments row to MARKET_INVESTMENT_SLOTS
 * (MARKET_INVESTMENT_UPGRADE_COUNT upgrades + MARKET_INVESTMENT_EVENT_COUNT
 * investment events). Upgrades are drawn from the upgrade deck; investment
 * events are found by searching the event deck for Investment-trigger cards.
 */
export function refillInvestmentsMarket(state: MainStreetState): void {
  const { market, decks } = state;

  // Count current upgrades and investment events in the row
  let upgradeCount = market.investments.filter(c => c.family === 'upgrade').length;
  let eventCount = market.investments.filter(c => c.family === 'event').length;

  // Ensure decks are replenished from their discards if empty
  reshuffleIfNeeded(state, decks.upgrade, state.discards.upgrade, 'upgrade');
  reshuffleIfNeeded(state, decks.event, state.discards.event, 'event');

  // Top up upgrades
  while (upgradeCount < MARKET_INVESTMENT_UPGRADE_COUNT && decks.upgrade.length > 0) {
    market.investments.push(decks.upgrade.pop()!);
    upgradeCount++;
  }

  // Top up investment events (only Investment-trigger cards)
  while (eventCount < MARKET_INVESTMENT_EVENT_COUNT) {
    let idx = decks.event.findIndex(e => e.trigger === 'Investment');
    if (idx === -1) {
      // Maybe the event deck was empty and discards can be reshuffled now
      reshuffleIfNeeded(state, decks.event, state.discards.event, 'event');
      idx = decks.event.findIndex(e => e.trigger === 'Investment');
      if (idx === -1) break;
    }
    market.investments.push(decks.event.splice(idx, 1)[0]);
    eventCount++;
  }
}

/**
 * Refills the development row from the combined business + community-space deck.
 */
export function refillDevelopmentMarket(state: MainStreetState): void {
  const { decks } = state;
  // If the development decks are exhausted but there are discarded cards,
  // reshuffle them back into their decks immediately so refill can proceed.
  reshuffleIfNeeded(state, decks.business, state.discards.business, 'business');
  reshuffleIfNeeded(state, decks.communitySpace, state.discards.communitySpace, 'community-space');

  // Build a combined deck from business and community space cards
  const combinedDeck: (BusinessCard | CommunitySpaceCard)[] = [];
  while (decks.business.length > 0) combinedDeck.push(decks.business.pop()!);
  while (decks.communitySpace.length > 0) combinedDeck.push(decks.communitySpace.pop()!);

  // Shuffle the combined deck
  shuffleArray(combinedDeck, state.rng);

  const engine = buildMarketEngine(state);
  engine.refillRow('development', combinedDeck);
  syncDevelopmentFromEngine(state, engine);

  // Return remaining cards to their respective decks
  // (combinedDeck was consumed by refillRow, any leftovers go back)
  for (const card of combinedDeck) {
    if (card.family === 'business') {
      decks.business.push(card as BusinessCard);
    } else if (card.family === 'community-space') {
      decks.communitySpace.push(card as CommunitySpaceCard);
    }
  }
}

/**
 * Checks whether the player can pay to refresh the investments row.
 */
export function canRefreshInvestments(state: MainStreetState): LegalityResult {
  if (state.phase !== 'MarketPhase') {
    return { legal: false, reason: 'Refresh investments is only allowed during MarketPhase.' };
  }
  if (state.resourceBank.coins < REFRESH_INVESTMENTS_COST) {
    return { legal: false, reason: `Not enough coins. Need ${REFRESH_INVESTMENTS_COST}, have ${state.resourceBank.coins}.` };
  }
  return { legal: true };
}

/**
 * Refreshes the investments row by charging the player, discarding the
 * currently-visible investment cards to their respective discard piles,
 * and drawing replacements using the same rules as refillInvestmentsMarket.
 */
export function refreshInvestments(state: MainStreetState): RefreshResult {
  const legality = canRefreshInvestments(state);
  if (!legality.legal) throw new Error(legality.reason);

  // Deduct cost
  state.resourceBank.coins -= REFRESH_INVESTMENTS_COST;

  // Move visible investment cards to discard piles
  const removed: AnyCard[] = state.market.investments.slice();
  for (const c of removed) {
    if (c.family === 'upgrade') {
      state.discards.upgrade.push(c as any);
    } else if (c.family === 'event') {
      state.discards.event.push(c as any);
    }
  }

  // Clear the visible investments row and draw replacements
  state.market.investments.length = 0;
  refillInvestmentsMarket(state);

  // Build a detailed replacement summary for the activity log
  const replacedStrings = removed.map(c => {
    const name = (c as any).name ?? c.id;
    return `${c.id}${name ? ` (${name})` : ''}`;
  });
  addLog(state, `Refreshed investments (-$${REFRESH_INVESTMENTS_COST}): replaced ${replacedStrings.join(', ')}`, 'loss');

  return { replaced: removed, cost: REFRESH_INVESTMENTS_COST };
}

/**
 * Refills all market rows to their maximum slot counts.
 */
export function refillAllMarkets(state: MainStreetState): void {
  refillDevelopmentMarket(state);
  refillInvestmentsMarket(state);
}

/**
 * Tops up the incident queue to INCIDENT_QUEUE_SIZE by drawing
 * Incident-trigger cards from the event deck. If the deck has no
 * remaining Incident cards, the queue stays at its current size.
 */
export function refillIncidentQueue(state: MainStreetState): void {
  // If the event deck is empty but incident discards exist, reshuffle them.
  reshuffleIfNeeded(state, state.decks.event, state.discards.event, 'event');

  while (state.incidentQueue.length < INCIDENT_QUEUE_SIZE) {
    let idx = state.decks.event.findIndex(e => e.trigger === 'Incident');
    if (idx === -1) {
      // Attempt a reshuffle in case the deck was empty earlier
      reshuffleIfNeeded(state, state.decks.event, state.discards.event, 'event');
      idx = state.decks.event.findIndex(e => e.trigger === 'Incident');
      if (idx === -1) break;
    }
    state.incidentQueue.push(state.decks.event.splice(idx, 1)[0]);
  }
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

  const marketIndex = state.market.development.findIndex(c => c.id === cardId);
  const card = state.market.development[marketIndex];

  // Deduct cost
  state.resourceBank.coins -= card.cost;

  // Remove from market
  state.market.development.splice(marketIndex, 1);

  // Place on grid (card may be BusinessCard or CommunitySpaceCard; both have same grid mechanics)
  state.streetGrid[slotIndex] = card as BusinessCard;

  // Note: market is not refilled immediately. Replenishment occurs at start of next turn.
  const refilled = false;

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

  const marketIndex = state.market.investments.findIndex(
    c => c.id === cardId && c.family === 'upgrade',
  );
  const card = state.market.investments[marketIndex] as UpgradeCard;

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
  state.market.investments.splice(marketIndex, 1);

  // Apply upgrade to business
  business.level += 1;
  business.incomeBonus += card.incomeBonus;
  business.synergyRangeBonus += card.synergyRangeBonus;
  if (!business.appliedUpgrades) {
    business.appliedUpgrades = [];
  }
  business.appliedUpgrades.push(card.id);

  // Note: market is not refilled immediately. Replenishment occurs at start of next turn.
  const refilled = false;

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

  const marketIndex = state.market.investments.findIndex(
    c => c.id === cardId && c.family === 'event',
  );
  const card = state.market.investments[marketIndex] as EventCard;

  // Deduct cost
  state.resourceBank.coins -= card.cost;

  // Remove from market
  state.market.investments.splice(marketIndex, 1);

  // Hold the Investment event (max 1)
  state.heldEvent = card;

  // Note: market is not refilled immediately. Replenishment occurs at start of next turn.
  const refilled = false;

  const costLabel = card.cost > 0 ? ` (-$${card.cost})` : '';
  addLog(state, `Bought event: ${card.name}${costLabel} (held)`, 'neutral');

  return { card, cost: card.cost, refilled };
}

/**
 * Returns the list of Business cards in the market that the player can
 * currently afford (has enough coins for).
 */
export function getAffordableBusinessCards(state: MainStreetState): (BusinessCard | CommunitySpaceCard)[] {
  return state.market.development.filter(c => c.cost <= state.resourceBank.coins);
}

/**
 * Returns the list of Upgrade cards in the market that the player can
 * currently afford and has a valid target for.
 */
export function getAffordableUpgradeCards(state: MainStreetState): UpgradeCard[] {
  return (state.market.investments.filter(c => c.family === 'upgrade') as UpgradeCard[]).filter(card => {
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
 * This is the set of upgrade *branches* the player can choose from for
 * that business. When the set has more than one entry the UI should
 * present an upgrade-choice modal so the player can pick a branch.
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

  return (state.market.investments.filter(c => c.family === 'upgrade') as UpgradeCard[]).filter(
    card =>
      card.targetBusiness === business.name &&
      (card.requiredLevel ?? 0) === business.level,
  );
}
