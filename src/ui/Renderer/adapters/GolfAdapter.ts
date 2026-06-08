/**
 * Golf Adapter – bridges Golf scene rendering to the shared Renderer API.
 *
 * Re-exports shared helpers (`createHudText`, `createHudContainer`,
 * `createSceneTitle`, `createSceneMenuButton`, `createOverlayBackground`,
 * `dismissOverlay`, `getCardTexture`) and provides Golf-specific defaults
 * for HUD text so that `GolfRenderer`, `GolfOverlayManager`, and
 * `GolfReplayController` can use engine-standard patterns without
 * duplicating styling logic.
 *
 * @module GolfAdapter
 */

import Phaser from 'phaser';
import {
  createHudText as sharedCreateHudText,
  createHudContainer as sharedCreateHudContainer,
  createActionButton as sharedCreateActionButton,
  HudTextOptions,
  ActionButtonOptions,
} from '../index';
import {
  getCardTexture as sharedGetCardTexture,
} from '../../CardTextureHelpers';
import {
  createSceneTitle as sharedCreateSceneTitle,
  createSceneMenuButton as sharedCreateSceneMenuButton,
} from '../index';
import {
  createOverlayBackground as sharedCreateOverlayBackground,
  dismissOverlay as sharedDismissOverlay,
} from '../../Overlay';
import { FONT_FAMILY } from '../../../ui/constants';

// Re-export shared helpers so callers can import from a single adapter module.
export { sharedCreateHudText as createHudText };
export { sharedCreateHudContainer as createHudContainer };
export { sharedGetCardTexture as getCardTexture };
export { sharedCreateSceneTitle as createSceneTitle };
export { sharedCreateSceneMenuButton as createSceneMenuButton };
export { sharedCreateOverlayBackground as createOverlayBackground };
export { sharedDismissOverlay as dismissOverlay };
export type { HudTextOptions, ActionButtonOptions };

/** Default depth for HUD UI elements in Golf. */
const GOLF_DEPTH_HUD = 1000;

/**
 * Create a HUD text element styled for Golf.
 *
 * This is a thin wrapper around `createHudText` that applies the Golf
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
export function createGolfHudText(
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
  // Parent into hudContainer so it shares the same depth sort space as
  // overlay content (game-over text, buttons).  This ensures HUD labels
  // like "Stock" are correctly covered by overlays that use
  // createOverlayBackground + OverlayManager.add().
  try {
    const hud = (scene as any).hudContainer;
    if (hud && typeof hud.add === 'function') {
      hud.add(textObj);
    }
    textObj.setDepth(GOLF_DEPTH_HUD);
  } catch {
    // Depth may not be available in headless / test environments.
  }
  return textObj;
}

// ---------------------------------------------------------------------------
// Menu button helper
// ---------------------------------------------------------------------------

/**
 * Create a "Menu" action button that navigates back to the GameSelectorScene.
 *
 * Wraps `createActionButton` with Golf's overlay conventions.
 *
 * @param scene   - The Phaser scene.
 * @param x       - X position (left edge of the button).
 * @param y       - Y position (top edge of the button).
 * @param width   - Button width in pixels.
 * @param options - Optional styling overrides forwarded to `createActionButton`.
 * @returns       A Phaser.Container containing the menu button.
 */
export function createGolfMenuButton(
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

export const GOLF_ADAPTER_VERSION = '1.0.0';
