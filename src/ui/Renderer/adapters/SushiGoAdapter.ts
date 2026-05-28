/**
 * Sushi Go Adapter – bridges Sushi Go overlay rendering to the shared
 * Renderer API.
 *
 * Re-exports shared helpers (`createActionButton`) so that
 * SushiGoOverlayManager can use engine-standard patterns for overlay
 * buttons without duplicating styling logic.
 *
 * @module SushiGoAdapter
 */

import Phaser from 'phaser';
import {
  createActionButton as sharedCreateActionButton,
  ActionButtonOptions,
} from '../index';

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

/**
 * Create an action button using the shared renderer helper.
 *
 * @see sharedCreateActionButton
 */
export { sharedCreateActionButton as createActionButton };
export type { ActionButtonOptions };

// ---------------------------------------------------------------------------
// Overlay button helpers
// ---------------------------------------------------------------------------

/**
 * Create a menu button that navigates back to the GameSelectorScene.
 *
 * Wraps `createActionButton` with Sushi Go's overlay conventions.
 *
 * @param scene - The Phaser scene.
 * @param x - X position (left edge of the button).
 * @param y - Y position (top edge of the button).
 * @param width - Button width in pixels.
 * @param options - Optional styling overrides forwarded to `createActionButton`.
 * @returns A Phaser.Container containing the menu button.
 */
export function createSushiGoMenuButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  options?: ActionButtonOptions,
): Phaser.GameObjects.Container {
  return sharedCreateActionButton(scene, x, y, width, 'Menu', () => {
    scene.scene.start('GameSelectorScene');
  }, options);
}
