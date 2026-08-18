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
import { SELL_VALUE_RATIO, GRID_SIZE, isDurationEventCard, type DurationEventCard, type BusinessCard } from './MainStreetCards';
import { createActiveEffect, decayActiveEffects } from '../../src/core-engine/ActiveEffect';
import { recordMainStreetEvent } from './MainStreetTranscript';
import { applyIncome, type IncomeResult, updateNeighborsOnPlacement, updateNeighborsOnSale } from './MainStreetAdjacency';
import {
  purchaseBusiness,
  moveToHand,
  purchaseUpgrade,
  purchaseEvent,
  refillMarket,
  refillIncidentQueue,
  cycleMarketCards,
  playBusinessFromHand,
  playUpgradeFromHand,
  playEventFromHand,
  discardFromHand,
  sellBusiness,
  purchaseStaffCard,
  canSellBusiness as canSellBusinessFromMarket,
  type PurchaseResult,
} from './MainStreetMarket';
import { evaluateChallenges } from './MainStreetChallenges';
import { applyReputationMultiplier, reputationCoinMultiplier } from './MainStreetDifficulty';

// Re-export for convenience (tests import from the engine module).
export { reputationCoinMultiplier, applyReputationMultiplier, cycleMarketCards };

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
  handIndex?: number;
}

/** Move a market card into the hand for free (CG-0MSTOATDT009BRX2). */
export interface MoveToHandAction {
  type: 'move-to-hand';
  cardId: string;
}

/** Play a business/community-space card from the hand onto the street (cost-at-play). */
export interface PlayBusinessFromHandAction {
  type: 'play-business-from-hand';
  handIndex: number;
  slotIndex: number;
}

/** Play an upgrade card from the hand onto a business (cost-at-play). */
export interface PlayUpgradeFromHandAction {
  type: 'play-upgrade-from-hand';
  handIndex: number;
  targetSlot?: number;
}

/** Play an Investment event from the hand (cost-at-play). */
export interface PlayEventFromHandAction {
  type: 'play-event-from-hand';
  handIndex: number;
}

/** Discard a hand card for free during the player's turn. */
export interface DiscardFromHandAction {
  type: 'discard-from-hand';
  handIndex: number;
}

/** Directly buy a business from the market and place it on the street (costs 50% more). */
export interface BuyAndPlaceAction {
  type: 'buy-and-place';
  cardId: string;
  slotIndex: number;
}

/** Hire a staff card from the staff market. */
export interface HireStaffAction {
  type: 'hire-staff';
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
  | MoveToHandAction
  | PlayBusinessFromHandAction
  | PlayUpgradeFromHandAction
  | PlayEventFromHandAction
  | DiscardFromHandAction
  | BuyAndPlaceAction
  | HireStaffAction
  | PlayEventAction
  | EndTurnAction;

// ── Turn Result ─────────────────────────────────────────────

/** Result returned after processing a full turn cycle. */
export interface TurnResult {
  /** Income earned during the income phase. */
  income: IncomeResult | null;
  /** Incident event drawn and resolved (if any). */
  incident: EventCard | null;
  /** Net coin delta from the resolved incident (negative = loss). */
  incidentCoinChange: number;
  /** Net reputation delta from the resolved incident (negative = loss). */
  incidentRepChange: number;
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
    case 'move-to-hand':
      if (state.actionsRemaining <= 0) throw new Error('No actions remaining today. End your turn to start a new day.');
      state.actionsRemaining -= 1;
      return moveToHand(state, action.cardId);
    case 'buy-business':
      if (state.actionsRemaining <= 0) throw new Error('No actions remaining today. End your turn to start a new day.');
      state.actionsRemaining -= 1;
      return purchaseBusiness(state, action.cardId, action.slotIndex);
    case 'play-business-from-hand':
      if (state.actionsRemaining <= 0) throw new Error('No actions remaining today. End your turn to start a new day.');
      state.actionsRemaining -= 1;
      return playBusinessFromHand(state, action.handIndex, action.slotIndex);
    case 'buy-and-place':
      if (state.actionsRemaining <= 0) throw new Error('No actions remaining today. End your turn to start a new day.');
      state.actionsRemaining -= 1;
      return buyAndPlaceBusiness(state, action.cardId, action.slotIndex);
    case 'hire-staff':
      if (state.actionsRemaining <= 0) throw new Error('No actions remaining today. End your turn to start a new day.');
      state.actionsRemaining -= 1;
      return hireStaffCard(state, action.cardId);
    case 'buy-upgrade':
      return purchaseUpgrade(state, action.cardId, action.targetSlot);
    case 'buy-event':
      return purchaseEvent(state, action.cardId);
    case 'play-upgrade-from-hand':
      return playUpgradeFromHand(state, action.handIndex, action.targetSlot);
    case 'play-event-from-hand':
      return playEventFromHand(state, action.handIndex);
    case 'discard-from-hand':
      discardFromHand(state, action.handIndex);
      return null;
    case 'play-event': {
      const handIndex = action.handIndex ?? (state.hand ?? []).findIndex(c => c.family === 'event');
      if (handIndex < 0) {
        throw new Error('No Investment event is currently held in hand.');
      }
      return playEventFromHand(state, handIndex);
    }
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
 * - Reduction applies ONLY to negative effects (multiplier < 1): a Clinic
 *   should shorten a harmful income cut, not a positive boost like
 *   Tourist Season / Community Renovation (Group C, CG-0MSQJ244M0055X7S).
 *
 * @param baseDuration  Base duration before reductions
 * @param state         Current game state (street grid is scanned)
 * @param multiplier    The effect's multiplier; < 1 = negative effect
 * @returns Effective duration after reductions (min 1).
 */
function computeDurationWithClinicReduction(
  baseDuration: number,
  state: MainStreetState,
  multiplier: number,
): number {
  // Positive effects (>= 1) are not shortened by medical coverage.
  if (multiplier >= 1) return baseDuration;

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

    // Compute effective duration (check clinic/medical center for duration
    // mitigation — negative effects only; positive effects keep full duration).
    let effectiveDuration = computeDurationWithClinicReduction(dEvent.duration, state, dEvent.multiplier);

    // Create the ActiveEffect
    const effect = createActiveEffect(
      dEvent.effectType,
      dEvent.multiplier,
      effectiveDuration,
      dEvent.id,
      `${dEvent.name}: ${dEvent.effect}`,
    );
    state.activeEffects.push(effect);

    // Log the onset (generic wording covering both negative cuts and
    // positive boosts — Group C adds positive income-multiplier and
    // rep-multiplier effects).
    const multiplierLabel = Math.round(dEvent.multiplier * 100);
    const what = dEvent.effectType === 'rep-multiplier' ? 'Reputation' : 'Income';
    const logText = effectiveDuration > 0
      ? `${dEvent.name}: ${what} multiplier ${multiplierLabel}% for ${effectiveDuration} turns`
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
 * Plays and resolves an Investment event card from the player's hand.
 * Can only be called during the MarketPhase.
 *
 * @param state      Current game state (mutated in-place).
 * @param handIndex  Optional index of the event card in `state.hand` to play.
 *                   When omitted, the first event-family card in the hand is
 *                   played (backward-compatible with the old single-held-event
 *                   semantics used by tests and the AI).
 * @throws Error if no Investment event is found at the given index / in the hand.
 */
export function playHeldEvent(state: MainStreetState, handIndex?: number): void {
  const hand = state.hand ?? [];
  let index = handIndex;
  if (index === undefined) {
    index = hand.findIndex(c => c.family === 'event');
  }
  if (index === undefined || index < 0 || index >= hand.length) {
    throw new Error('No Investment event is currently held in hand.');
  }
  const card = hand[index];
  if (card.family !== 'event') {
    throw new Error(`Card at hand index ${index} is not an Investment event.`);
  }

  const event = card as EventCard;
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
  hand.splice(index, 1);
}

/**
 * Resolves any remaining Investment event card from the player's hand.
 *
 * NOTE: This is no longer called automatically during processEndOfTurn.
 * Held events persist across turns until the player actively plays them
 * via the 'play-event' action during the MarketPhase. This function is
 * retained for programmatic / test use.
 *
 * @returns The resolved event, or null if no event was in hand.
 */
export function resolveHeldInvestment(state: MainStreetState): EventCard | null {
  const hand = state.hand ?? [];
  const index = hand.findIndex(c => c.family === 'event');
  if (index === -1) return null;

  const event = hand[index] as EventCard;
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
  hand.splice(index, 1);
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
 * 2. Score threshold: finalScore >= config.winThreshold
 * 3. Turn limit (opt-in): turn >= config.maxTurns with positive reputation and
 *    coins >= 0 — only fires when a config explicitly sets `maxTurns`
 *    (default presets impose no turn limit, CG-0MSLXJCHH001DLIO).
 *
 * Loss conditions:
 * 1. Bankruptcy (already checked by checkImmediateLoss)
 * 2. Reputation collapse (already checked)
 * 3. Turn exhaustion (opt-in): turn >= config.maxTurns and no win condition
 *    met — only fires when a config explicitly sets `maxTurns`.
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

  // Turn limit reached (opt-in: only fires when a config explicitly sets
  // maxTurns; default presets are unlimited, CG-0MSLXJCHH001DLIO).
  //
  // Accepted stalemate behaviour: with no turn limit and no deck-exhaustion
  // end condition, a player who keeps coins >= 0 and reputation > 0 can pass
  // turns indefinitely without winning — passive play simply never reaches
  // the score threshold. This is a deliberate design choice (no forced end);
  // the turn-based end path remains available to opt-in configs.
  if (state.config.maxTurns !== undefined && state.turn >= state.config.maxTurns) {
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
 * @param skipMarketRefill  When true, skips refillMarket. Used during
 *                          checkpoint resume to preserve saved market state.
 */
export function executeDayStart(state: MainStreetState, skipMarketRefill: boolean = false): void {
  if (state.phase !== 'DayStart') {
    throw new Error(`Expected DayStart phase, got ${state.phase}`);
  }

  // Turn 1 is already set by setup; subsequent turns increment here
  if (state.turn > 1 || state.phase === 'DayStart') {
    // Refill market at start of each day (skip on checkpoint resume).
    // Top-up semantics: visible cards are preserved (e.g. tutorial scenario
    // cards kept via skipMarketCycleOnEndTurn); an already-full row stays.
    if (!skipMarketRefill) {
      refillMarket(state);
    }
  }

  // Log turn header
  addLog(state, `Turn ${state.turn}`, 'turn-header');

  // Action economy: reset daily action budget.
  // Base 1 action + sum of actionsPerTurn from employed staff cards.
  const gmBonus = (state.staffCards ?? []).reduce((sum, card) => sum + (card.actionsPerTurn ?? 0), 0);
  state.actionsRemaining = 1 + gmBonus;

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
      incidentCoinChange: 0,
      incidentRepChange: 0,
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
  // Capture the incident's own resource deltas (negative = loss) for the
  // incident-reveal presentation (dramatic sting + damage feedback).
  const coinsBeforeIncident = state.resourceBank.coins;
  const repBeforeIncident = state.resourceBank.reputation;
  const incident = resolveIncident(state);
  const incidentCoinChange = state.resourceBank.coins - coinsBeforeIncident;
  const incidentRepChange = state.resourceBank.reputation - repBeforeIncident;

  // Check for immediate loss after incident
  if (checkImmediateLoss(state)) {
    return {
      income,
      incident,
      incidentCoinChange,
      incidentRepChange,
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
    incidentCoinChange,
    incidentRepChange,
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

  // Event and upgrade cards are played from the hand, never placed on the street.
  if (card.family === 'event' || card.family === 'upgrade') {
    throw new Error(`Event and upgrade cards cannot be placed on the street. Play ${card.name} from the hand instead.`);
  }

  // Validate slot index
  if (slotIndex < 0 || slotIndex >= 10) {
    throw new Error(`Invalid slot index: ${slotIndex}. Must be 0-9.`);
  }

  // Check slot is empty
  if (state.streetGrid[slotIndex] !== null) {
    throw new Error(`Slot ${slotIndex} is already occupied.`);
  }

  // Cost-at-play (CG-0MSTOATDT009BRX2): moving a card to hand is free, but
  // placing it on the street pays its listed cost.
  if (state.resourceBank.coins < card.cost) {
    throw new Error(`Not enough coins to place ${card.name}. Need ${card.cost}, have ${state.resourceBank.coins}.`);
  }
  state.resourceBank.coins -= card.cost;

  // Remove from hand and place on tableau
  hand.splice(handIndex, 1);
  state.streetGrid[slotIndex] = card;

  // Incrementally update the new card's and all affected neighbors' cached values
  updateNeighborsOnPlacement(state, slotIndex);

  addLog(state, `Placed ${card.name} from hand in slot ${slotIndex} (-€${card.cost})`, 'loss');
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

  // Event cards are played from the hand, never sold.
  if (card.family === 'event') {
    throw new Error(`Event cards cannot be sold. Play ${card.name} from the hand instead.`);
  }

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

  // Event cards are played from the hand, never placed on the street.
  if (card.family === 'event') {
    return { legal: false, reason: `Event cards cannot be placed on the street. Play ${card.name} from the hand instead.` };
  }

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

  const card = hand[handIndex];

  // Event cards are played from the hand, never sold.
  if (card.family === 'event') {
    return { legal: false, reason: `Event cards cannot be sold. Play ${card.name} from the hand instead.` };
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

// ── Action Economy (CG-0MSTOF1N5005PK2R) ────────────────────

/**
 * Directly buys a business/community-space card from the market and places
 * it on the street grid in a single action, paying a 50% premium over the
 * listed cost (CG-0MSTOF1N5005PK2R). Consumes one daily action.
 *
 * Premium pricing: `Math.ceil(cost * 1.5 * 2) / 2` — the listed cost × 1.5,
 * rounded up to the nearest 0.5 (e.g. 3 → 4.5, 7 → 10.5).
 *
 * @param state     Current game state (mutated in-place).
 * @param cardId    ID of the card in the market.
 * @param slotIndex Target street grid slot (0-based).
 * @returns PurchaseResult on success.
 * @throws Error if the action is illegal.
 */
export function buyAndPlaceBusiness(
  state: MainStreetState,
  cardId: string,
  slotIndex: number,
): PurchaseResult {
  const marketIndex = state.market.cards.findIndex(c => c.id === cardId);
  if (marketIndex === -1) {
    throw new Error(`Card ${cardId} not found in the market.`);
  }

  const card = state.market.cards[marketIndex];
  if (card.family === 'upgrade' || card.family === 'event') {
    throw new Error('Buy-and-place only applies to business and community-space cards.');
  }
  if (slotIndex < 0 || slotIndex >= GRID_SIZE) {
    throw new Error(`Invalid slot index: ${slotIndex}. Must be 0-${GRID_SIZE - 1}.`);
  }
  if (state.streetGrid[slotIndex] !== null) {
    throw new Error(`Slot ${slotIndex} is already occupied.`);
  }

  const premiumCost = Math.ceil(card.cost * 1.5 * 2) / 2;
  if (state.resourceBank.coins < premiumCost) {
    throw new Error(`Not enough coins to buy-and-place ${card.name}. Need ${premiumCost}, have ${state.resourceBank.coins}.`);
  }

  state.resourceBank.coins -= premiumCost;
  state.market.cards.splice(marketIndex, 1);
  state.streetGrid[slotIndex] = card as BusinessCard;

  // Incrementally update the new card's and all affected neighbors' cached values
  updateNeighborsOnPlacement(state, slotIndex);

  addLog(state, `Bought & placed ${card.name} in slot ${slotIndex} (-€${premiumCost}, 50% premium)`, 'loss');

  return { card, cost: premiumCost, refilled: false };
}

/**
 * Hires a staff card from the staff market (CG-0MSTOF1N5005PK2R).
 * Consumes one daily action; delegates to purchaseStaffCard for the
 * coin deduction and hand-size mechanics.
 *
 * @param state  Current game state (mutated in-place).
 * @param cardId ID of the staff card in the staff market.
 * @returns PurchaseResult describing the hire.
 * @throws Error if the card is not found or player cannot afford it.
 */
export function hireStaffCard(state: MainStreetState, cardId: string): PurchaseResult {
  const marketIndex = state.staffCardMarket.findIndex(c => c.id === cardId);
  const card = state.staffCardMarket[marketIndex];
  if (!card) {
    throw new Error(`Staff card ${cardId} not found in the market.`);
  }
  purchaseStaffCard(state, cardId);
  return { card, cost: card.cost, refilled: false };
}
