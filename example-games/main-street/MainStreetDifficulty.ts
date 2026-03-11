/**
 * Main Street: Difficulty Presets
 *
 * Defines named difficulty configurations that parameterize the game's
 * economy, turn structure, and challenge settings. The Medium preset
 * exactly matches the original hard-coded constants for backward
 * compatibility.
 *
 * Presets are selected at game setup and stored in `MainStreetState.config`.
 * All engine, adjacency, scoring, and challenge code reads from the config
 * rather than module-level constants.
 *
 * ## Engine Component Adapter (CG-0MMJ8S9850MV4L0A)
 *
 * This module's `GameConfig` interface extends the generic
 * `DifficultyConfig` from `@core-engine`. The preset registry and
 * lookup function conform to the generic `DifficultyPresetRegistry`
 * and `createPresetLookup` patterns.
 *
 * **M6 Extraction TODO:** When extracting to a shared engine module,
 * the generic `DifficultyConfig`, `DifficultyPresetRegistry`, and
 * `createPresetLookup` are already in `@core-engine/DifficultyPresets`.
 * Game-specific code keeps only the concrete `GameConfig` definition,
 * preset objects, and the registry. The `getPreset` function can be
 * replaced with `createPresetLookup(DIFFICULTY_PRESETS, MEDIUM_PRESET)`.
 *
 * @module
 */

import type {
  DifficultyConfig,
  DifficultyPresetRegistry,
} from '../../src/core-engine/DifficultyPresets';

// ── Difficulty Names ────────────────────────────────────────

/** The available named difficulty levels. */
export type DifficultyName = 'Easy' | 'Medium' | 'Hard';

// ── Game Config Interface ───────────────────────────────────

/**
 * Runtime configuration for a Main Street game.
 *
 * Extends the generic `DifficultyConfig` from `@core-engine` with
 * Main Street-specific game parameters.
 *
 * Created from a `DifficultyPreset` at setup time and stored on the
 * game state so that engine logic can read values without importing
 * module-level constants.
 */
export interface GameConfig extends DifficultyConfig {
  /** Human-readable difficulty name (for UI display). */
  readonly difficultyName: DifficultyName;

  // ── Economy ─────────────────────────────────────────────
  /** Starting coin balance. */
  readonly startingCoins: number;
  /** Starting reputation. */
  readonly startingReputation: number;

  // ── Turn Structure ──────────────────────────────────────
  /** Maximum number of turns before the game ends. */
  readonly maxTurns: number;

  // ── Scoring ─────────────────────────────────────────────
  /** Score required for a win via score threshold. */
  readonly winThreshold: number;
  /** Multiplier applied to reputation in final score. */
  readonly reputationScoreMultiplier: number;
  /** Points awarded per completed challenge. */
  readonly challengeBonusPoints: number;

  // ── Synergy ─────────────────────────────────────────────
  /** Coins earned per adjacent business sharing a synergy type. */
  readonly synergyBonusPerNeighbor: number;

  // ── Challenges ──────────────────────────────────────────
  /** Number of challenges selected per run. */
  readonly challengesPerRun: number;
}

// ── Preset Definitions ──────────────────────────────────────

/**
 * Easy preset: generous resources, more turns, lower win threshold.
 * Designed for new players learning the mechanics.
 */
export const EASY_PRESET: Readonly<GameConfig> = {
  difficultyName: 'Easy',
  startingCoins: 12,
  startingReputation: 5,
  maxTurns: 25,
  winThreshold: 120,
  reputationScoreMultiplier: 5,
  challengeBonusPoints: 15,
  synergyBonusPerNeighbor: 2,
  challengesPerRun: 2,
};

/**
 * Medium preset: matches the original hard-coded constants exactly.
 * This is the default and the baseline for balance.
 */
export const MEDIUM_PRESET: Readonly<GameConfig> = {
  difficultyName: 'Medium',
  startingCoins: 8,
  startingReputation: 3,
  maxTurns: 20,
  winThreshold: 150,
  reputationScoreMultiplier: 5,
  challengeBonusPoints: 10,
  synergyBonusPerNeighbor: 1,
  challengesPerRun: 3,
};

/**
 * Hard preset: tight resources, fewer turns, higher win threshold.
 * Designed for experienced players seeking a challenge.
 */
export const HARD_PRESET: Readonly<GameConfig> = {
  difficultyName: 'Hard',
  startingCoins: 5,
  startingReputation: 2,
  maxTurns: 15,
  winThreshold: 180,
  reputationScoreMultiplier: 5,
  challengeBonusPoints: 8,
  synergyBonusPerNeighbor: 1,
  challengesPerRun: 4,
};

// ── Preset Registry ─────────────────────────────────────────

/**
 * Map of all available presets by name.
 *
 * Conforms to `DifficultyPresetRegistry<GameConfig>` from `@core-engine`.
 */
export const DIFFICULTY_PRESETS: DifficultyPresetRegistry<GameConfig> = {
  Easy: EASY_PRESET,
  Medium: MEDIUM_PRESET,
  Hard: HARD_PRESET,
};

/**
 * Returns the `GameConfig` for the given difficulty name.
 * Defaults to Medium if the name is not recognized.
 */
export function getPreset(name: DifficultyName | undefined): Readonly<GameConfig> {
  if (name && name in DIFFICULTY_PRESETS) {
    return DIFFICULTY_PRESETS[name];
  }
  return MEDIUM_PRESET;
}

/** All available difficulty names in display order. */
export const DIFFICULTY_NAMES: readonly DifficultyName[] = ['Easy', 'Medium', 'Hard'];
