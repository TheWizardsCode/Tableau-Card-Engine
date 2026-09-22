/**
 * Main Street: Lifecycle Manager Context Interface
 *
 * The public surface the manager exposes to its helper modules. Helper modules
 * depend ONLY on this type (never on each other) — hub-and-spoke, no cycles.
 *
 * @module
 */

import type { TutorialActionType } from '../TutorialFlow';
import type { TutorialVisibilityOptions } from '../TutorialState';

export interface MainStreetLifecycleManagerContext {
  readonly scene: any;
  preload(): void;
  create(): void;
  handleResize(): void;
  showTutorialOfferOrDeferredBanner(
    tutorialOpts: TutorialVisibilityOptions,
    legacySeen?: boolean,
  ): boolean;
  confirmTutorialStep(): void;
  exitTutorialFlow(): void;
  showTutorialStepOverlay(): void;
  isTutorialActionAllowed(actionType: TutorialActionType): { allowed: boolean; reason?: string };
  onTutorialActionComplete(actionType: TutorialActionType): void;
  loadCampaignAndSetup(): void;
  updateCampaignProgress(): Promise<void>;
  updateStats(
    gameResult: 'win' | 'loss',
    finalScore: number,
  ): Promise<void>;
  loadBoardState(state: any): void;
  checkForCsvMismatchAndRegenerate(savedChecksum?: string): Promise<void>;
  checkForSavedCheckpoint(tutorialOpts: TutorialVisibilityOptions): void;
}
