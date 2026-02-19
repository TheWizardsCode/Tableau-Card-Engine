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
  findSafeAutoMoves,
  foundationTopRank,
  isTriviallyWinnable,
  getAutoCompleteMoves,
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

// ── Auto-move heuristic ─────────────────────────────────────

describe('foundationTopRank', () => {
  it('should return 0 for a foundation with only an ace', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [[], [], [], [], [], [], [], []],
    );
    expect(foundationTopRank(state, 0)).toBe(0); // A = 0
  });

  it('should return correct rank value for built-up foundation', () => {
    const state = testState(
      [
        [card('A', 'clubs'), card('2', 'clubs'), card('3', 'clubs')],
        [card('A', 'diamonds')],
        [card('A', 'hearts')],
        [card('A', 'spades')],
      ],
      [[], [], [], [], [], [], [], []],
    );
    expect(foundationTopRank(state, 0)).toBe(2); // 3 has value 2
  });

  it('should return -1 for an empty foundation', () => {
    const state = testState(
      [[], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [[], [], [], [], [], [], [], []],
    );
    expect(foundationTopRank(state, 0)).toBe(-1);
  });

  it('should return 12 for a complete foundation (King on top)', () => {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
    const state = testState(
      [
        ranks.map((r) => card(r, 'clubs')),
        [card('A', 'diamonds')],
        [card('A', 'hearts')],
        [card('A', 'spades')],
      ],
      [[], [], [], [], [], [], [], []],
    );
    expect(foundationTopRank(state, 0)).toBe(12); // K = 12
  });
});

describe('findSafeAutoMoves', () => {
  it('should return 2s as safe when all foundations have only aces', () => {
    // All foundations at rank 0 (A). A 2 has rank value 1.
    // minFoundationRank = 0 >= 1 - 1 = 0 => safe
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('2', 'clubs')],
        [card('2', 'diamonds')],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    const moves = findSafeAutoMoves(state);
    expect(moves.length).toBe(2);
    expect(moves.every((m) => m.kind === 'tableau-to-foundation')).toBe(true);
  });

  it('should not return a card when foundations are uneven and card rank is too high', () => {
    // Clubs foundation at 2 (rank value 1), others at A (rank value 0)
    // minFoundationRank = 0. A 3 of clubs has rank value 2.
    // Safe check: 0 >= 2 - 1 = 1 => false, NOT safe
    const state = testState(
      [
        [card('A', 'clubs'), card('2', 'clubs')],
        [card('A', 'diamonds')],
        [card('A', 'hearts')],
        [card('A', 'spades')],
      ],
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
    const moves = findSafeAutoMoves(state);
    expect(moves.length).toBe(0);
  });

  it('should return a card when all foundations are high enough', () => {
    // All foundations at 2 (rank value 1). A 3 of clubs has rank value 2.
    // minFoundationRank = 1 >= 2 - 1 = 1 => safe
    const state = testState(
      [
        [card('A', 'clubs'), card('2', 'clubs')],
        [card('A', 'diamonds'), card('2', 'diamonds')],
        [card('A', 'hearts'), card('2', 'hearts')],
        [card('A', 'spades'), card('2', 'spades')],
      ],
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
    const moves = findSafeAutoMoves(state);
    expect(moves.length).toBe(1);
    expect(moves[0]).toEqual({
      kind: 'tableau-to-foundation',
      fromCol: 0,
      toFoundation: 0,
    });
  });

  it('should return empty array when no legal foundation moves exist', () => {
    // No tableau cards can go on any foundation
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('5', 'clubs')],
        [card('7', 'diamonds')],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    const moves = findSafeAutoMoves(state);
    expect(moves.length).toBe(0);
  });

  it('should return empty array when tableau is empty', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [[], [], [], [], [], [], [], []],
    );
    const moves = findSafeAutoMoves(state);
    expect(moves.length).toBe(0);
  });

  it('should find multiple safe auto-moves across different columns', () => {
    // All foundations at 3 (rank value 2). Cards of rank 4 (value 3) are safe.
    // minFoundationRank = 2 >= 3 - 1 = 2 => safe
    const state = testState(
      [
        [card('A', 'clubs'), card('2', 'clubs'), card('3', 'clubs')],
        [card('A', 'diamonds'), card('2', 'diamonds'), card('3', 'diamonds')],
        [card('A', 'hearts'), card('2', 'hearts'), card('3', 'hearts')],
        [card('A', 'spades'), card('2', 'spades'), card('3', 'spades')],
      ],
      [
        [card('4', 'clubs')],
        [card('4', 'hearts')],
        [card('4', 'spades')],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    const moves = findSafeAutoMoves(state);
    expect(moves.length).toBe(3);
    // All should be foundation moves
    expect(moves.every((m) => m.kind === 'tableau-to-foundation')).toBe(true);
  });

  it('should not auto-move a card that is not the next expected on its foundation', () => {
    // Even if it passes the rank threshold, a card that does not match
    // the foundation's next expected rank should not appear
    const state = testState(
      [
        [card('A', 'clubs'), card('2', 'clubs')],
        [card('A', 'diamonds'), card('2', 'diamonds')],
        [card('A', 'hearts'), card('2', 'hearts')],
        [card('A', 'spades'), card('2', 'spades')],
      ],
      [
        [card('4', 'clubs')], // Needs 3 on clubs foundation first
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    const moves = findSafeAutoMoves(state);
    expect(moves.length).toBe(0);
  });

  it('should handle chained auto-moves (call repeatedly until empty)', () => {
    // Simulate iterative auto-move: first pass finds 2 of clubs,
    // after applying it, second pass finds 3 of clubs (if exposed)
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('3', 'clubs'), card('2', 'clubs')], // 2 on top, 3 underneath
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );

    // First pass: 2 of clubs is safe (minFoundationRank=0 >= 1-1=0)
    const moves1 = findSafeAutoMoves(state);
    expect(moves1.length).toBe(1);
    expect(moves1[0]).toEqual({
      kind: 'tableau-to-foundation',
      fromCol: 0,
      toFoundation: 0,
    });

    // Apply the move
    applyMove(state, moves1[0]);
    // Now foundations: clubs=[A,2], others=[A]
    // Tableau col 0: [3 of clubs]
    // 3 of clubs: rank value 2, minFoundationRank=0 (others still at A)
    // 0 >= 2-1=1? No => not safe
    const moves2 = findSafeAutoMoves(state);
    expect(moves2.length).toBe(0);
  });
});

// ── Auto-complete detection ─────────────────────────────────

describe('isTriviallyWinnable', () => {
  it('should return true when all tableau columns are empty', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [[], [], [], [], [], [], [], []],
    );
    expect(isTriviallyWinnable(state)).toBe(true);
  });

  it('should return true when each column has cards in strictly descending rank order', () => {
    // Foundations at A (rank 0). Column 0 has K, Q (bottom-to-top: K then Q).
    // K=12, Q=11 => strictly descending. Both ranks > 0 (foundation top).
    // Column 1 has 5, 4, 3, 2 => strictly descending. All > 0.
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('K', 'clubs'), card('Q', 'clubs')],
        [card('5', 'diamonds'), card('4', 'diamonds'), card('3', 'diamonds'), card('2', 'diamonds')],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(isTriviallyWinnable(state)).toBe(true);
  });

  it('should return false when a column has cards NOT in descending order', () => {
    // Column 0 has Q, K (bottom-to-top: Q=11, K=12) => ascending, not descending
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('Q', 'clubs'), card('K', 'clubs')],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(isTriviallyWinnable(state)).toBe(false);
  });

  it('should return false when a column has equal-ranked cards', () => {
    // Column 0 has 5 of clubs, 5 of hearts (same rank) => not strictly descending
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('5', 'clubs'), card('5', 'hearts')],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(isTriviallyWinnable(state)).toBe(false);
  });

  it('should return true for single-card columns', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('2', 'clubs')],
        [card('3', 'diamonds')],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(isTriviallyWinnable(state)).toBe(true);
  });

  it('should return false when a card rank is <= its foundation top rank', () => {
    // Clubs foundation has A, 2, 3 (top rank = 2). Column has 3 of clubs (rank 2).
    // 2 <= 2 => false (foundation already has this rank)
    const state = testState(
      [
        [card('A', 'clubs'), card('2', 'clubs'), card('3', 'clubs')],
        [card('A', 'diamonds')],
        [card('A', 'hearts')],
        [card('A', 'spades')],
      ],
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
    // The 3 of clubs has rankValue 2, foundation top rank is also 2 => 2 <= 2 => false
    expect(isTriviallyWinnable(state)).toBe(false);
  });

  it('should return true with mixed suits in descending order across columns', () => {
    // Column has clubs and hearts interleaved but all in descending rank
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('5', 'clubs'), card('4', 'hearts'), card('3', 'clubs'), card('2', 'hearts')],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(isTriviallyWinnable(state)).toBe(true);
  });

  it('should return true when foundations are partially built up and remaining cards are ordered', () => {
    // Clubs foundation at 5, remaining clubs in column: 8, 7, 6 (descending, all > 4)
    const state = testState(
      [
        [card('A', 'clubs'), card('2', 'clubs'), card('3', 'clubs'), card('4', 'clubs'), card('5', 'clubs')],
        [card('A', 'diamonds')],
        [card('A', 'hearts')],
        [card('A', 'spades')],
      ],
      [
        [card('8', 'clubs'), card('7', 'clubs'), card('6', 'clubs')],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(isTriviallyWinnable(state)).toBe(true);
  });
});

describe('getAutoCompleteMoves', () => {
  it('should return empty array when game is not trivially winnable', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('Q', 'clubs'), card('K', 'clubs')], // Not descending
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(getAutoCompleteMoves(state)).toEqual([]);
  });

  it('should return empty array when tableau is already empty', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [[], [], [], [], [], [], [], []],
    );
    expect(getAutoCompleteMoves(state)).toEqual([]);
  });

  it('should return the correct sequence for a single column', () => {
    // Column 0 has 3, 2 (bottom-to-top). Foundation clubs at A.
    // Should play 2 first, then 3.
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('3', 'clubs'), card('2', 'clubs')],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    const moves = getAutoCompleteMoves(state);
    expect(moves.length).toBe(2);
    expect(moves[0]).toEqual({ kind: 'tableau-to-foundation', fromCol: 0, toFoundation: 0 });
    expect(moves[1]).toEqual({ kind: 'tableau-to-foundation', fromCol: 0, toFoundation: 0 });
  });

  it('should interleave moves across columns correctly', () => {
    // Column 0: 3 of clubs, 2 of clubs (top=2)
    // Column 1: 3 of diamonds, 2 of diamonds (top=2)
    // All foundations at A.
    // Should play: 2c, 2d (in some order), then 3c, 3d (in some order)
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('3', 'clubs'), card('2', 'clubs')],
        [card('3', 'diamonds'), card('2', 'diamonds')],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    const moves = getAutoCompleteMoves(state);
    expect(moves.length).toBe(4);

    // All moves should be foundation moves
    expect(moves.every((m) => m.kind === 'tableau-to-foundation')).toBe(true);

    // Verify applying all moves in order produces a valid result
    // (moves are in correct dependency order)
    for (const move of moves) {
      applyMove(state, move);
    }
    // Clubs and diamonds foundations should now have A, 2, 3
    expect(state.foundations[0].size()).toBe(3); // clubs
    expect(state.foundations[1].size()).toBe(3); // diamonds
  });

  it('should handle mixed suits in a single column', () => {
    // Column 0: 3 of hearts, 2 of clubs (top=2c)
    // Foundations: clubs at A, hearts at A+2=hearts at 2
    // Wait, let me make hearts at A so 2 of clubs goes first, then 3 of hearts needs hearts at 2
    // Actually: foundations clubs at A, hearts at A,2
    // Column: 3 of hearts (bottom), 2 of clubs (top)
    // Step 1: play 2 of clubs to clubs foundation
    // Step 2: play 3 of hearts to hearts foundation (hearts is at 2)
    const state = testState(
      [
        [card('A', 'clubs')],
        [card('A', 'diamonds')],
        [card('A', 'hearts'), card('2', 'hearts')],
        [card('A', 'spades')],
      ],
      [
        [card('3', 'hearts'), card('2', 'clubs')],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    const moves = getAutoCompleteMoves(state);
    expect(moves.length).toBe(2);
    // First move: 2 of clubs -> clubs foundation (index 0)
    expect(moves[0]).toEqual({ kind: 'tableau-to-foundation', fromCol: 0, toFoundation: 0 });
    // Second move: 3 of hearts -> hearts foundation (index 2)
    expect(moves[1]).toEqual({ kind: 'tableau-to-foundation', fromCol: 0, toFoundation: 2 });
  });

  it('should not mutate the original game state', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('3', 'clubs'), card('2', 'clubs')],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );

    const originalSize = state.tableau[0].size();
    const originalFoundationSize = state.foundations[0].size();

    getAutoCompleteMoves(state);

    expect(state.tableau[0].size()).toBe(originalSize);
    expect(state.foundations[0].size()).toBe(originalFoundationSize);
  });
});
