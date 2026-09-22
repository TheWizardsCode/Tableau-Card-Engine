/**
 * Main Street: Adjacency & Income Calculation
 *
 * Implements the adjacency resolver for the street lattice and income
 * computation (base income + synergy bonuses). The legacy 2x5 board is the 1×1
 * case of a general city-block grid of 5×2 street cells (each street owns its
 * own ten plots; see the "Expanded Grid Topology" section below).
 * Upgrades can extend synergy range beyond the default 1-cell 8-way (Chebyshev)
 * adjacency.
 *
 * @module
 */

import type { BusinessCard, CommunitySpaceCard, SynergyType } from './MainStreetCards';
import { getBaseTypeId } from './MainStreetCards';
import { GRID_SIZE, STREET_COLS, STREET_ROWS, WORLD_STRIDE_X, WORLD_STRIDE_Y, worldWidth, worldHeight, worldSlotCount } from './MainStreetCards';

// Re-exported so existing consumers keep importing world geometry from here.
export { worldWidth, worldHeight, worldSlotCount };
import type { MainStreetState } from './MainStreetState';
import { addLog, describeEventEffects, syncResourceBankToLedger } from './MainStreetState';
import { applyReputationMultiplier, roundInt } from './MainStreetDifficulty';
import { applyActiveEffectMultiplier } from '../../src/core-engine/ActiveEffect';
import {
  computePerBusinessSkillBuffs,
  getEmployedSpecializationSkillsForBusiness,
} from './MainStreetStaffBuffs';

// ── Adjacency Resolver ──────────────────────────────────────

/**
 * Returns the indices of neighboring slots within a given range on the
 * legacy 1×1 (2x5, 10-slot) Main Street grid.
 *
 * Slot indices are row-major:
 *   row 0: 0..4
 *   row 1: 5..9
 *
 * Adjacency is 8-way (Chebyshev distance: max(|dx|, |dy|) <= range), so
 * diagonally adjacent slots count at every range. Default range is 1 (the 8
 * surrounding slots); upgrades extend this radius as larger 8-way squares.
 *
 * This is a 1×1 convenience wrapper over the single world-coordinate resolver
 * (`resolveNeighbors`), which also handles expanded lattices — there is only
 * one adjacency implementation (CG-0MTYMD2Q5008UXB9).
 *
 * @param index  The slot index to find neighbors for.
 * @param range  How far to look in each direction (default 1).
 * @returns Ascending array of neighbor indices (excluding the slot itself).
 */
export function neighbors(index: number, range: number = 1): number[] {
  return resolveNeighbors(index, range);
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
export function hasAdjacentSameType(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
  index: number,
  soldSlots: boolean[] = [],
  gridDims?: GridDims,
): boolean {
  const card = grid[index];
  if (!card) return false;
  if (soldSlots[index]) return false;

  const baseType = getBaseTypeId(card.id);
  // Use range 1 (default) for same-type check; upgrades don't affect this penalty
  const neighborIndices = resolveNeighbors(index, 1, gridDims);

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
  gridDims?: GridDims,
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
  const neighborIndices = resolveNeighbors(index, range, gridDims);

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
  if (hasAdjacentSameType(grid, index, soldSlots, gridDims)) {
    effectiveBase = roundInt(effectiveBase * 0.6);
  }

  // Percentage-based synergy → rounded to nearest integer (AC3)
  return roundInt(effectiveBase * rate * bonusPerNeighbor * matchingCount);
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
  gridDims?: GridDims,
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
  const neighborIndices = resolveNeighbors(index, range, gridDims);

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
  gridDims?: GridDims,
): number {
  // Sold cards produce no income
  if (soldSlots[index]) return 0;
  const business = grid[index];
  if (!business) return 0;

  let base = business.baseIncome + business.incomeBonus;
  // Same-type penalty: reduce base income to 60% when adjacent to a same-type business
  if (hasAdjacentSameType(grid, index, soldSlots, gridDims)) {
    base = roundInt(base * 0.6);
  }
  const synergy = computeSynergyBonus(grid, index, bonusPerNeighbor, soldSlots, gridDims);
  // base already integer, synergy rounded above; final sum stays integer
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
  gridDims?: GridDims,
): number {
  if (soldSlots[index]) return 0;
  const slot = grid[index];
  if (!slot) return 0;
  return (slot.reputationPerTurn ?? 0) + slot.reputationBonus + computeSynergyRepBonus(grid, index, soldSlots, gridDims);
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
  gridDims?: GridDims,
): void {
  const card = grid[index];
  if (!card) return;
  card.currentIncome = computeBusinessIncome(grid, index, bonusPerNeighbor, soldSlots, gridDims);
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
  gridDims?: GridDims,
): void {
  const card = grid[index];
  if (!card) return;
  card.currentReputationPerTurn = computeSingleCardReputation(grid, index, soldSlots, gridDims);
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
  const gridDims = state.streetGridCols && state.streetGridRows
    ? { cols: state.streetGridCols, rows: state.streetGridRows }
    : undefined;
  syncCardCurrentIncome(
    state.streetGrid,
    index,
    state.config.synergyBonusPerNeighbor,
    state.soldSlots,
    gridDims,
  );
  syncCardCurrentRepPerTurn(
    state.streetGrid,
    index,
    state.soldSlots,
    gridDims,
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
 * Computes the total income across all businesses on the street grid.
 *
 * Returns both the total and a per-slot breakdown for UI display. Board
 * adjacency synergy (computeSynergyBonus) is folded into each slot's total;
 * hand cards never contribute (producer rule CG-0MTRDX0DN004EECN).
 *
 * @param grid               The street grid.
 * @param bonusPerNeighbor   Global multiplier on per-card coin synergy (defaults to 1).
 * @param hand               Retained for API compatibility; hand cards have no effect.
 * @returns Object with `total` income and `breakdown` per slot.
 */
export function computeIncome(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
  bonusPerNeighbor: number = 1,
  // Hand cards are not in play and never contribute synergy (CG-0MTRDX0DN004EECN);
  // the parameter is retained for positional-argument compatibility.
  _hand?: BusinessCard[],
  soldSlots: boolean[] = [],
  gridDims?: GridDims,
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
    if (hasAdjacentSameType(grid, i, soldSlots, gridDims)) {
      base = roundInt(base * 0.6);
    }
    const synergy = computeSynergyBonus(grid, i, bonusPerNeighbor, soldSlots, gridDims);
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

  // Hand cards are NOT in play and contribute no synergy (producer rule,
  // 2026-09-07 — CG-0MTRDX0DN004EECN). The `hand` parameter is retained for
  // API compatibility but is intentionally ignored.
  const handSynergyTotal = 0;

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
  gridDims?: GridDims,
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
    total += computeSynergyRepBonus(grid, i, soldSlots, gridDims);
  }
  return total;
}

/**
 * Applies income to the player's resource bank.
 *
 * Canonical turn-economy segment (CG-0MTINZ5GG007BH44, Q1=c — see
 * MainStreetDifficulty header): dayStart snapshot → placement deductions →
 * this breakdown (staff buffs → income-multiplier effects → rep multiplier)
 * → ongoing costs → incident → net row. Hand cards contribute no income
 * (CG-0MTRDX0DN004EECN). The reputation multiplier is sampled here AFTER
 * rep-per-turn has already been credited (Q1=c), so buildCoinsTooltip's
 * preview and this credited path agree when both read the post-income rep.
 *
 * Mutates state in-place. Uses config.synergyBonusPerNeighbor from the
 * active difficulty preset. Reputation-per-turn from cards (e.g. Clinic)
 * is applied during this phase.
 *
 * @param state  Current game state (mutated).
 * @returns The IncomeResult for UI display (pre-multiplier breakdown,
 *          but total reflects the multiplied amount actually credited).
 */
export function applyIncome(
  state: MainStreetState,
  opts?: { apply?: boolean },
): IncomeResult {
  const soldSlots = state.soldSlots ?? [];
  const grid = state.streetGrid;

  // Specialization skills of the staff EMPLOYED at each business slot
  // (CG-0MSTOATDU006UGAX). Per-business income buffs are scoped to the
  // employing business: a Chef only buffs the Food business it works at, and
  // hand-slot market staff (no employedAtSlot) contribute no per-business
  // buffs. Buffs are folded in READ-ONLY at income time — the per-card
  // currentIncome cache is never mutated, so hiring/editing staff never
  // leaves stale caches (AC2: no conflicts with the adjacency caching
  // contract). Street-wide skills (cost-cutter, incident mitigation, etc.)
  // still aggregate over ALL staff via getEmployedSpecializationSkills.
  const breakdown: SlotIncome[] = [];
  let total = 0;
  for (let i = 0; i < grid.length; i++) {
    if (soldSlots[i]) continue;
    const card = grid[i];
    if (!card) continue;

    const slotIncome = card.currentIncome ?? 0;
    // Per-business income skill buffs: +pct of the business's cached income,
    // plus a flat coin bonus (chef/dj/sales-champion — I4). Fed by the staff
    // employed AT this slot only (CG-0MSTOATDU006UGAX).
    const buffs = computePerBusinessSkillBuffs(getEmployedSpecializationSkillsForBusiness(state, i), {
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
  // Each field holds exact integer values
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
  // Each slot's income is individually multiplied (integer-rounded — AC3),
  // then summed. Also compute per-event deltas for the phase breakdown.
  let modifiedTotal = 0;
  for (let bi = 0; bi < breakdown.length; bi++) {
    const slot = breakdown[bi];
    const phaseSlot = phaseSlotData[bi];
    // Apply each income-multiplier effect individually to track per-effect deltas
    let runningValue = slot.total;
    for (const effect of state.activeEffects) {
      if (effect.effectType !== 'income-multiplier') continue;
      const newVal = roundInt(runningValue * effect.multiplier);
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
  // Deferred-mutation path (CG-0MTR72P14000VO6Q): when `apply === false` the
  // coin delta is computed but NOT applied — the caller (the interactive
  // scene) applies it after the end-of-turn animations complete. The
  // headless/AI path keeps the legacy immediate-apply behaviour.
  const coinDelta = multiplied;
  if (opts?.apply !== false) {
    state.resourceBank.coins += multiplied;
  }

  // Sum reputation per turn from cached values (skip sold slots)
  let repPerTurn = 0;
  for (let i = 0; i < grid.length; i++) {
    if (soldSlots[i]) continue;
    const card = grid[i];
    if (!card) continue;
    const baseRep = card.currentReputationPerTurn ?? 0;
    // Per-business reputation skill buffs (community-builder +0.1 all,
    // pr-strategist +0.15 Service; I4) — scoped to this slot's employees
    // (CG-0MSTOATDU006UGAX).
    const buffs = computePerBusinessSkillBuffs(getEmployedSpecializationSkillsForBusiness(state, i), {
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
  const modifiedRepPerTurn = roundInt(applyActiveEffectMultiplier(
    state.activeEffects,
    'rep-multiplier',
    repPerTurn,
  ));
  // Deferred-mutation path (CG-0MTR72P14000VO6Q): same treatment as the coin
  // delta above.
  const repDelta = modifiedRepPerTurn !== 0 ? modifiedRepPerTurn : 0;
  if (opts?.apply !== false) {
    state.resourceBank.reputation += modifiedRepPerTurn;
  }

  // Hand cards are NOT in play — they contribute no street income. Only
  // businesses placed on the street produce synergy (baked into currentIncome
  // / baseIncome). handSynergyTotal is kept as a constant 0 for API compat.
  const handSynergyTotal = 0;

  // ── Distribute rep bonus across producing slots ──
  // `multiplied` is the actual credited amount; `modifiedTotal` is the total
  // after income-multiplier effects. The reputation phase contributes
  // `multiplied - modifiedTotal`, distributed proportionally to each slot's
  // post-effect income. Exact integer values throughout.
  const repBonus = multiplied - modifiedTotal;
  const modifiedSlotTotals = phaseSlotData.map(
    (d) => d.baseIncome + d.eventDeltas.reduce((acc, e) => acc + e.delta, 0),
  );
  const sumModifiedSlotTotals = modifiedSlotTotals.reduce((acc, v) => acc + v, 0) || 0;
  for (let i = 0; i < phaseSlotData.length; i++) {
    const pd = phaseSlotData[i];
    if (sumModifiedSlotTotals > 0) {
      pd.repBonus = repBonus * (modifiedSlotTotals[i] / sumModifiedSlotTotals);
    }
  }

  if (opts?.apply !== false) {
    syncResourceBankToLedger(state);
  }
  if (multiplied > 0) {
    // Integer economy: no decimal formatting (CG-0MTIO1M15001E9Y6).
    // Enriched with the effective coin delta (CG-0MT5W7UJJ0065MEZ).
    addLog(state, `Income: +${multiplied} coins (${describeEventEffects(multiplied, 0)})`, 'gain');
  } else {
    addLog(state, `Income: +0 coins (${describeEventEffects(0, 0)})`, 'neutral');
  }
  if (repPerTurn > 0) {
    addLog(state, `Reputation from cards: +${repPerTurn} (${describeEventEffects(0, repPerTurn)})`, 'gain');
  }
  return {
    total,
    breakdown,
    handSynergyTotal,
    phaseBreakdown: {
      perSlotBreakdown: phaseSlotData,
      handSynergyTotal,
    },
    coinDelta,
    repDelta,
  };
}

// ── Per-Owner Income Routing (competitive, CG-0MTIIL6J200291ZQ) ──

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

/** Per-owner income result: owner index + that owner's IncomeResult. */
export interface OwnerIncomeResult {
  /** The player index this income belongs to (index into state.players). */
  ownerId: number;
  /** Standard IncomeResult computed over the owner's own slots/wallet. */
  income: IncomeResult;
}

/**
 * Applies income per-owner for competitive states (N >= 2).
 *
 * Each placed business's income (base + adjacency synergy + upgrades — all
 * folded into the `currentIncome` cache by the adjacency system — plus
 * per-business staff buffs) accrues ONLY to the slot's owning player
 * (`ownerTaggedGrid`, falling back to the active player for untagged slots).
 * Hand cards contribute no income (CG-0MTRDX0DN004EECN). Per-owner
 * reputation drives the reputation coin multiplier independently; shared
 * `activeEffects` income/rep multipliers apply to every owner's income phase
 * (board-wide duration effects, unchanged semantics).
 *
 * `applyIncome(state)` above is left byte-identical for single-player / N=1
 * (AC4 regression: the N=1 flow delegates to the legacy path and never
 * reaches this function).
 *
 * Determinism: consumes no RNG — pure function of the current grid/state,
 * so seeded replay reproduces identical per-owner sequences (AC3).
 *
 * @param state  Competitive game state (players[] wallets mutated in-place).
 * @returns Per-owner income results (empty when not competitive).
 */
export function applyCompetitiveIncome(state: MainStreetState): OwnerIncomeResult[] {
  // Single-player / N=1 fallback: keep the shared income path unchanged.
  if (!state.players || state.players.length < 2) {
    applyIncome(state);
    return [];
  }

  const soldSlots = state.soldSlots ?? [];
  const grid = state.streetGrid;
  const results: OwnerIncomeResult[] = [];

  for (const player of state.players) {
    const ownerId = player.playerId;
    const breakdown: SlotIncome[] = [];
    let total = 0;
    let repPerTurn = 0;

    // Income / reputation from slots THIS owner owns (skip sold).
    for (let i = 0; i < grid.length; i++) {
      if (soldSlots[i]) continue;
      const card = grid[i];
      if (!card) continue;
      if (getSlotOwnerId(state, i) !== ownerId) continue;

      const slotIncome = card.currentIncome ?? 0;
      const profile = {
        synergyTypes: (card as BusinessCard).synergyTypes ?? [],
        baseIncome: (card as BusinessCard).baseIncome ?? 0,
        ongoingCost: (card as BusinessCard).ongoingCost ?? 0,
      };
      const buffs = computePerBusinessSkillBuffs(
        getEmployedSpecializationSkillsForBusiness(state, i),
        profile,
      );
      const buffedIncome = slotIncome * (1 + buffs.income.percent) + buffs.income.flat;
      breakdown.push({
        slotIndex: i,
        businessName: card.name,
        baseIncome: slotIncome,
        synergyBonus: 0,
        total: buffedIncome,
      });
      total += buffedIncome;

      const baseRep = card.currentReputationPerTurn ?? 0;
      const repBuffs = computePerBusinessSkillBuffs(
        getEmployedSpecializationSkillsForBusiness(state, i),
        profile,
      );
      repPerTurn += baseRep + repBuffs.reputation.flat;
    }

    // Staff reputation abilities owned by THIS player (per-player staff).
    for (const staff of player.staffCards ?? []) {
      repPerTurn += staff.reputationPerTurn ?? 0;
    }

    // ── Phase breakdown + active-effect income multipliers (mirrors applyIncome) ──
    const phaseSlotData: SlotPhaseBreakdown[] = breakdown.map(b => ({
      slotIndex: b.slotIndex,
      businessName: b.businessName,
      baseIncome: b.total,
      synergyBonus: 0,
      repBonus: 0,
      eventDeltas: [],
      upcomingDeltas: [],
    }));
    let modifiedTotal = 0;
    for (let bi = 0; bi < breakdown.length; bi++) {
      const slot = breakdown[bi];
      const phaseSlot = phaseSlotData[bi];
      let runningValue = slot.total;
      for (const effect of state.activeEffects) {
        if (effect.effectType !== 'income-multiplier') continue;
        const newVal = roundInt(runningValue * effect.multiplier);
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

    const multiplied = applyReputationMultiplier(modifiedTotal, player.reputation, state.config);
    player.coins += multiplied;

    const modifiedRepPerTurn = roundInt(applyActiveEffectMultiplier(
      state.activeEffects,
      'rep-multiplier',
      repPerTurn,
    ));
    if (modifiedRepPerTurn !== 0) {
      player.reputation += modifiedRepPerTurn;
    }

    // Hand cards are not in play — no hand synergy from any owner's hand
    // (producer rule CG-0MTRDX0DN004EECN). Constant 0 for API compatibility.
    const handSynergyTotal = 0;

    const repBonus = multiplied - modifiedTotal;
    const modifiedSlotTotals = phaseSlotData.map(
      (d) => d.baseIncome + d.eventDeltas.reduce((acc, e) => acc + e.delta, 0),
    );
    const sumModifiedSlotTotals = modifiedSlotTotals.reduce((acc, v) => acc + v, 0) || 0;
    for (let i = 0; i < phaseSlotData.length; i++) {
      const pd = phaseSlotData[i];
      if (sumModifiedSlotTotals > 0) {
        pd.repBonus = repBonus * (modifiedSlotTotals[i] / sumModifiedSlotTotals);
      }
    }

    if (multiplied > 0) {
      addLog(state, `P${ownerId} Income: +${multiplied} coins (${describeEventEffects(multiplied, 0)})`, 'gain');
    } else {
      addLog(state, `P${ownerId} Income: +0 coins (${describeEventEffects(0, 0)})`, 'neutral');
    }
    if (modifiedRepPerTurn > 0) {
      addLog(state, `P${ownerId} Reputation from cards: +${modifiedRepPerTurn} (${describeEventEffects(0, modifiedRepPerTurn)})`, 'gain');
    }

    results.push({
      ownerId,
      income: {
        total,
        breakdown,
        handSynergyTotal,
        phaseBreakdown: {
          perSlotBreakdown: phaseSlotData,
          handSynergyTotal,
        },
      },
    });
  }

  return results;
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
export interface SlotIncome {
  slotIndex: number;
  businessName: string;
  baseIncome: number;
  synergyBonus: number;
  /** Total income from this slot (base + board adjacency synergy). */
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
 * Each field represents an exact integer amount.
 */
export interface SlotPhaseBreakdown {
  slotIndex: number;
  businessName: string;
  /** Base income for this slot (after staff buffs, before event/rep multipliers). */
  baseIncome: number;
  /**
   * Reserved for a dedicated synergy income phase. Always 0 today — board
   * adjacency synergy is folded into `baseIncome` (currentIncome), and
   * hand-card synergy was removed (CG-0MTRDX0DN004EECN: cards in the hand
   * are not in play).
   */
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
  /**
   * Total hand-card synergy. Always 0 — cards in the hand are not in play
   * and contribute no street income (CG-0MTRDX0DN004EECN). Field retained
   * for API compatibility.
   */
  handSynergyTotal: number;
}

/** Full income computation result. */
export interface IncomeResult {
  /** Total coins earned from all placed businesses (base + board synergy). */
  total: number;
  /** Per-slot breakdown. */
  breakdown: SlotIncome[];
  /** Always 0 — hand cards are not in play (CG-0MTRDX0DN004EECN). */
  handSynergyTotal: number;
  /**
   * Per-phase contribution breakdown for animated income presentation.
   *
   * Each phase value is an integer; no fractional rounding needed
   * is done at the animation layer.
   */
  phaseBreakdown: PhaseBreakdown;
  /**
   * Computed coin delta for this income calculation. When `apply === false`
   * (deferred-mutation path, CG-0MTR72P14000VO6Q) this is NOT applied to
   * `state.resourceBank` — the caller applies it after the end-of-turn
   * animation window closes. Optional: legacy callers/constructions may omit it.
   */
  coinDelta?: number;
  /**
   * Computed reputation delta for this income calculation. Deferred-mutation
   * semantics mirror `coinDelta` (CG-0MTR72P14000VO6Q).
   */
  repDelta?: number;
}


// ═══════════════════════════════════════════════════════════
// Expanded Grid Topology — City-Block Grid (No Shared Plots)
// (CG-0MTH9OTI2008MYFY; re-modelled for roads in CG-0MT5Y1X5T001M4S6)
// ═══════════════════════════════════════════════════════════
// Each street cell is STREET_COLS × STREET_ROWS (5×2) slots and OWNS all ten of
// them. Street cells are tiled at a stride of exactly (STREET_COLS, STREET_ROWS)
// = (5, 2), so the world grid is the solid, hole-free rectangle
// `(STREET_COLS·cols) × (STREET_ROWS·rows)` and no two streets share a plot.
//
// Roads are a separate *visual* layer (see `MainStreetMapView` / the street
// renderer): one road cell is drawn between every pair of adjacent streets, so
// the board reads as a city-block grid of streets in rows and columns rather
// than one continuous block of plots. Roads never consume world slots.
//
// Because the world set is a contiguous rectangle, 8-way Chebyshev adjacency on
// world coordinates is exactly the adjacency the player sees — including across
// a road: the plot on a street's east edge is Chebyshev-adjacent to the plot on
// the neighbouring street's west edge, so cross-street synergy still works.
// World-index order is row-major: worldY ascending, then worldX ascending.
//
// NOTE (CG-0MTYMD2Q5008UXB9 / CG-0MT5Y1X5T001M4S6): an earlier revision shared
// each street's touching seam with its neighbour (a "planar seam-sharing"
// lattice — 10/18/15/27/39/52 slots — which merged adjacent streets into one
// solid block of plots). The city-block model below replaces it and the
// shared-seam node model was deleted. Saves written by the seam-sharing build
// are explicitly NOT migrated (producer decision: no backward compatibility).
// ═══════════════════════════════════════════════════════════

/** Maximum supported lattice dimensions (cols × rows of street cells). */
const MAX_GRID_COLS = 5;
const MAX_GRID_ROWS = 5;

/** Grid dimensions for expanded street layouts (cols × rows of 5×2 street cells). */
export interface GridDims {
  cols: number;
  rows: number;
}

function slotToLocal(slot: number): { lx: number; ly: number } {
  return { lx: slot % STREET_COLS, ly: Math.floor(slot / STREET_COLS) };
}

/**
 * Base world position of street (streetX,streetY) slot `slotIndex`.
 *
 * Each street owns its own plots, so every (street, slot) pair maps to a
 * distinct world position: `(streetX·STREET_COLS + lx, streetY·STREET_ROWS + ly)`.
 */
function baseWorld(
  streetX: number,
  streetY: number,
  slotIndex: number,
): { worldX: number; worldY: number } {
  const { lx, ly } = slotToLocal(slotIndex);
  return {
    worldX: streetX * WORLD_STRIDE_X + lx,
    worldY: streetY * WORLD_STRIDE_Y + ly,
  };
}

/**
 * The single (streetX, streetY, slotIndex) owner of a world node, or null when
 * the position falls outside a `cols`×`rows` lattice.
 *
 * In the city-block model every world position has exactly one owner (streets
 * never share plots), so this is a pure coordinate decode.
 */
function worldOwner(
  worldX: number,
  worldY: number,
  cols: number,
  rows: number,
): { streetX: number; streetY: number; slotIndex: number } | null {
  if (!Number.isInteger(worldX) || !Number.isInteger(worldY)) return null;
  const sx = Math.floor(worldX / WORLD_STRIDE_X);
  const sy = Math.floor(worldY / WORLD_STRIDE_Y);
  if (sx < 0 || sy < 0 || sx >= cols || sy >= rows) return null;
  const lx = worldX - sx * WORLD_STRIDE_X;
  const ly = worldY - sy * WORLD_STRIDE_Y;
  if (lx < 0 || lx >= STREET_COLS || ly < 0 || ly >= STREET_ROWS) return null;
  return { streetX: sx, streetY: sy, slotIndex: ly * STREET_COLS + lx };
}

/**
 * Maps (streetX, streetY, slotIndex) to integer world coordinates.
 *
 * The world position is `(streetX·STREET_COLS + lx, streetY·STREET_ROWS + ly)`
 * where `(lx, ly)` is the slot's local (column, row). Every street/slot pair
 * maps to a distinct world position — no two streets share a plot.
 */
export function toWorldPosition(
  streetX: number,
  streetY: number,
  slotIndex: number,
): { worldX: number; worldY: number } {
  if (!Number.isInteger(streetX) || !Number.isInteger(streetY) || !Number.isInteger(slotIndex)) {
    throw new Error(`toWorldPosition: integer coordinates required, got ${streetX},${streetY},${slotIndex}`);
  }
  if (streetX < 0 || streetY < 0 || slotIndex < 0 || slotIndex >= GRID_SIZE) {
    throw new Error(`toWorldPosition: out of bounds ${streetX},${streetY},${slotIndex}`);
  }
  return baseWorld(streetX, streetY, slotIndex);
}

/**
 * Inverse of toWorldPosition: world → its (street, slot) owner, or null if the
 * world coordinate is not part of the supported MAX_GRID lattice.
 */
export function fromWorldPosition(
  worldPos: { worldX: number; worldY: number },
): { streetX: number; streetY: number; slotIndex: number } | null {
  return worldOwner(worldPos.worldX, worldPos.worldY, MAX_GRID_COLS, MAX_GRID_ROWS);
}

/**
 * Chebyshev (8-way) neighbours of a world position within the supported
 * MAX_GRID lattice, each returned as its (street, slot) owner.
 *
 * An interior node yields 8 entries at range 1 and `(2·range+1)² − 1` entries
 * where the lattice has room.
 */
export function expandedNeighbors(
  worldPos: { worldX: number; worldY: number },
  range: number = 1,
): { streetX: number; streetY: number; slotIndex: number }[] {
  if (!Number.isInteger(range) || range <= 0) return [];
  if (!Number.isInteger(worldPos.worldX) || !Number.isInteger(worldPos.worldY)) return [];
  const xMax = worldWidth(MAX_GRID_COLS) - 1;
  const yMax = worldHeight(MAX_GRID_ROWS) - 1;
  const result: { streetX: number; streetY: number; slotIndex: number }[] = [];
  for (let y = Math.max(0, worldPos.worldY - range); y <= Math.min(yMax, worldPos.worldY + range); y++) {
    for (let x = Math.max(0, worldPos.worldX - range); x <= Math.min(xMax, worldPos.worldX + range); x++) {
      if (x === worldPos.worldX && y === worldPos.worldY) continue;
      const owner = worldOwner(x, y, MAX_GRID_COLS, MAX_GRID_ROWS);
      if (owner) result.push(owner);
    }
  }
  return result;
}

// ── World-index mapping & neighbor resolution ───────────────

/**
 * Translates a flat world-slot index back to its (worldX, worldY) position.
 * Returns null when `index` is out of range for `gridDims`.
 */
export function worldIndexToPosition(
  index: number,
  gridDims: GridDims,
): { worldX: number; worldY: number } | null {
  if (!gridDims) return null;
  if (!Number.isInteger(index) || index < 0) return null;
  const total = worldSlotCount(gridDims.cols, gridDims.rows);
  if (index >= total) return null;
  const width = worldWidth(gridDims.cols);
  return { worldX: index % width, worldY: Math.floor(index / width) };
}

/**
 * Translates (streetX, streetY, slot) to its flat world-slot index within a
 * `gridDims` lattice. Returns null when the street is outside the lattice or
 * the slot index is invalid.
 *
 * Shared nodes map to a single index: for a 2×2 lattice,
 * `streetSlotToWorldIndex(0,0,9)`, `(1,0,5)`, `(0,1,4)` and `(1,1,0)` all
 * return the same index (the four-way intersection is one card slot).
 */
export function streetSlotToWorldIndex(
  streetX: number,
  streetY: number,
  slotIndex: number,
  gridDims: GridDims,
): number | null {
  if (!gridDims) return null;
  if (
    !Number.isInteger(streetX) || !Number.isInteger(streetY) || !Number.isInteger(slotIndex) ||
    streetX < 0 || streetY < 0 || streetX >= gridDims.cols || streetY >= gridDims.rows ||
    slotIndex < 0 || slotIndex >= GRID_SIZE
  ) {
    return null;
  }
  const { worldX, worldY } = baseWorld(streetX, streetY, slotIndex);
  const width = worldWidth(gridDims.cols);
  const total = worldSlotCount(gridDims.cols, gridDims.rows);
  const index = worldY * width + worldX;
  return index >= 0 && index < total ? index : null;
}

/**
 * Resolve neighbors for a given grid slot index.
 *
 * World slots form a solid rectangle, so adjacency is plain 8-way (Chebyshev)
 * distance over world coordinates — no special-casing of street boundaries.
 * A 1×1 lattice (or omitted `gridDims`) reproduces the legacy 10-slot
 * behaviour exactly.
 *
 * @param index    The world slot index to find neighbors for.
 * @param range    How far to look in each direction (default 1).
 * @param gridDims Optional grid dimensions for expanded layouts.
 * @returns Ascending array of neighbor indices.
 */
function resolveNeighbors(
  index: number,
  range: number,
  gridDims?: GridDims,
): number[] {
  if (range <= 0) return [];
  const dims: GridDims = gridDims ?? { cols: 1, rows: 1 };
  const total = worldSlotCount(dims.cols, dims.rows);
  if (!Number.isInteger(index) || index < 0 || index >= total) return [];
  const width = worldWidth(dims.cols);
  const originX = index % width;
  const originY = Math.floor(index / width);
  const result: number[] = [];
  for (let i = 0; i < total; i++) {
    if (i === index) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    if (Math.max(Math.abs(originX - x), Math.abs(originY - y)) <= range) {
      result.push(i);
    }
  }
  return result;
}
