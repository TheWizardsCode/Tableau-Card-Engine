/**
 * Game phase and state types for the Tableau Card Engine.
 *
 * GamePhase represents the high-level lifecycle of a game round.
 * GameState is a generic container that tracks players, turn order,
 * and phase transitions.
 */

/**
 * High-level phases of a game round.
 *
 * - `setup`   -- Initial dealing, card placement, etc.
 * - `playing` -- Active gameplay with turn-based actions.
 * - `ended`   -- Round is complete; scoring/results phase.
 */
export type GamePhase = 'setup' | 'playing' | 'ended';

/**
 * Identifies a player by index and kind.
 */
export interface PlayerInfo {
  /** Display name for the player. */
  readonly name: string;
  /** Whether this player is controlled by the computer. */
  readonly isAI: boolean;
}

/**
 * Generic game state container.
 *
 * @typeParam T  Game-specific per-player state (e.g. a Golf grid,
 *               a hand of cards, score, etc.).
 */
export interface GameState<T> {
  /** Information about each player, indexed by player index. */
  readonly players: readonly PlayerInfo[];
  /** Per-player game-specific state, parallel to `players`. */
  readonly playerStates: T[];
  /** Index into `players` / `playerStates` for the active player. */
  currentPlayerIndex: number;
  /** Current high-level phase. */
  phase: GamePhase;
  /** Monotonically increasing turn counter (starts at 0). */
  turnNumber: number;
}

/**
 * Options for creating a new GameState.
 */
export interface GameStateOptions<T> {
  /** Player info (must have at least 2 entries). */
  players: PlayerInfo[];
  /** Initial per-player state factory. Called once per player. */
  createPlayerState: (playerIndex: number) => T;
  /** Starting phase (defaults to 'setup'). */
  initialPhase?: GamePhase;
  /** Index of the first player to act (defaults to 0). */
  firstPlayerIndex?: number;
}

/**
 * Create a new GameState from options.
 *
 * @throws If fewer than 2 players are provided.
 * @throws If `firstPlayerIndex` is out of bounds.
 */
export function createGameState<T>(options: GameStateOptions<T>): GameState<T> {
  const {
    players,
    createPlayerState,
    initialPhase = 'setup',
    firstPlayerIndex = 0,
  } = options;

  if (players.length < 2) {
    throw new Error(
      `A game requires at least 2 players, got ${players.length}`,
    );
  }

  if (firstPlayerIndex < 0 || firstPlayerIndex >= players.length) {
    throw new Error(
      `firstPlayerIndex ${firstPlayerIndex} is out of bounds for ${players.length} players`,
    );
  }

  const playerStates = players.map((_, i) => createPlayerState(i));

  return {
    players,
    playerStates,
    currentPlayerIndex: firstPlayerIndex,
    phase: initialPhase,
    turnNumber: 0,
  };
}
