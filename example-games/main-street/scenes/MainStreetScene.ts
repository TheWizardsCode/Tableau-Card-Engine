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
  MARKET_EVENT_SLOTS,
  MARKET_UPGRADE_SLOTS,
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
// Market (y 240-540): 3 rows (business, event, upgrade)
// Actions (y 560-710): instruction text + action buttons

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

// Action area
const INSTRUCTION_Y = 580;
const ACTION_Y = 640;

// Section box styling
const BOX_STROKE = 0x665544;
const BOX_FILL = 0x2a1f14;
const BOX_RADIUS = 6;

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
  private actionContainer!: Phaser.GameObjects.Container;

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
          'Buy day events for one-time effects.\n' +
          'Earn coins and reputation each turn to reach the score threshold.',
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
    this.actionContainer = this.add.container(0, 0);
  }

  private createInstructions(): void {
    this.instructionText = this.add
      .text(GAME_W / 2, INSTRUCTION_Y, '', {
        fontSize: '16px',
        color: '#ccaa77',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
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
            (result.nightEvent ? ` | Night: ${result.nightEvent.name}` : ''),
          );
        } else if (result.nightEvent) {
          this.instructionText.setText(`Night: ${result.nightEvent.name}`);
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
    this.refreshActionButtons();
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

    // Section background
    const totalH = 3 * MARKET_ROW_H + 2 * MARKET_ROW_GAP + 20;
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

    // Event row
    this.drawMarketRow(
      MARKET_TOP + 6 + MARKET_ROW_H + MARKET_ROW_GAP,
      'Events',
      this.state.market.event,
      MARKET_EVENT_SLOTS,
      (card) => this.onEventCardClick(card as EventCard),
    );

    // Upgrade row
    this.drawMarketRow(
      MARKET_TOP + 6 + 2 * (MARKET_ROW_H + MARKET_ROW_GAP),
      'Upgrades',
      this.state.market.upgrade,
      MARKET_UPGRADE_SLOTS,
      (card) => this.onUpgradeCardClick(card as UpgradeCard),
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
    const deckKey = rowLabel === 'Business' ? 'business' : rowLabel === 'Events' ? 'event' : 'upgrade';
    const deckCount = this.state.decks[deckKey].length;
    const deckX = startX + maxSlots * (MARKET_CARD_W + MARKET_CARD_GAP) + 10;
    const deckText = this.add.text(deckX, y + MARKET_CARD_H / 2, `Deck: ${deckCount}`, {
      fontSize: '12px', color: '#776655', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    this.marketContainer.add(deckText);
  }

  private drawMarketCard(
    x: number,
    y: number,
    card: BusinessCard | EventCard | UpgradeCard,
    onClick: (card: BusinessCard | EventCard | UpgradeCard) => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x + MARKET_CARD_W / 2, y + MARKET_CARD_H / 2);

    // Determine card color
    let fillColor = 0x333322;
    if (card.family === 'business') {
      fillColor = synergyColor((card as BusinessCard).synergyTypes[0]);
    } else if (card.family === 'event') {
      fillColor = 0x8B4513;  // Brown for events
    } else if (card.family === 'upgrade') {
      fillColor = 0x6B4C9A;  // Purple for upgrades
    }

    // Background
    const bg = this.add.rectangle(0, 0, MARKET_CARD_W, MARKET_CARD_H, fillColor, 0.7);
    bg.setStrokeStyle(1, 0x888877);
    container.add(bg);

    // Card label (name + cost for business/upgrade)
    const labelStr = cardLabel(card);
    const nameText = this.add.text(0, -MARKET_CARD_H / 2 + 10, labelStr, {
      fontSize: '12px', fontStyle: 'bold', color: '#ffffff', fontFamily: FONT_FAMILY,
      wordWrap: { width: MARKET_CARD_W - 12 },
      align: 'center',
    }).setOrigin(0.5, 0);
    container.add(nameText);

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
      fontSize: '11px', color: '#ddddcc', fontFamily: FONT_FAMILY,
      wordWrap: { width: MARKET_CARD_W - 12 },
      align: 'center',
    }).setOrigin(0.5, 1);
    container.add(infoText);

    // Interactivity (only during market phase)
    if (this.uiPhase === 'market') {
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

  // ── Action buttons ──────────────────────────────────────

  private refreshActionButtons(): void {
    this.actionContainer.removeAll(true);

    if (this.uiPhase === 'market') {
      const centerX = GAME_W / 2;
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

      const summary = this.add.text(centerX, by - 8, summaryStr, {
        fontSize: '13px', color: '#887766', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5, 1);
      this.actionContainer.add(summary);

      // End Turn button
      const endBtn = this.createActionButton(centerX - 80, by + 8, 160, 'End Turn', () => {
        this.endTurn();
      });
      this.actionContainer.add(endBtn);

    } else if (this.uiPhase === 'placing-business') {
      const centerX = GAME_W / 2;
      const by = ACTION_Y;

      const cardName = this.pendingBusinessCard?.name ?? '???';
      const hint = this.add.text(centerX, by - 8, `Place "${cardName}" -- click an empty slot`, {
        fontSize: '15px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5, 1);
      this.actionContainer.add(hint);

      // Cancel button
      const cancelBtn = this.createActionButton(centerX - 80, by + 8, 160, 'Cancel', () => {
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

  // ── Game Over Overlay ───────────────────────────────────

  private showGameOverOverlay(result: TurnResult): void {
    this.uiPhase = 'game-over';
    this.refreshAll();

    const isWin = result.gameResult === 'win';
    const title = isWin ? 'You Win!' : 'Game Over';
    const color = isWin ? '#44ff44' : '#ff4444';

    // Overlay background
    const overlay = createOverlayBackground(
      this,
      { depth: 100, alpha: 0.75 },
      { width: 500, height: 320, alpha: 0.95 },
    );
    this.overlayObjects.push(...overlay.objects);

    // Title
    const titleText = this.add.text(GAME_W / 2, GAME_H / 2 - 120, title, {
      fontSize: '36px', fontStyle: 'bold', color, fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(101);
    this.overlayObjects.push(titleText);

    // End reason
    const reason = this.state.endReason ?? 'unknown';
    const reasonText = this.add.text(
      GAME_W / 2, GAME_H / 2 - 70,
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
    const breakdown = this.add.text(GAME_W / 2, GAME_H / 2 - 20, lines.join('\n'), {
      fontSize: '16px', color: '#ddccbb', fontFamily: FONT_FAMILY,
      align: 'center', lineSpacing: 6,
    }).setOrigin(0.5, 0).setDepth(101);
    this.overlayObjects.push(breakdown);

    // Buttons
    const playAgainBtn = createOverlayButton(
      this, GAME_W / 2 - 110, GAME_H / 2 + 110,
      '[ Play Again ]', 101,
    );
    playAgainBtn.on('pointerdown', () => {
      dismissOverlay(this.overlayObjects);
      this.overlayObjects = [];
      this.scene.restart();
    });
    this.overlayObjects.push(playAgainBtn);

    const menuBtn = createOverlayMenuButton(
      this, GAME_W / 2 + 30, GAME_H / 2 + 110, 101,
    );
    this.overlayObjects.push(menuBtn);
  }
}
