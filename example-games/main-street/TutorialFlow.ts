/**
 * Main Street: Unified Tutorial Flow
 *
 * Defines the unified T1-T23 tutorial steps (23 steps) that teach the core
 * Main Street loop (buy → hand → end turn → place; invest → optimize →
 * trigger). Each step has a gate type:
 *
 * - **confirm**: The player clicks "Next"/"Continue" to advance (no gameplay
 *   action required). Used for informational/reference steps.
 * - **action**: The player must perform a specific in-game action to complete
 *   the step. The `requiredAction` field specifies which action gates the step.
 *
 * A pure controller manages tutorial progression. This module has NO Phaser
 * dependency so it can be unit tested in Node.
 *
 * ## Two-turn buy-and-play (CG-0MT53NXGZ004H5AE)
 *
 * Every purchase is taught as **plan-ahead**: move a market card to hand on
 * day N (consumes the daily action), End Turn, then place it from hand on
 * day N+1 at its **listed cost** (consuming that day's action). Same-turn
 * place-after-move (which CG-0MT24X0SX007RLHN prices at +50% premium) is
 * never required within a tutorial step.
 *
 * Day map: T1-T6 (day 1: move Laundromat), T7-T10 (day 2: place Laundromat,
 * buy Local Festival), T11-T14 (day 3: move Bookshop, Community Favour),
 * T15-T16 (day 4: place Bookshop), T17-T18 (day 5: move Library),
 * T19-T23 (day 6: place Library, play Local Festival, confirmations).
 *
 * ## Coin Budget Analysis (TutorialScenario, Easy difficulty)
 *
 * With the TutorialScenario system and Easy difficulty (12 coins, 5 reputation):
 *
 * - Market development row: Bakery ($3), **Laundromat ($4)**, **Bookshop ($3)**
 * - Local Festival ($3) bought free (event moves cost no action)
 * - Incidents in queue (5 deterministic, all budget-safe for the tutorial
 *   street): Community Award (+2 rep) ×3, Rainy Day (0 coins — no Food
 *   businesses are placed) ×2. See TutorialScenario.ts.
 *
 * ### Budget Walkthrough (two-turn plan-ahead, listed-cost placements)
 *
 * | Step | Action                           | Coins In | Coins Out | Balance |
 * |------|----------------------------------|----------|-----------|---------|
 * | T1   | Start (Easy, 12 coins)           | 12       | 0         | 12      |
 * | T3   | Move Laundromat to hand (free)   | 0        | 0         | 12      |
 * | T6   | End Turn (held card cost -1)     | 0        | 1         | 11      |
 * | T7   | Place Laundromat (listed $4)     | 0        | 4         | 7       |
 * | T10  | End Turn + income (~2.15)        | 2.154    | 0         | 9.154   |
 * | T13  | Community Favour (+3)            | 3        | 0         | 12.154  |
 * | T14  | End Turn + income (~1.33)        | 1.333    | 0         | 13.487  |
 * | T15  | Place Bookshop (listed $3)       | 0        | 3         | 10.487  |
 * | T16  | End Turn + income (~3.91)        | 3.911    | 0         | 14.398  |
 * | T18  | End Turn + income (~3.92)        | 3.918    | 0         | 18.316  |
 * | T19  | Place Library (listed $7)        | 0        | 7         | 11.316  |
 * | T20  | Play Local Festival (net +1)     | 1        | 0         | 12.316  |
 *
 * **Conclusion:** Every step keeps a positive balance; no premium is ever
 * paid because each placement follows an End Turn (plan-ahead). The
 * Community Favour rep→coins exchange teaches the mechanic; the Library is
 * affordable even without it, keeping the lesson low-pressure.
 *
 * @module
 */

import { t, formatCurrency } from '../../src/core-engine/I18n';
import { bankingHintKey, tutorialKey } from './i18n/tutorial-en';
import { getCsvRows, getBaseTypeId } from './MainStreetCards';
import type { BusinessCard, CommunitySpaceCard } from './MainStreetCards';
import { neighbors } from './MainStreetAdjacency';

// ── Step Types ──────────────────────────────────────────────

/**
 * The zone of the screen that should be highlighted for a given step.
 *
 * For **confirm** (informational) steps this is often `centerModal` or
 * `completionModal` (null zones — tooltip is centred). For **action** steps
 * it points to the UI element the player must interact with.
 *
 * Card-level zones (`laundromatCard`, `festivalCard`) are resolved through a
 * small card-rect resolver in `MainStreetTutorialHints` keyed by the step's
 * `requiredCardId`/`referencedCardId` (deterministic tutorial-scenario slots).
 */
export type TutorialHighlightZone =
  | 'centerModal'
  | 'hud'
  | 'marketBusinessRow'
  | 'developmentRow'   // the single market row (business steps; investmentsRow aliases it)
  | 'streetGrid'
  | 'endTurnButton'
  | 'incidentQueue'
  | 'investmentsRow'
  | 'challengePanel'
  | 'helpButton'
  | 'completionModal'
  | 'hand'             // hand area (Your Hand / Triggering Events)
  | 'actionButtons'    // market-phase action bar (End Turn / Hint / Community Favour buttons)
  | 'laundromatCard'   // card-level: Laundromat on the market row (T3)
  | 'festivalCard';    // card-level: Local Festival on the market row (T9)

/**
 * The type of player action expected to complete an action-gated step.
 */
export type TutorialActionType =
  | 'confirm'            // Click continue/confirm
  | 'acknowledge'        // Click a highlighted area
  | 'select-business'    // Select a business card from market (moves it to hand)
  | 'select-hand-card'   // Click a card in the hand to select it for placement
  | 'place-business'     // Place a business on the street grid
  | 'end-turn'           // Click End Turn
  | 'acknowledge-queue'  // Click incident deck panel
  | 'buy-event'          // Buy an event card from the market row
  | 'apply-upgrade'      // Buy/apply an upgrade
  | 'play-event'         // Play a held investment event from the hand
  | 'community-favour'   // Perform a Community Favour exchange (rep-to-coins / coins-to-rep)
  | 'confirm-complete';  // Click "Let's play!" on completion modal

/**
 * @deprecated Since CG-0MT53NXGZ004H5AE removed same-turn composite steps.
 * The tutorial now teaches two-turn plan-ahead (move day N → place day N+1),
 * so no step uses the composite `buy-and-place` gating. Retained only so
 * `isRequiredAction` can defend against legacy callers; the runtime path
 * (MainStreetLifecycleManager / E2E helper) uses `select-business` +
 * `place-business` split steps.
 */
export const COMPOSITE_BUY_AND_PLACE = 'buy-and-place' as TutorialActionType;

/**
 * The gate type for a tutorial step.
 * - `'confirm'`: Player clicks "Next" / "Continue" to advance.
 * - `'action'`: Player must perform a specific in-game action to advance.
 */
export type TutorialGateType = 'confirm' | 'action';

/**
 * A single unified tutorial step definition (18 steps total T1-T18).
 *
 * Confirm steps only need `gate: 'confirm'`; they do not have a
 * `requiredAction` field because the only way to advance is by
 * clicking "Next" / "Continue".
 *
 * Action steps have `gate: 'action'` and a `requiredAction` that
 * specifies the in-game action the player must perform.
 */
export interface UnifiedTutorialStepDef {
  /** Step identifier (T1, T2, ..., T17). */
  id: string;
  /**
   * i18n key for the short title shown in the overlay.
   * Resolve via `t(titleKey)` or `resolveTutorialStepText(step).title`.
   */
  titleKey: string;
  /**
   * i18n key for the body copy explaining the concept.
   * Resolve via `t(bodyKey)` or `resolveTutorialStepText(step).body`.
   */
  bodyKey: string;
  /** Screen zone to highlight (null zones: centerModal, completionModal). */
  highlightZone: TutorialHighlightZone;
  /** Whether this step requires a gameplay action to advance. */
  gate: TutorialGateType;
  /**
   * The in-game action required to complete this step.
   * Only present when `gate === 'action'`.
   */
  requiredAction?: TutorialActionType;
  /**
   * If set, only this specific card ID can be used to complete the step.
   * Used for tutorial steps that require buying a specific card (e.g., T3, T7).
   * When set, the player must click/purchase exactly this card to advance;
   * clicking any other card shows an error message.
   */
  requiredCardId?: string;
  /**
   * If set, this card's live template data (name/cost/income bonus) is used to
   * resolve `{cardName}` / `{cost}` / `{bonus}` placeholders in the step's body
   * text, but the step does NOT gate on purchasing this exact card.
   *
   * Used for steps whose body references a card purchased earlier or guaranteed
   * by the tutorial scenario without requiring that purchase here (e.g. T7
   * references the Local Festival; T9 references the Bookshop bought in T8).
   */
  referencedCardId?: string;
  /**
   * If set, this card's live template data (name/cost/income bonus) is used to
   * resolve `{synergyCardName}` / `{synergyCost}` placeholders in the step's body
   * text in ADDITION to the primary `requiredCardId` / `referencedCardId` card.
   *
   * Used for steps whose body references TWO cards — the purchased card (via
   * `requiredCardId`, feeding `{cardName}`) and the synergy partner card (via
   * `synergyCardId`, feeding `{synergyCardName}`). E.g. T19 builds the Library
   * next to the Bookshop for a Culture adjacency bonus.
   */
  synergyCardId?: string;
}

// ── Unified Tutorial Script (T1-T23) ────────────────────────

/**
 * The unified set of 23 tutorial steps, in sequential order.
 *
 * The flow teaches one concept per step: move → hand → end turn → place
 * (plan-ahead); invest → optimize → trigger. Every purchase is a two-turn
 * flow (CG-0MT53NXGZ004H5AE): a `select-business` step moves the card to
 * hand on day N, an `end-turn` advances the day, and a `place-business`
 * step places it on day N+1 at listed cost. There are no same-turn
 * composite `buy-and-place` steps.
 *
 * Gate type distribution: 9 confirm + 14 action
 * (action steps: T3, T6, T7, T9, T10, T11, T13, T14, T15, T16, T17, T18, T19, T20).
 */
export const UNIFIED_TUTORIAL_STEPS: readonly UnifiedTutorialStepDef[] = [
  {
    id: 'T1',
    titleKey: tutorialKey('T1', 'title'),
    bodyKey: tutorialKey('T1', 'body'),
    highlightZone: 'centerModal',
    gate: 'confirm',
  },
  {
    id: 'T2',
    titleKey: tutorialKey('T2', 'title'),
    bodyKey: tutorialKey('T2', 'body'),
    // Informative Development Row step: dev-row-only highlight, no action.
    highlightZone: 'developmentRow',
    gate: 'confirm',
  },
  {
    id: 'T3',
    titleKey: tutorialKey('T3', 'title'),
    bodyKey: tutorialKey('T3', 'body'),
    // Card-level highlight on the Laundromat on the market row (scenario slot 0).
    highlightZone: 'laundromatCard',
    gate: 'action',
    requiredAction: 'select-business',
    // The TutorialScenario system (TutorialScenario.ts) guarantees the Laundromat
    // (biz-laundromat-0) is present in the development row. It costs $4, leaving
    // 12 coins for the later purchases.
    requiredCardId: 'biz-laundromat-0',
  },
  {
    id: 'T4',
    titleKey: tutorialKey('T4', 'title'),
    bodyKey: tutorialKey('T4', 'body'),
    // New hand-area step inserted between buying and placing.
    highlightZone: 'hand',
    gate: 'confirm',
  },
  {
    id: 'T5',
    // Upcoming Incidents moved BEFORE the first End Turn so the player
    // understands the face-down deck before its first resolution.
    titleKey: tutorialKey('T5', 'title'),
    bodyKey: tutorialKey('T5', 'body'),
    highlightZone: 'incidentQueue',
    gate: 'confirm',
  },
  {
    id: 'T6',
    // Day-1 End Turn: ends the day in which the Laundromat was moved to
    // hand. The first incident (Community Award, +2 rep) resolves here.
    titleKey: tutorialKey('T6', 'title'),
    bodyKey: tutorialKey('T6', 'body'),
    highlightZone: 'endTurnButton',
    gate: 'action',
    requiredAction: 'end-turn',
  },
  {
    id: 'T7',
    // Day 2: place the Laundromat from hand at LISTED cost (plan-ahead).
    // justMovedHandCardId was cleared at day start, so no same-turn premium.
    // Body references the Laundromat ({cardName}/{cost}) via referencedCardId.
    titleKey: tutorialKey('T7', 'title'),
    bodyKey: tutorialKey('T7', 'body'),
    highlightZone: 'streetGrid',
    gate: 'action',
    requiredAction: 'place-business',
    referencedCardId: 'biz-laundromat-0',
  },
  {
    id: 'T8',
    titleKey: tutorialKey('T8', 'title'),
    bodyKey: tutorialKey('T8', 'body'),
    highlightZone: 'investmentsRow',
    gate: 'confirm',
  },
  {
    id: 'T9',
    titleKey: tutorialKey('T9', 'title'),
    bodyKey: tutorialKey('T9', 'body'),
    // Card-level highlight on the Local Festival on the market row (slot 2).
    highlightZone: 'festivalCard',
    gate: 'action',
    requiredAction: 'buy-event',
    // The TutorialScenario system puts Local Festival (evt-festival, $3)
    // on the market row. Events move to hand FREE (no action), so this can
    // share day 2 with the Laundromat placement (T7).
    requiredCardId: 'evt-festival-0',
  },
  {
    id: 'T10',
    titleKey: tutorialKey('T10', 'title'),
    bodyKey: tutorialKey('T10', 'body'),
    // Day-2 End Turn: ends the day in which the Laundromat was placed and
    // the Local Festival was bought; resolves the second incident. Body text
    // references the Local Festival bought in T9 — referencedCardId feeds
    // the {cardName} placeholder from live card data (no gate here).
    highlightZone: 'endTurnButton',
    gate: 'action',
    requiredAction: 'end-turn',
    referencedCardId: 'evt-festival-0',
  },
  {
    id: 'T11',
    titleKey: tutorialKey('T11', 'title'),
    bodyKey: tutorialKey('T11', 'body'),
    // Day 3, split 1 of the Bookshop purchase: move it to hand (the day's
    // one action). Same-turn placement would cost +50%; we end the turn and
    // place at listed cost tomorrow (T15).
    highlightZone: 'developmentRow',
    gate: 'action',
    requiredAction: 'select-business',
    requiredCardId: 'biz-bookshop-0',
  },
  {
    id: 'T12',
    titleKey: tutorialKey('T12', 'title'),
    bodyKey: tutorialKey('T12', 'body'),
    // Informative cost-vs-reputation step: highlights the market row (like T2)
    // and references cs-library so {cardName}/{cost} resolve from live card
    // data. No action required and NO synergy mention — the placement
    // action and the synergy rule live on T19.
    highlightZone: 'developmentRow',
    gate: 'confirm',
    referencedCardId: 'cs-library',
  },
  {
    id: 'T13',
    titleKey: tutorialKey('T13', 'title'),
    bodyKey: tutorialKey('T13', 'body'),
    // Community Favour (CG-0MSTOATDQ005XDET): the free once-per-turn
    // rep→coins exchange teaches the mechanic; it is NOT strictly required
    // for the Library in the two-turn budget (see TutorialFlow budget
    // analysis). Action-gated on the rep-to-coins direction; highlight the
    // market-phase action bar where the two favour buttons render.
    highlightZone: 'actionButtons',
    gate: 'action',
    requiredAction: 'community-favour',
    referencedCardId: 'cs-library',
  },
  {
    id: 'T14',
    titleKey: tutorialKey('T14', 'title'),
    bodyKey: tutorialKey('T14', 'body'),
    // Day-3 End Turn: ends the day in which the Bookshop was moved to hand;
    // resolves the third (safe) incident. Body references the Bookshop
    // ({cardName}) via referencedCardId — no gate here.
    highlightZone: 'endTurnButton',
    gate: 'action',
    requiredAction: 'end-turn',
    referencedCardId: 'biz-bookshop-0',
  },
  {
    id: 'T15',
    titleKey: tutorialKey('T15', 'title'),
    bodyKey: tutorialKey('T15', 'body'),
    // Day 4, split 2 of the Bookshop purchase: place from hand at LISTED $3
    // (plan-ahead — no premium). Body references the Bookshop
    // ({cardName}/{cost}) via referencedCardId — no gate here.
    highlightZone: 'streetGrid',
    gate: 'action',
    requiredAction: 'place-business',
    referencedCardId: 'biz-bookshop-0',
  },
  {
    id: 'T16',
    titleKey: tutorialKey('T16', 'title'),
    bodyKey: tutorialKey('T16', 'body'),
    // Day-4 End Turn: resolves the fourth (safe) incident.
    highlightZone: 'endTurnButton',
    gate: 'action',
    requiredAction: 'end-turn',
  },
  {
    id: 'T17',
    titleKey: tutorialKey('T17', 'title'),
    bodyKey: tutorialKey('T17', 'body'),
    // Day 5, split 1 of the Library purchase: move cs-library to hand.
    highlightZone: 'developmentRow',
    gate: 'action',
    requiredAction: 'select-business',
    requiredCardId: 'cs-library',
  },
  {
    id: 'T18',
    titleKey: tutorialKey('T18', 'title'),
    bodyKey: tutorialKey('T18', 'body'),
    // Day-5 End Turn: resolves the fifth (safe) incident. Body references
    // the Library ({cardName}) via referencedCardId — no gate here.
    highlightZone: 'endTurnButton',
    gate: 'action',
    requiredAction: 'end-turn',
    referencedCardId: 'cs-library',
  },
  {
    id: 'T19',
    titleKey: tutorialKey('T19', 'title'),
    bodyKey: tutorialKey('T19', 'body'),
    // Day 6, split 2 of the Library purchase: place from hand at LISTED $7
    // NEXT TO the Bookshop (synergyCardId) for the Culture adjacency bonus —
    // see isSynergyAdjacentPlacement(). referencedCardId feeds the
    // {cardName}/{cost} placeholders from live card data (no market gate).
    highlightZone: 'streetGrid',
    gate: 'action',
    requiredAction: 'place-business',
    referencedCardId: 'cs-library',
    synergyCardId: 'biz-bookshop-0',
  },
  {
    id: 'T20',
    titleKey: tutorialKey('T20', 'title'),
    bodyKey: tutorialKey('T20', 'body'),
    // Triggering Events: play the held Local Festival from the hand.
    highlightZone: 'hand',
    gate: 'action',
    requiredAction: 'play-event',
    referencedCardId: 'evt-festival-0',
  },
  {
    id: 'T21',
    titleKey: tutorialKey('T21', 'title'),
    bodyKey: tutorialKey('T21', 'body'),
    // Success and Failure: the scoring bar (HUD).
    highlightZone: 'hud',
    gate: 'confirm',
  },
  {
    id: 'T22',
    titleKey: tutorialKey('T22', 'title'),
    bodyKey: tutorialKey('T22', 'body'),
    highlightZone: 'challengePanel',
    gate: 'confirm',
  },
  {
    id: 'T23',
    titleKey: tutorialKey('T23', 'title'),
    bodyKey: tutorialKey('T23', 'body'),
    highlightZone: 'completionModal',
    gate: 'confirm',
  },
] as const;

/** Contextual first-bank hint (CG-0MT3JK16W006A66P). Not part of the fixed
 * 23-step count: triggered once from `MainStreetTurnController.endTurn()` when
 * `actionsRemaining > 0` at turn end, exactly when a bank would occur. */
export const BANKING_HINT_STEP: UnifiedTutorialStepDef = {
  id: 'BANKING',
  titleKey: bankingHintKey('title'),
  bodyKey: bankingHintKey('body'),
  highlightZone: 'hud',
  gate: 'confirm',
};

/** Total number of unified tutorial steps. */
export const UNIFIED_TUTORIAL_STEP_COUNT = UNIFIED_TUTORIAL_STEPS.length; // 23

export const INVALID_ACTION_MESSAGE = 'Complete the highlighted step first.';

// ── Controller State ────────────────────────────────────────

export interface TutorialControllerState {
  /** Whether the tutorial is currently active. */
  isActive: boolean;
  /** Index into UNIFIED_TUTORIAL_STEPS (0-based), or -1 if not started. */
  currentStepIndex: number;
  /** The step ID that was most recently completed. */
  lastCompletedStepId: string | null;
  /** Whether the player has exited the tutorial early. */
  exited: boolean;
}

/** Returns a fresh tutorial controller state. */
export function createTutorialControllerState(): TutorialControllerState {
  return {
    isActive: false,
    currentStepIndex: -1,
    lastCompletedStepId: null,
    exited: false,
  };
}

// ── Pure Controller ─────────────────────────────────────────

export function advanceTutorialStep(
  state: TutorialControllerState,
): TutorialControllerState {
  if (!state.isActive) return state;
  const nextIndex = state.currentStepIndex + 1;
  if (nextIndex >= UNIFIED_TUTORIAL_STEP_COUNT) {
    return { ...state, currentStepIndex: UNIFIED_TUTORIAL_STEP_COUNT };
  }
  return { ...state, currentStepIndex: nextIndex };
}

export function startTutorial(
  _state: TutorialControllerState,
): TutorialControllerState {
  return { isActive: true, currentStepIndex: 0, lastCompletedStepId: null, exited: false };
}

export function exitTutorial(
  state: TutorialControllerState,
): TutorialControllerState {
  return { ...state, isActive: false, exited: true };
}

export function completeCurrentStep(
  state: TutorialControllerState,
): { newState: TutorialControllerState; completedStepId: string | null } {
  if (!state.isActive || state.currentStepIndex < 0)
    return { newState: state, completedStepId: null };
  if (state.currentStepIndex >= UNIFIED_TUTORIAL_STEP_COUNT)
    return { newState: state, completedStepId: null };
  const step = UNIFIED_TUTORIAL_STEPS[state.currentStepIndex];
  const next = advanceTutorialStep(state);
  return {
    newState: { ...next, lastCompletedStepId: step.id },
    completedStepId: step.id,
  };
}

export function isOnStep(
  state: TutorialControllerState,
  stepId: string,
): boolean {
  if (!state.isActive) return false;
  const idx = UNIFIED_TUTORIAL_STEPS.findIndex((s) => s.id === stepId);
  return idx >= 0 && state.currentStepIndex === idx;
}

export function getCurrentStep(
  state: TutorialControllerState,
): UnifiedTutorialStepDef | null {
  if (!state.isActive) return null;
  if (state.currentStepIndex < 0 || state.currentStepIndex >= UNIFIED_TUTORIAL_STEP_COUNT)
    return null;
  return UNIFIED_TUTORIAL_STEPS[state.currentStepIndex];
}

export function isRequiredAction(
  state: TutorialControllerState,
  actionType: TutorialActionType,
): boolean {
  const step = getCurrentStep(state);
  if (!step || step.gate !== 'action') return false;
  // Two-turn plan-ahead flow (CG-0MT53NXGZ004H5AE): there are no same-turn
  // composite `buy-and-place` steps — a `select-business` step moves the
  // card to hand today, an `end-turn` advances the day, and a
  // `place-business` step places it tomorrow at listed cost.
  // Selecting a hand card (select-hand-card) is also allowed during placement
  // steps so the player can pick which card to place (CG-0MSXIQIPJ000NDTL).
  if (step.requiredAction === 'place-business') {
    return actionType === 'place-business' || actionType === 'select-hand-card';
  }
  return step.requiredAction === actionType;
}

export function shouldAllowAction(
  state: TutorialControllerState,
  actionType: TutorialActionType,
): boolean {
  if (!state.isActive) return true;
  return isRequiredAction(state, actionType);
}

/**
 * Pure placement rule for the Library's synergy-adjacent placement (T19:
 * the Library must be built next to the Bookshop for the Culture adjacency
 * bonus). Applies to the tutorial step that declares a `synergyCardId` —
 * both the old composite gate and the current place-business split step.
 *
 * Enforced by both the drag path (`MainStreetTurnController.canDropBusinessCard`
 * → snap-back + illegal-move feedback) and the click path (`onSlotClick` →
 * instruction message) while the step is active.
 *
 * @param step        The current tutorial step.
 * @param streetGrid  The live 2×5 street grid (slot index → card or null).
 * @param targetSlot  The candidate placement slot index.
 * @returns `true` when the placement is allowed, `false` when it must be
 *          rejected because the target is not adjacent to the synergy card.
 *
 * The rule ONLY applies to tutorial steps that declare a `synergyCardId`.
 * For every other step the helper returns `true` (no-op). "Next to" means
 * 8-way adjacency (Chebyshev distance ≤ 1, diagonals included) via the
 * shared `neighbors()` resolver from `MainStreetAdjacency` — the same
 * semantics the synergy bonus system uses.
 *
 * The synergy card's slot is resolved dynamically from the live grid (the
 * operator explicitly rejected a hardcoded slot — "don't assume the player
 * placed the bookshop in a specific place"). Card IDs are compared by base
 * template (copy-suffix stripped) so any copy of the synergy template
 * satisfies the rule. If the synergy card is NOT on the street, the rule
 * cannot be enforced and returns `true` (allowed) — the partner is
 * guaranteed to be present when T19 is reached (T15's placement completes
 * the Bookshop on day 4), but the helper stays robust regardless.
 */
export function isSynergyAdjacentPlacement(
  step: UnifiedTutorialStepDef,
  streetGrid: readonly (BusinessCard | CommunitySpaceCard | null)[],
  targetSlot: number,
): boolean {
  // Rule only applies to steps that declare a synergy partner.
  if (!step.synergyCardId) return true;

  // Resolve the synergy card's ACTUAL street slot from the live grid.
  const synergySlot = streetGrid.findIndex(
    (card) =>
      card !== null &&
      getBaseTypeId(card.id) === getBaseTypeId(step.synergyCardId!),
  );
  // Synergy card not on the street → cannot enforce an absent partner.
  if (synergySlot < 0) return true;

  return neighbors(synergySlot).includes(targetSlot);
}

// ── i18n Resolution ─────────────────────────────────────────

/**
 * Card-data interpolation params substituted into tutorial step text.
 *
 * `{cardName}` / `{cost}` / `{bonus}` placeholders in the i18n bundle are
 * replaced with these live values from `card-data.csv` at render time.
 *
 * Declared as a type alias (not an interface) so it is assignable to
 * `Record<string, string | number>` for `t(key, params)` interpolation.
 */
export type TutorialCardDataParams = {
  /** The card's `name` column (e.g. `'Laundromat'`). */
  cardName: string;
  /** The card's `cost` column formatted via `formatCurrency()` (e.g. `'€4'`). */
  cost: string;
  /** Event cards only: the `coinDelta` as `+N coins` (e.g. `'+2 coins'`). */
  bonus: string;
  /** Synergy-partner card's `name` column (e.g. `'Bookshop'`), when `synergyCardId` is set. */
  synergyCardName?: string;
};

/**
 * Resolve card-data interpolation params for a tutorial step.
 *
 * Uses `step.requiredCardId` (purchase-gated steps) or `step.referencedCardId`
 * (text-only references) as the lookup key, strips the copy suffix via
 * `getBaseTypeId()`, and finds the matching row in the live CSV via
 * `getCsvRows()`. Returns `null` when the step has no card reference.
 *
 * @throws Error if the step references a card that has no row in the live
 *         card data — the resolver fails loudly rather than rendering a raw
 *         `{placeholder}` token.
 */
export function resolveTutorialCardParams(
  step: UnifiedTutorialStepDef,
): TutorialCardDataParams | null {
  const cardId = step.requiredCardId ?? step.referencedCardId;
  if (!cardId) return null;

  const baseId = getBaseTypeId(cardId);
  const row = getCsvRows().find(r => r.id === baseId);
  if (!row) {
    throw new Error(
      `TutorialFlow: no card-data row found for base template "${baseId}" ` +
      `(from step ${step.id} card id "${cardId}"). Check card-data.csv.`,
    );
  }

  const coinDelta = Number(row.coinDelta);
  const bonus =
    row.coinDelta !== undefined && row.coinDelta !== '' && Number.isFinite(coinDelta)
      ? `+${coinDelta} coins`
      : '+0 coins';

  const params: TutorialCardDataParams = {
    cardName: row.name,
    cost: formatCurrency(Number(row.cost) || 0),
    bonus,
  };

  // Resolve the synergy-partner card ({synergyCardName}) when the step
  // references a second card (e.g. T19 builds the Library next to the Bookshop).
  if (step.synergyCardId) {
    const synergyBaseId = getBaseTypeId(step.synergyCardId);
    const synergyRow = getCsvRows().find(r => r.id === synergyBaseId);
    if (!synergyRow) {
      throw new Error(
        `TutorialFlow: no card-data row found for synergy template "${synergyBaseId}" ` +
        `(from step ${step.id} synergy card id "${step.synergyCardId}"). Check card-data.csv.`,
      );
    }
    params.synergyCardName = synergyRow.name;
  }

  return params;
}

/**
 * Resolve a tutorial step's title and body through the i18n system.
 *
 * Looks up `step.titleKey` and `step.bodyKey` via `t()`, falling back to
 * the key itself if no locale bundle has been registered.  When the step
 * references a card (`requiredCardId` / `referencedCardId`), the live card
 * data from `card-data.csv` is substituted into `{cardName}` / `{cost}` /
 * `{bonus}` placeholders so the text can never go stale after rebalancing.
 *
 * Utility glue for the overlay manager (`MainStreetTutorialHints`).
 */
export function resolveTutorialStepText(
  step: UnifiedTutorialStepDef,
): { title: string; body: string } {
  const params = resolveTutorialCardParams(step);
  return {
    title: params ? t(step.titleKey, params) : t(step.titleKey),
    body: params ? t(step.bodyKey, params) : t(step.bodyKey),
  };
}

/** Re-export `tutorialKey` for convenience. */
export { tutorialKey } from './i18n/tutorial-en';
