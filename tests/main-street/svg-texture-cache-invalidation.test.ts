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

