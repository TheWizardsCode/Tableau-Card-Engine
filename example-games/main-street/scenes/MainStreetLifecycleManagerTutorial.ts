/**
 * Main Street: Tutorial Lifecycle
 *
 * Tutorial offer/deferred banner, step confirmation/overlay, action gating,
 * and completion.
 *
 * Import graph: depends only on `MainStreetLifecycleManagerContext` (type).
 *
 * @module
 */

import { INVALID_ACTION_MESSAGE, completeCurrentStep, exitTutorial, getCurrentStep, isRequiredAction } from '../TutorialFlow';
import type { TutorialActionType, TutorialControllerState } from '../TutorialFlow';
import type { TutorialVisibilityOptions } from '../TutorialState';
import type { MainStreetLifecycleManagerContext } from './MainStreetLifecycleManagerContext';

export function showTutorialOfferOrDeferredBanner(lmCtx: MainStreetLifecycleManagerContext, 
    tutorialOpts: TutorialVisibilityOptions,
    legacySeen?: boolean,
  ): boolean {

    const s = lmCtx.scene;
    const modal = (s as any).tutorialOfferModal as { showIfEligible?: (o: TutorialVisibilityOptions, l?: boolean) => boolean } | undefined;
    const shown = modal?.showIfEligible?.(tutorialOpts, legacySeen) ?? false;
    if (!shown) {
      // No modal waiting — play the deferred banner now.
      s.playDeferredWeekBanner();
    }
    return shown;
  
}

export function confirmTutorialStep(lmCtx: MainStreetLifecycleManagerContext): void {

    const s = lmCtx.scene;
    const controller = (s as any).tutorialController as TutorialControllerState | undefined;
    if (!controller || !controller.isActive) return;

    const step = getCurrentStep(controller);
    if (!step) {
      // No current step means tutorial completed - dismiss overlay
      (s as any).tutorialOverlay?.dismiss();
      return;
    }

    // For action steps, the Continue button should only work if the action
    // has been completed. The predicate determines lmCtx. Since we want to
    // allow continuing even if overlay is stale (action happened elsewhere),
    // we check the predicate result here.
    if (step.gate === 'action') {
      const overlay = (s as any).tutorialOverlay as { getActionCompletePredicate?: () => (() => boolean) | null } | undefined;
      const predicate = overlay?.getActionCompletePredicate?.();
      // If predicate returns true, action completed - advance the tutorial
      if (predicate && predicate()) {
        const { newState } = completeCurrentStep(controller);
        Object.assign(s, { tutorialController: newState });
        (s as any).showTutorialStepOverlay?.();
      }
      // If predicate returns false, action not done - do nothing (button ignored)
      return;
    }

    if (step.requiredAction === 'confirm' || step.requiredAction === 'confirm-complete') {
      const { newState } = completeCurrentStep(controller);
      Object.assign(s, { tutorialController: newState });

      (s as any).showTutorialStepOverlay?.();
    } else if (step.requiredAction === 'acknowledge' || step.requiredAction === 'acknowledge-queue') {
      const { newState } = completeCurrentStep(controller);
      Object.assign(s, { tutorialController: newState });
      (s as any).showTutorialStepOverlay?.();
    }
  
}

export function exitTutorialFlow(lmCtx: MainStreetLifecycleManagerContext): void {

    const s = lmCtx.scene;
    const controller = (s as any).tutorialController as TutorialControllerState | undefined;
    if (!controller) return;
    Object.assign(s, { tutorialController: exitTutorial(controller) });
    (s as any).tutorialOverlay?.dismiss();
  
}

export function showTutorialStepOverlay(lmCtx: MainStreetLifecycleManagerContext): void {

    const s = lmCtx.scene;
    const controller = (s as any).tutorialController as TutorialControllerState | undefined;
    if (!controller || !controller.isActive) return;
    try {
      const step = getCurrentStep(controller);
      if (!step) return;

      // Show the next overlay step
      (s as any).tutorialOverlay?.showStep(controller.currentStepIndex);
    } catch (_) { /* ignore */ }
  
}

export function isTutorialActionAllowed(lmCtx: MainStreetLifecycleManagerContext, actionType: TutorialActionType): { allowed: boolean; reason?: string } {

    const s = lmCtx.scene;
    const controller = (s as any).tutorialController as TutorialControllerState | undefined;
    if (!controller || !controller.isActive) return { allowed: true };

    if (isRequiredAction(controller, actionType)) return { allowed: true };
    return { allowed: false, reason: INVALID_ACTION_MESSAGE };
  
}

export function onTutorialActionComplete(lmCtx: MainStreetLifecycleManagerContext, actionType: TutorialActionType): void {

    const s = lmCtx.scene;
    const controller = (s as any).tutorialController as TutorialControllerState | undefined;
    if (!controller || !controller.isActive) return;
    const step = getCurrentStep(controller);
    if (!step || step.gate !== 'action') return;

    if (!isRequiredAction(controller, actionType)) {
      return;
    }

    // Only complete the step when the action matches the requiredAction.
    // During place-business steps (T7/T15/T19), select-hand-card is allowed
    // (isRequiredAction returns true) but does NOT complete the step — only
    // the actual placement (place-business) advances the tutorial.
    // (CG-0MTMYI6YP0040NT5 — tutorial place-business step was completing on
    // hand selection, soft-locking the player before they could place.)
    if (actionType !== step.requiredAction) {
      return;
    }

    const { newState } = completeCurrentStep(controller);
    Object.assign(s, { tutorialController: newState });

    // A completed place-business step already returns the scene to the
    // market phase with pendingHandIndex cleared. This reset for play-event
    // steps (T20) keeps the held event card clickable in the hand (event
    // clicks are only wired while uiPhase === 'market').
    const nextStep = getCurrentStep(newState);
    if (nextStep?.requiredAction === 'play-event') {
      s.uiPhase = 'market';
      s.pendingHandIndex = null;
    }

    // Show next step immediately (for action steps) or after brief delay
    // For select-business -> place-business transition, show immediately
    (s as any).showTutorialStepOverlay?.();
  
}
