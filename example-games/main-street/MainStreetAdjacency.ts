/**
 * Main Street: Adjacency & Income Calculation
 *
 * Implements the adjacency resolver for the 1x10 linear street grid
 * and income computation (base income + synergy bonuses). Upgrades
 * can extend synergy range beyond the default 1-slot adjacency.
 *
 * @module
 */

import type { BusinessCard, SynergyType } from './MainStreetCards';
import { GRID_SIZE, SYNERGY_BONUS_PER_NEIGHBOR } from './MainStreetCards';
import type { MainStreetState } from './MainStreetState';
import { addLog } from './MainStreetState';

// ── Adjacency Resolver ──────────────────────────────────────

/**
 * Returns the indices of neighboring slots within a given range
 * on the linear 1x10 street grid.
 *
 * Default range is 1 (immediate neighbors). Upgrades can extend this.
 * Clamps to valid grid boundaries [0, GRID_SIZE).
 *
 * @param index  The slot index to find neighbors for.
 * @param range  How far to look in each direction (default 1).
 * @returns Array of neighbor indices (excluding the slot itself).
 */
export function neighbors(index: number, range: number = 1): number[] {
  const result: number[] = [];
  const lo = Math.max(0, index - range);
  const hi = Math.min(GRID_SIZE - 1, index + range);
  for (let i = lo; i <= hi; i++) {
    if (i !== index) result.push(i);
  }
  return result;
}

/**
 * Computes the synergy bonus for a single business at a given slot.
 *
 * A business earns +SYNERGY_BONUS_PER_NEIGHBOR coins for each neighboring
 * slot that contains a business sharing at least one SynergyType.
 * The range considered is 1 + business.synergyRangeBonus (from upgrades).
 *
 * @param grid   The street grid.
 * @param index  The slot index of the business.
 * @returns The synergy bonus in coins.
 */
export function computeSynergyBonus(
  grid: (BusinessCard | null)[],
  index: number,
): number {
  const business = grid[index];
  if (!business) return 0;

  const range = 1 + business.synergyRangeBonus;
  const neighborIndices = neighbors(index, range);

  let bonus = 0;
  for (const ni of neighborIndices) {
    const neighbor = grid[ni];
    if (!neighbor) continue;

    // Check if any synergy type is shared
    const hasSharedSynergy = business.synergyTypes.some(
      (st: SynergyType) => neighbor.synergyTypes.includes(st),
    );
    if (hasSharedSynergy) {
      bonus += SYNERGY_BONUS_PER_NEIGHBOR;
    }
  }

  return bonus;
}

/**
 * Computes the total income for a single business at a given slot.
 *
 * totalIncome = baseIncome + incomeBonus (from upgrades) + synergyBonus
 *
 * @param grid   The street grid.
 * @param index  The slot index of the business.
 * @returns The total income in coins for this business.
 */
export function computeBusinessIncome(
  grid: (BusinessCard | null)[],
  index: number,
): number {
  const business = grid[index];
  if (!business) return 0;

  const base = business.baseIncome + business.incomeBonus;
  const synergy = computeSynergyBonus(grid, index);
  return base + synergy;
}

/**
 * Computes the total income across all businesses on the street grid.
 *
 * Returns both the total and a per-slot breakdown for UI display.
 *
 * @param grid  The street grid.
 * @returns Object with `total` income and `breakdown` per slot.
 */
export function computeIncome(grid: (BusinessCard | null)[]): IncomeResult {
  const breakdown: SlotIncome[] = [];
  let total = 0;

  for (let i = 0; i < grid.length; i++) {
    const business = grid[i];
    if (!business) continue;

    const base = business.baseIncome + business.incomeBonus;
    const synergy = computeSynergyBonus(grid, i);
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

  return { total, breakdown };
}

/**
 * Applies income to the player's resource bank.
 * Mutates state in-place.
 *
 * @param state  Current game state (mutated).
 * @returns The IncomeResult for UI display.
 */
export function applyIncome(state: MainStreetState): IncomeResult {
  const result = computeIncome(state.streetGrid);
  state.resourceBank.coins += result.total;
  if (result.total > 0) {
    addLog(state, `Income: +${result.total} coins`, 'gain');
  } else {
    addLog(state, `Income: +0 coins`, 'neutral');
  }
  return result;
}

// ── Result Types ────────────────────────────────────────────

/** Income breakdown for a single occupied slot. */
export interface SlotIncome {
  slotIndex: number;
  businessName: string;
  baseIncome: number;
  synergyBonus: number;
  total: number;
}

/** Full income computation result. */
export interface IncomeResult {
  /** Total coins earned from all businesses. */
  total: number;
  /** Per-slot breakdown. */
  breakdown: SlotIncome[];
}
