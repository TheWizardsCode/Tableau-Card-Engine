/**
 * Unit tests for the renderer-aware `ContainerClip` helper.
 *
 * These run in Node with stub scenes/targets, so they cover the *branching*
 * contract that a framebuffer cannot easily observe:
 *
 *  - renderer branch selection (`scene.add.graphics` + `GeometryMask` for
 *    Canvas vs `scene.make.graphics(…, false)` + Mask filter for WebGL);
 *  - `clear()` is a real "no clip" on both renderers;
 *  - `destroy()` releases the mask resources exactly once (idempotent), and
 *    `setRect`/`clear`/`destroy` after destroy are no-ops.
 *
 * The pixel-level parity of both branches is asserted by
 * `ContainerClip.browser.test.ts`; the split keeps this file fast and precise
 * about lifecycle while the browser test proves actual clipping.
 *
 * @module tests/ui/ContainerClip.test.ts
 */

import { describe, expect, it, vi } from 'vitest';

// The helper reads `Phaser.WEBGL` at runtime, and the real Phaser module needs
// a DOM (`window`) at import time — so this Node test mocks just the renderer
// type constants it consumes.
vi.mock('phaser', () => ({
  CANVAS: 1,
  WEBGL: 2,
  default: { CANVAS: 1, WEBGL: 2 },
}));

import Phaser from 'phaser';

import {
  createContainerClip,
  isWebGLRenderer,
  type ContainerClip,
} from '../../src/ui/ContainerClip';

// ── Stubs ──────────────────────────────────────────────────────────────────

function createGraphicsStub(geometryMask: unknown = { destroy: vi.fn() }) {
  return {
    clear: vi.fn(),
    fillStyle: vi.fn(),
    fillRect: vi.fn(),
    destroy: vi.fn(),
    createGeometryMask: vi.fn(() => geometryMask),
  };
}

function createCanvasScene(graphics: ReturnType<typeof createGraphicsStub>) {
  const scene = {
    renderer: { type: Phaser.CANVAS },
    add: { graphics: vi.fn(() => graphics) },
    make: { graphics: vi.fn() },
    cameras: { main: { id: 'main-camera' } },
  };
  return scene as unknown as Phaser.Scene;
}

function createCanvasTarget() {
  return {
    setMask: vi.fn(),
    clearMask: vi.fn(),
    enableFilters: vi.fn(),
    filters: null as unknown,
  };
}

function createWebGLTarget(filterList: unknown) {
  const target = {
    setMask: vi.fn(),
    clearMask: vi.fn(),
    filters: null as unknown,
    enableFilters: vi.fn(function (this: { filters: unknown }) {
      this.filters = { internal: filterList };
      return this;
    }),
  };
  return target;
}

function createWebGLScene(graphics: ReturnType<typeof createGraphicsStub>) {
  const scene = {
    renderer: { type: Phaser.WEBGL },
    add: { graphics: vi.fn() },
    make: { graphics: vi.fn(() => graphics) },
    cameras: { main: { id: 'main-camera' } },
  };
  return scene as unknown as Phaser.Scene;
}

function createFilterList() {
  // Phaser's Mask filter constructor starts `active: true` — the helper must
  // turn it off explicitly when no rect is supplied.
  const maskFilter = { active: true, destroy: vi.fn() };
  const filterList = {
    addMask: vi.fn(() => maskFilter),
    remove: vi.fn(),
  };
  return { maskFilter, filterList };
}

const RECT = { x: 10, y: 20, w: 100, h: 200 };

// ── Renderer detection ─────────────────────────────────────────────────────

describe('isWebGLRenderer', () => {
  it('is true only for a WebGL scene', () => {
    expect(isWebGLRenderer({ renderer: { type: Phaser.WEBGL } } as unknown as Phaser.Scene)).toBe(
      true,
    );
    expect(isWebGLRenderer({ renderer: { type: Phaser.CANVAS } } as unknown as Phaser.Scene)).toBe(
      false,
    );
  });
});

// ── Canvas branch ──────────────────────────────────────────────────────────

describe('createContainerClip (Canvas renderer)', () => {
  it('applies a transparent-fill GeometryMask with the Graphics on the display list', () => {
    const geometryMask = { destroy: vi.fn() };
    const graphics = createGraphicsStub(geometryMask);
    const scene = createCanvasScene(graphics);
    const target = createCanvasTarget();

    const clip = createContainerClip(
      scene,
      target as unknown as Phaser.GameObjects.Container,
      RECT,
    );

    // Canvas keeps today's behaviour: display-list Graphics + GeometryMask.
    expect(scene.add.graphics).toHaveBeenCalledTimes(1);
    expect(scene.make.graphics).not.toHaveBeenCalled();
    expect(clip.renderer).toBe('canvas');
    expect(clip.graphics).toBe(graphics as unknown as Phaser.GameObjects.Graphics);
    expect(clip.geometryMask).toBe(geometryMask as unknown as Phaser.Display.Masks.GeometryMask);
    expect(clip.maskFilter).toBeNull();

    // The mask shape is drawn transparent (invisible) and applied.
    expect(graphics.fillStyle).toHaveBeenCalledWith(0xffffff, 0);
    expect(graphics.fillRect).toHaveBeenCalledWith(RECT.x, RECT.y, RECT.w, RECT.h);
    expect(target.setMask).toHaveBeenCalledWith(geometryMask);

    expect(clip.rect).toEqual(RECT);
    expect(clip.active).toBe(true);
  });

  it('starts cleared when no rect is supplied', () => {
    const graphics = createGraphicsStub();
    const scene = createCanvasScene(graphics);
    const target = createCanvasTarget();

    const clip = createContainerClip(scene, target as unknown as Phaser.GameObjects.Container);

    expect(graphics.fillRect).not.toHaveBeenCalled();
    expect(target.setMask).not.toHaveBeenCalled();
    expect(clip.active).toBe(false);
    expect(clip.rect).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it('setRect redraws and re-applies the clip after clear()', () => {
    const geometryMask = { destroy: vi.fn() };
    const graphics = createGraphicsStub(geometryMask);
    const scene = createCanvasScene(graphics);
    const target = createCanvasTarget();

    const clip = createContainerClip(
      scene,
      target as unknown as Phaser.GameObjects.Container,
      RECT,
    );
    clip.clear();
    expect(clip.active).toBe(false);
    expect(target.clearMask).toHaveBeenCalledTimes(1);

    const moved = { x: 40, y: 50, w: 60, h: 70 };
    clip.setRect(moved);

    expect(clip.active).toBe(true);
    expect(clip.rect).toEqual(moved);
    expect(graphics.fillRect).toHaveBeenLastCalledWith(moved.x, moved.y, moved.w, moved.h);
    expect(target.setMask).toHaveBeenLastCalledWith(geometryMask);
    // The same mask instance is reused — no leak per setRect call.
    expect(graphics.createGeometryMask).toHaveBeenCalledTimes(1);
  });

  it('destroy() releases the mask and graphics once and is idempotent', () => {
    const geometryMask = { destroy: vi.fn() };
    const graphics = createGraphicsStub(geometryMask);
    const scene = createCanvasScene(graphics);
    const target = createCanvasTarget();

    const clip: ContainerClip = createContainerClip(
      scene,
      target as unknown as Phaser.GameObjects.Container,
      RECT,
    );

    clip.destroy();
    expect(clip.active).toBe(false);
    expect(target.clearMask).toHaveBeenCalledTimes(1);
    expect(geometryMask.destroy).toHaveBeenCalledTimes(1);
    expect(graphics.destroy).toHaveBeenCalledTimes(1);

    clip.destroy();
    expect(target.clearMask).toHaveBeenCalledTimes(1);
    expect(geometryMask.destroy).toHaveBeenCalledTimes(1);
    expect(graphics.destroy).toHaveBeenCalledTimes(1);
  });

  it('setRect and clear are no-ops after destroy()', () => {
    const graphics = createGraphicsStub();
    const scene = createCanvasScene(graphics);
    const target = createCanvasTarget();

    const clip = createContainerClip(
      scene,
      target as unknown as Phaser.GameObjects.Container,
      RECT,
    );
    // Ignore the calls made while the clip was alive.
    graphics.fillRect.mockClear();
    target.setMask.mockClear();
    target.clearMask.mockClear();

    clip.destroy();
    graphics.fillRect.mockClear();
    graphics.fillStyle.mockClear();
    target.setMask.mockClear();
    target.clearMask.mockClear();

    expect(() => {
      clip.setRect({ x: 1, y: 2, w: 3, h: 4 });
      clip.clear();
      clip.destroy();
    }).not.toThrow();

    expect(graphics.fillRect).not.toHaveBeenCalled();
    expect(graphics.fillStyle).not.toHaveBeenCalled();
    expect(target.setMask).not.toHaveBeenCalled();
    expect(target.clearMask).not.toHaveBeenCalled();
    expect(clip.rect).toEqual(RECT);
  });
});

// ── WebGL branch ───────────────────────────────────────────────────────────

describe('createContainerClip (WebGL renderer)', () => {
  it('applies an opaque, off-display-list Mask filter', () => {
    const { maskFilter, filterList } = createFilterList();
    const graphics = createGraphicsStub();
    const scene = createWebGLScene(graphics);
    const target = createWebGLTarget(filterList);

    const clip = createContainerClip(
      scene,
      target as unknown as Phaser.GameObjects.Container,
      RECT,
    );

    // The mask Graphics must be created OFF the display list (`add = false`)
    // or the opaque shape would also be drawn over the scene.
    expect(scene.make.graphics).toHaveBeenCalledWith({ x: 0, y: 0 }, false);
    expect(scene.add.graphics).not.toHaveBeenCalled();

    expect(target.enableFilters).toHaveBeenCalledTimes(1);
    expect(filterList.addMask).toHaveBeenCalledWith(graphics, false, scene.cameras.main);

    expect(clip.renderer).toBe('webgl');
    expect(clip.maskFilter).toBe(maskFilter as unknown as Phaser.Filters.Mask);
    expect(clip.geometryMask).toBeNull();
    // Never touch the Canvas-only API on WebGL (it warns and no-ops).
    expect(target.setMask).not.toHaveBeenCalled();

    // A Mask filter multiplies by the mask alpha, so the shape must be opaque.
    expect(graphics.fillStyle).toHaveBeenCalledWith(0xffffff, 1);
    expect(graphics.fillRect).toHaveBeenCalledWith(RECT.x, RECT.y, RECT.w, RECT.h);

    expect(maskFilter.active).toBe(true);
    expect(clip.active).toBe(true);
    expect(clip.rect).toEqual(RECT);
  });

  it('starts inactive when no rect is supplied, then activates on setRect', () => {
    const { maskFilter, filterList } = createFilterList();
    const graphics = createGraphicsStub();
    const scene = createWebGLScene(graphics);
    const target = createWebGLTarget(filterList);

    const clip = createContainerClip(scene, target as unknown as Phaser.GameObjects.Container);

    expect(maskFilter.active).toBe(false);
    expect(clip.active).toBe(false);
    expect(graphics.fillRect).not.toHaveBeenCalled();

    clip.setRect(RECT);
    expect(maskFilter.active).toBe(true);
    expect(clip.active).toBe(true);
    expect(clip.rect).toEqual(RECT);
    expect(graphics.fillRect).toHaveBeenCalledWith(RECT.x, RECT.y, RECT.w, RECT.h);
    // Re-clipping reuses the one filter — never stacks a second mask.
    expect(filterList.addMask).toHaveBeenCalledTimes(1);
  });

  it('clear() disables the filter (a real "no clip") without destroying it', () => {
    const { maskFilter, filterList } = createFilterList();
    const graphics = createGraphicsStub();
    const scene = createWebGLScene(graphics);
    const target = createWebGLTarget(filterList);

    const clip = createContainerClip(
      scene,
      target as unknown as Phaser.GameObjects.Container,
      RECT,
    );
    clip.clear();

    expect(maskFilter.active).toBe(false);
    expect(clip.active).toBe(false);
    // A zero-area rect cannot express "no clip", so clear() must deactivate.
    expect(filterList.remove).not.toHaveBeenCalled();
    // The last requested rect stays inspectable after clear().
    expect(clip.rect).toEqual(RECT);
  });

  it('degrades to maskFilter === null without throwing when there is no filter list', () => {
    // `enableFilters()` bails out without a WebGL context, leaving `filters`
    // null. Clipping is impossible, which must degrade rather than throw.
    const graphics = createGraphicsStub();
    const scene = createWebGLScene(graphics);
    const target = {
      setMask: vi.fn(),
      clearMask: vi.fn(),
      filters: null as unknown,
      enableFilters: vi.fn(),
    };

    let clip: ContainerClip | undefined;
    expect(() => {
      clip = createContainerClip(
        scene,
        target as unknown as Phaser.GameObjects.Container,
        RECT,
      );
    }).not.toThrow();

    expect(clip?.maskFilter).toBeNull();
    expect(clip?.active).toBe(false);

    // Everything stays total: no throw, no clip, requested rect recorded.
    expect(() => {
      clip?.setRect({ x: 1, y: 2, w: 30, h: 40 });
      clip?.clear();
    }).not.toThrow();
    expect(clip?.active).toBe(false);
    expect(clip?.rect).toEqual({ x: 1, y: 2, w: 30, h: 40 });

    expect(() => clip?.destroy()).not.toThrow();
    expect(graphics.fillRect).toHaveBeenCalled();
  });

  it('destroy() removes the filter and graphics once and is idempotent', () => {
    const { maskFilter, filterList } = createFilterList();
    const graphics = createGraphicsStub();
    const scene = createWebGLScene(graphics);
    const target = createWebGLTarget(filterList);

    const clip = createContainerClip(
      scene,
      target as unknown as Phaser.GameObjects.Container,
      RECT,
    );

    clip.destroy();
    expect(clip.active).toBe(false);
    expect(filterList.remove).toHaveBeenCalledTimes(1);
    expect(filterList.remove).toHaveBeenCalledWith(maskFilter);
    expect(graphics.destroy).toHaveBeenCalledTimes(1);

    clip.destroy();
    expect(filterList.remove).toHaveBeenCalledTimes(1);
    expect(graphics.destroy).toHaveBeenCalledTimes(1);
  });

  it('setRect and clear are no-ops after destroy()', () => {
    const { maskFilter, filterList } = createFilterList();
    const graphics = createGraphicsStub();
    const scene = createWebGLScene(graphics);
    const target = createWebGLTarget(filterList);

    const clip = createContainerClip(
      scene,
      target as unknown as Phaser.GameObjects.Container,
      RECT,
    );
    clip.destroy();

    graphics.fillRect.mockClear();
    graphics.fillStyle.mockClear();
    maskFilter.active = false;
    filterList.addMask.mockClear();
    filterList.remove.mockClear();

    expect(() => {
      clip.setRect({ x: 1, y: 2, w: 3, h: 4 });
      clip.clear();
      clip.destroy();
    }).not.toThrow();

    expect(graphics.fillRect).not.toHaveBeenCalled();
    expect(graphics.fillStyle).not.toHaveBeenCalled();
    expect(maskFilter.active).toBe(false);
    expect(filterList.addMask).not.toHaveBeenCalled();
    expect(filterList.remove).not.toHaveBeenCalled();
    expect(clip.rect).toEqual(RECT);
  });
});
