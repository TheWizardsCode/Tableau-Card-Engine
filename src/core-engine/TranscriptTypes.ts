/**
 * Shared transcript snapshot types for the Tableau Card Engine.
 *
 * Provides the canonical CardSnapshot interface and snapshotCard()
 * helper used by all game transcript modules.  Game-specific
 * snapshot types (board layouts, scoring, etc.) remain in each
 * example game's own GameTranscript module.
 */

import type { Card, Rank, Suit } from '../card-system/Card';

// ── Snapshot types ──────────────────────────────────────────

/**
 * Serializable card snapshot (no methods).
 *
 * Captures rank, suit, and face-up state so that transcript
 * consumers can reconstruct visual card state without needing
 * the full Card object.
 */
export interface CardSnapshot {
  rank: Rank;
  suit: Suit;
  faceUp: boolean;
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Create a serializable snapshot of a card.
 *
 * Always includes `faceUp` so that replay tools and transcript
 * consumers have complete visibility information.
 */
export function snapshotCard(card: Card): CardSnapshot {
  return {
    rank: card.rank,
    suit: card.suit,
    faceUp: card.faceUp,
  };
}
