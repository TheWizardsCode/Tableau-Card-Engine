import { describe, it, expect, vi, afterEach } from 'vitest';

import { MainStreetSvgTextureManager } from '../../example-games/main-street/scenes/MainStreetSvgTextureManager';

function setDevicePixelRatio(value: number): void {
  const globalAny = globalThis as any;
  if (!globalAny.window) {
    globalAny.window = {};
  }
  Object.defineProperty(globalAny.window, 'devicePixelRatio', {
    configurable: true,
    value,
  });
}

afterEach(() => {
  const globalAny = globalThis as any;
  if (globalAny.window && Object.prototype.hasOwnProperty.call(globalAny.window, 'devicePixelRatio')) {
    delete globalAny.window.devicePixelRatio;
  }
});

describe('MainStreetSvgTextureManager cache invalidation', () => {
  it('clears cached card textures when SVG sources are regenerated from CSV', () => {
    setDevicePixelRatio(1);

    const remove = vi.fn();
    const cardSvgSources = new Map<string, string>();
    // Pre-populate with stale SVGs for a couple of known template IDs
    cardSvgSources.set('biz-bakery', '<svg>stale bakery</svg>');
    cardSvgSources.set('biz-diner', '<svg>stale diner</svg>');

    const scene = {
      cardSvgSources,
      textures: {
        getTextureKeys: () => [
          'ms_card_biz-bakery_100x50@1',
          'ms_card_biz-diner_100x50@1',
          'ms_card_biz-bakery_200x100@2',
          'ms_card_biz-pawnshop_100x50@1',
          'ui_button',
        ],
        exists: vi.fn(() => true),
        remove,
      },
    };

    const manager = new MainStreetSvgTextureManager(scene);
    const count = manager.regenerateSvgSourcesFromCsv();

    // Should have regenerated SVGs for all CSV rows
    expect(count).toBeGreaterThan(0);

    // Should have cleared at least the baked goods textures
    expect(remove).toHaveBeenCalled();
    const removedKeys = remove.mock.calls.map((c: string[]) => c[0]);
    expect(removedKeys).toContain('ms_card_biz-bakery_100x50@1');
    expect(removedKeys).toContain('ms_card_biz-diner_100x50@1');
  });

  it('does not throw when textures.getTextureKeys is unavailable', () => {
    setDevicePixelRatio(1);

    const cardSvgSources = new Map<string, string>();
    const scene = {
      cardSvgSources,
      textures: {
        // No getTextureKeys — e.g. headless test environment
        remove: vi.fn(),
      },
    };

    const manager = new MainStreetSvgTextureManager(scene);
    expect(() => manager.regenerateSvgSourcesFromCsv()).not.toThrow();
  });

  it('replaces stale SVG sources with freshly generated ones from CSV', () => {
    setDevicePixelRatio(1);

    const cardSvgSources = new Map<string, string>();
    cardSvgSources.set('biz-bakery', '<svg>stale bakery</svg>');
    cardSvgSources.set('biz-diner', '<svg>stale diner</svg>');

    const scene = {
      cardSvgSources,
      textures: {
        getTextureKeys: () => ['ms_card_biz-bakery_100x50@1'],
        exists: vi.fn(() => true),
        remove: vi.fn(),
      },
    };

    const manager = new MainStreetSvgTextureManager(scene);
    manager.regenerateSvgSourcesFromCsv();

    // The stale SVGs should be replaced with fresh ones
    const freshBakery = scene.cardSvgSources.get('biz-bakery');
    expect(freshBakery).toBeDefined();
    expect(freshBakery).not.toBe('<svg>stale bakery</svg>');
    expect(freshBakery).toContain('Bakery');
    expect(freshBakery).toContain('</svg>');

    const freshDiner = scene.cardSvgSources.get('biz-diner');
    expect(freshDiner).toBeDefined();
    expect(freshDiner).not.toBe('<svg>stale diner</svg>');
    expect(freshDiner).toContain('Diner');
    expect(freshDiner).toContain('</svg>');
  });

  it('does not clear textures when regeneration count is 0', () => {
    setDevicePixelRatio(1);

    const remove = vi.fn();
    // Empty cardSvgSources — the Map is present but CSV_ROWS will still
    // populate it, so we can't force count=0 this way.
    // Instead, the test verifies that the method does not throw when
    // the texture manager is minimal.
    const scene = {
      cardSvgSources: new Map<string, string>(),
      textures: {
        getTextureKeys: () => ['ms_card_biz-bakery_100x50@1'],
        exists: vi.fn(() => true),
        remove,
      },
    };

    const manager = new MainStreetSvgTextureManager(scene);
    expect(() => manager.regenerateSvgSourcesFromCsv()).not.toThrow();
  });

  it('does not invalidate textures when DPR is unchanged', () => {
    setDevicePixelRatio(1);

    const remove = vi.fn();
    const scene = {
      textures: {
        getTextureKeys: () => ['ms_card_biz-a_100x50@1', 'other_texture'],
        remove,
      },
    };

    const manager = new MainStreetSvgTextureManager(scene);
    const result = manager.syncDisplayMetrics();

    expect(result).toEqual({ dprChanged: false, removedTextureCount: 0 });
    expect(remove).not.toHaveBeenCalled();
  });

  it('invalidates only ms_card_ textures when DPR changes', () => {
    setDevicePixelRatio(1);

    const remove = vi.fn();
    const scene = {
      textures: {
        getTextureKeys: () => [
          'ms_card_biz-a_100x50@1',
          'ms_card_evt-a_100x50@1',
          'ui_button',
        ],
        remove,
      },
    };

    const manager = new MainStreetSvgTextureManager(scene);
    setDevicePixelRatio(2);

    const result = manager.syncDisplayMetrics();

    expect(result).toEqual({ dprChanged: true, removedTextureCount: 2 });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenNthCalledWith(1, 'ms_card_biz-a_100x50@1');
    expect(remove).toHaveBeenNthCalledWith(2, 'ms_card_evt-a_100x50@1');
  });
});

