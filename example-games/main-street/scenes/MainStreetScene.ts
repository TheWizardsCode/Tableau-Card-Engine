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
import { setupMainStreetGame, addLog } from '../MainStreetState';
import type { DifficultyName } from '../MainStreetDifficulty';
import { DIFFICULTY_NAMES } from '../MainStreetDifficulty';
import type { BusinessCard, EventCard, UpgradeCard } from '../MainStreetCards';
import {
  GRID_SIZE,
  synergyColor,
  cardLabel,
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
  GAME_W, GAME_H, FONT_FAMILY,
  createOverlayBackground, createOverlayButton, createOverlayMenuButton,
  dismissOverlay,
  createSceneTitle, createSceneMenuButton,
} from '../../../src/ui';
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

// ── Constants ───────────────────────────────────────────────

/** Background colour for Main Street (warm town feel). */
const BG_COLOR = '#2a1f14';

// ── Layout regions ──────────────────────────────────────────

// Section box styling
const BOX_STROKE = 0x665544;
const BOX_FILL = 0x2a1f14;
const BOX_RADIUS = 6;

// Base metrics are tuned for 1280x720 and scaled at runtime for narrower/taller viewports.
const BASE_HUD_Y = 50;
const BASE_MARKET_CARD_W = 140;
const BASE_MARKET_CARD_H = 80;
const BASE_MARKET_ROW_GAP = 10;
const BASE_MARKET_CARD_GAP = 12;
const BASE_MARKET_LABEL_W = 90;
// Incident queue uses same card size as market for consistency
const BASE_QUEUE_CARD_W = BASE_MARKET_CARD_W;
const BASE_QUEUE_CARD_H = BASE_MARKET_CARD_H;
const BASE_QUEUE_CARD_GAP = 10;
const BASE_SLOT_W = 96;
const BASE_SLOT_H = 100;
const BASE_SLOT_GAP = 10;
const STREET_COLS = 5;
const STREET_ROWS = 2;
const STREET_ROW_GAP = 12;
const BASE_HAND_CARD_W = 150;
const BASE_HAND_CARD_H = 90;

// Activity Log panel layout
const LOG_TITLE_H = 22;
const LOG_PAD = 8;
const LOG_FONT_SIZE = 13;
const LOG_LINE_H = 18;
const LOG_SCROLL_SPEED = 24;

// Log entry colors by type
const LOG_COLORS: Record<string, string> = {
  gain: '#44ff44',
  loss: '#ff4444',
  neutral: '#ccbbaa',
  'turn-header': '#ffdd44',
};

// Challenge Tracker panel layout
const CHALLENGE_LINE_H = 20;
const CHALLENGE_PAD = 6;
const CHALLENGE_TITLE_H = 20;

interface SceneLayout {
  gameW: number;
  gameH: number;
  hudY: number;
  marketTop: number;
  marketRowH: number;
  marketRowGap: number;
  marketCardW: number;
  marketCardH: number;
  marketCardGap: number;
  marketLabelW: number;
  queueTop: number;
  queueCardW: number;
  queueCardH: number;
  queueCardGap: number;
  queueLabelW: number;
  streetTop: number;
  slotW: number;
  slotH: number;
  slotGap: number;
  streetX: number;
  streetRowGap: number;
  streetCols: number;
  handY: number;
  handCardW: number;
  handCardH: number;
  instructionY: number;
  actionY: number;
  actionButtonH: number;
  actionButtonW: number;
  hintButtonW: number;
  smallButtonW: number;
  challengeX: number;
  challengeY: number;
  challengeW: number;
  logX: number;
  logY: number;
  logW: number;
  logH: number;
}
// ── UI Phase (scene-level interaction state) ────────────────

type UIPhase =
  | 'idle'               // Waiting for DayStart
  | 'market'             // Player can buy or end turn
  | 'placing-business'   // Player selected a business card, picking a slot
  | 'animating'          // Brief pause for feedback
  | 'game-over';         // Final overlay

// ── Scene ───────────────────────────────────────────────────

export class MainStreetScene extends CardGameScene {
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

  // Hint system
  /** True after the player has used their one hint for this turn. */
  private hintUsedThisTurn = false;
  /** Card ID of the card highlighted by the current hint (null = none). */
  private hintedCardId: string | null = null;
  /** Grid slot index highlighted by the current hint (null = none). */
  private hintedSlotIndex: number | null = null;

  // Undo/Redo manager for market actions (per-scene)
  private undoManager!: UndoRedoManager;

  constructor() {
    super({ key: 'MainStreetScene' });
  }

  // Preload placeholder SVG used for visual scale testing in the market
  preload(): void {
    // Canonical card size (140x190) — loader will keep vector fidelity and
    // we scale when rendering into market slots.
    try {
      this.load.svg('ms_placeholder_card', 'assets/games/main-street/svg/placeholder-card.svg', {
        width: 140,
        height: 190,
      });
    } catch (e) {
      // If svg loader is unavailable in the current environment, ignore
      // the error — tests can still validate the file on disk.
      // eslint-disable-next-line no-console
      console.debug('[MS] preload: svg load failed', e);
    }
  }

  // ── Create ──────────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor(BG_COLOR);

    // Reset
    this.uiPhase = 'idle';
    this.pendingBusinessCard = null;
    this.overlayObjects = [];

    // Reset hint state
    this.hintUsedThisTurn = false;
    this.hintedCardId = null;
    this.hintedSlotIndex = null;

    // Reset activity-log panel state in case this scene instance is restarted.
    this.logScrollOffset = 0;
    this.logMaxScroll = 0;
    this.logTotalContentH = 0;
    this.logAutoScroll = true;
    this.logPrevEntryCount = 0;

    this.detectReplayMode();
    this.initEventSystem();

    // Sound (re-use existing audio assets)
    this.initSoundSystem([], {});

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
    this.layout = this.computeLayout();
    this.createHeader();
    this.createContainers();
    this.createInstructions();

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
    this.initSettingsPanel();

    // Start first turn
    this.startDayPhase();
  }

  // ── Header ──────────────────────────────────────────────

  private createHeader(): void {
    createSceneMenuButton(this);
    createSceneTitle(this, 'Main Street');
  }

  private computeLayout(): SceneLayout {
    const gameW = Math.max(720, Math.floor(this.scale.width || GAME_W));
    const gameH = Math.max(640, Math.floor(this.scale.height || GAME_H));
    const compact = gameW < 1100;

    const margin = compact ? 16 : 20;
    const marketCardW = compact ? 126 : BASE_MARKET_CARD_W;
    const marketCardH = compact ? 72 : BASE_MARKET_CARD_H;
    const marketLabelW = compact ? 80 : BASE_MARKET_LABEL_W;
    const marketRowGap = BASE_MARKET_ROW_GAP;
    const marketRowH = marketCardH + 14;
    const marketTop = 90;

    const queueCardW = compact ? 126 : BASE_QUEUE_CARD_W;
    const queueCardH = compact ? 72 : BASE_QUEUE_CARD_H;
    const queueCardGap = compact ? 10 : BASE_QUEUE_CARD_GAP;
    const queueTop = marketTop + (2 * marketRowH + marketRowGap + 20) + 12;

    const slotGap = compact ? 8 : BASE_SLOT_GAP;
    const slotW = compact ? 88 : BASE_SLOT_W;
    const slotH = compact ? 92 : BASE_SLOT_H;
    const streetTotalW = STREET_COLS * slotW + (STREET_COLS - 1) * slotGap;
    const streetX = (gameW - streetTotalW) / 2;
    const streetTop = queueTop + queueCardH + 22;

    const handCardW = compact ? 132 : BASE_HAND_CARD_W;
    const handCardH = compact ? 78 : BASE_HAND_CARD_H;
    const handY = gameH - 24 - handCardH;
    const instructionY = handY - 20;

    const actionButtonH = compact ? 32 : 34;
    const actionY = gameH - 16 - actionButtonH;

    // Challenge tracker: position between hand and action buttons
    const challengeW = Math.min(560, gameW - handCardW - margin * 3);
    const challengeX = handCardW + margin + 24;
    const challengeY = handY - 12;

    const logW = compact ? 360 : 430;
    const logX = compact ? 540 : gameW - margin - logW;
    const logY = compact ? queueTop : Math.max(queueTop, challengeY + 28);
    const logH = Math.max(
      compact ? 180 : 200,
      Math.min(260, Math.floor(gameH - logY - 60))
    );
    const logVisible = compact || logY < gameH - 140;

    return {
      gameW,
      gameH,
      hudY: BASE_HUD_Y,
      marketTop,
      marketRowH,
      marketRowGap,
      marketCardW,
      marketCardH,
      marketCardGap: BASE_MARKET_CARD_GAP,
      marketLabelW,
      queueTop,
      queueCardW,
      queueCardH,
      queueCardGap,
      queueLabelW: marketLabelW,
      streetTop,
      slotW,
      slotH,
      slotGap,
      streetX,
      streetRowGap: STREET_ROW_GAP,
      streetCols: STREET_COLS,
      handY: handY,
      handCardW,
      handCardH,
      instructionY,
      actionY,
      actionButtonH,
      actionButtonW: compact ? 132 : 140,
      hintButtonW: compact ? 98 : 104,
      smallButtonW: compact ? 64 : 68,
      challengeX,
      challengeY,
      challengeW,
      logX: logVisible ? logX : -1000,
      logY: logVisible ? logY : 0,
      logW: logVisible ? logW : 0,
      logH,
    };
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
    this.instructionText = this.add
      .text(this.layout.gameW - 24, this.layout.instructionY, '', {
        fontSize: '14px',
        color: '#ccaa77',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(1, 0.5);
  }

  private handleResize(): void {
    this.layout = this.computeLayout();
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
    this.refreshHud();
    this.refreshStreetGrid();
    this.refreshMarket();
    this.refreshIncidentQueue();
    this.refreshPlayerHand();
    this.refreshActionButtons();
    this.refreshChallengeTracker();
    this.refreshLog();
  }

  // ── HUD ─────────────────────────────────────────────────

  private refreshHud(): void {
    this.hudContainer.removeAll(true);

    const score = computeScore(this.state);
    const { coins, reputation } = this.state.resourceBank;
    const { gameW, hudY } = this.layout;

    // Background strip
    const strip = this.add.rectangle(gameW / 2, hudY, gameW - 40, 28, 0x1a1408, 0.6);
    strip.setStrokeStyle(1, BOX_STROKE, 0.5);
    this.hudContainer.add(strip);

    // Turn
    const turnText = this.add.text(40, hudY, `Turn ${this.state.turn}/${this.state.config.maxTurns}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ffdd88', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.hudContainer.add(turnText);

    // Phase
    const phaseText = this.add.text(200, hudY, `Phase: ${this.state.phase}`, {
      fontSize: '14px', color: '#aa9977', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.hudContainer.add(phaseText);

    // Difficulty
    const diffText = this.add.text(420, hudY, `[${this.state.config.difficultyName}]`, {
      fontSize: '13px', color: '#999977', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.hudContainer.add(diffText);

    // Coins
    const coinText = this.add.text(gameW / 2 - 100, hudY, `Coins: ${coins}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ffcc44', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.hudContainer.add(coinText);

    // Reputation
    const repText = this.add.text(gameW / 2 + 50, hudY, `Rep: ${reputation}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#88bbff', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.hudContainer.add(repText);

    // Score
    const scoreText = this.add.text(gameW - 40, hudY, `Score: ${score}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ff8844', fontFamily: FONT_FAMILY,
    }).setOrigin(1, 0.5);
    this.hudContainer.add(scoreText);
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
    const label = this.add.text(gameW / 2, streetTop - 16, 'Your Street', {
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
    const primaryColor = synergyColor(biz.synergyTypes[0]);
    const isHinted = this.hintedSlotIndex === _index;

    // Card background
    const bg = this.add.rectangle(
      x + slotW / 2, y + slotH / 2,
      slotW, slotH, primaryColor, 0.7,
    );
    // Highlight the slot if it is the hint target (e.g., upgrade target)
    bg.setStrokeStyle(isHinted ? 3 : 2, isHinted ? 0x44ffff : 0xffffff, isHinted ? 1.0 : 0.4);
    this.streetContainer.add(bg);

    // Name
    const nameText = this.add.text(x + slotW / 2, y + 12, biz.name, {
      fontSize: '12px', fontStyle: 'bold', color: '#ffffff', fontFamily: FONT_FAMILY,
      wordWrap: { width: slotW - 8 },
      align: 'center',
    }).setOrigin(0.5, 0);
    this.streetContainer.add(nameText);

    // Income
    const income = biz.baseIncome + biz.incomeBonus;
    const incText = this.add.text(x + slotW / 2, y + slotH - 30, `+${income}/turn`, {
      fontSize: '13px', color: '#ffee88', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 0);
    this.streetContainer.add(incText);

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
      this.state.market.business,
      MARKET_BUSINESS_SLOTS,
      (card) => this.onBusinessCardClick(card as BusinessCard),
    );

    // Investments row (mixed upgrades + investment events)
    this.drawMarketRow(
      marketTop + 6 + marketRowH + marketRowGap,
      'Investments',
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
    cards: readonly (BusinessCard | EventCard | UpgradeCard)[],
    maxSlots: number,
    onClick: (card: BusinessCard | EventCard | UpgradeCard) => void,
  ): void {
    const { marketCardW, marketCardH, marketCardGap, marketLabelW } = this.layout;

    // Row label
    const label = this.add.text(40, y + marketCardH / 2, rowLabel, {
      fontSize: '14px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.marketContainer.add(label);

    const startX = marketLabelW + 50;

    for (let i = 0; i < maxSlots; i++) {
      const cx = startX + i * (marketCardW + marketCardGap);
      const card = cards[i];

      if (card) {
        // If a placeholder texture is available, render it in the first slot
        // so developers can visually validate SVG scaling. Otherwise fall back
        // to the normal drawMarketCard rendering.
        if (i === 0 && this.textures && this.textures.exists && this.textures.exists('ms_placeholder_card')) {
          const container = this.add.container(cx + marketCardW / 2, y + marketCardH / 2);
          const img = this.add.image(0, 0, 'ms_placeholder_card');
          // Preserve source aspect ratio when fitting into the slot.
          const SRC_W = 140;
          const SRC_H = 190;
          const fitW = marketCardW - 4;
          const fitH = marketCardH - 4;
          const scale = Math.min(fitW / SRC_W, fitH / SRC_H);
          img.setDisplaySize(Math.round(SRC_W * scale), Math.round(SRC_H * scale));
          container.add(img);

          // Add a simple label so the card still shows its name/cost
          const labelStr = cardLabel(card);
          const nameText = this.add.text(0, -marketCardH / 2 + 10, labelStr, {
            fontSize: '12px', fontStyle: 'bold', color: '#ffffff', fontFamily: FONT_FAMILY,
            wordWrap: { width: marketCardW - 12 },
            align: 'center',
          }).setOrigin(0.5, 0);
          container.add(nameText);

          // Make it interactive like the regular card if applicable
          const isIncidentEvent = card.family === 'event' && (card as EventCard).trigger === 'Incident';
          if (this.uiPhase === 'market' && !isIncidentEvent) {
            img.setInteractive({ useHandCursor: true });
            img.on('pointerdown', () => onClick(card));
            img.on('pointerover', () => container.setScale(1.03));
            img.on('pointerout', () => container.setScale(1.0));
          }

          this.marketContainer.add(container);
        } else {
          const cardObj = this.drawMarketCard(cx, y, card, onClick);
          this.marketContainer.add(cardObj);
        }
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

    // Deck count (right side)
    const deckX = startX + maxSlots * (marketCardW + marketCardGap) + 10;
    if (rowLabel === 'Business') {
      const deckCount = this.state.decks.business.length;
      const deckText = this.add.text(deckX, y + marketCardH / 2, `Deck: ${deckCount}`, {
        fontSize: '12px', color: '#776655', fontFamily: FONT_FAMILY,
      }).setOrigin(0, 0.5);
      this.marketContainer.add(deckText);
    } else {
      // Investments row: show both upgrade and event deck counts
      const upgCount = this.state.decks.upgrade.length;
      const evtCount = this.state.decks.event.length;
      const deckText = this.add.text(
        deckX, y + marketCardH / 2,
        `Upg: ${upgCount}  Evt: ${evtCount}`,
        { fontSize: '11px', color: '#776655', fontFamily: FONT_FAMILY },
      ).setOrigin(0, 0.5);
      this.marketContainer.add(deckText);
    }
  }

  private drawMarketCard(
    x: number,
    y: number,
    card: BusinessCard | EventCard | UpgradeCard,
    onClick: (card: BusinessCard | EventCard | UpgradeCard) => void,
  ): Phaser.GameObjects.Container {
    const { marketCardW, marketCardH } = this.layout;
    const container = this.add.container(x + marketCardW / 2, y + marketCardH / 2);

    // Determine if this is a non-purchasable Incident event
    const isIncidentEvent = card.family === 'event' && (card as EventCard).trigger === 'Incident';

    // Determine if this card is the hint recommendation
    const isHinted = this.hintedCardId !== null && card.id === this.hintedCardId;

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
    const bg = this.add.rectangle(0, 0, marketCardW, marketCardH, fillColor, fillAlpha);
    // Hinted cards get a bright cyan border; incident events use their normal border
    const strokeColor = isHinted ? 0x44ffff : (isIncidentEvent ? 0x556688 : 0x888877);
    const strokeWidth = isHinted ? 3 : 1;
    bg.setStrokeStyle(strokeWidth, strokeColor);
    container.add(bg);

    // Card label (name + cost for business/upgrade)
    const labelStr = cardLabel(card);
    const nameText = this.add.text(0, -marketCardH / 2 + 10, labelStr, {
      fontSize: '12px', fontStyle: 'bold',
      color: isIncidentEvent ? '#8899bb' : '#ffffff',
      fontFamily: FONT_FAMILY,
      wordWrap: { width: marketCardW - 12 },
      align: 'center',
    }).setOrigin(0.5, 0);
    container.add(nameText);

    // Trigger label for event cards (top-right corner)
    if (card.family === 'event') {
      const evt = card as EventCard;
      const triggerColor = isIncidentEvent ? '#6688bb' : '#cc9944';
      const triggerLabel = this.add.text(
        marketCardW / 2 - 4, -marketCardH / 2 + 4,
        evt.trigger,
        { fontSize: '9px', fontStyle: 'bold', color: triggerColor, fontFamily: FONT_FAMILY },
      ).setOrigin(1, 0);
      container.add(triggerLabel);
    }

    // Additional info line
    let infoStr = '';
    if (card.family === 'business') {
      const biz = card as BusinessCard;
      infoStr = `+${biz.baseIncome}/turn  ${biz.synergyTypes.join('/')}`;
    } else if (card.family === 'event') {
      const evt = card as EventCard;
      const parts: string[] = [];
      if (evt.coinDelta !== 0) parts.push(`${evt.coinDelta > 0 ? '+' : ''}${evt.coinDelta} coins`);
      if (evt.reputationDelta !== 0) parts.push(`${evt.reputationDelta > 0 ? '+' : ''}${evt.reputationDelta} rep`);
      infoStr = parts.join(', ') || evt.effect;
    } else if (card.family === 'upgrade') {
      const upg = card as UpgradeCard;
      infoStr = `For: ${upg.targetBusiness}`;
    }

    const infoText = this.add.text(0, marketCardH / 2 - 18, infoStr, {
      fontSize: '11px', color: isIncidentEvent ? '#7788aa' : '#ddddcc',
      fontFamily: FONT_FAMILY,
      wordWrap: { width: marketCardW - 12 },
      align: 'center',
    }).setOrigin(0.5, 1);
    container.add(infoText);

    // Interactivity (only during market phase, and not for Incident events)
    if (this.uiPhase === 'market' && !isIncidentEvent) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => onClick(card));
      bg.on('pointerover', () => {
        bg.setStrokeStyle(2, 0xffdd44);
        container.setScale(1.05);
      });
      bg.on('pointerout', () => {
        // Restore hint border if this card is hinted; otherwise use normal border
        bg.setStrokeStyle(isHinted ? 3 : 1, isHinted ? 0x44ffff : 0x888877);
        container.setScale(1.0);
      });
    }

    return container;
  }

  // ── Incident Queue ───────────────────────────────────────

  private refreshIncidentQueue(): void {
    this.incidentQueueContainer.removeAll(true);

    const queue = this.state.incidentQueue;
    const deckRemaining = this.state.decks.event.length;

    const { queueLabelW, queueCardW, queueCardH, queueCardGap, queueTop } = this.layout;

    // Section background
    const queueW = queueLabelW + INCIDENT_QUEUE_SIZE * (queueCardW + queueCardGap) + 100;
    const queueH = queueCardH + 24;
    const bgBox = this.add.graphics();
    bgBox.fillStyle(0x1a1830, 0.35);
    bgBox.fillRoundedRect(20, queueTop - 10, queueW, queueH, BOX_RADIUS);
    bgBox.lineStyle(1, 0x445577, 0.5);
    bgBox.strokeRoundedRect(20, queueTop - 10, queueW, queueH, BOX_RADIUS);
    this.incidentQueueContainer.add(bgBox);

    // Section label
    const label = this.add.text(40, queueTop + queueCardH / 2 - 2, 'Upcoming\nIncidents', {
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

    // Deck count
    const deckX = startX + INCIDENT_QUEUE_SIZE * (queueCardW + queueCardGap) + 10;
    const deckText = this.add.text(deckX, queueTop + queueCardH / 2, `Deck: ${deckRemaining}`, {
      fontSize: '11px', color: '#556677', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.incidentQueueContainer.add(deckText);
  }

  private drawIncidentCard(
    x: number,
    y: number,
    card: EventCard,
  ): Phaser.GameObjects.Container {
    const { queueCardW, queueCardH } = this.layout;
    const container = this.add.container(x + queueCardW / 2, y + queueCardH / 2);

    // Indigo background (non-interactive)
    const bg = this.add.rectangle(0, 0, queueCardW, queueCardH, 0x2B3A67, 0.5);
    bg.setStrokeStyle(1, 0x556688);
    container.add(bg);

    // Card name
    const nameText = this.add.text(0, -queueCardH / 2 + 8, cardLabel(card), {
      fontSize: '11px', fontStyle: 'bold', color: '#8899bb',
      fontFamily: FONT_FAMILY,
      wordWrap: { width: queueCardW - 12 },
      align: 'center',
    }).setOrigin(0.5, 0);
    container.add(nameText);

    // Effect summary
    const parts: string[] = [];
    if (card.coinDelta !== 0) parts.push(`${card.coinDelta > 0 ? '+' : ''}${card.coinDelta} coins`);
    if (card.reputationDelta !== 0) parts.push(`${card.reputationDelta > 0 ? '+' : ''}${card.reputationDelta} rep`);
    const infoStr = parts.join(', ') || card.effect;

    const infoText = this.add.text(0, queueCardH / 2 - 12, infoStr, {
      fontSize: '10px', color: '#7788aa',
      fontFamily: FONT_FAMILY,
      wordWrap: { width: queueCardW - 12 },
      align: 'center',
    }).setOrigin(0.5, 1);
    container.add(infoText);

    return container;
  }

  // ── Player Hand ────────────────────────────────────────────

  private refreshPlayerHand(): void {
    this.handContainer.removeAll(true);

    const held = this.state.heldEvent;
    const { handY, handCardW, handCardH } = this.layout;

    // Section label
    const label = this.add.text(40, handY - 10, 'Your Hand', {
      fontSize: '13px', fontStyle: 'bold', color: '#aa9944', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 1);
    this.handContainer.add(label);

    if (held) {
      const cardContainer = this.drawHeldEventCard(40, handY, held);
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
    const container = this.add.container(x + handCardW / 2, y + handCardH / 2);
    const isHinted = this.hintedCardId !== null && card.id === this.hintedCardId;

    // Warm brown background (Investment)
    const bg = this.add.rectangle(0, 0, handCardW, handCardH, 0x8B4513, 0.7);
    bg.setStrokeStyle(isHinted ? 3 : 2, isHinted ? 0x44ffff : 0xcc9944);
    container.add(bg);

    // Card name
    const nameText = this.add.text(0, -handCardH / 2 + 10, cardLabel(card), {
      fontSize: '12px', fontStyle: 'bold', color: '#ffffff',
      fontFamily: FONT_FAMILY,
      wordWrap: { width: handCardW - 12 },
      align: 'center',
    }).setOrigin(0.5, 0);
    container.add(nameText);

    // Effect summary
    const parts: string[] = [];
    if (card.coinDelta !== 0) parts.push(`${card.coinDelta > 0 ? '+' : ''}${card.coinDelta} coins`);
    if (card.reputationDelta !== 0) parts.push(`${card.reputationDelta > 0 ? '+' : ''}${card.reputationDelta} rep`);
    const infoStr = parts.join(', ') || card.effect;

    const infoText = this.add.text(0, handCardH / 2 - 14, infoStr, {
      fontSize: '11px', color: '#ddddcc',
      fontFamily: FONT_FAMILY,
      wordWrap: { width: handCardW - 12 },
      align: 'center',
    }).setOrigin(0.5, 1);
    container.add(infoText);

    // "Click to play" hint
    const hint = this.add.text(0, handCardH / 2 - 2, 'Click to play', {
      fontSize: '9px', fontStyle: 'italic', color: '#ccaa66',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 1);
    container.add(hint);

    // Interactivity (only during market phase)
    if (this.uiPhase === 'market') {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.onPlayHeldEvent());
      bg.on('pointerover', () => {
        bg.setStrokeStyle(3, 0xffdd44);
        container.setScale(1.05);
      });
      bg.on('pointerout', () => {
        bg.setStrokeStyle(isHinted ? 3 : 2, isHinted ? 0x44ffff : 0xcc9944);
        container.setScale(1.0);
      });
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


  private onBusinessCardClick(card: BusinessCard): void {
    if (this.uiPhase !== 'market') return;

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
    this.uiPhase = 'placing-business';
    this.instructionText.setText(`Click an empty slot to place "${card.name}"`);
    this.refreshStreetGrid();
    this.refreshActionButtons();
  }

  private onSlotClick(slotIndex: number): void {
    if (this.uiPhase !== 'placing-business' || !this.pendingBusinessCard) return;

    console.debug('[MS] onSlotClick: attempting BuyBusiness', { cardId: this.pendingBusinessCard?.id, slotIndex, coinsBefore: this.state.resourceBank.coins, marketBefore: this.state.market.business.map(c=>c.id) });
    try {
      const cmd = new BuyBusinessCommand(this.state, this.pendingBusinessCard.id, slotIndex);
      this.undoManager.execute(cmd);
      // Record action event
      try { recordMainStreetEvent({ type: 'action', turn: this.state.turn, action: { type: 'buy-business', cardId: this.pendingBusinessCard.id, slotIndex }, description: cmd.description }); } catch (_) {}
      this.instructionText.setText(
        `Placed "${this.pendingBusinessCard.name}" on slot ${slotIndex}`,
      );
      console.debug('[MS] BuyBusiness executed successfully', { coinsAfter: this.state.resourceBank.coins, marketAfter: this.state.market.business.map(c=>c.id), street: this.state.streetGrid.map(s=>s?.id ?? null) });
    } catch (e) {
      console.error('[MS] BuyBusiness failed', e);
      this.instructionText.setText(`Error: ${(e as Error).message}`);
    }

    this.pendingBusinessCard = null;
    this.uiPhase = 'market';
    this.refreshAll();
  }

  private onEventCardClick(card: EventCard): void {
    if (this.uiPhase !== 'market') return;

    const legality = canPurchaseEvent(this.state, card.id);
    if (!legality.legal) {
      this.instructionText.setText(`Cannot buy event: ${legality.reason ?? 'unknown'}`);
      return;
    }

    console.debug('[MS] onEventCardClick: attempting BuyEvent', { cardId: card.id, coinsBefore: this.state.resourceBank.coins, marketBefore: this.state.market.investments.map(c=>c.id) });
    try {
      const cmd = new BuyEventCommand(this.state, card.id);
      this.undoManager.execute(cmd);
      try { recordMainStreetEvent({ type: 'action', turn: this.state.turn, action: { type: 'buy-event', cardId: card.id }, description: cmd.description }); } catch (_) {}
      this.instructionText.setText(`Bought event: "${card.name}"`);
      console.debug('[MS] BuyEvent executed', { coinsAfter: this.state.resourceBank.coins, heldEvent: this.state.heldEvent?.id ?? null, marketAfter: this.state.market.investments.map(c=>c.id) });
    } catch (e) {
      console.error('[MS] BuyEvent failed', e);
      this.instructionText.setText(`Error: ${(e as Error).message}`);
    }

    this.refreshAll();
  }

  private onUpgradeCardClick(card: UpgradeCard): void {
    if (this.uiPhase !== 'market') return;

    const legality = canPurchaseUpgrade(this.state, card.id);
    if (!legality.legal) {
      this.instructionText.setText(`Cannot buy upgrade: ${legality.reason ?? 'unknown'}`);
      return;
    }

    // Determine which business slot this upgrade targets (first eligible match)
    const targetSlot = findTargetBusinessSlot(this.state, card);

    // If there are multiple upgrade branches for that business, show a choice modal
    const branches = getUpgradeBranchesForBusiness(this.state, targetSlot);
    if (branches.length > 1) {
      this.showUpgradeChoiceModal(branches, targetSlot);
      return;
    }

    // Single upgrade available — apply immediately with the resolved slot
    console.debug('[MS] onUpgradeCardClick: attempting BuyUpgrade', { cardId: card.id, targetSlot, coinsBefore: this.state.resourceBank.coins, marketBefore: this.state.market.investments.map(c=>c.id), streetBefore: this.state.streetGrid.map(s=>s?.id ?? null) });
    try {
      const cmd = new BuyUpgradeCommand(this.state, card.id, targetSlot);
      this.undoManager.execute(cmd);
      try { recordMainStreetEvent({ type: 'action', turn: this.state.turn, action: { type: 'buy-upgrade', cardId: card.id, targetSlot }, description: cmd.description }); } catch (_) {}
      this.instructionText.setText(`Applied upgrade: "${card.name}"`);
      console.debug('[MS] BuyUpgrade executed', { coinsAfter: this.state.resourceBank.coins, marketAfter: this.state.market.investments.map(c=>c.id), streetAfter: this.state.streetGrid.map(s=>s?.id ?? null) });
    } catch (e) {
      console.error('[MS] BuyUpgrade failed', e);
      this.instructionText.setText(`Error: ${(e as Error).message}`);
    }

    this.refreshAll();
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
  private showUpgradeChoiceModal(branches: UpgradeCard[], targetSlot: number): void {
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

        try {
          this.undoManager.execute(new BuyUpgradeCommand(this.state, branch.id, targetSlot));
          this.instructionText.setText(`Applied upgrade: "${branch.name}"`);
        } catch (e) {
          this.instructionText.setText(`Error: ${(e as Error).message}`);
        }
        this.refreshAll();
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
