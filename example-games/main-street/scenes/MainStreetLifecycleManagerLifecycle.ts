/**
 * Main Street: Scene Lifecycle
 *
 * Phaser preload/create wiring and resize handling.
 *
 * Import graph: depends only on `MainStreetLifecycleManagerContext` (type).
 *
 * @module
 */

import { SaveLoadStore, UndoRedoManager, createTfPlayer, markSceneInvalid, markSceneValid } from '@core-engine';
import type { Command } from '@core-engine';
import { TooltipManager, createSingleSelectionManager } from '@ui';
import type { HelpSection } from '@ui';
import { getEndTurnKeybind } from '@ui/SettingsStore';
import { DIFFICULTY_NAMES } from '../MainStreetDifficulty';
import { createMainStreetCheckpointManager, saveCampaignProgress } from '../MainStreetSaveLoad';
import { setupMainStreetGame } from '../MainStreetState';
import { MainStreetTranscriptRecorder, setMainStreetRecorder } from '../MainStreetTranscript';
import { createTutorialControllerState, startTutorial } from '../TutorialFlow';
import type { TutorialControllerState } from '../TutorialFlow';
import { createTutorialScenario } from '../TutorialScenario';
import { BrowserLocalStorageAdapter, loadTutorialState, saveTutorialState, updateTutorialStatus } from '../TutorialState';
import { MAIN_STREET_TF_SFX_MAPPING } from '../sfx-tf-mapping';
import { getMainStreetTfModule, loadMainStreetTfModule } from '../tf/mainStreetTfModule';
import { MainStreetAnimator } from './MainStreetAnimator';
import { BG_COLOR, SFX_KEYS } from './MainStreetConstants';
import { MainStreetInputManager } from './MainStreetInputManager';
import type { MainStreetLifecycleManagerContext } from './MainStreetLifecycleManagerContext';
import { MainStreetOverlayContent } from './MainStreetOverlayContent';
import { celebrateChallengeIds } from './MainStreetChallengeCelebration';
import { MainStreetRenderer } from './MainStreetRenderer';
import { MainStreetSvgTextureManager } from './MainStreetSvgTextureManager';
import { MainStreetTurnController } from './MainStreetTurnController';
import { MainStreetTutorialHints } from './MainStreetTutorialHints';
import { StatsOverlay } from './StatsOverlay';
import { TutorialOfferModal } from './TutorialOfferModal';

export function preload(lmCtx: MainStreetLifecycleManagerContext): void {

    const s = lmCtx.scene;
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

export function create(lmCtx: MainStreetLifecycleManagerContext): void {

    const s = lmCtx.scene;
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
    // Staff applicant render state (CG-0MSTOATDU006UGAX): destroy the
    // overlay rather than just dropping the reference, so a game restart
    // does not leak orphaned game objects.
    (s as any).applicantAnimating = false;
    (s as any).clearApplicantOverlay?.();
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
        // Capture the live camera (zoom/pan) into the state before serialising
        // (CG-0MTH9OWF2002YQQ3).
        s.syncStreetCameraToState?.();
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

    lmCtx.loadCampaignAndSetup();

    // Undo/Redo manager (per-scene)
    s.undoManager = new UndoRedoManager();

    // Wrap execute() so every command dispatch site — which calls
    // `s.undoManager.execute(cmd)` — fires the immediate challenge
    // celebration for any challenge the command completed
    // (CG-0MU8MZBV4007HF1Q). The command layer records completed IDs on
    // `state._newlyCompletedThisAction`; the wrapper celebrates and clears
    // them. Deduped against `s.celebratedChallengeIds`.
    {
      const undoManager = s.undoManager;
      const originalExecute = undoManager.execute.bind(undoManager);
      undoManager.execute = (cmd: Command) => {
        originalExecute(cmd);
        const completed: string[] = s.state?._newlyCompletedThisAction ?? [];
        if (completed.length > 0) {
          celebrateChallengeIds(s, completed);
          s.state._newlyCompletedThisAction = [];
        }
      };
    }

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
    // Street-map camera (CG-0MTH9OVMC001V44E): install the viewport mask and
    // register the always-available zoom/pan controls once the street
    // container exists.
    s.initStreetCamera();
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
          'Challenges are checked after every action, so completing one updates\n' +
          'your score and tracker immediately; the end of turn only catches\n' +
          'challenges satisfied by income or incidents.\n' +
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
          'Incident: hidden in a face-down deck; the top card is revealed and\n' +
          'resolves at the end of each turn. A peek staff member can look at the\n' +
          'top card once per turn (CG-0MSTOATDP000JNHH).\n' +
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
            'Plan placements to cluster synergies for higher returns. ' +
            'Selling a business stops its own income, but it stays on the street ' +
            'and keeps providing synergy to its neighbours (CG-0MT5XUE2200047IJ).';

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
        heading: 'Staff & Specialization Skills',
        body:
          'Staff cards in the market row are applicants. Each one carries 1-3\n' +
          'specialization skills (shown as colored chips on the card) that are\n' +
          'randomized once per game and locked. Color key: green = income,\n' +
          'blue = reputation, amber = cost reduction, red = incident mitigation.\n' +
          'Every applicant keeps the Town Gossip baseline (peek the incident\n' +
          'deck once per turn). No applicant may hold more than 1 income boost\n' +
          'AND 1 reputation boost, so stacks stay balanced. Hover a staff card\n' +
          'for its full skill list (I5, CG-0MT4WXX1Q00860VP).',
      },
      {
        heading: 'Turn Flow',
        body:
          'Week Start: market refreshes and income is calculated. Each turn\n' +
          'is one week of the Irish year (weeks 1–52), shown in the HUD as\n' +
          '"Week W · Year Y". Seasonal and holiday cards only appear during\n' +
          'their real-world windows (e.g. Harvest Festival in autumn).\n' +
          'Market Actions: buy businesses, upgrades, or events; place businesses\n' +
          'on the street grid to earn future income.\n' +
          'You get 1 action per week (2 with a General Manager). Taking a card\n' +
          'to hand costs 1 action, as does playing or placing it from hand —\n' +
          'but a same-week move + play/place pair costs 1 action total.\n' +
          'Card costs are paid when a card is placed or played, not when taken\n' +
          'to hand.\n' +
          'End Turn: resolves income, incidents, and advances to the next week.',
      },
      {
        heading: 'Win / Loss Conditions',
        body:
          `Reach ${cfg.winThreshold} points to win (coins + reputation + challenges).\n` +
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
    // Provide the ordered difficulty names so the Settings panel can render a selector.
    s.initSettingsPanel(DIFFICULTY_NAMES, 'Medium');
    // Drag-and-drop buy-to-slot (business cards → street slots): wire the
    // reusable core-engine drag-drop module after the settings panel exists
    // (reads reducedMotion) and before the first startTurnPhase refresh.
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
        s.startTurnPhase();
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
    // Both stacks are empty at boot, so start the buttons in their disabled
    // visual state instead of the enabled-by-default look (CG-0MT5Y4DL8000AKKZ).
    s.refreshUndoRedoButtons(s.undoManager.canUndo(), s.undoManager.canRedo());
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
              // the market and incident deck, independent of deck
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
              // Start the day phase so the market populates — suppress the
              // day-banner because the tutorial overlays carry the guidance
              // (the banner was already deferred at boot). Clear the deferred
              // flag since we are not going to play the deferred banner.
              s.deferredWeekBanner = false;
              s.startTurnPhase(false, true);
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
            // Normal gameplay begins; play the deferred day-banner now
            // that the player has committed to the game.
            s.playDeferredWeekBanner();
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

    // Global keyboard handler: Escape cancels an in-progress hand-card
    // targeting phase (placing-from-hand / placing-business), returning to the
    // market phase (CG-0MT3IYSRL001VVUP). Same overlay guards as End Turn so an
    // open dialog keeps priority.
    const escapeKeyHandler = (ev: KeyboardEvent) => {
      try {
        if (s.replayMode) return;
        if (ev.key !== 'Escape') return;
        const overlayOpen = Array.isArray(s.overlayObjects) && s.overlayObjects.length > 0;
        if (overlayOpen) return;
        if ((s as any).helpPanel?.isOpen) return;
        if ((s as any).settingsPanel?.isOpen) return;
        if ((s as any).statsOverlay?.isOpen) return;
        s.msTurnController?.cancelPendingPlacement?.();
      } catch (_) {
        // ignore runtime errors in key handler
      }
    };

    if (s.input && s.input.keyboard) {
      s.input.keyboard.on('keydown', escapeKeyHandler);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('keydown', escapeKeyHandler as EventListener);
    }

    s.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      markSceneInvalid(s);
      s.cleanupTransferAnimations();
      // Tear down the drag-drop manager (removes its scene input listeners).
      try { s.dragDropManager?.destroy(); s.dragDropManager = undefined; } catch (_) { /* ignore */ }
      try {
        if (s.input && s.input.keyboard) {
          s.input.keyboard.off('keydown', endTurnKeyHandler);
          s.input.keyboard.off('keydown', escapeKeyHandler);
        } else if (typeof window !== 'undefined') {
          window.removeEventListener('keydown', endTurnKeyHandler as EventListener);
          window.removeEventListener('keydown', escapeKeyHandler as EventListener);
        }
      } catch (_) { /* ignore */ }
    });

    // Start first turn — suppress the day-banner at boot so it does not
    // fire while the tutorial offer modal is visible or before any player
    // choice is made (deferred banner will play on skip/start/tutorial).
    s.deferredWeekBanner = true;
    s.startTurnPhase(false, true);
  
}

export function handleResize(lmCtx: MainStreetLifecycleManagerContext): void {

    const s = lmCtx.scene;
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
