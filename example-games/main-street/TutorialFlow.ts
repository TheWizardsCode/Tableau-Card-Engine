/**
 * Main Street: Unified Tutorial Flow (Milestone 5+)
 *
 * Defines the unified T1-T13 tutorial steps that merge the original
 * 8 reference steps and 9 guided (action-gated) steps into a single
 * coherent tutorial system. Each step has a gate type:
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
 * With the TutorialScenario system and Easy difficulty (12 coins, 5 reputation):
 *
 * - Market development row: Bakery ($3), **Laundromat ($4)**, Park ($3), **Bookshop ($3)**
 * - Investments: Upgrade to Patisserie ($4), Upgrade to Garden ($3), Local Festival ($3)
 * - Incidents in queue: Community Award (+2 rep), Rainy Day (-1 coin per Food)
 *
 * ### Budget Walkthrough
 *
 * | Step | Action                     | Coins In | Coins Out | Balance |
 * |------|----------------------------|----------|-----------|---------|
 * | T1   | Start (Easy)               | 12       | 0         | 12      |
 * | T2   | Confirm (no cost)          | 0        | 0         | 12      |
 * | T3   | Buy Laundromat ($4)        | 0        | 4         | 8       |
 * | T4   | Place business (free)      | 0        | 0         | 8       |
 * | T5   | Confirm (no cost)          | 0        | 0         | 8       |
 * | T6   | End Turn + income (~1 coin)| 1        | 0         | 9       |
 * | T7   | Buy Local Festival ($3)    | 0        | 3         | 6       |
 * | T8   | Buy Bookshop ($3) + auto-place | 0     | 3         | 3       |
 * | T9   | Confirm (no cost)          | 0        | 0         | 3       |
 * | T10  | Confirm (no cost)          | 0        | 0         | 3       |
 * | T11  | Confirm (no cost)          | 0        | 0         | 3       |
 * | T12  | Confirm (no cost)          | 0        | 0         | ~6      |
 * | T13  | Confirm (no cost)          | 0        | 0         | ~6      |
 * | T14  | Confirm (no cost)          | 0        | 0         | ~6      |
 *
 * **Conclusion:** Even with worst-case incidents, the budget is sufficient
 * for all tutorial actions. The Laundromat ($4) plus Bookshop ($3) plus
 * Local Festival ($3) totalling $10 is covered by 12 starting coins with
 * ~1 income turn. The Bookshop (Culture business) enables the Local Festival
 * bonus when played later.
 *
 * @module
 */

import { t } from '../../src/core-engine/I18n';
import { tutorialKey } from './i18n/tutorial-en';

// ── Step Types ──────────────────────────────────────────────

/**
 * The zone of the screen that should be highlighted for a given step.
 *
 * For **confirm** (informational) steps this is often `centerModal` or
 * `completionModal` (null zones — tooltip is centred). For **action** steps
 * it points to the UI element the player must interact with.
 */
export type TutorialHighlightZone =
  | 'centerModal'
  | 'hud'
  | 'marketBusinessRow'
  | 'streetGrid'
  | 'endTurnButton'
  | 'incidentQueue'
  | 'investmentsRow'
  | 'challengePanel'
  | 'helpButton'
  | 'completionModal';

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
  // 'open-help' has been removed (T10 "Help + Hint Tools" step was cut)
  | 'confirm-complete';  // Click "Start Full Game" on completion modal

/**
 * The gate type for a tutorial step.
 * - `'confirm'`: Player clicks "Next" / "Continue" to advance.
 * - `'action'`: Player must perform a specific in-game action to advance.
 */
export type TutorialGateType = 'confirm' | 'action';

/**
 * A single unified tutorial step definition (14 steps total T1-T14).
 *
 * Confirm steps only need `gate: 'confirm'`; they do not have a
 * `requiredAction` field because the only way to advance is by
 * clicking "Next" / "Continue".
 *
 * Action steps have `gate: 'action'` and a `requiredAction` that
 * specifies the in-game action the player must perform.
 */
export interface UnifiedTutorialStepDef {
  /** Step identifier (T1, T2, ..., T13). */
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
}

// ── Unified Tutorial Script (T1-T13) ────────────────────────

/**
 * The unified set of 14 tutorial steps, in sequential order.
 *
 * Merged from:
 * - 9 guided (action-gated) steps T1-T9 from the original TutorialFlow
 * - 8 reference steps from the original MainStreetTutorialHints
 *
 * Overlapping content was deduplicated while preserving all unique information.
 * New steps (from the original 13-step set and split Challenges/Scoring)
 * come from the reference system to fill gaps.
 *
 * Gate type distribution: 10 confirm + 4 action.
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
    highlightZone: 'hud',
    gate: 'confirm',
  },
  {
    id: 'T3',
    titleKey: tutorialKey('T3', 'title'),
    bodyKey: tutorialKey('T3', 'body'),
    highlightZone: 'marketBusinessRow',
    gate: 'action',
    requiredAction: 'select-business',
    // The TutorialScenario system (TutorialScenario.ts) guarantees the Laundromat
    // (biz-laundromat-0) is present in the development row. It costs $4 (most
    // affordable, leaves 8 coins for later steps).
    requiredCardId: 'biz-laundromat-0',
  },
  {
    id: 'T4',
    titleKey: tutorialKey('T4', 'title'),
    bodyKey: tutorialKey('T4', 'body'),
    highlightZone: 'streetGrid',
    gate: 'action',
    requiredAction: 'place-business',
  },
  {
    id: 'T5',
    titleKey: tutorialKey('T5', 'title'),
    bodyKey: tutorialKey('T5', 'body'),
    highlightZone: 'incidentQueue',
    gate: 'confirm',
  },
  {
    id: 'T6',
    titleKey: tutorialKey('T6', 'title'),
    bodyKey: tutorialKey('T6', 'body'),
    highlightZone: 'endTurnButton',
    gate: 'action',
    requiredAction: 'end-turn',
  },
  {
    id: 'T7',
    titleKey: tutorialKey('T7', 'title'),
    bodyKey: tutorialKey('T7', 'body'),
    highlightZone: 'investmentsRow',
    gate: 'action',
    requiredAction: 'buy-event',
    // The TutorialScenario system puts Local Festival (evt-festival, $3)
    // in the investments row. This is affordable after the T3 Laundromat purchase
    // ($4) and T6 income (~1 coin). No specific card is required — the player can
    // buy any Investment event card.
  },
  {
    id: 'T8',
    titleKey: tutorialKey('T8', 'title'),
    bodyKey: tutorialKey('T8', 'body'),
    highlightZone: 'marketBusinessRow',
    gate: 'action',
    requiredAction: 'select-business',
    // The TutorialScenario system (TutorialScenario.ts) guarantees the Bookshop
    // (biz-bookshop-0) is present in the development row. It costs $3 (Culture
    // business) and matches the Local Festival's Culture bonus.
    requiredCardId: 'biz-bookshop-0',
  },
  {
    id: 'T9',
    titleKey: tutorialKey('T9', 'title'),
    bodyKey: tutorialKey('T9', 'body'),
    highlightZone: 'investmentsRow',
    gate: 'confirm',
  },
  {
    id: 'T10',
    titleKey: tutorialKey('T10', 'title'),
    bodyKey: tutorialKey('T10', 'body'),
    highlightZone: 'centerModal',
    gate: 'confirm',
  },

  {
    id: 'T11',
    titleKey: tutorialKey('T11', 'title'),
    bodyKey: tutorialKey('T11', 'body'),
    highlightZone: 'endTurnButton',
    gate: 'confirm',
  },
  {
    id: 'T12',
    titleKey: tutorialKey('T12', 'title'),
    bodyKey: tutorialKey('T12', 'body'),
    highlightZone: 'challengePanel',
    gate: 'confirm',
  },
  {
    id: 'T13',
    titleKey: tutorialKey('T13', 'title'),
    bodyKey: tutorialKey('T13', 'body'),
    highlightZone: 'hud',
    gate: 'confirm',
  },
  {
    id: 'T14',
    titleKey: tutorialKey('T14', 'title'),
    bodyKey: tutorialKey('T14', 'body'),
    highlightZone: 'completionModal',
    gate: 'confirm',
  },
] as const;

/** Total number of unified tutorial steps. */
export const UNIFIED_TUTORIAL_STEP_COUNT = UNIFIED_TUTORIAL_STEPS.length; // 14

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
  return step.requiredAction === actionType;
}

export function shouldAllowAction(
  state: TutorialControllerState,
  actionType: TutorialActionType,
): boolean {
  if (!state.isActive) return true;
  return isRequiredAction(state, actionType);
}

// ── i18n Resolution ─────────────────────────────────────────

/**
 * Resolve a tutorial step's title and body through the i18n system.
 *
 * Looks up `step.titleKey` and `step.bodyKey` via `t()`, falling back to
 * the key itself if no locale bundle has been registered.
 *
 * Utility glue for the overlay manager (`MainStreetTutorialHints`).
 */
export function resolveTutorialStepText(
  step: UnifiedTutorialStepDef,
): { title: string; body: string } {
  return {
    title: t(step.titleKey),
    body: t(step.bodyKey),
  };
}

/** Re-export `tutorialKey` for convenience. */
export { tutorialKey } from './i18n/tutorial-en';
