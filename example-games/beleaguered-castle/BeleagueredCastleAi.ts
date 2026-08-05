/**
 * AI solver for Beleaguered Castle.
 *
 * Provides a hybrid solver that powers the in-game hint system:
 *
 * 1. **Winning-line search** — a depth-limited lookahead (with top-K move
 *    pruning and a node budget) that detects states from which the game can
 *    auto-complete (`getAutoCompleteMoves` non-empty, or all cards won).
 * 2. **Heuristic fallback** — a state-evaluation heuristic (foundation
 *    progress, immediately-playable column tops, empty columns, stack
 *    ordering) that scores moves when no winning line is found within the
 *    search horizon.
 *
 * Foundation moves receive a small root-level bonus because they permanently
 * advance the game and expose cards — the same reasoning used by the
 * auto-move heuristic in `BeleagueredCastleRules.findSafeAutoMoves`.
 *
 * Follows the shared AI abstractions from `@ai`: `AiStrategyBase` for the
 * strategy interface, `AiPlayer` for the strategy wrapper, and `pickBest`
 * for scored selection with seeded random tie-breaking.
 *
 * All functions are pure with respect to the game state: the search applies
 * and undoes moves internally and never leaves the state mutated.
 */

import type { BeleagueredCastleState, BCMove } from './BeleagueredCastleState';
import { FOUNDATION_COUNT, TABLEAU_COUNT } from './BeleagueredCastleState';
import {
  getLegalMoves,
  applyMove,
  undoMove,
  isWon,
  getAutoCompleteMoves,
  foundationIndex,
  foundationTopRank,
  isLegalFoundationMove,
  rankValue,
} from './BeleagueredCastleRules';
import type { AiStrategyBase } from '../../src/ai';
import { AiPlayer, pickBest } from '../../src/ai';

// ── Search configuration ────────────────────────────────────

/** Maximum lookahead depth (plies) for the winning-line search. */
export const SEARCH_DEPTH = 4;

/** Only the top-K moves by heuristic score are expanded at each node. */
export const TOP_K = 4;

/** Hard cap on the total number of evaluated nodes across a single search. */
export const NODE_BUDGET = 40_000;

/** Root-level bonus for foundation moves (permanently valuable plays). */
export const FOUNDATION_MOVE_BONUS = 50;

// ── Heuristic scoring ───────────────────────────────────────

/**
 * Score how favourable a game state is (higher is better).
 *
 * Signals:
 * - Foundation progress (each foundation rank is +100).
 * - Column tops that are immediately playable to their foundation (+150).
 * - Empty columns (+20 each) — they accept any card and enable maneuvering.
 * - Penalty for columns whose cards are not strictly descending (-8 per
 *   violation) — such stacks are harder to unwind.
 *
 * Cheap to evaluate: no lookahead, pure state features.
 */
export function heuristicScore(state: BeleagueredCastleState): number {
  let score = 0;

  for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
    score += foundationTopRank(state, fi) * 100;
  }

  for (let col = 0; col < TABLEAU_COUNT; col++) {
    if (state.tableau[col].isEmpty()) {
      score += 20;
      continue;
    }
    const top = state.tableau[col].peek()!;
    if (isLegalFoundationMove(state, col, foundationIndex(top.suit)).legal) {
      score += 150;
    }
  }

  for (let col = 0; col < TABLEAU_COUNT; col++) {
    const cards = state.tableau[col].toArray();
    for (let i = 1; i < cards.length; i++) {
      if (rankValue(cards[i].rank) !== rankValue(cards[i - 1].rank) - 1) {
        score -= 8;
      }
    }
  }

  return score;
}

/**
 * Score a single move by the heuristic value of the state it produces.
 *
 * Does not mutate the caller's state (applies and undoes internally).
 */
export function scoreMove(state: BeleagueredCastleState, move: BCMove): number {
  applyMove(state, move);
  const score = heuristicScore(state);
  undoMove(state, move);
  return score;
}

// ── Winning-line search ─────────────────────────────────────

/** A state is a search terminal when the game can finish from it. */
function isTerminalWin(state: BeleagueredCastleState): boolean {
  return isWon(state) || getAutoCompleteMoves(state).length > 0;
}

/**
 * Depth-limited minimax-style search that scores the best reachable outcome
 * from the current state. Applies and undoes moves internally.
 */
class MoveSearcher {
  private budget: number;

  constructor(budget: number = NODE_BUDGET) {
    this.budget = budget;
  }

  evaluate(state: BeleagueredCastleState, depth: number): number {
    if (isTerminalWin(state)) {
      return 900_000 - depth;
    }

    if (this.budget <= 0 || depth >= SEARCH_DEPTH) {
      return heuristicScore(state);
    }
    this.budget--;

    const moves = getLegalMoves(state);
    if (moves.length === 0) {
      return -1_000_000 + depth;
    }

    // Expand only the top-K moves by immediate heuristic score.
    const ranked = moves
      .map((m) => ({ move: m, score: scoreMove(state, m) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);

    let best = -Infinity;
    for (const { move } of ranked) {
      applyMove(state, move);
      const score = this.evaluate(state, depth + 1);
      undoMove(state, move);
      if (score > best) best = score;
    }
    return best;
  }
}

// ── Public API ──────────────────────────────────────────────

/**
 * Suggest the best move for the current state, or `undefined` when no
 * legal moves exist.
 *
 * The suggested move is the root move with the best reachable outcome:
 * a winning line when one is found within the search horizon, otherwise
 * the highest-scoring heuristic play. Foundation moves win ties thanks
 * to `FOUNDATION_MOVE_BONUS`. Ties are otherwise broken uniformly at
 * random using `rng` (seeded for determinism).
 *
 * @param state  The current game state. Never mutated.
 * @param rng    RNG for tie-breaking (defaults to `Math.random`).
 * @returns      The suggested move, or `undefined` if no move is legal.
 */
export function suggestBestMove(
  state: BeleagueredCastleState,
  rng: () => number = Math.random,
): BCMove | undefined {
  const moves = getLegalMoves(state);
  if (moves.length === 0) return undefined;

  const searcher = new MoveSearcher();

  // Evaluate foundation moves first: they win ties (permanent progress) and
  // are the most common winning plays, so the early exit below fires sooner.
  const ordered = [...moves].sort((a, b) =>
    (b.kind === 'tableau-to-foundation' ? 1 : 0) -
    (a.kind === 'tableau-to-foundation' ? 1 : 0),
  );

  const scored: Array<{ move: BCMove; score: number }> = [];
  for (const move of ordered) {
    applyMove(state, move);
    let score = searcher.evaluate(state, 1);
    undoMove(state, move);

    if (move.kind === 'tableau-to-foundation') {
      score += FOUNDATION_MOVE_BONUS;
    }

    // A winning line was found: this move is provably good — return it now
    // instead of paying for the remaining root-move searches.
    if (score >= 900_000 - SEARCH_DEPTH) {
      return move;
    }

    scored.push({ move, score });
  }

  return pickBest(scored, (s) => s.score, rng).move;
}

// ── Strategy interface & player wrapper ─────────────────────

/**
 * AI strategy interface for Beleaguered Castle.
 *
 * Extends the shared `AiStrategyBase` with a single decision method that
 * suggests the best move for a board state.
 */
export interface BcAiStrategy extends AiStrategyBase {
  /**
   * Suggest the best move for the given state.
   *
   * @param state  The current game state (must not be mutated).
   * @param rng    RNG for seeded tie-breaking / exploration.
   * @returns      The suggested move, or `undefined` when no move is legal.
   */
  suggestMove(state: BeleagueredCastleState, rng: () => number): BCMove | undefined;
}

/**
 * The default solver strategy: evaluates the board and searches ahead for
 * winning moves (see {@link suggestBestMove}).
 */
export const SolverStrategy: BcAiStrategy = {
  name: 'solver',
  suggestMove: suggestBestMove,
};

/**
 * AI player wrapper that binds a strategy to an RNG source, hiding the
 * `rng` parameter from callers.
 *
 * @example
 * ```ts
 * const ai = new BeleagueredCastleAiPlayer(SolverStrategy, createSeededRng(seed));
 * const hint = ai.suggestMove(gameState);
 * ```
 */
export class BeleagueredCastleAiPlayer extends AiPlayer<BcAiStrategy> {
  /**
   * Suggest the best move for the given state using the bound strategy.
   */
  suggestMove(state: BeleagueredCastleState): BCMove | undefined {
    return this.strategy.suggestMove(state, this.rng);
  }
}
