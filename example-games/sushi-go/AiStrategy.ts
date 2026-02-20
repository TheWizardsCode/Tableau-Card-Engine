/**
 * AI strategies for Sushi Go!
 *
 * Provides:
 *   - SushiGoAiStrategy interface
 *   - RandomStrategy: uniformly random legal card pick
 *   - GreedyStrategy: evaluates each card by expected point value
 *   - SushiGoAiPlayer: wrapper binding strategy and RNG
 */

import type { SushiGoCard } from './SushiGoCards';
import type { SushiGoPlayerState, PickAction } from './SushiGoGame';
import {
  scoreTableau,
} from './SushiGoScoring';

// ── Strategy interface ──────────────────────────────────────

export interface SushiGoAiStrategy {
  readonly name: string;

  /**
   * Choose which card to pick from the hand.
   *
   * @param hand     The current hand to pick from.
   * @param tableau  The AI's current tableau (cards collected this round).
   * @param rng      Random number generator.
   * @returns        A PickAction (card index, optional second for chopsticks).
   */
  choosePick(
    hand: SushiGoCard[],
    tableau: SushiGoCard[],
    rng: () => number,
  ): PickAction;
}

// ── RandomStrategy ──────────────────────────────────────────

/**
 * Picks a uniformly random card from the hand.
 * Never uses chopsticks (for simplicity).
 */
export const RandomStrategy: SushiGoAiStrategy = {
  name: 'random',

  choosePick(
    hand: SushiGoCard[],
    _tableau: SushiGoCard[],
    rng: () => number,
  ): PickAction {
    const cardIndex = Math.floor(rng() * hand.length);
    return { cardIndex };
  },
};

// ── GreedyStrategy ──────────────────────────────────────────

/**
 * Evaluates each card in the hand by the marginal score increase
 * it would produce if added to the current tableau. Picks the
 * card with the highest marginal value.
 *
 * This is a simple heuristic -- it doesn't account for future
 * drafting opportunities or opponent strategies.
 *
 * Ties are broken randomly.
 */
export const GreedyStrategy: SushiGoAiStrategy = {
  name: 'greedy',

  choosePick(
    hand: SushiGoCard[],
    tableau: SushiGoCard[],
    rng: () => number,
  ): PickAction {
    if (hand.length === 0) {
      throw new Error('Cannot pick from empty hand');
    }

    const currentScore = scoreTableau(tableau);

    interface Candidate {
      index: number;
      marginalScore: number;
    }

    const candidates: Candidate[] = hand.map((card, index) => {
      // Simulate adding this card to the tableau
      const simTableau = [...tableau, card];
      const simScore = scoreTableau(simTableau);
      return { index, marginalScore: simScore - currentScore };
    });

    // Find the max marginal score
    const maxMarginal = Math.max(...candidates.map((c) => c.marginalScore));
    const best = candidates.filter((c) => c.marginalScore === maxMarginal);

    // Break ties randomly
    const chosen = best[Math.floor(rng() * best.length)];
    return { cardIndex: chosen.index };
  },
};

// ── SushiGoAiPlayer ─────────────────────────────────────────

/**
 * Wrapper that binds a strategy and RNG for convenient use.
 */
export class SushiGoAiPlayer {
  readonly strategy: SushiGoAiStrategy;
  private readonly rng: () => number;

  constructor(
    strategy: SushiGoAiStrategy = GreedyStrategy,
    rng: () => number = Math.random,
  ) {
    this.strategy = strategy;
    this.rng = rng;
  }

  /**
   * Choose a pick action for the given player state.
   */
  choosePick(player: SushiGoPlayerState): PickAction {
    return this.strategy.choosePick(player.hand, player.tableau, this.rng);
  }
}
