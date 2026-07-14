/**
 * Lost Cities game rules -- turn legality, move validation,
 * and round-end detection.
 *
 * Turn flow (two mandatory phases per turn):
 *   Phase 1 (PlayOrDiscard): Player MUST either:
 *     a. Play a card from hand to one of their expedition lanes
 *        (ascending-play rule enforced), OR
 *     b. Discard a card from hand to the matching color's discard pile.
 *
 *   Phase 2 (Draw): Player MUST draw one card from either:
 *     a. The shared draw pile, OR
 *     b. The top card of any color's discard pile.
 *     Restriction: Cannot draw from the discard pile of the color
 *     they just discarded to in Phase 1.
 *
 * Round ending:
 *   - The round ends immediately when the draw pile is exhausted.
 *   - The player who drew the last card does NOT get to complete
 *     a final turn -- the round ends after their draw.
 *   - No additional final turns for the other player (unlike Golf).
 */

import type { LostCitiesCard, ExpeditionColor } from './LostCitiesCards';
import { EXPEDITION_COLORS, canPlayAfter } from './LostCitiesCards';

import type { LegalityResult } from '../../src/rule-engine/index';
export type { LegalityResult } from '../../src/rule-engine/index';

// ── Turn phases ─────────────────────────────────────────────

/** The two mandatory phases of a Lost Cities turn. */
export type TurnPhase = 'PlayOrDiscard' | 'Draw';

// ── Action types ────────────────────────────────────────────

/** Play a card from hand to an expedition lane. */
export interface PlayToExpeditionAction {
  readonly kind: 'play-to-expedition';
  /** The card to play (must be in the player's hand). */
  readonly card: LostCitiesCard;
  /** The expedition color to play to (must match card.color). */
  readonly color: ExpeditionColor;
}

/** Discard a card from hand to the matching color's discard pile. */
export interface DiscardAction {
  readonly kind: 'discard';
  /** The card to discard (must be in the player's hand). */
  readonly card: LostCitiesCard;
  /** The color of the discard pile (always matches card.color). */
  readonly color: ExpeditionColor;
}

/** Draw a card from the shared draw pile. */
export interface DrawFromPileAction {
  readonly kind: 'draw-from-pile';
}

/** Draw the top card from a color's discard pile. */
export interface DrawFromDiscardAction {
  readonly kind: 'draw-from-discard';
  /** The color of the discard pile to draw from. */
  readonly color: ExpeditionColor;
}

/** Phase 1 actions: play to expedition or discard. */
export type Phase1Action = PlayToExpeditionAction | DiscardAction;

/** Phase 2 actions: draw from draw pile or discard pile. */
export type Phase2Action = DrawFromPileAction | DrawFromDiscardAction;

/** Any action in either phase. */
export type LostCitiesAction = Phase1Action | Phase2Action;

// ── Legality results ────────────────────────────────────────

// LegalityResult imported and re-exported from @rule-engine above.

// ── Game state view for rules checking ──────────────────────

/**
 * Minimal game state view needed by rules functions.
 * Avoids coupling rules module to the full game state.
 */
export interface RulesGameView {
  /** The current player's expedition lanes (color -> cards in order). */
  playerExpeditions: Map<ExpeditionColor, LostCitiesCard[]>;
  /** The discard piles (color -> cards, top is last element). */
  discardPiles: Map<ExpeditionColor, LostCitiesCard[]>;
  /** Number of cards remaining in the draw pile. */
  drawPileSize: number;
  /** The color that was just discarded to in Phase 1 (null if Phase 1 or not yet played). */
  justDiscardedColor: ExpeditionColor | null;
}

// ── Phase 1: Play or Discard ────────────────────────────────

/**
 * Check if a card can legally be played to an expedition lane.
 *
 * Rules:
 * - Card color must match the expedition color.
 * - If the lane is empty, any card of that color can be played.
 * - If the lane has cards, the new card must satisfy ascending-play:
 *   investments before numbered cards, numbered in strictly ascending order.
 */
export function isLegalPlay(
  card: LostCitiesCard,
  expeditionLane: LostCitiesCard[],
): boolean {
  // Card color must match (caller should ensure this, but we validate)
  if (expeditionLane.length === 0) {
    return true; // Any card can start an expedition
  }

  const lastCard = expeditionLane[expeditionLane.length - 1];
  return canPlayAfter(card, lastCard);
}

/**
 * Check legality of a Phase 1 action with detailed result.
 */
export function checkPhase1Legality(
  action: Phase1Action,
  hand: LostCitiesCard[],
  gameView: RulesGameView,
): LegalityResult {
  // Card must be in hand
  if (!hand.some((c) => c.id === action.card.id)) {
    return { legal: false, reason: 'Card is not in hand' };
  }

  if (action.kind === 'play-to-expedition') {
    // Color must match
    if (action.card.color !== action.color) {
      return {
        legal: false,
        reason: `Card color ${action.card.color} does not match expedition ${action.color}`,
      };
    }

    // Ascending-play validation
    const lane = gameView.playerExpeditions.get(action.color) ?? [];
    if (!isLegalPlay(action.card, lane)) {
      return {
        legal: false,
        reason: `Card cannot be played to ${action.color} expedition: violates ascending order`,
      };
    }

    return { legal: true };
  }

  // Discard action
  if (action.card.color !== action.color) {
    return {
      legal: false,
      reason: `Card color ${action.card.color} does not match discard pile ${action.color}`,
    };
  }

  // Discarding is always legal for any card in hand
  return { legal: true };
}

// ── Phase 2: Draw ───────────────────────────────────────────

/**
 * Check legality of a Phase 2 action with detailed result.
 */
export function checkPhase2Legality(
  action: Phase2Action,
  gameView: RulesGameView,
): LegalityResult {
  if (action.kind === 'draw-from-pile') {
    if (gameView.drawPileSize <= 0) {
      return { legal: false, reason: 'Draw pile is empty' };
    }
    return { legal: true };
  }

  // Draw from discard pile
  const pile = gameView.discardPiles.get(action.color) ?? [];
  if (pile.length === 0) {
    return {
      legal: false,
      reason: `${action.color} discard pile is empty`,
    };
  }

  // Cannot draw from the color just discarded to
  if (gameView.justDiscardedColor === action.color) {
    return {
      legal: false,
      reason: `Cannot draw from ${action.color} discard pile: you just discarded there`,
    };
  }

  return { legal: true };
}

// ── Legal move generation ───────────────────────────────────

/**
 * Get all legal Phase 1 actions for the current player.
 */
export function getLegalPhase1Actions(
  hand: LostCitiesCard[],
  gameView: RulesGameView,
): Phase1Action[] {
  const actions: Phase1Action[] = [];

  for (const card of hand) {
    // Try playing to expedition
    const lane = gameView.playerExpeditions.get(card.color) ?? [];
    if (isLegalPlay(card, lane)) {
      actions.push({
        kind: 'play-to-expedition',
        card,
        color: card.color,
      });
    }

    // Always can discard any card
    actions.push({
      kind: 'discard',
      card,
      color: card.color,
    });
  }

  return actions;
}

/**
 * Get all legal Phase 2 actions for the current player.
 */
export function getLegalPhase2Actions(
  gameView: RulesGameView,
): Phase2Action[] {
  const actions: Phase2Action[] = [];

  // Draw from draw pile (if not empty)
  if (gameView.drawPileSize > 0) {
    actions.push({ kind: 'draw-from-pile' });
  }

  // Draw from any non-empty discard pile (except just-discarded color)
  for (const color of EXPEDITION_COLORS) {
    const pile = gameView.discardPiles.get(color) ?? [];
    if (pile.length > 0 && gameView.justDiscardedColor !== color) {
      actions.push({ kind: 'draw-from-discard', color });
    }
  }

  return actions;
}

/**
 * Get all legal actions for the current turn phase.
 */
export function getLegalActions(
  hand: LostCitiesCard[],
  gameView: RulesGameView,
  phase: TurnPhase,
): LostCitiesAction[] {
  if (phase === 'PlayOrDiscard') {
    return getLegalPhase1Actions(hand, gameView);
  }
  return getLegalPhase2Actions(gameView);
}

// ── Round end detection ─────────────────────────────────────

/**
 * Check if the round is over (draw pile exhausted).
 * In Lost Cities, the round ends immediately when the last card
 * is drawn from the draw pile.
 */
export function isRoundOver(drawPileSize: number): boolean {
  return drawPileSize <= 0;
}
