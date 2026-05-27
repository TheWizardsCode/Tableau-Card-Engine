/**
 * Standardised SVG-texture-render helper for card games.
 *
 * Checks for an existing texture, creates a {@link Phaser.GameObjects.Image}
 * if found, or draws a fallback {@link Phaser.GameObjects.Rectangle} while
 * the texture is being generated asynchronously.
 */

import Phaser from 'phaser';
import { getOrCreateTexture, makeTextureKey } from '../../core-engine/SvgHelpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callback that derives a texture cache key from template + dimensions. */
export type MakeTextureKeyFn = (
  templateId: string,
  width: number,
  height: number,
) => string;

/** Callback that initiates asynchronous texture generation. */
export type RequestTextureFn = (
  scene: Phaser.Scene,
  templateId: string,
  width: number,
  height: number,
) => void;

/** Optional configuration for {@link renderCardSvg}. */
export interface RenderCardSvgOptions {
  /**
   * Derives a texture cache key. Defaults to {@linkcode makeTextureKey}
   * from `src/core-engine/SvgHelpers`.
   */
  makeKey?: MakeTextureKeyFn;

  /**
   * Initiates async texture generation when the texture is missing.
   * Defaults to a wrapper around {@linkcode getOrCreateTexture}.
   */
  requestTexture?: RequestTextureFn;

  /** Fill colour for the fallback rectangle. Defaults to `0x333333`. */
  fallbackFill?: number;

  /** Stroke colour for the fallback rectangle. Defaults to `0x666666`. */
  fallbackStroke?: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function defaultMakeKey(
  templateId: string,
  width: number,
  height: number,
): string {
  // Use DPR = 1 as the baseline so headless / test environments get
  // consistent keys. Real scenes will get DPR-scaled keys via the
  // default makeTextureKey call path in the browser.
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  return makeTextureKey(templateId, width, height, dpr);
}

function defaultRequestTexture(
  scene: Phaser.Scene,
  templateId: string,
  width: number,
  height: number,
): void {
  // Kick off async generation; caller may await the returned promise
  // if they need to know when the texture is available.
  getOrCreateTexture(scene, templateId, '', width, height);
}

// ---------------------------------------------------------------------------
// Main helper
// ---------------------------------------------------------------------------

/**
 * Render an SVG card into a parent container.
 *
 * The function checks whether a texture for the given template already
 * exists (using a configurable key function). If it does, a
 * {@link Phaser.GameObjects.Image} is created and added to the container.
 * If not, a configurable {@link requestTexture} callback is invoked to
 * start asynchronous generation and a fallback rectangle is drawn
 * instead.
 *
 * @param scene - The Phaser scene.
 * @param parentContainer - Container to add the card to.
 * @param templateId - Logical identifier for the card template.
 * @param width - Display width in pixels.
 * @param height - Display height in pixels.
 * @param options - Optional configuration (key function, texture callback, fallback styling).
 * @returns The created game object — Image when texture exists, Rectangle as fallback.
 */
export function renderCardSvg(
  scene: Phaser.Scene,
  parentContainer: Phaser.GameObjects.Container,
  templateId: string,
  width: number,
  height: number,
  options?: RenderCardSvgOptions,
): Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle {
  const makeKey = options?.makeKey ?? defaultMakeKey;
  const requestTexture = options?.requestTexture ?? defaultRequestTexture;
  const fallbackFill = options?.fallbackFill ?? 0x333333;
  const fallbackStroke = options?.fallbackStroke ?? 0x666666;

  const key = makeKey(templateId, width, height);

  if (scene.textures?.exists(key)) {
    const img = scene.add.image(0, 0, key);
    img.setDisplaySize(width, height);
    parentContainer.add(img);
    return img;
  }

  // Texture not yet available — start generation and draw fallback.
  requestTexture(scene, templateId, width, height);

  const fallback = scene.add.rectangle(0, 0, width, height, fallbackFill);
  fallback.setStrokeStyle(1, fallbackStroke);
  parentContainer.add(fallback);
  return fallback;
}
