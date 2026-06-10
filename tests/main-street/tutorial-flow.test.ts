import { describe, it, expect } from 'vitest';
import {
  TUTORIAL_STEP_DEFS,
  TUTORIAL_STEP_COUNT,
  INVALID_ACTION_MESSAGE,
  createTutorialControllerState,
  advanceTutorialStep,
  startTutorial,
  exitTutorial,
  completeCurrentStep,
  isOnStep,
  getCurrentStep,
  isRequiredAction,
  shouldAllowAction,
} from '../../example-games/main-street/TutorialFlow';

// ── Step Definitions ────────────────────────────────────────

describe('TUTORIAL_STEP_DEFS', () => {
  it('defines exactly 10 steps', () => {
    expect(TUTORIAL_STEP_DEFS.length).toBe(10);
    expect(TUTORIAL_STEP_COUNT).toBe(10);
  });

  it('steps have sequential T1-T10 IDs', () => {
    for (let i = 0; i < 10; i++) {
      expect(TUTORIAL_STEP_DEFS[i].id).toBe(`T${i + 1}`);
    }
  });

  it('each step has non-empty title and body', () => {
    for (const step of TUTORIAL_STEP_DEFS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });

  it('each step has a valid highlightZone', () => {
    const validZones = [
      'centerModal', 'hud', 'marketBusinessRow', 'streetGrid',
      'endTurnButton', 'incidentQueue', 'investmentsRow',
      'helpButton', 'completionModal',
    ];
    for (const step of TUTORIAL_STEP_DEFS) {
      expect(validZones).toContain(step.highlightZone);
    }
  });

  it('each step has a valid requiredAction', () => {
    const validActions = [
      'confirm', 'acknowledge', 'select-business', 'place-business',
      'end-turn', 'acknowledge-queue', 'buy-event', 'apply-upgrade',
      'open-help', 'confirm-complete',
    ];
    for (const step of TUTORIAL_STEP_DEFS) {
      expect(validActions).toContain(step.requiredAction);
    }
  });

  it('T1 has confirm action and centerModal highlight', () => {
    const t1 = TUTORIAL_STEP_DEFS[0];
    expect(t1.id).toBe('T1');
    expect(t1.requiredAction).toBe('confirm');
    expect(t1.highlightZone).toBe('centerModal');
  });

  it('T4 has place-business action and streetGrid highlight', () => {
    const t4 = TUTORIAL_STEP_DEFS[3];
    expect(t4.id).toBe('T4');
    expect(t4.requiredAction).toBe('place-business');
    expect(t4.highlightZone).toBe('streetGrid');
  });

  it('T5 has acknowledge-queue action and incidentQueue highlight', () => {
    const t5 = TUTORIAL_STEP_DEFS[4];
    expect(t5.id).toBe('T5');
    expect(t5.requiredAction).toBe('acknowledge-queue');
    expect(t5.highlightZone).toBe('incidentQueue');
  });

  it('T6 has end-turn action and endTurnButton highlight', () => {
    const t6 = TUTORIAL_STEP_DEFS[5];
    expect(t6.id).toBe('T6');
    expect(t6.requiredAction).toBe('end-turn');
    expect(t6.highlightZone).toBe('endTurnButton');
  });

  it('T9 has open-help action and helpButton highlight', () => {
    const t9 = TUTORIAL_STEP_DEFS[8];
    expect(t9.id).toBe('T9');
    expect(t9.requiredAction).toBe('open-help');
    expect(t9.highlightZone).toBe('helpButton');
  });

  it('T10 has confirm-complete action', () => {
    const t10 = TUTORIAL_STEP_DEFS[9];
    expect(t10.id).toBe('T10');
    expect(t10.requiredAction).toBe('confirm-complete');
    expect(t10.highlightZone).toBe('completionModal');
  });
});

// ── Invalid Action Message ──────────────────────────────────

describe('INVALID_ACTION_MESSAGE', () => {
  it('matches the PRD-specified message', () => {
    expect(INVALID_ACTION_MESSAGE).toBe('Complete the highlighted step first.');
  });
});

// ── Controller State ────────────────────────────────────────

describe('createTutorialControllerState', () => {
  it('returns a fresh inactive state', () => {
    const state = createTutorialControllerState();
    expect(state.isActive).toBe(false);
    expect(state.currentStepIndex).toBe(-1);
    expect(state.lastCompletedStepId).toBeNull();
    expect(state.exited).toBe(false);
  });
});

// ── Start Tutorial ──────────────────────────────────────────

describe('startTutorial', () => {
  it('starts the tutorial at T1', () => {
    const state = createTutorialControllerState();
    const started = startTutorial(state);
    expect(started.isActive).toBe(true);
    expect(started.currentStepIndex).toBe(0);
    expect(started.lastCompletedStepId).toBeNull();
    expect(started.exited).toBe(false);
  });

  it('resets an exited tutorial back to T1', () => {
    const state = createTutorialControllerState();
    const started = startTutorial(state);
    const exited = exitTutorial(started);
    const restarted = startTutorial(exited);
    expect(restarted.isActive).toBe(true);
    expect(restarted.currentStepIndex).toBe(0);
    expect(restarted.exited).toBe(false);
  });

  it('returns a new state (does not mutate)', () => {
    const state = createTutorialControllerState();
    const started = startTutorial(state);
    expect(started).not.toBe(state);
    expect(state.isActive).toBe(false);
  });
});

// ── Advance Step ────────────────────────────────────────────

describe('advanceTutorialStep', () => {
  it('advances from T1 to T2', () => {
    const state = startTutorial(createTutorialControllerState());
    const advanced = advanceTutorialStep(state);
    expect(advanced.currentStepIndex).toBe(1);
  });

  it('returns same state if tutorial is not active', () => {
    const state = createTutorialControllerState();
    const advanced = advanceTutorialStep(state);
    expect(advanced.currentStepIndex).toBe(-1);
    expect(advanced.isActive).toBe(false);
  });

  it('goes past T10 to indicate completion', () => {
    let state = startTutorial(createTutorialControllerState());
    for (let i = 0; i < 10; i++) {
      state = advanceTutorialStep(state);
    }
    expect(state.currentStepIndex).toBe(10);
  });

  it('returns a new state (does not mutate)', () => {
    const state = startTutorial(createTutorialControllerState());
    const advanced = advanceTutorialStep(state);
    expect(advanced).not.toBe(state);
  });
});

// ── Exit Tutorial ───────────────────────────────────────────

describe('exitTutorial', () => {
  it('marks tutorial as inactive and exited', () => {
    const state = startTutorial(createTutorialControllerState());
    const exited = exitTutorial(state);
    expect(exited.isActive).toBe(false);
    expect(exited.exited).toBe(true);
  });

  it('preserves lastCompletedStepId', () => {
    let state = startTutorial(createTutorialControllerState());
    const result = completeCurrentStep(state);
    state = result.newState;
    const exited = exitTutorial(state);
    expect(exited.lastCompletedStepId).toBe('T1');
  });

  it('returns a new state (does not mutate)', () => {
    const state = startTutorial(createTutorialControllerState());
    const exited = exitTutorial(state);
    expect(exited).not.toBe(state);
  });
});

// ── Complete Current Step ───────────────────────────────────

describe('completeCurrentStep', () => {
  it('completes T1 and advances to T2', () => {
    const state = startTutorial(createTutorialControllerState());
    const { newState, completedStepId } = completeCurrentStep(state);
    expect(completedStepId).toBe('T1');
    expect(newState.currentStepIndex).toBe(1);
    expect(newState.lastCompletedStepId).toBe('T1');
  });

  it('returns null completedStepId when tutorial is not active', () => {
    const state = createTutorialControllerState();
    const { completedStepId } = completeCurrentStep(state);
    expect(completedStepId).toBeNull();
  });

  it('returns null completedStepId when past T10', () => {
    let state = startTutorial(createTutorialControllerState());
    for (let i = 0; i < 10; i++) {
      state = advanceTutorialStep(state);
    }
    const { completedStepId } = completeCurrentStep(state);
    expect(completedStepId).toBeNull();
  });

  it('completes all 10 steps sequentially', () => {
    let state = startTutorial(createTutorialControllerState());
    const completedIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const result = completeCurrentStep(state);
      completedIds.push(result.completedStepId!);
      state = result.newState;
    }
    expect(completedIds).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10']);
    expect(state.currentStepIndex).toBe(10);
    expect(state.lastCompletedStepId).toBe('T10');
  });
});

// ── isOnStep ────────────────────────────────────────────────

describe('isOnStep', () => {
  it('returns true when on the correct step', () => {
    const state = startTutorial(createTutorialControllerState());
    expect(isOnStep(state, 'T1')).toBe(true);
  });

  it('returns false when on a different step', () => {
    const state = startTutorial(createTutorialControllerState());
    expect(isOnStep(state, 'T2')).toBe(false);
  });

  it('returns false when tutorial is not active', () => {
    const state = createTutorialControllerState();
    expect(isOnStep(state, 'T1')).toBe(false);
  });

  it('returns false for invalid step ID', () => {
    const state = startTutorial(createTutorialControllerState());
    expect(isOnStep(state, 'T99')).toBe(false);
  });
});

// ── getCurrentStep ──────────────────────────────────────────

describe('getCurrentStep', () => {
  it('returns the T1 step when just started', () => {
    const state = startTutorial(createTutorialControllerState());
    const step = getCurrentStep(state);
    expect(step).not.toBeNull();
    expect(step!.id).toBe('T1');
  });

  it('returns null when tutorial is not active', () => {
    const state = createTutorialControllerState();
    expect(getCurrentStep(state)).toBeNull();
  });

  it('returns null when past T10', () => {
    let state = startTutorial(createTutorialControllerState());
    for (let i = 0; i < 10; i++) {
      state = advanceTutorialStep(state);
    }
    expect(getCurrentStep(state)).toBeNull();
  });
});

// ── isRequiredAction ────────────────────────────────────────

describe('isRequiredAction', () => {
  it('returns true for the correct action on T1', () => {
    const state = startTutorial(createTutorialControllerState());
    expect(isRequiredAction(state, 'confirm')).toBe(true);
    expect(isRequiredAction(state, 'end-turn')).toBe(false);
  });

  it('returns true for place-business on T4', () => {
    let state = startTutorial(createTutorialControllerState());
    for (let i = 0; i < 3; i++) {
      state = advanceTutorialStep(state);
    }
    expect(isRequiredAction(state, 'place-business')).toBe(true);
    expect(isRequiredAction(state, 'confirm')).toBe(false);
  });

  it('returns false when tutorial is not active', () => {
    const state = createTutorialControllerState();
    expect(isRequiredAction(state, 'confirm')).toBe(false);
  });
});

// ── shouldAllowAction ───────────────────────────────────────

describe('shouldAllowAction', () => {
  it('allows the required action during tutorial', () => {
    const state = startTutorial(createTutorialControllerState());
    expect(shouldAllowAction(state, 'confirm')).toBe(true);
  });

  it('blocks non-required actions during tutorial', () => {
    const state = startTutorial(createTutorialControllerState());
    expect(shouldAllowAction(state, 'end-turn')).toBe(false);
    expect(shouldAllowAction(state, 'place-business')).toBe(false);
  });

  it('allows all actions when tutorial is not active', () => {
    const state = createTutorialControllerState();
    expect(shouldAllowAction(state, 'confirm')).toBe(true);
    expect(shouldAllowAction(state, 'end-turn')).toBe(true);
    expect(shouldAllowAction(state, 'place-business')).toBe(true);
  });

  it('allows acknowledge-queue on T5', () => {
    let state = startTutorial(createTutorialControllerState());
    for (let i = 0; i < 4; i++) {
      state = advanceTutorialStep(state);
    }
    expect(shouldAllowAction(state, 'acknowledge-queue')).toBe(true);
    expect(shouldAllowAction(state, 'end-turn')).toBe(false);
  });

  it('allows end-turn on T6', () => {
    let state = startTutorial(createTutorialControllerState());
    for (let i = 0; i < 5; i++) {
      state = advanceTutorialStep(state);
    }
    expect(shouldAllowAction(state, 'end-turn')).toBe(true);
    expect(shouldAllowAction(state, 'confirm')).toBe(false);
  });

  it('allows open-help on T9', () => {
    let state = startTutorial(createTutorialControllerState());
    for (let i = 0; i < 8; i++) {
      state = advanceTutorialStep(state);
    }
    expect(shouldAllowAction(state, 'open-help')).toBe(true);
    expect(shouldAllowAction(state, 'confirm')).toBe(false);
  });
});
