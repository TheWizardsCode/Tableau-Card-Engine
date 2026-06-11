/**
 * Main Street: Unified Tutorial Flow (Milestone 5+)
 *
 * Defines the unified T1-T13 tutorial steps that merge the original
 * 8 reference steps and 10 guided (action-gated) steps into a single
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
 * @module
 */

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
  | 'open-help'          // Open the help panel
  | 'confirm-complete';  // Click "Start Full Game" on completion modal

/**
 * The gate type for a tutorial step.
 * - `'confirm'`: Player clicks "Next" / "Continue" to advance.
 * - `'action'`: Player must perform a specific in-game action to advance.
 */
export type TutorialGateType = 'confirm' | 'action';

/**
 * A single unified tutorial step definition (13 steps total).
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
  /** Short title shown in the overlay. */
  title: string;
  /** Body copy explaining the concept. */
  body: string;
  /** Screen zone to highlight (null zones: centerModal, completionModal). */
  highlightZone: TutorialHighlightZone;
  /** Whether this step requires a gameplay action to advance. */
  gate: TutorialGateType;
  /**
   * The in-game action required to complete this step.
   * Only present when `gate === 'action'`.
   */
  requiredAction?: TutorialActionType;
}

/**
 * Legacy alias for backward compatibility.
 * @deprecated Use `UnifiedTutorialStepDef` instead.
 */
export type TutorialStepDef = UnifiedTutorialStepDef;

// ── Unified Tutorial Script (T1-T13) ────────────────────────

/**
 * The unified set of 13 tutorial steps, in sequential order.
 *
 * Merged from:
 * - 10 guided (action-gated) steps T1-T10 from the original TutorialFlow
 * - 8 reference steps from the original MainStreetTutorialHints
 *
 * Overlapping content was deduplicated while preserving all unique information.
 * New steps (9, 11, 12) come from the reference system to fill gaps.
 *
 * Gate type distribution: 7 confirm + 6 action.
 */
export const UNIFIED_TUTORIAL_STEPS: readonly UnifiedTutorialStepDef[] = [
  {
    id: 'T1',
    title: 'Welcome to Main Street',
    body:
      'Build the best Main Street in 20 turns. I\'ll guide your first few actions.\n\n' +
      'This is "Scenario: Tutorial" — Easy difficulty, 25 turns, and a lower score target.',
    highlightZone: 'centerModal',
    gate: 'confirm',
  },
  {
    id: 'T2',
    title: 'Resource HUD',
    body:
      'Track Coins, Reputation, and Score here. Running out of reputation or coins can end your run.',
    highlightZone: 'hud',
    gate: 'confirm',
  },
  {
    id: 'T3',
    title: 'Market Rows',
    body:
      'Click a business card (top row) to buy it.\n' +
      'Businesses go on your street to earn income.\n' +
      'Investments (bottom row) give one-time effects.',
    highlightZone: 'marketBusinessRow',
    gate: 'action',
    requiredAction: 'select-business',
  },
  {
    id: 'T4',
    title: 'Place a Business',
    body:
      'Place this business in a highlighted slot. Adjacent matching types create synergy bonuses.',
    highlightZone: 'streetGrid',
    gate: 'action',
    requiredAction: 'place-business',
  },
  {
    id: 'T5',
    title: 'Upcoming Incidents',
    body:
      'Blue cards show incidents that will hit at the end of each turn — plan around them!\n' +
      'Negative incidents (Tax Audit, Vandalism) cost coins or reputation.\n' +
      'Positive ones help you. Queue scrolls left: the leftmost card fires next.',
    highlightZone: 'incidentQueue',
    gate: 'confirm',
  },
  {
    id: 'T6',
    title: 'End Turn',
    body:
      'End Turn resolves income and incidents, then starts a new market day.',
    highlightZone: 'endTurnButton',
    gate: 'action',
    requiredAction: 'end-turn',
  },
  {
    id: 'T7',
    title: 'Held Event Card',
    body:
      'Buy the "Grand Opening Sale" event card from the investments row.\n' +
      'You can hold one event card and play it when timing is best.',
    highlightZone: 'investmentsRow',
    gate: 'action',
    requiredAction: 'buy-event',
  },
  {
    id: 'T8',
    title: 'Upgrade Concept',
    body:
      'Upgrades improve an existing business. Strong upgrades compound over remaining turns.',
    highlightZone: 'investmentsRow',
    gate: 'action',
    requiredAction: 'apply-upgrade',
  },
  {
    id: 'T9',
    title: 'Your Hand',
    body:
      'You can hold one Investment event at a time.\n' +
      'When you buy an event it appears here.\n' +
      'Click the card in your hand to play it for its one-time effect.',
    highlightZone: 'centerModal',
    gate: 'confirm',
  },
  {
    id: 'T10',
    title: 'Help + Hint Tools',
    body:
      'Need a refresher? Open Help anytime. Hint suggests one strong move per turn.',
    highlightZone: 'helpButton',
    gate: 'action',
    requiredAction: 'open-help',
  },
  {
    id: 'T11',
    title: 'Action Controls',
    body:
      'Use the buttons along the bottom to:\n' +
      '• End Turn — collect income and advance the day\n' +
      '• Undo / Redo — step back a market action\n' +
      '• Hint — get a suggested move\n' +
      '• Refresh — swap the investment row (costs coins)\n\n' +
      'You can also press the keyboard shortcut for End Turn (configurable in Settings).',
    highlightZone: 'endTurnButton',
    gate: 'confirm',
  },
  {
    id: 'T12',
    title: 'Challenges & Scoring',
    body:
      'Each run gives you challenges to complete for bonus points (visible in the Challenge Tracker).\n\n' +
      'Final Score = Coins + Reputation × multiplier + Challenges × bonus\n\n' +
      'Reach the target score to win — good luck!',
    highlightZone: 'investmentsRow',
    gate: 'confirm',
  },
  {
    id: 'T13',
    title: 'Tutorial Complete',
    body:
      'Great job! You\'re ready for a full run. Tutorial can be replayed from menu/settings.',
    highlightZone: 'completionModal',
    gate: 'confirm',
  },
] as const;

/** Total number of unified tutorial steps. */
export const UNIFIED_TUTORIAL_STEP_COUNT = UNIFIED_TUTORIAL_STEPS.length; // 13

/**
 * Legacy step definitions (first 10 steps from the unified set) for backward
 * compatibility with existing code that references `TUTORIAL_STEP_DEFS`.
 * @deprecated Use `UNIFIED_TUTORIAL_STEPS` instead.
 */
export const TUTORIAL_STEP_DEFS: readonly TutorialStepDef[] =
  UNIFIED_TUTORIAL_STEPS.slice(0, 10) as readonly TutorialStepDef[];

/**
 * Legacy step count (10) for backward compatibility.
 * @deprecated Use `UNIFIED_TUTORIAL_STEP_COUNT` (13) instead.
 */
export const TUTORIAL_STEP_COUNT = TUTORIAL_STEP_DEFS.length; // 10

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
