/**
 * Main Street: Synergy and Income Scoring
 *
 * Per-card and per-grid synergy/income/reputation computation, cached-value
 * recalculation, income application, and the income result types.
 *
 * Import graph: depends on `MainStreetAdjacencyGeometry` and
 * `MainStreetAdjacencyOwner`.
 *
 * @module
 */

import type { BusinessCard, CommunitySpaceCard, SynergyType } from './MainStreetCards';
import { getBaseTypeId } from './MainStreetCards';
import type { MainStreetState } from './MainStreetState';
import { addLog, describeEventEffects, syncResourceBankToLedger } from './MainStreetState';
import { applyReputationMultiplier, roundInt } from './MainStreetDifficulty';
import { applyActiveEffectMultiplier } from '@core-engine/ActiveEffect';
import { computePerBusinessSkillBuffs, getEmployedSpecializationSkillsForBusiness } from './MainStreetStaffBuffs';
import type { GridDims } from './MainStreetAdjacencyGeometry';
import { hasAdjacentSameType, resolveNeighbors } from './MainStreetAdjacencyGeometry';
import { getSlotOwnerId } from './MainStreetAdjacencyOwner';

/**
 * Resolves the effective per-card coin synergy rate for a card.
 * Returns the card's `synergyCoinBonus` if set, otherwise 0.5 (the default, 50% of base income).
 */
export function effectiveSynergyCoinBonus(card: BusinessCard | CommunitySpaceCard): number {
  return card.synergyCoinBonus ?? 0.5;
}

/**
 * Resolves the effective per-neighbor reputation synergy contribution for a card.
 * Returns the card's `synergyRepBonus` if set, otherwise 0 (the default).
 */
export function effectiveSynergyRepBonus(card: BusinessCard | CommunitySpaceCard): number {
  return card.synergyRepBonus ?? 0;
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
 * Computes the total income across all businesses on the street grid.
 *
 * Returns both the total and a per-slot breakdown for UI display. Board
 * adjacency synergy (computeSynergyBonus) is reported separately in each
 * slot's `synergyBonus` (and excluded from `baseIncome`) so the phased income
 * animation can route synergy coins along the synergy lines (CG-0MTV6LZEA003YS3E);
 * `total` still folds base + synergy. Hand cards never contribute (producer
 * rule CG-0MTRDX0DN004EECN).
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
  // phases are zero. `baseIncome` excludes synergy and `synergyBonus` carries
  // it, so the per-slot phase sum equals the same total used above
  // (CG-0MTV6LZEA003YS3E — the synergy coins travel along the synergy lines).
  const perSlotBreakdown: SlotPhaseBreakdown[] = breakdown.map(b => ({
    slotIndex: b.slotIndex,
    businessName: b.businessName,
    baseIncome: b.baseIncome,
    synergyBonus: b.synergyBonus,
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
 * MainStreetDifficulty header): weekStart snapshot → placement deductions →
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
  const gridDims = state.streetGridCols && state.streetGridRows
    ? { cols: state.streetGridCols, rows: state.streetGridRows }
    : undefined;

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
  // Built in the same pass as `breakdown` so the buffed base/synergy split is
  // available: the staff income multiplier scales the whole cached income
  // (base + synergy) while the flat bonus is base-only, so the phase fields
  // must be derived here rather than re-mapped from `breakdown`
  // (CG-0MTV6LZEA003YS3E).
  const phaseSlotData: SlotPhaseBreakdown[] = [];
  let total = 0;
  for (let i = 0; i < grid.length; i++) {
    if (soldSlots[i]) continue;
    const card = grid[i];
    if (!card) continue;

    const slotIncome = card.currentIncome ?? 0;
    // Board adjacency synergy is reported separately from base income so the
    // phased animation can route it along the synergy lines (CG-0MTV6LZEA003YS3E).
    // The cached `currentIncome` is base (with same-type penalty) + synergy.
    const synergy = computeSynergyBonus(
      grid,
      i,
      state.config.synergyBonusPerNeighbor,
      soldSlots,
      gridDims,
    );
    // Per-business income skill buffs: +pct of the business's cached income,
    // plus a flat coin bonus (chef/dj/sales-champion — I4). Fed by the staff
    // employed AT this slot only (CG-0MSTOATDU006UGAX).
    const buffs = computePerBusinessSkillBuffs(getEmployedSpecializationSkillsForBusiness(state, i), {
      synergyTypes: (card as BusinessCard).synergyTypes ?? [],
      baseIncome: (card as BusinessCard).baseIncome ?? 0,
      ongoingCost: (card as BusinessCard).ongoingCost ?? 0,
    });
    const buffedIncome = slotIncome * (1 + buffs.income.percent) + buffs.income.flat;
    const buffedSynergy = synergy * (1 + buffs.income.percent);
    breakdown.push({
      slotIndex: i,
      businessName: card.name,
      baseIncome: slotIncome - synergy,
      synergyBonus: synergy,
      total: buffedIncome,
    });
    phaseSlotData.push({
      slotIndex: i,
      businessName: card.name,
      // Buffed base = buffed total minus the buffed synergy, so the phase sum
      // (`baseIncome + synergyBonus + repBonus + eventDeltas`) still equals the
      // credited total exactly.
      baseIncome: buffedIncome - buffedSynergy,
      synergyBonus: buffedSynergy,
      repBonus: 0,
      eventDeltas: [],
      upcomingDeltas: [],
    });
    total += buffedIncome;
  }

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
  // Weight the reputation bonus by each slot's full post-effect total
  // (base + synergy + event deltas) so the split is unchanged by the
  // base/synergy separation (CG-0MTV6LZEA003YS3E).
  const modifiedSlotTotals = phaseSlotData.map(
    (d) => d.baseIncome + d.synergyBonus + d.eventDeltas.reduce((acc, e) => acc + e.delta, 0),
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
  const gridDims = state.streetGridCols && state.streetGridRows
    ? { cols: state.streetGridCols, rows: state.streetGridRows }
    : undefined;
  const results: OwnerIncomeResult[] = [];

  for (const player of state.players) {
    const ownerId = player.playerId;
    const breakdown: SlotIncome[] = [];
    const phaseSlotData: SlotPhaseBreakdown[] = [];
    let total = 0;
    let repPerTurn = 0;

    // Income / reputation from slots THIS owner owns (skip sold).
    for (let i = 0; i < grid.length; i++) {
      if (soldSlots[i]) continue;
      const card = grid[i];
      if (!card) continue;
      if (getSlotOwnerId(state, i) !== ownerId) continue;

      const slotIncome = card.currentIncome ?? 0;
      // Board adjacency synergy (board-wide, ownership-independent) is
      // reported separately from base income (CG-0MTV6LZEA003YS3E).
      const synergy = computeSynergyBonus(
        grid,
        i,
        state.config.synergyBonusPerNeighbor,
        soldSlots,
        gridDims,
      );
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
      const buffedSynergy = synergy * (1 + buffs.income.percent);
      breakdown.push({
        slotIndex: i,
        businessName: card.name,
        baseIncome: slotIncome - synergy,
        synergyBonus: synergy,
        total: buffedIncome,
      });
      phaseSlotData.push({
        slotIndex: i,
        businessName: card.name,
        baseIncome: buffedIncome - buffedSynergy,
        synergyBonus: buffedSynergy,
        repBonus: 0,
        eventDeltas: [],
        upcomingDeltas: [],
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

    // ── Active-effect income multipliers (phase breakdown built above, mirrors applyIncome) ──
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
    // Weight by the full post-effect total (base + synergy + event deltas),
    // mirroring applyIncome (CG-0MTV6LZEA003YS3E).
    const modifiedSlotTotals = phaseSlotData.map(
      (d) => d.baseIncome + d.synergyBonus + d.eventDeltas.reduce((acc, e) => acc + e.delta, 0),
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

export interface SlotIncome {
  slotIndex: number;
  businessName: string;
  /** Base income for this slot (base + income bonus, same-type penalty applied) — excludes board adjacency synergy. */
  baseIncome: number;
  /** Board adjacency synergy contribution for this slot (integer coins). */
  synergyBonus: number;
  /** Total income from this slot (base + board adjacency synergy, plus any staff buffs). */
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
  /**
   * Base income for this slot (after staff buffs, before event/rep multipliers)
   * — excludes board adjacency synergy, which is reported separately below so
   * the synergy phase can animate it along the synergy lines
   * (CG-0MTV6LZEA003YS3E).
   */
  baseIncome: number;
  /**
   * Board adjacency synergy contribution for this slot (after staff buffs).
   * Non-zero when the slot has matching, different-type synergy neighbours.
   * Hand-card synergy was removed (CG-0MTRDX0DN004EECN: cards in the hand are
   * not in play), so this only ever reflects street-grid adjacency.
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

// ── Competitive income result ───────────────────────────────

/** Per-owner income result: owner index + that owner's IncomeResult. */

export interface OwnerIncomeResult {
  /** The player index this income belongs to (index into state.players). */
  ownerId: number;
  /** Standard IncomeResult computed over the owner's own slots/wallet. */
  income: IncomeResult;
}
