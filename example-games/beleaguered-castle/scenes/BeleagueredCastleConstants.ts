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
