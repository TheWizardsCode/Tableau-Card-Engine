/**
 * Version display — shared style constants and factory for rendering the
 * app version label on game scenes.
 *
 * The version is injected at build time by Vite's `define` as the global
 * constant `__APP_VERSION__`, which is read from `package.json`'s `version`
 * field. The label is intended for the bottom-left corner of the canvas,
 * styled to be readable but unobtrusive.
 *
 * @module @ui/versionDisplay
 */

import Phaser from 'phaser';
import { GAME_H } from './constants';

// ── Style constants ────────────────────────────────────────

/** Font size for the version label. */
export const VERSION_FONT_SIZE = '11px';

/** Font family for the version label. */
export const VERSION_FONT_FAMILY = 'Arial, sans-serif';

/** Muted low-opacity color so the version does not distract from the main UI. */
export const VERSION_COLOR = '#888888';

/** Opacity for the version label. */
export const VERSION_ALPHA = 0.6;

/** X position (bottom-left corner, with small padding). */
export const VERSION_X = 8;

/** Y position (bottom-left corner, just above the bottom edge). */
export const VERSION_Y = GAME_H - 12;

/** Depth so the label renders above most content but below interactive overlays. */
export const VERSION_DEPTH = 800;

// ── Version string ─────────────────────────────────────────

/** Build-time injected version (falls back to '0.0.0-dev' at dev time). */
const FALLBACK_VERSION = '0.0.0-dev';

function getAppVersion(): string {
  try {
    return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}

/** The full version label text, e.g. "v0.1.7". */
export const VERSION_LABEL_TEXT = `v${getAppVersion()}`;

// ── Factory ────────────────────────────────────────────────

/**
 * Create a version label text object configured for bottom-left display.
 * The returned text is non-interactive (no pointer events) and is
 * positioned with a consistent style.
 *
 * @param scene - The Phaser scene to add the label to.
 * @param depth - Optional depth override (defaults to VERSION_DEPTH).
 * @returns The configured Phaser text object.
 */
export function createVersionLabel(
  scene: Phaser.Scene,
  depth: number = VERSION_DEPTH,
): Phaser.GameObjects.Text {
  const label = scene.add.text(VERSION_X, VERSION_Y, VERSION_LABEL_TEXT, {
    fontSize: VERSION_FONT_SIZE,
    fontFamily: VERSION_FONT_FAMILY,
    color: VERSION_COLOR,
  });
  label.setOrigin(0, 1); // bottom-left anchor
  label.setAlpha(VERSION_ALPHA);
  label.setDepth(depth);
  // Non-interactive — no pointer events
  return label;
}
