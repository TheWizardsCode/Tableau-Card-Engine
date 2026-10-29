/**
 * Self-test for the renderer-parity harness (`bootRendererScene`).
 *
 * The harness is the foundation every WebGL clip assertion in the renderer
 * migration builds on, so it proves its own guarantees here:
 *
 *  1. it boots **both** renderers on request and asserts the renderer it
 *     actually got (a silent Canvas fallback would fail, not pass);
 *  2. `captureConsoleWarnings` records warnings emitted between start and
 *     stop — including during boot — and stops recording afterwards;
 *  3. `probePixel` returns the pixel that was really rendered, including
 *     content added just before the probe (it awaits a render tick);
 *  4. an environment that cannot provide the requested renderer fails loudly
 *     and records a skip reason, so a WebGL assertion can never be green on
 *     Canvas.
 *
 * WebGL is exercised only when this browser provides a context; otherwise the
 * test reports Vitest's recorded skip with the probe's reason (never a pass).
 *
 * @module tests/helpers/bootRendererScene.browser.test.ts
 */

import { beforeEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import {
  bootRendererScene,
  captureConsoleWarnings,
  clearRendererSkipReasons,
  detectRendererSupport,
  getRendererSkipReasons,
  probePixel,
  RendererUnavailableError,
  type PixelColour,
  type RendererName,
} from './bootRendererScene';
import { waitForCondition } from './waitForCondition';

/** Background colour distinct from the probe rectangle below. */
const BACKDROP = '#3366cc';
const BACKDROP_RGB = { r: 0x33, g: 0x66, b: 0xcc };

/** Channel tolerance: snapshot backends may differ by a rounding step. */
const TOLERANCE = 2;

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
}

/**
 * Register the shared renderer-parity checks for one renderer.
 *
 * Each test reports Vitest's recorded skip (with the reason) when this browser
 * cannot provide the renderer, instead of passing without exercising it.
 */
function registerRendererSuite(name: RendererName, renderType: number): void {
  describe(`${name} renderer`, () => {
    const support = detectRendererSupport(renderType);
    const skipReason = support.supported
      ? null
      : `${name} unavailable in this browser: ${support.reason}`;

    it(`boots with Phaser.${name.toUpperCase()} and probes the background colour`, async (ctx) => {
      if (skipReason) {
        ctx.skip(skipReason);
        return;
      }

      const handle = await bootRendererScene(renderType, {
        width: 200,
        height: 150,
        backgroundColor: BACKDROP,
      });

      // The self-test asserts the renderer it actually got — never assume.
      expect(handle.game.renderer.type).toBe(renderType);
      expect(handle.scene.renderer.type).toBe(renderType);
      expect(handle.rendererName).toBe(name);
      expect(getRendererSkipReasons()).toEqual([]);

      const pixel = await handle.probePixel(100, 75);
      expectColourClose(pixel, BACKDROP_RGB, 'background');
      expect(pixel.a).toBe(255);
    });

    it(`probes content rendered after boot on the ${name} renderer`, async (ctx) => {
      if (skipReason) {
        ctx.skip(skipReason);
        return;
      }

      const handle = await bootRendererScene(renderType, {
        width: 200,
        height: 150,
        backgroundColor: BACKDROP,
      });

      // Added with no explicit render tick afterwards: `probePixel` must
      // itself await a frame or this assertion sees the pre-rectangle buffer.
      handle.scene.add.rectangle(50, 75, 40, 40, 0xff0000);

      const content = await probePixel(handle.scene, 50, 75);
      expectColourClose(content, { r: 255, g: 0, b: 0 }, 'probe rectangle');

      const background = await probePixel(handle.scene, 150, 75);
      expectColourClose(background, BACKDROP_RGB, 'untouched background');
    });
  });
}

describe('bootRendererScene harness', () => {
  beforeEach(() => {
    clearRendererSkipReasons();
  });

  registerRendererSuite('canvas', Phaser.CANVAS);
  registerRendererSuite('webgl', Phaser.WEBGL);

  describe('console warning capture', () => {
    it('records a synthetic console.warn between start and stop only', async () => {
      console.warn('harness self-test: before capture');

      const capture = captureConsoleWarnings();
      const handle = await bootRendererScene(Phaser.CANVAS, {
        backgroundColor: BACKDROP,
      });

      console.warn('harness self-test: synthetic warning', 42);

      expect(capture.active).toBe(true);
      expect(capture.matching('synthetic warning')).toEqual([
        'harness self-test: synthetic warning 42',
      ]);
      expect(capture.messages).toContain('harness self-test: synthetic warning 42');
      // Captured during boot? Boot itself emits nothing named "before capture".
      expect(capture.matching('before capture')).toEqual([]);
      expect(capture.warnings[0]?.stack).toContain('bootRendererScene.browser.test');

      capture.stop();
      expect(capture.active).toBe(false);

      console.warn('harness self-test: after capture');
      expect(capture.matching('after capture')).toEqual([]);
      expect(capture.warnings).toHaveLength(1);

      // The handle stays usable after the capture stops.
      expect(handle.scene.sys.isActive()).toBe(true);
    });

    it('supports RegExp matching', () => {
      const capture = captureConsoleWarnings();
      try {
        console.warn('alpha 1');
        console.warn('beta 2');
        expect(capture.matching(/^alpha/)).toEqual(['alpha 1']);
        // Repeated use of the same global RegExp is stable.
        const global = /beta/g;
        expect(capture.matching(global)).toEqual(['beta 2']);
        expect(capture.matching(global)).toEqual(['beta 2']);
      } finally {
        capture.stop();
      }
    });

    it('stops recording when its scene shuts down', async (ctx) => {
      const support = detectRendererSupport(Phaser.CANVAS);
      if (!support.supported) {
        ctx.skip(`canvas unavailable in this browser: ${support.reason}`);
        return;
      }

      const handle = await bootRendererScene(Phaser.CANVAS);
      const capture = captureConsoleWarnings(handle.scene);

      console.warn('harness self-test: scene-scoped warning');
      expect(capture.matching('scene-scoped')).toHaveLength(1);

      handle.scene.scene.stop();
      await waitForCondition(() => !capture.active, {
        timeoutMs: 2_000,
        label: 'warning capture auto-stop on scene shutdown',
      });

      console.warn('harness self-test: after scene shutdown');
      expect(capture.matching('after scene shutdown')).toEqual([]);
    });
  });

  describe('renderer availability', () => {
    it('reports Canvas support in a browser environment', () => {
      expect(detectRendererSupport(Phaser.CANVAS)).toEqual({
        supported: true,
        reason: '',
      });
    });

    it('fails loudly and records a skip reason when the environment cannot provide the renderer', async () => {
      // An unknown render type exercises the same guard as a missing WebGL
      // context without depending on the host's GPU/software rasteriser.
      await expect(bootRendererScene(12345)).rejects.toBeInstanceOf(
        RendererUnavailableError,
      );

      const reasons = getRendererSkipReasons();
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toContain('Unknown renderer type 12345');

      // No game/container leaked from the failed boot.
      expect(
        document.querySelector('[id^="renderer-harness-container-"]'),
      ).toBeNull();
    });
  });
});
