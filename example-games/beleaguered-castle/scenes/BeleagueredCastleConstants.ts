/**
 * BeleagueredCastleConstants — shared styling, timing, and audio constants.
 *
 * Layout positions are now defined via SLL in `../layouts/beleaguered-castle.layout.json`
 * and resolved through `BeleagueredCastleLayoutAdapter.ts`.
 */

// ── Audio asset keys ──────────────────────────────────────
export const SFX_KEYS = {
  CARD_PICKUP: 'bc-sfx-card-pickup',
  CARD_TO_FOUNDATION: 'bc-sfx-card-to-foundation',
  CARD_TO_TABLEAU: 'bc-sfx-card-to-tableau',
  CARD_SNAP_BACK: 'bc-sfx-card-snap-back',
  DEAL_CARD: 'bc-sfx-deal-card',
  WIN_FANFARE: 'bc-sfx-win-fanfare',
  LOSS_SOUND: 'bc-sfx-loss-sound',
  AUTO_COMPLETE_START: 'bc-sfx-auto-complete-start',
  AUTO_COMPLETE_CARD: 'bc-sfx-auto-complete-card',
  UNDO: 'bc-sfx-undo',
  REDO: 'bc-sfx-redo',
  CARD_SELECT: 'bc-sfx-card-select',
  CARD_DESELECT: 'bc-sfx-card-deselect',
  UI_CLICK: 'bc-sfx-ui-click',
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
