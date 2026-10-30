/**
 * Renderer parity for the core `ContainerClip` helper (CG-0MVTQ3UZL004YO8O).
 *
 * ## Why this file exists
 *
 * Phaser 4's WebGL renderer no longer supports `GameObject.setMask`, so a
 * Canvas-only `GeometryMask` clip silently renders **unclipped** on a WebGL
 * boot. The helper under test is the core-owned fix for that gap; this file
 * proves the fix on a real framebuffer rather than trusting the scene graph:
 *
 *  1. under `Phaser.WEBGL` a clipped container paints **inside** the clip
 *     rect and is **absent outside** it (`renderer.snapshotPixel()` probes, so
 *     this is a rendering assertion — not a "the mask object exists" claim);
 *  2. the clip stays anchored in **screen space** when the container is
 *     translated, matching Canvas `GeometryMask` semantics;
 *  3. `clear()` really un-clips and `setRect()` re-clips;
 *  4. no `setMask … not supported in WebGL` warning is emitted — a regression
 *     here means the helper quietly fell back to the Canvas-only API;
 *  5. the **Canvas** renderer still clips through a `GeometryMask`, so the
 *     Canvas path is unchanged (byte-stable) rather than "also migrated".
 *
 * Every assertion imports the helper from the public `@ui` barrel, so this
 * file also proves the public export surface.
 *
 * WebGL is exercised only when this browser provides a context; otherwise the
 * test reports Vitest's recorded skip with the probe's reason (never a green
 * pass on the wrong renderer).
 *
 * @module tests/ui/ContainerClip.browser.test.ts
 */

import { beforeEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import {
  bootRendererScene,
  captureConsoleWarnings,
  clearRendererSkipReasons,
  detectRendererSupport,
  getRendererSkipReasons,
  type PixelColour,
  type RendererName,
  type RendererSceneHandle,
} from '../helpers/bootRendererScene';
import { createContainerClip, type ClipRect, type ContainerClip } from '../../src/ui';

/** Logical viewport: a square so "left half" is unambiguous. */
const VIEW = 200;

/** The clip: the left half of the viewport, full height. */
const LEFT_HALF: ClipRect = { x: 0, y: 0, w: VIEW / 2, h: VIEW };

const CONTENT_COLOUR = 0xd02020;
const CONTENT_RGB = { r: 0xd0, g: 0x20, b: 0x20 };
const BACKDROP = '#202020';
const BACKDROP_RGB = { r: 0x20, g: 0x20, b: 0x20 };

/** Snapshot backends and mask edges may differ by a rounding step. */
const TOLERANCE = 8;

const SCENE_KEY = 'container-clip-probe';

/** A point well inside the clip rect. */
const INSIDE = { x: 50, y: 100 };
/** A point outside the clip rect but covered by the container's content. */
const OUTSIDE = { x: 150, y: 100 };

/**
 * Scene whose single container paints the whole viewport and is clipped to
 * {@link LEFT_HALF}. Content overshoots the viewport on every side so both
 * probe points are painted whenever no clip is applied.
 */
class ClipProbeScene extends Phaser.Scene {
  container!: Phaser.GameObjects.Container;
  clip: ContainerClip | null = null;

  constructor() {
    super({ key: SCENE_KEY });
  }

  create(): void {
    this.container = this.add.container(0, 0);
    this.container.add(
      this.add.rectangle(VIEW / 2, VIEW / 2, VIEW * 2, VIEW * 2, CONTENT_COLOUR),
    );
    this.clip = createContainerClip(this, this.container, { ...LEFT_HALF });
  }
}

function expectColourClose(
  actual: PixelColour,
  expected: { r: number; g: number; b: number },
  label: string,
): void {
  expect(
    Math.abs(actual.r - expected.r),
    `${label}: red channel ${actual.r} vs expected ${expected.r}`,
  ).toBeLessThanOrEqual(TOLERANCE);
  expect(
    Math.abs(actual.g - expected.g),
    `${label}: green channel ${actual.g} vs expected ${expected.g}`,
  ).toBeLessThanOrEqual(TOLERANCE);
  expect(
    Math.abs(actual.b - expected.b),
    `${label}: blue channel ${actual.b} vs expected ${expected.b}`,
  ).toBeLessThanOrEqual(TOLERANCE);
  expect(actual.a, `${label}: alpha`).toBe(255);
}

interface ClipProbe {
  handle: RendererSceneHandle;
  scene: ClipProbeScene;
  clip: ContainerClip;
}

/** Boot the probe scene under `renderType` and return its scene + clip. */
async function bootProbe(renderType: number): Promise<ClipProbe> {
  const handle = await bootRendererScene(renderType, {
    scene: ClipProbeScene,
    sceneKey: SCENE_KEY,
    width: VIEW,
    height: VIEW,
    backgroundColor: BACKDROP,
  });
  const scene = handle.scene as ClipProbeScene;
  expect(scene.clip, 'the scene create() must install a clip').not.toBeNull();
  return { handle, scene, clip: scene.clip as ContainerClip };
}

async function probeSides(probe: ClipProbe): Promise<{
  inside: PixelColour;
  outside: PixelColour;
}> {
  return {
    inside: await probe.handle.probePixel(INSIDE.x, INSIDE.y),
    outside: await probe.handle.probePixel(OUTSIDE.x, OUTSIDE.y),
  };
}

function registerRendererSuite(name: RendererName, renderType: number): void {
  describe(`ContainerClip on the ${name} renderer`, () => {
    const support = detectRendererSupport(renderType);
    const skipReason = support.supported
      ? null
      : `${name} unavailable in this browser: ${support.reason}`;

    it(`clips the container and emits no Canvas-only mask warning (${name})`, async (ctx) => {
      if (skipReason) {
        ctx.skip(skipReason);
        return;
      }

      // Start the capture before boot: `create()` installs the clip, so a
      // Canvas-only fallback would warn during boot.
      const capture = captureConsoleWarnings();
      try {
        const probe = await bootProbe(renderType);

        // The harness guarantees the requested renderer was created (no
        // silent Canvas fallback), so these are real parity assertions.
        expect(probe.handle.rendererName).toBe(name);
        expect(probe.handle.game.renderer.type).toBe(renderType);
        expect(getRendererSkipReasons()).toEqual([]);

        expect(probe.clip.renderer).toBe(name);
        expect(probe.clip.rect).toEqual(LEFT_HALF);
        expect(probe.clip.active).toBe(true);

        if (name === 'webgl') {
          expect(probe.clip.maskFilter).not.toBeNull();
          expect(probe.clip.geometryMask).toBeNull();
          // A Canvas GeometryMask must never be applied on WebGL — that is
          // exactly what logs the warning and no-ops.
          expect(probe.scene.container.mask).toBeFalsy();
        } else {
          expect(probe.clip.geometryMask).not.toBeNull();
          expect(probe.clip.maskFilter).toBeNull();
          expect(probe.scene.container.mask).toBe(probe.clip.geometryMask);
        }

        // Clipping actually happens: content inside, backdrop outside.
        const { inside, outside } = await probeSides(probe);
        expectColourClose(inside, CONTENT_RGB, 'inside clip rect');
        expectColourClose(outside, BACKDROP_RGB, 'outside clip rect');

        // AC: no `setMask … not supported in WebGL` warning from the helper.
        expect(capture.matching(/not supported in WebGL/i)).toEqual([]);
      } finally {
        capture.stop();
      }
    });

    it(`anchors the clip in screen space and clear()/setRect() toggle it (${name})`, async (ctx) => {
      if (skipReason) {
        ctx.skip(skipReason);
        return;
      }

      const probe = await bootProbe(renderType);

      // Translate the container. The content still covers the viewport, so a
      // screen-space clip keeps the left half visible and the right half
      // hidden. A clip that followed the container would swap both probes.
      probe.scene.container.x = 100;
      probe.scene.container.y = 25;

      const translated = await probeSides(probe);
      expectColourClose(translated.inside, CONTENT_RGB, 'translated inside clip');
      expectColourClose(translated.outside, BACKDROP_RGB, 'translated outside clip');
      expect(probe.clip.rect).toEqual(LEFT_HALF);

      // clear() is a real "no clip" on both renderers.
      probe.clip.clear();
      expect(probe.clip.active).toBe(false);
      const cleared = await probeSides(probe);
      expectColourClose(cleared.inside, CONTENT_RGB, 'cleared inside');
      expectColourClose(cleared.outside, CONTENT_RGB, 'cleared outside');

      // setRect() re-clips — to the other half, so the sides swap.
      const rightHalf: ClipRect = { x: VIEW / 2, y: 0, w: VIEW / 2, h: VIEW };
      probe.clip.setRect(rightHalf);
      expect(probe.clip.active).toBe(true);
      expect(probe.clip.rect).toEqual(rightHalf);

      const reclipped = await probeSides(probe);
      expectColourClose(reclipped.inside, BACKDROP_RGB, 're-clipped left');
      expectColourClose(reclipped.outside, CONTENT_RGB, 're-clipped right');
    });
  });
}

describe('ContainerClip renderer parity', () => {
  beforeEach(() => {
    clearRendererSkipReasons();
  });

  registerRendererSuite('webgl', Phaser.WEBGL);
  registerRendererSuite('canvas', Phaser.CANVAS);
});
