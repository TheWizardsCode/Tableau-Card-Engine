/**
 * Beleaguered Castle Adapter – bridges Beleaguered Castle scene rendering
 * to the shared Renderer API.
 *
 * Re-exports shared helpers (`createHudText`, `createActionButton`) and
 * provides Beleaguered Castle–specific defaults for HUD text so that
 * `BeleagueredCastleRenderer` and `BeleagueredCastleOverlayManager` can
 * use engine-standard patterns without duplicating styling logic.
 *
 * @module BeleagueredCastleAdapter
 */

import Phaser from 'phaser';
import {
  createHudText as sharedCreateHudText,
  createActionButton as sharedCreateActionButton,
  HudTextOptions,
  ActionButtonOptions,
} from '../index';
import { FONT_FAMILY } from '../../../ui/constants';

// Re-export shared helpers so callers can import from a single adapter module.
export { sharedCreateHudText as createHudText };
export { sharedCreateActionButton as createActionButton };
export type { HudTextOptions, ActionButtonOptions };

/** Default depth for HUD UI elements in Beleaguered Castle. */
const BC_DEPTH_HUD = 1000;

/**
 * Create a HUD text element styled for Beleaguered Castle.
 *
 * This is a thin wrapper around `createHudText` that applies the BC
 * default font family and depth convention so that renderer code
 * doesn't need to repeat styling parameters.
 *
 * @param scene   - The Phaser scene.
 * @param x       - X position.
 * @param y       - Y position.
 * @param text    - Initial text content.
 * @param color   - CSS colour string (e.g. '#aaccaa').
 * @param options - Optional overrides (font size, origin, etc.).
 * @returns       A Phaser.Text object with depth DEPTH_HUD.
 */
export function createBcHudText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: string,
  options?: { fontSize?: string } & HudTextOptions,
): Phaser.GameObjects.Text {
  const textObj = sharedCreateHudText(scene, x, y, text, color, {
    fontFamily: FONT_FAMILY,
    ...options,
  });
  try {
    textObj.setDepth(BC_DEPTH_HUD);
  } catch {
    // Depth may not be available in headless / test environments.
  }
  return textObj;
}

export const BC_ADAPTER_VERSION = '1.0.0';
