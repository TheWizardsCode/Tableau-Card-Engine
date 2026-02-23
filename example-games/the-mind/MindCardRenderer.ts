/**
 * Mind Card Renderer
 *
 * Provides utilities for loading and displaying Mind card SVG assets
 * in a Phaser scene. Cards are pre-generated SVGs (one per value 1-100
 * plus a card back) stored in `public/assets/cards/the-mind/`.
 *
 * This module follows the same pattern as CardTextureHelpers.ts but is
 * specific to The Mind's numbered card type (MindCard).
 */

import type { MindCard } from './MindCard';
import { cardAssetKey, CARD_BACK_KEY, MIN_VALUE, MAX_VALUE } from './MindCard';

// ── Constants ──────────────────────────────────────────────

/** Default card sprite width in pixels (matches SVG source at 140px). */
export const MIND_CARD_W = 48;

/** Default card sprite height in pixels (matches SVG source at 190px). */
export const MIND_CARD_H = 65;

/** Base path to The Mind card SVG assets (relative to Vite public dir). */
const ASSET_PATH = 'assets/cards/the-mind';

// ── Texture key helpers ────────────────────────────────────

/**
 * Return the Phaser texture key for a MindCard, taking faceUp state
 * into account. Face-down cards return the card back key.
 *
 * @param card  The MindCard to get a texture key for.
 * @returns     The texture key string (e.g. `'mind-42'` or `'mind-back'`).
 * @throws      Error if card value is outside the valid range (1-100).
 */
export function getMindCardTexture(card: MindCard): string {
  if (!card.faceUp) return CARD_BACK_KEY;
  validateValue(card.value);
  return cardAssetKey(card);
}

/**
 * Return the Phaser texture key for a Mind card value.
 *
 * @param value  Card value (1-100).
 * @returns      The texture key string (e.g. `'mind-42'`).
 * @throws       Error if value is outside the valid range (1-100).
 */
export function mindCardTextureKey(value: number): string {
  validateValue(value);
  return `mind-${value}`;
}

// ── Preloading ─────────────────────────────────────────────

/**
 * Preload all 100 Mind card face SVGs and the card back SVG into a
 * Phaser scene's texture manager.
 *
 * Call this from your scene's `preload()` method. Once loaded, textures
 * are cached in Phaser's texture manager and won't be re-loaded on
 * subsequent calls.
 *
 * @param scene   The Phaser scene whose loader should be used.
 * @param width   Card sprite width in pixels (defaults to `MIND_CARD_W`).
 * @param height  Card sprite height in pixels (defaults to `MIND_CARD_H`).
 */
export function preloadMindCardAssets(
  scene: Phaser.Scene,
  width: number = MIND_CARD_W,
  height: number = MIND_CARD_H,
): void {
  // Card back
  scene.load.svg(CARD_BACK_KEY, `${ASSET_PATH}/mind-back.svg`, {
    width,
    height,
  });

  // All 100 numbered card faces
  for (let value = MIN_VALUE; value <= MAX_VALUE; value++) {
    const key = `mind-${value}`;
    scene.load.svg(key, `${ASSET_PATH}/${key}.svg`, { width, height });
  }
}

// ── Validation ─────────────────────────────────────────────

/**
 * Validate that a card value is within the allowed range (1-100).
 *
 * @param value  The card value to validate.
 * @throws       Error if value is outside 1-100 (inclusive).
 */
function validateValue(value: number): void {
  if (value < MIN_VALUE || value > MAX_VALUE || !Number.isInteger(value)) {
    throw new Error(
      `Invalid Mind card value: ${value}. Must be an integer between ${MIN_VALUE} and ${MAX_VALUE}.`,
    );
  }
}
