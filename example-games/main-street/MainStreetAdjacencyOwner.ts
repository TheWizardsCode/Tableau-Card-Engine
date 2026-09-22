/**
 * Main Street: Competitive Slot Ownership
 *
 * Owner tagging and lookup for competitive (per-player) slot ownership.
 *
 * Import graph: depends on `MainStreetState` only.
 *
 * @module
 */

import type { MainStreetState } from './MainStreetState';

/**
 * Resolves the owner of a street slot in competitive mode.
 *
 * Reads the owner-tagged grid (state-model sibling) and falls back to the
 * active player (0 in single-player) when a slot is not yet tagged — this
 * keeps headless flows that place cards through the shared single-wallet
 * path deterministic even before ownership tagging lands at every site.
 *
 * @param state      Current game state.
 * @param slotIndex  Street grid slot index.
 * @returns The owning player index (always an integer).
 */
export function getSlotOwnerId(state: MainStreetState, slotIndex: number): number {
  const tag = state.ownerTaggedGrid?.[slotIndex];
  if (tag && tag.ownerId !== null) return tag.ownerId;
  return state.activePlayerId ?? 0;
}

/**
 * Tags a street slot with its owner when the state is competitive
 * (`ownerTaggedGrid` present). No-op in single-player state. The card
 * reference is kept in sync with `streetGrid` so the tag never drifts.
 *
 * @param state      Current game state (mutated in-place when competitive).
 * @param slotIndex  Street grid slot index just occupied.
 * @param ownerId    Owner index (defaults to the active player / 0).
 * @returns True when the tag was written (competitive state).
 */
export function tagSlotOwnerIfCompetitive(
  state: MainStreetState,
  slotIndex: number,
  ownerId: number = state.activePlayerId ?? 0,
): boolean {
  if (!state.ownerTaggedGrid) return false;
  state.ownerTaggedGrid[slotIndex] = {
    card: state.streetGrid[slotIndex] ?? null,
    ownerId,
  };
  return true;
}
