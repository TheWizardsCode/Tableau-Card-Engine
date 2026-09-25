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

/**
 * Right-hand inset (px) between the activity-log panel's left edge (`logX`)
 * and the right edge of the market/HUD bar. Single named authority so the
 * market box and the HUD strip can never disagree (CG-0MUFAIS8W0011LGQ).
 */
export const MARKET_BOX_MARGIN_PX = 20;

/** Height (px) of the HUD strip bar. */
export const HUD_BAR_HEIGHT_PX = 28;

/**
 * Horizontal offset (px) from the HUD strip's left edge where the reserved
 * Community Favour button band begins. The band holds both favour buttons
 * (`[rep→coins][coins→rep]`) between the Coins and Reputation readouts
 * (CG-0MUFAISSZ002TE1B / CG-0MUFAITED0088AGN).
 */
export const HUD_FAVOUR_BAND_OFFSET_PX = 120;

/** Height (px) of each Community Favour button inside the HUD strip. */
export const HUD_FAVOUR_BUTTON_H_PX = 24;
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

// ── City-block roads (CG-0MT5Y1X5T001M4S6) ──────────────────
// Roads separate the street blocks so the board reads as a grid of streets in
// rows and columns rather than one solid block of plots.

/**
 * Road band thickness as a fraction of the smaller plot pitch. Both the
 * vertical and the horizontal roads use this same fraction so a road is the
 * same width whichever way it runs.
 */
export const ROAD_BAND_RATIO = 0.62;

/**
 * Road band thickness in pixels for the given plot pitches.
 *
 * @param pitchX Horizontal plot pitch (slot width + horizontal gap).
 * @param pitchY Vertical plot pitch (slot height + row gap).
 */
export function roadBandThickness(pitchX: number, pitchY: number): number {
  return Math.min(pitchX, pitchY) * ROAD_BAND_RATIO;
}

/**
 * Road band thickness for the base (scale-1) layout, in pixels. Used by the
 * SLL layout adapter to reserve room for the road ring around the street.
 */
export function baseRoadBandThickness(): number {
  return roadBandThickness(BASE_SLOT_W + BASE_SLOT_GAP, BASE_SLOT_H + STREET_ROW_GAP);
}

/** Grey road surface colour. */
export const ROAD_COLOUR = 0x4a4a4a;
/** Dashed centre-line colour painted down the middle of each road. */
export const ROAD_MARKING_COLOUR = 0xf5f5f5;
/** Width of the dashed centre line, in map-local pixels. */
export const ROAD_MARKING_WIDTH = 3;
/** Distance between the start of one dash and the next, in pixels. */
export const ROAD_DASH_PERIOD = 14;
/** Length of each dash, in pixels. */
export const ROAD_DASH_LENGTH = 8;
// Make hand slot match placeholder size as requested
export const BASE_HAND_CARD_W = 140;
export const BASE_HAND_CARD_H = 80;

// ── Main Street SFX keys (logical keys used by SoundManager)
// All SFX keys use the standard `sfx-` prefix — no game-specific prefix.
// See docs/SFX_CONVENTION.md for the naming convention.
import { COMMON_SFX_KEYS } from '@core-engine/SoundManager';

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

/**
 * Duration (ms) of the street-map zoom transition (CG-0MTH9OVMC001V44E).
 * Skipped entirely under reduced motion, which applies the new zoom framing
 * immediately.
 */
export const ZOOM_ANIMATION_MS = 220;

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
  /** Height of each Community Favour button. */
  favourButtonH: number;
  /** Left edge X of the market background box (SLL-derived). */
  marketLeft: number;
  /** Right edge X of the market background box (SLL-derived). */
  marketRight: number;
  /** Left edge X of the HUD strip bar (aligned to `marketLeft`). */
  hudLeft: number;
  /** Right edge X of the HUD strip bar (aligned to `marketRight`). */
  hudRight: number;
  /** Width of the HUD strip bar (`hudRight - hudLeft`). */
  hudWidth: number;
  /** Left edge X of the reserved Community Favour button band in the HUD strip. */
  favourBandLeft: number;
  /** Right edge X of the reserved Community Favour button band in the HUD strip. */
  favourBandRight: number;
  /** X/Y of the staff-applicant overlay centre (SLL applicantOverlay zone). */
  applicantCenterX: number;
  applicantCenterY: number;
  challengeX: number;
  challengeY: number;
  challengeW: number;
  logX: number;
  logY: number;
  logW: number;
  logH: number;
}
