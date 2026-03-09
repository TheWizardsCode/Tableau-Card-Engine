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
 *   - Game-over overlay with score and replay/menu buttons
 *   - Help panel and settings integration
 */

import type { MainStreetState } from '../MainStreetState';
import { setupMainStreetGame } from '../MainStreetState';
import type { BusinessCard, EventCard, UpgradeCard } from '../MainStreetCards';
import {
  GRID_SIZE,
  MAX_TURNS,
  synergyColor,
  cardLabel,
  MARKET_BUSINESS_SLOTS,
  MARKET_INVESTMENT_SLOTS,
  INCIDENT_QUEUE_SIZE,
} from '../MainStreetCards';
import {
  executeAction,
  executeDayStart,
  processEndOfTurn,
  computeScore,
  type PlayerAction,
  type TurnResult,
} from '../MainStreetEngine';
import {
  getAffordableBusinessCards,
  getAffordableUpgradeCards,
  getEmptySlots,
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

// ── Constants ───────────────────────────────────────────────

/** Background colour for Main Street (warm town feel). */
const BG_COLOR = '#2a1f14';

// ── Layout regions ──────────────────────────────────────────
// Canvas is 1280 x 720.
//
// Top bar (y 0-40):  header (title + menu button)
// HUD band (y 44-78):  Turn/phase, coins, reputation, score
// Street (y 90-220):  10 grid slots, horizontally centered
// Market (y 240-440): 2 rows (business, investments)
// Incident queue (y 450-530): face-up upcoming incidents
// Bottom bar (y 550-710): player hand (left), actions (right)

const HUD_Y = 50;

// Street grid
const STREET_TOP = 100;
const SLOT_W = 105;
const SLOT_H = 110;
const SLOT_GAP = 10;
const STREET_TOTAL_W = GRID_SIZE * SLOT_W + (GRID_SIZE - 1) * SLOT_GAP;
const STREET_X = (GAME_W - STREET_TOTAL_W) / 2;

// Market
const MARKET_TOP = 240;
const MARKET_ROW_H = 90;
const MARKET_ROW_GAP = 10;
const MARKET_CARD_W = 140;
const MARKET_CARD_H = 80;
const MARKET_CARD_GAP = 12;
const MARKET_LABEL_W = 90;

// Incident queue (below market)
const QUEUE_TOP = 455;
const QUEUE_CARD_W = 140;
const QUEUE_CARD_H = 70;
const QUEUE_CARD_GAP = 12;
const QUEUE_LABEL_W = MARKET_LABEL_W;

// Player hand (bottom-left)
const HAND_Y = 570;
const HAND_CARD_W = 150;
const HAND_CARD_H = 90;

// Action area (right-aligned)
const INSTRUCTION_Y = 580;
const ACTION_Y = 640;

// Section box styling
const BOX_STROKE = 0x665544;
const BOX_FILL = 0x2a1f14;
const BOX_RADIUS = 6;

// Activity Log panel layout
const LOG_X = 810;
const LOG_Y = 240;
const LOG_W = 440;
const LOG_H = 290;
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

// Challenge Tracker panel layout (bottom section, between hand and actions)
const CHALLENGE_X = 230;
const CHALLENGE_Y = 550;
const CHALLENGE_W = 560;
const CHALLENGE_LINE_H = 20;
const CHALLENGE_PAD = 6;
const CHALLENGE_TITLE_H = 20;

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

  // Pending selection for placing a business
  private pendingBusinessCard: BusinessCard | null = null;

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

  constructor() {
    super({ key: 'MainStreetScene' });
  }

  // ── Create ──────────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor(BG_COLOR);

    // Reset
    this.uiPhase = 'idle';
    this.pendingBusinessCard = null;
    this.overlayObjects = [];

    this.detectReplayMode();
    this.initEventSystem();

    // Sound (re-use existing audio assets)
    this.initSoundSystem([], {});

    // Game setup
    this.state = setupMainStreetGame({ seed: 'main-street-demo' });

    // UI scaffolding
    this.createHeader();
    this.createContainers();
    this.createInstructions();

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
          'Each run selects 3 random challenges for you to complete.\n' +
          'Challenges have goals like earning coins, placing businesses,\n' +
          'or building synergy combos. Progress is checked at the end of\n' +
          'each turn -- once completed, a challenge stays completed.\n' +
          'Each completed challenge adds 10 bonus points to your score.\n' +
          'Complete all 3 challenges to win immediately!\n' +
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
          'Commerce (green) -- shops, services',
      },
      {
        heading: 'Win / Loss',
        body:
          `Reach ${150} points to win (coins + reputation*5 + challenges*10).\n` +
          'Complete all 3 challenges for an instant win.\n' +
          `Survive ${MAX_TURNS} turns with positive reputation for a turn-limit victory.\n` +
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

  private createContainers(): void {
    this.hudContainer = this.add.container(0, 0);
    this.streetContainer = this.add.container(0, 0);
    this.marketContainer = this.add.container(0, 0);
    this.incidentQueueContainer = this.add.container(0, 0);
    this.handContainer = this.add.container(0, 0);
    this.actionContainer = this.add.container(0, 0);

    // Challenge Tracker panel
    this.challengeContainer = this.add.container(CHALLENGE_X, CHALLENGE_Y);

    // Activity Log panel (persistent, not rebuilt each refresh)
    this.logContainer = this.add.container(LOG_X, LOG_Y);

    // Panel background
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1408, 0.85);
    bg.fillRoundedRect(0, 0, LOG_W, LOG_H, 4);
    bg.lineStyle(1, BOX_STROKE, 0.5);
    bg.strokeRoundedRect(0, 0, LOG_W, LOG_H, 4);
    this.logContainer.add(bg);

    // Title bar
    const titleBg = this.add.graphics();
    titleBg.fillStyle(0x332816, 0.9);
    titleBg.fillRoundedRect(0, 0, LOG_W, LOG_TITLE_H, { tl: 4, tr: 4, bl: 0, br: 0 });
    this.logContainer.add(titleBg);

    const titleText = this.add.text(LOG_W / 2, LOG_TITLE_H / 2, 'Activity Log', {
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
    this.input.on('wheel', this.handleLogWheel, this);
  }

  private createInstructions(): void {
    this.instructionText = this.add
      .text(GAME_W - 40, INSTRUCTION_Y, '', {
        fontSize: '16px',
        color: '#ccaa77',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(1, 0.5);
  }

  // ── Day flow ────────────────────────────────────────────

  private startDayPhase(): void {
    // Execute DayStart (refills market, transitions to MarketPhase)
    executeDayStart(this.state);
    this.uiPhase = 'market';
    this.refreshAll();
    this.instructionText.setText(
      `Turn ${this.state.turn} / ${MAX_TURNS} -- Buy cards from the market or End Turn`,
    );
  }

  private endTurn(): void {
    this.uiPhase = 'animating';
    this.instructionText.setText('Processing end of turn...');
    this.refreshActionButtons();

    // Process end-of-turn phases (events, income, night, end check)
    const result: TurnResult = processEndOfTurn(this.state);

    // Brief delay then show result / advance
    this.time.delayedCall(400, () => {
      if (result.gameResult !== 'playing') {
        this.showGameOverOverlay(result);
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

    // Background strip
    const strip = this.add.rectangle(GAME_W / 2, HUD_Y, GAME_W - 40, 28, 0x1a1408, 0.6);
    strip.setStrokeStyle(1, BOX_STROKE, 0.5);
    this.hudContainer.add(strip);

    // Turn
    const turnText = this.add.text(40, HUD_Y, `Turn ${this.state.turn}/${MAX_TURNS}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ffdd88', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.hudContainer.add(turnText);

    // Phase
    const phaseText = this.add.text(200, HUD_Y, `Phase: ${this.state.phase}`, {
      fontSize: '14px', color: '#aa9977', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.hudContainer.add(phaseText);

    // Coins
    const coinText = this.add.text(GAME_W / 2 - 100, HUD_Y, `Coins: ${coins}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ffcc44', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.hudContainer.add(coinText);

    // Reputation
    const repText = this.add.text(GAME_W / 2 + 50, HUD_Y, `Rep: ${reputation}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#88bbff', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.hudContainer.add(repText);

    // Score
    const scoreText = this.add.text(GAME_W - 40, HUD_Y, `Score: ${score}`, {
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

    // Panel background
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1408, 0.85);
    bg.fillRoundedRect(0, 0, CHALLENGE_W, panelH, 4);
    bg.lineStyle(1, BOX_STROKE, 0.5);
    bg.strokeRoundedRect(0, 0, CHALLENGE_W, panelH, 4);
    this.challengeContainer.add(bg);

    // Title bar
    const titleBg = this.add.graphics();
    titleBg.fillStyle(0x332816, 0.9);
    titleBg.fillRoundedRect(0, 0, CHALLENGE_W, CHALLENGE_TITLE_H, { tl: 4, tr: 4, bl: 0, br: 0 });
    this.challengeContainer.add(titleBg);

    const completedCount = challenges.filter(ac => ac.completed).length;
    const titleText = this.add.text(
      CHALLENGE_W / 2, CHALLENGE_TITLE_H / 2,
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
        CHALLENGE_W * 0.42, yOff,
        ac.challenge.description,
        {
          fontSize: '10px',
          color: isComplete ? '#558855' : '#998877',
          fontFamily: FONT_FAMILY,
          wordWrap: { width: CHALLENGE_W * 0.56 },
        },
      ).setOrigin(0, 0);
      this.challengeContainer.add(descText);

      yOff += CHALLENGE_LINE_H;
    }
  }

  // ── Street Grid ─────────────────────────────────────────

  private refreshStreetGrid(): void {
    this.streetContainer.removeAll(true);

    // Section label
    const label = this.add.text(GAME_W / 2, STREET_TOP - 16, 'Your Street', {
      fontSize: '14px', fontStyle: 'bold', color: '#aa9966', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 1);
    this.streetContainer.add(label);

    for (let i = 0; i < GRID_SIZE; i++) {
      const x = STREET_X + i * (SLOT_W + SLOT_GAP);
      const y = STREET_TOP;
      const biz = this.state.streetGrid[i];

      if (biz) {
        this.drawBusinessSlot(x, y, i, biz);
      } else {
        this.drawEmptySlot(x, y, i);
      }
    }
  }

  private drawBusinessSlot(x: number, y: number, _index: number, biz: BusinessCard): void {
    const primaryColor = synergyColor(biz.synergyTypes[0]);

    // Card background
    const bg = this.add.rectangle(
      x + SLOT_W / 2, y + SLOT_H / 2,
      SLOT_W, SLOT_H, primaryColor, 0.7,
    );
    bg.setStrokeStyle(2, 0xffffff, 0.4);
    this.streetContainer.add(bg);

    // Name
    const nameText = this.add.text(x + SLOT_W / 2, y + 12, biz.name, {
      fontSize: '12px', fontStyle: 'bold', color: '#ffffff', fontFamily: FONT_FAMILY,
      wordWrap: { width: SLOT_W - 8 },
      align: 'center',
    }).setOrigin(0.5, 0);
    this.streetContainer.add(nameText);

    // Income
    const income = biz.baseIncome + biz.incomeBonus;
    const incText = this.add.text(x + SLOT_W / 2, y + SLOT_H - 30, `+${income}/turn`, {
      fontSize: '13px', color: '#ffee88', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 0);
    this.streetContainer.add(incText);

    // Level
    if (biz.level > 0) {
      const lvlText = this.add.text(x + SLOT_W - 6, y + 4, `Lv${biz.level}`, {
        fontSize: '11px', color: '#ffdd44', fontFamily: FONT_FAMILY,
      }).setOrigin(1, 0);
      this.streetContainer.add(lvlText);
    }

    // Synergy label at bottom
    const synLabel = biz.synergyTypes.join('/');
    const synText = this.add.text(x + SLOT_W / 2, y + SLOT_H - 12, synLabel, {
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
    const isSelectable = this.uiPhase === 'placing-business';
    const fillAlpha = isSelectable ? 0.4 : 0.2;
    const strokeColor = isSelectable ? 0xffdd44 : 0x555544;

    const bg = this.add.rectangle(
      x + SLOT_W / 2, y + SLOT_H / 2,
      SLOT_W, SLOT_H, 0x333322, fillAlpha,
    );
    bg.setStrokeStyle(isSelectable ? 2 : 1, strokeColor);
    this.streetContainer.add(bg);

    // Slot number
    const idxText = this.add.text(x + SLOT_W / 2, y + SLOT_H / 2, `${index}`, {
      fontSize: '18px', color: isSelectable ? '#ffdd44' : '#666655',
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

    // Section background (2 rows: business + investments)
    const totalH = 2 * MARKET_ROW_H + MARKET_ROW_GAP + 20;
    const bgBox = this.add.graphics();
    bgBox.fillStyle(BOX_FILL, 0.3);
    bgBox.fillRoundedRect(20, MARKET_TOP - 10, GAME_W - 40, totalH, BOX_RADIUS);
    bgBox.lineStyle(1, BOX_STROKE, 0.4);
    bgBox.strokeRoundedRect(20, MARKET_TOP - 10, GAME_W - 40, totalH, BOX_RADIUS);
    this.marketContainer.add(bgBox);

    const sectionLabel = this.add.text(GAME_W / 2, MARKET_TOP - 4, 'Market', {
      fontSize: '13px', fontStyle: 'bold', color: '#887766', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 1);
    this.marketContainer.add(sectionLabel);

    // Business row
    this.drawMarketRow(
      MARKET_TOP + 6,
      'Business',
      this.state.market.business,
      MARKET_BUSINESS_SLOTS,
      (card) => this.onBusinessCardClick(card as BusinessCard),
    );

    // Investments row (mixed upgrades + investment events)
    this.drawMarketRow(
      MARKET_TOP + 6 + MARKET_ROW_H + MARKET_ROW_GAP,
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
    // Row label
    const label = this.add.text(40, y + MARKET_CARD_H / 2, rowLabel, {
      fontSize: '14px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.marketContainer.add(label);

    const startX = MARKET_LABEL_W + 50;

    for (let i = 0; i < maxSlots; i++) {
      const cx = startX + i * (MARKET_CARD_W + MARKET_CARD_GAP);
      const card = cards[i];

      if (card) {
        const cardObj = this.drawMarketCard(cx, y, card, onClick);
        this.marketContainer.add(cardObj);
      } else {
        // Empty slot
        const empty = this.add.rectangle(
          cx + MARKET_CARD_W / 2, y + MARKET_CARD_H / 2,
          MARKET_CARD_W, MARKET_CARD_H, 0x222211, 0.3,
        );
        empty.setStrokeStyle(1, 0x333322);
        this.marketContainer.add(empty);
      }
    }

    // Deck count (right side)
    const deckX = startX + maxSlots * (MARKET_CARD_W + MARKET_CARD_GAP) + 10;
    if (rowLabel === 'Business') {
      const deckCount = this.state.decks.business.length;
      const deckText = this.add.text(deckX, y + MARKET_CARD_H / 2, `Deck: ${deckCount}`, {
        fontSize: '12px', color: '#776655', fontFamily: FONT_FAMILY,
      }).setOrigin(0, 0.5);
      this.marketContainer.add(deckText);
    } else {
      // Investments row: show both upgrade and event deck counts
      const upgCount = this.state.decks.upgrade.length;
      const evtCount = this.state.decks.event.length;
      const deckText = this.add.text(
        deckX, y + MARKET_CARD_H / 2,
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
    const container = this.add.container(x + MARKET_CARD_W / 2, y + MARKET_CARD_H / 2);

    // Determine if this is a non-purchasable Incident event
    const isIncidentEvent = card.family === 'event' && (card as EventCard).trigger === 'Incident';

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
    const bg = this.add.rectangle(0, 0, MARKET_CARD_W, MARKET_CARD_H, fillColor, fillAlpha);
    bg.setStrokeStyle(1, isIncidentEvent ? 0x556688 : 0x888877);
    container.add(bg);

    // Card label (name + cost for business/upgrade)
    const labelStr = cardLabel(card);
    const nameText = this.add.text(0, -MARKET_CARD_H / 2 + 10, labelStr, {
      fontSize: '12px', fontStyle: 'bold',
      color: isIncidentEvent ? '#8899bb' : '#ffffff',
      fontFamily: FONT_FAMILY,
      wordWrap: { width: MARKET_CARD_W - 12 },
      align: 'center',
    }).setOrigin(0.5, 0);
    container.add(nameText);

    // Trigger label for event cards (top-right corner)
    if (card.family === 'event') {
      const evt = card as EventCard;
      const triggerColor = isIncidentEvent ? '#6688bb' : '#cc9944';
      const triggerLabel = this.add.text(
        MARKET_CARD_W / 2 - 4, -MARKET_CARD_H / 2 + 4,
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

    const infoText = this.add.text(0, MARKET_CARD_H / 2 - 18, infoStr, {
      fontSize: '11px', color: isIncidentEvent ? '#7788aa' : '#ddddcc',
      fontFamily: FONT_FAMILY,
      wordWrap: { width: MARKET_CARD_W - 12 },
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
        bg.setStrokeStyle(1, 0x888877);
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

    // Section background
    const queueW = QUEUE_LABEL_W + INCIDENT_QUEUE_SIZE * (QUEUE_CARD_W + QUEUE_CARD_GAP) + 100;
    const queueH = QUEUE_CARD_H + 24;
    const bgBox = this.add.graphics();
    bgBox.fillStyle(0x1a1830, 0.35);
    bgBox.fillRoundedRect(20, QUEUE_TOP - 10, queueW, queueH, BOX_RADIUS);
    bgBox.lineStyle(1, 0x445577, 0.5);
    bgBox.strokeRoundedRect(20, QUEUE_TOP - 10, queueW, queueH, BOX_RADIUS);
    this.incidentQueueContainer.add(bgBox);

    // Section label
    const label = this.add.text(40, QUEUE_TOP + QUEUE_CARD_H / 2 - 2, 'Upcoming\nIncidents', {
      fontSize: '13px', fontStyle: 'bold', color: '#7788aa', fontFamily: FONT_FAMILY,
      align: 'center',
    }).setOrigin(0, 0.5);
    this.incidentQueueContainer.add(label);

    const startX = QUEUE_LABEL_W + 50;

    for (let i = 0; i < INCIDENT_QUEUE_SIZE; i++) {
      const cx = startX + i * (QUEUE_CARD_W + QUEUE_CARD_GAP);
      const card = queue[i];

      if (card) {
        const cardContainer = this.drawIncidentCard(cx, QUEUE_TOP, card);
        this.incidentQueueContainer.add(cardContainer);
      } else {
        // Empty queue slot
        const empty = this.add.rectangle(
          cx + QUEUE_CARD_W / 2, QUEUE_TOP + QUEUE_CARD_H / 2,
          QUEUE_CARD_W, QUEUE_CARD_H, 0x111122, 0.3,
        );
        empty.setStrokeStyle(1, 0x223344);
        this.incidentQueueContainer.add(empty);
      }
    }

    // Deck count
    const deckX = startX + INCIDENT_QUEUE_SIZE * (QUEUE_CARD_W + QUEUE_CARD_GAP) + 10;
    const deckText = this.add.text(deckX, QUEUE_TOP + QUEUE_CARD_H / 2, `Deck: ${deckRemaining}`, {
      fontSize: '11px', color: '#556677', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.incidentQueueContainer.add(deckText);
  }

  private drawIncidentCard(
    x: number,
    y: number,
    card: EventCard,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x + QUEUE_CARD_W / 2, y + QUEUE_CARD_H / 2);

    // Indigo background (non-interactive)
    const bg = this.add.rectangle(0, 0, QUEUE_CARD_W, QUEUE_CARD_H, 0x2B3A67, 0.5);
    bg.setStrokeStyle(1, 0x556688);
    container.add(bg);

    // Card name
    const nameText = this.add.text(0, -QUEUE_CARD_H / 2 + 8, cardLabel(card), {
      fontSize: '11px', fontStyle: 'bold', color: '#8899bb',
      fontFamily: FONT_FAMILY,
      wordWrap: { width: QUEUE_CARD_W - 12 },
      align: 'center',
    }).setOrigin(0.5, 0);
    container.add(nameText);

    // Effect summary
    const parts: string[] = [];
    if (card.coinDelta !== 0) parts.push(`${card.coinDelta > 0 ? '+' : ''}${card.coinDelta} coins`);
    if (card.reputationDelta !== 0) parts.push(`${card.reputationDelta > 0 ? '+' : ''}${card.reputationDelta} rep`);
    const infoStr = parts.join(', ') || card.effect;

    const infoText = this.add.text(0, QUEUE_CARD_H / 2 - 12, infoStr, {
      fontSize: '10px', color: '#7788aa',
      fontFamily: FONT_FAMILY,
      wordWrap: { width: QUEUE_CARD_W - 12 },
      align: 'center',
    }).setOrigin(0.5, 1);
    container.add(infoText);

    return container;
  }

  // ── Player Hand ────────────────────────────────────────────

  private refreshPlayerHand(): void {
    this.handContainer.removeAll(true);

    const held = this.state.heldEvent;

    // Section label
    const label = this.add.text(40, HAND_Y - 10, 'Your Hand', {
      fontSize: '13px', fontStyle: 'bold', color: '#aa9944', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 1);
    this.handContainer.add(label);

    if (held) {
      const cardContainer = this.drawHeldEventCard(40, HAND_Y, held);
      this.handContainer.add(cardContainer);
    } else {
      // Empty hand slot
      const empty = this.add.rectangle(
        40 + HAND_CARD_W / 2, HAND_Y + HAND_CARD_H / 2,
        HAND_CARD_W, HAND_CARD_H, 0x222211, 0.2,
      );
      empty.setStrokeStyle(1, 0x333322, 0.4);
      this.handContainer.add(empty);

      const emptyText = this.add.text(
        40 + HAND_CARD_W / 2, HAND_Y + HAND_CARD_H / 2,
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
    const container = this.add.container(x + HAND_CARD_W / 2, y + HAND_CARD_H / 2);

    // Warm brown background (Investment)
    const bg = this.add.rectangle(0, 0, HAND_CARD_W, HAND_CARD_H, 0x8B4513, 0.7);
    bg.setStrokeStyle(2, 0xcc9944);
    container.add(bg);

    // Card name
    const nameText = this.add.text(0, -HAND_CARD_H / 2 + 10, cardLabel(card), {
      fontSize: '12px', fontStyle: 'bold', color: '#ffffff',
      fontFamily: FONT_FAMILY,
      wordWrap: { width: HAND_CARD_W - 12 },
      align: 'center',
    }).setOrigin(0.5, 0);
    container.add(nameText);

    // Effect summary
    const parts: string[] = [];
    if (card.coinDelta !== 0) parts.push(`${card.coinDelta > 0 ? '+' : ''}${card.coinDelta} coins`);
    if (card.reputationDelta !== 0) parts.push(`${card.reputationDelta > 0 ? '+' : ''}${card.reputationDelta} rep`);
    const infoStr = parts.join(', ') || card.effect;

    const infoText = this.add.text(0, HAND_CARD_H / 2 - 14, infoStr, {
      fontSize: '11px', color: '#ddddcc',
      fontFamily: FONT_FAMILY,
      wordWrap: { width: HAND_CARD_W - 12 },
      align: 'center',
    }).setOrigin(0.5, 1);
    container.add(infoText);

    // "Click to play" hint
    const hint = this.add.text(0, HAND_CARD_H / 2 - 2, 'Click to play', {
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
        bg.setStrokeStyle(2, 0xcc9944);
        container.setScale(1.0);
      });
    }

    return container;
  }

  private onPlayHeldEvent(): void {
    if (this.uiPhase !== 'market') return;
    if (!this.state.heldEvent) return;

    const action: PlayerAction = { type: 'play-event' };
    try {
      executeAction(this.state, action);
      this.instructionText.setText('Played held Investment event!');
    } catch (e) {
      this.instructionText.setText(`Error: ${(e as Error).message}`);
    }

    this.refreshAll();
  }

  // ── Action buttons ──────────────────────────────────────

  private refreshActionButtons(): void {
    this.actionContainer.removeAll(true);

    if (this.uiPhase === 'market') {
      const rightX = GAME_W - 40;
      const by = ACTION_Y;

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

      const summary = this.add.text(rightX, by - 8, summaryStr, {
        fontSize: '13px', color: '#887766', fontFamily: FONT_FAMILY,
      }).setOrigin(1, 1);
      this.actionContainer.add(summary);

      // End Turn button (right-aligned)
      const btnW = 160;
      const endBtn = this.createActionButton(rightX - btnW, by + 8, btnW, 'End Turn', () => {
        this.endTurn();
      });
      this.actionContainer.add(endBtn);

    } else if (this.uiPhase === 'placing-business') {
      const rightX = GAME_W - 40;
      const by = ACTION_Y;

      const cardName = this.pendingBusinessCard?.name ?? '???';
      const hint = this.add.text(rightX, by - 8, `Place "${cardName}" -- click an empty slot`, {
        fontSize: '15px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY,
      }).setOrigin(1, 1);
      this.actionContainer.add(hint);

      // Cancel button (right-aligned)
      const btnW = 160;
      const cancelBtn = this.createActionButton(rightX - btnW, by + 8, btnW, 'Cancel', () => {
        this.pendingBusinessCard = null;
        this.uiPhase = 'market';
        this.refreshAll();
        this.instructionText.setText(
          `Turn ${this.state.turn} / ${MAX_TURNS} -- Buy cards from the market or End Turn`,
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
    const btnH = 40;
    const container = this.add.container(x + width / 2, y + btnH / 2);

    const bg = this.add.rectangle(0, 0, width, btnH, 0x554422, 0.8);
    bg.setStrokeStyle(1, 0xaa8855);
    container.add(bg);

    const label = this.add.text(0, 0, text, {
      fontSize: '16px', fontStyle: 'bold', color: '#ffcc88', fontFamily: FONT_FAMILY,
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

  // ── Click handlers ──────────────────────────────────────

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

    const action: PlayerAction = {
      type: 'buy-business',
      cardId: this.pendingBusinessCard.id,
      slotIndex,
    };

    try {
      executeAction(this.state, action);
      this.instructionText.setText(
        `Placed "${this.pendingBusinessCard.name}" on slot ${slotIndex}`,
      );
    } catch (e) {
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

    const action: PlayerAction = { type: 'buy-event', cardId: card.id };
    try {
      executeAction(this.state, action);
      this.instructionText.setText(`Bought event: "${card.name}"`);
    } catch (e) {
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

    const action: PlayerAction = { type: 'buy-upgrade', cardId: card.id };
    try {
      executeAction(this.state, action);
      this.instructionText.setText(`Applied upgrade: "${card.name}"`);
    } catch (e) {
      this.instructionText.setText(`Error: ${(e as Error).message}`);
    }

    this.refreshAll();
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

    const contentW = LOG_W - LOG_PAD * 2;
    let yOff = 0;

    for (const entry of entries) {
      const color = LOG_COLORS[entry.type] ?? LOG_COLORS.neutral;
      const isTurnHeader = entry.type === 'turn-header';

      if (isTurnHeader) {
        // Subtle background bar for turn headers
        const barBg = this.add.graphics();
        barBg.fillStyle(0x443311, 0.5);
        barBg.fillRect(0, yOff, LOG_W, LOG_LINE_H);
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
    const visibleH = LOG_H - LOG_TITLE_H - 4;
    this.logMaxScroll = Math.max(0, this.logTotalContentH - visibleH);

    // Auto-scroll to bottom if we were already at the bottom
    if (hadAutoScroll && this.logMaxScroll > 0) {
      this.logScrollOffset = this.logMaxScroll;
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
      LOG_X,
      LOG_Y + LOG_TITLE_H,
      LOG_W,
      LOG_H - LOG_TITLE_H - 2,
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
      pointer.x < LOG_X || pointer.x > LOG_X + LOG_W ||
      pointer.y < LOG_Y || pointer.y > LOG_Y + LOG_H
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

  // ── Game Over Overlay ───────────────────────────────────

  private showGameOverOverlay(result: TurnResult): void {
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
    const panelH = 320 + challengeExtraH;

    // Overlay background
    const overlay = createOverlayBackground(
      this,
      { depth: 100, alpha: 0.75 },
      { width: 500, height: panelH, alpha: 0.95 },
    );
    this.overlayObjects.push(...overlay.objects);

    // Vertical anchor: centre of the panel
    const panelTop = GAME_H / 2 - panelH / 2;

    // Title
    const titleText = this.add.text(GAME_W / 2, panelTop + 30, title, {
      fontSize: '36px', fontStyle: 'bold', color, fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(101);
    this.overlayObjects.push(titleText);

    // End reason
    const reason = this.state.endReason ?? 'unknown';
    const reasonText = this.add.text(
      GAME_W / 2, panelTop + 72,
      reason.replace(/_/g, ' '),
      { fontSize: '18px', color: '#ccbbaa', fontFamily: FONT_FAMILY },
    ).setOrigin(0.5).setDepth(101);
    this.overlayObjects.push(reasonText);

    // Score breakdown
    const { coins, reputation } = this.state.resourceBank;
    const challenges = this.state.challengesCompleted.length;
    const lines = [
      `Coins: ${coins}`,
      `Reputation: ${reputation} (x5 = ${reputation * 5})`,
      `Challenges: ${challenges} (x10 = ${challenges * 10})`,
      `Final Score: ${result.finalScore}`,
    ];
    const breakdownY = panelTop + 110;
    const breakdown = this.add.text(GAME_W / 2, breakdownY, lines.join('\n'), {
      fontSize: '16px', color: '#ddccbb', fontFamily: FONT_FAMILY,
      align: 'center', lineSpacing: 6,
    }).setOrigin(0.5, 0).setDepth(101);
    this.overlayObjects.push(breakdown);

    // Per-challenge breakdown (below score breakdown)
    let challengeBottomY = breakdownY + 100; // approximate height of score breakdown text
    if (challengeLineCount > 0) {
      const sectionTitle = this.add.text(
        GAME_W / 2, challengeBottomY,
        'Challenge Details:',
        { fontSize: '14px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5, 0).setDepth(101);
      this.overlayObjects.push(sectionTitle);
      challengeBottomY += 22;

      for (const ac of activeChallenges) {
        const done = ac.completed;
        const icon = done ? '\u2713' : '\u2717'; // checkmark or cross
        const lineColor = done ? '#44ff44' : '#ff6666';
        const challengeLine = this.add.text(
          GAME_W / 2, challengeBottomY,
          `${icon}  ${ac.challenge.title}`,
          { fontSize: '13px', color: lineColor, fontFamily: FONT_FAMILY },
        ).setOrigin(0.5, 0).setDepth(101);
        this.overlayObjects.push(challengeLine);
        challengeBottomY += 20;
      }
    }

    // Buttons (positioned relative to panel bottom)
    const btnY = panelTop + panelH - 40;
    const playAgainBtn = createOverlayButton(
      this, GAME_W / 2 - 110, btnY,
      '[ Play Again ]', 101,
    );
    playAgainBtn.on('pointerdown', () => {
      dismissOverlay(this.overlayObjects);
      this.overlayObjects = [];
      this.scene.restart();
    });
    this.overlayObjects.push(playAgainBtn);

    const menuBtn = createOverlayMenuButton(
      this, GAME_W / 2 + 30, btnY, 101,
    );
    this.overlayObjects.push(menuBtn);
  }
}
