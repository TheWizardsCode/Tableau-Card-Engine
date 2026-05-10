import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  markSceneValid,
  markSceneInvalid,
  makeTextureKey,
  rasteriseSvgToTexture,
  getOrCreateTexture,
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

  function createMockScene() {
    const existingKeys = new Set<string>();
    const textures = new Map<string, { setFilter: ReturnType<typeof vi.fn> }>();

    const scene = {
      sys: { game: {} },
      textures: {
        exists: (key: string) => existingKeys.has(key),
        remove: (key: string) => {
          existingKeys.delete(key);
          textures.delete(key);
        },
        addCanvas: (key: string, canvas: MockCanvas) => {
          existingKeys.add(key);
          textures.set(key, { setFilter: vi.fn() });
          addedCanvases.push({ key, canvas });
        },
        get: (key: string) => textures.get(key),
      },
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

  it('rasterises SVG and scales canvas using quality scale (>= 4x)', async () => {
    const scene = createMockScene();
    markSceneValid(scene);

    await rasteriseSvgToTexture(
      scene,
      'test-key',
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"></svg>',
      10,
      20,
      2,
    );

    expect(addedCanvases).toHaveLength(1);
    expect(createdCanvases).toHaveLength(1);
    expect(createdCanvases[0].width).toBe(40);
    expect(createdCanvases[0].height).toBe(80);
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
});
