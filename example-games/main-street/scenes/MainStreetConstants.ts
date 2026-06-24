/**
 * MainStreetConstants -- shared layout, styling, and audio constants for Main Street.
 */

/** Background colour for Main Street (warm town feel). */
export const BG_COLOR = '#2a1f14';

// Section box styling
export const BOX_STROKE = 0x665544;
export const BOX_FILL = 0x2a1f14;
export const BOX_RADIUS = 6;

// Base metrics are tuned for 1280x720 and scaled at runtime for narrower/taller viewports.
export const BASE_HUD_Y = 50;
export const BASE_MARKET_CARD_W = 140;
export const BASE_MARKET_CARD_H = 80;
export const BASE_MARKET_ROW_GAP = 10;
export const BASE_MARKET_CARD_GAP = 12;
export const BASE_MARKET_LABEL_W = 90;
// Incident queue uses same card size as market for consistency
export const BASE_QUEUE_CARD_W = BASE_MARKET_CARD_W;
export const BASE_QUEUE_CARD_H = BASE_MARKET_CARD_H;
export const BASE_QUEUE_CARD_GAP = 10;
// Make street slots match market placeholder size (market slots: 140x80)
export const BASE_SLOT_W = 140;
export const BASE_SLOT_H = 80;
export const BASE_SLOT_GAP = 10;
export const STREET_COLS = 5;
export const STREET_ROWS = 2;
export const STREET_ROW_GAP = 12;
// Make hand slot match placeholder size as requested
export const BASE_HAND_CARD_W = 140;
export const BASE_HAND_CARD_H = 80;

// ── Main Street SFX keys (logical keys used by SoundManager)
// All SFX keys use the standard `sfx-` prefix — no game-specific prefix.
// See docs/SFX_CONVENTION.md for the naming convention.
import { COMMON_SFX_KEYS } from '../../../src/core-engine/SoundManager';

export const SFX_KEYS = {
  DEAL: 'sfx-deal',
  MOVE_LOOP: 'sfx-move-loop',
  PLACE: 'sfx-place',
  DISCARD: 'sfx-discard',
  COIN_POP: 'sfx-coin-pop',
  INCOME_NEUTRAL: 'sfx-income-neutral',
  CLICK: COMMON_SFX_KEYS.UI_CLICK,
  BG_LOOP: 'sfx-bg-loop',
  BUSINESS_START: 'sfx-business-start',
  BUSINESS_END: 'sfx-business-end',
  UPGRADE_START: 'sfx-upgrade-start',
  UPGRADE_END: 'sfx-upgrade-end',
  EVENT_CHEER: 'sfx-event-cheer',
} as const;

// Activity Log panel layout
export const LOG_TITLE_H = 22;
export const LOG_PAD = 8;
export const LOG_FONT_SIZE = 13;
export const LOG_LINE_H = 18;
export const LOG_SCROLL_SPEED = 24;

// Log entry colors by type
export const LOG_COLORS: Record<string, string> = {
  gain: '#44ff44',
  loss: '#ff4444',
  neutral: '#ccbbaa',
  'turn-header': '#ffdd44',
};

// Challenge Tracker panel layout
export const CHALLENGE_LINE_H = 20;
export const CHALLENGE_PAD = 6;
export const CHALLENGE_TITLE_H = 20;

export interface SceneLayout {
  gameW: number;
  gameH: number;
  hudY: number;
  marketTop: number;
  marketRowH: number;
  marketRowGap: number;
  marketCardW: number;
  marketCardH: number;
  marketCardGap: number;
  marketLabelW: number;
  queueTop: number;
  queueCardW: number;
  queueCardH: number;
  queueCardGap: number;
  queueLabelW: number;
  streetTop: number;
  slotW: number;
  slotH: number;
  slotGap: number;
  streetX: number;
  streetRowGap: number;
  streetCols: number;
  handY: number;
  handX: number;
  handCardW: number;
  handCardH: number;
  instructionY: number;
  actionY: number;
  actionButtonH: number;
  actionButtonW: number;
  hintButtonW: number;
  smallButtonW: number;
  challengeX: number;
  challengeY: number;
  challengeW: number;
  logX: number;
  logY: number;
  logW: number;
  logH: number;
}
