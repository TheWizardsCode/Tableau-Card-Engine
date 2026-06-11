import { setupMainStreetGame, deserializeMainStreetState } from '../MainStreetState';
import { createDefaultCampaignProgress, loadCampaignProgress, updateCampaignAfterRun, saveCampaignProgress } from '../MainStreetSaveLoad';
import { DIFFICULTY_NAMES } from '../MainStreetDifficulty';
import { SaveLoadStore, markSceneValid, markSceneInvalid, createTfPlayer, UndoRedoManager } from '../../../src/core-engine';
import { createSingleSelectionManager, TooltipManager } from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import { MAIN_STREET_TF_SFX_MAPPING } from '../sfx-tf-mapping';
import { getMainStreetTfModule, loadMainStreetTfModule } from '../tf/mainStreetTfModule';
import { MainStreetTranscriptRecorder, setMainStreetRecorder } from '../MainStreetTranscript';
import { BG_COLOR, SFX_KEYS } from './MainStreetConstants';
import { MainStreetRenderer } from './MainStreetRenderer';
import { MainStreetAnimator } from './MainStreetAnimator';
import { MainStreetTurnController } from './MainStreetTurnController';
import { MainStreetOverlayContent } from './MainStreetOverlayContent';
import { MainStreetInputManager } from './MainStreetInputManager';
import { MainStreetSvgTextureManager } from './MainStreetSvgTextureManager';
import { MainStreetTutorialHints } from './MainStreetTutorialHints';
import { TutorialOfferModal } from './TutorialOfferModal';
import {
  BrowserLocalStorageAdapter,
  loadTutorialState,
  saveTutorialState,
  updateTutorialStatus,
  type TutorialVisibilityOptions,
} from '../TutorialState';
import {
  createTutorialControllerState,
  startTutorial,
  exitTutorial,
  completeCurrentStep,
  getCurrentStep,
  isRequiredAction,
  INVALID_ACTION_MESSAGE,
  type TutorialControllerState,
  type TutorialActionType,
} from '../TutorialFlow';
import { getEndTurnKeybind } from '../../../src/ui/SettingsStore';

export class MainStreetLifecycleManager {
  constructor(private readonly scene: any) {}

  preload(): void {
    const s = this.scene;
    // Canonical card size for Main Street market placeholder (140x80)
    try {
      // Load placeholder as an image to avoid Phaser's SVGFile XML parsing in some environments.
      // Phaser's svg loader parses and manipulates the SVG XML during onProcess which
      // can cause DOMParser issues in headless/browser test harnesses. We therefore
      // load the SVG via the image loader which treats it as an image resource.
      s.load.image('ms_placeholder_card', 'assets/games/main-street/svg/placeholder-card.svg');

      // Preload Main Street audio assets (small, CC0-generated SFX and a short loop)
      try {
        const audioDir = 'assets/games/main-street/audio';
        s.load.audio(SFX_KEYS.DEAL, `${audioDir}/deal.wav`);
        s.load.audio(SFX_KEYS.MOVE_LOOP, `${audioDir}/deal.wav`);
        s.load.audio(SFX_KEYS.PLACE, `${audioDir}/place.wav`);
        s.load.audio(SFX_KEYS.DISCARD, `${audioDir}/discard.wav`);
        s.load.audio(SFX_KEYS.COIN_POP, `${audioDir}/coin-pop.wav`);
        s.load.audio(SFX_KEYS.CLICK, `${audioDir}/click.wav`);
        s.load.audio(SFX_KEYS.BG_LOOP, `${audioDir}/loop.wav`);
        s.load.audio(SFX_KEYS.BUSINESS_START, `${audioDir}/deal.wav`);
        s.load.audio(SFX_KEYS.BUSINESS_END, `${audioDir}/place.wav`);
        s.load.audio(SFX_KEYS.UPGRADE_START, `${audioDir}/click.wav`);
        s.load.audio(SFX_KEYS.UPGRADE_END, `${audioDir}/place.wav`);
        s.load.audio(SFX_KEYS.EVENT_CHEER, `${audioDir}/coin-pop.wav`);
      } catch (e) {
        // Some test environments may lack an audio loader; ignore preload failures
      }

      // Fetch all per-card SVG assets as text for dynamic rasterisation at display size.
      // We do not pre-load them as textures - we lazily rasterise them at exact pixel
      // dimensions needed for crisp rendering on the current screen/DPR.
      s.msSvgTextureManager = s.msSvgTextureManager ?? new MainStreetSvgTextureManager(s);
      s.msSvgTextureManager.loadCardSvgSources();

      // Preload small SVG icons used by the generator/help panel so the HelpPanel
      // can display them in the sidebar. Use image loader to avoid DOM parsing
      // differences in headless/test environments.
      try {
        const icons = ['food','culture','commerce','service','entertainment'];
        const iconsDir = 'assets/games/main-street/svg/icons';
        for (const k of icons) {
          s.load.image(`ms-icon-${k}`, `${iconsDir}/ms-icon-${k}.svg`);
        }
      } catch (e) {
        // ignore icon preload failures in constrained environments
      }
    } catch (e) {
      // If svg loader is unavailable in the current environment, ignore
      // eslint-disable-next-line no-console
      console.debug('[MS] preload: svg load failed', e);
    }
  }


  create(): void {
    const s = this.scene;
    markSceneValid(s);
    s.cameras.main.setBackgroundColor(BG_COLOR);

    // Ensure placeholder texture exists. Some test environments have trouble
    // loading SVGs as images. Generate a simple placeholder texture at runtime
    // if it's not already present in the Texture Manager.
    try {
      if (!s.textures.exists('ms_placeholder_card')) {
        const g = s.add.graphics();
        // Background
        g.fillStyle(0xf5efe6, 1);
        g.fillRoundedRect(0, 0, 140, 80, 6);
        g.lineStyle(2, 0xc8b79a, 1);
        g.strokeRoundedRect(0, 0, 140, 80, 6);
        // Badge circle
        g.fillStyle(0xe0c7a0, 1);
        g.fillCircle(118, 56, 12);
        // Render into texture
        g.generateTexture('ms_placeholder_card', 140, 80);
        g.destroy();
      }
    } catch (e) {
      // Non-fatal: if texture generation fails let the scene continue
      // and fall back to colored rectangles.
      // eslint-disable-next-line no-console
      console.debug('[MS] placeholder generation failed', e);
    }

    // Initialize helpers needed during reset and early lifecycle callbacks
    s.msAnimator = new MainStreetAnimator(s);
    s.msTurnController = new MainStreetTurnController(s);
    s.msOverlayManager = new MainStreetOverlayContent(s);
    s.msInputManager = new MainStreetInputManager(s);
    s.msSvgTextureManager = new MainStreetSvgTextureManager(s);

    // Reset
    s.uiPhase = 'idle';
    s.pendingBusinessCard = null;
    s.overlayObjects = [];
    s.previousCoins = null;
    s.previousReputation = null;
    s.pendingBusinessSourceIndex = null;
    s.transferAnimationCount = 0;
    s.cleanupTransferAnimations();
    s.hiddenTransferSourceCardIds.clear();

    // Reset hint state
    s.hintUsedThisTurn = false;
    s.hintedCardId = null;
    s.hintedSlotIndex = null;

    s.marketSelectionByCardId.clear();
    s.selectedMarketCardId = null;
    s.marketSelectionManager?.destroy();
    s.marketSelectionManager = createSingleSelectionManager(s);

    // Reset activity-log panel state in case this scene instance is restarted.
    s.logScrollOffset = 0;
    s.logMaxScroll = 0;
    s.logTotalContentH = 0;
    s.logAutoScroll = true;
    s.logPrevEntryCount = 0;

    s.detectReplayMode();
    s.initEventSystem();
    s.initHUDContainer();

    // Sound (re-use existing audio assets)
    // Register Main Street SFX and map common events to logical sound keys.
    // The mapping uses common engine events; scenes can emit these events
    // via `s.gameEvents.emit(...)` to trigger audio feedback.
    const mapping = {
      'ui-interaction': SFX_KEYS.CLICK,
      'card-drawn': SFX_KEYS.DEAL,
      'card:placed': SFX_KEYS.PLACE,
      'card-discarded': SFX_KEYS.DISCARD,
      // income-gained is an example domain event emitted when coins are earned
      'income-gained': SFX_KEYS.COIN_POP,
    } as const;

    const tfModule = getMainStreetTfModule();
    const tfPlayer = tfModule
      ? createTfPlayer(tfModule)
      : null;

    s.initSoundSystem(Object.values(SFX_KEYS), mapping, {
      synthPlayer: tfPlayer,
      synthKeyMap: MAIN_STREET_TF_SFX_MAPPING,
    });

    // Late async tf module load (runtime-generated module path) without restart.
    void loadMainStreetTfModule().then((loadedModule) => {
      if (!loadedModule || !s.soundManager) return;
      s.soundManager.setSynthIntegration(
        createTfPlayer(loadedModule),
        MAIN_STREET_TF_SFX_MAPPING,
      );
    });

    // UI scaffolding
    s.msRenderer = new MainStreetRenderer(s);
    s.msAnimator = new MainStreetAnimator(s);
    s.msTurnController = new MainStreetTurnController(s);
    s.msOverlayManager = new MainStreetOverlayContent(s);
    s.msInputManager = new MainStreetInputManager(s);
    s.msSvgTextureManager = new MainStreetSvgTextureManager(s);
    s.layout = s.computeLayout();
    s.svgDebugEnabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('msSvgDebug') === '1';

    // Create tutorial overlay manager early so it's available to any async
    // callbacks (campaign load) that may want to auto-show the tutorial.
    try {
      (s as any).tutorialOverlay = new MainStreetTutorialHints(s, () => {
        try {
          // On tutorial overlay completion, persist tutorial completion state
          const tutorialState = loadTutorialState(new BrowserLocalStorageAdapter());
          const updated = updateTutorialStatus(tutorialState, 'completed');
          void saveTutorialState(new BrowserLocalStorageAdapter(), updated);
          if (s.campaign) {
            s.campaign.tutorialSeen = true;
            if (s.saveStore) {
              void saveCampaignProgress(s.saveStore, s.campaign).catch(() => {});
            }
          }
        } catch (_) { /* ignore */ }
      });
    } catch (e) {
      // Ignore if DOM environment is unavailable (tests)
      /* keep silent on creation failure */
    }

    // Game setup -- load campaign for tier-filtered deck building
    s.saveStore = new SaveLoadStore();
    this.loadCampaignAndSetup();

    // Undo/Redo manager (per-scene)
    s.undoManager = new UndoRedoManager();

    // Transcript recorder (optional) — attach global recorder so other modules
    // (AI, Monte Carlo runner) can emit events without direct wiring.
    try {
      const initialSnapshot = { seed: s.state.seed ?? null, snapshotAtTurn: s.state.turn };
      const recorder = new MainStreetTranscriptRecorder(initialSnapshot);
      setMainStreetRecorder(recorder);
    } catch (_) {
      // ignore if recorder cannot be created
    }

    // Prewarm SVG textures once all SVG sources are loaded.
    // Until then the scene uses fallback cards; then we refresh with SVG textures.
    void s.cardSvgLoadPromise
      .then(() => s.prewarmVisibleCardTextures())
      .then(() => {
        try {
          if (s && s.hudContainer && (s as any).game?.renderer) {
            s.refreshAll();
          }
        } catch {
          // Ignore errors - scene may have been destroyed
        }
      });
    s.createHeader();
    s.createContainers();
    s.createInstructions();
    s.initSvgDebugOverlay();

    s.scale.off(Phaser.Scale.Events.RESIZE, s.handleResize, s);
    s.scale.on(Phaser.Scale.Events.RESIZE, s.handleResize, s);

    // Help panel (Milestone 5: PRD-required sections)
    const cfg = s.state.config;
    const helpSections: HelpSection[] = [
      {
        heading: 'How to Play',
        body:
          'Buy businesses from the market and place them on the 2x5 street.\n' +
          'Earn income and score through card value + synergy + reputation.\n' +
          'Buy upgrades to improve existing businesses.\n' +
          'Hold one event card and play it when timing is best.\n' +
          'Complete challenges for bonus points and instant-win conditions.\n' +
          'Manage coins and reputation across 20 turns to build the best street.',
      },
      {
        heading: 'Card Types',
        body:
          'Business (green): persistent board value, placed on your street.\n' +
          'Upgrade (orange): enhances an existing business on the street.\n' +
          'Event / Investment (brown): one-time effects, held in your hand.\n' +
          'Incident (blue): automatic pressure events at end of each turn.\n' +
          'Each card has a cost, value, and one or more synergy types.',
      },
      {
        heading: 'Synergy and Placement',
        render: (scene, container, x, y, maxWidth) => {
          const paragraph =
            'Adjacent matching synergy types yield bonus income. ' +
            'Synergy checks are performed for left/right neighbors and stack additively. ' +
            'Some cards bridge multiple synergy types and count for both. ' +
            'Upgrades can increase range and value. ' +
            'Plan placements to cluster synergies for higher returns.';

          const paraStyle: Phaser.Types.GameObjects.Text.TextStyle = {
            fontSize: '14px',
            color: '#dddddd',
            fontFamily: 'Arial, sans-serif',
            lineSpacing: 2,
            wordWrap: { width: Math.max(80, maxWidth || 260), useAdvancedWrap: true } as any,
          };

          const para = scene.add.text(x, y, paragraph, paraStyle);
          para.setOrigin(0, 0);
          container.add(para);

          let cy = y + para.height + 12;

          const types = [
            { key: 'ms-icon-food', label: 'Food' },
            { key: 'ms-icon-culture', label: 'Culture' },
            { key: 'ms-icon-commerce', label: 'Commerce' },
            { key: 'ms-icon-service', label: 'Service' },
            { key: 'ms-icon-entertainment', label: 'Entertainment' },
          ];

          const iconSize = 16;
          const gapY = 8;
          const labelXOffset = iconSize + 8;
          const labelStyle: Phaser.Types.GameObjects.Text.TextStyle = {
            fontSize: '14px',
            color: '#dddddd',
            fontFamily: 'Arial, sans-serif',
            lineSpacing: 2,
            wordWrap: { width: Math.max(40, (maxWidth || 120) - labelXOffset), useAdvancedWrap: true } as any,
          };

          for (const t of types) {
            const img = scene.add.image(x, cy, t.key).setOrigin(0, 0);
            img.setDisplaySize(iconSize, iconSize);
            container.add(img);
            const label = scene.add.text(x + labelXOffset, cy, t.label, labelStyle);
            label.setOrigin(0, 0);
            container.add(label);
            const rowH = Math.max(iconSize, label.height);
            cy += rowH + gapY;
          }

          return cy - y;
        },
      },
      {
        heading: 'Turn Flow',
        body:
          'Day Start: market refreshes and income is calculated.\n' +
          'Market Actions: buy businesses, upgrades, or events from the market.\n' +
          'Place businesses on the street grid to earn future income.\n' +
          'End Turn: resolves income, incidents, and advances to the next day.\n' +
          'Repeat for 20 turns or until you win or go bankrupt.',
      },
      {
        heading: 'Win / Loss Conditions',
        body:
          `Reach ${cfg.winThreshold} points to win (coins + reputation multiplier + challenges).\n` +
          `Complete all ${cfg.challengesPerRun} challenges for an instant win.\n` +
          `Survive ${cfg.maxTurns} turns with positive reputation for a turn-limit victory.\n` +
          'Bankruptcy (coins < 0) or reputation collapse (rep <= 0) loses the game.',
      },
      {
        heading: 'Tools',
        body:
          'Hint: get a suggested move (once per turn).\n' +
          'Undo / Redo: step back or forward through market actions.\n' +
          'Refresh Investments: swap the investment row (costs coins).\n' +
          'Keyboard shortcuts: End Turn key configurable in Settings.',
      },
    ];
    s.initHelpPanel(helpSections);
    // Patch help button to support tutorial gating (T9: open-help)
    // The HelpButton's hitArea pointerdown handler directly calls helpPanel.toggle(),
    // so we intercept by wrapping the panel's toggle method.
    const originalHelpToggle = (s as any).helpPanel?.toggle?.bind((s as any).helpPanel);
    if (originalHelpToggle && (s as any).helpPanel) {
      (s as any).helpPanel.toggle = () => {
        const wasOpen = (s as any).helpPanel.isOpen;
        // Tutorial gating: only allow open-help if it's the required action or tutorial is inactive
        const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('open-help' as TutorialActionType);
        if (check && !check.allowed) {
          s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
          return;
        }
        originalHelpToggle();
        // If we just opened help (was closed, now open), mark tutorial step complete
        if ((s as any).helpPanel.isOpen && !wasOpen) {
          (s.msLifecycleManager as any).onTutorialActionComplete?.('open-help' as TutorialActionType);
        }
      };
    }
    // Provide the ordered difficulty names so the Settings panel can render a selector
    s.initSettingsPanel(DIFFICULTY_NAMES);
    if (!s.replayMode) {
      s.tooltipManager = new TooltipManager(s, s.settingsPanel);
    }

    // Create tutorial offer modal for first-launch onboarding (Milestone 5).
    // The modal shows before free turn interactions begin and blocks input
    // until the player starts or skips the tutorial.
    try {
      (s as any).tutorialOfferModal = new TutorialOfferModal(
        s,
        new BrowserLocalStorageAdapter(),
        {
          onStartTutorial: () => {
            try {
              // Start the action-gated tutorial flow (T1-T13)
              const controller = (s as any).tutorialController as TutorialControllerState | undefined;
              if (controller) {
                Object.assign(s, { tutorialController: startTutorial(controller) });
                // Show the first tutorial step overlay
                (s as any).showTutorialStepOverlay?.();
              }
            } catch (_) { /* ignore */ }
          },
          onSkip: () => {
            // Normal gameplay begins; the DayStart -> MarketPhase flow
            // is already in motion from startDayPhase() called below.
          },
        },
      );
    } catch (_) {
      // Ignore if DOM environment is unavailable (tests)
    }

    // Initialize the action-gated tutorial controller state
    (s as any).tutorialController = createTutorialControllerState();

    // Note: tce:play-tutorial and tce:replay-tutorial event listeners have been
    // removed. The unified tutorial system uses the TutorialOfferModal (guided
    // mode for first-time players) and the reference-mode replay button in
    // Settings has been removed. Tutorial completion persists via the
    // tutorial overlay's onComplete callback and the LifecycleManager's
    // persistTutorialCompletion() method.


    // Global keyboard handler for End Turn (configurable via Settings)
    const endTurnKeyHandler = (ev: KeyboardEvent) => {
      try {
        if (s.replayMode) return;
        const bound = getEndTurnKeybind((window as any).localStorage);
        if (!bound) return;
        if (ev.key !== bound) return;
        // Guard: overlays/panels open
        const overlayOpen = Array.isArray(s.overlayObjects) && s.overlayObjects.length > 0;
        if (overlayOpen) return;
        if ((s as any).helpPanel?.isOpen) return;
        if ((s as any).settingsPanel?.isOpen) return;
        if (s.uiPhase !== 'market') return;
        // Trigger end turn via canonical path
        s.endTurn();
      } catch (e) {
        // ignore runtime errors in key handler
      }
    };

    if (s.input && s.input.keyboard) {
      s.input.keyboard.on('keydown', endTurnKeyHandler);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('keydown', endTurnKeyHandler as EventListener);
    }

    s.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      markSceneInvalid(s);
      s.cleanupTransferAnimations();
      try {
        if (s.input && s.input.keyboard) {
          s.input.keyboard.off('keydown', endTurnKeyHandler);
        } else if (typeof window !== 'undefined') {
          window.removeEventListener('keydown', endTurnKeyHandler as EventListener);
        }
      } catch (_) { /* ignore */ }
    });

    // Start first turn
    s.startDayPhase();
  }

  public handleResize(): void {
    const s = this.scene;
    s.layout = s.computeLayout();

    // Keep SVG texture cache aligned with display metrics (DPR/viewport).
    try {
      s.msSvgTextureManager?.syncDisplayMetrics?.();
    } catch {
      // ignore in constrained test environments
    }

    // Regenerate textures at new sizes on resize.
    s.prewarmVisibleCardTextures();
    s.challengeContainer.setPosition(s.layout.challengeX, s.layout.challengeY);
    s.logContainer.setPosition(s.layout.logX, s.layout.logY);
    s.instructionText.setPosition(s.layout.gameW - 24, s.layout.instructionY);
    s.refreshAll();
  }

  // ── Tutorial Flow Handlers (Milestone 5 action-gated) ───

  /**
   * Called by the tutorial overlay to confirm the current step.
   * For steps with action type 'confirm' or 'confirm-complete', this
   * advances to the next step. For other steps, this does nothing
   * (the step is completed by the actual game action).
   */
  public confirmTutorialStep(): void {
    const s = this.scene;
    const controller = (s as any).tutorialController as TutorialControllerState | undefined;
    if (!controller || !controller.isActive) return;

    const step = getCurrentStep(controller);
    if (!step) return;

    if (step.requiredAction === 'confirm' || step.requiredAction === 'confirm-complete') {
      const { newState, completedStepId } = completeCurrentStep(controller);
      Object.assign(s, { tutorialController: newState });

      if (completedStepId === 'T10') {
        this.persistTutorialCompletion();
        (s as any).tutorialOverlay?.dismiss();
        return;
      }

      (s as any).showTutorialStepOverlay?.();
    } else if (step.requiredAction === 'acknowledge' || step.requiredAction === 'acknowledge-queue') {
      const { newState } = completeCurrentStep(controller);
      Object.assign(s, { tutorialController: newState });
      (s as any).showTutorialStepOverlay?.();
    }
  }

  /**
   * Exits the tutorial early without marking it as completed.
   */
  public exitTutorialFlow(): void {
    const s = this.scene;
    const controller = (s as any).tutorialController as TutorialControllerState | undefined;
    if (!controller) return;
    Object.assign(s, { tutorialController: exitTutorial(controller) });
    (s as any).tutorialOverlay?.dismiss();
  }

  /**
   * Shows the overlay for the current tutorial step.
   *
   * Uses the unified showStep() method from MainStreetTutorialHints with a
   * gate-aware Continue button: for action-gated steps the Continue button
   * stays disabled until the required in-game action is completed.
   */
  public showTutorialStepOverlay(): void {
    const s = this.scene;
    const controller = (s as any).tutorialController as TutorialControllerState | undefined;
    if (!controller || !controller.isActive) return;
    try {
      const step = getCurrentStep(controller);
      if (!step) return;

      // For action-gated steps, set an action-complete predicate so
      // the Continue button is disabled until the required action succeeds.
      if (step.gate === 'action') {
        const overlay = (s as any).tutorialOverlay as { setActionCompletePredicate: (p: () => boolean) => void } | undefined;
        if (overlay && typeof overlay.setActionCompletePredicate === 'function') {
          overlay.setActionCompletePredicate(() => {
            const current = getCurrentStep(controller);
            if (!current || current.id !== step.id) return false;
            // Step is still active but not yet completed — check if the
            // required action has been recorded as completed.
            // We use a conservative check: if the player is still on this
            // step, the action is NOT yet complete (it will be marked
            // complete by onTutorialActionComplete which advances the step).
            return false;
          });
        }
      }

      (s as any).tutorialOverlay?.showStep(controller.currentStepIndex);
    } catch (_) { /* ignore */ }
  }

  /**
   * Checks whether a given game action should be allowed during tutorial.
   * Returns { allowed: boolean, reason?: string }.
   */
  public isTutorialActionAllowed(actionType: TutorialActionType): { allowed: boolean; reason?: string } {
    const s = this.scene;
    const controller = (s as any).tutorialController as TutorialControllerState | undefined;
    if (!controller || !controller.isActive) return { allowed: true };

    if (isRequiredAction(controller, actionType)) return { allowed: true };
    return { allowed: false, reason: INVALID_ACTION_MESSAGE };
  }

  /**
   * Called when a tutorial action-gated game action succeeds.
   * Advances the tutorial to the next step and shows the next overlay.
   */
  public onTutorialActionComplete(actionType: TutorialActionType): void {
    const s = this.scene;
    const controller = (s as any).tutorialController as TutorialControllerState | undefined;
    if (!controller || !controller.isActive) return;
    if (!isRequiredAction(controller, actionType)) return;

    const { newState, completedStepId } = completeCurrentStep(controller);
    Object.assign(s, { tutorialController: newState });

    if (completedStepId === 'T10') {
      this.persistTutorialCompletion();
      (s as any).tutorialOverlay?.dismiss();
      return;
    }

    s.time.delayedCall(600, () => {
      (s as any).showTutorialStepOverlay?.();
    });
  }

  /** Persists tutorial completion to localStorage and campaign. */
  private persistTutorialCompletion(): void {
    const s = this.scene;
    try {
      const storage = new BrowserLocalStorageAdapter();
      const tutorialState = loadTutorialState(storage);
      const updated = updateTutorialStatus(tutorialState, 'completed');
      void saveTutorialState(storage, updated);
      if (s.campaign) {
        s.campaign.tutorialSeen = true;
        if (s.saveStore) {
          void saveCampaignProgress(s.saveStore, s.campaign).catch(() => {});
        }
      }
    } catch (_) { /* ignore */ }
  }

  public loadCampaignAndSetup(): void {
    const s = this.scene;
    // Synchronously set up with defaults first (so UI can render immediately)
    s.campaign = createDefaultCampaignProgress();
    // If a persisted difficulty exists in the SettingsPanel, prefer that for new games.
    try {
      const persisted = (s.settingsPanel?.selectedDifficulty) as unknown as string | undefined;
      if (persisted && DIFFICULTY_NAMES.includes(persisted as any)) {
        s.selectedDifficulty = persisted as any;
      }
    } catch {
      // ignore
    }

    s.state = setupMainStreetGame({
      difficulty: s.selectedDifficulty,
      unlockedCardIds: s.campaign.unlockedCardIds,
    });

    // Determine tutorial visibility options from scene state
    const tutorialOpts: TutorialVisibilityOptions = {
      replayMode: s.replayMode === true,
      forceShowOffer: typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tutorial') === '1',
    };

    // Async: attempt to load saved campaign and re-setup if found
    if (s.saveStore) {
      // Store the load promise on the scene so other code can wait if needed
      (s as any)._campaignLoadPromise = loadCampaignProgress(s.saveStore).then((saved: any) => {
        if (saved) {
          s.campaign = saved;
          // Re-setup with the loaded campaign's unlocked cards
          s.state = setupMainStreetGame({
            difficulty: s.selectedDifficulty,
            unlockedCardIds: s.campaign.unlockedCardIds,
          });
          // Must call startDayPhase() (not just refreshAll) so the new
          // state transitions from DayStart -> MarketPhase and the UI
          // phase is synchronised.  Without this, the engine stays in
          // DayStart while the UI shows market controls, blocking all
          // player actions and causing End Turn to hang.
          try { s.startDayPhase(); } catch (_) { /* ignore */ }
        }
        // After attempting to load (saved or not), show the tutorial offer modal
        // if eligibility checks pass (Milestone 5 onboarding flow).
        try {
          const legacySeen = s.campaign ? (s.campaign as any).tutorialSeen : undefined;
          (s as any).tutorialOfferModal?.showIfEligible(tutorialOpts, legacySeen);
        } catch (e) { /* eslint-disable-next-line no-console */ console.error('[MainStreet] tutorial offer check failed', e); }
        return saved;
      }).catch(() => {
        // If load fails, continue with defaults and show offer modal
        try {
          const legacySeen = s.campaign ? (s.campaign as any).tutorialSeen : undefined;
          (s as any).tutorialOfferModal?.showIfEligible(tutorialOpts, legacySeen);
        } catch (e) { /* eslint-disable-next-line no-console */ console.error('[MainStreet] tutorial offer fallback failed', e); }
        return null;
      });
    } else {
      // No saveStore: show tutorial offer modal if eligible (best-effort)
      try {
        const legacySeen = s.campaign ? (s.campaign as any).tutorialSeen : undefined;
        (s as any).tutorialOfferModal?.showIfEligible(tutorialOpts, legacySeen);
      } catch (_) { /* ignore */ }
    }
  }

  public updateCampaignProgress(): Promise<void> {
    const s = this.scene;
    if (!s.campaign || !s.saveStore) return Promise.resolve();
    return updateCampaignAfterRun(s.campaign, s.state, s.saveStore)
      .then(() => {})  // discard the returned campaign (already mutated in place)
      .catch(() => {
        // Silently ignore save failures -- campaign will be retried next run
      });
  }

  public loadBoardState(state: any): void {
    const s = this.scene;
    if (!s.replayMode) {
      throw new Error('loadBoardState() is only available in replay mode (?mode=replay)');
    }

    try {
      // If the payload looks like a full serialized state, use the deserializer
      if (state && state.config && typeof state.turn === 'number') {
        s.state = deserializeMainStreetState(state);
      } else if (state && state.initialState) {
        // Some transcripts embed initialState under a wrapper
        s.state = deserializeMainStreetState(state.initialState as any);
      } else if (state && state.seed) {
        // Minimal snapshot: create a fresh game from the seed
        s.state = setupMainStreetGame({ seed: state.seed, difficulty: s.selectedDifficulty });
        if (typeof state.turn === 'number') {
          s.state.turn = state.turn;
        }
      } else {
        // Fallback: generate a default game
        s.state = setupMainStreetGame({ difficulty: s.selectedDifficulty });
      }
    } catch (e) {
      // On error, fall back to a default setup so replay can continue
      console.error('[MS] loadBoardState deserialise failed:', e);
      s.state = setupMainStreetGame({ difficulty: s.selectedDifficulty });
    }

    // Refresh visuals to reflect the injected state
    s.refreshAll();

    // If a stepIndex or turn was provided, use it; otherwise use current turn
    const step = state && (state.stepIndex ?? state.turn ?? null);
    const stepIdx = typeof step === 'number' ? step : s.state.turn;

    // Signal board is visually stable
    s.emitStateSettled(stepIdx, 'playing');
  }
}
