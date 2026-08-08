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
} from './MainStreetEngine';
import {
  canPurchaseBusiness,
  canPurchaseUpgrade,
  canPurchaseEvent,
  getEmptySlots,
} from './MainStreetMarket';
import type { BusinessCard, UpgradeCard, EventCard } from './MainStreetCards';
import { GRID_SIZE } from './MainStreetCards';
import { computeSynergyBonus } from './MainStreetAdjacency';

// ── Scoring constants ───────────────────────────────────────

/** Fixed score for playing a held event (ensures it is preferred over end-turn). */
const PLAY_EVENT_SCORE = 5;

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
 * Covers all action types:
 *   - `buy-business`:  one entry per (affordable card × empty slot) pair
 *   - `buy-upgrade`:   one entry per (upgrade card × valid target slot) pair
 *   - `buy-event`:     one entry per purchasable Investment event
 *   - `play-event`:    one entry if the player holds an Investment event
 *   - `end-turn`:      always included
 *
 * Every action returned here is guaranteed to be accepted by `executeAction`
 * (i.e. `canPurchase*` checks all pass).
 *
 * @param state Current game state.
 * @returns Array of legal PlayerActions.
 */
export function enumerateLegalActions(state: MainStreetState): PlayerAction[] {
  const actions: PlayerAction[] = [];

  // ── buy-business ─────────────────────────────────────────
  const emptySlots = getEmptySlots(state);
  for (const card of state.market.development as (BusinessCard | import('./MainStreetCards').CommunitySpaceCard)[]) {
    for (const slotIndex of emptySlots) {
      const result = canPurchaseBusiness(state, card.id, slotIndex);
      if (result.legal) {
        actions.push({ type: 'buy-business', cardId: card.id, slotIndex });
      }
    }
  }

  // ── buy-upgrade ───────────────────────────────────────────
  const upgradeCards = state.market.investments.filter(
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

  // ── buy-event ─────────────────────────────────────────────
  const eventCards = state.market.investments.filter(
    c => c.family === 'event',
  ) as EventCard[];
  for (const card of eventCards) {
    const result = canPurchaseEvent(state, card.id);
    if (result.legal) {
      actions.push({ type: 'buy-event', cardId: card.id });
    }
  }

  // ── play-event ────────────────────────────────────────────
  if ((state.hand ?? []).some(c => c.family === 'event')) {
    actions.push({ type: 'play-event' });
  }

  // ── end-turn ──────────────────────────────────────────────
  actions.push({ type: 'end-turn' });

  return actions;
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

    // Priority 1: upgrades (highest income gain per coin)
    const upgradeActions = legalActions.filter(a => a.type === 'buy-upgrade') as BuyUpgradeAction[];
    if (upgradeActions.length > 0) {
      return pickBest(upgradeActions, a => scoreUpgradeAction(state, a), rng);
    }

    // Priority 2: buy business for best synergy placement
    const businessActions = legalActions.filter(a => a.type === 'buy-business') as BuyBusinessAction[];
    if (businessActions.length > 0) {
      return pickBest(businessActions, a => scoreBusinessAction(state, a), rng);
    }

    // Priority 3: buy Investment event with positive coinDelta ROI
    const eventActions = legalActions.filter(a => a.type === 'buy-event') as BuyEventAction[];
    if (eventActions.length > 0) {
      const bestEvent = pickBest(eventActions, a => scoreEventAction(state, a), rng);
      if (scoreEventAction(state, bestEvent) > 0) {
        return bestEvent;
      }
    }

    // Priority 4: play held event
    const playEventAction = legalActions.find(a => a.type === 'play-event');
    if (playEventAction) {
      return playEventAction;
    }

    // Priority 5: end turn
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
 * Score an upgrade action using the PRD Appendix A formula:
 *   score = incomeBonus * remainingTurns - cost
 *
 * Higher income bonus upgrades are preferred; `remainingTurns` scales the
 * value of future income so early upgrades score higher.
 */
function scoreUpgradeAction(
  state: MainStreetState,
  action: BuyUpgradeAction,
): number {
  const card = state.market.investments.find(
    c => c.id === action.cardId && c.family === 'upgrade',
  ) as UpgradeCard | undefined;
  if (!card) return 0;

  const remainingTurns = state.config.maxTurns - state.turn;
  return card.incomeBonus * remainingTurns - card.cost;
}

/**
 * Score a business placement using the PRD Appendix A formula:
 *   score = (baseIncome + projectedSynergyBonus) * remainingTurns - cost
 *
 * `projectedSynergyBonus` is evaluated at `candidateSlot` as if the business
 * were already placed there.  Higher scores favour early high-synergy placements.
 */
function scoreBusinessAction(
  state: MainStreetState,
  action: BuyBusinessAction,
): number {
  const card = state.market.development.find(c => c.id === action.cardId) as BusinessCard | undefined;
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

  const remainingTurns = state.config.maxTurns - state.turn;
  return (card.baseIncome + projectedSynergyBonus) * remainingTurns - card.cost;
}

/**
 * Score an event purchase using the PRD Appendix A formula:
 *   score = coinDelta + (reputationDelta * config.reputationScoreMultiplier) - cost
 *
 * A score > 0 means the event has positive expected value and is worth buying.
 */
function scoreEventAction(
  state: MainStreetState,
  action: BuyEventAction,
): number {
  const card = state.market.investments.find(
    c => c.id === action.cardId && c.family === 'event',
  ) as EventCard | undefined;
  if (!card) return 0;

  return card.coinDelta + card.reputationDelta * state.config.reputationScoreMultiplier - card.cost;
}

// ── Public Scoring API ──────────────────────────────────────

/**
 * Score a single PlayerAction for the given state using the Greedy heuristics
 * defined in PRD Appendix A.
 *
 * Scores are in "net coin-equivalent value" units:
 *   - `buy-upgrade`:  `incomeBonus * remainingTurns - cost`
 *   - `buy-business`: `(baseIncome + projectedSynergyBonus) * remainingTurns - cost`
 *   - `buy-event`:    `coinDelta + reputationDelta * reputationScoreMultiplier - cost`
 *   - `play-event`:   fixed bonus of 5 (prefer playing over end-turn)
 *   - `end-turn`:     0 (baseline / fallback)
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
    case 'play-event':
      return PLAY_EVENT_SCORE;
    case 'buy-business-to-hand':
      return 0;
    case 'end-turn':
      return 0;
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
