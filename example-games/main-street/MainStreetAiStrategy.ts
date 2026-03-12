/**
 * AI strategies for Main Street.
 *
 * Provides:
 *   - MainStreetAiStrategy interface: chooseAction(state, rng)
 *   - enumerateLegalActions(state): all valid PlayerAction options
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

/** Weight applied to upgrade income bonus in scoring (higher = prefer better income). */
const UPGRADE_INCOME_WEIGHT = 10;

/** Weight applied to base income when scoring business placement. */
const BASE_INCOME_WEIGHT = 5;

/** Weight applied to synergy gain when scoring business placement. */
const SYNERGY_WEIGHT = 10;

/** Coins-equivalent value of one reputation point when scoring events. */
const REPUTATION_COIN_WEIGHT = 2;

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
  for (const card of state.market.business as BusinessCard[]) {
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
  if (state.heldEvent !== null) {
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
        if (state.gameResult !== 'playing') break;
        action = this.chooseAction(state);
      }

      processEndOfTurn(state);
    }
  }
}

// ── Scoring Helpers ─────────────────────────────────────────

/**
 * Score an upgrade action by the net income gain per coin spent.
 *
 * Higher income bonus upgrades are preferred over cheaper ones.
 */
function scoreUpgradeAction(
  state: MainStreetState,
  action: BuyUpgradeAction,
): number {
  const card = state.market.investments.find(
    c => c.id === action.cardId && c.family === 'upgrade',
  ) as UpgradeCard | undefined;
  if (!card) return 0;

  // Prefer upgrades with higher income bonus; use cost as tiebreaker (cheaper is better)
  return card.incomeBonus * UPGRADE_INCOME_WEIGHT - card.cost;
}

/**
 * Score a business placement by the synergy bonus gained at the target slot.
 *
 * Considers both the new business's synergy with existing neighbors and the
 * increase in neighbor synergies caused by placing the new business.
 *
 * Higher scores indicate better placement (more synergy gained minus cost).
 */
function scoreBusinessAction(
  state: MainStreetState,
  action: BuyBusinessAction,
): number {
  const card = state.market.business.find(c => c.id === action.cardId) as BusinessCard | undefined;
  if (!card) return 0;

  // Simulate placement: clone the grid row, place card, compute synergy gain
  const simulatedGrid = [...state.streetGrid];
  simulatedGrid[action.slotIndex] = card;

  // Synergy for the new card itself
  const newCardSynergy = computeSynergyBonus(
    simulatedGrid,
    action.slotIndex,
    state.config.synergyBonusPerNeighbor,
  );

  // Increase in synergy for existing neighbors
  let neighborSynergyGain = 0;
  for (let i = 0; i < GRID_SIZE; i++) {
    if (i === action.slotIndex) continue;
    if (state.streetGrid[i] === null) continue;
    const before = computeSynergyBonus(state.streetGrid, i, state.config.synergyBonusPerNeighbor);
    const after = computeSynergyBonus(simulatedGrid, i, state.config.synergyBonusPerNeighbor);
    neighborSynergyGain += after - before;
  }

  const totalSynergyGain = newCardSynergy + neighborSynergyGain;

  // Also weight by base income and subtract cost
  return card.baseIncome * BASE_INCOME_WEIGHT + totalSynergyGain * SYNERGY_WEIGHT - card.cost;
}

/**
 * Score an event purchase by its expected net coin return.
 *
 * Investment events with positive coinDelta (relative to cost) are preferred.
 * A score > 0 means the event is worth buying.
 */
function scoreEventAction(
  state: MainStreetState,
  action: BuyEventAction,
): number {
  const card = state.market.investments.find(
    c => c.id === action.cardId && c.family === 'event',
  ) as EventCard | undefined;
  if (!card) return 0;

  // Net value: coinDelta (expected return) minus cost to buy, plus reputation bonus
  return card.coinDelta - card.cost + card.reputationDelta * REPUTATION_COIN_WEIGHT;
}
