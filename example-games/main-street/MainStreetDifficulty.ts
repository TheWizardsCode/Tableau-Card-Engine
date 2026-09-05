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
  /**
   * Maximum number of turns before the game ends (opt-in).
   *
   * Undefined (the default) means **unlimited**: the game ends only via
   * score threshold, all challenges complete, bankruptcy, or reputation
   * collapse. When set, the turn-based end path in `checkEndConditions`
   * fires at `turn >= maxTurns` (turn_limit_victory / turn_exhaustion).
   * Default presets do not set this field (CG-0MSLXJCHH001DLIO).
   */
  readonly maxTurns?: number;

  // ── Endless Mode ────────────────────────────────────────
  /**
   * When true, reaching the score threshold does NOT end the game.
   *
   * The engine sets `endReason` to `'score_threshold_continue'` when the
   * threshold is first reached, but keeps `gameResult` as `'playing'` so
   * the player (or players in competitive mode) can continue building.
   * The game only ends via other conditions (bankruptcy, reputation
   * collapse, all challenges complete, or turn limit).
   *
   * Default: `false` — the game ends at the threshold (existing behaviour,
   * CG-0MTIILU5V006GCN4). This is the producer's opt-in "endless mode".
   */
  readonly endlessMode: boolean;

  // ── Scoring ─────────────────────────────────────────────
  /** Score required for a win via score threshold. */
  readonly winThreshold: number;
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

  // ── Incident Draw Balance ─────────────────────────────
  /**
   * Repeat-spacing window N for constrained incident draws: a card name
   * cannot reappear within the last `N - 1` drawn cards (default 3).
   * Larger N = fewer same-card repeats (calmer variety); smaller N = cards
   * can recur sooner (tighter pacing). Wired into `incidentBalance` at game
   * setup; see `createIncidentBalanceState` in MainStreetCards.ts.
   */
  readonly incidentRepeatSpacing: number;
  /**
   * Max consecutive same-polarity (good/bad) incident cards M before the
   * selector forces a polarity change (default 2). Larger M = longer luck
   * runs (higher variance); smaller M = gentler, more even pacing. Wired
   * into `incidentBalance` at game setup.
   */
  readonly incidentMaxStreak: number;

  // ── Reputation-based Coin Multiplier ───────────────────
  /**
   * Divisor used in the reputation coin multiplier formula:
   *   multiplier = 1 + (reputation / reputationCoinDivisor)
   *
   * Higher values make reputation less impactful on coin rewards.
   * Default 8000 (integer economy: 80×100) means rep=2000
   * yields a 1.25x multiplier.
   */
  readonly reputationCoinDivisor: number;
  /**
   * Maximum value the reputation coin multiplier can reach.
   * Prevents runaway scaling in long or lucky games.
   * Default 1.5 (CG-0MT3J80HV0084IF1: scaled from 3.0) means coin
   * rewards can at most grow 1.5x — the cap still bites at rep=40.
   */
  readonly maxReputationCoinMultiplier: number;

  // ── Community Favour ────────────────────────────────────
  /**
   * Coins consumed to gain 1 reputation via Community Favour.
   * Default 2 (2 coins → 1 rep).
   */
  readonly favourCoinsToRepCost: number;
  /**
   * Reputation consumed to gain coins via Community Favour.
   * Default 2 (2 rep → N coins, where N = favourRepToCoinsCoinGain).
   */
  readonly favourRepToCoinsRepCost: number;
  /**
   * Coins gained when spending reputation via Community Favour.
   * Default 3 (2 rep → 3 coins). Round-trip is lossy,
   * preventing infinite arbitrage.
   */
  readonly favourRepToCoinsCoinGain: number;
}

// ── Preset Definitions ──────────────────────────────────────

/**
 * Easy preset: generous resources, lower win threshold.
 * Designed for new players learning the mechanics. No turn limit
 * (CG-0MSLXJCHH001DLIO — turn limits are opt-in via explicit `maxTurns`).
 */
export const EASY_PRESET: Readonly<GameConfig> = {
  difficultyName: 'Easy',
  startingCoins: 1000,
  startingReputation: 500,
  endlessMode: false,
  winThreshold: 10000,
  challengeBonusPoints: 1500,
  synergyBonusPerNeighbor: 0.5,
  challengesPerRun: 2,
  positiveIncidentMultiplier: 1.2,
  // Incident pacing: widest repeat spacing (N=4) = fewest same-card
  // repeats, calmer variety; standard bad-run protection (M=2).
  incidentRepeatSpacing: 4,
  incidentMaxStreak: 2,
  reputationCoinDivisor: 8000,
  maxReputationCoinMultiplier: 1.5,
  // Community Favour: 2 coins → 1 rep; 2 rep → 3 coins.
  favourCoinsToRepCost: 200,
  favourRepToCoinsRepCost: 200,
  favourRepToCoinsCoinGain: 300,
};

/**
 * Medium preset: matches the original hard-coded constants exactly.
 * This is the default and the baseline for balance. No turn limit
 * (CG-0MSLXJCHH001DLIO — turn limits are opt-in via explicit `maxTurns`).
 */
export const MEDIUM_PRESET: Readonly<GameConfig> = {
  difficultyName: 'Medium',
  startingCoins: 600,
  startingReputation: 300,
  endlessMode: false,
  winThreshold: 12000,
  challengeBonusPoints: 1000,
  synergyBonusPerNeighbor: 0.35,
  challengesPerRun: 3,
  // Increase positive incident frequency by 50% for the Medium baseline
  // as requested by work item CG-0MMLR20XP1IPPD03.
  positiveIncidentMultiplier: 1.5,
  // Incident pacing equals the engine defaults (N=3, M=2), preserving the
  // "Medium = original hard-coded constants" backward-compat invariant.
  incidentRepeatSpacing: 3,
  incidentMaxStreak: 2,
  reputationCoinDivisor: 8000,
  maxReputationCoinMultiplier: 1.5,
  // Community Favour: 2 coins → 1 rep; 2 rep → 3 coins.
  favourCoinsToRepCost: 200,
  favourRepToCoinsRepCost: 200,
  favourRepToCoinsCoinGain: 300,
};

/**
 * Hard preset: tight resources, higher win threshold.
 * Designed for experienced players seeking a challenge. No turn limit
 * (CG-0MSLXJCHH001DLIO — turn limits are opt-in via explicit `maxTurns`).
 */
export const HARD_PRESET: Readonly<GameConfig> = {
  difficultyName: 'Hard',
  startingCoins: 400,
  startingReputation: 200,
  endlessMode: false,
  winThreshold: 15000,
  challengeBonusPoints: 800,
  synergyBonusPerNeighbor: 0.25,
  challengesPerRun: 4,
  positiveIncidentMultiplier: 1,
  // Incident pacing: minimal repeat guarantee (N=2) = cards can recur
  // sooner, leaving fewer "safe gaps"; longer streaks (M=3) = higher
  // variance and harsher bad runs, matching the game's overall
  // "longer good streaks on Hard" profile.
  incidentRepeatSpacing: 2,
  incidentMaxStreak: 3,
  reputationCoinDivisor: 8000,
  maxReputationCoinMultiplier: 1.5,
  // Community Favour: 2 coins → 1 rep; 2 rep → 3 coins.
  favourCoinsToRepCost: 200,
  favourRepToCoinsRepCost: 200,
  favourRepToCoinsCoinGain: 300,
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
 * (CG-0MT3J80HV0084IF1: divisor 20→80 and cap 3.0→1.5 quarter the
 * additive bonus above the 1.0x baseline.)
 *
 * - reputation=0  -> 1.0x (baseline preserved)
 * - reputation=1000 -> 1.125x (with divisor=8000)
 * - reputation=2000 -> 1.25x
 * - reputation=4000 -> 1.5x (capped at maxMultiplier=1.5)
 * - reputation=6000 -> 1.5x (capped)
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
 * CG-0MTIO1M15001E9Y6: Economy is integer-only. All coin/reputation
 * values are integers; applyReputationMultiplier rounds to the nearest
 * integer at the per-event/per-card boundary (AC3).
 *
 * @param rawCoinDelta  The base coin amount (positive = gain, negative = penalty).
 * @param reputation    Current player reputation.
 * @param config        Game config with multiplier tuning constants.
 * @returns The adjusted coin delta (integer).
 */
/** Round the nearest integer (Math.round) — the shared integer-economy primitive (AC3). */
export function roundInt(value: number): number {
  return Math.round(value);
}

export function applyReputationMultiplier(
  rawCoinDelta: number,
  reputation: number,
  config: Pick<GameConfig, 'reputationCoinDivisor' | 'maxReputationCoinMultiplier'>,
): number {
  if (rawCoinDelta <= 0) return rawCoinDelta;
  // Economy is integer-only (AC3): synergy products, reputation
  // multiplier, event deltas, and ongoing-cost deductions round to the
  // nearest integer at the per-event / per-card / per-turn boundary so
  // state.resourceBank.coins/reputation never accumulate fractional drift.
  return roundInt(rawCoinDelta * reputationCoinMultiplier(reputation, config));
}
