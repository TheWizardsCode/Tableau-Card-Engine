/**
 * The Mind Adapter – bridges The Mind scene code to the shared Renderer API.
 *
 * This module re-exports shared Renderer helpers with The Mind–specific
 * defaults so that MindRenderer can use engine-standard patterns for HUD
 * text, containers, and card rendering without duplicating styling logic.
 *
 * @module MindAdapter
 */

import Phaser from 'phaser';
import {
  createHudText,
  createHudContainer,
  renderCardSvg,
  type HudTextOptions,
  type RenderCardSvgOptions,
} from '../index';
import { FONT_FAMILY } from '../../../ui/constants';

/** Default depth for UI elements in The Mind (matches MindConstants.DEPTH_UI). */
const MIND_DEPTH_UI = 5;

// Re-export shared helpers so callers can import from a single adapter module.
export { createHudContainer, renderCardSvg };
export type { HudTextOptions, RenderCardSvgOptions };

/**
 * Create a status-display HUD text element styled for The Mind.
 *
 * This is a thin wrapper around `createHudText` that applies The Mind's
 * default font family, depth, and origin conventions so that MindRenderer
 * can create level/lives text without repeating styling parameters.
 *
 * @param scene   - The Phaser scene.
 * @param x       - X position (right-aligned by convention).
 * @param y       - Y position.
 * @param text    - Initial text content.
 * @param color   - CSS colour string.
 * @param options - Optional overrides (font size, origin, etc.).
 * @returns       A Phaser.Text object with depth DEPTH_UI.
 */
export function createMindHudText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: string,
  options?: { fontSize?: string } & HudTextOptions,
): Phaser.GameObjects.Text {
  const textObj = createHudText(scene, x, y, text, color, {
    fontFamily: FONT_FAMILY,
    originX: 0.5,
    originY: 0,
    ...options,
  });
  try {
    textObj.setDepth(MIND_DEPTH_UI);
  } catch {
    // Depth may not be available in headless / test environments.
  }
  return textObj;
}

/**
 * Create a card-rendering helper pre-configured for The Mind.
 *
 * Wraps the shared `renderCardSvg` with The Mind's default dimensions
 * and fallback styling so that card rendering callers don't need to
 * repeat configuration.
 *
 * @param scene            - The Phaser scene.
 * @param parentContainer  - Container to add the card to.
 * @param templateId       - Logical identifier for the card template.
 * @param options          - Optional overrides.
 * @returns                The created game object.
 */
export function mindRenderCardSvg(
  scene: Phaser.Scene,
  parentContainer: Phaser.GameObjects.Container,
  templateId: string,
  options?: RenderCardSvgOptions,
): Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle {
  return renderCardSvg(scene, parentContainer, templateId, 120, 164, options);
}

export const MIND_ADAPTER_VERSION = '1.0.0';
