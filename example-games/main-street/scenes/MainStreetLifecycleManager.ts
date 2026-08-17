import { CSV_CHECKSUM } from '../MainStreetCards';
import { setupMainStreetGame, deserializeMainStreetState } from '../MainStreetState';
import { createDefaultCampaignProgress, loadCampaignProgress, updateCampaignAfterRun, saveCampaignProgress, createMainStreetCheckpointManager } from '../MainStreetSaveLoad';
import { DIFFICULTY_NAMES } from '../MainStreetDifficulty';
import { createTutorialScenario } from '../TutorialScenario';
import { SaveLoadStore, createDefaultResumeOverlay, markSceneValid, markSceneInvalid, createTfPlayer, UndoRedoManager } from '../../../src/core-engine';
import { createSingleSelectionManager, TooltipManager } from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import { MAIN_STREET_TF_SFX_MAPPING } from '../sfx-tf-mapping';
import { getMainStreetTfModule, loadMainStreetTfModule } from '../tf/mainStreetTfModule';
import { MainStreetTranscriptRecorder, setMainStreetRecorder } from '../MainStreetTranscript';
import { StatsOverlay } from './StatsOverlay';
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
  BrowserStatsStorageAdapter,
  loadStats,
  saveStats,
  updateStatsAfterRun,
} from '../StatsDomain';
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
      // Audio keys are namespace-scoped with 'main-street' for collision protection.
      try {
        const ns = 'main-street';
        const audioDir = 'assets/games/main-street/audio';
        s.load.audio(`${ns}:${SFX_KEYS.DEAL}`, `${audioDir}/deal.wav`);
        s.load.audio(`${ns}:${SFX_KEYS.MOVE_LOOP}`, `${audioDir}/deal.wav`);
        s.load.audio(`${ns}:${SFX_KEYS.PLACE}`, `${audioDir}/place.wav`);
        s.load.audio(`${ns}:${SFX_KEYS.DISCARD}`, `${audioDir}/discard.wav`);
        s.load.audio(`${ns}:${SFX_KEYS.COIN_POP}`, `${audioDir}/coin-pop.wav`);
        s.load.audio(`${ns}:${SFX_KEYS.CLICK}`, `${audioDir}/click.wav`);
        s.load.audio(`${ns}:${SFX_KEYS.BG_LOOP}`, `${audioDir}/loop.wav`);
        s.load.audio(`${ns}:${SFX_KEYS.BUSINESS_START}`, `${audioDir}/deal.wav`);
        s.load.audio(`${ns}:${SFX_KEYS.BUSINESS_END}`, `${audioDir}/place.wav`);
        s.load.audio(`${ns}:${SFX_KEYS.UPGRADE_START}`, `${audioDir}/click.wav`);
        s.load.audio(`${ns}:${SFX_KEYS.UPGRADE_END}`, `${audioDir}/place.wav`);
        s.load.audio(`${ns}:${SFX_KEYS.EVENT_CHEER}`, `${audioDir}/coin-pop.wav`);
        s.load.audio(`${ns}:${SFX_KEYS.INCOME_POSITIVE}`, `${audioDir}/coin-pop.wav`);
        s.load.audio(`${ns}:${SFX_KEYS.INCOME_NEGATIVE}`, `${audioDir}/discard.wav`);
        s.load.audio(`${ns}:${SFX_KEYS.INCOME_NEUTRAL}`, `${audioDir}/click.wav`);
        s.load.audio(`${ns}:${SFX_KEYS.CELEBRATE}`, `${audioDir}/coin-pop.wav`);
        // Illegal-move feedback (drag veto / invalid drop): the shared
        // illegal-move WAV lives in the default audio dir (not the game
        // audio dir). Load it under BOTH the namespace-scoped key (for the
        // SoundManager) and the raw COMMON key (played by safePlaySound /
        // shakeIllegalMove) — same pattern as Beleaguered Castle.
        s.load.audio(`${ns}:${SFX_KEYS.ILLEGAL_MOVE}`, 'assets/audio/default/illegal-move.wav');
        s.load.audio(SFX_KEYS.ILLEGAL_MOVE, 'assets/audio/default/illegal-move.wav');
        // Game-over fanfare/sting: the default game-win / game-lost WAVs
        // live in the shared default audio dir (same pattern as
        // ILLEGAL_MOVE above — convention keys per docs/SFX_CONVENTION.md).
        s.load.audio(`${ns}:${SFX_KEYS.GAME_WIN}`, 'assets/audio/default/game-win.wav');
        s.load.audio(`${ns}:${SFX_KEYS.GAME_LOST}`, 'assets/audio/default/game-lost.wav');
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
        const icons = ['food','culture','commerce','service','entertainment','stats'];
        const iconsDir = 'assets/games/main-street/svg/icons';
        
        for (const k of icons) {
          s.load.image(`ms-icon-${k}`, `${iconsDir}/ms-icon-${k}.svg`);
        }
      } catch (e) {
        // ignore icon preload failures in constrained environments
      }
    } catch (e) {
      // If svg loader is unavailable in the current environment, ignore
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
    s.logAutoScroll = false;
    s.logPrevEntryCount = 0;

    s.detectReplayMode();
    s.initEventSystem();
    s.initHUDContainer();
    s.initMenuButton();

    // Sound (re-use existing audio assets)
    // Register Main Street SFX and map common events to logical sound keys.
    // The mapping uses common engine events; scenes can emit these events
    // via `s.gameEvents.emit(...)` to trigger audio feedback.
    const mapping = {
      'ui-interaction': SFX_KEYS.CLICK,
      'card-drawn': SFX_KEYS.DEAL,
      'card:placed': SFX_KEYS.PLACE,
      'card-discarded': SFX_KEYS.DISCARD,
      // income-gained is emitted when coins are earned; mapped to dedicated positive sound
      'income-gained': SFX_KEYS.INCOME_POSITIVE,
    } as const;

    const tfModule = getMainStreetTfModule();
    const tfPlayer = tfModule
      ? createTfPlayer(tfModule)
      : null;

    s.initSoundSystem(Object.values(SFX_KEYS), mapping, {
      synthPlayer: tfPlayer,
      synthKeyMap: MAIN_STREET_TF_SFX_MAPPING,
      namespace: 'main-street',
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
    s.checkpointManager = createMainStreetCheckpointManager(s.saveStore);

    // Wire checkpoint callbacks to the turn controller
    s.msTurnController.onSaveCheckpoint = () => {
      if (s.state) {
        s.checkpointManager.save(s.state).catch((_err: unknown) => {
          console.warn('[MainStreet] Failed to save checkpoint:', _err);
        });
      }
    };
    s.msTurnController.onGameEnd = () => {
      s.checkpointManager.clear().catch((_err: unknown) => {
        console.warn('[MainStreet] Failed to clear checkpoint:', _err);
      });
    };

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
          'Hold event cards and play them when timing is best.\n' +
          'Complete challenges for bonus points and instant-win conditions.\n' +
          'Manage coins and reputation to build the best street — games end\n' +
          'when you win (score threshold / all challenges) or lose\n' +
          '(bankruptcy / reputation collapse). There is no turn limit.',
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
            'Adjacency is 8-way: orthogonal AND diagonally adjacent slots count (including diagonal). ' +
            'Synergy bonuses stack additively per matching neighbor. ' +
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
          'Repeat until you win (score threshold / all challenges) or lose\n' +
          '(bankruptcy / reputation collapse).',
      },
      {
        heading: 'Win / Loss Conditions',
        body:
          `Reach ${cfg.winThreshold} points to win (coins + reputation multiplier + challenges).\n` +
          `Complete all ${cfg.challengesPerRun} challenges for an instant win.\n` +
          'No turn limit: keep playing until you win or lose.\n' +
          'Bankruptcy (coins < 0) or reputation collapse (rep <= 0) loses the game.',
      },
      {
        heading: 'Tools',
        body:
          'Hint: get a suggested move (once per turn).\n' +
          'Undo / Redo: step back or forward through market actions.\n' +
          'Refresh Market: re-roll the market row for coins (5, less with the Accountant).\n' +
          'Keyboard shortcuts: End Turn key configurable in Settings.',
      },
    ];
    s.initHelpPanel(helpSections);
    // Note: The help button gating for the removed "Help + Hint Tools" step (old T10)
    // has been removed. The tutorial no longer has an open-help action step.
    // The HelpPanel toggle no longer needs tutorial intercept.
    // Provide the ordered difficulty names so the Settings panel can render a selector
    s.initSettingsPanel(DIFFICULTY_NAMES, 'Medium');
    // Drag-and-drop buy-to-slot (business cards → street slots): wire the
    // reusable core-engine drag-drop module after the settings panel exists
    // (reads reducedMotion) and before the first startDayPhase refresh.
    try {
      s.msTurnController.initDragDrop();
    } catch (e) {
      // Non-fatal: if input is unavailable (headless tests) drag is skipped.
      console.debug('[MS] initDragDrop skipped', e);
    }
    // Listen for difficulty changes and restart the game with the new difficulty
    if (typeof window !== 'undefined') {
      const difficultyChangeHandler = (ev: Event) => {
        const detail = (ev as CustomEvent).detail;
        const newDifficulty = detail?.difficulty as string | undefined;
        if (!newDifficulty || !DIFFICULTY_NAMES.includes(newDifficulty as any)) return;
        if (newDifficulty === s.selectedDifficulty) return;
        s.selectedDifficulty = newDifficulty as any;
        // Clear any checkpoint from the previous difficulty
        try { s.checkpointManager?.clear().catch(() => {}); } catch { /* ignore */ }
        // Create a fresh game with the new difficulty
        s.state = setupMainStreetGame({
          difficulty: s.selectedDifficulty,
          unlockedCardIds: s.campaign?.unlockedCardIds,
        });
        s.startDayPhase();
        s.refreshAll();
      };
      window.addEventListener('tce:difficulty-changed', difficultyChangeHandler);
      s.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        window.removeEventListener('tce:difficulty-changed', difficultyChangeHandler);
      });
    }
    s.initUndoRedoButtons(
      () => s.performUndo(),
      () => s.performRedo(),
    );
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
              // ── Tutorial Scenario Setup ──────────────────────
              // When the tutorial starts, create the game state using the
              // explicit TutorialScenario system instead of seed-based
              // shuffling. This guarantees exactly which cards appear in
              // the market and incident queue, independent of deck
              // composition. The tutorial always uses Easy difficulty
              // (10 starting coins after CG-0MSP26Q5N002EH8P re-tune, 5
              // starting reputation); the scenario overrides the coin
              // budget to 16 for the tutorial's fixed buy plan.
              //
              // The scenario system uses the STANDARD_TUTORIAL_SCENARIO
              // definition which references only Tier-1 cards, ensuring
              // all requiredCardId values in TutorialFlow.ts resolve.
              s.selectedDifficulty = 'Easy';
              s.state = createTutorialScenario();
              // Re-initialize the transcript recorder with the new seed
              try {
                const { MainStreetTranscriptRecorder, setMainStreetRecorder } = require('../MainStreetTranscript');
                const initialSnapshot = { seed: s.state.seed, snapshotAtTurn: s.state.turn };
                const recorder = new MainStreetTranscriptRecorder(initialSnapshot);
                setMainStreetRecorder(recorder);
              } catch (_) { /* ignore */ }
              // Start the day phase so the market populates
              s.startDayPhase();
              // Start the action-gated tutorial flow (T1-T17)
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

    // Create the stats overlay (slide-in panel for player statistics)
    try {
      (s as any).statsOverlay = new StatsOverlay(s);
    } catch (_) {
      // Ignore if DOM environment is unavailable (tests)
    }

    // Note: tce:play-tutorial and tce:replay-tutorial event listeners have been
    // removed. The unified tutorial system uses the TutorialOfferModal (guided
    // mode for first-time players) and the reference-mode replay button in
    // Settings has been removed. Tutorial completion persists via the
    // tutorial overlay's onComplete callback and the LifecycleManager's
    // the tutorial overlay's onComplete callback, which persists
    // completion only after all 13 steps are finished.


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
        if ((s as any).statsOverlay?.isOpen) return;
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
      // Tear down the drag-drop manager (removes its scene input listeners).
      try { s.dragDropManager?.destroy(); s.dragDropManager = undefined; } catch (_) { /* ignore */ }
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
    // Centre instruction text in the main content area (between left margin and right column)
    const instructionCX = Math.round(s.layout.logX / 2);
    s.instructionText.setPosition(instructionCX, s.layout.instructionY);
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
    if (!step) {
      // No current step means tutorial completed - dismiss overlay
      (s as any).tutorialOverlay?.dismiss();
      return;
    }

    // For action steps, the Continue button should only work if the action
    // has been completed. The predicate determines this. Since we want to
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

      // Show the next overlay step
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
   *
   * For the composite `buy-and-place` action (T10), only the terminal drop
   * (`place-business`) completes the step — the pickup (`select-business`)
   * keeps the step active so the player can still drag the card onto the street.
   */
  public onTutorialActionComplete(actionType: TutorialActionType): void {
    const s = this.scene;
    const controller = (s as any).tutorialController as TutorialControllerState | undefined;
    if (!controller || !controller.isActive) return;
    const step = getCurrentStep(controller);
    if (!step || step.gate !== 'action') return;

    // Composite buy-and-place: only the terminal drop completes the step.
    if (step.requiredAction === 'buy-and-place') {
      if (actionType !== 'place-business') return;
    } else if (!isRequiredAction(controller, actionType)) {
      return;
    }

    const { newState } = completeCurrentStep(controller);
    Object.assign(s, { tutorialController: newState });

    // T13 is a composite buy-and-place step (like T10): the terminal
    // place-business completes it and already returns the scene to the
    // market phase with pendingHandIndex cleared. This reset for play-event
    // steps (T14) is therefore a defensive no-op today, but it is kept so
    // the held event card is always clickable in the hand (event clicks are
    // only wired while uiPhase === 'market').
    const nextStep = getCurrentStep(newState);
    if (nextStep?.requiredAction === 'play-event') {
      s.uiPhase = 'market';
      s.pendingHandIndex = null;
    }

    // Show next step immediately (for action steps) or after brief delay
    // For select-business -> place-business transition, show immediately
    (s as any).showTutorialStepOverlay?.();
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

    // Early regeneration: ensure card SVG sources are fresh from the parsed CSV
    // data before any async SVG prewarming occurs. This eliminates the race
    // condition where texture prewarming rasterizes stale static SVGs before
    // the CSV mismatch check has a chance to run (see CG-0MRH36Z6800065JC).
    // Texture cache invalidation is handled atomically inside
    // prewarmVisibleCardTextures() — per-key remove-and-rasterize.
    try {
      s.msSvgTextureManager?.regenerateSvgSourcesFromCsv();
    } catch (_) {
      // Non-fatal: scene continues with fetched SVGs if regeneration fails
    }

    // Re-apply regenerated SVGs after all SVG fetches complete. Individual
    // fetch() callbacks from loadCardSvgSources() may overwrite the freshly
    // regenerated SVGs in cardSvgSources if they resolve after the synchronous
    // regeneration above. By chaining onto cardSvgLoadPromise, we ensure fresh
    // CSV-based SVGs are present before prewarmVisibleCardTextures() runs.
    if (s.cardSvgLoadPromise) {
      s.cardSvgLoadPromise = s.cardSvgLoadPromise.then(() => {
        try {
          s.msSvgTextureManager?.regenerateSvgSourcesFromCsv();
        } catch (_) {
          // Non-fatal: scene continues with fetched SVGs if re-generation fails
        }
      });
    }

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
        } else {
          // Even with no saved campaign, startDayPhase() must be called so
          // the game transitions from DayStart -> MarketPhase and the market
          // is populated. Without this the tutorial offer modal shows but
          // the market is empty, making interactive tutorial steps impossible.
          try { s.startDayPhase(); } catch (_) { /* ignore */ }
        }
        // Check for a saved run checkpoint. If one exists, the resume overlay
        // takes priority over the tutorial offer modal.
        try {
          s.checkForSavedCheckpoint(tutorialOpts);
        } catch (e) {
          // If checkpoint check fails, fall through to tutorial offer
          try {
            const legacySeen = s.campaign ? (s.campaign as any).tutorialSeen : undefined;
            (s as any).tutorialOfferModal?.showIfEligible(tutorialOpts, legacySeen);
          } catch (_) { /* ignore */ }
        }
        return saved;
      }).catch(() => {
        // If load fails, continue with defaults and show offer modal
        try {
          const legacySeen = s.campaign ? (s.campaign as any).tutorialSeen : undefined;
          (s as any).tutorialOfferModal?.showIfEligible(tutorialOpts, legacySeen);
        } catch (e) { console.error('[MainStreet] tutorial offer fallback failed', e); }
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

  /**
   * Updates standalone player statistics after a completed run.
   *
   * Fires independently from updateCampaignProgress() — both update their
   * respective stores. Guarded by replayMode: stats are NOT updated during
   * replay runs so the player's record is not polluted by replay data.
   *
   * Uses the BrowserStatsStorageAdapter (localStorage) for persistence.
   *
   * @param gameResult  'win' or 'loss'.
   * @param finalScore  The final score of the completed run.
   */
  public async updateStats(
    gameResult: 'win' | 'loss',
    finalScore: number,
  ): Promise<void> {
    const s = this.scene;
    if (s.replayMode) return;

    try {
      const adapter = new BrowserStatsStorageAdapter();
      const current = loadStats(adapter);
      const updated = updateStatsAfterRun(current, gameResult === 'win', finalScore);
      await saveStats(adapter, updated);
    } catch {
      // Silently ignore stats persistence failures — non-critical
    }
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

  /**
   * Check for a saved run checkpoint on startup.
   *
   * If a checkpoint exists, shows a resume overlay with [Resume] and
   * [New Game] buttons (takes priority over the tutorial offer).
   * If no checkpoint exists, the tutorial offer modal is shown.
   *
   * @param tutorialOpts  Options for the tutorial offer modal (shown if no checkpoint).
   */
  /**
   * Checks whether the static SVGs match the current CSV and regenerates them
   * in-memory if needed.
   *
   * **New game scenario**: Fetches `csv-checksum.json` from the SVG output
   * directory (written by the build-time Node.js script). If the file doesn't
   * exist or its checksum differs from `CSV_CHECKSUM`, SVG sources are
   * regenerated from the parsed CSV data.
   *
   * **Load game scenario**: When a non-empty `savedChecksum` is provided,
   * compares it directly against `CSV_CHECKSUM`.
   *
   * This is an async fire-and-forget operation. It resolves after SVG
   * sources have been regenerated (if needed), so the caller should `await`
   * if they need SVGs to be fresh before proceeding.
   *
   * @param savedChecksum - Optional checksum from a loaded checkpoint.
   */
  public async checkForCsvMismatchAndRegenerate(savedChecksum?: string): Promise<void> {
    const s = this.scene;
    let mismatch = false;
    let source = 'none';

    if (savedChecksum && savedChecksum.length > 0) {
      // Load game scenario: compare against saved state's csvChecksum
      if (savedChecksum !== CSV_CHECKSUM) {
        mismatch = true;
        source = 'load';
      }
    } else {
      // New game scenario: fetch checksum file from SVG output directory
      try {
        const resp = await fetch('assets/games/main-street/svg/cards/csv-checksum.json');
        if (resp.ok) {
          const data = await resp.json();
          if (data.checksum !== CSV_CHECKSUM) {
            mismatch = true;
            source = 'new-game';
          }
        } else {
          // No checksum file — assume SVGs need regeneration
          mismatch = true;
          source = 'no-checksum-file';
        }
      } catch {
        // Fetch failed — assume SVGs are up-to-date (fallback to static SVGs)
        console.warn('[MainStreetLifecycleManager] Could not fetch csv-checksum.json');
      }
    }

    if (mismatch) {
      console.log(`[MainStreetLifecycleManager] CSV mismatch detected (${source}), regenerating SVGs in-memory`);
      // Only update SVG sources — no texture clearing. Texture invalidation
      // is handled atomically by prewarmVisibleCardTextures() per-key.
      s.msSvgTextureManager.regenerateSvgSourcesFromCsv();
    }
  }

  public checkForSavedCheckpoint(tutorialOpts: TutorialVisibilityOptions): void {
    const s = this.scene;
    if (!s.checkpointManager) return;

    s.checkpointManager.checkAndResume(
      // No checkpoint — show tutorial offer (if eligible)
      () => {
        try {
          const legacySeen = s.campaign ? (s.campaign as any).tutorialSeen : undefined;
          (s as any).tutorialOfferModal?.showIfEligible(tutorialOpts, legacySeen);
        } catch (_) { /* ignore */ }
        // New game: check if static SVGs match current CSV
        this.checkForCsvMismatchAndRegenerate().catch(() => {});
      },
      // Resume from checkpoint — replace state and rebuild UI
      (savedState: any) => {
        const savedChecksum = savedState?.csvChecksum || '';

        s.state = savedState;
        // Mark tutorial as seen (resumed game means player already played)
        if (s.campaign) {
          s.campaign.tutorialSeen = true;
        }
        // Rebuild renderer and start day phase from checkpoint state.
        // Pass skipMarketRefill=true to preserve the saved market state
        // (the saved state already has the correct market from save time;
        // calling refillMarket would replace it with fresh deck draws).
        try { s.refreshAll(); } catch (_) { /* ignore */ }
        try { s.startDayPhase(true); } catch (_) { /* ignore */ }

        // Load game: compare saved checksum against current CSV
        this.checkForCsvMismatchAndRegenerate(savedChecksum).catch(() => {});
      },
      // Resume overlay callback — use built-in default overlay
      (state: any, onResume: () => void, onNewGame: () => void) => {
        createDefaultResumeOverlay(s, state, onResume, onNewGame);
      },
    ).catch(() => {
      // On error (e.g., storage unavailable), show tutorial offer
      try {
        const legacySeen = s.campaign ? (s.campaign as any).tutorialSeen : undefined;
        (s as any).tutorialOfferModal?.showIfEligible(tutorialOpts, legacySeen);
      } catch (_) { /* ignore */ }
    });
  }
}
