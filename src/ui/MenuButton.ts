/**
 * Shared menu button factory for overlay screens.
 *
 * Creates a pre-configured "[ Menu ]" button that navigates
 * back to the GameSelectorScene when clicked.
 */

import { createOverlayButton } from './OverlayButton';
import type { OverlayButtonConfig } from './OverlayButton';

// ── Factory ─────────────────────────────────────────────────

/**
 * Create a "[ Menu ]" overlay button that navigates to
 * GameSelectorScene on click.
 *
 * @param scene  - The Phaser scene to add the button to.
 * @param x      - X position (scene coordinates).
 * @param y      - Y position (scene coordinates).
 * @param depth  - Display depth (default: 11).
 * @param config - Optional styling overrides.
 * @returns The created Phaser text game object.
 */
export function createOverlayMenuButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  depth: number = 11,
  config?: OverlayButtonConfig,
): Phaser.GameObjects.Text {
  const btn = createOverlayButton(scene, x, y, '[ Menu ]', depth, config);
  btn.on('pointerdown', () => scene.scene.start('GameSelectorScene'));
  return btn;
}
