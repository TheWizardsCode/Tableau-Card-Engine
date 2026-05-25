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

// ── Phase state machine ─────────────────────────────────────
export type GamePhase =
  | 'dealing'
  | 'playing'
  | 'animating'
  | 'penalty'
  | 'level-complete'
  | 'game-won'
  | 'game-lost';
