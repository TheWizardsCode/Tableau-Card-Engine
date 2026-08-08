/**
 * Coloretto card type definitions and deck creation.
 *
 * The full Coloretto deck contains:
 *   - 7 chameleon colors × 6 cards each (3 single + 3 double) = 42 cards
 *   - 3 Joker cards (wild chameleons -- assigned to any color at scoring)
 *   - 3 “+2” bonus point cards (flat +2 points each)
 *   - 1 Last Round trigger card
 *   - Total: 49 cards
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

export type ColorettoCardType = 'chameleon' | 'last-round' | 'joker' | 'bonus';

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

/**
 * Wild chameleon: counts as any color the player declares at scoring
 * time (one color per joker held).
 */
export interface JokerCard extends BaseCard {
  readonly type: 'joker';
}

/** Flat “+2” bonus point card, independent of color scoring. */
export interface BonusCard extends BaseCard {
  readonly type: 'bonus';
}

/** Discriminated union of all Coloretto card types. */
export type ColorettoCard =
  | ChameleonCard
  | LastRoundCard
  | JokerCard
  | BonusCard;

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
  if (card.type === 'joker') return 'Joker';
  if (card.type === 'bonus') return '+2';
  return `${card.count}× ${colorLabel(card.color)}`;
}

// ── Deck composition ────────────────────────────────────────

/** Number of single-chameleon cards per color. */
export const SINGLE_PER_COLOR = 3;
/** Number of double-chameleon cards per color. */
export const DOUBLE_PER_COLOR = 3;
/** Total cards per color (single + double). */
export const CARDS_PER_COLOR = SINGLE_PER_COLOR + DOUBLE_PER_COLOR; // 6

/** Number of Joker (wild chameleon) cards in the full deck. */
export const JOKER_COUNT = 3;
/** Number of “+2” bonus point cards in the full deck. */
export const BONUS_COUNT = 3;

/**
 * Total number of cards in the full deck
 * (42 chameleons + 3 jokers + 3 bonus + 1 Last Round).
 */
export const DECK_SIZE =
  COLORS.length * CARDS_PER_COLOR + JOKER_COUNT + BONUS_COUNT + 1; // 49

// ── Deck creation ───────────────────────────────────────────

/**
 * Create the 49-card Coloretto deck (unshuffled).
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

  for (let i = 0; i < JOKER_COUNT; i++) {
    deck.push({ id: nextId++, type: 'joker' });
  }
  for (let i = 0; i < BONUS_COUNT; i++) {
    deck.push({ id: nextId++, type: 'bonus' });
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
