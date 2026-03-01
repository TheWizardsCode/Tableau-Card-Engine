/**
 * Main Street: Game Engine
 *
 * Implements the turn flow, phase transitions, core action handlers,
 * event resolution, win/loss detection, and score calculation.
 *
 * The walking skeleton uses a simplified 6-phase turn structure:
 *   DayStart -> MarketPhase -> EventResolution -> IncomePhase -> NightEventPhase -> EndCheck
 *
 * All functions mutate state in-place (following engine conventions).
 *
 * @module
 */

import type { MainStreetState, DayPhase } from './MainStreetState';
import { PHASE_ORDER } from './MainStreetState';
import type { EventCard, SynergyType } from './MainStreetCards';
import {
  MAX_TURNS,
  WIN_THRESHOLD,
  REPUTATION_SCORE_MULTIPLIER,
  CHALLENGE_BONUS_POINTS,
} from './MainStreetCards';
import { applyIncome, type IncomeResult } from './MainStreetAdjacency';
import {
  purchaseBusiness,
  purchaseUpgrade,
  purchaseEvent,
  refillAllMarkets,
  type PurchaseResult,
} from './MainStreetMarket';

// ── Action Types ────────────────────────────────────────────

/** Buy a business card and place it on a grid slot. */
export interface BuyBusinessAction {
  type: 'buy-business';
  cardId: string;
  slotIndex: number;
}

/** Buy an upgrade card and apply it to a business. */
export interface BuyUpgradeAction {
  type: 'buy-upgrade';
  cardId: string;
  targetSlot?: number;
}

/** Buy a day-trigger event card. */
export interface BuyEventAction {
  type: 'buy-event';
  cardId: string;
}

/** End the current market/action phase. */
export interface EndTurnAction {
  type: 'end-turn';
}

/** Union of all player actions. */
export type PlayerAction =
  | BuyBusinessAction
  | BuyUpgradeAction
  | BuyEventAction
  | EndTurnAction;

// ── Turn Result ─────────────────────────────────────────────

/** Result returned after processing a full turn cycle. */
export interface TurnResult {
  /** Income earned during the income phase. */
  income: IncomeResult | null;
  /** Night event drawn and resolved (if any). */
  nightEvent: EventCard | null;
  /** Current game result after the turn. */
  gameResult: 'playing' | 'win' | 'loss';
  /** Current final score. */
  finalScore: number;
}

// ── Score Calculation ───────────────────────────────────────

/**
 * Computes the final score.
 * Formula: coins + (reputation * 5) + (challengesCompleted * 10)
 */
export function computeScore(state: MainStreetState): number {
  return (
    state.resourceBank.coins +
    state.resourceBank.reputation * REPUTATION_SCORE_MULTIPLIER +
    state.challengesCompleted.length * CHALLENGE_BONUS_POINTS
  );
}

/**
 * Updates the finalScore field on the state.
 */
export function updateScore(state: MainStreetState): void {
  state.finalScore = computeScore(state);
}

// ── Phase Transitions ───────────────────────────────────────

/**
 * Advances the game to the next phase in the turn cycle.
 * After EndCheck, wraps back to DayStart (next turn).
 */
export function advancePhase(state: MainStreetState): void {
  const currentIndex = PHASE_ORDER.indexOf(state.phase);
  if (currentIndex === -1) {
    throw new Error(`Unknown phase: ${state.phase}`);
  }
  const nextIndex = (currentIndex + 1) % PHASE_ORDER.length;
  state.phase = PHASE_ORDER[nextIndex];
}

/**
 * Sets the phase to a specific value (for internal use).
 */
export function setPhase(state: MainStreetState, phase: DayPhase): void {
  state.phase = phase;
}

// ── Action Execution ────────────────────────────────────────

/**
 * Validates and executes a player action during the MarketPhase.
 *
 * @param state   Current game state (mutated in-place).
 * @param action  The player action to execute.
 * @returns PurchaseResult for buy actions, or null for end-turn.
 * @throws Error if the action is illegal or out of phase.
 */
export function executeAction(
  state: MainStreetState,
  action: PlayerAction,
): PurchaseResult | null {
  if (state.gameResult !== 'playing') {
    throw new Error('Game is over. No more actions allowed.');
  }

  if (action.type === 'end-turn') {
    if (state.phase !== 'MarketPhase') {
      throw new Error(`Cannot end turn during ${state.phase}. Must be in MarketPhase.`);
    }
    return null;
  }

  if (state.phase !== 'MarketPhase') {
    throw new Error(`Cannot perform ${action.type} during ${state.phase}. Must be in MarketPhase.`);
  }

  switch (action.type) {
    case 'buy-business':
      return purchaseBusiness(state, action.cardId, action.slotIndex);
    case 'buy-upgrade':
      return purchaseUpgrade(state, action.cardId, action.targetSlot);
    case 'buy-event':
      return purchaseEvent(state, action.cardId);
    default:
      throw new Error(`Unknown action type: ${(action as PlayerAction).type}`);
  }
}

// ── Event Resolution ────────────────────────────────────────

/**
 * Resolves a single event card's effects on the game state.
 *
 * For the walking skeleton, events have direct coin/reputation deltas.
 * SpecificSynergy events apply their coinDelta to each matching business
 * (simplified: apply delta once per matching placed business).
 * All/other events apply the delta directly to the resource bank.
 */
export function resolveEvent(state: MainStreetState, event: EventCard): void {
  switch (event.target) {
    case 'SpecificSynergy': {
      // Count matching businesses and apply coinDelta per match
      const matchCount = state.streetGrid.filter(
        b => b !== null && b.synergyTypes.includes(event.targetSynergy as SynergyType),
      ).length;
      state.resourceBank.coins += event.coinDelta * matchCount;
      state.resourceBank.reputation += event.reputationDelta;
      break;
    }
    case 'All': {
      // Apply to all -- direct delta on resource bank
      state.resourceBank.coins += event.coinDelta;
      state.resourceBank.reputation += event.reputationDelta;
      break;
    }
    case 'RandomBusiness': {
      // Pick a random placed business and apply effect
      const placed = state.streetGrid.filter(b => b !== null);
      if (placed.length > 0) {
        // Use RNG for deterministic random selection
        // Consume RNG for deterministic selection (used in future milestones)
        const _targetIdx = Math.floor(state.rng() * placed.length);
        void _targetIdx;
        state.resourceBank.coins += event.coinDelta;
      }
      state.resourceBank.reputation += event.reputationDelta;
      break;
    }
  }
}

/**
 * Resolves all pending day events (purchased during MarketPhase).
 * Clears the pendingEvents array afterward.
 */
export function resolveDayEvents(state: MainStreetState): EventCard[] {
  const resolved = [...state.pendingEvents];
  for (const event of resolved) {
    resolveEvent(state, event);
  }
  state.pendingEvents = [];
  return resolved;
}

/**
 * Draws and resolves one night event from the event deck.
 * Night events are drawn automatically (not purchased).
 * Returns the drawn event or null if the deck is empty.
 */
export function resolveNightEvent(state: MainStreetState): EventCard | null {
  // Find a Night-trigger event in the deck
  const nightIdx = state.decks.event.findIndex(e => e.trigger === 'Night');
  if (nightIdx === -1) return null;

  // Remove from deck
  const [event] = state.decks.event.splice(nightIdx, 1);
  resolveEvent(state, event);
  return event;
}

// ── Win/Loss Detection ──────────────────────────────────────

/**
 * Checks for immediate loss conditions (can happen mid-turn).
 * - Bankruptcy: coins < 0
 * - Reputation collapse: reputation <= 0 (but not on turn 1 where it starts at 0)
 *
 * @returns true if a loss condition was detected and set.
 */
export function checkImmediateLoss(state: MainStreetState): boolean {
  if (state.resourceBank.coins < 0) {
    state.gameResult = 'loss';
    state.endReason = 'bankruptcy';
    updateScore(state);
    return true;
  }

  // Reputation collapse: only after turn 1 (reputation starts at 0)
  if (state.turn > 1 && state.resourceBank.reputation <= 0) {
    state.gameResult = 'loss';
    state.endReason = 'reputation_collapse';
    updateScore(state);
    return true;
  }

  return false;
}

/**
 * Checks for end-of-turn win/loss conditions (at EndCheck phase).
 *
 * Win conditions (checked in order):
 * 1. Score threshold: finalScore >= WIN_THRESHOLD
 * 2. All challenges complete (not implemented in walking skeleton)
 * 3. Turn 20 with positive reputation and coins >= 0
 *
 * Loss conditions:
 * 1. Bankruptcy (already checked by checkImmediateLoss)
 * 2. Reputation collapse (already checked)
 * 3. Turn exhaustion: turn >= MAX_TURNS and no win condition met
 *
 * @returns true if a game-ending condition was detected.
 */
export function checkEndConditions(state: MainStreetState): boolean {
  // First check immediate loss conditions
  if (checkImmediateLoss(state)) return true;

  // Compute current score
  updateScore(state);

  // Win: score threshold
  if (state.finalScore >= WIN_THRESHOLD) {
    state.gameResult = 'win';
    state.endReason = 'score_threshold';
    return true;
  }

  // Win: all challenges complete (walking skeleton has no challenges yet)
  // if (state.challengesCompleted.length >= TOTAL_CHALLENGES) { ... }

  // Turn limit reached
  if (state.turn >= MAX_TURNS) {
    // Turn-limit victory: positive reputation and coins >= 0
    if (state.resourceBank.reputation > 0 && state.resourceBank.coins >= 0) {
      state.gameResult = 'win';
      state.endReason = 'turn_limit_victory';
      return true;
    }

    // Turn exhaustion: no win condition met
    state.gameResult = 'loss';
    state.endReason = 'turn_exhaustion';
    return true;
  }

  return false;
}

// ── Full Turn Execution ─────────────────────────────────────

/**
 * Executes the DayStart phase:
 * - Increments turn counter (except turn 1).
 * - Refills the market.
 * - Transitions to MarketPhase.
 */
export function executeDayStart(state: MainStreetState): void {
  if (state.phase !== 'DayStart') {
    throw new Error(`Expected DayStart phase, got ${state.phase}`);
  }

  // Turn 1 is already set by setup; subsequent turns increment here
  if (state.turn > 1 || state.phase === 'DayStart') {
    // Refill market at start of each day
    refillAllMarkets(state);
  }

  state.phase = 'MarketPhase';
}

/**
 * Processes the end of the MarketPhase (after player clicks End Turn).
 * Runs through all remaining phases automatically:
 *   EventResolution -> IncomePhase -> NightEventPhase -> EndCheck
 *
 * @returns TurnResult with income, night event, and game result.
 */
export function processEndOfTurn(state: MainStreetState): TurnResult {
  if (state.phase !== 'MarketPhase') {
    throw new Error(`Cannot end turn during ${state.phase}. Must be in MarketPhase.`);
  }

  // Phase: EventResolution
  state.phase = 'EventResolution';
  resolveDayEvents(state);

  // Check for immediate loss after events
  if (checkImmediateLoss(state)) {
    return {
      income: null,
      nightEvent: null,
      gameResult: state.gameResult,
      finalScore: state.finalScore,
    };
  }

  // Phase: IncomePhase
  state.phase = 'IncomePhase';
  const income = applyIncome(state);

  // Phase: NightEventPhase
  state.phase = 'NightEventPhase';
  const nightEvent = resolveNightEvent(state);

  // Check for immediate loss after night event
  if (checkImmediateLoss(state)) {
    return {
      income,
      nightEvent,
      gameResult: state.gameResult,
      finalScore: state.finalScore,
    };
  }

  // Phase: EndCheck
  state.phase = 'EndCheck';
  checkEndConditions(state);

  // If game continues, advance to next turn
  if (state.gameResult === 'playing') {
    state.turn += 1;
    state.phase = 'DayStart';
  }

  return {
    income,
    nightEvent,
    gameResult: state.gameResult,
    finalScore: state.finalScore,
  };
}

/**
 * Runs a complete turn cycle:
 * 1. DayStart (refill market)
 * 2. Execute all player actions
 * 3. Process end of turn (events, income, night, end check)
 *
 * This is a convenience function for headless/AI gameplay.
 *
 * @param state   Current game state.
 * @param actions List of player actions to execute during MarketPhase.
 * @returns TurnResult.
 */
export function executeFullTurn(
  state: MainStreetState,
  actions: PlayerAction[],
): TurnResult {
  // DayStart
  executeDayStart(state);

  // Execute player actions
  for (const action of actions) {
    if (action.type === 'end-turn') break;
    executeAction(state, action);
  }

  // Process end of turn
  return processEndOfTurn(state);
}
