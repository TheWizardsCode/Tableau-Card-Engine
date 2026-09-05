/**
 * Main Street: Action Commands
 *
 * Reversible command wrappers for market actions, built using the shared
 * ActionCommands adapter (`toCommand` / `ReversibleAction`) from the
 * core engine. Each command captures a pre-snapshot on first execute
 * and restores it on undo.
 *
 * @module
 */

import { toCommand, type ReversibleAction } from '../../src/core-engine/ActionCommands';
import type { MainStreetState } from './MainStreetState';
import {
  purchaseBusiness,
  moveToHand,
  purchaseUpgrade,
  purchaseEvent,
  refreshMarket,
  sellBusiness,
  playBusinessFromHand,
  playUpgradeFromHand,
  playEventFromHand,
  discardFromHand,
} from './MainStreetMarket';
import {
  buyAndPlaceBusiness,
  hireStaffCard,
  peekIncidentDeck,
  consumeAction as consumeEngineAction,
  hireApplicantAction,
  declineApplicantAction,
  letGoStaffAction,
} from './MainStreetEngine';

// ── Action Budget Enforcement ────────────────────────────────

/**
 * Consume one action from the state budget. Throws if no actions remain.
 *
 * Delegates to the engine's single shared `consumeAction` helper
 * (CG-0MTCP7F9S009HARC) so the command layer and the engine `executeAction`
 * path decrement `actionsRemaining` AND `bankedActions` (floor 0) in
 * lock-step — one enforcement point, no divergence, no double-decrement.
 */
export function consumeAction(state: MainStreetState): void {
  consumeEngineAction(state);
}

/** Snapshot of the portions of state affected by market actions. */
interface MarketActionSnapshot {
  streetGrid: any | null;
  market: any | null;
  decks: any | null;
  resourceBank: any | null;
  hand: any | null;
  incidentDeck: any | null;
  activityLog: any | null;
  soldSlots: boolean[] | null;
  /** Grand Opening placement gate — captured so undo restores the per-turn flag. */
  businessPlacedThisTurn: boolean | null;
  /** Daily action budget — captured so undo restores the spent action. */
  actionsRemaining: number | null;
  /** Banked actions — captured so undo restores the banking state. */
  bankedActions: number | null;
  /** Staff peek gate — captured so undo restores the once-per-turn flag. */
  peekUsedThisTurn: boolean | null;
  /** Staff peek reveal — captured so undo clears a pending reveal. */
  revealedPeekedCard: any | null;
  /** Staff applicant — captured so undo restores pending/hired state. */
  pendingApplicant: any | null;
  /** Staff roster — captured so undo restores the staff list. */
  staffCards: any | null;
}

/** Safe cloning helper that uses structuredClone when available, else falls back to JSON clone. */
function safeClone<T>(obj: T): T {
  try {
    const sc = (globalThis as any).structuredClone;
    if (typeof sc === 'function') {
      return sc(obj);
    }
  } catch (_) {
    // fall back
  }
  // JSON fallback (sufficient for our snapshot uses: arrays/objects of primitives)
  return JSON.parse(JSON.stringify(obj));
}

/** Helper to capture a shallow snapshot of mutable market-related fields. */
function captureSnapshot(state: MainStreetState): MarketActionSnapshot {
  return {
    streetGrid: safeClone(state.streetGrid),
    market: safeClone(state.market),
    decks: safeClone(state.decks),
    resourceBank: safeClone(state.resourceBank),
    hand: safeClone(state.hand ?? []),
    incidentDeck: safeClone(state.incidentDeck),
    activityLog: safeClone(state.activityLog),
    soldSlots: safeClone(state.soldSlots ?? new Array(10).fill(false)) as boolean[],
    businessPlacedThisTurn: (state as any).businessPlacedThisTurn ?? false,
    actionsRemaining: state.actionsRemaining,
    bankedActions: state.bankedActions ?? 0,
    peekUsedThisTurn: state.peekUsedThisTurn ?? false,
    revealedPeekedCard: state.revealedPeekedCard ?? null,
    pendingApplicant: safeClone((state as any).pendingApplicant ?? null),
    staffCards: safeClone(state.staffCards ?? []),
  };
}

/** Helper to restore a previously captured snapshot. */
function restoreSnapshot(state: MainStreetState, snap: MarketActionSnapshot): void {
  if (!snap.streetGrid || !snap.market || !snap.decks || !snap.resourceBank || !snap.activityLog) {
    throw new Error('Invalid snapshot');
  }
  state.streetGrid = snap.streetGrid as any;
  state.market = snap.market as any;
  state.decks = snap.decks as any;
  state.resourceBank = snap.resourceBank as any;
  state.hand = snap.hand as any;
  state.incidentDeck = snap.incidentDeck as any;
  state.activityLog = snap.activityLog as any;
  state.soldSlots = snap.soldSlots ?? new Array(10).fill(false);
  if (snap.businessPlacedThisTurn !== null && snap.businessPlacedThisTurn !== undefined) {
    (state as any).businessPlacedThisTurn = snap.businessPlacedThisTurn;
  }
  if (snap.actionsRemaining !== null && snap.actionsRemaining !== undefined) {
    state.actionsRemaining = snap.actionsRemaining;
  }
  if (snap.bankedActions !== null && snap.bankedActions !== undefined) {
    state.bankedActions = snap.bankedActions;
  }
  if (snap.peekUsedThisTurn !== null && snap.peekUsedThisTurn !== undefined) {
    state.peekUsedThisTurn = snap.peekUsedThisTurn;
  }
  if ('revealedPeekedCard' in snap) {
    state.revealedPeekedCard = snap.revealedPeekedCard;
  }
  if ('pendingApplicant' in snap) {
    (state as any).pendingApplicant = snap.pendingApplicant;
  }
  if ('staffCards' in snap) {
    state.staffCards = snap.staffCards;
  }
}

/**
 * Creates a snapshot-capturing action from a do function.
 * Captures the snapshot on the first execute and restores it on undo.
 */
function snapshotAction(
  doFn: (state: MainStreetState) => void,
  description: string,
): ReversibleAction<MainStreetState> {
  let pre: MarketActionSnapshot | null = null;
  return {
    description,
    do(state: MainStreetState): void {
      if (pre === null) pre = captureSnapshot(state);
      doFn(state);
    },
    undo(state: MainStreetState): void {
      if (pre === null) return;
      restoreSnapshot(state, pre);
    },
  };
}

// ── Commands ────────────────────────────────────────────────

/** Command: Buy Business (consumes 1 action) */
export function buyBusinessCommand(
  state: MainStreetState,
  cardId: string,
  slotIndex: number,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => {
        consumeAction(s);
        purchaseBusiness(s, cardId, slotIndex);
      },
      `BuyBusiness ${cardId} -> slot ${slotIndex}`,
    ),
  );
}

/** Command: Buy Upgrade */
export function buyUpgradeCommand(
  state: MainStreetState,
  cardId: string,
  targetSlot?: number,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => purchaseUpgrade(s, cardId, targetSlot),
      `BuyUpgrade ${cardId} -> slot ${targetSlot ?? 'auto'}`,
    ),
  );
}

/** Command: Move market card to hand (consumes 1 action; play-from-hand costs again) */
export function moveToHandCommand(
  state: MainStreetState,
  cardId: string,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => {
        consumeAction(s);
        moveToHand(s, cardId);
      },
      `MoveToHand ${cardId}`,
    ),
  );
}

/**
 * Command: Move an event card to hand (FREE — buy-event is a non-action
 * operation per the action economy, CG-0MSTOF1N5005PK2R). Events use the
 * cost-at-play deferral model: the move itself costs no coins.
 */
export function moveEventToHandCommand(
  state: MainStreetState,
  cardId: string,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => {
        consumeAction(s);
        moveToHand(s, cardId);
        (s as any).justMovedEventCardId = cardId;
      },
      `MoveEventToHand ${cardId}`,
    ),
  );
}

/** Command: Buy Event (Investment) */
export function buyEventCommand(
  state: MainStreetState,
  cardId: string,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => purchaseEvent(s, cardId),
      `BuyEvent ${cardId}`,
    ),
  );
}

/** Command: Play Investment Event from Hand */
export function playEventCommand(state: MainStreetState, handIndex?: number) {
  return toCommand(
    state,
    snapshotAction(
      (s) => {
        const idx = handIndex ?? (s.hand ?? []).findIndex(c => c.family === 'event');
        const card = (s.hand ?? [])[idx] as any;
        const isSameDay = card && (s as any).justMovedEventCardId != null && (s as any).justMovedEventCardId === card.id;
        if (!isSameDay) consumeAction(s);
        return playEventFromHand(s, idx);
      },
      'PlayEventFromHand',
    ),
  );
}

/**
 * Command: Play Business from Hand (consumes 1 action; pays cost-at-play).
 *
 * Premium-aware (CG-0MT24X0SX007RLHN): when `premiumCost` is supplied the
 * +50% premium REPLACES the missing action (same-day composite placement
 * with 0 actions remaining) — no action is consumed and the premium price
 * is deducted, recorded in the undo/redo snapshot. When absent, the held-
 * card (plan-ahead) path is unchanged: 1 action consumed + listed cost.
 */
export function playBusinessFromHandCommand(
  state: MainStreetState,
  handIndex: number,
  slotIndex: number,
  premiumCost?: number,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => {
        // Premium replaces the missing action — consume only on the
        // held-card / listed-cost path (CG-0MT24X0SX007RLHN).
        if (premiumCost === undefined) {
          consumeAction(s);
        }
        playBusinessFromHand(s, handIndex, slotIndex, premiumCost);
      },
      premiumCost !== undefined
        ? `PlayBusinessFromHand ${handIndex} -> slot ${slotIndex} (premium ${premiumCost})`
        : `PlayBusinessFromHand ${handIndex} -> slot ${slotIndex}`,
    ),
  );
}

/** Command: Play Upgrade from Hand (cost-at-play) */
export function playUpgradeFromHandCommand(
  state: MainStreetState,
  handIndex: number,
  targetSlot?: number,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => playUpgradeFromHand(s, handIndex, targetSlot),
      `PlayUpgradeFromHand ${handIndex}`,
    ),
  );
}

/** Command: Discard card from hand (free) */
export function discardFromHandCommand(
  state: MainStreetState,
  handIndex: number,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => discardFromHand(s, handIndex),
      `DiscardFromHand ${handIndex}`,
    ),
  );
}

/**
 * Command: Buy & Place business directly to slot (consumes 1 action; +50%
 * premium, or listed price when `priceOverride` is supplied for GM parity
 * — CG-0MT24X0SX007RLHN).
 *
 * @param priceOverride Optional price to charge instead of the +50% premium
 *                      (listed cost for GM parity; unset → premium default).
 * @param extraActions  Additional daily actions to consume alongside the
 *                      drag's own action. 1 on Golden Mile days (the
 *                      equivalent composite move+place consumes 2 actions at
 *                      listed cost; drag must charge identically).
 */
export function buyAndPlaceBusinessCommand(
  state: MainStreetState,
  cardId: string,
  slotIndex: number,
  priceOverride?: number,
  extraActions: number = 0,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => {
        for (let i = 0; i < extraActions; i += 1) consumeAction(s);
        consumeAction(s);
        buyAndPlaceBusiness(s, cardId, slotIndex, priceOverride);
      },
      `BuyAndPlace ${cardId} -> slot ${slotIndex}`,
    ),
  );
}

/** Command: Hire Staff from market (consumes 1 action) */
export function hireStaffCardCommand(
  state: MainStreetState,
  cardId: string,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => {
        consumeAction(s);
        hireStaffCard(s, cardId);
      },
      `HireStaff ${cardId}`,
    ),
  );
}

/** Command: Re-roll the single-row market (free) */
export function refreshMarketCommand(state: MainStreetState) {
  return toCommand(
    state,
    snapshotAction(
      (s) => refreshMarket(s),
      'RefreshMarket',
    ),
  );
}

/** Command: Sell Business (free) */
export function sellBusinessCommand(
  state: MainStreetState,
  slotIndex: number,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => sellBusiness(s, slotIndex),
      `SellBusiness slot ${slotIndex}`,
    ),
  );
}

/**
 * Command: Hire the pending staff applicant (CG-0MSTOATDU006UGAX, 0 cost, no hand slots).
 */
export function hireApplicantCommand(state: MainStreetState) {
  return toCommand(
    state,
    snapshotAction(
      (s) => { hireApplicantAction(s); },
      'HireApplicant',
    ),
  );
}

/**
 * Command: Decline the pending staff applicant (CG-0MSTOATDU006UGAX, free, no other effects).
 */
export function declineApplicantCommand(state: MainStreetState) {
  return toCommand(
    state,
    snapshotAction(
      (s) => { declineApplicantAction(s); },
      'DeclineApplicant',
    ),
  );
}

/**
 * Command: Let go a staff member (CG-0MSTOATDU006UGAX, -salary coins, -1 rep).
 */
export function letGoStaffCommand(state: MainStreetState, idx: number) {
  return toCommand(
    state,
    snapshotAction(
      (s) => { letGoStaffAction(s, idx); },
      `LetGoStaff ${idx}`,
    ),
  );
}

/**
 * Command: Staff peek at the incident deck (CG-0MSXOW6GN008ZSMN).
 * Consumes 1 action, sets the once-per-turn gate, and exposes the revealed
 * card via `state.revealedPeekedCard`. The deck is NOT mutated — the card
 * stays on top face-down and is never resolved. Undo restores the action,
 * the gate, and clears the reveal.
 */
export function peekIncidentDeckCommand(state: MainStreetState) {
  return toCommand(
    state,
    snapshotAction(
      (s) => { peekIncidentDeck(s); },
      'PeekIncidentDeck',
    ),
  );
}

// Re-export renamed symbols for backward compatibility
/** @deprecated Use buyBusinessCommand() instead. */
export const BuyBusinessCommand = buyBusinessCommand;
/** @deprecated Use buyUpgradeCommand() instead. */
export const BuyUpgradeCommand = buyUpgradeCommand;
/** @deprecated Use buyEventCommand() instead. */
export const BuyEventCommand = buyEventCommand;
/** @deprecated Use playEventCommand() instead. */
export const PlayEventCommand = playEventCommand;
/** @deprecated Use moveToHandCommand() instead. */
export const BuyBusinessToHandCommand = moveToHandCommand;
/** @deprecated Use refreshMarketCommand() instead. */
export const BuyRefreshInvestmentsCommand = refreshMarketCommand;
