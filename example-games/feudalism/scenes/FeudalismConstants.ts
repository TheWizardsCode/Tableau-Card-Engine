/**
 * FeudalismConstants — shared layout, styling, timing, and audio constants.
 */
import { GAME_W, GAME_H } from '../../../src/ui';
import type { ResourceOrWild } from '../FeudalismCards';
export { GAME_W, GAME_H };

// ── Animation timing ──────────────────────────────────────
export const ANIM_DURATION = 400;
export const MOVE_DURATION = 700;
export const AI_PRE_PAUSE = 1000;

// ── Resource colours ──────────────────────────────────────
export const RESOURCE_FILL: Record<ResourceOrWild, number> = {
  oats:     0xE69F00,
  flax:     0x56B4E9,
  wheat:    0xD55E00,
  barley:   0xF0E442,
  turnip:   0x009E73,
  mead:     0xCC79A7,
};

export const RESOURCE_TEXT_COLOR: Record<ResourceOrWild, string> = {
  oats:     '#000000',
  flax:     '#000000',
  wheat:    '#000000',
  barley:   '#000000',
  turnip:   '#000000',
  mead:     '#000000',
};

// ── Layout regions ────────────────────────────────────────
export const UPPER_TOP = 52;
export const UPPER_BOT = 440;
export const UPPER_MID = (UPPER_TOP + UPPER_BOT) / 2;

// Patron tiles
export const PATRON_W = 100;
export const PATRON_H = 115;
export const PATRON_X = 10;

// Token supply
export const SUPPLY_TOKEN_R = 28;
export const SUPPLY_GAP = 62;
export const SUPPLY_TOTAL_H = 5 * SUPPLY_GAP;
export const SUPPLY_X = 1170;
export const SUPPLY_Y = UPPER_MID - SUPPLY_TOTAL_H / 2;

// Card market
export const MARKET_CARD_W = 155;
export const MARKET_CARD_H = 115;
export const MARKET_CARD_GAP = 14;
export const MARKET_TIER_GAP = 10;
export const MARKET_TOTAL_H = 3 * MARKET_CARD_H + 2 * MARKET_TIER_GAP;
export const MARKET_Y = UPPER_MID - MARKET_TOTAL_H / 2;
export const DECK_X = 240;
export const MARKET_X = DECK_X + 50 + 16;

// Section box styling
export const SECTION_BOX_STROKE = 0x445544;
export const SECTION_BOX_ALPHA = 0.4;
export const SECTION_BOX_FILL = 0x1a2a1a;
export const SECTION_BOX_FILL_ALPHA = 0.3;
export const SECTION_BOX_RADIUS = 8;
export const SECTION_BOX_PAD = 8;

// Lower band
export const LOWER_TOP = 452;
export const LOWER_BOX_H = 186;
export const PLAYER_AREA_X = 20;
export const PLAYER_AREA_Y = LOWER_TOP;
export const AI_AREA_X = 1260;
export const AI_AREA_Y = LOWER_TOP;
export const DIVIDER_X = 640;

// Action buttons
export const ACTION_Y = 660;
export const INSTRUCTION_Y = 696;

// ── Audio asset keys ──────────────────────────────────────
export const SFX_KEYS = {
  TOKEN_TAKE: 'sfx-card-draw',
  CARD_PURCHASE: 'sfx-card-flip',
  CARD_RESERVE: 'sfx-card-draw',
  PATRON_VISIT: 'sfx-score-reveal',
  TURN_CHANGE: 'sfx-turn-change',
  GAME_END: 'sfx-round-end',
  UI_CLICK: 'sfx-ui-click',
} as const;

// ── Turn phase ────────────────────────────────────────────
export type TurnPhase =
  | 'player-turn'
  | 'selecting-tokens'
  | 'discarding-tokens'
  | 'animating'
  | 'ai-turn'
  | 'game-over';
