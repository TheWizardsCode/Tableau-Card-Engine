/**
 * Main Street: Purchases
 *
 * Purchase legality and execution for business/upgrade/event/staff cards,
 * buy-and-place, and playing upgrades/events from hand.
 *
 * Import graph: depends on `MainStreetMarketTypes`,
 * `MainStreetMarketUtils`, and `MainStreetMarketHand`.
 *
 * @module
 */

import type { LegalityResult } from '@rule-engine';
import type { MainStreetState } from './MainStreetState';
import { addLog, describeEventEffects, classifyEffect } from './MainStreetState';
import type { BusinessCard, UpgradeCard, EventCard } from './MainStreetCards';
import { updateNeighborsOnPlacement, tagSlotOwnerIfCompetitive } from './MainStreetAdjacency';
import { resolveEvent } from './MainStreetEngine';
import type { PurchaseResult } from './MainStreetMarketTypes';
import { findTargetBusinessSlot } from './MainStreetMarketUtils';
import { canAddToHand, validateHandIndex } from './MainStreetMarketHand';

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

  // Only business/community-space cards occupy street-grid slots. Staff are
  // hired via the 'hire-staff' action (CG-0MT4WXNR80090FXZ grew the staff
  // pool, so a bare cost check no longer keeps staff out of this action).
  if (card.family !== 'business' && card.family !== 'community-space') {
    return {
      legal: false,
      reason: `${card.name} cannot be placed on the street. Only business and community-space cards can be bought here.`,
    };
  }

  // Check coins
  if (state.resourceBank.coins < card.cost) {
    return { legal: false, reason: `Not enough coins. Need ${card.cost}, have ${state.resourceBank.coins}.` };
  }

  // Validate slot index
  if (slotIndex < 0 || slotIndex >= state.streetGrid.length) {
    return { legal: false, reason: `Invalid slot index: ${slotIndex}. Must be 0-${state.streetGrid.length - 1}.` };
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
 * Budget-independent event acquisition legality: card exists, is an
 * Investment-trigger event, and the hand has room. Shared by
 * `canPurchaseEvent` (player-facing eligibility, action-aware) and
 * `purchaseEvent` (engine helper, invoked *after* `consumeAction` has
 * already charged the action — so it must not re-check the budget).
 */
function canTakeEventToHand(
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

  // Only Investment-trigger events can be taken
  if (card.trigger !== 'Investment') {
    return { legal: false, reason: 'Incident events cannot be purchased; they are drawn automatically.' };
  }

  // Hand capacity is the only card-level limit — no separate "max 1 held
  // Investment" rule.
  return canAddToHand(state);
}

/**
 * Checks whether the player can take an Event card from the market into their
 * hand.
 *
 * Taking an Investment event costs one daily action (CG-0MTFWBNL30043ZBM),
 * matching the business-card move-to-hand economy: it is held in the
 * player's hand (any mix of business and event cards, up to `maxHandSize`
 * total) and its listed cost is paid only when the event is played from
 * hand during the MarketPhase — the move itself costs no coins. Incident
 * events are drawn automatically (not taken by hand).
 *
 * This is the player-facing (controller/AI) predicate and therefore includes
 * the action-budget gate. The engine execution path charges the action via
 * `consumeAction` and then calls `purchaseEvent`, which uses the
 * budget-independent `canTakeEventToHand` instead.
 *
 * @param state   Current game state.
 * @param cardId  ID of the Event card in the market.
 * @returns LegalityResult indicating whether the action is permitted.
 */
export function canPurchaseEvent(
  state: MainStreetState,
  cardId: string,
): LegalityResult {
  const base = canTakeEventToHand(state, cardId);
  if (!base.legal) {
    return base;
  }

  // One daily action, exactly like a business move-to-hand
  // (CG-0MTFWBNL30043ZBM). No coin check: the cost is paid when the event is
  // executed from hand (CG-0MT5W1V4D007NN8Q).
  if ((state.actionsRemaining ?? 0) <= 0) {
    return { legal: false, reason: 'No actions remaining this week. End your turn to start next week.' };
  }

  return { legal: true };
}

/**
 * Whether the Investment event at handIndex can be played this turn.
 * Same-week composite (CG-0MTFWBNL30043ZBM): playing the event just moved
 * to hand this week (justMovedEventCardId) is free; otherwise costs 1 action.
 */
export function canPlayEvent(
  state: MainStreetState,
  handIndex: number,
): LegalityResult {
  const hand = state.hand ?? [];
  if (handIndex < 0 || handIndex >= hand.length) {
    return { legal: false, reason: `Invalid hand index: ${handIndex}.` };
  }
  const card = hand[handIndex] as any;
  if (!card || card.family !== 'event') {
    return { legal: false, reason: `Card at hand index ${handIndex} is not an Investment event.` };
  }
  if ((card as any).trigger !== 'Investment') {
    return { legal: false, reason: 'Incident events cannot be played from hand.' };
  }
  const isSameWeek = (state as any).justMovedEventCardId != null && (state as any).justMovedEventCardId === card.id;
  if (!isSameWeek && (state.actionsRemaining ?? 0) <= 0) {
    return { legal: false, reason: 'No actions remaining this week. End your turn to start next week.' };
  }
  if (state.resourceBank.coins < card.cost) {
    return { legal: false, reason: `Not enough coins to play ${card.name} from hand. Need ${card.cost}, have ${state.resourceBank.coins}.` };
  }
  // ── Grand Opening placement gate (CG-0MTIOCBH400970OB) ──
  // Grand Opening Sale can only be played from hand during a turn where a
  // business was placed onto the street grid. The gate arms when any
  // placement path succeeds (purchaseBusiness / playBusinessFromHand /
  // buyAndPlaceBusiness) and resets at WeekStart.
  if (String((card as any).id).startsWith('evt-grand-opening') && !(state as any).businessPlacedThisTurn) {
    return { legal: false, reason: `Grand Opening Sale can only be played on a turn where a business was placed on the street grid.` };
  }
  return { legal: true };
}

// ── Market Refill ───────────────────────────────────────────

/**
 * Refills all empty slots in the business market from the business deck.
 * Called after initial setup or if the market is partially empty.
 */

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
  // Record ownership on the owner-tagged grid (competitive; no-op single-player).
  tagSlotOwnerIfCompetitive(state, slotIndex);

  // Arm Grand Opening placement gate (CG-0MTIOCBH400970OB).
  (state as any).businessPlacedThisTurn = true;

  // Note: market is not refilled immediately. Replenishment occurs at start of next turn.
  const refilled = false;

  addLog(state, `Placed ${card.name} in slot ${slotIndex} (-€${card.cost}, ${describeEventEffects(-card.cost, 0)})`, classifyEffect(-card.cost, 0));

  return { card, cost: card.cost, refilled };
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

  addLog(state, `Played upgrade ${upgrade.name} from hand onto ${business.name} (-€${upgrade.cost}, ${describeEventEffects(-upgrade.cost, 0)})`, classifyEffect(-upgrade.cost, 0));

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
  if (String((event as any).id).startsWith('evt-grand-opening') && !(state as any).businessPlacedThisTurn) {
    throw new Error('Grand Opening Sale can only be played on a turn where a business was placed on the street grid.');
  }
  if (state.resourceBank.coins < event.cost) {
    throw new Error(`Not enough coins to play ${event.name} from hand. Need ${event.cost}, have ${state.resourceBank.coins}.`);
  }

  // Capture pre-action resources so the log can show the event's effective
  // deltas (cost + resolved effects, all mitigations applied — AC2,
  // CG-0MT5W7UJJ0065MEZ).
  const coinsBefore = state.resourceBank.coins;
  const repBefore = state.resourceBank.reputation;

  state.resourceBank.coins -= event.cost;
  resolveEvent(state, event);
  state.hand.splice(handIndex, 1);
  if ((state as any).justMovedEventCardId === event.id) {
    (state as any).justMovedEventCardId = null;
  }

  const coinDelta = state.resourceBank.coins - coinsBefore;
  const repDelta = state.resourceBank.reputation - repBefore;
  addLog(
    state,
    `Played event ${event.name} from hand (-€${event.cost}, ${describeEventEffects(coinDelta, repDelta)})`,
    classifyEffect(coinDelta, repDelta),
  );

  return { card: event, cost: event.cost, refilled: false };
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

  addLog(state, `Upgraded ${business.name} with ${card.name} (-€${card.cost}, ${describeEventEffects(-card.cost, 0)})`, classifyEffect(-card.cost, 0));

  return { card, cost: card.cost, refilled };
}

/**
 * Whether the upgrade at `cardId` can be bought and applied to the business
 * occupying `targetSlot` in one drag-drop gesture (CG-0MT3IYSRL001VVUP).
 *
 * This is the slot-specific legality gate for the drag-drop path: unlike
 * {@link canPurchaseUpgrade} (which only requires *some* eligible business
 * on the street), the drop must land on a business that matches the
 * upgrade's `targetBusiness` at exactly its `requiredLevel` and is still
 * below `maxLevel`. Affordability is checked against the +50% premium — the
 * price the drag-drop actually charges, not the listed cost.
 *
 * @param state      Current game state (read-only).
 * @param cardId     ID of the Upgrade card in the market.
 * @param targetSlot Street grid slot the card was dropped on.
 * @param priceOverride Optional price replacing the +50% premium (GC parity
 *                      paths charge the listed cost instead).
 * @returns LegalityResult indicating whether the drop may be applied.
 */
export function canBuyAndPlaceUpgrade(
  state: MainStreetState,
  cardId: string,
  targetSlot: number,
  priceOverride?: number,
): LegalityResult {
  const card = state.market.cards.find(
    c => c.id === cardId && c.family === 'upgrade',
  ) as UpgradeCard | undefined;
  if (!card) {
    return { legal: false, reason: 'Card not found in the upgrade market.' };
  }

  if (targetSlot < 0 || targetSlot >= state.streetGrid.length) {
    return { legal: false, reason: `Invalid slot index: ${targetSlot}.` };
  }

  const biz = state.streetGrid[targetSlot];
  const requiredLevel = card.requiredLevel ?? 0;
  if (
    !biz ||
    biz.name !== card.targetBusiness ||
    biz.level !== requiredLevel ||
    biz.level >= biz.maxLevel
  ) {
    return {
      legal: false,
      reason: `Business at slot ${targetSlot} is not a valid target for this upgrade.`,
    };
  }

  const premiumCost = Math.ceil(card.cost * 1.5 * 2) / 2;
  const price = priceOverride ?? premiumCost;
  if (state.resourceBank.coins < price) {
    return {
      legal: false,
      reason: `Not enough coins to buy-and-place ${card.name}${priceOverride !== undefined ? '' : ' at premium'}. Need ${price}, have ${state.resourceBank.coins}.`,
    };
  }

  return { legal: true };
}

/**
 * Buys an upgrade from the market and applies it in one step (drag-drop
 * path, CG-0MT3IYSRL001VVUP). Charges a +50% premium on the upgrade's
 * cost.
 *
 * @param state      Current game state (mutated in-place).
 * @param cardId     ID of the Upgrade card in the market.
 * @param targetSlot Optional: specific grid slot of the business to upgrade.
 * @returns PurchaseResult on success.
 * @throws Error if the action is illegal or coins are insufficient.
 */
export function buyAndPlaceUpgrade(
  state: MainStreetState,
  cardId: string,
  targetSlot?: number,
  priceOverride?: number,
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
  let businessIndex: number;
  if (targetSlot !== undefined) {
    // Slot-specific legality goes through the shared helper so the drag-drop
    // gate and the execution path can never diverge (target match, level,
    // max-level and premium affordability in one place).
    const targetLegality = canBuyAndPlaceUpgrade(state, cardId, targetSlot, priceOverride);
    if (!targetLegality.legal) {
      throw new Error(targetLegality.reason);
    }
    businessIndex = targetSlot;
  } else {
    businessIndex = findTargetBusinessSlot(state, card);
  }

  const business = state.streetGrid[businessIndex]!;

  // +50% premium — identical formula to business buy-and-place
  // (`Math.ceil(cost * 1.5 * 2) / 2`, see buyAndPlaceBusiness), so an upgrade
  // drag-drop is never priced differently from a business drag-drop.
  const premiumCost = Math.ceil(card.cost * 1.5 * 2) / 2;
  const price = priceOverride ?? premiumCost;
  if (state.resourceBank.coins < price) {
    throw new Error(`Not enough coins to buy-and-place ${card.name}${priceOverride !== undefined ? '' : ' at premium'}. Need ${price}, have ${state.resourceBank.coins}.`);
  }

  state.resourceBank.coins -= price;

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

  // Recalculate the upgraded card's cached values
  updateNeighborsOnPlacement(state, businessIndex);

  // Clear same-week composite tracker — drag-drop is not a composite path.
  state.justMovedUpgradeCardId = null;

  const refilled = false;

  addLog(
    state,
    `Bought and placed upgrade ${card.name} on ${business.name} (-€${price}, ${price === premiumCost ? '50% premium' : 'listed'}, ${describeEventEffects(-price, 0)})`,
    classifyEffect(-price, 0),
  );

  return { card, cost: price, refilled };
}

/**
 * Takes an Investment-trigger Event card from the market into the player's
 * hand (cost is paid at play time). The move itself costs one daily action
 * (CG-0MTFWBNL30043ZBM) and no coins. The player may execute it later
 * during the MarketPhase via `playEventFromHand` (which charges the event's
 * listed cost when it is played); a same-week move+play composite costs a
 * single action in total (`justMovedEventCardId`).
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
  // The caller (`executeAction` 'buy-event' / `moveEventToHandCommand`) has
  // already charged the daily action via `consumeAction`, so validate only
  // the budget-independent preconditions here (CG-0MTFWBNL30043ZBM).
  const legality = canTakeEventToHand(state, cardId);
  if (!legality.legal) {
    throw new Error(legality.reason);
  }

  const marketIndex = state.market.cards.findIndex(
    c => c.id === cardId && c.family === 'event',
  );
  const card = state.market.cards[marketIndex] as EventCard;

  // Action-only acquisition: the daily action is charged by the caller
  // (executeAction 'buy-event' / moveEventToHandCommand), and NO coins are
  // deducted here (CG-0MT5W1V4D007NN8Q). The event's listed cost is paid
  // only when it is executed from hand via `playEventFromHand`.

  // Remove from market
  state.market.cards.splice(marketIndex, 1);

  // Add the event to the shared hand (appended like any other card)
  state.hand.push(card);

  // Note: market is not refilled immediately. Replenishment occurs at start of next turn.
  const refilled = false;

  (state as any).justMovedEventCardId = card.id;

  addLog(state, `Moved event ${card.name} to hand (1 action, pay on play)`, 'neutral');

  return { card, cost: 0, refilled };
}

/**
 * Legality check for hiring a staff card from the general market row
 * (CG-0MT3KZOBZ005IRYE). Staff cards are hired directly from the row;
 * they are never moved to the hand.
 *
 * @param state  Current game state (read-only).
 * @param cardId ID of the staff card in the market row.
 * @returns LegalityResult indicating whether the hire is permitted.
 */
export function canPurchaseStaff(state: MainStreetState, cardId: string): LegalityResult {
  const card = state.market.cards.find(c => c.id === cardId);
  if (!card || card.family !== 'staff') {
    return { legal: false, reason: `Staff card ${cardId} not found in the market row.` };
  }
  if (state.resourceBank.coins < card.cost) {
    return { legal: false, reason: `Not enough coins. Need ${card.cost}, have ${state.resourceBank.coins}.` };
  }
  return { legal: true };
}

/**
 * Purchases a staff card from the general market row.
 * Deducts coins, adds the staff card to active staffCards[],
 * and increases maxHandSize by the card's handSlotsAdded.
 *
 * @param state  Current game state (mutated in-place).
 * @param cardId ID of the staff card in the market row.
 * @throws Error if the card is not found (or not a staff card) or the player cannot afford it.
 */
export function purchaseStaffCard(
  state: MainStreetState,
  cardId: string,
): void {
  // Staff cards are part of the general market row (CG-0MT3KZNQB0053K55);
  // resolve strictly against the row — an un-drawn staff card in the deck
  // is not purchasable.
  const marketIndex = state.market.cards.findIndex(c => c.id === cardId);
  const card = marketIndex !== -1 ? state.market.cards[marketIndex] : undefined;
  if (!card || card.family !== 'staff') {
    throw new Error(`Staff card ${cardId} not found in the market row.`);
  }

  if (state.resourceBank.coins < card.cost) {
    throw new Error(`Not enough coins. Need ${card.cost}, have ${state.resourceBank.coins}.`);
  }

  // Deduct cost
  state.resourceBank.coins -= card.cost;

  // Remove from market
  state.market.cards.splice(marketIndex, 1);

  // Add to active staff cards
  state.staffCards.push({ ...card });

  // Increase max hand size
  state.maxHandSize += card.handSlotsAdded;

  addLog(state, `Hired ${card.name} (+${card.handSlotsAdded} hand slots, -€${card.cost}, ongoing €${card.ongoingCost}/turn) (${describeEventEffects(-card.cost, 0)})`, classifyEffect(-card.cost, 0));
}

// ── Sell Business (Street Grid) ──────────────────────────────

/** Breakdown of a sell refund into its component parts. */

