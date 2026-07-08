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
import { scoreAiVisibleGrid, simulateAiMoveScore, cardPointValue } from './GolfScoring';
import type {
  AiVisiblePlayerState,
  AiVisibleSharedState,
  AiVisibleGrid,
  GolfAction,
} from './GolfGame';
import { enumerateAiLegalMoves, enumerateAiDrawSources } from './GolfGame';
import { GRID_ROWS, GRID_COLS } from './GolfGrid';
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
      // Compute visible rank counts for column-feasibility weighting
      const visibleRanks = countVisibleRanks(playerState, shared);
      // We know the discard card — evaluate moves with it
      const move = chooseMoveForCard(
        playerState.grid,
        shared.discardTop,
        rng,
        visibleRanks,
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
  config: GreedyStrategyConfig = DEFAULT_GREEDY_CONFIG,
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

  // Even if discard doesn't immediately improve the score, check if it
  // helps build a column match and unknown copies of that rank remain.
  const visibleRanks = countVisibleRanks(playerState, shared);

  // Check if any legal swap move with the discard card would build toward
  // a column match (2 matching cards in column) with feasible potential
  for (const move of legalMoves) {
    const bonus = computeColumnBonus(
      playerState.grid,
      discardCard,
      move,
      visibleRanks,
      config,
    );
    if (bonus < 0) {
      // Discard card helps build a column with feasible potential
      return 'discard';
    }
  }

  // Discard card doesn't help — draw from stock (unknown, might be better)
  return 'stock';
}

// ── Configurable column-awareness heuristic ──────────────────

/**
 * Configuration for the column-awareness heuristic in GreedyStrategy.
 *
 * `columnWeight` controls the balance between immediate score improvement
 * and column-completion potential:
 *   - 0: Ignore column building entirely (score-only evaluation).
 *   - 0.5: Equal weight to score and column completion (default, 50/50 balance).
 *   - 1: Maximum column-building priority.
 */
export interface GreedyStrategyConfig {
  /**
   * Weight of column-completion heuristic vs raw score.
   * 0 = ignore columns, 0.5 = 50/50 balance, 1 = max columns.
   * @default 0.5
   */
  columnWeight: number;
}

/**
 * Default configuration for GreedyStrategy.
 * Starts at a 50/50 balance between immediate score and column completion.
 */
export const DEFAULT_GREEDY_CONFIG: GreedyStrategyConfig = {
  columnWeight: 0.5,
};

/**
 * Maximum copies of any rank in a standard 52-card deck.
 */
const MAX_RANK_COPIES = 4;

/**
 * Count how many instances of each card rank are visible to the AI.
 *
 * Visible cards include:
 * - Face-up cards in the AI's own grid
 * - The discard pile top card (visible to all players)
 *
 * Face-down cards are NOT counted (the AI doesn't know their ranks).
 *
 * The counts are used by the GreedyStrategy to determine whether
 * pursuing a column match is feasible: if all 4 copies of a rank
 * are already visible, no more unknown copies remain, so trying
 * to complete a column of that rank is futile.
 *
 * Information boundary: uses only AI-visible state projections.
 *
 * @param playerState  AI-visible per-player state
 * @param shared       AI-visible shared state (discard top, stock flag)
 * @returns            Record mapping rank strings to their visible count
 */
export function countVisibleRanks(
  playerState: AiVisiblePlayerState,
  shared: AiVisibleSharedState,
): Record<string, number> {
  const counts: Record<string, number> = {};

  // Count face-up cards in the AI's own grid
  for (const slot of playerState.grid) {
    if (slot.faceUp && 'rank' in slot) {
      const rank = (slot as Card).rank;
      counts[rank] = (counts[rank] || 0) + 1;
    }
  }

  // Count the discard top card (visible to all players)
  if (shared.discardTop && 'rank' in shared.discardTop) {
    const rank = shared.discardTop.rank;
    counts[rank] = (counts[rank] || 0) + 1;
  }

  return counts;
}

/**
 * Compute a column-building bonus for a move.
 *
 * When a swap move would place the drawn card in a column where it
 * matches other face-up cards, the move builds toward a column match.
 * The bonus (negative, reducing the score) is proportional to:
 * - The sum of point values of matching face-up cards in the column
 *   (higher-value cards like Queens=10 benefit more from being zeroed).
 * - How many unknown copies of the target rank remain in play.
 * - The configurable columnWeight (default 0.5 = 50/50 balance).
 *
 * If all 4 copies of the rank are already visible, the bonus is 0
 * (pursuing the column is futile because no unknown copies remain
 * to complete the match).
 * If the matching cards have low or negative point values (e.g., Kings=0,
 * 2s=-2), the bonus is reduced or zero since zeroing that column saves
 * few or no points.
 *
 * Information boundary: uses only AI-visible state — counts only face-up
 * cards and the discard top.
 *
 * @param grid         AI-visible grid
 * @param drawnCard    The card the player drew
 * @param move         The move to evaluate
 * @param visibleRanks Count of visible instances per rank
 * @param config       Optional strategy config (default uses 50/50 balance)
 * @returns A negative score adjustment (better) or 0 if no bonus applies
 */
export function computeColumnBonus(
  grid: AiVisibleGrid,
  drawnCard: Card,
  move: GolfMove,
  visibleRanks: Record<string, number>,
  config: GreedyStrategyConfig = DEFAULT_GREEDY_CONFIG,
): number {
  // Only swap moves can contribute to column matches
  if (move.kind === 'discard-and-flip') return 0;

  const col = move.col;
  const idx = move.row * GRID_COLS + move.col;
  const matchingRank = drawnCard.rank;
  let matchingCount = 1; // The drawn card itself
  let unknownInColumn = 0;
  let cardValueSum = 0; // Sum of point values of matching face-up cards in column

  for (let row = 0; row < GRID_ROWS; row++) {
    const flatIdx = row * GRID_COLS + col;
    if (flatIdx === idx) continue;

    const slot = grid[flatIdx];
    if (
      slot.faceUp &&
      'rank' in slot &&
      (slot as Card).rank === matchingRank
    ) {
      matchingCount++;
      cardValueSum += cardPointValue((slot as Card).rank);
    }
    if (!slot.faceUp) {
      unknownInColumn++;
    }
  }

  // Add the drawn card's point value (it participates in the match)
  if (matchingCount >= 2) {
    cardValueSum += cardPointValue(drawnCard.rank);
  }

  // After the move, if we have 2+ matching and at least 1 unknown in column,
  // the move contributes to building a column match
  if (matchingCount >= 2 && unknownInColumn >= 1) {
    const visibleCount = visibleRanks[matchingRank] || 0;
    const unknownCopies = Math.max(0, MAX_RANK_COPIES - visibleCount);

    // Bonus is proportional to unknown copies remaining
    const feasibilityRatio = unknownCopies / MAX_RANK_COPIES;

    // Bonus scales with total card point value in the column:
    // - High-value cards (Q=10, J=10) → larger bonus (saving more points)
    // - Low-value cards (K=0) → no bonus (zeroing saves nothing)
    // - Negative-value cards (2=-2) → reduced or no bonus
    const weightedBonus = cardValueSum * feasibilityRatio * config.columnWeight;

    // Return a negative bonus (lower score = better) or 0 for +0
    // Math.min(0, -weightedBonus) ensures negative or zero, never positive
    const bonus = -Math.max(0, weightedBonus);
    return bonus || 0; // Avoid -0
  }

  return 0;
}

/**
 * Phase 2: Given a drawn card (now known), choose the best move.
 *
 * Evaluates every legal move using fair AI-visible scoring:
 * - Swaps replace the target slot with the known drawn card.
 * - Discard-and-flip discards the drawn card and flips a face-down
 *   card (whose value is unknown, estimated as the average).
 *
 * When {@link visibleRanks} data is provided, a column-building
 * feasibility bonus is applied: moves that build toward a column
 * match get a score bonus (lower score) proportional to remaining
 * unknown copies of the target rank. If all 4 copies are already
 * visible, no bonus is applied (pursuit is futile).
 *
 * Picks the move that minimizes the resulting score. Ties are broken
 * randomly.
 *
 * @param visibleRanks Optional. Count of visible instances per rank.
 *                     When provided, enables column-feasibility weighting.
 */
export function chooseMoveForCard(
  grid: AiVisibleGrid,
  drawnCard: Card,
  rng: () => number,
  visibleRanks?: Record<string, number>,
  config: GreedyStrategyConfig = DEFAULT_GREEDY_CONFIG,
): GolfMove {
  const legalMoves = enumerateAiLegalMoves(grid);
  if (legalMoves.length === 0) {
    throw new Error('No legal moves available');
  }

  // Score each legal move with optional column bonus
  const scored = legalMoves.map((move) => {
    let score = simulateAiMoveScore(grid, drawnCard, move);

    if (visibleRanks) {
      score += computeColumnBonus(grid, drawnCard, move, visibleRanks, config);
    }

    return { move, score };
  });

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
  private readonly config: GreedyStrategyConfig;

  constructor(
    strategy: AiStrategy,
    rng?: () => number,
    config: GreedyStrategyConfig = DEFAULT_GREEDY_CONFIG,
  ) {
    super(strategy, rng);
    this.config = config;
  }

  chooseAction(
    playerState: AiVisiblePlayerState,
    shared: AiVisibleSharedState,
  ): GolfAction {
    return this.strategy.chooseAction(playerState, shared, this.rng);
  }

  /**
   * Phase 1: Choose whether to draw from stock or discard.
   * Uses the configured column-weight heuristic.
   */
  chooseDrawSource(
    playerState: AiVisiblePlayerState,
    shared: AiVisibleSharedState,
  ): DrawSource {
    return chooseDrawSource(playerState, shared, this.rng, this.config);
  }

  /**
   * Phase 2: Given a drawn card, choose the best move.
   * Uses the configured column-weight heuristic.
   *
   * @param visibleRanks Optional. When provided, enables column-feasibility
   *                     weighting in move selection.
   */
  chooseMoveForCard(
    grid: AiVisibleGrid,
    drawnCard: Card,
    visibleRanks?: Record<string, number>,
  ): GolfMove {
    return chooseMoveForCard(grid, drawnCard, this.rng, visibleRanks, this.config);
  }
}
