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
import { PHASE_ORDER, addLog, syncResourceBankToLedger } from './MainStreetState';
import type { EventCard, SynergyType } from './MainStreetCards';
import { SELL_VALUE_RATIO, isDurationEventCard, type DurationEventCard } from './MainStreetCards';
import { createActiveEffect, decayActiveEffects } from '../../src/core-engine/ActiveEffect';
import { recordMainStreetEvent } from './MainStreetTranscript';
import { applyIncome, type IncomeResult, updateNeighborsOnPlacement, updateNeighborsOnSale } from './MainStreetAdjacency';
import {
  purchaseBusiness,
  purchaseBusinessToHand,
  purchaseUpgrade,
  purchaseEvent,
  refillAllMarkets,
  refillIncidentQueue,
  cycleMarketCards,
  sellBusiness,
  canSellBusiness as canSellBusinessFromMarket,
  type PurchaseResult,
} from './MainStreetMarket';
import { evaluateChallenges } from './MainStreetChallenges';
import { applyReputationMultiplier, reputationCoinMultiplier } from './MainStreetDifficulty';

// Re-export for convenience (tests import from the engine module).
export { reputationCoinMultiplier, applyReputationMultiplier };

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

/** Buy a business card and add it to the player's hand (Multi-Use Card Economy). */
export interface BuyBusinessToHandAction {
  type: 'buy-business-to-hand';
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
  | BuyBusinessToHandAction
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
  /** Challenge IDs that were newly completed during this turn's evaluation. */
  newlyCompletedChallenges: string[];
}

// ── Score Calculation ───────────────────────────────────────

/**
 * Computes the final score.
 * Formula: coins + (reputation * reputationScoreMultiplier) + (challengesCompleted * challengeBonusPoints)
 */
export function computeScore(state: MainStreetState): number {
  // Sync the ledger from resourceBank before reading, to ensure it reflects
  // any direct resourceBank mutations made by tests or external code.
  syncResourceBankToLedger(state);
  // Use shared EconomyLedger for resource values
  return (
    state.ledger.get('coins') +
    state.ledger.get('reputation') * state.config.reputationScoreMultiplier +
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
    case 'buy-business-to-hand':
      return purchaseBusinessToHand(state, action.cardId);
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
  if (coinChange !== 0) parts.push(`${coinChange > 0 ? '+' : ''}${coinChange.toFixed(3)} coins`);
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
 *
 * Positive coin deltas are scaled by the reputation coin multiplier
 * (CG-0MMLR38NJ1N11DOS). Negative deltas (penalties) pass through
 * unchanged.
 */
/**
 * Computes the effective duration for a DurationEventCard by scanning
 * the street grid for Clinic and Medical Center cards.
 *
 * Rules:
 * - Medical Center (upg-medical-center) reduces duration by 3
 * - Clinic (biz-clinic) reduces duration by 2
 * - Only the stronger reduction applies (Medical Center > Clinic)
 * - Minimum duration floor is 1
 *
 * @param baseDuration  Base duration before reductions
 * @param state         Current game state (street grid is scanned)
 * @returns Effective duration after reductions (min 1).
 */
function computeDurationWithClinicReduction(baseDuration: number, state: MainStreetState): number {
  let hasMedicalCenter = false;
  let hasClinic = false;

  for (const slot of state.streetGrid) {
    if (slot === null) continue;
    if (slot.id.startsWith('upg-medical-center')) {
      hasMedicalCenter = true;
    } else if (slot.id.startsWith('biz-clinic')) {
      hasClinic = true;
    }
  }

  let reduction = 0;
  if (hasMedicalCenter) {
    reduction = 3;
  } else if (hasClinic) {
    reduction = 2;
  }

  return Math.max(1, baseDuration - reduction);
}

/**
 * Resolves a single event card's effects on the game state.
 *
 * DurationEventCards branch to ActiveEffect creation instead of applying
 * one-shot coin/reputation deltas. Regular EventCards apply deltas as before.
 */
export function resolveEvent(state: MainStreetState, event: EventCard): void {
  // ── DurationEventCard branch ────────────────────────────────
  if (isDurationEventCard(event)) {
    const dEvent = event as DurationEventCard;

    // Compute effective duration (check clinic/medical center for duration mitigation)
    let effectiveDuration = computeDurationWithClinicReduction(dEvent.duration, state);

    // Create the ActiveEffect
    const effect = createActiveEffect(
      dEvent.effectType,
      dEvent.multiplier,
      effectiveDuration,
      dEvent.id,
      `${dEvent.name}: ${dEvent.effect}`,
    );
    state.activeEffects.push(effect);

    // Log the onset
    const logText = effectiveDuration > 0
      ? `${dEvent.name}: Income reduced to ${Math.round(dEvent.multiplier * 100)}% for ${effectiveDuration} turns`
      : `${dEvent.name}: Resolved with no effect (fully neutralized)`;
    addLog(state, logText, 'loss');

    // Record transcript event
    recordMainStreetEvent({
      type: 'active-effect',
      turn: state.turn,
      effectType: dEvent.effectType,
      sourceEventId: dEvent.id,
      duration: effectiveDuration,
      description: logText,
    });

    syncResourceBankToLedger(state);
    return;
  }

  // ── Regular EventCard resolution ────────────────────────────
  const rep = state.resourceBank.reputation;
  const cfg = state.config;

  switch (event.target) {
    case 'SpecificSynergy': {
      // Count matching businesses and apply coinDelta per match
      const matchCount = state.streetGrid.filter(
        b => b !== null && b.synergyTypes.includes(event.targetSynergy as SynergyType),
      ).length;
      const rawDelta = event.coinDelta * matchCount;
      state.resourceBank.coins += applyReputationMultiplier(rawDelta, rep, cfg);
      state.resourceBank.reputation += event.reputationDelta;
      break;
    }
    case 'All': {
      // Apply to all -- direct delta on resource bank
      state.resourceBank.coins += applyReputationMultiplier(event.coinDelta, rep, cfg);
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
        state.resourceBank.coins += applyReputationMultiplier(event.coinDelta, rep, cfg);
      }
      state.resourceBank.reputation += event.reputationDelta;
      break;
    }
  }

  // Sync shared EconomyLedger after resourceBank mutations
  syncResourceBankToLedger(state);
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
    addLog(state, `Game Over: Bankruptcy (coins: ${state.resourceBank.coins.toFixed(3)})`, 'loss');
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
 * - Refills the market (unless skipMarketRefill is true, e.g., checkpoint resume).
 * - Transitions to MarketPhase.
 *
 * @param state             Current game state (mutated in-place).
 * @param skipMarketRefill  When true, skips refillAllMarkets. Used during
 *                          checkpoint resume to preserve saved market state.
 */
export function executeDayStart(state: MainStreetState, skipMarketRefill: boolean = false): void {
  if (state.phase !== 'DayStart') {
    throw new Error(`Expected DayStart phase, got ${state.phase}`);
  }

  // Turn 1 is already set by setup; subsequent turns increment here
  if (state.turn > 1 || state.phase === 'DayStart') {
    // Refill market at start of each day (skip on checkpoint resume)
    if (!skipMarketRefill) {
      refillAllMarkets(state);
    }
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

  // Cycle unpurchased market cards to discard piles before advancing phases.
  // During the tutorial (before T7 completes), market cycling is skipped to
  // preserve scenario-placed cards (e.g. Local Festival for T7). The
  // `skipMarketCycleOnEndTurn` flag is set by the turn controller when the
  // tutorial is active and the current step requires the scenario cards.
  if (!state.skipMarketCycleOnEndTurn) {
    cycleMarketCards(state);
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
      newlyCompletedChallenges: [],
    };
  }

  // Phase: IncomePhase
  state.phase = 'IncomePhase';
  const income = applyIncome(state);

  // Apply staff card ongoing costs (Multi-Use Card Economy)
  applyStaffOngoingCosts(state);

  // Apply community space ongoing costs (reputation-asset cards, e.g. Library)
  applyCommunitySpaceOngoingCosts(state);

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
      newlyCompletedChallenges: [],
    };
  }

  // Phase: EndCheck
  state.phase = 'EndCheck';

  // Decay active effects (decrement turnsRemaining, remove expired)
  const decayResult = decayActiveEffects(state.activeEffects);
  state.activeEffects = decayResult.active;
  for (const expired of decayResult.expired) {
    addLog(state, `${expired.description} has expired.`, 'neutral');
    recordMainStreetEvent({
      type: 'info',
      turn: state.turn,
      message: `${expired.description} has expired.`,
    });
  }

  // Evaluate challenges before checking end conditions (so score includes any new bonus points)
  const newlyCompletedChallenges = evaluateChallenges(state.activeChallenges, state);

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
    newlyCompletedChallenges,
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

// ── Card Placement & Sell Operations (Multi-Use Card Economy) ─

/**
 * Places a card from the player's hand onto an empty tableau slot.
 * Costs 80% of the card's purchase price.
 *
 * @param state      Current game state (mutated in-place).
 * @param handIndex  Index of the card in state.hand to place.
 * @param slotIndex  Target street grid slot (0-based, must be empty).
 * @throws Error if the hand index is invalid, slot is occupied, or coins insufficient.
 */
export function placeFromHand(
  state: MainStreetState,
  handIndex: number,
  slotIndex: number,
): void {
  const hand = state.hand ?? [];

  // Validate hand index
  if (handIndex < 0 || handIndex >= hand.length) {
    throw new Error(`Invalid hand index: ${handIndex}. Hand has ${hand.length} cards.`);
  }

  const card = hand[handIndex];

  // Validate slot index
  if (slotIndex < 0 || slotIndex >= 10) {
    throw new Error(`Invalid slot index: ${slotIndex}. Must be 0-9.`);
  }

  // Check slot is empty
  if (state.streetGrid[slotIndex] !== null) {
    throw new Error(`Slot ${slotIndex} is already occupied.`);
  }

  // Remove from hand and place on tableau
  hand.splice(handIndex, 1);
  state.streetGrid[slotIndex] = card;

  // Incrementally update the new card's and all affected neighbors' cached values
  updateNeighborsOnPlacement(state, slotIndex);

  addLog(state, `Placed ${card.name} from hand in slot ${slotIndex}`, 'neutral');
}

/**
 * Sells a card from the player's hand for 75% of purchase value.
 * The card goes to the discard pile.
 *
 * @param state      Current game state (mutated in-place).
 * @param handIndex  Index of the card in state.hand to sell.
 * @throws Error if the hand index is invalid.
 */
export function sellFromHand(
  state: MainStreetState,
  handIndex: number,
): void {
  const hand = state.hand ?? [];

  // Validate hand index
  if (handIndex < 0 || handIndex >= hand.length) {
    throw new Error(`Invalid hand index: ${handIndex}. Hand has ${hand.length} cards.`);
  }

  const card = hand[handIndex];

  // Calculate sell value (75% of purchase price)
  const sellValue = Math.floor(card.cost * SELL_VALUE_RATIO);

  // Remove from hand
  hand.splice(handIndex, 1);

  // Credit coins
  state.resourceBank.coins += sellValue;

  // Add to discard pile
  state.discardPile.push(card as any);

  addLog(state, `Sold ${card.name} from hand for +${sellValue} coins`, 'gain');
}

/**
 * Sells a card from the tableau for 75% of purchase value.
 * The card goes to the discard pile and the slot becomes empty.
 *
 * @param state      Current game state (mutated in-place).
 * @param slotIndex  Street grid slot index of the card to sell.
 * @throws Error if the slot is empty or index is invalid.
 */
export function sellFromTableau(
  state: MainStreetState,
  slotIndex: number,
): void {
  // Validate slot index
  if (slotIndex < 0 || slotIndex >= 10) {
    throw new Error(`Invalid slot index: ${slotIndex}. Must be 0-9.`);
  }

  const card = state.streetGrid[slotIndex];

  // Check slot is occupied
  if (card === null) {
    throw new Error(`Slot ${slotIndex} is empty. Nothing to sell.`);
  }

  // Calculate sell value (75% of purchase price)
  const sellValue = Math.floor(card.cost * SELL_VALUE_RATIO);

  // Incrementally update affected neighbors' cached values before removing the card
  // We pass the slot index and sold slot is simulated for the recalculation
  state.soldSlots[slotIndex] = true;
  updateNeighborsOnSale(state, slotIndex);

  // Remove from tableau
  state.streetGrid[slotIndex] = null;
  state.soldSlots[slotIndex] = false;

  // Credit coins
  state.resourceBank.coins += sellValue;

  // Add to discard pile
  state.discardPile.push(card as any);

  addLog(state, `Sold ${card.name} from slot ${slotIndex} for +${sellValue} coins`, 'gain');
}

// ── Legality Checks (Multi-Use Card Economy) ─────────────────

/**
 * Checks whether the card at the given hand index can be placed onto the
 * given tableau slot without mutating state.
 *
 * Validates hand bounds, slot bounds, slot occupancy, and coin sufficiency
 * (a card can only be placed if the player can afford its purchase price).
 *
 * @param state      Current game state (read-only).
 * @param handIndex  Index of the card in state.hand to place.
 * @param slotIndex  Target street grid slot (0-based, must be empty).
 * @returns LegalityResult — `{ legal: true }` if valid, otherwise
 *          `{ legal: false, reason }` describing the violation.
 */
export function canPlaceFromHand(
  state: MainStreetState,
  handIndex: number,
  slotIndex: number,
): import('../../src/rule-engine').LegalityResult {
  const hand = state.hand ?? [];

  // Validate hand index
  if (handIndex < 0 || handIndex >= hand.length) {
    return { legal: false, reason: `Invalid hand index: ${handIndex}. Hand has ${hand.length} cards.` };
  }

  const card = hand[handIndex];

  // Validate slot index
  if (slotIndex < 0 || slotIndex >= 10) {
    return { legal: false, reason: `Invalid slot index: ${slotIndex}. Must be 0-9.` };
  }

  // Check slot is empty
  if (state.streetGrid[slotIndex] !== null) {
    return { legal: false, reason: `Slot ${slotIndex} is already occupied.` };
  }

  // Check coin sufficiency
  if (state.resourceBank.coins < card.cost) {
    return { legal: false, reason: `Insufficient coins to place ${card.name}: need ${card.cost}, have ${state.resourceBank.coins}.` };
  }

  return { legal: true };
}

/**
 * Checks whether the card at the given hand index can be sold from hand
 * without mutating state.
 *
 * Validates hand bounds.
 *
 * @param state      Current game state (read-only).
 * @param handIndex  Index of the card in state.hand to sell.
 * @returns LegalityResult — `{ legal: true }` if valid, otherwise
 *          `{ legal: false, reason }` describing the violation.
 */
export function canSellFromHand(
  state: MainStreetState,
  handIndex: number,
): import('../../src/rule-engine').LegalityResult {
  const hand = state.hand ?? [];

  // Validate hand index
  if (handIndex < 0 || handIndex >= hand.length) {
    return { legal: false, reason: `Invalid hand index: ${handIndex}. Hand has ${hand.length} cards.` };
  }

  return { legal: true };
}

/**
 * Checks whether the card at the given tableau slot can be sold without
 * mutating state.
 *
 * Validates slot bounds and slot occupancy.
 *
 * @param state      Current game state (read-only).
 * @param slotIndex  Street grid slot index of the card to sell.
 * @returns LegalityResult — `{ legal: true }` if valid, otherwise
 *          `{ legal: false, reason }` describing the violation.
 */
export function canSellFromTableau(
  state: MainStreetState,
  slotIndex: number,
): import('../../src/rule-engine').LegalityResult {
  // Validate slot index
  if (slotIndex < 0 || slotIndex >= 10) {
    return { legal: false, reason: `Invalid slot index: ${slotIndex}. Must be 0-9.` };
  }

  // Check slot is occupied
  if (state.streetGrid[slotIndex] === null) {
    return { legal: false, reason: `Slot ${slotIndex} is empty. Nothing to sell.` };
  }

  return { legal: true };
}

// ── Sell Operations (Street Grid) ──────────────────────────────

/**
 * Executes a sell of a business/community-space card from the street grid.
 *
 * The card remains on the grid but is marked as sold and no longer produces
 * income, synergy, or reputation. The player receives
 * `Math.ceil((card.cost + totalUpgradeCost) / 2)` coins.
 *
 * @param state     Current game state (mutated in-place).
 * @param slotIndex Street grid slot index of the card to sell.
 * @throws Error if the slot is empty, already sold, or not in MarketPhase.
 */
export function executeSell(
  state: MainStreetState,
  slotIndex: number,
): void {
  if (state.phase !== 'MarketPhase') {
    throw new Error(`Cannot sell during ${state.phase}. Must be in MarketPhase.`);
  }
  sellBusiness(state, slotIndex);
}

/**
 * Checks whether a business at the given slot can be sold.
 *
 * @param state         Current game state.
 * @param slotIndex     Street grid slot index to check.
 * @param isPlacingMode Whether the player is currently in card-placement mode (selling not allowed).
 * @returns LegalityResult indicating whether the action is permitted.
 */
export function canSellBusiness(
  state: MainStreetState,
  slotIndex: number,
  isPlacingMode: boolean = false,
): import('../../src/rule-engine').LegalityResult {
  return canSellBusinessFromMarket(state, slotIndex, isPlacingMode);
}

// ── Staff Card Operations (Multi-Use Card Economy) ───────────

/**
 * Applies staff card ongoing costs for the current turn.
 * Deducts each active staff card's ongoingCost from coins.
 * If coins are insufficient, deducts what's available (down to 0).
 *
 * @param state  Current game state (mutated in-place).
 */
export function applyStaffOngoingCosts(state: MainStreetState): void {
  const staffCards = state.staffCards ?? [];
  if (staffCards.length === 0) return;

  let totalCost = 0;
  for (const card of staffCards) {
    totalCost += card.ongoingCost;
  }

  if (totalCost > 0) {
    const actualDeduction = Math.min(totalCost, state.resourceBank.coins);
    state.resourceBank.coins -= actualDeduction;
    if (actualDeduction > 0) {
      addLog(state, `Staff costs: -${actualDeduction} coins (${staffCards.length} staff)`, 'loss');
    }
    if (actualDeduction < totalCost) {
      addLog(state, `Insufficient coins for staff costs: owed ${totalCost}, paid ${actualDeduction}`, 'loss');
    }
  }
}

/**
 * Applies community space ongoing costs for the current turn.
 * Deducts each placed community space's `ongoingCost` (e.g. the Library's
 * 0.25 coins/turn running cost) from coins, alongside staff costs.
 * If coins are insufficient, deducts what's available (down to 0).
 *
 * Mirrors {@link applyStaffOngoingCosts} clamping/log conventions.
 *
 * @param state  Current game state (mutated in-place).
 */
export function applyCommunitySpaceOngoingCosts(state: MainStreetState): void {
  const grid = state.streetGrid;

  let totalCost = 0;
  let spaceCount = 0;
  for (const slot of grid) {
    if (!slot || slot.family !== 'community-space') continue;
    const cost = slot.ongoingCost ?? 0;
    if (cost > 0) {
      totalCost += cost;
      spaceCount += 1;
    }
  }
  if (spaceCount === 0) return;

  if (totalCost > 0) {
    const actualDeduction = Math.min(totalCost, state.resourceBank.coins);
    state.resourceBank.coins -= actualDeduction;
    if (actualDeduction > 0) {
      addLog(state, `Community space costs: -${actualDeduction} coins (${spaceCount} spaces)`, 'loss');
    }
    if (actualDeduction < totalCost) {
      addLog(state, `Insufficient coins for community space costs: owed ${totalCost}, paid ${actualDeduction}`, 'loss');
    }
  }
}

/**
 * Lays off (removes) a staff card, decreasing maxHandSize and randomly
 * removing hand cards equal to the staff card's handSlotsAdded.
 *
 * Uses the game's seeded RNG for deterministic random card selection.
 * If hand has fewer cards than slots to remove, all hand cards are removed.
 *
 * @param state    Current game state (mutated in-place).
 * @param cardId   ID of the staff card to lay off (must be in staffCards).
 * @throws Error if the staff card is not found.
 */
export function layoffStaffCard(
  state: MainStreetState,
  cardId: string,
): void {
  const staffIndex = state.staffCards.findIndex(c => c.id === cardId);
  if (staffIndex === -1) {
    throw new Error(`Staff card ${cardId} not found in active staff.`);
  }

  const card = state.staffCards[staffIndex];
  const slotsToRemove = card.handSlotsAdded;

  // Remove the staff card
  state.staffCards.splice(staffIndex, 1);

  // Decrease maxHandSize (minimum 2)
  state.maxHandSize = Math.max(2, state.maxHandSize - slotsToRemove);

  // Randomly remove hand cards equal to slots added (uses seeded RNG)
  const hand = state.hand ?? [];
  const cardsToRemove = Math.min(slotsToRemove, hand.length);

  if (cardsToRemove > 0) {
    // Use Fisher-Yates shuffle on indices for deterministic random selection
    const indices = hand.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(state.rng() * (i + 1));
      const tmp = indices[i];
      indices[i] = indices[j];
      indices[j] = tmp;
    }

    // Remove the first `cardsToRemove` randomly-selected cards
    const toRemove = indices.slice(0, cardsToRemove).sort((a, b) => b - a);
    const removedCards: string[] = [];
    for (const idx of toRemove) {
      removedCards.push(hand[idx].name ?? hand[idx].id);
      hand.splice(idx, 1);
    }

    addLog(state, `Laid off ${card.name}: removed ${cardsToRemove} hand card(s) (${removedCards.join(', ')})`, 'loss');
  } else {
    addLog(state, `Laid off ${card.name}: no hand cards to remove`, 'neutral');
  }

  // Return the staff card to the market
  state.staffCardMarket.push({ ...card });
}
