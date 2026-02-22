/**
 * Lost Cities card type definitions and deck creation.
 *
 * Lost Cities uses 60 cards across 5 expedition colors:
 *   - Yellow, Blue, White, Green, Red
 *
 * Each color has 12 cards:
 *   - 3 Investment (wager) cards
 *   - Numbered cards: ranks 2 through 10
 *
 * Unlike the standard card-system Card (rank/suit), Lost Cities uses
 * a custom card type with expedition color and investment/rank properties.
 */

// ── Expedition colors ───────────────────────────────────────

/** The five expedition colors in Lost Cities. */
export type ExpeditionColor = 'yellow' | 'blue' | 'white' | 'green' | 'red';

export const EXPEDITION_COLORS: readonly ExpeditionColor[] = [
  'yellow',
  'blue',
  'white',
  'green',
  'red',
] as const;

// ── Card rank ───────────────────────────────────────────────

/** Numbered ranks 2-10 used by expedition cards. */
export type NumberedRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export const NUMBERED_RANKS: readonly NumberedRank[] = [
  2, 3, 4, 5, 6, 7, 8, 9, 10,
] as const;

/** Number of investment cards per color. */
export const INVESTMENTS_PER_COLOR = 3;

/** Number of numbered cards per color. */
export const NUMBERED_CARDS_PER_COLOR = NUMBERED_RANKS.length; // 9

/** Cards per color: 3 investments + 9 numbered = 12. */
export const CARDS_PER_COLOR = INVESTMENTS_PER_COLOR + NUMBERED_CARDS_PER_COLOR;

// ── Card interfaces ─────────────────────────────────────────

interface BaseCard {
  /** Unique sequential id within a deck (0-based). */
  readonly id: number;
  /** The expedition color this card belongs to. */
  readonly color: ExpeditionColor;
  /** Whether the card is face-up. */
  faceUp: boolean;
}

/** An investment (wager) card. Multiplies expedition score. */
export interface InvestmentCard extends BaseCard {
  readonly type: 'investment';
  /**
   * Which investment card this is (1, 2, or 3).
   * In the physical game, all three are identical within a color,
   * but we give each a distinct index for unique identification.
   */
  readonly investmentIndex: 1 | 2 | 3;
}

/** A numbered expedition card with rank 2-10. */
export interface NumberedCard extends BaseCard {
  readonly type: 'numbered';
  readonly rank: NumberedRank;
}

/**
 * Discriminated union of all Lost Cities card types.
 * Use `card.type` to distinguish investment from numbered cards.
 */
export type LostCitiesCard = InvestmentCard | NumberedCard;

// ── Card value helpers ──────────────────────────────────────

/**
 * Get the point value of a card.
 * Investment cards have value 0; numbered cards have their rank value.
 */
export function cardValue(card: LostCitiesCard): number {
  return card.type === 'investment' ? 0 : card.rank;
}

/**
 * Get a sort key for ordering cards in an expedition lane.
 * Investment cards sort before numbered cards (key 0),
 * numbered cards sort by their rank.
 */
export function cardSortKey(card: LostCitiesCard): number {
  return card.type === 'investment' ? 0 : card.rank;
}

/**
 * Check if card `a` can legally be placed after card `b` in an expedition.
 * Investments must come before all numbered cards.
 * Numbered cards must be in strictly ascending rank order.
 */
export function canPlayAfter(
  newCard: LostCitiesCard,
  lastCard: LostCitiesCard,
): boolean {
  // Investment after numbered is never allowed
  if (newCard.type === 'investment' && lastCard.type === 'numbered') {
    return false;
  }
  // Investment after investment is always allowed
  if (newCard.type === 'investment' && lastCard.type === 'investment') {
    return true;
  }
  // Numbered after investment is always allowed
  if (newCard.type === 'numbered' && lastCard.type === 'investment') {
    return true;
  }
  // Numbered after numbered: must be strictly ascending
  return (
    newCard.type === 'numbered' &&
    lastCard.type === 'numbered' &&
    newCard.rank > lastCard.rank
  );
}

// ── Card display helpers ────────────────────────────────────

/** Human-readable label for a card. */
export function cardLabel(card: LostCitiesCard): string {
  const colorName =
    card.color.charAt(0).toUpperCase() + card.color.slice(1);
  if (card.type === 'investment') {
    return `${colorName} Investment ${card.investmentIndex}`;
  }
  return `${colorName} ${card.rank}`;
}

/**
 * Asset key for loading the card's SVG image.
 * Follows the naming convention: `lc-{color}-{type}`.
 * Examples: "lc-yellow-inv1", "lc-blue-5", "lc-back"
 */
export function cardAssetKey(card: LostCitiesCard): string {
  if (card.type === 'investment') {
    return `lc-${card.color}-inv${card.investmentIndex}`;
  }
  return `lc-${card.color}-${card.rank}`;
}

/**
 * Asset key for the compact (small) variant of a card image.
 * Used when displaying cards at small sizes (discard piles, etc.)
 * where the full SVG detail is unreadable.
 * Follows the naming convention: `lc-{color}-{type}-sm`.
 */
export function compactAssetKey(card: LostCitiesCard): string {
  if (card.type === 'investment') {
    return `lc-${card.color}-inv${card.investmentIndex}-sm`;
  }
  return `lc-${card.color}-${card.rank}-sm`;
}

/** Asset key for the card back image. */
export const CARD_BACK_KEY = 'lc-back';

// ── Color display helpers ───────────────────────────────────

/** Hex background color for each expedition. */
export const EXPEDITION_HEX: Record<ExpeditionColor, string> = {
  yellow: '#f5c542',
  blue: '#4287f5',
  white: '#e8e8e8',
  green: '#42b883',
  red: '#e04040',
};

/** Display name for each expedition color. */
export function colorDisplayName(color: ExpeditionColor): string {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

// ── Deck composition ────────────────────────────────────────

/** Total number of cards in a Lost Cities deck. */
export const DECK_SIZE = EXPEDITION_COLORS.length * CARDS_PER_COLOR; // 60

/** Number of cards dealt to each player at the start of a round. */
export const HAND_SIZE = 8;

/** Number of rounds in a full Lost Cities match. */
export const ROUND_COUNT = 3;

// ── Deck creation ───────────────────────────────────────────

/**
 * Create the full 60-card Lost Cities deck (unshuffled).
 * Each card receives a unique sequential id starting from 0.
 * All cards are created face-down by default.
 */
export function createLostCitiesDeck(): LostCitiesCard[] {
  const deck: LostCitiesCard[] = [];
  let nextId = 0;

  for (const color of EXPEDITION_COLORS) {
    // 3 investment cards per color
    for (let i = 1; i <= INVESTMENTS_PER_COLOR; i++) {
      deck.push({
        id: nextId++,
        color,
        type: 'investment',
        investmentIndex: i as 1 | 2 | 3,
        faceUp: false,
      });
    }

    // Numbered cards 2-10 per color
    for (const rank of NUMBERED_RANKS) {
      deck.push({
        id: nextId++,
        color,
        type: 'numbered',
        rank,
        faceUp: false,
      });
    }
  }

  return deck;
}

/**
 * Fisher-Yates shuffle (in-place) with optional RNG.
 *
 * @returns The same array reference (mutated).
 */
export function shuffleDeck(
  deck: LostCitiesCard[],
  rng: () => number = Math.random,
): LostCitiesCard[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
