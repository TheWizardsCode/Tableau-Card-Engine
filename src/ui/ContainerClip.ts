/**
 * Renderer-aware container clipping.
 *
 * ## Why this module exists
 *
 * Phaser 4's WebGL renderer **removed** `GameObject.setMask` support:
 * `GeometryMask` is Canvas-only. `setMask` logs
 * `"This method is not supported in WebGL. Create a Mask filter instead."`
 * and returns immediately, so a WebGL boot silently renders unclipped content
 * (a scrollable log, a panned street-map viewport, a card-index list).
 *
 * This helper is the single core-owned seam for that problem: callers describe
 * a rectangular clip and it applies the renderer-appropriate mechanism, so an
 * example game or downstream repo never carries its own copy of the
 * branching (ported from `tce-main-street`'s proven `ContainerClip`).
 *
 * ## Phaser 4 (`4.0.0-rc.7`) restriction
 *
 * `GameObject.setMask` is **not supported in WebGL** in Phaser 4 RC7 — it
 * logs the warning above and no-ops. The WebGL replacement is a **Mask
 * filter** (`FilterList#addMask`), which multiplies the filtered object by
 * the *alpha* of a mask GameObject's rendered texture. That differs from
 * `GeometryMask` in two ways that matter here:
 *
 * 1. the mask shape must be drawn **opaque** (a transparent fill, which is
 *    what `GeometryMask` needs, masks everything away), and
 * 2. the mask GameObject is rendered by the filter itself, so it must stay
 *    **off the display list** — otherwise the opaque shape would also be
 *    drawn on screen.
 *
 * A `Container` has no intrinsic width/height, so Phaser treats it as
 * "poorly bounded" and focuses the filter on the camera context: the mask is
 * applied in **screen space**, exactly like a Canvas `GeometryMask` (also
 * positioned in global space, and it does not follow the masked object). That
 * keeps a viewport clip fixed while the clipped content pans and zooms.
 *
 * ## Renderer branching
 *
 * Clipping is branched on the renderer so Canvas output stays byte-stable —
 * the Canvas path is the long-standing behaviour and the WebGL path is the
 * only new behaviour. The renderer type is fixed for a game instance, so it
 * is resolved once at construction.
 *
 * @module
 */

import Phaser from 'phaser';

/** A clip rectangle in scene (camera) space, `w`/`h` from the origin corner. */
export interface ClipRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Which clipping mechanism a `ContainerClip` is driving. */
export type ClipRenderer = 'canvas' | 'webgl';

const EMPTY_RECT: Readonly<ClipRect> = Object.freeze({ x: 0, y: 0, w: 0, h: 0 });

/**
 * A renderer-aware clip on a single container.
 *
 * `graphics` is always the shape source; `geometryMask` is populated on the
 * Canvas renderer and `maskFilter` on WebGL. At most one of the two is set,
 * and both are `null` when the renderer cannot clip (no WebGL filter list).
 */
export interface ContainerClip {
  /** Which mechanism this clip drives (fixed for the clip's lifetime). */
  readonly renderer: ClipRenderer;
  /** The Graphics that describes the clip region (the mask source). */
  readonly graphics: Phaser.GameObjects.Graphics;
  /** Canvas renderer only: the applied `GeometryMask`. */
  readonly geometryMask: Phaser.Display.Masks.GeometryMask | null;
  /** WebGL renderer only: the applied Mask filter. */
  readonly maskFilter: Phaser.Filters.Mask | null;
  /** The clip region requested by the last `setRect` (zero before any call). */
  readonly rect: ClipRect;
  /** Whether the clip is currently applied (false after `clear`). */
  readonly active: boolean;
  /** Clip to `rect` (also re-enables a previously cleared clip). */
  setRect(rect: ClipRect): void;
  /**
   * Remove the clip so nothing is clipped, without destroying its resources.
   *
   * A zero-area clip cannot express "no clip" for a WebGL Mask filter (it
   * multiplies by alpha 0 everywhere, hiding the whole object), so callers
   * that only clip conditionally must `clear()` instead of shrinking the rect.
   */
  clear(): void;
  /** Remove the clip and destroy its mask resources. Idempotent. */
  destroy(): void;
}

/** True when the scene is running on the WebGL renderer. */
export function isWebGLRenderer(scene: Phaser.Scene): boolean {
  return scene.renderer.type === Phaser.WEBGL;
}

/**
 * Apply a rectangular clip to `target`, using the renderer-appropriate
 * mechanism.
 *
 * The clip starts **cleared**; pass `rect` to apply it immediately, or call
 * {@link ContainerClip.setRect} when the bounds are known.
 */
export function createContainerClip(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container,
  rect?: ClipRect,
): ContainerClip {
  if (isWebGLRenderer(scene)) {
    return createWebGLClip(scene, target, rect);
  }
  return createCanvasClip(scene, target, rect);
}

/**
 * Canvas: a `GeometryMask` clips to the *path* of its Graphics and ignores the
 * fill colour/alpha, so a transparent fill keeps the shape itself invisible.
 * The Graphics stays on the display list to preserve long-standing Canvas
 * behaviour (Phaser 4 RC7 renders the mask shape through
 * `Graphics.renderCanvas`, which expects a live display object).
 */
function createCanvasClip(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container,
  initialRect: ClipRect | undefined,
): ContainerClip {
  const graphics = scene.add.graphics();
  const geometryMask = graphics.createGeometryMask();
  let rect: ClipRect = { ...EMPTY_RECT };
  let active = false;
  let destroyed = false;

  const draw = (r: ClipRect): void => {
    graphics.clear();
    graphics.fillStyle(0xffffff, 0);
    graphics.fillRect(r.x, r.y, r.w, r.h);
  };

  if (initialRect) {
    draw(initialRect);
    rect = { ...initialRect };
    target.setMask(geometryMask);
    active = true;
  }

  return {
    renderer: 'canvas',
    graphics,
    geometryMask,
    maskFilter: null,
    get rect() {
      return rect;
    },
    get active() {
      return active;
    },
    setRect: (r: ClipRect) => {
      if (destroyed) return;
      draw(r);
      rect = { ...r };
      active = true;
      target.setMask(geometryMask);
    },
    clear: () => {
      if (destroyed) return;
      active = false;
      try {
        target.clearMask();
      } catch {
        /* target may already be destroyed */
      }
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      active = false;
      try {
        target.clearMask();
      } catch {
        /* target may already be destroyed */
      }
      geometryMask.destroy();
      try {
        graphics.destroy();
      } catch {
        /* already destroyed with the scene */
      }
    },
  };
}

/**
 * WebGL: a Mask filter samples the mask GameObject's alpha, so the shape must
 * be drawn opaque (`alpha: 1`), and `add: false` keeps it off the display list
 * — the filter renders it into its own DynamicTexture, so it is never drawn
 * over the scene.
 */
function createWebGLClip(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container,
  initialRect: ClipRect | undefined,
): ContainerClip {
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  let rect: ClipRect = { ...EMPTY_RECT };
  let active = false;
  let destroyed = false;

  const draw = (r: ClipRect): void => {
    graphics.clear();
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(r.x, r.y, r.w, r.h);
  };

  if (initialRect) {
    draw(initialRect);
    rect = { ...initialRect };
  }

  target.enableFilters();
  const filterList = target.filters?.internal ?? null;

  // Without a WebGL context `enableFilters` bails out and there is no filter
  // list. Keep the Graphics alive so callers can still inspect the requested
  // region; nothing can clip, which matches the renderer's capability.
  const maskFilter = filterList
    ? filterList.addMask(graphics, false, scene.cameras.main)
    : null;
  active = maskFilter !== null && Boolean(initialRect);
  if (maskFilter && !initialRect) maskFilter.active = false;

  return {
    renderer: 'webgl',
    graphics,
    geometryMask: null,
    maskFilter,
    get rect() {
      return rect;
    },
    get active() {
      return active;
    },
    setRect: (r: ClipRect) => {
      if (destroyed) return;
      draw(r);
      rect = { ...r };
      if (maskFilter) {
        maskFilter.active = true;
        active = true;
      }
    },
    clear: () => {
      if (destroyed) return;
      active = false;
      if (maskFilter) maskFilter.active = false;
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      active = false;
      if (maskFilter) {
        maskFilter.active = false;
        try {
          target.filters?.internal.remove(maskFilter);
        } catch {
          /* list may already be torn down with the scene */
        }
      }
      try {
        graphics.destroy();
      } catch {
        /* already destroyed with the scene */
      }
    },
  };
}
