/**
 * Headless integration smoke test for The Mind card texture pipeline.
 *
 * Verifies that the full preload → ensure → key resolution pipeline works
 * in a Node (headless) environment without a browser. This confirms that:
 * 1. preloadMindCardAssets populates the SVG text cache
 * 2. ensureMindCardTexture returns a valid DPR-aware key
 * 3. The adapter correctly resolves template IDs and texture keys
 * 4. No missing-texture errors or unhandled rejections occur
 */

import { describe, it, expect } from 'vitest';

describe('The Mind headless integration', () => {
  it('full preload → ensure pipeline produces valid texture keys for card face and back', async () => {
    const { preloadMindCardAssets, ensureMindCardTexture, ensureMindCardBackTexture } = await import('../../example-games/the-mind/MindCardRenderer');
    const { resolveTemplateId, resolveBackTemplateId, getCanonicalTextureKey, ensureTexture, ensureBackTexture } = await import('../../example-games/the-mind/MindCardTextureAdapter');
    const { makeTextureKey } = await import('../../src/core-engine/SvgHelpers');

    // Create a minimal mock scene compatible with SvgHelpers
    const existingKeys = new Set<string>();
    const scene = {
      sys: { game: {} },
      cache: { text: { get: () => undefined } },
      textures: {
        exists: (key: string) => existingKeys.has(key),
        addCanvas: (_key: string, _canvas: any) => {
          existingKeys.add(_key);
        },
        get: () => undefined,
      },
    } as any;

    // Step 1: Preload (Node path populates svgTextCache)
    preloadMindCardAssets(scene, 48, 65);

    // Step 2: Ensure a face texture for a known card value
    const faceResult = await ensureMindCardTexture(scene, 42, 48, 65);
    expect(faceResult).toHaveProperty('key');
    expect(faceResult.key).toBe(makeTextureKey('mind-42', 48, 65, 1));
    expect(faceResult.ready).toBe(false); // Node: no rasterisation possible

    // Step 3: Ensure the card-back texture
    const backResult = await ensureMindCardBackTexture(scene, 48, 65);
    expect(backResult).toHaveProperty('key');
    expect(backResult.key).toBe(makeTextureKey('mind-back', 48, 65, 1));
    expect(backResult.ready).toBe(false);

    // Step 4: Verify adapter produces matching keys
    const adapterFaceKey = getCanonicalTextureKey(resolveTemplateId(42), 48, 65, 1);
    expect(adapterFaceKey).toBe(faceResult.key);

    const adapterBackKey = getCanonicalTextureKey(resolveBackTemplateId(), 48, 65, 1);
    expect(adapterBackKey).toBe(backResult.key);

    // Step 5: Adapter wrappers should produce same results
    const adapterEnsureFace = await ensureTexture(scene, 42, 48, 65);
    expect(adapterEnsureFace.key).toBe(faceResult.key);
    expect(adapterEnsureFace.ready).toBe(faceResult.ready);

    const adapterEnsureBack = await ensureBackTexture(scene, 48, 65);
    expect(adapterEnsureBack.key).toBe(backResult.key);
    expect(adapterEnsureBack.ready).toBe(backResult.ready);
  });

  it('multiple ensureMindCardTexture calls return consistent keys', async () => {
    const { preloadMindCardAssets, ensureMindCardTexture } = await import('../../example-games/the-mind/MindCardRenderer');

    const scene = {
      sys: { game: {} },
      cache: { text: { get: () => undefined } },
      textures: { exists: () => false, addCanvas: () => undefined, get: () => undefined },
    } as any;

    preloadMindCardAssets(scene, 48, 65);

    // Call ensure for the same card twice - should return the same key
    const result1 = await ensureMindCardTexture(scene, 7, 48, 65);
    const result2 = await ensureMindCardTexture(scene, 7, 48, 65);

    expect(result1.key).toBe(result2.key);
    expect(result1.key).toMatch(/^ms_card_mind-7_/);
  });

  it('boundary values (1 and 100) produce valid texture keys', async () => {
    const { preloadMindCardAssets, ensureMindCardTexture } = await import('../../example-games/the-mind/MindCardRenderer');

    const scene = {
      sys: { game: {} },
      cache: { text: { get: () => undefined } },
      textures: { exists: () => false, addCanvas: () => undefined, get: () => undefined },
    } as any;

    preloadMindCardAssets(scene, 48, 65);

    const minResult = await ensureMindCardTexture(scene, 1, 48, 65);
    const maxResult = await ensureMindCardTexture(scene, 100, 48, 65);

    expect(minResult.key).toMatch(/^ms_card_mind-1_/);
    expect(maxResult.key).toMatch(/^ms_card_mind-100_/);
    expect(minResult.ready).toBe(false);
    expect(maxResult.ready).toBe(false);
  });

  it('custom dimensions produce different texture keys than defaults', async () => {
    const { preloadMindCardAssets, ensureMindCardTexture } = await import('../../example-games/the-mind/MindCardRenderer');

    const scene = {
      sys: { game: {} },
      cache: { text: { get: () => undefined } },
      textures: { exists: () => false, addCanvas: () => undefined, get: () => undefined },
    } as any;

    preloadMindCardAssets(scene, 48, 65);

    const defaultResult = await ensureMindCardTexture(scene, 42, 48, 65);
    const customResult = await ensureMindCardTexture(scene, 42, 120, 164);

    // Different dimensions should produce different keys
    expect(defaultResult.key).not.toBe(customResult.key);
    expect(defaultResult.key).toContain('48x65');
    expect(customResult.key).toContain('120x164');
  });
});