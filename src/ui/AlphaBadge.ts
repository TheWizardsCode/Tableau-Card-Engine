/**
 * ALPHA badge — a shared, bright-red build badge that marks every shipped
 * surface as an unreleased ALPHA build and displays the running version.
 *
 * The badge is intentionally static (no animation) so it is inherently
 * reduced-motion safe, and it is drawn with Phaser primitives only — no new
 * image assets or dependencies. Callers position the badge relative to the
 * title it decorates; {@link createSceneTitle} wires it in by default.
 *
 * @module @ui/AlphaBadge
 */

import Phaser from 'phaser';
import { FONT_FAMILY, GAME_W } from './constants';
import { VERSION_LABEL_TEXT } from './versionDisplay';

// ── Constants ──────────────────────────────────────────────

/** Leading word of the badge, e.g. "ALPHA". */
export const ALPHA_BADGE_TEXT_PREFIX = 'ALPHA';

/** Full badge label, e.g. "ALPHA v0.1.17". */
export const ALPHA_BADGE_LABEL = `${ALPHA_BADGE_TEXT_PREFIX} ${VERSION_LABEL_TEXT}`;

/** Bright red fill used for the badge background. */
export const ALPHA_BADGE_FILL = 0xff2222;

/** Full-opacity white label colour for maximum contrast on the red fill. */
export const ALPHA_BADGE_TEXT_COLOR = '#ffffff';

/** Compact font size for the badge label. */
export const ALPHA_BADGE_FONT_SIZE = '11px';

/** Badge height in pixels. */
export const ALPHA_BADGE_HEIGHT = 14;

/** Horizontal padding (px) added to the measured label width on each side. */
export const ALPHA_BADGE_PADDING_X = 8;

/**
 * Estimated width (px) of a single character in the badge font. Used to size
 * the badge background without depending on runtime text metrics, which keeps
 * the helper deterministic and testable.
 */
export const ALPHA_BADGE_CHAR_WIDTH = 7;

/** Deepest allowed badge centre Y so the badge never clips the canvas top. */
export const ALPHA_BADGE_MIN_Y = ALPHA_BADGE_HEIGHT / 2;

/** Small vertical overlap (px) allowed between the badge and the title it decorates. */
export const ALPHA_BADGE_OVERLAP = 2;

/** Rendering depth — above gameplay content but below modal overlays. */
export const ALPHA_BADGE_DEPTH = 950;

/** Default title font size (px) used to resolve the stacked badge position. */
export const ALPHA_BADGE_DEFAULT_TITLE_FONT_SIZE = 18;

// ── Types ──────────────────────────────────────────────────

/** Optional configuration for {@link createAlphaBadge}. */
export interface AlphaBadgeConfig {
  /** Badge centre X (default: canvas centre, `GAME_W / 2`). */
  x?: number;
  /** Explicit badge centre Y. Overrides {@link AlphaBadgeConfig.titleY} when set. */
  y?: number;
  /** Y position of the title the badge is stacked above/over. */
  titleY?: number;
  /** Font size (px) of the decorated title, used to resolve the stack position. */
  titleFontSizePx?: number;
  /** Badge label override (default: `ALPHA v<version>`). */
  label?: string;
  /** Badge font size override. */
  fontSize?: string;
  /** Rendering depth override. */
  depth?: number;
}

/** The display objects created by {@link createAlphaBadge}. */
export interface AlphaBadgeResult {
  /** The red badge background. */
  background: Phaser.GameObjects.Rectangle;
  /** The "ALPHA v<version>" label. */
  text: Phaser.GameObjects.Text;
  /** Badge width in pixels. */
  width: number;
  /** Badge height in pixels. */
  height: number;
  /** Badge centre X. */
  x: number;
  /** Badge centre Y. */
  y: number;
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Compute the badge centre Y that stacks a badge above/over a title with a
 * small controlled overlap, clamped so the badge never clips the canvas top.
 *
 * @param titleY          - Y position of the decorated title.
 * @param titleFontSizePx - Font size (px) of the decorated title.
 * @returns The badge centre Y in canvas pixels.
 */
export function computeAlphaBadgeY(
  titleY: number,
  titleFontSizePx: number = ALPHA_BADGE_DEFAULT_TITLE_FONT_SIZE,
): number {
  // Approximate the title's visual top edge from its centre and font size.
  const titleTop = titleY - titleFontSizePx * 0.7;
  const targetBottom = titleTop + ALPHA_BADGE_OVERLAP;
  const y = targetBottom - ALPHA_BADGE_HEIGHT / 2;
  return Math.max(ALPHA_BADGE_MIN_Y, y);
}

// ── Factory ────────────────────────────────────────────────

/**
 * Create a bright red "ALPHA v<version>" badge.
 *
 * The badge is a filled rectangle with a centred white label. Position it
 * either with an explicit centre (`x`/`y`) or by passing the decorated
 * title's `titleY` (and optional `titleFontSizePx`) so the badge stacks
 * above/over the title.
 *
 * @param scene  - The Phaser scene to add the badge to.
 * @param config - Optional styling/position overrides.
 * @returns The created background and label objects plus resolved geometry.
 */
export function createAlphaBadge(
  scene: Phaser.Scene,
  config?: AlphaBadgeConfig,
): AlphaBadgeResult {
  const label = config?.label ?? ALPHA_BADGE_LABEL;
  const fontSize = config?.fontSize ?? ALPHA_BADGE_FONT_SIZE;
  const depth = config?.depth;

  const x = config?.x ?? GAME_W / 2;
  const y =
    config?.y ??
    computeAlphaBadgeY(
      config?.titleY ?? 0,
      config?.titleFontSizePx ?? ALPHA_BADGE_DEFAULT_TITLE_FONT_SIZE,
    );

  const width = label.length * ALPHA_BADGE_CHAR_WIDTH + ALPHA_BADGE_PADDING_X * 2;

  const background = scene.add.rectangle(
    x,
    y,
    width,
    ALPHA_BADGE_HEIGHT,
    ALPHA_BADGE_FILL,
    1,
  );
  if (depth != null) background.setDepth(depth);

  const text = scene.add
    .text(x, y, label, {
      fontSize,
      color: ALPHA_BADGE_TEXT_COLOR,
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    })
    .setOrigin(0.5);
  if (depth != null) text.setDepth(depth + 1);

  return {
    background,
    text,
    width,
    height: ALPHA_BADGE_HEIGHT,
    x,
    y,
  };
}
