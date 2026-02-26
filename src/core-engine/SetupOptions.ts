/**
 * Shared setup option types for the Tableau Card Engine.
 *
 * Games extend these base types (via intersection or interface extension)
 * to add game-specific setup fields while sharing common initialization
 * options like RNG injection and player configuration.
 *
 * @example
 * ```ts
 * // Solitaire game -- only needs RNG
 * type MySetup = BaseSetupOptions & { difficulty?: number };
 *
 * // Multiplayer game -- needs player config + game-specific fields
 * type MySetup = MultiplayerSetupOptions & { initialReveals?: number[] };
 * ```
 */

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
