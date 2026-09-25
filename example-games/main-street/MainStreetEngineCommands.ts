/**
 * Main Street: Command Implementations
 *
 * Card placement/sale commands and their legality checks, ongoing-cost
 * application, and staff employment/applicant commands.
 *
 * @module
 */

import { updateNeighborsOnPlacement, updateNeighborsOnSale, tagSlotOwnerIfCompetitive, getSlotOwnerId } from './MainStreetAdjacency';
import type { BusinessCard, CommunitySpaceCard, StaffCard } from './MainStreetCards';
import { SELL_VALUE_RATIO, staffMatchesBusiness } from './MainStreetCards';
import { roundInt } from './MainStreetDifficulty';
import { sellBusiness, purchaseStaffCard, canSellBusiness as canSellBusinessFromMarket } from './MainStreetMarket';
import type { PurchaseResult } from './MainStreetMarket';
import { computeStaffSalaryCost, computeStreetOngoingCostReductionPct, getEmployedSpecializationSkills } from './MainStreetStaffBuffs';
import { deserializeSkillIds, assignSkillsToApplicant, serializeSkillIds } from './MainStreetStaffSkills';
import type { MainStreetState } from './MainStreetState';
import { addLog, describeEventEffects, classifyEffect } from './MainStreetState';

/**
 * Places a card from the player's hand onto an empty tableau slot.
 * Costs 80% of the card's purchase price.
 *
 * @param state       Current game state (mutated in-place).
 * @param handIndex   Index of the card in state.hand to place.
 * @param slotIndex   Target street grid slot (0-based, must be empty).
 * @param premiumCost Optional premium price to charge instead of the listed
 *                    `card.cost` (same-week composite buy-and-play when no
 *                    action is available — CG-0MT24X0SX007RLHN). When absent,
 *                    the listed cost is charged (held-card / plan-ahead path).
 * @throws Error if the hand index is invalid, slot is occupied, or coins insufficient.
 */
export function placeFromHand(
  state: MainStreetState,
  handIndex: number,
  slotIndex: number,
  premiumCost?: number,
): void {
  const hand = state.hand ?? [];

  // Validate hand index
  if (handIndex < 0 || handIndex >= hand.length) {
    throw new Error(`Invalid hand index: ${handIndex}. Hand has ${hand.length} cards.`);
  }

  const card = hand[handIndex];

  // Event and upgrade cards are played from the hand, never placed on the street.
  if (card.family === 'event' || card.family === 'upgrade') {
    throw new Error(`Event and upgrade cards cannot be placed on the street. Play ${card.name} from the hand instead.`);
  }

  // Validate slot index
  if (slotIndex < 0 || slotIndex >= 10) {
    throw new Error(`Invalid slot index: ${slotIndex}. Must be 0-9.`);
  }

  // Check slot is empty
  if (state.streetGrid[slotIndex] !== null) {
    throw new Error(`Slot ${slotIndex} is already occupied.`);
  }

  // Cost-at-play (CG-0MSTOATDT009BRX2): moving a card to hand is free, but
  // placing it on the street pays its listed cost (or the optional premium
  // price for same-week composite buy-and-play when no action is available,
  // CG-0MSTOF1N5005PK2R / CG-0MT24X0SX007RLHN).
  const price = premiumCost ?? card.cost;
  if (state.resourceBank.coins < price) {
    throw new Error(`Not enough coins to place ${card.name}. Need ${price}, have ${state.resourceBank.coins}.`);
  }
  state.resourceBank.coins -= price;

  // Remove from hand and place on tableau
  hand.splice(handIndex, 1);
  state.streetGrid[slotIndex] = card;

  // Incrementally update the new card's and all affected neighbors' cached values
  updateNeighborsOnPlacement(state, slotIndex);
  // Record ownership on the owner-tagged grid (competitive; no-op single-player).
  tagSlotOwnerIfCompetitive(state, slotIndex);

  addLog(
    state,
    premiumCost !== undefined
      ? `Placed ${card.name} from hand in slot ${slotIndex} (-€${price}, 50% premium, ${describeEventEffects(-price, 0)})`
      : `Placed ${card.name} from hand in slot ${slotIndex} (-€${price}, ${describeEventEffects(-price, 0)})`,
    classifyEffect(-price, 0),
  );
}

/**
 * Sells a card from the player's hand for 75% of purchase value.
 * The card goes to the discard pile.
 *
 * @param state      Current game state (mutated in-place).
 * @param handIndex  Index of the card in state.hand to sell.
 * @throws Error if the hand index is invalid.
 */
export function sellFromHand(
  state: MainStreetState,
  handIndex: number,
): void {
  const hand = state.hand ?? [];

  // Validate hand index
  if (handIndex < 0 || handIndex >= hand.length) {
    throw new Error(`Invalid hand index: ${handIndex}. Hand has ${hand.length} cards.`);
  }

  const card = hand[handIndex];

  // Event cards are played from the hand, never sold.
  if (card.family === 'event') {
    throw new Error(`Event cards cannot be sold. Play ${card.name} from the hand instead.`);
  }

  // Calculate sell value (75% of purchase price)
  const sellValue = Math.floor(card.cost * SELL_VALUE_RATIO);

  // Remove from hand
  hand.splice(handIndex, 1);

  // Credit coins
  state.resourceBank.coins += sellValue;

  // Add to discard pile
  state.discardPile.push(card as any);

  addLog(state, `Sold ${card.name} from hand for +${sellValue} coins (${describeEventEffects(sellValue, 0)})`, classifyEffect(sellValue, 0));
}

/**
 * Sells a card from the tableau for 75% of purchase value.
 * The card goes to the discard pile and the slot becomes empty.
 *
 * @param state      Current game state (mutated in-place).
 * @param slotIndex  Street grid slot index of the card to sell.
 * @throws Error if the slot is empty or index is invalid.
 */
export function sellFromTableau(
  state: MainStreetState,
  slotIndex: number,
): void {
  // Validate slot index
  if (slotIndex < 0 || slotIndex >= 10) {
    throw new Error(`Invalid slot index: ${slotIndex}. Must be 0-9.`);
  }

  const card = state.streetGrid[slotIndex];

  // Check slot is occupied
  if (card === null) {
    throw new Error(`Slot ${slotIndex} is empty. Nothing to sell.`);
  }

  // Calculate sell value (75% of purchase price)
  const sellValue = Math.floor(card.cost * SELL_VALUE_RATIO);

  // Incrementally update affected neighbors' cached values before removing the card
  // We pass the slot index and sold slot is simulated for the recalculation
  state.soldSlots[slotIndex] = true;
  updateNeighborsOnSale(state, slotIndex);

  // Remove from tableau
  state.streetGrid[slotIndex] = null;
  state.soldSlots[slotIndex] = false;

  // Credit coins
  state.resourceBank.coins += sellValue;

  // Add to discard pile
  state.discardPile.push(card as any);

  addLog(state, `Sold ${card.name} from slot ${slotIndex} for +${sellValue} coins (${describeEventEffects(sellValue, 0)})`, classifyEffect(sellValue, 0));
}

/**
 * Checks whether the card at the given hand index can be placed onto the
 * given tableau slot without mutating state.
 *
 * Validates hand bounds, slot bounds, slot occupancy, and coin sufficiency
 * (a card can only be placed if the player can afford its purchase price —
 * or the optional premium price for same-week composite buy-and-play).
 *
 * @param state      Current game state (read-only).
 * @param handIndex  Index of the card in state.hand to place.
 * @param slotIndex  Target street grid slot (0-based, must be empty).
 * @param premiumCost Optional premium price to check affordability against
 *                    instead of the listed `card.cost` (same-week composite
 *                    premium path — CG-0MT24X0SX007RLHN).
 * @returns LegalityResult — `{ legal: true }` if valid, otherwise
 *          `{ legal: false, reason }` describing the violation.
 */
export function canPlaceFromHand(
  state: MainStreetState,
  handIndex: number,
  slotIndex: number,
  premiumCost?: number,
): import('@rule-engine').LegalityResult {
  const hand = state.hand ?? [];

  // Validate hand index
  if (handIndex < 0 || handIndex >= hand.length) {
    return { legal: false, reason: `Invalid hand index: ${handIndex}. Hand has ${hand.length} cards.` };
  }

  const card = hand[handIndex];

  // Event cards are played from the hand, never placed on the street.
  if (card.family === 'event') {
    return { legal: false, reason: `Event cards cannot be placed on the street. Play ${card.name} from the hand instead.` };
  }

  // Validate slot index
  if (slotIndex < 0 || slotIndex >= 10) {
    return { legal: false, reason: `Invalid slot index: ${slotIndex}. Must be 0-9.` };
  }

  // Check slot is empty
  if (state.streetGrid[slotIndex] !== null) {
    return { legal: false, reason: `Slot ${slotIndex} is already occupied.` };
  }

  // Check coin sufficiency against the applicable price (listed or premium)
  const price = premiumCost ?? card.cost;
  if (state.resourceBank.coins < price) {
    return { legal: false, reason: `Insufficient coins to place ${card.name}: need ${price}, have ${state.resourceBank.coins}.` };
  }

  return { legal: true };
}

/**
 * Checks whether the card at the given hand index can be sold from hand
 * without mutating state.
 *
 * Validates hand bounds.
 *
 * @param state      Current game state (read-only).
 * @param handIndex  Index of the card in state.hand to sell.
 * @returns LegalityResult — `{ legal: true }` if valid, otherwise
 *          `{ legal: false, reason }` describing the violation.
 */
export function canSellFromHand(
  state: MainStreetState,
  handIndex: number,
): import('@rule-engine').LegalityResult {
  const hand = state.hand ?? [];

  // Validate hand index
  if (handIndex < 0 || handIndex >= hand.length) {
    return { legal: false, reason: `Invalid hand index: ${handIndex}. Hand has ${hand.length} cards.` };
  }

  const card = hand[handIndex];

  // Event cards are played from the hand, never sold.
  if (card.family === 'event') {
    return { legal: false, reason: `Event cards cannot be sold. Play ${card.name} from the hand instead.` };
  }

  return { legal: true };
}

/**
 * Checks whether the card at the given tableau slot can be sold without
 * mutating state.
 *
 * Validates slot bounds and slot occupancy.
 *
 * @param state      Current game state (read-only).
 * @param slotIndex  Street grid slot index of the card to sell.
 * @returns LegalityResult — `{ legal: true }` if valid, otherwise
 *          `{ legal: false, reason }` describing the violation.
 */
export function canSellFromTableau(
  state: MainStreetState,
  slotIndex: number,
): import('@rule-engine').LegalityResult {
  // Validate slot index
  if (slotIndex < 0 || slotIndex >= 10) {
    return { legal: false, reason: `Invalid slot index: ${slotIndex}. Must be 0-9.` };
  }

  // Check slot is occupied
  if (state.streetGrid[slotIndex] === null) {
    return { legal: false, reason: `Slot ${slotIndex} is empty. Nothing to sell.` };
  }

  return { legal: true };
}

/**
 * Executes a sell of a business/community-space card from the street grid.
 *
 * The card remains on the grid but is marked as sold: it no longer produces
 * income or reputation for itself, but still provides synergy to its
 * neighbours (it stays a synergy anchor — CG-0MT5XUE2200047IJ). The player
 * receives `Math.ceil((card.cost + totalUpgradeCost) / 2)` coins.
 *
 * @param state     Current game state (mutated in-place).
 * @param slotIndex Street grid slot index of the card to sell.
 * @throws Error if the slot is empty, already sold, or not in MarketPhase.
 */
export function executeSell(
  state: MainStreetState,
  slotIndex: number,
): void {
  if (state.phase !== 'MarketPhase') {
    throw new Error(`Cannot sell during ${state.phase}. Must be in MarketPhase.`);
  }
  sellBusiness(state, slotIndex);
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
): import('@rule-engine').LegalityResult {
  return canSellBusinessFromMarket(state, slotIndex, isPlacingMode);
}

/**
 * Applies staff card ongoing costs for the current turn.
 * Deducts each active staff card's ongoingCost from coins.
 * If coins are insufficient, deducts what's available (down to 0).
 *
 * Deferred-mutation support (CG-0MTR72P14000VO6Q): when `opts.apply === false`
 * the deduction is computed but NOT applied — the caller applies it after the
 * end-of-turn animations complete. Returns the computed coin delta (negative
 * deduction). The headless/AI path keeps the legacy immediate-apply behaviour.
 *
 * @param state  Current game state (mutated in-place unless deferred).
 * @param opts   Optional deferred-mutation flag.
 * @returns The coin delta applied (or to be applied): 0 or negative.
 */
export function applyStaffOngoingCosts(state: MainStreetState, opts?: { apply?: boolean }): number {
  const staffCards = state.staffCards ?? [];
  if (staffCards.length === 0) return 0;

  const employed = getEmployedSpecializationSkills(state);
  // Cost Cutter: -15% street-wide ongoing costs (AC7 flagged for extra
  // balance testing). Applied to every ongoing deduction family uniformly.
  const streetReduction = computeStreetOngoingCostReductionPct(employed);

  let totalCost = 0;
  for (const card of staffCards) {
    // Operations Manager: -50 of THIS member's own salary (computeStaffSalaryCost).
    const memberSkills = Array.isArray(card.specializationSkillIds) ? deserializeSkillIds(card.specializationSkillIds) : [];
    totalCost += computeStaffSalaryCost(memberSkills, card.ongoingCost);
  }
  totalCost = roundInt(totalCost * (1 - streetReduction));

  if (totalCost > 0) {
    const actualDeduction = Math.min(totalCost, state.resourceBank.coins);
    if (opts?.apply !== false) {
      state.resourceBank.coins -= actualDeduction;
    }
    if (actualDeduction > 0) {
      // Enriched with the effective deduction delta (CG-0MT5W7UJJ0065MEZ).
      addLog(
        state,
        `Staff costs: -${actualDeduction} coins (${staffCards.length} staff) (${describeEventEffects(-actualDeduction, 0)})`,
        classifyEffect(-actualDeduction, 0),
      );
    }
    if (actualDeduction < totalCost) {
      addLog(
        state,
        `Insufficient coins for staff costs: owed ${totalCost}, paid ${actualDeduction} (${describeEventEffects(-actualDeduction, 0)})`,
        classifyEffect(-actualDeduction, 0),
      );
    }
    return -actualDeduction;
  }
  return 0;
}

/**
 * Applies community space ongoing costs for the current turn.
 * Deducts each placed community space's `ongoingCost` (e.g. the Library's
 * 25 coins/turn running cost) from coins, alongside staff costs.
 * If coins are insufficient, deducts what's available (down to 0).
 *
 * Mirrors {@link applyStaffOngoingCosts} clamping/log conventions.
 *
 * Deferred-mutation support (CG-0MTR72P14000VO6Q) mirrors
 * {@link applyStaffOngoingCosts}.
 *
 * @param state  Current game state (mutated in-place unless deferred).
 * @param opts   Optional deferred-mutation flag.
 * @returns The coin delta applied (or to be applied): 0 or negative.
 */
export function applyCommunitySpaceOngoingCosts(state: MainStreetState, opts?: { apply?: boolean }): number {
  const grid = state.streetGrid;

  const streetReduction = computeStreetOngoingCostReductionPct(getEmployedSpecializationSkills(state));

  let totalCost = 0;
  let spaceCount = 0;
  // Sold cards do not incur ongoing costs (CG-0MU3VH7QW006A2XA).
  for (let i = 0; i < grid.length; i++) {
    const slot = grid[i];
    if (!slot || slot.family !== 'community-space') continue;
    if (state.soldSlots[i]) continue; // Sold cards do not incur ongoing costs
    const cost = slot.ongoingCost ?? 0;
    if (cost > 0) {
      totalCost += cost;
      spaceCount += 1;
    }
  }
  totalCost = roundInt(totalCost * (1 - streetReduction));
  if (spaceCount === 0) return 0;

  if (totalCost > 0) {
    const actualDeduction = Math.min(totalCost, state.resourceBank.coins);
    if (opts?.apply !== false) {
      state.resourceBank.coins -= actualDeduction;
    }
    if (actualDeduction > 0) {
      // Enriched with the effective deduction delta (CG-0MT5W7UJJ0065MEZ).
      addLog(
        state,
        `Community space costs: -${actualDeduction} coins (${spaceCount} spaces) (${describeEventEffects(-actualDeduction, 0)})`,
        classifyEffect(-actualDeduction, 0),
      );
    }
    if (actualDeduction < totalCost) {
      addLog(
        state,
        `Insufficient coins for community space costs: owed ${totalCost}, paid ${actualDeduction} (${describeEventEffects(-actualDeduction, 0)})`,
        classifyEffect(-actualDeduction, 0),
      );
    }
    return -actualDeduction;
  }
  return 0;
}

/**
 * Applies ongoing costs for business cards each turn.
 * Deducts each business card's `ongoingCost` (e.g. 50 coins/turn) from coins,
 * for every business card held in hand OR placed on the street grid.
 * If coins are insufficient, deducts what's available (down to 0).
 *
 * Mirrors {@link applyStaffOngoingCosts} and {@link applyCommunitySpaceOngoingCosts}
 * clamping/log conventions.
 *
 * Deferred-mutation support (CG-0MTR72P14000VO6Q) mirrors the other two.
 *
 * @param state  Current game state (mutated in-place unless deferred).
 * @param opts   Optional deferred-mutation flag.
 * @returns The coin delta applied (or to be applied): 0 or negative.
 */
export function applyBusinessOngoingCosts(state: MainStreetState, opts?: { apply?: boolean }): number {
  let totalCost = 0;
  let bizCount = 0;

  // Ongoing costs apply only to business cards placed on the street grid —
  // cards held in hand are not yet active and incur no running cost
  // (CG-0MTC31LN3000UHDY). Mirrors applyStaffOngoingCosts() /
  // applyCommunitySpaceOngoingCosts().
  // Sold cards do not incur ongoing costs (CG-0MU3VH7QW006A2XA).
  const grid = state.streetGrid;
  for (let i = 0; i < grid.length; i++) {
    const slot = grid[i];
    if (!slot || slot.family !== 'business') continue;
    if (state.soldSlots[i]) continue; // Sold cards do not incur ongoing costs
    const cost = (slot as BusinessCard).ongoingCost ?? 0;
    if (cost > 0) {
      totalCost += cost;
      bizCount += 1;
    }
  }

  if (bizCount === 0) return 0;

  // Cost Cutter: -15% street-wide ongoing costs (I4) — integer-rounded (AC3).
  totalCost = roundInt(totalCost * (1 - computeStreetOngoingCostReductionPct(getEmployedSpecializationSkills(state))));

  if (totalCost > 0) {
    const actualDeduction = Math.min(totalCost, state.resourceBank.coins);
    if (opts?.apply !== false) {
      state.resourceBank.coins -= actualDeduction;
    }
    if (actualDeduction > 0) {
      // Enriched with the effective deduction delta (CG-0MT5W7UJJ0065MEZ).
      addLog(
        state,
        `Business costs: -${actualDeduction} coins (${bizCount} businesses) (${describeEventEffects(-actualDeduction, 0)})`,
        classifyEffect(-actualDeduction, 0),
      );
    }
    if (actualDeduction < totalCost) {
      addLog(
        state,
        `Insufficient coins for business costs: owed ${totalCost}, paid ${actualDeduction} (${describeEventEffects(-actualDeduction, 0)})`,
        classifyEffect(-actualDeduction, 0),
      );
    }
    return -actualDeduction;
  }
  return 0;
}

/**
 * Applies ongoing costs per-owner for competitive states (N >= 2,
 * CG-0MTIIL6J200291ZQ).
 *
 * Mirrors the three shared families above (staff salary, community-space
 * running costs, business running costs) but deducts from the OWNING player's
 * wallet instead of the shared host wallet:
 *  - Staff salary is charged to the player who owns the staff member
 *    (`players[i].staffCards`), with the Operations Manager per-member salary
 *    discount and the Cost Cutter street-wide reduction derived from that
 *    owner's own employed skills.
 *  - Community-space and business running costs are charged to the slot's
 *    owner (`ownerTaggedGrid` via getSlotOwnerId).
 *
 * The shared host-wallet functions above are left untouched (single-player /
 * N=1 path); this function is additive parallel bookkeeping so per-player
 * wallets stay authoritative for scoring / AI. Deduction clamping and log
 * conventions mirror {@link applyStaffOngoingCosts} / {@link
 * applyCommunitySpaceOngoingCosts} / {@link applyBusinessOngoingCosts}.
 * Consumes no RNG (deterministic replay, AC3).
 *
 * @param state  Competitive game state (players[] wallets mutated in-place).
 */
export function applyCompetitiveOngoingCosts(state: MainStreetState): void {
  if (!state.players || state.players.length < 2) return;
  const hostReduction = computeStreetOngoingCostReductionPct(getEmployedSpecializationSkills(state));

  // Staff salary: charge each owner their own staff's salaries.
  for (const player of state.players) {
    const staffCards = player.staffCards ?? [];
    if (staffCards.length === 0) continue;
    const ownerSkills = staffCards.flatMap((card) =>
      Array.isArray(card.specializationSkillIds) ? deserializeSkillIds(card.specializationSkillIds) : [],
    );
    let totalCost = 0;
    for (const card of staffCards) {
      const memberSkills = Array.isArray(card.specializationSkillIds) ? deserializeSkillIds(card.specializationSkillIds) : [];
      totalCost += computeStaffSalaryCost(memberSkills, card.ongoingCost);
    }
    totalCost = roundInt(totalCost * (1 - computeStreetOngoingCostReductionPct(ownerSkills)));
    if (totalCost <= 0) continue;
    const actualDeduction = Math.min(totalCost, player.coins);
    player.coins -= actualDeduction;
    if (actualDeduction > 0) {
      addLog(
        state,
        `P${player.playerId} Staff costs: -${actualDeduction} coins (${staffCards.length} staff) (${describeEventEffects(-actualDeduction, 0)})`,
        classifyEffect(-actualDeduction, 0),
      );
    }
    if (actualDeduction < totalCost) {
      addLog(
        state,
        `P${player.playerId} Insufficient coins for staff costs: owed ${totalCost}, paid ${actualDeduction} (${describeEventEffects(-actualDeduction, 0)})`,
        classifyEffect(-actualDeduction, 0),
      );
    }
  }

  // Community-space + business running costs: charge each slot's owner.
  // Sold cards do not incur ongoing costs (CG-0MU3VH7QW006A2XA).
  const grid = state.streetGrid;
  const ownerCosts = new Map<number, number>();
  const ownerCounts = new Map<number, { businesses: number; spaces: number }>();
  for (let i = 0; i < grid.length; i++) {
    const slot = grid[i];
    if (!slot) continue;
    if (slot.family !== 'business' && slot.family !== 'community-space') continue;
    if (state.soldSlots[i]) continue; // Sold cards do not incur ongoing costs
    const cost = (slot as BusinessCard).ongoingCost ?? 0;
    if (cost <= 0) continue;
    const ownerId = getSlotOwnerId(state, i);
    ownerCosts.set(ownerId, (ownerCosts.get(ownerId) ?? 0) + cost);
    const counts = ownerCounts.get(ownerId) ?? { businesses: 0, spaces: 0 };
    if (slot.family === 'community-space') counts.spaces += 1;
    else counts.businesses += 1;
    ownerCounts.set(ownerId, counts);
  }
  for (const [ownerId, rawCost] of ownerCosts) {
    const player = state.players[ownerId];
    if (!player) continue;
    // Street-wide Cost Cutter reduction from the shared (host) staff set:
    // staff hiring is single-wallet at present (outside this leaf's scope), so the
    // per-slot reduction stays consistent with the shared income/cost paths.
    const totalCost = roundInt(rawCost * (1 - hostReduction));
    if (totalCost <= 0) continue;
    const actualDeduction = Math.min(totalCost, player.coins);
    player.coins -= actualDeduction;
    const counts = ownerCounts.get(ownerId)!;
    const label =
      counts.businesses > 0 && counts.spaces > 0
        ? `${counts.businesses} businesses, ${counts.spaces} spaces`
        : counts.businesses > 0
          ? `${counts.businesses} businesses`
          : `${counts.spaces} spaces`;
    if (actualDeduction > 0) {
      addLog(
        state,
        `P${ownerId} Ongoing costs: -${actualDeduction} coins (${label}) (${describeEventEffects(-actualDeduction, 0)})`,
        classifyEffect(-actualDeduction, 0),
      );
    }
    if (actualDeduction < totalCost) {
      addLog(
        state,
        `P${ownerId} Insufficient coins for ongoing costs: owed ${totalCost}, paid ${actualDeduction} (${describeEventEffects(-actualDeduction, 0)})`,
        classifyEffect(-actualDeduction, 0),
      );
    }
  }
}

/**
 * Lays off (removes) a staff card, decreasing maxHandSize and randomly
 * removing hand cards equal to the staff card's handSlotsAdded.
 *
 * Uses the game's seeded RNG for deterministic random card selection.
 * If hand has fewer cards than slots to remove, all hand cards are removed.
 *
 * @param state    Current game state (mutated in-place).
 * @param cardId   ID of the staff card to lay off (must be in staffCards).
 * @throws Error if the staff card is not found.
 */
export function layoffStaffCard(
  state: MainStreetState,
  cardId: string,
): void {
  const staffIndex = state.staffCards.findIndex(c => c.id === cardId);
  if (staffIndex === -1) {
    throw new Error(`Staff card ${cardId} not found in active staff.`);
  }

  const card = state.staffCards[staffIndex];
  const slotsToRemove = card.handSlotsAdded;

  // Remove the staff card
  state.staffCards.splice(staffIndex, 1);

  // Deregister the member from its business's employedStaff list
  // (CG-0MTIOLY2A0092OT1 AC2 — per-business employment source of truth).
  removeStaffFromBusinessEmployedStaff(state, card);

  // Decrease maxHandSize (minimum 2)
  state.maxHandSize = Math.max(2, state.maxHandSize - slotsToRemove);

  // Randomly remove hand cards equal to slots added (uses seeded RNG)
  const hand = state.hand ?? [];
  const cardsToRemove = Math.min(slotsToRemove, hand.length);

  if (cardsToRemove > 0) {
    // Use Fisher-Yates shuffle on indices for deterministic random selection
    const indices = hand.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(state.rng() * (i + 1));
      const tmp = indices[i];
      indices[i] = indices[j];
      indices[j] = tmp;
    }

    // Remove the first `cardsToRemove` randomly-selected cards
    const toRemove = indices.slice(0, cardsToRemove).sort((a, b) => b - a);
    const removedCards: string[] = [];
    for (const idx of toRemove) {
      removedCards.push(hand[idx].name ?? hand[idx].id);
      hand.splice(idx, 1);
    }

    addLog(state, `Laid off ${card.name}: removed ${cardsToRemove} hand card(s) (${removedCards.join(', ')})`, 'loss');
  } else {
    addLog(state, `Laid off ${card.name}: no hand cards to remove`, 'neutral');
  }

  // Return the staff card to discards.staff for the general market pipeline (CG-0MT3KZNQB0053K55).
  state.discards.staff.push({ ...card });
}

/**
 * Directly buys a business/community-space card from the market and places
 * it on the street grid in a single action, paying a 50% premium over the
 * listed cost (CG-0MSTOF1N5005PK2R). Consumes one daily action.
 *
 * Premium pricing: `Math.ceil(cost * 1.5 * 2) / 2` — the listed cost × 1.5,
 * rounded up to the nearest integer. When
 * `premiumCost` is supplied (Golden Mile 2-action days, where the
 * equivalent composite placement consumes an action at listed cost —
 * CG-0MT24X0SX007RLHN), that price replaces the premium.
 *
 * @param state       Current game state (mutated in-place).
 * @param cardId      ID of the card in the market.
 * @param slotIndex   Target street grid slot (0-based).
 * @param priceOverride Optional price to charge instead of the +50% premium
 *                      (listed cost for GM parity; unset → premium default).
 * @returns PurchaseResult on success.
 * @throws Error if the action is illegal.
 */
export function buyAndPlaceBusiness(
  state: MainStreetState,
  cardId: string,
  slotIndex: number,
  priceOverride?: number,
): PurchaseResult {
  const marketIndex = state.market.cards.findIndex(c => c.id === cardId);
  if (marketIndex === -1) {
    throw new Error(`Card ${cardId} not found in the market.`);
  }

  const card = state.market.cards[marketIndex];
  if (card.family !== 'business' && card.family !== 'community-space') {
    throw new Error('Buy-and-place only applies to business and community-space cards.');
  }
  if (slotIndex < 0 || slotIndex >= state.streetGrid.length) {
    throw new Error(`Invalid slot index: ${slotIndex}. Must be 0-${state.streetGrid.length - 1}.`);
  }
  if (state.streetGrid[slotIndex] !== null) {
    throw new Error(`Slot ${slotIndex} is already occupied.`);
  }

  const premiumCost = Math.ceil(card.cost * 1.5 * 2) / 2;
  const price = priceOverride ?? premiumCost;
  if (state.resourceBank.coins < price) {
    throw new Error(`Not enough coins to buy-and-place ${card.name}. Need ${price}, have ${state.resourceBank.coins}.`);
  }

  state.resourceBank.coins -= price;
  state.market.cards.splice(marketIndex, 1);
  state.streetGrid[slotIndex] = card as BusinessCard;

  // Incrementally update the new card's and all affected neighbors' cached values
  updateNeighborsOnPlacement(state, slotIndex);
  // Record ownership on the owner-tagged grid (competitive; no-op single-player).
  tagSlotOwnerIfCompetitive(state, slotIndex);
  (state as any).businessPlacedThisTurn = true;

  addLog(
    state,
    `Bought & placed ${card.name} in slot ${slotIndex} (-€${price}, ${price === premiumCost ? '50% premium' : 'listed'}, ${describeEventEffects(-price, 0)})`,
    classifyEffect(-price, 0),
  );

  return { card, cost: price, refilled: false };
}

/**
 * Hires a staff card from the general market row (CG-0MSTOF1N5005PK2R).
 * Consumes one daily action; delegates to purchaseStaffCard for the
 * coin deduction and hand-size mechanics.
 *
 * @param state  Current game state (mutated in-place).
 * @param cardId ID of the staff card in the general market row.
 * @returns PurchaseResult describing the hire.
 * @throws Error if the card is not found or player cannot afford it.
 */
export function hireStaffCard(state: MainStreetState, cardId: string): PurchaseResult {
  // Staff cards are part of the general market row (CG-0MT3KZNQB0053K55):
  // resolve strictly against the row and delegate to the unified purchase.
  const marketIndex = state.market.cards.findIndex(c => c.id === cardId);
  const card = marketIndex !== -1 ? state.market.cards[marketIndex] : undefined;
  if (!card || card.family !== 'staff') {
    throw new Error(`Staff card ${cardId} not found in the market row.`);
  }
  purchaseStaffCard(state, cardId);
  return { card, cost: card.cost, refilled: false };
}

/**
 * Returns the maximum number of staff members that may be employed at the
 * given street-grid slot (business level 0 → 1 slot, +1 per level).
 *
 * @param state     Current game state.
 * @param slotIndex Street-grid slot index.
 * @returns Maximum employment slots for that business (≥ 1).
 */
export function getEmploymentCapacity(state: MainStreetState, slotIndex: number): number {
  const business = state.streetGrid[slotIndex];
  if (!business || business.family !== 'business') return 1;
  return Math.max(1, (business.level ?? 0) + 1);
}

/**
 * Returns the staff members currently employed at the given street-grid
 * slot. Reads the per-business `employedStaff` array (CG-0MTIOLY2A0092OT1,
 * the source of truth); falls back to `employedAtSlot` links for in-memory
 * states that predate the field (legacy saves / hand-built fixtures).
 *
 * @param state     Current game state.
 * @param slotIndex Street-grid slot index.
 * @returns The employed staff at that slot (empty when none).
 */
export function getEmployedStaffForBusiness(state: MainStreetState, slotIndex: number): StaffCard[] {
  const business = state.streetGrid[slotIndex];
  if (business && Array.isArray(business.employedStaff)) {
    return business.employedStaff as StaffCard[];
  }
  return (state.staffCards ?? []).filter(m => m.employedAtSlot === slotIndex);
}

/**
 * Validates whether the hired staff member may be placed at the given
 * street-grid slot (CG-0MU3BTSQ8006ZRCU AC3/AC4):
 * - the member must be a hired staff card (present in `state.staffCards`);
 * - the slot must hold a business/community-space card;
 * - the business name or one of its synergy types must match the staff's
 *   `allowedBusinessTypes` (`staffMatchesBusiness`; absent field = generalist);
 * - the slot must have a free employment slot (`getEmploymentCapacity`).
 *
 * @param state     Current game state.
 * @param staffId   ID of the hired staff card to place.
 * @param slotIndex Street-grid slot index.
 * @returns LegalityResult — legal when the placement may proceed.
 */
export function canPlaceStaffOnBusiness(
  state: MainStreetState,
  staffId: string,
  slotIndex: number,
): import('@rule-engine').LegalityResult {
  const staffIndex = (state.staffCards ?? []).findIndex(c => c.id === staffId);
  if (staffIndex === -1) {
    return { legal: false, reason: `Staff card ${staffId} is not hired.` };
  }
  if (slotIndex < 0 || slotIndex >= state.streetGrid.length) {
    return { legal: false, reason: `Invalid slot index: ${slotIndex}.` };
  }
  const business = state.streetGrid[slotIndex];
  if (!business) {
    return { legal: false, reason: 'Cannot place staff on an empty slot.' };
  }
  if (!staffMatchesBusiness(state.staffCards[staffIndex]!, business)) {
    return {
      legal: false,
      reason: `${state.staffCards[staffIndex]!.name} cannot work at ${business.name} — business type does not match.`,
    };
  }
  if (!hasFreeEmploymentSlot(state, slotIndex)) {
    return { legal: false, reason: `${business.name} has no free employment slots.` };
  }
  return { legal: true };
}

/**
 * Places a hired staff member at the given street-grid slot
 * (CG-0MU3BTSQ8006ZRCU AC1-AC3). Sets the member's `employedAtSlot` and
 * registers it on the business's `employedStaff` list (the per-business
 * source of truth, CG-0MTIOLY2A0092OT1 AC2). Per-business buffs then apply
 * only to that business.
 *
 * Free: adjusts employment only — no action or coins are consumed (the
 * staff member was already hired). Undo/redo is provided by the command
 * wrapper (`placeStaffOnBusinessCommand`).
 *
 * @param state     Current game state (mutated in-place).
 * @param staffId   ID of the hired staff card to place.
 * @param slotIndex Street-grid slot index.
 * @throws Error when the placement is illegal (type mismatch, full slot,
 *         un-hired member, empty slot).
 */
export function placeStaffOnBusiness(
  state: MainStreetState,
  staffId: string,
  slotIndex: number,
): void {
  const legality = canPlaceStaffOnBusiness(state, staffId, slotIndex);
  if (!legality.legal) {
    throw new Error(legality.reason);
  }
  const staff = (state.staffCards ?? []).find(c => c.id === staffId)!;
  // A staff member can only serve one business at a time: deregister from
  // any previous employment before placing at the new slot.
  if (staff.employedAtSlot != null && staff.employedAtSlot !== slotIndex) {
    deregisterStaffFromSlot(state, staff.employedAtSlot, staff.id);
  }
  staff.employedAtSlot = slotIndex;
  const business = state.streetGrid[slotIndex]!;
  if (!Array.isArray(business.employedStaff)) business.employedStaff = [];
  if (!business.employedStaff.some(m => m.id === staff.id)) {
    business.employedStaff.push(staff);
  }
}

/**
 * Removes a staff member's employment from a specific street-grid slot:
 * clears its `employedAtSlot` and pulls it off the business's
 * `employedStaff` list. The member remains a hired staff card (salary still
 * applies); to sell/lay off entirely use `layoffStaffCard`.
 *
 * @param state     Current game state (mutated in-place).
 * @param slotIndex Slot whose employed list holds the member.
 * @param staffId   ID of the staff member to remove.
 */
export function removeStaffFromBusiness(
  state: MainStreetState,
  staffId: string,
): void {
  const staff = (state.staffCards ?? []).find(c => c.id === staffId);
  if (!staff) {
    throw new Error(`Staff card ${staffId} is not hired.`);
  }
  const slotIndex = staff.employedAtSlot;
  if (slotIndex == null) return; // hand-slot member — nothing employed to remove
  deregisterStaffFromSlot(state, slotIndex, staffId);
  staff.employedAtSlot = undefined;
}

/**
 * Shared deregistration: removes `staffId` from the employed staff list of
 * the business at `slotIndex` (no-op when absent). Keeps
 * `business.employedStaff` and `staff.employedAtSlot` consistent.
 */
function deregisterStaffFromSlot(
  state: MainStreetState,
  slotIndex: number,
  staffId: string,
): void {
  const business = state.streetGrid[slotIndex];
  if (!business) return;
  if (business.family !== 'business' && business.family !== 'community-space') return;
  if (Array.isArray(business.employedStaff)) {
    business.employedStaff = business.employedStaff.filter(m => m.id !== staffId);
  }
}

/**
 * Counts how many staff members are currently employed at the given
 * street-grid slot (employedAtSlot === slotIndex).
 *
 * @param state     Current game state.
 * @param slotIndex Street-grid slot index.
 * @returns Number of employed staff at that slot.
 */
export function getEmployedStaffCountAt(state: MainStreetState, slotIndex: number): number {
  return getEmployedStaffForBusiness(state, slotIndex).length;
}

/**
 * Checks whether the business at the given slot has at least one free
 * employment slot (employed count < capacity).
 *
 * @param state     Current game state.
 * @param slotIndex Street-grid slot index.
 * @returns True when the business can accept another staff member.
 */
export function hasFreeEmploymentSlot(state: MainStreetState, slotIndex: number): boolean {
  return getEmployedStaffCountAt(state, slotIndex) < getEmploymentCapacity(state, slotIndex);
}

/**
 * Chance (in percent) that a staff applicant appears. Formula: min(
 * reputationPerTurn + incomePerTurn, 15). Capped at 15% per AC.
 */
const APPLICANT_CHANCE_CAP = 15;

/**
 * Computes the staff-applicant trigger chance: min(income + reputation, 15).
 *
 * Sum of baseIncome from all placed businesses
 * plus all reputationPerTurn (business + staff) on the street.
 *
 * @param state     Current game state.
 * @returns Effective income+reputation sum (before the 15% cap).
 */
export function computeApplicantChance(state: MainStreetState): number {
  // Sum business baseIncome
  let totalIncome = 0;
  for (let i = 0; i < state.streetGrid.length; i++) {
    const card = state.streetGrid[i];
    if (card && (card.family === 'business' || card.family === 'community-space')) {
      totalIncome += card.baseIncome;
    }
  }
  // Add reputationPerTurn from businesses
  for (let i = 0; i < state.streetGrid.length; i++) {
    const card = state.streetGrid[i];
    if (card && (card.family === 'business' || card.family === 'community-space')) {
      totalIncome += card.reputationPerTurn ?? 0;
    }
  }
  return Math.min(totalIncome, APPLICANT_CHANCE_CAP);
}

/**
 * Checks whether there is at least one business with a free employment slot.
 *
 * @param state     Current game state.
 * @returns True when at least one eligible business exists.
 */
function hasEligibleBusiness(state: MainStreetState): boolean {
  for (let i = 0; i < state.streetGrid.length; i++) {
    const card = state.streetGrid[i];
    if (card && (card.family === 'business' || card.family === 'community-space')) {
      if (hasFreeEmploymentSlot(state, i)) return true;
    }
  }
  return false;
}

/**
 * Picks a random eligible business slot (one with a free employment slot),
 * weighted uniformly across eligible slots.
 *
 * @param state     Current game state.
 * @returns The chosen slot index, or -1 when no eligible slot exists.
 */
function pickTargetSlot(state: MainStreetState): number {
  const eligible: number[] = [];
  for (let i = 0; i < state.streetGrid.length; i++) {
    const card = state.streetGrid[i];
    if (card && (card.family === 'business' || card.family === 'community-space')) {
      if (hasFreeEmploymentSlot(state, i)) eligible.push(i);
    }
  }
  if (eligible.length === 0) return -1;
  const idx = state.rng() * eligible.length;
  return eligible[Math.floor(idx)];
}

/**
 * Resolves whether a staff applicant appears at day start. Uses the seeded
 * `state.rng` for determinism. Chance = min(income+rep, 15)%.
 *
 * When triggered:
 * - Picks a random business with a free employment slot as the target.
 * - Draws a random StaffCard **with a business-type match** from the staff
 *   deck (CG-0MU3BTRGY0086CM9): only staff whose `allowedBusinessTypes`
 *   match at least one deployed business may walk on; generalist staff
 *   remain eligible (fallback). With no matching business at all, no
 *   applicant appears (the roll is consumed).
 * - Sets `pendingApplicant = { card, targetSlotIndex }`.
 *
 * When no eligible business exists or the RNG roll fails, nothing happens.
 *
 * @param state     Current game state (mutated — sets pendingApplicant).
 */
export function resolveStaffApplicant(state: MainStreetState): void {
  // Must have at least one eligible business
  if (!hasEligibleBusiness(state)) return;

  // Chance = min(income+rep, 15)%
  const chance = computeApplicantChance(state);
  if (chance <= 0) return;

  // Deterministic roll: roll in [0, 100), trigger if < chance.
  // Dev-only forced applicant (CG-0MTY9PB51008OG5A) bypasses the roll
  // while still respecting the eligible-slot and chance>0 guards above.
  if (!state.forcedStaffApplicant) {
    const roll = state.rng() * 100;
    if (roll >= chance) return;
  }

  // Pick a target slot
  const targetSlot = pickTargetSlot(state);
  if (targetSlot < 0) return;

  // Draw a random staff card from the deck
  const staffDeck = state.decks?.staff;
  if (!staffDeck || staffDeck.length === 0) return;

  // ── Business-type gating (CG-0MU3BTRGY0086CM9 AC1-AC3) ──────
  // Only staff whose `allowedBusinessTypes` match at least one deployed
  // business may walk on. Generalist staff (broad type coverage — or
  // legacy cards without the field) always match any deployed business, so
  // they naturally remain available when no specialist match exists
  // (AC3 fallback). When nothing matches (no deployed businesses, or only
  // mismatched types), no applicant appears — the trigger roll is consumed
  // (AC2). The dev-only forced applicant (CG-0MTY9PB51008OG5A) BYPASSES
  // the type gate so the cheat/debug tool can spawn any staff.
  let pool: readonly StaffCard[] = staffDeck;
  if (!state.forcedStaffApplicant) {
    const deployed = state.streetGrid.filter(
      (c): c is BusinessCard | CommunitySpaceCard => c != null,
    );
    pool = staffDeck.filter((c) => deployed.some((b) => staffMatchesBusiness(c, b)));
    if (pool.length === 0) return;
  }

  // Pick a random card from the eligible pool
  const deckIdx = Math.floor(state.rng() * pool.length);
  const card = { ...pool[deckIdx] } as StaffCard;

  // Assign specialization skills if not already present
  if (!Array.isArray(card.specializationSkillIds)) {
    card.specializationSkillIds = serializeSkillIds(
      assignSkillsToApplicant(state.rng),
    );
  }

  // Set pending applicant
  (state as any).pendingApplicant = { card, targetSlotIndex: targetSlot };
}

/**
 * Checks whether the pending applicant can be hired (target slot has capacity).
 *
 * @param state     Current game state.
 * @returns True when the pending applicant can be hired.
 */
export function canHireStaffApplicant(state: MainStreetState): boolean {
  const pending = (state as any).pendingApplicant;
  if (!pending || pending.targetSlotIndex == null) return false;
  const slot = pending.targetSlotIndex as number;
  if (slot < 0 || slot >= state.streetGrid.length) return false;
  return hasFreeEmploymentSlot(state, slot);
}

/**
 * Hires the pending staff applicant: adds to staffCards with employedAtSlot,
 * costs 0 coins (no maxHandSize increase), and clears pendingApplicant.
 *
 * Salary is deducted in the next income phase via applyStaffOngoingCosts.
 *
 * @param state     Current game state (mutated).
 * @throws Error if no pending applicant or slot is at capacity.
 */
export function hireStaffApplicant(state: MainStreetState): void {
  const pending = (state as any).pendingApplicant;
  if (!pending) {
    throw new Error('No pending applicant to hire');
  }
  if (!canHireStaffApplicant(state)) {
    throw new Error('Target slot is at employment capacity');
  }

  const card = { ...(pending.card as StaffCard), employedAtSlot: pending.targetSlotIndex } as StaffCard;

  // Add to staffCards with employedAtSlot
  state.staffCards.push(card);

  // Register the member on the business's employedStaff list
  // (CG-0MTIOLY2A0092OT1 AC2 — per-business employment source of truth).
  const business = state.streetGrid[pending.targetSlotIndex as number];
  if (business) {
    if (!Array.isArray(business.employedStaff)) business.employedStaff = [];
    business.employedStaff.push(card);
  }

  // Clear pending applicant
  (state as any).pendingApplicant = null;
}

/**
 * Declines the pending staff applicant: clears pendingApplicant with no
 * other effects. The declined card leaves the applicant pool (it is not
 * restored to the staff deck — the pool persists independently).
 *
 * @param state     Current game state (mutated).
 */
export function declineStaffApplicant(state: MainStreetState): void {
  (state as any).pendingApplicant = null;
}

/**
 * Lets go a staff member at the given index: removes from staffCards,
 * deducts 1 turn's salary (clamped at 0) from coins, and deducts 1
 * reputation. Buffs from this member stop applying from the next income
 * phase (handled automatically — the member is removed before income).
 *
 * @param state     Current game state (mutated).
 * @param idx       Index of the staff member to let go.
 */
export function letGoStaffMember(state: MainStreetState, idx: number): void {
  if (idx < 0 || idx >= state.staffCards.length) {
    throw new Error(`Invalid staff index: ${idx}`);
  }

  const member = state.staffCards[idx];
  const skills = Array.isArray((member as any).specializationSkillIds)
    ? deserializeSkillIds((member as any).specializationSkillIds)
    : [];
  const salary = computeStaffSalaryCost(skills, member.ongoingCost);

  // Deduct salary (clamped at 0) and 1 reputation
  state.resourceBank.coins = Math.max(0, state.resourceBank.coins - salary);
  state.resourceBank.reputation = Math.max(0, state.resourceBank.reputation - 1);

  // Remove from staffCards
  state.staffCards.splice(idx, 1);

  // Deregister the member from its business's employedStaff list
  // (CG-0MTIOLY2A0092OT1 AC2 — per-business employment source of truth).
  removeStaffFromBusinessEmployedStaff(state, member);
}

/**
 * Removes a now-fired staff member from its business's `employedStaff` list
 * (per-business employment source of truth, CG-0MTIOLY2A0092OT1). No-op for
 * hand-slot members (no `employedAtSlot`) or when the slot is already empty.
 *
 * @param state  Current game state (mutated in-place).
 * @param member The staff member being removed from active staff.
 */
function removeStaffFromBusinessEmployedStaff(state: MainStreetState, member: StaffCard): void {
  const slotIndex = member.employedAtSlot;
  if (slotIndex == null) return;
  deregisterStaffFromSlot(state, slotIndex, member.id);
}

/** Mutates: consumes a pending applicant into staffCards with employedAtSlot (no hand slots). */

export function hireApplicantAction(state: MainStreetState): void {
  hireStaffApplicant(state);
}

/** Mutates: clears the pending applicant without effect. */

export function declineApplicantAction(state: MainStreetState): void {
  declineStaffApplicant(state);
}

/** Mutates: lets go of a staff member by index. */

export function letGoStaffAction(state: MainStreetState, idx: number): void {
  letGoStaffMember(state, idx);
}

