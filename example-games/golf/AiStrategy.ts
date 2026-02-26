/**
 * AI strategies for 9-Card Golf.
 *
 * Provides:
 *   - AiStrategy interface: chooseAction(playerState, shared, rng)
 *   - RandomStrategy: uniformly random legal action
 *   - GreedyStrategy: minimizes visible score after the move (fair play)
 *   - AiPlayer: wrapper that binds a strategy and RNG
 *
 * Uses shared AI module (`@ai`) for base types and utility functions.
 *
 * **Fair play guarantee**: All strategies operate on AI-visible state
 * projections that hide face-down cards and stock pile contents. The AI
 * cannot peek at hidden information; the information boundary is enforced
 * structurally by the type system.
 */

import type { Card } from '../../src/card-system/Card';
import type { GolfMove, DrawSource } from './GolfRules';
import { scoreAiVisibleGrid, simulateAiMoveScore } from './GolfScoring';
import type {
  AiVisiblePlayerState,
  AiVisibleSharedState,
  AiVisibleGrid,
  GolfAction,
} from './GolfGame';
import { enumerateAiLegalMoves, enumerateAiDrawSources } from './GolfGame';
import type { AiStrategyBase } from '../../src/ai';
import { AiPlayer as AiPlayerBase, pickRandom, pickBest } from '../../src/ai';

// ── Strategy interface ──────────────────────────────────────

/**
 * An AI strategy chooses a GolfAction given only AI-visible state.
 *
 * The strategy receives filtered state projections that hide face-down
 * cards and stock pile contents. This makes cheating structurally
 * impossible — the AI simply cannot access hidden data.
 */
export interface AiStrategy extends AiStrategyBase {
  /**
   * Choose an action (draw source + move) for the current player.
   *
   * @param playerState  The AI player's visible state (face-down cards hidden).
   * @param shared       Visible shared game state (no stock pile access).
   * @param rng          Random number generator (for tie-breaking or random choice).
   * @returns            The chosen action.
   */
  chooseAction(
    playerState: AiVisiblePlayerState,
    shared: AiVisibleSharedState,
    rng: () => number,
  ): GolfAction;
}

// ── RandomStrategy ──────────────────────────────────────────

/**
 * Selects a uniformly random legal action each turn.
 *
 * Fair play: uses only `stockHasCards` boolean and `discardTop`
 * card — never accesses hidden card data.
 */
export const RandomStrategy: AiStrategy = {
  name: 'random',

  chooseAction(
    playerState: AiVisiblePlayerState,
    shared: AiVisibleSharedState,
    rng: () => number,
  ): GolfAction {
    const drawSource = pickRandom(enumerateAiDrawSources(shared), rng);

    const legalMoves = enumerateAiLegalMoves(playerState.grid);
    if (legalMoves.length === 0) {
      throw new Error('No legal moves available');
    }
    const move = pickRandom(legalMoves, rng);

    return { drawSource, move };
  },
};

// ── GreedyStrategy ──────────────────────────────────────────

/**
 * A fair greedy strategy that makes decisions in two phases:
 *
 * **Phase 1 — Choose draw source (without peeking at stock):**
 * The AI evaluates the discard top card (which is visible to all).
 * If drawing from discard would yield a good score improvement
 * (compared to the current grid), it prefers discard. Otherwise,
 * it draws from stock (blind draw — the AI does not know what
 * card it will get).
 *
 * The draw source decision is *committed* before seeing the
 * stock card. This is structurally enforced because the AI-visible
 * shared state does not expose any stock pile card data.
 *
 * **Phase 2 — Evaluate moves with the drawn card:**
 * After drawing (in the scene), the drawn card becomes known.
 * The strategy evaluates each legal move using fair AI-visible
 * scoring (face-down cards scored at average value, no peeking).
 *
 * Because the GreedyStrategy must commit to a draw source before
 * seeing the stock card, the `chooseAction` method is split into
 * two cooperating methods:
 * - `chooseDrawSource()` — Phase 1
 * - `chooseMoveForCard()` — Phase 2
 *
 * The `chooseAction()` method combines both phases for testing
 * convenience: when the draw source is 'discard', the discard top
 * card is known and can be used directly; when 'stock', a move
 * must be deferred. For the full game flow, the scene calls
 * the two phases separately.
 */
export const GreedyStrategy: AiStrategy = {
  name: 'greedy',

  chooseAction(
    playerState: AiVisiblePlayerState,
    shared: AiVisibleSharedState,
    rng: () => number,
  ): GolfAction {
    const drawSource = chooseDrawSource(playerState, shared, rng);

    if (drawSource === 'discard' && shared.discardTop) {
      // We know the discard card — evaluate moves with it
      const move = chooseMoveForCard(
        playerState.grid,
        shared.discardTop,
        rng,
      );
      return { drawSource, move };
    }

    // Stock draw: we don't know the card yet, so pick a default move.
    // In the full game flow, the scene will call chooseMoveForCard()
    // after the actual draw. For testing/simulation, we need to
    // return *something* — pick a random legal move as placeholder.
    const legalMoves = enumerateAiLegalMoves(playerState.grid);
    if (legalMoves.length === 0) {
      throw new Error('No legal moves available');
    }
    const move = pickRandom(legalMoves, rng);
    return { drawSource, move };
  },
};

/**
 * Phase 1: Choose whether to draw from stock or discard.
 *
 * Heuristic: If the discard top card would improve the grid score
 * (by swapping with a visible high-value card or completing a column
 * match), prefer discard. Otherwise, draw from stock (the unknown
 * might be better than the known-unhelpful discard).
 *
 * This decision is made using ONLY visible information:
 * - The discard top card (visible to all players)
 * - The AI's own face-up cards
 * - Whether stock has cards
 *
 * @returns 'stock' or 'discard'
 */
export function chooseDrawSource(
  playerState: AiVisiblePlayerState,
  shared: AiVisibleSharedState,
  _rng: () => number,
): DrawSource {
  const sources = enumerateAiDrawSources(shared);
  if (sources.length === 1) return sources[0];

  // If there's no discard card, must draw from stock
  if (!shared.discardTop) return 'stock';

  // If stock is empty, must draw from discard
  if (!shared.stockHasCards) return 'discard';

  // Evaluate: what's the best score we can achieve with the discard card?
  const discardCard = shared.discardTop;
  const currentScore = scoreAiVisibleGrid(playerState.grid);
  const legalMoves = enumerateAiLegalMoves(playerState.grid);

  let bestDiscardScore = Infinity;
  for (const move of legalMoves) {
    const score = simulateAiMoveScore(
      playerState.grid,
      discardCard,
      move,
    );
    if (score < bestDiscardScore) {
      bestDiscardScore = score;
    }
  }

  // If the discard card would improve our score, prefer it
  const discardImprovement = currentScore - bestDiscardScore;

  if (discardImprovement > 0) {
    // Discard card helps — take it
    return 'discard';
  }

  // Discard card doesn't help — draw from stock (unknown, might be better)
  return 'stock';
}

/**
 * Phase 2: Given a drawn card (now known), choose the best move.
 *
 * Evaluates every legal move using fair AI-visible scoring:
 * - Swaps replace the target slot with the known drawn card.
 * - Discard-and-flip discards the drawn card and flips a face-down
 *   card (whose value is unknown, estimated as the average).
 *
 * Picks the move that minimizes the resulting score. Ties are broken
 * randomly.
 */
export function chooseMoveForCard(
  grid: AiVisibleGrid,
  drawnCard: Card,
  rng: () => number,
): GolfMove {
  const legalMoves = enumerateAiLegalMoves(grid);
  if (legalMoves.length === 0) {
    throw new Error('No legal moves available');
  }

  // Score each legal move
  const scored = legalMoves.map((move) => ({
    move,
    score: simulateAiMoveScore(grid, drawnCard, move),
  }));

  // Pick the best (lowest score), breaking ties randomly
  const best = pickBest(scored, (c) => -c.score, rng);
  return best.move;
}

// ── AiPlayer ────────────────────────────────────────────────

/**
 * An AI player that wraps a strategy and RNG for convenient use.
 *
 * Extends the shared {@link AiPlayerBase} to inherit strategy
 * binding and the `strategyName` getter.
 */
export class AiPlayer extends AiPlayerBase<AiStrategy> {
  /**
   * Choose an action for the current game state.
   *
   * Accepts AI-visible state projections only — cannot access
   * hidden game data.
   */
  chooseAction(
    playerState: AiVisiblePlayerState,
    shared: AiVisibleSharedState,
  ): GolfAction {
    return this.strategy.chooseAction(playerState, shared, this.rng);
  }

  /**
   * Phase 1: Choose whether to draw from stock or discard.
   * Used by the scene for two-phase AI turn flow.
   */
  chooseDrawSource(
    playerState: AiVisiblePlayerState,
    shared: AiVisibleSharedState,
  ): DrawSource {
    return chooseDrawSource(playerState, shared, this.rng);
  }

  /**
   * Phase 2: Given a drawn card, choose the best move.
   * Used by the scene after the actual draw for stock draws.
   */
  chooseMoveForCard(grid: AiVisibleGrid, drawnCard: Card): GolfMove {
    return chooseMoveForCard(grid, drawnCard, this.rng);
  }
}
