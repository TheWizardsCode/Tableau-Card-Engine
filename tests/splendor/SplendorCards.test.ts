import { describe, it, expect } from 'vitest';
import {
  GEM_COLORS,
  ALL_TOKEN_COLORS,
  ALL_DEVELOPMENT_CARDS,
  ALL_NOBLES,
  TIER_1_COUNT,
  TIER_2_COUNT,
  TIER_3_COUNT,
  TOTAL_CARD_COUNT,
  TOTAL_NOBLE_COUNT,
  MARKET_SIZE,
  WIN_THRESHOLD,
  MAX_RESERVED,
  MAX_TOKENS,
  tokenCount,
  totalTokens,
  addTokens,
  subtractTokens,
  createTokenSupply,
  selectNobles,
  createTierDecks,
  shuffleArray,
  formatCost,
  cardLabel,
  nobleLabel,
  gemAbbrev,
  gemDisplayName,
  type GemTokens,
} from '../../example-games/splendor/SplendorCards';

// ---------------------------------------------------------------------------
// Deterministic RNG for reproducible tests
// ---------------------------------------------------------------------------
function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe('SplendorCards', () => {
  // -------------------------------------------------------------------------
  // Constants
  // -------------------------------------------------------------------------
  describe('constants', () => {
    it('has 5 gem colors', () => {
      expect(GEM_COLORS).toHaveLength(5);
      expect(GEM_COLORS).toContain('emerald');
      expect(GEM_COLORS).toContain('sapphire');
      expect(GEM_COLORS).toContain('ruby');
      expect(GEM_COLORS).toContain('diamond');
      expect(GEM_COLORS).toContain('onyx');
    });

    it('has 6 token colors (gems + gold)', () => {
      expect(ALL_TOKEN_COLORS).toHaveLength(6);
      expect(ALL_TOKEN_COLORS).toContain('gold');
    });

    it('has correct game constants', () => {
      expect(MARKET_SIZE).toBe(4);
      expect(WIN_THRESHOLD).toBe(15);
      expect(MAX_RESERVED).toBe(3);
      expect(MAX_TOKENS).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // Development cards
  // -------------------------------------------------------------------------
  describe('development cards', () => {
    it('has exactly 90 cards total', () => {
      expect(ALL_DEVELOPMENT_CARDS).toHaveLength(TOTAL_CARD_COUNT);
      expect(TOTAL_CARD_COUNT).toBe(90);
    });

    it('has 40 tier-1 cards', () => {
      const tier1 = ALL_DEVELOPMENT_CARDS.filter(c => c.tier === 1);
      expect(tier1).toHaveLength(TIER_1_COUNT);
      expect(TIER_1_COUNT).toBe(40);
    });

    it('has 30 tier-2 cards', () => {
      const tier2 = ALL_DEVELOPMENT_CARDS.filter(c => c.tier === 2);
      expect(tier2).toHaveLength(TIER_2_COUNT);
      expect(TIER_2_COUNT).toBe(30);
    });

    it('has 20 tier-3 cards', () => {
      const tier3 = ALL_DEVELOPMENT_CARDS.filter(c => c.tier === 3);
      expect(tier3).toHaveLength(TIER_3_COUNT);
      expect(TIER_3_COUNT).toBe(20);
    });

    it('all cards have unique IDs', () => {
      const ids = ALL_DEVELOPMENT_CARDS.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('every card has a valid tier', () => {
      for (const c of ALL_DEVELOPMENT_CARDS) {
        expect([1, 2, 3]).toContain(c.tier);
      }
    });

    it('every card has a valid bonus color (not gold)', () => {
      for (const c of ALL_DEVELOPMENT_CARDS) {
        expect(GEM_COLORS).toContain(c.bonus);
      }
    });

    it('every card has non-negative points', () => {
      for (const c of ALL_DEVELOPMENT_CARDS) {
        expect(c.points).toBeGreaterThanOrEqual(0);
      }
    });

    it('every card cost uses only gem colors (no gold)', () => {
      for (const c of ALL_DEVELOPMENT_CARDS) {
        expect(c.cost).not.toHaveProperty('gold');
        for (const color of GEM_COLORS) {
          const val = c.cost[color];
          if (val !== undefined) {
            expect(val).toBeGreaterThan(0);
          }
        }
      }
    });

    it('tier 1 has 8 cards of each bonus color', () => {
      const tier1 = ALL_DEVELOPMENT_CARDS.filter(c => c.tier === 1);
      for (const color of GEM_COLORS) {
        const count = tier1.filter(c => c.bonus === color).length;
        expect(count).toBe(8);
      }
    });

    it('tier 2 has 6 cards of each bonus color', () => {
      const tier2 = ALL_DEVELOPMENT_CARDS.filter(c => c.tier === 2);
      for (const color of GEM_COLORS) {
        const count = tier2.filter(c => c.bonus === color).length;
        expect(count).toBe(6);
      }
    });

    it('tier 3 has 4 cards of each bonus color', () => {
      const tier3 = ALL_DEVELOPMENT_CARDS.filter(c => c.tier === 3);
      for (const color of GEM_COLORS) {
        const count = tier3.filter(c => c.bonus === color).length;
        expect(count).toBe(4);
      }
    });

    it('tier-1 cards have 0-1 points', () => {
      const tier1 = ALL_DEVELOPMENT_CARDS.filter(c => c.tier === 1);
      for (const c of tier1) {
        expect(c.points).toBeLessThanOrEqual(1);
      }
    });

    it('tier-2 cards have 1-3 points', () => {
      const tier2 = ALL_DEVELOPMENT_CARDS.filter(c => c.tier === 2);
      for (const c of tier2) {
        expect(c.points).toBeGreaterThanOrEqual(1);
        expect(c.points).toBeLessThanOrEqual(3);
      }
    });

    it('tier-3 cards have 3-5 points', () => {
      const tier3 = ALL_DEVELOPMENT_CARDS.filter(c => c.tier === 3);
      for (const c of tier3) {
        expect(c.points).toBeGreaterThanOrEqual(3);
        expect(c.points).toBeLessThanOrEqual(5);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Noble tiles
  // -------------------------------------------------------------------------
  describe('noble tiles', () => {
    it('has exactly 10 nobles', () => {
      expect(ALL_NOBLES).toHaveLength(TOTAL_NOBLE_COUNT);
      expect(TOTAL_NOBLE_COUNT).toBe(10);
    });

    it('all nobles have unique IDs', () => {
      const ids = ALL_NOBLES.map(n => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all nobles give exactly 3 prestige points', () => {
      for (const n of ALL_NOBLES) {
        expect(n.points).toBe(3);
      }
    });

    it('all noble requirements use only gem colors (no gold)', () => {
      for (const n of ALL_NOBLES) {
        expect(n.requirements).not.toHaveProperty('gold');
        for (const color of GEM_COLORS) {
          const val = n.requirements[color];
          if (val !== undefined) {
            expect(val).toBeGreaterThan(0);
          }
        }
      }
    });

    it('nobles require either 2 colors at 4 each or 3 colors at 3 each', () => {
      for (const n of ALL_NOBLES) {
        const values = GEM_COLORS.map(c => n.requirements[c] ?? 0).filter(v => v > 0);
        const isType1 = values.length === 2 && values.every(v => v === 4);
        const isType2 = values.length === 3 && values.every(v => v === 3);
        expect(isType1 || isType2).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Token utilities
  // -------------------------------------------------------------------------
  describe('token utilities', () => {
    it('tokenCount returns 0 for missing colors', () => {
      expect(tokenCount({}, 'ruby')).toBe(0);
      expect(tokenCount({ emerald: 3 }, 'ruby')).toBe(0);
    });

    it('tokenCount returns stored value', () => {
      expect(tokenCount({ ruby: 5 }, 'ruby')).toBe(5);
    });

    it('totalTokens sums all colors', () => {
      expect(totalTokens({})).toBe(0);
      expect(totalTokens({ ruby: 2, emerald: 3, gold: 1 })).toBe(6);
    });

    it('addTokens combines two bags', () => {
      const a: GemTokens = { ruby: 2, emerald: 1 };
      const b: GemTokens = { ruby: 1, sapphire: 3 };
      const result = addTokens(a, b);
      expect(result.ruby).toBe(3);
      expect(result.emerald).toBe(1);
      expect(result.sapphire).toBe(3);
    });

    it('subtractTokens subtracts b from a', () => {
      const a: GemTokens = { ruby: 5, emerald: 3 };
      const b: GemTokens = { ruby: 2, emerald: 1 };
      const result = subtractTokens(a, b);
      expect(result.ruby).toBe(3);
      expect(result.emerald).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Token supply
  // -------------------------------------------------------------------------
  describe('createTokenSupply', () => {
    it('2-player supply has 4 of each gem + 5 gold', () => {
      const supply = createTokenSupply(2);
      for (const c of GEM_COLORS) {
        expect(supply[c]).toBe(4);
      }
      expect(supply.gold).toBe(5);
    });

    it('3-player supply has 5 of each gem + 5 gold', () => {
      const supply = createTokenSupply(3);
      for (const c of GEM_COLORS) {
        expect(supply[c]).toBe(5);
      }
      expect(supply.gold).toBe(5);
    });

    it('4-player supply has 7 of each gem + 5 gold', () => {
      const supply = createTokenSupply(4);
      for (const c of GEM_COLORS) {
        expect(supply[c]).toBe(7);
      }
      expect(supply.gold).toBe(5);
    });

    it('throws for invalid player counts', () => {
      expect(() => createTokenSupply(1)).toThrow();
      expect(() => createTokenSupply(5)).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Noble selection
  // -------------------------------------------------------------------------
  describe('selectNobles', () => {
    it('selects n+1 nobles for 2 players', () => {
      const nobles = selectNobles(2, makeRng(42));
      expect(nobles).toHaveLength(3);
    });

    it('selects n+1 nobles for 3 players', () => {
      const nobles = selectNobles(3, makeRng(42));
      expect(nobles).toHaveLength(4);
    });

    it('selects n+1 nobles for 4 players', () => {
      const nobles = selectNobles(4, makeRng(42));
      expect(nobles).toHaveLength(5);
    });

    it('selected nobles have unique IDs', () => {
      const nobles = selectNobles(4, makeRng(99));
      const ids = nobles.map(n => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('different seeds produce different selections', () => {
      const a = selectNobles(2, makeRng(1));
      const b = selectNobles(2, makeRng(999));
      const aIds = a.map(n => n.id).sort();
      const bIds = b.map(n => n.id).sort();
      // Very unlikely to be identical with different seeds
      expect(aIds.join(',') !== bIds.join(',')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Deck creation
  // -------------------------------------------------------------------------
  describe('createTierDecks', () => {
    it('creates 3 decks with correct sizes', () => {
      const decks = createTierDecks(makeRng(42));
      expect(decks.tier1).toHaveLength(40);
      expect(decks.tier2).toHaveLength(30);
      expect(decks.tier3).toHaveLength(20);
    });

    it('decks contain unique IDs (no duplicates within a tier)', () => {
      const decks = createTierDecks(makeRng(42));
      for (const deck of [decks.tier1, decks.tier2, decks.tier3]) {
        const ids = deck.map(c => c.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });

    it('shuffling changes card order from original', () => {
      const decks = createTierDecks(makeRng(42));
      const originalIds = ALL_DEVELOPMENT_CARDS.filter(c => c.tier === 1).map(c => c.id);
      const shuffledIds = decks.tier1.map(c => c.id);
      // At least some cards should be in different positions
      const diffCount = originalIds.filter((id, i) => id !== shuffledIds[i]).length;
      expect(diffCount).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Shuffle utility
  // -------------------------------------------------------------------------
  describe('shuffleArray', () => {
    it('returns the same array reference (in-place)', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = shuffleArray(arr, makeRng(42));
      expect(result).toBe(arr);
    });

    it('preserves all elements', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      shuffleArray(arr, makeRng(42));
      expect(arr.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('deterministic with same seed', () => {
      const a = shuffleArray([1, 2, 3, 4, 5], makeRng(42));
      const b = shuffleArray([1, 2, 3, 4, 5], makeRng(42));
      expect(a).toEqual(b);
    });
  });

  // -------------------------------------------------------------------------
  // Label helpers
  // -------------------------------------------------------------------------
  describe('label helpers', () => {
    it('gemAbbrev returns correct abbreviations', () => {
      expect(gemAbbrev('emerald')).toBe('G');
      expect(gemAbbrev('sapphire')).toBe('U');
      expect(gemAbbrev('ruby')).toBe('R');
      expect(gemAbbrev('diamond')).toBe('W');
      expect(gemAbbrev('onyx')).toBe('K');
      expect(gemAbbrev('gold')).toBe('$');
    });

    it('gemDisplayName capitalizes first letter', () => {
      expect(gemDisplayName('emerald')).toBe('Emerald');
      expect(gemDisplayName('gold')).toBe('Gold');
    });

    it('formatCost renders cost components', () => {
      expect(formatCost({ ruby: 3, emerald: 2 })).toContain('3R');
      expect(formatCost({ ruby: 3, emerald: 2 })).toContain('2G');
    });

    it('formatCost returns "Free" for empty cost', () => {
      expect(formatCost({})).toBe('Free');
    });

    it('cardLabel includes tier, bonus, and cost', () => {
      const label = cardLabel(ALL_DEVELOPMENT_CARDS[0]);
      expect(label).toContain('T1');
    });

    it('cardLabel includes points when > 0', () => {
      const cardWithPoints = ALL_DEVELOPMENT_CARDS.find(c => c.points > 0)!;
      const label = cardLabel(cardWithPoints);
      expect(label).toContain('pt');
    });

    it('nobleLabel includes 3pt and requirements', () => {
      const label = nobleLabel(ALL_NOBLES[0]);
      expect(label).toContain('3pt');
      expect(label).toContain('Noble');
    });
  });
});
