/**
 * Mind Card Renderer
 *
 * Provides utilities for loading and displaying Mind card SVG assets
 * in a Phaser scene. Cards are lazy-rasterised on first use via
 * SvgHelpers.getOrCreateTexture, which produces DPR-aware texture keys.
 *
 * Migration notes (CG-0MP12H40Q003Y7OU):
 *   - preloadMindCardAssets is now registration-only in browser runtimes:
 *     it marks the scene as valid for SvgHelpers but does NOT eagerly
 *     rasterise SVG files via scene.load.svg. Textures are created lazily
 *     on first call to ensureMindCardTexture.
 *   - ensureMindCardTexture returns DPR-aware texture keys
 *     (e.g. ms_card_mind-42_48x65@2) via SvgHelpers.getOrCreateTexture.
 *   - The Node/test preload path continues to populate svgTextCache so
 *     that headless tests can access SVG source text without a browser.
 *   - Callers that need stable or legacy keys should use
 *     MindCardTextureAdapter (see MindCardTextureAdapter.ts).
 */

import {
  getOrCreateTexture,
  fetchSvgText,
  markSceneValid,
  makeTextureKey,
} from '../../src/core-engine/SvgHelpers';
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
// when preload reads files. Keys are template IDs (e.g. 'mind-42' or
// 'mind-back').
const svgTextCache = new Map<string, string>();

// ── Texture key helpers ────────────────────────────────────

/**
 * Return the Phaser texture key for a MindCard, taking faceUp state
 * into account. Face-down cards return the card back key.
 *
 * NOTE: This returns the *template ID* (e.g. 'mind-42' or 'mind-back'),
 * NOT the DPR-aware texture key. For DPR-aware keys, use
 * MindCardTextureAdapter.getCanonicalTextureKey() or ensureMindCardTexture().
 *
 * @param card  The MindCard to get a texture key for.
 * @returns     The template ID string (e.g. 'mind-42' or 'mind-back').
 * @throws      Error if card value is outside the valid range (1-100).
 */
export function getMindCardTexture(card: MindCard): string {
  if (!card.faceUp) return CARD_BACK_KEY;
  validateValue(card.value);
  return cardAssetKey(card);
}

/**
 * Return the template ID for a Mind card value.
 *
 * NOTE: This returns the *template ID* (e.g. 'mind-42'), NOT the
 * DPR-aware texture key. For DPR-aware keys, use
 * MindCardTextureAdapter.getCanonicalTextureKey().
 *
 * @param value  Card value (1-100).
 * @returns      The template ID string (e.g. 'mind-42').
 * @throws       Error if value is outside the valid range (1-100).
 */
export function mindCardTextureKey(value: number): string {
  validateValue(value);
  return `mind-${value}`;
}

/**
 * Compute the DPR-aware texture key for a Mind card template ID.
 *
 * This is a convenience wrapper around SvgHelpers.makeTextureKey
 * that applies the Mind card naming convention.
 *
 * @param templateId  The template ID (e.g. 'mind-42' or 'mind-back').
 * @param width       Card width in logical pixels.
 * @param height      Card height in logical pixels.
 * @param dpr         Device pixel ratio (defaults to window.devicePixelRatio or 1).
 * @returns           DPR-aware texture key (e.g. 'ms_card_mind-42_48x65@2').
 */
export function makeMindCardTextureKey(
  templateId: string,
  width: number = MIND_CARD_W,
  height: number = MIND_CARD_H,
  dpr?: number,
): string {
  const resolvedDpr = dpr ?? (typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1);
  return makeTextureKey(templateId, width, height, resolvedDpr);
}

// ── SVG text resolution ───────────────────────────────────

/**
 * Resolve SVG text for a template ID from local caches or remote fetch.
 *
 * Resolution order:
 * 1. Module-level svgTextCache (populated by Node preload path)
 * 2. Phaser text cache (browser runtime)
 * 3. Disk read (Node fallback)
 * 4. Network fetch via SvgHelpers.fetchSvgText
 */
async function resolveSvgText(scene: Phaser.Scene, templateId: string): Promise<string | undefined> {
  // 1. Check module-level cache (populated by preload in Node)
  let svgText = svgTextCache.get(templateId);
  if (svgText) return svgText;

  // 2. Check Phaser text cache (browser runtime)
  const cacheText = (scene as any).cache?.text?.get?.(`svg:${templateId}`) as string | undefined;
  if (cacheText) return cacheText;

  // 3. Node fallback: try synchronously reading from disk
  if (typeof window === 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const path = require('path');
      const filePath = path.join(process.cwd(), 'public', ASSET_PATH, `${templateId}.svg`);
      svgText = fs.readFileSync(filePath, 'utf8');
      if (svgText) return svgText;
    } catch {
      // Fall through to network fetch
    }
  }

  // 4. Network fetch via SvgHelpers
  try {
    const url = `/${ASSET_PATH}/${templateId}.svg`;
    svgText = await fetchSvgText(url);
    return svgText;
  } catch {
    return undefined;
  }
}

// ── Preloading ─────────────────────────────────────────────

/**
 * Preload Mind card assets for a Phaser scene.
 *
 * In **browser** runtimes this is registration-only: it marks the scene
 * as valid for SvgHelpers so that lazy rasterisation can proceed when
 * ensureMindCardTexture is called. No textures are eagerly created.
 *
 * In **Node/test** runtimes this synchronously reads all SVG files from
 * disk into the module-level svgTextCache for headless test access.
 *
 * Call this from your scene's preload() method.
 *
 * @param scene   The Phaser scene (null is tolerated but no registration occurs).
 * @param width   Card sprite width in pixels (defaults to MIND_CARD_W).
 * @param height  Card sprite height in pixels (defaults to MIND_CARD_H).
 */
export function preloadMindCardAssets(
  scene: Phaser.Scene | null,
  width: number = MIND_CARD_W,
  height: number = MIND_CARD_H,
): void {
  // Keep width/height parameters for API compatibility — they are used
  // by lazy rasterisation when textures are generated on demand.
  void width;
  void height;

  if (typeof window === 'undefined') {
    // Node: synchronously read from the public assets directory.
    try {
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
    // Browser: registration-only — mark scene as valid for lazy rasterisation.
    // No eager SVG loading via scene.load.svg.
    if (scene) {
      markSceneValid(scene);
    }
  }
}

// ── Lazy texture generation ────────────────────────────────

/**
 * Ensure a Mind card texture exists (or is scheduled) and return the
 * DPR-aware texture key + readiness/promise info.
 *
 * This implements lazy rasterisation via SvgHelpers.getOrCreateTexture:
 * textures are only generated on first use, not during preload.
 *
 * In Node/test environments where Image/document are unavailable, this
 * returns the template ID as key with ready=false (no rasterisation).
 *
 * @param scene   The Phaser scene whose texture manager will hold the texture.
 * @param value   Card value (1-100).
 * @param width   Card width in logical pixels (defaults to MIND_CARD_W).
 * @param height  Card height in logical pixels (defaults to MIND_CARD_H).
 * @returns       Object with the DPR-aware texture key, ready state, and
 *                optional rasterisation promise.
 */
export async function ensureMindCardTexture(
  scene: Phaser.Scene,
  value: number,
  width: number = MIND_CARD_W,
  height: number = MIND_CARD_H,
): Promise<{ key: string; ready: boolean; promise?: Promise<void> }> {
  validateValue(value);
  const templateId = mindCardTextureKey(value);

  // Resolve SVG text from cache, scene, disk, or network.
  const svgText = await resolveSvgText(scene, templateId);

  if (!svgText) {
    // Could not obtain SVG text — return template ID as a fallback key.
    return { key: templateId, ready: false };
  }

  // In Node/test environments we cannot rasterise canvas textures because
  // Image/document are not available. Return the template ID with
  // ready=false so callers know the texture is not yet rasterised.
  if (typeof (globalThis as any).Image === 'undefined' || typeof (globalThis as any).document === 'undefined') {
    // Return a DPR-aware key even in Node so test assertions match the
    // expected format, but mark as not ready (no actual texture created).
    const dpr = 1; // Node has no window.devicePixelRatio
    return { key: makeTextureKey(templateId, width, height, dpr), ready: false };
  }

  // Browser: use SvgHelpers.getOrCreateTexture for lazy rasterisation.
  return getOrCreateTexture(scene, templateId, svgText, width, height);
}

/**
 * Ensure the card-back texture exists (or is scheduled).
 *
 * Follows the same lazy rasterisation pattern as ensureMindCardTexture
 * but operates on the card-back SVG asset.
 *
 * @param scene   The Phaser scene whose texture manager will hold the texture.
 * @param width   Card width in logical pixels (defaults to MIND_CARD_W).
 * @param height  Card height in logical pixels (defaults to MIND_CARD_H).
 * @returns       Object with the DPR-aware texture key, ready state, and
 *                optional rasterisation promise.
 */
export async function ensureMindCardBackTexture(
  scene: Phaser.Scene,
  width: number = MIND_CARD_W,
  height: number = MIND_CARD_H,
): Promise<{ key: string; ready: boolean; promise?: Promise<void> }> {
  const templateId = CARD_BACK_KEY;

  const svgText = await resolveSvgText(scene, templateId);

  if (!svgText) {
    return { key: templateId, ready: false };
  }

  if (typeof (globalThis as any).Image === 'undefined' || typeof (globalThis as any).document === 'undefined') {
    const dpr = 1;
    return { key: makeTextureKey(templateId, width, height, dpr), ready: false };
  }

  return getOrCreateTexture(scene, templateId, svgText, width, height);
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