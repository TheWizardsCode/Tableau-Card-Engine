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

// Module-level cache for SVG source text when running in Node (tests) or
// when preload reads files. Keys are the texture keys (e.g. 'mind-42' or
// 'mind-back').
const svgTextCache = new Map<string, string>();

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
  scene: Phaser.Scene | null,
  width: number = MIND_CARD_W,
  height: number = MIND_CARD_H,
): void {
  // In browser environments, prefer loading SVG source text via the
  // loader so the shared SvgHelpers can rasterise it on demand.
  // In Node (tests) we synchronously read the files into svgTextCache so
  // helper tests and headless runners can access the SVG content.
  if (typeof window === 'undefined') {
    // Node: synchronously read from the public assets directory.
    try {
      // Lazy import to avoid bundling `fs` in browser builds.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const path = require('path');
      const base = path.join(process.cwd(), 'public', ASSET_PATH);

      const backPath = path.join(base, 'mind-back.svg');
      svgTextCache.set(CARD_BACK_KEY, fs.readFileSync(backPath, 'utf8'));

      for (let v = MIN_VALUE; v <= MAX_VALUE; v++) {
        const key = `mind-${v}`;
        const filePath = path.join(base, `${key}.svg`);
        svgTextCache.set(key, fs.readFileSync(filePath, 'utf8'));
      }
    } catch (err) {
      // Best-effort: tests that need these assets should ensure they exist.
    }
  } else {
    if (scene) {
      // Register scene as valid for SvgHelpers and use text loader so the
      // shared helpers can fetch from the cache when required.
      // We avoid eager rasterisation here; textures are generated lazily
      // on first use via SvgHelpers.getOrCreateTexture.
      // Note: `this.load.text` stores content in the cache under the key
      // provided (we prefix with `svg:` to avoid collisions).
      scene.load.text('svg:mind-back', `${ASSET_PATH}/mind-back.svg`);

      for (let value = MIN_VALUE; value <= MAX_VALUE; value++) {
        const key = `mind-${value}`;
        scene.load.text(`svg:${key}`, `${ASSET_PATH}/${key}.svg`);
      }

      // Mark the scene as valid for rasterisation helpers; callers should
      // hook lifecycle events to call `markSceneInvalid` on shutdown/destroy.
      // Import lazily to avoid circular deps at module-eval time. Use a
      // dynamic import so test environments (Vitest) resolve TypeScript
      // modules correctly.
      import('../../src/core-engine/SvgHelpers')
        .then((m) => {
          if (m && typeof m.markSceneValid === 'function') m.markSceneValid(scene);
        })
        .catch(() => {
          /* ignore */
        });
    }
  }
}

/**
 * Ensure a Mind card texture exists (or is scheduled) and return the
 * texture key + readiness/promise info. This implements lazy rasterisation
 * on first use via SvgHelpers.getOrCreateTexture.
 */
export async function ensureMindCardTexture(
  scene: Phaser.Scene,
  value: number,
  width: number = MIND_CARD_W,
  height: number = MIND_CARD_H,
): Promise<{ key: string; ready: boolean; promise?: Promise<void> }> {
  validateValue(value);
  const key = mindCardTextureKey(value);

  // If we already have the raw SVG text cached (Node/test preload) use it;
  // otherwise attempt to read from the loader cache or fetch via SvgHelpers.
  let svgText = svgTextCache.get(key);

  if (!svgText) {
    // Try to read from Phaser cache if available (browser runtime)
    const cacheText = (scene as any).cache?.text?.get?.(`svg:${key}`) as string | undefined;
    if (cacheText) {
      svgText = cacheText;
    } else if (typeof window === 'undefined') {
      // Node fallback: try to read from disk synchronously
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const path = require('path');
        const filePath = path.join(process.cwd(), 'public', ASSET_PATH, `${key}.svg`);
        svgText = fs.readFileSync(filePath, 'utf8');
      } catch {
        // leave svgText undefined and let fetchSvgText attempt network fetch
      }
    }
  }

  if (!svgText) {
    // Use SvgHelpers.fetchSvgText to fetch remotely if available.
    try {
      const mod = await import('../../src/core-engine/SvgHelpers');
      const { fetchSvgText, rasteriseSvgToTexture } = mod as any;
      const url = `/${ASSET_PATH}/${key}.svg`;
      svgText = await fetchSvgText(url);

      // If texture already exists, short-circuit.
      if (scene.textures?.exists(key)) {
        return { key, ready: true };
      }

      // Start rasterisation under the legacy texture key so existing scenes
      // that reference 'mind-<n>' continue to work unchanged.
      const promise = rasteriseSvgToTexture(scene, key, svgText, width, height);
      return { key, ready: false, promise };
    } catch {
      // Best-effort: fallthrough to a non-rasterising result — return key only
      return { key, ready: false };
    }
  }

  // svgText is available synchronously — rasterise under the legacy
  // texture key so callers that expect 'mind-<n>' continue to work.
  const mod = await import('../../src/core-engine/SvgHelpers');
  const { rasteriseSvgToTexture } = mod as any;

  if (scene.textures?.exists(key)) {
    return { key, ready: true };
  }

  const promise = rasteriseSvgToTexture(scene, key, svgText, width, height);
  return { key, ready: false, promise };
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
