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

  it('should advance from T4 (Your Hand) to T5 (Place a Business)', () => {
    let ctrl = startTutorial(createTutorialControllerState());
    ctrl = completeCurrentStep(ctrl).newState; // T1 -> T2
    ctrl = completeCurrentStep(ctrl).newState; // T2 -> T3
    ctrl = completeCurrentStep(ctrl).newState; // T3 -> T4
    expect(getCurrentStep(ctrl)?.id).toBe('T4');

    ctrl = completeCurrentStep(ctrl).newState; // T4 -> T5
    expect(getCurrentStep(ctrl)?.id).toBe('T5');
    expect(isRequiredAction(ctrl, 'place-business')).toBe(true);
  });

  it('T10 buy-and-place composite allows select-business then completes on place-business', () => {
    let ctrl = startTutorial(createTutorialControllerState());
    // Advance to T10 (index 9): complete T1..T9
    for (let i = 0; i < 9; i++) ctrl = completeCurrentStep(ctrl).newState;
    expect(getCurrentStep(ctrl)?.id).toBe('T10');

    // Composite: pickup (select-business) and drop (place-business) both allowed
    expect(isRequiredAction(ctrl, 'select-business')).toBe(true);
    expect(isRequiredAction(ctrl, 'place-business')).toBe(true);

    // Complete the step (drop)
    ctrl = completeCurrentStep(ctrl).newState;
    expect(getCurrentStep(ctrl)?.id).toBe('T11');
  });

  it('T14 play-event is required after T13', () => {
    let ctrl = startTutorial(createTutorialControllerState());
    for (let i = 0; i < 13; i++) ctrl = completeCurrentStep(ctrl).newState;
    expect(getCurrentStep(ctrl)?.id).toBe('T14');
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
});
