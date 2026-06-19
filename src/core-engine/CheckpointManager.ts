/**
 * CheckpointManager — reusable checkpoint save-and-resume abstraction.
 *
 * Provides a game-agnostic API for saving, loading, clearing, and restoring
 * game checkpoints via the existing {@link SaveLoadStore}. Supports both a
 * default built-in resume overlay and a callback-based overlay for games
 * that need custom UI.
 *
 * ## Usage
 *
 * ```ts
 * const manager = new CheckpointManager(store, 'feudalism', 'run-checkpoint', feudalismSerializer);
 *
 * // After each turn:
 * manager.save(gameState);
 *
 * // On startup:
 * manager.checkAndResume(
 *   () => startFreshGame(),
 *   (state) => restoreFromCheckpoint(state),
 *   (state, onResume, onNewGame) => showCustomOverlay(state, onResume, onNewGame),
 * );
 * ```
 *
 * ## Overlay support
 *
 * - **Callback-based (preferred for games):** Provide a `createResumeOverlay`
 *   callback. The manager will not create any overlay; the game renders its own.
 * - **Built-in default:** Import `createDefaultResumeOverlay` from
 *   `@core-engine` and pass it as the `createResumeOverlay` callback. This
 *   renders a standard "Resume Saved Game?" overlay with [Resume] and
 *   [New Game] buttons.
 *
 *   If no overlay callback is provided at all, the manager falls through to
 *   `freshStartFn()` (no overlay is shown). Games should always provide an
 *   overlay callback — either the built-in default or a custom one.
 *
 * @module core-engine/CheckpointManager
 */

import type { SaveLoadStore, SaveSerializer } from './SaveLoad';

// ── Types ──────────────────────────────────────────────────

/**
 * Options for the overlay behaviour of {@link CheckpointManager.checkAndResume}.
 *
 * @typeParam TState - The in-memory game state type.
 */
export interface CheckpointManagerOverlayOptions<TState> {
  /**
   * Optional callback to create a custom resume overlay.
   *
   * If provided, the manager will call this function when a checkpoint exists
   * instead of using any built-in overlay. The callback receives:
   *
   * @param state     - The loaded checkpoint state (for display/info).
   * @param onResume  - Call when the user clicks "Resume".
   * @param onNewGame - Call when the user clicks "New Game".
   */
  createResumeOverlay?: (
    state: TState,
    onResume: () => void,
    onNewGame: () => void,
  ) => void;
}

// ── CheckpointManager class ────────────────────────────────

/**
 * Manages checkpoint save, load, clear, and resume workflow for a single game.
 *
 * Delegates all storage to the provided {@link SaveLoadStore}, which handles
 * IndexedDB with localStorage fallback. Each instance is bound to a specific
 * game type and slot, providing isolation between games.
 *
 * @typeParam TState      - The in-memory game state type.
 * @typeParam TSerialized - The serialized/wire format (typically a JSON-safe
 *                          subset of `TState`).
 */
export class CheckpointManager<TState, TSerialized> {
  /**
   * @param store      - The shared SaveLoadStore instance.
   * @param gameType   - Game identifier string (e.g. `'feudalism'`).
   * @param slotId     - Slot identifier (e.g. `'run-checkpoint'`).
   * @param serializer - Game-specific SaveSerializer for state conversion.
   */
  constructor(
    private readonly store: SaveLoadStore,
    private readonly gameType: string,
    private readonly slotId: string,
    private readonly serializer: SaveSerializer<TState, TSerialized>,
  ) {}

  /**
   * Save a checkpoint of the current game state.
   *
   * Fire-and-forget: the returned promise resolves once the save completes,
   * but callers typically do not await it to avoid input lag on slow storage.
   *
   * @param state - The current game state to persist.
   */
  async save(state: TState): Promise<void> {
    try {
      await this.store.saveRunCheckpoint(
        this.gameType,
        this.slotId,
        this.serializer,
        state,
      );
    } catch (err) {
      console.warn(`[CheckpointManager:${this.gameType}] Failed to save checkpoint:`, err);
    }
  }

  /**
   * Load the most recently saved checkpoint.
   *
   * @returns The restored game state, or `null` if no checkpoint exists or
   *          storage is unavailable.
   */
  async load(): Promise<TState | null> {
    try {
      return await this.store.loadRunCheckpoint(
        this.gameType,
        this.slotId,
        this.serializer,
      );
    } catch (err) {
      console.warn(`[CheckpointManager:${this.gameType}] Failed to load checkpoint:`, err);
      return null;
    }
  }

  /**
   * Remove the saved checkpoint.
   *
   * Safe to call even when no checkpoint exists.
   */
  async clear(): Promise<void> {
    try {
      await this.store.remove('run-checkpoint', this.gameType, this.slotId);
    } catch (err) {
      console.warn(`[CheckpointManager:${this.gameType}] Failed to clear checkpoint:`, err);
    }
  }

  /**
   * Check for a saved checkpoint and either start fresh or offer resume.
   *
   * - **No checkpoint:** Calls `freshStartFn()` immediately.
   * - **Checkpoint found + `createResumeOverlay` provided:** Calls
   *   `createResumeOverlay(state, onResume, onNewGame)`. The overlay renders
   *   the choice; the manager wires the callbacks. Use the exported
   *   {@link createDefaultResumeOverlay} for a built-in Phaser-compatible
   *   default overlay, or provide a game-specific callback.
   * - **Checkpoint found + no overlay callback:** Calls `freshStartFn()`
   *   (no overlay is shown). Games should always provide an overlay callback
   *   when they want resume UI.
   * - **Storage error:** Falls through to `freshStartFn()` so the game is
   *   still playable.
   *
   * @param freshStartFn         - Called when no checkpoint exists or on error.
   * @param resumeFn             - Called with the restored state when user picks Resume.
   * @param createResumeOverlay  - Optional callback for custom overlay rendering.
   */
  async checkAndResume(
    freshStartFn: () => void,
    resumeFn: (state: TState) => void,
    createResumeOverlay?: (
      state: TState,
      onResume: () => void,
      onNewGame: () => void,
    ) => void,
  ): Promise<void> {
    let savedState: TState | null;

    try {
      savedState = await this.load();
    } catch {
      // On error, fall through to fresh start so the game is still playable
      freshStartFn();
      return;
    }

    if (!savedState) {
      // No checkpoint — start fresh
      freshStartFn();
      return;
    }

    // Checkpoint exists
    if (createResumeOverlay) {
      // Game provides its own overlay
      const self = this;
      createResumeOverlay(
        savedState,
        // On resume
        () => {
          resumeFn(savedState);
        },
        // On new game — await clear before starting fresh
        async () => {
          await self.clear();
          freshStartFn();
        },
      );
    } else {
      // No overlay callback provided — fall through to freshStartFn.
      // Games should provide a createResumeOverlay callback (either the
      // built-in createDefaultResumeOverlay or a custom one).
      freshStartFn();
    }
  }
}
