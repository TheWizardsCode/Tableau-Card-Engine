/**
 * Shared overlay button factory for the Tableau Card Engine.
 *
 * Creates styled, interactive text buttons for use in modal overlays
 * (win screens, pause menus, etc.) with consistent hover effects.
 */

import { FONT_FAMILY } from './constants';

// ── Types ───────────────────────────────────────────────────

/** Optional configuration for overlay button styling. */
export interface OverlayButtonConfig {
  /** Font size (default: '14px'). */
  fontSize?: string;
  /** Default text color (default: '#88ff88'). */
  color?: string;
  /** Hover text color (default: '#aaffaa'). */
  hoverColor?: string;
  /** Font family (default: FONT_FAMILY from constants). */
  fontFamily?: string;
}

// ── Defaults ────────────────────────────────────────────────

/** Default overlay button text color. */
export const OVERLAY_BUTTON_COLOR = '#88ff88';

/** Default overlay button hover color. */
export const OVERLAY_BUTTON_HOVER_COLOR = '#aaffaa';

/** Default overlay button font size. */
export const OVERLAY_BUTTON_FONT_SIZE = '14px';

// ── Factory ─────────────────────────────────────────────────

/**
 * Create an interactive overlay button with hover effects.
 *
 * The button is centered at (x, y) via setOrigin(0.5), placed at
 * the given depth, and has a hand cursor on hover. Default colors
 * match the engine's established green-on-dark style.
 *
 * @param scene  - The Phaser scene to add the button to.
 * @param x      - X position (scene coordinates).
 * @param y      - Y position (scene coordinates).
 * @param label  - Button text (e.g. '[ Play Again ]').
 * @param depth  - Display depth (default: 11).
 * @param config - Optional styling overrides.
 * @returns The created Phaser text game object.
 */
export function createOverlayButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  depth: number = 11,
  config?: OverlayButtonConfig,
): Phaser.GameObjects.Text {
  const fontSize = config?.fontSize ?? OVERLAY_BUTTON_FONT_SIZE;
  const color = config?.color ?? OVERLAY_BUTTON_COLOR;
  const hoverColor = config?.hoverColor ?? OVERLAY_BUTTON_HOVER_COLOR;
  const fontFamily = config?.fontFamily ?? FONT_FAMILY;

  const btn = scene.add
    .text(x, y, label, { fontSize, color, fontFamily })
    .setOrigin(0.5)
    .setDepth(depth)
    .setInteractive({ useHandCursor: true });

  btn.on('pointerover', () => btn.setColor(hoverColor));
  btn.on('pointerout', () => btn.setColor(color));

  return btn;
}
