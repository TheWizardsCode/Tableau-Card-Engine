/**
 * Main Street: Neighbor Mutation and Synergy Lines
 *
 * Recalculates affected cards after placement/sale/close, and computes the
 * synergy pairs used to draw visual synergy lines.
 *
 * Import graph: depends on `MainStreetAdjacencyGeometry` and
 * `MainStreetAdjacencyScoring`.
 *
 * @module
 */

import type { BusinessCard, CommunitySpaceCard, SynergyType } from './MainStreetCards';
import { getBaseTypeId } from './MainStreetCards';
import type { MainStreetState } from './MainStreetState';
import type { GridDims } from './MainStreetAdjacencyGeometry';
import { resolveNeighbors } from './MainStreetAdjacencyGeometry';
import {
  recalculateCard,
  effectiveSynergyCoinBonus,
  effectiveSynergyRepBonus,
} from './MainStreetAdjacencyScoring';

/**
 * Updates all cards whose cached income/reputation could be affected by the
 * placement of a new card at `index`.
 *
 * The newly placed card itself is recalculated, and every other occupied
 * (non-sold) slot on the grid is also recalculated since any card could be
 * affected by synergy or same-type penalty changes.
 *
 * @param state Current game state.
 * @param index The slot index of the newly placed card.
 */
export function updateNeighborsOnPlacement(
  state: MainStreetState,
  index: number,
): void {
  // Recalculate the newly placed card
  recalculateCard(state, index);

  // Recalculate all other occupied non-sold slots (neighbors could be affected)
  for (let i = 0; i < state.streetGrid.length; i++) {
    if (i === index) continue;
    if (state.soldSlots[i]) continue;
    if (state.streetGrid[i] !== null) {
      recalculateCard(state, i);
    }
  }
}

/**
 * Updates all cards whose cached income/reputation could be affected by the
 * sale of a card at `index`.
 *
 * The sold card is already marked in `soldSlots`; this function recalculates
 * all other occupied non-sold slots. With the sold-neighbour-synergy-fix,
 * sold cards still act as synergy anchors — so in most cases the neighbours'
 * cached values will remain unchanged (the recalculation simply confirms the
 * status quo). However, any same-type penalty or synergy-type interactions
 * that involved the sold card are re-evaluated to ensure consistency.
 *
 * @param state Current game state.
 * @param index The slot index of the sold card.
 */
export function updateNeighborsOnSale(
  state: MainStreetState,
  index: number,
): void {
  // Recalculate all occupied non-sold slots (neighbors could be affected)
  for (let i = 0; i < state.streetGrid.length; i++) {
    if (i === index) continue;
    if (state.soldSlots[i]) continue;
    if (state.streetGrid[i] !== null) {
      recalculateCard(state, i);
    }
  }
}

/**
 * Updates all cards whose cached income/reputation could be affected by the
 * close (full removal) of the card at `index`.
 *
 * The closed slot is already `null` when this runs. Unlike a sale — where the
 * card remains on the grid as an inert synergy anchor — a closed card is gone
 * entirely, so neighbours lose any synergy it previously contributed. Every
 * remaining occupied, non-sold slot is recalculated.
 *
 * @param state Current game state.
 * @param index The slot index the closed card occupied (now empty).
 */
export function updateNeighborsOnClose(
  state: MainStreetState,
  index: number,
): void {
  for (let i = 0; i < state.streetGrid.length; i++) {
    if (i === index) continue;
    if (state.soldSlots[i]) continue;
    if (state.streetGrid[i] !== null) {
      recalculateCard(state, i);
    }
  }
}

/**
 * Represents a synergy connection between two adjacent slots on the street grid.
 * Used by the renderer to draw visual lines between synergistic businesses.
 */
export interface SynergyPair {
  /** The lower slot index of the pair. */
  fromIndex: number;
  /** The higher slot index of the pair. */
  toIndex: number;
  /** The shared synergy type used to determine line color. */
  sharedSynergy: SynergyType;
}

/**
 * Computes all synergy pairs on the street grid for visual line rendering.
 *
 * A pair exists when two occupied slots share at least one SynergyType and
 * are within 8-way / Chebyshev distance range (1 + card's synergyRangeBonus) —
 * diagonally adjacent slots count (CG-0MSP1HCAS00785MP). Each pair
 * is reported only once (fromIndex < toIndex).
 *
 * Community-space cards are included in the same manner as business cards.
 *
 * Sold cards still participate as pair endpoints (synergy anchors): a pair
 * between a sold business and its non-sold neighbour stays visible, and any
 * pair where both endpoints are sold is emitted symmetrically too (both are
 * inert but the line is harmless and consistent — CG-0MT5XUE2200047IJ).
 *
 * @param grid  The street grid.
 * @returns Array of synergy pairs for visual line drawing.
 */
export function computeSynergyPairs(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
  // soldSlots retained for API compat — sold cards now participate fully as pair endpoints (CG-0MT5XUE2200047IJ)
  _soldSlots: boolean[] = [],
  gridDims?: GridDims,
): SynergyPair[] {
  const pairs: SynergyPair[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < grid.length; i++) {
    const card = grid[i];
    if (!card) continue;

    // A card with zero synergy values does not participate in synergy
    if (effectiveSynergyCoinBonus(card) === 0 && effectiveSynergyRepBonus(card) === 0) {
      continue;
    }

    const range = 1 + card.synergyRangeBonus;
    const neighborIndices = resolveNeighbors(i, range, gridDims);

    for (const ni of neighborIndices) {
      if (ni <= i) continue; // avoid duplicates and self-pairs
      // Sold neighbours still form synergy pairs (visual link remains visible).
      const neighbor = grid[ni];
      if (!neighbor) continue;

      // Neither card participates in synergy (both zero-synergy)
      if (effectiveSynergyCoinBonus(card) === 0 && effectiveSynergyRepBonus(card) === 0) {
        continue;
      }
      if (effectiveSynergyCoinBonus(neighbor) === 0 && effectiveSynergyRepBonus(neighbor) === 0) {
        continue;
      }

      // Same-type rule: do not draw synergy lines between same-type businesses
      if (getBaseTypeId(card.id) === getBaseTypeId(neighbor.id)) continue;

      // Find the first shared synergy type
      const shared = card.synergyTypes.find(
        (st: SynergyType) => neighbor.synergyTypes.includes(st),
      );
      if (shared) {
        const key = `${Math.min(i, ni)}-${Math.max(i, ni)}`;
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push({
            fromIndex: Math.min(i, ni),
            toIndex: Math.max(i, ni),
            sharedSynergy: shared,
          });
        }
      }
    }
  }

  return pairs.sort((a, b) => a.fromIndex - b.fromIndex || a.toIndex - b.toIndex);
}

/**
 * Returns the synergy pairs in `after` that are not present in `before`
 * (same slot pair), i.e. the newly-formed connections after a placement.
 *
 * Used by the synergy-formation animation trigger so only NEW pairs animate
 * (pre-existing pairs never re-trigger on a plain refresh).
 */
export function diffNewSynergyPairs(before: SynergyPair[], after: SynergyPair[]): SynergyPair[] {
  return after.filter(
    (pair) => !before.some(
      (b) => b.fromIndex === pair.fromIndex && b.toIndex === pair.toIndex,
    ),
  );
}

// ── Result Types ────────────────────────────────────────────

/** Per-slot income breakdown. */

