/**
 * Shared card-event payload types.
 *
 * All card-level animation helpers (dealCard, placeCard, discardCard,
 * dragDrop, flipCard) use these types so consumers see a consistent
 * shape regardless of which helper triggered the event.
 *
 * @module core-engine/CardEventPayloads
 */

// ── Base type ────────────────────────────────────────────────

/**
 * Base fields shared by most card-level event payloads.
 */
export interface BaseCardEventPayload {
  /** Card ID (optional, for tracking). */
  readonly cardId?: string;
  /** Player index (optional, for multi-player). */
  readonly playerIndex?: number;
}

// ── Concrete payloads ────────────────────────────────────────

/**
 * Emitted when a card finishes its dealing animation.
 */
export interface CardDealtPayload extends BaseCardEventPayload {
  // Inherits cardId? and playerIndex? from BaseCardEventPayload.
}

/**
 * Emitted when a card finishes its placement animation.
 */
export interface CardPlacedPayload extends BaseCardEventPayload {
  /** Slot / target index (optional, for locating). */
  readonly slotIndex?: number;
  /** Optional action string for contextual events (e.g., 'play-event'). */
  readonly action?: string;
  /** Optional target slot for upgrades, placements etc. */
  readonly targetSlot?: number;
  /** Optional held event id for play-event actions. */
  readonly heldEventId?: string;
}

/**
 * Emitted when a card finishes its discard animation.
 */
export interface CardDiscardedPayload extends BaseCardEventPayload {
  // Inherits cardId? and playerIndex? from BaseCardEventPayload.
}

/**
 * Emitted when a card is flipped face-up in a player's grid.
 *
 * This payload uses a grid-position shape (not BaseCardEventPayload)
 * because it relates to board position rather than hand/pile position.
 */
export interface CardFlippedPayload {
  /** Grid position (row * cols + col) of the flipped card. */
  readonly position: number;
  /** Index of the player whose card was flipped. */
  readonly playerIndex: number;
}
