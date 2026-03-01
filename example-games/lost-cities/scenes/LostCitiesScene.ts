/**
 * LostCitiesScene — Full interactive Phaser scene for Lost Cities.
 *
 * Layout (1280x720, 3-column):
 *   Left column (~600px):
 *     - Opponent expeditions (5 lanes, top)
 *     - Discard piles (5, center row)
 *     - Player expeditions (5 lanes, bottom)
 *
 *   Middle column (~200px):
 *     - Opponent score (top)
 *     - Draw pile + round indicator (center)
 *     - Player score (bottom, mirroring opponent score)
 *
 *   Right column (~300px):
 *     - Player hand (8 cards, vertical fan, large cards)
 *     - Uses nearly the full vertical height
 *
 * Two-phase turn state machine:
 *   Phase 1 — select a card from hand, then click expedition lane or discard pile
 *   Phase 2 — click draw pile or discard pile to draw
 *   AI plays automatically with configurable delay
 */
import Phaser from 'phaser';
import type {
  ExpeditionColor,
  LostCitiesCard,
} from '../LostCitiesCards';
import {
  EXPEDITION_COLORS,
  EXPEDITION_HEX,
  cardAssetKey,
  compactAssetKey,
  CARD_BACK_KEY,
  HAND_SIZE,
  colorDisplayName,
} from '../LostCitiesCards';
import type {
  LostCitiesSession,
  PlayerId,
  RoundScoreResult,
} from '../LostCitiesGame';
import {
  setupLostCitiesGame,
  executeAction,
  getVisibleState,
  isMatchOver,
  getMatchWinner,
} from '../LostCitiesGame';
import type {
  Phase1Action,
  Phase2Action,
} from '../LostCitiesRules';
import { checkPhase1Legality } from '../LostCitiesRules';
import { scoreRoundDetailed, scoreExpeditionDetailed } from '../LostCitiesScoring';
import {
  LostCitiesAiPlayer,
  GreedyStrategy,
} from '../AiStrategy';
import {
  LCTranscriptRecorder,
} from '../GameTranscript';
import { TranscriptStore } from '../../../src/core-engine/TranscriptStore';
import { autoSaveTranscript } from '../../../src/core-engine/autoSaveTranscript';
import type { EventSoundMapping } from '../../../src/core-engine/SoundManager';
import {
  CardGameScene,
  GAME_W,
  GAME_H,
  FONT_FAMILY,
  createSceneHeader,
  createOverlayBackground,
  createOverlayButton,
  createOverlayMenuButton,
  dismissOverlay,
  shakeIllegalMove,
  flipCard,
  moveGameObject,
} from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import helpContent from '../help-content.json';

// ── Layout constants (3-column layout) ────────────────────
const CARD_W = 95;
const CARD_H = 130;

// ── Left column: Expeditions + Discards ───────────────────
const TABLEAU_LEFT = 40;
const LANE_GAP = 18;
const LANE_STEP = CARD_W + LANE_GAP;

function laneX(index: number): number {
  return TABLEAU_LEFT + index * LANE_STEP + CARD_W / 2;
}

const TABLEAU_RIGHT = TABLEAU_LEFT + 5 * LANE_STEP - LANE_GAP + CARD_W / 2;

// ── Right column: Scores, Draw pile, Round ────────────────
// Positioned at far right of canvas
const MID_COL_W = 190;
const MID_COL_X = GAME_W - MID_COL_W - 16;
const MID_COL_CENTER = MID_COL_X + MID_COL_W / 2;

// ── Middle column: Player hand + AI hand ──────────────────
// Two separate bordered boxes evenly spaced between the tableau and the info column.
// The left margin, center gap, and right margin are all equal.
const HAND_BOX_W = 112;        // card width (100) + 2 * BOX_PAD (6) per box
const HAND_AVAIL = MID_COL_X - TABLEAU_RIGHT;                     // total horizontal space
const HAND_EVEN_GAP = Math.floor((HAND_AVAIL - 2 * HAND_BOX_W) / 3); // equal spacing
const PLAYER_HAND_BOX_X = TABLEAU_RIGHT + HAND_EVEN_GAP;          // left edge of player box
const AI_HAND_BOX_X = PLAYER_HAND_BOX_X + HAND_BOX_W + HAND_EVEN_GAP; // left edge of AI box
const PLAYER_HAND_CENTER = PLAYER_HAND_BOX_X + HAND_BOX_W / 2;
const AI_HAND_CENTER = AI_HAND_BOX_X + HAND_BOX_W / 2;

// Header
const HEADER_H = 48;

// Section box label height — labels sit inside the top of each box
const BOX_LABEL_H = 16;

// Opponent expeditions (top) — aligned with hand area top
const OPP_EXP_TOP = HEADER_H + BOX_LABEL_H + 16;   // = HAND_TOP = 80
const EXP_OVERLAP = 30;
const EXP_SLOTS = 5;
const EXP_HEIGHT = CARD_H + (EXP_SLOTS - 1) * EXP_OVERLAP;

// Player expeditions — positioned from the bottom up
const PLR_EXP_BOTTOM = GAME_H - 16;
const PLR_EXP_TOP = PLR_EXP_BOTTOM - EXP_HEIGHT;

// Discard piles — centered vertically between opponent and player expeditions
const DISCARD_CARD_H = Math.round(CARD_H * 0.6);
const DISCARD_CARD_W = Math.round(CARD_W * 0.6);
const OPP_EXP_BOTTOM = OPP_EXP_TOP + EXP_HEIGHT;
const PLR_BOX_TOP = PLR_EXP_TOP - BOX_LABEL_H;  // top of player expeditions box (including label)
const DISCARD_AVAIL = PLR_BOX_TOP - OPP_EXP_BOTTOM;
const DISCARD_Y = OPP_EXP_BOTTOM + Math.floor((DISCARD_AVAIL - DISCARD_CARD_H) / 2);

// Middle column vertical layout
const SCORE_BOX_H = 50;
const OPP_SCORE_Y = HEADER_H + 16;
const PLR_SCORE_Y = GAME_H - SCORE_BOX_H - 16;

// Center the round indicator + draw pile vertically between score boxes.
// Stacking order (top→bottom): Round indicator → Draw pile.
const ROUND_BOX_H = 52;
const MID_GROUP_GAP = 16;                       // gap between round box and draw pile box
const DRAW_BOX_H = BOX_LABEL_H + CARD_H + 16;  // draw pile box inner height (label + card + count text)
const MID_GROUP_TOTAL = ROUND_BOX_H + MID_GROUP_GAP + DRAW_BOX_H;
const MID_AVAIL_TOP = OPP_SCORE_Y + SCORE_BOX_H + 12; // below opponent score box
const MID_AVAIL_BOT = PLR_SCORE_Y - 12;               // above player score box
const MID_GROUP_TOP = MID_AVAIL_TOP + Math.floor((MID_AVAIL_BOT - MID_AVAIL_TOP - MID_GROUP_TOTAL) / 2);
const ROUND_Y = MID_GROUP_TOP;
const DRAW_PILE_Y = ROUND_Y + ROUND_BOX_H + MID_GROUP_GAP + BOX_LABEL_H;

// Right column: Hand — uses nearly full vertical height
// Content starts below the "Your Hand" label
const HAND_TOP = HEADER_H + BOX_LABEL_H + 16;
const HAND_BOTTOM = GAME_H - 30;
const HAND_CARD_W = 100;
const HAND_CARD_H = 137;
const HAND_OVERLAP = Math.floor((HAND_BOTTOM - HAND_TOP - HAND_CARD_H) / (HAND_SIZE - 1));

// Animation timing
const AI_DELAY = 800;
const ANIM_DURATION = 300;
const AI_ANIM_DURATION = 450;

// ── Audio asset keys ──────────────────────────────────────
const SFX_KEYS = {
  CARD_SELECT: 'lc-sfx-card-select',
  CARD_DESELECT: 'lc-sfx-card-deselect',
  CARD_PLAY: 'lc-sfx-card-play',
  CARD_DISCARD: 'lc-sfx-card-discard',
  CARD_DRAW: 'lc-sfx-card-draw',
  ILLEGAL_MOVE: 'lc-sfx-illegal-move',
  TURN_CHANGE: 'lc-sfx-turn-change',
  ROUND_END: 'lc-sfx-round-end',
  MATCH_WIN: 'lc-sfx-match-win',
  MATCH_LOSE: 'lc-sfx-match-lose',
  SCORE_REVEAL: 'lc-sfx-score-reveal',
  UI_CLICK: 'lc-sfx-ui-click',
} as const;

// Text styles
const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT_FAMILY,
  fontSize: '11px',
  color: '#aaccaa',
  align: 'center',
};

const SCORE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT_FAMILY,
  fontSize: '16px',
  color: '#ffffff',
  align: 'center',
};

const SMALL_LABEL: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT_FAMILY,
  fontSize: '10px',
  color: '#88aa88',
  align: 'center',
};

// Section box styling
const BOX_STROKE = 0x445544;
const BOX_STROKE_ALPHA = 0.6;
const BOX_FILL = 0x1a2a1a;
const BOX_FILL_ALPHA = 0.25;
const BOX_RADIUS = 6;
const BOX_PAD = 6;

// Tooltip styling
const TOOLTIP_BG_COLOR = 0x000000;
const TOOLTIP_BG_ALPHA = 0.9;
const TOOLTIP_PAD = 10;
const TOOLTIP_DEPTH = 800;
const TOOLTIP_MAX_W = 260;

// ── Turn state machine ────────────────────────────────────
type SceneTurnPhase =
  | 'waiting-for-card-select'  // Player must select a card from hand
  | 'waiting-for-target'       // Player selected a card, must choose expedition or discard
  | 'waiting-for-draw'         // Player must draw (phase 2)
  | 'animating'                // Animation in progress
  | 'ai-thinking'              // AI is deciding
  | 'round-over'               // Round summary shown
  | 'match-over';              // Match summary shown

// ── Transcript store ──────────────────────────────────────
const transcriptStore = new TranscriptStore();

// ═══════════════════════════════════════════════════════════
export class LostCitiesScene extends CardGameScene {
  // Game state
  private session!: LostCitiesSession;
  private aiPlayer!: LostCitiesAiPlayer;
  private recorder!: LCTranscriptRecorder;
  private turnPhase: SceneTurnPhase = 'waiting-for-card-select';
  private selectedCardIndex: number = -1;

  // Graphics layer for section boxes
  private gfx!: Phaser.GameObjects.Graphics;

  // Card sprites — expeditions
  private playerExpSprites: Map<ExpeditionColor, Phaser.GameObjects.Image[]> = new Map();
  private oppExpSprites: Map<ExpeditionColor, Phaser.GameObjects.Image[]> = new Map();

  // Card sprites — discard piles (one sprite per color showing top card)
  private discardSprites: Map<ExpeditionColor, Phaser.GameObjects.Image> = new Map();

  // Card sprites — hand
  private handSprites: Phaser.GameObjects.Image[] = [];
  /** Highlight rectangle around the selected hand card. */
  private selectionHighlight: Phaser.GameObjects.Rectangle | null = null;

  // Card sprites — AI hand (face-down)
  private aiHandSprites: Phaser.GameObjects.Image[] = [];

  // Draw pile sprite
  private drawPileSprite!: Phaser.GameObjects.Image;
  private drawPileCountText!: Phaser.GameObjects.Text;
  /** Invisible hit area for expedition lane clicks (one per color). */


  // UI text
  private oppScoreText!: Phaser.GameObjects.Text;
  private plrScoreText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private turnIndicatorText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;

  // Overlay cleanup
  private overlayObjects: Phaser.GameObjects.GameObject[] = [];

  // Tooltip
  private tooltipContainer: Phaser.GameObjects.Container | null = null;
  /** Track which color tooltip is currently showing to avoid redundant re-creation. */
  private tooltipColor: ExpeditionColor | null = null;

  constructor() {
    super({ key: 'LostCitiesScene' });
  }

  // ── Preload ─────────────────────────────────────────────
  preload(): void {
    // Load all 60 LC card SVGs + card back
    for (const color of EXPEDITION_COLORS) {
      for (let inv = 1; inv <= 3; inv++) {
        const key = `lc-${color}-inv${inv}`;
        this.load.svg(key, `assets/cards/lost-cities/${key}.svg`, {
          width: CARD_W,
          height: CARD_H,
        });
      }
      for (let rank = 2; rank <= 10; rank++) {
        const key = `lc-${color}-${rank}`;
        this.load.svg(key, `assets/cards/lost-cities/${key}.svg`, {
          width: CARD_W,
          height: CARD_H,
        });
      }
    }
    this.load.svg(CARD_BACK_KEY, `assets/cards/lost-cities/${CARD_BACK_KEY}.svg`, {
      width: CARD_W,
      height: CARD_H,
    });

    // Load compact (small) card variants for discard piles
    for (const color of EXPEDITION_COLORS) {
      for (let inv = 1; inv <= 3; inv++) {
        const key = `lc-${color}-inv${inv}-sm`;
        this.load.svg(key, `assets/cards/lost-cities/${key}.svg`, {
          width: DISCARD_CARD_W,
          height: DISCARD_CARD_H,
        });
      }
      for (let rank = 2; rank <= 10; rank++) {
        const key = `lc-${color}-${rank}-sm`;
        this.load.svg(key, `assets/cards/lost-cities/${key}.svg`, {
          width: DISCARD_CARD_W,
          height: DISCARD_CARD_H,
        });
      }
    }

    // Load expedition-themed sound effects
    this.load.audio(SFX_KEYS.CARD_SELECT, 'assets/audio/lost-cities/card-select.wav');
    this.load.audio(SFX_KEYS.CARD_DESELECT, 'assets/audio/lost-cities/card-deselect.wav');
    this.load.audio(SFX_KEYS.CARD_PLAY, 'assets/audio/lost-cities/card-play.wav');
    this.load.audio(SFX_KEYS.CARD_DISCARD, 'assets/audio/lost-cities/card-discard.wav');
    this.load.audio(SFX_KEYS.CARD_DRAW, 'assets/audio/lost-cities/card-draw.wav');
    this.load.audio(SFX_KEYS.ILLEGAL_MOVE, 'assets/audio/lost-cities/illegal-move.wav');
    this.load.audio(SFX_KEYS.TURN_CHANGE, 'assets/audio/lost-cities/turn-change.wav');
    this.load.audio(SFX_KEYS.ROUND_END, 'assets/audio/lost-cities/round-end.wav');
    this.load.audio(SFX_KEYS.MATCH_WIN, 'assets/audio/lost-cities/match-win.wav');
    this.load.audio(SFX_KEYS.MATCH_LOSE, 'assets/audio/lost-cities/match-lose.wav');
    this.load.audio(SFX_KEYS.SCORE_REVEAL, 'assets/audio/lost-cities/score-reveal.wav');
    this.load.audio(SFX_KEYS.UI_CLICK, 'assets/audio/lost-cities/ui-click.wav');
  }

  // ── Create ──────────────────────────────────────────────
  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');

    // Reset state
    this.turnPhase = 'waiting-for-card-select';
    this.selectedCardIndex = -1;
    this.overlayObjects = [];
    this.playerExpSprites = new Map();
    this.oppExpSprites = new Map();
    this.discardSprites = new Map();
    this.handSprites = [];
    this.selectionHighlight = null;
    this.tooltipContainer = null;

    // Check for replay mode via URL parameter (?mode=replay)
    this.detectReplayMode();

    // Event system: create emitter and bridge to Phaser scene events.
    // Must be created before help/sound systems and exposed on window
    // for the replay tool.
    this.initEventSystem();

    // Initialize game state
    this.session = setupLostCitiesGame({
      playerNames: ['You', 'AI'],
      isAI: [false, true],
    });
    this.aiPlayer = new LostCitiesAiPlayer(GreedyStrategy);
    this.recorder = new LCTranscriptRecorder(this.session, [undefined, 'Greedy']);

    // Header
    createSceneHeader(this, 'Lost Cities');

    // Graphics for section boxes
    this.gfx = this.add.graphics();

    // Build all UI zones
    this.createSectionBoxes();
    this.createExpeditionZones();
    this.createDiscardZones();
    this.createRightColumn();
    this.createInstructionBar();
    if (!this.replayMode) {
      this.createHelpPanel();
      this.createSoundSystem();
    }

    // Initial render
    this.refreshAll();

    if (this.replayMode) {
      // In replay mode: clear instruction text and emit state-settled
      // so the replay tool knows the scene is ready for state injection.
      this.instructionText.setText('');
      this.emitStateSettled(
        this.session.round.turnNumber,
        this.session.matchPhase === 'playing' ? 'playing' : 'ended',
      );
    } else {
      this.setPhase('waiting-for-card-select');
    }
  }

  // ── Section box helpers ─────────────────────────────────
  private drawSectionBox(
    x: number, y: number, w: number, h: number, label: string,
  ): void {
    this.gfx.lineStyle(1, BOX_STROKE, BOX_STROKE_ALPHA);
    this.gfx.fillStyle(BOX_FILL, BOX_FILL_ALPHA);
    this.gfx.fillRoundedRect(x, y, w, h, BOX_RADIUS);
    this.gfx.strokeRoundedRect(x, y, w, h, BOX_RADIUS);
    if (label) {
      this.add
        .text(x + 8, y + 4, label, {
          ...SMALL_LABEL,
          fontSize: '9px',
          color: '#667766',
        })
        .setOrigin(0, 0.5);
    }
  }

  /** Draw a light colored card placeholder rectangle. */
  private drawCardSlot(
    x: number, y: number, w: number, h: number,
    fillColor: number, alpha: number,
  ): void {
    this.gfx.fillStyle(fillColor, alpha);
    this.gfx.fillRoundedRect(x, y, w, h, 4);
    this.gfx.lineStyle(1, 0xffffff, 0.15);
    this.gfx.strokeRoundedRect(x, y, w, h, 4);
  }

  private createSectionBoxes(): void {
    const tabW = 5 * LANE_STEP - LANE_GAP + 2 * BOX_PAD;

    // Opponent expeditions — box includes label above card content
    this.drawSectionBox(
      TABLEAU_LEFT - BOX_PAD,
      OPP_EXP_TOP - BOX_LABEL_H - BOX_PAD,
      tabW,
      EXP_HEIGHT + BOX_LABEL_H + 2 * BOX_PAD,
      'Opponent Expeditions',
    );

    // Placeholder card slots for opponent expeditions (interactive for scoring tooltip)
    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];
      const hex = Phaser.Display.Color.HexStringToColor(EXPEDITION_HEX[color]).color;
      this.drawCardSlot(
        laneX(i) - CARD_W / 2, OPP_EXP_TOP,
        CARD_W, CARD_H, hex, 0.15,
      );

      // Interactive zone over the placeholder for scoring tooltip
      const zone = this.add.rectangle(
        laneX(i), OPP_EXP_TOP + CARD_H / 2,
        CARD_W + 8, CARD_H + 4,
        0x000000, 0,
      );
      zone.setInteractive({ useHandCursor: false });
      zone.on('pointerover', () => this.showExpeditionTooltip(color, zone, 'below'));
      zone.on('pointerout', () => this.hideExpeditionTooltip());
    }

    // Discard piles — no label, centered between expedition areas
    this.drawSectionBox(
      TABLEAU_LEFT - BOX_PAD,
      DISCARD_Y - BOX_PAD,
      tabW,
      DISCARD_CARD_H + 2 * BOX_PAD,
      '',
    );

    // Placeholder card slots for discard piles
    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];
      const hex = Phaser.Display.Color.HexStringToColor(EXPEDITION_HEX[color]).color;
      this.drawCardSlot(
        laneX(i) - DISCARD_CARD_W / 2, DISCARD_Y,
        DISCARD_CARD_W, DISCARD_CARD_H, hex, 0.2,
      );
    }

    // Player expeditions — box includes label above card content
    this.drawSectionBox(
      TABLEAU_LEFT - BOX_PAD,
      PLR_EXP_TOP - BOX_LABEL_H - BOX_PAD,
      tabW,
      EXP_HEIGHT + BOX_LABEL_H + 2 * BOX_PAD,
      'Your Expeditions',
    );

    // Placeholder card slots for player expeditions
    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];
      const hex = Phaser.Display.Color.HexStringToColor(EXPEDITION_HEX[color]).color;
      this.drawCardSlot(
        laneX(i) - CARD_W / 2, PLR_EXP_TOP,
        CARD_W, CARD_H, hex, 0.15,
      );
    }

    // ── Right column boxes (scores, draw, round) ──────────
    // Opponent score
    this.drawSectionBox(
      MID_COL_X - BOX_PAD, OPP_SCORE_Y - BOX_PAD,
      MID_COL_W + 2 * BOX_PAD, SCORE_BOX_H + 2 * BOX_PAD, '',
    );
    // Round indicator (above draw pile)
    this.drawSectionBox(
      MID_COL_X - BOX_PAD, ROUND_Y - BOX_PAD,
      MID_COL_W + 2 * BOX_PAD, ROUND_BOX_H + 2 * BOX_PAD, '',
    );
    // Draw pile — box includes label
    this.drawSectionBox(
      MID_COL_X - BOX_PAD,
      DRAW_PILE_Y - BOX_LABEL_H - BOX_PAD,
      MID_COL_W + 2 * BOX_PAD,
      CARD_H + BOX_LABEL_H + 2 * BOX_PAD + 16,
      'Draw Pile',
    );
    // Player score (bottom of right column)
    this.drawSectionBox(
      MID_COL_X - BOX_PAD, PLR_SCORE_Y - BOX_PAD,
      MID_COL_W + 2 * BOX_PAD, SCORE_BOX_H + 2 * BOX_PAD, '',
    );

    // ── Middle column: separate hand boxes ───────────────────
    const handTotalH = HAND_CARD_H + (HAND_SIZE - 1) * HAND_OVERLAP;
    const handBoxH = handTotalH + BOX_LABEL_H + 2 * BOX_PAD;
    const handBoxY = HAND_TOP - BOX_LABEL_H - BOX_PAD;

    // Player hand box
    this.drawSectionBox(
      PLAYER_HAND_BOX_X - BOX_PAD,
      handBoxY,
      HAND_BOX_W + 2 * BOX_PAD,
      handBoxH,
      'Your Hand',
    );

    // AI hand box
    this.drawSectionBox(
      AI_HAND_BOX_X - BOX_PAD,
      handBoxY,
      HAND_BOX_W + 2 * BOX_PAD,
      handBoxH,
      'AI Hand',
    );
  }

  // ── Expedition zones ────────────────────────────────────
  private createExpeditionZones(): void {
    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];

      // Init sprite arrays
      this.oppExpSprites.set(color, []);
      this.playerExpSprites.set(color, []);
    }

    // Single hit area covering the entire player expedition region.
    // onExpeditionClick auto-routes to the selected card's color,
    // so the player can click anywhere in the expedition area.
    const areaLeft = laneX(0) - CARD_W / 2 - 2;
    const areaRight = laneX(4) + CARD_W / 2 + 2;
    const areaWidth = areaRight - areaLeft;
    const areaCenterX = areaLeft + areaWidth / 2;
    const hitArea = this.add.rectangle(
      areaCenterX, PLR_EXP_TOP + EXP_HEIGHT / 2,
      areaWidth, EXP_HEIGHT + 4,
      0x000000, 0,
    );
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', () => this.onExpeditionClick(EXPEDITION_COLORS[0]));

    // Scoring tooltip: track pointer across lanes within the hit area
    hitArea.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const color = this.colorAtPointerX(pointer.x);
      if (!color) { this.hideExpeditionTooltip(); return; }
      if (color === this.tooltipColor) return;     // already showing this color
      this.showExpeditionTooltip(color, {
        x: laneX(EXPEDITION_COLORS.indexOf(color)),
        y: PLR_EXP_TOP + CARD_H / 2,
        height: CARD_H,
      } as Phaser.GameObjects.Components.Transform & { height: number }, 'above');
    });
    hitArea.on('pointerout', () => this.hideExpeditionTooltip());
  }

  // ── Discard zones ───────────────────────────────────────
  private createDiscardZones(): void {
    // Single row-wide hit area spanning all 5 discard piles.
    // Phase 1 (discard): color is auto-routed from selected card, so any
    // click in the row works. Phase 2 (draw): nearest non-empty pile is
    // found based on pointer X position.
    const areaLeft = laneX(0) - CARD_W / 2 - 2;
    const areaRight = laneX(4) + CARD_W / 2 + 2;
    const areaWidth = areaRight - areaLeft;
    const areaCenterX = areaLeft + areaWidth / 2;
    const hitArea = this.add.rectangle(
      areaCenterX, DISCARD_Y + DISCARD_CARD_H / 2,
      areaWidth, DISCARD_CARD_H + 4,
      0x000000, 0,
    );
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) =>
      this.onDiscardRowClick(pointer),
    );

    // Scoring tooltip: track pointer across lanes within the hit area
    hitArea.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const color = this.colorAtPointerX(pointer.x);
      if (!color) { this.hideExpeditionTooltip(); return; }
      if (color === this.tooltipColor) return;     // already showing this color
      this.showExpeditionTooltip(color, {
        x: laneX(EXPEDITION_COLORS.indexOf(color)),
        y: DISCARD_Y + DISCARD_CARD_H / 2,
        height: DISCARD_CARD_H,
      } as Phaser.GameObjects.Components.Transform & { height: number }, 'below');
    });
    hitArea.on('pointerout', () => this.hideExpeditionTooltip());
  }

  // ── Right column (scores, draw pile, round) ─────────────
  private createRightColumn(): void {
    // Opponent score (top of right column)
    this.add
      .text(MID_COL_CENTER, OPP_SCORE_Y + 6, 'Opponent', LABEL_STYLE)
      .setOrigin(0.5, 0);
    this.oppScoreText = this.add
      .text(MID_COL_CENTER, OPP_SCORE_Y + 26, 'Score: 0', SCORE_STYLE)
      .setOrigin(0.5, 0);

    // Round / turn indicator (above draw pile)
    this.roundText = this.add
      .text(MID_COL_CENTER, ROUND_Y + 6, 'Round 1 / 3', SCORE_STYLE)
      .setOrigin(0.5, 0);
    this.turnIndicatorText = this.add
      .text(MID_COL_CENTER, ROUND_Y + 30, 'Your Turn', {
        ...LABEL_STYLE,
        fontSize: '13px',
        color: '#66dd66',
      })
      .setOrigin(0.5, 0);

    // Draw pile (below round indicator)
    this.drawPileSprite = this.add.image(
      MID_COL_CENTER, DRAW_PILE_Y + CARD_H / 2, CARD_BACK_KEY,
    );
    this.drawPileSprite.setInteractive({ useHandCursor: true });
    this.drawPileSprite.on('pointerdown', () => this.onDrawPileClick());

    this.drawPileCountText = this.add
      .text(MID_COL_CENTER, DRAW_PILE_Y + CARD_H + 4, '44 remaining', SMALL_LABEL)
      .setOrigin(0.5, 0);

    // Player score (bottom of right column)
    this.add
      .text(MID_COL_CENTER, PLR_SCORE_Y + 6, 'You', LABEL_STYLE)
      .setOrigin(0.5, 0);
    this.plrScoreText = this.add
      .text(MID_COL_CENTER, PLR_SCORE_Y + 26, 'Score: 0', SCORE_STYLE)
      .setOrigin(0.5, 0);
  }

  private createInstructionBar(): void {
    this.instructionText = this.add
      .text(GAME_W / 2, GAME_H - 6, '', {
        ...SMALL_LABEL,
        fontSize: '13px',
        color: '#88cc88',
      })
      .setOrigin(0.5, 1);
  }

  private createHelpPanel(): void {
    this.initHelpPanel(helpContent as HelpSection[]);
  }

  private createSoundSystem(): void {
    const mapping: EventSoundMapping = {
      'turn-started': SFX_KEYS.TURN_CHANGE,
    };
    this.initSoundSystem(Object.values(SFX_KEYS), mapping);
    this.initSettingsPanel();
  }

  // ── Replay API ──────────────────────────────────────────

  /**
   * Inject an arbitrary board state from transcript snapshot data and
   * refresh the visual display. Intended for use by the replay tool
   * via `page.evaluate()`.
   *
   * Only operational in replay mode (?mode=replay). Throws if called
   * outside of replay mode.
   *
   * After updating the internal state and refreshing all sprites,
   * emits a `state-settled` event so the caller can synchronize
   * screenshot capture.
   *
   * @param boardStates  Per-player board snapshots (hand + expeditions).
   * @param tableState   Table state (discard tops + draw pile size).
   */
  loadBoardState(
    boardStates: [
      { hand: Array<{ id: number; color: string; type: string; rank: number; faceUp: boolean }>;
        expeditions: Record<string, Array<{ id: number; color: string; type: string; rank: number; faceUp: boolean }>> },
      { hand: Array<{ id: number; color: string; type: string; rank: number; faceUp: boolean }>;
        expeditions: Record<string, Array<{ id: number; color: string; type: string; rank: number; faceUp: boolean }>> },
    ],
    tableState: {
      discardTops: Record<string, { id: number; color: string; type: string; rank: number; faceUp: boolean } | null>;
      drawPileSize: number;
    },
  ): void {
    if (!this.replayMode) {
      throw new Error(
        'loadBoardState() is only available in replay mode (?mode=replay)',
      );
    }

    // Reconstruct each player's hand and expeditions from snapshot data
    for (let p = 0; p < 2; p++) {
      const snapshot = boardStates[p];

      // Rebuild hand
      this.session.players[p as 0 | 1].hand = snapshot.hand.map(
        (cs) => this.snapshotToCard(cs),
      );

      // Rebuild expeditions
      const expeditions = this.session.players[p as 0 | 1].expeditions;
      for (const color of EXPEDITION_COLORS) {
        const cards = (snapshot.expeditions[color] ?? []).map(
          (cs) => this.snapshotToCard(cs),
        );
        expeditions.set(color, cards);
      }
    }

    // Rebuild discard piles (only top card available from transcript)
    for (const color of EXPEDITION_COLORS) {
      const topSnap = tableState.discardTops[color];
      if (topSnap) {
        const card = this.snapshotToCard(topSnap);
        card.faceUp = true;
        this.session.round.discardPiles.set(color, [card]);
      } else {
        this.session.round.discardPiles.set(color, []);
      }
    }

    // Rebuild draw pile (fill with dummy face-down cards since we don't
    // have actual draw pile data — only the size is recorded)
    this.session.round.drawPile.length = 0;
    for (let i = 0; i < tableState.drawPileSize; i++) {
      this.session.round.drawPile.push({
        id: -1,
        color: 'yellow' as ExpeditionColor,
        type: 'numbered',
        rank: 2 as 2,
        faceUp: false,
      });
    }

    // Refresh all visual elements
    this.refreshAll();

    // Signal that the board is visually stable and ready for screenshot
    this.emitStateSettled(
      this.session.round.turnNumber,
      this.session.matchPhase === 'playing' ? 'playing' : 'ended',
    );
  }

  /**
   * Convert a card snapshot (from the transcript) into a LostCitiesCard.
   */
  private snapshotToCard(
    cs: { id: number; color: string; type: string; rank: number; faceUp: boolean },
  ): LostCitiesCard {
    if (cs.type === 'investment') {
      return {
        id: cs.id,
        color: cs.color as ExpeditionColor,
        type: 'investment',
        investmentIndex: cs.rank as 1 | 2 | 3,
        faceUp: cs.faceUp,
      };
    }
    return {
      id: cs.id,
      color: cs.color as ExpeditionColor,
      type: 'numbered',
      rank: cs.rank as 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
      faceUp: cs.faceUp,
    };
  }

  // ── Phase management ────────────────────────────────────
  private setPhase(phase: SceneTurnPhase): void {
    this.turnPhase = phase;

    switch (phase) {
      case 'waiting-for-card-select':
        this.instructionText.setText(
          'Select a card from your hand to play or discard',
        );
        this.turnIndicatorText.setText('Your Turn — Play/Discard');
        this.turnIndicatorText.setColor('#66dd66');
        break;
      case 'waiting-for-target':
        this.instructionText.setText(
          'Click an expedition lane to play, or a discard pile to discard',
        );
        break;
      case 'waiting-for-draw':
        this.instructionText.setText(
          'Draw a card: click the draw pile or a discard pile',
        );
        this.turnIndicatorText.setText('Your Turn — Draw');
        this.turnIndicatorText.setColor('#66dd66');
        break;
      case 'animating':
        this.instructionText.setText('');
        break;
      case 'ai-thinking':
        this.instructionText.setText('AI is thinking...');
        this.turnIndicatorText.setText("AI's Turn");
        this.turnIndicatorText.setColor('#ddaa44');
        break;
      case 'round-over':
        this.instructionText.setText('');
        break;
      case 'match-over':
        this.instructionText.setText('');
        break;
    }
  }

  // ── Refresh display ─────────────────────────────────────
  private refreshAll(): void {
    this.refreshExpeditions();
    this.refreshDiscardPiles();
    this.refreshHand();
    this.refreshAiHand();
    this.refreshDrawPile();
    this.refreshScores();
    this.refreshRoundIndicator();
  }

  private refreshExpeditions(): void {
    // Clear old sprites
    for (const sprites of this.oppExpSprites.values()) {
      sprites.forEach(s => s.destroy());
    }
    for (const sprites of this.playerExpSprites.values()) {
      sprites.forEach(s => s.destroy());
    }

    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];

      // Opponent expeditions — show card backs (cards hidden)
      const oppCards = this.session.players[1].expeditions.get(color) ?? [];
      const oppSprites: Phaser.GameObjects.Image[] = [];
      for (let c = 0; c < oppCards.length; c++) {
        const x = laneX(i);
        const y = OPP_EXP_TOP + c * EXP_OVERLAP + CARD_H / 2;
        const sprite = this.add.image(x, y, cardAssetKey(oppCards[c]));
        sprite.setDisplaySize(CARD_W, CARD_H);
        sprite.setDepth(c);
        oppSprites.push(sprite);
      }
      this.oppExpSprites.set(color, oppSprites);

      // Player expeditions — show face up
      const plrCards = this.session.players[0].expeditions.get(color) ?? [];
      const plrSprites: Phaser.GameObjects.Image[] = [];
      for (let c = 0; c < plrCards.length; c++) {
        const x = laneX(i);
        const y = PLR_EXP_TOP + c * EXP_OVERLAP + CARD_H / 2;
        const sprite = this.add.image(x, y, cardAssetKey(plrCards[c]));
        sprite.setDisplaySize(CARD_W, CARD_H);
        sprite.setDepth(c);
        plrSprites.push(sprite);
      }
      this.playerExpSprites.set(color, plrSprites);
    }
  }

  private refreshDiscardPiles(): void {
    // Clear old discard sprites
    for (const sprite of this.discardSprites.values()) {
      sprite.destroy();
    }
    this.discardSprites.clear();

    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];
      const pile = this.session.round.discardPiles.get(color) ?? [];

      if (pile.length > 0) {
        const topCard = pile[pile.length - 1];
        const sprite = this.add.image(
          laneX(i), DISCARD_Y + DISCARD_CARD_H / 2,
          compactAssetKey(topCard),
        );
        sprite.setDisplaySize(DISCARD_CARD_W, DISCARD_CARD_H);
        this.discardSprites.set(color, sprite);
      }
    }
  }

  /**
   * Compare two cards for hand display order:
   *   1. Group by expedition color (EXPEDITION_COLORS order)
   *   2. Investment cards before numbered cards within each color
   *   3. Ascending investmentIndex / rank within each type
   */
  private static handSortCompare(a: LostCitiesCard, b: LostCitiesCard): number {
    const colorA = EXPEDITION_COLORS.indexOf(a.color);
    const colorB = EXPEDITION_COLORS.indexOf(b.color);
    if (colorA !== colorB) return colorA - colorB;
    // Investments before numbered
    if (a.type !== b.type) return a.type === 'investment' ? -1 : 1;
    // Both investment: sort by investmentIndex
    if (a.type === 'investment' && b.type === 'investment') {
      return a.investmentIndex - b.investmentIndex;
    }
    // Both numbered: sort ascending by rank
    if (a.type === 'numbered' && b.type === 'numbered') {
      return a.rank - b.rank;
    }
    return 0;
  }

  private refreshHand(): void {
    // Clear old hand sprites
    this.handSprites.forEach(s => s.destroy());
    this.handSprites = [];
    if (this.selectionHighlight) {
      this.selectionHighlight.destroy();
      this.selectionHighlight = null;
    }

    // Sort hand in-place for consistent display grouping
    const hand = this.session.players[0].hand;
    hand.sort(LostCitiesScene.handSortCompare);
    for (let c = 0; c < hand.length; c++) {
      const x = PLAYER_HAND_CENTER;
      const y = HAND_TOP + c * HAND_OVERLAP + HAND_CARD_H / 2;
      const sprite = this.add.image(x, y, cardAssetKey(hand[c]));
      sprite.setDisplaySize(HAND_CARD_W, HAND_CARD_H);
      sprite.setDepth(c + 1);
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', () => this.onHandCardClick(c));
      this.handSprites.push(sprite);
    }
  }

  /**
   * Render the AI's hand as face-down card sprites in the right sub-column.
   * Sprite count always matches the AI's actual hand size.
   */
  private refreshAiHand(): void {
    // Destroy old sprites
    for (const sprite of this.aiHandSprites) {
      sprite.destroy();
    }
    this.aiHandSprites = [];

    const aiHand = this.session.players[1].hand;
    for (let c = 0; c < aiHand.length; c++) {
      const x = AI_HAND_CENTER;
      const y = HAND_TOP + c * HAND_OVERLAP + HAND_CARD_H / 2;
      const sprite = this.add.image(x, y, CARD_BACK_KEY);
      sprite.setDisplaySize(HAND_CARD_W, HAND_CARD_H);
      sprite.setDepth(c + 1);
      // AI hand sprites are non-interactive (no setInteractive)
      this.aiHandSprites.push(sprite);
    }
  }

  private refreshDrawPile(): void {
    const remaining = this.session.round.drawPile.length;
    this.drawPileCountText.setText(`${remaining} remaining`);
    this.drawPileSprite.setVisible(remaining > 0);
  }

  private refreshScores(): void {
    // Show current round live scores + cumulative
    const p0Detailed = scoreRoundDetailed(this.session.players[0].expeditions);
    const p1Detailed = scoreRoundDetailed(this.session.players[1].expeditions);

    const p0Round = p0Detailed.total;
    const p1Round = p1Detailed.total;
    const [p0Cum, p1Cum] = this.session.cumulativeScores;

    const p0Total = p0Cum + p0Round;
    const p1Total = p1Cum + p1Round;

    if (this.session.roundNumber > 1 || p0Cum !== 0 || p1Cum !== 0) {
      this.plrScoreText.setText(`Round: ${p0Round}  Total: ${p0Total}`);
      this.oppScoreText.setText(`Round: ${p1Round}  Total: ${p1Total}`);
    } else {
      this.plrScoreText.setText(`Score: ${p0Round}`);
      this.oppScoreText.setText(`Score: ${p1Round}`);
    }
  }

  // ── Expedition scoring tooltip ──────────────────────────
  private showExpeditionTooltip(
    color: ExpeditionColor,
    anchor: Phaser.GameObjects.Components.Transform & { width?: number; height?: number },
    position: 'above' | 'below' = 'above',
  ): void {
    if (this.settingsPanel && !this.settingsPanel.showTooltips) return;
    this.hideExpeditionTooltip();
    this.tooltipColor = color;

    const plrCards = this.session.players[0].expeditions.get(color) ?? [];
    const oppCards = this.session.players[1].expeditions.get(color) ?? [];
    const plr = scoreExpeditionDetailed(color, plrCards);
    const opp = scoreExpeditionDetailed(color, oppCards);

    // Build tooltip lines
    const lines: string[] = [`${color.toUpperCase()} Expedition`];
    lines.push('');
    lines.push(this.formatExpBreakdown('You', plr));
    lines.push(this.formatExpBreakdown('Opp', opp));

    const bodyText = lines.join('\n');

    // Create text element to measure
    const text = this.add.text(0, 0, bodyText, {
      fontSize: '12px',
      color: '#dddddd',
      fontFamily: FONT_FAMILY,
      lineSpacing: 4,
      wordWrap: { width: TOOLTIP_MAX_W - TOOLTIP_PAD * 2 },
    }).setOrigin(0, 0);

    // Title is the first line — style it differently
    // We'll use a separate title text for bold/color styling
    const title = this.add.text(TOOLTIP_PAD, TOOLTIP_PAD, `${color.toUpperCase()} Expedition`, {
      fontSize: '13px',
      color: '#f0c040',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    }).setOrigin(0, 0);

    // Rewrite body text without the title + blank line
    const detailLines = [
      this.formatExpBreakdown('You', plr),
      this.formatExpBreakdown('Opp', opp),
    ];
    text.setText(detailLines.join('\n'));
    text.setPosition(TOOLTIP_PAD, TOOLTIP_PAD + title.height + 6);

    const boxW = Math.max(text.width, title.width) + TOOLTIP_PAD * 2;
    const boxH = TOOLTIP_PAD + title.height + 6 + text.height + TOOLTIP_PAD;

    // Position tooltip relative to anchor based on position hint
    let tooltipX = anchor.x - boxW / 2;
    let tooltipY: number;
    if (position === 'below') {
      tooltipY = anchor.y + (anchor.height ?? 0) / 2 + 6;
    } else {
      tooltipY = anchor.y - (anchor.height ?? 0) / 2 - boxH - 6;
    }

    // Clamp within canvas bounds
    tooltipX = Phaser.Math.Clamp(tooltipX, 4, GAME_W - boxW - 4);
    tooltipY = Phaser.Math.Clamp(tooltipY, 4, GAME_H - boxH - 4);

    // Background
    const bg = this.add.rectangle(
      boxW / 2, boxH / 2,
      boxW, boxH,
      TOOLTIP_BG_COLOR, TOOLTIP_BG_ALPHA,
    );
    bg.setStrokeStyle(1, 0x888888);

    this.tooltipContainer = this.add.container(tooltipX, tooltipY, [bg, title, text]);
    this.tooltipContainer.setDepth(TOOLTIP_DEPTH);
  }

  private hideExpeditionTooltip(): void {
    if (this.tooltipContainer) {
      this.tooltipContainer.destroy();
      this.tooltipContainer = null;
    }
    this.tooltipColor = null;
  }

  /** Format a one-line scoring breakdown for an expedition. */
  private formatExpBreakdown(
    label: string,
    b: ReturnType<typeof scoreExpeditionDetailed>,
  ): string {
    if (b.cardCount === 0) return `${label}: no cards`;
    const inv = b.investmentCount > 0 ? `, ${b.investmentCount} inv (x${b.multiplier})` : '';
    const bonus = b.bonusEarned ? ', +20 bonus' : '';
    return `${label}: ${b.cardCount} cards${inv}${bonus} = ${b.score}`;
  }

  /** Resolve which expedition color lane a pointer X coordinate falls in, or null if outside all lanes. */
  private colorAtPointerX(px: number): ExpeditionColor | null {
    const half = CARD_W / 2 + 4;          // small margin around each lane
    for (let i = 0; i < 5; i++) {
      const cx = laneX(i);
      if (px >= cx - half && px <= cx + half) return EXPEDITION_COLORS[i];
    }
    return null;
  }

  private refreshRoundIndicator(): void {
    this.roundText.setText(`Round ${this.session.roundNumber} / 3`);
  }

  // ── Selection highlight ─────────────────────────────────
  private showSelectionHighlight(handIndex: number): void {
    this.clearSelectionHighlight();
    const sprite = this.handSprites[handIndex];
    if (!sprite) return;

    this.selectionHighlight = this.add.rectangle(
      sprite.x, sprite.y,
      HAND_CARD_W + 6, HAND_CARD_H + 6,
      0xffdd44, 0,
    );
    this.selectionHighlight.setStrokeStyle(3, 0xffdd44, 1);
    this.selectionHighlight.setDepth(handIndex + 0.5);
  }

  private clearSelectionHighlight(): void {
    if (this.selectionHighlight) {
      this.selectionHighlight.destroy();
      this.selectionHighlight = null;
    }
  }

  // ── Input handlers ──────────────────────────────────────

  private onHandCardClick(handIndex: number): void {
    if (this.turnPhase !== 'waiting-for-card-select' && this.turnPhase !== 'waiting-for-target') {
      return;
    }

    if (this.selectedCardIndex === handIndex) {
      // Deselect
      this.selectedCardIndex = -1;
      this.clearSelectionHighlight();
      this.soundManager?.play(SFX_KEYS.CARD_DESELECT);
      this.setPhase('waiting-for-card-select');
      return;
    }

    this.selectedCardIndex = handIndex;
    this.showSelectionHighlight(handIndex);
    this.soundManager?.play(SFX_KEYS.CARD_SELECT);
    this.setPhase('waiting-for-target');
  }

  private onExpeditionClick(_clickedColor: ExpeditionColor): void {
    if (this.turnPhase !== 'waiting-for-target') return;
    if (this.selectedCardIndex < 0) return;

    const hand = this.session.players[0].hand;
    const card = hand[this.selectedCardIndex];
    if (!card) return;

    // Auto-route: always play to the card's own color expedition
    const color = card.color;

    const action: Phase1Action = {
      kind: 'play-to-expedition',
      card,
      color,
    };

    // Validate
    const view = {
      playerExpeditions: this.session.players[0].expeditions,
      discardPiles: this.session.round.discardPiles,
      drawPileSize: this.session.round.drawPile.length,
      justDiscardedColor: this.session.round.justDiscardedColor,
    };
    const legality = checkPhase1Legality(action, hand, view);
    if (!legality.legal) {
      this.showIllegalMoveFlash(this.handSprites[this.selectedCardIndex]);
      return;
    }

    this.executePlayerPhase1(action);
  }

  private onDiscardRowClick(pointer: Phaser.Input.Pointer): void {
    // Phase 1: discard a card — auto-route to the card's own color pile
    if (this.turnPhase === 'waiting-for-target') {
      if (this.selectedCardIndex < 0) return;

      const hand = this.session.players[0].hand;
      const card = hand[this.selectedCardIndex];
      if (!card) return;

      const action: Phase1Action = {
        kind: 'discard',
        card,
        color: card.color,
      };

      this.executePlayerPhase1(action);
      return;
    }

    // Phase 2: draw from discard — find nearest non-empty pile
    if (this.turnPhase === 'waiting-for-draw') {
      const clickX = pointer.x;

      // Find the nearest non-empty, non-just-discarded pile
      let bestColor: ExpeditionColor | null = null;
      let bestDist = Infinity;

      for (let i = 0; i < 5; i++) {
        const color = EXPEDITION_COLORS[i];
        const pile = this.session.round.discardPiles.get(color) ?? [];
        if (pile.length === 0) continue;
        if (this.session.round.justDiscardedColor === color) continue;
        const dist = Math.abs(clickX - laneX(i));
        if (dist < bestDist) {
          bestDist = dist;
          bestColor = color;
        }
      }

      if (!bestColor) {
        // All piles empty or all blocked — show feedback
        this.soundManager?.play(SFX_KEYS.ILLEGAL_MOVE);
        this.instructionText.setText('No discard piles available to draw from');
        this.time.delayedCall(1500, () => {
          if (this.turnPhase === 'waiting-for-draw') {
            this.instructionText.setText(
              'Draw a card: click the draw pile or a discard pile',
            );
          }
        });
        return;
      }

      const action: Phase2Action = {
        kind: 'draw-from-discard',
        color: bestColor,
      };

      this.executePlayerPhase2(action);
    }
  }

  private onDrawPileClick(): void {
    if (this.turnPhase !== 'waiting-for-draw') return;

    if (this.session.round.drawPile.length === 0) return;

    const action: Phase2Action = { kind: 'draw-from-pile' };
    this.executePlayerPhase2(action);
  }

  // ── Player turn execution ───────────────────────────────

  private executePlayerPhase1(action: Phase1Action): void {
    this.setPhase('animating');
    this.clearSelectionHighlight();
    this.selectedCardIndex = -1;

    // Play sound for card action
    if (action.kind === 'play-to-expedition') {
      this.soundManager?.play(SFX_KEYS.CARD_PLAY);
    } else {
      this.soundManager?.play(SFX_KEYS.CARD_DISCARD);
    }

    const phase = this.session.round.turnPhase;
    const result = executeAction(this.session, action);
    this.recorder.recordAction(this.session, result, action, phase);

    // Animate card moving from hand to target
    this.animatePhase1(action, () => {
      this.refreshAll();

      // Now in Draw phase
      this.setPhase('waiting-for-draw');
    });
  }

  private executePlayerPhase2(action: Phase2Action): void {
    this.setPhase('animating');

    this.soundManager?.play(SFX_KEYS.CARD_DRAW);

    // Track draw from discard for AI opponent tracking
    if (action.kind === 'draw-from-discard') {
      this.aiPlayer.recordOpponentDiscardDraw(action.color);
    }

    const phase = this.session.round.turnPhase;
    const result = executeAction(this.session, action);
    this.recorder.recordAction(this.session, result, action, phase);

    // Animate draw
    this.animatePhase2(action, () => {
      this.refreshAll();

      if (result.roundEnded) {
        if (result.matchEnded) {
          this.showMatchSummary(result.roundScore!);
        } else {
          this.showRoundSummary(result.roundScore!);
        }
      } else {
        // AI's turn
        this.runAiTurn();
      }
    });
  }

  // ── AI turn ─────────────────────────────────────────────

  private runAiTurn(): void {
    this.setPhase('ai-thinking');
    this.soundManager?.play(SFX_KEYS.TURN_CHANGE);

    this.time.delayedCall(AI_DELAY, () => {
      if (this.session.matchPhase !== 'playing') return;

      const aiId: PlayerId = 1;
      const state = getVisibleState(this.session, aiId);

      // Phase 1: Play or Discard
      const phase1Action = this.aiPlayer.choosePhase1(state);
      const phase1Phase = this.session.round.turnPhase;
      const phase1Result = executeAction(this.session, phase1Action);
      this.recorder.recordAction(this.session, phase1Result, phase1Action, phase1Phase);

      // Refresh non-AI-hand elements so expedition/discard targets are up to date
      this.refreshExpeditions();
      this.refreshDiscardPiles();
      this.refreshScores();
      this.refreshDrawPile();

      // Animate the AI playing/discarding a card
      this.animateAiPhase1(phase1Action, () => {
        if (this.session.matchPhase !== 'playing') return;

        const state2 = getVisibleState(this.session, aiId);
        const phase2Action = this.aiPlayer.choosePhase2(state2);

        const phase2Phase = this.session.round.turnPhase;
        const phase2Result = executeAction(this.session, phase2Action);
        this.recorder.recordAction(this.session, phase2Result, phase2Action, phase2Phase);

        // Refresh draw pile and discards so the source shows updated state
        this.refreshDiscardPiles();
        this.refreshDrawPile();

        // Animate the AI drawing a card
        this.animateAiPhase2(phase2Action, () => {
          this.refreshAll();

          if (phase2Result.roundEnded) {
            if (phase2Result.matchEnded) {
              this.showMatchSummary(phase2Result.roundScore!);
            } else {
              this.showRoundSummary(phase2Result.roundScore!);
            }
          } else {
            // Human's turn
            this.soundManager?.play(SFX_KEYS.TURN_CHANGE);
            this.setPhase('waiting-for-card-select');
          }
        });
      });
    });
  }

  // ── Animations ──────────────────────────────────────────

  private animatePhase1(action: Phase1Action, onComplete: () => void): void {
    // Find the hand sprite that was selected (it should still be in handSprites)
    // Since we already executed the action, the card is no longer in hand,
    // but the sprite array hasn't been refreshed yet.
    const handSprites = this.handSprites;
    if (handSprites.length === 0) {
      onComplete();
      return;
    }

    // Find which sprite corresponds to the played card
    // The card was already removed from hand by executeAction, but
    // handSprites still has the old set. Search by texture key.
    const targetKey = cardAssetKey(action.card);
    let spriteIdx = -1;
    for (let i = 0; i < handSprites.length; i++) {
      if (handSprites[i].texture.key === targetKey) {
        spriteIdx = i;
        break;
      }
    }

    if (spriteIdx < 0) {
      onComplete();
      return;
    }

    const sprite = handSprites[spriteIdx];
    sprite.setDepth(100); // Bring to front during animation

    let targetX: number;
    let targetY: number;

    if (action.kind === 'play-to-expedition') {
      const colorIdx = EXPEDITION_COLORS.indexOf(action.color);
      const lane = this.session.players[0].expeditions.get(action.color) ?? [];
      const cardIdx = Math.max(0, lane.length - 1);
      targetX = laneX(colorIdx);
      targetY = PLR_EXP_TOP + cardIdx * EXP_OVERLAP + CARD_H / 2;
    } else {
      // Discard
      const colorIdx = EXPEDITION_COLORS.indexOf(action.color);
      targetX = laneX(colorIdx);
      targetY = DISCARD_Y + DISCARD_CARD_H / 2;
    }

    this.tweens.add({
      targets: sprite,
      x: targetX,
      y: targetY,
      scaleX: action.kind === 'discard' ? DISCARD_CARD_W / HAND_CARD_W : CARD_W / HAND_CARD_W,
      scaleY: action.kind === 'discard' ? DISCARD_CARD_H / HAND_CARD_H : CARD_H / HAND_CARD_H,
      duration: ANIM_DURATION,
      ease: 'Power2',
      onComplete: () => {
        sprite.destroy();
        onComplete();
      },
    });
  }

  private animatePhase2(action: Phase2Action, onComplete: () => void): void {
    // Create a temporary sprite at the source location and animate to hand
    let sourceX: number;
    let sourceY: number;
    let textureKey: string;

    const hand = this.session.players[0].hand;
    const drawnCard = hand[hand.length - 1];

    if (action.kind === 'draw-from-pile') {
      sourceX = MID_COL_CENTER;
      sourceY = DRAW_PILE_Y + CARD_H / 2;
      textureKey = CARD_BACK_KEY;
    } else {
      const colorIdx = EXPEDITION_COLORS.indexOf(action.color);
      sourceX = laneX(colorIdx);
      sourceY = DISCARD_Y + DISCARD_CARD_H / 2;
      textureKey = cardAssetKey(drawnCard);
    }

    const tempSprite = this.add.image(sourceX, sourceY, textureKey);
    tempSprite.setDisplaySize(
      action.kind === 'draw-from-pile' ? CARD_W : DISCARD_CARD_W,
      action.kind === 'draw-from-pile' ? CARD_H : DISCARD_CARD_H,
    );
    tempSprite.setDepth(100);

    // Animate to the position the drawn card will occupy after hand sorting.
    // The card was already added to the hand by executeAction, so we sort a
    // copy and find where this card ends up.
    const sorted = [...hand].sort(LostCitiesScene.handSortCompare);
    const targetIdx = sorted.findIndex(c => c.id === drawnCard.id);
    const targetX = PLAYER_HAND_CENTER;
    const targetY = HAND_TOP + targetIdx * HAND_OVERLAP + HAND_CARD_H / 2;

    this.tweens.add({
      targets: tempSprite,
      x: targetX,
      y: targetY,
      scaleX: HAND_CARD_W / (action.kind === 'draw-from-pile' ? CARD_W : DISCARD_CARD_W),
      scaleY: HAND_CARD_H / (action.kind === 'draw-from-pile' ? CARD_H : DISCARD_CARD_H),
      duration: ANIM_DURATION,
      ease: 'Power2',
      onComplete: () => {
        tempSprite.destroy();
        onComplete();
      },
    });
  }

  /**
   * Animate the AI playing or discarding a card (Phase 1).
   *
   * Picks a random face-down sprite from `aiHandSprites`, flips it to
   * reveal the played card texture, and moves it to the correct expedition
   * lane or discard pile.  Remaining AI hand sprites slide to close the gap.
   */
  private animateAiPhase1(action: Phase1Action, onComplete: () => void): void {
    const sprites = this.aiHandSprites;
    if (sprites.length === 0) {
      onComplete();
      return;
    }

    // Pick a random sprite index (AI hand is face-down so any will do)
    const spriteIdx = Math.floor(Math.random() * sprites.length);
    const sprite = sprites.splice(spriteIdx, 1)[0];
    sprite.setDepth(100);

    // Determine target position
    const colorIdx = EXPEDITION_COLORS.indexOf(action.color);
    let targetX: number;
    let targetY: number;

    if (action.kind === 'play-to-expedition') {
      // AI expeditions are shown in the opponent row
      const lane = this.session.players[1].expeditions.get(action.color) ?? [];
      const cardIdx = Math.max(0, lane.length - 1);
      targetX = laneX(colorIdx);
      targetY = OPP_EXP_TOP + cardIdx * EXP_OVERLAP + CARD_H / 2;
    } else {
      // Discard — shared discard row
      targetX = laneX(colorIdx);
      targetY = DISCARD_Y + DISCARD_CARD_H / 2;
    }

    const isDiscard = action.kind === 'discard';
    const finalW = isDiscard ? DISCARD_CARD_W : CARD_W;
    const finalH = isDiscard ? DISCARD_CARD_H : CARD_H;

    flipCard({
      scene: this,
      target: sprite,
      newTexture: cardAssetKey(action.card),
      duration: AI_ANIM_DURATION,
      destX: targetX,
      destY: targetY,
      onMidpoint: () => {
        sprite.setDisplaySize(finalW, finalH);
      },
      onComplete: () => {
        sprite.destroy();

        // Slide remaining AI hand sprites to close the gap
        for (let i = 0; i < sprites.length; i++) {
          const newY = HAND_TOP + i * HAND_OVERLAP + HAND_CARD_H / 2;
          if (sprites[i].y !== newY) {
            moveGameObject({
              scene: this,
              target: sprites[i],
              destX: AI_HAND_CENTER,
              destY: newY,
              duration: 200,
            });
          }
          sprites[i].setDepth(i + 1);
        }

        onComplete();
      },
    });
  }

  /**
   * Animate the AI drawing a card (Phase 2).
   *
   * Creates a face-down temporary sprite at the draw source and slides it to
   * the AI hand.  A floating text annotation ("Drew from pile" or
   * "Drew [Color]") appears near the source and fades out over 1000ms.
   */
  private animateAiPhase2(action: Phase2Action, onComplete: () => void): void {
    // Determine draw source position
    let sourceX: number;
    let sourceY: number;
    let annotationText: string;

    if (action.kind === 'draw-from-pile') {
      sourceX = MID_COL_CENTER;
      sourceY = DRAW_PILE_Y + CARD_H / 2;
      annotationText = 'Drew from pile';
    } else {
      const colorIdx = EXPEDITION_COLORS.indexOf(action.color);
      sourceX = laneX(colorIdx);
      sourceY = DISCARD_Y + DISCARD_CARD_H / 2;
      annotationText = `Drew ${colorDisplayName(action.color)}`;
    }

    // Create temporary face-down sprite at the draw source
    const tempSprite = this.add.image(sourceX, sourceY, CARD_BACK_KEY);
    tempSprite.setDisplaySize(
      action.kind === 'draw-from-pile' ? CARD_W : DISCARD_CARD_W,
      action.kind === 'draw-from-pile' ? CARD_H : DISCARD_CARD_H,
    );
    tempSprite.setDepth(100);

    // Target: last position in the AI hand column
    const aiHandSize = this.session.players[1].hand.length;
    const targetIdx = aiHandSize - 1;
    const targetX = AI_HAND_CENTER;
    const targetY = HAND_TOP + targetIdx * HAND_OVERLAP + HAND_CARD_H / 2;

    // Floating annotation text near the draw source
    const annotation = this.add.text(sourceX, sourceY - 40, annotationText, {
      fontFamily: FONT_FAMILY,
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    });
    annotation.setOrigin(0.5);
    annotation.setDepth(101);
    // Fade out the annotation over 1000ms
    this.tweens.add({
      targets: annotation,
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => {
        annotation.destroy();
      },
    });

    // Animate the face-down sprite to the AI hand
    moveGameObject({
      scene: this,
      target: tempSprite,
      destX: targetX,
      destY: targetY,
      duration: AI_ANIM_DURATION,
      onComplete: () => {
        tempSprite.destroy();
        onComplete();
      },
    });
  }

  // ── Illegal move feedback ───────────────────────────────
  private showIllegalMoveFlash(sprite: Phaser.GameObjects.Image): void {
    if (!sprite) return;

    this.soundManager?.play(SFX_KEYS.ILLEGAL_MOVE);

    shakeIllegalMove({ scene: this, target: sprite });

    this.instructionText.setText('Illegal move!');
    this.time.delayedCall(1200, () => {
      if (this.turnPhase === 'waiting-for-target') {
        this.instructionText.setText(
          'Click an expedition lane to play, or a discard pile to discard',
        );
      }
    });
  }

  // ── Round summary overlay ───────────────────────────────
  private showRoundSummary(roundScore: RoundScoreResult): void {
    this.setPhase('round-over');
    this.aiPlayer.resetRoundHistory();
    this.soundManager?.play(SFX_KEYS.ROUND_END);
    this.time.delayedCall(400, () => {
      this.soundManager?.play(SFX_KEYS.SCORE_REVEAL);
    });

    const overlay = createOverlayBackground(
      this,
      { depth: 10, alpha: 0.8 },
      { width: 600, height: 450, alpha: 0.92 },
    );
    this.overlayObjects.push(...overlay.objects);

    const cx = GAME_W / 2;
    const topY = GAME_H / 2 - 200;

    const title = this.add
      .text(cx, topY, `Round ${this.session.roundNumber - 1} Complete`, {
        fontSize: '28px',
        color: '#f0c040',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.overlayObjects.push(title);

    // Score breakdown table
    const [p0Details, p1Details] = roundScore.details;
    const [p0Total, p1Total] = roundScore.totals;

    let y = topY + 50;

    // Header row
    const header = this.add
      .text(cx, y, 'Color             You     AI', {
        fontSize: '14px',
        color: '#aaaaaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.overlayObjects.push(header);
    y += 26;

    // Per-expedition rows
    for (let i = 0; i < EXPEDITION_COLORS.length; i++) {
      const color = EXPEDITION_COLORS[i];
      const p0Bd = p0Details.find(b => b.color === color);
      const p1Bd = p1Details.find(b => b.color === color);
      const p0Score = p0Bd ? p0Bd.score : 0;
      const p1Score = p1Bd ? p1Bd.score : 0;
      const p0Cards = p0Bd ? p0Bd.cardCount : 0;
      const p1Cards = p1Bd ? p1Bd.cardCount : 0;

      const colorName = color.charAt(0).toUpperCase() + color.slice(1);
      const p0Str = p0Cards > 0 ? `${p0Score}` : '-';
      const p1Str = p1Cards > 0 ? `${p1Score}` : '-';

      const row = this.add
        .text(cx, y, `${colorName.padEnd(14)}${p0Str.padStart(8)}${p1Str.padStart(8)}`, {
          fontSize: '14px',
          color: '#dddddd',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5, 0)
        .setDepth(11);
      this.overlayObjects.push(row);
      y += 22;
    }

    // Totals
    y += 8;
    const totalRow = this.add
      .text(cx, y, `Round Total${String(p0Total).padStart(11)}${String(p1Total).padStart(8)}`, {
        fontSize: '16px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.overlayObjects.push(totalRow);

    y += 30;
    const [cum0, cum1] = this.session.cumulativeScores;
    const cumRow = this.add
      .text(cx, y, `Cumulative${String(cum0).padStart(12)}${String(cum1).padStart(8)}`, {
        fontSize: '16px',
        color: '#f0c040',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.overlayObjects.push(cumRow);

    // Next round button
    y += 50;
    const btn = createOverlayButton(this, cx, y, '[ Next Round ]');
    btn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      this.dismissCurrentOverlay();
      this.refreshAll();
      this.checkNextTurn();
    });
    this.overlayObjects.push(btn);
  }

  // ── Match summary overlay ───────────────────────────────
  private showMatchSummary(lastRoundScore: RoundScoreResult): void {
    this.setPhase('match-over');

    // Finalize transcript
    const transcript = this.recorder.finalize(this.session);
    autoSaveTranscript(transcriptStore, 'lost-cities', transcript, '[LostCitiesScene]');

    const overlay = createOverlayBackground(
      this,
      { depth: 10, alpha: 0.85 },
      { width: 600, height: 480, alpha: 0.92 },
    );
    this.overlayObjects.push(...overlay.objects);

    const cx = GAME_W / 2;
    const topY = GAME_H / 2 - 215;

    const winnerId = getMatchWinner(this.session);
    const winnerText = winnerId === 0 ? 'You Win!' : winnerId === 1 ? 'AI Wins!' : "It's a Tie!";

    // Play win/lose sound followed by score reveal
    if (winnerId === 0) {
      this.soundManager?.play(SFX_KEYS.MATCH_WIN);
    } else {
      this.soundManager?.play(SFX_KEYS.MATCH_LOSE);
    }
    this.time.delayedCall(600, () => {
      this.soundManager?.play(SFX_KEYS.SCORE_REVEAL);
    });

    const title = this.add
      .text(cx, topY, winnerText, {
        fontSize: '32px',
        color: '#f0c040',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.overlayObjects.push(title);

    let y = topY + 55;

    // Per-round scores table
    const header = this.add
      .text(cx, y, 'Round             You     AI', {
        fontSize: '14px',
        color: '#aaaaaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.overlayObjects.push(header);
    y += 26;

    for (let r = 0; r < this.session.roundScores.length; r++) {
      const rs = this.session.roundScores[r];
      const row = this.add
        .text(
          cx, y,
          `Round ${r + 1}${String(rs.totals[0]).padStart(14)}${String(rs.totals[1]).padStart(8)}`,
          {
            fontSize: '14px',
            color: '#dddddd',
            fontFamily: FONT_FAMILY,
          },
        )
        .setOrigin(0.5, 0)
        .setDepth(11);
      this.overlayObjects.push(row);
      y += 22;
    }

    y += 10;
    const [cum0, cum1] = this.session.cumulativeScores;
    const totalRow = this.add
      .text(cx, y, `Final Total${String(cum0).padStart(11)}${String(cum1).padStart(8)}`, {
        fontSize: '18px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.overlayObjects.push(totalRow);

    // Last round details (expandable — show inline)
    y += 40;
    const detailsTitle = this.add
      .text(cx, y, `Round 3 Breakdown`, {
        fontSize: '14px',
        color: '#aaccaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.overlayObjects.push(detailsTitle);
    y += 22;

    const [p0Details, p1Details] = lastRoundScore.details;
    for (const color of EXPEDITION_COLORS) {
      const p0Bd = p0Details.find(b => b.color === color);
      const p1Bd = p1Details.find(b => b.color === color);
      const p0Score = p0Bd && p0Bd.cardCount > 0 ? `${p0Bd.score}` : '-';
      const p1Score = p1Bd && p1Bd.cardCount > 0 ? `${p1Bd.score}` : '-';
      const colorName = color.charAt(0).toUpperCase() + color.slice(1);

      const row = this.add
        .text(cx, y, `${colorName.padEnd(14)}${p0Score.padStart(8)}${p1Score.padStart(8)}`, {
          fontSize: '12px',
          color: '#bbbbbb',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5, 0)
        .setDepth(11);
      this.overlayObjects.push(row);
      y += 18;
    }

    // Buttons
    y += 20;
    const newMatchBtn = createOverlayButton(this, cx - 85, y, '[ New Match ]');
    newMatchBtn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      this.dismissCurrentOverlay();
      this.scene.restart();
    });
    this.overlayObjects.push(newMatchBtn);

    const menuBtn = createOverlayMenuButton(this, cx + 85, y);
    this.overlayObjects.push(menuBtn);
  }

  // ── Overlay helpers ─────────────────────────────────────
  private dismissCurrentOverlay(): void {
    dismissOverlay(this.overlayObjects);
    this.overlayObjects = [];
  }

  // ── Turn flow ───────────────────────────────────────────
  private checkNextTurn(): void {
    if (isMatchOver(this.session)) {
      this.setPhase('match-over');
      return;
    }

    const current = this.session.round.currentPlayer;
    if (this.session.players[current].isAI) {
      this.runAiTurn();
    } else {
      this.setPhase('waiting-for-card-select');
    }
  }

  // ── Cleanup ─────────────────────────────────────────────
  shutdown(): void {
    this.dismissCurrentOverlay();
    this.shutdownBase();
  }
}
