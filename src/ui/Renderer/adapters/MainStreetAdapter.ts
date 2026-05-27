/**
 * Main Street Adapter – bridges Main Street scene rendering to the shared
 * Renderer API.
 *
 * Re-exports shared helpers (`createActionButton`, `attachHudTooltipZone`)
 * and provides a Main Street–specific card rendering wrapper that uses the
 * scene's `templateKeyForCard` and `requestCardTexture` methods.
 *
 * @module MainStreetAdapter
 */

import Phaser from 'phaser';
import {
  createActionButton as sharedCreateActionButton,
  attachHudTooltipZone as sharedAttachHudTooltipZone,
  ActionButtonOptions,
} from '../index';
import { renderCardSvg } from '../renderCardSvg';

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

/**
 * Attach an interactive tooltip zone to a HUD text element using the shared
 * renderer helper.
 *
 * @see sharedAttachHudTooltipZone
 */
export { sharedAttachHudTooltipZone as attachHudTooltipZone };

// ---------------------------------------------------------------------------
// Card rendering adapter
// ---------------------------------------------------------------------------

/**
 * Render an SVG card into a parent container using Main Street's texture
 * pipeline.
 *
 * Delegates to the shared `renderCardSvg` helper, wiring up Main Street's
 * `templateKeyForCard` and `requestCardTexture` scene methods so that
 * texture keys and async generation match the existing Main Street
 * behaviour.
 *
 * @param scene - The Phaser scene (must have `templateKeyForCard` and `requestCardTexture`).
 * @param container - Container to add the card to.
 * @param cardId - Logical card identifier.
 * @param width - Display width in pixels.
 * @param height - Display height in pixels.
 * @returns The created game object — `Image` when the texture exists, `Rectangle` as fallback.
 */
export function mainStreetRenderCardSvg(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  cardId: string,
  width: number,
  height: number,
): Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle {
  const msScene = scene as any;

  return renderCardSvg(scene, container, cardId, width, height, {
    makeKey: (templateId: string, w: number, h: number) =>
      msScene.templateKeyForCard(templateId, w, h),
    requestTexture: (_scene: Phaser.Scene, templateId: string, w: number, h: number) => {
      msScene.requestCardTexture(templateId, w, h);
    },
  });
}

// ---------------------------------------------------------------------------
// Hint button adapter
// ---------------------------------------------------------------------------

/**
 * Create a hint button that follows Main Street's visual conventions.
 *
 * When the hint has already been used this turn the button is visually
 * dimmed and non-interactive, showing a checkmark symbol.
 *
 * @param scene - The Phaser scene.
 * @param x - X position (left edge).
 * @param y - Y position (top edge).
 * @param width - Button width in pixels.
 * @param buttonHeight - Button height in pixels.
 * @param isDisabled - Whether the hint has already been used this turn.
 * @param onHintClick - Click handler (only invoked when not disabled).
 * @returns A Phaser.Container containing the hint button.
 */
export function createMainStreetHintButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  buttonHeight: number,
  isDisabled: boolean,
  onHintClick: () => void,
): Phaser.GameObjects.Container {
  const fillColor = isDisabled ? 0x2a2a2a : 0x224455;
  const strokeColor = isDisabled ? 0x444444 : 0x4488aa;
  const textColor = isDisabled ? '#666666' : '#88ccff';

  return sharedCreateActionButton(scene, x, y, width, isDisabled ? 'Hint \u2713' : 'Hint', onHintClick, {
    height: buttonHeight,
    fillColor,
    fillAlpha: 0.8,
    strokeColor,
    textColor,
    fontSize: '14px',
    disabled: isDisabled,
  });
}
