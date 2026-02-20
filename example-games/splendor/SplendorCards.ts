/**
 * SplendorCards.ts
 *
 * Type definitions and data for the Splendor card game:
 * - Gem colors and token types
 * - Development cards (90 total across 3 tiers)
 * - Noble tiles (10 total)
 * - Supply initialization
 *
 * Card data sourced from the official Splendor rulebook.
 */

// ---------------------------------------------------------------------------
// Gem types
// ---------------------------------------------------------------------------

/** The five gem colors plus gold (wild). */
export type GemColor = 'emerald' | 'sapphire' | 'ruby' | 'diamond' | 'onyx';
export type GemOrGold = GemColor | 'gold';

export const GEM_COLORS: readonly GemColor[] = [
  'emerald',
  'sapphire',
  'ruby',
  'diamond',
  'onyx',
] as const;

export const ALL_TOKEN_COLORS: readonly GemOrGold[] = [
  ...GEM_COLORS,
  'gold',
] as const;

/** A bag of gem/gold token counts. Missing keys imply 0. */
export type GemTokens = Partial<Record<GemOrGold, number>>;

/** Shorthand: cost uses only gem colors (no gold in costs). */
export type GemCost = Partial<Record<GemColor, number>>;

// ---------------------------------------------------------------------------
// Helper to read token counts safely
// ---------------------------------------------------------------------------

/** Return the count for a color, defaulting to 0. */
export function tokenCount(tokens: GemTokens, color: GemOrGold): number {
  return tokens[color] ?? 0;
}

/** Return the total number of tokens. */
export function totalTokens(tokens: GemTokens): number {
  let sum = 0;
  for (const c of ALL_TOKEN_COLORS) {
    sum += tokenCount(tokens, c);
  }
  return sum;
}

/** Add two token bags together (returns new object). */
export function addTokens(a: GemTokens, b: GemTokens): GemTokens {
  const result: GemTokens = {};
  for (const c of ALL_TOKEN_COLORS) {
    const val = tokenCount(a, c) + tokenCount(b, c);
    if (val !== 0) result[c] = val;
  }
  return result;
}

/** Subtract b from a (returns new object). Does NOT check for negatives. */
export function subtractTokens(a: GemTokens, b: GemTokens): GemTokens {
  const result: GemTokens = {};
  for (const c of ALL_TOKEN_COLORS) {
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
  readonly cost: GemCost;
  readonly bonus: GemColor;
  readonly points: number;
}

// ---------------------------------------------------------------------------
// Noble tiles
// ---------------------------------------------------------------------------

export interface NobleTile {
  readonly id: number;
  /** The gem bonus counts required from purchased cards. */
  readonly requirements: GemCost;
  readonly points: number; // always 3
}

// ---------------------------------------------------------------------------
// Deck / shuffle utilities
// ---------------------------------------------------------------------------

export function shuffleArray<T>(arr: T[], rng: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Token supply initialization
// ---------------------------------------------------------------------------

/**
 * Token counts per gem color based on player count:
 * - 2 players: 4 of each gem, 5 gold
 * - 3 players: 5 of each gem, 5 gold
 * - 4 players: 7 of each gem, 5 gold
 */
export function createTokenSupply(playerCount: number): GemTokens {
  if (playerCount < 2 || playerCount > 4) {
    throw new Error(`Invalid player count: ${playerCount}. Must be 2-4.`);
  }
  const gemCount = playerCount === 2 ? 4 : playerCount === 3 ? 5 : 7;
  const supply: GemTokens = { gold: 5 };
  for (const color of GEM_COLORS) {
    supply[color] = gemCount;
  }
  return supply;
}

// ---------------------------------------------------------------------------
// Noble tile selection
// ---------------------------------------------------------------------------

/** Select n+1 random noble tiles for the game. */
export function selectNobles(
  playerCount: number,
  rng: () => number = Math.random,
): NobleTile[] {
  const shuffled = shuffleArray([...ALL_NOBLES], rng);
  return shuffled.slice(0, playerCount + 1);
}

// ---------------------------------------------------------------------------
// Development card data — Official Splendor 90-card set
// ---------------------------------------------------------------------------

let nextId = 1;
function card(tier: Tier, bonus: GemColor, points: number, cost: GemCost): DevelopmentCard {
  return { id: nextId++, tier, cost, bonus, points };
}

// Tier 1 — 40 cards
// Abbreviations: W=diamond, U=sapphire, G=emerald, R=ruby, K=onyx
const TIER_1_CARDS: DevelopmentCard[] = [
  // Diamond bonus (8 cards)
  card(1, 'diamond', 0, { sapphire: 1, emerald: 1, ruby: 1, onyx: 1 }),
  card(1, 'diamond', 0, { sapphire: 2, emerald: 1, onyx: 1 }),
  card(1, 'diamond', 0, { sapphire: 2, onyx: 2 }),
  card(1, 'diamond', 0, { sapphire: 3 }),
  card(1, 'diamond', 0, { ruby: 2, onyx: 1 }),
  card(1, 'diamond', 0, { sapphire: 1, emerald: 2, ruby: 1, onyx: 1 }),
  card(1, 'diamond', 0, { emerald: 2, ruby: 1 }),
  card(1, 'diamond', 1, { emerald: 4 }),

  // Sapphire bonus (8 cards)
  card(1, 'sapphire', 0, { diamond: 1, emerald: 1, ruby: 1, onyx: 1 }),
  card(1, 'sapphire', 0, { diamond: 1, emerald: 1, ruby: 2, onyx: 1 }),
  card(1, 'sapphire', 0, { diamond: 1, onyx: 2 }),
  card(1, 'sapphire', 0, { emerald: 2, ruby: 2 }),
  card(1, 'sapphire', 0, { onyx: 3 }),
  card(1, 'sapphire', 0, { diamond: 2, emerald: 2 }),
  card(1, 'sapphire', 0, { emerald: 1, ruby: 2, onyx: 2 }),
  card(1, 'sapphire', 1, { ruby: 4 }),

  // Emerald bonus (8 cards)
  card(1, 'emerald', 0, { diamond: 1, sapphire: 1, ruby: 1, onyx: 1 }),
  card(1, 'emerald', 0, { diamond: 2, sapphire: 1, onyx: 1 }),
  card(1, 'emerald', 0, { diamond: 1, sapphire: 1, ruby: 1, onyx: 2 }),
  card(1, 'emerald', 0, { ruby: 3 }),
  card(1, 'emerald', 0, { diamond: 2, sapphire: 1, ruby: 1 }),
  card(1, 'emerald', 0, { sapphire: 1, ruby: 2, onyx: 1 }),
  card(1, 'emerald', 0, { diamond: 2, ruby: 2 }),
  card(1, 'emerald', 1, { onyx: 4 }),

  // Ruby bonus (8 cards)
  card(1, 'ruby', 0, { diamond: 1, sapphire: 1, emerald: 1, onyx: 1 }),
  card(1, 'ruby', 0, { diamond: 2, emerald: 1, onyx: 2 }),
  card(1, 'ruby', 0, { diamond: 2, emerald: 2 }),
  card(1, 'ruby', 0, { diamond: 3 }),
  card(1, 'ruby', 0, { diamond: 1, ruby: 1, onyx: 3 }),
  card(1, 'ruby', 0, { diamond: 1, sapphire: 2, emerald: 1, onyx: 1 }),
  card(1, 'ruby', 0, { sapphire: 2, emerald: 1 }),
  card(1, 'ruby', 1, { diamond: 4 }),

  // Onyx bonus (8 cards)
  card(1, 'onyx', 0, { diamond: 1, sapphire: 1, emerald: 1, ruby: 1 }),
  card(1, 'onyx', 0, { emerald: 3 }),
  card(1, 'onyx', 0, { diamond: 2, sapphire: 2 }),
  card(1, 'onyx', 0, { emerald: 1, ruby: 2, onyx: 1 }),
  card(1, 'onyx', 0, { diamond: 1, sapphire: 2, emerald: 1, ruby: 1 }),
  card(1, 'onyx', 0, { emerald: 2, ruby: 1 }),
  card(1, 'onyx', 0, { diamond: 2, emerald: 2 }),
  card(1, 'onyx', 1, { sapphire: 4 }),
];

// Tier 2 — 30 cards
const TIER_2_CARDS: DevelopmentCard[] = [
  // Diamond bonus (6 cards)
  card(2, 'diamond', 1, { emerald: 2, ruby: 1, onyx: 3 }),
  card(2, 'diamond', 1, { sapphire: 2, emerald: 2, ruby: 3 }),
  card(2, 'diamond', 2, { emerald: 1, ruby: 4, onyx: 2 }),
  card(2, 'diamond', 2, { ruby: 5 }),
  card(2, 'diamond', 2, { ruby: 5, onyx: 3 }),
  card(2, 'diamond', 3, { diamond: 6 }),

  // Sapphire bonus (6 cards)
  card(2, 'sapphire', 1, { diamond: 2, emerald: 3, onyx: 1 }),
  card(2, 'sapphire', 1, { diamond: 3, emerald: 2, onyx: 2 }),
  card(2, 'sapphire', 2, { sapphire: 2, emerald: 2, onyx: 3 }),
  card(2, 'sapphire', 2, { diamond: 5 }),
  card(2, 'sapphire', 2, { diamond: 2, ruby: 1, onyx: 4 }),
  card(2, 'sapphire', 3, { sapphire: 6 }),

  // Emerald bonus (6 cards)
  card(2, 'emerald', 1, { diamond: 3, sapphire: 1, ruby: 2 }),
  card(2, 'emerald', 1, { diamond: 2, sapphire: 3, ruby: 2 }),
  card(2, 'emerald', 2, { diamond: 4, sapphire: 2, onyx: 1 }),
  card(2, 'emerald', 2, { emerald: 5 }),
  card(2, 'emerald', 2, { diamond: 3, emerald: 2, ruby: 3 }),
  card(2, 'emerald', 3, { emerald: 6 }),

  // Ruby bonus (6 cards)
  card(2, 'ruby', 1, { diamond: 1, sapphire: 3, emerald: 1 }),
  card(2, 'ruby', 1, { sapphire: 3, ruby: 2, onyx: 3 }),
  card(2, 'ruby', 2, { diamond: 1, sapphire: 4, emerald: 2 }),
  card(2, 'ruby', 2, { onyx: 5 }),
  card(2, 'ruby', 2, { diamond: 3, onyx: 5 }),
  card(2, 'ruby', 3, { ruby: 6 }),

  // Onyx bonus (6 cards)
  card(2, 'onyx', 1, { diamond: 1, sapphire: 1, emerald: 3, ruby: 2 }),
  card(2, 'onyx', 1, { diamond: 2, sapphire: 1, emerald: 1, ruby: 3 }),
  card(2, 'onyx', 2, { emerald: 5, ruby: 3 }),
  card(2, 'onyx', 2, { sapphire: 5 }),
  card(2, 'onyx', 2, { diamond: 2, emerald: 4, onyx: 1 }),
  card(2, 'onyx', 3, { onyx: 6 }),
];

// Tier 3 — 20 cards
const TIER_3_CARDS: DevelopmentCard[] = [
  // Diamond bonus (4 cards)
  card(3, 'diamond', 3, { sapphire: 3, emerald: 3, ruby: 5, onyx: 3 }),
  card(3, 'diamond', 4, { diamond: 3, ruby: 3, onyx: 6 }),
  card(3, 'diamond', 4, { onyx: 7 }),
  card(3, 'diamond', 5, { diamond: 3, onyx: 7 }),

  // Sapphire bonus (4 cards)
  card(3, 'sapphire', 3, { diamond: 3, emerald: 3, ruby: 3, onyx: 5 }),
  card(3, 'sapphire', 4, { diamond: 6, sapphire: 3, onyx: 3 }),
  card(3, 'sapphire', 4, { diamond: 7 }),
  card(3, 'sapphire', 5, { diamond: 7, sapphire: 3 }),

  // Emerald bonus (4 cards)
  card(3, 'emerald', 3, { diamond: 5, sapphire: 3, ruby: 3, onyx: 3 }),
  card(3, 'emerald', 4, { sapphire: 7 }),
  card(3, 'emerald', 4, { diamond: 3, sapphire: 6, emerald: 3 }),
  card(3, 'emerald', 5, { sapphire: 7, emerald: 3 }),

  // Ruby bonus (4 cards)
  card(3, 'ruby', 3, { diamond: 3, sapphire: 5, emerald: 3, onyx: 3 }),
  card(3, 'ruby', 4, { emerald: 7 }),
  card(3, 'ruby', 4, { sapphire: 3, emerald: 6, ruby: 3 }),
  card(3, 'ruby', 5, { emerald: 7, ruby: 3 }),

  // Onyx bonus (4 cards)
  card(3, 'onyx', 3, { diamond: 3, sapphire: 3, emerald: 5, ruby: 3 }),
  card(3, 'onyx', 4, { ruby: 7 }),
  card(3, 'onyx', 4, { emerald: 3, ruby: 6, onyx: 3 }),
  card(3, 'onyx', 5, { ruby: 7, onyx: 3 }),
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
// Noble tile data — Official Splendor 10-noble set
// Each noble requires a certain number of card bonuses and gives 3 prestige.
// ---------------------------------------------------------------------------

let nobleId = 1;
function noble(requirements: GemCost): NobleTile {
  return { id: nobleId++, requirements, points: 3 };
}

export const ALL_NOBLES: readonly NobleTile[] = [
  noble({ diamond: 4, sapphire: 4 }),
  noble({ sapphire: 4, emerald: 4 }),
  noble({ emerald: 4, ruby: 4 }),
  noble({ ruby: 4, onyx: 4 }),
  noble({ diamond: 4, onyx: 4 }),
  noble({ diamond: 3, sapphire: 3, onyx: 3 }),
  noble({ sapphire: 3, emerald: 3, ruby: 3 }),
  noble({ emerald: 3, ruby: 3, onyx: 3 }),
  noble({ diamond: 3, sapphire: 3, emerald: 3 }),
  noble({ diamond: 3, emerald: 3, onyx: 3 }),
];

export const TOTAL_NOBLE_COUNT = 10;

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
// Card label helpers (for UI display)
// ---------------------------------------------------------------------------

/** Short abbreviation for a gem color. */
export function gemAbbrev(color: GemOrGold): string {
  switch (color) {
    case 'emerald': return 'G';
    case 'sapphire': return 'U';
    case 'ruby': return 'R';
    case 'diamond': return 'W';
    case 'onyx': return 'K';
    case 'gold': return '$';
  }
}

/** Display name for a gem color. */
export function gemDisplayName(color: GemOrGold): string {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

/** Format a cost object as a short string, e.g. "2W 3R 1K". */
export function formatCost(cost: GemCost): string {
  const parts: string[] = [];
  for (const c of GEM_COLORS) {
    const n = cost[c];
    if (n && n > 0) parts.push(`${n}${gemAbbrev(c)}`);
  }
  return parts.join(' ') || 'Free';
}

/** Format a card as a display label. */
export function cardLabel(card: DevelopmentCard): string {
  const pts = card.points > 0 ? ` [${card.points}pt]` : '';
  return `T${card.tier} ${gemAbbrev(card.bonus)}${pts} (${formatCost(card.cost)})`;
}

/** Format a noble tile as a display label. */
export function nobleLabel(noble: NobleTile): string {
  const reqs: string[] = [];
  for (const c of GEM_COLORS) {
    const n = noble.requirements[c];
    if (n && n > 0) reqs.push(`${n}${gemAbbrev(c)}`);
  }
  return `Noble [3pt] (${reqs.join(' ')})`;
}
