/**
 * Main Street: Market Utility Helpers
 *
 * Pure query helpers over the market/street grid (affordable cards, empty
 * slots, upgrade targets/branches). Leaf module (no market-operation deps).
 *
 * @module
 */

import type { MainStreetState } from './MainStreetState';
import type { BusinessCard, CommunitySpaceCard, UpgradeCard } from './MainStreetCards';

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
  for (let i = 0; i < state.streetGrid.length; i++) {
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

