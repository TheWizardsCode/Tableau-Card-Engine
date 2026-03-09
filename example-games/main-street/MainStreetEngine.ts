/**
 * Main Street: Game Engine
 *
 * Implements the turn flow, phase transitions, core action handlers,
 * event resolution, win/loss detection, and score calculation.
 *
 * The walking skeleton uses a simplified 6-phase turn structure:
 *   DayStart -> MarketPhase -> InvestmentResolution -> IncomePhase -> IncidentPhase -> EndCheck
 *
 * Held Investment events are NOT auto-resolved. The player must actively play
 * them by clicking during the MarketPhase. Unplayed events persist across turns.
 *
 * All functions mutate state in-place (following engine conventions).
 *
 * @module
 */

import type { MainStreetState, DayPhase } from './MainStreetState';
import { PHASE_ORDER, addLog } from './MainStreetState';
import type { EventCard, SynergyType } from './MainStreetCards';
import { applyIncome, type IncomeResult } from './MainStreetAdjacency';
import {
  purchaseBusiness,
  purchaseUpgrade,
  purchaseEvent,
  refillAllMarkets,
  refillIncidentQueue,
  type PurchaseResult,
} from './MainStreetMarket';
import { evaluateChallenges } from './MainStreetChallenges';

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

/** Buy an Investment-trigger event card (held until played). */
export interface BuyEventAction {
  type: 'buy-event';
  cardId: string;
}

/** Play the currently held Investment event. */
export interface PlayEventAction {
  type: 'play-event';
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
  | PlayEventAction
  | EndTurnAction;

// ── Turn Result ─────────────────────────────────────────────

/** Result returned after processing a full turn cycle. */
export interface TurnResult {
  /** Income earned during the income phase. */
  income: IncomeResult | null;
  /** Incident event drawn and resolved (if any). */
  incident: EventCard | null;
  /** Current game result after the turn. */
  gameResult: 'playing' | 'win' | 'loss';
  /** Current final score. */
  finalScore: number;
}

// ── Score Calculation ───────────────────────────────────────

/**
 * Computes the final score.
 * Formula: coins + (reputation * reputationScoreMultiplier) + (challengesCompleted * challengeBonusPoints)
 */
export function computeScore(state: MainStreetState): number {
  return (
    state.resourceBank.coins +
    state.resourceBank.reputation * state.config.reputationScoreMultiplier +
    state.challengesCompleted.length * state.config.challengeBonusPoints
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
 * @returns PurchaseResult for buy actions, or null for end-turn / play-event.
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
    case 'play-event':
      playHeldEvent(state);
      return null;
    default:
      throw new Error(`Unknown action type: ${(action as PlayerAction).type}`);
  }
}

// ── Event Resolution ────────────────────────────────────────

/**
 * Builds a human-readable effect description for event log entries.
 */
function describeEventEffects(coinChange: number, repChange: number): string {
  const parts: string[] = [];
  if (coinChange !== 0) parts.push(`${coinChange > 0 ? '+' : ''}${coinChange} coins`);
  if (repChange !== 0) parts.push(`${repChange > 0 ? '+' : ''}${repChange} rep`);
  return parts.length > 0 ? parts.join(', ') : 'no effect';
}

/**
 * Classifies a coin/rep change as gain, loss, or neutral for log coloring.
 */
function classifyEffect(coinChange: number, repChange: number): 'gain' | 'loss' | 'neutral' {
  const net = coinChange + repChange;
  if (net > 0) return 'gain';
  if (net < 0) return 'loss';
  return 'neutral';
}

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
 * Plays and resolves the currently held Investment event.
 * Can only be called during the MarketPhase.
 *
 * @throws Error if no Investment event is held.
 */
export function playHeldEvent(state: MainStreetState): void {
  if (state.heldEvent === null) {
    throw new Error('No Investment event is currently held.');
  }

  const event = state.heldEvent;
  const coinsBefore = state.resourceBank.coins;
  const repBefore = state.resourceBank.reputation;
  resolveEvent(state, event);
  const coinChange = state.resourceBank.coins - coinsBefore;
  const repChange = state.resourceBank.reputation - repBefore;
  addLog(
    state,
    `Investment: ${event.name} (${describeEventEffects(coinChange, repChange)})`,
    classifyEffect(coinChange, repChange),
  );
  state.heldEvent = null;
}

/**
 * Resolves any remaining held Investment event.
 *
 * NOTE: This is no longer called automatically during processEndOfTurn.
 * Held events persist across turns until the player actively plays them
 * via the 'play-event' action during the MarketPhase. This function is
 * retained for programmatic / test use.
 *
 * @returns The resolved event, or null if no event was held.
 */
export function resolveHeldInvestment(state: MainStreetState): EventCard | null {
  if (state.heldEvent === null) return null;

  const event = state.heldEvent;
  const coinsBefore = state.resourceBank.coins;
  const repBefore = state.resourceBank.reputation;
  resolveEvent(state, event);
  const coinChange = state.resourceBank.coins - coinsBefore;
  const repChange = state.resourceBank.reputation - repBefore;
  addLog(
    state,
    `Investment (auto): ${event.name} (${describeEventEffects(coinChange, repChange)})`,
    classifyEffect(coinChange, repChange),
  );
  state.heldEvent = null;
  return event;
}

/**
 * Resolves the front Incident event from the incident queue (FIFO).
 * After resolving, draws a replacement Incident from the event deck.
 * Returns the resolved event or null if the queue is empty.
 */
export function resolveIncident(state: MainStreetState): EventCard | null {
  // Pop front of the incident queue
  if (state.incidentQueue.length === 0) return null;
  const event = state.incidentQueue.shift()!;

  const coinsBefore = state.resourceBank.coins;
  const repBefore = state.resourceBank.reputation;
  resolveEvent(state, event);
  const coinChange = state.resourceBank.coins - coinsBefore;
  const repChange = state.resourceBank.reputation - repBefore;
  addLog(
    state,
    `Incident: ${event.name} (${describeEventEffects(coinChange, repChange)})`,
    classifyEffect(coinChange, repChange),
  );

  // Draw replacement from deck (only Incident-trigger cards)
  refillIncidentQueue(state);

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
    addLog(state, `Game Over: Bankruptcy (coins: ${state.resourceBank.coins})`, 'loss');
    return true;
  }

  // Reputation collapse: only after turn 1 (reputation starts at 0)
  if (state.turn > 1 && state.resourceBank.reputation <= 0) {
    state.gameResult = 'loss';
    state.endReason = 'reputation_collapse';
    updateScore(state);
    addLog(state, `Game Over: Reputation collapse (rep: ${state.resourceBank.reputation})`, 'loss');
    return true;
  }

  return false;
}

/**
 * Checks for end-of-turn win/loss conditions (at EndCheck phase).
 *
 * Win conditions (checked in order):
 * 1. All challenges complete (activeChallenges.length > 0 and all completed)
 * 2. Score threshold: finalScore >= WIN_THRESHOLD
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

  // Win: all challenges complete (only if there are active challenges)
  if (
    state.activeChallenges.length > 0 &&
    state.activeChallenges.every(ac => ac.completed)
  ) {
    state.gameResult = 'win';
    state.endReason = 'all_challenges';
    addLog(state, 'Victory: All challenges completed!', 'gain');
    return true;
  }

  // Win: score threshold
  if (state.finalScore >= state.config.winThreshold) {
    state.gameResult = 'win';
    state.endReason = 'score_threshold';
    addLog(state, `Victory: Score threshold reached (${state.finalScore} pts)`, 'gain');
    return true;
  }

  // Turn limit reached
  if (state.turn >= state.config.maxTurns) {
    // Turn-limit victory: positive reputation and coins >= 0
    if (state.resourceBank.reputation > 0 && state.resourceBank.coins >= 0) {
      state.gameResult = 'win';
      state.endReason = 'turn_limit_victory';
      addLog(state, `Victory: Survived ${state.config.maxTurns} turns (${state.finalScore} pts)`, 'gain');
      return true;
    }

    // Turn exhaustion: no win condition met
    state.gameResult = 'loss';
    state.endReason = 'turn_exhaustion';
    addLog(state, `Game Over: Turn limit exhausted`, 'loss');
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

  // Log turn header
  addLog(state, `Turn ${state.turn}`, 'turn-header');

  state.phase = 'MarketPhase';
}

/**
 * Processes the end of the MarketPhase (after player clicks End Turn).
 * Runs through all remaining phases automatically:
 *   InvestmentResolution -> IncomePhase -> IncidentPhase -> EndCheck
 *
 * @returns TurnResult with income, incident, and game result.
 */
export function processEndOfTurn(state: MainStreetState): TurnResult {
  if (state.phase !== 'MarketPhase') {
    throw new Error(`Cannot end turn during ${state.phase}. Must be in MarketPhase.`);
  }

  // Phase: InvestmentResolution
  // Held Investment events are NO LONGER auto-resolved. The player must
  // actively play them by clicking during the MarketPhase. Unplayed events
  // persist across turns.
  state.phase = 'InvestmentResolution';

  // Check for immediate loss after events
  if (checkImmediateLoss(state)) {
    return {
      income: null,
      incident: null,
      gameResult: state.gameResult,
      finalScore: state.finalScore,
    };
  }

  // Phase: IncomePhase
  state.phase = 'IncomePhase';
  const income = applyIncome(state);

  // Phase: IncidentPhase
  state.phase = 'IncidentPhase';
  const incident = resolveIncident(state);

  // Check for immediate loss after incident
  if (checkImmediateLoss(state)) {
    return {
      income,
      incident,
      gameResult: state.gameResult,
      finalScore: state.finalScore,
    };
  }

  // Phase: EndCheck
  state.phase = 'EndCheck';

  // Evaluate challenges before checking end conditions (so score includes any new bonus points)
  evaluateChallenges(state.activeChallenges, state);

  checkEndConditions(state);

  // If game continues, advance to next turn
  if (state.gameResult === 'playing') {
    state.turn += 1;
    state.phase = 'DayStart';
  }

  return {
    income,
    incident,
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
