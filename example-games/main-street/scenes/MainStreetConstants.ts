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
// Incident queue uses custom card size (120×69) for better panel fit
// while preserving the standard 7:4 aspect ratio of all card SVGs.
export const BASE_QUEUE_CARD_W = 120;
export const BASE_QUEUE_CARD_H = 69;
export const BASE_QUEUE_CARD_GAP = 10;

/**
 * Template id of the face-down incident-deck card back (CG-0MSXOWLHU0099QF6).
 * A static SVG asset (`svg/cards/card-back.svg`) fetched by the texture
 * manager; not a CSV card template.
 */
export const CARD_BACK_TEMPLATE = 'card-back';
// Make street slots match market placeholder size (market slots: 140x80)
export const BASE_SLOT_W = 140;
export const BASE_SLOT_H = 80;
export const BASE_SLOT_GAP = 20;
export const STREET_COLS = 5;
export const STREET_ROWS = 2;
/** Slots per street (STREET_COLS × STREET_ROWS). */
export const SLOTS_PER_STREET = STREET_COLS * STREET_ROWS;
/** Default number of street columns in the world grid (1×1 preserves legacy 10-slot behavior). */
export const STREET_GRID_COLS = 1;
/** Default number of street rows in the world grid. */
export const STREET_GRID_ROWS = 1;
/** Maximum supported grid dimensions (≥3×3 per AC). */
export const MAX_GRID_COLS = 5;
export const MAX_GRID_ROWS = 5;
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
  INCOME_POSITIVE: 'sfx-income-positive',
  INCOME_NEGATIVE: 'sfx-income-negative',
  INCOME_NEUTRAL: 'sfx-income-neutral',
  CLICK: COMMON_SFX_KEYS.UI_CLICK,
  BG_LOOP: 'sfx-bg-loop',
  BUSINESS_START: 'sfx-business-start',
  BUSINESS_END: 'sfx-business-end',
  UPGRADE_START: 'sfx-upgrade-start',
  UPGRADE_END: 'sfx-upgrade-end',
  EVENT_CHEER: 'sfx-event-cheer',
  CELEBRATE: 'sfx-challenge-complete',
  ILLEGAL_MOVE: COMMON_SFX_KEYS.ILLEGAL_MOVE,
  // Game-over fanfare/sting — convention keys documented in
  // docs/SFX_CONVENTION.md; WAVs live in the shared default audio dir
  // (`assets/audio/default/game-win.wav` / `game-lost.wav`).
  GAME_WIN: 'sfx-game-win',
  GAME_LOST: 'sfx-game-lost',
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

// ── Drag-and-drop transfer animation timing ──────────────────
// The drag-and-drop buy path derives its transfer duration from the
// distance between the drop location and the target slot centre, so a card
// released next to its slot settles into place quickly instead of taking
// the fixed 1500ms market→slot flight used by click/AI flows.
// See `computeDragTransferDuration` below (CG-0MST2LS3E004BTPO).
export const DRAG_TRANSFER_MS_PER_PX = 4;
export const DRAG_TRANSFER_DURATION_MIN_MS = 250;
export const DRAG_TRANSFER_DURATION_MAX_MS = 1500;

/**
 * Compute the transfer-animation duration (ms) for a drag-and-drop
 * placement from the drop-to-slot distance in pixels.
 *
 * Pure function (no Phaser dependency) so it is unit-testable headless:
 * returns `clamp(distance * DRAG_TRANSFER_MS_PER_PX, MIN, MAX)`. A card
 * dropped almost directly on its slot still gets a brief animated transfer
 * (the minimum), and the duration never exceeds the fixed 1500ms default
 * used by the non-drag transfer flows.
 */
export function computeDragTransferDuration(distancePx: number): number {
  const raw = distancePx * DRAG_TRANSFER_MS_PER_PX;
  return Math.min(DRAG_TRANSFER_DURATION_MAX_MS, Math.max(DRAG_TRANSFER_DURATION_MIN_MS, raw));
}

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
  eventsHeight: number;
  streetTop: number;
  slotW: number;
  slotH: number;
  slotGap: number;
  streetX: number;
  streetRowGap: number;
  streetCols: number;
  handY: number;
  handX: number;
  handCenterX: number;
  handCardW: number;
  handCardH: number;
  instructionY: number;
  actionY: number;
  actionButtonH: number;
  actionButtonW: number;
  hintButtonW: number;
  smallButtonW: number;
  /** Left-edge X of the coins-to-rep Community Favour button (SLL-driven). */
  favourCoinsToRepX: number;
  /** Left-edge X of the rep-to-coins Community Favour button (SLL-driven). */
  favourRepToCoinsX: number;
  /** Width of each Community Favour button. */
  favourButtonW: number;
  challengeX: number;
  challengeY: number;
  challengeW: number;
  logX: number;
  logY: number;
  logW: number;
  logH: number;
}
