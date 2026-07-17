/**
 * LostCitiesMockScene — Static layout mockup
 *
 * Renders placeholder rectangles for every UI zone at 1280x720
 * so the layout can be validated before building the interactive scene.
 *
 * Layout (revised):
 *  Left area (~920px):
 *   - Opponent expeditions (5 lanes, top)
 *   - Discard piles (5, center row)
 *   - Player expeditions (5 lanes, bottom)
 *
 *  Right column (~340px):
 *   - Opponent score (top)
 *   - Draw pile + round indicator (middle)
 *   - Player hand (8 cards, vertical stack)
 *   - Player score (bottom)
 */
import Phaser from 'phaser';
import {
  GAME_W,
  GAME_H,
  FONT_FAMILY,
  createSceneHeader,
} from '@ui/index';
import { EXPEDITION_COLORS, EXPEDITION_HEX } from '../LostCitiesCards';

// ── Card dimensions (larger now that hand moved to right) ──
const CARD_W = 95;
const CARD_H = 130; // ~140:190 aspect ratio

// ── Main tableau area (left) ───────────────────────────────
const TABLEAU_LEFT = 40;
const LANE_GAP = 18;
const LANE_STEP = CARD_W + LANE_GAP;

/** Center X for each expedition lane (indexed 0-4) */
function laneX(index: number): number {
  return TABLEAU_LEFT + index * LANE_STEP + CARD_W / 2;
}

/** Right edge of the tableau area */
const TABLEAU_RIGHT = TABLEAU_LEFT + 5 * LANE_STEP - LANE_GAP + CARD_W / 2;

// ── Right column ───────────────────────────────────────────
const RIGHT_COL_X = TABLEAU_RIGHT + 60;
const RIGHT_COL_W = GAME_W - RIGHT_COL_X - 20;
const RIGHT_COL_CENTER = RIGHT_COL_X + RIGHT_COL_W / 2;

// ── Header offset ──────────────────────────────────────────
const HEADER_H = 48;

// ── Opponent expedition area (top of tableau) ──────────────
const OPP_EXP_TOP = HEADER_H + 16;
const EXP_OVERLAP = 26; // vertical overlap for stacked cards
const EXP_SLOTS = 5; // show up to 5 card slots per lane
const EXP_HEIGHT = CARD_H + (EXP_SLOTS - 1) * EXP_OVERLAP;

// ── Center row: discard piles ──────────────────────────────
const DISCARD_GAP = 24;
const DISCARD_Y = OPP_EXP_TOP + EXP_HEIGHT + DISCARD_GAP;
const DISCARD_CARD_H = CARD_H * 0.8;
const DISCARD_CARD_W = CARD_W * 0.8;

// ── Player expedition area (below discard piles) ───────────
const PLR_EXP_TOP = DISCARD_Y + DISCARD_CARD_H + DISCARD_GAP;

// ── Right column vertical layout ───────────────────────────
// Opponent score at top
const OPP_SCORE_Y = HEADER_H + 16;
const SCORE_BOX_H = 50;

// Draw pile in the middle area
const DRAW_PILE_Y = OPP_SCORE_Y + SCORE_BOX_H + 24;

// Round indicator below draw pile
const ROUND_Y = DRAW_PILE_Y + CARD_H + 16;
const ROUND_BOX_H = 52;

// Player hand — vertical stack of 8 cards below round indicator
const HAND_TOP = ROUND_Y + ROUND_BOX_H + 20;
const HAND_CARD_COUNT = 8;
const HAND_OVERLAP = 30; // vertical overlap between hand cards
const HAND_TOTAL_H = CARD_W + (HAND_CARD_COUNT - 1) * HAND_OVERLAP;
// Hand cards are displayed horizontally (rotated 90°) or as smaller cards vertically
// We'll show them as mini vertical cards
const HAND_CARD_W = 60;
const HAND_CARD_H = 82;

// Player score at bottom
const PLR_SCORE_Y = GAME_H - SCORE_BOX_H - 16;

// ── Section box styling ────────────────────────────────────
const BOX_STROKE = 0x445544;
const BOX_STROKE_ALPHA = 0.6;
const BOX_FILL = 0x1a2a1a;
const BOX_FILL_ALPHA = 0.25;
const BOX_RADIUS = 6;
const BOX_PAD = 6;

// ── Zone label styles ──────────────────────────────────────
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

// ── Card slot rendering ────────────────────────────────────
const CARD_SLOT_RADIUS = 4;
const CARD_SLOT_STROKE_ALPHA = 0.15;

// ── Section box label font size ────────────────────────────
const MOCK_BOX_LABEL_FONT = '9px';

// ════════════════════════════════════════════════════════════
export class LostCitiesMockScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LostCitiesMockScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');

    // ── Header ──────────────────────────────────────────────
    createSceneHeader(this, 'Lost Cities \u2014 Layout Mockup');

    const gfx = this.add.graphics();

    // ── Opponent expeditions ────────────────────────────────
    this.drawSectionBox(
      gfx,
      TABLEAU_LEFT - BOX_PAD,
      OPP_EXP_TOP - BOX_PAD,
      5 * LANE_STEP - LANE_GAP + 2 * BOX_PAD,
      EXP_HEIGHT + 2 * BOX_PAD,
      'Opponent Expeditions',
    );

    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];
      const hex = Phaser.Display.Color.HexStringToColor(EXPEDITION_HEX[color]).color;
      for (let slot = 0; slot < EXP_SLOTS; slot++) {
        const x = laneX(i) - CARD_W / 2;
        const y = OPP_EXP_TOP + slot * EXP_OVERLAP;
        this.drawCardSlot(gfx, x, y, CARD_W, CARD_H, hex, slot === 0 ? 0.5 : 0.25);
      }
      this.add
        .text(laneX(i), OPP_EXP_TOP - 2, color.toUpperCase(), SMALL_LABEL)
        .setOrigin(0.5, 1);
    }

    // ── Discard piles (center row) ──────────────────────────
    this.drawSectionBox(
      gfx,
      TABLEAU_LEFT - BOX_PAD,
      DISCARD_Y - BOX_PAD,
      5 * LANE_STEP - LANE_GAP + 2 * BOX_PAD,
      DISCARD_CARD_H + 2 * BOX_PAD + 14,
      'Discard Piles',
    );

    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];
      const hex = Phaser.Display.Color.HexStringToColor(EXPEDITION_HEX[color]).color;
      const x = laneX(i) - DISCARD_CARD_W / 2;
      this.drawCardSlot(gfx, x, DISCARD_Y, DISCARD_CARD_W, DISCARD_CARD_H, hex, 0.35);
      this.add
        .text(laneX(i), DISCARD_Y + DISCARD_CARD_H + 2, 'Discard', SMALL_LABEL)
        .setOrigin(0.5, 0);
    }

    // ── Player expeditions ──────────────────────────────────
    this.drawSectionBox(
      gfx,
      TABLEAU_LEFT - BOX_PAD,
      PLR_EXP_TOP - BOX_PAD,
      5 * LANE_STEP - LANE_GAP + 2 * BOX_PAD,
      EXP_HEIGHT + 2 * BOX_PAD,
      'Your Expeditions',
    );

    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];
      const hex = Phaser.Display.Color.HexStringToColor(EXPEDITION_HEX[color]).color;
      for (let slot = 0; slot < EXP_SLOTS; slot++) {
        const x = laneX(i) - CARD_W / 2;
        const y = PLR_EXP_TOP + slot * EXP_OVERLAP;
        this.drawCardSlot(gfx, x, y, CARD_W, CARD_H, hex, slot === 0 ? 0.5 : 0.25);
      }
      this.add
        .text(laneX(i), PLR_EXP_TOP - 2, color.toUpperCase(), SMALL_LABEL)
        .setOrigin(0.5, 1);
    }

    // ════════════════════════════════════════════════════════
    // RIGHT COLUMN
    // ════════════════════════════════════════════════════════

    // ── Opponent score ──────────────────────────────────────
    this.drawSectionBox(
      gfx,
      RIGHT_COL_X - BOX_PAD,
      OPP_SCORE_Y - BOX_PAD,
      RIGHT_COL_W + 2 * BOX_PAD,
      SCORE_BOX_H + 2 * BOX_PAD,
      '',
    );
    this.add
      .text(RIGHT_COL_CENTER, OPP_SCORE_Y + 6, 'Opponent', LABEL_STYLE)
      .setOrigin(0.5, 0);
    this.add
      .text(RIGHT_COL_CENTER, OPP_SCORE_Y + 26, 'Score: 0', SCORE_STYLE)
      .setOrigin(0.5, 0);

    // ── Draw pile ───────────────────────────────────────────
    const drawPileX = RIGHT_COL_CENTER - CARD_W / 2;
    this.drawSectionBox(
      gfx,
      RIGHT_COL_X - BOX_PAD,
      DRAW_PILE_Y - BOX_PAD,
      RIGHT_COL_W + 2 * BOX_PAD,
      CARD_H + 2 * BOX_PAD + 16,
      'Draw Pile',
    );
    this.drawCardSlot(gfx, drawPileX, DRAW_PILE_Y, CARD_W, CARD_H, 0x336633, 0.7);
    this.add
      .text(RIGHT_COL_CENTER, DRAW_PILE_Y + CARD_H / 2, '44', {
        ...SCORE_STYLE,
        fontSize: '20px',
      })
      .setOrigin(0.5, 0.5);
    this.add
      .text(RIGHT_COL_CENTER, DRAW_PILE_Y + CARD_H + 4, 'remaining', SMALL_LABEL)
      .setOrigin(0.5, 0);

    // ── Round / turn indicator ──────────────────────────────
    this.drawSectionBox(
      gfx,
      RIGHT_COL_X - BOX_PAD,
      ROUND_Y - BOX_PAD,
      RIGHT_COL_W + 2 * BOX_PAD,
      ROUND_BOX_H + 2 * BOX_PAD,
      '',
    );
    this.add
      .text(RIGHT_COL_CENTER, ROUND_Y + 6, 'Round 1 / 3', SCORE_STYLE)
      .setOrigin(0.5, 0);
    this.add
      .text(RIGHT_COL_CENTER, ROUND_Y + 30, 'Your Turn', {
        ...LABEL_STYLE,
        fontSize: '13px',
        color: '#66dd66',
      })
      .setOrigin(0.5, 0);

    // ── Player hand (vertical stack) ────────────────────────
    this.drawSectionBox(
      gfx,
      RIGHT_COL_X - BOX_PAD,
      HAND_TOP - BOX_PAD,
      RIGHT_COL_W + 2 * BOX_PAD,
      HAND_TOTAL_H + 2 * BOX_PAD,
      'Your Hand (8 cards)',
    );

    for (let c = 0; c < HAND_CARD_COUNT; c++) {
      const colorIdx = c % 5;
      const color = EXPEDITION_COLORS[colorIdx];
      const hex = Phaser.Display.Color.HexStringToColor(EXPEDITION_HEX[color]).color;
      const x = RIGHT_COL_CENTER - HAND_CARD_W / 2;
      const y = HAND_TOP + c * HAND_OVERLAP;
      this.drawCardSlot(gfx, x, y, HAND_CARD_W, HAND_CARD_H, hex, 0.6);
      this.add
        .text(x + HAND_CARD_W / 2, y + HAND_CARD_H / 2, `${c + 2}`, {
          ...SCORE_STYLE,
          fontSize: '13px',
        })
        .setOrigin(0.5, 0.5);
    }

    // ── Player score ────────────────────────────────────────
    this.drawSectionBox(
      gfx,
      RIGHT_COL_X - BOX_PAD,
      PLR_SCORE_Y - BOX_PAD,
      RIGHT_COL_W + 2 * BOX_PAD,
      SCORE_BOX_H + 2 * BOX_PAD,
      '',
    );
    this.add
      .text(RIGHT_COL_CENTER, PLR_SCORE_Y + 6, 'You', LABEL_STYLE)
      .setOrigin(0.5, 0);
    this.add
      .text(RIGHT_COL_CENTER, PLR_SCORE_Y + 26, 'Score: 0', SCORE_STYLE)
      .setOrigin(0.5, 0);

    // ── Instructions bar (bottom) ───────────────────────────
    this.add
      .text(
        GAME_W / 2,
        GAME_H - 6,
        'Static layout mockup \u2014 no interactivity',
        { ...SMALL_LABEL, fontSize: '11px', color: '#667766' },
      )
      .setOrigin(0.5, 1);
  }

  // ── Helpers ──────────────────────────────────────────────

  /** Draw a rounded section box with optional top-left label. */
  private drawSectionBox(
    gfx: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
  ): void {
    gfx.lineStyle(1, BOX_STROKE, BOX_STROKE_ALPHA);
    gfx.fillStyle(BOX_FILL, BOX_FILL_ALPHA);
    gfx.fillRoundedRect(x, y, w, h, BOX_RADIUS);
    gfx.strokeRoundedRect(x, y, w, h, BOX_RADIUS);
    if (label) {
      this.add
        .text(x + 6, y - 1, label, {
          ...SMALL_LABEL,
          fontSize: MOCK_BOX_LABEL_FONT,
          color: '#667766',
        })
        .setOrigin(0, 1);
    }
  }

  /** Draw a single card placeholder rectangle. */
  private drawCardSlot(
    gfx: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    fillColor: number,
    alpha: number,
  ): void {
    gfx.fillStyle(fillColor, alpha);
    gfx.fillRoundedRect(x, y, w, h, CARD_SLOT_RADIUS);
    gfx.lineStyle(1, 0xffffff, CARD_SLOT_STROKE_ALPHA);
    gfx.strokeRoundedRect(x, y, w, h, CARD_SLOT_RADIUS);
  }
}
