/**
 * AI strategies for Main Street.
 *
 * Provides:
 *   - MainStreetAiStrategy interface: chooseAction(state, rng)
 *   - enumerateLegalActions(state): all valid PlayerAction options
 *   - scoreAction(state, action): score a single action using heuristics
 *   - enumerateAndScoreActions(state): enumerate and score all legal actions
 *   - RandomStrategy: uniformly random legal action
 *   - GreedyStrategy: heuristic priority chain
 *   - MainStreetAiPlayer: wrapper binding a strategy and RNG
 *
 * Uses shared AI module (`@ai`) for base types and utility functions.
 *
 * @module
 */

import type { AiStrategyBase } from '../../src/ai';
import { AiPlayer as AiPlayerBase, pickRandom, pickBest } from '../../src/ai';
import { recordMainStreetEvent } from './MainStreetTranscript';
import type { MainStreetState } from './MainStreetState';
import {
  executeDayStart,
  processEndOfTurn,
  executeAction,
  type PlayerAction,
  type BuyBusinessAction,
  type BuyUpgradeAction,
  type BuyEventAction,
  type MoveToHandAction,
  type PlayBusinessFromHandAction,
  type PlayUpgradeFromHandAction,
  type PlayEventFromHandAction,
  type CommunityFavourAction,
} from './MainStreetEngine';
import {
  canPurchaseBusiness,
  canPurchaseUpgrade,
  canPurchaseEvent,
  canAddToHand,
  getEmptySlots,
} from './MainStreetMarket';
import type { BusinessCard, UpgradeCard, EventCard } from './MainStreetCards';
import { GRID_SIZE } from './MainStreetCards';
import { computeSynergyBonus } from './MainStreetAdjacency';
import { computeScore } from './MainStreetEngine';

// ── Scoring constants ───────────────────────────────────────

// ── AI planning horizon (CG-0MSLXJCHH001DLIO, user Q2b) ───────

/**
 * Floor for the AI planning horizon. Keeps the horizon > 0 even when the
 * score is at or near the win threshold, so future income is never valued
 * at zero/negative. Calibrated during F4 (CG-0MSN1A71G005AF7W): with a
 * floor of 5, a purchase near the threshold is still valued over ~5 turns
 * of income, matching the old early-game valuation magnitude.
 */
const AI_HORIZON_FLOOR = 5;

/**
 * Cap for the AI planning horizon. Bounds how many future turns a single
 * purchase's income is valued over in long unlimited games, preventing an
 * upgrade/business from being overvalued late in a run.
 */
const AI_HORIZON_CAP = 25;

/**
 * Expected score gained per turn (pts/turn). Used to convert the distance
 * to the win threshold into a turn count. Calibrated from the balance
 * baseline: the Medium threshold (150) is reached in ~18 turns on average,
 * i.e. ~8.3 pts/turn; 8 is the rounded constant.
 */
const AI_SCORE_PACE = 8;

/**
 * Computes the AI planning horizon — the number of future turns whose
 * income a purchase is expected to yield — derived from the distance to
 * the win threshold (user Q2b decision, CG-0MSLXJCHH001DLIO):
 *
 *   horizon = clamp(ceil((winThreshold - score) / scorePace), floor, cap)
 *
 * Replaces the former `remainingTurns = maxTurns - turn` (PRD Appendix A),
 * which no longer applies now that default presets are unlimited. The floor
 * prevents degenerate (zero/negative) horizons when the score is at or near
 * the threshold.
 *
 * @param state Current game state (read-only by convention).
 * @returns The planning horizon in turns (always in [AI_HORIZON_FLOOR, AI_HORIZON_CAP]).
 */
export function aiPlanningHorizon(state: MainStreetState): number {
  const distance = state.config.winThreshold - computeScore(state);
  const raw = Math.ceil(distance / AI_SCORE_PACE);
  return Math.min(AI_HORIZON_CAP, Math.max(AI_HORIZON_FLOOR, raw));
}

// ── Strategy Interface ──────────────────────────────────────

/**
 * An AI strategy for Main Street.
 *
 * The strategy receives the full game state and an RNG, and returns
 * a single PlayerAction to execute during the MarketPhase.
 *
 * Strategies should call `enumerateLegalActions` to discover valid
 * actions rather than hard-coding game logic.
 */
export interface MainStreetAiStrategy extends AiStrategyBase {
  /**
   * Choose an action for the current market phase.
   *
   * @param state Current game state (read-only by convention).
   * @param rng   Seeded random number generator.
   * @returns The chosen PlayerAction.
   */
  chooseAction(state: MainStreetState, rng: () => number): PlayerAction;
}

// ── Legal Action Enumeration ────────────────────────────────

/**
 * Produces all valid PlayerAction options for the given state.
 *
 * Covers all action types for the single-row market
 * (CG-0MSTOATDT009BRX2):
 *   - `buy-business` / `buy-upgrade` / `buy-event`: direct buy-and-place
 *     (pays immediately), one entry per (affordable card × valid target)
 *   - `move-to-hand`: free acquisition, bounded only by hand capacity
 *   - `play-*-from-hand`: cost-at-play placement/activation from the hand
 *   - `discard-from-hand`: free discard (only enumerated when the hand is
 *     full, so the AI never gratuitously discards)
 *   - `end-turn`: always included
 *
 * Every action returned here is guaranteed to be accepted by `executeAction`.
 *
 * @param state Current game state.
 * @returns Array of legal PlayerActions.
 */
export function enumerateLegalActions(state: MainStreetState): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const hand = state.hand ?? [];
  const emptySlots = getEmptySlots(state);

  // ── Community Favour (CG-0MSTOATDQ005XDET) ────────────────
  // A FREE once-per-turn resource exchange (does not consume actionsRemaining),
  // so it stays available even when the daily action budget is spent — as a
  // fallback when the player cannot afford any market purchase. Legal only
  // during MarketPhase, once per turn, and when the input resource suffices.
  if (
    state.phase === 'MarketPhase' &&
    !state.favourUsedThisTurn &&
    state.actionsRemaining >= 0
  ) {
    if (state.resourceBank.coins >= state.config.favourCoinsToRepCost) {
      actions.push({ type: 'community-favour', direction: 'coins-to-rep' });
    }
    if (state.resourceBank.reputation >= state.config.favourRepToCoinsRepCost) {
      actions.push({ type: 'community-favour', direction: 'rep-to-coins' });
    }
  }

  // Action economy (CG-0MSTOF1N5005PK2R): when the daily action budget is
  // spent, only end-turn is legal. Free operations (refresh/sell/hint/
  // discard/end-turn) stay available to the player, but the AI simply ends
  // the day rather than cycling through non-actions. The free Community
  // Favour fallback (added above) stays legal too — with end-turn always
  // present so the AI loop still terminates.
  if ((state.actionsRemaining ?? 1) <= 0) {
    if (actions.length === 0) return [{ type: 'end-turn' }];
    return [...actions, { type: 'end-turn' }];
  }

  // ── buy-business (direct buy-and-place, pays immediately) ──
  for (const card of state.market.cards) {
    if (card.family !== 'business' && card.family !== 'community-space') continue;
    for (const slotIndex of emptySlots) {
      const result = canPurchaseBusiness(state, card.id, slotIndex);
      if (result.legal) {
        actions.push({ type: 'buy-business', cardId: card.id, slotIndex });
      }
    }
  }

  // ── buy-upgrade (direct, pays immediately) ────────────────
  const upgradeCards = state.market.cards.filter(
    c => c.family === 'upgrade',
  ) as UpgradeCard[];
  for (const card of upgradeCards) {
    const canBuy = canPurchaseUpgrade(state, card.id);
    if (!canBuy.legal) continue;

    // Generate one action per valid target slot so the AI can choose
    // which slot to upgrade (important for branching upgrade paths).
    const requiredLevel = card.requiredLevel ?? 0;
    for (let i = 0; i < GRID_SIZE; i++) {
      const biz = state.streetGrid[i];
      if (
        biz !== null &&
        biz.name === card.targetBusiness &&
        biz.level === requiredLevel &&
        biz.level < biz.maxLevel
      ) {
        actions.push({ type: 'buy-upgrade', cardId: card.id, targetSlot: i });
      }
    }
  }

  // ── buy-event (direct, pays immediately) ──────────────────
  const eventCards = state.market.cards.filter(
    c => c.family === 'event',
  ) as EventCard[];
  for (const card of eventCards) {
    const result = canPurchaseEvent(state, card.id);
    if (result.legal) {
      actions.push({ type: 'buy-event', cardId: card.id });
    }
  }

  // ── move-to-hand (free; bounded only by hand capacity) ────
  if (canAddToHand(state).legal) {
    for (const card of state.market.cards) {
      actions.push({ type: 'move-to-hand', cardId: card.id });
    }
  }

  // ── play-*-from-hand (cost-at-play) ───────────────────────
  hand.forEach((card, handIndex) => {
    if (card.family === 'business' || card.family === 'community-space') {
      if (state.resourceBank.coins < card.cost) return;
      for (const slotIndex of emptySlots) {
        actions.push({ type: 'play-business-from-hand', handIndex, slotIndex });
      }
    } else if (card.family === 'upgrade') {
      if (state.resourceBank.coins < card.cost) return;
      const requiredLevel = card.requiredLevel ?? 0;
      for (let i = 0; i < GRID_SIZE; i++) {
        const biz = state.streetGrid[i];
        if (
          biz !== null &&
          biz.name === card.targetBusiness &&
          biz.level === requiredLevel &&
          biz.level < biz.maxLevel
        ) {
          actions.push({ type: 'play-upgrade-from-hand', handIndex, targetSlot: i });
        }
      }
    } else if (card.family === 'event' && card.trigger === 'Investment') {
      if (state.resourceBank.coins >= card.cost) {
        actions.push({ type: 'play-event-from-hand', handIndex });
      }
    }
  });

  // ── discard-from-hand (free; only enumerated when the hand is full) ──
  if (hand.length >= (state.maxHandSize ?? 3)) {
    hand.forEach((_, handIndex) => {
      actions.push({ type: 'discard-from-hand', handIndex });
    });
  }

  // ── peek-incident-deck (staff peek skill, CG-0MSXOW6GN008ZSMN) ──
  // Legal only when a peek-capable staff member is employed and the deck
  // has a card to look at. The once-per-turn gate and action cost are
  // enforced inside executeAction/peekIncidentDeck.
  const hasPeekStaff = (state.staffCards ?? []).some(card => card.peekOncePerTurn);
  if (hasPeekStaff && state.incidentDeck.length > 0) {
    actions.push({ type: 'peek-incident-deck' });
  }

  // ── end-turn ──────────────────────────────────────────────
  actions.push({ type: 'end-turn' });

  return actions;
}

// ── RandomStrategy ──────────────────────────────────────────

/**
 * Returns the cheapest purchasable MARKET card cost (business/community-
 * space/upgrade/event), or Infinity when the market is empty.
 *
 * Used by the Community Favour heuristic to detect a STALLED turn — a
 * player who cannot afford the cheapest market card cannot advance the
 * economy with normal purchases, so the free rep→coins exchange is the
 * right fallback. Staff cards are excluded: they are a late-game luxury
 * purchase in a separate market and are rarely the gatekeeper card.
 */
function getCheapestMarketCost(state: MainStreetState): number {
  const marketCards = state.market?.cards ?? [];
  let cheapest = Infinity;
  for (const card of marketCards) {
    if (typeof card !== 'object' || card === null) continue;
    const cost = (card as { cost?: number }).cost;
    if (typeof cost === 'number' && cost >= 0 && cost < cheapest) cheapest = cost;
  }
  return cheapest;
}

// ── RandomStrategy ──────────────────────────────────────────

/**
 * Selects a uniformly random legal action each turn.
 *
 * Baseline strategy used for Monte Carlo balance testing and as a
 * fallback when no heuristic improvement is available.
 */
export const RandomStrategy: MainStreetAiStrategy = {
  name: 'Random',

  chooseAction(state: MainStreetState, rng: () => number): PlayerAction {
    const legalActions = enumerateLegalActions(state);
    return pickRandom(legalActions, rng);
  },
};

// ── GreedyStrategy ──────────────────────────────────────────

/**
 * A heuristic greedy strategy following the PRD M3 priority chain:
 *
 *   1. Buy an upgrade (if affordable and available) — best income delta
 *   2. Buy a business (best synergy placement score)
 *   3. Buy an Investment event (positive expected ROI only)
 *   4. Play a held event (if holding one)
 *   5. End turn
 *
 * Ties at each priority level are broken randomly via `pickBest`.
 */
export const GreedyStrategy: MainStreetAiStrategy = {
  name: 'Greedy',

  chooseAction(state: MainStreetState, rng: () => number): PlayerAction {
    const legalActions = enumerateLegalActions(state);

    // Priority 1: play an affordable business from hand (cost-at-play) with
    // the best synergy placement score.
    const handBusinessActions = legalActions.filter(
      a => a.type === 'play-business-from-hand',
    ) as PlayBusinessFromHandAction[];
    if (handBusinessActions.length > 0) {
      return pickBest(handBusinessActions, a => scorePlayBusinessFromHandAction(state, a), rng);
    }

    // Priority 2: play an affordable upgrade from hand (cost-at-play).
    const handUpgradeActions = legalActions.filter(
      a => a.type === 'play-upgrade-from-hand',
    ) as PlayUpgradeFromHandAction[];
    if (handUpgradeActions.length > 0) {
      return pickBest(handUpgradeActions, a => scorePlayUpgradeFromHandAction(state, a), rng);
    }

    // Priority 3: buy upgrades (highest income gain per coin)
    const upgradeActions = legalActions.filter(a => a.type === 'buy-upgrade') as BuyUpgradeAction[];
    if (upgradeActions.length > 0) {
      return pickBest(upgradeActions, a => scoreUpgradeAction(state, a), rng);
    }

    // Priority 4: buy business for best synergy placement (direct, immediate pay)
    const businessActions = legalActions.filter(a => a.type === 'buy-business') as BuyBusinessAction[];
    if (businessActions.length > 0) {
      return pickBest(businessActions, a => scoreBusinessAction(state, a), rng);
    }

    // Priority 5: move market cards to hand for free (lock in valuable cards
    // ahead of payment). Score by listed cost — the more expensive the card,
    // the more valuable it is to reserve.
    const moveActions = legalActions.filter(a => a.type === 'move-to-hand') as MoveToHandAction[];
    if (moveActions.length > 0) {
      return pickBest(moveActions, a => {
        const card = state.market.cards.find(c => c.id === a.cardId);
        return card ? card.cost : 0;
      }, rng);
    }

    // Priority 6: buy Investment event with positive coinDelta ROI
    const eventActions = legalActions.filter(a => a.type === 'buy-event') as BuyEventAction[];
    if (eventActions.length > 0) {
      const bestEvent = pickBest(eventActions, a => scoreEventAction(state, a), rng);
      if (scoreEventAction(state, bestEvent) > 0) {
        return bestEvent;
      }
    }

    // Priority 7: play a held Investment event with positive ROI
    const playEventActions = legalActions.filter(
      a => a.type === 'play-event-from-hand',
    ) as PlayEventFromHandAction[];
    if (playEventActions.length > 0) {
      const bestEvent = pickBest(playEventActions, a => scorePlayEventFromHandAction(state, a), rng);
      if (scorePlayEventFromHandAction(state, bestEvent) > 0) {
        return bestEvent;
      }
    }

    // Priority 8: discard from a full hand (frees capacity for moves)
    const discardActions = legalActions.filter(a => a.type === 'discard-from-hand');
    if (discardActions.length > 0) {
      return pickRandom(discardActions, rng);
    }

    // Priority 9: Community Favour fallback (CG-0MSTOATDQ005XDET).
    // A FREE once-per-turn exchange, reached only when nothing more
    // productive is available (no purchases/plays/moves). Only fires when
    // the best favour action is genuinely value-creating (score > 1:
    // e.g. rep-to-coins when cash-strapped). Neutral conversions (score 1)
    // are skipped — blindly burning coins for rep every turn destroys
    // liquidity and collapses the economy (a lossy exchange). This keeps
    // AI turns meaningful on an unaffordable market without dominating
    // normal purchases when affordable.
    const favourActions = legalActions.filter(
      a => a.type === 'community-favour',
    ) as CommunityFavourAction[];
    if (favourActions.length > 0) {
      const best = pickBest(favourActions, a => scoreAction(state, a), rng);
      if (scoreAction(state, best) > 1) {
        return best;
      }
    }

    // Priority 10: end turn
    return { type: 'end-turn' };
  },
};

// ── AiPlayer ────────────────────────────────────────────────

/**
 * Main Street AI player binding a strategy and RNG.
 *
 * Extends the shared {@link AiPlayerBase} and adds `chooseAction` and
 * `playGame` convenience methods.
 */
export class MainStreetAiPlayer extends AiPlayerBase<MainStreetAiStrategy> {
  constructor(
    strategy: MainStreetAiStrategy = GreedyStrategy,
    rng: () => number = Math.random,
  ) {
    super(strategy, rng);
  }

  /**
   * Choose a single action for the current market phase.
   *
   * Delegates to the strategy, hiding the `rng` parameter from callers.
   */
  chooseAction(state: MainStreetState): PlayerAction {
    return this.strategy.chooseAction(state, this.rng);
  }

  /**
   * Run a complete game from setup to game-end.
   *
   * The caller is responsible for setting up the state (via
   * `setupMainStreetGame`). This method drives the game loop,
   * choosing actions each turn until the game ends.
   *
   * @param state An already-set-up MainStreetState (mutated in-place).
   */
  playGame(state: MainStreetState): void {
    while (state.gameResult === 'playing') {
      executeDayStart(state);

      // Execute actions until end-turn is chosen or game ends
      let action = this.chooseAction(state);
      while (action.type !== 'end-turn') {
        executeAction(state, action);
        // Record AI action for transcript if recorder is present
        try {
          recordMainStreetEvent({ type: 'ai-action', turn: state.turn, strategy: this.strategy.name, action });
        } catch (_) {}
        if (state.gameResult !== 'playing') break;
        action = this.chooseAction(state);
      }

      processEndOfTurn(state);
    }
  }
}

// ── Scoring Helpers ─────────────────────────────────────────

/**
 * Score an upgrade action.
 *
 *   score = incomeBonus * horizon - cost
 *
 * where `horizon` is the AI planning horizon derived from the distance to
 * the win threshold (`aiPlanningHorizon`, CG-0MSLXJCHH001DLIO). Higher
 * income bonus upgrades are preferred; a larger horizon scales the value
 * of future income, so early-game (far-from-threshold) upgrades score higher.
 */
function scoreUpgradeAction(
  state: MainStreetState,
  action: BuyUpgradeAction,
): number {
  const card = state.market.cards.find(
    c => c.id === action.cardId && c.family === 'upgrade',
  ) as UpgradeCard | undefined;
  if (!card) return 0;

  const horizon = aiPlanningHorizon(state);
  return card.incomeBonus * horizon - card.cost;
}

/**
 * Score a business placement.
 *
 *   score = (baseIncome + projectedSynergyBonus) * horizon - cost
 *
 * `projectedSynergyBonus` is evaluated at `candidateSlot` as if the business
 * were already placed there. `horizon` is the AI planning horizon derived
 * from the distance to the win threshold (`aiPlanningHorizon`,
 * CG-0MSLXJCHH001DLIO). Higher scores favour early high-synergy placements.
 */
function scoreBusinessAction(
  state: MainStreetState,
  action: BuyBusinessAction,
): number {
  const card = state.market.cards.find(c => c.id === action.cardId) as BusinessCard | undefined;
  if (!card) return 0;

  // Simulate placement: shallow-clone the grid and insert the new card
  const simulatedGrid = [...state.streetGrid];
  simulatedGrid[action.slotIndex] = card;

  // Projected synergy bonus for the new card at the candidate slot
  const projectedSynergyBonus = computeSynergyBonus(
    simulatedGrid,
    action.slotIndex,
    state.config.synergyBonusPerNeighbor,
  );

  const horizon = aiPlanningHorizon(state);
  return (card.baseIncome + projectedSynergyBonus) * horizon - card.cost;
}

/**
 * Score an event purchase using the final-score value heuristic:
 *   score = coinDelta + reputationDelta - cost
 *
 * A score > 0 means the event has positive expected value and is worth buying.
 * Reputation is valued at 1 point per unit (plain count), matching the
 * final score function (CG-0MT3J8FXG006RCOA).
 */
function scoreEventAction(
  state: MainStreetState,
  action: BuyEventAction,
): number {
  const card = state.market.cards.find(
    c => c.id === action.cardId && c.family === 'event',
  ) as EventCard | undefined;
  if (!card) return 0;

  return card.coinDelta + card.reputationDelta - card.cost;
}

/**
 * Scores playing a business from hand: same placement heuristic as
 * `scoreBusinessAction` (income + synergy over the horizon), with the card
 * located in the hand instead of the market.
 */
function scorePlayBusinessFromHandAction(
  state: MainStreetState,
  action: PlayBusinessFromHandAction,
): number {
  const card = (state.hand ?? [])[action.handIndex] as BusinessCard | undefined;
  if (!card) return 0;

  const simulatedGrid = [...state.streetGrid];
  simulatedGrid[action.slotIndex] = card;
  const projectedSynergyBonus = computeSynergyBonus(
    simulatedGrid,
    action.slotIndex,
    state.config.synergyBonusPerNeighbor,
  );
  const horizon = aiPlanningHorizon(state);
  return (card.baseIncome + projectedSynergyBonus) * horizon - card.cost;
}

/**
 * Scores playing an upgrade from hand: income bonus over the horizon minus
 * the cost paid at play time.
 */
function scorePlayUpgradeFromHandAction(
  state: MainStreetState,
  action: PlayUpgradeFromHandAction,
): number {
  const card = (state.hand ?? [])[action.handIndex] as UpgradeCard | undefined;
  if (!card) return 0;
  const horizon = aiPlanningHorizon(state);
  return card.incomeBonus * horizon - card.cost;
}

/**
 * Scores playing an Investment event from hand: coin/reputation value minus
 * the cost paid at play time.
 */
function scorePlayEventFromHandAction(
  state: MainStreetState,
  action: PlayEventFromHandAction,
): number {
  const card = (state.hand ?? [])[action.handIndex] as EventCard | undefined;
  if (!card) return 0;
  return card.coinDelta + card.reputationDelta - card.cost;
}

// ── Public Scoring API ──────────────────────────────────────

/**
 * Score a single PlayerAction for the given state using the Greedy heuristics.
 *
 * Scores are in "net coin-equivalent value" units:
 *   - `buy-upgrade`:  `incomeBonus * horizon - cost`
 *   - `buy-business`: `(baseIncome + projectedSynergyBonus) * horizon - cost`
 *   - `buy-event`:    `coinDelta + reputationDelta - cost` (reputation counts plainly)
 *   - `play-event`:   fixed bonus of 5 (prefer playing over end-turn)
 *   - `end-turn`:     0 (baseline / fallback)
 *
 * `horizon` is the AI planning horizon derived from the distance to the
 * win threshold (`aiPlanningHorizon`, CG-0MSLXJCHH001DLIO), replacing the
 * former PRD Appendix A `remainingTurns = maxTurns - turn` factor now that
 * default presets are unlimited.
 *
 * @param state  Current game state (read-only by convention).
 * @param action The action to score.
 * @returns Numeric score (higher is better).
 */
export function scoreAction(state: MainStreetState, action: PlayerAction): number {
  switch (action.type) {
    case 'buy-upgrade':
      return scoreUpgradeAction(state, action);
    case 'buy-business':
      return scoreBusinessAction(state, action);
    case 'buy-event':
      return scoreEventAction(state, action);
    case 'play-business-from-hand':
      return scorePlayBusinessFromHandAction(state, action);
    case 'play-upgrade-from-hand':
      return scorePlayUpgradeFromHandAction(state, action);
    case 'play-event-from-hand':
      return scorePlayEventFromHandAction(state, action);
    case 'play-event': {
      const card = (state.hand ?? []).find(c => c.family === 'event') as EventCard | undefined;
      return card
        ? card.coinDelta + card.reputationDelta - card.cost
        : 0;
    }
    case 'move-to-hand':
      return 0;
    case 'discard-from-hand':
      return 0;
    case 'end-turn':
      return 0;
    // Action economy actions (CG-0MSTOF1N5005PK2R). Minimal scoring for now;
    // the AI strategy child (CG-0MSX41S7I009MMZN) refines budget-aware scoring.
    case 'buy-and-place':
      return scoreBusinessAction(state, { type: 'buy-business', cardId: action.cardId, slotIndex: action.slotIndex });
    case 'hire-staff':
      // Net value of expanded hand slots vs. cost + ongoing cost (rough estimate).
      return 2;
    case 'peek-incident-deck':
      // Staff peek skill (CG-0MSXOW6GN008ZSMN): foresight is mildly useful,
      // but a greedy heuristic cannot exploit the revealed card, so it scores
      // below most productive actions.
      return 1;
    case 'community-favour':
      // Community Favour (CG-0MSTOATDQ005XDET): a free fallback when the
      // player cannot afford purchases. rep-to-coins is genuinely valuable
      // only when the player is STALLED (cannot afford the cheapest market
      // card) AND the conversion leaves a reputation buffer (reputation
      // after the exchange stays >= 1) — burning the last reputation would
      // trigger reputation-collapse loss. Otherwise the exchange is a
      // low-value (score 1) legal fallback that never outranks purchases.
      if (action.direction === 'rep-to-coins') {
        const cheapestCardCost = getCheapestMarketCost(state);
        // Convert only when genuinely stalled (cannot afford the cheapest
        // market card) AND the conversion leaves a reputation buffer
        // (reputation after the exchange stays >= 1) — burning the last
        // reputation would trigger reputation-collapse loss.
        if (
          Number.isFinite(cheapestCardCost) &&
          state.resourceBank.coins < cheapestCardCost &&
          state.resourceBank.reputation >= state.config.favourRepToCoinsRepCost + 1
        ) {
          return 3; // useful fallback when stalled with rep to spare
        }
        return 1;
      }
      // coins-to-rep: spending scarce coins on reputation is rarely better
      // than buying cards; stays as a legal fallback at the low default.
      return 1;
  }
}

/**
 * Enumerate all legal actions for the given state and compute a heuristic
 * score for each one.
 *
 * This is the primary building block for the Greedy strategy and the hint
 * system.  Callers can sort by score descending or pass the results directly
 * to `pickBest` to select the highest-scoring action with tie-breaking.
 *
 * @param state Current game state.
 * @returns Array of `{ action, score }` pairs for every legal action.
 */
export function enumerateAndScoreActions(
  state: MainStreetState,
): Array<{ action: PlayerAction; score: number }> {
  return enumerateLegalActions(state).map(action => ({
    action,
    score: scoreAction(state, action),
  }));
}
