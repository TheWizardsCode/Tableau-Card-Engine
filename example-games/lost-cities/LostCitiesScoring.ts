/**
 * Scoring logic for Lost Cities.
 *
 * Standard Lost Cities scoring rules:
 *   - An empty expedition (no cards played) scores 0 points.
 *   - A started expedition (1+ cards) begins with a base cost of -20.
 *   - Card values are summed: investment cards = 0, numbered cards = face value.
 *   - The base (cost + card values) is multiplied by (1 + number of investment cards):
 *     - 0 investments: x1 multiplier
 *     - 1 investment:  x2 multiplier
 *     - 2 investments: x3 multiplier
 *     - 3 investments: x4 multiplier
 *   - If an expedition has 8 or more cards, a +20 bonus is added AFTER the multiplier.
 *
 * All functions are pure with no game state dependency.
 */

import type { LostCitiesCard, ExpeditionColor } from './LostCitiesCards';
import { cardValue } from './LostCitiesCards';

/** The base cost applied to any started expedition. */
export const EXPEDITION_BASE_COST = -20;

/** Bonus points awarded for an expedition with 8+ cards. */
export const EXPEDITION_BONUS = 20;

/** Minimum number of cards in an expedition to earn the bonus. */
export const EXPEDITION_BONUS_THRESHOLD = 8;

/**
 * Score a single expedition lane.
 *
 * @param cards - The cards played in this expedition lane (may be empty).
 * @returns The score for this expedition.
 *
 * Scoring:
 *   - Empty expedition: 0
 *   - Started expedition: (EXPEDITION_BASE_COST + sum of card values) * (1 + investmentCount)
 *   - If 8+ cards: add EXPEDITION_BONUS after multiplier
 */
export function scoreExpedition(cards: LostCitiesCard[]): number {
  if (cards.length === 0) {
    return 0;
  }

  // Count investment cards and sum card values
  let investmentCount = 0;
  let valueSum = 0;

  for (const card of cards) {
    if (card.type === 'investment') {
      investmentCount++;
    }
    valueSum += cardValue(card);
  }

  // Multiplier: 1 + number of investment cards
  const multiplier = 1 + investmentCount;

  // Base score: (-20 + sum of card values) * multiplier
  let score = (EXPEDITION_BASE_COST + valueSum) * multiplier;

  // 8+ card bonus (added after multiplier)
  if (cards.length >= EXPEDITION_BONUS_THRESHOLD) {
    score += EXPEDITION_BONUS;
  }

  return score;
}

/**
 * Detailed scoring breakdown for a single expedition.
 * Useful for UI display of score components.
 */
export interface ExpeditionScoreBreakdown {
  /** The expedition color. */
  color: ExpeditionColor;
  /** Number of cards in the expedition. */
  cardCount: number;
  /** Number of investment cards. */
  investmentCount: number;
  /** Sum of numbered card values. */
  valueSum: number;
  /** The multiplier applied (1 + investmentCount). */
  multiplier: number;
  /** Whether the 8-card bonus was earned. */
  bonusEarned: boolean;
  /** The total score for this expedition. */
  score: number;
}

/**
 * Get a detailed scoring breakdown for an expedition.
 */
export function scoreExpeditionDetailed(
  color: ExpeditionColor,
  cards: LostCitiesCard[],
): ExpeditionScoreBreakdown {
  let investmentCount = 0;
  let valueSum = 0;

  for (const card of cards) {
    if (card.type === 'investment') {
      investmentCount++;
    }
    valueSum += cardValue(card);
  }

  const multiplier = cards.length > 0 ? 1 + investmentCount : 0;
  const bonusEarned = cards.length >= EXPEDITION_BONUS_THRESHOLD;
  const score = scoreExpedition(cards);

  return {
    color,
    cardCount: cards.length,
    investmentCount,
    valueSum,
    multiplier,
    bonusEarned,
    score,
  };
}

/**
 * Score all expeditions for a player in a single round.
 *
 * @param expeditions - A map from expedition color to the cards played in that lane.
 * @returns The total score for this round (sum of all expedition scores).
 */
export function scoreRound(
  expeditions: Map<ExpeditionColor, LostCitiesCard[]>,
): number {
  let total = 0;
  for (const cards of expeditions.values()) {
    total += scoreExpedition(cards);
  }
  return total;
}

/**
 * Get detailed score breakdowns for all expeditions in a round.
 *
 * @param expeditions - A map from expedition color to the cards played in that lane.
 * @returns An array of breakdowns and the round total.
 */
export function scoreRoundDetailed(
  expeditions: Map<ExpeditionColor, LostCitiesCard[]>,
): { breakdowns: ExpeditionScoreBreakdown[]; total: number } {
  const breakdowns: ExpeditionScoreBreakdown[] = [];
  let total = 0;

  for (const [color, cards] of expeditions) {
    const breakdown = scoreExpeditionDetailed(color, cards);
    breakdowns.push(breakdown);
    total += breakdown.score;
  }

  return { breakdowns, total };
}

/**
 * Calculate the cumulative match score from per-round scores.
 *
 * @param roundScores - Array of round scores.
 * @returns The sum of all round scores.
 */
export function matchScore(roundScores: number[]): number {
  return roundScores.reduce((sum, s) => sum + s, 0);
}
