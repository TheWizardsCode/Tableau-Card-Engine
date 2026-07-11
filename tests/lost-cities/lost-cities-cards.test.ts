import { describe, it, expect } from 'vitest';
import {
  type InvestmentCard,
  type NumberedCard,
  EXPEDITION_COLORS,
  NUMBERED_RANKS,
  INVESTMENTS_PER_COLOR,
  CARDS_PER_COLOR,
  DECK_SIZE,
  HAND_SIZE,
  ROUND_COUNT,
  createLostCitiesDeck,
  shuffleDeck,
  cardValue,
  cardSortKey,
  canPlayAfter,
  cardLabel,
  cardAssetKey,
  CARD_BACK_KEY,
  EXPEDITION_HEX,
  colorDisplayName,
} from '../../example-games/lost-cities/LostCitiesCards';
import { createSeededRng } from '../../src/core-engine/SeededRng';

// ── Constants ──────────────────────────────────────────────

describe('Constants', () => {
  it('has 5 expedition colors', () => {
    expect(EXPEDITION_COLORS).toEqual(['yellow', 'blue', 'white', 'green', 'red']);
    expect(EXPEDITION_COLORS).toHaveLength(5);
  });

  it('has numbered ranks 2-10', () => {
    expect(NUMBERED_RANKS).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(NUMBERED_RANKS).toHaveLength(9);
  });

  it('has 3 investments per color', () => {
    expect(INVESTMENTS_PER_COLOR).toBe(3);
  });

  it('has 12 cards per color (3 investments + 9 numbered)', () => {
    expect(CARDS_PER_COLOR).toBe(12);
  });

  it('has a total deck size of 60', () => {
    expect(DECK_SIZE).toBe(60);
  });

  it('deals 8 cards per player', () => {
    expect(HAND_SIZE).toBe(8);
  });

  it('plays 3 rounds per match', () => {
    expect(ROUND_COUNT).toBe(3);
  });

  it('has hex colors for all expedition colors', () => {
    for (const color of EXPEDITION_COLORS) {
      expect(EXPEDITION_HEX[color]).toBeDefined();
      expect(EXPEDITION_HEX[color]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

// ── Deck creation ──────────────────────────────────────────

describe('createLostCitiesDeck', () => {
  const deck = createLostCitiesDeck();

  it('creates exactly 60 cards', () => {
    expect(deck).toHaveLength(60);
  });

  it('assigns unique sequential ids starting from 0', () => {
    const ids = deck.map((c) => c.id);
    expect(ids).toEqual([...Array(60).keys()]);
  });

  it('has no duplicate cards (unique ids)', () => {
    const idSet = new Set(deck.map((c) => c.id));
    expect(idSet.size).toBe(60);
  });

  it('creates all cards face-down', () => {
    expect(deck.every((c) => c.faceUp === false)).toBe(true);
  });

  it('has 12 cards per color', () => {
    for (const color of EXPEDITION_COLORS) {
      const colorCards = deck.filter((c) => c.color === color);
      expect(colorCards).toHaveLength(12);
    }
  });

  it('has 3 investment cards per color', () => {
    for (const color of EXPEDITION_COLORS) {
      const investments = deck.filter(
        (c) => c.color === color && c.type === 'investment',
      );
      expect(investments).toHaveLength(3);
    }
  });

  it('has 9 numbered cards per color (ranks 2-10)', () => {
    for (const color of EXPEDITION_COLORS) {
      const numbered = deck.filter(
        (c) => c.color === color && c.type === 'numbered',
      ) as NumberedCard[];
      expect(numbered).toHaveLength(9);
      const ranks = numbered.map((c) => c.rank).sort((a, b) => a - b);
      expect(ranks).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
  });

  it('has investment cards with distinct indices 1, 2, 3', () => {
    for (const color of EXPEDITION_COLORS) {
      const investments = deck.filter(
        (c) => c.color === color && c.type === 'investment',
      ) as InvestmentCard[];
      const indices = investments
        .map((c) => c.investmentIndex)
        .sort((a, b) => a - b);
      expect(indices).toEqual([1, 2, 3]);
    }
  });

  it('produces no duplicate card identity (color + type + rank/index)', () => {
    const keys = deck.map((c) => {
      if (c.type === 'investment') {
        return `${c.color}-inv-${c.investmentIndex}`;
      }
      return `${c.color}-num-${c.rank}`;
    });
    const keySet = new Set(keys);
    expect(keySet.size).toBe(60);
  });
});

// ── Card property access ───────────────────────────────────

describe('Card property access', () => {
  const deck = createLostCitiesDeck();
  const investment = deck.find(
    (c) => c.type === 'investment',
  )! as InvestmentCard;
  const numbered = deck.find(
    (c) => c.type === 'numbered',
  )! as NumberedCard;

  it('investment cards have type "investment"', () => {
    expect(investment.type).toBe('investment');
  });

  it('investment cards have an investmentIndex', () => {
    expect([1, 2, 3]).toContain(investment.investmentIndex);
  });

  it('numbered cards have type "numbered"', () => {
    expect(numbered.type).toBe('numbered');
  });

  it('numbered cards have a rank between 2 and 10', () => {
    expect(numbered.rank).toBeGreaterThanOrEqual(2);
    expect(numbered.rank).toBeLessThanOrEqual(10);
  });

  it('all cards have a valid expedition color', () => {
    for (const card of deck) {
      expect(EXPEDITION_COLORS).toContain(card.color);
    }
  });

  it('faceUp can be mutated', () => {
    const card = createLostCitiesDeck()[0];
    expect(card.faceUp).toBe(false);
    card.faceUp = true;
    expect(card.faceUp).toBe(true);
  });
});

// ── Card value ─────────────────────────────────────────────

describe('cardValue', () => {
  it('returns 0 for investment cards', () => {
    const card: InvestmentCard = {
      id: 0,
      color: 'yellow',
      type: 'investment',
      investmentIndex: 1,
      faceUp: false,
    };
    expect(cardValue(card)).toBe(0);
  });

  it('returns the rank for numbered cards', () => {
    for (const rank of NUMBERED_RANKS) {
      const card: NumberedCard = {
        id: 0,
        color: 'blue',
        type: 'numbered',
        rank,
        faceUp: false,
      };
      expect(cardValue(card)).toBe(rank);
    }
  });
});

// ── Card sort key ──────────────────────────────────────────

describe('cardSortKey', () => {
  it('returns 0 for investment cards', () => {
    const card: InvestmentCard = {
      id: 0,
      color: 'red',
      type: 'investment',
      investmentIndex: 2,
      faceUp: false,
    };
    expect(cardSortKey(card)).toBe(0);
  });

  it('returns rank for numbered cards', () => {
    const card: NumberedCard = {
      id: 0,
      color: 'green',
      type: 'numbered',
      rank: 7,
      faceUp: false,
    };
    expect(cardSortKey(card)).toBe(7);
  });

  it('investments sort before all numbered cards', () => {
    const investment: InvestmentCard = {
      id: 0,
      color: 'white',
      type: 'investment',
      investmentIndex: 3,
      faceUp: false,
    };
    for (const rank of NUMBERED_RANKS) {
      const numbered: NumberedCard = {
        id: 1,
        color: 'white',
        type: 'numbered',
        rank,
        faceUp: false,
      };
      expect(cardSortKey(investment)).toBeLessThan(cardSortKey(numbered));
    }
  });
});

// ── canPlayAfter ───────────────────────────────────────────

describe('canPlayAfter', () => {
  const makeInv = (idx: 1 | 2 | 3): InvestmentCard => ({
    id: 0,
    color: 'yellow',
    type: 'investment',
    investmentIndex: idx,
    faceUp: false,
  });

  const makeNum = (rank: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): NumberedCard => ({
    id: 1,
    color: 'yellow',
    type: 'numbered',
    rank,
    faceUp: false,
  });

  it('allows investment after investment', () => {
    expect(canPlayAfter(makeInv(2), makeInv(1))).toBe(true);
  });

  it('allows numbered after investment', () => {
    expect(canPlayAfter(makeNum(2), makeInv(3))).toBe(true);
  });

  it('rejects investment after numbered', () => {
    expect(canPlayAfter(makeInv(1), makeNum(5))).toBe(false);
  });

  it('allows ascending numbered after numbered', () => {
    expect(canPlayAfter(makeNum(7), makeNum(5))).toBe(true);
    expect(canPlayAfter(makeNum(10), makeNum(9))).toBe(true);
  });

  it('rejects descending numbered after numbered', () => {
    expect(canPlayAfter(makeNum(3), makeNum(5))).toBe(false);
  });

  it('rejects equal numbered after numbered', () => {
    expect(canPlayAfter(makeNum(5), makeNum(5))).toBe(false);
  });
});

// ── Card labels ────────────────────────────────────────────

describe('cardLabel', () => {
  it('labels investment cards with color and index', () => {
    const card: InvestmentCard = {
      id: 0,
      color: 'yellow',
      type: 'investment',
      investmentIndex: 2,
      faceUp: false,
    };
    expect(cardLabel(card)).toBe('Yellow Investment 2');
  });

  it('labels numbered cards with color and rank', () => {
    const card: NumberedCard = {
      id: 0,
      color: 'blue',
      type: 'numbered',
      rank: 7,
      faceUp: false,
    };
    expect(cardLabel(card)).toBe('Blue 7');
  });
});

// ── Card asset keys ────────────────────────────────────────

describe('cardAssetKey', () => {
  it('returns correct key for investment cards', () => {
    const card: InvestmentCard = {
      id: 0,
      color: 'green',
      type: 'investment',
      investmentIndex: 1,
      faceUp: false,
    };
    expect(cardAssetKey(card)).toBe('lc-green-inv1');
  });

  it('returns correct key for numbered cards', () => {
    const card: NumberedCard = {
      id: 0,
      color: 'red',
      type: 'numbered',
      rank: 10,
      faceUp: false,
    };
    expect(cardAssetKey(card)).toBe('lc-red-10');
  });

  it('card back key is defined', () => {
    expect(CARD_BACK_KEY).toBe('lc-back');
  });
});

// ── Color display ──────────────────────────────────────────

describe('colorDisplayName', () => {
  it('capitalizes each color', () => {
    expect(colorDisplayName('yellow')).toBe('Yellow');
    expect(colorDisplayName('blue')).toBe('Blue');
    expect(colorDisplayName('white')).toBe('White');
    expect(colorDisplayName('green')).toBe('Green');
    expect(colorDisplayName('red')).toBe('Red');
  });
});

// ── Shuffle ────────────────────────────────────────────────

describe('shuffleDeck', () => {
  it('returns the same array reference', () => {
    const deck = createLostCitiesDeck();
    const result = shuffleDeck(deck);
    expect(result).toBe(deck);
  });

  it('preserves all 60 cards (no loss or duplication)', () => {
    const deck = createLostCitiesDeck();
    shuffleDeck(deck);
    expect(deck).toHaveLength(60);
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(60);
  });

  it('produces deterministic results with seeded RNG', () => {
    const rng1 = createSeededRng(42);
    const deck1 = shuffleDeck(createLostCitiesDeck(), rng1);

    const rng2 = createSeededRng(42);
    const deck2 = shuffleDeck(createLostCitiesDeck(), rng2);

    expect(deck1.map((c) => c.id)).toEqual(deck2.map((c) => c.id));
  });

  it('changes the order of cards (with high probability)', () => {
    const original = createLostCitiesDeck().map((c) => c.id);
    const deck = createLostCitiesDeck();
    shuffleDeck(deck);
    const shuffled = deck.map((c) => c.id);

    // Extremely unlikely that a random shuffle produces the same order
    // We check that at least some positions changed
    const changedPositions = original.filter((id, i) => id !== shuffled[i]);
    expect(changedPositions.length).toBeGreaterThan(0);
  });
});
