/**
 * Shared UI constants for the Tableau Card Engine.
 *
 * These values define the default rendering dimensions and font settings
 * used across all example-game scenes. Individual games may still define
 * game-specific constants (e.g. grid gaps, animation timings) locally.
 */

/** Default card sprite width (pixels). */
export const CARD_W = 96;

/** Default card sprite height (pixels). */
export const CARD_H = 130;

/** Default game viewport width (pixels). */
export const GAME_W = 1280;

/** Default game viewport height (pixels). */
export const GAME_H = 720;

/** Default font family used for in-game text. */
export const FONT_FAMILY = 'Arial, sans-serif';

// ---------------------------------------------------------------------------
// Illegal-move reason toast (see `shakeIllegalMove` / `illegalMoveToastView`)
// ---------------------------------------------------------------------------

/**
 * Default dwell time (milliseconds) for the illegal-move reason toast.
 *
 * Long enough to read a full rules-layer sentence ("You cannot play that
 * card while the market is blocked"), short enough not to linger over the
 * board.
 */
export const ILLEGAL_MOVE_TOAST_DWELL_MS = 2500;

/**
 * Vertical position (pixels from the top) of the illegal-move reason toast.
 *
 * Sits below the scene header and above the hand/button rows so the
 * explanation is never clipped by the board chrome.
 */
export const ILLEGAL_MOVE_TOAST_Y = 520;

/**
 * Display depth of the illegal-move reason toast.
 *
 * Above gameplay (0–999), the HUD container (1000) and dialog overlays
 * (200), but below game-state overlays (2000: win / loss / game-over) so a
 * finished game is never obscured by a stale explanation.
 */
export const ILLEGAL_MOVE_TOAST_DEPTH = 1900;

/** Text colour of the illegal-move reason toast. */
export const ILLEGAL_MOVE_TOAST_COLOR = '#ffdd88';

/** Font size of the illegal-move reason toast. */
export const ILLEGAL_MOVE_TOAST_FONT_SIZE = '16px';

/**
 * Maximum wrap width (pixels) of the illegal-move reason toast.
 *
 * Long rules reasons wrap onto multiple lines instead of running off-screen;
 * the text is never truncated (AC "copy length").
 */
export const ILLEGAL_MOVE_TOAST_MAX_WIDTH = 720;

/** Stroke colour behind the toast text (readability over the board). */
export const ILLEGAL_MOVE_TOAST_STROKE_COLOR = '#000000';

/** Stroke thickness (pixels) behind the toast text. */
export const ILLEGAL_MOVE_TOAST_STROKE_THICKNESS = 4;
