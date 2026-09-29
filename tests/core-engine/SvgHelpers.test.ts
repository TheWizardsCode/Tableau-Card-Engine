import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  markSceneValid,
  markSceneInvalid,
  makeTextureKey,
  rasteriseSvgToTexture,
  getOrCreateTexture,
  MIN_QUALITY_SCALE,
  SVG_TEXTURE_FILTER_MODE,
} from '../../src/core-engine/SvgHelpers';

type MockCanvas = {
  width: number;
  height: number;
  getContext: (kind: string) => {
    clearRect: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
    imageSmoothingEnabled: boolean;
    imageSmoothingQuality: 'high' | 'low' | 'medium';
  } | null;
};

describe('SvgHelpers', () => {
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;
  const originalImage = (globalThis as any).Image;

  let addedCanvases: Array<{ key: string; canvas: MockCanvas }>;
  let createdCanvases: MockCanvas[];

  function createMockScene(preExistingKeys: string[] = []) {
    const existingKeys = new Set<string>(preExistingKeys);
    const textures = new Map<string, { setFilter: ReturnType<typeof vi.fn> }>();
    for (const key of preExistingKeys) {
      textures.set(key, { setFilter: vi.fn() });
    }

    const removeSpy = vi.fn((key: string) => {
      existingKeys.delete(key);
      textures.delete(key);
    });

    const scene = {
      sys: { game: {} },
      textures: {
        exists: (key: string) => existingKeys.has(key),
        remove: removeSpy,
        addCanvas: (key: string, canvas: MockCanvas) => {
          existingKeys.add(key);
          textures.set(key, { setFilter: vi.fn() });
          addedCanvases.push({ key, canvas });
        },
        get: (key: string) => textures.get(key),
      },
      __removeSpy: removeSpy,
    };

    return scene as any;
  }

  beforeEach(() => {
    addedCanvases = [];
    createdCanvases = [];

    (globalThis as any).window = { devicePixelRatio: 2 };
    (globalThis as any).document = {
      createElement: (tag: string) => {
        if (tag !== 'canvas') {
          throw new Error(`Unexpected tag: ${tag}`);
        }

        const context = {
          clearRect: vi.fn(),
          drawImage: vi.fn(),
          imageSmoothingEnabled: false,
          imageSmoothingQuality: 'low' as const,
        };

        const canvas: MockCanvas = {
          width: 0,
          height: 0,
          getContext: (kind: string) => (kind === '2d' ? context : null),
        };

        createdCanvases.push(canvas);
        return canvas;
      },
    };

    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;

      set src(_value: string) {
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    }

    (globalThis as any).Image = MockImage;
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
    (globalThis as any).Image = originalImage;
    vi.restoreAllMocks();
  });

  it('builds deterministic texture keys with rounded dimensions', () => {
    expect(makeTextureKey('tempura', 120.2, 80.7, 2)).toBe('ms_card_tempura_120x81@2');
  });

  it('supports custom prefix for game-agnostic texture keys', () => {
    expect(makeTextureKey('sashimi', 64, 64, 1, 'sg_')).toBe('sg_sashimi_64x64@1');
    expect(makeTextureKey('expedition', 48, 65, 2, 'lc_')).toBe('lc_expedition_48x65@2');
    expect(makeTextureKey('mind', 48, 65, 2)).toBe('ms_card_mind_48x65@2');
  });

  it('uses MIN_QUALITY_SCALE constant', () => {
    expect(MIN_QUALITY_SCALE).toBe(2);
  });

  it('rasterises SVG at the correct resolution for each DPR', async () => {
    // DPR 1: qualityScale = Math.max(2, 1) = 2 => 10x20 -> 20x40
    const sceneDpr1 = createMockScene();
    markSceneValid(sceneDpr1);

    await rasteriseSvgToTexture(
      sceneDpr1,
      'dpr1-key',
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"></svg>',
      10,
      20,
      1,
    );

    expect(createdCanvases.some((c) => c.width === 20 && c.height === 40)).toBe(true);

    // DPR 2: qualityScale = Math.max(2, 2) = 2 => 10x20 -> 20x40
    const sceneDpr2 = createMockScene();
    markSceneValid(sceneDpr2);

    await rasteriseSvgToTexture(
      sceneDpr2,
      'dpr2-key',
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"></svg>',
      10,
      20,
      2,
    );

    expect(createdCanvases.some((c) => c.width === 20 && c.height === 40)).toBe(true);

    // DPR 3: qualityScale = Math.max(2, 3) = 3 => 10x20 -> 30x60
    const sceneDpr3 = createMockScene();
    markSceneValid(sceneDpr3);

    await rasteriseSvgToTexture(
      sceneDpr3,
      'dpr3-key',
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"></svg>',
      10,
      20,
      3,
    );

    expect(createdCanvases.some((c) => c.width === 30 && c.height === 60)).toBe(true);
  });

  it('rasterises SVG at the correct resolution for a card-sized canvas', async () => {
    // Card dimensions: 140x80 logical
    // DPR 1: qualityScale=2 => 280x160
    const sceneDpr1 = createMockScene();
    markSceneValid(sceneDpr1);

    await rasteriseSvgToTexture(
      sceneDpr1,
      'card-dpr1',
      '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="80"></svg>',
      140,
      80,
      1,
    );

    expect(createdCanvases.some((c) => c.width === 280 && c.height === 160)).toBe(true);

    // DPR 3: qualityScale=3 => 420x240
    const sceneDpr3 = createMockScene();
    markSceneValid(sceneDpr3);

    await rasteriseSvgToTexture(
      sceneDpr3,
      'card-dpr3',
      '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="80"></svg>',
      140,
      80,
      3,
    );

    expect(createdCanvases.some((c) => c.width === 420 && c.height === 240)).toBe(true);
  });

  it('requests linear filtering for rasterised SVG textures', async () => {
    const scene = createMockScene();
    markSceneValid(scene);

    await rasteriseSvgToTexture(
      scene,
      'filter-key',
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
      10,
      10,
      2,
    );

    // Phaser Textures.FilterMode.LINEAR === 0; NEAREST === 1. Rasterised SVG
    // art must not use nearest-neighbour minification (it looks pixelated).
    expect(SVG_TEXTURE_FILTER_MODE).toBe(0);
    const texture = scene.textures.get('filter-key');
    expect(texture.setFilter).toHaveBeenCalledWith(SVG_TEXTURE_FILTER_MODE);
    expect(texture.setFilter).not.toHaveBeenCalledWith(1);
  });

  it('does not rasterise when scene is marked invalid', async () => {
    const scene = createMockScene();
    markSceneValid(scene);
    markSceneInvalid(scene);

    await rasteriseSvgToTexture(
      scene,
      'invalid-key',
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
      10,
      10,
      2,
    );

    expect(addedCanvases).toHaveLength(0);
  });

  it('returns cached in-flight promise from getOrCreateTexture and generates once', async () => {
    const scene = createMockScene();
    markSceneValid(scene);

    const first = getOrCreateTexture(
      scene,
      'dumpling',
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"></svg>',
      16,
      16,
    );

    const second = getOrCreateTexture(
      scene,
      'dumpling',
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"></svg>',
      16,
      16,
    );

    expect(first.ready).toBe(false);
    expect(second.ready).toBe(false);
    expect(first.promise).toBeDefined();
    expect(second.promise).toBeDefined();

    await Promise.all([first.promise, second.promise]);

    expect(addedCanvases).toHaveLength(1);
  });

  it('does not remove an existing texture key during rasterisation', async () => {
    const scene = createMockScene(['existing-key']);
    markSceneValid(scene);

    await rasteriseSvgToTexture(
      scene,
      'existing-key',
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
      10,
      10,
      2,
    );

    expect(scene.__removeSpy).not.toHaveBeenCalled();
    // Existing texture should be reused as-is.
    expect(addedCanvases).toHaveLength(0);
  });
});
