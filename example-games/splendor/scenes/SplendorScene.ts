/**
 * SplendorScene -- the main Phaser scene for Splendor.
 *
 * Implements the full visual interface:
 *   - Card market (3 tiers x 4 visible cards + deck backs)
 *   - Gem token supply (clickable to take tokens)
 *   - Noble tiles display
 *   - Player area (tokens, purchased cards, reserved cards, prestige)
 *   - AI area (summary info)
 *   - Turn action UI with phase-based state machine
 *   - Gem discard dialog when over 10 tokens
 *   - Game-over overlay with scores and replay/menu buttons
 *   - Help panel and settings panel integration
 */

import Phaser from 'phaser';
import type { GemColor, GemOrGold, DevelopmentCard, Tier } from '../SplendorCards';
import {
  GEM_COLORS,
  ALL_TOKEN_COLORS,
  tokenCount,
  totalTokens,
  gemAbbrev,
  gemDisplayName,
  formatCost,
} from '../SplendorCards';
import type {
  SplendorSession,
  TurnAction,
  TurnResult,
} from '../SplendorGame';
import {
  setupSplendorGame,
  executeTurn,
  discardTokens,
  getPrestige,
  getBonuses,
  canAfford,
  isGameOver,
  getWinnerIndex,
} from '../SplendorGame';
import { SplendorAiPlayer, GreedyStrategy } from '../AiStrategy';
import { GameEventEmitter } from '../../../src/core-engine/GameEventEmitter';
import { PhaserEventBridge } from '../../../src/core-engine/PhaserEventBridge';
import { SoundManager } from '../../../src/core-engine/SoundManager';
import type { SoundPlayer, EventSoundMapping } from '../../../src/core-engine/SoundManager';
import {
  HelpPanel, HelpButton,
  SettingsPanel, SettingsButton,
  GAME_W, GAME_H, FONT_FAMILY,
  createOverlayBackground, createOverlayButton, createOverlayMenuButton,
  createSceneTitle, createSceneMenuButton,
} from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import helpContent from '../help-content.json';

// ── Constants ───────────────────────────────────────────────

const ANIM_DURATION = 400;

// Gem color to hex fill
const GEM_FILL: Record<GemOrGold, number> = {
  emerald:  0x2ecc71,
  sapphire: 0x3498db,
  ruby:     0xe74c3c,
  diamond:  0xecf0f1,
  onyx:     0x2c3e50,
  gold:     0xf1c40f,
};

// Gem color to text color
const GEM_TEXT_COLOR: Record<GemOrGold, string> = {
  emerald:  '#ffffff',
  sapphire: '#ffffff',
  ruby:     '#ffffff',
  diamond:  '#2c3e50',
  onyx:     '#ffffff',
  gold:     '#2c3e50',
};

// ── Layout regions ──────────────────────────────────────────
// The game canvas is 1280 x 720. Layout is split into:
//   Top band (y 40–440):  Nobles | Card Market (3 tiers) | Token Supply
//   Bottom band (y 445–720): Player area (left) | AI summary (right) | Actions
//
// Horizontal zones (left to right):
//   Nobles:  X 10–78    (W 68)
//   Deck:    X 112–206  (tier labels at 112 + deck backs centred at 152)
//   Market:  X 200–828  (4 cards × 148 + 3 gaps × 12)
//   Supply:  X 847–903  (token circles r=28 centred at 875)
//   Labels:  X 917+     (gem names / counts)

// Noble tiles — left column
const NOBLE_X = 10;            // noble tiles X start
const NOBLE_Y = 55;            // below header row (avoids Menu button overlap)
const NOBLE_W = 68;            // noble tile width
const NOBLE_H = 72;            // noble tile height (5×72 + 4×8 = 392, fits in 405px)
const NOBLE_GAP = 8;           // vertical gap between nobles

// Card market — centre of the upper band
const MARKET_X = 200;          // left edge of first visible card
const MARKET_Y = 46;           // top of tier-3 row
const MARKET_CARD_W = 148;     // card width
const MARKET_CARD_H = 120;     // card height
const MARKET_CARD_GAP = 12;    // horizontal gap between cards
const MARKET_TIER_GAP = 10;    // vertical gap between tier rows

// Deck column sits just left of the market
const DECK_X = 152;            // fixed position clear of nobles (right edge ~78)

// Token supply — right column
const SUPPLY_X = 875;          // token supply circle centre X
const SUPPLY_Y = 55;           // first token Y (aligned with nobles/market)
const SUPPLY_TOKEN_R = 28;     // token circle radius
const SUPPLY_GAP = 66;         // vertical gap between tokens (spreads to Y≈385)

// Player area — full-width bottom band
const PLAYER_AREA_Y = 450;     // player area top (reclaimed from 460)
const PLAYER_AREA_X = 20;      // left margin

// AI summary — right side of bottom band
const AI_AREA_X = 680;         // AI area left edge
const AI_AREA_Y = PLAYER_AREA_Y;

// Divider between player and AI areas
const DIVIDER_X = 660;         // vertical divider line X

// Action buttons
const ACTION_Y = 685;

// ── Audio asset keys ────────────────────────────────────────

const SFX_KEYS = {
  TOKEN_TAKE: 'sfx-card-draw',
  CARD_PURCHASE: 'sfx-card-flip',
  CARD_RESERVE: 'sfx-card-draw',
  NOBLE_VISIT: 'sfx-score-reveal',
  TURN_CHANGE: 'sfx-turn-change',
  GAME_END: 'sfx-round-end',
  UI_CLICK: 'sfx-ui-click',
} as const;

// ── Turn phase ──────────────────────────────────────────────

type TurnPhase =
  | 'player-turn'       // Human must choose an action
  | 'selecting-tokens'  // Human is selecting tokens to take
  | 'discarding-tokens' // Human must discard excess tokens
  | 'animating'         // Animation / delay in progress
  | 'ai-turn'           // AI is thinking
  | 'game-over';        // Final overlay shown

// ── Scene ───────────────────────────────────────────────────

export class SplendorScene extends Phaser.Scene {
  // Game state
  private session!: SplendorSession;
  private aiPlayer!: SplendorAiPlayer;
  private turnPhase: TurnPhase = 'player-turn';

  // Token selection state
  private selectedTokens: GemColor[] = [];
  private discardSelection: Partial<Record<GemOrGold, number>> = {};
  private discardNeeded = 0;

  // Event system
  private gameEvents!: GameEventEmitter;
  private eventBridge!: PhaserEventBridge;
  private soundManager: SoundManager | null = null;

  // Display containers
  private marketContainer!: Phaser.GameObjects.Container;
  private nobleContainer!: Phaser.GameObjects.Container;
  private supplyContainer!: Phaser.GameObjects.Container;
  private playerContainer!: Phaser.GameObjects.Container;
  private aiContainer!: Phaser.GameObjects.Container;
  private actionContainer!: Phaser.GameObjects.Container;
  private discardContainer!: Phaser.GameObjects.Container;

  // UI text
  private instructionText!: Phaser.GameObjects.Text;
  private playerPrestigeText!: Phaser.GameObjects.Text;
  private aiPrestigeText!: Phaser.GameObjects.Text;

  // Help / settings panels
  private helpPanel!: HelpPanel;
  private helpButton!: HelpButton;
  private settingsPanel!: SettingsPanel;
  private settingsButton!: SettingsButton;

  // Overlay cleanup
  private overlayObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: 'SplendorScene' });
  }

  // ── Preload ─────────────────────────────────────────────

  preload(): void {
    this.load.audio(SFX_KEYS.TOKEN_TAKE, 'assets/audio/card-draw.wav');
    this.load.audio(SFX_KEYS.CARD_PURCHASE, 'assets/audio/card-flip.wav');
    this.load.audio(SFX_KEYS.NOBLE_VISIT, 'assets/audio/score-reveal.wav');
    this.load.audio(SFX_KEYS.TURN_CHANGE, 'assets/audio/turn-change.wav');
    this.load.audio(SFX_KEYS.GAME_END, 'assets/audio/round-end.wav');
    this.load.audio(SFX_KEYS.UI_CLICK, 'assets/audio/ui-click.wav');
  }

  // ── Create ──────────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');

    // Reset state
    this.turnPhase = 'player-turn';
    this.selectedTokens = [];
    this.discardSelection = {};
    this.discardNeeded = 0;
    this.overlayObjects = [];

    // Event system
    this.gameEvents = new GameEventEmitter();
    this.eventBridge = new PhaserEventBridge(this.gameEvents, this.events);

    // Sound system
    const phaserSound = this.sound;
    const player: SoundPlayer = {
      play: (key: string) => { phaserSound.play(key); },
      stop: (key: string) => { phaserSound.stopByKey(key); },
      setVolume: (v: number) => { phaserSound.volume = v; },
      setMute: (m: boolean) => { phaserSound.mute = m; },
    };
    this.soundManager = new SoundManager(player);
    for (const sfxKey of Object.values(SFX_KEYS)) {
      this.soundManager.register(sfxKey);
    }
    const mapping: EventSoundMapping = {
      'card-drawn': SFX_KEYS.TOKEN_TAKE,
      'turn-started': SFX_KEYS.TURN_CHANGE,
      'game-ended': SFX_KEYS.GAME_END,
    };
    this.soundManager.connectToEvents(this.gameEvents, mapping);

    // Setup game
    this.session = setupSplendorGame({
      playerCount: 2,
      playerNames: ['You', 'AI'],
      isAI: [false, true],
    });
    this.aiPlayer = new SplendorAiPlayer(GreedyStrategy);

    // Create UI
    this.createHeader();
    this.createContainers();
    this.createInstructions();
    this.createPrestigeDisplay();
    this.createHelpPanel();
    this.createSettingsPanel();

    // Initial render
    this.refreshAll();
    this.setPhase('player-turn');
  }

  // ── UI creation ─────────────────────────────────────────

  private createHeader(): void {
    createSceneMenuButton(this);
    createSceneTitle(this, 'Splendor');
  }

  private createContainers(): void {
    this.marketContainer = this.add.container(0, 0);
    this.nobleContainer = this.add.container(0, 0);
    this.supplyContainer = this.add.container(0, 0);
    this.playerContainer = this.add.container(0, 0);
    this.aiContainer = this.add.container(0, 0);
    this.actionContainer = this.add.container(0, 0);
    this.discardContainer = this.add.container(0, 0);
  }

  private createInstructions(): void {
    this.instructionText = this.add
      .text(GAME_W / 2, GAME_H - 16, '', {
        fontSize: '17px',
        color: '#88aa88',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  private createPrestigeDisplay(): void {
    // Prestige is now rendered inline in refreshPlayerArea / refreshAiArea
    // These text objects are updated by refreshPrestige() for mid-frame updates
    this.playerPrestigeText = this.add
      .text(0, 0, '', {
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#ffdd44',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0, 0)
      .setVisible(false);   // hidden; prestige shown inline

    this.aiPrestigeText = this.add
      .text(0, 0, '', {
        fontSize: '18px',
        color: '#aabbcc',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0, 0)
      .setVisible(false);   // hidden; prestige shown inline
  }

  private createHelpPanel(): void {
    this.helpPanel = new HelpPanel(this, {
      sections: helpContent as HelpSection[],
    });
    this.helpButton = new HelpButton(this, this.helpPanel);
  }

  private createSettingsPanel(): void {
    if (!this.soundManager) return;
    this.settingsPanel = new SettingsPanel(this, {
      soundManager: this.soundManager,
    });
    this.settingsButton = new SettingsButton(this, this.settingsPanel);
  }

  // ── Refresh display ─────────────────────────────────────

  private refreshAll(): void {
    this.refreshMarket();
    this.refreshNobles();
    this.refreshSupply();
    this.refreshPlayerArea();
    this.refreshAiArea();
    this.refreshPrestige();
    this.refreshActionButtons();
  }

  // ── Market display ──────────────────────────────────────

  private refreshMarket(): void {
    this.marketContainer.removeAll(true);

    const tiers: Tier[] = [3, 2, 1]; // Top to bottom: T3, T2, T1

    for (let row = 0; row < tiers.length; row++) {
      const tier = tiers[row];
      const y = MARKET_Y + row * (MARKET_CARD_H + MARKET_TIER_GAP);
      const market = this.session.market[tier];

      // Tier label (left of deck)
      const tierLabel = this.add.text(
        DECK_X - 40, y + MARKET_CARD_H / 2,
        `T${tier}`,
        { fontSize: '18px', fontStyle: 'bold', color: '#888888', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.marketContainer.add(tierLabel);

      // Deck back (shows remaining count)
      const deckCount = market.deck.length;
      const deckW = MARKET_CARD_W - 40;
      const deckH = MARKET_CARD_H - 16;
      const deckBg = this.add.rectangle(
        DECK_X, y + MARKET_CARD_H / 2,
        deckW, deckH,
        0x334433, deckCount > 0 ? 0.8 : 0.3,
      );
      deckBg.setStrokeStyle(1, 0x556655);
      this.marketContainer.add(deckBg);

      if (deckCount > 0) {
        const deckText = this.add.text(
          DECK_X, y + MARKET_CARD_H / 2,
          `${deckCount}`, { fontSize: '20px', fontStyle: 'bold', color: '#aaddaa', fontFamily: FONT_FAMILY },
        ).setOrigin(0.5);
        this.marketContainer.add(deckText);

        // Make deck clickable for reserve-from-deck
        if (this.turnPhase === 'player-turn') {
          deckBg.setInteractive({ useHandCursor: true });
          deckBg.on('pointerdown', () => this.onReserveDeck(tier));
          deckBg.on('pointerover', () => deckBg.setStrokeStyle(2, 0xffdd44));
          deckBg.on('pointerout', () => deckBg.setStrokeStyle(1, 0x556655));
        }
      }

      // Visible cards
      for (let col = 0; col < 4; col++) {
        const card = market.visible[col];
        const x = MARKET_X + col * (MARKET_CARD_W + MARKET_CARD_GAP);

        if (card) {
          const cardObj = this.createMarketCard(x, y, card);
          this.marketContainer.add(cardObj);
        } else {
          // Empty slot
          const empty = this.add.rectangle(
            x + MARKET_CARD_W / 2, y + MARKET_CARD_H / 2,
            MARKET_CARD_W, MARKET_CARD_H,
            0x222222, 0.3,
          );
          empty.setStrokeStyle(1, 0x333333);
          this.marketContainer.add(empty);
        }
      }
    }
  }

  private createMarketCard(
    x: number,
    y: number,
    card: DevelopmentCard,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x + MARKET_CARD_W / 2, y + MARKET_CARD_H / 2);
    const bonusFill = GEM_FILL[card.bonus];

    // Card background
    const bg = this.add.rectangle(0, 0, MARKET_CARD_W, MARKET_CARD_H, 0x1a1a1a);
    bg.setStrokeStyle(1, 0x444444);
    container.add(bg);

    // Bonus color bar at top
    const bonusBar = this.add.rectangle(0, -MARKET_CARD_H / 2 + 12, MARKET_CARD_W - 4, 22, bonusFill);
    container.add(bonusBar);

    // Points (top-left)
    if (card.points > 0) {
      const pts = this.add.text(
        -MARKET_CARD_W / 2 + 10, -MARKET_CARD_H / 2 + 26,
        `${card.points}`,
        { fontSize: '24px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY },
      );
      container.add(pts);
    }

    // Bonus letter (top-right)
    const bonusLetter = this.add.text(
      MARKET_CARD_W / 2 - 10, -MARKET_CARD_H / 2 + 26,
      gemAbbrev(card.bonus),
      { fontSize: '16px', fontStyle: 'bold', color: GEM_TEXT_COLOR[card.bonus], fontFamily: FONT_FAMILY },
    ).setOrigin(1, 0);
    container.add(bonusLetter);

    // Cost (bottom area) — show as gem-colored cost chips
    const costEntries: { color: GemColor; count: number }[] = [];
    for (const c of GEM_COLORS) {
      const n = card.cost[c] ?? 0;
      if (n > 0) costEntries.push({ color: c, count: n });
    }
    const costStartX = -(costEntries.length - 1) * 15;
    for (let i = 0; i < costEntries.length; i++) {
      const cx = costStartX + i * 30;
      const cy = MARKET_CARD_H / 2 - 22;
      const chip = this.add.circle(cx, cy, 13, GEM_FILL[costEntries[i].color], 0.9);
      chip.setStrokeStyle(1, 0x888888);
      container.add(chip);
      const ct = this.add.text(cx, cy, `${costEntries[i].count}`, {
        fontSize: '14px', fontStyle: 'bold',
        color: GEM_TEXT_COLOR[costEntries[i].color], fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
      container.add(ct);
    }

    // Interactivity
    if (this.turnPhase === 'player-turn') {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.onMarketCardClick(card));
      bg.on('pointerover', () => {
        bg.setStrokeStyle(2, 0xffdd44);
        container.setScale(1.05);
      });
      bg.on('pointerout', () => {
        bg.setStrokeStyle(1, 0x444444);
        container.setScale(1.0);
      });
    }

    return container;
  }

  // ── Noble display ───────────────────────────────────────

  private refreshNobles(): void {
    this.nobleContainer.removeAll(true);

    const label = this.add.text(
      NOBLE_X + NOBLE_W / 2, NOBLE_Y - 20, 'Nobles',
      { fontSize: '16px', fontStyle: 'bold', color: '#aa88cc', fontFamily: FONT_FAMILY },
    ).setOrigin(0.5);
    this.nobleContainer.add(label);

    for (let i = 0; i < this.session.nobles.length; i++) {
      const noble = this.session.nobles[i];
      const y = NOBLE_Y + i * (NOBLE_H + NOBLE_GAP);

      const bg = this.add.rectangle(
        NOBLE_X + NOBLE_W / 2, y + NOBLE_H / 2,
        NOBLE_W, NOBLE_H, 0x6633aa, 0.7,
      );
      bg.setStrokeStyle(1, 0x9966cc);
      this.nobleContainer.add(bg);

      // Points
      const pts = this.add.text(
        NOBLE_X + NOBLE_W / 2, y + 16,
        '3 pt',
        { fontSize: '16px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.nobleContainer.add(pts);

      // Requirements — show as small gem chips
      const reqs: { color: GemColor; count: number }[] = [];
      for (const c of GEM_COLORS) {
        const n = noble.requirements[c] ?? 0;
        if (n > 0) reqs.push({ color: c, count: n });
      }
      const reqStartX = NOBLE_X + NOBLE_W / 2 - (reqs.length - 1) * 13;
      for (let j = 0; j < reqs.length; j++) {
        const rx = reqStartX + j * 26;
        const ry = y + NOBLE_H - 18;
        const chip = this.add.circle(rx, ry, 11, GEM_FILL[reqs[j].color], 0.9);
        chip.setStrokeStyle(1, 0x888888);
        this.nobleContainer.add(chip);
        const ct = this.add.text(rx, ry, `${reqs[j].count}`, {
          fontSize: '13px', fontStyle: 'bold',
          color: GEM_TEXT_COLOR[reqs[j].color], fontFamily: FONT_FAMILY,
        }).setOrigin(0.5);
        this.nobleContainer.add(ct);
      }
    }
  }

  // ── Supply display ──────────────────────────────────────

  private refreshSupply(): void {
    this.supplyContainer.removeAll(true);

    const label = this.add.text(
      SUPPLY_X, SUPPLY_Y - 18, 'Supply',
      { fontSize: '14px', fontStyle: 'bold', color: '#888888', fontFamily: FONT_FAMILY },
    ).setOrigin(0.5);
    this.supplyContainer.add(label);

    const allColors: GemOrGold[] = [...GEM_COLORS, 'gold'];

    for (let i = 0; i < allColors.length; i++) {
      const color = allColors[i];
      const y = SUPPLY_Y + i * SUPPLY_GAP;
      const count = tokenCount(this.session.tokenSupply, color);

      // Token circle
      const circle = this.add.circle(SUPPLY_X, y, SUPPLY_TOKEN_R, GEM_FILL[color]);
      circle.setStrokeStyle(2, 0xffffff);
      if (count === 0) circle.setAlpha(0.3);
      this.supplyContainer.add(circle);

      // Count text
      const countText = this.add.text(
        SUPPLY_X, y,
        `${count}`,
        { fontSize: '20px', fontStyle: 'bold', color: GEM_TEXT_COLOR[color], fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.supplyContainer.add(countText);

      // Color abbreviation
      const abbr = this.add.text(
        SUPPLY_X + SUPPLY_TOKEN_R + 14, y,
        gemDisplayName(color),
        { fontSize: '15px', color: '#aaaaaa', fontFamily: FONT_FAMILY },
      ).setOrigin(0, 0.5);
      this.supplyContainer.add(abbr);

      // Interactivity for gem colors (not gold) during token selection
      if (color !== 'gold' && count > 0 && this.turnPhase === 'selecting-tokens') {
        circle.setInteractive({ useHandCursor: true });
        circle.on('pointerdown', () => this.onSupplyTokenClick(color));
        circle.on('pointerover', () => circle.setStrokeStyle(3, 0xffdd44));
        circle.on('pointerout', () => circle.setStrokeStyle(2, 0xffffff));
      }

      // Check mark for selected tokens
      if (this.selectedTokens.includes(color as GemColor)) {
        const check = this.add.text(
          SUPPLY_X - SUPPLY_TOKEN_R - 12, y,
          '✓',
          { fontSize: '22px', fontStyle: 'bold', color: '#44ff44', fontFamily: FONT_FAMILY },
        ).setOrigin(1, 0.5);
        this.supplyContainer.add(check);
      }
    }
  }

  // ── Player area ─────────────────────────────────────────

  private refreshPlayerArea(): void {
    this.playerContainer.removeAll(true);
    const player = this.session.players[0];
    const prestige = getPrestige(player);

    // Section header with integrated prestige
    const label = this.add.text(
      PLAYER_AREA_X, PLAYER_AREA_Y, 'Your Tableau',
      { fontSize: '18px', fontStyle: 'bold', color: '#ffffff', fontFamily: FONT_FAMILY },
    );
    this.playerContainer.add(label);

    const prestigeLabel = this.add.text(
      PLAYER_AREA_X + 160, PLAYER_AREA_Y + 2,
      `★ ${prestige}`,
      { fontSize: '18px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY },
    );
    this.playerContainer.add(prestigeLabel);

    // Tokens row
    const tokLabel = this.add.text(
      PLAYER_AREA_X, PLAYER_AREA_Y + 30, 'Tokens:',
      { fontSize: '14px', color: '#aaaaaa', fontFamily: FONT_FAMILY },
    );
    this.playerContainer.add(tokLabel);

    let tx = PLAYER_AREA_X + 75;
    const tokY = PLAYER_AREA_Y + 34;
    for (const c of ALL_TOKEN_COLORS) {
      const n = tokenCount(player.tokens, c);
      if (n === 0) continue;

      const circle = this.add.circle(tx + 16, tokY, 16, GEM_FILL[c]);
      circle.setStrokeStyle(1, 0xffffff);
      this.playerContainer.add(circle);

      const ct = this.add.text(
        tx + 16, tokY, `${n}`,
        { fontSize: '15px', fontStyle: 'bold', color: GEM_TEXT_COLOR[c], fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.playerContainer.add(ct);

      tx += 40;
    }

    if (totalTokens(player.tokens) === 0) {
      const noTok = this.add.text(
        tx + 5, tokY, '(none)',
        { fontSize: '14px', color: '#666666', fontFamily: FONT_FAMILY },
      ).setOrigin(0, 0.5);
      this.playerContainer.add(noTok);
    }

    // Purchased cards grouped by bonus color
    const bonuses = getBonuses(player);
    let bx = PLAYER_AREA_X;
    const bonusY = PLAYER_AREA_Y + 66;

    const bonusLabel = this.add.text(
      bx, bonusY - 2, 'Bonuses:',
      { fontSize: '14px', color: '#aaaaaa', fontFamily: FONT_FAMILY },
    );
    this.playerContainer.add(bonusLabel);
    bx += 80;

    let hasBonuses = false;
    for (const c of GEM_COLORS) {
      const count = bonuses[c];
      if (count === 0) continue;
      hasBonuses = true;

      const chip = this.add.rectangle(bx + 15, bonusY, 30, 24, GEM_FILL[c], 0.8);
      chip.setStrokeStyle(1, 0x888888);
      this.playerContainer.add(chip);

      const chipText = this.add.text(
        bx + 15, bonusY, `${count}`,
        { fontSize: '15px', fontStyle: 'bold', color: GEM_TEXT_COLOR[c], fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.playerContainer.add(chipText);

      bx += 40;
    }

    if (!hasBonuses) {
      const noneText = this.add.text(
        bx + 5, bonusY - 2, '(none)',
        { fontSize: '14px', color: '#666666', fontFamily: FONT_FAMILY },
      );
      this.playerContainer.add(noneText);
    }

    // Reserved cards
    if (player.reservedCards.length > 0) {
      const resY = PLAYER_AREA_Y + 96;
      const resLabel = this.add.text(
        PLAYER_AREA_X, resY, `Reserved (${player.reservedCards.length}):`,
        { fontSize: '14px', color: '#ccaa66', fontFamily: FONT_FAMILY },
      );
      this.playerContainer.add(resLabel);

      let rx = PLAYER_AREA_X + 140;
      for (const card of player.reservedCards) {
        const cardContainer = this.createSmallCard(rx, resY - 2, card, true);
        this.playerContainer.add(cardContainer);
        rx += 95;
      }
    }

    // Nobles collected
    if (player.nobles.length > 0) {
      const nobleY = player.reservedCards.length > 0
        ? PLAYER_AREA_Y + 145
        : PLAYER_AREA_Y + 96;
      const nobleLabel = this.add.text(
        PLAYER_AREA_X, nobleY, `Nobles: ${player.nobles.length}`,
        { fontSize: '14px', color: '#aa88cc', fontFamily: FONT_FAMILY },
      );
      this.playerContainer.add(nobleLabel);
    }

    // ── Divider line between player and AI ──
    const dividerTop = PLAYER_AREA_Y + 4;
    const dividerBot = ACTION_Y - 20;
    const divider = this.add.graphics();
    divider.lineStyle(1, 0x445544, 0.5);
    divider.lineBetween(DIVIDER_X, dividerTop, DIVIDER_X, dividerBot);
    this.playerContainer.add(divider);
  }

  private createSmallCard(
    x: number,
    y: number,
    card: DevelopmentCard,
    interactive: boolean = false,
  ): Phaser.GameObjects.Container {
    const w = 80;
    const h = 52;
    const container = this.add.container(x + w / 2, y + h / 2);

    const bg = this.add.rectangle(0, 0, w, h, 0x1a1a1a);
    bg.setStrokeStyle(1, 0x555555);
    container.add(bg);

    // Bonus color dot
    const dot = this.add.circle(-w / 2 + 12, -h / 2 + 12, 7, GEM_FILL[card.bonus]);
    container.add(dot);

    // Points
    if (card.points > 0) {
      const pts = this.add.text(
        -w / 2 + 24, -h / 2 + 4, `${card.points}`,
        { fontSize: '14px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY },
      );
      container.add(pts);
    }

    // Cost
    const costStr = formatCost(card.cost);
    const costText = this.add.text(
      0, 8, costStr,
      { fontSize: '12px', color: '#aaaaaa', fontFamily: FONT_FAMILY, align: 'center' },
    ).setOrigin(0.5);
    container.add(costText);

    if (interactive && this.turnPhase === 'player-turn') {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.onReservedCardClick(card));
      bg.on('pointerover', () => {
        bg.setStrokeStyle(2, 0xffdd44);
        container.setScale(1.1);
      });
      bg.on('pointerout', () => {
        bg.setStrokeStyle(1, 0x555555);
        container.setScale(1.0);
      });
    }

    return container;
  }

  // ── AI area ─────────────────────────────────────────────

  private refreshAiArea(): void {
    this.aiContainer.removeAll(true);
    const ai = this.session.players[1];
    const bonuses = getBonuses(ai);
    const prestige = getPrestige(ai);

    // AI header with integrated prestige
    const label = this.add.text(
      AI_AREA_X, AI_AREA_Y, 'AI Opponent',
      { fontSize: '18px', fontStyle: 'bold', color: '#aabbcc', fontFamily: FONT_FAMILY },
    );
    this.aiContainer.add(label);

    const prestigeLabel = this.add.text(
      AI_AREA_X + 160, AI_AREA_Y + 2,
      `★ ${prestige}`,
      { fontSize: '18px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY },
    );
    this.aiContainer.add(prestigeLabel);

    // Token + card counts on one line
    const tokCount = totalTokens(ai.tokens);
    const cardCount = ai.purchasedCards.length;
    const tokText = this.add.text(
      AI_AREA_X, AI_AREA_Y + 30, `Tokens: ${tokCount}`,
      { fontSize: '14px', color: '#888888', fontFamily: FONT_FAMILY },
    );
    this.aiContainer.add(tokText);

    const cardText = this.add.text(
      AI_AREA_X + 120, AI_AREA_Y + 30, `Cards: ${cardCount}`,
      { fontSize: '14px', color: '#888888', fontFamily: FONT_FAMILY },
    );
    this.aiContainer.add(cardText);

    // Bonuses summary
    let bx = AI_AREA_X;
    const bonusY = AI_AREA_Y + 58;

    const bonusLabel = this.add.text(
      bx, bonusY - 2, 'Bonuses:',
      { fontSize: '14px', color: '#aaaaaa', fontFamily: FONT_FAMILY },
    );
    this.aiContainer.add(bonusLabel);
    bx += 80;

    let hasBonuses = false;
    for (const c of GEM_COLORS) {
      if (bonuses[c] === 0) continue;
      hasBonuses = true;
      const chip = this.add.circle(bx + 12, bonusY, 12, GEM_FILL[c]);
      this.aiContainer.add(chip);
      const ct = this.add.text(
        bx + 12, bonusY, `${bonuses[c]}`,
        { fontSize: '13px', fontStyle: 'bold', color: GEM_TEXT_COLOR[c], fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.aiContainer.add(ct);
      bx += 34;
    }

    if (!hasBonuses) {
      const noneText = this.add.text(
        bx + 5, bonusY - 2, '(none)',
        { fontSize: '14px', color: '#666666', fontFamily: FONT_FAMILY },
      );
      this.aiContainer.add(noneText);
    }

    // Reserved count
    if (ai.reservedCards.length > 0) {
      const resText = this.add.text(
        AI_AREA_X, AI_AREA_Y + 86, `Reserved: ${ai.reservedCards.length}`,
        { fontSize: '14px', color: '#ccaa66', fontFamily: FONT_FAMILY },
      );
      this.aiContainer.add(resText);
    }

    // Nobles
    if (ai.nobles.length > 0) {
      const ny = ai.reservedCards.length > 0 ? AI_AREA_Y + 110 : AI_AREA_Y + 86;
      const nobleText = this.add.text(
        AI_AREA_X, ny, `Nobles: ${ai.nobles.length}`,
        { fontSize: '14px', color: '#aa88cc', fontFamily: FONT_FAMILY },
      );
      this.aiContainer.add(nobleText);
    }
  }

  private refreshPrestige(): void {
    const playerPrestige = getPrestige(this.session.players[0]);
    const aiPrestige = getPrestige(this.session.players[1]);
    this.playerPrestigeText.setText(`Prestige: ${playerPrestige}`);
    this.aiPrestigeText.setText(`AI Prestige: ${aiPrestige}`);
  }

  // ── Action buttons ──────────────────────────────────────

  private refreshActionButtons(): void {
    this.actionContainer.removeAll(true);

    if (this.turnPhase !== 'player-turn' && this.turnPhase !== 'selecting-tokens') return;

    let bx = PLAYER_AREA_X;
    const by = ACTION_Y;

    if (this.turnPhase === 'player-turn') {
      // Take Tokens button
      const takeBtn = this.createActionButton(bx, by, 'Take Tokens', () => {
        this.soundManager?.play(SFX_KEYS.UI_CLICK);
        this.selectedTokens = [];
        this.setPhase('selecting-tokens');
      });
      this.actionContainer.add(takeBtn);
      bx += 185;

      // Take 2 Same buttons — show only if any color has 4+
      const availSame = GEM_COLORS.filter(
        c => tokenCount(this.session.tokenSupply, c) >= 4,
      );
      if (availSame.length > 0) {
        const take2Label = this.add.text(
          bx, by - 2, 'Take 2:',
          { fontSize: '17px', color: '#aaaaaa', fontFamily: FONT_FAMILY },
        );
        this.actionContainer.add(take2Label);
        bx += 80;

        for (const c of availSame) {
          const circle = this.add.circle(bx, by, 22, GEM_FILL[c]);
          circle.setStrokeStyle(1, 0xffffff);
          circle.setInteractive({ useHandCursor: true });
          circle.on('pointerdown', () => {
            this.soundManager?.play(SFX_KEYS.TOKEN_TAKE);
            this.executeTakeSame(c);
          });
          circle.on('pointerover', () => circle.setStrokeStyle(2, 0xffdd44));
          circle.on('pointerout', () => circle.setStrokeStyle(1, 0xffffff));
          this.actionContainer.add(circle);

          const abbr = this.add.text(
            bx, by, gemAbbrev(c),
            { fontSize: '15px', fontStyle: 'bold', color: GEM_TEXT_COLOR[c], fontFamily: FONT_FAMILY },
          ).setOrigin(0.5);
          this.actionContainer.add(abbr);
          bx += 54;
        }
      }
    } else if (this.turnPhase === 'selecting-tokens') {
      // Show selected tokens and confirm/cancel buttons
      const selLabel = this.add.text(
        bx, by - 2, `Selected: ${this.selectedTokens.map(c => gemAbbrev(c)).join(' ') || '(none)'}`,
        { fontSize: '19px', fontStyle: 'bold', color: '#44ff44', fontFamily: FONT_FAMILY },
      );
      this.actionContainer.add(selLabel);
      bx += 290;

      // Confirm button (enabled when valid selection)
      const canConfirm = this.isValidTokenSelection();
      if (canConfirm) {
        const confirmBtn = this.createActionButton(bx, by, 'Confirm', () => {
          this.soundManager?.play(SFX_KEYS.TOKEN_TAKE);
          this.executeTakeDifferent();
        });
        this.actionContainer.add(confirmBtn);
        bx += 140;
      }

      // Cancel button
      const cancelBtn = this.createActionButton(bx, by, 'Cancel', () => {
        this.soundManager?.play(SFX_KEYS.UI_CLICK);
        this.selectedTokens = [];
        this.setPhase('player-turn');
      });
      this.actionContainer.add(cancelBtn);
    }
  }

  private createActionButton(
    x: number,
    y: number,
    text: string,
    callback: () => void,
  ): Phaser.GameObjects.Container {
    const btnW = 155;
    const btnH = 42;
    const container = this.add.container(x + btnW / 2, y);
    const bg = this.add.rectangle(0, 0, btnW, btnH, 0x335533, 0.8);
    bg.setStrokeStyle(1, 0x55aa55);
    container.add(bg);

    const label = this.add.text(0, 0, text, {
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#88ff88',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    container.add(label);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', callback);
    bg.on('pointerover', () => bg.setStrokeStyle(2, 0xffdd44));
    bg.on('pointerout', () => bg.setStrokeStyle(1, 0x55aa55));

    return container;
  }

  // ── Discard dialog ──────────────────────────────────────

  private showDiscardDialog(excess: number): void {
    this.discardNeeded = excess;
    this.discardSelection = {};
    this.setPhase('discarding-tokens');
    this.refreshDiscardDialog();
  }

  private refreshDiscardDialog(): void {
    this.discardContainer.removeAll(true);

    const player = this.session.players[0];
    const selectedCount = Object.values(this.discardSelection).reduce(
      (sum, n) => sum + (n ?? 0), 0,
    );

    // Overlay background
    const overlay = createOverlayBackground(
      this,
      { depth: 10, alpha: 0.7 },
      { width: 600, height: 300, alpha: 0.9 },
    );
    this.discardContainer.add(overlay.objects);

    // Title
    const title = this.add.text(
      GAME_W / 2, GAME_H / 2 - 110,
      `Discard ${this.discardNeeded} token${this.discardNeeded > 1 ? 's' : ''} (${selectedCount}/${this.discardNeeded})`,
      { fontSize: '20px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY },
    ).setOrigin(0.5).setDepth(11);
    this.discardContainer.add(title);

    // Token buttons
    const allColors: GemOrGold[] = [...GEM_COLORS, 'gold'];
    const activeColors = allColors.filter(c => tokenCount(player.tokens, c) > 0);
    const totalW = activeColors.length * 70;
    let tx = GAME_W / 2 - totalW / 2 + 35;
    const ty = GAME_H / 2 - 25;

    for (const c of activeColors) {
      const have = tokenCount(player.tokens, c);
      const selected = this.discardSelection[c] ?? 0;
      const available = have - selected;

      const circle = this.add.circle(tx, ty, 28, GEM_FILL[c]);
      circle.setStrokeStyle(selected > 0 ? 2 : 1, selected > 0 ? 0xff4444 : 0xffffff);
      circle.setDepth(11);
      this.discardContainer.add(circle);

      const countText = this.add.text(
        tx, ty, `${have - selected}`,
        { fontSize: '18px', fontStyle: 'bold', color: GEM_TEXT_COLOR[c], fontFamily: FONT_FAMILY },
      ).setOrigin(0.5).setDepth(11);
      this.discardContainer.add(countText);

      const selText = this.add.text(
        tx, ty + 36, selected > 0 ? `-${selected}` : '',
        { fontSize: '16px', color: '#ff6666', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5).setDepth(11);
      this.discardContainer.add(selText);

      if (available > 0 && selectedCount < this.discardNeeded) {
        circle.setInteractive({ useHandCursor: true });
        circle.on('pointerdown', () => {
          this.discardSelection[c] = (this.discardSelection[c] ?? 0) + 1;
          this.refreshDiscardDialog();
        });
      }

      tx += 70;
    }

    // Undo last discard selection
    if (selectedCount > 0) {
      const undoBtn = this.add.text(
        GAME_W / 2 - 70, GAME_H / 2 + 70, '[ Undo ]',
        { fontSize: '18px', color: '#88aaff', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });
      undoBtn.on('pointerdown', () => {
        this.discardSelection = {};
        this.refreshDiscardDialog();
      });
      this.discardContainer.add(undoBtn);
    }

    // Confirm button (when exactly enough selected)
    if (selectedCount === this.discardNeeded) {
      const confirmBtn = this.add.text(
        GAME_W / 2 + 70, GAME_H / 2 + 70, '[ Confirm ]',
        { fontSize: '18px', fontStyle: 'bold', color: '#44ff44', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });
      confirmBtn.on('pointerdown', () => {
        this.executeDiscard();
      });
      this.discardContainer.add(confirmBtn);
    }
  }

  // ── Phase management ────────────────────────────────────

  private setPhase(phase: TurnPhase): void {
    this.turnPhase = phase;

    switch (phase) {
      case 'player-turn':
        this.instructionText.setText('Click a card to buy/reserve, or take tokens');
        this.refreshAll();
        break;
      case 'selecting-tokens':
        this.instructionText.setText('Click gems in the supply to select (up to 3 different)');
        this.refreshSupply();
        this.refreshActionButtons();
        break;
      case 'discarding-tokens':
        this.instructionText.setText('');
        break;
      case 'animating':
        this.instructionText.setText('');
        break;
      case 'ai-turn':
        this.instructionText.setText('AI is thinking...');
        break;
      case 'game-over':
        this.instructionText.setText('');
        break;
    }
  }

  // ── Token selection logic ───────────────────────────────

  private onSupplyTokenClick(color: GemColor): void {
    if (this.turnPhase !== 'selecting-tokens') return;

    // Toggle selection
    const idx = this.selectedTokens.indexOf(color);
    if (idx !== -1) {
      this.selectedTokens.splice(idx, 1);
    } else {
      if (this.selectedTokens.length >= 3) return; // max 3
      if (this.selectedTokens.includes(color)) return; // no duplicates
      this.selectedTokens.push(color);
    }

    this.refreshSupply();
    this.refreshActionButtons();
  }

  private isValidTokenSelection(): boolean {
    if (this.selectedTokens.length === 0) return false;

    // Must be unique
    if (new Set(this.selectedTokens).size !== this.selectedTokens.length) return false;

    // Check supply
    for (const c of this.selectedTokens) {
      if (tokenCount(this.session.tokenSupply, c) <= 0) return false;
    }

    // If fewer than 3, must have fewer than 3 colors available
    if (this.selectedTokens.length < 3) {
      const available = GEM_COLORS.filter(
        c => tokenCount(this.session.tokenSupply, c) > 0,
      );
      if (available.length >= 3) return false;
    }

    return true;
  }

  // ── Card click handlers ─────────────────────────────────

  private onMarketCardClick(card: DevelopmentCard): void {
    if (this.turnPhase !== 'player-turn') return;

    const player = this.session.players[0];

    if (canAfford(player, card)) {
      // Show purchase/reserve choice
      this.showCardActionMenu(card, true);
    } else {
      // Can only reserve
      this.showCardActionMenu(card, false);
    }
  }

  private onReservedCardClick(card: DevelopmentCard): void {
    if (this.turnPhase !== 'player-turn') return;

    const player = this.session.players[0];
    if (canAfford(player, card)) {
      this.executePurchase(card.id);
    }
  }

  private onReserveDeck(tier: Tier): void {
    if (this.turnPhase !== 'player-turn') return;

    const player = this.session.players[0];
    if (player.reservedCards.length >= 3) {
      this.showToast('Max 3 reserved cards!');
      return;
    }

    const action: TurnAction = { type: 'reserve', cardId: null, tier };
    this.executeAction(action);
  }

  private showCardActionMenu(card: DevelopmentCard, canBuy: boolean): void {
    // Simple modal with buy/reserve options
    this.setPhase('animating'); // block other inputs

    const overlay = createOverlayBackground(
      this,
      { depth: 10, alpha: 0.5 },
      { width: 420, height: 230, alpha: 0.9 },
    );
    this.overlayObjects.push(...overlay.objects);

    // Card info
    const pts = card.points > 0 ? `${card.points} pt, ` : '';
    const info = `T${card.tier} ${gemDisplayName(card.bonus)} bonus\n${pts}Cost: ${formatCost(card.cost)}`;
    const infoText = this.add.text(
      GAME_W / 2, GAME_H / 2 - 55, info,
      { fontSize: '18px', color: '#ffffff', fontFamily: FONT_FAMILY, align: 'center' },
    ).setOrigin(0.5).setDepth(11);
    this.overlayObjects.push(infoText);

    let bx = GAME_W / 2 - 105;

    if (canBuy) {
      const buyBtn = createOverlayButton(this, bx, GAME_H / 2 + 40, '[ Buy ]');
      buyBtn.on('pointerdown', () => {
        this.dismissOverlay();
        this.executePurchase(card.id);
      });
      this.overlayObjects.push(buyBtn);
      bx += 105;
    }

    const player = this.session.players[0];
    if (player.reservedCards.length < 3) {
      const resBtn = createOverlayButton(this, bx, GAME_H / 2 + 40, '[ Reserve ]');
      resBtn.on('pointerdown', () => {
        this.dismissOverlay();
        this.executeReserve(card.id);
      });
      this.overlayObjects.push(resBtn);
      bx += 105;
    }

    const cancelBtn = createOverlayButton(this, bx, GAME_H / 2 + 40, '[ Cancel ]');
    cancelBtn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      this.dismissOverlay();
      this.setPhase('player-turn');
    });
    this.overlayObjects.push(cancelBtn);
  }

  // ── Action execution ────────────────────────────────────

  private executeTakeDifferent(): void {
    const action: TurnAction = {
      type: 'take-different',
      colors: [...this.selectedTokens],
    };
    this.selectedTokens = [];
    this.executeAction(action);
  }

  private executeTakeSame(color: GemColor): void {
    const action: TurnAction = { type: 'take-same', color };
    this.executeAction(action);
  }

  private executeReserve(cardId: number): void {
    this.soundManager?.play(SFX_KEYS.CARD_RESERVE);
    const action: TurnAction = { type: 'reserve', cardId };
    this.executeAction(action);
  }

  private executePurchase(cardId: number): void {
    this.soundManager?.play(SFX_KEYS.CARD_PURCHASE);
    const action: TurnAction = { type: 'purchase', cardId };
    this.executeAction(action);
  }

  private executeAction(action: TurnAction): void {
    try {
      const result = executeTurn(this.session, action);

      // Play noble visit sound
      if (result.nobleVisit) {
        this.soundManager?.play(SFX_KEYS.NOBLE_VISIT);
        this.showToast(`Noble visits you! +3 prestige`);
      }

      if (result.tokensOverLimit > 0) {
        // Need to discard tokens
        this.refreshAll();
        this.showDiscardDialog(result.tokensOverLimit);
        return;
      }

      this.afterTurnComplete(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid action';
      this.showToast(msg);
      this.setPhase('player-turn');
    }
  }

  private executeDiscard(): void {
    try {
      const result = discardTokens(this.session, { tokens: this.discardSelection as Record<string, number> });
      this.discardContainer.removeAll(true);
      this.afterTurnComplete(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid discard';
      this.showToast(msg);
    }
  }

  private afterTurnComplete(result: TurnResult): void {
    this.setPhase('animating');
    this.refreshAll();

    if (result.gameOver) {
      this.time.delayedCall(ANIM_DURATION, () => {
        this.showGameOverOverlay();
      });
      return;
    }

    // Check if next player is AI
    if (this.session.players[this.session.currentPlayerIndex].isAI) {
      this.setPhase('ai-turn');
      this.time.delayedCall(ANIM_DURATION + 200, () => {
        this.executeAiTurn();
      });
    } else {
      this.time.delayedCall(ANIM_DURATION, () => {
        this.gameEvents.emit('turn-started', {
          turnNumber: 0,
          playerIndex: 0,
          playerName: 'You',
          isAI: false,
        });
        this.setPhase('player-turn');
      });
    }
  }

  // ── AI turn ─────────────────────────────────────────────

  private executeAiTurn(): void {
    const aiIndex = this.session.currentPlayerIndex;
    const action = this.aiPlayer.chooseTurn(this.session, aiIndex);

    try {
      const result = executeTurn(this.session, action);

      // Handle AI discard
      if (result.tokensOverLimit > 0) {
        const discard = this.aiPlayer.chooseDiscard(
          this.session, aiIndex, result.tokensOverLimit,
        );
        discardTokens(this.session, discard);
      }

      if (result.nobleVisit) {
        this.showToast(`AI earns a noble visit! +3 prestige`);
      }

      this.refreshAll();

      if (result.gameOver || isGameOver(this.session)) {
        this.time.delayedCall(ANIM_DURATION, () => {
          this.showGameOverOverlay();
        });
        return;
      }

      // Next player's turn
      if (this.session.players[this.session.currentPlayerIndex].isAI) {
        // Another AI turn (shouldn't happen in 2-player but safe)
        this.time.delayedCall(ANIM_DURATION, () => this.executeAiTurn());
      } else {
        this.time.delayedCall(ANIM_DURATION, () => {
          this.gameEvents.emit('turn-started', {
            turnNumber: 0,
            playerIndex: 0,
            playerName: 'You',
            isAI: false,
          });
          this.setPhase('player-turn');
        });
      }
    } catch (err) {
      // AI error — skip turn (shouldn't happen)
      console.error('AI error:', err);
      this.setPhase('player-turn');
    }
  }

  // ── Game over ───────────────────────────────────────────

  private showGameOverOverlay(): void {
    this.setPhase('game-over');
    this.soundManager?.play(SFX_KEYS.GAME_END);

    this.gameEvents.emit('game-ended', {
      finalTurnNumber: 0,
      winnerIndex: getWinnerIndex(this.session),
    });

    const overlay = createOverlayBackground(
      this,
      { depth: 10, alpha: 0.01 },
      { width: 520, height: 340, alpha: 0.9 },
    );
    this.overlayObjects.push(...overlay.objects);

    const winnerIdx = getWinnerIndex(this.session);
    const winnerText = winnerIdx === 0 ? 'You Win!' : 'AI Wins!';

    const human = this.session.players[0];
    const ai = this.session.players[1];
    const humanPrestige = getPrestige(human);
    const aiPrestige = getPrestige(ai);

    const lines = [
      winnerText,
      '',
      `You: ${humanPrestige} prestige (${human.purchasedCards.length} cards, ${human.nobles.length} nobles)`,
      `AI: ${aiPrestige} prestige (${ai.purchasedCards.length} cards, ${ai.nobles.length} nobles)`,
      '',
      `Tiebreak: fewest cards wins`,
    ];

    const text = this.add
      .text(GAME_W / 2, GAME_H / 2 - 55, lines.join('\n'), {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5)
      .setDepth(11);
    this.overlayObjects.push(text);

    // Play again
    const playBtn = createOverlayButton(
      this, GAME_W / 2 - 80, GAME_H / 2 + 110, '[ Play Again ]',
    );
    playBtn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      this.dismissOverlay();
      this.scene.restart();
    });
    this.overlayObjects.push(playBtn);

    // Menu
    const menuBtn = createOverlayMenuButton(this, GAME_W / 2 + 80, GAME_H / 2 + 110);
    this.overlayObjects.push(menuBtn);
  }

  // ── Toast / temporary message ───────────────────────────

  private showToast(message: string): void {
    const toast = this.add.text(
      GAME_W / 2, GAME_H / 2 + 180, message,
      {
        fontSize: '18px',
        color: '#ffdd44',
        fontFamily: FONT_FAMILY,
        backgroundColor: '#333333',
        padding: { left: 14, right: 14, top: 8, bottom: 8 },
      },
    ).setOrigin(0.5).setDepth(20);

    this.time.delayedCall(2000, () => {
      toast.destroy();
    });
  }

  // ── Overlay cleanup ─────────────────────────────────────

  private dismissOverlay(): void {
    for (const obj of this.overlayObjects) {
      obj.destroy();
    }
    this.overlayObjects = [];
  }

  // ── Lifecycle cleanup ───────────────────────────────────

  shutdown(): void {
    this.soundManager?.destroy();
    this.soundManager = null;
    this.eventBridge?.destroy();
    this.gameEvents?.removeAllListeners();
    this.helpPanel?.destroy();
    this.helpButton?.destroy();
    this.settingsPanel?.destroy();
    this.settingsButton?.destroy();
    this.dismissOverlay();
    this.discardContainer?.removeAll(true);
  }
}
