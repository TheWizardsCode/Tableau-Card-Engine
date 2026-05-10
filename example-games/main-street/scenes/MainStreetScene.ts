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
  GRID_SIZE,
  synergyColor,
  CARD_TEMPLATE_NAMES,
  MARKET_BUSINESS_SLOTS,
  MARKET_INVESTMENT_SLOTS,
  INCIDENT_QUEUE_SIZE,
} from '../MainStreetCards';
import {
  executeDayStart,
  processEndOfTurn,
  computeScore,
  type TurnResult,
} from '../MainStreetEngine';
import {
  getAffordableBusinessCards,
  getAffordableUpgradeCards,
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
  popTextOrIcon,
  moveGameObject,
  attachSelection,
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
import {
  BG_COLOR,
  BOX_FILL,
  BOX_RADIUS,
  BOX_STROKE,
  CHALLENGE_LINE_H,
  CHALLENGE_PAD,
  CHALLENGE_TITLE_H,
  LOG_COLORS,
  LOG_FONT_SIZE,
  LOG_LINE_H,
  LOG_PAD,
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
  private tooltipManager?: TooltipManager;
  private msRenderer!: MainStreetRenderer;
  // Game state
  private state!: MainStreetState;
  private uiPhase: UIPhase = 'idle';

  // Campaign / meta-progression
  private campaign: MainStreetCampaignProgress | null = null;
  private saveStore: SaveLoadStore | null = null;

  // Selected difficulty (persisted across replays)
  private selectedDifficulty: DifficultyName = 'Medium';

  // Pending selection for placing a business
  private pendingBusinessCard: BusinessCard | null = null;
  private pendingBusinessSourceIndex: number | null = null;

  // Computed responsive layout metrics
  private layout!: SceneLayout;

  // Display containers
  private hudContainer!: Phaser.GameObjects.Container;
  private streetContainer!: Phaser.GameObjects.Container;
  private marketContainer!: Phaser.GameObjects.Container;
  private incidentQueueContainer!: Phaser.GameObjects.Container;
  private handContainer!: Phaser.GameObjects.Container;
  private actionContainer!: Phaser.GameObjects.Container;

  // Activity Log panel
  private logContainer!: Phaser.GameObjects.Container;
  private logContentContainer!: Phaser.GameObjects.Container;
  private logMaskGraphics: Phaser.GameObjects.Graphics | null = null;
  private logContentMask: Phaser.Display.Masks.GeometryMask | null = null;
  private logScrollOffset = 0;
  private logMaxScroll = 0;
  private logTotalContentH = 0;
  private logAutoScroll = true;
  private logPrevEntryCount = 0;

  // Challenge Tracker panel
  private challengeContainer!: Phaser.GameObjects.Container;

  // Instruction text
  private instructionText!: Phaser.GameObjects.Text;

  // Overlay objects
  private overlayObjects: Phaser.GameObjects.GameObject[] = [];

  // HUD animation state
  private previousCoins: number | null = null;
  private previousReputation: number | null = null;
  private transferAnimationCount = 0;
  private activeTransferTweens = new Set<Phaser.Tweens.Tween>();
  private activeTransferVisuals = new Set<Phaser.GameObjects.GameObject>();
  private hiddenTransferSourceCardIds = new Set<string>();

  // Hint system
  /** True after the player has used their one hint for this turn. */
  private hintUsedThisTurn = false;
  /** Card ID of the card highlighted by the current hint (null = none). */
  private hintedCardId: string | null = null;
  /** Grid slot index highlighted by the current hint (null = none). */
  private hintedSlotIndex: number | null = null;

  // Persistent market-card selection UX
  private marketSelectionManager!: SingleSelectionManager;
  private marketSelectionByCardId = new Map<string, SelectionController>();
  private selectedMarketCardId: string | null = null;

  // SVG debug overlay (opt-in via ?msSvgDebug=1)
  private svgDebugEnabled = false;
  private svgDebugText?: Phaser.GameObjects.Text;

  // Undo/Redo manager for market actions (per-scene)
  private undoManager!: UndoRedoManager;

  constructor() {
    super({ key: 'MainStreetScene' });
  }

  /** Stores raw SVG text for each card template (fetched in preload, used for lazy rasterisation). */
  private cardSvgSources: Map<string, string> = new Map();
  /** Resolves when all SVG source fetches started in preload have settled. */
  private cardSvgLoadPromise: Promise<void> = Promise.resolve();

  // DOM-based SVG renderer (optional) - renders crisp SVGs using browser image rendering
  private svgDom?: SvgDomRenderer;

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

  private createHeader(): void {
    return this.msRenderer.createHeader.apply(this.msRenderer, arguments as any);
  }

  /**
   * Prewarms SVG textures for cards that will be visible on initial render.
   * This rasterises them at the exact pixel sizes needed for the current layout,
   * ensuring crisp rendering on HiDPI displays.
   */
  private async prewarmVisibleCardTextures(): Promise<void> {
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
  private templateIdFromCardId(cardId: string): string {
    return cardId.replace(/-\d+$/, '');
  }

  /**
   * Lazily request a card texture for the given render size.
   * If generation succeeds, trigger a refresh so the SVG texture is used.
   */
  private requestCardTexture(cardId: string, renderW: number, renderH: number): void {
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

  private computeLayout(): SceneLayout {
    return this.msRenderer.computeLayout.apply(this.msRenderer, arguments as any);
  }

  private createContainers(): void {
    this.hudContainer = this.add.container(0, 0);
    this.streetContainer = this.add.container(0, 0);
    this.marketContainer = this.add.container(0, 0);
    this.incidentQueueContainer = this.add.container(0, 0);
    this.handContainer = this.add.container(0, 0);
    this.actionContainer = this.add.container(0, 0);

    // Challenge Tracker panel
    this.challengeContainer = this.add.container(this.layout.challengeX, this.layout.challengeY);

    // Activity Log panel (persistent, not rebuilt each refresh)
    this.logContainer = this.add.container(this.layout.logX, this.layout.logY);

    // Panel background
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1408, 0.85);
    bg.fillRoundedRect(0, 0, this.layout.logW, this.layout.logH, 4);
    bg.lineStyle(1, BOX_STROKE, 0.5);
    bg.strokeRoundedRect(0, 0, this.layout.logW, this.layout.logH, 4);
    this.logContainer.add(bg);

    // Title bar
    const titleBg = this.add.graphics();
    titleBg.fillStyle(0x332816, 0.9);
    titleBg.fillRoundedRect(0, 0, this.layout.logW, LOG_TITLE_H, { tl: 4, tr: 4, bl: 0, br: 0 });
    this.logContainer.add(titleBg);

    const titleText = this.add.text(this.layout.logW / 2, LOG_TITLE_H / 2, 'Activity Log', {
      fontSize: '12px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    this.logContainer.add(titleText);

    // Scrollable content container
    this.logContentContainer = this.add.container(0, LOG_TITLE_H + 2);
    this.logContainer.add(this.logContentContainer);

    // Geometry mask for clipping scrollable content
    this.logMaskGraphics = this.add.graphics();
    this.logMaskGraphics.setVisible(false);
    this.logContentMask = new Phaser.Display.Masks.GeometryMask(this, this.logMaskGraphics);
    this.logContentContainer.setMask(this.logContentMask);
    this.updateLogMask();

    // Mouse-wheel scroll for the log panel
    this.input.off('wheel', this.handleLogWheel, this);
    this.input.on('wheel', this.handleLogWheel, this);
  }

  private createInstructions(): void {
    return this.msRenderer.createInstructions.apply(this.msRenderer, arguments as any);
  }

  private initSvgDebugOverlay(): void {
    if (!this.svgDebugEnabled) return;
    this.svgDebugText = this.add.text(10, 42, '', {
      fontSize: '12px',
      color: '#9be0ff',
      fontFamily: FONT_FAMILY,
      backgroundColor: '#00000088',
      padding: { x: 6, y: 4 },
    }).setDepth(10_000).setScrollFactor(0);
  }

  private updateSvgDebugOverlay(): void {
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

  private handleResize(): void {
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
  private loadCampaignAndSetup(): void {
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
  private updateCampaignProgress(): Promise<void> {
    if (!this.campaign || !this.saveStore) return Promise.resolve();
    return updateCampaignAfterRun(this.campaign, this.state, this.saveStore)
      .then(() => {})  // discard the returned campaign (already mutated in place)
      .catch(() => {
        // Silently ignore save failures -- campaign will be retried next run
      });
  }

  // ── Day flow ────────────────────────────────────────────

  private startDayPhase(): void {
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

  private endTurn(): void {
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

  private refreshAll(): void {
    this.svgDom?.clear();
    this.refreshHud();
    this.refreshStreetGrid();
    this.refreshMarket();
    this.refreshIncidentQueue();
    this.refreshPlayerHand();
    this.refreshActionButtons();
    this.refreshChallengeTracker();
    this.refreshLog();
    this.updateSvgDebugOverlay();
  }

  // ── HUD ─────────────────────────────────────────────────

  private refreshHud(): void {
    this.hudContainer.removeAll(true);

    const score = computeScore(this.state);
    const { coins, reputation } = this.state.resourceBank;
    const { gameW, hudY } = this.layout;

    // Background strip - 2/3 width, centered
    const strip = this.add.rectangle(gameW / 2, hudY, gameW * 0.66, 28, 0x1a1408, 0.6);
    strip.setStrokeStyle(1, BOX_STROKE, 0.5);
    this.hudContainer.add(strip);

    // Coins - centered in strip
    const stripWidth = gameW * 0.66;
    const stripLeft = (gameW - stripWidth) / 2;
    const coinText = this.add.text(stripLeft + stripWidth * 0.25, hudY, `Coins: ${coins}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ffcc44', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.hudContainer.add(coinText);

    // Reputation - centered in strip
    const repText = this.add.text(stripLeft + stripWidth * 0.5, hudY, `Rep: ${reputation}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#88bbff', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.hudContainer.add(repText);

    // Score - right side of strip
    const scoreText = this.add.text(stripLeft + stripWidth * 0.85, hudY, `Score: ${score}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ff8844', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.hudContainer.add(scoreText);

    this.animateHudValueChanges({
      coins,
      reputation,
      coinX: stripLeft + stripWidth * 0.25 + 80,
      repX: stripLeft + stripWidth * 0.5 + 65,
      hudY,
    });
  }

  private animateHudValueChanges(params: {
    coins: number;
    reputation: number;
    coinX: number;
    repX: number;
    hudY: number;
  }): void {
    const { coins, reputation, coinX, repX, hudY } = params;

    if (this.previousCoins === null || this.previousReputation === null) {
      this.previousCoins = coins;
      this.previousReputation = reputation;
      return;
    }

    const reducedMotion = this.settingsPanel?.reducedMotion;

    if (coins !== this.previousCoins) {
      const delta = coins - this.previousCoins;
      const text = this.add.text(coinX, hudY - 6, `${delta > 0 ? '+' : ''}${delta}`, {
        fontSize: '16px',
        fontStyle: 'bold',
        color: delta >= 0 ? '#ffdd66' : '#ff7777',
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5).setDepth(500);
      void popTextOrIcon({
        scene: this,
        target: text,
        duration: 1500,
        riseY: 22,
        scale: 1.2,
        reducedMotion,
      });
      // Emit income event for audio when coins increased
      try {
        if (delta > 0) {
          try { this.gameEvents?.emit('income-gained', { amount: delta }); } catch (_) {}
        }
      } catch (_) {}
    }

    if (reputation !== this.previousReputation) {
      const delta = reputation - this.previousReputation;
      const text = this.add.text(repX, hudY - 6, `${delta > 0 ? '+' : ''}${delta}`, {
        fontSize: '16px',
        fontStyle: 'bold',
        color: delta >= 0 ? '#99ccff' : '#ff8899',
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5).setDepth(500);
      void popTextOrIcon({
        scene: this,
        target: text,
        duration: 1500,
        riseY: 22,
        scale: 1.2,
        reducedMotion,
      });
    }

    this.previousCoins = coins;
    this.previousReputation = reputation;
  }

  private getMarketCardCenter(row: 'business' | 'investments', slotIndex: number): { x: number; y: number } | null {
    if (slotIndex < 0) return null;
    const rowTop = row === 'business'
      ? this.layout.marketTop + 6
      : this.layout.marketTop + 6 + this.layout.marketRowH + this.layout.marketRowGap;
    const cardX = this.layout.marketLabelW + 50 + slotIndex * (this.layout.marketCardW + this.layout.marketCardGap);
    return {
      x: cardX + this.layout.marketCardW / 2,
      y: rowTop + this.layout.marketCardH / 2,
    };
  }

  private getStreetSlotCenter(slotIndex: number): { x: number; y: number } {
    const col = slotIndex % this.layout.streetCols;
    const row = Math.floor(slotIndex / this.layout.streetCols);
    const x = this.layout.streetX + col * (this.layout.slotW + this.layout.slotGap) + this.layout.slotW / 2;
    const y = this.layout.streetTop + row * (this.layout.slotH + this.layout.streetRowGap) + this.layout.slotH / 2;
    return { x, y };
  }

  private getHandCardCenter(): { x: number; y: number } {
    return {
      x: this.layout.handX + this.layout.handCardW / 2,
      y: this.layout.handY + this.layout.handCardH / 2,
    };
  }

  private createTransferCardVisual(
    cardId: string,
    family: 'business' | 'event' | 'upgrade',
    atX: number,
    atY: number,
  ): Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform {
    // If cards are currently rendered as DOM SVGs, render transfer visual as DOM too
    // so it can layer above table cards consistently.
    const templateId = this.templateIdFromCardId(cardId);
    const svgText = this.cardSvgSources.get(templateId);
    if (this.svgDom && svgText) {
      const domId = `ms_dom_transfer_${cardId}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      return this.svgDom.createOrUpdate(
        domId,
        svgText,
        atX,
        atY,
        this.layout.marketCardW,
        this.layout.marketCardH,
        undefined,
        10000,
      ) as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform;
    }

    const bgColor = family === 'business' ? 0x5a7f36 : family === 'upgrade' ? 0x6B4C9A : 0x8B4513;
    const w = this.layout.marketCardW;
    const h = this.layout.marketCardH;
    const container = this.add.container(atX, atY);

    const cardBg = this.add.rectangle(0, 0, w, h, bgColor, 0.95);
    cardBg.setStrokeStyle(2, 0xffdd88, 0.9);
    container.add(cardBg);

    const title = CARD_TEMPLATE_NAMES.get(templateId) ?? cardId;
    const titleText = this.add.text(0, -h * 0.18, title, {
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#ffffff',
      fontFamily: FONT_FAMILY,
      align: 'center',
      wordWrap: { width: w - 10 },
    }).setOrigin(0.5, 0.5);
    container.add(titleText);

    const subtitle = this.add.text(0, h * 0.22, family.toUpperCase(), {
      fontSize: '10px',
      color: '#ffeecc',
      fontFamily: FONT_FAMILY,
      align: 'center',
    }).setOrigin(0.5, 0.5);
    container.add(subtitle);

    container.setDepth(10000);
    return container;
  }

  private cleanupTransferAnimations(): void {
    for (const tween of this.activeTransferTweens) {
      tween.stop();
    }
    this.activeTransferTweens.clear();

    for (const visual of this.activeTransferVisuals) {
      visual.destroy();
    }
    this.activeTransferVisuals.clear();
    this.hiddenTransferSourceCardIds.clear();
  }

  private animateTransferFromMarket(options: {
    cardId: string;
    family: 'business' | 'event' | 'upgrade';
    row: 'business' | 'investments';
    slotIndex: number;
    destination: { x: number; y: number };
  }): Promise<void> {
    if (this.settingsPanel?.reducedMotion) return Promise.resolve();

    const source = this.getMarketCardCenter(options.row, options.slotIndex);
    if (!source) return Promise.resolve();

    const visual = this.createTransferCardVisual(options.cardId, options.family, source.x, source.y);
    this.activeTransferVisuals.add(visual);
    this.transferAnimationCount += 1;

    return new Promise((resolve) => {
      // Choose SFX based on family/type of transfer
      const sfxForFamily = (family: string) => {
        if (family === 'event') {
          return { start: SFX_KEYS.EVENT_CHEER, move: SFX_KEYS.MOVE_LOOP, end: SFX_KEYS.EVENT_CHEER, moveIntervalMs: 1500 };
        }
        if (family === 'upgrade') {
          return { start: SFX_KEYS.UPGRADE_START, move: SFX_KEYS.MOVE_LOOP, end: SFX_KEYS.UPGRADE_END, moveIntervalMs: 1500 };
        }
        return { start: SFX_KEYS.BUSINESS_START, move: SFX_KEYS.MOVE_LOOP, end: SFX_KEYS.BUSINESS_END, moveIntervalMs: 1500 };
      };

      const sfx = sfxForFamily(options.family);

      const tween = moveGameObject({
        scene: this,
        target: visual,
        destX: options.destination.x,
        destY: options.destination.y,
        duration: 1500,
        ease: 'Cubic.easeInOut',
        soundManager: this.soundManager,
        sfx,
        onComplete: () => {
          this.activeTransferTweens.delete(tween);
          this.activeTransferVisuals.delete(visual);
          visual.destroy();
          resolve();
        },
      });

      this.activeTransferTweens.add(tween);
    });
  }

  // ── Challenge Tracker ───────────────────────────────────

  private refreshChallengeTracker(): void {
    this.challengeContainer.removeAll(true);

    const challenges = this.state.activeChallenges;
    if (challenges.length === 0) return;

    // Dynamic height based on number of challenges
    const panelH = CHALLENGE_TITLE_H + challenges.length * CHALLENGE_LINE_H + CHALLENGE_PAD * 2;
    const challengeW = this.layout.challengeW;

    // Panel background
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1408, 0.85);
    bg.fillRoundedRect(0, 0, challengeW, panelH, 4);
    bg.lineStyle(1, BOX_STROKE, 0.5);
    bg.strokeRoundedRect(0, 0, challengeW, panelH, 4);
    this.challengeContainer.add(bg);

    // Title bar
    const titleBg = this.add.graphics();
    titleBg.fillStyle(0x332816, 0.9);
    titleBg.fillRoundedRect(0, 0, challengeW, CHALLENGE_TITLE_H, { tl: 4, tr: 4, bl: 0, br: 0 });
    this.challengeContainer.add(titleBg);

    const completedCount = challenges.filter(ac => ac.completed).length;
    const titleText = this.add.text(
      challengeW / 2, CHALLENGE_TITLE_H / 2,
      `Challenges (${completedCount}/${challenges.length})`,
      { fontSize: '11px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY },
    ).setOrigin(0.5);
    this.challengeContainer.add(titleText);

    // Challenge list -- compact single-line rows: indicator + title + description
    let yOff = CHALLENGE_TITLE_H + CHALLENGE_PAD;
    for (const ac of challenges) {
      const isComplete = ac.completed;
      const indicator = isComplete ? '\u2713' : '\u2022';  // checkmark or bullet
      const color = isComplete ? '#44ff44' : '#ccbbaa';
      const nameColor = isComplete ? '#66aa66' : '#ddccbb';

      // Indicator
      const indicatorText = this.add.text(CHALLENGE_PAD, yOff, indicator, {
        fontSize: '13px', fontStyle: 'bold', color, fontFamily: FONT_FAMILY,
      }).setOrigin(0, 0);
      this.challengeContainer.add(indicatorText);

      // Challenge title
      const challengeText = this.add.text(
        CHALLENGE_PAD + 16, yOff,
        ac.challenge.title,
        {
          fontSize: '11px',
          fontStyle: isComplete ? 'italic' : 'normal',
          color: nameColor,
          fontFamily: FONT_FAMILY,
        },
      ).setOrigin(0, 0);
      this.challengeContainer.add(challengeText);

      // Description (right portion of the row)
      const descText = this.add.text(
        challengeW * 0.42, yOff,
        ac.challenge.description,
        {
          fontSize: '10px',
          color: isComplete ? '#558855' : '#998877',
          fontFamily: FONT_FAMILY,
          wordWrap: { width: challengeW * 0.56 },
        },
      ).setOrigin(0, 0);
      this.challengeContainer.add(descText);

      yOff += CHALLENGE_LINE_H;
    }
  }

  // ── Street Grid ─────────────────────────────────────────

  private refreshStreetGrid(): void {
    this.streetContainer.removeAll(true);

    const { gameW, streetTop, streetX, slotW, slotGap, slotH, streetCols, streetRowGap } = this.layout;

    // Section label
    const label = this.add.text(gameW / 2, streetTop - 16, '', {
      fontSize: '14px', fontStyle: 'bold', color: '#aa9966', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 1);
    this.streetContainer.add(label);

    for (let i = 0; i < GRID_SIZE; i++) {
      const col = i % streetCols;
      const row = Math.floor(i / streetCols);
      const x = streetX + col * (slotW + slotGap);
      const y = streetTop + row * (slotH + streetRowGap);
      const biz = this.state.streetGrid[i];

      if (biz) {
        this.drawBusinessSlot(x, y, i, biz);
      } else {
        this.drawEmptySlot(x, y, i);
      }
    }
  }

  private drawBusinessSlot(x: number, y: number, _index: number, biz: BusinessCard): void {
    const { slotW, slotH } = this.layout;
    const isHinted = this.hintedSlotIndex === _index;

    const renderW = Math.max(1, Math.round(slotW - 4));
    const renderH = Math.max(1, Math.round(slotH - 4));
    const tplKey = this.templateKeyForCard(biz.id, renderW, renderH);
    const usedSvg = this.textures && (this.textures as Phaser.Textures.TextureManager).exists(tplKey);
    if (usedSvg && this.svgDom) {
      // Render via DOM SVG image for perfect crispness
      const cx = x + slotW / 2;
      const cy = y + slotH / 2;
      const templateId = this.templateIdFromCardId(biz.id);
      const svgText = this.cardSvgSources.get(templateId)!;
      const domKey = this.domKeyForCard('street', _index, biz.id);
      this.svgDom.createOrUpdate(domKey, svgText, cx, cy, renderW, renderH, () => {
        // click maps to scene slot click
        this.onSlotClick(_index);
      }, 100);
    } else if (usedSvg) {
      const img = this.add.image(Math.round(x + slotW / 2), Math.round(y + slotH / 2), tplKey);
      // Use the exact slot dimensions - texture is already rasterised at correct size
      img.setDisplaySize(renderW, renderH);
      this.streetContainer.add(img);

      if (isHinted) {
        const hintRect = this.add.rectangle(x + slotW / 2, y + slotH / 2, slotW, slotH);
        hintRect.setStrokeStyle(3, 0x44ffff);
        hintRect.setFillStyle(0x000000, 0);
        this.streetContainer.add(hintRect);
      }
    } else {
      this.requestCardTexture(biz.id, renderW, renderH);
      const primaryColor = synergyColor(biz.synergyTypes[0]);
      // Card background
      const bg = this.add.rectangle(
        x + slotW / 2, y + slotH / 2,
        slotW, slotH, primaryColor, 0.7,
      );
      // Highlight the slot if it is the hint target (e.g., upgrade target)
      bg.setStrokeStyle(isHinted ? 3 : 2, isHinted ? 0x44ffff : 0xffffff, isHinted ? 1.0 : 0.4);
      this.streetContainer.add(bg);

      // Name
      const nameText = this.add.text(x + slotW / 2, y + 8, biz.name, {
        fontSize: '12px', fontStyle: 'bold', color: '#ffffff', fontFamily: FONT_FAMILY,
        wordWrap: { width: slotW - 8 },
        align: 'center',
      }).setOrigin(0.5, 0);
      this.streetContainer.add(nameText);

      // Income
      const income = biz.baseIncome + biz.incomeBonus;
      const incText = this.add.text(x + slotW / 2, y + slotH - 28, `+${income}/turn`, {
        fontSize: '13px', color: '#ffee88', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5, 0);
      this.streetContainer.add(incText);
    }

    // Only draw fallback textual overlays when no SVG texture is available.
    if (!usedSvg) {
      // Level
      if (biz.level > 0) {
        const lvlText = this.add.text(x + slotW - 6, y + 4, `Lv${biz.level}`, {
          fontSize: '11px', color: '#ffdd44', fontFamily: FONT_FAMILY,
        }).setOrigin(1, 0);
        this.streetContainer.add(lvlText);
      }

      // Synergy label at bottom
      const synLabel = biz.synergyTypes.join('/');
      const synText = this.add.text(x + slotW / 2, y + slotH - 12, synLabel, {
        fontSize: '10px', color: '#dddddd', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5, 1);
      this.streetContainer.add(synText);

      // Slot index
      const idxText = this.add.text(x + 4, y + 4, `${_index}`, {
        fontSize: '10px', color: '#ffffff55', fontFamily: FONT_FAMILY,
      });
      this.streetContainer.add(idxText);
    }

    if (!this.replayMode) {
      // Tooltip hit area for this business slot
      const tooltipZone = this.add.zone(
        x + slotW / 2,
        y + slotH / 2,
        slotW,
        slotH,
      );
      tooltipZone.setOrigin(0.5);
      tooltipZone.setInteractive({ useHandCursor: true });
      tooltipZone.on('pointerover', () => {
        const info = `Business: ${biz.name}\nIncome: +${biz.baseIncome + biz.incomeBonus}\nSynergy: ${biz.synergyTypes.join('/') }\nLevel: ${biz.level}`;
        this.tooltipManager?.show(info, tooltipZone.x, tooltipZone.y);
      });
      tooltipZone.on('pointerout', () => {
        this.tooltipManager?.hide();
      });
      this.streetContainer.add(tooltipZone);
    }
  }


  private drawEmptySlot(x: number, y: number, index: number): void {
    const { slotW, slotH } = this.layout;
    const isSelectable = this.uiPhase === 'placing-business';
    const isHinted = this.hintedSlotIndex === index && !isSelectable;
    const fillAlpha = isSelectable ? 0.4 : isHinted ? 0.35 : 0.2;
    const strokeColor = isSelectable ? 0xffdd44 : isHinted ? 0x44ffff : 0x555544;
    const strokeWidth = (isSelectable || isHinted) ? 2 : 1;

    const bg = this.add.rectangle(
      x + slotW / 2, y + slotH / 2,
      slotW, slotH, 0x333322, fillAlpha,
    );
    bg.setStrokeStyle(strokeWidth, strokeColor);
    this.streetContainer.add(bg);

    // Slot number
    const idxText = this.add.text(x + slotW / 2, y + slotH / 2, `${index}`, {
      fontSize: '18px', color: (isSelectable || isHinted) ? '#ffdd44' : '#666655',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    this.streetContainer.add(idxText);

    // Click to place
    if (isSelectable && this.pendingBusinessCard) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.onSlotClick(index));
      bg.on('pointerover', () => bg.setStrokeStyle(3, 0x44ff44));
      bg.on('pointerout', () => bg.setStrokeStyle(2, 0xffdd44));
    }
  }

  // ── Market ──────────────────────────────────────────────

  private refreshMarket(): void {
    this.marketContainer.removeAll(true);
    this.marketSelectionManager.clear();
    this.marketSelectionManager.clearTargets();
    this.marketSelectionByCardId.clear();
    this.selectedMarketCardId = null;

    const { gameW, marketTop, marketRowH, marketRowGap } = this.layout;

    // Section background (2 rows: business + investments)
    const totalH = 2 * marketRowH + marketRowGap + 20;
    const bgBox = this.add.graphics();
    bgBox.fillStyle(BOX_FILL, 0.3);
    bgBox.fillRoundedRect(20, marketTop - 10, gameW - 40, totalH, BOX_RADIUS);
    bgBox.lineStyle(1, BOX_STROKE, 0.4);
    bgBox.strokeRoundedRect(20, marketTop - 10, gameW - 40, totalH, BOX_RADIUS);
    this.marketContainer.add(bgBox);

    const sectionLabel = this.add.text(gameW / 2, marketTop - 4, 'Market', {
      fontSize: '13px', fontStyle: 'bold', color: '#887766', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 1);
    this.marketContainer.add(sectionLabel);

    // Business row
    this.drawMarketRow(
      marketTop + 6,
      'Business',
      'business',
      this.state.market.business,
      MARKET_BUSINESS_SLOTS,
      (card) => this.onBusinessCardClick(card as BusinessCard),
    );

    // Investments row (mixed upgrades + investment events)
    this.drawMarketRow(
      marketTop + 6 + marketRowH + marketRowGap,
      'Investments',
      'investments',
      this.state.market.investments,
      MARKET_INVESTMENT_SLOTS,
      (card) => {
        if (card.family === 'upgrade') {
          this.onUpgradeCardClick(card as UpgradeCard);
        } else {
          this.onEventCardClick(card as EventCard);
        }
      },
    );
  }

  private drawMarketRow(
    y: number,
    rowLabel: string,
    rowKey: string,
    cards: readonly (BusinessCard | EventCard | UpgradeCard)[],
    maxSlots: number,
    onClick: (card: BusinessCard | EventCard | UpgradeCard) => void,
  ): void {
    const { marketCardW, marketCardH, marketCardGap, marketLabelW } = this.layout;

    // Row label - also use for positioning deck count
    const label = this.add.text(40, y, rowLabel, {
      fontSize: '14px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.marketContainer.add(label);

    const startX = marketLabelW + 50;

    for (let i = 0; i < maxSlots; i++) {
      const cx = startX + i * (marketCardW + marketCardGap);
      const card = cards[i];

      if (card && !this.hiddenTransferSourceCardIds.has(card.id)) {
        const cardObj = this.drawMarketCard(cx, y, card, onClick, rowKey, i);
        this.marketContainer.add(cardObj);
      } else {
        // Empty slot
        const empty = this.add.rectangle(
          cx + marketCardW / 2, y + marketCardH / 2,
          marketCardW, marketCardH, 0x222211, 0.3,
        );
        empty.setStrokeStyle(1, 0x333322);
        this.marketContainer.add(empty);
      }
    }

    // Deck count - immediately below the label
    const deckY = y + 16;
    if (rowLabel === 'Business') {
      const deckCount = this.state.decks.business.length;
      const deckText = this.add.text(40, deckY, `Deck: ${deckCount}`, {
        fontSize: '12px', color: '#776655', fontFamily: FONT_FAMILY,
      }).setOrigin(0, 0);
      this.marketContainer.add(deckText);
    } else {
      // Investments row: show both upgrade and event deck counts - below label
      const upgCount = this.state.decks.upgrade.length;
      const evtCount = this.state.decks.event.length;
      const deckText = this.add.text(
        40, deckY,
        `Upg: ${upgCount}  Evt: ${evtCount}`,
        { fontSize: '11px', color: '#776655', fontFamily: FONT_FAMILY },
      ).setOrigin(0, 0);
      this.marketContainer.add(deckText);
    }
  }

  private templateKeyForCard(cardId: string, width?: number, height?: number): string {
    // strip copy suffixes like `-0`, `-1`, or serials appended by deck builders
    const base = cardId.replace(/-\d+$/,'');
    
    // If dimensions provided, include them in the key for size-specific textures
    if (width !== undefined && height !== undefined) {
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      return makeTextureKey(base, width, height, dpr);
    }
    return `ms_card_${base}`;
  }

  private domKeyForCard(context: string, slot: number | string, cardId: string): string {
    return `ms_dom_${context}_${slot}_${cardId}`;
  }

  private drawMarketCard(
    x: number,
    y: number,
    card: BusinessCard | EventCard | UpgradeCard,
    onClick: (card: BusinessCard | EventCard | UpgradeCard) => void,
    rowKey: string,
    slotIndex: number,
  ): Phaser.GameObjects.Container {
    const { marketCardW, marketCardH } = this.layout;
    const container = this.add.container(Math.round(x + marketCardW / 2), Math.round(y + marketCardH / 2));

    // Determine if this is a non-purchasable Incident event
    const isIncidentEvent = card.family === 'event' && (card as EventCard).trigger === 'Incident';

    // Determine if this card is the hint recommendation
    const isHinted = this.hintedCardId !== null && card.id === this.hintedCardId;

    // If we have a per-card SVG texture, render it as the card background
    const renderW = Math.max(1, Math.round(marketCardW - 4));
    const renderH = Math.max(1, Math.round(marketCardH - 4));
    const tplKey = this.templateKeyForCard(card.id, renderW, renderH);
    const baseStrokeColor = isHinted ? 0x44ffff : (isIncidentEvent ? 0x556688 : 0x888877);
    const baseStrokeWidth = isHinted ? 3 : 1;

    let bg: Phaser.GameObjects.Rectangle | null = null;

    if (this.textures && (this.textures as Phaser.Textures.TextureManager).exists(tplKey) && this.svgDom === undefined) {
      const img = this.add.image(0, 0, tplKey);
      // Texture is already rasterised at correct size for this slot
      img.setDisplaySize(renderW, renderH);
      container.add(img);
    } else if (this.svgDom && this.cardSvgSources.has(this.templateIdFromCardId(card.id))) {
      // Render SVG via DOM element
      const cx = x + marketCardW / 2;
      const cy = y + marketCardH / 2;
      const templateId = this.templateIdFromCardId(card.id);
      const svgText = this.cardSvgSources.get(templateId)!;
      const domKey = this.domKeyForCard(`market-${rowKey}`, slotIndex, card.id);
      const domEl = this.svgDom.createOrUpdate(domKey, svgText, cx, cy, renderW, renderH, () => {
        this.selectMarketCardById(card.id);
        onClick(card);
      }, 100);
      if (domEl && !this.replayMode) {
        try {
          const node = (domEl as any).node as HTMLElement | null;
          if (node) {
            node.addEventListener('mouseenter', () => {
              let info = '';
              if (card.family === 'business') {
                const b = card as any;
                info = `Business: ${b.name}\nCost: ${b.cost}\nIncome: +${b.baseIncome + (b.incomeBonus || 0)}/turn\nSynergy: ${(b.synergyTypes || []).join('/')}\n${b.description ?? ''}`;
              } else if (card.family === 'event') {
                const e = card as any;
                info = `Event: ${e.name}\nCost: ${e.cost}\nEffect: ${e.effect}`;
              } else if (card.family === 'upgrade') {
                const u = card as any;
                info = `Upgrade: ${u.name}\nCost: ${u.cost}\nIncome Bonus: +${u.incomeBonus}\nRequires: Lv${u.requiredLevel ?? 0}`;
              }
              this.tooltipManager?.show(info, container.x, container.y);
            });
            node.addEventListener('mouseleave', () => this.tooltipManager?.hide());
          }
        } catch (e) { /* ignore DOM attach errors */ }
      }
    } else {
      this.requestCardTexture(card.id, renderW, renderH);
      // Determine card color
      let fillColor = 0x333322;
      if (card.family === 'business') {
        fillColor = synergyColor((card as BusinessCard).synergyTypes[0]);
      } else if (card.family === 'event') {
        fillColor = isIncidentEvent ? 0x2B3A67 : 0x8B4513;  // Indigo for Incident, Brown for Investment
      } else if (card.family === 'upgrade') {
        fillColor = 0x6B4C9A;  // Purple for upgrades
      }

      // Background
      const fillAlpha = isIncidentEvent ? 0.5 : 0.7;
      bg = this.add.rectangle(0, 0, marketCardW, marketCardH, fillColor, fillAlpha);
      bg.setStrokeStyle(baseStrokeWidth, baseStrokeColor);
      container.add(bg);
    }

    const selectionRing = this.add.rectangle(0, 0, marketCardW, marketCardH);
    selectionRing.setFillStyle(0x000000, 0);
    selectionRing.setStrokeStyle(2, 0x44ff66);
    selectionRing.setVisible(false);
    container.add(selectionRing);

    const interactiveEnabled = this.uiPhase === 'market' && !isIncidentEvent;
    const selection = attachSelection(container, {
      onStateChange: ({ selected, hovered }) => {
        if (selected) {
          this.selectedMarketCardId = card.id;
        } else if (this.selectedMarketCardId === card.id) {
          this.selectedMarketCardId = null;
        }

        if (hovered && interactiveEnabled) {
          if (bg) {
            bg.setStrokeStyle(2, 0xffdd44);
          }
          selectionRing.setStrokeStyle(2, 0xffdd44);
          selectionRing.setVisible(!bg);
          container.setScale(1.05);
          return;
        }

        if (selected) {
          if (bg) {
            bg.setStrokeStyle(2, 0x44ff66);
          }
          selectionRing.setStrokeStyle(2, 0x44ff66);
          selectionRing.setVisible(true);
          container.setScale(1.04);
          return;
        }

        if (bg) {
          bg.setStrokeStyle(baseStrokeWidth, baseStrokeColor);
        }
        selectionRing.setVisible(false);
        container.setScale(1.0);
      },
    });

    if (interactiveEnabled) {
      this.marketSelectionByCardId.set(card.id, selection);

      const hitArea = this.add.rectangle(0, 0, marketCardW, marketCardH, 0x000000, 0.001);
      hitArea.setInteractive({ useHandCursor: true });
      hitArea.on('pointerdown', () => {
        this.marketSelectionManager.select(selection);
        onClick(card);
      });
      hitArea.on('pointerover', () => {
        selection.setHovered(true);
        if (!this.replayMode) {
          let info = '';
          if (card.family === 'business') {
            const b = card as any;
            info = `Business: ${b.name}\nCost: ${b.cost}\nIncome: +${b.baseIncome + (b.incomeBonus || 0)}/turn\nSynergy: ${(b.synergyTypes || []).join('/')}\n${b.description ?? ''}`;
          } else if (card.family === 'event') {
            const e = card as any;
            info = `Event: ${e.name}\nCost: ${e.cost}\nEffect: ${e.effect}\nCoins: ${e.coinDelta >= 0 ? '+' : ''}${e.coinDelta}, Rep: ${e.reputationDelta >= 0 ? '+' : ''}${e.reputationDelta}`;
          } else if (card.family === 'upgrade') {
            const u = card as any;
            info = `Upgrade: ${u.name}\nCost: ${u.cost}\nIncome Bonus: +${u.incomeBonus}\nRequires: Lv${u.requiredLevel ?? 0}\n${u.description ?? ''}`;
          }
          this.tooltipManager?.show(info, container.x, container.y);
        }
      });
      hitArea.on('pointerout', () => {
        selection.setHovered(false);
        if (!this.replayMode) this.tooltipManager?.hide();
      });
      this.marketSelectionManager.registerTarget(hitArea);
      container.add(hitArea);
    }

    // Card label and additional info are rendered inside per-card SVGs; only
    // add textual overlays when we do NOT have a per-card texture.
    const usedSvg = this.textures && (this.textures as Phaser.Textures.TextureManager).exists(tplKey);

    if (!usedSvg) {
      // Intentionally no text overlays: card text is authored inside each SVG.
    }

    return container;
  }

  // ── Incident Queue ───────────────────────────────────────

  private refreshIncidentQueue(): void {
    this.incidentQueueContainer.removeAll(true);

    const queue = this.state.incidentQueue;
    const deckRemaining = this.state.decks.event.length;

    const { queueLabelW, queueCardW, queueCardH, queueCardGap, queueTop } = this.layout;

    // Section background - width to just fit cards with small right margin
    const queueW = queueLabelW + 50 + INCIDENT_QUEUE_SIZE * (queueCardW + queueCardGap) - queueCardGap + 20;
    const queueH = queueCardH + 24;
    const bgBox = this.add.graphics();
    bgBox.fillStyle(0x1a1830, 0.35);
    bgBox.fillRoundedRect(110, queueTop - 10, queueW, queueH, BOX_RADIUS);
    bgBox.lineStyle(1, 0x445577, 0.5);
    bgBox.strokeRoundedRect(110, queueTop - 10, queueW, queueH, BOX_RADIUS);
    this.incidentQueueContainer.add(bgBox);

    // Section label
    const label = this.add.text(40, queueTop + queueCardH / 2 - 2, 'Upcoming', {
      fontSize: '13px', fontStyle: 'bold', color: '#7788aa', fontFamily: FONT_FAMILY,
      align: 'center',
    }).setOrigin(0, 0.5);
    this.incidentQueueContainer.add(label);

    const startX = queueLabelW + 50;

    for (let i = 0; i < INCIDENT_QUEUE_SIZE; i++) {
      const cx = startX + i * (queueCardW + queueCardGap);
      const card = queue[i];

      if (card) {
        const cardContainer = this.drawIncidentCard(cx, queueTop, card);
        this.incidentQueueContainer.add(cardContainer);
      } else {
        // Empty queue slot
        const empty = this.add.rectangle(
          cx + queueCardW / 2, queueTop + queueCardH / 2,
          queueCardW, queueCardH, 0x111122, 0.3,
        );
        empty.setStrokeStyle(1, 0x223344);
        this.incidentQueueContainer.add(empty);
      }
    }

    // Deck count - immediately below the label
    const deckText = this.add.text(40, queueTop + 32, `Deck: ${deckRemaining}`, {
      fontSize: '11px', color: '#556677', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0);
    this.incidentQueueContainer.add(deckText);
  }

  private drawIncidentCard(
    x: number,
    y: number,
    card: EventCard,
  ): Phaser.GameObjects.Container {
    const { queueCardW, queueCardH } = this.layout;
    const container = this.add.container(Math.round(x + queueCardW / 2), Math.round(y + queueCardH / 2));

    const renderW = Math.max(1, Math.round(queueCardW - 4));
    const renderH = Math.max(1, Math.round(queueCardH - 4));
    const tplKey = this.templateKeyForCard(card.id, renderW, renderH);
    const usedSvg = this.textures && (this.textures as Phaser.Textures.TextureManager).exists(tplKey);
    if (usedSvg) {
      const img = this.add.image(0, 0, tplKey);
      // Texture is already rasterised at correct size for this slot
      img.setDisplaySize(renderW, renderH);
      container.add(img);
    } else {
      this.requestCardTexture(card.id, renderW, renderH);
      // Indigo fallback background (non-interactive); no text overlays.
      const bg = this.add.rectangle(0, 0, queueCardW, queueCardH, 0x2B3A67, 0.5);
      bg.setStrokeStyle(1, 0x556688);
      container.add(bg);
    }

    if (!this.replayMode) {
      const hover = this.add.rectangle(0, 0, queueCardW, queueCardH, 0x000000, 0.001);
      hover.setInteractive({ useHandCursor: true });
      hover.on('pointerover', () => {
        const info = `Event: ${card.name}\nEffect: ${card.effect}\nCoins: ${card.coinDelta >= 0 ? '+' : ''}${card.coinDelta}, Rep: ${card.reputationDelta >= 0 ? '+' : ''}${card.reputationDelta}`;
        this.tooltipManager?.show(info, container.x, container.y);
      });
      hover.on('pointerout', () => this.tooltipManager?.hide());
      container.add(hover);
    }

    return container;
  }

  // ── Player Hand ────────────────────────────────────────────

  private refreshPlayerHand(): void {
    this.handContainer.removeAll(true);

    const held = this.state.heldEvent;
    const { handY, handX, handCardW, handCardH } = this.layout;

    // Your Hand label removed

    if (held) {
      const cardContainer = this.drawHeldEventCard(handX, handY, held);
      this.handContainer.add(cardContainer);
    } else {
      // Empty hand slot
      const empty = this.add.rectangle(
        40 + handCardW / 2, handY + handCardH / 2,
        handCardW, handCardH, 0x222211, 0.2,
      );
      empty.setStrokeStyle(1, 0x333322, 0.4);
      this.handContainer.add(empty);

      const emptyText = this.add.text(
        40 + handCardW / 2, handY + handCardH / 2,
        'No held event',
        { fontSize: '11px', color: '#555544', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.handContainer.add(emptyText);
    }
  }

  private drawHeldEventCard(
    x: number,
    y: number,
    card: EventCard,
  ): Phaser.GameObjects.Container {
    const { handCardW, handCardH } = this.layout;
    const container = this.add.container(Math.round(x + handCardW / 2), Math.round(y + handCardH / 2));
    const renderW = Math.max(1, Math.round(handCardW - 4));
    const renderH = Math.max(1, Math.round(handCardH - 4));

    // DOM-only rendering path for held investment cards.
    const templateId = this.templateIdFromCardId(card.id);
    const svgText = this.cardSvgSources.get(templateId);
    if (!this.svgDom || !svgText) {
      return container;
    }

    const cx = x + handCardW / 2;
    const cy = y + handCardH / 2;
    const domKey = this.domKeyForCard('hand', 0, card.id);
    const domEl = this.svgDom.createOrUpdate(
      domKey,
      svgText,
      cx,
      cy,
      renderW,
      renderH,
      this.uiPhase === 'market' ? () => this.onPlayHeldEvent() : undefined,
      100,
    );

    if (!this.replayMode) {
      try {
        // If an SvgDomRenderer exists we intentionally avoid adding any
        // Phaser fallback display objects for the held card. Tests may
        // provide a mock `svgDom.createOrUpdate` which returns undefined
        // but still counts as the DOM renderer being present. In that
        // case we still should not add a Phaser fallback rectangle.
        const node = (domEl as any)?.node as HTMLElement | null;
        if (node) {
          node.addEventListener('mouseenter', () => {
            const info = `Event: ${card.name}\nCost: ${card.cost}\nEffect: ${card.effect}`;
            this.tooltipManager?.show(info, container.x, container.y);
          });
          node.addEventListener('mouseleave', () => this.tooltipManager?.hide());

          if (this.uiPhase === 'market') {
            node.addEventListener('click', () => this.onPlayHeldEvent());
          }
        }
      } catch (e) { /* ignore */ }

      // Whether or not domEl.node was present, if svgDom is available we
      // do not add Phaser fallback visuals for the held hand slot. The
      // DOM renderer (or test-provided mock) is expected to handle
      // interactivity. Return early to avoid creating a Rectangle/Image.
      return container;
    }

    return container;
  }

  private onPlayHeldEvent(): void {
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

  private refreshActionButtons(): void {
    this.actionContainer.removeAll(true);

    if (this.uiPhase === 'market') {
      const rightX = this.layout.gameW - 24;
      const by = this.layout.actionY;

      // Affordable summary
      const affordable = getAffordableBusinessCards(this.state);
      const upgradeable = getAffordableUpgradeCards(this.state);
      const emptySlots = getEmptySlots(this.state);

      const summaryParts: string[] = [];
      if (affordable.length > 0 && emptySlots.length > 0) {
        summaryParts.push(`${affordable.length} businesses`);
      }
      if (upgradeable.length > 0) {
        summaryParts.push(`${upgradeable.length} upgrades`);
      }
      const summaryStr = summaryParts.length > 0
        ? `Can buy: ${summaryParts.join(', ')}`
        : 'No affordable cards';

      const summary = this.add.text(rightX, by - 4, summaryStr, {
        fontSize: '12px', color: '#887766', fontFamily: FONT_FAMILY,
      }).setOrigin(1, 1);
      this.actionContainer.add(summary);

      // End Turn button (right-aligned)
      const btnW = this.layout.actionButtonW;
      const hintBtnW = this.layout.hintButtonW;
      const smallW = this.layout.smallButtonW;

      const endBtn = this.createActionButton(rightX - btnW, by + 4, btnW, 'End Turn', () => {
        this.endTurn();
      });
      this.actionContainer.add(endBtn);

      // Hint button (to the left of End Turn)
      const hintBtn = this.createHintButton(rightX - btnW - 12 - hintBtnW, by + 4, hintBtnW);
      this.actionContainer.add(hintBtn);

      // Undo / Redo buttons (to the left of Hint)
      const undoBaseX = rightX - btnW - 12 - hintBtnW - 12 - smallW - 12 - smallW;
      const undoBtn = this.createActionButton(undoBaseX, by + 4, smallW, 'Undo', () => this.performUndo());
      this.actionContainer.add(undoBtn);
      const redoBtn = this.createActionButton(undoBaseX + smallW + 12, by + 4, smallW, 'Redo', () => this.performRedo());
      this.actionContainer.add(redoBtn);

    } else if (this.uiPhase === 'placing-business') {
      const rightX = this.layout.gameW - 24;
      const by = this.layout.actionY;

      const cardName = this.pendingBusinessCard?.name ?? '???';
      const hint = this.add.text(rightX, by - 4, `Place "${cardName}" -- click an empty slot`, {
        fontSize: '14px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY,
      }).setOrigin(1, 1);
      this.actionContainer.add(hint);

      // Cancel button (right-aligned)
      const btnW = this.layout.actionButtonW;
      const cancelBtn = this.createActionButton(rightX - btnW, by + 4, btnW, 'Cancel', () => {
        this.pendingBusinessCard = null;
        this.pendingBusinessSourceIndex = null;
        this.clearMarketSelection();
        this.uiPhase = 'market';
        this.refreshAll();
        this.instructionText.setText(
          `Turn ${this.state.turn} / ${this.state.config.maxTurns} -- Buy cards from the market or End Turn`,
        );
      });
      this.actionContainer.add(cancelBtn);
    }
  }

  private createActionButton(
    x: number,
    y: number,
    width: number,
    text: string,
    callback: () => void,
  ): Phaser.GameObjects.Container {
    const btnH = this.layout.actionButtonH;
    const container = this.add.container(x + width / 2, y + btnH / 2);

    const bg = this.add.rectangle(0, 0, width, btnH, 0x554422, 0.8);
    bg.setStrokeStyle(1, 0xaa8855);
    container.add(bg);

    const label = this.add.text(0, 0, text, {
      fontSize: '14px', fontStyle: 'bold', color: '#ffcc88', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    container.add(label);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', callback);
    bg.on('pointerover', () => {
      bg.setStrokeStyle(2, 0xffdd44);
      container.setScale(1.05);
    });
    bg.on('pointerout', () => {
      bg.setStrokeStyle(1, 0xaa8855);
      container.setScale(1.0);
    });

    return container;
  }

  /**
   * Creates a "Hint" button that is disabled after first use per turn.
   * When clicked, queries the Greedy strategy and highlights the recommended
   * card/slot with a one-line rationale in the instruction text area.
   */
  private createHintButton(
    x: number,
    y: number,
    width: number,
  ): Phaser.GameObjects.Container {
    const btnH = this.layout.actionButtonH;
    const isDisabled = this.hintUsedThisTurn;

    const container = this.add.container(x + width / 2, y + btnH / 2);

    const fillColor = isDisabled ? 0x2a2a2a : 0x224455;
    const strokeColor = isDisabled ? 0x444444 : 0x4488aa;
    const textColor = isDisabled ? '#666666' : '#88ccff';

    const bg = this.add.rectangle(0, 0, width, btnH, fillColor, 0.8);
    bg.setStrokeStyle(1, strokeColor);
    container.add(bg);

    const label = this.add.text(0, 0, isDisabled ? 'Hint ✓' : 'Hint', {
      fontSize: '14px', fontStyle: 'bold', color: textColor, fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    container.add(label);

    if (!isDisabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.onHintClick());
      bg.on('pointerover', () => {
        bg.setStrokeStyle(2, 0x88ddff);
        container.setScale(1.05);
      });
      bg.on('pointerout', () => {
        bg.setStrokeStyle(1, strokeColor);
        container.setScale(1.0);
      });
    }

    return container;
  }

  /** Handles the Hint button click: generates and displays the hint. */
  private onHintClick(): void {
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

  private performUndo(): void {
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

  private performRedo(): void {
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


  private clearMarketSelection(): void {
    this.marketSelectionManager?.clear();
    this.selectedMarketCardId = null;
  }

  private selectMarketCardById(cardId: string): void {
    const selection = this.marketSelectionByCardId.get(cardId);
    if (!selection) return;
    this.marketSelectionManager.select(selection);
  }

  private onBusinessCardClick(card: BusinessCard): void {
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

  private onSlotClick(slotIndex: number): void {
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

  private onEventCardClick(card: EventCard): void {
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

  private onUpgradeCardClick(card: UpgradeCard): void {
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
  private showUpgradeChoiceModal(branches: UpgradeCard[], targetSlot: number, sourceIndex: number): void {
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
  private refreshLog(): void {
    const entries = this.state.activityLog;
    const newCount = entries.length;

    // Skip rebuild if nothing changed
    if (newCount === this.logPrevEntryCount) return;

    const hadAutoScroll = this.logAutoScroll;
    this.logPrevEntryCount = newCount;

    // Clear existing content
    this.logContentContainer.removeAll(true);

    const contentW = this.layout.logW - LOG_PAD * 2;
    let yOff = 0;

    for (const entry of entries) {
      const color = LOG_COLORS[entry.type] ?? LOG_COLORS.neutral;
      const isTurnHeader = entry.type === 'turn-header';

      if (isTurnHeader) {
        // Subtle background bar for turn headers
        const barBg = this.add.graphics();
        barBg.fillStyle(0x443311, 0.5);
        barBg.fillRect(0, yOff, this.layout.logW, LOG_LINE_H);
        this.logContentContainer.add(barBg);
      }

      const txt = this.add.text(LOG_PAD, yOff, entry.text, {
        fontSize: `${LOG_FONT_SIZE}px`,
        fontStyle: isTurnHeader ? 'bold' : 'normal',
        color,
        fontFamily: FONT_FAMILY,
        wordWrap: { width: contentW },
      });
      this.logContentContainer.add(txt);

      // Use actual rendered height to handle word-wrapped lines
      yOff += Math.max(LOG_LINE_H, txt.height + 2);
    }

    this.logTotalContentH = yOff;

    // Visible area inside the panel (below title bar, above bottom edge)
    const visibleH = this.layout.logH - LOG_TITLE_H - 4;
    this.logMaxScroll = Math.max(0, this.logTotalContentH - visibleH);

    // Keep scroll position valid for the current content height.
    // On scene restart we can transition from a long previous run to a short
    // new log; without clamping, stale offsets can hide all entries.
    if (hadAutoScroll) {
      this.logScrollOffset = this.logMaxScroll;
    } else {
      this.logScrollOffset = Phaser.Math.Clamp(this.logScrollOffset, 0, this.logMaxScroll);
    }

    this.applyLogScroll();
  }

  /** Updates the geometry mask rectangle to clip log content. */
  private updateLogMask(): void {
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
  private handleLogWheel = (
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
  private applyLogScroll(): void {
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

  private showGameOverOverlay(
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
