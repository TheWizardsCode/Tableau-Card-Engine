/**
 * Main Street: Unified Tutorial Flow
 *
 * Defines the unified T1-T16 tutorial steps (16 steps) that teach the core
 * Main Street loop (buy → hand → place; invest → optimize → trigger). Each
 * step has a gate type:
 *
 * - **confirm**: The player clicks "Next"/"Continue" to advance (no gameplay
 *   action required). Used for informational/reference steps.
 * - **action**: The player must perform a specific in-game action to complete
 *   the step. The `requiredAction` field specifies which action gates the step.
 *
 * A pure controller manages tutorial progression. This module has NO Phaser
 * dependency so it can be unit tested in Node.
 *
 * ## Coin Budget Analysis (TutorialScenario, Easy difficulty)
 *
 * With the TutorialScenario system and Easy difficulty (16 coins, 5 reputation):
 *
 * - Market development row: Bakery ($3), **Laundromat ($4)**, **Library ($7)**, **Bookshop ($3)**
 * - Investments: Upgrade to Patisserie ($4), Upgrade to Garden ($3), Local Festival ($3)
 * - Incidents in queue: Community Award (+2 rep), Rainy Day (-1 coin per Food)
 *
 * ### Budget Walkthrough
 *
 * | Step | Action                           | Coins In | Coins Out | Balance |
 * |------|----------------------------------|----------|-----------|---------|
 * | T1   | Start (Easy, 16 coins)           | 16       | 0         | 16      |
 * | T2   | Confirm (no cost)                | 0        | 0         | 16      |
 * | T3   | Buy Laundromat ($4)              | 0        | 4         | 12      |
 * | T4   | Confirm (no cost)                | 0        | 0         | 12      |
 * | T5   | Place business (free)            | 0        | 0         | 12      |
 * | T6   | Confirm (no cost)                | 0        | 0         | 12      |
 * | T7   | End Turn + income (~0.6 coin)    | 0.625    | 0         | 12.625  |
 * | T8   | Confirm (no cost)                | 0        | 0         | 12.625  |
 * | T9   | Buy Local Festival ($3)          | 0        | 3         | 9.625   |
 * | T10  | Buy-and-place Bookshop ($3)      | 0        | 3         | 6.625   |
 * | T11  | End Turn + income (~1.25 coins)  | 1.25     | 0         | 7.875   |
 * | T12  | Buy Library ($7)                 | 0        | 7         | 0.875   |
 * | T13  | Play held event (free)           | 0        | 0         | ~1      |
 * | T14+ | Confirm steps (no cost)          | 0        | 0         | ~1      |
 *
 * **Conclusion:** Even with worst-case incidents, the budget is sufficient
 * for all tutorial actions. Laundromat ($4) + Local Festival ($3) + Bookshop
 * ($3) + Library ($7) = $17 is covered by 16 starting coins plus ~1.9 income
 * across the two end-turn steps. The Bookshop (Culture business) and Library
 * (Culture community space) enable the Local Festival bonus when played in T13.
 *
 * @module
 */

import { t, formatCurrency } from '../../src/core-engine/I18n';
import { tutorialKey } from './i18n/tutorial-en';
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
  | 'developmentRow'   // dev row only (informative Dev Row / Optimizing for Events / Build a Library)
  | 'streetGrid'
  | 'endTurnButton'
  | 'incidentQueue'
  | 'investmentsRow'
  | 'challengePanel'
  | 'helpButton'
  | 'completionModal'
  | 'hand'             // hand area (Your Hand / Triggering Events)
  | 'laundromatCard'   // card-level: Laundromat in the dev row (T3)
  | 'festivalCard';    // card-level: Local Festival in the investments row (T9)

/**
 * The type of player action expected to complete an action-gated step.
 */
export type TutorialActionType =
  | 'confirm'            // Click continue/confirm
  | 'acknowledge'        // Click a highlighted area
  | 'select-business'    // Select a business card from market
  | 'place-business'     // Place a business on the street grid
  | 'end-turn'           // Click End Turn
  | 'acknowledge-queue'  // Click incident queue
  | 'buy-event'          // Buy an event card from investments row
  | 'apply-upgrade'      // Buy/apply an upgrade
  | 'play-event'         // Play a held investment event from the hand
  | 'buy-and-place'      // Composite: drag a business card and drop it on the street
  | 'confirm-complete';  // Click "Let's play!" on completion modal

/**
 * The gate type for a tutorial step.
 * - `'confirm'`: Player clicks "Next" / "Continue" to advance.
 * - `'action'`: Player must perform a specific in-game action to advance.
 */
export type TutorialGateType = 'confirm' | 'action';

/**
 * A single unified tutorial step definition (16 steps total T1-T16).
 *
 * Confirm steps only need `gate: 'confirm'`; they do not have a
 * `requiredAction` field because the only way to advance is by
 * clicking "Next" / "Continue".
 *
 * Action steps have `gate: 'action'` and a `requiredAction` that
 * specifies the in-game action the player must perform.
 */
export interface UnifiedTutorialStepDef {
  /** Step identifier (T1, T2, ..., T16). */
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
   * `synergyCardId`, feeding `{synergyCardName}`). E.g. T12 builds the Library
   * next to the Bookshop for a Culture adjacency bonus.
   */
  synergyCardId?: string;
}

// ── Unified Tutorial Script (T1-T13) ────────────────────────

/**
 * The unified set of 16 tutorial steps, in sequential order.
 *
 * The flow teaches one concept per step: buy → hand → place; invest →
 * optimize → trigger. See the parent work item's T1–T16 mapping for the
 * full rationale (steps dropped, split, renamed, and inserted).
 *
 * Gate type distribution: 8 confirm + 8 action
 * (action steps: T3, T5, T7, T9, T10, T11, T12, T13).
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
    // Card-level highlight on the Laundromat in the dev row (scenario slot 2).
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
    titleKey: tutorialKey('T5', 'title'),
    bodyKey: tutorialKey('T5', 'body'),
    highlightZone: 'streetGrid',
    gate: 'action',
    requiredAction: 'place-business',
  },
  {
    id: 'T6',
    titleKey: tutorialKey('T6', 'title'),
    bodyKey: tutorialKey('T6', 'body'),
    highlightZone: 'incidentQueue',
    gate: 'confirm',
  },
  {
    id: 'T7',
    titleKey: tutorialKey('T7', 'title'),
    bodyKey: tutorialKey('T7', 'body'),
    highlightZone: 'endTurnButton',
    gate: 'action',
    requiredAction: 'end-turn',
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
    // Card-level highlight on the Local Festival in the investments row (slot 3).
    highlightZone: 'festivalCard',
    gate: 'action',
    requiredAction: 'buy-event',
    // The TutorialScenario system puts Local Festival (evt-festival, $3)
    // in the investments row, affordable after the T3 purchase + T7 income.
    requiredCardId: 'evt-festival-0',
  },
  {
    id: 'T10',
    titleKey: tutorialKey('T10', 'title'),
    bodyKey: tutorialKey('T10', 'body'),
    // Composite buy-and-place step: drag the Bookshop from the dev row onto
    // an empty street slot (drag-drop buy-and-place, landed via CG-0MSKSAREE007AYSZ).
    highlightZone: 'developmentRow',
    gate: 'action',
    requiredAction: 'buy-and-place',
    requiredCardId: 'biz-bookshop-0',
  },
  {
    id: 'T11',
    titleKey: tutorialKey('T11', 'title'),
    bodyKey: tutorialKey('T11', 'body'),
    highlightZone: 'endTurnButton',
    gate: 'action',
    requiredAction: 'end-turn',
    // Body text references the Local Festival bought in T9 — referencedCardId
    // feeds the {cardName} placeholder from live card data (no gate here).
    referencedCardId: 'evt-festival-0',
  },
  {
    id: 'T12',
    titleKey: tutorialKey('T12', 'title'),
    bodyKey: tutorialKey('T12', 'body'),
    // Composite buy-and-place step (like T10): the player buys cs-library
    // from the dev row (drag or click-to-buy) and places it on the street.
    // The step completes only on the terminal place-business drop; the
    // Library must be placed NEXT TO the Bookshop (synergyCardId) for the
    // Culture adjacency bonus — see isSynergyAdjacentPlacement().
    highlightZone: 'developmentRow',
    gate: 'action',
    requiredAction: 'buy-and-place',
    requiredCardId: 'cs-library',
    synergyCardId: 'biz-bookshop-0',
  },
  {
    id: 'T13',
    titleKey: tutorialKey('T13', 'title'),
    bodyKey: tutorialKey('T13', 'body'),
    // Triggering Events: play the held Local Festival from the hand.
    highlightZone: 'hand',
    gate: 'action',
    requiredAction: 'play-event',
    referencedCardId: 'evt-festival-0',
  },
  {
    id: 'T14',
    titleKey: tutorialKey('T14', 'title'),
    bodyKey: tutorialKey('T14', 'body'),
    // Success and Failure: the scoring bar (HUD).
    highlightZone: 'hud',
    gate: 'confirm',
  },
  {
    id: 'T15',
    titleKey: tutorialKey('T15', 'title'),
    bodyKey: tutorialKey('T15', 'body'),
    highlightZone: 'challengePanel',
    gate: 'confirm',
  },
  {
    id: 'T16',
    titleKey: tutorialKey('T16', 'title'),
    bodyKey: tutorialKey('T16', 'body'),
    highlightZone: 'completionModal',
    gate: 'confirm',
  },
] as const;

/** Total number of unified tutorial steps. */
export const UNIFIED_TUTORIAL_STEP_COUNT = UNIFIED_TUTORIAL_STEPS.length; // 16

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
  // Composite buy-and-place step: both the pickup (select-business) and the
  // drop (place-business) are required/allowable while the step is active;
  // the step completes only on the terminal drop action (see
  // MainStreetLifecycleManager.onTutorialActionComplete).
  if (step.requiredAction === 'buy-and-place') {
    return actionType === 'select-business' || actionType === 'place-business';
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
 * Pure placement rule for composite buy-and-place steps with a synergy
 * partner (currently T12: the Library must be built next to the Bookshop
 * for the Culture adjacency bonus).
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
 * The rule ONLY applies to composite `buy-and-place` steps that declare a
 * `synergyCardId`. For every other step the helper returns `true` (no-op).
 * "Next to" means 8-way adjacency (Chebyshev distance ≤ 1, diagonals
 * included) via the shared `neighbors()` resolver from `MainStreetAdjacency`
 * — the same semantics the synergy bonus system uses.
 *
 * The synergy card's slot is resolved dynamically from the live grid (the
 * operator explicitly rejected a hardcoded slot — "don't assume the player
 * placed the bookshop in a specific place"). Card IDs are compared by base
 * template (copy-suffix stripped) so any copy of the synergy template
 * satisfies the rule. If the synergy card is NOT on the street, the rule
 * cannot be enforced and returns `true` (allowed) — the partner is
 * guaranteed to be present when T12 is reached (T10's buy-and-place
 * completes only on placement), but the helper stays robust regardless.
 */
export function isSynergyAdjacentPlacement(
  step: UnifiedTutorialStepDef,
  streetGrid: readonly (BusinessCard | CommunitySpaceCard | null)[],
  targetSlot: number,
): boolean {
  // Rule only applies to composite buy-and-place steps with a synergy partner.
  if (step.requiredAction !== 'buy-and-place' || !step.synergyCardId) return true;

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
  // references a second card (e.g. T12 builds the Library next to the Bookshop).
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
