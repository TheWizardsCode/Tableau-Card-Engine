/**
 * GolfConstants -- shared layout, timing, and audio constants for 9-Card Golf.
 */

import { GAME_W } from '../../../src/ui';

// Card dimensions -- sized to fill the 1280x720 canvas in the horizontal
// layout.  Standard playing-card aspect ratio (5:7), roughly 2.5× the
// shared 48x65 defaults.
export const GOLF_CARD_W = 120;
export const GOLF_CARD_H = 168;

export const CARD_GAP = 10;
export const GRID_COLS = 3;
export const GRID_ROWS = 3;

export const AI_DELAY = 600; // ms before AI chooses
export const AI_SHOW_DRAW_DELAY = 1000; // ms to show drawn card before moving
export const ANIM_DURATION = 300; // ms for animations
export const SWAP_ANIM_DURATION = ANIM_DURATION * 1.5; // ms for swap/discard-and-flip

// Layout positions (horizontal: human grid left, piles center, AI grid right)
export const GRID_CENTER_Y = 385;
export const HUMAN_GRID_X = 230;
export const AI_GRID_X = 1050;
export const PILE_X = GAME_W / 2; // 640
export const STOCK_Y = 295;       // center Y of stock pile
export const DISCARD_Y = 490;     // center Y of discard pile

// ── Turn state machine ──────────────────────────────────────

export type TurnPhase =
  | 'waiting-for-draw' // human must click stock or discard
  | 'waiting-for-move' // human must click grid card (swap) or discard pile (discard-and-flip then click face-down)
  | 'waiting-for-flip-target' // human chose to discard, must click face-down card to flip
  | 'animating' // animation in progress
  | 'ai-thinking' // AI's turn, waiting for delay
  | 'round-ended'; // game over

// ── Audio asset keys ────────────────────────────────────────

export const SFX_KEYS = {
  CARD_DRAW: 'sfx-card-draw',
  CARD_FLIP: 'sfx-card-flip',
  CARD_SWAP: 'sfx-card-swap',
  CARD_DISCARD: 'sfx-card-discard',
  TURN_CHANGE: 'sfx-turn-change',
  ROUND_END: 'sfx-round-end',
  SCORE_REVEAL: 'sfx-score-reveal',
  UI_CLICK: 'sfx-ui-click',
} as const;
