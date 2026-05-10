import type Phaser from 'phaser';

/** Cache key -> promise map for generated textures. */
const textureCache = new Map<string, Promise<void>>();

/** Tracks scenes that are still safe for texture operations. */
const validScenes = new WeakSet<Phaser.Scene>();

/** Registers a scene as valid for texture operations. */
export function markSceneValid(scene: Phaser.Scene): void {
  validScenes.add(scene);
}

/** Marks a scene invalid (for example, during shutdown). */
export function markSceneInvalid(scene: Phaser.Scene): void {
  validScenes.delete(scene);
}

/** Fetches an SVG file and returns its text content. */
export async function fetchSvgText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch SVG: ${url}`);
  }

  return response.text();
}

/**
 * Generates a deterministic texture key for a template + dimensions + DPR.
 * Width/height are rounded to avoid key fragmentation from sub-pixel values.
 */
export function makeTextureKey(templateId: string, width: number, height: number, dpr: number): string {
  return `ms_card_${templateId}_${Math.round(width)}x${Math.round(height)}@${dpr}`;
}

function svgToDataUri(svgText: string): string {
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
}

/**
 * Rasterises an SVG string into a Phaser texture.
 *
 * Rendering uses a quality scale of at least 4x logical size (or DPR if higher)
 * to preserve edge clarity when downscaled at draw time.
 */
export async function rasteriseSvgToTexture(
  scene: Phaser.Scene,
  key: string,
  svgText: string,
  width: number,
  height: number,
  dpr: number = (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
): Promise<void> {
  const qualityScale = Math.max(4, dpr);

  const existing = textureCache.get(key);
  if (existing) {
    await existing;
    if (scene.textures?.exists(key)) {
      return;
    }
  }

  const promise = (async () => {
    const dataUri = svgToDataUri(svgText);

    await new Promise<void>((resolve) => {
      const img = new Image();

      img.onload = () => {
        try {
          if (!validScenes.has(scene) || !(scene as any).sys || !(scene as any).sys.game) {
            resolve();
            return;
          }

          const canvas = document.createElement('canvas');
          const targetW = Math.round(width * qualityScale);
          const targetH = Math.round(height * qualityScale);
          canvas.width = targetW;
          canvas.height = targetH;

          const context = canvas.getContext('2d');
          if (!context) {
            resolve();
            return;
          }

          context.clearRect(0, 0, targetW, targetH);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = 'high';
          context.drawImage(img, 0, 0, targetW, targetH);

          try {
            if (!validScenes.has(scene) || !(scene as any).sys || !(scene as any).sys.game) {
              resolve();
              return;
            }

            // Never remove and re-add an existing texture key here.
            // Removing a texture that is still referenced by active frames can
            // transiently leave frame.source null in Phaser's WebGL path.
            if (!scene.textures?.exists(key)) {
              scene.textures.addCanvas(key, canvas);

              const texture = scene.textures.get(key) as { setFilter?: (mode: number) => void } | undefined;
              if (texture?.setFilter) {
                // Phaser uses 1 for linear filtering; avoid runtime Phaser import in core helpers.
                texture.setFilter(1);
              }
            }
          } catch {
            // Best effort texture registration.
          }

          resolve();
        } catch {
          resolve();
        }
      };

      img.onerror = () => resolve();
      img.src = dataUri;
    });
  })();

  textureCache.set(key, promise);
  await promise;
}

/**
 * Returns a texture key if available, otherwise starts lazy generation.
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

  const existingPromise = textureCache.get(key);
  if (existingPromise) {
    return { key, ready: false, promise: existingPromise };
  }

  const promise = rasteriseSvgToTexture(scene, key, svgText, width, height, dpr);
  return { key, ready: false, promise };
}
