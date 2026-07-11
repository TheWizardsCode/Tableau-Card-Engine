/**
 * Shared setup option types and helpers for the Tableau Card Engine.
 *
 * Games extend these base types (via intersection or interface extension)
 * to add game-specific setup fields while sharing common initialization
 * options like RNG injection and player configuration.
 *
 * Use {@link resolveSetupOptions} to resolve defaults for multiplayer games,
 * or {@link resolveBaseSetupOptions} for solitaire/single-player games.
 *
 * @example
 * ```ts
 * // Solitaire game -- only needs RNG
 * type MySetup = BaseSetupOptions & { difficulty?: number };
 * const { rng } = resolveBaseSetupOptions(options);
 *
 * // Multiplayer game -- needs player config + game-specific fields
 * type MySetup = MultiplayerSetupOptions & { initialReveals?: number[] };
 * const { players, rng } = resolveSetupOptions(options);
 * ```
 */

import type { PlayerInfo } from './GameState';

/**
 * Base setup options shared by all games (including solitaire).
 *
 * Contains only the minimal common field(s) that every game type needs.
 */
export interface BaseSetupOptions {
  /**
   * Random number generator function.
   *
   * Must return a number in `[0, 1)`, matching the `Math.random()` contract.
   * When omitted, games should default to `Math.random`.
   * Inject a seeded RNG (e.g. via `createSeededRng()`) for deterministic
   * replay and testing.
   */
  rng?: () => number;
}

/**
 * Setup options for multiplayer games.
 *
 * Extends {@link BaseSetupOptions} with player configuration fields.
 * Games with a fixed player count (e.g. strictly 2-player) can use this
 * type and validate `playerCount` after resolving defaults.
 */
export interface MultiplayerSetupOptions extends BaseSetupOptions {
  /**
   * Number of players in the game.
   *
   * When omitted, defaults to `2`. Games with a fixed player count
   * may ignore this field and hardcode their count.
   * Must be at least 1.
   */
  playerCount?: number;

  /**
   * Display names for each player, indexed by player position.
   *
   * When omitted or shorter than `playerCount`, missing names are
   * generated as `"Player 1"`, `"Player 2"`, etc.
   * Extra entries beyond `playerCount` are ignored.
   */
  playerNames?: string[];

  /**
   * Whether each player is AI-controlled, indexed by player position.
   *
   * When omitted, defaults to the first player being human (`false`)
   * and all remaining players being AI (`true`).
   * When shorter than `playerCount`, missing entries default to `true` (AI).
   */
  isAI?: boolean[];
}

/**
 * Resolved setup values returned by {@link resolveBaseSetupOptions}.
 *
 * Contains the resolved RNG function, guaranteed to be non-undefined.
 */
export interface ResolvedBaseSetup {
  /** Resolved RNG function (defaults to `Math.random`). */
  readonly rng: () => number;
}

/**
 * Resolved setup values returned by {@link resolveSetupOptions}.
 *
 * Contains the fully resolved player list and RNG function,
 * with all defaults applied.
 */
export interface ResolvedSetup extends ResolvedBaseSetup {
  /** Resolved player info array with names and AI flags. */
  readonly players: readonly PlayerInfo[];
}

/**
 * Resolve base setup options (solitaire / single-player games).
 *
 * Applies defaults for the RNG function. Use this for games that
 * do not need player configuration.
 *
 * @param options - Base setup options (may be empty or undefined).
 * @returns Resolved setup with a guaranteed `rng` function.
 *
 * @example
 * ```ts
 * const { rng } = resolveBaseSetupOptions({ rng: createSeededRng(42) });
 * const card = deck.drawRandom(rng);
 * ```
 */
export function resolveBaseSetupOptions(
  options: BaseSetupOptions = {},
): ResolvedBaseSetup {
  return {
    rng: options.rng ?? Math.random,
  };
}

/**
 * Resolve multiplayer setup options with sensible defaults.
 *
 * Applies defaults for player count, names, AI flags, and RNG.
 * Handles mismatched array lengths gracefully by truncating or
 * padding with defaults.
 *
 * @param options - Multiplayer setup options (may be empty or undefined).
 * @returns Resolved setup with player info array and RNG function.
 * @throws If `playerCount` is explicitly set to `0` or a negative number.
 *
 * @example
 * ```ts
 * // Minimal usage -- all defaults (2 players, first human, second AI)
 * const { players, rng } = resolveSetupOptions({});
 *
 * // Custom player names with seeded RNG
 * const { players, rng } = resolveSetupOptions({
 *   playerCount: 3,
 *   playerNames: ['Alice', 'Bob', 'Charlie'],
 *   rng: createSeededRng(42),
 * });
 * ```
 */
export function resolveSetupOptions(
  options: MultiplayerSetupOptions = {},
): ResolvedSetup {
  const { rng } = resolveBaseSetupOptions(options);

  const playerCount = options.playerCount ?? options.playerNames?.length ?? 2;

  if (playerCount < 1) {
    throw new Error(
      `A game requires at least 1 player, got ${playerCount}`,
    );
  }

  const players: PlayerInfo[] = Array.from(
    { length: playerCount },
    (_, i): PlayerInfo => ({
      name: options.playerNames?.[i] ?? `Player ${i + 1}`,
      isAI: options.isAI?.[i] ?? i > 0,
    }),
  );

  return { players, rng };
}
