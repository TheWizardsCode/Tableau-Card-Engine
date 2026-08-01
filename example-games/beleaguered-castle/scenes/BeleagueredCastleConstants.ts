/**
 * BeleagueredCastleConstants — shared styling, timing, and audio constants.
 *
 * Layout positions are now defined via SLL in `../layouts/beleaguered-castle.layout.json`
 * and resolved through `BeleagueredCastleLayoutAdapter.ts`.
 */

// ── Audio asset keys ──────────────────────────────────────
// All SFX keys use the standard `sfx-` prefix — no game-specific prefix.
// See docs/SFX_CONVENTION.md for the naming convention.
import { COMMON_SFX_KEYS } from '../../../src/core-engine/SoundManager';

export const SFX_KEYS = {
  CARD_PICKUP: 'sfx-card-pickup',
  CARD_TO_FOUNDATION: 'sfx-card-to-foundation',
  CARD_TO_TABLEAU: 'sfx-card-to-tableau',
  CARD_SNAP_BACK: 'sfx-card-snap-back',
  DEAL_CARD: 'sfx-deal-card',
  WIN_FANFARE: 'sfx-win-fanfare',
  LOSS_SOUND: 'sfx-loss-sound',
  AUTO_COMPLETE_START: 'sfx-auto-complete-start',
  AUTO_COMPLETE_CARD: 'sfx-auto-complete-card',
  UNDO: 'sfx-undo',
  REDO: 'sfx-redo',
  CARD_SELECT: 'sfx-card-select',
  CARD_DESELECT: 'sfx-card-deselect',
  UI_CLICK: COMMON_SFX_KEYS.UI_CLICK,
  ILLEGAL_MOVE: COMMON_SFX_KEYS.ILLEGAL_MOVE,
} as const;

// ── Card dimensions ───────────────────────────────────────
export const BC_CARD_W = 90;
export const BC_CARD_H = 126;

// ── Layout geometry (positions now driven by SLL) ─────────
export const CARD_GAP = 30;
export const CASCADE_OFFSET_Y = 42;
export const DRAG_DEPTH = 1000;

// ── Animation timing ──────────────────────────────────────
export const ANIM_DURATION = 300;
export const DEAL_STAGGER = 40;
export const SNAP_BACK_DURATION = 200;
export const AUTO_COMPLETE_DELAY = 100;

// ── Highlight colours ─────────────────────────────────────
export const HIGHLIGHT_VALID = 0x44ff44;
export const HIGHLIGHT_ALPHA = 0.3;
export const SELECTION_TINT = 0xaaffaa;

// ── Overlay display ───────────────────────────────────────
export const OVERLAY_DEPTH = 2000;
export const OVERLAY_BG_ALPHA = 0.75;
export const OVERLAY_TITLE_FONT_SIZE = '42px';
export const OVERLAY_INFO_FONT_SIZE = '18px';
export const OVERLAY_STATS_FONT_SIZE = '22px';
export const OVERLAY_WIN_TITLE_Y_OFFSET = -80;
export const OVERLAY_CONTENT_Y_OFFSET = -20;
export const OVERLAY_BUTTON_Y_OFFSET = 50;

// ── HUD ────────────────────────────────────────────────────
export const HUD_MARGIN = 28;
export const HUD_FONT_SIZE = '20px';
export const HUD_SEED_FONT_SIZE = '18px';

// ── Hint system ────────────────────────────────────────────
/** Border colour for the suggested source card. */
export const HINT_SOURCE_COLOR = 0xffdd44;
/** Border colour for the suggested destination. */
export const HINT_DEST_COLOR = 0x44ff88;
/** Alpha for hint highlight rectangles. */
export const HINT_ALPHA = 0.45;
/** Depth for hint highlight rectangles (above cards, below HUD). */
export const HINT_DEPTH = 900;
/** Width of the HUD hint button. */
export const HINT_BUTTON_WIDTH = 64;
/** Vertical offset of the hint bar above the bottom HUD row. */
export const HINT_BAR_Y_OFFSET = 50;

// ── Foundation slot ────────────────────────────────────────
export const FOUNDATION_SLOT_ALPHA = 0.6;
export const FOUNDATION_BORDER_RADIUS = 6;
export const FOUNDATION_COUNT_FONT_SIZE = '12px';

// ── Auto-complete animation ────────────────────────────────
export const AUTO_COMPLETE_STAGGER_MS = 100;
export const AUTO_COMPLETE_MIN_DURATION = 50;

// ── Resume overlay ─────────────────────────────────────────
export const RESUME_TITLE_FONT_SIZE = '36px';
export const RESUME_TITLE_Y_OFFSET = -60;
export const RESUME_INFO_Y_OFFSET = -15;
export const RESUME_BUTTON_Y_OFFSET = 50;
export const RESUME_BUTTON_SPACING = 110;
export const RESUME_INFO_FONT_SIZE = '18px';
