/**
 * Main Street: Lifecycle Manager (thin orchestrator)
 *
 * Thin class: every method delegates to a free function in a per-concern
 * helper module (Lifecycle / Tutorial / Campaign). Helper modules depend only
 * on `MainStreetLifecycleManagerContext`, so there are no cycles.
 *
 * @module
 */

import type { MainStreetLifecycleManagerContext } from './MainStreetLifecycleManagerContext';
import type { TutorialActionType } from '../TutorialFlow';
import type { TutorialVisibilityOptions } from '../TutorialState';
import { preload, create, handleResize } from './MainStreetLifecycleManagerLifecycle';
import { showTutorialOfferOrDeferredBanner, confirmTutorialStep, exitTutorialFlow, showTutorialStepOverlay, isTutorialActionAllowed, onTutorialActionComplete } from './MainStreetLifecycleManagerTutorial';
import { loadCampaignAndSetup, updateCampaignProgress, updateStats, loadBoardState, checkForCsvMismatchAndRegenerate, checkForSavedCheckpoint } from './MainStreetLifecycleManagerCampaign';

export type { MainStreetLifecycleManagerContext } from './MainStreetLifecycleManagerContext';

export class MainStreetLifecycleManager implements MainStreetLifecycleManagerContext {
  constructor(public readonly scene: any) {}

  public preload(): void {
    preload(this);
  }

  public create(): void {
    create(this);
  }

  public handleResize(): void {
    handleResize(this);
  }

  public showTutorialOfferOrDeferredBanner(
    tutorialOpts: TutorialVisibilityOptions,
    legacySeen?: boolean,
  ): boolean {
    return showTutorialOfferOrDeferredBanner(this, tutorialOpts, legacySeen);
  }

  public confirmTutorialStep(): void {
    confirmTutorialStep(this);
  }

  public exitTutorialFlow(): void {
    exitTutorialFlow(this);
  }

  public showTutorialStepOverlay(): void {
    showTutorialStepOverlay(this);
  }

  public isTutorialActionAllowed(actionType: TutorialActionType): { allowed: boolean; reason?: string } {
    return isTutorialActionAllowed(this, actionType);
  }

  public onTutorialActionComplete(actionType: TutorialActionType): void {
    onTutorialActionComplete(this, actionType);
  }

  public loadCampaignAndSetup(): void {
    loadCampaignAndSetup(this);
  }

  public updateCampaignProgress(): Promise<void> {
    return updateCampaignProgress(this);
  }

  public async updateStats(
    gameResult: 'win' | 'loss',
    finalScore: number,
  ): Promise<void> {
    return updateStats(this, gameResult, finalScore);
  }

  public loadBoardState(state: any): void {
    loadBoardState(this, state);
  }

  public async checkForCsvMismatchAndRegenerate(savedChecksum?: string): Promise<void> {
    return checkForCsvMismatchAndRegenerate(this, savedChecksum);
  }

  public checkForSavedCheckpoint(tutorialOpts: TutorialVisibilityOptions): void {
    checkForSavedCheckpoint(this, tutorialOpts);
  }
}
