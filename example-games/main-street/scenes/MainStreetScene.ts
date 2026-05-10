/**
 * MainStreetScene -- the main Phaser scene for Main Street.
 *
 * Implements a minimal walking-skeleton UI:
 *   - 10-slot street grid (placeholder rectangles colored by synergy)
 *   - Market display (business, event, upgrade rows)
 *   - Resource bank HUD (coins, reputation, score)
 *   - Turn / phase indicator
 *   - Click-to-buy flow (select card -> select empty slot for businesses)
 *   - End Turn button to advance through remaining phases
 *   - Hint button (1 use per turn) that highlights the Greedy AI's recommended move
 *   - Game-over overlay with score and replay/menu buttons
 *   - Help panel and settings integration
 */

import type { MainStreetState } from '../MainStreetState';
import { setupMainStreetGame, addLog, deserializeMainStreetState } from '../MainStreetState';
import type { DifficultyName } from '../MainStreetDifficulty';
import { DIFFICULTY_NAMES } from '../MainStreetDifficulty';
import type { BusinessCard, EventCard, UpgradeCard } from '../MainStreetCards';
import {
  CARD_TEMPLATE_NAMES,
  INCIDENT_QUEUE_SIZE,
} from '../MainStreetCards';
import {
  executeDayStart,
  processEndOfTurn,
  type TurnResult,
} from '../MainStreetEngine';
import {
  getEmptySlots,
  getUpgradeBranchesForBusiness,
  findTargetBusinessSlot,
  canPurchaseBusiness,
  canPurchaseUpgrade,
  canPurchaseEvent,
} from '../MainStreetMarket';
import {
  CardGameScene,
  FONT_FAMILY,
  createOverlayBackground, createOverlayButton, createOverlayMenuButton,
  dismissOverlay,
  createSingleSelectionManager,
  TooltipManager,
} from '../../../src/ui';
import type { SelectionController, SingleSelectionManager } from '../../../src/ui';
import { createTfPlayer } from '../../../src/core-engine';
import { MAIN_STREET_TF_SFX_MAPPING } from '../sfx-tf-mapping';
import { getMainStreetTfModule, loadMainStreetTfModule } from '../tf/mainStreetTfModule';
import type { HelpSection } from '../../../src/ui';
import { SaveLoadStore } from '../../../src/core-engine';
import type { MainStreetCampaignProgress } from '../MainStreetState';
import {
  createDefaultCampaignProgress,
  loadCampaignProgress,
  updateCampaignAfterRun,
} from '../MainStreetSaveLoad';
import {
  TIER_DEFINITIONS,
  ORDERED_TIER_DEFINITIONS,
  highestUnlockedTier,
} from '../MainStreetTiers';
import {
  generateHint,
  type HintResult,
} from '../MainStreetHint';
import { UndoRedoManager } from '../../../src/core-engine';
import { BuyBusinessCommand, BuyUpgradeCommand, BuyEventCommand, PlayEventCommand } from '../MainStreetCommands';
import { MainStreetTranscriptRecorder, setMainStreetRecorder, recordMainStreetEvent } from '../MainStreetTranscript';
import { rasteriseSvgToTexture, makeTextureKey, markSceneValid, markSceneInvalid } from '../../../src/core-engine';
import { SvgDomRenderer } from './SvgDomRenderer';
import { MainStreetRenderer } from './MainStreetRenderer';
import { MainStreetAnimator } from './MainStreetAnimator';
import {
  BG_COLOR,
  LOG_SCROLL_SPEED,
  LOG_TITLE_H,
  type SceneLayout,
  SFX_KEYS,
  STREET_ROWS,
} from './MainStreetConstants';

// ── UI Phase (scene-level interaction state) ────────────────

type UIPhase =
  | 'idle'               // Waiting for DayStart
  | 'market'             // Player can buy or end turn
  | 'placing-business'   // Player selected a business card, picking a slot
  | 'animating'          // Brief pause for feedback
  | 'game-over';         // Final overlay

// ── Scene ───────────────────────────────────────────────────

export class MainStreetScene extends CardGameScene {
  public tooltipManager?: TooltipManager;
  public msRenderer!: MainStreetRenderer;
  public msAnimator!: MainStreetAnimator;
  // Game state
  public state!: MainStreetState;
  public uiPhase: UIPhase = 'idle';

  // Campaign / meta-progression
  public campaign: MainStreetCampaignProgress | null = null;
  public saveStore: SaveLoadStore | null = null;

  // Selected difficulty (persisted across replays)
  public selectedDifficulty: DifficultyName = 'Medium';

  // Pending selection for placing a business
  public pendingBusinessCard: BusinessCard | null = null;
  public pendingBusinessSourceIndex: number | null = null;

  // Computed responsive layout metrics
  public layout!: SceneLayout;

  // Display containers
  public hudContainer!: Phaser.GameObjects.Container;
  public streetContainer!: Phaser.GameObjects.Container;
  public marketContainer!: Phaser.GameObjects.Container;
  public incidentQueueContainer!: Phaser.GameObjects.Container;
  public handContainer!: Phaser.GameObjects.Container;
  public actionContainer!: Phaser.GameObjects.Container;

  // Activity Log panel
  public logContainer!: Phaser.GameObjects.Container;
  public logContentContainer!: Phaser.GameObjects.Container;
  public logMaskGraphics: Phaser.GameObjects.Graphics | null = null;
  public logContentMask: Phaser.Display.Masks.GeometryMask | null = null;
  public logScrollOffset = 0;
  public logMaxScroll = 0;
  public logTotalContentH = 0;
  public logAutoScroll = true;
  public logPrevEntryCount = 0;

  // Challenge Tracker panel
  public challengeContainer!: Phaser.GameObjects.Container;

  // Instruction text
  public instructionText!: Phaser.GameObjects.Text;

  // Overlay objects
  public overlayObjects: Phaser.GameObjects.GameObject[] = [];

  // HUD animation state
  public previousCoins: number | null = null;
  public previousReputation: number | null = null;
  public transferAnimationCount = 0;
  public activeTransferTweens = new Set<Phaser.Tweens.Tween>();
  public activeTransferVisuals = new Set<Phaser.GameObjects.GameObject>();
  public hiddenTransferSourceCardIds = new Set<string>();

  // Hint system
  /** True after the player has used their one hint for this turn. */
  public hintUsedThisTurn = false;
  /** Card ID of the card highlighted by the current hint (null = none). */
  public hintedCardId: string | null = null;
  /** Grid slot index highlighted by the current hint (null = none). */
  public hintedSlotIndex: number | null = null;

  // Persistent market-card selection UX
  public marketSelectionManager!: SingleSelectionManager;
  public marketSelectionByCardId = new Map<string, SelectionController>();
  public selectedMarketCardId: string | null = null;

  // SVG debug overlay (opt-in via ?msSvgDebug=1)
  public svgDebugEnabled = false;
  public svgDebugText?: Phaser.GameObjects.Text;

  // Undo/Redo manager for market actions (per-scene)
  public undoManager!: UndoRedoManager;

  constructor() {
    super({ key: 'MainStreetScene' });
  }

  /** Stores raw SVG text for each card template (fetched in preload, used for lazy rasterisation). */
  public cardSvgSources: Map<string, string> = new Map();
  /** Resolves when all SVG source fetches started in preload have settled. */
  public cardSvgLoadPromise: Promise<void> = Promise.resolve();

  // DOM-based SVG renderer (optional) - renders crisp SVGs using browser image rendering
  public svgDom?: SvgDomRenderer;

  // Preload placeholder SVG used for visual scale testing in the market
  preload(): void {
    // Canonical card size for Main Street market placeholder (140x80)
    try {
      // Load placeholder as an image to avoid Phaser's SVGFile XML parsing in some environments.
      // Phaser's svg loader parses and manipulates the SVG XML during onProcess which
      // can cause DOMParser issues in headless/browser test harnesses. We therefore
      // load the SVG via the image loader which treats it as an image resource.
      this.load.image('ms_placeholder_card', 'assets/games/main-street/svg/placeholder-card.svg');

      // Preload Main Street audio assets (small, CC0-generated SFX and a short loop)
      try {
        const audioDir = 'assets/games/main-street/audio';
        this.load.audio(SFX_KEYS.DEAL, `${audioDir}/deal.wav`);
        this.load.audio(SFX_KEYS.MOVE_LOOP, `${audioDir}/deal.wav`);
        this.load.audio(SFX_KEYS.PLACE, `${audioDir}/place.wav`);
        this.load.audio(SFX_KEYS.DISCARD, `${audioDir}/discard.wav`);
        this.load.audio(SFX_KEYS.COIN_POP, `${audioDir}/coin-pop.wav`);
        this.load.audio(SFX_KEYS.CLICK, `${audioDir}/click.wav`);
        this.load.audio(SFX_KEYS.BG_LOOP, `${audioDir}/loop.wav`);
        this.load.audio(SFX_KEYS.BUSINESS_START, `${audioDir}/deal.wav`);
        this.load.audio(SFX_KEYS.BUSINESS_END, `${audioDir}/place.wav`);
        this.load.audio(SFX_KEYS.UPGRADE_START, `${audioDir}/click.wav`);
        this.load.audio(SFX_KEYS.UPGRADE_END, `${audioDir}/place.wav`);
        this.load.audio(SFX_KEYS.EVENT_CHEER, `${audioDir}/coin-pop.wav`);
      } catch (e) {
        // Some test environments may lack an audio loader; ignore preload failures
      }

      // Fetch all per-card SVG assets as text for dynamic rasterisation at display size.
      // We do not pre-load them as textures - we lazily rasterise them at exact pixel
      // dimensions needed for crisp rendering on the current screen/DPR.
      const fetches: Promise<void>[] = [];
      for (const templateId of CARD_TEMPLATE_NAMES.keys()) {
        const path = `assets/games/main-street/svg/cards/${templateId}.svg`;
        const p = fetch(path)
          .then((resp) => (resp.ok ? resp.text() : null))
          .then((text) => {
            if (text) {
              this.cardSvgSources.set(templateId, text);
            }
          })
          .catch(() => { /* ignore fetch failures in test environments */ });
        fetches.push(p);
      }
      this.cardSvgLoadPromise = Promise.all(fetches).then(() => {});
    } catch (e) {
      // If svg loader is unavailable in the current environment, ignore
      // eslint-disable-next-line no-console
      console.debug('[MS] preload: svg load failed', e);
    }
  }

  // ── Create ──────────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor(BG_COLOR);

    // Ensure placeholder texture exists. Some test environments have trouble
    // loading SVGs as images. Generate a simple placeholder texture at runtime
    // if it's not already present in the Texture Manager.
    try {
      if (!this.textures.exists('ms_placeholder_card')) {
        const g = this.add.graphics();
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
    this.msAnimator = new MainStreetAnimator(this);

    // Reset
    this.uiPhase = 'idle';
    this.pendingBusinessCard = null;
    this.overlayObjects = [];
    this.previousCoins = null;
    this.previousReputation = null;
    this.pendingBusinessSourceIndex = null;
    this.transferAnimationCount = 0;
    this.cleanupTransferAnimations();
    this.hiddenTransferSourceCardIds.clear();

    // Reset hint state
    this.hintUsedThisTurn = false;
    this.hintedCardId = null;
    this.hintedSlotIndex = null;

    this.marketSelectionByCardId.clear();
    this.selectedMarketCardId = null;
    this.marketSelectionManager?.destroy();
    this.marketSelectionManager = createSingleSelectionManager(this);

    // Reset activity-log panel state in case this scene instance is restarted.
    this.logScrollOffset = 0;
    this.logMaxScroll = 0;
    this.logTotalContentH = 0;
    this.logAutoScroll = true;
    this.logPrevEntryCount = 0;

    this.detectReplayMode();
    this.initEventSystem();

    // Sound (re-use existing audio assets)
    // Register Main Street SFX and map common events to logical sound keys.
    // The mapping uses common engine events; scenes can emit these events
    // via `this.gameEvents.emit(...)` to trigger audio feedback.
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

    this.initSoundSystem(Object.values(SFX_KEYS), mapping, {
      synthPlayer: tfPlayer,
      synthKeyMap: MAIN_STREET_TF_SFX_MAPPING,
    });

    // Late async tf module load (runtime-generated module path) without restart.
    void loadMainStreetTfModule().then((loadedModule) => {
      if (!loadedModule || !this.soundManager) return;
      this.soundManager.setSynthIntegration(
        createTfPlayer(loadedModule),
        MAIN_STREET_TF_SFX_MAPPING,
      );
    });

    // Game setup -- load campaign for tier-filtered deck building
    this.saveStore = new SaveLoadStore();
    this.loadCampaignAndSetup();

    // Undo/Redo manager (per-scene)
    this.undoManager = new UndoRedoManager();

    // Transcript recorder (optional) — attach global recorder so other modules
    // (AI, Monte Carlo runner) can emit events without direct wiring.
    try {
      const initialSnapshot = { seed: this.state.seed ?? null, snapshotAtTurn: this.state.turn };
      const recorder = new MainStreetTranscriptRecorder(initialSnapshot);
      setMainStreetRecorder(recorder);
    } catch (_) {
      // ignore if recorder cannot be created
    }

    // UI scaffolding
    this.msRenderer = new MainStreetRenderer(this);
    this.msAnimator = new MainStreetAnimator(this);
    this.layout = this.computeLayout();
    this.svgDebugEnabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('msSvgDebug') === '1';
    // Prewarm SVG textures once all SVG sources are loaded.
    // Until then the scene uses fallback cards; then we refresh with SVG textures.
    void this.cardSvgLoadPromise
      .then(() => this.prewarmVisibleCardTextures())
      .then(() => {
        try {
          if (this && this.hudContainer && (this as any).game?.renderer) {
            this.refreshAll();
          }
        } catch {
          // Ignore errors - scene may have been destroyed
        }
      });
    this.createHeader();
    this.createContainers();
    this.createInstructions();
    this.initSvgDebugOverlay();

    // DOM renderer for SVGs
    try {
      this.svgDom = new SvgDomRenderer(this);
    } catch {
      this.svgDom = undefined;
    }

    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);

    // Help panel
    const helpSections: HelpSection[] = [
      {
        heading: 'How to Play',
        body:
          'Buy businesses from the market and place them on the street grid.\n' +
          'Adjacent businesses with matching synergy types earn bonus income.\n' +
          'Buy upgrades to improve existing businesses.\n' +
          'Buy Investment events and play them for one-time effects.\n' +
          'Complete challenges for bonus points.\n' +
          'Earn coins and reputation each turn to reach the score threshold.',
      },
      {
        heading: 'Challenges',
        body:
          `Each run selects ${this.state.config.challengesPerRun} random challenges for you to complete.\n` +
          'Challenges have goals like earning coins, placing businesses,\n' +
          'or building synergy combos. Progress is checked at the end of\n' +
          'each turn -- once completed, a challenge stays completed.\n' +
          `Each completed challenge adds ${this.state.config.challengeBonusPoints} bonus points to your score.\n` +
          `Complete all ${this.state.config.challengesPerRun} challenges to win immediately!\n` +
          'Track your progress in the challenge panel at the bottom.',
      },
      {
        heading: 'Events',
        body:
          'Investment events (brown) can be purchased from the Investments row\n' +
          'and held in your hand (max 1 at a time). Click the held card in\n' +
          'your hand (bottom-left) to play it for a one-time effect.\n' +
          'Held events persist across turns until you choose to play them.\n' +
          'Incident events (blue) appear in the Upcoming Incidents queue and\n' +
          'trigger automatically at the end of each turn -- plan around them!\n' +
          'Check the Activity Log to see what events fired and their effects.',
      },
      {
        heading: 'Synergy Types',
        body:
          'Food (orange) -- restaurants, cafes\n' +
          'Culture (blue) -- galleries, theaters\n' +
          'Commerce (green) -- shops, services\n' +
          'Service (purple) -- salons, clinics\n' +
          'Entertainment (red) -- cinemas, arcades',
      },
      {
        heading: 'Win / Loss',
        body:
          `Reach ${this.state.config.winThreshold} points to win (coins + reputation*${this.state.config.reputationScoreMultiplier} + challenges*${this.state.config.challengeBonusPoints}).\n` +
          `Complete all ${this.state.config.challengesPerRun} challenges for an instant win.\n` +
          `Survive ${this.state.config.maxTurns} turns with positive reputation for a turn-limit victory.\n` +
          'Bankruptcy (coins < 0) or reputation collapse (rep <= 0 after turn 1) loses.',
      },
    ];
    this.initHelpPanel(helpSections);
    // Provide the ordered difficulty names so the Settings panel can render a selector
    this.initSettingsPanel(DIFFICULTY_NAMES);
    if (!this.replayMode) {
      this.tooltipManager = new TooltipManager(this, this.settingsPanel);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      markSceneInvalid(this);
      this.cleanupTransferAnimations();
    });

    // Start first turn
    this.startDayPhase();
  }

  // ── Header ──────────────────────────────────────────────
  public createHeader(...args: any[]): any {
    return (this.msRenderer as any).createHeader.apply(this.msRenderer, args);
  }

  /**
   * Prewarms SVG textures for cards that will be visible on initial render.
   * This rasterises them at the exact pixel sizes needed for the current layout,
   * ensuring crisp rendering on HiDPI displays.
   */
  public async prewarmVisibleCardTextures(): Promise<void> {
    // Mark scene as valid before starting rasterisation
    markSceneValid(this);
    
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const { slotW, slotH, marketCardW, marketCardH, queueCardW, queueCardH, handCardW, handCardH } = this.layout;
    const renderSlotW = Math.max(1, Math.round(slotW - 4));
    const renderSlotH = Math.max(1, Math.round(slotH - 4));
    const renderMarketW = Math.max(1, Math.round(marketCardW - 4));
    const renderMarketH = Math.max(1, Math.round(marketCardH - 4));
    const renderQueueW = Math.max(1, Math.round(queueCardW - 4));
    const renderQueueH = Math.max(1, Math.round(queueCardH - 4));
    const renderHandW = Math.max(1, Math.round(handCardW - 4));
    const renderHandH = Math.max(1, Math.round(handCardH - 4));

    // Collect unique template IDs visible in market, queue, street, and hand
    const visibleTemplates = new Set<string>();

    // Market business cards
    for (const card of this.state.market.business) {
      if (card) visibleTemplates.add(this.templateIdFromCardId(card.id));
    }
    // Market investment cards (upgrades + events)
    for (const card of this.state.market.investments) {
      if (card) visibleTemplates.add(this.templateIdFromCardId(card.id));
    }
    // Incident queue
    for (const card of this.state.incidentQueue) {
      if (card) visibleTemplates.add(this.templateIdFromCardId(card.id));
    }
    // Street grid businesses
    for (const biz of this.state.streetGrid) {
      if (biz) visibleTemplates.add(this.templateIdFromCardId(biz.id));
    }
    // Held event card
    if (this.state.heldEvent) {
      visibleTemplates.add(this.templateIdFromCardId(this.state.heldEvent.id));
    }

    // Rasterise each visible template at the required sizes
    const rasterizePromises: Promise<void>[] = [];

    for (const templateId of visibleTemplates) {
      const svgText = this.cardSvgSources.get(templateId);
      if (!svgText) continue;

      // Market size
      const marketKey = makeTextureKey(templateId, renderMarketW, renderMarketH, dpr);
      rasterizePromises.push(
        rasteriseSvgToTexture(this, marketKey, svgText, renderMarketW, renderMarketH, dpr),
      );

      // Street slot size
      const slotKey = makeTextureKey(templateId, renderSlotW, renderSlotH, dpr);
      rasterizePromises.push(
        rasteriseSvgToTexture(this, slotKey, svgText, renderSlotW, renderSlotH, dpr),
      );

      // Queue size
      const queueKey = makeTextureKey(templateId, renderQueueW, renderQueueH, dpr);
      rasterizePromises.push(
        rasteriseSvgToTexture(this, queueKey, svgText, renderQueueW, renderQueueH, dpr),
      );

      // Hand size
      const handKey = makeTextureKey(templateId, renderHandW, renderHandH, dpr);
      rasterizePromises.push(
        rasteriseSvgToTexture(this, handKey, svgText, renderHandW, renderHandH, dpr),
      );
    }

    // Wait for all prewarming to complete
    await Promise.all(rasterizePromises);
  }

  /** Extracts the base template ID from a card ID (strips copy suffixes like -0, -1). */
  public templateIdFromCardId(cardId: string): string {
    return cardId.replace(/-\d+$/, '');
  }

  /**
   * Lazily request a card texture for the given render size.
   * If generation succeeds, trigger a refresh so the SVG texture is used.
   */
  public requestCardTexture(cardId: string, renderW: number, renderH: number): void {
    const templateId = this.templateIdFromCardId(cardId);
    const svgText = this.cardSvgSources.get(templateId);
    if (!svgText) return;

    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const key = makeTextureKey(templateId, renderW, renderH, dpr);
    if (this.textures.exists(key)) return;

    void rasteriseSvgToTexture(this, key, svgText, renderW, renderH, dpr).then(() => {
      try {
        this.refreshAll();
      } catch {
        // scene may be shutting down
      }
    });
  }
  public computeLayout(...args: any[]): any {
    return (this.msRenderer as any).computeLayout.apply(this.msRenderer, args);
  }
  public createContainers(...args: any[]): any {
    return (this.msRenderer as any).createContainers.apply(this.msRenderer, args);
  }
  public createInstructions(...args: any[]): any {
    return (this.msRenderer as any).createInstructions.apply(this.msRenderer, args);
  }

  public initSvgDebugOverlay(): void {
    if (!this.svgDebugEnabled) return;
    this.svgDebugText = this.add.text(10, 42, '', {
      fontSize: '12px',
      color: '#9be0ff',
      fontFamily: FONT_FAMILY,
      backgroundColor: '#00000088',
      padding: { x: 6, y: 4 },
    }).setDepth(10_000).setScrollFactor(0);
  }

  public updateSvgDebugOverlay(): void {
    if (!this.svgDebugEnabled || !this.svgDebugText) return;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const keys = Object.keys((this.textures as unknown as { list?: Record<string, unknown> }).list ?? {});
    const cardTextureKeys = keys.filter((k) => k.startsWith('ms_card_'));

    let sampleLine = 'sample: none';
    const containers = this.marketContainer?.list ?? [];
    for (const obj of containers) {
      const c = obj as Phaser.GameObjects.Container;
      if (!c.list) continue;
      for (const child of c.list) {
        const img = child as Phaser.GameObjects.Image;
        const key = img?.texture?.key;
        if (key && key.startsWith('ms_card_')) {
          const tex = this.textures.get(key);
          const src = tex?.source?.[0] as { width?: number; height?: number } | undefined;
          sampleLine = `sample: ${key} disp:${Math.round(img.displayWidth)}x${Math.round(img.displayHeight)} src:${src?.width ?? '?'}x${src?.height ?? '?'}`;
          break;
        }
      }
      if (sampleLine !== 'sample: none') break;
    }

    const canvasW = (this.game?.canvas?.width ?? 0);
    const canvasH = (this.game?.canvas?.height ?? 0);
    this.svgDebugText.setText([
      '[SVG Debug]',
      `dpr:${dpr} canvas:${canvasW}x${canvasH} scale:${Math.round(this.scale.width)}x${Math.round(this.scale.height)}`,
      `svg sources:${this.cardSvgSources.size} generated textures:${cardTextureKeys.length}`,
      sampleLine,
    ]);
  }

  public handleResize(): void {
    this.layout = this.computeLayout();
    // Regenerate textures at new sizes on resize
    this.prewarmVisibleCardTextures();
    this.challengeContainer.setPosition(this.layout.challengeX, this.layout.challengeY);
    this.logContainer.setPosition(this.layout.logX, this.layout.logY);
    this.instructionText.setPosition(this.layout.gameW - 24, this.layout.instructionY);
    this.refreshAll();
  }

  // ── Campaign / Meta-Progression ─────────────────────────

  /**
   * Loads campaign progress (or creates defaults) and sets up the game
   * with tier-filtered decks. Campaign loading is async but the scene
   * continues with default progress if the load is still pending.
   */
  public loadCampaignAndSetup(): void {
    // Synchronously set up with defaults first (so UI can render immediately)
    this.campaign = createDefaultCampaignProgress();
    // If a persisted difficulty exists in the SettingsPanel, prefer that for new games.
    try {
      const persisted = (this.settingsPanel?.selectedDifficulty) as unknown as string | undefined;
      if (persisted && DIFFICULTY_NAMES.includes(persisted as any)) {
        this.selectedDifficulty = persisted as any;
      }
    } catch {
      // ignore
    }

    this.state = setupMainStreetGame({
      difficulty: this.selectedDifficulty,
      unlockedCardIds: this.campaign.unlockedCardIds,
    });

    // Async: attempt to load saved campaign and re-setup if found
    if (this.saveStore) {
      loadCampaignProgress(this.saveStore).then((saved) => {
        if (saved) {
          this.campaign = saved;
          // Re-setup with the loaded campaign's unlocked cards
          this.state = setupMainStreetGame({
            difficulty: this.selectedDifficulty,
            unlockedCardIds: this.campaign.unlockedCardIds,
          });
          // Must call startDayPhase() (not just refreshAll) so the new
          // state transitions from DayStart -> MarketPhase and the UI
          // phase is synchronised.  Without this, the engine stays in
          // DayStart while the UI shows market controls, blocking all
          // player actions and causing End Turn to hang.
          this.startDayPhase();
        }
      }).catch(() => {
        // If load fails, continue with defaults (already set up above)
      });
    }
  }

  /**
   * Updates campaign progress after a completed run (win or loss).
   * Evaluates tier unlocks and persists the updated campaign.
   * Returns a Promise that resolves when the update is done (or
   * immediately if no campaign / store is available).
   */
  public updateCampaignProgress(): Promise<void> {
    if (!this.campaign || !this.saveStore) return Promise.resolve();
    return updateCampaignAfterRun(this.campaign, this.state, this.saveStore)
      .then(() => {})  // discard the returned campaign (already mutated in place)
      .catch(() => {
        // Silently ignore save failures -- campaign will be retried next run
      });
  }

  // ── Day flow ────────────────────────────────────────────

  public startDayPhase(): void {
    // Execute DayStart (refills market, transitions to MarketPhase)
    executeDayStart(this.state);
    this.uiPhase = 'market';

    // Reset hint state for the new turn
    this.hintUsedThisTurn = false;
    this.hintedCardId = null;
    this.hintedSlotIndex = null;

    this.refreshAll();

    // Prewarm currently-visible cards after market/queue are populated.
    void this.cardSvgLoadPromise
      .then(() => this.prewarmVisibleCardTextures())
      .then(() => {
        try {
          this.refreshAll();
        } catch {
          // scene may be shutting down
        }
      });

    this.instructionText.setText(
      `Turn ${this.state.turn} / ${this.state.config.maxTurns} -- Buy cards from the market or End Turn`,
    );
  }

  public endTurn(): void {
    this.uiPhase = 'animating';
    this.instructionText.setText('Processing end of turn...');
    this.refreshActionButtons();

    // Process end-of-turn phases (events, income, night, end check)
    let result: TurnResult;
    try {
      result = processEndOfTurn(this.state);
    } catch (e) {
      // Defensive: if processEndOfTurn throws (e.g. phase mismatch from
      // async state replacement), recover gracefully instead of hanging
      // with a permanent "Processing end of turn..." message.
      console.error('[MainStreet] endTurn failed:', e);
      this.uiPhase = 'market';
      this.instructionText.setText(`Error: ${(e as Error).message}`);
      this.refreshAll();
      return;
    }

    // Clear undo stack on end-of-turn (per acceptance criteria)
    try { this.undoManager.clear(); } catch (e) { /* ignore */ }

    // Brief delay then show result / advance
    this.time.delayedCall(400, () => {
      if (result.gameResult !== 'playing') {
        // Snapshot tiers before the campaign update mutates them
        const tiersBefore = this.campaign
          ? [...this.campaign.unlockedTiers]
          : [];

        // Update campaign progress (tier evaluation + persistence),
        // then compute newly unlocked tiers and show the overlay.
        this.updateCampaignProgress().then(() => {
          const tiersAfter = this.campaign
            ? this.campaign.unlockedTiers
            : [];
          const newlyUnlockedTiers = tiersAfter.filter(
            (t) => !tiersBefore.includes(t),
          );
          this.showGameOverOverlay(result, newlyUnlockedTiers);
        });
      } else {
        // Show income feedback briefly then start next turn
        if (result.income && result.income.total > 0) {
          this.instructionText.setText(
            `Income: +${result.income.total} coins` +
            (result.incident ? ` | Incident: ${result.incident.name}` : ''),
          );
        } else if (result.incident) {
          this.instructionText.setText(`Incident: ${result.incident.name}`);
        }
        this.refreshAll();
        this.time.delayedCall(800, () => this.startDayPhase());
      }
    });
  }

  // ── Refresh display ─────────────────────────────────────
  public refreshAll(...args: any[]): any {
    return (this.msRenderer as any).refreshAll.apply(this.msRenderer, args);
  }

  // ── HUD ─────────────────────────────────────────────────
  public refreshHud(...args: any[]): any {
    return (this.msRenderer as any).refreshHud.apply(this.msRenderer, args);
  }

  public animateHudValueChanges(...args: any[]): any {
    return (this.msAnimator as any).animateHudValueChanges.apply(this.msAnimator, args);
  }

  public getMarketCardCenter(...args: any[]): any {
    return (this.msAnimator as any).getMarketCardCenter.apply(this.msAnimator, args);
  }

  public getStreetSlotCenter(...args: any[]): any {
    return (this.msAnimator as any).getStreetSlotCenter.apply(this.msAnimator, args);
  }

  public getHandCardCenter(...args: any[]): any {
    return (this.msAnimator as any).getHandCardCenter.apply(this.msAnimator, args);
  }

  public createTransferCardVisual(...args: any[]): any {
    return (this.msAnimator as any).createTransferCardVisual.apply(this.msAnimator, args);
  }

  public cleanupTransferAnimations(...args: any[]): any {
    return (this.msAnimator as any).cleanupTransferAnimations.apply(this.msAnimator, args);
  }

  public animateTransferFromMarket(...args: any[]): any {
    return (this.msAnimator as any).animateTransferFromMarket.apply(this.msAnimator, args);
  }

  // ── Challenge Tracker ───────────────────────────────────
  public refreshChallengeTracker(...args: any[]): any {
    return (this.msRenderer as any).refreshChallengeTracker.apply(this.msRenderer, args);
  }

  // ── Street Grid ─────────────────────────────────────────
  public refreshStreetGrid(...args: any[]): any {
    return (this.msRenderer as any).refreshStreetGrid.apply(this.msRenderer, args);
  }
  public drawBusinessSlot(...args: any[]): any {
    return (this.msRenderer as any).drawBusinessSlot.apply(this.msRenderer, args);
  }
  public drawEmptySlot(...args: any[]): any {
    return (this.msRenderer as any).drawEmptySlot.apply(this.msRenderer, args);
  }

  // ── Market ──────────────────────────────────────────────
  public refreshMarket(...args: any[]): any {
    return (this.msRenderer as any).refreshMarket.apply(this.msRenderer, args);
  }
  public drawMarketRow(...args: any[]): any {
    return (this.msRenderer as any).drawMarketRow.apply(this.msRenderer, args);
  }

  public templateKeyForCard(cardId: string, width?: number, height?: number): string {
    // strip copy suffixes like `-0`, `-1`, or serials appended by deck builders
    const base = cardId.replace(/-\d+$/,'');
    
    // If dimensions provided, include them in the key for size-specific textures
    if (width !== undefined && height !== undefined) {
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      return makeTextureKey(base, width, height, dpr);
    }
    return `ms_card_${base}`;
  }

  public domKeyForCard(context: string, slot: number | string, cardId: string): string {
    return `ms_dom_${context}_${slot}_${cardId}`;
  }
  public drawMarketCard(...args: any[]): any {
    return (this.msRenderer as any).drawMarketCard.apply(this.msRenderer, args);
  }

  // ── Incident Queue ───────────────────────────────────────
  public refreshIncidentQueue(...args: any[]): any {
    return (this.msRenderer as any).refreshIncidentQueue.apply(this.msRenderer, args);
  }
  public drawIncidentCard(...args: any[]): any {
    return (this.msRenderer as any).drawIncidentCard.apply(this.msRenderer, args);
  }

  // ── Player Hand ────────────────────────────────────────────
  public refreshPlayerHand(...args: any[]): any {
    return (this.msRenderer as any).refreshPlayerHand.apply(this.msRenderer, args);
  }
  public drawHeldEventCard(...args: any[]): any {
    return (this.msRenderer as any).drawHeldEventCard.apply(this.msRenderer, args);
  }

  public onPlayHeldEvent(): void {
    if (this.uiPhase !== 'market') return;
    if (!this.state.heldEvent) return;

    console.debug('[MS] onPlayHeldEvent: attempting PlayEvent', { heldEventId: this.state.heldEvent?.id, coinsBefore: this.state.resourceBank.coins });
    try {
      const cmd = new PlayEventCommand(this.state);
      this.undoManager.execute(cmd);
      // Record action event
      try { recordMainStreetEvent({ type: 'action', turn: this.state.turn, action: { type: 'play-event' }, description: cmd.description }); } catch (_) {}
      try { this.gameEvents?.emit('card:placed', { action: 'play-event', heldEventId: this.state.heldEvent?.id ?? null }); } catch (_) {}
      this.instructionText.setText('Played held Investment event!');
      addLog(this.state, 'Played held event (via UI)', 'neutral');
      console.debug('[MS] PlayEvent executed', { coinsAfter: this.state.resourceBank.coins, heldEventAfter: this.state.heldEvent?.id ?? null });
    } catch (e) {
      console.error('[MS] PlayEvent failed', e);
      this.instructionText.setText(`Error: ${(e as Error).message}`);
    }

    this.refreshAll();
  }

  // ── Action buttons ──────────────────────────────────────
  public refreshActionButtons(...args: any[]): any {
    return (this.msRenderer as any).refreshActionButtons.apply(this.msRenderer, args);
  }
  public createActionButton(...args: any[]): any {
    return (this.msRenderer as any).createActionButton.apply(this.msRenderer, args);
  }

  /**
   * Creates a "Hint" button that is disabled after first use per turn.
   * When clicked, queries the Greedy strategy and highlights the recommended
   * card/slot with a one-line rationale in the instruction text area.
   */
  public createHintButton(...args: any[]): any {
    return (this.msRenderer as any).createHintButton.apply(this.msRenderer, args);
  }

  /** Handles the Hint button click: generates and displays the hint. */
  public onHintClick(): void {
    if (this.hintUsedThisTurn) return;
    if (this.uiPhase !== 'market') return;

    const hint: HintResult | null = generateHint(this.state);
    if (!hint) {
      this.instructionText.setText('Hint not available right now.');
      return;
    }

    // Record usage and store highlight targets
    this.hintUsedThisTurn = true;

    // Determine which card and slot to highlight based on the action type
    if (hint.action.type === 'buy-business') {
      this.hintedCardId = hint.action.cardId;
      this.hintedSlotIndex = hint.action.slotIndex;
    } else if (hint.action.type === 'buy-upgrade') {
      this.hintedCardId = hint.action.cardId;
      this.hintedSlotIndex = hint.action.targetSlot ?? null;
    } else if (hint.action.type === 'buy-event') {
      this.hintedCardId = hint.action.cardId;
      this.hintedSlotIndex = null;
    } else if (hint.action.type === 'play-event') {
      this.hintedCardId = this.state.heldEvent?.id ?? null;
      this.hintedSlotIndex = null;
    } else {
      this.hintedCardId = null;
      this.hintedSlotIndex = null;
    }

    // Show rationale in instruction text
    this.instructionText.setText(`Hint: ${hint.rationale}`);

    // Record the hint request in the activity log / transcript
    addLog(this.state, `Hint: ${hint.rationale}`, 'neutral');
    try { recordMainStreetEvent({ type: 'hint', turn: this.state.turn, recommendedAction: hint.action, rationale: hint.rationale }); } catch (_) {}

    // Refresh buttons (to disable the hint button) and visual highlights
    this.refreshActionButtons();
    this.refreshStreetGrid();
    this.refreshMarket();
    this.refreshPlayerHand();
  }

  public performUndo(): void {
    if (this.uiPhase === 'animating' || this.uiPhase === 'game-over') return;
    if (!this.undoManager || !this.undoManager.canUndo()) return;

    try {
      const cmd = this.undoManager.undo();
      addLog(this.state, 'Undo', 'neutral');
      try { if (cmd) recordMainStreetEvent({ type: 'undo', turn: this.state.turn, reversedAction: { description: cmd.description } }); } catch (_) {}
      this.refreshAll();
    } catch (e) {
      console.error('Undo failed:', e);
    }
  }

  public performRedo(): void {
    if (this.uiPhase === 'animating' || this.uiPhase === 'game-over') return;
    if (!this.undoManager || !this.undoManager.canRedo()) return;

    try {
      const cmd = this.undoManager.redo();
      addLog(this.state, 'Redo', 'neutral');
      try { if (cmd) recordMainStreetEvent({ type: 'redo', turn: this.state.turn, reappliedAction: { description: cmd.description } }); } catch (_) {}
      this.refreshAll();
    } catch (e) {
      console.error('Redo failed:', e);
    }
  }


  public clearMarketSelection(): void {
    this.marketSelectionManager?.clear();
    this.selectedMarketCardId = null;
  }

  public selectMarketCardById(cardId: string): void {
    const selection = this.marketSelectionByCardId.get(cardId);
    if (!selection) return;
    this.marketSelectionManager.select(selection);
  }

  public onBusinessCardClick(card: BusinessCard): void {
    if (this.uiPhase !== 'market') return;

    this.selectMarketCardById(card.id);

    const emptySlots = getEmptySlots(this.state);
    if (emptySlots.length === 0) {
      this.instructionText.setText('No empty slots available!');
      return;
    }

    // Check if can afford
    const firstSlot = emptySlots[0];
    const legality = canPurchaseBusiness(this.state, card.id, firstSlot);
    if (!legality.legal) {
      this.instructionText.setText(`Cannot buy: ${legality.reason ?? 'unknown'}`);
      return;
    }

    // Enter placement mode
    this.pendingBusinessCard = card;
    this.pendingBusinessSourceIndex = this.state.market.business.findIndex((c) => c.id === card.id);
    this.uiPhase = 'placing-business';
    this.instructionText.setText(`Click an empty slot to place "${card.name}"`);
    this.refreshStreetGrid();
    this.refreshActionButtons();
  }

  public onSlotClick(slotIndex: number): void {
    if (this.uiPhase !== 'placing-business' || !this.pendingBusinessCard) return;

    const sourceIndex = this.pendingBusinessSourceIndex;
    const pendingCardId = this.pendingBusinessCard.id;
    const pendingCardName = this.pendingBusinessCard.name;

    this.pendingBusinessCard = null;
    this.pendingBusinessSourceIndex = null;
    this.clearMarketSelection();
    this.uiPhase = 'animating';
    this.instructionText.setText(`Placing "${pendingCardName}"...`);
    this.hiddenTransferSourceCardIds.add(pendingCardId);
    this.refreshAll();

    const afterTransfer = (): void => {
      console.debug('[MS] onSlotClick: attempting BuyBusiness', { cardId: pendingCardId, slotIndex, coinsBefore: this.state.resourceBank.coins, marketBefore: this.state.market.business.map(c=>c.id) });
      try {
        const cmd = new BuyBusinessCommand(this.state, pendingCardId, slotIndex);
        this.undoManager.execute(cmd);
        // Record action event
        try { recordMainStreetEvent({ type: 'action', turn: this.state.turn, action: { type: 'buy-business', cardId: pendingCardId, slotIndex }, description: cmd.description }); } catch (_) {}
        // Emit a game event for audio / integrations
        try { this.gameEvents?.emit('card:placed', { cardId: pendingCardId, slotIndex }); } catch (_) {}
        this.instructionText.setText(`Placed "${pendingCardName}" on slot ${slotIndex}`);
      } catch (e) {
        console.error('[MS] BuyBusiness failed', e);
        this.instructionText.setText(`Error: ${(e as Error).message}`);
      }

      this.hiddenTransferSourceCardIds.delete(pendingCardId);
      this.uiPhase = 'market';
      this.refreshAll();
    };

    if (typeof sourceIndex === 'number' && sourceIndex >= 0) {
      void this.animateTransferFromMarket({
        cardId: pendingCardId,
        family: 'business',
        row: 'business',
        slotIndex: sourceIndex,
        destination: this.getStreetSlotCenter(slotIndex),
      }).then(afterTransfer);
    } else {
      afterTransfer();
    }
  }

  public onEventCardClick(card: EventCard): void {
    if (this.uiPhase !== 'market') return;

    this.selectMarketCardById(card.id);

    const legality = canPurchaseEvent(this.state, card.id);
    if (!legality.legal) {
      this.instructionText.setText(`Cannot buy event: ${legality.reason ?? 'unknown'}`);
      return;
    }

    const sourceIndex = this.state.market.investments.findIndex((c) => c.id === card.id);

    this.uiPhase = 'animating';
    this.instructionText.setText(`Buying event "${card.name}"...`);
    this.hiddenTransferSourceCardIds.add(card.id);
    this.refreshAll();

    const afterTransfer = (): void => {
      console.debug('[MS] onEventCardClick: attempting BuyEvent', { cardId: card.id, coinsBefore: this.state.resourceBank.coins, marketBefore: this.state.market.investments.map(c=>c.id) });
      try {
        const cmd = new BuyEventCommand(this.state, card.id);
        this.undoManager.execute(cmd);
        try { recordMainStreetEvent({ type: 'action', turn: this.state.turn, action: { type: 'buy-event', cardId: card.id }, description: cmd.description }); } catch (_) {}
        try { this.gameEvents?.emit('card:placed', { cardId: card.id }); } catch (_) {}
        this.instructionText.setText(`Bought event: "${card.name}"`);
      } catch (e) {
        console.error('[MS] BuyEvent failed', e);
        this.instructionText.setText(`Error: ${(e as Error).message}`);
      }

      this.hiddenTransferSourceCardIds.delete(card.id);
      this.uiPhase = 'market';
      this.refreshAll();
    };

    if (sourceIndex >= 0) {
      void this.animateTransferFromMarket({
        cardId: card.id,
        family: 'event',
        row: 'investments',
        slotIndex: sourceIndex,
        destination: this.getHandCardCenter(),
      }).then(afterTransfer);
    } else {
      afterTransfer();
    }
  }

  public onUpgradeCardClick(card: UpgradeCard): void {
    if (this.uiPhase !== 'market') return;

    this.selectMarketCardById(card.id);

    const legality = canPurchaseUpgrade(this.state, card.id);
    if (!legality.legal) {
      this.instructionText.setText(`Cannot buy upgrade: ${legality.reason ?? 'unknown'}`);
      return;
    }

    const sourceIndex = this.state.market.investments.findIndex((c) => c.id === card.id);

    // Determine which business slot this upgrade targets (first eligible match)
    const targetSlot = findTargetBusinessSlot(this.state, card);

    // If there are multiple upgrade branches for that business, show a choice modal
    const branches = getUpgradeBranchesForBusiness(this.state, targetSlot);
    if (branches.length > 1) {
      this.showUpgradeChoiceModal(branches, targetSlot, sourceIndex);
      return;
    }

    // Single upgrade available — apply after transfer animation
    this.uiPhase = 'animating';
    this.instructionText.setText(`Applying upgrade "${card.name}"...`);
    this.hiddenTransferSourceCardIds.add(card.id);
    this.refreshAll();

    const afterTransfer = (): void => {
      console.debug('[MS] onUpgradeCardClick: attempting BuyUpgrade', { cardId: card.id, targetSlot, coinsBefore: this.state.resourceBank.coins, marketBefore: this.state.market.investments.map(c=>c.id), streetBefore: this.state.streetGrid.map(s=>s?.id ?? null) });
      try {
        const cmd = new BuyUpgradeCommand(this.state, card.id, targetSlot);
        this.undoManager.execute(cmd);
        try { recordMainStreetEvent({ type: 'action', turn: this.state.turn, action: { type: 'buy-upgrade', cardId: card.id, targetSlot }, description: cmd.description }); } catch (_) {}
        try { this.gameEvents?.emit('card:placed', { cardId: card.id, targetSlot }); } catch (_) {}
        this.instructionText.setText(`Applied upgrade: "${card.name}"`);
      } catch (e) {
        console.error('[MS] BuyUpgrade failed', e);
        this.instructionText.setText(`Error: ${(e as Error).message}`);
      }

      this.hiddenTransferSourceCardIds.delete(card.id);
      this.uiPhase = 'market';
      this.refreshAll();
    };

    if (sourceIndex >= 0) {
      void this.animateTransferFromMarket({
        cardId: card.id,
        family: 'upgrade',
        row: 'investments',
        slotIndex: sourceIndex,
        destination: this.getStreetSlotCenter(targetSlot),
      }).then(afterTransfer);
    } else {
      afterTransfer();
    }
  }

  /**
   * Shows a modal overlay that lets the player choose between multiple
   * upgrade branches available for the business at `targetSlot`.
   *
   * When a branch button is clicked the modal is dismissed, the chosen
   * upgrade is applied via `executeAction`, and the scene is refreshed.
   *
   * @param branches   Eligible UpgradeCards the player may choose from.
   * @param targetSlot Street grid slot of the business to be upgraded.
   */
  public showUpgradeChoiceModal(branches: UpgradeCard[], targetSlot: number, sourceIndex: number): void {
    const MODAL_DEPTH = 20;
    const MODAL_W = 500;
    const BTN_H = 60;
    const HEADER_H = 60;
    const FOOTER_H = 50;
    const MODAL_H = HEADER_H + branches.length * BTN_H + FOOTER_H;

    const overlay = createOverlayBackground(
      this,
      { depth: MODAL_DEPTH, alpha: 0.8 },
      { width: MODAL_W, height: MODAL_H, color: 0x1a1208, alpha: 0.95, depth: MODAL_DEPTH },
    );
    this.overlayObjects.push(...overlay.objects);

    const cx = this.layout.gameW / 2;
    const cy = this.layout.gameH / 2;
    const top = cy - MODAL_H / 2;

    // Title
    const title = this.add
      .text(cx, top + 24, 'Choose an Upgrade Path', {
        fontSize: '18px', fontStyle: 'bold', color: '#ffdd88', fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(MODAL_DEPTH + 1);
    this.overlayObjects.push(title);

    // Branch buttons
    branches.forEach((branch, idx) => {
      const btnY = top + HEADER_H + idx * BTN_H + BTN_H / 2;

      // Button background
      const btnBg = this.add.rectangle(cx, btnY, MODAL_W - 40, BTN_H - 8, 0x2a1f14, 0.9)
        .setDepth(MODAL_DEPTH + 1)
        .setStrokeStyle(1, 0x665544)
        .setInteractive({ useHandCursor: true });
      this.overlayObjects.push(btnBg);

      // Branch label
      const costLabel = `$${branch.cost}`;
      const bonusLabel = `+${branch.incomeBonus} income, +${branch.synergyRangeBonus} range`;
      const btnText = this.add
        .text(cx, btnY - 8, branch.name, {
          fontSize: '14px', fontStyle: 'bold', color: '#ffffff', fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(MODAL_DEPTH + 2);
      this.overlayObjects.push(btnText);

      const detailText = this.add
        .text(cx, btnY + 10, `${costLabel} — ${bonusLabel}`, {
          fontSize: '11px', color: '#aaaaaa', fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(MODAL_DEPTH + 2);
      this.overlayObjects.push(detailText);

      const onChoose = (): void => {
        // Dismiss modal first
        dismissOverlay(this.overlayObjects);
        this.overlayObjects = [];

        this.uiPhase = 'animating';
        this.instructionText.setText(`Applying upgrade "${branch.name}"...`);
        this.hiddenTransferSourceCardIds.add(branch.id);
        this.refreshAll();

        const afterTransfer = (): void => {
          try {
            this.undoManager.execute(new BuyUpgradeCommand(this.state, branch.id, targetSlot));
            this.instructionText.setText(`Applied upgrade: "${branch.name}"`);
          } catch (e) {
            this.instructionText.setText(`Error: ${(e as Error).message}`);
          }

          this.hiddenTransferSourceCardIds.delete(branch.id);
          this.uiPhase = 'market';
          this.refreshAll();
        };

        if (sourceIndex >= 0) {
          void this.animateTransferFromMarket({
            cardId: branch.id,
            family: 'upgrade',
            row: 'investments',
            slotIndex: sourceIndex,
            destination: this.getStreetSlotCenter(targetSlot),
          }).then(afterTransfer);
        } else {
          afterTransfer();
        }
      };

      btnBg.on('pointerdown', onChoose);
      btnBg.on('pointerover', () => btnBg.setFillStyle(0x3a2f24, 0.95));
      btnBg.on('pointerout', () => btnBg.setFillStyle(0x2a1f14, 0.9));
    });

    // Cancel button
    const cancelBtn = createOverlayButton(
      this,
      cx,
      top + MODAL_H - FOOTER_H / 2,
      '[ Cancel ]',
      MODAL_DEPTH + 2,
      { color: '#ff8888', hoverColor: '#ffaaaa' },
    );
    this.overlayObjects.push(cancelBtn);
    cancelBtn.on('pointerdown', () => {
      dismissOverlay(this.overlayObjects);
      this.overlayObjects = [];
    });
  }

  // ── Activity Log ─────────────────────────────────────────

  /**
   * Rebuilds the log panel content from state.activityLog.
   * Only re-renders when entries have been added since the last call.
   */
  public refreshLog(...args: any[]): any {
    return (this.msRenderer as any).refreshLog.apply(this.msRenderer, args);
  }

  /** Updates the geometry mask rectangle to clip log content. */
  public updateLogMask(): void {
    if (!this.logMaskGraphics) return;
    this.logMaskGraphics.clear();
    this.logMaskGraphics.fillStyle(0xffffff);
    // Mask is in world coordinates
    this.logMaskGraphics.fillRect(
      this.layout.logX,
      this.layout.logY + LOG_TITLE_H,
      this.layout.logW,
      this.layout.logH - LOG_TITLE_H - 2,
    );
  }

  /** Handles mouse wheel events over the log panel area. */
  public handleLogWheel = (
    pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void => {
    // Only scroll when pointer is inside the log panel bounds
    if (
      pointer.x < this.layout.logX || pointer.x > this.layout.logX + this.layout.logW ||
      pointer.y < this.layout.logY || pointer.y > this.layout.logY + this.layout.logH
    ) {
      return;
    }
    if (this.logMaxScroll <= 0) return;

    this.logScrollOffset = Phaser.Math.Clamp(
      this.logScrollOffset + (deltaY > 0 ? LOG_SCROLL_SPEED : -LOG_SCROLL_SPEED),
      0,
      this.logMaxScroll,
    );

    // Update auto-scroll flag: re-enable if scrolled to bottom
    const BOTTOM_THRESHOLD = 4;
    this.logAutoScroll = this.logScrollOffset >= this.logMaxScroll - BOTTOM_THRESHOLD;

    this.applyLogScroll();
  };

  /** Applies the current scroll offset to the log content container. */
  public applyLogScroll(): void {
    this.logContentContainer.setY(LOG_TITLE_H + 2 - this.logScrollOffset);
    this.updateLogMask();
  }

  getStreetContainer(): Phaser.GameObjects.Container {
    return this.streetContainer;
  }

  getMarketContainer(): Phaser.GameObjects.Container {
    return this.marketContainer;
  }

  getIncidentQueueContainer(): Phaser.GameObjects.Container {
    return this.incidentQueueContainer;
  }

  getHandContainer(): Phaser.GameObjects.Container {
    return this.handContainer;
  }

  getActionContainer(): Phaser.GameObjects.Container {
    return this.actionContainer;
  }

  /** Test helper: returns number of transfer animations triggered in this scene instance. */
  getTransferAnimationCountForTest(): number {
    return this.transferAnimationCount;
  }

  /** Test helper: returns count of hidden source cards while transfer animation is in progress. */
  getHiddenTransferSourceCardCountForTest(): number {
    return this.hiddenTransferSourceCardIds.size;
  }

  /** Test helper: returns current computed scene layout metrics. */
  getLayoutMetricsForTest(): SceneLayout {
    return { ...this.layout };
  }

  /** Test helper: returns rectangles for major play zones. */
  getSectionRectsForTest(): {
    market: { x: number; y: number; w: number; h: number };
    queue: { x: number; y: number; w: number; h: number };
    street: { x: number; y: number; w: number; h: number };
    hand: { x: number; y: number; w: number; h: number };
    action: { x: number; y: number; w: number; h: number };
    instruction: { x: number; y: number; w: number; h: number };
  } {
    const l = this.layout;
    const market = {
      x: 20,
      y: l.marketTop - 10,
      w: l.gameW - 40,
      h: 2 * l.marketRowH + l.marketRowGap + 20,
    };
    const queue = {
      x: 20,
      y: l.queueTop - 10,
      w: l.queueLabelW + INCIDENT_QUEUE_SIZE * (l.queueCardW + l.queueCardGap) + 100,
      h: l.queueCardH + 24,
    };
    const street = {
      x: l.streetX,
      y: l.streetTop,
      w: l.streetCols * l.slotW + (l.streetCols - 1) * l.slotGap,
      h: STREET_ROWS * l.slotH + (STREET_ROWS - 1) * l.streetRowGap,
    };
    const hand = {
      x: 40,
      y: l.handY,
      w: l.handCardW,
      h: l.handCardH,
    };

    const rightX = l.gameW - 24;
    const actionRowY = l.actionY + 4;
    const actionW = l.actionButtonW + 12 + l.hintButtonW + 12 + l.smallButtonW + 12 + l.smallButtonW;
    const action = {
      x: rightX - actionW,
      y: actionRowY,
      w: actionW,
      h: l.actionButtonH,
    };

    const instruction = {
      x: this.instructionText.x - this.instructionText.displayWidth,
      y: this.instructionText.y - this.instructionText.displayHeight * 0.5,
      w: this.instructionText.displayWidth,
      h: this.instructionText.displayHeight,
    };

    return { market, queue, street, hand, action, instruction };
  }

  // ── Replay: load board state ─────────────────────────────

  /**
   * Inject a board state snapshot for the replay tool.
   *
   * Called by the replay adapter via `page.evaluate()`.
   * Updates internal scene state to reflect the given snapshot and emits
   * `state-settled` so the replay tool can take a screenshot.
   *
   * Accepts either the engine's serialized state shape (MainStreetSerializedState)
   * or a minimal snapshot containing a `seed` and optional `turn`.
   */
  public loadBoardState(state: any): void {
    if (!this.replayMode) {
      throw new Error('loadBoardState() is only available in replay mode (?mode=replay)');
    }

    try {
      // If the payload looks like a full serialized state, use the deserializer
      if (state && state.config && typeof state.turn === 'number') {
        this.state = deserializeMainStreetState(state);
      } else if (state && state.initialState) {
        // Some transcripts embed initialState under a wrapper
        this.state = deserializeMainStreetState(state.initialState as any);
      } else if (state && state.seed) {
        // Minimal snapshot: create a fresh game from the seed
        this.state = setupMainStreetGame({ seed: state.seed, difficulty: this.selectedDifficulty });
        if (typeof state.turn === 'number') {
          this.state.turn = state.turn;
        }
      } else {
        // Fallback: generate a default game
        this.state = setupMainStreetGame({ difficulty: this.selectedDifficulty });
      }
    } catch (e) {
      // On error, fall back to a default setup so replay can continue
      console.error('[MS] loadBoardState deserialise failed:', e);
      this.state = setupMainStreetGame({ difficulty: this.selectedDifficulty });
    }

    // Refresh visuals to reflect the injected state
    this.refreshAll();

    // If a stepIndex or turn was provided, use it; otherwise use current turn
    const step = state && (state.stepIndex ?? state.turn ?? null);
    const stepIdx = typeof step === 'number' ? step : this.state.turn;

    // Signal board is visually stable
    this.emitStateSettled(stepIdx, 'playing');
  }

  // ── Game Over Overlay ───────────────────────────────────

  public showGameOverOverlay(
    result: TurnResult,
    newlyUnlockedTiers: string[] = [],
  ): void {
    this.uiPhase = 'game-over';
    this.refreshAll();

    const isWin = result.gameResult === 'win';
    const title = isWin ? 'You Win!' : 'Game Over';
    const color = isWin ? '#44ff44' : '#ff4444';

    // Per-challenge breakdown lines (rendered below score breakdown)
    const activeChallenges = this.state.activeChallenges;
    const challengeLineCount = activeChallenges.length;
    // Extra height: section header + one line per challenge
    const challengeExtraH = challengeLineCount > 0 ? 24 + challengeLineCount * 20 : 0;

    // ── Meta-progression section heights ──
    // Tier unlock notifications (conditional)
    let tierUnlockH = 0;
    if (newlyUnlockedTiers.length > 0) {
      tierUnlockH += 26; // section header
      for (const tierId of newlyUnlockedTiers) {
        tierUnlockH += 20; // tier name line
        const def = TIER_DEFINITIONS[tierId];
        if (def) tierUnlockH += def.newCardIds.length * 16; // card list
      }
      tierUnlockH += 8; // bottom padding
    }
    // Current tier + campaign stats (always shown when campaign exists)
    const campaignH = this.campaign ? 80 : 0; // tier indicator + 3 stat lines + spacing

    const panelH = 360 + challengeExtraH + tierUnlockH + campaignH;

    // Overlay background
    const overlay = createOverlayBackground(
      this,
      { depth: 100, alpha: 0.75 },
      { width: 500, height: panelH, alpha: 0.95 },
    );
    this.overlayObjects.push(...overlay.objects);

    // Vertical anchor: centre of the panel
    const panelTop = this.layout.gameH / 2 - panelH / 2;

    // Title
    const titleText = this.add.text(this.layout.gameW / 2, panelTop + 30, title, {
      fontSize: '36px', fontStyle: 'bold', color, fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(101);
    this.overlayObjects.push(titleText);

    // End reason
    const reason = this.state.endReason ?? 'unknown';
    const reasonText = this.add.text(
      this.layout.gameW / 2, panelTop + 72,
      reason.replace(/_/g, ' '),
      { fontSize: '18px', color: '#ccbbaa', fontFamily: FONT_FAMILY },
    ).setOrigin(0.5).setDepth(101);
    this.overlayObjects.push(reasonText);

    // Score breakdown
    const { coins, reputation } = this.state.resourceBank;
    const challenges = this.state.challengesCompleted.length;
    const cfg = this.state.config;
    const lines = [
      `Coins: ${coins}`,
      `Reputation: ${reputation} (x${cfg.reputationScoreMultiplier} = ${reputation * cfg.reputationScoreMultiplier})`,
      `Challenges: ${challenges} (x${cfg.challengeBonusPoints} = ${challenges * cfg.challengeBonusPoints})`,
      `Final Score: ${result.finalScore}`,
    ];
    const breakdownY = panelTop + 110;
    const breakdown = this.add.text(this.layout.gameW / 2, breakdownY, lines.join('\n'), {
      fontSize: '16px', color: '#ddccbb', fontFamily: FONT_FAMILY,
      align: 'center', lineSpacing: 6,
    }).setOrigin(0.5, 0).setDepth(101);
    this.overlayObjects.push(breakdown);

    // Per-challenge breakdown (below score breakdown)
    let cursorY = breakdownY + 100; // approximate height of score breakdown text
    if (challengeLineCount > 0) {
      const sectionTitle = this.add.text(
        this.layout.gameW / 2, cursorY,
        'Challenge Details:',
        { fontSize: '14px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5, 0).setDepth(101);
      this.overlayObjects.push(sectionTitle);
      cursorY += 22;

      for (const ac of activeChallenges) {
        const done = ac.completed;
        const icon = done ? '\u2713' : '\u2717'; // checkmark or cross
        const lineColor = done ? '#44ff44' : '#ff6666';
        const challengeLine = this.add.text(
          this.layout.gameW / 2, cursorY,
          `${icon}  ${ac.challenge.title}`,
          { fontSize: '13px', color: lineColor, fontFamily: FONT_FAMILY },
        ).setOrigin(0.5, 0).setDepth(101);
        this.overlayObjects.push(challengeLine);
        cursorY += 20;
      }
    }

    // ── Meta-progression: Tier Unlock Notifications ──
    if (newlyUnlockedTiers.length > 0) {
      cursorY += 8;
      const unlockHeader = this.add.text(
        this.layout.gameW / 2, cursorY,
        'Tier Unlocked!',
        { fontSize: '14px', fontStyle: 'bold', color: '#44ff44', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5, 0).setDepth(101);
      this.overlayObjects.push(unlockHeader);
      cursorY += 22;

      for (const tierId of newlyUnlockedTiers) {
        const def = TIER_DEFINITIONS[tierId];
        if (!def) continue;

        // Find the milestone record to determine the trigger type
        const milestone = this.campaign?.milestoneHistory.find(
          (m) => m.tierId === tierId,
        );
        const triggerLabel = milestone?.triggerType === 'challenge'
          ? '(via challenges)' : '(via reputation)';

        const tierLine = this.add.text(
          this.layout.gameW / 2, cursorY,
          `NEW: Tier ${def.order} - ${def.name} ${triggerLabel}`,
          { fontSize: '13px', color: '#88ff88', fontFamily: FONT_FAMILY },
        ).setOrigin(0.5, 0).setDepth(101);
        this.overlayObjects.push(tierLine);
        cursorY += 20;

        // List the new cards added by this tier
        for (const cardId of def.newCardIds) {
          const cardName = CARD_TEMPLATE_NAMES.get(cardId) ?? cardId;
          const cardLine = this.add.text(
            this.layout.gameW / 2, cursorY,
            `  + ${cardName}`,
            { fontSize: '12px', color: '#aaddaa', fontFamily: FONT_FAMILY },
          ).setOrigin(0.5, 0).setDepth(101);
          this.overlayObjects.push(cardLine);
          cursorY += 16;
        }
      }
    }

    // ── Meta-progression: Current Tier + Campaign Stats ──
    if (this.campaign) {
      cursorY += 8;
      const highest = highestUnlockedTier(this.campaign.unlockedTiers);
      const tierCount = ORDERED_TIER_DEFINITIONS.length;
      const tierLabel = highest
        ? `Current Tier: ${highest.order} / ${tierCount} - ${highest.name}`
        : 'Current Tier: --';
      const tierIndicator = this.add.text(
        this.layout.gameW / 2, cursorY, tierLabel,
        { fontSize: '14px', fontStyle: 'bold', color: '#ddbb88', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5, 0).setDepth(101);
      this.overlayObjects.push(tierIndicator);
      cursorY += 22;

      const winRate = this.campaign.totalRuns > 0
        ? Math.round((this.campaign.totalWins / this.campaign.totalRuns) * 100)
        : 0;
      const statsLines = [
        `Runs: ${this.campaign.totalRuns}  |  Wins: ${this.campaign.totalWins}  (${winRate}%)`,
        `High Score: ${this.campaign.highestScore}  |  Best Rep: ${this.campaign.persistentReputation}`,
      ];
      const statsText = this.add.text(
        this.layout.gameW / 2, cursorY, statsLines.join('\n'),
        { fontSize: '13px', color: '#bbaa99', fontFamily: FONT_FAMILY, align: 'center', lineSpacing: 4 },
      ).setOrigin(0.5, 0).setDepth(101);
      this.overlayObjects.push(statsText);
    }

    // Difficulty selector
    const diffY = panelTop + panelH - 80;
    const diffLabel = this.add.text(
      this.layout.gameW / 2 - 80, diffY,
      `Difficulty: ${this.selectedDifficulty}`,
      { fontSize: '14px', color: '#ccbbaa', fontFamily: FONT_FAMILY },
    ).setOrigin(0, 0.5).setDepth(101);
    this.overlayObjects.push(diffLabel);

    const cycleBtn = this.add.text(
      this.layout.gameW / 2 + 90, diffY,
      '[ Change ]',
      { fontSize: '14px', color: '#ffdd88', fontFamily: FONT_FAMILY },
    ).setOrigin(0, 0.5).setDepth(101).setInteractive({ useHandCursor: true });
    cycleBtn.on('pointerdown', () => {
      const idx = DIFFICULTY_NAMES.indexOf(this.selectedDifficulty);
      this.selectedDifficulty = DIFFICULTY_NAMES[(idx + 1) % DIFFICULTY_NAMES.length];
      diffLabel.setText(`Difficulty: ${this.selectedDifficulty}`);
    });
    this.overlayObjects.push(cycleBtn);

    // Buttons (positioned relative to panel bottom)
    const btnY = panelTop + panelH - 40;
    const playAgainBtn = createOverlayButton(
      this, this.layout.gameW / 2 - 110, btnY,
      '[ Play Again ]', 101,
    );
    playAgainBtn.on('pointerdown', () => {
      dismissOverlay(this.overlayObjects);
      this.overlayObjects = [];
      this.scene.restart();
    });
    this.overlayObjects.push(playAgainBtn);

    const menuBtn = createOverlayMenuButton(
      this, this.layout.gameW / 2 + 30, btnY, 101,
    );
    this.overlayObjects.push(menuBtn);
  }
}
