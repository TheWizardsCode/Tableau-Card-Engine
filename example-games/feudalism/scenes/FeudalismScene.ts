/**
 * FeudalismScene -- the main Phaser scene for Feudalism.
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

import type { GemColor, GemOrGold, GemTokens, DevelopmentCard, NobleTile, Tier } from '../FeudalismCards';
import {
  GEM_COLORS,
  ALL_TOKEN_COLORS,
  tokenCount,
  totalTokens,
  gemAbbrev,
  gemDisplayName,
  formatCost,
} from '../FeudalismCards';
import type {
  FeudalismSession,
  FeudalismPhase,
  TurnAction,
  TurnResult,
} from '../FeudalismGame';
import {
  setupFeudalismGame,
  executeTurn,
  discardTokens,
  getPrestige,
  getBonuses,
  canAfford,
  isGameOver,
  getWinnerIndex,
} from '../FeudalismGame';
import { FeudalismAiPlayer, GreedyStrategy } from '../AiStrategy';
import { FeudalismTranscriptRecorder } from '../GameTranscript';
import type { MarketSnapshot, PlayerSnapshot } from '../GameTranscript';
import { TranscriptStore } from '../../../src/core-engine/TranscriptStore';
import { autoSaveTranscript } from '../../../src/core-engine/autoSaveTranscript';
import type { EventSoundMapping } from '../../../src/core-engine/SoundManager';
import {
  CardGameScene,
  GAME_W, GAME_H, FONT_FAMILY,
  createOverlayBackground, createOverlayButton, createOverlayMenuButton,
  dismissOverlay,
  createSceneTitle, createSceneMenuButton,
  moveGameObject,
} from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import helpContent from '../help-content.json';

// ── Constants ───────────────────────────────────────────────

const ANIM_DURATION = 400;

/** Duration of card/noble movement tweens in ms. */
const MOVE_DURATION = 700;

/** Pre-pause before AI action animations in ms. */
const AI_PRE_PAUSE = 1000;

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
const LOWER_BOX_H = 186;      // fixed height for player/AI section boxes (room for reserved cards)

// Player area — left half of lower band
const PLAYER_AREA_X = 20;
const PLAYER_AREA_Y = LOWER_TOP;

// AI area — right half of lower band (right-aligned / mirrored)
const AI_AREA_X = 1260;        // RIGHT edge for right-aligned text
const AI_AREA_Y = LOWER_TOP;

// Divider between player and AI areas
const DIVIDER_X = 640;

// Action buttons and instructions — centred at bottom
// ACTION_Y must ensure button top (ACTION_Y - 21) is well below section box bottom
// Section box bottom = (LOWER_TOP - SECTION_BOX_PAD) + LOWER_BOX_H = 630
const ACTION_Y = 660;          // action buttons Y (top edge at 639, ~9px below box bottom 630)
const INSTRUCTION_Y = 696;     // instruction text Y (centred horizontally)

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

export class FeudalismScene extends CardGameScene {
  // Game state
  private session!: FeudalismSession;
  private aiPlayer!: FeudalismAiPlayer;
  private turnPhase: TurnPhase = 'player-turn';

  // Token selection state
  private selectedTokens: GemColor[] = [];
  private discardSelection: Partial<Record<GemOrGold, number>> = {};
  private discardNeeded = 0;

  // Transcript recording
  private recorder: FeudalismTranscriptRecorder | null = null;

  /** Tracks the replay step index for state-settled payloads. */
  private replayStepIndex: number = -1;

  // Pending turn state for recording (deferred across discard step)
  private pendingPlayerIndex: number = -1;
  private pendingAction: TurnAction | null = null;
  private pendingResult: TurnResult | null = null;

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

  // Overlay cleanup
  private overlayObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: 'FeudalismScene' });
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
    this.detectReplayMode();

    // Event system
    this.initEventSystem();

    if (this.replayMode) {
      // In replay mode: create minimal UI, skip game setup.
      // The replay tool will call loadBoardState() to inject state.
      this.createHeader();
      this.createContainers();
      this.createInstructions();
      this.createPrestigeDisplay();

      // Emit state-settled so the replay tool knows the scene is ready
      this.emitStateSettled(this.replayStepIndex, 'playing');
      return;
    }

    // Sound system
    const mapping: EventSoundMapping = {
      'card-drawn': SFX_KEYS.TOKEN_TAKE,
      'turn-started': SFX_KEYS.TURN_CHANGE,
      'game-ended': SFX_KEYS.GAME_END,
    };
    this.initSoundSystem(Object.values(SFX_KEYS), mapping);

    // Setup game
    this.session = setupFeudalismGame({
      playerCount: 2,
      playerNames: ['You', 'AI'],
      isAI: [false, true],
    });
    this.aiPlayer = new FeudalismAiPlayer(GreedyStrategy);

    // Create transcript recorder
    this.recorder = new FeudalismTranscriptRecorder(this.session);

    // Create UI
    this.createHeader();
    this.createContainers();
    this.createInstructions();
    this.createPrestigeDisplay();
    this.initHelpPanel(helpContent as HelpSection[]);
    this.initSettingsPanel();

    // Initial render
    this.refreshAll();
    this.setPhase('player-turn');
  }

  // ── UI creation ─────────────────────────────────────────

  private createHeader(): void {
    createSceneMenuButton(this);
    createSceneTitle(this, 'Feudalism');
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
    const playerBoxH = LOWER_BOX_H;
    this.drawSectionBox(playerBoxX, playerBoxY, playerBoxW, playerBoxH);

    // AI area box
    const aiBoxX = DIVIDER_X + p;
    const aiBoxY = LOWER_TOP - p;
    const aiBoxW = AI_AREA_X - DIVIDER_X + p;
    const aiBoxH = LOWER_BOX_H;
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
    const bonuses = getBonuses(player);

    // ── Row 0: Prestige badge + tokens ──
    const row0Y = PLAYER_AREA_Y;

    // Prominent prestige display
    const prestigeBg = this.add.rectangle(
      PLAYER_AREA_X + 44, row0Y + 10,
      90, 24, 0x443300, 0.6,
    );
    prestigeBg.setStrokeStyle(1, 0x887744);
    this.playerContainer.add(prestigeBg);

    const prestigeLabel = this.add.text(
      PLAYER_AREA_X + 44, row0Y + 10,
      `★ ${prestige} / 15`,
      { fontSize: '16px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY },
    ).setOrigin(0.5);
    this.playerContainer.add(prestigeLabel);

    // Nobles collected
    if (player.nobles.length > 0) {
      const nobleLabel = this.add.text(
        PLAYER_AREA_X + 100, row0Y + 2,
        `Nobles: ${player.nobles.length}`,
        { fontSize: '14px', color: '#aa88cc', fontFamily: FONT_FAMILY },
      );
      this.playerContainer.add(nobleLabel);
    }

    // Tokens (right of prestige)
    const tokLabel = this.add.text(
      PLAYER_AREA_X + 200, row0Y + 4, 'Tokens:',
      { fontSize: '15px', color: '#aaaaaa', fontFamily: FONT_FAMILY },
    );
    this.playerContainer.add(tokLabel);

    let tx = PLAYER_AREA_X + 280;
    const tokCenterY = row0Y + 14;
    for (const c of ALL_TOKEN_COLORS) {
      const n = tokenCount(player.tokens, c);
      if (n === 0) continue;

      const circle = this.add.circle(tx, tokCenterY, 14, GEM_FILL[c]);
      circle.setStrokeStyle(1, 0xffffff);
      this.playerContainer.add(circle);

      const ct = this.add.text(
        tx, tokCenterY, `${n}`,
        { fontSize: '13px', fontStyle: 'bold', color: GEM_TEXT_COLOR[c], fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.playerContainer.add(ct);

      tx += 34;
    }

    if (totalTokens(player.tokens) === 0) {
      const noTok = this.add.text(
        tx + 5, tokCenterY, '(none)',
        { fontSize: '14px', color: '#666666', fontFamily: FONT_FAMILY },
      ).setOrigin(0, 0.5);
      this.playerContainer.add(noTok);
    }

    // ── Row 1: Gem placeholder sprites (all 5 always shown) ──
    const row1Y = row0Y + 32;
    const SLOT_W = 38;
    const SLOT_H = 50;
    const SLOT_GAP = 8;

    let sx = PLAYER_AREA_X;
    for (const c of GEM_COLORS) {
      const count = bonuses[c];
      const hasCards = count > 0;
      const alpha = hasCards ? 0.7 : 0.15;

      // Card-shaped placeholder
      const slot = this.add.rectangle(
        sx + SLOT_W / 2, row1Y + SLOT_H / 2,
        SLOT_W, SLOT_H, GEM_FILL[c], alpha,
      );
      slot.setStrokeStyle(1, hasCards ? 0xaaaaaa : 0x555555, hasCards ? 0.8 : 0.3);
      this.playerContainer.add(slot);

      // Gem abbreviation at top
      const abbr = this.add.text(
        sx + SLOT_W / 2, row1Y + 10,
        gemAbbrev(c),
        { fontSize: '11px', fontStyle: 'bold', color: hasCards ? GEM_TEXT_COLOR[c] : '#666666', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.playerContainer.add(abbr);

      // Count
      const countText = this.add.text(
        sx + SLOT_W / 2, row1Y + SLOT_H / 2 + 6,
        `${count}`,
        { fontSize: '18px', fontStyle: 'bold', color: hasCards ? '#ffffff' : '#444444', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.playerContainer.add(countText);

      sx += SLOT_W + SLOT_GAP;
    }

    // ── Row 2: Reserved cards (conditional) ──
    const row2Y = row1Y + SLOT_H + 6;
    if (player.reservedCards.length > 0) {
      const resLabel = this.add.text(
        PLAYER_AREA_X, row2Y + 4, `Reserved (${player.reservedCards.length}):`,
        { fontSize: '15px', color: '#ccaa66', fontFamily: FONT_FAMILY },
      );
      this.playerContainer.add(resLabel);

      let rx = PLAYER_AREA_X + 150;
      for (const card of player.reservedCards) {
        const cardContainer = this.createSmallCard(rx, row2Y - 2, card, true);
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

    // ── Row 0: Prestige badge + tokens — right-aligned ──
    const row0Y = AI_AREA_Y;

    // Prominent prestige display
    const prestigeBg = this.add.rectangle(
      AI_AREA_X - 44, row0Y + 10,
      90, 24, 0x443300, 0.6,
    );
    prestigeBg.setStrokeStyle(1, 0x887744);
    this.aiContainer.add(prestigeBg);

    const prestigeLabel = this.add.text(
      AI_AREA_X - 44, row0Y + 10,
      `★ ${prestige} / 15`,
      { fontSize: '16px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY },
    ).setOrigin(0.5);
    this.aiContainer.add(prestigeLabel);

    // Nobles collected
    if (ai.nobles.length > 0) {
      const nobleLabel = this.add.text(
        AI_AREA_X - 100, row0Y + 2,
        `Nobles: ${ai.nobles.length}`,
        { fontSize: '14px', color: '#aa88cc', fontFamily: FONT_FAMILY },
      ).setOrigin(1, 0);
      this.aiContainer.add(nobleLabel);
    }

    // Tokens (left of prestige)
    const tokLabel = this.add.text(
      AI_AREA_X - 200, row0Y + 4, 'Tokens:',
      { fontSize: '15px', color: '#aaaaaa', fontFamily: FONT_FAMILY },
    ).setOrigin(1, 0);
    this.aiContainer.add(tokLabel);

    let tx = AI_AREA_X - 220;
    const tokCenterY = row0Y + 14;
    let hasTokens = false;
    const tokenColors = [...ALL_TOKEN_COLORS].reverse();
    for (const c of tokenColors) {
      const n = tokenCount(ai.tokens, c);
      if (n === 0) continue;
      hasTokens = true;

      const circle = this.add.circle(tx, tokCenterY, 14, GEM_FILL[c]);
      circle.setStrokeStyle(1, 0xffffff);
      this.aiContainer.add(circle);

      const ct = this.add.text(
        tx, tokCenterY, `${n}`,
        { fontSize: '13px', fontStyle: 'bold', color: GEM_TEXT_COLOR[c], fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.aiContainer.add(ct);

      tx -= 34;
    }

    if (!hasTokens) {
      const noTok = this.add.text(
        AI_AREA_X - 220, tokCenterY, '(none)',
        { fontSize: '14px', color: '#666666', fontFamily: FONT_FAMILY },
      ).setOrigin(1, 0.5);
      this.aiContainer.add(noTok);
    }

    // ── Row 1: Gem placeholder sprites (all 5 always shown) — right-aligned ──
    const row1Y = row0Y + 32;
    const SLOT_W = 38;
    const SLOT_H = 50;
    const SLOT_GAP = 8;

    // Draw right-to-left so rightmost gem is near AI_AREA_X
    let sx = AI_AREA_X - SLOT_W;
    const gemColorsReversed = [...GEM_COLORS].reverse();
    for (const c of gemColorsReversed) {
      const count = bonuses[c];
      const hasCards = count > 0;
      const alpha = hasCards ? 0.7 : 0.15;

      const slot = this.add.rectangle(
        sx + SLOT_W / 2, row1Y + SLOT_H / 2,
        SLOT_W, SLOT_H, GEM_FILL[c], alpha,
      );
      slot.setStrokeStyle(1, hasCards ? 0xaaaaaa : 0x555555, hasCards ? 0.8 : 0.3);
      this.aiContainer.add(slot);

      // Gem abbreviation at top
      const abbr = this.add.text(
        sx + SLOT_W / 2, row1Y + 10,
        gemAbbrev(c),
        { fontSize: '11px', fontStyle: 'bold', color: hasCards ? GEM_TEXT_COLOR[c] : '#666666', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.aiContainer.add(abbr);

      // Count
      const countText = this.add.text(
        sx + SLOT_W / 2, row1Y + SLOT_H / 2 + 6,
        `${count}`,
        { fontSize: '18px', fontStyle: 'bold', color: hasCards ? '#ffffff' : '#444444', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5);
      this.aiContainer.add(countText);

      sx -= (SLOT_W + SLOT_GAP);
    }

    // ── Row 2: Reserved + Cards counts ──
    const row2Y = row1Y + SLOT_H + 6;

    const cardCount = ai.purchasedCards.length;
    const cardText = this.add.text(
      AI_AREA_X, row2Y + 4, `Cards: ${cardCount}`,
      { fontSize: '15px', color: '#888888', fontFamily: FONT_FAMILY },
    ).setOrigin(1, 0);
    this.aiContainer.add(cardText);

    if (ai.reservedCards.length > 0) {
      const resText = this.add.text(
        AI_AREA_X - 110, row2Y + 4, `Reserved: ${ai.reservedCards.length}`,
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

    // Bonus gem placeholder sprites (show permanent bonuses for context)
    const bonuses = getBonuses(player);
    const DSLOT_W = 32;
    const DSLOT_H = 42;
    const DSLOT_GAP = 6;
    const totalSlotsW = GEM_COLORS.length * DSLOT_W + (GEM_COLORS.length - 1) * DSLOT_GAP;
    let dsx = GAME_W / 2 - totalSlotsW / 2;
    const dsY = GAME_H / 2 - 76;

    const bonusLabel = this.add.text(
      GAME_W / 2 - totalSlotsW / 2 - 60, dsY + DSLOT_H / 2,
      'Bonuses:',
      { fontSize: '12px', color: '#888888', fontFamily: FONT_FAMILY },
    ).setOrigin(0, 0.5).setDepth(11);
    this.discardContainer.add(bonusLabel);

    for (const c of GEM_COLORS) {
      const count = bonuses[c];
      const hasCards = count > 0;
      const alpha = hasCards ? 0.7 : 0.15;

      const slot = this.add.rectangle(
        dsx + DSLOT_W / 2, dsY + DSLOT_H / 2,
        DSLOT_W, DSLOT_H, GEM_FILL[c], alpha,
      ).setDepth(11);
      slot.setStrokeStyle(1, hasCards ? 0xaaaaaa : 0x555555, hasCards ? 0.8 : 0.3);
      this.discardContainer.add(slot);

      const abbr = this.add.text(
        dsx + DSLOT_W / 2, dsY + 8,
        gemAbbrev(c),
        { fontSize: '10px', fontStyle: 'bold', color: hasCards ? GEM_TEXT_COLOR[c] : '#666666', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5).setDepth(11);
      this.discardContainer.add(abbr);

      const countText = this.add.text(
        dsx + DSLOT_W / 2, dsY + DSLOT_H / 2 + 5,
        `${count}`,
        { fontSize: '15px', fontStyle: 'bold', color: hasCards ? '#ffffff' : '#444444', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5).setDepth(11);
      this.discardContainer.add(countText);

      dsx += DSLOT_W + DSLOT_GAP;
    }

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

  // ── Animation helpers ────────────────────────────────────

  /**
   * Returns the centre (x, y) of a market card slot given its tier and
   * column index (0-3).
   */
  private getMarketCardCenter(tier: Tier, col: number): { x: number; y: number } {
    const tiers: Tier[] = [3, 2, 1];
    const row = tiers.indexOf(tier);
    const y = MARKET_Y + row * (MARKET_CARD_H + MARKET_TIER_GAP) + MARKET_CARD_H / 2;
    const x = MARKET_X + col * (MARKET_CARD_W + MARKET_CARD_GAP) + MARKET_CARD_W / 2;
    return { x, y };
  }

  /**
   * Returns the centre (x, y) of a deck back for the given tier.
   */
  private getDeckCenter(tier: Tier): { x: number; y: number } {
    const tiers: Tier[] = [3, 2, 1];
    const row = tiers.indexOf(tier);
    const y = MARKET_Y + row * (MARKET_CARD_H + MARKET_TIER_GAP) + MARKET_CARD_H / 2;
    return { x: DECK_X, y };
  }

  /**
   * Returns the destination centre (x, y) for a card moving to the
   * given player's card area.  playerIndex 0 = human, 1 = AI.
   */
  private getPlayerCardDest(playerIndex: number): { x: number; y: number } {
    if (playerIndex === 0) {
      // Player gem slots area — centre of the Row 1 slot band
      const row1Y = PLAYER_AREA_Y + 32;
      const SLOT_W = 38;
      const SLOT_H = 50;
      const SLOT_GAP = 8;
      const totalW = GEM_COLORS.length * SLOT_W + (GEM_COLORS.length - 1) * SLOT_GAP;
      return {
        x: PLAYER_AREA_X + totalW / 2,
        y: row1Y + SLOT_H / 2,
      };
    }
    // AI area — centre of the AI gem slots band (right-aligned)
    const row1Y = AI_AREA_Y + 32;
    const SLOT_W = 38;
    const SLOT_H = 50;
    const SLOT_GAP = 8;
    const totalW = GEM_COLORS.length * SLOT_W + (GEM_COLORS.length - 1) * SLOT_GAP;
    return {
      x: AI_AREA_X - totalW / 2,
      y: row1Y + SLOT_H / 2,
    };
  }

  /**
   * Returns the destination centre (x, y) for a card moving to the
   * given player's reserved area.
   */
  private getPlayerReserveDest(playerIndex: number): { x: number; y: number } {
    if (playerIndex === 0) {
      const row2Y = PLAYER_AREA_Y + 32 + 50 + 6;  // row1Y + SLOT_H + gap
      return {
        x: PLAYER_AREA_X + 150 + 40,   // first reserved card centre
        y: row2Y + 26 - 2,             // centre of small card
      };
    }
    // AI reserved area — right side
    const row2Y = AI_AREA_Y + 32 + 50 + 6;
    return {
      x: AI_AREA_X - 80,
      y: row2Y + 14,
    };
  }

  /**
   * Returns the centre (x, y) of a noble tile at the given index in the
   * noble display (before it was removed from session).
   */
  private getNobleCenter(nobleIndex: number): { x: number; y: number } {
    const y = MARKET_Y + nobleIndex * (MARKET_CARD_H + MARKET_TIER_GAP) + NOBLE_H / 2;
    return { x: NOBLE_X + NOBLE_W / 2, y };
  }

  /**
   * Returns the destination for a noble tile earned by the given player.
   */
  private getPlayerNobleDest(playerIndex: number): { x: number; y: number } {
    if (playerIndex === 0) {
      return { x: PLAYER_AREA_X + 120, y: PLAYER_AREA_Y + 10 };
    }
    return { x: AI_AREA_X - 120, y: AI_AREA_Y + 10 };
  }

  /**
   * Find the column index of a card in the market by its id.
   * Must be called BEFORE executeTurn() removes the card from the market.
   */
  private findCardMarketSlot(cardId: number): { tier: Tier; col: number } | null {
    for (const tier of [3, 2, 1] as Tier[]) {
      const visible = this.session.market[tier].visible;
      for (let col = 0; col < visible.length; col++) {
        if (visible[col]?.id === cardId) {
          return { tier, col };
        }
      }
    }
    return null;
  }

  /**
   * Create a temporary "flying" card sprite for animation.
   * Returns a container placed at (cx, cy) with depth 15 so it sits
   * above the refreshed scene.
   */
  private createFlyingCard(
    cx: number, cy: number, card: DevelopmentCard,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(cx, cy).setDepth(15);
    const bonusFill = GEM_FILL[card.bonus];

    const bg = this.add.rectangle(0, 0, MARKET_CARD_W, MARKET_CARD_H, 0x1a1a1a);
    bg.setStrokeStyle(2, 0xffdd44);
    container.add(bg);

    // Bonus color bar at top
    const bonusBar = this.add.rectangle(
      0, -MARKET_CARD_H / 2 + 12, MARKET_CARD_W - 4, 22, bonusFill,
    );
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

    // Cost chips
    const costEntries: { color: GemColor; count: number }[] = [];
    for (const c of GEM_COLORS) {
      const n = card.cost[c] ?? 0;
      if (n > 0) costEntries.push({ color: c, count: n });
    }
    const costStartX = -(costEntries.length - 1) * 15;
    for (let i = 0; i < costEntries.length; i++) {
      const chipX = costStartX + i * 30;
      const chipY = MARKET_CARD_H / 2 - 22;
      const chip = this.add.circle(chipX, chipY, 13, GEM_FILL[costEntries[i].color], 0.9);
      chip.setStrokeStyle(1, 0x888888);
      container.add(chip);
      const ct = this.add.text(chipX, chipY, `${costEntries[i].count}`, {
        fontSize: '14px', fontStyle: 'bold',
        color: GEM_TEXT_COLOR[costEntries[i].color], fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
      container.add(ct);
    }

    return container;
  }

  /**
   * Create a temporary "flying" noble sprite for animation.
   */
  private createFlyingNoble(
    cx: number, cy: number, noble: NobleTile,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(cx, cy).setDepth(15);

    const bg = this.add.rectangle(0, 0, NOBLE_W, NOBLE_H, 0x6633aa, 0.9);
    bg.setStrokeStyle(2, 0xffdd44);
    container.add(bg);

    const pts = this.add.text(0, -20, '3 pt', {
      fontSize: '20px', fontStyle: 'bold', color: '#ffdd44', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    container.add(pts);

    const label = this.add.text(0, 2, 'Noble', {
      fontSize: '13px', color: '#ccaaee', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    container.add(label);

    // Requirements
    const reqs: { color: GemColor; count: number }[] = [];
    for (const c of GEM_COLORS) {
      const n = noble.requirements[c] ?? 0;
      if (n > 0) reqs.push({ color: c, count: n });
    }
    const chipSpacing = 30;
    const reqStartX = -(reqs.length - 1) * chipSpacing / 2;
    for (let j = 0; j < reqs.length; j++) {
      const rx = reqStartX + j * chipSpacing;
      const ry = NOBLE_H / 2 - 26;
      const chip = this.add.circle(rx, ry, 13, GEM_FILL[reqs[j].color], 0.9);
      chip.setStrokeStyle(1, 0x888888);
      container.add(chip);
      const ct = this.add.text(rx, ry, `${reqs[j].count}`, {
        fontSize: '15px', fontStyle: 'bold',
        color: GEM_TEXT_COLOR[reqs[j].color], fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
      container.add(ct);
    }

    return container;
  }

  /**
   * Create a temporary deck-back sprite for the market refill animation.
   */
  private createFlyingDeckBack(
    cx: number, cy: number, tier: Tier,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(cx, cy).setDepth(15);
    const deckW = 100;
    const deckH = MARKET_CARD_H - 16;

    const bg = this.add.rectangle(0, 0, deckW, deckH, 0x334433, 0.8);
    bg.setStrokeStyle(1, 0x556655);
    container.add(bg);

    const text = this.add.text(0, 0, `T${tier}`, {
      fontSize: '18px', fontStyle: 'bold', color: '#aaddaa', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    container.add(text);

    return container;
  }

  /**
   * Play the complete animation sequence for a card action.
   *
   * 1. Card flies from source to destination.
   * 2. If the card came from a market slot with a replacement, the
   *    replacement slides from the deck to the vacated slot.
   * 3. If a noble was earned, the noble flies to the player area.
   * 4. On complete, the provided callback fires.
   */
  private playCardAnimation(
    sourcePos: { x: number; y: number },
    destPos: { x: number; y: number },
    card: DevelopmentCard,
    marketSlot: { tier: Tier; col: number } | null,
    nobleVisit: NobleTile | null,
    nobleSourceIndex: number,
    playerIndex: number,
    onAllComplete: () => void,
  ): void {
    const flyingCard = this.createFlyingCard(sourcePos.x, sourcePos.y, card);

    moveGameObject({
      scene: this,
      target: flyingCard,
      destX: destPos.x,
      destY: destPos.y,
      duration: MOVE_DURATION,
      onComplete: () => {
        flyingCard.destroy();

        // Chain: market refill animation
        if (marketSlot) {
          this.playMarketRefillAnimation(marketSlot.tier, marketSlot.col, () => {
            this.chainNobleAnimation(nobleVisit, nobleSourceIndex, playerIndex, onAllComplete);
          });
        } else {
          this.chainNobleAnimation(nobleVisit, nobleSourceIndex, playerIndex, onAllComplete);
        }
      },
    });
  }

  /**
   * Play the market refill animation: a card-back slides from the deck
   * position into the vacated market slot.
   */
  private playMarketRefillAnimation(
    tier: Tier, col: number, onComplete: () => void,
  ): void {
    // Check if there is now a card in this slot (replacement was dealt)
    const slotCard = this.session.market[tier].visible[col];
    if (!slotCard) {
      onComplete();
      return;
    }

    const deckPos = this.getDeckCenter(tier);
    const slotPos = this.getMarketCardCenter(tier, col);

    const flyingBack = this.createFlyingDeckBack(deckPos.x, deckPos.y, tier);

    moveGameObject({
      scene: this,
      target: flyingBack,
      destX: slotPos.x,
      destY: slotPos.y,
      duration: MOVE_DURATION * 0.7,
      onComplete: () => {
        flyingBack.destroy();
        // Refresh market to show the actual card in the slot
        this.refreshMarket();
        onComplete();
      },
    });
  }

  /**
   * Chain a noble visit animation if one occurred, otherwise fire onComplete.
   */
  private chainNobleAnimation(
    nobleVisit: NobleTile | null,
    nobleSourceIndex: number,
    playerIndex: number,
    onComplete: () => void,
  ): void {
    if (!nobleVisit || nobleSourceIndex < 0) {
      onComplete();
      return;
    }

    const nobleSource = this.getNobleCenter(nobleSourceIndex);
    const nobleDest = this.getPlayerNobleDest(playerIndex);
    const flyingNoble = this.createFlyingNoble(nobleSource.x, nobleSource.y, nobleVisit);

    moveGameObject({
      scene: this,
      target: flyingNoble,
      destX: nobleDest.x,
      destY: nobleDest.y,
      duration: MOVE_DURATION,
      onComplete: () => {
        flyingNoble.destroy();
        // Refresh to show the updated noble display and player area
        this.refreshNobles();
        this.refreshPlayerArea();
        this.refreshAiArea();
        this.refreshPrestige();
        onComplete();
      },
    });
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

    // Capture source positions BEFORE executeTurn modifies the session
    let marketSlot: { tier: Tier; col: number } | null = null;
    let sourcePos: { x: number; y: number } | null = null;
    let card: DevelopmentCard | null = null;

    if (action.type === 'purchase' && action.cardId != null) {
      // Find card in market or reserved
      marketSlot = this.findCardMarketSlot(action.cardId);
      if (marketSlot) {
        sourcePos = this.getMarketCardCenter(marketSlot.tier, marketSlot.col);
        card = this.session.market[marketSlot.tier].visible[marketSlot.col] ?? null;
      } else {
        // Purchased from reserved — find it
        const reserved = this.session.players[playerIndex].reservedCards;
        card = reserved.find(c => c.id === action.cardId) ?? null;
        // Reserved cards animate from the player's reserved area
        if (card) {
          sourcePos = this.getPlayerReserveDest(playerIndex);
        }
      }
    } else if (action.type === 'reserve' && action.cardId != null) {
      marketSlot = this.findCardMarketSlot(action.cardId);
      if (marketSlot) {
        sourcePos = this.getMarketCardCenter(marketSlot.tier, marketSlot.col);
        card = this.session.market[marketSlot.tier].visible[marketSlot.col] ?? null;
      }
    } else if (action.type === 'reserve' && action.cardId == null) {
      // Reserve from deck — source is deck position
      const tier = action.tier!;
      sourcePos = this.getDeckCenter(tier);
      // We'll get the actual card from the result (it's the top of the deck)
    }

    // Capture noble indices before they change
    const noblesBefore = this.session.nobles.map(n => n.id);

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

      // Determine noble source index (if noble was earned)
      let nobleSourceIndex = -1;
      if (result.nobleVisit) {
        nobleSourceIndex = noblesBefore.indexOf(result.nobleVisit.id);
      }

      // For reserve-from-deck, get the reserved card from the player's hand
      if (action.type === 'reserve' && action.cardId == null && !card) {
        const reserved = this.session.players[playerIndex].reservedCards;
        card = reserved[reserved.length - 1] ?? null;
      }

      // Play animation if we have a card to animate
      if (sourcePos && card && (action.type === 'purchase' || action.type === 'reserve')) {
        const destPos = action.type === 'purchase'
          ? this.getPlayerCardDest(playerIndex)
          : this.getPlayerReserveDest(playerIndex);

        this.setPhase('animating');
        this.refreshAll();

        this.playCardAnimation(
          sourcePos, destPos, card, marketSlot, result.nobleVisit,
          nobleSourceIndex, playerIndex,
          () => this.afterTurnComplete(result),
        );
      } else {
        // No animation (e.g. token actions) — proceed directly
        this.afterTurnComplete(result);
      }
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

    // Describe the AI action for the pre-pause toast
    const toastMsg = this.describeAiAction(action);

    // Capture source positions BEFORE executeTurn modifies the session
    let marketSlot: { tier: Tier; col: number } | null = null;
    let sourcePos: { x: number; y: number } | null = null;
    let card: DevelopmentCard | null = null;

    if (action.type === 'purchase' && action.cardId != null) {
      marketSlot = this.findCardMarketSlot(action.cardId);
      if (marketSlot) {
        sourcePos = this.getMarketCardCenter(marketSlot.tier, marketSlot.col);
        card = this.session.market[marketSlot.tier].visible[marketSlot.col] ?? null;
      } else {
        const reserved = this.session.players[aiIndex].reservedCards;
        card = reserved.find(c => c.id === action.cardId) ?? null;
        if (card) {
          sourcePos = this.getPlayerReserveDest(aiIndex);
        }
      }
    } else if (action.type === 'reserve' && action.cardId != null) {
      marketSlot = this.findCardMarketSlot(action.cardId);
      if (marketSlot) {
        sourcePos = this.getMarketCardCenter(marketSlot.tier, marketSlot.col);
        card = this.session.market[marketSlot.tier].visible[marketSlot.col] ?? null;
      }
    } else if (action.type === 'reserve' && action.cardId == null) {
      const tier = action.tier!;
      sourcePos = this.getDeckCenter(tier);
    }

    const noblesBefore = this.session.nobles.map(n => n.id);

    // Show pre-pause toast, then execute
    this.showToast(toastMsg);

    this.time.delayedCall(AI_PRE_PAUSE, () => {
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

        // Determine noble source index
        let nobleSourceIndex = -1;
        if (result.nobleVisit) {
          nobleSourceIndex = noblesBefore.indexOf(result.nobleVisit.id);
        }

        // For reserve-from-deck, get the reserved card
        if (action.type === 'reserve' && action.cardId == null && !card) {
          const reserved = this.session.players[aiIndex].reservedCards;
          card = reserved[reserved.length - 1] ?? null;
        }

        // Callback after all animations complete
        const afterAnim = () => {
          if (result.gameOver || isGameOver(this.session)) {
            this.time.delayedCall(ANIM_DURATION, () => {
              this.showGameOverOverlay();
            });
            return;
          }

          if (this.session.players[this.session.currentPlayerIndex].isAI) {
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
        };

        // Play animation if we have a card to animate
        if (sourcePos && card && (action.type === 'purchase' || action.type === 'reserve')) {
          const destPos = action.type === 'purchase'
            ? this.getPlayerCardDest(aiIndex)
            : this.getPlayerReserveDest(aiIndex);

          this.refreshAll();

          this.playCardAnimation(
            sourcePos, destPos, card, marketSlot, result.nobleVisit,
            nobleSourceIndex, aiIndex, afterAnim,
          );
        } else {
          // No card animation (token actions) — refresh and transition
          this.refreshAll();
          afterAnim();
        }
      } catch (err) {
        console.error('AI error:', err);
        this.setPhase('player-turn');
      }
    });
  }

  /**
   * Generate a short description of an AI action for the pre-pause toast.
   */
  private describeAiAction(action: TurnAction): string {
    switch (action.type) {
      case 'purchase':
        return 'AI buys a card...';
      case 'reserve':
        return action.cardId != null ? 'AI reserves a card...' : 'AI reserves from deck...';
      case 'take-different':
        return `AI takes ${action.colors.map(c => gemAbbrev(c)).join(', ')} tokens...`;
      case 'take-same':
        return `AI takes 2 ${gemDisplayName(action.color)} tokens...`;
      default:
        return 'AI takes an action...';
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
      autoSaveTranscript(transcriptStore, 'feudalism', transcript, '[FeudalismScene]');
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
    phase: FeudalismPhase;
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
    } as FeudalismSession;

    // Update all visuals
    this.refreshAll();

    // Track replay step for state-settled payload
    if (state.stepIndex !== undefined) {
      this.replayStepIndex = state.stepIndex;
    }

    // Signal board is visually stable
    this.emitStateSettled(this.replayStepIndex, 'playing');
  }

  // ── Test accessors ──────────────────────────────────────

  /**
   * Returns the computed section box rectangles for layout testing.
   * Each rectangle is { x, y, w, h } representing the top-left origin box.
   */
  getSectionBoxRects(): {
    nobles: { x: number; y: number; w: number; h: number };
    market: { x: number; y: number; w: number; h: number };
    supply: { x: number; y: number; w: number; h: number };
    player: { x: number; y: number; w: number; h: number };
    ai: { x: number; y: number; w: number; h: number };
  } {
    const p = SECTION_BOX_PAD;
    const lastCardRight = MARKET_X + 4 * (MARKET_CARD_W + MARKET_CARD_GAP) - MARKET_CARD_GAP;
    return {
      nobles: {
        x: NOBLE_X - p,
        y: MARKET_Y - p - 16,
        w: NOBLE_W + p * 2,
        h: MARKET_TOTAL_H + p * 2 + 16,
      },
      market: {
        x: DECK_X - 90 - p,
        y: MARKET_Y - p - 16,
        w: lastCardRight - (DECK_X - 90 - p) + p,
        h: MARKET_TOTAL_H + p * 2 + 16,
      },
      supply: {
        x: SUPPLY_X - SUPPLY_TOKEN_R - 70 - p,
        y: SUPPLY_Y - SUPPLY_TOKEN_R - p - 16,
        w: SUPPLY_TOKEN_R + 70 + SUPPLY_TOKEN_R + p * 2,
        h: SUPPLY_TOTAL_H + SUPPLY_TOKEN_R * 2 + p * 2 + 16,
      },
      player: {
        x: PLAYER_AREA_X - p,
        y: LOWER_TOP - p,
        w: DIVIDER_X - PLAYER_AREA_X,
        h: LOWER_BOX_H,
      },
      ai: {
        x: DIVIDER_X + p,
        y: LOWER_TOP - p,
        w: AI_AREA_X - DIVIDER_X + p,
        h: LOWER_BOX_H,
      },
    };
  }

  /**
   * Returns the layout constants relevant for action/instruction positioning.
   */
  getLayoutConstants(): {
    actionY: number;
    instructionY: number;
    gameW: number;
    gameH: number;
    actionButtonH: number;
  } {
    return {
      actionY: ACTION_Y,
      instructionY: INSTRUCTION_Y,
      gameW: GAME_W,
      gameH: GAME_H,
      actionButtonH: 42,
    };
  }

  // ── Lifecycle cleanup ───────────────────────────────────

  shutdown(): void {
    dismissOverlay(this.overlayObjects);
    this.overlayObjects = [];
    this.discardContainer?.removeAll(true);
    this.shutdownBase();
  }
}
