/**
 * Sushi Go! card type definitions and deck creation.
 *
 * The base Sushi Go! game has 108 cards across 8 card types:
 *   - Tempura (x14)
 *   - Sashimi (x14)
 *   - Dumpling (x14)
 *   - Maki Roll: 1-icon (x6), 2-icon (x12), 3-icon (x8)
 *   - Nigiri: Egg (x5), Salmon (x10), Squid (x5)
 *   - Wasabi (x6)
 *   - Pudding (x10)
 *   - Chopsticks (x4)
 *
 * Unlike the standard card-system Card (rank/suit), Sushi Go! uses
 * a custom card type with game-specific properties.
 */

// ── Card type discriminants ────────────────────────────────

export type SushiGoCardType =
  | 'tempura'
  | 'sashimi'
  | 'dumpling'
  | 'maki'
  | 'nigiri'
  | 'wasabi'
  | 'pudding'
  | 'chopsticks';

export type NigiriVariant = 'egg' | 'salmon' | 'squid';

// ── Card interfaces ─────────────────────────────────────────

interface BaseCard {
  readonly id: number;
  readonly type: SushiGoCardType;
}

export interface TempuraCard extends BaseCard {
  readonly type: 'tempura';
}

export interface SashimiCard extends BaseCard {
  readonly type: 'sashimi';
}

export interface DumplingCard extends BaseCard {
  readonly type: 'dumpling';
}

export interface MakiCard extends BaseCard {
  readonly type: 'maki';
  /** Number of maki roll icons (1, 2, or 3). */
  readonly icons: 1 | 2 | 3;
}

export interface NigiriCard extends BaseCard {
  readonly type: 'nigiri';
  readonly variant: NigiriVariant;
}

export interface WasabiCard extends BaseCard {
  readonly type: 'wasabi';
}

export interface PuddingCard extends BaseCard {
  readonly type: 'pudding';
}

export interface ChopsticksCard extends BaseCard {
  readonly type: 'chopsticks';
}

/** Discriminated union of all Sushi Go! card types. */
export type SushiGoCard =
  | TempuraCard
  | SashimiCard
  | DumplingCard
  | MakiCard
  | NigiriCard
  | WasabiCard
  | PuddingCard
  | ChopsticksCard;

// ── Card display helpers ────────────────────────────────────

/** Human-readable label for a card. */
export function cardLabel(card: SushiGoCard): string {
  switch (card.type) {
    case 'tempura':
      return 'Tempura';
    case 'sashimi':
      return 'Sashimi';
    case 'dumpling':
      return 'Dumpling';
    case 'maki':
      return `Maki x${card.icons}`;
    case 'nigiri':
      return `${card.variant.charAt(0).toUpperCase() + card.variant.slice(1)} Nigiri`;
    case 'wasabi':
      return 'Wasabi';
    case 'pudding':
      return 'Pudding';
    case 'chopsticks':
      return 'Chopsticks';
  }
}

// ── Deck composition ────────────────────────────────────────

/** Number of cards per type in the base Sushi Go! deck. */
export const DECK_COMPOSITION: ReadonlyArray<{
  count: number;
  factory: (id: number) => SushiGoCard;
}> = [
  // Tempura x14
  { count: 14, factory: (id) => ({ id, type: 'tempura' }) },
  // Sashimi x14
  { count: 14, factory: (id) => ({ id, type: 'sashimi' }) },
  // Dumpling x14
  { count: 14, factory: (id) => ({ id, type: 'dumpling' }) },
  // Maki Roll 2-icon x12
  { count: 12, factory: (id) => ({ id, type: 'maki', icons: 2 }) },
  // Maki Roll 3-icon x8
  { count: 8, factory: (id) => ({ id, type: 'maki', icons: 3 }) },
  // Maki Roll 1-icon x6
  { count: 6, factory: (id) => ({ id, type: 'maki', icons: 1 }) },
  // Salmon Nigiri x10
  { count: 10, factory: (id) => ({ id, type: 'nigiri', variant: 'salmon' }) },
  // Squid Nigiri x5
  { count: 5, factory: (id) => ({ id, type: 'nigiri', variant: 'squid' }) },
  // Egg Nigiri x5
  { count: 5, factory: (id) => ({ id, type: 'nigiri', variant: 'egg' }) },
  // Pudding x10
  { count: 10, factory: (id) => ({ id, type: 'pudding' }) },
  // Wasabi x6
  { count: 6, factory: (id) => ({ id, type: 'wasabi' }) },
  // Chopsticks x4
  { count: 4, factory: (id) => ({ id, type: 'chopsticks' }) },
];

/** Total number of cards in the base deck. */
export const DECK_SIZE = DECK_COMPOSITION.reduce((sum, e) => sum + e.count, 0); // 108

// ── Deck creation ───────────────────────────────────────────

/**
 * Create the full 108-card Sushi Go! deck (unshuffled).
 * Each card receives a unique sequential id starting from 0.
 */
export function createSushiGoDeck(): SushiGoCard[] {
  const deck: SushiGoCard[] = [];
  let nextId = 0;

  for (const entry of DECK_COMPOSITION) {
    for (let i = 0; i < entry.count; i++) {
      deck.push(entry.factory(nextId++));
    }
  }

  return deck;
}

/**
 * Fisher-Yates shuffle (in-place) with optional RNG.
 */
export function shuffleDeck(
  deck: SushiGoCard[],
  rng: () => number = Math.random,
): SushiGoCard[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Number of cards dealt per player based on player count.
 * Official rules: 2p=10, 3p=9, 4p=8, 5p=7
 */
export function cardsPerPlayer(playerCount: number): number {
  if (playerCount < 2 || playerCount > 5) {
    throw new Error(`Invalid player count: ${playerCount}. Must be 2-5.`);
  }
  return 12 - playerCount;
}

/** Number of rounds in a full game. */
export const ROUND_COUNT = 3;
