/**
 * Main Street: Hint System
 *
 * Provides the HintGenerator: queries the Greedy AI strategy to produce a
 * one-line recommended action with a human-readable rationale.
 *
 * Usage:
 *   - Call `generateHint(state)` during MarketPhase to get a HintResult.
 *   - Returns null if called outside MarketPhase.
 *   - Per-turn limit (hintUsedThisTurn) is enforced by the caller (scene).
 *
 * @module
 */

import { GreedyStrategy, scoreAction } from './MainStreetAiStrategy';
import type { MainStreetState } from './MainStreetState';
import type { PlayerAction, BuyBusinessAction, BuyUpgradeAction, BuyEventAction } from './MainStreetEngine';
import { computeSynergyBonus } from './MainStreetAdjacency';
import type { BusinessCard, UpgradeCard, EventCard } from './MainStreetCards';

// ── Types ────────────────────────────────────────────────────

/**
 * The result of a hint request: the recommended action, a human-readable
 * one-line rationale, and the heuristic score used to rank it.
 */
export interface HintResult {
  /** The recommended PlayerAction (not auto-executed; player must act manually). */
  action: PlayerAction;
  /** One-line human-readable rationale for the recommendation. */
  rationale: string;
  /** Heuristic score (for debugging; not shown to the player). */
  score: number;
}

// ── generateHint ─────────────────────────────────────────────

/**
 * Generates a hint by querying the Greedy strategy for its recommended action.
 *
 * Creates a temporary GreedyStrategy evaluation: calls `GreedyStrategy.chooseAction`
 * to get the recommended action (following the same priority chain used during
 * AI auto-play), then scores that action for rationale context.
 *
 * Returns null if the game is not in MarketPhase (hints are only valid
 * during the player's market/action turn).
 *
 * Note: This function advances `state.rng` for tie-breaking (via GreedyStrategy).
 * Callers should be aware that the RNG position changes after calling this function.
 *
 * @param state Current game state.
 * @returns HintResult with the recommended action and rationale, or null.
 */
export function generateHint(state: MainStreetState): HintResult | null {
  if (state.phase !== 'MarketPhase') return null;

  // Delegate to GreedyStrategy so the hint is always consistent with AI play.
  const action = GreedyStrategy.chooseAction(state, state.rng);
  const score = scoreAction(state, action);
  const rationale = buildRationale(action, score, state);

  return { action, rationale, score };
}

// ── buildRationale ────────────────────────────────────────────

/**
 * Builds a one-line human-readable rationale for a recommended action.
 *
 * Templates follow the PRD Appendix A spec:
 * - buy-business: "Buy {cardName} at slot {slot} for +{synergyBonus} synergy bonus"
 * - buy-upgrade:  "Upgrade {businessName} for +{incomeBonus}/turn income"
 * - buy-event:    "Buy {eventName} for {coinDelta} coins and {repDelta} reputation"
 * - play-event:   "Play {eventName} now for immediate benefit"
 * - end-turn:     "No good buys available -- end your turn"
 *
 * @param action The recommended action.
 * @param score  The heuristic score (used to detect zero-value end-turn).
 * @param state  Current game state (for card lookups).
 * @returns One-line rationale string.
 */
export function buildRationale(
  action: PlayerAction,
  _score: number,
  state: MainStreetState,
): string {
  switch (action.type) {
    case 'buy-business': {
      const a = action as BuyBusinessAction;
      const card = state.market.development.find(c => c.id === a.cardId) as BusinessCard | undefined;
      const cardName = card?.name ?? a.cardId;

      // Compute projected synergy bonus at the candidate slot
      const simulatedGrid = [...state.streetGrid];
      if (card) simulatedGrid[a.slotIndex] = card;
      const synergyBonus = computeSynergyBonus(
        simulatedGrid,
        a.slotIndex,
        state.config.synergyBonusPerNeighbor,
      );

      if (synergyBonus > 0) {
        return `Buy ${cardName} at slot ${a.slotIndex} for +${synergyBonus} synergy bonus`;
      }
      return `Buy ${cardName} at slot ${a.slotIndex}`;
    }

    case 'buy-upgrade': {
      const a = action as BuyUpgradeAction;
      const card = state.market.investments.find(c => c.id === a.cardId) as UpgradeCard | undefined;
      const targetBusiness = card?.targetBusiness ?? 'business';
      const incomeBonus = card?.incomeBonus ?? 0;

      if (a.targetSlot !== undefined) {
        const biz = state.streetGrid[a.targetSlot] as BusinessCard | null;
        const bizName = biz?.name ?? targetBusiness;
        return `Upgrade ${bizName} at slot ${a.targetSlot} for +${incomeBonus}/turn income`;
      }
      return `Upgrade ${targetBusiness} for +${incomeBonus}/turn income`;
    }

    case 'buy-event': {
      const a = action as BuyEventAction;
      const card = state.market.investments.find(c => c.id === a.cardId) as EventCard | undefined;
      const cardName = card?.name ?? a.cardId;
      const coinDelta = card?.coinDelta ?? 0;
      const repDelta = card?.reputationDelta ?? 0;

      const parts: string[] = [];
      if (coinDelta !== 0) parts.push(`${coinDelta > 0 ? '+' : ''}${coinDelta} coins`);
      if (repDelta !== 0) parts.push(`${repDelta > 0 ? '+' : ''}${repDelta} reputation`);
      const effects = parts.length > 0 ? parts.join(' and ') : 'positive effect';

      return `Buy ${cardName} for ${effects}`;
    }

    case 'play-event': {
      const cardName = state.heldEvent?.name ?? 'held event';
      return `Play ${cardName} now for immediate benefit`;
    }

    case 'buy-business-to-hand':
      return 'Buy business card to hand for later placement';
    case 'end-turn':
      return 'No good buys available -- end your turn';
  }
}
