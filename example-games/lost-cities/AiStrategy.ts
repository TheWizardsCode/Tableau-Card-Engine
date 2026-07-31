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
import {
  AiPlayer as AiPlayerBase,
  pickRandom,
  CardMemoryTracker,
} from '../../src/ai';

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
 * Count numbered cards of a specific color in the AI's hand.
 * Investment cards are excluded since they don't contribute to score value.
 */
function countNumberedCardsInHandOfColor(
  hand: LostCitiesCard[],
  color: ExpeditionColor,
): number {
  return hand.filter(
    c => c.color === color && c.type === 'numbered',
  ).length;
}

/**
 * Check if there is a lower-value numbered card of the same color
 * in hand that could legally be played to the expedition before
 * the given action card. If so, playing the higher card first would
 * waste the lower card.
 */
function hasLowerNumberedCardInHand(
  hand: LostCitiesCard[],
  color: ExpeditionColor,
  actionCard: LostCitiesCard,
  expedition: LostCitiesCard[],
): boolean {
  if (actionCard.type !== 'numbered') return false;

  const actionValue = cardValue(actionCard);
  const lastCard = expedition.length > 0 ? expedition[expedition.length - 1] : null;

  for (const card of hand) {
    if (card.id === actionCard.id) continue;
    if (card.color !== color) continue;
    if (card.type !== 'numbered') continue;

    const cardValue_ = cardValue(card);

    // Skip if this lower card can't legally be played after the last card
    // (it's already lower than or equal to the last card in the expedition)
    if (lastCard && lastCard.type === 'numbered' && cardValue_ <= cardValue(lastCard)) continue;

    // Found a lower card of the same color that could be played first
    if (cardValue_ < actionValue) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Probabilistic positive-score evaluation
// ---------------------------------------------------------------------------

/**
 * Cards of a single color in a Lost Cities deck (3 investments + 9 numbered).
 */
const CARDS_PER_COLOR = 12;

/**
 * Estimate the probability that placing a card in a tableau column will
 * lead to a positive final score for that column.
 *
 * Uses a heuristic based on:
 *  - Cards still remaining in the draw pile of this color
 *  - Visible cards on both players' expeditions
 *  - How many cards can legally follow the proposed card in ascending order
 *  - The current deficit (how many points needed to reach positive after -20 base cost)
 *
 * @returns A value in [0, 1] representing the estimated probability.
 *   Returns 1.0 if the column is already positive with the proposed card.
 *   Returns 0.0 if no follow-up cards are available to make it positive.
 */
export function estimatePositiveScoreProbability(
  _color: ExpeditionColor,
  currentExpedition: LostCitiesCard[],
  proposedCard: LostCitiesCard,
  handCardsOfColor: LostCitiesCard[],
  opponentCardsOfColor: LostCitiesCard[],
  drawPileSize: number,
): number {
  // Total visible cards of this color (the proposed card counts as placed)
  const visibleCards =
    currentExpedition.length +
    handCardsOfColor.length +
    opponentCardsOfColor.length +
    1; // the proposed card itself
  const remainingInDeck = Math.max(0, CARDS_PER_COLOR - visibleCards);

  // No more cards of this color are available
  if (remainingInDeck === 0) {
    const totalValue = [...currentExpedition, proposedCard].reduce(
      (s, c) => s + cardValue(c),
      0,
    );
    const invCount = [...currentExpedition, proposedCard].filter(
      c => c.type === 'investment',
    ).length;
    const finalScore = (totalValue - 20) * (1 + invCount);
    return finalScore > 0 ? 1.0 : 0.0;
  }

  // Value sum after placing the proposed card
  const newValueSum = [...currentExpedition, proposedCard].reduce(
    (s, c) => s + cardValue(c),
    0,
  );

  // Already positive (value > 20 covers the -20 base cost)
  if (newValueSum > 20) return 1.0;

  // For investment cards (no direct value contribution)
  if (proposedCard.type === 'investment') {
    // Investment is valuable only if we have or can get enough numbered cards
    // With investments, remaining numbered cards matter more
    const numberedInExpedition = currentExpedition.filter(c => c.type === 'numbered').length;
    const numberedInHand = handCardsOfColor.filter(c => c.type === 'numbered').length;
    const totalNumberedNow = numberedInExpedition + numberedInHand;

    // Rough estimate: investments are worthwhile if we have 3+ numbered cards
    if (totalNumberedNow >= 3) return 0.7;
    // With enough remaining cards, we might draw more
    if (remainingInDeck >= 3) return 0.3;
    return 0.1;
  }

  // For numbered cards: evaluate follow-up potential
  const proposedRank = proposedCard.rank;

  // Collect all visible numbered ranks of this color
  const visibleRanks = new Set<number>();
  for (const c of currentExpedition) {
    if (c.type === 'numbered') visibleRanks.add(c.rank);
  }
  for (const c of handCardsOfColor) {
    if (c.type === 'numbered') visibleRanks.add(c.rank);
  }
  for (const c of opponentCardsOfColor) {
    if (c.type === 'numbered') visibleRanks.add(c.rank);
  }
  visibleRanks.add(proposedRank);

  // Count remaining unseen higher ranks that can legally follow
  const availableFollowUps: number[] = [];
  for (let r = proposedRank + 1; r <= 10; r++) {
    if (!visibleRanks.has(r)) {
      availableFollowUps.push(r);
    }
  }

  // No follow-up cards possible
  if (availableFollowUps.length === 0) return 0.0;

  // Total potential value from follow-up cards
  const followUpValue = availableFollowUps.reduce((s, r) => s + r, 0);

  // Deficit: how many more points we need after the -20 base cost
  const deficit = 20 - newValueSum;

  // Even if we draw every remaining follow-up card, can we reach positive?
  if (followUpValue < deficit) return 0.0;

  // ---- Compute probability factors ----

  // Coverage: what fraction of the deficit can follow-ups potentially cover?
  const coverageRatio = Math.min(1, followUpValue / Math.max(1, deficit));

  // Concentration: what fraction of the remaining unseen numbered cards
  // of this color are usable follow-ups?
  const totalNumberedRanks = 9;
  const visibleNumberedCount = visibleRanks.size;
  const remainingNumberedCount = totalNumberedRanks - visibleNumberedCount;
  const concentrationFactor =
    remainingNumberedCount > 0
      ? availableFollowUps.length / remainingNumberedCount
      : 0;

  // Draw pile factor: more cards left = more chances to draw what we need
  const drawFactor = Math.min(1, drawPileSize / 44); // 44 = initial draw pile

  // Probability = weighted combination of factors
  return coverageRatio * (0.3 + 0.4 * concentrationFactor + 0.3 * drawFactor);
}

/**
 * Get cards of a specific color from a collection, excluding a specific card.
 */
function cardsOfColor(
  cards: LostCitiesCard[],
  color: ExpeditionColor,
  excludeId?: number,
): LostCitiesCard[] {
  return cards.filter(c => c.color === color && c.id !== excludeId);
}

/**
 * Calculate the blocking value of playing a numbered card that fills a gap
 * in the opponent's expedition. Returns a score bonus (0 if no gap is filled).
 *
 * A gap exists when the opponent has two numbered cards with a rank gap
 * that this card would fill (e.g., opponent has [4, 6], playing 5 fills the gap
 * and prevents them from continuing their expedition chain).
 */
function scoreBlockingPlay(
  card: LostCitiesCard,
  opponentExpedition: LostCitiesCard[],
): number {
  if (card.type !== 'numbered') return 0;

  const cardRank = card.rank;
  const oppNumbered = opponentExpedition
    .filter(c => c.type === 'numbered')
    .map(c => cardValue(c))
    .sort((a, b) => a - b);

  if (oppNumbered.length < 2) return 0;

  // Check if this card fills a gap between two consecutive opponent cards
  for (let i = 0; i < oppNumbered.length - 1; i++) {
    if (cardRank > oppNumbered[i] && cardRank < oppNumbered[i + 1]) {
      // This card fills a gap! The larger the gap, the more valuable the block
      const gapSize = oppNumbered[i + 1] - oppNumbered[i];
      return gapSize * 15;
    }
  }

  return 0;
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
          // Starting a new expedition: only invest if we have enough cards of this color
      if (action.card.type === 'investment') {
        // Count numbered cards of this color in hand + already in expedition
        const numberedInHand = countNumberedCardsInHandOfColor(state.hand, action.color);
        const totalColorCards = numberedInHand + laneSize;
        if (totalColorCards >= 3) {
          score += 20; // Investment is reasonable with enough support
        } else if (totalColorCards >= 1) {
          score -= 30; // Mild penalty — some support but not much
        } else {
          score -= 80; // Penalize investment without any numbered cards
        }
      } else {
        // Starting with a low number is safer
        score += 10 + (10 - cardValue(action.card));
      }
    }

    // Prefer playing high-value cards to expeditions we're committed to
    if (laneSize >= 2) {
      score += cardValue(action.card);
    }

    // When starting a new expedition, prefer colors with more cards in hand
    if (laneSize === 0 && action.card.type !== 'investment') {
      const numberedInHand = countNumberedCardsInHandOfColor(state.hand, action.color);
      score += numberedInHand * 5;
    }

    // ---- Optimal Investment Timing (Improvement 2) ----
    // Investments are most valuable when played early in a column.
    // Prefer playing investments before numbered cards in the same color.
    if (action.card.type === 'investment') {
      const numberedInExpedition = (lane ?? []).filter(c => c.type === 'numbered').length;
      const numberedInHand = countNumberedCardsInHandOfColor(state.hand, action.color);

      if (numberedInExpedition < 3) {
        // Early in the column — investment is valuable
        if (numberedInHand >= 1) {
          score += 35; // Good investment timing: numbered cards ready to follow
        }
      } else if (numberedInExpedition >= 4) {
        // Very late in the column — investment adds little value
        const currentValueSum = (lane ?? []).reduce((s, c) => s + cardValue(c), 0);
        if (currentValueSum <= 30) {
          score -= 80; // Strong penalty for late investment
        }
      } else {
        // Moderately late (3 numbered cards)
        const currentValueSum = (lane ?? []).reduce((s, c) => s + cardValue(c), 0);
        if (currentValueSum <= 25) {
          score -= 40; // Mild penalty for moderately late investment
        }
      }
    } else if (action.card.type === 'numbered') {
      // Penalty for playing a numbered card when an investment is available
      // in hand for the same color and could be played first
      const canPlayInvestmentFirst = !lane || lane.length === 0 ||
        lane.every(c => c.type === 'investment');
      if (canPlayInvestmentFirst &&
        state.hand.some(c => c.color === action.color && c.type === 'investment')) {
        score -= 40; // Prefer playing investment first to maximize multiplier
      }
    }

    // Penalize playing a higher card when a lower one of the same color
    // exists in hand (would waste the lower card since it must be played
    // in ascending order)
    if (hasLowerNumberedCardInHand(
      state.hand, action.color, action.card, lane ?? [],
    )) {
      score -= 80;
    }

    // ---- Probabilistic positive-score evaluation ----
    // Evaluate the probability that this column will reach a positive score.
    // Penalize plays with low probability; reward plays with high probability.
    const handOfColor = cardsOfColor(state.hand, action.color, action.card.id);
    const opponentOfColor = cardsOfColor(
      Array.from(state.opponentExpeditions.get(action.color) ?? []),
      action.color,
    );
    const prob = estimatePositiveScoreProbability(
      action.color,
      lane ?? [],
      action.card,
      handOfColor,
      opponentOfColor,
      state.drawPileSize,
    );

    // Apply probability-based adjustment
    // The modifier fine-tunes the score without overwhelming the existing
    // preference structure (extending existing expeditions, card ordering).
    if (prob >= 0.8) {
      score += 20; // High confidence — bonus
    } else if (prob >= 0.5) {
      score += 10; // Moderate confidence — slight bonus
    } else if (prob >= 0.2) {
      score -= 15; // Low confidence — penalty
    } else {
      score -= 60; // Very low confidence — strong penalty
    }

    // ---- Endgame / Deck-Count Awareness (Improvement 4) ----
    // When the draw pile is almost empty, adjust strategy.
    const isEndgame = state.drawPileSize < 10;
    if (isEndgame) {
      // In endgame, avoid starting new expeditions unless we have
      // enough cards of that color already
      if (laneSize === 0 && action.card.type !== 'investment') {
        const numberedInHand = countNumberedCardsInHandOfColor(state.hand, action.color);
        if (numberedInHand < 2) {
          score -= 40; // Strong penalty for starting without enough cards
        }
      }

      // Reduce severity of probability penalty — in endgame,
      // remaining cards are limited and predictable
      if (prob < 0.2) {
        score += 30; // Mitigate the -60 strong penalty
      } else if (prob < 0.5) {
        score += 10; // Mitigate the -15 low confidence penalty
      }

      // Increase penalty for discarding cards the opponent wants
      // (handled in discard section below via opponentInterest)
    }

    // ---- Score-Aware Multi-Column Strategy (Improvement 5) ----
    // Consider the overall score picture, not just individual columns.
    let otherHasPositiveColumn = false;
    for (const [colColor, colLane] of state.myExpeditions) {
      if (colColor === action.color) continue;
      if (colLane.length > 0) {
        const colValueSum = colLane.reduce((s, c) => s + cardValue(c), 0);
        if (colValueSum > 20) {
          otherHasPositiveColumn = true;
          break;
        }
      }
    }

    if (laneSize === 0) {
      // Starting a new expedition
      if (otherHasPositiveColumn) {
        score += 20; // One column already positive — worth trying for round bonus
      } else {
        score -= 15; // No positive columns — focus on existing ones
      }
    }

    // ---- Opponent Card Denial / Block Play (Improvement 1) ----
    // Bonus for playing a numbered card the opponent could use to continue
    // their expedition — denies the card to the opponent.
    // Only applies when already committed to the expedition (laneSize > 0)
    // to avoid over-prioritizing blocking over column viability.
    if (action.card.type === 'numbered' && laneSize > 0) {
      const oppLane = state.opponentExpeditions.get(action.color);
      if (oppLane && oppLane.length > 0) {
        const oppNumbered = oppLane.filter(c => c.type === 'numbered');
        if (oppNumbered.length > 0) {
          const oppHighest = Math.max(...oppNumbered.map(c => cardValue(c)));
          if (cardValue(action.card) > oppHighest) {
            // This card could extend opponent's expedition — deny them!
            const interest = opponentInterest(action.color, state, drawHistory);
            score += interest * 20; // Denial bonus proportional to opponent interest
          }
        }
      }
    }

    // ---- Opponent Expedition Blocking (Improvement 3) ----
    // Bonus for playing a card that fills a gap in the opponent's expedition.
    if (action.card.type === 'numbered') {
      const oppLane = state.opponentExpeditions.get(action.color);
      if (oppLane && oppLane.length >= 2) {
        const blockingScore = scoreBlockingPlay(action.card, oppLane);
        score += blockingScore;
      }
    }

    return score;
  }

  // Discard action
  let score = 0;

  // Strong penalty for discarding a card the opponent wants
  const interest = opponentInterest(action.color, state, drawHistory);
  score -= interest * 150;

  // In endgame, increase the penalty for discarding opponent-wanted cards
  if (state.drawPileSize < 10) {
    score -= interest * 50; // Extra penalty — fewer cards left to draw
  }

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
// AI Player class — wraps a strategy + maintains draw history + card memory
// ---------------------------------------------------------------------------

/**
 * Default memory configuration for the Lost Cities AI.
 *
 * The deck has 5 expedition colors × 12 cards per color = 60 cards.
 * The tracker groups observations by expedition color, so the maximum
 * number of copies of any single key is 12.
 */
const LOST_CITIES_MEMORY_CONFIG = { skill: 80, maxCopies: 12 };

export class LostCitiesAiPlayer extends AiPlayerBase<LostCitiesAiStrategy> {
  private drawHistory: OpponentDrawHistory;

  /**
   * Probabilistic recall of cards the AI has seen discarded (both its
   * own discards and the opponent's). Grouped by expedition color.
   */
  readonly memoryTracker: CardMemoryTracker;

  constructor(
    strategy: LostCitiesAiStrategy = GreedyStrategy,
    rng: () => number = Math.random,
  ) {
    super(strategy, rng);
    this.drawHistory = createOpponentDrawHistory();
    this.memoryTracker = new CardMemoryTracker(LOST_CITIES_MEMORY_CONFIG);
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

  /**
   * Record a card the AI has observed being discarded — either its own
   * discard or the opponent's (both are fully visible on the table).
   *
   * The card is grouped by its expedition color in the memory tracker,
   * so the AI can probabilistically recall how many cards of each color
   * have cycled through the discard piles.
   *
   * @param card - The discarded card to remember.
   */
  recordDiscard(card: LostCitiesCard): void {
    this.memoryTracker.recordKey(card.color);
  }

  /** Reset draw history (call at start of each round). */
  resetRoundHistory(): void {
    this.drawHistory = createOpponentDrawHistory();
  }
}
