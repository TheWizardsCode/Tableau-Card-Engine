/**
 * Main Street: Adjacency & Income Calculation
 *
 * **This module is a barrel file.** All exports are re-exported from
 * per-concern sub-modules to preserve backward compatibility with existing
 * imports — consumers should import from `MainStreetAdjacency` and not need
 * to change when sub-modules evolve.
 *
 * | Sub-module                        | Responsibility |
 * |-----------------------------------|----------------|
 * | `MainStreetAdjacencyGeometry`     | World grid geometry, coordinate conversion, neighbor indices |
 * | `MainStreetAdjacencyScoring`      | Synergy/income computation, recalculation, income application |
 * | `MainStreetAdjacencyNeighbors`    | Post-mutation recalculation, visual synergy pairs |
 * | `MainStreetAdjacencyOwner`        | Competitive slot ownership |
 *
 * @module
 */

// ── Geometry ────────────────────────────────────────────────
export {
  neighbors,
  hasAdjacentSameType,
  toWorldPosition,
  fromWorldPosition,
  expandedNeighbors,
  worldIndexToPosition,
  streetSlotToWorldIndex,
} from './MainStreetAdjacencyGeometry';
export type { GridDims } from './MainStreetAdjacencyGeometry';
export { worldWidth, worldHeight, worldSlotCount } from './MainStreetAdjacencyGeometry';

// ── Scoring ─────────────────────────────────────────────────
export {
  computeSynergyBonus,
  computeSynergyRepBonus,
  computeBusinessIncome,
  computeSingleCardReputation,
  syncCardCurrentIncome,
  syncCardCurrentRepPerTurn,
  recalculateCard,
  computeIncome,
  computeReputationPerTurn,
  applyIncome,
  applyCompetitiveIncome,
} from './MainStreetAdjacencyScoring';
export type {
  SlotIncome,
  SlotEventDelta,
  SlotPhaseBreakdown,
  PhaseBreakdown,
  IncomeResult,
  OwnerIncomeResult,
} from './MainStreetAdjacencyScoring';

// ── Neighbors ───────────────────────────────────────────────
export {
  updateNeighborsOnPlacement,
  updateNeighborsOnSale,
  updateNeighborsOnClose,
  computeSynergyPairs,
  diffNewSynergyPairs,
} from './MainStreetAdjacencyNeighbors';
export type { SynergyPair } from './MainStreetAdjacencyNeighbors';

// ── Owner ───────────────────────────────────────────────────
export {
  getSlotOwnerId,
  tagSlotOwnerIfCompetitive,
} from './MainStreetAdjacencyOwner';

