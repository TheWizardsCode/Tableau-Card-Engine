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
 *
 * @param templateId - Logical identifier for the texture template (e.g. "tempura", "business-1")
 * @param width - Target display width in pixels
 * @param height - Target display height in pixels
 * @param dpr - Device pixel ratio
 * @param prefix - Optional namespace prefix for the key (default: "ms_card_")
 */
export function makeTextureKey(
  templateId: string,
  width: number,
  height: number,
  dpr: number,
  prefix: string = 'ms_card_',
): string {
  return `${prefix}${templateId}_${Math.round(width)}x${Math.round(height)}@${dpr}`;
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

    // Pre-create a placeholder canvas and register it immediately when the
    // scene is known to be valid. This ensures a DPR-aware texture key exists
    // in scene.textures synchronously so sprites created immediately after
    // requesting a texture will not see Phaser's "missing texture" placeholder
    // due to a later addCanvas call.
    let placeholderCanvas: HTMLCanvasElement | null = null;
    try {
      // Only add a placeholder when the scene is currently valid for texture ops.
      if (validScenes.has(scene) && !scene.textures?.exists(key)) {
        const targetW = Math.round(width * qualityScale);
        const targetH = Math.round(height * qualityScale);
        const pc = document.createElement('canvas');
        pc.width = targetW;
        pc.height = targetH;
        const pctx = pc.getContext('2d');
        if (pctx) {
          // Draw a very small single-colour placeholder so the texture has a
          // valid backing immediately. Keep it visually neutral.
          pctx.clearRect(0, 0, targetW, targetH);
          pctx.fillStyle = '#dddddd';
          pctx.fillRect(0, 0, targetW, targetH);
        }

        try {
          scene.textures.addCanvas(key, pc);
          const texture = scene.textures.get(key) as { setFilter?: (mode: number) => void } | undefined;
          if (texture?.setFilter) {
            texture.setFilter(1);
          }
          placeholderCanvas = pc;
        } catch {
          // Best-effort placeholder registration; fall back to later addCanvas.
          placeholderCanvas = null;
        }
      }
    } catch {
      placeholderCanvas = null;
    }

    await new Promise<void>((resolve) => {
      const img = new Image();

      img.onload = () => {
        try {
          if (!validScenes.has(scene) || !(scene as any).sys || !(scene as any).sys.game) {
            resolve();
            return;
          }

          const targetW = Math.round(width * qualityScale);
          const targetH = Math.round(height * qualityScale);

          // Reuse the placeholder canvas if it was registered, otherwise create
          // a fresh canvas and add it to the texture manager.
          const canvas = placeholderCanvas ?? document.createElement('canvas');
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
            if (!placeholderCanvas) {
              if (!scene.textures?.exists(key)) {
                scene.textures.addCanvas(key, canvas);

                const texture = scene.textures.get(key) as { setFilter?: (mode: number) => void } | undefined;
                if (texture?.setFilter) {
                  // Phaser uses 1 for linear filtering; avoid runtime Phaser import in core helpers.
                  texture.setFilter(1);
                }
              }
            } else {
              // If we reused the placeholder canvas, the texture is already
              // backed by the same canvas reference. Update any texture state
              // (filter) if available.
              const texture = scene.textures.get(key) as { setFilter?: (mode: number) => void } | undefined;
              if (texture?.setFilter) {
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
