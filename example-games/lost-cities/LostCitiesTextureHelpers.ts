/**
 * LostCitiesTextureHelpers — Inline SVG texture helpers for Lost Cities.
 *
 * Provides lazy rasterisation of card SVG assets via SvgHelpers,
 * following the migration pattern established by The Mind
 * (CG-0MP12H40Q003Y7OU).
 *
 * Migration notes (CG-0MOZN33JW004XILY):
 *   - `preloadLostCitiesAssets` is registration-only in browser runtimes:
 *     it marks the scene as valid for SvgHelpers and optionally preloads
 *     the card-back as a static fallback image. It does NOT eagerly
 *     rasterise SVG files via scene.load.svg.
 *   - `ensureLcCardTexture` / `ensureLcCompactTexture` produce DPR-aware
 *     texture keys (e.g. `ms_card_lc-blue-2_95x130@2`) via
 *     SvgHelpers.getOrCreateTexture.
 *   - The Node/test preload path populates `svgTextCache` so headless
 *     tests can access SVG source text without a browser.
 *   - Callers that need texture keys for sprite creation should use
 *     `getLcTextureKey()` with the template ID returned by `cardAssetKey()`
 *     or `compactAssetKey()`.
 */

export { markSceneInvalid } from '../../src/core-engine/SvgHelpers';

import {
  getOrCreateTexture,
  fetchSvgText,
  markSceneValid,
  makeTextureKey,
} from '../../src/core-engine/SvgHelpers';
import { EXPEDITION_COLORS, CARD_BACK_KEY } from './LostCitiesCards';

// ── Card dimension constants (copied from LostCitiesConstants to avoid
// Phaser dependency chain in Node/test environments) ─────────────

/** Full-size card width in logical pixels. */
export const CARD_W = 95;
/** Full-size card height in logical pixels. */
export const CARD_H = 130;
/** Compact (discard-size) card width in logical pixels. */
export const DISCARD_CARD_W = 57;
/** Compact (discard-size) card height in logical pixels. */
export const DISCARD_CARD_H = 78;

// ── Constants ──────────────────────────────────────────────

/** Template IDs for investment cards per color and index. */
function investmentTemplateId(color: string, index: number): string {
  return `lc-${color}-inv${index}`;
}

/** Template IDs for numbered cards per color and rank. */
function numberedTemplateId(color: string, rank: number): string {
  return `lc-${color}-${rank}`;
}

/** Base path to Lost Cities card SVG assets. */
const ASSET_PATH = 'assets/cards/lost-cities';

// ── SVG text cache ─────────────────────────────────────────

/**
 * Module-level cache for SVG source text when running in Node (tests) or
 * when preload reads files. Keys are template IDs (e.g. 'lc-blue-2' or
 * 'lc-back').
 */
const svgTextCache = new Map<string, string>();

// ── Texture key helpers ────────────────────────────────────

/**
 * Compute the DPR-aware texture key for a Lost Cities card template ID.
 *
 * @param templateId  Template ID (e.g. 'lc-blue-2' or 'lc-back').
 * @param width       Card width in logical pixels (defaults to CARD_W).
 * @param height      Card height in logical pixels (defaults to CARD_H).
 * @param dpr         Device pixel ratio (defaults to window.devicePixelRatio or 1).
 * @returns           DPR-aware texture key (e.g. 'ms_card_lc-blue-2_95x130@2').
 */
export function getLcTextureKey(
  templateId: string,
  width: number = CARD_W,
  height: number = CARD_H,
  dpr?: number,
): string {
  const resolvedDpr = dpr ?? (typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1);
  return makeTextureKey(templateId, width, height, resolvedDpr);
}

/**
 * Return a fallback texture key for the card back, preferring
 * DPR-aware key first, then the preloaded static image key.
 */
export function getLcBackFallbackKey(scene: Phaser.Scene): string {
  const canonical = getLcTextureKey(CARD_BACK_KEY, CARD_W, CARD_H);
  if (scene.textures?.exists(canonical)) return canonical;
  if (scene.textures?.exists(CARD_BACK_KEY)) return CARD_BACK_KEY;
  return canonical;
}

/**
 * Resolve the best available texture key for a card face.
 *
 * If the DPR-aware face texture already exists in the scene's texture
 * manager, returns it directly (avoiding card-back flicker on re-render).
 * Otherwise falls back to getLcBackFallbackKey so the sprite is always
 * created with a valid texture.
 *
 * @param scene       The Phaser scene.
 * @param templateId  Template ID (e.g. 'lc-blue-2' or 'lc-blue-2-sm').
 * @param width       Logical pixel width of the texture.
 * @param height      Logical pixel height of the texture.
 * @returns           Either the DPR-aware texture key (if it exists) or
 *                    the card back fallback key.
 */
export function getLcFaceKey(scene: Phaser.Scene, templateId: string, width: number, height: number): string {
  const dprKey = getLcTextureKey(templateId, width, height);
  if (scene.textures?.exists(dprKey)) return dprKey;
  return getLcBackFallbackKey(scene);
}

// ── SVG text resolution ────────────────────────────────────

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
 * Preload Lost Cities card assets for a Phaser scene.
 *
 * In **browser** runtimes this is registration-only: it marks the scene
 * as valid for SvgHelpers so that lazy rasterisation can proceed when
 * ensureLcCardTexture is called. No textures are eagerly created.
 *
 * In **Node/test** runtimes this synchronously reads all SVG files from
 * disk into the module-level svgTextCache for headless test access.
 *
 * Call this from your scene's preload() method.
 *
 * @param scene  The Phaser scene (null is tolerated but no registration occurs).
 */
export function preloadLostCitiesAssets(scene: Phaser.Scene | null): void {
  if (typeof window === 'undefined') {
    // Node: synchronously read from the public assets directory.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const path = require('path');
      const base = path.join(process.cwd(), 'public', ASSET_PATH);

      // Read card back
      svgTextCache.set(CARD_BACK_KEY, fs.readFileSync(path.join(base, `${CARD_BACK_KEY}.svg`), 'utf8'));

      // Read all card face SVGs (full-size and discard-size)
      for (const color of EXPEDITION_COLORS) {
        for (let inv = 1; inv <= 3; inv++) {
          const tid = investmentTemplateId(color, inv);
          svgTextCache.set(tid, fs.readFileSync(path.join(base, `${tid}.svg`), 'utf8'));
          const compactTid = `${tid}-sm`;
          svgTextCache.set(compactTid, fs.readFileSync(path.join(base, `${compactTid}.svg`), 'utf8'));
        }
        for (let rank = 2; rank <= 10; rank++) {
          const tid = numberedTemplateId(color, rank);
          svgTextCache.set(tid, fs.readFileSync(path.join(base, `${tid}.svg`), 'utf8'));
          const compactTid = `${tid}-sm`;
          svgTextCache.set(compactTid, fs.readFileSync(path.join(base, `${compactTid}.svg`), 'utf8'));
        }
      }
    } catch (err) {
      // Best-effort: tests that need these assets should ensure they exist.
    }
  } else {
    // Browser: registration-only for lazy rasterisation plus a static
    // card-back fallback image so first paint never shows missing-texture
    // placeholders.
    if (scene) {
      markSceneValid(scene);

      try {
        // Use Phaser image loader (not load.svg) to provide a reliable
        // immediate fallback texture key while DPR-aware textures are
        // generated lazily by SvgHelpers.
        if (!scene.textures?.exists(CARD_BACK_KEY)) {
          (scene.load as any)?.image?.(CARD_BACK_KEY, `${ASSET_PATH}/${CARD_BACK_KEY}.svg`);
        }
      } catch {
        // Best-effort: keep preload resilient in constrained environments.
      }
    }
  }
}

// ── Lazy texture generation ────────────────────────────────

/**
 * Ensure a Lost Cities card texture exists (or is scheduled) and return the
 * DPR-aware texture key + readiness/promise info.
 *
 * This implements lazy rasterisation via SvgHelpers.getOrCreateTexture:
 * textures are only generated on first use, not during preload.
 *
 * In Node/test environments where Image/document are unavailable, this
 * returns the DPR-aware key with ready=false (no rasterisation).
 *
 * @param scene       The Phaser scene whose texture manager will hold the texture.
 * @param templateId  Template ID (e.g. 'lc-blue-2' or 'lc-back').
 * @param width       Card width in logical pixels (defaults to CARD_W).
 * @param height      Card height in logical pixels (defaults to CARD_H).
 * @returns           Object with the DPR-aware texture key, ready state, and
 *                    optional rasterisation promise.
 */
export async function ensureLcCardTexture(
  scene: Phaser.Scene,
  templateId: string,
  width: number = CARD_W,
  height: number = CARD_H,
): Promise<{ key: string; ready: boolean; promise?: Promise<void> }> {
  // Resolve SVG text from cache, scene, disk, or network.
  const svgText = await resolveSvgText(scene, templateId);

  if (!svgText) {
    // Could not obtain SVG text — fall back to preloaded static image key when available.
    if (scene.textures?.exists(templateId)) {
      return { key: templateId, ready: true };
    }
    return { key: templateId, ready: false };
  }

  // In Node/test environments we cannot rasterise canvas textures because
  // Image/document are not available. Return the DPR-aware key with
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
 * Ensure a compact (discard-size) Lost Cities card texture exists.
 *
 * Convenience wrapper around ensureLcCardTexture with discard dimensions.
 *
 * @param scene       The Phaser scene.
 * @param templateId  Template ID (e.g. 'lc-blue-2-sm').
 * @returns           Object with the DPR-aware texture key, ready state, and
 *                    optional rasterisation promise.
 */
export async function ensureLcCompactTexture(
  scene: Phaser.Scene,
  templateId: string,
): Promise<{ key: string; ready: boolean; promise?: Promise<void> }> {
  return ensureLcCardTexture(scene, templateId, DISCARD_CARD_W, DISCARD_CARD_H);
}

/**
 * Ensure the card-back texture exists (or is scheduled).
 *
 * Follows the same lazy rasterisation pattern as ensureLcCardTexture
 * but operates on the card-back SVG asset.
 *
 * @param scene   The Phaser scene.
 * @param width   Card width in logical pixels (defaults to CARD_W).
 * @param height  Card height in logical pixels (defaults to CARD_H).
 * @returns       Object with the DPR-aware texture key, ready state, and
 *                optional rasterisation promise.
 */
export async function ensureLcBackTexture(
  scene: Phaser.Scene,
  width: number = CARD_W,
  height: number = CARD_H,
): Promise<{ key: string; ready: boolean; promise?: Promise<void> }> {
  return ensureLcCardTexture(scene, CARD_BACK_KEY, width, height);
}

// ── Rasterisation helpers for renderer ─────────────────────

/**
 * Asynchronously apply an ensured texture to a sprite once it is ready.
 *
 * Pattern used by LostCitiesRenderer: create the sprite with a fallback
 * texture (card back), then call this to lazily update it when the
 * real texture is rasterised.
 *
 * @param sprite       The Phaser image to update.
 * @param ensureOp     Promise returned by ensureLcCardTexture / ensureLcCompactTexture.
 * @param stillMounted Callback returning true if the sprite is still valid.
 * @param displayW     Display width after texture update (defaults to CARD_W).
 * @param displayH     Display height after texture update (defaults to CARD_H).
 */
export async function applyEnsuredTexture(
  sprite: Phaser.GameObjects.Image,
  ensureOp: Promise<{ key: string; ready: boolean; promise?: Promise<void> }>,
  stillMounted: () => boolean,
  displayW: number = CARD_W,
  displayH: number = CARD_H,
): Promise<void> {
  try {
    const result = await ensureOp;
    if (!result.ready && result.promise) {
      await result.promise;
    }
    if (!stillMounted()) return;
    sprite.setTexture(result.key);
    sprite.setDisplaySize(displayW, displayH);
  } catch {
    // Keep existing texture fallback on error.
  }
}
