/**
 * AI strategies for 9-Card Golf.
 *
 * Provides:
 *   - AiStrategy interface: chooseAction(playerState, shared, rng)
 *   - RandomStrategy: uniformly random legal action
 *   - GreedyStrategy: minimizes visible score after the move
 *   - AiPlayer: wrapper that binds a strategy and RNG
 */

import type { Card } from '../../src/card-system/Card';
import type { GolfGrid } from './GolfGrid';
import { createGolfGrid } from './GolfGrid';
import type { GolfMove } from './GolfRules';
import { applyMove } from './GolfRules';
import { scoreGrid } from './GolfScoring';
import type {
  GolfPlayerState,
  GolfSharedState,
  GolfAction,
} from './GolfGame';
import { enumerateLegalMoves, enumerateDrawSources } from './GolfGame';

// ── Strategy interface ──────────────────────────────────────

/**
 * An AI strategy chooses a GolfAction given the current state.
 */
export interface AiStrategy {
  /** Human-readable strategy name. */
  readonly name: string;

  /**
   * Choose an action (draw source + move) for the current player.
   *
   * @param playerState  The AI player's current state.
   * @param shared       Shared game state (stock pile, discard pile, round end).
   * @param rng          Random number generator (for tie-breaking or random choice).
   * @returns            The chosen action.
   */
  chooseAction(
    playerState: GolfPlayerState,
    shared: GolfSharedState,
    rng: () => number,
  ): GolfAction;
}

// ── RandomStrategy ──────────────────────────────────────────

/**
 * Selects a uniformly random legal action each turn.
 */
export const RandomStrategy: AiStrategy = {
  name: 'random',

  chooseAction(
    playerState: GolfPlayerState,
    shared: GolfSharedState,
    rng: () => number,
  ): GolfAction {
    const drawSources = enumerateDrawSources(shared);
    const drawSource = drawSources[Math.floor(rng() * drawSources.length)];

    const legalMoves = enumerateLegalMoves(playerState.grid);
    if (legalMoves.length === 0) {
      throw new Error('No legal moves available');
    }
    const move = legalMoves[Math.floor(rng() * legalMoves.length)];

    return { drawSource, move };
  },
};

// ── GreedyStrategy ──────────────────────────────────────────

/**
 * Selects the action that minimizes the visible score after the move.
 *
 * For each draw source, the strategy simulates drawing, then evaluates
 * every legal move by computing the resulting visible score. The action
 * with the lowest resulting score is chosen. Ties are broken randomly.
 *
 * Note: For stock draws, the card is unknown until drawn, so the greedy
 * strategy draws first, then evaluates. For discard draws, the card is
 * known (peek at top of discard).
 *
 * Implementation approach: since the greedy strategy needs to actually
 * see the drawn card to evaluate moves, we evaluate two scenarios:
 *   1. What if we draw from stock? (We peek at the stock top to decide.)
 *   2. What if we draw from discard? (We peek at the discard top.)
 * Then pick whichever source + move yields the lowest score.
 */
export const GreedyStrategy: AiStrategy = {
  name: 'greedy',

  chooseAction(
    playerState: GolfPlayerState,
    shared: GolfSharedState,
    rng: () => number,
  ): GolfAction {
    const legalMoves = enumerateLegalMoves(playerState.grid);
    if (legalMoves.length === 0) {
      throw new Error('No legal moves available');
    }

    const drawSources = enumerateDrawSources(shared);

    interface Candidate {
      drawSource: typeof drawSources[number];
      move: GolfMove;
      score: number;
    }

    const candidates: Candidate[] = [];

    for (const drawSource of drawSources) {
      // Peek at the card we'd draw (without actually drawing)
      let peekCard: Card | undefined;
      if (drawSource === 'stock') {
        // Stock: peek at top (last element)
        peekCard = shared.stockPile.length > 0
          ? shared.stockPile[shared.stockPile.length - 1]
          : undefined;
      } else {
        peekCard = shared.discardPile.peek();
      }

      if (!peekCard) continue;

      for (const move of legalMoves) {
        const score = simulateMoveScore(playerState.grid, peekCard, move);
        candidates.push({ drawSource, move, score });
      }
    }

    if (candidates.length === 0) {
      // Fallback: random
      return RandomStrategy.chooseAction(playerState, shared, rng);
    }

    // Find the minimum score
    const minScore = Math.min(...candidates.map((c) => c.score));
    const best = candidates.filter((c) => c.score === minScore);

    // Break ties randomly
    const chosen = best[Math.floor(rng() * best.length)];
    return { drawSource: chosen.drawSource, move: chosen.move };
  },
};

/**
 * Simulate applying a move to a copy of the grid and return the
 * resulting total score (including face-down cards).
 *
 * Uses scoreGrid (not scoreVisibleCards) so that revealing a face-down
 * card doesn't artificially penalize the evaluation -- the hidden card's
 * value is always counted either way.
 */
function simulateMoveScore(
  grid: GolfGrid,
  drawnCard: Card,
  move: GolfMove,
): number {
  // Deep-copy the grid (cards are small objects)
  const gridCopy = createGolfGrid(
    grid.map((c) => ({ ...c })),
  );
  // Deep-copy the drawn card
  const cardCopy: Card = { ...drawnCard };

  applyMove(gridCopy, cardCopy, move);
  return scoreGrid(gridCopy);
}

// ── AiPlayer ────────────────────────────────────────────────

/**
 * An AI player that wraps a strategy and RNG for convenient use.
 */
export class AiPlayer {
  readonly strategy: AiStrategy;
  private readonly rng: () => number;

  constructor(strategy: AiStrategy, rng: () => number = Math.random) {
    this.strategy = strategy;
    this.rng = rng;
  }

  /**
   * Choose an action for the current game state.
   */
  chooseAction(
    playerState: GolfPlayerState,
    shared: GolfSharedState,
  ): GolfAction {
    return this.strategy.chooseAction(playerState, shared, this.rng);
  }
}
