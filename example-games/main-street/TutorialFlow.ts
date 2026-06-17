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
 * ## Coin Budget Analysis (Tutorial seed, Easy difficulty)
 *
 * With the fixed tutorial seed and Easy difficulty (12 coins, 5 reputation):
 *
 * - Market business cards: Cinema ($10), **Laundromat ($6)**, Hardware Store ($10), Clinic ($10)
 * - Investments: Upgrade to Garden ($3), Upgrade to Bistro ($4), Grand Opening Sale ($2)
 * - Incidents in queue: varies by RNG, but per-turn income from the placed business
 *   ensures sufficient coins remain throughout the 13-step flow.
 *
 * ### Budget Walkthrough
 *
 * | Step | Action                     | Coins In | Coins Out | Balance |
 * |------|----------------------------|----------|-----------|---------|
 * | T1   | Start (Easy)               | 12       | 0         | 12      |
 * | T2   | Confirm (no cost)          | 0        | 0         | 12      |
 * | T3   | Buy Laundromat ($6)        | 0        | 6         | 6       |
 * | T4   | Place business (free)      | 0        | 0         | 6       |
 * | T5   | Confirm (no cost)          | 0        | 0         | 6       |
 * | T6   | End Turn + income (~1 coin)| 1        | 0         | 7       |
 * | T7   | Buy Grand Opening Sale ($2)| 0        | 2         | 5       |
 * | T8   | Confirm (no cost)          | 0        | 0         | 5       |
 * | T9   | Confirm (no cost)          | 0        | 0         | 5       |
 * | T10  | Confirm (no cost)          | 0        | 0         | ~6      |
 * | T11  | Confirm (no cost)          | 0        | 0         | ~6      |
 * | T12  | Confirm (no cost)          | 0        | 0         | ~6      |
 * | T13  | Confirm (no cost)          | 0        | 0         | ~6      |
 *
 * **Conclusion:** Even with worst-case incidents, the budget is sufficient
 * for all tutorial actions. The cheapest viable business card (Laundromat,
 * $6) leaves enough coins for the Grand Opening Sale ($2) after one turn's
 * income.
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
 * The unified set of 13 tutorial steps, in sequential order.
 *
 * Merged from:
 * - 9 guided (action-gated) steps T1-T9 from the original TutorialFlow
 * - 8 reference steps from the original MainStreetTutorialHints
 *
 * Overlapping content was deduplicated while preserving all unique information.
 * New steps (from the original 13-step set and split Challenges/Scoring)
 * come from the reference system to fill gaps.
 *
 * Gate type distribution: 9 confirm + 4 action.
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
    title: 'Development Row',
    body:
      'Click any card from the Development row to buy it.\n' +
      'Cards go on your street to earn income.\n\n' +
      'Buy the **Laundromat** card (cost $6) — it is the cheapest card and will earn you income each turn.\n\n' +
      'The bottom row shows Investment cards with one-time effects.',
    highlightZone: 'marketBusinessRow',
    gate: 'action',
    requiredAction: 'select-business',
    // With the fixed tutorial seed 'tutorial-seed', the Laundromat (biz-laundromat-0) is
    // always at market index 1 and costs $6 (most affordable, leaves 6 coins for later steps).
    requiredCardId: 'biz-laundromat-0',
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
      'Buy the **Grand Opening Sale** event card from the investments row.\n' +
      'You can hold one event card and play it when timing is best.',
    highlightZone: 'investmentsRow',
    gate: 'action',
    requiredAction: 'buy-event',
    // With the fixed tutorial seed 'tutorial-seed', Grand Opening Sale (evt-grand-opening-15)
    // is always at investments index 2 and costs $2 (affordable after T3+T6 income).
    requiredCardId: 'evt-grand-opening-15',
  },
  {
    id: 'T8',
    title: 'Upgrade Concept',
    body:
      'Upgrades improve an existing business. Strong upgrades compound over remaining turns.',
    highlightZone: 'investmentsRow',
    gate: 'confirm',
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
    id: 'T11',
    title: 'Challenges',
    body:
      'Each run gives you challenges to complete for bonus points (visible in the Challenge Tracker).\n\n' +
      'Completing challenges unlocks new cards for future games —' +
      ' the more challenges you complete across runs, the more businesses,' +
      ' upgrades, and events you will have access to!',
    highlightZone: 'challengePanel',
    gate: 'confirm',
  },
  {
    id: 'T12',
    title: 'Scoring',
    body:
      'Your score is shown at the top of the screen.\n\n' +
      'Final Score = Coins + Reputation × multiplier + Challenges × bonus\n\n' +
      'Reach the target score within the turn limit to win the game — good luck!',
    highlightZone: 'hud',
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
