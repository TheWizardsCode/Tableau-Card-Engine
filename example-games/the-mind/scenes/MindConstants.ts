/**
 * MindConstants -- shared layout, timing, and audio constants for The Mind.
 */

import { GAME_W, GAME_H } from '../../../src/ui';

// Card display dimensions (~50% larger than default for readability)
export const CARD_W = 120;
export const CARD_H = 164;

// Layout
export const PILE_X = GAME_W / 2;
export const PILE_Y = GAME_H / 2 - 10;

export const HUMAN_HAND_Y = GAME_H - 110;
export const AI_HAND_Y = 150;

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

// ── Audio asset keys ────────────────────────────────────────
export const SFX_KEYS = {
  CARD_PLAY: 'mind-sfx-card-play',
  LIFE_LOST: 'mind-sfx-life-lost',
  LEVEL_COMPLETE: 'mind-sfx-level-complete',
  GAME_WIN: 'mind-sfx-game-win',
  GAME_LOST: 'mind-sfx-game-lost',
  UI_CLICK: 'mind-sfx-ui-click',
} as const;

// ── Phase state machine ─────────────────────────────────────
export type GamePhase =
  | 'dealing'
  | 'playing'
  | 'animating'
  | 'penalty'
  | 'level-complete'
  | 'game-won'
  | 'game-lost';
