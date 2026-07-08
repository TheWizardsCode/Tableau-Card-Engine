import { describe, expect, it, vi } from 'vitest';

import { OverlayManager, OverlayConfig } from '../../src/ui/OverlayManager';

function mockRectangle() {
  return {
    y: 200,
    height: 100,
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
}

function mockScene() {
  return {
    add: {
      rectangle: vi.fn(() => mockRectangle()),
    },
  } as unknown as Phaser.Scene;
}

describe('OverlayManager', () => {
  it('creates and tracks overlay objects', () => {
    const scene = mockScene();
    const manager = new OverlayManager(scene);

    const config: OverlayConfig = {
      type: 'custom',
      backgroundOptions: { depth: 10 },
      box: { width: 100, height: 80 }
    };
    const overlay = manager.showOverlay(config);

    expect(overlay.objects).toHaveLength(2);
    expect(manager.objects).toHaveLength(2);
  });

  it('dismisses existing overlay before creating a new one', () => {
    const scene = mockScene();
    const manager = new OverlayManager(scene);

    const config1: OverlayConfig = {
      type: 'custom',
      backgroundOptions: { depth: 10 },
      box: { width: 100, height: 80 }
    };
    manager.showOverlay(config1);
    const firstObjects = [...manager.objects] as unknown as Array<{ destroy: ReturnType<typeof vi.fn> }>;

    const config2: OverlayConfig = {
      type: 'custom',
      backgroundOptions: { depth: 10 },
      box: { width: 120, height: 90 }
    };
    manager.showOverlay(config2);

    for (const obj of firstObjects) {
      expect(obj.destroy).toHaveBeenCalledTimes(1);
    }
    expect(manager.objects).toHaveLength(2);
  });

  it('dismisses and clears all tracked objects', () => {
    const scene = mockScene();
    const manager = new OverlayManager(scene);

    const config: OverlayConfig = {
      type: 'custom',
      backgroundOptions: { depth: 10 },
      box: { width: 100, height: 80 }
    };
    manager.showOverlay(config);
    const tracked = [...manager.objects] as unknown as Array<{ destroy: ReturnType<typeof vi.fn> }>;

    manager.dismiss();

    expect(manager.objects).toHaveLength(0);
    for (const obj of tracked) {
      expect(obj.destroy).toHaveBeenCalledTimes(1);
    }
  });

  it('uses correct depth for game state overlay types', () => {
    const scene = mockScene();
    const manager = new OverlayManager(scene);

    // Test game-over type uses depth 2000
    const gameOverConfig: OverlayConfig = {
      type: 'game-over',
      backgroundOptions: {}, // No depth specified
      box: { width: 200, height: 100 }
    };
    const gameOverOverlay = manager.showOverlay(gameOverConfig);
    expect(gameOverOverlay.background.setDepth).toHaveBeenCalledWith(2000);

    // Test win/loss type uses depth 2000
    const winLossConfig: OverlayConfig = {
      type: 'win/loss',
      backgroundOptions: {}, // No depth specified
      box: { width: 200, height: 100 }
    };
    const winLossOverlay = manager.showOverlay(winLossConfig);
    expect(winLossOverlay.background.setDepth).toHaveBeenCalledWith(2000);

    // Test round-end type uses depth 2000
    const roundEndConfig: OverlayConfig = {
      type: 'round-end',
      backgroundOptions: {}, // No depth specified
      box: { width: 200, height: 100 }
    };
    const roundEndOverlay = manager.showOverlay(roundEndConfig);
    expect(roundEndOverlay.background.setDepth).toHaveBeenCalledWith(2000);

    // Test custom type uses provided depth
    const customConfig: OverlayConfig = {
      type: 'custom',
      backgroundOptions: { depth: 500 },
      box: { width: 200, height: 100 }
    };
    const customOverlay = manager.showOverlay(customConfig);
    expect(customOverlay.background.setDepth).toHaveBeenCalledWith(500);
  });
});
