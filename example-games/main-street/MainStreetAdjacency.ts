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

import type { BusinessCard, CommunitySpaceCard, SynergyType } from './MainStreetCards';
import { GRID_SIZE, SYNERGY_BONUS_PER_NEIGHBOR, isPawnShopCard } from './MainStreetCards';
import type { MainStreetState } from './MainStreetState';
import { addLog, syncResourceBankToLedger } from './MainStreetState';
import { applyReputationMultiplier } from './MainStreetDifficulty';
import { applyActiveEffectMultiplier } from '../../src/core-engine/ActiveEffect';

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
 * Pawn Shop cards are excluded entirely from synergy — they neither
 * receive nor contribute synergy bonuses. This special case will be
 * removed once synergy bonuses are generalized to per-card values
 * (see CG-0MQRA9QTA0012PNZ).
 *
 * @param grid               The street grid.
 * @param index              The slot index of the business.
 * @param bonusPerNeighbor   Coins per matching neighbor (defaults to SYNERGY_BONUS_PER_NEIGHBOR for backward compat).
 * @returns The synergy bonus in coins.
 */
export function computeSynergyBonus(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
  index: number,
  bonusPerNeighbor: number = SYNERGY_BONUS_PER_NEIGHBOR,
): number {
  const business = grid[index];
  if (!business) return 0;

  // Pawn Shop cards neither receive nor contribute synergy bonuses.
  // This special case will be removed once synergy bonuses are generalized
  // to per-card values (see CG-0MQRA9QTA0012PNZ).
  if (isPawnShopCard(business)) return 0;

  const range = 1 + business.synergyRangeBonus;
  const neighborIndices = neighbors(index, range);

  let bonus = 0;
  for (const ni of neighborIndices) {
    const neighbor = grid[ni];
    if (!neighbor) continue;

    // Pawn Shop cards do not contribute to synergy bonuses
    if (isPawnShopCard(neighbor)) continue;

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
 * Pawn Shop cards receive no synergy bonus (see computeSynergyBonus).
 *
 * @param grid               The street grid.
 * @param index              The slot index of the business.
 * @param bonusPerNeighbor   Coins per matching neighbor (defaults to SYNERGY_BONUS_PER_NEIGHBOR).
 * @returns The total income in coins for this business.
 */
export function computeBusinessIncome(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
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
 * Computes the total synergy bonus contributed by hand cards to tableau businesses.
 *
 * Each hand card contributes Math.floor(card.baseIncome / 3) to each tableau
 * business that shares at least one synergy type. Pawn Shop cards do not
 * receive hand card synergy even when the types match.
 *
 * @param grid  The street grid (tableau businesses).
 * @param hand  Cards held in the player's hand.
 * @returns The total hand card synergy bonus added to all tableau businesses.
 */
export function computeHandCardSynergyBonus(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
  hand: BusinessCard[],
): number {
  if (!hand || hand.length === 0) return 0;

  let total = 0;

  for (const handCard of hand) {
    if (!handCard.synergyTypes || handCard.synergyTypes.length === 0) continue;

    // Each hand card provides floor(baseIncome/3) to each matching synergy business
    const bonusPerMatch = Math.floor(handCard.baseIncome / 3);
    if (bonusPerMatch <= 0) continue;

    for (let i = 0; i < grid.length; i++) {
      const business = grid[i];
      if (!business) continue;

      // Pawn Shop cards do not receive synergy from any source
      if (isPawnShopCard(business)) continue;

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
 * @param bonusPerNeighbor   Coins per matching neighbor (defaults to SYNERGY_BONUS_PER_NEIGHBOR).
 * @param hand               Optional: hand cards to include for synergy bonuses.
 * @returns Object with `total` income and `breakdown` per slot.
 */
export function computeIncome(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
  bonusPerNeighbor: number = SYNERGY_BONUS_PER_NEIGHBOR,
  hand?: BusinessCard[],
): IncomeResult {
  const breakdown: SlotIncome[] = [];
  let total = 0;

  // Compute per-slot tableau income
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

  // Add hand card synergy bonuses to the total
  let handSynergyTotal = 0;
  if (hand && hand.length > 0) {
    handSynergyTotal = computeHandCardSynergyBonus(grid, hand);
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
          if (isPawnShopCard(business)) continue;

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

  return { total, breakdown, handSynergyTotal };
}

/**
 * Computes total reputation per turn from all occupied grid slots.
 *
 * Each business/community-space card may contribute:
 * - Its base `reputationPerTurn` (from the card definition)
 * - Its accumulated `reputationBonus` (from applied upgrades)
 *
 * @param grid  The street grid.
 * @returns Total reputation per turn.
 */
export function computeReputationPerTurn(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
): number {
  let total = 0;
  for (const slot of grid) {
    if (!slot) continue;
    total += slot.reputationPerTurn ?? 0;
    total += slot.reputationBonus;
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
  const result = computeIncome(state.streetGrid, state.config.synergyBonusPerNeighbor, hand);

  // Apply active effect income modifiers per-slot, before reputation multiplier.
  // Each slot's income is individually multiplied, then summed.
  let modifiedTotal = 0;
  for (const slot of result.breakdown) {
    const modifiedSlotIncome = applyActiveEffectMultiplier(
      state.activeEffects,
      'income-multiplier',
      slot.total,
    );
    modifiedTotal += modifiedSlotIncome;
  }

  const multiplied = applyReputationMultiplier(
    modifiedTotal,
    state.resourceBank.reputation,
    state.config,
  );
  state.resourceBank.coins += multiplied;

  // Apply reputation per turn from cards
  const repPerTurn = computeReputationPerTurn(state.streetGrid);
  if (repPerTurn !== 0) {
    state.resourceBank.reputation += repPerTurn;
  }

  syncResourceBankToLedger(state);
  if (multiplied > 0) {
    addLog(state, `Income: +${multiplied} coins`, 'gain');
  } else {
    addLog(state, `Income: +0 coins`, 'neutral');
  }
  if (repPerTurn > 0) {
    addLog(state, `Reputation from cards: +${repPerTurn}`, 'gain');
  }
  if (result.handSynergyTotal > 0) {
    addLog(state, `Hand card synergy: +${result.handSynergyTotal} coins`, 'gain');
  }
  return result;
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
 * are within Manhattan distance range (1 + card's synergyRangeBonus). Each pair
 * is reported only once (fromIndex < toIndex). Pawn Shop cards are excluded
 * entirely — they neither contribute nor receive synergy connections.
 *
 * Community-space cards are included in the same manner as business cards.
 *
 * @param grid  The street grid.
 * @returns Array of synergy pairs for visual line drawing.
 */
export function computeSynergyPairs(
  grid: (BusinessCard | CommunitySpaceCard | null)[],
): SynergyPair[] {
  const pairs: SynergyPair[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < grid.length; i++) {
    const card = grid[i];
    if (!card) continue;
    if (isPawnShopCard(card)) continue;

    const range = 1 + card.synergyRangeBonus;
    const neighborIndices = neighbors(i, range);

    for (const ni of neighborIndices) {
      if (ni <= i) continue; // avoid duplicates and self-pairs
      const neighbor = grid[ni];
      if (!neighbor) continue;
      if (isPawnShopCard(neighbor)) continue;

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

/** Full income computation result. */
export interface IncomeResult {
  /** Total coins earned from all businesses (includes hand synergy if provided). */
  total: number;
  /** Per-slot breakdown. */
  breakdown: SlotIncome[];
  /** Total synergy contributed by hand cards. */
  handSynergyTotal: number;
}
