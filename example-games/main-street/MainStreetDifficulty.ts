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
  /**
   * Multiplier applied to the per-card synergy percentage rate.
   * At 1.0 (Medium), the per-card rate is used as-is.
   * Higher values increase synergy impact; lower values reduce it.
   */
  readonly synergyBonusPerNeighbor: number;

  // ── Challenges ──────────────────────────────────────────
  /** Number of challenges selected per run. */
  readonly challengesPerRun: number;
  /** Multiplier to increase positive Incident frequency (1.0 = baseline). */
  readonly positiveIncidentMultiplier: number;

  // ── Reputation-based Coin Multiplier ───────────────────
  /**
   * Divisor used in the reputation coin multiplier formula:
   *   multiplier = 1 + (reputation / reputationCoinDivisor)
   *
   * Higher values make reputation less impactful on coin rewards.
   * Default 20 means rep=20 yields a 2x multiplier.
   */
  readonly reputationCoinDivisor: number;
  /**
   * Maximum value the reputation coin multiplier can reach.
   * Prevents runaway scaling in long or lucky games.
   * Default 3.0 means coin rewards can at most triple.
   */
  readonly maxReputationCoinMultiplier: number;
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
  synergyBonusPerNeighbor: 1.5,
  challengesPerRun: 2,
  positiveIncidentMultiplier: 1.2,
  reputationCoinDivisor: 20,
  maxReputationCoinMultiplier: 3.0,
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
  synergyBonusPerNeighbor: 1.0,
  challengesPerRun: 3,
  // Increase positive incident frequency by 50% for the Medium baseline
  // as requested by work item CG-0MMLR20XP1IPPD03.
  positiveIncidentMultiplier: 1.5,
  reputationCoinDivisor: 20,
  maxReputationCoinMultiplier: 3.0,
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
  synergyBonusPerNeighbor: 0.75,
  challengesPerRun: 4,
  positiveIncidentMultiplier: 1,
  reputationCoinDivisor: 20,
  maxReputationCoinMultiplier: 3.0,
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
export function getPreset(name: DifficultyName | string | undefined): Readonly<GameConfig> {
  // Accept undefined -> default to Medium
  if (!name) return MEDIUM_PRESET;

  // If the provided name matches a preset key exactly, return it.
  if (typeof name === 'string' && name in DIFFICULTY_PRESETS) {
    // Type assertion: we've confirmed the key exists on the registry
    return DIFFICULTY_PRESETS[name as DifficultyName];
  }

  // Be tolerant of different casings (e.g. 'easy', 'EASY') by doing a
  // case-insensitive lookup against the known difficulty names.
  const lower = (name as string).toLowerCase();
  for (const k of DIFFICULTY_NAMES) {
    if (k.toLowerCase() === lower) return DIFFICULTY_PRESETS[k];
  }

  // Fallback to Medium for unknown values to preserve backward compatibility.
  return MEDIUM_PRESET;
}

/** All available difficulty names in display order. */
export const DIFFICULTY_NAMES: readonly DifficultyName[] = ['Easy', 'Medium', 'Hard'];

// ── Reputation-based Coin Multiplier ────────────────────────

/**
 * Computes the reputation-based coin multiplier.
 *
 * Formula: min(1 + reputation / divisor, cap)
 *
 * Uses the additive formula so that reputation=0 still yields a 1x
 * baseline (no reward lost). The multiplier is capped to prevent
 * runaway scaling in long or lucky games.
 *
 * - reputation=0  -> 1.0x (baseline preserved)
 * - reputation=10 -> 1.5x (with divisor=20)
 * - reputation=20 -> 2.0x
 * - reputation=40 -> 3.0x (capped at maxMultiplier=3.0)
 * - reputation=60 -> 3.0x (capped)
 *
 * Negative reputation clamps the multiplier at 1.0 (no penalty via
 * this channel -- reputation collapse is handled elsewhere).
 *
 * @param reputation  Current player reputation.
 * @param config      Game config with reputationCoinDivisor and maxReputationCoinMultiplier.
 * @returns The multiplier to apply to coin rewards (always >= 1.0).
 */
export function reputationCoinMultiplier(
  reputation: number,
  config: Pick<GameConfig, 'reputationCoinDivisor' | 'maxReputationCoinMultiplier'>,
): number {
  if (!Number.isFinite(reputation) || reputation <= 0) return 1.0;
  const raw = 1 + reputation / config.reputationCoinDivisor;
  return Math.min(raw, config.maxReputationCoinMultiplier);
}

/**
 * Applies the reputation coin multiplier to a raw coin delta.
 *
 * Only positive coin deltas are scaled -- negative deltas (penalties)
 * pass through unchanged so that reputation does not amplify losses.
 *
 * CG-0MRER3RE300418SG: Removed Math.floor to preserve fractional income
 * values. The coins field is a JavaScript number (double) and can hold
 * fractional values. All coin comparisons (<, >=, etc.) work correctly
 * with fractional values. UI display rounds to 2 decimal places in the
 * HUD tooltip.
 *
 * @param rawCoinDelta  The base coin amount (positive = gain, negative = penalty).
 * @param reputation    Current player reputation.
 * @param config        Game config with multiplier tuning constants.
 * @returns The adjusted coin delta (may be fractional).
 */
export function applyReputationMultiplier(
  rawCoinDelta: number,
  reputation: number,
  config: Pick<GameConfig, 'reputationCoinDivisor' | 'maxReputationCoinMultiplier'>,
): number {
  if (rawCoinDelta <= 0) return rawCoinDelta;
  return rawCoinDelta * reputationCoinMultiplier(reputation, config);
}
