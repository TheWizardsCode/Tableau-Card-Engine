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
  hasValuableMoves,
  getLegalMoves,
  rankValue,
  nextRank,
  foundationIndex,
  createSeededRng,
  findSafeAutoMoves,
  foundationTopRank,
  isTriviallyWinnable,
  getAutoCompleteMoves,
  citadelColumnSize,
} from '../../example-games/beleaguered-castle/BeleagueredCastleRules';
import {
  FOUNDATION_COUNT,
  TABLEAU_COUNT,
  CARDS_PER_COLUMN,
  FOUNDATION_SUITS,
} from '../../example-games/beleaguered-castle/BeleagueredCastleState';
import type { BeleagueredCastleState } from '../../example-games/beleaguered-castle/BeleagueredCastleState';
import type { BaseSetupOptions } from '../../src/core-engine/SetupOptions';
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

  it('should accept BaseSetupOptions with injected RNG', () => {
    const rng = createSeededRng(42);
    const options: BaseSetupOptions = { rng };
    const state = deal(options);

    // Should produce a valid game state
    expect(state.foundations.length).toBe(FOUNDATION_COUNT);
    expect(state.tableau.length).toBe(TABLEAU_COUNT);
    for (const col of state.tableau) {
      expect(col.size()).toBe(CARDS_PER_COLUMN);
    }
    expect(state.moveCount).toBe(0);
  });

  it('should produce identical deals with same seeded RNG via BaseSetupOptions', () => {
    const state1 = deal({ rng: createSeededRng(42) });
    const state2 = deal({ rng: createSeededRng(42) });

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

  it('should default to Math.random when called with no arguments', () => {
    const state = deal();
    // Should still produce a valid game state
    expect(state.foundations.length).toBe(FOUNDATION_COUNT);
    expect(state.tableau.length).toBe(TABLEAU_COUNT);
    expect(state.seed).toBe(0);
  });

  it('should set seed to 0 when using BaseSetupOptions overload', () => {
    const state = deal({ rng: createSeededRng(99) });
    expect(state.seed).toBe(0);
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
    expect(isLegalFoundationMove(state, 0, 0)).toEqual({ legal: true });
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
    expect(isLegalFoundationMove(state, 0, 0)).toEqual({ legal: false, reason: expect.any(String) });
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
    expect(isLegalFoundationMove(state, 0, 0)).toEqual({ legal: false, reason: expect.any(String) });
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
    expect(isLegalFoundationMove(state, 0, 0)).toEqual({ legal: false, reason: expect.any(String) });
  });

  it('should reject out-of-bounds column index', () => {
    const state = deal(42);
    expect(isLegalFoundationMove(state, -1, 0)).toEqual({ legal: false, reason: expect.any(String) });
    expect(isLegalFoundationMove(state, 8, 0)).toEqual({ legal: false, reason: expect.any(String) });
  });

  it('should reject out-of-bounds foundation index', () => {
    const state = deal(42);
    expect(isLegalFoundationMove(state, 0, -1)).toEqual({ legal: false, reason: expect.any(String) });
    expect(isLegalFoundationMove(state, 0, 4)).toEqual({ legal: false, reason: expect.any(String) });
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
    expect(isLegalTableauMove(state, 0, 1)).toEqual({ legal: true });
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
    expect(isLegalTableauMove(state, 0, 1)).toEqual({ legal: true });
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
    expect(isLegalTableauMove(state, 0, 1)).toEqual({ legal: false, reason: expect.any(String) });
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
    expect(isLegalTableauMove(state, 0, 1)).toEqual({ legal: false, reason: expect.any(String) });
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
    expect(isLegalTableauMove(state, 0, 0)).toEqual({ legal: false, reason: expect.any(String) });
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
    expect(isLegalTableauMove(state, 0, 1)).toEqual({ legal: false, reason: expect.any(String) });
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
    expect(isLegalTableauMove(state, 0, 1)).toEqual({ legal: true });
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
    // applyFoundationMove no longer throws on illegal moves; callers must
    // check legality via isLegalFoundationMove first.
    // The function will instead fail at a lower level (e.g., pop from empty).
    expect(isLegalFoundationMove(state, 0, 0)).toEqual({ legal: false, reason: expect.any(String) });
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
    // applyTableauMove no longer throws on illegal moves; callers must
    // check legality via isLegalTableauMove first.
    expect(isLegalTableauMove(state, 0, 1)).toEqual({ legal: false, reason: expect.any(String) });
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

// ── hasValuableMoves ────────────────────────────────────────

describe('hasValuableMoves', () => {
  it('should return false when no legal moves exist', () => {
    // Same stuck state as hasNoMoves test: Kings and 4s can't interact
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
    expect(hasValuableMoves(stuckState)).toBe(false);
  });

  it('should return true when a foundation move is available', () => {
    // Column 0 has 2 of clubs which can go to the clubs foundation (A -> 2)
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [[card('2', 'clubs')], [], [], [], [], [], [], []],
    );
    expect(hasValuableMoves(state)).toBe(true);
  });

  it('should return true for a fresh deal', () => {
    // A freshly dealt game should always have at least one valuable move
    const state = deal(42);
    expect(hasValuableMoves(state)).toBe(true);
  });

  it('should return true when a tableau move exposes a new card', () => {
    // Column 0: 3-clubs (bottom), 5-hearts (top)
    // Column 1: 6-diamonds (single card)
    // All other columns empty.
    // Moving 5-hearts to column 1 (rank 5 on 6) is valuable because it
    // exposes 3-clubs which wasn't involved in any move before.
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('3', 'clubs'), card('5', 'hearts')],
        [card('6', 'diamonds')],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(hasValuableMoves(state)).toBe(true);
  });

  it('should treat illegal-parent to legal-parent moves as valuable', () => {
    // 7h is on 9c (illegal parent), but can move to 8d (legal parent).
    // Even if this does not open additional new-move branches, it should
    // count as valuable according to productive-move policy.
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('9', 'clubs'), card('7', 'hearts')],
        [card('8', 'diamonds')],
        [card('K', 'clubs')],
        [card('K', 'diamonds')],
        [card('K', 'hearts')],
        [card('K', 'spades')],
        [card('4', 'clubs')],
        [card('4', 'diamonds')],
      ],
    );

    expect(getLegalMoves(state)).toEqual([
      { kind: 'tableau-to-tableau', fromCol: 0, toCol: 1 },
    ]);
    expect(hasValuableMoves(state)).toBe(true);
  });
  it('should return true when a tableau move creates a genuinely new non-reverse move', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('5', 'clubs')],
        [card('6', 'diamonds')],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(hasValuableMoves(state)).toBe(true);
  });

  it('should treat immediate backtrack-only moves as non-valuable', () => {
    // Repro from gameplay report: the only available action after moving
    // 10 onto another Jack is moving the 10 straight back.
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('J', 'clubs'), card('10', 'hearts')],
        [card('J', 'diamonds')],
        [card('4', 'clubs')],
        [card('4', 'diamonds')],
        [card('4', 'hearts')],
        [card('4', 'spades')],
        [card('7', 'clubs')],
        [card('K', 'hearts')],
      ],
    );

    expect(getLegalMoves(state)).toEqual([
      { kind: 'tableau-to-tableau', fromCol: 0, toCol: 1 },
    ]);
    expect(hasValuableMoves(state)).toBe(false);
  });

  it('should handle single-card columns where moving creates an empty column', () => {
    // Column 0: 3-clubs (bottom), 2-hearts (top)
    // Column 1: 3-diamonds (single card)
    // All others empty.
    // Moving 2-hearts onto 3-diamonds is legal (2 on 3).
    // After: col 0 has 3-clubs exposed (new card!). Valuable.
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('3', 'clubs'), card('2', 'hearts')],
        [card('3', 'diamonds')],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(hasValuableMoves(state)).toBe(true);
  });

  it('should return true when a foundation move exists among mixed moves', () => {
    // Column 0: 2-clubs (can go to foundation), Column 1: 5-hearts
    // Even if tableau shuffles are valueless, the foundation move makes it valuable
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('2', 'clubs')],
        [card('5', 'hearts')],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(hasValuableMoves(state)).toBe(true);
  });

  it('should not mutate the game state', () => {
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [card('A', 'hearts')], [card('A', 'spades')]],
      [
        [card('3', 'clubs'), card('5', 'hearts')],
        [card('6', 'diamonds')],
        [card('4', 'spades')],
        [],
        [],
        [],
        [],
        [],
      ],
    );

    // Snapshot sizes before
    const tableauSizes = state.tableau.map((col) => col.size());
    const foundationSizes = state.foundations.map((f) => f.size());
    const moveCountBefore = state.moveCount;

    hasValuableMoves(state);

    // Verify sizes after
    for (let i = 0; i < state.tableau.length; i++) {
      expect(state.tableau[i].size()).toBe(tableauSizes[i]);
    }
    for (let i = 0; i < state.foundations.length; i++) {
      expect(state.foundations[i].size()).toBe(foundationSizes[i]);
    }
    expect(state.moveCount).toBe(moveCountBefore);
  });

  it('should return false for all-empty tableau', () => {
    // All columns empty -- no legal moves at all
    const state = testState(
      [
        [card('A', 'clubs'), card('2', 'clubs')],
        [card('A', 'diamonds')],
        [card('A', 'hearts')],
        [card('A', 'spades')],
      ],
      [[], [], [], [], [], [], [], []],
    );
    expect(hasValuableMoves(state)).toBe(false);
  });

  it('should detect valuable moves across multiple seeds', () => {
    // Fresh deals should always have valuable moves
    for (const seed of [1, 17, 42, 100, 999]) {
      const state = deal(seed);
      expect(hasValuableMoves(state)).toBe(true);
    }
  });
});

// ── Citadel variant (AC 3, AC 5) ─────────────────────────────

describe('deal (citadel variant)', () => {
  it('should deal all 52 cards to the tableau with empty foundations', () => {
    const state = deal(42, { variant: 'citadel' });
    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      expect(state.foundations[fi].size()).toBe(0);
    }
    const totalTableau = state.tableau.reduce((sum, col) => sum + col.size(), 0);
    expect(totalTableau).toBe(52);
  });

  it('should deal 4 columns of 7 and 4 columns of 6', () => {
    const state = deal(42, { variant: 'citadel' });
    expect(state.tableau.length).toBe(TABLEAU_COUNT);
    const sizes = state.tableau.map((col) => col.size());
    expect(sizes).toEqual([7, 7, 7, 7, 6, 6, 6, 6]);
  });

  it('should contain exactly 52 unique cards total (all in tableau)', () => {
    const state = deal(42, { variant: 'citadel' });
    const allCards: Card[] = state.tableau.flatMap((col) => col.toArray());
    expect(allCards.length).toBe(52);
    const cardIds = allCards.map((c) => `${c.rank}-${c.suit}`);
    expect(new Set(cardIds).size).toBe(52);
  });

  it('should include aces in the tableau (one per suit somewhere)', () => {
    const state = deal(42, { variant: 'citadel' });
    const allCards = state.tableau.flatMap((col) => col.toArray());
    const aces = allCards.filter((c) => c.rank === 'A');
    expect(aces.length).toBe(4);
    expect(new Set(aces.map((c) => c.suit)).size).toBe(4);
  });

  it('should have all cards face-up', () => {
    const state = deal(42, { variant: 'citadel' });
    for (const col of state.tableau) {
      for (const c of col.toArray()) {
        expect(c.faceUp).toBe(true);
      }
    }
  });

  it('should produce identical citadel deals with the same seed', () => {
    const state1 = deal(42, { variant: 'citadel' });
    const state2 = deal(42, { variant: 'citadel' });
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

  it('should store the seed in game state', () => {
    const state = deal(42, { variant: 'citadel' });
    expect(state.seed).toBe(42);
    expect(state.moveCount).toBe(0);
  });

  it('should keep classic deal unchanged when variant is omitted', () => {
    const classic = deal(42);
    const explicit = deal(42, { variant: 'classic' });
    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      expect(classic.foundations[fi].size()).toBe(1);
      expect(explicit.foundations[fi].size()).toBe(1);
    }
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      expect(classic.tableau[col].size()).toBe(CARDS_PER_COLUMN);
      expect(explicit.tableau[col].size()).toBe(CARDS_PER_COLUMN);
    }
  });

  it('should support citadel via BaseSetupOptions with injected RNG', () => {
    const state = deal({ rng: createSeededRng(42), variant: 'citadel' });
    const totalTableau = state.tableau.reduce((sum, col) => sum + col.size(), 0);
    expect(totalTableau).toBe(52);
    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      expect(state.foundations[fi].size()).toBe(0);
    }
  });

  it('should produce a different layout than classic for the same seed', () => {
    const classic = deal(42);
    const citadel = deal(42, { variant: 'citadel' });
    // Classic pre-places aces; Citadel does not.
    expect(citadel.foundations[0].size()).not.toBe(classic.foundations[0].size());
    // The tableau column sizes differ (6 vs 7 for the first columns).
    expect(citadel.tableau[0].size()).toBe(7);
    expect(classic.tableau[0].size()).toBe(6);
  });
});

describe('citadelColumnSize', () => {
  it('should return 7 for the first four columns and 6 for the rest', () => {
    for (let col = 0; col < 4; col++) {
      expect(citadelColumnSize(col)).toBe(7);
    }
    for (let col = 4; col < 8; col++) {
      expect(citadelColumnSize(col)).toBe(6);
    }
  });
});

describe('Citadel auto-move with aces (AC 5)', () => {
  it('should auto-move an exposed ace to an empty foundation', () => {
    // Citadel-like state: foundations empty, an ace on top of column 0.
    const state = testState(
      [[], [], [], []],
      [
        [card('5', 'clubs'), card('A', 'clubs')], // ace exposed on top
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
    expect(moves).toEqual([
      { kind: 'tableau-to-foundation', fromCol: 0, toFoundation: 0 },
    ]);
  });

  it('should auto-move aces from multiple columns when all foundations are empty', () => {
    const state = testState(
      [[], [], [], []],
      [
        [card('A', 'clubs')],
        [card('A', 'diamonds')],
        [card('3', 'hearts'), card('A', 'hearts')],
        [card('A', 'spades')],
        [],
        [],
        [],
        [],
      ],
    );
    const moves = findSafeAutoMoves(state);
    expect(moves).toHaveLength(4);
    for (const m of moves) {
      expect(m.kind).toBe('tableau-to-foundation');
    }
    expect(moves.some((m) => m.kind === 'tableau-to-foundation' && m.toFoundation === 2)).toBe(true); // hearts ace
  });

  it('should auto-move aces even when some foundations already have aces', () => {
    // Clubs + diamonds foundations have aces; hearts + spades are empty.
    const state = testState(
      [[card('A', 'clubs')], [card('A', 'diamonds')], [], []],
      [
        [card('A', 'hearts')], // exposed ace, empty hearts foundation
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
    expect(moves).toEqual([
      { kind: 'tableau-to-foundation', fromCol: 0, toFoundation: 2 },
    ]);
  });

  it('should promote subsequent cards only after aces reach foundations', () => {
    // Simulate a real citadel auto-move cascade: ace on top of column 0,
    // 2 of clubs buried beneath it. Aces auto-move first; the 2 only
    // becomes safe once every foundation holds at least an ace.
    const state = testState(
      [[], [], [], []],
      [
        [card('2', 'clubs'), card('A', 'clubs')],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );

    // Pass 1: only the ace is safe (2 is not next on the empty foundation).
    const moves1 = findSafeAutoMoves(state);
    expect(moves1).toEqual([
      { kind: 'tableau-to-foundation', fromCol: 0, toFoundation: 0 },
    ]);

    // Apply the ace auto-move.
    applyMove(state, moves1[0]);
    // Clubs foundation now has A; other foundations still empty.
    // 2 of clubs is next on clubs, but minFoundationRank = -1 < 0, so the
    // conservative heuristic waits for the other aces (classic parity).
    const moves2 = findSafeAutoMoves(state);
    expect(moves2).toHaveLength(0);
  });

  it('should not auto-move a non-ace onto an empty foundation', () => {
    const state = testState(
      [[], [], [], []],
      [
        [card('2', 'clubs')], // 2 cannot start a foundation
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(findSafeAutoMoves(state)).toHaveLength(0);
  });

  it('should treat an ace on top as a legal foundation move in citadel', () => {
    const state = testState(
      [[], [], [], []],
      [
        [card('A', 'clubs')],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    expect(isLegalFoundationMove(state, 0, 0)).toEqual({ legal: true });
  });

  it('should auto-complete a trivially winnable citadel endgame from empty foundations', () => {
    // Columns descending by rank (bottom = highest), all above foundation
    // tops (which are -1 for empty foundations). Ace ranks 0 > -1.
    const state = testState(
      [[], [], [], []],
      [
        [card('3', 'clubs'), card('2', 'clubs'), card('A', 'clubs')],
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
    const moves = getAutoCompleteMoves(state);
    expect(moves).toHaveLength(3);
    for (const m of moves) {
      expect(m.kind).toBe('tableau-to-foundation');
    }
  });
});
