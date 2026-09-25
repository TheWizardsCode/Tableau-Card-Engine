/**
 * AI strategies for Coloretto.
 *
 * Provides:
 *   - ColorettoAiStrategy interface
 *   - RandomStrategy: uniformly random legal action
 *   - HeuristicStrategy: prefers rows containing colors it already has,
 *     avoids giving strong rows to opponents
 *   - ColorettoAiPlayer: wrapper binding strategy and RNG
 *
 * Uses shared AI module (`@ai`) for base types and utility functions.
 */

import type { ColorettoSession, ColorettoAction } from './ColorettoGame';
import { legalActions, topCard } from './ColorettoGame';
import { pointsForCount, colorCounts, BONUS_POINTS } from './ColorettoScoring';
import { COLORS } from './ColorettoCards';
import type { ChameleonColor, ColorettoCard } from './ColorettoCards';
import type { AiStrategyBase } from '@ai';
import { AiPlayer as AiPlayerBase, pickRandom, pickBest } from '@ai';

// ── Strategy interface ──────────────────────────────────────

export interface ColorettoAiStrategy extends AiStrategyBase {
  /**
   * Choose the next action for a player.
   *
   * @param session     The game session.
   * @param playerIndex Index of the AI player (its turn).
   * @param rng         Random number generator.
   * @returns A legal action (place or take).
   */
  chooseAction(
    session: ColorettoSession,
    playerIndex: number,
    rng: () => number,
  ): ColorettoAction;
}

// ── Shared evaluation helpers ───────────────────────────────

/**
 * Marginal point gain for a player of adding a card to their
 * collection. Colors the player already holds gain more than new
 * colors (the set-building incentive). The Last Round card is worth 0;
 * a “+2” bonus card is worth its flat bonus; a joker is worth the best
 * single-card marginal gain across colors (wild value).
 */
export function marginalGain(
  session: ColorettoSession,
  playerIndex: number,
  card: ColorettoCard,
): number {
  if (card.type === 'last-round') return 0;
  if (card.type === 'bonus') return BONUS_POINTS;
  const player = session.players[playerIndex];
  const counts = colorCounts(player.collection);
  if (card.type === 'joker') {
    // Wild: worth the best single-card gain across all colors.
    return Math.max(
      ...COLORS.map((c) => pointsForCount(counts[c] + 1) - pointsForCount(counts[c])),
    );
  }
  const before = counts[card.color] ?? 0;
  return pointsForCount(before + card.count) - pointsForCount(before);
}

/** Worst-case value of a row to the best-positioned opponent. */
function opponentsBestGain(
  session: ColorettoSession,
  playerIndex: number,
  cards: readonly ColorettoCard[],
): number {
  let best = -Infinity;
  for (let i = 0; i < session.players.length; i++) {
    if (i === playerIndex) continue;
    const gain = cards.reduce(
      (sum, card) => sum + marginalGain(session, i, card),
      0,
    );
    if (gain > best) best = gain;
  }
  return best === -Infinity ? 0 : best;
}

/**
 * Net value of a row to a player: what taking it gains them, minus
 * what the best-positioned opponent would gain from taking it.
 */
export function netRowValue(
  session: ColorettoSession,
  playerIndex: number,
  rowIndex: number,
): number {
  const row = session.rows[rowIndex];
  const myGain = row.cards.reduce(
    (sum, card) => sum + marginalGain(session, playerIndex, card),
    0,
  );
  return myGain - opponentsBestGain(session, playerIndex, row.cards);
}

/**
 * Combined point gain for a player of taking an entire row.
 *
 * Accounts for the combined-value bonus: a row of 3 same-colour singles
 * is worth 6 points (pointsForCount(3)), not 3×1 = 3 as a simple sum of
 * per-card marginal gains would suggest.
 *
 * For each colour present in the row, the gain is the difference between
 * the points after taking all cards of that colour and the points before.
 */
export function wholeRowValue(
  session: ColorettoSession,
  playerIndex: number,
  rowIndex: number,
): number {
  const row = session.rows[rowIndex];
  const player = session.players[playerIndex];

  // Count chameleons of each colour in the row.
  const rowCounts: Record<ChameleonColor, number> = {
    red: 0,
    yellow: 0,
    green: 0,
    blue: 0,
    purple: 0,
    orange: 0,
    brown: 0,
  };
  let bonusCards = 0;
  let jokerBestGain = 0;

  for (const card of row.cards) {
    if (card.type === 'chameleon') {
      rowCounts[card.color] += card.count;
    } else if (card.type === 'bonus') {
      bonusCards++;
    } else if (card.type === 'joker') {
      // Wild: worth the best single-card marginal gain across colours.
      const playerCounts = colorCounts(player.collection);
      const best = Math.max(
        ...COLORS.map(
          (c) => pointsForCount(playerCounts[c] + 1) - pointsForCount(playerCounts[c]),
        ),
      );
      jokerBestGain = Math.max(jokerBestGain, best);
    }
    // last-round: worth 0
  }

  // Combined chameleon gain: sum per-colour delta.
  let totalGain = 0;
  for (const color of COLORS) {
    const before = colorCounts(player.collection)[color];
    const after = before + rowCounts[color];
    totalGain += pointsForCount(after) - pointsForCount(before);
  }

  // Add flat bonus and joker gain.
  totalGain += bonusCards * BONUS_POINTS + jokerBestGain;

  return totalGain;
}

// ── RandomStrategy ──────────────────────────────────────────

/**
 * Picks a uniformly random legal action (place or take).
 */
export const RandomStrategy: ColorettoAiStrategy = {
  name: 'random',

  chooseAction(
    session: ColorettoSession,
    playerIndex: number,
    rng: () => number,
  ): ColorettoAction {
    const actions = legalActions(session, playerIndex);
    if (actions.length === 0) {
      throw new Error(`No legal actions for player ${playerIndex}`);
    }
    return pickRandom(actions, rng);
  },
};

// ── HeuristicStrategy ───────────────────────────────────────

/** Take a row when its net value is at least this many points. */
export const TAKE_THRESHOLD = 2;

/**
 * Basic heuristic:
 *   - Evaluates each row by its net value to the player (own marginal
 *     gain minus the best opponent's gain).
 *   - Takes the best row when its net value meets {@link TAKE_THRESHOLD}
 *     (i.e. the row is clearly valuable and/or denies opponents).
 *   - Also takes the best row when its whole-row value (combined
 *     same-colour value, see {@link wholeRowValue}) meets
 *     {@link TAKE_THRESHOLD}. This gives the strategy a positive reason
 *     to take a strong row even when every collection is empty and all
 *     net values are 0 (round 1).
 *   - Otherwise places the top card on the non-full row that maximizes
 *     the row's net value once the drawn card is added.
 *
 * Ties are broken randomly via the seeded RNG.
 */
export const HeuristicStrategy: ColorettoAiStrategy = {
  name: 'heuristic',

  chooseAction(
    session: ColorettoSession,
    playerIndex: number,
    rng: () => number,
  ): ColorettoAction {
    const actions = legalActions(session, playerIndex);
    if (actions.length === 0) {
      throw new Error(`No legal actions for player ${playerIndex}`);
    }

    const takeActions = actions.filter((a) => a.type === 'take');
    const placeActions = actions.filter((a) => a.type === 'place');

    // Take a row when it is clearly valuable.
    //
    // Two independent signals are checked in priority order:
    //   1. Defensive (net value): taking the row denies the best-positioned
    //      opponent more than it gains the player. Preserves the original
    //      behaviour (avoids handing strong rows to opponents).
    //   2. Proactive (whole-row value): the row is objectively strong as a
    //      combined set (e.g. multiple cards of one colour), even when all
    //      collections are empty so every net value is 0 (round 1).
    if (takeActions.length > 0) {
      const bestByNet = pickBest(
        takeActions,
        (a) => netRowValue(session, playerIndex, a.rowIndex),
        rng,
      );
      if (netRowValue(session, playerIndex, bestByNet.rowIndex) >= TAKE_THRESHOLD) {
        return bestByNet;
      }

      const bestByWhole = pickBest(
        takeActions,
        (a) => wholeRowValue(session, playerIndex, a.rowIndex),
        rng,
      );
      if (wholeRowValue(session, playerIndex, bestByWhole.rowIndex) >= TAKE_THRESHOLD) {
        return bestByWhole;
      }
    }

    // Otherwise place the drawn card on the most favorable non-full row.
    if (placeActions.length > 0) {
      const top = topCard(session);
      if (!top) {
        // Deck is empty: no place actions are actually available.
        throw new Error('No place actions available with an empty deck');
      }
      return pickBest(
        placeActions,
        (a) => {
          const row = session.rows[a.rowIndex];
          const cardsWithTop = [...row.cards, top];
          const myGain = cardsWithTop.reduce(
            (sum, card) => sum + marginalGain(session, playerIndex, card),
            0,
          );
          return myGain - opponentsBestGain(session, playerIndex, cardsWithTop);
        },
        rng,
      );
    }

    // All rows are full: must take the best row.
    return pickBest(
      takeActions,
      (a) => netRowValue(session, playerIndex, a.rowIndex),
      rng,
    );
  },
};

// ── ColorettoAiPlayer ───────────────────────────────────────

/**
 * Wrapper that binds a strategy and RNG for convenient use.
 */
export class ColorettoAiPlayer extends AiPlayerBase<ColorettoAiStrategy> {
  constructor(
    strategy: ColorettoAiStrategy = HeuristicStrategy,
    rng: () => number = Math.random,
  ) {
    super(strategy, rng);
  }

  /** Choose an action for the given player. */
  chooseAction(session: ColorettoSession, playerIndex: number): ColorettoAction {
    return this.strategy.chooseAction(session, playerIndex, this.rng);
  }
}
