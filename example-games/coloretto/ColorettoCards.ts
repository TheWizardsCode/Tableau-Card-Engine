/**
 * Coloretto card type definitions and deck creation.
 *
 * The simplified Coloretto deck (initial spike) contains:
 *   - 7 chameleon colors × 6 cards each (3 single + 3 double) = 42 cards
 *   - 1 Last Round trigger card
 *   - Total: 43 cards
 *
 * Joker (wild chameleon) and "+2" bonus cards are tracked as a separate
 * follow-on work item (CG-0MQGJXW67008DZ39) and are NOT part of this deck.
 *
 * Unlike the standard card-system Card (rank/suit), Coloretto uses a
 * custom card type with game-specific properties, following the pattern
 * established by Sushi Go! and Splendor.
 */

// ── Card type discriminants ────────────────────────────────

/** The seven chameleon colors used in Coloretto. */
export type ChameleonColor =
  | 'red'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'orange'
  | 'brown';

export type ColorettoCardType = 'chameleon' | 'last-round';

// ── Card interfaces ─────────────────────────────────────────

interface BaseCard {
  readonly id: number;
}

export interface ChameleonCard extends BaseCard {
  readonly type: 'chameleon';
  /** Chameleon color printed on the card. */
  readonly color: ChameleonColor;
  /** Number of chameleons on the card: 1 (single) or 2 (double). */
  readonly count: 1 | 2;
}

export interface LastRoundCard extends BaseCard {
  readonly type: 'last-round';
}

/** Discriminated union of all Coloretto card types. */
export type ColorettoCard = ChameleonCard | LastRoundCard;

// ── Color display helpers ───────────────────────────────────

/** The seven colors, in canonical game order. */
export const COLORS: readonly ChameleonColor[] = [
  'red',
  'yellow',
  'green',
  'blue',
  'purple',
  'orange',
  'brown',
];

/** Human-readable label for a chameleon color. */
export function colorLabel(color: ChameleonColor): string {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

/**
 * CSS hex colour used for UI rendering of a chameleon color.
 * Pure data — no Phaser dependency.
 */
export function colorHex(color: ChameleonColor): string {
  switch (color) {
    case 'red':
      return '#e04444';
    case 'yellow':
      return '#e8c13d';
    case 'green':
      return '#3aa655';
    case 'blue':
      return '#4a7fd4';
    case 'purple':
      return '#9b59b6';
    case 'orange':
      return '#e67e22';
    case 'brown':
      return '#a0724a';
  }
}

/** Human-readable label for a card (used in tooltips and logs). */
export function cardLabel(card: ColorettoCard): string {
  if (card.type === 'last-round') return 'Last Round';
  return `${card.count}× ${colorLabel(card.color)}`;
}

// ── Deck composition ────────────────────────────────────────

/** Number of single-chameleon cards per color. */
export const SINGLE_PER_COLOR = 3;
/** Number of double-chameleon cards per color. */
export const DOUBLE_PER_COLOR = 3;
/** Total cards per color (single + double). */
export const CARDS_PER_COLOR = SINGLE_PER_COLOR + DOUBLE_PER_COLOR; // 6

/** Total number of cards in the base deck (42 chameleons + 1 Last Round). */
export const DECK_SIZE = COLORS.length * CARDS_PER_COLOR + 1; // 43

// ── Deck creation ───────────────────────────────────────────

/**
 * Create the 43-card Coloretto deck (unshuffled).
 *
 * Each card receives a unique sequential id starting from 0. The Last
 * Round card is always the final card in the base (pre-shuffle) order.
 */
export function createColorettoDeck(): ColorettoCard[] {
  const deck: ColorettoCard[] = [];
  let nextId = 0;

  for (const color of COLORS) {
    for (let i = 0; i < SINGLE_PER_COLOR; i++) {
      deck.push({ id: nextId++, type: 'chameleon', color, count: 1 });
    }
    for (let i = 0; i < DOUBLE_PER_COLOR; i++) {
      deck.push({ id: nextId++, type: 'chameleon', color, count: 2 });
    }
  }

  deck.push({ id: nextId, type: 'last-round' });
  return deck;
}

// ── Player-count configuration ──────────────────────────────

/**
 * Number of shared rows based on player count (canonical rules):
 *   2-3 players → 3 rows, 4 players → 4 rows, 5 players → 5 rows.
 */
export function rowsForPlayerCount(playerCount: number): number {
  if (playerCount < 2 || playerCount > 5) {
    throw new Error(
      `Invalid player count: ${playerCount}. Coloretto supports 2-5 players.`,
    );
  }
  if (playerCount >= 5) return 5;
  if (playerCount >= 4) return 4;
  return 3;
}

/**
 * Number of rounds in a full game based on player count (canonical rules):
 *   2 players → 7, 3 players → 5, 4 players → 4, 5 players → 3.
 */
export function roundsForPlayerCount(playerCount: number): number {
  if (playerCount < 2 || playerCount > 5) {
    throw new Error(
      `Invalid player count: ${playerCount}. Coloretto supports 2-5 players.`,
    );
  }
  return [7, 5, 4, 3][playerCount - 2];
}

/** Maximum number of cards a single row may hold. */
export const ROW_CAPACITY = 3;
