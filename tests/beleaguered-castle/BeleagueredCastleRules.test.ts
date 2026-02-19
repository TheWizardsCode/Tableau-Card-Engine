import { describe, it, expect } from 'vitest';
import {
  deal,
  isLegalFoundationMove,
  isLegalTableauMove,
  applyFoundationMove,
  applyTableauMove,
  applyMove,
  undoMove,
  isWon,
  hasNoMoves,
  getLegalMoves,
  rankValue,
  nextRank,
  foundationIndex,
  createSeededRng,
} from '../../example-games/beleaguered-castle/BeleagueredCastleRules';
import {
  FOUNDATION_COUNT,
  TABLEAU_COUNT,
  CARDS_PER_COLUMN,
  FOUNDATION_SUITS,
} from '../../example-games/beleaguered-castle/BeleagueredCastleState';
import type { BeleagueredCastleState } from '../../example-games/beleaguered-castle/BeleagueredCastleState';
import { Pile } from '../../src/card-system/Pile';
import { createCard } from '../../src/card-system/Card';
import type { Card } from '../../src/card-system/Card';

// ── Helpers ─────────────────────────────────────────────────

/**
 * Build a minimal test state with custom foundations and tableau.
 */
function testState(
  foundationCards: (Card | null)[][],
  tableauCards: Card[][],
): BeleagueredCastleState {
  const foundations = foundationCards.map(
    (cards) => new Pile(cards.filter((c): c is Card => c !== null)),
  ) as unknown as readonly [Pile, Pile, Pile, Pile];

  const tableau = tableauCards.map((cards) => new Pile(cards));

  return {
    foundations,
    tableau,
    seed: 0,
    moveCount: 0,
  };
}

/** Create a face-up card. */
function card(rank: string, suit: string): Card {
  return createCard(rank as Card['rank'], suit as Card['suit'], true);
}

// ── Tests ───────────────────────────────────────────────────

describe('Rank utilities', () => {
  it('should assign A=0, K=12', () => {
    expect(rankValue('A')).toBe(0);
    expect(rankValue('2')).toBe(1);
    expect(rankValue('10')).toBe(9);
    expect(rankValue('J')).toBe(10);
    expect(rankValue('Q')).toBe(11);
    expect(rankValue('K')).toBe(12);
  });

  it('should return next rank', () => {
    expect(nextRank('A')).toBe('2');
    expect(nextRank('Q')).toBe('K');
    expect(nextRank('K')).toBeUndefined();
  });

  it('should return foundation index for suit', () => {
    expect(foundationIndex('clubs')).toBe(0);
    expect(foundationIndex('diamonds')).toBe(1);
    expect(foundationIndex('hearts')).toBe(2);
    expect(foundationIndex('spades')).toBe(3);
  });
});

describe('createSeededRng', () => {
  it('should produce deterministic sequences', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it('should produce different sequences for different seeds', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(99);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).not.toEqual(seq2);
  });

  it('should return values in [0, 1)', () => {
    const rng = createSeededRng(123);
    for (let i = 0; i < 100; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });
});

describe('deal', () => {
  it('should place 4 aces on foundations', () => {
    const state = deal(42);
    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      expect(state.foundations[fi].size()).toBe(1);
      const ace = state.foundations[fi].peek()!;
      expect(ace.rank).toBe('A');
      expect(ace.suit).toBe(FOUNDATION_SUITS[fi]);
    }
  });

  it('should deal 48 cards into 8 columns of 6', () => {
    const state = deal(42);
    expect(state.tableau.length).toBe(TABLEAU_COUNT);
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      expect(state.tableau[col].size()).toBe(CARDS_PER_COLUMN);
    }
  });

  it('should have all cards face-up', () => {
    const state = deal(42);
    for (const foundation of state.foundations) {
      for (const c of foundation.toArray()) {
        expect(c.faceUp).toBe(true);
      }
    }
    for (const col of state.tableau) {
      for (const c of col.toArray()) {
        expect(c.faceUp).toBe(true);
      }
    }
  });

  it('should contain exactly 52 unique cards total', () => {
    const state = deal(42);
    const allCards: Card[] = [];
    for (const foundation of state.foundations) {
      allCards.push(...foundation.toArray());
    }
    for (const col of state.tableau) {
      allCards.push(...col.toArray());
    }
    expect(allCards.length).toBe(52);

    // Check uniqueness
    const cardIds = allCards.map((c) => `${c.rank}-${c.suit}`);
    const uniqueIds = new Set(cardIds);
    expect(uniqueIds.size).toBe(52);
  });

  it('should have no aces in tableau columns', () => {
    const state = deal(42);
    for (const col of state.tableau) {
      for (const c of col.toArray()) {
        expect(c.rank).not.toBe('A');
      }
    }
  });

  it('should produce identical deals with the same seed', () => {
    const state1 = deal(42);
    const state2 = deal(42);

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const cards1 = state1.tableau[col].toArray();
      const cards2 = state2.tableau[col].toArray();
      expect(cards1.length).toBe(cards2.length);
      for (let i = 0; i < cards1.length; i++) {
        expect(cards1[i].rank).toBe(cards2[i].rank);
        expect(cards1[i].suit).toBe(cards2[i].suit);
      }
    }
  });

  it('should produce different deals with different seeds', () => {
    const state1 = deal(42);
    const state2 = deal(99);

    const cards1 = state1.tableau.flatMap((col) =>
      col.toArray().map((c) => `${c.rank}-${c.suit}`),
    );
    const cards2 = state2.tableau.flatMap((col) =>
      col.toArray().map((c) => `${c.rank}-${c.suit}`),
    );
    expect(cards1).not.toEqual(cards2);
  });

  it('should store the seed in game state', () => {
    const state = deal(42);
    expect(state.seed).toBe(42);
  });

  it('should start with moveCount at 0', () => {
    const state = deal(42);
    expect(state.moveCount).toBe(0);
  });
});

describe('isLegalFoundationMove', () => {
  it('should accept the next card in suit sequence', () => {
    const state = testState(
      [
        [card('A', 'clubs')],
        [card('A', 'diamonds')],
        [card('A', 'hearts')],
        [card('A', 'spades')],
      ],
      [
        [card('2', 'clubs')], // col 0: 2 of clubs can go on clubs foundation
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(isLegalFoundationMove(state, 0, 0)).toBe(true);
  });

  it('should reject a card that is not the next in sequence', () => {
    const state = testState(
      [
        [card('A', 'clubs')],
        [card('A', 'diamonds')],
        [card('A', 'hearts')],
        [card('A', 'spades')],
      ],
      [
        [card('3', 'clubs')], // 3 cannot go on A (needs 2)
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(isLegalFoundationMove(state, 0, 0)).toBe(false);
  });

  it('should reject a card of the wrong suit', () => {
    const state = testState(
      [
        [card('A', 'clubs')],
        [card('A', 'diamonds')],
        [card('A', 'hearts')],
        [card('A', 'spades')],
      ],
      [
        [card('2', 'diamonds')], // 2 of diamonds cannot go on clubs foundation
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(isLegalFoundationMove(state, 0, 0)).toBe(false);
  });

  it('should reject move from empty column', () => {
    const state = testState(
      [
        [card('A', 'clubs')],
        [card('A', 'diamonds')],
        [card('A', 'hearts')],
        [card('A', 'spades')],
      ],
      [[], [], [], [], [], [], [], []],
    );
    expect(isLegalFoundationMove(state, 0, 0)).toBe(false);
  });

  it('should reject out-of-bounds column index', () => {
    const state = deal(42);
    expect(isLegalFoundationMove(state, -1, 0)).toBe(false);
    expect(isLegalFoundationMove(state, 8, 0)).toBe(false);
  });

  it('should reject out-of-bounds foundation index', () => {
    const state = deal(42);
    expect(isLegalFoundationMove(state, 0, -1)).toBe(false);
    expect(isLegalFoundationMove(state, 0, 4)).toBe(false);
  });
});

describe('isLegalTableauMove', () => {
  it('should accept a card one rank lower onto another', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('5', 'hearts')],
        [card('6', 'clubs')], // 5 can go on 6
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(isLegalTableauMove(state, 0, 1)).toBe(true);
  });

  it('should accept any card on an empty column', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('K', 'hearts')],
        [], // empty column
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(isLegalTableauMove(state, 0, 1)).toBe(true);
  });

  it('should reject a card not one rank lower', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('3', 'hearts')],
        [card('6', 'clubs')], // 3 is not one rank below 6
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(isLegalTableauMove(state, 0, 1)).toBe(false);
  });

  it('should reject move from empty source column', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [],
        [card('6', 'clubs')],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(isLegalTableauMove(state, 0, 1)).toBe(false);
  });

  it('should reject move to same column', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('5', 'hearts')],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(isLegalTableauMove(state, 0, 0)).toBe(false);
  });

  it('should reject a card of higher rank onto lower', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('7', 'hearts')],
        [card('6', 'clubs')], // 7 cannot go on 6 (must be one lower)
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(isLegalTableauMove(state, 0, 1)).toBe(false);
  });

  it('should allow regardless of suit', () => {
    // Hearts on spades -- different suits are fine for tableau moves
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('5', 'hearts')],
        [card('6', 'spades')], // 5 of hearts on 6 of spades -- valid
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(isLegalTableauMove(state, 0, 1)).toBe(true);
  });
});

describe('applyFoundationMove', () => {
  it('should move the card to the foundation and increment moveCount', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('2', 'clubs')],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    const moved = applyFoundationMove(state, 0, 0);
    expect(moved.rank).toBe('2');
    expect(moved.suit).toBe('clubs');
    expect(state.foundations[0].size()).toBe(2);
    expect(state.tableau[0].isEmpty()).toBe(true);
    expect(state.moveCount).toBe(1);
  });

  it('should throw on illegal move', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('3', 'clubs')],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(() => applyFoundationMove(state, 0, 0)).toThrow('Illegal foundation move');
  });
});

describe('applyTableauMove', () => {
  it('should move the card between columns and increment moveCount', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('5', 'hearts')],
        [card('6', 'clubs')],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    const moved = applyTableauMove(state, 0, 1);
    expect(moved.rank).toBe('5');
    expect(state.tableau[0].isEmpty()).toBe(true);
    expect(state.tableau[1].size()).toBe(2);
    expect(state.moveCount).toBe(1);
  });

  it('should throw on illegal move', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('3', 'hearts')],
        [card('6', 'clubs')],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(() => applyTableauMove(state, 0, 1)).toThrow('Illegal tableau move');
  });
});

describe('applyMove', () => {
  it('should handle tableau-to-foundation moves', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [[card('2', 'clubs')], [], [], [], [], [], [], []],
    );
    const moved = applyMove(state, {
      kind: 'tableau-to-foundation',
      fromCol: 0,
      toFoundation: 0,
    });
    expect(moved.rank).toBe('2');
  });

  it('should handle tableau-to-tableau moves', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [[card('5', 'hearts')], [card('6', 'clubs')], [], [], [], [], [], []],
    );
    const moved = applyMove(state, {
      kind: 'tableau-to-tableau',
      fromCol: 0,
      toCol: 1,
    });
    expect(moved.rank).toBe('5');
  });
});

describe('undoMove', () => {
  it('should reverse a foundation move', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [[card('2', 'clubs')], [], [], [], [], [], [], []],
    );
    const move = {
      kind: 'tableau-to-foundation' as const,
      fromCol: 0,
      toFoundation: 0,
    };
    applyMove(state, move);
    expect(state.foundations[0].size()).toBe(2);
    expect(state.tableau[0].isEmpty()).toBe(true);
    expect(state.moveCount).toBe(1);

    undoMove(state, move);
    expect(state.foundations[0].size()).toBe(1);
    expect(state.tableau[0].size()).toBe(1);
    expect(state.tableau[0].peek()!.rank).toBe('2');
    expect(state.moveCount).toBe(0);
  });

  it('should reverse a tableau move', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [[card('5', 'hearts')], [card('6', 'clubs')], [], [], [], [], [], []],
    );
    const move = {
      kind: 'tableau-to-tableau' as const,
      fromCol: 0,
      toCol: 1,
    };
    applyMove(state, move);
    expect(state.tableau[0].isEmpty()).toBe(true);
    expect(state.tableau[1].size()).toBe(2);

    undoMove(state, move);
    expect(state.tableau[0].size()).toBe(1);
    expect(state.tableau[1].size()).toBe(1);
    expect(state.tableau[0].peek()!.rank).toBe('5');
  });
});

describe('isWon', () => {
  it('should return false when not all cards are on foundations', () => {
    const state = deal(42);
    expect(isWon(state)).toBe(false);
  });

  it('should return true when all foundations have 13 cards', () => {
    // Build full foundations
    const foundations = FOUNDATION_SUITS.map((suit) => {
      const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
      return new Pile(ranks.map((r) => card(r, suit)));
    }) as unknown as readonly [Pile, Pile, Pile, Pile];

    const state: BeleagueredCastleState = {
      foundations,
      tableau: Array.from({ length: 8 }, () => new Pile()),
      seed: 0,
      moveCount: 48,
    };
    expect(isWon(state)).toBe(true);
  });
});

describe('hasNoMoves', () => {
  it('should return false when legal moves exist', () => {
    const state = deal(42);
    // A freshly dealt game should always have at least one legal move
    expect(hasNoMoves(state)).toBe(false);
  });

  it('should return true when no legal moves remain', () => {
    // Construct a truly stuck state: all columns occupied, no valid stacking
    const stuckState = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('K', 'clubs')],
        [card('K', 'diamonds')],
        [card('K', 'hearts')],
        [card('K', 'spades')],
        [card('4', 'clubs')],
        [card('4', 'diamonds')],
        [card('4', 'hearts')],
        [card('4', 'spades')],
      ],
    );
    // Kings can't go on 4s (need rank exactly one less: Q on K, 3 on 4)
    // 4s can't go on Kings (4 is not one less than K=12, 4=3)
    // No foundation moves either (foundations expect 2, have 4 and K)
    expect(hasNoMoves(stuckState)).toBe(true);
  });
});

describe('getLegalMoves', () => {
  it('should find foundation moves', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [[card('2', 'clubs')], [], [], [], [], [], [], []],
    );
    const moves = getLegalMoves(state);
    const foundationMoves = moves.filter((m) => m.kind === 'tableau-to-foundation');
    expect(foundationMoves.length).toBeGreaterThanOrEqual(1);
    expect(foundationMoves[0].kind).toBe('tableau-to-foundation');
  });

  it('should find tableau-to-tableau moves', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('5', 'hearts')],
        [card('6', 'clubs')],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    const moves = getLegalMoves(state);
    const tableauMoves = moves.filter((m) => m.kind === 'tableau-to-tableau');
    expect(tableauMoves.length).toBeGreaterThanOrEqual(1);
  });

  it('should include empty-column moves', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('5', 'hearts')],
        [], // empty -- should be a valid destination
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    const moves = getLegalMoves(state);
    const emptyColMoves = moves.filter(
      (m) => m.kind === 'tableau-to-tableau' && m.toCol === 1,
    );
    expect(emptyColMoves.length).toBe(1);
  });

  it('should return empty array when no moves exist', () => {
    const stuckState = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('K', 'clubs')],
        [card('K', 'diamonds')],
        [card('K', 'hearts')],
        [card('K', 'spades')],
        [card('4', 'clubs')],
        [card('4', 'diamonds')],
        [card('4', 'hearts')],
        [card('4', 'spades')],
      ],
    );
    expect(getLegalMoves(stuckState)).toEqual([]);
  });
});
