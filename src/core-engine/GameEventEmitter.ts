/**
 * Typed Event Emitter for the Tableau Card Engine.
 *
 * Provides a type-safe, zero-dependency event emitter for turn lifecycle
 * events. Designed to work in both Node.js (headless) and browser
 * environments without any Phaser dependency.
 *
 * Games emit these events at key lifecycle points. Tools (replay,
 * testing, telemetry) subscribe to them for synchronization.
 */

import type { GamePhase } from './GameState';

// ── Event Payloads ──────────────────────────────────────────

/**
 * Emitted when a new turn begins.
 */
export interface TurnStartedPayload {
  /** Monotonically increasing turn number (0-based). */
  readonly turnNumber: number;
  /** Index of the player whose turn is starting. */
  readonly playerIndex: number;
  /** Name of the player whose turn is starting. */
  readonly playerName: string;
  /** Whether the active player is AI-controlled. */
  readonly isAI: boolean;
}

/**
 * Emitted when a turn's logical action has been resolved.
 */
export interface TurnCompletedPayload {
  /** The turn number that was just completed. */
  readonly turnNumber: number;
  /** Index of the player who completed the turn. */
  readonly playerIndex: number;
  /** Name of the player who completed the turn. */
  readonly playerName: string;
  /** Current game phase after the turn. */
  readonly phase: GamePhase;
}

/**
 * Emitted when all animations for the current action have finished.
 */
export interface AnimationCompletePayload {
  /** The turn number the animation relates to. */
  readonly turnNumber: number;
  /** Optional label for the animation that completed. */
  readonly animationId?: string;
}

/**
 * Emitted when the game state has fully settled: the turn action
 * is resolved, animations are done, and the UI is in a stable
 * state ready for the next action or screenshot capture.
 */
export interface StateSettledPayload {
  /** The turn number after which state settled. */
  readonly turnNumber: number;
  /** Current game phase. */
  readonly phase: GamePhase;
}

/**
 * Emitted when the game has ended.
 */
export interface GameEndedPayload {
  /** Final turn number. */
  readonly finalTurnNumber: number;
  /** Index of the winning player, or -1 for a draw. */
  readonly winnerIndex: number;
  /** Optional human-readable reason (e.g. "Player 1 wins by 5 points"). */
  readonly reason?: string;
}

// ── Event Map ───────────────────────────────────────────────

/**
 * Maps event names to their payload types.
 *
 * Subscribing to an event name not in this map produces a
 * compile-time TypeScript error.
 */
export interface GameEventMap {
  'turn-started': TurnStartedPayload;
  'turn-completed': TurnCompletedPayload;
  'animation-complete': AnimationCompletePayload;
  'state-settled': StateSettledPayload;
  'game-ended': GameEndedPayload;
}

/** Union of all valid game event names. */
export type GameEventName = keyof GameEventMap;

// ── Listener types ──────────────────────────────────────────

/** A callback for a specific event type. */
export type GameEventListener<K extends GameEventName> = (
  payload: GameEventMap[K],
) => void;

// ── Emitter ─────────────────────────────────────────────────

/**
 * A minimal, typed event emitter for game lifecycle events.
 *
 * Usage:
 * ```ts
 * const emitter = new GameEventEmitter();
 * emitter.on('turn-started', (payload) => {
 *   console.log(`Turn ${payload.turnNumber} started for ${payload.playerName}`);
 * });
 * emitter.emit('turn-started', { turnNumber: 0, playerIndex: 0, playerName: 'Alice', isAI: false });
 * ```
 */
export class GameEventEmitter {
  private listeners: {
    [K in GameEventName]?: Array<GameEventListener<K>>;
  } = {};

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on<K extends GameEventName>(
    event: K,
    listener: GameEventListener<K>,
  ): () => void {
    let list = this.listeners[event] as
      | Array<GameEventListener<K>>
      | undefined;
    if (!list) {
      list = [];
      (this.listeners as Record<string, unknown>)[event] = list;
    }
    list.push(listener);

    return () => this.off(event, listener);
  }

  /**
   * Subscribe to an event for a single emission only.
   * Returns an unsubscribe function (in case you want to
   * cancel before it fires).
   */
  once<K extends GameEventName>(
    event: K,
    listener: GameEventListener<K>,
  ): () => void {
    const wrapper = ((payload: GameEventMap[K]) => {
      this.off(event, wrapper);
      listener(payload);
    }) as GameEventListener<K>;

    return this.on(event, wrapper);
  }

  /**
   * Remove a specific listener for an event.
   */
  off<K extends GameEventName>(
    event: K,
    listener: GameEventListener<K>,
  ): void {
    const list = this.listeners[event] as
      | Array<GameEventListener<K>>
      | undefined;
    if (!list) return;

    const index = list.indexOf(listener);
    if (index !== -1) {
      list.splice(index, 1);
    }
  }

  /**
   * Emit an event with the given payload.
   * Listeners are called synchronously in registration order.
   */
  emit<K extends GameEventName>(event: K, payload: GameEventMap[K]): void {
    const list = this.listeners[event] as
      | Array<GameEventListener<K>>
      | undefined;
    if (!list || list.length === 0) return;

    // Copy the array so listeners can safely unsubscribe during emission
    const snapshot = [...list];
    for (const fn of snapshot) {
      fn(payload);
    }
  }

  /**
   * Remove all listeners, optionally for a specific event only.
   */
  removeAllListeners(event?: GameEventName): void {
    if (event) {
      delete this.listeners[event];
    } else {
      this.listeners = {};
    }
  }

  /**
   * Return the number of listeners for a given event.
   */
  listenerCount(event: GameEventName): number {
    const list = this.listeners[event];
    return list ? list.length : 0;
  }
}
