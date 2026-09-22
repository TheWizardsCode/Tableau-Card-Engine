/**
 * Event-emission helper for card animation callbacks.
 *
 * Provides a single entry point that either:
 *   1. Emits a typed event via a GameEventEmitter, or
 *   2. Invokes an optional fallback callback.
 *
 * This eliminates the per-module event-payload duplication and makes it
 * easy to migrate helpers one at a time.
 *
 * @module core-engine/event-emission
 */

// ── Public API ───────────────────────────────────────────────

/**
 * Configuration for event emission.
 *
 * @template T - The payload type (must match the event's payload in GameEventMap).
 */
export interface EventEmissionConfig<T> {
  /** Optional event emitter. When present, events are emitted through it. */
  gameEvents?: {
    emit(event: string, payload: unknown): void;
  };
  /** The event name to emit (e.g. 'card:dealt'). */
  event: string;
  /** The payload to send with the event. */
  payload: T;
  /** Optional fallback callback when no emitter is provided. */
  onEvent?: (payload: T) => void;
}

/**
 * Emit a card event through a GameEventEmitter or fall back to a callback.
 *
 * Behaviour:
 *   1. If `config.gameEvents` is provided, emit the event via it.
 *   2. Otherwise, if `config.onEvent` is provided, invoke it with the payload.
 *   3. If neither is available, this is a no-op.
 *
 * @param config - Emission configuration carrying the event, payload, and emitter/callback.
 *
 * @example
 * ```ts
 * emitEventOrCallback({
 *   gameEvents: scene.gameEvents,
 *   event: 'card:dealt',
 *   payload: { cardId: 'h1', playerIndex: 0 } as CardDealtPayload,
 * });
 * ```
 *
 * @example (callback fallback)
 * ```ts
 * emitEventOrCallback({
 *   event: 'card:dealt',
 *   payload: { cardId: 'h1' } as CardDealtPayload,
 *   onEvent: (p) => console.log('Dealt:', p.cardId),
 * });
 * ```
 */
export function emitEventOrCallback<T>(
  config: EventEmissionConfig<T>,
): void {
  const { gameEvents, event, payload, onEvent } = config;

  if (gameEvents) {
    gameEvents.emit(event, payload);
  } else if (onEvent) {
    onEvent(payload);
  }
  // Else: no-op — both are optional.
}
