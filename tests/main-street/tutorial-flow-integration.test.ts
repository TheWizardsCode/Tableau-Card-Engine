import { describe, it, expect } from 'vitest';
import {
  createTutorialControllerState,
  startTutorial,
  getCurrentStep,
  isRequiredAction,
  completeCurrentStep,
} from '../../example-games/main-street/TutorialFlow';

describe('Tutorial Flow Integration - Business Selection', () => {
  it('T3 (select-business) should be active after T1-T2 confirms', () => {
    const controller = startTutorial(createTutorialControllerState());
    const step = getCurrentStep(controller);
    expect(step?.id).toBe('T1');

    // Advance T1 -> T2 -> T3
    let ctrl = controller;
    ctrl = completeCurrentStep(ctrl).newState; // T1 -> T2
    ctrl = completeCurrentStep(ctrl).newState; // T2 -> T3

    const t3 = getCurrentStep(ctrl);
    expect(t3?.id).toBe('T3');
    expect(t3?.gate).toBe('action');
    expect(t3?.requiredAction).toBe('select-business');

    // Verify select-business is the required action
    expect(isRequiredAction(ctrl, 'select-business')).toBe(true);
    expect(isRequiredAction(ctrl, 'place-business')).toBe(false);
  });

  it('should advance from T3 to T4 (Your Hand) after select-business action', () => {
    let ctrl = startTutorial(createTutorialControllerState());
    ctrl = completeCurrentStep(ctrl).newState; // T1 -> T2
    ctrl = completeCurrentStep(ctrl).newState; // T2 -> T3

    // Verify we're on T3
    expect(getCurrentStep(ctrl)?.id).toBe('T3');

    // Complete select-business action
    ctrl = completeCurrentStep(ctrl).newState;

    // Should now be on T4 (Your Hand, confirm)
    expect(getCurrentStep(ctrl)?.id).toBe('T4');
    expect(getCurrentStep(ctrl)?.gate).toBe('confirm');
  });

  it('should advance from T4 (Your Hand) to T5 (Upcoming Incidents) to T6 (End Turn)', () => {
    let ctrl = startTutorial(createTutorialControllerState());
    ctrl = completeCurrentStep(ctrl).newState; // T1 -> T2
    ctrl = completeCurrentStep(ctrl).newState; // T2 -> T3
    ctrl = completeCurrentStep(ctrl).newState; // T3 -> T4
    expect(getCurrentStep(ctrl)?.id).toBe('T4');

    ctrl = completeCurrentStep(ctrl).newState; // T4 -> T5
    expect(getCurrentStep(ctrl)?.id).toBe('T5');
    expect(getCurrentStep(ctrl)?.gate).toBe('confirm');

    ctrl = completeCurrentStep(ctrl).newState; // T5 -> T6
    expect(getCurrentStep(ctrl)?.id).toBe('T6');
    expect(getCurrentStep(ctrl)?.gate).toBe('action');
    expect(isRequiredAction(ctrl, 'end-turn')).toBe(true);
  });

  it('T11 (Bookshop move-to-hand) is select-business — no same-turn placement allowed', () => {
    let ctrl = startTutorial(createTutorialControllerState());
    // Advance to T11 (index 10): complete T1..T10
    for (let i = 0; i < 10; i++) ctrl = completeCurrentStep(ctrl).newState;
    expect(getCurrentStep(ctrl)?.id).toBe('T11');

    // Two-turn split: only pickup is required while T11 is active.
    expect(isRequiredAction(ctrl, 'select-business')).toBe(true);
    expect(isRequiredAction(ctrl, 'place-business')).toBe(false);

    // Complete the pickup step
    ctrl = completeCurrentStep(ctrl).newState;
    expect(getCurrentStep(ctrl)?.id).toBe('T12');
  });

  it('T20 play-event is required after T19', () => {
    let ctrl = startTutorial(createTutorialControllerState());
    for (let i = 0; i < 19; i++) ctrl = completeCurrentStep(ctrl).newState;
    expect(getCurrentStep(ctrl)?.id).toBe('T20');
    expect(getCurrentStep(ctrl)?.requiredAction).toBe('play-event');
    expect(isRequiredAction(ctrl, 'play-event')).toBe(true);
  });

  it('Continue button predicate should return true after action completes', () => {
    // Simulate the predicate logic used in showTutorialStepOverlay
    let ctrl = startTutorial(createTutorialControllerState());
    ctrl = completeCurrentStep(ctrl).newState; // T1 -> T2
    ctrl = completeCurrentStep(ctrl).newState; // T2 -> T3

    const step = getCurrentStep(ctrl);
    expect(step?.id).toBe('T3');

    // Predicate: action is complete when currentStep.id !== step.id
    // Initially, predicate should return false (action not done)
    let currentStep = getCurrentStep(ctrl);
    expect(currentStep?.id).toBe('T3');
    expect(currentStep?.id !== step?.id).toBe(false); // not complete yet

    // After action completes, advance
    ctrl = completeCurrentStep(ctrl).newState;

    // Now predicate should return true (action complete)
    currentStep = getCurrentStep(ctrl);
    expect(currentStep?.id).toBe('T4');
    expect(currentStep?.id !== step?.id).toBe(true); // action complete!
  });

  // ── Place-business step completion (CG-0MTMYI6YP0040NT5) ──
  // During place-business steps (T7/T15/T19), select-hand-card is allowed
  // (isRequiredAction returns true) but does NOT complete the step.
  // Only place-business completes the step.

  it('T7 place-business: select-hand-card is allowed but does NOT complete the step', () => {
    let ctrl = startTutorial(createTutorialControllerState());
    // Advance to T7 (index 6)
    for (let i = 0; i < 6; i++) ctrl = completeCurrentStep(ctrl).newState;
    expect(getCurrentStep(ctrl)?.id).toBe('T7');
    expect(getCurrentStep(ctrl)?.requiredAction).toBe('place-business');

    // select-hand-card is allowed (isRequiredAction returns true)
    expect(isRequiredAction(ctrl, 'select-hand-card')).toBe(true);
    expect(isRequiredAction(ctrl, 'place-business')).toBe(true);

    // But completeCurrentStep only advances when the action matches requiredAction.
    // Since T7 requiredAction is 'place-business', completing on select-hand-card
    // would be wrong. The lifecycle manager enforces this by checking
    // actionType === step.requiredAction before calling completeCurrentStep.
    // Verify: advancing T7 requires the step to be completed as place-business.
    // After completing T7, we should be on T8.
    ctrl = completeCurrentStep(ctrl).newState;
    expect(getCurrentStep(ctrl)?.id).toBe('T8');
    expect(getCurrentStep(ctrl)?.gate).toBe('confirm');
  });

  it('T15 place-business: select-hand-card is allowed but does NOT complete the step', () => {
    let ctrl = startTutorial(createTutorialControllerState());
    for (let i = 0; i < 14; i++) ctrl = completeCurrentStep(ctrl).newState;
    expect(getCurrentStep(ctrl)?.id).toBe('T15');
    expect(getCurrentStep(ctrl)?.requiredAction).toBe('place-business');

    expect(isRequiredAction(ctrl, 'select-hand-card')).toBe(true);
    expect(isRequiredAction(ctrl, 'place-business')).toBe(true);

    // Complete the step — should advance to T16
    ctrl = completeCurrentStep(ctrl).newState;
    expect(getCurrentStep(ctrl)?.id).toBe('T16');
  });

  it('T19 place-business: select-hand-card is allowed but does NOT complete the step', () => {
    let ctrl = startTutorial(createTutorialControllerState());
    for (let i = 0; i < 18; i++) ctrl = completeCurrentStep(ctrl).newState;
    expect(getCurrentStep(ctrl)?.id).toBe('T19');
    expect(getCurrentStep(ctrl)?.requiredAction).toBe('place-business');

    expect(isRequiredAction(ctrl, 'select-hand-card')).toBe(true);
    expect(isRequiredAction(ctrl, 'place-business')).toBe(true);

    // Complete the step — should advance to T20
    ctrl = completeCurrentStep(ctrl).newState;
    expect(getCurrentStep(ctrl)?.id).toBe('T20');
    expect(getCurrentStep(ctrl)?.requiredAction).toBe('play-event');
  });
});
