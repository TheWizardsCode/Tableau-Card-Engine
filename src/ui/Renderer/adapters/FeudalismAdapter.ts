/**
 * Feudalism Adapter – bridges Feudalism scene rendering to the shared
 * Renderer API.
 *
 * Re-exports shared helpers (`createActionButton`) with Feudalism-specific
 * defaults so that FeudalismRenderer can use engine-standard patterns
 * without duplicating button creation logic.
 *
 * @module FeudalismAdapter
 */

import Phaser from 'phaser';
import {
  createActionButton as sharedCreateActionButton,
  ActionButtonOptions,
} from '../index';

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { sharedCreateActionButton as createActionButton };
export type { ActionButtonOptions };

// ---------------------------------------------------------------------------
// Feudalism-specific action button
// ---------------------------------------------------------------------------

/**
 * Create an action button that follows Feudalism's visual conventions.
 *
 * This is a thin wrapper around the shared `createActionButton` that applies
 * Feudalism's default styling (green theme, specific dimensions) so that
 * FeudalismRenderer can create buttons without repeating styling parameters.
 *
 * @param scene - The Phaser scene.
 * @param x - X position (left edge).
 * @param y - Y position (top edge).
 * @param text - Label text.
 * @param callback - Click handler.
 * @param options - Optional styling overrides.
 * @returns A Phaser.Container containing the button.
 */
export function createFeudalismActionButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  callback: () => void,
  options?: ActionButtonOptions,
): Phaser.GameObjects.Container {
  return sharedCreateActionButton(scene, x, y, 155, text, callback, {
    height: 42,
    fillColor: 0x335533,
    fillAlpha: 0.8,
    strokeColor: 0x55aa55,
    textColor: '#88ff88',
    fontSize: '17px',
    ...options,
  });
}
