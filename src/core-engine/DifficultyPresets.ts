/**
 * Difficulty Presets -- Generic API Sketch
 *
 * Provides game-agnostic interfaces and utility functions for named
 * difficulty presets. Games define concrete config shapes with
 * game-specific parameters; the generic API handles preset registration,
 * lookup, and default resolution uniformly.
 *
 * ## Design Notes for M6 Extraction
 *
 * These interfaces are intentionally generic over `TConfig` so they can
 * be extracted to a standalone `@core-engine/DifficultyPresets` module
 * without modification. The extraction path is:
 *
 * 1. Move this file to `src/core-engine/DifficultyPresets.ts` (already here).
 * 2. Update the barrel export in `src/core-engine/index.ts` (already done).
 * 3. Game-specific code (e.g. Main Street) imports from `@core-engine`
 *    and provides concrete `TConfig` implementations.
 *
 * No game-specific imports exist in this file.
 *
 * @module
 */

// ── Difficulty Config ───────────────────────────────────────

/**
 * Base interface for a game's runtime difficulty configuration.
 *
 * Every game-specific config should extend this with its own numeric
 * parameters (starting resources, turn counts, scoring thresholds, etc.).
 *
 * @example
 * ```ts
 * // Main Street concrete config
 * interface GameConfig extends DifficultyConfig {
 *   readonly startingCoins: number;
 *   readonly maxTurns: number;
 *   readonly winThreshold: number;
 *   // ... game-specific fields
 * }
 * ```
 */
export interface DifficultyConfig {
  /** Human-readable difficulty name (for UI display). */
  readonly difficultyName: string;
}

// ── Preset Registry ─────────────────────────────────────────

/**
 * A named collection of difficulty presets.
 *
 * Maps difficulty names to their corresponding config objects.
 * Games typically define a fixed set of presets (e.g. Easy, Medium, Hard)
 * and register them in a registry for lookup.
 *
 * @typeParam TConfig - The game-specific config type extending {@link DifficultyConfig}.
 *
 * @example
 * ```ts
 * const PRESETS: DifficultyPresetRegistry<GameConfig> = {
 *   Easy: EASY_PRESET,
 *   Medium: MEDIUM_PRESET,
 *   Hard: HARD_PRESET,
 * };
 * ```
 */
export type DifficultyPresetRegistry<TConfig extends DifficultyConfig> =
  Readonly<Record<string, Readonly<TConfig>>>;

// ── Preset Lookup ───────────────────────────────────────────

/**
 * Creates a preset lookup function from a registry and a default config.
 *
 * The returned function resolves a difficulty name to its config,
 * falling back to the provided default if the name is not recognized
 * or is `undefined`.
 *
 * @typeParam TConfig - The game-specific config type extending {@link DifficultyConfig}.
 * @param registry       Map of difficulty names to config objects.
 * @param defaultConfig  Config to return when the name is unrecognized or undefined.
 * @returns A function that resolves a difficulty name to a config.
 *
 * @example
 * ```ts
 * const getPreset = createPresetLookup(PRESETS, MEDIUM_PRESET);
 * const config = getPreset('Hard'); // returns HARD_PRESET
 * const fallback = getPreset(undefined); // returns MEDIUM_PRESET
 * ```
 */
export function createPresetLookup<TConfig extends DifficultyConfig>(
  registry: DifficultyPresetRegistry<TConfig>,
  defaultConfig: Readonly<TConfig>,
): (name: string | undefined) => Readonly<TConfig> {
  return (name: string | undefined): Readonly<TConfig> => {
    if (name !== undefined && name in registry) {
      return registry[name];
    }
    return defaultConfig;
  };
}

/**
 * Returns the list of available difficulty names from a registry.
 *
 * Useful for populating UI difficulty selectors.
 *
 * @typeParam TConfig - The game-specific config type extending {@link DifficultyConfig}.
 * @param registry  The preset registry to extract names from.
 * @returns Array of difficulty name strings.
 */
export function getPresetNames<TConfig extends DifficultyConfig>(
  registry: DifficultyPresetRegistry<TConfig>,
): string[] {
  return Object.keys(registry);
}
