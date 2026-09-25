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

import { toCommand, type ReversibleAction } from '@core-engine/ActionCommands';
import { evaluateChallengesAfterAction } from './MainStreetChallenges';
import type { MainStreetState } from './MainStreetState';
import {
  purchaseBusiness,
  moveToHand,
  purchaseUpgrade,
  purchaseEvent,
  refreshMarket,
  sellBusiness,
  closeBusiness,
  playBusinessFromHand,
  playUpgradeFromHand,
  playEventFromHand,
  discardFromHand,
  buyAndPlaceUpgrade,
} from './MainStreetMarket';
import {
  buyAndPlaceBusiness,
  hireStaffCard,
  peekIncidentDeck,
  consumeAction as consumeEngineAction,
  hireApplicantAction,
  declineApplicantAction,
  letGoStaffAction,
  resolveEventChoice,
  placeStaffOnBusiness,
  removeStaffFromBusiness,
  layoffStaffCard,
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
  /**
   * Unified discard pile — captured so undoing a Close restores the removed
   * card (`closeBusiness` pushes it to `discardPile`).
   */
  discardPile: any | null;
  /** Grand Opening placement gate — captured so undo restores the per-turn flag. */
  businessPlacedThisTurn: boolean | null;
  /** Daily action budget — captured so undo restores the spent action. */
  actionsRemaining: number | null;  /** Banked actions — captured so undo restores the banking state. */
  bankedActions: number | null;
  /** Staff peek gate — captured so undo restores the once-per-turn flag. */
  peekUsedThisTurn: boolean | null;
  /** Staff peek reveal — captured so undo clears a pending reveal. */
  revealedPeekedCard: any | null;
  /** Staff applicant — captured so undo restores pending/hired state. */
  pendingApplicant: any | null;
  /** Staff roster — captured so undo restores the staff list. */
  staffCards: any | null;
  /** Same-week upgrade composite tracker (CG-0MT3IYSRL001VVUP). */
  justMovedUpgradeCardId: string | null;
  /** Same-week event composite tracker (CG-0MTFWBNL30043ZBM). */
  justMovedEventCardId: string | null;
  /**
   * Pending dual-choice incident (CG-0MTSHG8RP008E128). Captured so undoing
   * a choice returns to the unresolved pending state with the event still in
   * play (AC10 parent / AC1 undo child).
   */
  pendingEventChoice: any | null;
  /**
   * Active duration effects. Captured so undoing a choice that accepted a
   * DurationEventCard removes the effect it pushed.
   */
  activeEffects: any | null;
  /**
   * Challenge completion state (CG-0MU37CKRR008252I). `state.activeChallenges`
   * holds evaluator *functions* and must NOT be deep-cloned (structuredClone /
   * JSON clone silently drop them); capture the cloneable form instead: the
   * completed-ID list plus each challenge's `completed` flag by index.
   */
  challengesCompleted: string[] | null;
  completedFlags: boolean[] | null;
  /**
   * Per-family discard piles — captured so undoing a discard removes the card
   * from its family discard pile as well as restoring the hand, and redo
   * re-adds it exactly once (CG-0MUEQ19VX0009VIW).
   */
  discards: any | null;
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
    soldSlots: safeClone(
      state.soldSlots ?? new Array<boolean>(state.streetGrid?.length ?? 10).fill(false),
    ) as boolean[],
    // Unified discard pile — captured so undoing a Close restores the removed
    // card (the card is pushed to `discardPile` by `closeBusiness`).
    discardPile: safeClone(state.discardPile ?? []),
    businessPlacedThisTurn: (state as any).businessPlacedThisTurn ?? false,
    actionsRemaining: state.actionsRemaining,
    bankedActions: state.bankedActions ?? 0,
    peekUsedThisTurn: state.peekUsedThisTurn ?? false,
    revealedPeekedCard: state.revealedPeekedCard ?? null,
    pendingApplicant: safeClone((state as any).pendingApplicant ?? null),
    staffCards: safeClone(state.staffCards ?? []),
    justMovedUpgradeCardId: (state as any).justMovedUpgradeCardId ?? null,
    justMovedEventCardId: (state as any).justMovedEventCardId ?? null,
    pendingEventChoice: safeClone((state as any).pendingEventChoice ?? null),
    activeEffects: safeClone(state.activeEffects ?? []),
    // Challenge completion state — cloneable form only (never activeChallenges,
    // whose evaluator functions would be dropped by safeClone).
    challengesCompleted: safeClone(state.challengesCompleted ?? []),
    completedFlags: (state.activeChallenges ?? []).map(ac => ac.completed),
    discards: safeClone(state.discards ?? {}),
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
  state.soldSlots = snap.soldSlots ?? new Array<boolean>(state.streetGrid?.length ?? 10).fill(false);
  state.discardPile = (snap.discardPile ?? []) as any;
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
  if ('justMovedUpgradeCardId' in snap) {
    (state as any).justMovedUpgradeCardId = snap.justMovedUpgradeCardId;
  }
  if ('justMovedEventCardId' in snap) {
    (state as any).justMovedEventCardId = snap.justMovedEventCardId;
  }
  if ('pendingEventChoice' in snap) {
    (state as any).pendingEventChoice = snap.pendingEventChoice;
  }
  if ('activeEffects' in snap) {
    state.activeEffects = snap.activeEffects ?? [];
  }
  // Restore challenge completion state atomically with the activityLog so
  // tracker, score and log stay consistent after undo (CG-0MU37CKRR008252I).
  if (snap.challengesCompleted !== null && snap.challengesCompleted !== undefined) {
    state.challengesCompleted = snap.challengesCompleted;
  }
  if (snap.completedFlags !== null && snap.completedFlags !== undefined) {
    for (let i = 0; i < state.activeChallenges.length && i < snap.completedFlags.length; i++) {
      state.activeChallenges[i].completed = snap.completedFlags[i];
    }
  }
  // Restore the per-family discard piles so undo removes a discarded card from
  // its pile (and redo re-adds it exactly once) — CG-0MUEQ19VX0009VIW.
  if (snap.discards !== null && snap.discards !== undefined) {
    state.discards = snap.discards;
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
  // Same array reference is exposed on the ReversibleAction and propagated by
  // toCommand() onto the Command, so callers can read it after execute().
  const completedChallengeIds: string[] = [];
  return {
    completedChallengeIds,
    description,
    do(state: MainStreetState): void {
      if (pre === null) pre = captureSnapshot(state);
      doFn(state);
      // Per-action challenge evaluation (CG-0MU37CKRR008252I): complete any
      // challenge satisfied by the command's forward mutation and record the
      // IDs so undo can warn before reverting a completion. Reset first so a
      // redo (do after undo) does not accumulate duplicates.
      completedChallengeIds.length = 0;
      completedChallengeIds.push(...evaluateChallengesAfterAction(state));
    },
    undo(state: MainStreetState): void {
      if (pre === null) return;
      restoreSnapshot(state, pre);
      // Clear the transient per-action buffer so the scene does not read a
      // stale completion after undo.
      state._newlyCompletedThisAction = [];
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
 * Command: Move an event card to hand (costs 1 daily action — buy-event is
 * an action-type operation under the action economy, CG-0MTFWBNL30043ZBM).
 * Events use the cost-at-play deferral model: the move itself costs no coins.
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
        const isSameWeek = card && (s as any).justMovedEventCardId != null && (s as any).justMovedEventCardId === card.id;
        if (!isSameWeek) consumeAction(s);
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
 * +50% premium REPLACES the missing action (same-week composite placement
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

/**
 * Command: Play Upgrade from Hand (cost-at-play).
 *
 * Same-week composite (CG-0MT3IYSRL001VVUP): if the upgrade at handIndex is
 * the same card just moved from market to hand this turn (justMovedUpgradeCardId),
 * the play is free — the move already consumed the action. Otherwise consumes 1 action.
 *
 * Premium-aware: when `premiumCost` is supplied the +50% premium REPLACES
 * the action (drag buy-and-play at 0 actions remaining) — no action consumed.
 */
export function playUpgradeFromHandCommand(
  state: MainStreetState,
  handIndex: number,
  targetSlot?: number,
  premiumCost?: number,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => {
        if (premiumCost !== undefined) {
          // Premium replaces the action — no consumeAction (mirrors playBusinessFromHandCommand).
        } else {
          const card = (s.hand ?? [])[handIndex];
          const isSameWeekComposite = card != null && s.justMovedUpgradeCardId != null && s.justMovedUpgradeCardId === (card as any).id;
          if (!isSameWeekComposite) {
            consumeAction(s);
          }
          // Clear composite tracker after play (whether same-week or held).
          if (s.justMovedUpgradeCardId != null && card != null && s.justMovedUpgradeCardId === (card as any).id) {
            s.justMovedUpgradeCardId = null;
          }
        }
        // Delegate to engine helper — premiumCost currently not threading into
        // playUpgradeFromHand (upgrade premium is charged in buyAndPlaceUpgrade only);
        // kept for API parity with playBusinessFromHandCommand.
        playUpgradeFromHand(s, handIndex, targetSlot);
      },
      premiumCost !== undefined
        ? `PlayUpgradeFromHand ${handIndex} (premium ${premiumCost})`
        : `PlayUpgradeFromHand ${handIndex}`,
    ),
  );
}

/** Command: Discard a hand card, costing its coin value in reputation (clamped at 0). */
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

/**
 * Command: Buy & Place Upgrade directly onto a business (drag-drop path,
 * CG-0MT3IYSRL001VVUP). Consumes 1 action and charges the +50% premium
 * (Math.ceil(cost * 1.5 * 2) / 2, matching business buy-and-place).
 *
 * @param priceOverride Optional price to charge instead of the +50% premium
 *                      (listed cost for GM parity on 2-action days — when
 *                      supplied, still consumes 1 action).
 * @param extraActions  Additional daily actions to consume (GM parity — 1 on
 *                      Golden Mile days where the composite consumes 2 actions).
 */
export function buyAndPlaceUpgradeCommand(
  state: MainStreetState,
  cardId: string,
  targetSlot?: number,
  priceOverride?: number,
  extraActions: number = 0,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => {
        for (let i = 0; i < extraActions; i += 1) consumeAction(s);
        consumeAction(s);
        buyAndPlaceUpgrade(s, cardId, targetSlot, priceOverride);
      },
      `BuyAndPlaceUpgrade ${cardId} -> slot ${targetSlot ?? 'auto'}`,
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
 * Command: Close Business (costs 1 daily action, no coins).
 *
 * The card is removed from the street grid entirely (slot -> null) and pushed
 * to the unified `discardPile`, freeing the slot for later placement. The
 * action cost goes through the command layer's `consumeAction` — the single
 * shared enforcement point (CG-0MTCP7F9S009HARC) — so `actionsRemaining` and
 * `bankedActions` (floor 0) decrement in lock-step with every other
 * action-consuming operation. `closeBusiness` itself is free of action logic,
 * so the cost is charged exactly once.
 *
 * The pre-snapshot (which now includes `discardPile`) makes the whole close
 * reversible via the shared undo manager: undo restores the card, slot,
 * discard pile, action budget, and activity log.
 *
 * @param state     Current game state.
 * @param slotIndex Street grid slot index of the card to close.
 */
export function closeBusinessCommand(
  state: MainStreetState,
  slotIndex: number,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => {
        consumeAction(s);
        closeBusiness(s, slotIndex);
      },
      `CloseBusiness slot ${slotIndex}`,
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
 * Command: Resolve the pending dual-choice incident (CG-0MTSHG8RP008E128).
 *
 * Accept applies the event's effect + pushes the accept-next card; Reject
 * refuses the effect + pushes the reject-next card. Because the command is
 * snapshot-based (pre-capture includes the unresolved `pendingEventChoice`,
 * the incident deck WITHOUT the escalation, the resource bank BEFORE the
 * effect, and active effects), undo returns to the unresolved pending state
 * with the event still in play — escalation removed, resources restored
 * (AC10 parent / AC1+AC4 undo child).
 *
 * @param state  Current game state.
 * @param option The player's (or AI's) decision.
 */
export function resolveEventChoiceCommand(
  state: MainStreetState,
  option: 'accept' | 'reject',
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => {
        resolveEventChoice(s, option);
      },
      `ResolveEventChoice ${option}`,
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
 * Command: Place a hired staff member on a business slot
 * (CG-0MU3BTSQ8006ZRCU AC1-AC3). Free (no action/coins — the member is
 * already hired); validated by `canPlaceStaffOnBusiness` (business-type
 * match + employment capacity). Undo restores the previous employment.
 */
export function placeStaffOnBusinessCommand(
  state: MainStreetState,
  staffId: string,
  slotIndex: number,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => { placeStaffOnBusiness(s, staffId, slotIndex); },
      `PlaceStaff ${staffId} -> slot ${slotIndex}`,
    ),
  );
}

/**
 * Command: Remove a staff member from its business (kept hired;
 * employment cleared so per-business buffs stop). AC5 (removal flow).
 */
export function removeStaffFromBusinessCommand(
  state: MainStreetState,
  staffId: string,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => { removeStaffFromBusiness(s, staffId); },
      `RemoveStaff ${staffId}`,
    ),
  );
}

/**
 * Command: Sell / lay off a staff card entirely (AC5). Uses the existing
 * `layoffStaffCard` engine flow — removes the member from `staffCards` and
 * the business's `employedStaff`, drops `maxHandSize`/hand cards per
 * `handSlotsAdded`, returns the card to `discards.staff`. Undo restores all.
 */
export function layoffStaffCommand(
  state: MainStreetState,
  staffId: string,
) {
  return toCommand(
    state,
    snapshotAction(
      (s) => { layoffStaffCard(s, staffId); },
      `LayoffStaff ${staffId}`,
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
