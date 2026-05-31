/**
 * Lost Cities Adapter – bridges Lost Cities scene rendering to the shared
 * Renderer API.
 *
 * Re-exports shared helpers (`createHudText`, `createActionButton`,
 * `createOverlayBackground`, `dismissOverlay`) and provides Lost Cities–specific
 * defaults for HUD text so that `LostCitiesRenderer`, `LostCitiesOverlayManager`,
 * and related modules can use engine-standard patterns without duplicating
 * styling logic.
 *
 * @module LostCitiesAdapter
 */

import Phaser from 'phaser';
import {
  createHudText as sharedCreateHudText,
  createActionButton as sharedCreateActionButton,
  HudTextOptions,
  ActionButtonOptions,
} from '../index';
import {
  createOverlayBackground as sharedCreateOverlayBackground,
  dismissOverlay as sharedDismissOverlay,
} from '../../Overlay';
import { createOverlayButton as sharedCreateOverlayButton } from '../../OverlayButton';
import { FONT_FAMILY } from '../../../ui/constants';

// Re-export shared helpers so callers can import from a single adapter module.
export { sharedCreateHudText as createHudText };
export { sharedCreateActionButton as createActionButton };
export { sharedCreateOverlayBackground as createOverlayBackground };
export { sharedCreateOverlayButton as createOverlayButton };
export { sharedDismissOverlay as dismissOverlay };
export type { HudTextOptions, ActionButtonOptions };

// ---------------------------------------------------------------------------
// HUD text helper
// ---------------------------------------------------------------------------

/** Default depth for HUD UI elements in Lost Cities. */
const LC_DEPTH_HUD = 1000;

/**
 * Create a HUD text element styled for Lost Cities.
 *
 * This is a thin wrapper around `createHudText` that applies the Lost Cities
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
export function createLcHudText(
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
    textObj.setDepth(LC_DEPTH_HUD);
  } catch {
    // Depth may not be available in headless / test environments.
  }
  return textObj;
}

// ---------------------------------------------------------------------------
// Overlay button helper
// ---------------------------------------------------------------------------

/**
 * Create a "Menu" action button that navigates back to the GameSelectorScene,
 * styled for Lost Cities.
 *
 * @param scene   - The Phaser scene.
 * @param x       - X position (left edge of the button).
 * @param y       - Y position (top edge of the button).
 * @param width   - Button width in pixels.
 * @param options - Optional styling overrides forwarded to `createActionButton`.
 * @returns       A Phaser.Container containing the menu button.
 */
export function createLcMenuButton(
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

export const LC_ADAPTER_VERSION = '1.0.0';
