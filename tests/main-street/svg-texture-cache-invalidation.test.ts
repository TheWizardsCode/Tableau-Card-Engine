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
  it('regenerates SVG sources from CSV without removing cached textures', () => {
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
        ],
        exists: vi.fn(() => true),
        remove,
      },
    };

    const manager = new MainStreetSvgTextureManager(scene);
    const count = manager.regenerateSvgSourcesFromCsv();

    // Should have regenerated SVGs for all CSV rows
    expect(count).toBeGreaterThan(0);

    // Should NOT remove textures — SVG source updates are separated from
    // texture lifecycle. Textures created by prewarm use the correct
    // CSV-fresh SVGs because regenerateSvgSourcesFromCsv() runs before
    // any prewarm call.
    expect(remove).not.toHaveBeenCalled();

    // SVG sources should be fresh
    const freshBakery = scene.cardSvgSources.get('biz-bakery');
    expect(freshBakery).toBeDefined();
    expect(freshBakery).not.toBe('<svg>stale bakery</svg>');
    expect(freshBakery).toContain('Bakery');
  });

  it('prewarm skips existing textures without removing them', async () => {
    setDevicePixelRatio(1);

    const remove = vi.fn();
    const exists = vi.fn(() => true); // All keys exist
    const cardSvgSources = new Map<string, string>();
    cardSvgSources.set('biz-bakery', '<svg>some bakery</svg>');

    const scene: any = {
      cardSvgSources,
      textures: {
        getTextureKeys: () => ['ms_card_biz-bakery_100x50@1'],
        exists,
        remove,
      },
      state: {
        market: { cards: [{ id: 'biz-bakery-0' }, ].filter(Boolean) },
        incidentQueue: [],
        streetGrid: [],
        hand: [],
      },
      layout: {
        marketCardW: 100,
        marketCardH: 50,
        slotW: 100,
        slotH: 50,
        handW: 80,
        handH: 40,
        queueCardW: 60,
        queueCardH: 30,
      },
    };

    const manager = new MainStreetSvgTextureManager(scene);
    // Regenerate SVG sources (no texture change)
    manager.regenerateSvgSourcesFromCsv();

    // Prewarm — textures already exist, so they should be skipped
    // (no removal, no rasterisation call that could yield)
    const prewarmPromise = manager.prewarmVisibleCardTextures();

    // Should NOT remove any textures — existing textures are kept
    expect(remove).not.toHaveBeenCalled();

    // SVG source should be fresh from CSV regeneration
    const freshSvg = scene.cardSvgSources.get('biz-bakery');
    expect(freshSvg).toBeDefined();
    expect(freshSvg).toContain('Bakery');

    await prewarmPromise;
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
