/**
 * FeudalismCards.ts
 *
 * Type definitions and data for the Feudalism card game:
 * - Resource types and token types
 * - Development cards (90 total across 3 tiers)
 * - Patron tiles (10 total)
 * - Supply initialization
 *
 * Card data sourced from the official Feudalism rulebook.
 */

// ---------------------------------------------------------------------------
// Resource types
// ---------------------------------------------------------------------------

/** The five resource types plus mead (wild). */
export type ResourceType = 'oats' | 'flax' | 'wheat' | 'barley' | 'turnip';
export type ResourceOrWild = ResourceType | 'mead';

export const RESOURCE_TYPES: readonly ResourceType[] = [
  'oats',
  'flax',
  'wheat',
  'barley',
  'turnip',
] as const;

export const ALL_RESOURCE_TYPES: readonly ResourceOrWild[] = [
  ...RESOURCE_TYPES,
  'mead',
] as const;

/** A bag of resource/mead token counts. Missing keys imply 0. */
export type ResourceTokens = Partial<Record<ResourceOrWild, number>>;

/** Shorthand: cost uses only resource types (no mead in costs). */
export type ResourceCost = Partial<Record<ResourceType, number>>;

// ---------------------------------------------------------------------------
// Helper to read token counts safely
// ---------------------------------------------------------------------------

/** Return the count for a color, defaulting to 0. */
export function tokenCount(tokens: ResourceTokens, color: ResourceOrWild): number {
  return tokens[color] ?? 0;
}

/** Return the total number of tokens. */
export function totalTokens(tokens: ResourceTokens): number {
  let sum = 0;
  for (const c of ALL_RESOURCE_TYPES) {
    sum += tokenCount(tokens, c);
  }
  return sum;
}

/** Add two token bags together (returns new object). */
export function addTokens(a: ResourceTokens, b: ResourceTokens): ResourceTokens {
  const result: ResourceTokens = {};
  for (const c of ALL_RESOURCE_TYPES) {
    const val = tokenCount(a, c) + tokenCount(b, c);
    if (val !== 0) result[c] = val;
  }
  return result;
}

/** Subtract b from a (returns new object). Does NOT check for negatives. */
export function subtractTokens(a: ResourceTokens, b: ResourceTokens): ResourceTokens {
  const result: ResourceTokens = {};
  for (const c of ALL_RESOURCE_TYPES) {
    const val = tokenCount(a, c) - tokenCount(b, c);
    if (val !== 0) result[c] = val;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Development cards
// ---------------------------------------------------------------------------

export type Tier = 1 | 2 | 3;

export interface DevelopmentCard {
  readonly id: number;
  readonly tier: Tier;
  readonly cost: ResourceCost;
  readonly bonus: ResourceType;
  readonly points: number;
}

// ---------------------------------------------------------------------------
// Patron tiles
// ---------------------------------------------------------------------------

export interface PatronTile {
  readonly id: number;
  /** The resource bonus counts required from purchased cards. */
  readonly requirements: ResourceCost;
  readonly points: number; // always 3
}

// ---------------------------------------------------------------------------
// Deck / shuffle utilities
// ---------------------------------------------------------------------------

import { shuffleArray } from '../../src/card-system/Deck';

// Re-export so existing consumers (tests, other modules) can still import
// shuffleArray from this file without breaking.
export { shuffleArray } from '../../src/card-system/Deck';

// ---------------------------------------------------------------------------
// Token supply initialization
// ---------------------------------------------------------------------------

/**
 * Token counts per resource type based on player count:
 * - 2 players: 4 of each resource, 5 mead
 * - 3 players: 5 of each resource, 5 mead
 * - 4 players: 7 of each resource, 5 mead
 */
export function createTokenSupply(playerCount: number): ResourceTokens {
  if (playerCount < 2 || playerCount > 4) {
    throw new Error(`Invalid player count: ${playerCount}. Must be 2-4.`);
  }
  const cropCount = playerCount === 2 ? 4 : playerCount === 3 ? 5 : 7;
  const supply: ResourceTokens = { mead: 5 };
  for (const color of RESOURCE_TYPES) {
    supply[color] = cropCount;
  }
  return supply;
}

// ---------------------------------------------------------------------------
// Patron tile selection
// ---------------------------------------------------------------------------

/** Select n+1 random patron tiles for the game. */
export function selectPatrons(
  playerCount: number,
  rng: () => number = Math.random,
): PatronTile[] {
  const shuffled = shuffleArray([...ALL_PATRONS], rng);
  return shuffled.slice(0, playerCount + 1);
}

// ---------------------------------------------------------------------------
// Development card data — Official Feudalism 90-card set
// ---------------------------------------------------------------------------

let nextId = 1;
function card(tier: Tier, bonus: ResourceType, points: number, cost: ResourceCost): DevelopmentCard {
  return { id: nextId++, tier, cost, bonus, points };
}

// Tier 1 — 40 cards
// Abbreviations: B=barley, F=flax, O=oats, W=wheat, T=turnip
const TIER_1_CARDS: DevelopmentCard[] = [
  // Barley bonus (8 cards)
  card(1, 'barley', 0, { flax: 1, oats: 1, wheat: 1, turnip: 1 }),
  card(1, 'barley', 0, { flax: 2, oats: 1, turnip: 1 }),
  card(1, 'barley', 0, { flax: 2, turnip: 2 }),
  card(1, 'barley', 0, { flax: 3 }),
  card(1, 'barley', 0, { wheat: 2, turnip: 1 }),
  card(1, 'barley', 0, { flax: 1, oats: 2, wheat: 1, turnip: 1 }),
  card(1, 'barley', 0, { oats: 2, wheat: 1 }),
  card(1, 'barley', 1, { oats: 4 }),

  // Flax bonus (8 cards)
  card(1, 'flax', 0, { barley: 1, oats: 1, wheat: 1, turnip: 1 }),
  card(1, 'flax', 0, { barley: 1, oats: 1, wheat: 2, turnip: 1 }),
  card(1, 'flax', 0, { barley: 1, turnip: 2 }),
  card(1, 'flax', 0, { oats: 2, wheat: 2 }),
  card(1, 'flax', 0, { turnip: 3 }),
  card(1, 'flax', 0, { barley: 2, oats: 2 }),
  card(1, 'flax', 0, { oats: 1, wheat: 2, turnip: 2 }),
  card(1, 'flax', 1, { wheat: 4 }),

  // Oats bonus (8 cards)
  card(1, 'oats', 0, { barley: 1, flax: 1, wheat: 1, turnip: 1 }),
  card(1, 'oats', 0, { barley: 2, flax: 1, turnip: 1 }),
  card(1, 'oats', 0, { barley: 1, flax: 1, wheat: 1, turnip: 2 }),
  card(1, 'oats', 0, { wheat: 3 }),
  card(1, 'oats', 0, { barley: 2, flax: 1, wheat: 1 }),
  card(1, 'oats', 0, { flax: 1, wheat: 2, turnip: 1 }),
  card(1, 'oats', 0, { barley: 2, wheat: 2 }),
  card(1, 'oats', 1, { turnip: 4 }),

  // Wheat bonus (8 cards)
  card(1, 'wheat', 0, { barley: 1, flax: 1, oats: 1, turnip: 1 }),
  card(1, 'wheat', 0, { barley: 2, oats: 1, turnip: 2 }),
  card(1, 'wheat', 0, { barley: 2, oats: 2 }),
  card(1, 'wheat', 0, { barley: 3 }),
  card(1, 'wheat', 0, { barley: 1, wheat: 1, turnip: 3 }),
  card(1, 'wheat', 0, { barley: 1, flax: 2, oats: 1, turnip: 1 }),
  card(1, 'wheat', 0, { flax: 2, oats: 1 }),
  card(1, 'wheat', 1, { barley: 4 }),

  // Turnip bonus (8 cards)
  card(1, 'turnip', 0, { barley: 1, flax: 1, oats: 1, wheat: 1 }),
  card(1, 'turnip', 0, { oats: 3 }),
  card(1, 'turnip', 0, { barley: 2, flax: 2 }),
  card(1, 'turnip', 0, { oats: 1, wheat: 2, turnip: 1 }),
  card(1, 'turnip', 0, { barley: 1, flax: 2, oats: 1, wheat: 1 }),
  card(1, 'turnip', 0, { oats: 2, wheat: 1 }),
  card(1, 'turnip', 0, { barley: 2, oats: 2 }),
  card(1, 'turnip', 1, { flax: 4 }),
];

// Tier 2 — 30 cards
const TIER_2_CARDS: DevelopmentCard[] = [
  // Barley bonus (6 cards)
  card(2, 'barley', 1, { oats: 2, wheat: 1, turnip: 3 }),
  card(2, 'barley', 1, { flax: 2, oats: 2, wheat: 3 }),
  card(2, 'barley', 2, { oats: 1, wheat: 4, turnip: 2 }),
  card(2, 'barley', 2, { wheat: 5 }),
  card(2, 'barley', 2, { wheat: 5, turnip: 3 }),
  card(2, 'barley', 3, { barley: 6 }),

  // Flax bonus (6 cards)
  card(2, 'flax', 1, { barley: 2, oats: 3, turnip: 1 }),
  card(2, 'flax', 1, { barley: 3, oats: 2, turnip: 2 }),
  card(2, 'flax', 2, { flax: 2, oats: 2, turnip: 3 }),
  card(2, 'flax', 2, { barley: 5 }),
  card(2, 'flax', 2, { barley: 2, wheat: 1, turnip: 4 }),
  card(2, 'flax', 3, { flax: 6 }),

  // Oats bonus (6 cards)
  card(2, 'oats', 1, { barley: 3, flax: 1, wheat: 2 }),
  card(2, 'oats', 1, { barley: 2, flax: 3, wheat: 2 }),
  card(2, 'oats', 2, { barley: 4, flax: 2, turnip: 1 }),
  card(2, 'oats', 2, { oats: 5 }),
  card(2, 'oats', 2, { barley: 3, oats: 2, wheat: 3 }),
  card(2, 'oats', 3, { oats: 6 }),

  // Wheat bonus (6 cards)
  card(2, 'wheat', 1, { barley: 1, flax: 3, oats: 1 }),
  card(2, 'wheat', 1, { flax: 3, wheat: 2, turnip: 3 }),
  card(2, 'wheat', 2, { barley: 1, flax: 4, oats: 2 }),
  card(2, 'wheat', 2, { turnip: 5 }),
  card(2, 'wheat', 2, { barley: 3, turnip: 5 }),
  card(2, 'wheat', 3, { wheat: 6 }),

  // Turnip bonus (6 cards)
  card(2, 'turnip', 1, { barley: 1, flax: 1, oats: 3, wheat: 2 }),
  card(2, 'turnip', 1, { barley: 2, flax: 1, oats: 1, wheat: 3 }),
  card(2, 'turnip', 2, { oats: 5, wheat: 3 }),
  card(2, 'turnip', 2, { flax: 5 }),
  card(2, 'turnip', 2, { barley: 2, oats: 4, turnip: 1 }),
  card(2, 'turnip', 3, { turnip: 6 }),
];

// Tier 3 — 20 cards
const TIER_3_CARDS: DevelopmentCard[] = [
  // Barley bonus (4 cards)
  card(3, 'barley', 3, { flax: 3, oats: 3, wheat: 5, turnip: 3 }),
  card(3, 'barley', 4, { barley: 3, wheat: 3, turnip: 6 }),
  card(3, 'barley', 4, { turnip: 7 }),
  card(3, 'barley', 5, { barley: 3, turnip: 7 }),

  // Flax bonus (4 cards)
  card(3, 'flax', 3, { barley: 3, oats: 3, wheat: 3, turnip: 5 }),
  card(3, 'flax', 4, { barley: 6, flax: 3, turnip: 3 }),
  card(3, 'flax', 4, { barley: 7 }),
  card(3, 'flax', 5, { barley: 7, flax: 3 }),

  // Oats bonus (4 cards)
  card(3, 'oats', 3, { barley: 5, flax: 3, wheat: 3, turnip: 3 }),
  card(3, 'oats', 4, { flax: 7 }),
  card(3, 'oats', 4, { barley: 3, flax: 6, oats: 3 }),
  card(3, 'oats', 5, { flax: 7, oats: 3 }),

  // Wheat bonus (4 cards)
  card(3, 'wheat', 3, { barley: 3, flax: 5, oats: 3, turnip: 3 }),
  card(3, 'wheat', 4, { oats: 7 }),
  card(3, 'wheat', 4, { flax: 3, oats: 6, wheat: 3 }),
  card(3, 'wheat', 5, { oats: 7, wheat: 3 }),

  // Turnip bonus (4 cards)
  card(3, 'turnip', 3, { barley: 3, flax: 3, oats: 5, wheat: 3 }),
  card(3, 'turnip', 4, { wheat: 7 }),
  card(3, 'turnip', 4, { oats: 3, wheat: 6, turnip: 3 }),
  card(3, 'turnip', 5, { wheat: 7, turnip: 3 }),
];

/** All 90 development cards. */
export const ALL_DEVELOPMENT_CARDS: readonly DevelopmentCard[] = [
  ...TIER_1_CARDS,
  ...TIER_2_CARDS,
  ...TIER_3_CARDS,
];

/** Number of cards per tier. */
export const TIER_1_COUNT = 40;
export const TIER_2_COUNT = 30;
export const TIER_3_COUNT = 20;
export const TOTAL_CARD_COUNT = 90;

// ---------------------------------------------------------------------------
// Patron tile data — Official Feudalism 10-patron set
// Each patron requires a certain number of card bonuses and gives 3 influence.
// ---------------------------------------------------------------------------

let patronId = 1;
function patron(requirements: ResourceCost): PatronTile {
  return { id: patronId++, requirements, points: 3 };
}

export const ALL_PATRONS: readonly PatronTile[] = [
  patron({ barley: 4, flax: 4 }),
  patron({ flax: 4, oats: 4 }),
  patron({ oats: 4, wheat: 4 }),
  patron({ wheat: 4, turnip: 4 }),
  patron({ barley: 4, turnip: 4 }),
  patron({ barley: 3, flax: 3, turnip: 3 }),
  patron({ flax: 3, oats: 3, wheat: 3 }),
  patron({ oats: 3, wheat: 3, turnip: 3 }),
  patron({ barley: 3, flax: 3, oats: 3 }),
  patron({ barley: 3, oats: 3, turnip: 3 }),
];

export const TOTAL_PATRON_COUNT = 10;

// ---------------------------------------------------------------------------
// Deck creation helpers
// ---------------------------------------------------------------------------

/** Create shuffled tier decks for a new game. */
export function createTierDecks(rng: () => number = Math.random): {
  tier1: DevelopmentCard[];
  tier2: DevelopmentCard[];
  tier3: DevelopmentCard[];
} {
  return {
    tier1: shuffleArray([...TIER_1_CARDS], rng),
    tier2: shuffleArray([...TIER_2_CARDS], rng),
    tier3: shuffleArray([...TIER_3_CARDS], rng),
  };
}

/** Number of visible cards per tier in the market. */
export const MARKET_SIZE = 4;

/** Prestige points needed to trigger end of game. */
export const WIN_THRESHOLD = 15;

/** Maximum number of reserved cards a player can hold. */
export const MAX_RESERVED = 3;

/** Maximum total tokens a player can hold. */
export const MAX_TOKENS = 10;

// ---------------------------------------------------------------------------
// Resource label helpers (for UI display)
// ---------------------------------------------------------------------------

/** Short abbreviation for a resource type. */
export function resourceAbbrev(color: ResourceOrWild): string {
  switch (color) {
    case 'oats': return 'O';
    case 'flax': return 'F';
    case 'wheat': return 'W';
    case 'barley': return 'B';
    case 'turnip': return 'T';
    case 'mead': return 'M';
  }
}

/** Display name for a resource type. */
export function resourceDisplayName(color: ResourceOrWild): string {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

/** Format a cost object as a short string, e.g. "2W 3R 1K". */
export function formatCost(cost: ResourceCost): string {
  const parts: string[] = [];
  for (const c of RESOURCE_TYPES) {
    const n = cost[c];
    if (n && n > 0) parts.push(`${n}${resourceAbbrev(c)}`);
  }
  return parts.join(' ') || 'Free';
}

/** Format a card as a display label. */
export function cardLabel(card: DevelopmentCard): string {
  const pts = card.points > 0 ? ` [${card.points}pt]` : '';
  return `T${card.tier} ${resourceAbbrev(card.bonus)}${pts} (${formatCost(card.cost)})`;
}

/** Format a patron tile as a display label. */
export function patronLabel(patron: PatronTile): string {
  const reqs: string[] = [];
  for (const c of RESOURCE_TYPES) {
    const n = patron.requirements[c];
    if (n && n > 0) reqs.push(`${n}${resourceAbbrev(c)}`);
  }
  return `Patron [3pt] (${reqs.join(' ')})`;
}
