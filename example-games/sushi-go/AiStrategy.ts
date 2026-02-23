/**
 * AI strategies for Sushi Go!
 *
 * Provides:
 *   - SushiGoAiStrategy interface
 *   - RandomStrategy: uniformly random legal card pick
 *   - GreedyStrategy: evaluates each card by expected point value
 *   - SushiGoAiPlayer: wrapper binding strategy and RNG
 *
 * Uses shared AI module (`@ai`) for base types and utility functions.
 */

import type { SushiGoCard } from './SushiGoCards';
import type { SushiGoPlayerState, PickAction } from './SushiGoGame';
import {
  scoreTableau,
} from './SushiGoScoring';
import type { AiStrategyBase } from '../../src/ai';
import { AiPlayer as AiPlayerBase, pickRandom } from '../../src/ai';

// ── Strategy interface ──────────────────────────────────────

export interface SushiGoAiStrategy extends AiStrategyBase {

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
 * Has a 50% chance to use chopsticks when available and hand has 2+ cards.
 */
export const RandomStrategy: SushiGoAiStrategy = {
  name: 'random',

  choosePick(
    hand: SushiGoCard[],
    tableau: SushiGoCard[],
    rng: () => number,
  ): PickAction {
    const cardIndex = Math.floor(rng() * hand.length);

    // 50% chance to use chopsticks when available and hand has 2+ cards
    const hasChopsticks = tableau.some((c) => c.type === 'chopsticks');
    if (hasChopsticks && hand.length >= 2 && rng() < 0.5) {
      let secondCardIndex = Math.floor(rng() * hand.length);
      // Ensure second card is different from first
      if (secondCardIndex === cardIndex) {
        secondCardIndex = (secondCardIndex + 1) % hand.length;
      }
      return { cardIndex, secondCardIndex };
    }

    return { cardIndex };
  },
};

// ── GreedyStrategy ──────────────────────────────────────────

/**
 * Evaluates each card in the hand by the marginal score increase
 * it would produce if added to the current tableau. Picks the
 * card with the highest marginal value.
 *
 * When chopsticks are available in the tableau, also evaluates all
 * pairs of cards. If the best pair yields a higher marginal score
 * than the best single card, uses chopsticks to pick both.
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

    // Evaluate single-card picks
    interface SingleCandidate {
      index: number;
      marginalScore: number;
    }

    const singleCandidates: SingleCandidate[] = hand.map((card, index) => {
      const simTableau = [...tableau, card];
      const simScore = scoreTableau(simTableau);
      return { index, marginalScore: simScore - currentScore };
    });

    const maxSingleMarginal = Math.max(
      ...singleCandidates.map((c) => c.marginalScore),
    );
    const bestSingles = singleCandidates.filter(
      (c) => c.marginalScore === maxSingleMarginal,
    );

    // Check if chopsticks usage is possible
    const hasChopsticks = tableau.some((c) => c.type === 'chopsticks');

    if (hasChopsticks && hand.length >= 2) {
      // Build tableau without the first chopsticks card (it will be returned to hand)
      const chopIdx = tableau.findIndex((c) => c.type === 'chopsticks');
      const tableauWithoutChopsticks = [
        ...tableau.slice(0, chopIdx),
        ...tableau.slice(chopIdx + 1),
      ];
      const baseScoreWithoutChopsticks = scoreTableau(tableauWithoutChopsticks);

      // Evaluate all pairs
      interface PairCandidate {
        firstIndex: number;
        secondIndex: number;
        marginalScore: number;
      }

      const pairCandidates: PairCandidate[] = [];
      for (let i = 0; i < hand.length; i++) {
        for (let j = i + 1; j < hand.length; j++) {
          const simTableau = [...tableauWithoutChopsticks, hand[i], hand[j]];
          const simScore = scoreTableau(simTableau);
          pairCandidates.push({
            firstIndex: i,
            secondIndex: j,
            marginalScore: simScore - baseScoreWithoutChopsticks,
          });
        }
      }

      if (pairCandidates.length > 0) {
        const maxPairMarginal = Math.max(
          ...pairCandidates.map((c) => c.marginalScore),
        );

        // Use chopsticks if the best pair is strictly better than the best single
        if (maxPairMarginal > maxSingleMarginal) {
          const bestPairs = pairCandidates.filter(
            (c) => c.marginalScore === maxPairMarginal,
          );
          const chosenPair = pickRandom(bestPairs, rng);
          return {
            cardIndex: chosenPair.firstIndex,
            secondCardIndex: chosenPair.secondIndex,
          };
        }
      }
    }

    // Fall back to best single card
    const chosen = pickRandom(bestSingles, rng);
    return { cardIndex: chosen.index };
  },
};

// ── SushiGoAiPlayer ─────────────────────────────────────────

/**
 * Wrapper that binds a strategy and RNG for convenient use.
 *
 * Extends the shared {@link AiPlayerBase} to inherit strategy
 * binding and the `strategyName` getter.
 */
export class SushiGoAiPlayer extends AiPlayerBase<SushiGoAiStrategy> {
  constructor(
    strategy: SushiGoAiStrategy = GreedyStrategy,
    rng: () => number = Math.random,
  ) {
    super(strategy, rng);
  }

  /**
   * Choose a pick action for the given player state.
   */
  choosePick(player: SushiGoPlayerState): PickAction {
    return this.strategy.choosePick(player.hand, player.tableau, this.rng);
  }
}
