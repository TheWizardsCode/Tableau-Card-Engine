import { describe, it, expect } from 'vitest';
import {
  deal,
  getLegalMoves,
  applyMove,
  createSeededRng,
} from '../../example-games/beleaguered-castle/BeleagueredCastleRules';
import {
  suggestBestMove,
  SolverStrategy,
  BeleagueredCastleAiPlayer,
} from '../../example-games/beleaguered-castle/BeleagueredCastleAi';
import type { BeleagueredCastleState, BCMove } from '../../example-games/beleaguered-castle/BeleagueredCastleState';
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

// ── suggestBestMove ─────────────────────────────────────────

describe('suggestBestMove', () => {
  it('returns a legal move for fresh deals across many seeds', () => {
    for (const seed of [1, 17, 42, 100, 999, 1234, 2024]) {
      const state = deal(seed);
      const move = suggestBestMove(state, createSeededRng(seed));
      expect(move, `seed ${seed} should suggest a move`).toBeDefined();
      if (move) {
        expect(getLegalMoves(state), `seed ${seed}`).toContainEqual(move);
      }
    }
  });

  it('prefers a foundation move when one is available', () => {
    // 2 of clubs is the top of col 0 and can go on the clubs foundation
    // (foundations are at Ace). It can also be stacked on a 3 (col 1) or
    // moved to an empty column, but the foundation move is the best play.
    const state = testState(
      [
        [card('A', 'clubs')],
        [card('A', 'diamonds')],
        [card('A', 'hearts')],
        [card('A', 'spades')],
      ],
      [
        [card('3', 'clubs'), card('2', 'clubs')],
        [card('3', 'hearts')],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    );
    const move = suggestBestMove(state, createSeededRng(42));
    expect(move).toEqual({
      kind: 'tableau-to-foundation',
      fromCol: 0,
      toFoundation: 0,
    });
  });

  it('returns undefined when no legal moves exist', () => {
    // Stuck state from the rules tests: Kings and 4s cannot interact.
    const stuckState = testState(
      [
        [card('A', 'clubs')],
        [card('A', 'diamonds')],
        [card('A', 'hearts')],
        [card('A', 'spades')],
      ],
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
    expect(suggestBestMove(stuckState, createSeededRng(1))).toBeUndefined();
  });

  it('returns undefined for an already-won state', () => {
    const wonFoundations = ['clubs', 'diamonds', 'hearts', 'spades'].map((suit) =>
      new Pile(
        ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map(
          (r) => card(r, suit),
        ),
      ),
    ) as unknown as readonly [Pile, Pile, Pile, Pile];

    const state: BeleagueredCastleState = {
      foundations: wonFoundations,
      tableau: Array.from({ length: 8 }, () => new Pile()),
      seed: 0,
      moveCount: 48,
    };
    expect(suggestBestMove(state, createSeededRng(1))).toBeUndefined();
  });

  it('is deterministic for a given seed', () => {
    const state = deal(42);
    const rng1 = createSeededRng(7);
    const rng2 = createSeededRng(7);
    const move1 = suggestBestMove(state, rng1);
    const move2 = suggestBestMove(state, rng2);
    expect(move1).toEqual(move2);
    expect(move1).toBeDefined();
  });

  it('does not mutate the game state', () => {
    const state = deal(42);

    const tableauSizes = state.tableau.map((col) => col.size());
    const foundationSizes = state.foundations.map((f) => f.size());
    const moveCountBefore = state.moveCount;

    suggestBestMove(state, createSeededRng(42));

    for (let i = 0; i < state.tableau.length; i++) {
      expect(state.tableau[i].size()).toBe(tableauSizes[i]);
    }
    for (let i = 0; i < state.foundations.length; i++) {
      expect(state.foundations[i].size()).toBe(foundationSizes[i]);
    }
    expect(state.moveCount).toBe(moveCountBefore);
  });

  it('suggests a move that can be legally executed', () => {
    const state = deal(42);
    const move = suggestBestMove(state, createSeededRng(42))!;
    const cardsBefore = state.tableau.reduce((n, c) => n + c.size(), 0);
    expect(() => applyMove(state, move)).not.toThrow();
    expect(state.tableau.reduce((n, c) => n + c.size(), 0)).toBe(cardsBefore - 1);
    expect(state.moveCount).toBe(1);
  });
});

// ── Solver: winning-line detection ──────────────────────────

describe('solver winning-line detection', () => {
  it('finds a move that leads to a trivially winnable state', () => {
    // Clubs foundation is built up to 5 (rank 4). The clubs remaining are
    // 6,7,8,9,10,J,Q,K. The 7 is stacked under the K (illegal order) and
    // must be moved onto the 8 (or an empty column) to make every column
    // strictly descending, at which point the game auto-completes.
    const state = testState(
      [
        [
          card('A', 'clubs'), card('2', 'clubs'), card('3', 'clubs'),
          card('4', 'clubs'), card('5', 'clubs'),
        ],
        [card('A', 'diamonds')],
        [card('A', 'hearts')],
        [card('A', 'spades')],
      ],
      [
        [card('K', 'clubs'), card('6', 'clubs'), card('7', 'clubs')],
        [card('8', 'clubs')],
        [card('9', 'clubs')],
        [card('10', 'clubs')],
        [card('J', 'clubs')],
        [card('Q', 'clubs')],
        [],
        [],
      ],
    );

    const move = suggestBestMove(state, createSeededRng(42));
    expect(move).toBeDefined();
    // The winning play is moving the 7 of clubs (col 0 top) onto the
    // 8 of clubs (col 1) or onto an empty column (cols 6/7).
    if (move && move.kind === 'tableau-to-tableau') {
      expect(move.fromCol).toBe(0);
      expect([1, 6, 7]).toContain(move.toCol);
    } else {
      // Guard: if the solver returns something else, the test fails loudly.
      expect(move).toEqual({ kind: 'tableau-to-tableau', fromCol: 0, toCol: 1 });
    }
  });
});

// ── Strategy interface & player wrapper ─────────────────────

describe('SolverStrategy', () => {
  it('exposes a stable name', () => {
    expect(SolverStrategy.name).toBe('solver');
  });

  it('suggests a move through the strategy interface', () => {
    const rng = createSeededRng(42);
    const state = deal(42);
    const move = SolverStrategy.suggestMove(state, rng);
    expect(move).toBeDefined();
    if (move) {
      expect(getLegalMoves(state)).toContainEqual(move);
    }
  });
});

describe('BeleagueredCastleAiPlayer', () => {
  it('wraps the strategy and hides the rng from callers', () => {
    const player = new BeleagueredCastleAiPlayer(
      SolverStrategy,
      createSeededRng(42),
    );
    expect(player.strategyName).toBe('solver');
    expect(player.strategy).toBe(SolverStrategy);

    const state = deal(42);
    const move = player.suggestMove(state);
    expect(move).toBeDefined();
    if (move) {
      expect(getLegalMoves(state)).toContainEqual(move);
    }
  });

  it('is deterministic: same strategy + same seed = same move', () => {
    const state = deal(42);
    const player1 = new BeleagueredCastleAiPlayer(SolverStrategy, createSeededRng(5));
    const player2 = new BeleagueredCastleAiPlayer(SolverStrategy, createSeededRng(5));
    expect(player1.suggestMove(state)).toEqual(player2.suggestMove(state));
  });

  it('suggests a legal move for a variety of seeds', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const player = new BeleagueredCastleAiPlayer(SolverStrategy, createSeededRng(seed));
      const state = deal(seed);
      const move: BCMove | undefined = player.suggestMove(state);
      expect(move, `seed ${seed}`).toBeDefined();
      if (move) {
        expect(getLegalMoves(state), `seed ${seed}`).toContainEqual(move);
      }
    }
  });
});
