/**
 * GymSvgHelpers -- headless unit tests for the SvgHelpers demo scene
 * and the SvgHelpers API that it demonstrates.
 *
 * These tests validate the core SvgHelpers logic (makeTextureKey) in a
 * headless Node environment. Browser-dependent functions (fetchSvgText,
 * rasteriseSvgToTexture, getOrCreateTexture, scene validity) are covered
 * by the browser smoke test.
 *
 * @module tests/gym/GymSvgHelpers
 */

import { describe, expect, it } from 'vitest';
import {
  makeTextureKey,
} from '../../src/core-engine/SvgHelpers';

// ── makeTextureKey ─────────────────────────────────────────

describe('GymSvgHelpers: makeTextureKey', () => {
  it('generates a deterministic key from templateId, dimensions, and DPR', () => {
    const key = makeTextureKey('tempura', 128, 128, 2, 'gym_');
    expect(key).toBe('gym_tempura_128x128@2');
  });

  it('rounds width and height to avoid sub-pixel fragmentation', () => {
    const key = makeTextureKey('test', 100.7, 200.3, 1, 'gym_');
    expect(key).toBe('gym_test_101x200@1');
  });

  it('uses the default prefix when none is provided', () => {
    const key = makeTextureKey('tempura', 64, 64, 1);
    expect(key).toBe('ms_card_tempura_64x64@1');
  });

  it('handles a DPR of 1 correctly', () => {
    const key = makeTextureKey('icon', 32, 32, 1, 'gym_');
    expect(key).toBe('gym_icon_32x32@1');
  });

  it('handles fractional DPR values', () => {
    const key = makeTextureKey('icon', 64, 64, 1.5, 'gym_');
    expect(key).toBe('gym_icon_64x64@1.5');
  });

  it('produces a different key when DPR changes', () => {
    const key1 = makeTextureKey('test', 100, 100, 1, 'gym_');
    const key2 = makeTextureKey('test', 100, 100, 2, 'gym_');
    expect(key1).not.toBe(key2);
    expect(key1).toBe('gym_test_100x100@1');
    expect(key2).toBe('gym_test_100x100@2');
  });

  it('produces a different key when dimensions change', () => {
    const key1 = makeTextureKey('test', 64, 64, 1, 'gym_');
    const key2 = makeTextureKey('test', 128, 128, 1, 'gym_');
    expect(key1).not.toBe(key2);
  });
});
