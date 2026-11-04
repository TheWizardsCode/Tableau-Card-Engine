/**
 * Pins the browser-test renderer contract (CG-0MVTQ3WPV003ZECA).
 *
 * The shipped launcher boots `Phaser.AUTO` (WebGL with a Canvas fallback).
 * The test suite deliberately stays on `Phaser.CANVAS`: headless CI runs
 * WebGL through SwiftShader, which is ~10x slower, so a "unification" that
 * made the tests inherit the launcher default would multiply CI runtime.
 *
 * These tests assert the public API of `TestGamePool` (not the source text),
 * so a later change to `TEST_RENDER_TYPE` or to `withTestRenderer()` fails
 * loudly instead of silently switching the suite to WebGL.
 */

import { describe, expect, it, vi } from 'vitest';

// Phaser cannot be imported in the Node unit environment; the module under
// test only needs the renderer constants at import time.
vi.mock('phaser', () => ({
  default: { AUTO: 0, CANVAS: 1, WEBGL: 2 },
}));

import Phaser from 'phaser';
import {
  TEST_RENDER_TYPE,
  withTestRenderer,
} from '../../src/core-engine/TestGamePool';

describe('TestGamePool renderer contract', () => {
  it('pins browser-test boots to Canvas2D, never AUTO or WebGL', () => {
    expect(TEST_RENDER_TYPE).toBe(Phaser.CANVAS);
    expect(TEST_RENDER_TYPE).not.toBe(Phaser.AUTO);
    expect(TEST_RENDER_TYPE).not.toBe(Phaser.WEBGL);
  });

  it('adds the Canvas2D render type to a game-creation options object', () => {
    const options = withTestRenderer({
      backgroundColor: '#2d572c',
      scenes: [],
    });

    expect(options.type).toBe(Phaser.CANVAS);
    // The caller's own options survive untouched.
    expect(options.backgroundColor).toBe('#2d572c');
    expect(options.scenes).toEqual([]);
  });

  it('overrides an AUTO or WEBGL request so a harness cannot re-enable WebGL', () => {
    expect(withTestRenderer({ type: Phaser.AUTO }).type).toBe(Phaser.CANVAS);
    expect(withTestRenderer({ type: Phaser.WEBGL }).type).toBe(Phaser.CANVAS);
  });
});
