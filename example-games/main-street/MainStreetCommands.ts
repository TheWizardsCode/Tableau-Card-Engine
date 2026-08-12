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
  purchaseBusinessToHand,
  purchaseUpgrade,
  purchaseEvent,
  refreshDevelopment,
  refreshInvestments,
  sellBusiness,
} from './MainStreetMarket';
import { playHeldEvent } from './MainStreetEngine';

/** Snapshot of the portions of state affected by market actions. */
interface MarketActionSnapshot {
  streetGrid: any | null;
  market: any | null;
  decks: any | null;
  resourceBank: any | null;
  hand: any | null;
  incidentQueue: any | null;
  activityLog: any | null;
  soldSlots: boolean[] | null;
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
    incidentQueue: safeClone(state.incidentQueue),
    activityLog: safeClone(state.activityLog),
    soldSlots: safeClone(state.soldSlots ?? new Array(10).fill(false)) as boolean[],
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
  state.incidentQueue = snap.incidentQueue as any;
  state.activityLog = snap.activityLog as any;
  state.soldSlots = snap.soldSlots ?? new Array(10).fill(false);
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

/** Command: Buy Business */
export function buyBusinessCommand(
  state: MainStreetState,
  cardId: string,
  slotIndex: number,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => purchaseBusiness(s, cardId, slotIndex),
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

/** Command: Buy Business to Hand */
export function buyBusinessToHandCommand(
  state: MainStreetState,
  cardId: string,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => purchaseBusinessToHand(s, cardId),
      `BuyBusinessToHand ${cardId}`,
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
      (s) => playHeldEvent(s, handIndex),
      'PlayHeldEvent',
    ),
  );
}

/** Command: Refresh Development Row */
export function refreshDevelopmentCommand(state: MainStreetState) {
  return toCommand(
    state,
    snapshotAction(
      (s) => refreshDevelopment(s),
      'RefreshDevelopment',
    ),
  );
}

/** Command: Sell Business */
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

/** Command: Refresh Investments Row */
export function refreshInvestmentsCommand(state: MainStreetState) {
  return toCommand(
    state,
    snapshotAction(
      (s) => refreshInvestments(s),
      'RefreshInvestments',
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
/** @deprecated Use refreshInvestmentsCommand() instead. */
export const BuyRefreshInvestmentsCommand = refreshInvestmentsCommand;
