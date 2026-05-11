import { describe, expect, it, vi } from 'vitest';

import { OverlayManager } from '../../src/ui/OverlayManager';

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

    const overlay = manager.create({ depth: 10 }, { width: 100, height: 80 });

    expect(overlay.objects).toHaveLength(2);
    expect(manager.objects).toHaveLength(2);
  });

  it('dismisses existing overlay before creating a new one', () => {
    const scene = mockScene();
    const manager = new OverlayManager(scene);

    manager.create({ depth: 10 }, { width: 100, height: 80 });
    const firstObjects = [...manager.objects] as unknown as Array<{ destroy: ReturnType<typeof vi.fn> }>;

    manager.create({ depth: 10 }, { width: 120, height: 90 });

    for (const obj of firstObjects) {
      expect(obj.destroy).toHaveBeenCalledTimes(1);
    }
    expect(manager.objects).toHaveLength(2);
  });

  it('dismisses and clears all tracked objects', () => {
    const scene = mockScene();
    const manager = new OverlayManager(scene);

    manager.create({ depth: 10 }, { width: 100, height: 80 });
    const tracked = [...manager.objects] as unknown as Array<{ destroy: ReturnType<typeof vi.fn> }>;

    manager.dismiss();

    expect(manager.objects).toHaveLength(0);
    for (const obj of tracked) {
      expect(obj.destroy).toHaveBeenCalledTimes(1);
    }
  });
});
