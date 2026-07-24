/**
 * Action Commands
 *
 * A generic adapter that wraps reversible game actions as `Command` objects
 * compatible with the shared `UndoRedoManager`. This decouples action
 * definitions from the undo/redo infrastructure, allowing games to define
 * actions as pure functions and reuse the same command lifecycle.
 *
 * Key design decisions:
 *  - Actions are defined as `ReversibleAction<TState>` objects with
 *    `do(state)` and `undo(state)` methods.
 *  - The `toCommand()` factory wraps any `ReversibleAction` into a `Command`
 *    ready for use with `UndoRedoManager`.
 *  - State management (e.g., snapshot capture) is the responsibility of the
 *    action implementation, not the adapter.
 *  - This matches the pattern used by MainStreetCommands.ts where each
 *    command captures a pre-snapshot on first `execute()` and restores it
 *    on `undo()`.
 *
 * @module
 */

import type { Command } from './UndoRedoManager';

// ── Types ───────────────────────────────────────────────────

/**
 * A reversible game action that can be applied and undone.
 *
 * @typeParam TState - The game state type that the action operates on.
 *
 * @example
 * ```ts
 * const buyAction: ReversibleAction<GameState> = {
 *   description: 'Buy item for 10 coins',
 *   do(state) {
 *     state.coins -= 10;
 *     state.inventory.push('item');
 *   },
 *   undo(state) {
 *     state.coins += 10;
 *     state.inventory.pop();
 *   },
 * };
 *
 * const command = toCommand(state, buyAction);
 * undoRedo.execute(command);
 * ```
 */
export interface ReversibleAction<TState> {
  /** Apply the action (forward). */
  do(state: TState): void;
  /** Reverse the action (backward). */
  undo(state: TState): void;
  /** Optional human-readable description for debugging/transcripts. */
  readonly description?: string;
}

// ── Factory ─────────────────────────────────────────────────

/**
 * Wraps a `ReversibleAction` into a `Command` compatible with `UndoRedoManager`.
 *
 * The returned `Command` object binds the action to the provided state so
 * that `execute()` calls `action.do(state)` and `undo()` calls `action.undo(state)`.
 *
 * @param state  The game state that the action will mutate.
 * @param action The reversible action to wrap.
 * @returns A `Command` object ready for use with `UndoRedoManager.execute()`.
 *
 * @example
 * ```ts
 * const cmd = toCommand(myState, myAction);
 * undoRedoManager.execute(cmd);
 * // Later:
 * undoRedoManager.undo();
 * ```
 */
export function toCommand<TState>(
  state: TState,
  action: ReversibleAction<TState>,
): Command {
  return {
    execute(): void {
      action.do(state);
    },
    undo(): void {
      action.undo(state);
    },
    description: action.description,
  };
}

/**
 * Creates a reversible action that snaps the state before `do()` and restores
 * it on `undo()`. This is a convenience for actions that need snapshot-based
 * undo as used by Main Street's commands.
 *
 * The snapshot is captured on the first call to `do()` (or can be pre-captured).
 * Subsequent `do()` calls reuse the initial snapshot (no re-capture).
 *
 * @param doFn     The forward operation to apply.
 * @param undoFn   The reverse operation (called with the snapshot + current state).
 *                 Note: snapshot-based undo typically restores the entire state
 *                 rather than computing deltas.
 * @param description  Optional human-readable label.
 * @param captureSnapshot  A function that deep-clones the relevant parts of state.
 * @returns A `ReversibleAction` with snapshot-based undo semantics.
 */
export function createSnapshotAction<TState>(
  doFn: (state: TState) => void,
  undoFn: (state: TState, snapshot: TState) => void,
  description: string | undefined,
  captureSnapshot: (state: TState) => TState,
): ReversibleAction<TState> {
  let snapshot: TState | null = null;

  return {
    description,
    do(state: TState): void {
      if (snapshot === null) {
        snapshot = captureSnapshot(state);
      }
      doFn(state);
    },
    undo(state: TState): void {
      if (snapshot === null) return;
      undoFn(state, snapshot);
    },
  };
}
