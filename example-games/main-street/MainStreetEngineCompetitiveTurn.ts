/**
 * Main Street: Competitive Turn Orchestration
 *
 * Competitive day-start/market alternation and the per-owner closing phases.
 *
 * @module
 */

import { executeAction } from './MainStreetEngineActions';
import { applyBusinessOngoingCosts, applyCommunitySpaceOngoingCosts, applyCompetitiveOngoingCosts, applyStaffOngoingCosts } from './MainStreetEngineCommands';
import { executeWeekStart } from './MainStreetEngineWeekStart';
import { applyCompetitiveEventEffects } from './MainStreetEngineEvents';
import { decideEventChoice, updateCompetitiveScores } from './MainStreetEngineScoring';
import { appendTurnNetRow, checkCompetitiveEndConditions, checkImmediateLoss, processEndOfTurn, resolveEventChoice, resolveIncident, resolvePendingEventChoice } from './MainStreetEngineTurnClosing';
import { PlayerAction, TurnResult } from './MainStreetEngineTypes';
import { decayActiveEffects } from '@core-engine/ActiveEffect';
import { applyIncome, applyCompetitiveIncome } from './MainStreetAdjacency';
import type { IncomeResult } from './MainStreetAdjacency';
import type { EventCard } from './MainStreetCards';
import { evaluateChallenges } from './MainStreetChallenges';
import type { MainStreetState } from './MainStreetState';
import { addLog, advanceWeek } from './MainStreetState';
import { recordMainStreetEvent } from './MainStreetTranscript';

/**
 * Begins the shared day (CG-0MT5X3GMA007EG30): refills the shared market,
 * resets the shared action budgets and peek/favour gates, and arms the
 * first player's MarketPhase. Competitive winner is cleared. In
 * single-player the behaviour is identical to executeWeekStart.
 */
export function executeCompetitiveWeekStart(
  state: MainStreetState,
  skipMarketRefill: boolean = false,
): void {
  executeWeekStart(state, skipMarketRefill);
  if (state.players && state.players.length > 0) {
    state.activePlayerId = 0;
    // Per-player action budgets: reset each day from staff actions + bank.
    for (const p of state.players) {
      const bonus = (p.staffCards ?? []).reduce((s, c) => s + (c.actionsPerTurn ?? 0), 0);
      p.actionBudget = 1 + bonus + Math.min(2, state.bankedActions ?? 0);
    }
    state.competitiveWinnerId = null;
  }
}

/**
 * The active player within the shared day (read-only). 0 in single-player
 * (when players[] is absent). Exposed for scene/AI turn alternation.
 */
export function getActivePlayerId(state: MainStreetState): number {
  return state.activePlayerId ?? 0;
}

/** Sets the active player (internal use; tests may set it directly). */

export function setActivePlayerId(state: MainStreetState, playerId: number): void {
  if (state.players && (playerId < 0 || playerId >= state.players.length)) {
    throw new Error(`activePlayerId ${playerId} out of range (0..${state.players.length - 1})`);
  }
  state.activePlayerId = playerId;
}

/**
 * Ends one player's MarketPhase within the shared day.
 *
 * Invariant: must be called when phase is MarketPhase and the active
 * player's actions are consumed. Advances activePlayerId (round-robins
 * across PlayerRecord[]) and either arms the next player's MarketPhase
 * or transitions to InvestmentResolution so shared closing phases run once
 * after every player has acted. Does NOT run Income/Incident/EndCheck
 * — call resolveCompetitiveClosingPhases after the final player.
 *
 * Single-player (no players[]): throws — use processEndOfTurn instead.
 */
export function endCompetitiveMarketTurn(state: MainStreetState): void {
  if (state.phase !== 'MarketPhase') {
    throw new Error(`Cannot end turn during ${state.phase}. Must be in MarketPhase.`);
  }
  if (!state.players || state.players.length === 0) {
    throw new Error('endCompetitiveMarketTurn requires competitive state (players)');
  }
  const n = state.players.length;
  const cur = state.activePlayerId ?? 0;
  const next = cur + 1;
  if (next < n) {
    state.activePlayerId = next;
    state.phase = 'MarketPhase';
  } else {
    state.phase = 'InvestmentResolution';
  }
}

/**
 * Resolves the shared closing phases (InvestmentResolution → IncomePhase
 * → IncidentPhase → EndCheck) once after every player has alternated
 * through MarketPhases within the shared day (CG-0MT5X3GMA007EG30).
 *
 * Precondition: phase is InvestmentResolution and competitive state has
 * players[]. Delegates income/incident/event routing to the sibling
 * (per-owner application) — here it runs the existing shared effects
 * plus the competitive first-to-threshold EndCheck.
 *
 * Postcondition: on continue, phase becomes WeekStart (next shared day)
 * and activePlayerId resets to 0; on game over, phase remains EndCheck
 * and competitiveWinnerId records the first-to-threshold winner.
 */

/**
 * Convenience: runs a full shared day (CG-0MT5X3GMA007EG30).
 *
 * Sequences WeekStart → N alternating MarketPhases (each driven by
 * `playerActions[playerId]` then endCompetitiveMarketTurn) → shared
 * closing phases. Shared market/decks/incidentDeck are unchanged.
 *
 * Example (N=2, producer-confirmed Option A):
 *   Turn 1: WeekStart → P0-Market → P1-Market → Income → Incident → EndCheck → WeekStart(next)
 *
 * N=1 collapses to the single-player path (executeWeekStart + processEndOfTurn).
 */
export function executeCompetitiveTurn(
  state: MainStreetState,
  playerActions: PlayerAction[][],
): TurnResult {
  executeCompetitiveWeekStart(state);
  const n = state.players?.length ?? 1;

  // Accumulate challenges completed mid-action by per-action evaluation
  // (CG-0MU37CKRR008252I) across every player's MarketPhase, then surface
  // them through the returned TurnResult alongside the closing-phase
  // completions (de-duplicated defensively).
  const midTurnCompleted: string[] = [];
  const runActions = (actions: PlayerAction[] | undefined): void => {
    for (const action of actions ?? []) {
      if (action.type === 'end-turn') break;
      executeAction(state, action);
      if (state._newlyCompletedThisAction?.length) {
        midTurnCompleted.push(...state._newlyCompletedThisAction);
      }
    }
  };

  if (n === 1) {
    runActions(playerActions[0]);
    return mergeMidTurnChallenges(processEndOfTurn(state), midTurnCompleted);
  }
  for (let playerId = 0; playerId < n; playerId++) {
    state.phase = 'MarketPhase';
    state.activePlayerId = playerId;
    runActions(playerActions[playerId]);
    if (playerId < n - 1) {
      endCompetitiveMarketTurn(state);
    }
  }
  // Final player's Market must advance to InvestmentResolution before closing.
  if (state.phase === 'MarketPhase') {
    endCompetitiveMarketTurn(state);
  }
  return mergeMidTurnChallenges(resolveCompetitiveClosingPhases(state), midTurnCompleted);
}

/**
 * Merges mid-turn challenge completions into a TurnResult's
 * `newlyCompletedChallenges` (de-duplicated), returning the same result
 * object for convenience. No-op when nothing completed mid-turn.
 */
function mergeMidTurnChallenges(
  result: TurnResult,
  midTurnCompleted: string[],
): TurnResult {
  if (midTurnCompleted.length > 0) {
    result.newlyCompletedChallenges = [
      ...new Set([...midTurnCompleted, ...result.newlyCompletedChallenges]),
    ];
  }
  return result;
}

/**
 * Competitive closing tail (IncidentPhase → EndCheck) shared by the normal
 * shared-day closing and the deferred dual-choice resume
 * (CG-0MTIILDBB001F01S). Runs the immediate-loss check, EndCheck (decay,
 * challenges, first-to-threshold), next-day advance, net row, and per-player
 * score refresh. Extracted verbatim from `resolveCompetitiveClosingPhases` so
 * `resolveCompetitivePendingChoice` can complete a paused closing without
 * re-running the income phase.
 */
function finishCompetitiveClosingTail(
  state: MainStreetState,
  income: IncomeResult | null,
  incident: EventCard | null,
  incidentCoinChange: number,
  incidentRepChange: number,
  turnEnded: number,
): TurnResult {
  if (checkImmediateLoss(state)) {
    appendTurnNetRow(state, turnEnded);
    return {
      income,
      incident,
      incidentCoinChange,
      incidentRepChange,
      gameResult: state.gameResult,
      finalScore: state.finalScore,
      newlyCompletedChallenges: [],
      choicePending: false,
    };
  }
  state.phase = 'EndCheck';
  const decayResult = decayActiveEffects(state.activeEffects);
  state.activeEffects = decayResult.active;
  for (const expired of decayResult.expired) {
    addLog(state, `${expired.description} has expired.`, 'neutral');
    recordMainStreetEvent({ type: 'info', turn: state.turn, message: `${expired.description} has expired.` });
  }
  const newlyCompletedChallenges = evaluateChallenges(state.activeChallenges, state);
  checkCompetitiveEndConditions(state);
  if (state.gameResult === 'playing') {
    state.turn += 1;
    advanceWeek(state);
    const bankable = Math.min(state.actionsRemaining, 1);
    state.bankedActions = Math.min(2, (state.bankedActions ?? 0) + bankable);
    // Mirror shared banked value into each player's budget for next week's costing.
    // (Per-player budgets are re-derived from staff+bank at next week start.)
    state.phase = 'WeekStart';
    state.activePlayerId = 0;
  }
  appendTurnNetRow(state, turnEnded);
  // Keep per-player scores fresh for callers that read them after resolution.
  updateCompetitiveScores(state);
  return {
    income,
    incident,
    incidentCoinChange,
    incidentRepChange,
    gameResult: state.gameResult,
    finalScore: state.finalScore,
    newlyCompletedChallenges,
    choicePending: false,
  };
}

export function resolveCompetitiveClosingPhases(state: MainStreetState): TurnResult {
  // AC7 guard (CG-0MTSHG8RP008E128): a pending unresolved choice blocks the
  // shared closing sequence regardless of mode.
  if (state.pendingEventChoice && !state.pendingEventChoice.resolved) {
    return {
      income: null,
      incident: null,
      incidentCoinChange: 0,
      incidentRepChange: 0,
      gameResult: state.gameResult,
      finalScore: state.finalScore,
      newlyCompletedChallenges: [],
      choicePending: true,
    };
  }
  if (state.phase !== 'InvestmentResolution') {
    throw new Error(`resolveCompetitiveClosingPhases requires InvestmentResolution, got ${state.phase}`);
  }
  if (!state.players || state.players.length === 0) {
    throw new Error('resolveCompetitiveClosingPhases requires competitive state (players)');
  }
  const turnEnded = state.turn;
  if (checkImmediateLoss(state)) {
    appendTurnNetRow(state, turnEnded);
    return {
      income: null,
      incident: null,
      incidentCoinChange: 0,
      incidentRepChange: 0,
      gameResult: state.gameResult,
      finalScore: state.finalScore,
      newlyCompletedChallenges: [],
      choicePending: false,
    };
  }
  state.phase = 'IncomePhase';
  const income = applyIncome(state);
  applyStaffOngoingCosts(state);
  applyCommunitySpaceOngoingCosts(state);
  applyBusinessOngoingCosts(state);
  // Per-owner economy layer (competitive N>=2, CG-0MTIIL6J200291ZQ): in
  // parallel with the shared host wallet above, route income and ongoing
  // costs to each owner's own wallet (ownerTaggedGrid) so per-player
  // economics stay authoritative for scoring / AI / deterministic replay.
  // N=1 never reaches this function via the convenience flow
  // (executeCompetitiveTurn collapses to the legacy single-player path); the
  // guard keeps direct N=1 calls legacy-identical (AC4). Consumes no RNG.
  if ((state.players?.length ?? 0) > 1) {
    applyCompetitiveIncome(state);
    applyCompetitiveOngoingCosts(state);
  }
  state.phase = 'IncidentPhase';
  const coinsBefore = state.resourceBank.coins;
  const repBefore = state.resourceBank.reputation;
  const incident = resolveIncident(state);
  const incidentCoinChange = state.resourceBank.coins - coinsBefore;
  const incidentRepChange = state.resourceBank.reputation - repBefore;
  // Route the resolved shared incident to each owner's wallet per-owner
  // (street-wide resolution semantics retained; CG-0MTIIL6J200291ZQ).
  if ((state.players?.length ?? 0) > 1 && incident) {
    applyCompetitiveEventEffects(state, incident);
  }
  // Dual-choice pause (CG-0MTSHG8RP008E128): resolveIncident deferred the
  // drawn incident; stop before EndCheck and surface choicePending.
  if (state.pendingEventChoice && !state.pendingEventChoice.resolved) {
    return {
      income,
      incident: null,
      incidentCoinChange: 0,
      incidentRepChange: 0,
      gameResult: state.gameResult,
      finalScore: state.finalScore,
      newlyCompletedChallenges: [],
      choicePending: true,
    };
  }
  return finishCompetitiveClosingTail(state, income, incident, incidentCoinChange, incidentRepChange, turnEnded);
}

/**
 * Resolves a pending dual-choice incident drawn during a competitive closing
 * and completes the deferred shared-day closing (CG-0MTIILDBB001F01S).
 *
 * `resolveCompetitiveClosingPhases` pauses at IncidentPhase when the drawn
 * incident requires an Accept/Reject decision. This helper applies the
 * difficulty-based AI policy, routes the accepted effect per-owner (mirroring
 * the non-deferred path), and runs the competitive closing tail — so a
 * head-to-head Monte Carlo / headless day loop never stalls and never falls
 * back to the single-player closing (which reads the shared host wallet).
 *
 * N=1 delegates to `resolvePendingEventChoice` so single-player semantics are
 * unchanged (AC4). No-op when no choice is pending.
 *
 * @param state Current game state (mutated).
 * @returns The finished turn result, or null when no choice is pending.
 */
export function resolveCompetitivePendingChoice(state: MainStreetState): TurnResult | null {
  const pending = state.pendingEventChoice;
  if (!pending || pending.resolved) return null;
  if (!state.players || state.players.length < 2) {
    return resolvePendingEventChoice(state);
  }
  const turnEnded = state.turn;
  const option = decideEventChoice(state, pending.event, state.config.difficultyName);
  const event = pending.event;
  resolveEventChoice(state, option);
  // Route an accepted incident per-owner (street-wide semantics retained) —
  // mirrors the non-deferred path where resolveIncident + applyCompetitive
  // EventEffects run back-to-back. Reject applies nothing.
  if (option === 'accept') {
    applyCompetitiveEventEffects(state, event, state.activePlayerId ?? 0);
  }
  state.pendingEventChoice = null;
  return finishCompetitiveClosingTail(state, null, null, 0, 0, turnEnded);
}

