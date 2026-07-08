/**
 * The Mind card type definitions and deck creation.
 *
 * The Mind uses 100 cards numbered 1 through 100. Players cooperatively
 * play cards in ascending order without communicating. Each card has
 * a numeric value and a faceUp state.
 *
 * Unlike the standard card-system Card (rank/suit), The Mind uses
 * a simple numbered card type with values 1-100.
 */

// ── Card type ───────────────────────────────────────────────

/**
 * A single card in The Mind.
 *
 * Each card has a unique value from 1 to 100 and a mutable
 * faceUp state indicating whether the card is visible.
 */
export interface MindCard {
  /** Unique card value (1-100), also serves as the card's identity. */
  readonly value: number;
  /** Whether the card is face-up (visible to players). */
  faceUp: boolean;
}

// ── Constants ───────────────────────────────────────────────

/** Total number of cards in a Mind deck. */
export const DECK_SIZE = 100;

/** Minimum card value. */
export const MIN_VALUE = 1;

/** Maximum card value. */
export const MAX_VALUE = 100;

// ── Card display helpers ────────────────────────────────────

/**
 * Human-readable label for a Mind card.
 * Returns the card's numeric value as a string.
 */
export function cardLabel(card: MindCard): string {
  return `${card.value}`;
}

/**
 * Asset key for loading the card's image.
 * Follows the naming convention: `mind-{value}`.
 * Examples: "mind-1", "mind-42", "mind-100"
 */
export function cardAssetKey(card: MindCard): string {
  return `mind-${card.value}`;
}

/** Asset key for the card back image. */
export const CARD_BACK_KEY = 'mind-back';

// ── Deck creation ───────────────────────────────────────────

/**
 * Create the full 100-card Mind deck (unshuffled).
 *
 * Cards are numbered 1 through 100 in ascending order.
 * All cards are created face-down by default.
 */
export function createMindDeck(): MindCard[] {
  const deck: MindCard[] = [];

  for (let value = MIN_VALUE; value <= MAX_VALUE; value++) {
    deck.push({ value, faceUp: false });
  }

  return deck;
}

// ── Shuffle re-export ───────────────────────────────────────

/**
 * Fisher-Yates shuffle (in-place) with optional RNG.
 *
 * Re-exports `shuffleArray` from the shared card-system module,
 * aliased as `shuffleDeck` for consistency with other example games.
 *
 * @returns The same array reference (mutated).
 */
import { shuffleArray } from '../../src/card-system/Deck';

export const shuffleDeck: typeof shuffleArray = shuffleArray;
