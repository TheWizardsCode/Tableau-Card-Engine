/**
 * Helper utilities for dynamically rasterising SVG strings into Phaser textures.
 * Supports caching, DPR-aware rendering, and lazy generation.
 */

import Phaser from 'phaser';

/** Cache key -> promise map for generated textures */
const textureCache = new Map<string, Promise<void>>();

/** Tracks which scenes are valid for texture operations */
const validScenes = new WeakSet<Phaser.Scene>();

/**
 * Registers a scene as valid for texture operations.
 * Call this before starting any rasterisation.
 */
export function markSceneValid(scene: Phaser.Scene): void {
  validScenes.add(scene);
}

/**
 * Marks a scene as invalid (e.g., when shutting down).
 */
export function markSceneInvalid(scene: Phaser.Scene): void {
  validScenes.delete(scene);
}

/**
 * Encodes an SVG string into a base64 data URI, handling Unicode correctly.
 */
function svgToDataUri(svgText: string): string {
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
}

/**
 * Fetches an SVG file and returns its text content.
 */
export async function fetchSvgText(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch SVG: ${url}`);
  }
  return resp.text();
}

/**
 * Generates a texture key for a given template, size, and DPR.
 */
export function makeTextureKey(templateId: string, width: number, height: number, dpr: number): string {
  return `ms_card_${templateId}_${Math.round(width)}x${Math.round(height)}@${dpr}`;
}

/**
 * Rasterises an SVG string into a Phaser texture at the specified pixel dimensions.
 * Uses devicePixelRatio for crisp rendering on HiDPI displays.
 * 
 * @param scene - The Phaser scene to add the texture to
 * @param key - Unique key for the texture (will overwrite if exists)
 * @param svgText - Raw SVG string content
 * @param width - Target display width in pixels
 * @param height - Target display height in pixels
 * @param dpr - Device pixel ratio (defaults to window.devicePixelRatio)
 */
export async function rasteriseSvgToTexture(
  scene: Phaser.Scene,
  key: string,
  svgText: string,
  width: number,
  height: number,
  dpr: number = (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
): Promise<void> {
  // Oversample cards for improved readability, then downscale at draw time.
  // We render at least 4x logical size (or device DPR if higher).
  const qualityScale = Math.max(4, dpr);
  // Check cache - if already generating or done, wait for it
  const existing = textureCache.get(key);
  if (existing) {
    await existing;
    // If texture now exists, we're done
    if (scene.textures?.exists(key)) return;
    // Otherwise continue to generate
  }

  const promise = (async () => {
    const dataUri = svgToDataUri(svgText);
    
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          // Best-effort generation: if scene is unavailable this will be caught
          // below and ignored safely.
          if (!validScenes.has(scene) || !(scene as any).sys || !(scene as any).sys.game) {
            resolve();
            return;
          }

          const canvas = document.createElement('canvas');
          const targetW = Math.round(width * qualityScale);
          const targetH = Math.round(height * qualityScale);
          canvas.width = targetW;
          canvas.height = targetH;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(); // Silently fail on context error
            return;
          }
          
          // Draw SVG once at exact target size.
          ctx.clearRect(0, 0, targetW, targetH);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, targetW, targetH);
          
          // Add canvas as texture (removes old one if exists)
          try {
            if (!validScenes.has(scene) || !(scene as any).sys || !(scene as any).sys.game) {
              resolve();
              return;
            }

            if (scene.textures?.exists(key)) {
              scene.textures.remove(key);
            }
            scene.textures.addCanvas(key, canvas);
            
            // Use LINEAR filter; textures are generated at exact display size,
            // so this avoids harsh nearest-neighbor artifacts on text edges.
            const texture = scene.textures.get(key);
            if (texture) {
              texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
            }
          } catch {
            // Silently ignore texture add failures
          }
          
          resolve();
        } catch {
          // Silently handle any other errors
          resolve();
        }
      };
      img.onerror = () => resolve(); // Silently fail on load error
      img.src = dataUri;
    });
  })();

  textureCache.set(key, promise);
  await promise;
}

/**
 * Checks if a texture exists, and if not, kicks off lazy generation.
 * Returns the texture key if ready (or Promise that resolves when ready).
 */
export function getOrCreateTexture(
  scene: Phaser.Scene,
  templateId: string,
  svgText: string,
  width: number,
  height: number,
): { key: string; ready: boolean; promise?: Promise<void> } {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const key = makeTextureKey(templateId, width, height, dpr);
  
  if (scene.textures?.exists(key)) {
    return { key, ready: true };
  }
  
  // Check if already generating
  const existingPromise = textureCache.get(key);
  if (existingPromise) {
    return { key, ready: false, promise: existingPromise };
  }
  
  // Start lazy generation
  const promise = rasteriseSvgToTexture(scene, key, svgText, width, height, dpr);
  return { key, ready: false, promise };
}
