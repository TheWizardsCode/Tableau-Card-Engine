/**
 * Typed Event Emitter for the Tableau Card Engine.
 *
 * Provides a type-safe, zero-dependency event emitter for turn lifecycle
 * events. Designed to work in both Node.js (headless) and browser
 * environments without any Phaser dependency.
 *
 * Games emit these events at key lifecycle points. Tools (replay,
 * testing, telemetry) subscribe to them for synchronization.
 *
 * # Game-specific events
 *
 * The engine's vocabulary is deliberately small and game-agnostic. A game
 * (or any consumer) can declare its own typed event names without editing
 * this module by augmenting the exported {@link GameEventMap} interface:
 *
 * ```ts
 * // In the game's own source, next to its event declarations.
 * declare module '@core-engine/GameEventEmitter' {
 *   interface GameEventMap {
 *     'face-off-resolved': { slot: number; winner: 'player' | 'adversary' };
 *   }
 * }
 *
 * gameEvents.emit('face-off-resolved', { slot: 2, winner: 'player' });
 * gameEvents.on('face-off-resolved', (payload) => { … });
 * ```
 *
 * Interface augmentation is used instead of a generic
 * `GameEventEmitter<M extends GameEventMap>` parameter because it is
 * additive and non-breaking: existing consumers keep the default map with
 * no type parameter, declarations merge from any module in the program,
 * and no game vocabulary ever enters the engine. The augmentation is a
 * type-level contract only — the emitter stays name-agnostic at runtime,
 * which is what lets {@link GameEventEmitter.onAny} forward every event
 * (engine or game-specific) to the Phaser bridge and the debug event
 * buffer without per-game name lists.
 */

import type { GamePhase } from './GameState';

// Import shared card-event payloads from CardEventPayloads module
import type {
  BaseCardEventPayload,
  CardDealtPayload,
  CardPlacedPayload,
  CardDiscardedPayload,
  CardFlippedPayload,
} from './CardEventPayloads';

// Re-export for backward compatibility
export type {
  BaseCardEventPayload,
  CardDealtPayload,
  CardPlacedPayload,
  CardDiscardedPayload,
  CardFlippedPayload,
};

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

// ── Card-level Event Payloads ───────────────────────────────

/**
 * Emitted when a card is drawn from a pile.
 */
export interface CardDrawnPayload {
  /** Where the card was drawn from: 'stock' or 'discard'. */
  readonly source: 'stock' | 'discard';
  /** Index of the player who drew the card. */
  readonly playerIndex: number;
}



/**
 * Emitted when a drawn card is swapped with a grid card.
 */
export interface CardSwappedPayload {
  /** Grid position (row * cols + col) where the swap occurred. */
  readonly position: number;
  /** Where the replacement card was drawn from: 'stock' or 'discard'. */
  readonly drawnFrom: 'stock' | 'discard';
  /** Index of the player who performed the swap. */
  readonly playerIndex: number;
}



/**
 * Emitted when a UI element is interacted with.
 */
export interface UIInteractionPayload {
  /** Identifier of the UI element (e.g. 'play-again', 'menu'). */
  readonly elementId: string;
  /** The type of interaction (e.g. 'click', 'hover'). */
  readonly action: string;
}

// ── Solitaire Event Payloads ────────────────────────────────

/**
 * Emitted when a card is placed on a foundation pile.
 */
export interface CardToFoundationPayload {
  /** Suit of the card (e.g. 'hearts', 'spades'). */
  readonly suit: string;
  /** Rank of the card (e.g. 'A', '2', 'K'). */
  readonly rank: string;
  /** Index of the foundation pile (0-based). */
  readonly foundationIndex: number;
  /** Index of the player who placed the card (optional for single-player). */
  readonly playerIndex?: number;
}

/**
 * Emitted when a card is placed on a tableau column.
 */
export interface CardToTableauPayload {
  /** Suit of the card. */
  readonly suit: string;
  /** Rank of the card. */
  readonly rank: string;
  /** Index of the tableau column (0-based). */
  readonly columnIndex: number;
}

/**
 * Emitted when a card is picked up (drag start or click-to-move selection).
 */
export interface CardPickupPayload {
  /** Suit of the card. */
  readonly suit: string;
  /** Rank of the card. */
  readonly rank: string;
  /** Where the card was picked up from. */
  readonly source: 'tableau' | 'waste' | 'stock' | 'foundation';
}

/**
 * Emitted when an invalid move causes a card to snap back to its origin.
 */
export interface CardSnapBackPayload {
  /** Optional human-readable reason for the snap-back. */
  readonly reason?: string;
}

/**
 * Emitted when the auto-complete cascade begins.
 */
export interface AutoCompleteStartPayload {
  /** Number of cards to be auto-completed. */
  readonly cardCount: number;
}

/**
 * Emitted when an individual card is auto-completed to a foundation.
 */
export interface AutoCompleteCardPayload {
  /** Suit of the card. */
  readonly suit: string;
  /** Rank of the card. */
  readonly rank: string;
  /** Index of the foundation pile the card was placed on. */
  readonly foundationIndex: number;
}

/**
 * Emitted when an undo action is performed.
 */
export interface UndoPayload {
  /** Optional description of the move that was undone. */
  readonly moveDescription?: string;
}

/**
 * Emitted when a redo action is performed.
 */
export interface RedoPayload {
  /** Optional description of the move that was redone. */
  readonly moveDescription?: string;
}

/**
 * Emitted when a card is selected via click-to-move.
 */
export interface CardSelectedPayload {
  /** Suit of the card. */
  readonly suit: string;
  /** Rank of the card. */
  readonly rank: string;
  /** Index of the column the card is in. */
  readonly columnIndex: number;
}

/**
 * Emitted when a previously selected card is deselected.
 */
export interface CardDeselectedPayload {
  /** Reason the card was deselected. */
  readonly reason?: 'click-away' | 'new-selection' | 'move-completed';
}

/**
 * Emitted when a card is dealt during the initial deal animation.
 */
export interface DealCardPayload {
  /** 0-based index of the card being dealt. */
  readonly cardIndex: number;
  /** Total number of cards being dealt. */
  readonly totalCards: number;
}





/**
 * Emitted when the player gains coins/income.
 */
export interface IncomeGainedPayload {
  /** Amount of coins gained (positive integer). */
  readonly amount: number;
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
  'card-drawn': CardDrawnPayload;
  'card-flipped': CardFlippedPayload;
  'card-swapped': CardSwappedPayload;
  'card-discarded': CardDiscardedPayload;
  'card:discarded': CardDiscardedPayload;
  'card:dealt': CardDealtPayload;
  'card:placed': CardPlacedPayload;
  'ui-interaction': UIInteractionPayload;
  'income-gained': IncomeGainedPayload;
  // Solitaire events
  'card-to-foundation': CardToFoundationPayload;
  'card-to-tableau': CardToTableauPayload;
  'card-pickup': CardPickupPayload;
  'card-snap-back': CardSnapBackPayload;
  'auto-complete-start': AutoCompleteStartPayload;
  'auto-complete-card': AutoCompleteCardPayload;
  'undo': UndoPayload;
  'redo': RedoPayload;
  'card-selected': CardSelectedPayload;
  'card-deselected': CardDeselectedPayload;
  'deal-card': DealCardPayload;
}

/** Union of all valid game event names. */
export type GameEventName = keyof GameEventMap;

// ── Listener types ──────────────────────────────────────────

/** A callback for a specific event type. */
export type GameEventListener<K extends GameEventName> = (
  payload: GameEventMap[K],
) => void;

/**
 * A callback for every emission, regardless of event name.
 *
 * Used by the Phaser bridge and the debug event buffer, which forward
 * or record engine and game-specific events alike without maintaining
 * per-game name lists.
 */
export type GameEventAnyListener = (
  eventName: GameEventName,
  payload: GameEventMap[GameEventName],
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

  /** Catch-all listeners, fired for every emission. */
  private anyListeners: GameEventAnyListener[] = [];

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
   * Subscribe to every emission, whatever its name — engine or
   * game-specific (see the module doc for the augmentation mechanism).
   * Returns an unsubscribe function.
   *
   * Catch-all listeners run after the per-name listeners, in
   * registration order, with the same snapshot semantics as {@link on}:
   * a listener may unsubscribe during an emission without skipping its
   * peers.
   */
  onAny(listener: GameEventAnyListener): () => void {
    this.anyListeners.push(listener);
    return () => this.offAny(listener);
  }

  /**
   * Remove a catch-all listener registered with {@link onAny}.
   */
  offAny(listener: GameEventAnyListener): void {
    const index = this.anyListeners.indexOf(listener);
    if (index !== -1) {
      this.anyListeners.splice(index, 1);
    }
  }

  /**
   * Emit an event with the given payload.
   * Listeners are called synchronously in registration order.
   * Emitting with no listeners attached is a no-op.
   */
  emit<K extends GameEventName>(event: K, payload: GameEventMap[K]): void {
    const list = this.listeners[event] as
      | Array<GameEventListener<K>>
      | undefined;

    if ((!list || list.length === 0) && this.anyListeners.length === 0) {
      return;
    }

    // Copy the arrays so listeners can safely unsubscribe during emission
    const snapshot = list ? [...list] : [];
    for (const fn of snapshot) {
      fn(payload);
    }

    const anySnapshot = [...this.anyListeners];
    for (const fn of anySnapshot) {
      fn(event, payload as GameEventMap[GameEventName]);
    }
  }

  /**
   * Remove all listeners, optionally for a specific event only.
   *
   * Without an argument every listener (per-name and catch-all) is
   * removed; with an event name only that event's per-name listeners
   * are removed and catch-all subscribers stay attached.
   */
  removeAllListeners(event?: GameEventName): void {
    if (event) {
      delete this.listeners[event];
    } else {
      this.listeners = {};
      this.anyListeners = [];
    }
  }

  /**
   * Return the number of listeners for a given event.
   */
  listenerCount(event: GameEventName): number {
    const list = this.listeners[event];
    return list ? list.length : 0;
  }

  /**
   * Return the number of catch-all listeners (see {@link onAny}).
   */
  anyListenerCount(): number {
    return this.anyListeners.length;
  }
}
