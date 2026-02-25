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
import type { GemColor, GemOrGold, GemTokens, DevelopmentCard, NobleTile, Tier } from '../SplendorCards';
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
  SplendorPhase,
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
import { SplendorTranscriptRecorder } from '../GameTranscript';
import type { MarketSnapshot, PlayerSnapshot } from '../GameTranscript';
import { TranscriptStore } from '../../../src/core-engine/TranscriptStore';
import { GameEventEmitter } from '../../../src/core-engine/GameEventEmitter';
import { PhaserEventBridge } from '../../../src/core-engine/PhaserEventBridge';
import { SoundManager } from '../../../src/core-engine/SoundManager';
import type { SoundPlayer, EventSoundMapping } from '../../../src/core-engine/SoundManager';
import {
  HelpPanel, HelpButton,
  SettingsPanel, SettingsButton,
  GAME_W, GAME_H, FONT_FAMILY,
  createOverlayBackground, createOverlayButton, createOverlayMenuButton,
  dismissOverlay,
  createSceneTitle, createSceneMenuButton,
} from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import helpContent from '../help-content.json';

// ── Constants ───────────────────────────────────────────────

const ANIM_DURATION = 400;

/** Shared transcript store for auto-saving completed transcripts. */
const transcriptStore = new TranscriptStore();

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
// The game canvas is 1280 × 720.  The design aims for visual symmetry:
//
//   Upper band (Y 40–440, 400 px):
//     Left edge  – Nobles column (vertically centred)
//     Centre     – Card market (3 tiers, deck column + 4 visible cards)
//     Right edge – Token supply column (vertically centred)
//
//   Lower band (Y 460–720, 260 px):
//     Left half  – Player tableau (left-aligned)
//     Right half – AI opponent   (right-aligned / mirrored)
//     Centre     – Action buttons, then instruction text at bottom
//

// ── Upper-band vertical zone ───────────────────────────────
const UPPER_TOP = 52;          // top of the upper band (below header + nobles title)
const UPPER_BOT = 440;         // bottom of the upper band
const UPPER_MID = (UPPER_TOP + UPPER_BOT) / 2;  // vertical centre = 240

// Noble tiles — left column, vertically aligned with market tier rows
const NOBLE_W = 100;           // wider to fit requirements comfortably
const NOBLE_H = 115;           // same height as market cards (MARKET_CARD_H)
const NOBLE_X = 10;            // left margin

// Token supply — right column, vertically centred
const SUPPLY_TOKEN_R = 28;
const SUPPLY_GAP = 62;         // vertical spacing between token centres
const SUPPLY_TOTAL_H = 5 * SUPPLY_GAP;                    // 310 (6 tokens)
const SUPPLY_X = 1170;         // circle centre X (near right edge, room for labels)
const SUPPLY_Y = UPPER_MID - SUPPLY_TOTAL_H / 2;          // ≈ 85

// Card market — centred horizontally between nobles and supply
const MARKET_CARD_W = 155;     // card width (slightly narrower to fit centred layout)
const MARKET_CARD_H = 115;     // card height
const MARKET_CARD_GAP = 14;    // horizontal gap between cards
const MARKET_TIER_GAP = 10;    // vertical gap between tier rows
const MARKET_TOTAL_H = 3 * MARKET_CARD_H + 2 * MARKET_TIER_GAP;  // 365
const MARKET_Y = UPPER_MID - MARKET_TOTAL_H / 2;          // ≈ 58 — vertically centred

// Deck column sits just left of the visible market cards
// Available horizontal zone: nobles right (~120) … supply labels left (~1090)
const DECK_X = 240;            // deck back centre X (shifted right for wider nobles)
const MARKET_X = DECK_X + 50 + 16;  // first card left edge (deck half-width + gap)

// ── Section box styling ────────────────────────────────────
const SECTION_BOX_STROKE = 0x445544;   // border colour
const SECTION_BOX_ALPHA = 0.4;         // border alpha
const SECTION_BOX_FILL = 0x1a2a1a;     // fill colour (matches background)
const SECTION_BOX_FILL_ALPHA = 0.3;    // subtle fill
const SECTION_BOX_RADIUS = 8;          // corner rounding
const SECTION_BOX_PAD = 8;             // padding around content

// ── Lower-band layout ──────────────────────────────────────
const LOWER_TOP = 452;         // top of lower band (slightly higher for more room)

// Player area — left half of lower band
const PLAYER_AREA_X = 20;
const PLAYER_AREA_Y = LOWER_TOP;

// AI area — right half of lower band (right-aligned / mirrored)
const AI_AREA_X = 1260;        // RIGHT edge for right-aligned text
const AI_AREA_Y = LOWER_TOP;

// Divider between player and AI areas
const DIVIDER_X = 640;

// Action buttons and instructions — centred at bottom
const ACTION_Y = 618;          // action buttons Y
const INSTRUCTION_Y = 664;     // instruction text Y (centred horizontally)

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

  // Transcript recording
  private recorder: SplendorTranscriptRecorder | null = null;

  /** When true, the scene suppresses all input and AI turns for replay use. */
  private replayMode: boolean = false;

  /** Tracks the replay step index for state-settled payloads. */
  private replayStepIndex: number = -1;

  // Pending turn state for recording (deferred across discard step)
  private pendingPlayerIndex: number = -1;
  private pendingAction: TurnAction | null = null;
  private pendingResult: TurnResult | null = null;

  // Event system
  private gameEvents!: GameEventEmitter;
  private eventBridge!: PhaserEventBridge;
  private soundManager: SoundManager | null = null;

  // Display containers
  private sectionBoxContainer!: Phaser.GameObjects.Container;
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
    this.recorder = null;
    this.replayStepIndex = -1;
    this.pendingPlayerIndex = -1;
    this.pendingAction = null;
    this.pendingResult = null;

    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    this.replayMode = urlParams.get('mode') === 'replay';

    // Event system
    this.gameEvents = new GameEventEmitter();
    this.eventBridge = new PhaserEventBridge(this.gameEvents, this.events);
    // Expose for replay tool (page.evaluate can listen for state-settled)
    (window as unknown as Record<string, unknown>).__GAME_EVENTS__ =
      this.gameEvents;

    if (this.replayMode) {
      // In replay mode: create minimal UI, skip game setup.
      // The replay tool will call loadBoardState() to inject state.
      this.createHeader();
      this.createContainers();
      this.createInstructions();
      this.createPrestigeDisplay();

      // Emit state-settled so the replay tool knows the scene is ready
      this.emitStateSettled();
      return;
    }

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

    // Create transcript recorder
    this.recorder = new SplendorTranscriptRecorder(this.session);

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
    this.sectionBoxContainer = this.add.container(0, 0);
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
      .text(GAME_W / 2, INSTRUCTION_Y, '', {
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

  // ── Section boxes ────────────────────────────────────────

  private drawSectionBox(
    x: number, y: number, w: number, h: number,
    label?: string,
  ): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(SECTION_BOX_FILL, SECTION_BOX_FILL_ALPHA);
    gfx.fillRoundedRect(x, y, w, h, SECTION_BOX_RADIUS);
    gfx.lineStyle(1, SECTION_BOX_STROKE, SECTION_BOX_ALPHA);
    gfx.strokeRoundedRect(x, y, w, h, SECTION_BOX_RADIUS);
    this.sectionBoxContainer.add(gfx);

    if (label) {
      const txt = this.add.text(
        x + w / 2, y + 2, label,
        { fontSize: '12px', fontStyle: 'bold', color: '#667766', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5, 0);
      this.sectionBoxContainer.add(txt);
    }
  }

  private refreshSectionBoxes(): void {
    this.sectionBoxContainer.removeAll(true);

    const p = SECTION_BOX_PAD;

    // Nobles box — around all noble tiles
    const noblesBoxX = NOBLE_X - p;
    const noblesBoxY = MARKET_Y - p - 16;  // extra space for section label
    const noblesBoxW = NOBLE_W + p * 2;
    const noblesBoxH = MARKET_TOTAL_H + p * 2 + 16;
    this.drawSectionBox(noblesBoxX, noblesBoxY, noblesBoxW, noblesBoxH, 'Nobles');

    // Market box — around tier labels, decks, and cards
    const marketBoxX = DECK_X - 90 - p;
    const lastCardRight = MARKET_X + 4 * (MARKET_CARD_W + MARKET_CARD_GAP) - MARKET_CARD_GAP;
    const marketBoxW = lastCardRight - marketBoxX + p;
    const marketBoxY = MARKET_Y - p - 16;
    const marketBoxH = MARKET_TOTAL_H + p * 2 + 16;
    this.drawSectionBox(marketBoxX, marketBoxY, marketBoxW, marketBoxH, 'Market');

    // Supply box — around token circles and labels
    const supplyBoxX = SUPPLY_X - SUPPLY_TOKEN_R - 70 - p;
    const supplyBoxY = SUPPLY_Y - SUPPLY_TOKEN_R - p - 16;
    const supplyBoxW = SUPPLY_TOKEN_R + 70 + SUPPLY_TOKEN_R + p * 2;
    const supplyBoxH = SUPPLY_TOTAL_H + SUPPLY_TOKEN_R * 2 + p * 2 + 16;
    this.drawSectionBox(supplyBoxX, supplyBoxY, supplyBoxW, supplyBoxH, 'Supply');

    // Player area box
    const playerBoxX = PLAYER_AREA_X - p;
    const playerBoxY = LOWER_TOP - p;
    const playerBoxW = DIVIDER_X - PLAYER_AREA_X;
    const playerBoxH = ACTION_Y - LOWER_TOP - 4;
    this.drawSectionBox(playerBoxX, playerBoxY, playerBoxW, playerBoxH);

    // AI area box
    const aiBoxX = DIVIDER_X + p;
    const aiBoxY = LOWER_TOP - p;
    const aiBoxW = AI_AREA_X - DIVIDER_X + p;
    const aiBoxH = ACTION_Y - LOWER_TOP - 4;
    this.drawSectionBox(aiBoxX, aiBoxY, aiBoxW, aiBoxH);
  }

  // ── Refresh display ─────────────────────────────────────

  private refreshAll(): void {
    this.refreshSectionBoxes();
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
      const deckW = 100;           // fixed width to fit between nobles and market
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

    // Nobles are aligned vertically with market tier rows (bottom to top: T1, T2, T3)
    // Market tiers go: row 0 = T3 (top), row 1 = T2, row 2 = T1 (bottom)
    // We place nobles aligned to the same Y positions
    for (let i = 0; i < this.session.nobles.length; i++) {
      const noble = this.session.nobles[i];
      // Align with market tier row i
      const y = MARKET_Y + i * (MARKET_CARD_H + MARKET_TIER_GAP);

      const bg = this.add.rectangle(
        NOBLE_X + NOBLE_W / 2, y + NOBLE_H / 2,
        NOBLE_W, NOBLE_H, 0x6633aa, 0.7,
      );
      bg.setStrokeStyle(1, 0x9966cc);
      this.nobleContainer.add(bg);

      // Points — centred near top
      const pts = this.add.text(
        NOBLE_X + NOBLE_W / 2, y + 20,
        '3 pt',
        { fontSize: '20px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.nobleContainer.add(pts);

      // "Noble" label
      const nobleLabel = this.add.text(
        NOBLE_X + NOBLE_W / 2, y + 42,
        'Noble',
        { fontSize: '13px', color: '#ccaaee', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.nobleContainer.add(nobleLabel);

      // Requirements — show as gem chips in a row near bottom
      const reqs: { color: GemColor; count: number }[] = [];
      for (const c of GEM_COLORS) {
        const n = noble.requirements[c] ?? 0;
        if (n > 0) reqs.push({ color: c, count: n });
      }
      const chipSpacing = 30;
      const reqStartX = NOBLE_X + NOBLE_W / 2 - (reqs.length - 1) * chipSpacing / 2;
      for (let j = 0; j < reqs.length; j++) {
        const rx = reqStartX + j * chipSpacing;
        const ry = y + NOBLE_H - 26;
        const chip = this.add.circle(rx, ry, 13, GEM_FILL[reqs[j].color], 0.9);
        chip.setStrokeStyle(1, 0x888888);
        this.nobleContainer.add(chip);
        const ct = this.add.text(rx, ry, `${reqs[j].count}`, {
          fontSize: '15px', fontStyle: 'bold',
          color: GEM_TEXT_COLOR[reqs[j].color], fontFamily: FONT_FAMILY,
        }).setOrigin(0.5);
        this.nobleContainer.add(ct);
      }
    }
  }

  // ── Supply display ──────────────────────────────────────

  private refreshSupply(): void {
    this.supplyContainer.removeAll(true);

    // "Supply" heading — tucked just above the first token circle
    const label = this.add.text(
      SUPPLY_X, SUPPLY_Y - SUPPLY_TOKEN_R - 8, 'Supply',
      { fontSize: '13px', fontStyle: 'bold', color: '#99bb99', fontFamily: FONT_FAMILY },
    ).setOrigin(0.5, 1);
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

      // Color abbreviation — left of circle so it doesn't clip the canvas edge
      const abbr = this.add.text(
        SUPPLY_X - SUPPLY_TOKEN_R - 8, y,
        gemDisplayName(color),
        { fontSize: '15px', color: '#aaaaaa', fontFamily: FONT_FAMILY },
      ).setOrigin(1, 0.5);
      this.supplyContainer.add(abbr);

      // Interactivity for gem colors (not gold) during token selection
      if (color !== 'gold' && count > 0 && this.turnPhase === 'selecting-tokens') {
        circle.setInteractive({ useHandCursor: true });
        circle.on('pointerdown', () => this.onSupplyTokenClick(color));
        circle.on('pointerover', () => circle.setStrokeStyle(3, 0xffdd44));
        circle.on('pointerout', () => circle.setStrokeStyle(2, 0xffffff));
      }

      // Check mark for selected tokens — right of circle
      if (this.selectedTokens.includes(color as GemColor)) {
        const check = this.add.text(
          SUPPLY_X + SUPPLY_TOKEN_R + 10, y,
          '✓',
          { fontSize: '22px', fontStyle: 'bold', color: '#44ff44', fontFamily: FONT_FAMILY },
        ).setOrigin(0, 0.5);
        this.supplyContainer.add(check);
      }
    }
  }

  // ── Player area ─────────────────────────────────────────

  private refreshPlayerArea(): void {
    this.playerContainer.removeAll(true);
    const player = this.session.players[0];
    const prestige = getPrestige(player);

    // ── Row 0: Header + prominent prestige score ──
    const row0Y = PLAYER_AREA_Y + 4;

    const label = this.add.text(
      PLAYER_AREA_X, row0Y, 'Your Tableau',
      { fontSize: '18px', fontStyle: 'bold', color: '#ffffff', fontFamily: FONT_FAMILY },
    );
    this.playerContainer.add(label);

    // Prominent prestige display — large star + score
    const prestigeBg = this.add.rectangle(
      PLAYER_AREA_X + 200, row0Y + 10,
      90, 24, 0x443300, 0.6,
    );
    prestigeBg.setStrokeStyle(1, 0x887744);
    this.playerContainer.add(prestigeBg);

    const prestigeLabel = this.add.text(
      PLAYER_AREA_X + 200, row0Y + 10,
      `★ ${prestige} / 15`,
      { fontSize: '16px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY },
    ).setOrigin(0.5);
    this.playerContainer.add(prestigeLabel);

    // Nobles collected (inline with header if any)
    if (player.nobles.length > 0) {
      const nobleLabel = this.add.text(
        PLAYER_AREA_X + 260, row0Y + 2,
        `Nobles: ${player.nobles.length}`,
        { fontSize: '14px', color: '#aa88cc', fontFamily: FONT_FAMILY },
      );
      this.playerContainer.add(nobleLabel);
    }

    // ── Row 1: Tokens ──
    const row1Y = row0Y + 30;

    const tokLabel = this.add.text(
      PLAYER_AREA_X, row1Y + 4, 'Tokens:',
      { fontSize: '15px', color: '#aaaaaa', fontFamily: FONT_FAMILY },
    );
    this.playerContainer.add(tokLabel);

    let tx = PLAYER_AREA_X + 80;
    const tokCenterY = row1Y + 18;   // enough vertical space for radius-16 circles
    for (const c of ALL_TOKEN_COLORS) {
      const n = tokenCount(player.tokens, c);
      if (n === 0) continue;

      const circle = this.add.circle(tx, tokCenterY, 16, GEM_FILL[c]);
      circle.setStrokeStyle(1, 0xffffff);
      this.playerContainer.add(circle);

      const ct = this.add.text(
        tx, tokCenterY, `${n}`,
        { fontSize: '15px', fontStyle: 'bold', color: GEM_TEXT_COLOR[c], fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.playerContainer.add(ct);

      tx += 40;
    }

    if (totalTokens(player.tokens) === 0) {
      const noTok = this.add.text(
        tx + 5, tokCenterY, '(none)',
        { fontSize: '15px', color: '#666666', fontFamily: FONT_FAMILY },
      ).setOrigin(0, 0.5);
      this.playerContainer.add(noTok);
    }

    // ── Row 2: Bonuses ──
    const row2Y = row1Y + 40;

    const bonuses = getBonuses(player);
    let bx = PLAYER_AREA_X;

    const bonusLabel = this.add.text(
      bx, row2Y + 4, 'Bonuses:',
      { fontSize: '15px', color: '#aaaaaa', fontFamily: FONT_FAMILY },
    );
    this.playerContainer.add(bonusLabel);
    bx += 85;

    let hasBonuses = false;
    for (const c of GEM_COLORS) {
      const count = bonuses[c];
      if (count === 0) continue;
      hasBonuses = true;

      const chip = this.add.rectangle(bx + 16, row2Y + 16, 32, 26, GEM_FILL[c], 0.8);
      chip.setStrokeStyle(1, 0x888888);
      this.playerContainer.add(chip);

      const chipText = this.add.text(
        bx + 16, row2Y + 16, `${count}`,
        { fontSize: '16px', fontStyle: 'bold', color: GEM_TEXT_COLOR[c], fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.playerContainer.add(chipText);

      bx += 44;
    }

    if (!hasBonuses) {
      const noneText = this.add.text(
        bx + 5, row2Y + 6, '(none)',
        { fontSize: '15px', color: '#666666', fontFamily: FONT_FAMILY },
      );
      this.playerContainer.add(noneText);
    }

    // ── Row 3: Reserved cards (conditional) ──
    const row3Y = row2Y + 38;
    if (player.reservedCards.length > 0) {
      const resLabel = this.add.text(
        PLAYER_AREA_X, row3Y + 4, `Reserved (${player.reservedCards.length}):`,
        { fontSize: '15px', color: '#ccaa66', fontFamily: FONT_FAMILY },
      );
      this.playerContainer.add(resLabel);

      let rx = PLAYER_AREA_X + 150;
      for (const card of player.reservedCards) {
        const cardContainer = this.createSmallCard(rx, row3Y - 2, card, true);
        this.playerContainer.add(cardContainer);
        rx += 100;
      }
    }
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

    // ── Row 0: Header + prominent prestige score — right-aligned ──
    const row0Y = AI_AREA_Y + 4;

    const label = this.add.text(
      AI_AREA_X, row0Y, 'AI Opponent',
      { fontSize: '18px', fontStyle: 'bold', color: '#aabbcc', fontFamily: FONT_FAMILY },
    ).setOrigin(1, 0);
    this.aiContainer.add(label);

    // Prominent prestige display — matches player side
    const prestigeBg = this.add.rectangle(
      AI_AREA_X - 170, row0Y + 10,
      90, 24, 0x443300, 0.6,
    );
    prestigeBg.setStrokeStyle(1, 0x887744);
    this.aiContainer.add(prestigeBg);

    const prestigeLabel = this.add.text(
      AI_AREA_X - 170, row0Y + 10,
      `★ ${prestige} / 15`,
      { fontSize: '16px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY },
    ).setOrigin(0.5);
    this.aiContainer.add(prestigeLabel);

    // Nobles collected (inline with header if any)
    if (ai.nobles.length > 0) {
      const nobleLabel = this.add.text(
        AI_AREA_X - 230, row0Y + 2,
        `Nobles: ${ai.nobles.length}`,
        { fontSize: '14px', color: '#aa88cc', fontFamily: FONT_FAMILY },
      ).setOrigin(1, 0);
      this.aiContainer.add(nobleLabel);
    }

    // ── Row 1: Tokens — show actual token circles (matching player layout) ──
    const row1Y = row0Y + 30;

    const tokLabel = this.add.text(
      AI_AREA_X, row1Y + 4, 'Tokens:',
      { fontSize: '15px', color: '#aaaaaa', fontFamily: FONT_FAMILY },
    ).setOrigin(1, 0);
    this.aiContainer.add(tokLabel);

    let tx = AI_AREA_X - 80;
    const tokCenterY = row1Y + 18;
    let hasTokens = false;
    // Draw right-to-left
    const tokenColors = [...ALL_TOKEN_COLORS].reverse();
    for (const c of tokenColors) {
      const n = tokenCount(ai.tokens, c);
      if (n === 0) continue;
      hasTokens = true;

      const circle = this.add.circle(tx, tokCenterY, 16, GEM_FILL[c]);
      circle.setStrokeStyle(1, 0xffffff);
      this.aiContainer.add(circle);

      const ct = this.add.text(
        tx, tokCenterY, `${n}`,
        { fontSize: '15px', fontStyle: 'bold', color: GEM_TEXT_COLOR[c], fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.aiContainer.add(ct);

      tx -= 40;
    }

    if (!hasTokens) {
      const noTok = this.add.text(
        AI_AREA_X - 80, tokCenterY, '(none)',
        { fontSize: '15px', color: '#666666', fontFamily: FONT_FAMILY },
      ).setOrigin(1, 0.5);
      this.aiContainer.add(noTok);
    }

    // ── Row 2: Bonuses — right-aligned, chips grow leftward ──
    const row2Y = row1Y + 40;

    let hasBonuses = false;
    let bx = AI_AREA_X;
    const bonusChips: { color: GemColor; count: number }[] = [];
    for (const c of GEM_COLORS) {
      if (bonuses[c] === 0) continue;
      hasBonuses = true;
      bonusChips.push({ color: c, count: bonuses[c] });
    }

    // Draw chips right-to-left
    for (let i = bonusChips.length - 1; i >= 0; i--) {
      bx -= 16;
      const chip = this.add.rectangle(bx, row2Y + 16, 32, 26, GEM_FILL[bonusChips[i].color], 0.8);
      chip.setStrokeStyle(1, 0x888888);
      this.aiContainer.add(chip);
      const ct = this.add.text(
        bx, row2Y + 16, `${bonusChips[i].count}`,
        { fontSize: '16px', fontStyle: 'bold', color: GEM_TEXT_COLOR[bonusChips[i].color], fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.aiContainer.add(ct);
      bx -= 28;
    }

    if (hasBonuses) {
      const bonusLabel = this.add.text(
        bx - 5, row2Y + 4, 'Bonuses:',
        { fontSize: '15px', color: '#aaaaaa', fontFamily: FONT_FAMILY },
      ).setOrigin(1, 0);
      this.aiContainer.add(bonusLabel);
    } else {
      const bonusLabelNone = this.add.text(
        AI_AREA_X, row2Y + 4, 'Bonuses: (none)',
        { fontSize: '15px', color: '#666666', fontFamily: FONT_FAMILY },
      ).setOrigin(1, 0);
      this.aiContainer.add(bonusLabelNone);
    }

    // ── Row 3: Reserved + Cards counts ──
    const row3Y = row2Y + 38;

    const cardCount = ai.purchasedCards.length;
    const cardText = this.add.text(
      AI_AREA_X, row3Y + 4, `Cards: ${cardCount}`,
      { fontSize: '15px', color: '#888888', fontFamily: FONT_FAMILY },
    ).setOrigin(1, 0);
    this.aiContainer.add(cardText);

    if (ai.reservedCards.length > 0) {
      const resText = this.add.text(
        AI_AREA_X - 110, row3Y + 4, `Reserved: ${ai.reservedCards.length}`,
        { fontSize: '15px', color: '#ccaa66', fontFamily: FONT_FAMILY },
      ).setOrigin(1, 0);
      this.aiContainer.add(resText);
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

    const by = ACTION_Y;
    const centerX = GAME_W / 2;  // 640

    if (this.turnPhase === 'player-turn') {
      // Calculate total width to centre the action bar
      const availSame = GEM_COLORS.filter(
        c => tokenCount(this.session.tokenSupply, c) >= 4,
      );
      // Take Tokens button (155) + gap (30) + Take2 label (80) + circles (54 each)
      let totalW = 155;  // Take Tokens button
      if (availSame.length > 0) {
        totalW += 30 + 80 + availSame.length * 54;
      }
      let bx = centerX - totalW / 2;

      // Take Tokens button
      const takeBtn = this.createActionButton(bx, by, 'Take Tokens', () => {
        this.soundManager?.play(SFX_KEYS.UI_CLICK);
        this.selectedTokens = [];
        this.setPhase('selecting-tokens');
      });
      this.actionContainer.add(takeBtn);
      bx += 185;

      // Take 2 Same buttons
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
      // Calculate total width: selected label (290) + confirm (155+gap) + cancel (155)
      const canConfirm = this.isValidTokenSelection();
      let totalW = 290 + (canConfirm ? 155 : 0) + 155;
      let bx = centerX - totalW / 2;

      // Show selected tokens and confirm/cancel buttons
      const selLabel = this.add.text(
        bx, by - 2, `Selected: ${this.selectedTokens.map(c => gemAbbrev(c)).join(' ') || '(none)'}`,
        { fontSize: '19px', fontStyle: 'bold', color: '#44ff44', fontFamily: FONT_FAMILY },
      );
      this.actionContainer.add(selLabel);
      bx += 290;

      // Confirm button (enabled when valid selection)
      if (canConfirm) {
        const confirmBtn = this.createActionButton(bx, by, 'Confirm', () => {
          this.soundManager?.play(SFX_KEYS.TOKEN_TAKE);
          this.executeTakeDifferent();
        });
        this.actionContainer.add(confirmBtn);
        bx += 155;
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
        dismissOverlay(this.overlayObjects);
        this.overlayObjects = [];
        this.executePurchase(card.id);
      });
      this.overlayObjects.push(buyBtn);
      bx += 105;
    }

    const player = this.session.players[0];
    if (player.reservedCards.length < 3) {
      const resBtn = createOverlayButton(this, bx, GAME_H / 2 + 40, '[ Reserve ]');
      resBtn.on('pointerdown', () => {
        dismissOverlay(this.overlayObjects);
        this.overlayObjects = [];
        this.executeReserve(card.id);
      });
      this.overlayObjects.push(resBtn);
      bx += 105;
    }

    const cancelBtn = createOverlayButton(this, bx, GAME_H / 2 + 40, '[ Cancel ]');
    cancelBtn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      dismissOverlay(this.overlayObjects);
      this.overlayObjects = [];
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
    const playerIndex = this.session.currentPlayerIndex;
    try {
      const result = executeTurn(this.session, action);

      // Play noble visit sound
      if (result.nobleVisit) {
        this.soundManager?.play(SFX_KEYS.NOBLE_VISIT);
        this.showToast(`Noble visits you! +3 prestige`);
      }

      if (result.tokensOverLimit > 0) {
        // Need to discard tokens — defer recording until after discard
        this.pendingPlayerIndex = playerIndex;
        this.pendingAction = action;
        this.pendingResult = result;
        this.refreshAll();
        this.showDiscardDialog(result.tokensOverLimit);
        return;
      }

      // No discard needed — record immediately
      this.recorder?.recordTurn(playerIndex, action, result, null);
      this.afterTurnComplete(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid action';
      this.showToast(msg);
      this.setPhase('player-turn');
    }
  }

  private executeDiscard(): void {
    try {
      const tokenDiscard = { tokens: this.discardSelection as Record<string, number> };
      const result = discardTokens(this.session, tokenDiscard);
      this.discardContainer.removeAll(true);

      // Record the deferred turn (action + discard)
      if (this.pendingAction && this.pendingResult) {
        this.recorder?.recordTurn(
          this.pendingPlayerIndex,
          this.pendingAction,
          this.pendingResult,
          tokenDiscard,
        );
      }
      this.pendingPlayerIndex = -1;
      this.pendingAction = null;
      this.pendingResult = null;

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
      let tokenDiscard = null;
      if (result.tokensOverLimit > 0) {
        const discard = this.aiPlayer.chooseDiscard(
          this.session, aiIndex, result.tokensOverLimit,
        );
        tokenDiscard = discard;
        discardTokens(this.session, discard);
      }

      // Record AI turn
      this.recorder?.recordTurn(aiIndex, action, result, tokenDiscard);

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

    const winnerIdx = getWinnerIndex(this.session);

    // Finalize and auto-save the transcript
    if (this.recorder && !this.recorder.isSealed()) {
      const transcript = this.recorder.finalize(winnerIdx);
      this.autoSaveTranscript(transcript);
    }

    this.gameEvents.emit('game-ended', {
      finalTurnNumber: 0,
      winnerIndex: winnerIdx,
    });

    const overlay = createOverlayBackground(
      this,
      { depth: 10, alpha: 0.01 },
      { width: 520, height: 340, alpha: 0.9 },
    );
    this.overlayObjects.push(...overlay.objects);

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
      dismissOverlay(this.overlayObjects);
      this.overlayObjects = [];
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

  // ── Replay: load board state ─────────────────────────────

  /**
   * Inject a board state snapshot for the replay tool.
   *
   * Called by the replay adapter via `page.evaluate()`.
   * Updates all visual elements to reflect the given state,
   * then emits `state-settled` so the replay tool can take a
   * screenshot.
   *
   * Only available when `?mode=replay` is in the URL.
   */
  public loadBoardState(state: {
    playerStates: PlayerSnapshot[];
    market: MarketSnapshot;
    tokenSupply: GemTokens;
    nobles: NobleTile[];
    phase: SplendorPhase;
    currentPlayerIndex: number;
    stepIndex?: number;
  }): void {
    if (!this.replayMode) {
      throw new Error(
        'loadBoardState() is only available in replay mode (?mode=replay)',
      );
    }

    // Reconstruct market as Record<Tier, MarketRow> from snapshot
    const market = {} as Record<Tier, { visible: (DevelopmentCard | null)[]; deck: DevelopmentCard[] }>;
    for (const tierSnap of state.market) {
      market[tierSnap.tier] = {
        visible: tierSnap.visible,
        // Deck contents aren't visible — only length matters for display.
        // refreshMarket() reads market.deck.length for the deck-back count.
        deck: new Array(tierSnap.deckCount).fill(null),
      };
    }

    // Reconstruct player states
    const players = state.playerStates.map((ps) => ({
      name: ps.name,
      isAI: ps.isAI,
      tokens: { ...ps.tokens },
      purchasedCards: [...ps.purchasedCards],
      reservedCards: [...ps.reservedCards],
      nobles: [...ps.nobles],
    }));

    // Build a minimal session for rendering
    this.session = {
      players,
      market,
      tokenSupply: { ...state.tokenSupply },
      nobles: [...state.nobles],
      phase: state.phase,
      currentPlayerIndex: state.currentPlayerIndex,
      startingPlayerIndex: 0,
      triggerPlayerIndex: -1,
      rng: Math.random,
    } as SplendorSession;

    // Update all visuals
    this.refreshAll();

    // Track replay step for state-settled payload
    if (state.stepIndex !== undefined) {
      this.replayStepIndex = state.stepIndex;
    }

    // Signal board is visually stable
    this.emitStateSettled();
  }

  // ── Transcript persistence ──────────────────────────────

  /**
   * Auto-save a finalized transcript to browser storage.
   * Fires and forgets -- errors are logged but do not disrupt gameplay.
   */
  private autoSaveTranscript(transcript: import('../GameTranscript').SplendorTranscript): void {
    transcriptStore.save('splendor', transcript).then(
      (stored) => {
        if (stored) {
          console.info(
            `[SplendorScene] Transcript saved (${stored.id}) via ${stored.gameType}`,
          );
        } else {
          console.warn('[SplendorScene] Transcript not saved -- no storage backend available');
        }
      },
      (err) => {
        console.error('[SplendorScene] Failed to auto-save transcript:', err);
      },
    );
  }

  // ── State-settled emission ──────────────────────────────

  /**
   * Emit state-settled when the board is visually stable and safe
   * to screenshot. Uses the replay step index as the turn number.
   */
  private emitStateSettled(): void {
    this.gameEvents.emit('state-settled', {
      turnNumber: this.replayStepIndex,
      phase: 'playing' as const,
    });
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
    dismissOverlay(this.overlayObjects);
    this.overlayObjects = [];
    this.discardContainer?.removeAll(true);
  }
}
