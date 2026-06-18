/**
 * MindConstants -- shared timing, rendering, and game-logic constants for The Mind.
 *
 * Layout positions are now defined via SLL in `../layouts/the-mind.layout.json`
 * and resolved through `MindLayoutAdapter.ts`.
 */

import { GAME_W } from '../../../src/ui';

// Card display dimensions (~50% larger than default for readability)
export const CARD_W = 120;
export const CARD_H = 164;

export const CARD_GAP = 8;
export const MAX_HAND_WIDTH = GAME_W - 80; // leave 40px margin each side

// Timing
export const LEVEL_COMPLETE_DELAY = 2000;
export const PENALTY_REVEAL_DELAY = 1000;
export const ANIM_DURATION = 250;
export const PRE_PENALTY_PAUSE = 120;

// Depths
export const DEPTH_CARDS = 1;
export const DEPTH_PILE = 2;
export const DEPTH_PLAYED_CARD = 3;
export const DEPTH_UI = 5;
export const DEPTH_OVERLAY = 2000;
export const DEPTH_OVERLAY_CONTENT = DEPTH_OVERLAY + 1;

// ── Overlay display ────────────────────────────────────────
export const OVERLAY_BG_ALPHA = 0.75;
export const OVERLAY_BOX_WIDTH = 460;
export const OVERLAY_BOX_HEIGHT = 280;
export const OVERLAY_BOX_ALPHA = 0.9;
export const OVERLAY_BUTTON_FONT_SIZE = '18px';
export const OVERLAY_BUTTON_Y_OFFSET = 60;
export const OVERLAY_BUTTON_SPACING = 90;

// ── Auto-play button ───────────────────────────────────────
export const AUTO_PLAY_BUTTON_X = 20;
export const AUTO_PLAY_BUTTON_MARGIN = 20;
export const AUTO_PLAY_FONT_SIZE = '12px';

// ── HUD / status display ───────────────────────────────────
export const STATUS_X_OFFSET = 100;
export const STATUS_LEVEL_Y = 55;
export const STATUS_LIVES_Y = 79;

// ── Pile display ───────────────────────────────────────────
export const PILE_COUNT_Y_OFFSET = 32;
export const PILE_COUNT_FONT_SIZE = '11px';
export const PILE_VALUE_Y_OFFSET = 14;
export const PILE_VALUE_FONT_SIZE = '14px';

// ── Instruction text ───────────────────────────────────────
export const INSTRUCTION_MARGIN = 20;
export const INSTRUCTION_FONT_SIZE = '12px';

// ── Card hover interaction ─────────────────────────────────
export const HOVER_SCALE = 1.03;
export const HOVER_Y_OFFSET = -4;

// ── Life flash animation ───────────────────────────────────
export const FLASH_DELAY = 150;
export const FLASH_REPEATS = 5;
export const FLASH_TIMER_OFFSET = 50;

// ── Penalty card display ───────────────────────────────────
export const PENALTY_CARD_ALPHA = 0.8;
export const PENALTY_CLEANUP_EXTRA_DELAY = 50;

// ── Level-complete text ────────────────────────────────────
export const LEVEL_COMPLETE_TEXT_Y_OFFSET = 40;
export const LEVEL_COMPLETE_FADE_IN_DURATION = 300;
export const LEVEL_COMPLETE_DISPLAY_DURATION = 2000;

// ── Phase state machine ─────────────────────────────────────
export type GamePhase =
  | 'dealing'
  | 'playing'
  | 'animating'
  | 'penalty'
  | 'level-complete'
  | 'game-won'
  | 'game-lost';
