import { describe, it, expect } from 'vitest';
import {
  RESOURCE_TYPES,
  ALL_RESOURCE_TYPES,
  ALL_DEVELOPMENT_CARDS,
  ALL_PATRONS,
  TIER_1_COUNT,
  TIER_2_COUNT,
  TIER_3_COUNT,
  TOTAL_CARD_COUNT,
  TOTAL_PATRON_COUNT,
  MARKET_SIZE,
  WIN_THRESHOLD,
  MAX_RESERVED,
  MAX_TOKENS,
  tokenCount,
  totalTokens,
  addTokens,
  subtractTokens,
  createTokenSupply,
  selectPatrons,
  createTierDecks,
  shuffleArray,
  formatCost,
  cardLabel,
  patronLabel,
  resourceAbbrev,
  resourceDisplayName,
  type ResourceTokens,
} from '../../example-games/feudalism/FeudalismCards';

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

describe('FeudalismCards', () => {
  // -------------------------------------------------------------------------
  // Constants
  // -------------------------------------------------------------------------
  describe('constants', () => {
    it('has 5 resource types', () => {
      expect(RESOURCE_TYPES).toHaveLength(5);
      expect(RESOURCE_TYPES).toContain('oats');
      expect(RESOURCE_TYPES).toContain('flax');
      expect(RESOURCE_TYPES).toContain('wheat');
      expect(RESOURCE_TYPES).toContain('barley');
      expect(RESOURCE_TYPES).toContain('turnip');
    });

    it('has 6 token colors (resources + mead)', () => {
      expect(ALL_RESOURCE_TYPES).toHaveLength(6);
      expect(ALL_RESOURCE_TYPES).toContain('mead');
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

    it('every card has a valid bonus color (not mead)', () => {
      for (const c of ALL_DEVELOPMENT_CARDS) {
        expect(RESOURCE_TYPES).toContain(c.bonus);
      }
    });

    it('every card has non-negative points', () => {
      for (const c of ALL_DEVELOPMENT_CARDS) {
        expect(c.points).toBeGreaterThanOrEqual(0);
      }
    });

    it('every card cost uses only resource types (no mead)', () => {
      for (const c of ALL_DEVELOPMENT_CARDS) {
        expect(c.cost).not.toHaveProperty('mead');
        for (const color of RESOURCE_TYPES) {
          const val = c.cost[color];
          if (val !== undefined) {
            expect(val).toBeGreaterThan(0);
          }
        }
      }
    });

    it('tier 1 has 8 cards of each bonus color', () => {
      const tier1 = ALL_DEVELOPMENT_CARDS.filter(c => c.tier === 1);
      for (const color of RESOURCE_TYPES) {
        const count = tier1.filter(c => c.bonus === color).length;
        expect(count).toBe(8);
      }
    });

    it('tier 2 has 6 cards of each bonus color', () => {
      const tier2 = ALL_DEVELOPMENT_CARDS.filter(c => c.tier === 2);
      for (const color of RESOURCE_TYPES) {
        const count = tier2.filter(c => c.bonus === color).length;
        expect(count).toBe(6);
      }
    });

    it('tier 3 has 4 cards of each bonus color', () => {
      const tier3 = ALL_DEVELOPMENT_CARDS.filter(c => c.tier === 3);
      for (const color of RESOURCE_TYPES) {
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
  // Patron tiles
  // -------------------------------------------------------------------------
  describe('patron tiles', () => {
    it('has exactly 10 patrons', () => {
      expect(ALL_PATRONS).toHaveLength(TOTAL_PATRON_COUNT);
      expect(TOTAL_PATRON_COUNT).toBe(10);
    });

    it('all patrons have unique IDs', () => {
      const ids = ALL_PATRONS.map(n => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all patrons give exactly 3 prestige points', () => {
      for (const n of ALL_PATRONS) {
        expect(n.points).toBe(3);
      }
    });

    it('all patron requirements use only resource types (no mead)', () => {
      for (const n of ALL_PATRONS) {
        expect(n.requirements).not.toHaveProperty('mead');
        for (const color of RESOURCE_TYPES) {
          const val = n.requirements[color];
          if (val !== undefined) {
            expect(val).toBeGreaterThan(0);
          }
        }
      }
    });

    it('patrons require either 2 colors at 4 each or 3 colors at 3 each', () => {
      for (const n of ALL_PATRONS) {
        const values = RESOURCE_TYPES.map(c => n.requirements[c] ?? 0).filter(v => v > 0);
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
      expect(tokenCount({}, 'wheat')).toBe(0);
      expect(tokenCount({ oats: 3 }, 'wheat')).toBe(0);
    });

    it('tokenCount returns stored value', () => {
      expect(tokenCount({ wheat: 5 }, 'wheat')).toBe(5);
    });

    it('totalTokens sums all colors', () => {
      expect(totalTokens({})).toBe(0);
      expect(totalTokens({ wheat: 2, oats: 3, mead: 1 })).toBe(6);
    });

    it('addTokens combines two bags', () => {
      const a: ResourceTokens = { wheat: 2, oats: 1 };
      const b: ResourceTokens = { wheat: 1, flax: 3 };
      const result = addTokens(a, b);
      expect(result.wheat).toBe(3);
      expect(result.oats).toBe(1);
      expect(result.flax).toBe(3);
    });

    it('subtractTokens subtracts b from a', () => {
      const a: ResourceTokens = { wheat: 5, oats: 3 };
      const b: ResourceTokens = { wheat: 2, oats: 1 };
      const result = subtractTokens(a, b);
      expect(result.wheat).toBe(3);
      expect(result.oats).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Token supply
  // -------------------------------------------------------------------------
  describe('createTokenSupply', () => {
    it('2-player supply has 4 of each resource + 5 mead', () => {
      const supply = createTokenSupply(2);
      for (const c of RESOURCE_TYPES) {
        expect(supply[c]).toBe(4);
      }
      expect(supply.mead).toBe(5);
    });

    it('3-player supply has 5 of each resource + 5 mead', () => {
      const supply = createTokenSupply(3);
      for (const c of RESOURCE_TYPES) {
        expect(supply[c]).toBe(5);
      }
      expect(supply.mead).toBe(5);
    });

    it('4-player supply has 7 of each resource + 5 mead', () => {
      const supply = createTokenSupply(4);
      for (const c of RESOURCE_TYPES) {
        expect(supply[c]).toBe(7);
      }
      expect(supply.mead).toBe(5);
    });

    it('throws for invalid player counts', () => {
      expect(() => createTokenSupply(1)).toThrow();
      expect(() => createTokenSupply(5)).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Patron selection
  // -------------------------------------------------------------------------
  describe('selectPatrons', () => {
    it('selects n+1 patrons for 2 players', () => {
      const patrons = selectPatrons(2, makeRng(42));
      expect(patrons).toHaveLength(3);
    });

    it('selects n+1 patrons for 3 players', () => {
      const patrons = selectPatrons(3, makeRng(42));
      expect(patrons).toHaveLength(4);
    });

    it('selects n+1 patrons for 4 players', () => {
      const patrons = selectPatrons(4, makeRng(42));
      expect(patrons).toHaveLength(5);
    });

    it('selected patrons have unique IDs', () => {
      const patrons = selectPatrons(4, makeRng(99));
      const ids = patrons.map(n => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('different seeds produce different selections', () => {
      const a = selectPatrons(2, makeRng(1));
      const b = selectPatrons(2, makeRng(999));
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
    it('resourceAbbrev returns correct abbreviations', () => {
      expect(resourceAbbrev('oats')).toBe('O');
      expect(resourceAbbrev('flax')).toBe('F');
      expect(resourceAbbrev('wheat')).toBe('W');
      expect(resourceAbbrev('barley')).toBe('B');
      expect(resourceAbbrev('turnip')).toBe('T');
      expect(resourceAbbrev('mead')).toBe('M');
    });

    it('resourceDisplayName capitalizes first letter', () => {
      expect(resourceDisplayName('oats')).toBe('Oats');
      expect(resourceDisplayName('mead')).toBe('Mead');
    });

    it('formatCost renders cost components', () => {
      expect(formatCost({ wheat: 3, oats: 2 })).toContain('3W');
      expect(formatCost({ wheat: 3, oats: 2 })).toContain('2O');
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

    it('patronLabel includes 3pt and requirements', () => {
      const label = patronLabel(ALL_PATRONS[0]);
      expect(label).toContain('3pt');
      expect(label).toContain('Patron');
    });
  });
});
