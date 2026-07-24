/**
 * Turn sequencer for the Tableau Card Engine.
 *
 * Provides functions to manage turn order, phase transitions,
 * and player rotation within a GameState. Operates on the
 * GameState directly (mutation-based) for simplicity in this
 * first spike; an immutable variant can be extracted later
 * if needed.
 */

import type { GamePhase, GameState } from './GameState';

// ── Structural interfaces ───────────────────────────────────

/**
 * Minimal structural interface for any object that tracks a
 * current player within an indexed player list.
 *
 * Both {@link GameState} and game-specific session types
 * (e.g. `FeudalismSession`) satisfy this interface, so
 * {@link getCurrentPlayer} can be used with any of them
 * without requiring games to adopt `GameState<T>`.
 *
 * @typeParam P  The player type stored in the `players` array
 *               (e.g. `PlayerInfo`, `FeudalismPlayerState`).
 */
export interface HasCurrentPlayer<P> {
  /** Indexed list of players. */
  readonly players: readonly P[] | P[];
  /** Index into `players` for the currently active player. */
  readonly currentPlayerIndex: number;
}

// ── Query functions ─────────────────────────────────────────

/**
 * Get the currently active player from any object that satisfies
 * {@link HasCurrentPlayer}.
 *
 * Works with `GameState<T>` (returns `PlayerInfo`), as well as
 * game-specific session types like `FeudalismSession` (returns
 * `FeudalismPlayerState`). The return type is inferred from the
 * player array element type.
 *
 * @example
 * ```ts
 * // With GameState<T>:
 * const player: PlayerInfo = getCurrentPlayer(gameState);
 *
 * // With a game-specific session:
 * const feudalismPlayer: FeudalismPlayerState = getCurrentPlayer(session);
 * ```
 */
export function getCurrentPlayer<P>(state: HasCurrentPlayer<P>): P {
  return state.players[state.currentPlayerIndex];
}

/**
 * Get the currently active player's game-specific state.
 */
export function getCurrentPlayerState<T>(state: GameState<T>): T {
  return state.playerStates[state.currentPlayerIndex];
}

/**
 * Whether the game has ended.
 */
export function isGameOver<T>(state: GameState<T>): boolean {
  return state.phase === 'ended';
}

/**
 * Whether the game is in the active playing phase.
 */
export function isPlaying<T>(state: GameState<T>): boolean {
  return state.phase === 'playing';
}

// ── Mutation functions ──────────────────────────────────────

/**
 * Advance to the next player's turn.
 *
 * Rotates `currentPlayerIndex` to the next player in order
 * (wrapping around) and increments the turn counter.
 *
 * @throws If the game phase is `ended`.
 * @throws If the game phase is `setup` (turns only advance during `playing`).
 */
export function advanceTurn<T>(state: GameState<T>): void {
  if (state.phase === 'ended') {
    throw new Error('Cannot advance turn: game has ended');
  }
  if (state.phase === 'setup') {
    throw new Error(
      'Cannot advance turn during setup phase; transition to playing first',
    );
  }

  state.currentPlayerIndex =
    (state.currentPlayerIndex + 1) % state.players.length;
  state.turnNumber++;
}

/**
 * Transition the game to a new phase.
 *
 * Valid transitions:
 * - `setup`   -> `playing`
 * - `playing` -> `ended`
 * - `setup`   -> `ended` (e.g. abort / forfeit during setup)
 *
 * @throws If the transition is invalid (e.g. `ended` -> `playing`).
 * @throws If transitioning to the same phase.
 */
export function transitionTo<T>(
  state: GameState<T>,
  newPhase: GamePhase,
): void {
  const current = state.phase;

  if (current === newPhase) {
    throw new Error(`Game is already in phase "${current}"`);
  }

  const allowed = VALID_TRANSITIONS[current];
  if (!allowed.includes(newPhase)) {
    throw new Error(
      `Invalid phase transition: "${current}" -> "${newPhase}". ` +
        `Allowed transitions from "${current}": ${allowed.join(', ') || 'none'}`,
    );
  }

  state.phase = newPhase;
}

/** Map of valid phase transitions. */
const VALID_TRANSITIONS: Record<GamePhase, GamePhase[]> = {
  setup: ['playing', 'ended'],
  playing: ['ended'],
  ended: [],
};

// ── Convenience ─────────────────────────────────────────────

/**
 * Start the game (transition from setup to playing).
 * Convenience wrapper around `transitionTo`.
 */
export function startGame<T>(state: GameState<T>): void {
  transitionTo(state, 'playing');
}

/**
 * End the game (transition from playing or setup to ended).
 * Convenience wrapper around `transitionTo`.
 */
export function endGame<T>(state: GameState<T>): void {
  transitionTo(state, 'ended');
}
