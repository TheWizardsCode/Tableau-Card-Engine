/**
 * SushiGoConstants -- shared layout, styling, and audio constants for Sushi Go!
 */

import { GAME_W } from '../../../src/ui';
import type { SushiGoCardType } from '../SushiGoCards';

export const ANIM_DURATION = 300;

export const SUSHI_ICON_FILES = [
  'icon-nigiri-salmon.svg', 'icon-nigiri-egg.svg', 'icon-nigiri-squid.svg',
  'icon-maki-1.svg', 'icon-maki-2.svg', 'icon-maki-3.svg',
  'icon-tempura.svg', 'icon-sashimi.svg', 'icon-dumpling.svg',
  'icon-wasabi.svg', 'icon-pudding.svg', 'icon-chopsticks.svg',
] as const;

// Layout regions
export const HAND_Y = 600;
export const HAND_CARD_W = 110;
export const HAND_CARD_H = 145;
export const HAND_GAP = 8;

export const PLAYER_TABLEAU_Y = 395;
export const AI_TABLEAU_Y = 200;
export const TABLEAU_SCALE = 0.62;
export const TABLEAU_CARD_W = Math.round(HAND_CARD_W * TABLEAU_SCALE);
export const TABLEAU_CARD_H = Math.round(HAND_CARD_H * TABLEAU_SCALE);
export const TABLEAU_GROUP_GAP = 24;
export const TABLEAU_CARD_GAP = 6;

export const SCORE_AREA_X = GAME_W - 15;
export const PLAYER_SCORE_Y = 485;
export const AI_SCORE_Y = 100;

// Card type display config
export const CARD_STYLES: Record<SushiGoCardType, { bg: number; text: string; short: string }> = {
  tempura:    { bg: 0xFFD700, text: '#333333', short: 'TMP' },
  sashimi:    { bg: 0x98FB98, text: '#1a3a1a', short: 'SSH' },
  dumpling:   { bg: 0xFFB347, text: '#333333', short: 'DMP' },
  maki:       { bg: 0xFF6B6B, text: '#ffffff', short: 'MK' },
  nigiri:     { bg: 0xFFE4B5, text: '#333333', short: 'NG' },
  wasabi:     { bg: 0x90EE90, text: '#1a3a1a', short: 'WSB' },
  pudding:    { bg: 0xFFDAB9, text: '#333333', short: 'PDG' },
  chopsticks: { bg: 0xC0C0C0, text: '#333333', short: 'CHP' },
};

// Scoring-rule tooltip text per card type
export const SCORING_TOOLTIPS: Record<SushiGoCardType, string> = {
  tempura:    '5 pts per pair (incomplete pair = 0)',
  sashimi:    '10 pts per set of 3 (incomplete set = 0)',
  dumpling:   '1/3/6/10/15 pts for 1/2/3/4/5+ dumplings',
  maki:       'Most maki icons = 6 pts, 2nd most = 3 pts (ties split)',
  nigiri:     'Egg 1 pt, Salmon 2 pts, Squid 3 pts (x3 if on wasabi)',
  wasabi:     'Triples the next nigiri played on it',
  pudding:    'End of game: most = +6 pts, fewest = -6 pts (ties split)',
  chopsticks: 'Pick 2 cards in one turn (return chopsticks to hand)',
};

// Tooltip styling
export const TOOLTIP_BG_COLOR = 0x000000;
export const TOOLTIP_BG_ALPHA = 0.85;
export const TOOLTIP_PADDING = 8;
export const TOOLTIP_FONT_SIZE = '13px';
export const TOOLTIP_MAX_WIDTH = 280;
export const TOOLTIP_DEPTH = 800;

// Audio asset keys
export const SFX_KEYS = {
  CARD_PICK: 'sfx-card-draw',
  CARD_FLIP: 'sfx-card-flip',
  TURN_CHANGE: 'sfx-turn-change',
  ROUND_END: 'sfx-round-end',
  SCORE_REVEAL: 'sfx-score-reveal',
  UI_CLICK: 'sfx-ui-click',
} as const;

// ── Scene text labels ──────────────────────────────────────
export const LABEL_X = 25;
export const LABEL_Y_OFFSET = -50;
export const LABEL_FONT_SIZE = '18px';

// ── Score display ──────────────────────────────────────────
export const ROUND_TEXT_Y = 51;
export const ROUND_TEXT_FONT_SIZE = '20px';
export const TURN_TEXT_Y = 75;
export const TURN_TEXT_FONT_SIZE = '16px';
export const CARDS_LEFT_TEXT_Y = 95;
export const CARDS_LEFT_TEXT_FONT_SIZE = '14px';
export const SCORE_TEXT_FONT_SIZE = '20px';

// ── Instruction text ───────────────────────────────────────
export const INSTRUCTION_MARGIN = 14;
export const INSTRUCTION_FONT_SIZE = '15px';

// ── Chopsticks button ──────────────────────────────────────
export const CHOPSTICKS_BUTTON_FONT_SIZE = '16px';
export const CHOPSTICKS_BUTTON_Y_OFFSET = 25;
export const CHOPSTICKS_BUTTON_PADDING_X = 16;
export const CHOPSTICKS_BUTTON_PADDING_Y = 8;
export const CHOPSTICKS_BUTTON_BG = 0x1a3a2a;
export const CHOPSTICKS_BUTTON_HOVER_BG = 0x2a5a3a;
export const CHOPSTICKS_BUTTON_TEXT_COLOR = '#88ddff';
export const CHOPSTICKS_BUTTON_HOVER_TEXT_COLOR = '#ffffff';
export const CHOPSTICKS_BUTTON_ACTIVE_TEXT_COLOR = '#ff8888';
export const CHOPSTICKS_BUTTON_RADIUS = 8;
export const CHOPSTICKS_BUTTON_DEPTH = 700;

// ── Tooltip positioning ────────────────────────────────────
export const TOOLTIP_Y_OFFSET = 40;
export const TOOLTIP_CLAMP_BOUNDARY = 4;
export const TOOLTIP_FLIP_THRESHOLD = 30;

// ── Card highlight (chopsticks mode) ───────────────────────
export const HIGHLIGHT_PADDING = 6;
export const HIGHLIGHT_STROKE_WIDTH = 3;
export const HIGHLIGHT_FILL_ALPHA = 0.15;

// ── Chopsticks tableau highlight (on the chopsticks card in tableau) ────
export const CHOPSTICKS_TABLEAU_HIGHLIGHT_COLOR = 0x44aaff;
export const CHOPSTICKS_TABLEAU_ACTIVE_COLOR = 0xffaa44;
export const CHOPSTICKS_TABLEAU_HIGHLIGHT_ALPHA = 0.2;
export const CHOPSTICKS_TABLEAU_HIGHLIGHT_PADDING = 8;
export const CHOPSTICKS_TABLEAU_HIGHLIGHT_STROKE = 2;

// ── First card pick highlight (more prominent than general highlight) ──
export const HIGHLIGHT_FIRST_PICK_COLOR = 0x00ff66;
export const HIGHLIGHT_FIRST_PICK_STROKE_WIDTH = 4;
export const HIGHLIGHT_FIRST_PICK_FILL_ALPHA = 0.25;

// ── Chopsticks cancel button ───────────────────────────────────────────
export const CHOPSTICKS_CANCEL_FONT_SIZE = '14px';
export const CHOPSTICKS_CANCEL_TEXT_COLOR = '#ff6666';
export const CHOPSTICKS_CANCEL_HOVER_COLOR = '#ffffff';
export const CHOPSTICKS_CANCEL_Y_OFFSET = 55;
export const CHOPSTICKS_CANCEL_PADDING_X = 14;
export const CHOPSTICKS_CANCEL_PADDING_Y = 6;
export const CHOPSTICKS_CANCEL_BG = 0x4a2a2a;
export const CHOPSTICKS_CANCEL_HOVER_BG = 0x6a3a3a;
export const CHOPSTICKS_CANCEL_DEPTH = 700;

// ── Step indicator ─────────────────────────────────────────────────────
export const STEP_INDICATOR_FONT_SIZE = '15px';
export const STEP_INDICATOR_COLOR = '#ffdd44';
export const STEP_INDICATOR_Y_OFFSET = -40;
export const STEP_INDICATOR_DEPTH = 700;
export const STEP_INDICATOR_1_OF_2 = 'Step 1 of 2';
export const STEP_INDICATOR_2_OF_2 = 'Step 2 of 2';

// ── Turn animation delay ───────────────────────────────────
export const TURN_ANIMATION_DELAY = 300;

// ── Chopsticks small card highlight (hand suggestion) ──────────────────
export const CHOPSTICKS_SUGGEST_HIGHLIGHT_COLOR = 0x4488ff;
export const CHOPSTICKS_SUGGEST_HIGHLIGHT_ALPHA = 0.08;

// Turn phase
export type TurnPhase =
  | 'picking'
  | 'animating'
  | 'ai-thinking'
  | 'round-scored'
  | 'game-over';
