/**
 * Main Street: Day Start and Phase Helpers
 *
 * Day-start refill/bootstrap and the phase cursor helpers.
 *
 * @module
 */

import { resolveStaffApplicant } from './MainStreetEngineCommands';
import { refillMarket, cycleMarketCards } from './MainStreetMarket';
import type { MainStreetState, DayPhase } from './MainStreetState';
import { PHASE_ORDER, addLog } from './MainStreetState';

export function executeDayStart(state: MainStreetState, skipMarketRefill: boolean = false): void {
  if (state.phase !== 'DayStart') {
    throw new Error(`Expected DayStart phase, got ${state.phase}`);
  }

  // Turn 1 is already set by setup; subsequent turns increment here
  if (state.turn > 1 || state.phase === 'DayStart') {
    // Cycle market at start of each new day (after the first turn — turn 1's
    // row is already filled by setupMainStreetGame; cycling there would discard
    // fresh cards the player hasn't seen yet).
    if (!skipMarketRefill) {
      if (state.turn > 1) {
        cycleMarketCards(state);
      } else {
        refillMarket(state);
      }
    }
  }

  // Log turn header
  addLog(state, `Turn ${state.turn}`, 'turn-header');

  // Action economy: reset daily action budget.
  // Base 1 action + sum of actionsPerTurn from employed staff + banked actions (capped at 2).
  const gmBonus = (state.staffCards ?? []).reduce((sum, card) => sum + (card.actionsPerTurn ?? 0), 0);
  // Defensive clamp: banking never exceeds the cap (2) at day end, but a
  // malformed/legacy save could carry a higher value — cap the day budget
  // contribution explicitly (AC3, CG-0MT3IOPZB005LNAR).
  const banked = Math.min(2, state.bankedActions ?? 0);
  state.actionsRemaining = 1 + gmBonus + banked;

  // Staff peek gate (CG-0MSXOW6GN008ZSMN): exactly one peek per turn.
  state.peekUsedThisTurn = false;
  // Clear any pending peek reveal — a new day starts with a clean slate.
  state.revealedPeekedCard = null;

  // Community Favour gate (CG-0MSTOATDQ005XDET): one resource exchange per turn.
  state.favourUsedThisTurn = false;

  // Same-day Investment composite (CG-0MTFWBNL30043ZBM): new day clears the tracker.
  (state as any).justMovedEventCardId = null;
  // Clear same-day upgrade composite tracking (CG-0MT3IYSRL001VVUP).
  state.justMovedUpgradeCardId = null;
  // Grand Opening placement gate (CG-0MTIOCBH400970OB): new day resets the flag.
  (state as any).businessPlacedThisTurn = false;

  // Day-start snapshot for the per-turn net summary row (CG-0MT5W7UJJ0065MEZ
  // AC3): resources exactly as the player's turn begins. Persisted with the
  // save so a resumed turn's net row measures against the original snapshot.
  state.dayStartCoins = state.resourceBank.coins;
  state.dayStartRep = state.resourceBank.reputation;
  state.dayStartScore = state.finalScore;

  // Staff applicant trigger (CG-0MSTOATDU006UGAX): resolved after market
  // refill so the player sees the applicant during MarketPhase. Suppressed
  // in tutorial/headless when suppressApplicant is true.
  if (!(state as any).suppressApplicant) {
    resolveStaffApplicant(state);
  }

  state.phase = 'MarketPhase';
}

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

