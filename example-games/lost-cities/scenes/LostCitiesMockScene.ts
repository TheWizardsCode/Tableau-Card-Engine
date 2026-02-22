/**
 * LostCitiesMockScene — Static layout mockup
 *
 * Renders placeholder rectangles for every UI zone at 1280x720
 * so the layout can be validated before building the interactive scene.
 *
 * Zones:
 *  - Opponent expeditions (5 lanes, top)
 *  - Discard piles (5, center-left)
 *  - Draw pile (center-right)
 *  - Player expeditions (5 lanes, lower)
 *  - Player hand (bottom)
 *  - Score displays (both players)
 *  - Round / turn indicator
 */
import Phaser from 'phaser';
import {
  GAME_W,
  GAME_H,
  FONT_FAMILY,
  createSceneHeader,
} from '@ui/index';
import { EXPEDITION_COLORS, EXPEDITION_HEX } from '../LostCitiesCards';

// ── Card dimensions ────────────────────────────────────────
const CARD_W = 80; // scaled down from 140 to fit 5 lanes + hand
const CARD_H = 109; // maintain ~140:190 aspect ratio

// ── Layout constants ───────────────────────────────────────

// Column positions for the 5 expedition colors (equally spaced)
const LANE_START_X = 160; // left edge of first lane
const LANE_GAP = 16; // gap between lanes
const LANE_STEP = CARD_W + LANE_GAP; // distance between lane centers

/** Center X for each expedition lane (indexed 0-4) */
function laneX(index: number): number {
  return LANE_START_X + index * LANE_STEP + CARD_W / 2;
}

// ── Opponent expedition area (top) ─────────────────────────
const OPP_EXP_TOP = 54;
const OPP_EXP_OVERLAP = 24; // vertical overlap for stacked cards
const OPP_EXP_SLOTS = 4; // show up to 4 card slots per lane
const OPP_EXP_HEIGHT = CARD_H + (OPP_EXP_SLOTS - 1) * OPP_EXP_OVERLAP;

// ── Center row: discard piles + draw pile + scores ─────────
const CENTER_Y = OPP_EXP_TOP + OPP_EXP_HEIGHT + 18;
const CENTER_CARD_H = CARD_H * 0.9;
const CENTER_CARD_W = CARD_W * 0.9;

// Draw pile + info — right of the expedition columns
const DRAW_PILE_X = LANE_START_X + 5 * LANE_STEP + 40;
const DRAW_PILE_Y = CENTER_Y;

// Score area — right side
const SCORE_X = DRAW_PILE_X + CARD_W + 60;
const OPP_SCORE_Y = OPP_EXP_TOP + 20;
const PLR_SCORE_Y = GAME_H - 80;
const ROUND_INDICATOR_Y = CENTER_Y + 10;

// ── Player expedition area (below center) ──────────────────
const PLR_EXP_TOP = CENTER_Y + CENTER_CARD_H + 18;
const PLR_EXP_OVERLAP = OPP_EXP_OVERLAP;
const PLR_EXP_SLOTS = 4;
const PLR_EXP_HEIGHT = CARD_H + (PLR_EXP_SLOTS - 1) * PLR_EXP_OVERLAP;

// ── Player hand (bottom) ──────────────────────────────────
const HAND_Y = PLR_EXP_TOP + PLR_EXP_HEIGHT + 14;
const HAND_CARD_COUNT = 8;
const HAND_GAP = 6;
const HAND_TOTAL_W = HAND_CARD_COUNT * CARD_W + (HAND_CARD_COUNT - 1) * HAND_GAP;
const HAND_START_X = (GAME_W / 2) - HAND_TOTAL_W / 2;

// ── Section box styling (consistent with Splendor) ─────────
const BOX_STROKE = 0x445544;
const BOX_STROKE_ALPHA = 0.6;
const BOX_FILL = 0x1a2a1a;
const BOX_FILL_ALPHA = 0.25;
const BOX_RADIUS = 6;
const BOX_PAD = 6;

// ── Zone label style ───────────────────────────────────────
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
      LANE_START_X - BOX_PAD,
      OPP_EXP_TOP - BOX_PAD,
      5 * LANE_STEP - LANE_GAP + 2 * BOX_PAD,
      OPP_EXP_HEIGHT + 2 * BOX_PAD,
      'Opponent Expeditions',
    );

    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];
      const hex = Phaser.Display.Color.HexStringToColor(EXPEDITION_HEX[color]).color;
      for (let slot = 0; slot < OPP_EXP_SLOTS; slot++) {
        const x = laneX(i) - CARD_W / 2;
        const y = OPP_EXP_TOP + slot * OPP_EXP_OVERLAP;
        this.drawCardSlot(gfx, x, y, CARD_W, CARD_H, hex, slot === 0 ? 0.5 : 0.25);
      }
      this.add
        .text(laneX(i), OPP_EXP_TOP - 2, color.toUpperCase(), SMALL_LABEL)
        .setOrigin(0.5, 1);
    }

    // ── Discard piles (center row) ──────────────────────────
    this.drawSectionBox(
      gfx,
      LANE_START_X - BOX_PAD,
      CENTER_Y - BOX_PAD,
      5 * LANE_STEP - LANE_GAP + 2 * BOX_PAD,
      CENTER_CARD_H + 2 * BOX_PAD + 14,
      'Discard Piles',
    );

    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];
      const hex = Phaser.Display.Color.HexStringToColor(EXPEDITION_HEX[color]).color;
      const x = laneX(i) - CENTER_CARD_W / 2;
      this.drawCardSlot(gfx, x, CENTER_Y, CENTER_CARD_W, CENTER_CARD_H, hex, 0.35);
      this.add
        .text(laneX(i), CENTER_Y + CENTER_CARD_H + 2, 'Discard', SMALL_LABEL)
        .setOrigin(0.5, 0);
    }

    // ── Draw pile ───────────────────────────────────────────
    this.drawSectionBox(
      gfx,
      DRAW_PILE_X - BOX_PAD,
      DRAW_PILE_Y - BOX_PAD,
      CARD_W + 2 * BOX_PAD,
      CARD_H + 2 * BOX_PAD + 16,
      'Draw Pile',
    );
    this.drawCardSlot(gfx, DRAW_PILE_X, DRAW_PILE_Y, CARD_W, CARD_H, 0x336633, 0.7);
    this.add
      .text(DRAW_PILE_X + CARD_W / 2, DRAW_PILE_Y + CARD_H / 2, '44', {
        ...SCORE_STYLE,
        fontSize: '20px',
      })
      .setOrigin(0.5, 0.5);
    this.add
      .text(DRAW_PILE_X + CARD_W / 2, DRAW_PILE_Y + CARD_H + 4, 'remaining', SMALL_LABEL)
      .setOrigin(0.5, 0);

    // ── Player expeditions ──────────────────────────────────
    this.drawSectionBox(
      gfx,
      LANE_START_X - BOX_PAD,
      PLR_EXP_TOP - BOX_PAD,
      5 * LANE_STEP - LANE_GAP + 2 * BOX_PAD,
      PLR_EXP_HEIGHT + 2 * BOX_PAD,
      'Your Expeditions',
    );

    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];
      const hex = Phaser.Display.Color.HexStringToColor(EXPEDITION_HEX[color]).color;
      for (let slot = 0; slot < PLR_EXP_SLOTS; slot++) {
        const x = laneX(i) - CARD_W / 2;
        const y = PLR_EXP_TOP + slot * PLR_EXP_OVERLAP;
        this.drawCardSlot(gfx, x, y, CARD_W, CARD_H, hex, slot === 0 ? 0.5 : 0.25);
      }
      this.add
        .text(laneX(i), PLR_EXP_TOP - 2, color.toUpperCase(), SMALL_LABEL)
        .setOrigin(0.5, 1);
    }

    // ── Player hand ─────────────────────────────────────────
    this.drawSectionBox(
      gfx,
      HAND_START_X - BOX_PAD,
      HAND_Y - BOX_PAD,
      HAND_TOTAL_W + 2 * BOX_PAD,
      CARD_H + 2 * BOX_PAD,
      'Your Hand (8 cards)',
    );

    for (let c = 0; c < HAND_CARD_COUNT; c++) {
      const x = HAND_START_X + c * (CARD_W + HAND_GAP);
      // Alternate colors to visualise distinct cards
      const colorIdx = c % 5;
      const color = EXPEDITION_COLORS[colorIdx];
      const hex = Phaser.Display.Color.HexStringToColor(EXPEDITION_HEX[color]).color;
      this.drawCardSlot(gfx, x, HAND_Y, CARD_W, CARD_H, hex, 0.6);
      this.add
        .text(x + CARD_W / 2, HAND_Y + CARD_H / 2, `${c + 2}`, {
          ...SCORE_STYLE,
          fontSize: '14px',
        })
        .setOrigin(0.5, 0.5);
    }

    // ── Score displays ──────────────────────────────────────
    this.drawSectionBox(
      gfx,
      SCORE_X - BOX_PAD,
      OPP_SCORE_Y - BOX_PAD,
      150 + 2 * BOX_PAD,
      40 + 2 * BOX_PAD,
      '',
    );
    this.add
      .text(SCORE_X + 75, OPP_SCORE_Y + 4, 'Opponent', LABEL_STYLE)
      .setOrigin(0.5, 0);
    this.add
      .text(SCORE_X + 75, OPP_SCORE_Y + 22, 'Score: 0', SCORE_STYLE)
      .setOrigin(0.5, 0);

    this.drawSectionBox(
      gfx,
      SCORE_X - BOX_PAD,
      PLR_SCORE_Y - BOX_PAD,
      150 + 2 * BOX_PAD,
      40 + 2 * BOX_PAD,
      '',
    );
    this.add
      .text(SCORE_X + 75, PLR_SCORE_Y + 4, 'You', LABEL_STYLE)
      .setOrigin(0.5, 0);
    this.add
      .text(SCORE_X + 75, PLR_SCORE_Y + 22, 'Score: 0', SCORE_STYLE)
      .setOrigin(0.5, 0);

    // ── Round / turn indicator ──────────────────────────────
    this.drawSectionBox(
      gfx,
      SCORE_X - BOX_PAD,
      ROUND_INDICATOR_Y - BOX_PAD,
      150 + 2 * BOX_PAD,
      52 + 2 * BOX_PAD,
      '',
    );
    this.add
      .text(SCORE_X + 75, ROUND_INDICATOR_Y + 4, 'Round 1 / 3', SCORE_STYLE)
      .setOrigin(0.5, 0);
    this.add
      .text(SCORE_X + 75, ROUND_INDICATOR_Y + 28, 'Your Turn', {
        ...LABEL_STYLE,
        fontSize: '13px',
        color: '#66dd66',
      })
      .setOrigin(0.5, 0);

    // ── Instructions bar (bottom) ───────────────────────────
    this.add
      .text(
        GAME_W / 2,
        GAME_H - 10,
        'Static layout mockup — no interactivity',
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
          fontSize: '9px',
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
    gfx.fillRoundedRect(x, y, w, h, 4);
    gfx.lineStyle(1, 0xffffff, 0.15);
    gfx.strokeRoundedRect(x, y, w, h, 4);
  }
}
