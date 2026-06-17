/**
 * LostCitiesConstants — shared layout, styling, timing, and audio constants.
 */
import { GAME_W, GAME_H, FONT_FAMILY } from '../../../src/ui';

// ── Card dimensions ───────────────────────────────────────
export const CARD_W = 95;
export const CARD_H = 130;

// ── Left column: Expeditions + Discards ───────────────────
export const TABLEAU_LEFT = 40;
export const LANE_GAP = 18;
export const LANE_STEP = CARD_W + LANE_GAP;

export function laneX(index: number): number {
  return TABLEAU_LEFT + index * LANE_STEP + CARD_W / 2;
}

export const TABLEAU_RIGHT = TABLEAU_LEFT + 5 * LANE_STEP - LANE_GAP + CARD_W / 2;

// ── Right column: Scores, Draw pile, Round ────────────────
export const MID_COL_W = 190;
export const MID_COL_X = GAME_W - MID_COL_W - 16;
export const MID_COL_CENTER = MID_COL_X + MID_COL_W / 2;

// ── Middle column: Player hand + AI hand ──────────────────
export const HAND_AVAIL = MID_COL_X - TABLEAU_RIGHT;
export const HAND_BOX_W = 112;
export const HAND_EVEN_GAP = Math.floor((HAND_AVAIL - 2 * HAND_BOX_W) / 3);
export const PLAYER_HAND_BOX_X = TABLEAU_RIGHT + HAND_EVEN_GAP;
export const AI_HAND_BOX_X = PLAYER_HAND_BOX_X + HAND_BOX_W + HAND_EVEN_GAP;
export const PLAYER_HAND_CENTER = PLAYER_HAND_BOX_X + HAND_BOX_W / 2;
export const AI_HAND_CENTER = AI_HAND_BOX_X + HAND_BOX_W / 2;

// Header
export const HEADER_H = 48;

// Section box label height
export const BOX_LABEL_H = 16;

// Opponent expeditions
export const OPP_EXP_TOP = HEADER_H + BOX_LABEL_H + 16;
export const EXP_OVERLAP = 30;
export const EXP_SLOTS = 5;
export const EXP_HEIGHT = CARD_H + (EXP_SLOTS - 1) * EXP_OVERLAP;

// Player expeditions
export const PLR_EXP_BOTTOM = GAME_H - 16;
export const PLR_EXP_TOP = PLR_EXP_BOTTOM - EXP_HEIGHT;

// Discard piles
export const DISCARD_CARD_H = Math.round(CARD_H * 0.6);
export const DISCARD_CARD_W = Math.round(CARD_W * 0.6);
export const OPP_EXP_BOTTOM = OPP_EXP_TOP + EXP_HEIGHT;
export const PLR_BOX_TOP = PLR_EXP_TOP - BOX_LABEL_H;
export const DISCARD_AVAIL = PLR_BOX_TOP - OPP_EXP_BOTTOM;
export const DISCARD_Y = OPP_EXP_BOTTOM + Math.floor((DISCARD_AVAIL - DISCARD_CARD_H) / 2);

// Middle column vertical layout
export const SCORE_BOX_H = 50;
export const OPP_SCORE_Y = HEADER_H + 16;
export const PLR_SCORE_Y = GAME_H - SCORE_BOX_H - 16;

// Round indicator + draw pile
export const ROUND_BOX_H = 52;
export const MID_GROUP_GAP = 16;
export const DRAW_BOX_H = BOX_LABEL_H + CARD_H + 16;
export const MID_GROUP_TOTAL = ROUND_BOX_H + MID_GROUP_GAP + DRAW_BOX_H;
export const MID_AVAIL_TOP = OPP_SCORE_Y + SCORE_BOX_H + 12;
export const MID_AVAIL_BOT = PLR_SCORE_Y - 12;
export const MID_GROUP_TOP = MID_AVAIL_TOP + Math.floor((MID_AVAIL_BOT - MID_AVAIL_TOP - MID_GROUP_TOTAL) / 2);
export const ROUND_Y = MID_GROUP_TOP;
export const DRAW_PILE_Y = ROUND_Y + ROUND_BOX_H + MID_GROUP_GAP + BOX_LABEL_H;

// Right column: Hand
export const HAND_TOP = HEADER_H + BOX_LABEL_H + 16;
export const HAND_BOTTOM = GAME_H - 30;
export const HAND_CARD_W = 100;
export const HAND_CARD_H = 137;
import { HAND_SIZE } from '../LostCitiesCards';
export const HAND_OVERLAP = Math.floor((HAND_BOTTOM - HAND_TOP - HAND_CARD_H) / (HAND_SIZE - 1));

// Animation timing
export const AI_DELAY = 800;
export const ANIM_DURATION = 300;
export const AI_ANIM_DURATION = 450;

// ── Audio asset keys ──────────────────────────────────────
// All SFX keys use the standard `sfx-` prefix — no game-specific prefix.
// See docs/SFX_CONVENTION.md for the naming convention.
import { COMMON_SFX_KEYS } from '../../../src/core-engine/SoundManager';

export const SFX_KEYS = {
  CARD_SELECT: 'sfx-card-select',
  CARD_DESELECT: 'sfx-card-deselect',
  CARD_PLAY: 'sfx-card-play',
  CARD_DISCARD: 'sfx-card-discard',
  CARD_DRAW: 'sfx-card-draw',
  ILLEGAL_MOVE: 'sfx-illegal-move',
  TURN_CHANGE: COMMON_SFX_KEYS.TURN_CHANGE,
  ROUND_END: COMMON_SFX_KEYS.ROUND_END,
  MATCH_WIN: 'sfx-match-win',
  MATCH_LOSE: 'sfx-match-lose',
  SCORE_REVEAL: COMMON_SFX_KEYS.SCORE_REVEAL,
  UI_CLICK: COMMON_SFX_KEYS.UI_CLICK,
} as const;

// Text styles
export const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT_FAMILY,
  fontSize: '11px',
  color: '#aaccaa',
  align: 'center',
};

export const SCORE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT_FAMILY,
  fontSize: '16px',
  color: '#ffffff',
  align: 'center',
};

export const SMALL_LABEL: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT_FAMILY,
  fontSize: '10px',
  color: '#88aa88',
  align: 'center',
};

// Section box styling
export const BOX_STROKE = 0x445544;
export const BOX_STROKE_ALPHA = 0.6;
export const BOX_FILL = 0x1a2a1a;
export const BOX_FILL_ALPHA = 0.25;
export const BOX_RADIUS = 6;
export const BOX_PAD = 6;

// Tooltip styling
export const TOOLTIP_BG_COLOR = 0x000000;
export const TOOLTIP_BG_ALPHA = 0.9;
export const TOOLTIP_PAD = 10;
export const TOOLTIP_DEPTH = 800;
export const TOOLTIP_MAX_W = 260;

// ── Turn state machine ────────────────────────────────────
export type SceneTurnPhase =
  | 'waiting-for-card-select'
  | 'waiting-for-target'
  | 'waiting-for-draw'
  | 'animating'
  | 'ai-thinking'
  | 'round-over'
  | 'match-over';
