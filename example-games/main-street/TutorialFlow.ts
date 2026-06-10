/**
 * Main Street: Action-Gated Tutorial Flow (Milestone 5)
 *
 * Defines the T1-T10 tutorial steps and a pure controller for managing
 * tutorial progression. Each step has a gate predicate that determines
 * whether the required player action has been completed.
 *
 * This module has NO Phaser dependency so it can be unit tested in Node.
 *
 * @module
 */

// ── Step Types ──────────────────────────────────────────────

/**
 * The zone of the screen that should be highlighted for a given step.
 *
 * @deprecated These zone names are transitional. They are currently used by
 * `MainStreetTutorialHints.zoneToAnchor()` to compute bounding-box coordinates
 * for tutorial highlight overlays. During the SLL migration (CG-0MP7IZ4RK008065O)
 * these kebab-case values will be replaced by camelCase SLL zone IDs from
 * `main-street-tutorial.layout.json` and resolution will switch to direct SLL
 * lookups via `composeResolvedLayouts()` + `getZoneRect()`.
 *
 * Zone name mapping (transitional kebab-case → SLL camelCase):
 *
 * | TutorialHighlightZone | SLL tutorial zone ID |
 * |----------------------|---------------------|
 * | `hud` | `hud` |
 * | `market-business-row` | `marketBusinessRow` |
 * | `street-grid` | `streetGrid` |
 * | `end-turn-button` | `endTurnButton` |
 * | `incident-queue` | `incidentQueue` |
 * | `investments-row` | `investmentsRow` |
 * | `help-button` | `helpButton` |
 * | `center-modal` | _(null — no highlight)_ |
 * | `completion-modal` | _(null — no highlight)_ |
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
 * The type of player action expected to complete a step.
 * This is used by the scene to restrict interactions and check gates.
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
 * A single tutorial step definition.
 */
export interface TutorialStepDef {
  /** Step identifier (T1, T2, ..., T10). */
  id: string;
  /** Short title shown in the overlay. */
  title: string;
  /** Body copy explaining the concept. */
  body: string;
  /** Screen zone to highlight. */
  highlightZone: TutorialHighlightZone;
  /** Required player action to complete this step. */
  requiredAction: TutorialActionType;
}

// ── Tutorial Script (T1-T10) ────────────────────────────────

export const TUTORIAL_STEP_DEFS: readonly TutorialStepDef[] = [
  {
    id: 'T1',
    title: 'Welcome to Main Street',
    body:
      'Build the best Main Street in 20 turns. I\'ll guide your first few actions.',
    highlightZone: 'centerModal',
    requiredAction: 'confirm',
  },
  {
    id: 'T2',
    title: 'Resource HUD',
    body:
      'Track Coins, Reputation, and Score here. Running out of reputation or coins can end your run.',
    highlightZone: 'hud',
    requiredAction: 'acknowledge',
  },
  {
    id: 'T3',
    title: 'Market Rows',
    body:
      'Click a business card (top row) to buy it.\n' +
      'Businesses go on your street to earn income.\n' +
      'Investments (bottom row) give one-time effects.',
    highlightZone: 'marketBusinessRow',
    requiredAction: 'select-business',
  },
  {
    id: 'T4',
    title: 'Place a Business',
    body:
      'Place this business in a highlighted slot. Adjacent matching types create synergy bonuses.',
    highlightZone: 'streetGrid',
    requiredAction: 'place-business',
  },
  {
    id: 'T5',
    title: 'Incident Queue',
    body:
      'Incidents are upcoming events that hit at the end of each turn.\nWatch this queue to plan ahead.',
    highlightZone: 'incidentQueue',
    requiredAction: 'acknowledge-queue',
  },
  {
    id: 'T6',
    title: 'End Turn',
    body:
      'End Turn resolves income and incidents, then starts a new market day.',
    highlightZone: 'endTurnButton',
    requiredAction: 'end-turn',
  },
  {
    id: 'T7',
    title: 'Held Event Card',
    body:
      'You can hold one event card and play it when timing is best.',
    highlightZone: 'investmentsRow',
    requiredAction: 'buy-event',
  },
  {
    id: 'T8',
    title: 'Upgrade Concept',
    body:
      'Upgrades improve an existing business. Strong upgrades compound over remaining turns.',
    highlightZone: 'investmentsRow',
    requiredAction: 'apply-upgrade',
  },
  {
    id: 'T9',
    title: 'Help + Hint Tools',
    body:
      'Need a refresher? Open Help anytime. Hint suggests one strong move per turn.',
    highlightZone: 'helpButton',
    requiredAction: 'open-help',
  },
  {
    id: 'T10',
    title: 'Tutorial Complete',
    body:
      'Great job! You\'re ready for a full run. Tutorial can be replayed from menu/settings.',
    highlightZone: 'completionModal',
    requiredAction: 'confirm-complete',
  },
] as const;

export const TUTORIAL_STEP_COUNT = TUTORIAL_STEP_DEFS.length; // 10
export const INVALID_ACTION_MESSAGE = 'Complete the highlighted step first.';

// ── Controller State ────────────────────────────────────────

export interface TutorialControllerState {
  /** Whether the tutorial is currently active. */
  isActive: boolean;
  /** Index into TUTORIAL_STEP_DEFS (0 = T1, 9 = T10), or -1 if not started. */
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

/**
 * Advances the tutorial to the next step.
 * Returns the new state without mutating the input.
 */
export function advanceTutorialStep(
  state: TutorialControllerState,
): TutorialControllerState {
  if (!state.isActive) return state;

  const nextIndex = state.currentStepIndex + 1;
  if (nextIndex >= TUTORIAL_STEP_COUNT) {
    // Past T10: tutorial is done (caller should persist completion)
    return {
      ...state,
      currentStepIndex: TUTORIAL_STEP_COUNT,
    };
  }

  return {
    ...state,
    currentStepIndex: nextIndex,
  };
}

/**
 * Starts the tutorial from the beginning (T1).
 */
export function startTutorial(
  _state: TutorialControllerState,
): TutorialControllerState {
  return {
    isActive: true,
    currentStepIndex: 0,
    lastCompletedStepId: null,
    exited: false,
  };
}

/**
 * Exits the tutorial early without marking it as completed.
 */
export function exitTutorial(
  state: TutorialControllerState,
): TutorialControllerState {
  return {
    ...state,
    isActive: false,
    exited: true,
  };
}

/**
 * Marks the current step as completed and advances to the next.
 * Returns the new state and the step that was completed.
 */
export function completeCurrentStep(
  state: TutorialControllerState,
): { newState: TutorialControllerState; completedStepId: string | null } {
  if (!state.isActive || state.currentStepIndex < 0) {
    return { newState: state, completedStepId: null };
  }
  if (state.currentStepIndex >= TUTORIAL_STEP_COUNT) {
    return { newState: state, completedStepId: null };
  }

  const step = TUTORIAL_STEP_DEFS[state.currentStepIndex];
  const next = advanceTutorialStep(state);

  return {
    newState: {
      ...next,
      lastCompletedStepId: step.id,
    },
    completedStepId: step.id,
  };
}

/**
 * Checks whether the tutorial is currently active and on a specific step.
 */
export function isOnStep(
  state: TutorialControllerState,
  stepId: string,
): boolean {
  if (!state.isActive) return false;
  const idx = TUTORIAL_STEP_DEFS.findIndex((s) => s.id === stepId);
  return idx >= 0 && state.currentStepIndex === idx;
}

/**
 * Gets the current step definition, or null if the tutorial is not active.
 */
export function getCurrentStep(
  state: TutorialControllerState,
): TutorialStepDef | null {
  if (!state.isActive) return null;
  if (state.currentStepIndex < 0 || state.currentStepIndex >= TUTORIAL_STEP_COUNT) return null;
  return TUTORIAL_STEP_DEFS[state.currentStepIndex];
}

/**
 * Determines whether a given action type is the one required by the current step.
 */
export function isRequiredAction(
  state: TutorialControllerState,
  actionType: TutorialActionType,
): boolean {
  const step = getCurrentStep(state);
  return step !== null && step.requiredAction === actionType;
}

/**
 * Determines whether a given action should be allowed during the current tutorial step.
 * Returns `true` if the action is the required one (allowed) or if the tutorial is not active.
 */
export function shouldAllowAction(
  state: TutorialControllerState,
  actionType: TutorialActionType,
): boolean {
  if (!state.isActive) return true;
  return isRequiredAction(state, actionType);
}
