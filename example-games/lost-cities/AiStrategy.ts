/**
 * AiStrategy.ts
 *
 * AI opponent strategies for Lost Cities.
 * All strategies operate on pure game state — no Phaser dependency.
 *
 * Two strategies are provided:
 *  - RandomStrategy: picks any legal action uniformly at random
 *  - GreedyStrategy: prefers extending committed expeditions, avoids
 *    discarding cards the opponent has been collecting (inferred from
 *    visible expedition lanes and discard-pile draw history)
 *
 * Uses shared AI module (`@ai`) for base types and utility functions.
 */

import type {
  LostCitiesCard,
  ExpeditionColor,
} from './LostCitiesCards';
import {
  EXPEDITION_COLORS,
  cardValue,
  cardSortKey,
} from './LostCitiesCards';
import type { VisibleState } from './LostCitiesGame';
import type {
  Phase1Action,
  Phase2Action,
} from './LostCitiesRules';
import {
  getLegalPhase1Actions,
  getLegalPhase2Actions,
} from './LostCitiesRules';
import type { AiStrategyBase } from '../../src/ai';
import { AiPlayer as AiPlayerBase, pickRandom } from '../../src/ai';

// ---------------------------------------------------------------------------
// Strategy interface
// ---------------------------------------------------------------------------

export interface LostCitiesAiStrategy extends AiStrategyBase {

  /**
   * Choose a Phase 1 action (play-to-expedition or discard).
   * Called when turnPhase is 'PlayOrDiscard'.
   */
  choosePhase1(
    state: VisibleState,
    rng: () => number,
  ): Phase1Action;

  /**
   * Choose a Phase 2 action (draw-from-pile or draw-from-discard).
   * Called when turnPhase is 'Draw'.
   */
  choosePhase2(
    state: VisibleState,
    rng: () => number,
  ): Phase2Action;
}

// ---------------------------------------------------------------------------
// Helpers shared across strategies
// ---------------------------------------------------------------------------

/** Build a RulesGameView for the AI player from VisibleState. */
function buildAiView(state: VisibleState) {
  return {
    playerExpeditions: state.myExpeditions,
    discardPiles: buildDiscardPilesFromTops(state.discardTops),
    drawPileSize: state.drawPileSize,
    justDiscardedColor: state.justDiscardedColor,
  };
}

/**
 * Reconstruct minimal discard piles from tops (only top card matters
 * for legal-action enumeration — pile.length > 0 is all we need).
 */
function buildDiscardPilesFromTops(
  tops: Map<ExpeditionColor, LostCitiesCard | null>,
): Map<ExpeditionColor, LostCitiesCard[]> {
  const piles = new Map<ExpeditionColor, LostCitiesCard[]>();
  for (const color of EXPEDITION_COLORS) {
    const top = tops.get(color) ?? null;
    piles.set(color, top ? [top] : []);
  }
  return piles;
}

/** Get legal Phase 1 actions from a visible state. */
function legalPhase1(state: VisibleState): Phase1Action[] {
  const view = buildAiView(state);
  return getLegalPhase1Actions(state.hand, view);
}

/** Get legal Phase 2 actions from a visible state. */
function legalPhase2(state: VisibleState): Phase2Action[] {
  const view = buildAiView(state);
  return getLegalPhase2Actions(view);
}

// ---------------------------------------------------------------------------
// Random strategy — picks any legal action at random
// ---------------------------------------------------------------------------

export const RandomStrategy: LostCitiesAiStrategy = {
  name: 'Random',

  choosePhase1(state, rng) {
    const actions = legalPhase1(state);
    if (actions.length === 0) {
      throw new Error('No legal Phase 1 actions available');
    }
    return pickRandom(actions, rng);
  },

  choosePhase2(state, rng) {
    const actions = legalPhase2(state);
    if (actions.length === 0) {
      throw new Error('No legal Phase 2 actions available');
    }
    return pickRandom(actions, rng);
  },
};

// ---------------------------------------------------------------------------
// Greedy strategy — expedition-preferring, discard-aware
// ---------------------------------------------------------------------------

/**
 * Track which colors the opponent has drawn from discard piles.
 * This is external mutable state maintained by GreedyAiPlayer.
 */
export type OpponentDrawHistory = Map<ExpeditionColor, number>;

export function createOpponentDrawHistory(): OpponentDrawHistory {
  return new Map(EXPEDITION_COLORS.map(c => [c, 0]));
}

/**
 * Estimate how interested the opponent is in a given color.
 * Uses both visible expedition lanes and discard draw history.
 *
 * Returns a score in [0, 1] range (0 = no interest, 1 = high interest).
 */
function opponentInterest(
  color: ExpeditionColor,
  state: VisibleState,
  drawHistory: OpponentDrawHistory,
): number {
  const oppLane = state.opponentExpeditions.get(color);
  const laneCards = oppLane ? oppLane.length : 0;
  const draws = drawHistory.get(color) ?? 0;

  // Lane weight: each card in the expedition means they're committed
  const laneScore = Math.min(laneCards * 0.2, 0.6);

  // Draw history: they actively sought cards of this color
  const drawScore = Math.min(draws * 0.15, 0.4);

  return Math.min(laneScore + drawScore, 1.0);
}

/**
 * Score a Phase 1 action for the greedy strategy.
 * Higher score = more preferred.
 */
function scorePhase1Action(
  action: Phase1Action,
  state: VisibleState,
  drawHistory: OpponentDrawHistory,
): number {
  if (action.kind === 'play-to-expedition') {
    const lane = state.myExpeditions.get(action.color);
    const laneSize = lane ? lane.length : 0;

    // Base: playing is generally good
    let score = 100;

    // Extending an existing expedition is better than starting a new one
    if (laneSize > 0) {
      score += 50 + laneSize * 10;
    } else {
      // Starting a new expedition: investments are cheaper, but risky
      if (action.card.type === 'investment') {
        score += 20; // Investment early is okay
      } else {
        // Starting with a low number is safer
        score += 10 + (10 - cardValue(action.card));
      }
    }

    // Prefer playing high-value cards to expeditions we're committed to
    if (laneSize >= 2) {
      score += cardValue(action.card);
    }

    return score;
  }

  // Discard action
  let score = 0;

  // Strong penalty for discarding a card the opponent wants
  const interest = opponentInterest(action.color, state, drawHistory);
  score -= interest * 150;

  // Penalty for discarding high-value cards (wasted potential)
  score -= cardValue(action.card) * 2;

  // Slight preference to discard from colors we haven't started
  const ourLane = state.myExpeditions.get(action.color);
  if (ourLane && ourLane.length > 0) {
    score -= 30; // Don't discard cards of colors we've invested in
  }

  return score;
}

/**
 * Score a Phase 2 action for the greedy strategy.
 * Higher score = more preferred.
 *
 * IMPORTANT: The draw-from-pile action must remain competitive. If
 * the greedy AI always draws from discard, the draw pile never
 * empties and the round cannot end — causing an infinite loop.
 * Only strongly prefer discard draws when the card is *playable*
 * on an expedition we've committed to.
 */
function scorePhase2Action(
  action: Phase2Action,
  state: VisibleState,
): number {
  if (action.kind === 'draw-from-pile') {
    // Draw pile: unknown card, safe default
    return 20;
  }

  // Drawing from a discard pile: evaluate the known card
  const top = state.discardTops.get(action.color);
  if (!top) return 0; // shouldn't happen if action is legal

  const ourLane = state.myExpeditions.get(action.color);
  const laneSize = ourLane ? ourLane.length : 0;

  // Only prefer discard draw if the card is actually playable
  if (laneSize > 0 && ourLane && ourLane.length > 0) {
    const lastCard = ourLane[ourLane.length - 1];
    if (cardSortKey(top) > cardSortKey(lastCard)) {
      // Card is playable on our committed expedition — strong preference
      return 50 + cardValue(top) * 2;
    }
    // We're committed to this color but can't play the card — marginal value
    return 10;
  }

  // Color not started: investments are decent starters, otherwise weak
  if (top.type === 'investment') {
    return 18;
  }
  // Low-value numbered card for a new expedition — only slightly useful
  return 5 + Math.max(0, 6 - cardValue(top));
}

export const GreedyStrategy: LostCitiesAiStrategy = {
  name: 'Greedy',

  choosePhase1(state, _rng) {
    // Note: GreedyAiPlayer wraps this and passes drawHistory;
    // standalone usage uses empty history.
    return greedyChoosePhase1(state, createOpponentDrawHistory());
  },

  choosePhase2(state, _rng) {
    return greedyChoosePhase2(state);
  },
};

/** Greedy Phase 1 with explicit draw history. */
function greedyChoosePhase1(
  state: VisibleState,
  drawHistory: OpponentDrawHistory,
): Phase1Action {
  const actions = legalPhase1(state);
  if (actions.length === 0) {
    throw new Error('No legal Phase 1 actions available');
  }

  // Score and sort descending
  const scored = actions.map(a => ({
    action: a,
    score: scorePhase1Action(a, state, drawHistory),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].action;
}

/** Greedy Phase 2 selection. */
function greedyChoosePhase2(state: VisibleState): Phase2Action {
  const actions = legalPhase2(state);
  if (actions.length === 0) {
    throw new Error('No legal Phase 2 actions available');
  }

  const scored = actions.map(a => ({
    action: a,
    score: scorePhase2Action(a, state),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].action;
}

// ---------------------------------------------------------------------------
// AI Player class — wraps a strategy + maintains draw history
// ---------------------------------------------------------------------------

export class LostCitiesAiPlayer extends AiPlayerBase<LostCitiesAiStrategy> {
  private drawHistory: OpponentDrawHistory;

  constructor(
    strategy: LostCitiesAiStrategy = GreedyStrategy,
    rng: () => number = Math.random,
  ) {
    super(strategy, rng);
    this.drawHistory = createOpponentDrawHistory();
  }

  /** Choose a Phase 1 action. */
  choosePhase1(state: VisibleState): Phase1Action {
    if (this.strategy === GreedyStrategy) {
      return greedyChoosePhase1(state, this.drawHistory);
    }
    return this.strategy.choosePhase1(state, this.rng);
  }

  /** Choose a Phase 2 action. */
  choosePhase2(state: VisibleState): Phase2Action {
    if (this.strategy === GreedyStrategy) {
      return greedyChoosePhase2(state);
    }
    return this.strategy.choosePhase2(state, this.rng);
  }

  /**
   * Notify the AI that the opponent drew from a discard pile.
   * This allows the greedy strategy to infer opponent interest.
   */
  recordOpponentDiscardDraw(color: ExpeditionColor): void {
    const current = this.drawHistory.get(color) ?? 0;
    this.drawHistory.set(color, current + 1);
  }

  /** Reset draw history (call at start of each round). */
  resetRoundHistory(): void {
    this.drawHistory = createOpponentDrawHistory();
  }
}
