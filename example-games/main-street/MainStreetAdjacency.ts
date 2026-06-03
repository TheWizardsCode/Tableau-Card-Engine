/**
 * Main Street: Adjacency & Income Calculation
 *
 * Implements the adjacency resolver for the 2x5 street grid
 * (stored as a 10-slot row-major array) and income computation
 * (base income + synergy bonuses). Upgrades can extend synergy
 * range beyond the default 1-cell Manhattan adjacency.
 *
 * @module
 */

import type { BusinessCard, SynergyType } from './MainStreetCards';
import { GRID_SIZE, SYNERGY_BONUS_PER_NEIGHBOR } from './MainStreetCards';
import type { MainStreetState } from './MainStreetState';
import { addLog, syncResourceBankToLedger } from './MainStreetState';
import { applyReputationMultiplier } from './MainStreetDifficulty';

// ── Adjacency Resolver ──────────────────────────────────────

/**
 * Returns the indices of neighboring slots within a given range
 * on the Main Street 2x5 grid.
 *
 * Slot indices are row-major:
 *   row 0: 0..4
 *   row 1: 5..9
 *
 * Default range is 1 (orthogonal neighbors at Manhattan distance 1).
 * Upgrades can extend this radius.
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
    const distance = Math.abs(origin.x - p.x) + Math.abs(origin.y - p.y);
    if (distance <= range) {
      result.push(i);
    }
  }

  return result.sort((a, b) => a - b);
}

/**
 * Computes the synergy bonus for a single business at a given slot.
 *
 * A business earns +bonusPerNeighbor coins for each neighboring
 * slot that contains a business sharing at least one SynergyType.
 * The range considered is 1 + business.synergyRangeBonus (from upgrades).
 *
 * @param grid               The street grid.
 * @param index              The slot index of the business.
 * @param bonusPerNeighbor   Coins per matching neighbor (defaults to SYNERGY_BONUS_PER_NEIGHBOR for backward compat).
 * @returns The synergy bonus in coins.
 */
export function computeSynergyBonus(
  grid: (BusinessCard | null)[],
  index: number,
  bonusPerNeighbor: number = SYNERGY_BONUS_PER_NEIGHBOR,
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
      bonus += bonusPerNeighbor;
    }
  }

  return bonus;
}

/**
 * Computes the total income for a single business at a given slot.
 *
 * totalIncome = baseIncome + incomeBonus (from upgrades) + synergyBonus
 *
 * @param grid               The street grid.
 * @param index              The slot index of the business.
 * @param bonusPerNeighbor   Coins per matching neighbor (defaults to SYNERGY_BONUS_PER_NEIGHBOR).
 * @returns The total income in coins for this business.
 */
export function computeBusinessIncome(
  grid: (BusinessCard | null)[],
  index: number,
  bonusPerNeighbor: number = SYNERGY_BONUS_PER_NEIGHBOR,
): number {
  const business = grid[index];
  if (!business) return 0;

  const base = business.baseIncome + business.incomeBonus;
  const synergy = computeSynergyBonus(grid, index, bonusPerNeighbor);
  return base + synergy;
}

/**
 * Computes the total income across all businesses on the street grid.
 *
 * Returns both the total and a per-slot breakdown for UI display.
 *
 * @param grid               The street grid.
 * @param bonusPerNeighbor   Coins per matching neighbor (defaults to SYNERGY_BONUS_PER_NEIGHBOR).
 * @returns Object with `total` income and `breakdown` per slot.
 */
export function computeIncome(
  grid: (BusinessCard | null)[],
  bonusPerNeighbor: number = SYNERGY_BONUS_PER_NEIGHBOR,
): IncomeResult {
  const breakdown: SlotIncome[] = [];
  let total = 0;

  for (let i = 0; i < grid.length; i++) {
    const business = grid[i];
    if (!business) continue;

    const base = business.baseIncome + business.incomeBonus;
    const synergy = computeSynergyBonus(grid, i, bonusPerNeighbor);
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
 * Mutates state in-place. Uses config.synergyBonusPerNeighbor from the
 * active difficulty preset.
 *
 * Income is scaled by the reputation coin multiplier (CG-0MMLR38NJ1N11DOS)
 * so that higher reputation yields proportionally more income.
 *
 * @param state  Current game state (mutated).
 * @returns The IncomeResult for UI display (pre-multiplier breakdown,
 *          but total reflects the multiplied amount actually credited).
 */
export function applyIncome(state: MainStreetState): IncomeResult {
  const result = computeIncome(state.streetGrid, state.config.synergyBonusPerNeighbor);
  const multiplied = applyReputationMultiplier(
    result.total,
    state.resourceBank.reputation,
    state.config,
  );
  state.resourceBank.coins += multiplied;
  syncResourceBankToLedger(state);
  if (multiplied > 0) {
    addLog(state, `Income: +${multiplied} coins`, 'gain');
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
