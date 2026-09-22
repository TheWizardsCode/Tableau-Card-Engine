/**
 * Main Street: Turn Engine (barrel)
 *
 * **This module is a barrel file.** All exports are re-exported from
 * per-concern sub-modules to preserve backward compatibility with existing
 * imports — consumers should import from `MainStreetEngine` and not need
 * to change when sub-modules evolve.
 *
 * | Sub-module                          | Responsibility |
 * |-------------------------------------|----------------|
 * | `MainStreetEngineTypes`             | Action payloads + result interfaces (leaf) |
 * | `MainStreetEngineScoring`           | Scores, event projection, AI choice |
 * | `MainStreetEngineDayStart`          | Day start + phase cursor |
 * | `MainStreetEngineCompetitiveTurn`   | Competitive day orchestration |
 * | `MainStreetEngineActions`           | Action dispatch + budget |
 * | `MainStreetEngineEvents`            | Event resolution |
 * | `MainStreetEngineTurnClosing`       | End-of-turn + end checks |
 * | `MainStreetEngineCommands`          | Command implementations |
 *
 * @module
 */


// ── Types ─────────────────────────────────────────────
export type {
  BuyAndPlaceAction,
  BuyAndPlaceUpgradeAction,
  BuyBusinessAction,
  BuyEventAction,
  BuyUpgradeAction,
  CommunityFavourAction,
  DiscardFromHandAction,
  EndOfTurnOptions,
  EndTurnAction,
  EventChoiceResolution,
  HireStaffAction,
  MoveToHandAction,
  PeekIncidentAction,
  PendingEndOfTurnDeltas,
  PlayBusinessFromHandAction,
  PlayEventAction,
  PlayEventFromHandAction,
  PlayUpgradeFromHandAction,
  PlayerAction,
  TurnResult,
} from './MainStreetEngineTypes';

// ── Scoring ─────────────────────────────────────────────
export {
  AI_EVENT_CHOICE_SIGNIFICANTLY_WORSE_RATIO,
  computeScore,
  decideEventChoice,
  eventSeverity,
  projectEventCoinDelta,
  updateCompetitiveScores,
  updateScore,
} from './MainStreetEngineScoring';

// ── DayStart ─────────────────────────────────────────────
export {
  advancePhase,
  executeDayStart,
  setPhase,
} from './MainStreetEngineDayStart';

// ── CompetitiveTurn ─────────────────────────────────────────────
export {
  endCompetitiveMarketTurn,
  executeCompetitiveDay,
  executeCompetitiveDayStart,
  getActivePlayerId,
  resolveCompetitiveClosingPhases,
  resolveCompetitivePendingChoice,
  setActivePlayerId,
} from './MainStreetEngineCompetitiveTurn';

// ── Actions ─────────────────────────────────────────────
export {
  consumeAction,
  executeAction,
  executeCommunityFavour,
  peekIncidentDeck,
} from './MainStreetEngineActions';

// ── Events ─────────────────────────────────────────────
export {
  applyCompetitiveEventEffects,
  computeEventDeltas,
  playHeldEvent,
  resolveEvent,
  resolveHeldInvestment,
} from './MainStreetEngineEvents';

// ── TurnClosing ─────────────────────────────────────────────
export {
  appendTurnNetRow,
  applyEndOfTurnDeltas,
  checkCompetitiveEndConditions,
  checkEndConditions,
  checkImmediateLoss,
  endTurnHeadless,
  executeFullTurn,
  finishDeferredEndOfTurn,
  finishDeferredTurnClosing,
  processEndOfTurn,
  resolveEventChoice,
  resolveIncident,
  resolvePendingEventChoice,
} from './MainStreetEngineTurnClosing';

// ── Commands ─────────────────────────────────────────────
export {
  applyBusinessOngoingCosts,
  applyCommunitySpaceOngoingCosts,
  applyCompetitiveOngoingCosts,
  applyStaffOngoingCosts,
  buyAndPlaceBusiness,
  canHireStaffApplicant,
  canPlaceFromHand,
  canPlaceStaffOnBusiness,
  canSellBusiness,
  canSellFromHand,
  canSellFromTableau,
  computeApplicantChance,
  declineApplicantAction,
  declineStaffApplicant,
  executeSell,
  getEmployedStaffCountAt,
  getEmployedStaffForBusiness,
  getEmploymentCapacity,
  hasFreeEmploymentSlot,
  hireApplicantAction,
  hireStaffApplicant,
  hireStaffCard,
  layoffStaffCard,
  letGoStaffAction,
  letGoStaffMember,
  placeFromHand,
  placeStaffOnBusiness,
  removeStaffFromBusiness,
  resolveStaffApplicant,
  sellFromHand,
  sellFromTableau,
} from './MainStreetEngineCommands';

// ── Re-exports kept for convenience (tests/consumers import these from the engine) ──
export { reputationCoinMultiplier, applyReputationMultiplier } from './MainStreetDifficulty';
export { cycleMarketCards } from './MainStreetMarket';
export { describeEventEffects, classifyEffect } from './MainStreetState';
