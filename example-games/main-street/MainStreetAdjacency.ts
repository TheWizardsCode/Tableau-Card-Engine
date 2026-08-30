/**
 * Main Street: Adjacency & Income Calculation
 *
 * Implements the adjacency resolver for the 2x5 street grid
 * (stored as a 10-slot row-major array) and income computation
 * (base income + synergy bonuses). Upgrades can extend synergy
 * range beyond the default 1-cell 8-way (Chebyshev) adjacency.
 *
 * @module
 */

import type { BusinessCard, CommunitySpaceCard, EventCard, UpgradeCard, SynergyType } from './MainStreetCards';
import { getBaseTypeId } from './MainStreetCards';
import { GRID_SIZE } from './MainStreetCards';
import type { MainStreetState } from './MainStreetState';
import { addLog, syncResourceBankToLedger } from './MainStreetState';
import { applyReputationMultiplier } from './MainStreetDifficulty';
import { applyActiveEffectMultiplier } from '../../src/core-engine/ActiveEffect';
import {
  computePerBusinessSkillBuffs,
  getEmployedSpecializationSkills,
} from './MainStreetStaffBuffs';

// ── Adjacency Resolver ──────────────────────────────────────

/**
 * Returns the indices of neighboring slots within a given range
 * on the Main Street 2x5 grid.
 *
 * Slot indices are row-major:
 *   row 0: 0..4
 *   row 1: 5..9
 *
 * Adjacency is 8-way (Chebyshev distance: max(|dx|, |dy|) <= range),
 * so diagonally adjacent slots count at every range. Default range is 1
 * (the 8 surrounding slots); upgrades extend this radius as larger
 * 8-way squares.
 *
 * @param index  The slot index to find neighbors for.
 * @param range  How far to look in each direction (default 1).
 * @returns Array of neighbor indices (excluding the slot itself).
 */
const STREET_COLS = 5;

function toGridPosition(index: number): { x: number; y: number } {
  return {
    x: index % STREET_COLS,
    y: Math.floor(index / STREET_COLS),
  };
}

export function neighbors(index: number, range: number = 1): number[] {
  if (index < 0 || index >= GRID_SIZE || range <= 0) return [];

  const origin = toGridPosition(index);
  const result: number[] = [];

  for (let i = 0; i < GRID_SIZE; i++) {
    if (i === index) continue;
    const p = toGridPosition(i);
    // 8-way (Chebyshev) distance: diagonally adjacent slots count at range 1,
    // and range upgrades expand as larger 8-way squares (CG-0MSP1HCAS00785MP).
    const distance = Math.max(
      Math.abs(origin.x - p.x),
      Math.abs(origin.y - p.y),
    );
    if (distance <= range) {
      result.push(i);
    }
  }

  return result.sort((a, b) => a - b);
}

/**
 * Resolves the effective per-card coin synergy rate for a card.
 * Returns the card's `synergyCoinBonus` if set, otherwise 0.5 (the default, 50% of base income).
 */
function effectiveSynergyCoinBonus(card: BusinessCard | CommunitySpaceCard): number {
  return card.synergyCoinBonus ?? 0.5;
}

/**
 * Resolves the effective per-neighbor reputation synergy contribution for a card.
 * Returns the card's `synergyRepBonus` if set, otherwise 0 (the default).
 */
function effectiveSynergyRepBonus(card: BusinessCard | CommunitySpaceCard): number {
  return card.synergyRepBonus ?? 0;
}

/**
 * Returns true if the given business has at least one adjacent neighbor with the
 * same base type (template ID). Used to determine when synergy is nullified and
 * the 60% base-income penalty applies.
 *
 * Sold neighbours still count (they remain on the grid and contribute to the
 * same-type penalty for non-sold neighbours).
 */
function hasAdjacentSameType(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
  index: number,
  soldSlots: boolean[] = [],
): boolean {
  const card = grid[index];
  if (!card) return false;
  if (soldSlots[index]) return false;

  const baseType = getBaseTypeId(card.id);
  // Use range 1 (default) for same-type check; upgrades don't affect this penalty
  const neighborIndices = neighbors(index, 1);

  for (const ni of neighborIndices) {
    const neighbor = grid[ni];
    if (!neighbor) continue;
    if (getBaseTypeId(neighbor.id) === baseType) {
      return true;
    }
  }

  return false;
}

/**
 * Computes the synergy coin bonus for a single business at a given slot.
 *
 * Uses a percentage-based formula:
 *   synergy = effectiveBase * synergyCoinBonus * bonusPerNeighbor * N
 * where:
 *   - effectiveBase = (baseIncome + incomeBonus) * sameTypePenalty
 *   - synergyCoinBonus = the source card's synergy rate as a decimal (e.g., 0.50 = 50%)
 *   - bonusPerNeighbor = the difficulty preset multiplier (e.g., 1.0 at Medium)
 *   - N = number of matching, different-type neighbors
 *
 * Cards with zero synergyCoinBonus (e.g., Pawn Shop) opt out entirely, receiving
 * and contributing no synergy. Synergy-neutral neighbors (synergyCoinBonus=0 AND
 * synergyRepBonus=0) are not counted toward N.
 *
 * **Same-type rule:** Neighbors with the same base type (template ID) as the source
 * business are not counted toward N, preserving the 0.6 base-income penalty.
 *
 * **Sold neighbours:** a sold neighbour still counts toward N (the sold card stays a
 * synergy anchor — CG-0MT5XUE2200047IJ); only the sold card itself yields 0 synergy.
 *
 * @param grid               The street grid.
 * @param index              The slot index of the business.
 * @param bonusPerNeighbor   Global multiplier on per-card coin synergy (defaults to 1).
 * @returns The synergy coin bonus.
 */
export function computeSynergyBonus(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
  index: number,
  bonusPerNeighbor: number = 1,
  soldSlots: boolean[] = [],
): number {
  // Source-slot guard: a sold card earns no synergy income itself
  // (its neighbours, however, keep receiving synergy from it — CG-0MT5XUE2200047IJ)
  if (soldSlots[index]) return 0;
  const business = grid[index];
  if (!business) return 0;

  const rate = effectiveSynergyCoinBonus(business);
  // A card with zero synergy coin opts out entirely
  if (rate === 0) return 0;

  const baseType = getBaseTypeId(business.id);
  const range = 1 + business.synergyRangeBonus;
  const neighborIndices = neighbors(index, range);

  // Count matching, different-type neighbors (N)
  // Sold neighbours still contribute synergy (they act as synergy anchors on the grid).
  let matchingCount = 0;
  for (const ni of neighborIndices) {
    const neighbor = grid[ni];
    if (!neighbor) continue;

    // Skip synergy-neutral neighbors (they don't participate in synergy at all)
    if (effectiveSynergyCoinBonus(neighbor) === 0 && effectiveSynergyRepBonus(neighbor) === 0) continue;

    // Same-type rule: skip synergy contribution from same-type neighbors
    if (getBaseTypeId(neighbor.id) === baseType) continue;

    // Check if any synergy type is shared
    const hasSharedSynergy = business.synergyTypes.some(
      (st: SynergyType) => neighbor.synergyTypes.includes(st),
    );
    if (hasSharedSynergy) {
      matchingCount++;
    }
  }

  if (matchingCount === 0) return 0;

  // Compute effective base (base income + income bonus, with same-type penalty)
  let effectiveBase = business.baseIncome + business.incomeBonus;
  if (hasAdjacentSameType(grid, index, soldSlots)) {
    effectiveBase = effectiveBase * 0.6;
  }

  // Percentage-based synergy: effectiveBase * rate * bonusPerNeighbor * N
  return effectiveBase * rate * bonusPerNeighbor * matchingCount;
}

/**
 * Computes the synergy reputation bonus for a single business at a given slot.
 *
 * A business earns reputation for each neighboring slot that contains a business
 * sharing at least one SynergyType. The contribution from each neighbor is
 * the neighbor's `synergyRepBonus` (default 0).
 *
 * The range considered is 1 + business.synergyRangeBonus (from upgrades).
 *
 * **Same-type rule:** If a neighbor has the same base type (template ID) as the
 * source business, the reputation synergy contribution is nullified (returns 0).
 * The business's own `reputationPerTurn` and `reputationBonus` are unaffected.
 *
 * @param grid   The street grid.
 * @param index  The slot index of the business.
 * @returns The synergy reputation bonus.
 */
export function computeSynergyRepBonus(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
  index: number,
  soldSlots: boolean[] = [],
): number {
  // Source-slot guard: a sold card earns no synergy reputation itself
  // (its neighbours keep receiving rep synergy from it — CG-0MT5XUE2200047IJ)
  if (soldSlots[index]) return 0;
  const business = grid[index];
  if (!business) return 0;

  // A card with zero synergy coin AND zero synergy reputation does not
  // participate in the synergy system at all.
  if (effectiveSynergyCoinBonus(business) === 0 && effectiveSynergyRepBonus(business) === 0) {
    return 0;
  }

  const baseType = getBaseTypeId(business.id);
  const range = 1 + business.synergyRangeBonus;
  const neighborIndices = neighbors(index, range);

  let bonus = 0;
  for (const ni of neighborIndices) {
    // Sold neighbours still contribute synergy reputation (synergy anchors).
    const neighbor = grid[ni];
    if (!neighbor) continue;

    // Same-type rule: skip reputation synergy from same-type neighbors
    if (getBaseTypeId(neighbor.id) === baseType) continue;

    // Check if any synergy type is shared
    const hasSharedSynergy = business.synergyTypes.some(
      (st: SynergyType) => neighbor.synergyTypes.includes(st),
    );
    if (hasSharedSynergy) {
      bonus += effectiveSynergyRepBonus(neighbor);
    }
  }

  return bonus;
}

/**
 * Computes the total income for a single business at a given slot.
 *
 * totalIncome = effectiveBase + synergyBonus
 *
 * Where effectiveBase = (baseIncome + incomeBonus) * sameTypePenalty
 * and synergyBonus uses the percentage-based formula from computeSynergyBonus.
 *
 * @see computeSynergyBonus for details on the percentage-based synergy formula.
 *
 * @param grid               The street grid.
 * @param index              The slot index of the business.
 * @param bonusPerNeighbor   Global multiplier on per-card coin synergy (defaults to 1).
 * @returns The total income in coins for this business.
 */
export function computeBusinessIncome(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
  index: number,
  bonusPerNeighbor: number = 1,
  soldSlots: boolean[] = [],
): number {
  // Sold cards produce no income
  if (soldSlots[index]) return 0;
  const business = grid[index];
  if (!business) return 0;

  let base = business.baseIncome + business.incomeBonus;
  // Same-type penalty: reduce base income to 60% when adjacent to a same-type business
  if (hasAdjacentSameType(grid, index, soldSlots)) {
    base = base * 0.6;
  }
  const synergy = computeSynergyBonus(grid, index, bonusPerNeighbor, soldSlots);
  return base + synergy;
}

/**
 * Computes the per-card reputation contribution at a given grid slot.
 *
 * total = reputationPerTurn + reputationBonus + synergyRepBonus
 *
 * @param grid      The street grid.
 * @param index     The slot index of the card.
 * @param soldSlots Array of sold slot flags (sold slots return 0).
 * @returns The total reputation per turn contributed by this card.
 */
export function computeSingleCardReputation(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
  index: number,
  soldSlots: boolean[] = [],
): number {
  if (soldSlots[index]) return 0;
  const slot = grid[index];
  if (!slot) return 0;
  return (slot.reputationPerTurn ?? 0) + slot.reputationBonus + computeSynergyRepBonus(grid, index, soldSlots);
}

/**
 * Sets a card's `currentIncome` field to match what `computeBusinessIncome()`
 * would return for the given grid state.
 *
 * This is the core incremental-update primitive: it syncs one card's cached
 * income value using the existing compute function, so the cached value is
 * guaranteed to match the full-recalculation result.
 *
 * @param grid              The street grid.
 * @param index             The slot index to update.
 * @param bonusPerNeighbor  Global multiplier on per-card coin synergy (defaults to 1).
 * @param soldSlots         Array of sold slot flags.
 */
export function syncCardCurrentIncome(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
  index: number,
  bonusPerNeighbor: number = 1,
  soldSlots: boolean[] = [],
): void {
  const card = grid[index];
  if (!card) return;
  card.currentIncome = computeBusinessIncome(grid, index, bonusPerNeighbor, soldSlots);
}

/**
 * Sets a card's `currentReputationPerTurn` field to match the per-card
 * reputation contribution (base rep + bonus + synergy).
 *
 * @param grid      The street grid.
 * @param index     The slot index to update.
 * @param soldSlots Array of sold slot flags.
 */
export function syncCardCurrentRepPerTurn(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
  index: number,
  soldSlots: boolean[] = [],
): void {
  const card = grid[index];
  if (!card) return;
  card.currentReputationPerTurn = computeSingleCardReputation(grid, index, soldSlots);
}

/**
 * Recalculates both `currentIncome` and `currentReputationPerTurn` for a
 * single card at `index`, using the existing compute functions.
 *
 * Reads `config.synergyBonusPerNeighbor` from the game state and respects
 * the `soldSlots` array (sold cards are skipped).
 *
 * @param state Current game state.
 * @param index The slot index to recalculate.
 */
export function recalculateCard(
  state: MainStreetState,
  index: number,
): void {
  if (state.soldSlots[index]) return;
  if (!state.streetGrid[index]) return;
  syncCardCurrentIncome(
    state.streetGrid,
    index,
    state.config.synergyBonusPerNeighbor,
    state.soldSlots,
  );
  syncCardCurrentRepPerTurn(
    state.streetGrid,
    index,
    state.soldSlots,
  );
}

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
 * Computes the total synergy bonus contributed by hand cards to tableau businesses.
 *
 * Each hand card contributes Math.floor(card.baseIncome / 3) to each tableau
 * business that shares at least one synergy type.
 *
 * @param grid  The street grid (tableau businesses).
 * @param hand  Cards held in the player's hand.
 * @returns The total hand card synergy bonus added to all tableau businesses.
 */
export function computeHandCardSynergyBonus(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
  hand: (BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard)[],
  soldSlots: boolean[] = [],
): number {
  if (!hand || hand.length === 0) return 0;

  let total = 0;

  for (const handCard of hand) {
    // Event and upgrade cards have no synergy types — only business cards contribute.
    if (handCard.family === 'event' || handCard.family === 'upgrade') continue;
    if (!handCard.synergyTypes || handCard.synergyTypes.length === 0) continue;

    // Each hand card provides floor(baseIncome/3) to each matching synergy business
    const bonusPerMatch = Math.floor(handCard.baseIncome / 3);
    if (bonusPerMatch <= 0) continue;

    for (let i = 0; i < grid.length; i++) {
      // Skip sold slots (sold cards don't benefit from synergy)
      if (soldSlots[i]) continue;
      const business = grid[i];
      if (!business) continue;

      // A card with zero synergy values does not participate in synergy
      if (effectiveSynergyCoinBonus(business) === 0 && effectiveSynergyRepBonus(business) === 0) {
        continue;
      }
      // Check if any of the hand card's synergy types match the business's types
      const hasMatch = handCard.synergyTypes.some(
        (st: SynergyType) => business.synergyTypes.includes(st),
      );
      if (hasMatch) {
        total += bonusPerMatch;
      }
    }
  }

  return total;
}

/**
 * Computes the total income across all businesses on the street grid,
 * optionally including synergy bonuses from hand cards.
 *
 * Returns both the total and a per-slot breakdown for UI display.
 *
 * @param grid               The street grid.
 * @param bonusPerNeighbor   Global multiplier on per-card coin synergy (defaults to 1).
 * @param hand               Optional: hand cards to include for synergy bonuses.
 * @returns Object with `total` income and `breakdown` per slot.
 */
export function computeIncome(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
  bonusPerNeighbor: number = 1,
  hand?: BusinessCard[],
  soldSlots: boolean[] = [],
): IncomeResult {
  const breakdown: SlotIncome[] = [];
  let total = 0;

  // Compute per-slot tableau income (skip sold slots)
  for (let i = 0; i < grid.length; i++) {
    if (soldSlots[i]) continue;
    const business = grid[i];
    if (!business) continue;

    let base = business.baseIncome + business.incomeBonus;
    // Same-type penalty: reduce base income to 60% when adjacent to a same-type business
    if (hasAdjacentSameType(grid, i, soldSlots)) {
      base = base * 0.6;
    }
    const synergy = computeSynergyBonus(grid, i, bonusPerNeighbor, soldSlots);
    const slotTotal = base + synergy;

    breakdown.push({
      slotIndex: i,
      businessName: business.name,
      baseIncome: base,
      synergyBonus: synergy,
      total: slotTotal,
    });

    total += slotTotal;
  }

  // Add hand card synergy bonuses to the total
  let handSynergyTotal = 0;
  if (hand && hand.length > 0) {
    handSynergyTotal = computeHandCardSynergyBonus(grid, hand, soldSlots);
    total += handSynergyTotal;

    // Add hand synergy to each slot's total in the breakdown
    // Distribute proportionally for accurate per-slot display
    if (handSynergyTotal > 0) {
      for (let i = 0; i < grid.length; i++) {
        const business = grid[i];
        if (!business) continue;

        // Calculate hand synergy contribution per business
        let perSlotHandSynergy = 0;
        for (const handCard of hand) {
          if (!handCard.synergyTypes || handCard.synergyTypes.length === 0) continue;
              const hasMatch = handCard.synergyTypes.some(
            (st: SynergyType) => business.synergyTypes.includes(st),
          );
          if (hasMatch) {
            perSlotHandSynergy += Math.floor(handCard.baseIncome / 3);
          }
        }

        if (perSlotHandSynergy > 0) {
          const slot = breakdown.find(s => s.slotIndex === i);
          if (slot) {
            slot.total += perSlotHandSynergy;
          }
        }
      }
    }
  }

  // ── Per-phase breakdown (CG-0MT23O6W8003AXWJ) ──────────────
  // computeIncome is a preview/read-only path (no multipliers / active
  // effects), so phase data is base + synergy only; rep/event/upcoming
  // phases are zero. Slots keep the exact totals used above.
  const perSlotBreakdown: SlotPhaseBreakdown[] = breakdown.map(b => ({
    slotIndex: b.slotIndex,
    businessName: b.businessName,
    baseIncome: b.total,
    synergyBonus: 0,
    repBonus: 0,
    eventDeltas: [],
    upcomingDeltas: [],
  }));
  const sumBase = perSlotBreakdown.reduce((acc, s) => acc + s.baseIncome, 0) || 0;
  if (handSynergyTotal > 0) {
    for (const pd of perSlotBreakdown) {
      if (sumBase > 0) pd.synergyBonus = handSynergyTotal * (pd.baseIncome / sumBase);
    }
  }

  return {
    total,
    breakdown,
    handSynergyTotal,
    phaseBreakdown: { perSlotBreakdown, handSynergyTotal },
  };
}

/**
 * Computes total reputation per turn from all occupied grid slots.
 *
 * Each business/community-space card may contribute:
 * - Its base `reputationPerTurn` (from the card definition)
 * - Its accumulated `reputationBonus` (from applied upgrades)
 * - Synergy reputation from matching neighbors via `synergyRepBonus`
 *
 * @param grid  The street grid.
 * @returns Total reputation per turn.
 */
export function computeReputationPerTurn(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
  soldSlots: boolean[] = [],
): number {
  let total = 0;
  for (let i = 0; i < grid.length; i++) {
    // Skip sold slots (sold cards don't generate reputation)
    if (soldSlots[i]) continue;
    const slot = grid[i];
    if (!slot) continue;
    total += slot.reputationPerTurn ?? 0;
    total += slot.reputationBonus;
    // Add synergy reputation from matching neighbors
    total += computeSynergyRepBonus(grid, i, soldSlots);
  }
  return total;
}

/**
 * Applies income to the player's resource bank.
 * Mutates state in-place. Uses config.synergyBonusPerNeighbor from the
 * active difficulty preset.
 *
 * Income is scaled by the reputation coin multiplier (CG-0MMLR38NJ1N11DOS)
 * so that higher reputation yields proportionally more income.
 *
 * Reputation-per-turn from cards (e.g. Clinic) is applied during this phase.
 *
 * @param state  Current game state (mutated).
 * @returns The IncomeResult for UI display (pre-multiplier breakdown,
 *          but total reflects the multiplied amount actually credited).
 */
export function applyIncome(state: MainStreetState): IncomeResult {
  const hand = state.hand ?? [];
  const soldSlots = state.soldSlots ?? [];
  const grid = state.streetGrid;

  // Specialization skills of all employed staff (I4, CG-0MT4WXV2J000M35M).
  // Buffs are folded in READ-ONLY at income time — the per-card currentIncome
  // cache is never mutated, so hiring/editing staff never leaves stale caches
  // (AC2: no conflicts with the adjacency caching contract).
  const employedSkills = getEmployedSpecializationSkills(state);

  // Read cached currentIncome for each active slot instead of calling
  // computeBusinessIncome from scratch every turn.
  // If a card doesn't have currentIncome set (undefined, e.g. legacy saves
  // or tests that place cards directly on the grid), fall back to computing
  // it from scratch.
  const breakdown: SlotIncome[] = [];
  let total = 0;
  for (let i = 0; i < grid.length; i++) {
    if (soldSlots[i]) continue;
    const card = grid[i];
    if (!card) continue;

    const slotIncome = card.currentIncome ?? 0;
    // Per-business income skill buffs: +pct of the business's cached income,
    // plus a flat coin bonus (chef/dj/sales-champion — I4).
    const buffs = computePerBusinessSkillBuffs(employedSkills, {
      synergyTypes: (card as BusinessCard).synergyTypes ?? [],
      baseIncome: (card as BusinessCard).baseIncome ?? 0,
      ongoingCost: (card as BusinessCard).ongoingCost ?? 0,
    });
    const buffedIncome = slotIncome * (1 + buffs.income.percent) + buffs.income.flat;
    breakdown.push({
      slotIndex: i,
      businessName: card.name,
      baseIncome: slotIncome,
      synergyBonus: 0,
      total: buffedIncome,
    });
    total += buffedIncome;
  }

  // ── Per-phase breakdown for animated income (CG-0MT23O6W8003AXWJ) ──
  // Build phase data alongside the existing breakdown.
  // Each field holds exact fractional values — rounding to nearest 0.5
  // is done at the animation layer, not here.
  const phaseSlotData: SlotPhaseBreakdown[] = breakdown.map(b => ({
    slotIndex: b.slotIndex,
    businessName: b.businessName,
    baseIncome: b.total,  // buffedIncome is the effective base
    synergyBonus: 0,
    repBonus: 0,
    eventDeltas: [],
    upcomingDeltas: [],
  }));

  // Apply active effect income modifiers per-slot, before reputation multiplier.
  // Each slot's income is individually multiplied, then summed.
  // Also compute per-event deltas for the phase breakdown.
  let modifiedTotal = 0;
  for (let bi = 0; bi < breakdown.length; bi++) {
    const slot = breakdown[bi];
    const phaseSlot = phaseSlotData[bi];
    // Apply each income-multiplier effect individually to track per-effect deltas
    let runningValue = slot.total;
    for (const effect of state.activeEffects) {
      if (effect.effectType !== 'income-multiplier') continue;
      const newVal = runningValue * effect.multiplier;
      const delta = newVal - runningValue;
      phaseSlot.eventDeltas.push({
        cardId: effect.sourceEventId,
        name: effect.description,
        delta,
      });
      runningValue = newVal;
    }
    modifiedTotal += runningValue;
  }

  const multiplied = applyReputationMultiplier(
    modifiedTotal,
    state.resourceBank.reputation,
    state.config,
  );
  state.resourceBank.coins += multiplied;

  // Sum reputation per turn from cached values (skip sold slots)
  let repPerTurn = 0;
  for (let i = 0; i < grid.length; i++) {
    if (soldSlots[i]) continue;
    const card = grid[i];
    if (!card) continue;
    const baseRep = card.currentReputationPerTurn ?? 0;
    // Per-business reputation skill buffs (community-builder +0.1 all,
    // pr-strategist +0.15 Service; I4).
    const buffs = computePerBusinessSkillBuffs(employedSkills, {
      synergyTypes: (card as BusinessCard).synergyTypes ?? [],
      baseIncome: (card as BusinessCard).baseIncome ?? 0,
      ongoingCost: (card as BusinessCard).ongoingCost ?? 0,
    });
    repPerTurn += baseRep + buffs.reputation.flat;
  }
  // Staff reputation abilities (e.g. the Socialite's +0.1 rep/turn —
  // Group F, CG-0MSQJ7VL9009JHF4) also accrue during the income phase.
  for (const staff of state.staffCards ?? []) {
    repPerTurn += staff.reputationPerTurn ?? 0;
  }
  // Apply active effect rep modifiers (e.g. Community Renovation's
  // rep-multiplier 1.2x — Group C, CG-0MSQJ244M0055X7S). Multipliers are
  // composed multiplicatively, matching the income-multiplier behaviour.
  const modifiedRepPerTurn = applyActiveEffectMultiplier(
    state.activeEffects,
    'rep-multiplier',
    repPerTurn,
  );
  if (modifiedRepPerTurn !== 0) {
    state.resourceBank.reputation += modifiedRepPerTurn;
  }

  // Hand card synergy is still computed fresh each turn (it is not adjacency-based
  // and operates on hand cards whose state changes independently).
  let handSynergyTotal = 0;
  if (hand && hand.length > 0) {
    handSynergyTotal = computeHandCardSynergyBonus(grid, hand, soldSlots);
    total += handSynergyTotal;
  }

  // ── Distribute rep bonus + hand synergy across producing slots ──
  // `multiplied` is the actual credited amount; `modifiedTotal` is the total
  // after income-multiplier effects. The reputation phase contributes
  // `multiplied - modifiedTotal`, distributed proportionally to each slot's
  // post-effect income. Hand synergy is distributed proportionally to base
  // income. Exact fractional values throughout (Q8: rounding at animation).
  const repBonus = multiplied - modifiedTotal;
  const sumPhaseTotal = phaseSlotData.reduce((acc, s) => acc + s.baseIncome, 0) || 0;
  const modifiedSlotTotals = phaseSlotData.map(
    (d) => d.baseIncome + d.eventDeltas.reduce((acc, e) => acc + e.delta, 0),
  );
  const sumModifiedSlotTotals = modifiedSlotTotals.reduce((acc, v) => acc + v, 0) || 0;
  for (let i = 0; i < phaseSlotData.length; i++) {
    const pd = phaseSlotData[i];
    if (sumModifiedSlotTotals > 0) {
      pd.repBonus = repBonus * (modifiedSlotTotals[i] / sumModifiedSlotTotals);
    }
    if (sumPhaseTotal > 0 && handSynergyTotal > 0) {
      pd.synergyBonus = handSynergyTotal * (pd.baseIncome / sumPhaseTotal);
    }
  }

  syncResourceBankToLedger(state);
  if (multiplied > 0) {
    // CG-0MREYZO7E00729S0: show 3 decimal places for fractional coin values
    addLog(state, `Income: +${multiplied.toFixed(3)} coins`, 'gain');
  } else {
    addLog(state, `Income: +0.000 coins`, 'neutral');
  }
  if (repPerTurn > 0) {
    addLog(state, `Reputation from cards: +${repPerTurn}`, 'gain');
  }
  if (handSynergyTotal > 0) {
    addLog(state, `Hand card synergy: +${handSynergyTotal} coins`, 'gain');
  }
  return {
    total,
    breakdown,
    handSynergyTotal,
    phaseBreakdown: {
      perSlotBreakdown: phaseSlotData,
      handSynergyTotal,
    },
  };
}

// ── Synergy Pairs for Visual Lines ──────────────────────────

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
    const neighborIndices = neighbors(i, range);

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
export interface SlotIncome {
  slotIndex: number;
  businessName: string;
  baseIncome: number;
  synergyBonus: number;
  /** Total income from this slot including hand synergy contributions. */
  total: number;
}

/** Per-event income-multiplier delta for a single slot. */
export interface SlotEventDelta {
  /** The card/event ID that created this active effect. */
  cardId: string;
  /** Human-readable effect name. */
  name: string;
  /** The net coin delta contributed by this effect (negative = reduction). */
  delta: number;
}

/**
 * Per-slot phase breakdown for the phased income animation (CG-0MT23O6W8003AXWJ).
 *
 * Each field represents an exact fractional amount — per-phase rounding to
 * nearest 0.5 is applied at the animation layer, not here.
 */
export interface SlotPhaseBreakdown {
  slotIndex: number;
  businessName: string;
  /** Base income for this slot (after staff buffs, before event/rep multipliers). */
  baseIncome: number;
  /** Hand-card synergy bonus distributed to this slot. */
  synergyBonus: number;
  /** Additional coins from the reputation multiplier. */
  repBonus: number;
  /** Per-event income-multiplier deltas (e.g. Flu Outbreak 0.8×). */
  eventDeltas: SlotEventDelta[];
  /** Upcoming-card income deltas (placeholder — not yet wired). */
  upcomingDeltas: SlotEventDelta[];
}

/**
 * Phase-based breakdown of income contributions for the animated income system.
 *
 * Used by `MainStreetAnimator.animateIncomePhases()` to render the phased
 * coin-grid animation (base → synergy → reputation → events → upcoming).
 */
export interface PhaseBreakdown {
  /** Per-slot phase data for all producing slots. */
  perSlotBreakdown: SlotPhaseBreakdown[];
  /** Total synergy contributed by hand cards (distributed proportionally across slots). */
  handSynergyTotal: number;
}

/** Full income computation result. */
export interface IncomeResult {
  /** Total coins earned from all businesses (includes hand synergy if provided). */
  total: number;
  /** Per-slot breakdown. */
  breakdown: SlotIncome[];
  /** Total synergy contributed by hand cards. */
  handSynergyTotal: number;
  /**
   * Per-phase contribution breakdown for animated income presentation.
   *
   * Each phase value is an exact fractional number; rounding to nearest 0.5
   * is done at the animation layer.
   */
  phaseBreakdown: PhaseBreakdown;
}
