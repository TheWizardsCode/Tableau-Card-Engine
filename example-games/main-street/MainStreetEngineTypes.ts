/**
 * Main Street: Engine Action and Result Types
 *
 * All discriminated-union action payloads and result/closing interfaces
 * consumed by the engine. Types only — leaf module.
 *
 * @module
 */

import { finishDeferredTurnClosing, processEndOfTurn } from './MainStreetEngineTurnClosing';
import type { IncomeResult } from './MainStreetAdjacency';
import type { EventCard } from './MainStreetCards';

export interface BuyBusinessAction {
  type: 'buy-business';
  cardId: string;
  slotIndex: number;
}

/**
 * Buy an upgrade card and apply it to a business.
 *
 * Headless equivalent of the same-day click composite
 * (CG-0MT3IYSRL001VVUP): the market click moves the upgrade to hand (one
 * daily action) and applying it the same day is free, so buying and applying
 * in one step costs exactly **one daily action** at the listed cost.
 */
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

/**
 * Buy an upgrade from the market and apply it in one step (drag-drop path,
 * CG-0MT3IYSRL001VVUP). Charges a +50% premium on the upgrade's cost and
 * consumes 1 action.
 */
export interface BuyAndPlaceUpgradeAction {
  type: 'buy-and-place-upgrade';
  cardId: string;
  targetSlot?: number;
  /** Optional listed-price override for GM 2-action parity (see buyAndPlaceUpgrade). */
  priceOverride?: number;
  /** Additional daily actions to consume alongside the drag's action (GM parity). */
  extraActions?: number;
}

/** Hire a staff card from the general market row. */

export interface HireStaffAction {
  type: 'hire-staff';
  cardId: string;
}

/** End the current market/action phase. */

export interface EndTurnAction {
  type: 'end-turn';
}

/**
 * Staff peek skill (CG-0MSXOW6GN008ZSMN): reveal the top card of the
 * face-down incident deck once per turn, as an action. The peeked card is
 * returned face-down without being resolved.
 */
export interface PeekIncidentAction {
  type: 'peek-incident-deck';
}

/** Community Favour action: exchange coins ↔ reputation. */

export interface CommunityFavourAction {
  type: 'community-favour';
  /** Direction of the exchange. */
  direction: 'coins-to-rep' | 'rep-to-coins';
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
  | BuyAndPlaceUpgradeAction
  | HireStaffAction
  | PlayEventAction
  | PeekIncidentAction
  | CommunityFavourAction
  | EndTurnAction;

// ── Turn Result ─────────────────────────────────────────────

/** Result returned after processing a full turn cycle. */

/**
 * Pending resource deltas computed during end-of-turn.
 * Used by the deferred-mutation pattern (CG-0MTR72P14000VO6Q):
 * the engine computes deltas without mutating state for the
 * interactive path; the scene layer applies them after animations complete.
 */
export interface PendingEndOfTurnDeltas {
  /** Net coin delta from income + ongoing costs (may be negative). */
  pendingCoinDelta?: number;
  /** Net reputation delta from income (may be negative). */
  pendingRepDelta?: number;
  /** Score delta from challenges completed this turn (positive only). */
  pendingScoreDelta?: number;
}

export interface TurnResult extends PendingEndOfTurnDeltas {
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
  /**
   * True when the closing sequence paused because a dual-choice incident was
   * drawn (CG-0MTSHG8RP008E128). When set, `state.pendingEventChoice` holds
   * the drawn event and the UI must present the Accept/Reject dialog before
   * the deferred closing (EndCheck / next day) can run.
   */
  choicePending: boolean;
  /**
   * True when this result came from the deferred-mutation path
   * (processEndOfTurn with `deferResourceApplication`, CG-0MTR72P14000VO6Q):
   * the resource deltas are un-applied and the closing tail (EndCheck → next
   * day) has NOT run. The scene applies the deltas after the end-of-turn
   * animations complete and calls {@link finishDeferredTurnClosing} before
   * acting on `gameResult` / `finalScore` (which are pre-turn values here).
   * Absent/false for the legacy path and headless/AI results.
   */
  requiresDeferredClosing?: boolean;
}

/**
 * Options for {@link processEndOfTurn}.
 */
export interface EndOfTurnOptions {
  /**
   * Deferred-mutation flag (CG-0MTR72P14000VO6Q). When `true` (interactive
   * scene path), resource deltas (income, ongoing costs, incident) are
   * computed and returned in `TurnResult.pending*Delta` but NOT applied to
   * `state.resourceBank` / `state.finalScore`, and the closing tail
   * (EndCheck → next day) is deferred to {@link finishDeferredTurnClosing}
   * which the caller runs after the end-of-turn animations complete.
   *
   * When unset/false (headless/AI path and reduced-motion mode), the legacy
   * behaviour is preserved: deltas are applied immediately and the turn
   * closes deterministically within this call.
   */
  deferResourceApplication?: boolean;
}

/**
 * Result of applying an Accept / Reject decision for a pending dual-choice
 * incident (CG-0MTSHG8RP008E128).
 */
export interface EventChoiceResolution {
  /** The event the decision was made about. */
  event: EventCard;
  /** Which option the player chose. */
  option: 'accept' | 'reject';
  /** Net coin delta applied by the chosen path (0 for reject / durations). */
  coinChange: number;
  /** Net reputation delta applied by the chosen path. */
  repChange: number;
  /**
   * The escalation card instance pushed onto the incident deck by the chosen
   * path (null when the chain ends — no next card).
   */
  pushedCard: EventCard | null;
}

/**
 * Context carried into the single-player closing tail (EndCheck → next day).
 * Shared by the normal path (processEndOfTurn) and the deferred path
 * (finishDeferredEndOfTurn after a dual-choice incident).
 */
export interface SinglePlayerTurnClosingContext {
  /** Income result of the turn being closed (null when no income ran). */
  income: IncomeResult | null;
  /** The resolved incident (null when deferred / no incident). */
  incident: EventCard | null;
  /** Net coin delta from the resolved incident. */
  incidentCoinChange: number;
  /** Net reputation delta from the resolved incident. */
  incidentRepChange: number;
  /** The turn being summarised by the net row. */
  turnEnded: number;
}

