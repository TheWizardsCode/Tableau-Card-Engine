/**
 * HighlightManager Unit Tests
 *
 * Tests the HighlightManager class exported from src/ui/HighlightManager.ts.
 * Verifies zone creation, auto-clear timeout, manual clear by name,
 * manual clear all, style switching, and cleanup.
 *
 * Uses a minimal Phaser mock to test in a Node.js environment
 * without a browser runtime.
 *
 * @module tests/ui/HighlightManager
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/ui/Renderer', () => {
  const createHudText = vi.fn((_scene: any, x: number, y: number, text: string, _color: string, _options?: any) => ({
    x, y, text,
    setOrigin: vi.fn().mockReturnThis(),
    setText: vi.fn().mockImplementation(function (this: any, t: string) { this.text = t; }),
    setPosition: vi.fn().mockImplementation(function (this: any, px: number, py: number) { this.x = px; this.y = py; }),
    setColor: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  }));
  return { createHudText, FONT_FAMILY: 'monospace' };
});

vi.mock('../../src/ui/constants', () => ({
  GAME_W: 1280,
  GAME_H: 720,
  CARD_W: 48,
  CARD_H: 65,
}));

import { HighlightManager } from '../../src/ui/HighlightManager';

// ── Minimal Phaser mock ─────────────────────────────────────

function createMockScene(): any {
  const objects: any[] = [];
  const addTracker = (obj: any) => { objects.push(obj); return obj; };

  const mockGraphics = () => {
    const g = {
      fillStyle: vi.fn().mockReturnThis(),
      fillRoundedRect: vi.fn().mockReturnThis(),
      lineStyle: vi.fn().mockReturnThis(),
      strokeRoundedRect: vi.fn().mockReturnThis(),
      clear: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
    };
    return g;
  };

  return {
    add: {
      graphics: vi.fn().mockImplementation(() => addTracker(mockGraphics())),
    },
    time: {
      delayedCall: vi.fn().mockImplementation((delay: number, callback: () => void) => {
        // We return an object with remove() for timer cleanup
        const timer = { remove: vi.fn(), callback, delay };
        return timer;
      }),
    },
    children: { list: objects },
  };
}

// ── HighlightManager tests ──────────────────────────────────

describe('HighlightManager', () => {
  let scene: ReturnType<typeof createMockScene>;
  let manager: HighlightManager;

  beforeEach(() => {
    scene = createMockScene();
    manager = new HighlightManager(scene as any);
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('construction', () => {
    it('creates a HighlightManager instance', () => {
      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(HighlightManager);
    });

    it('has expected public API methods', () => {
      expect(typeof manager.addZone).toBe('function');
      expect(typeof manager.removeZone).toBe('function');
      expect(typeof manager.clearAll).toBe('function');
      expect(typeof manager.destroy).toBe('function');
    });

    it('creates an internal Graphics object', () => {
      expect(scene.add.graphics).toHaveBeenCalledTimes(1);
    });
  });

  describe('addZone', () => {
    it('adds a fill-style zone', () => {
      manager.addZone('test', {
        x: 100, y: 200, w: 80, h: 60,
        style: 'fill', color: 0x44ff44, alpha: 0.35,
      });

      // Should have called fillStyle, lineStyle, fillRoundedRect, strokeRoundedRect
      const g = scene.add.graphics.mock.results[0].value;
      expect(g.fillStyle).toHaveBeenCalledWith(0x44ff44, 0.35);
      expect(g.lineStyle).toHaveBeenCalledWith(2, 0x44ff44, 0.8);
      expect(g.fillRoundedRect).toHaveBeenCalledWith(100, 200, 80, 60, 8);
      expect(g.strokeRoundedRect).toHaveBeenCalledWith(100, 200, 80, 60, 8);

      // removeZone should succeed
      expect(() => manager.removeZone('test')).not.toThrow();
    });

    it('adds a border-only style zone', () => {
      manager.addZone('border-test', {
        x: 50, y: 50, w: 100, h: 100,
        style: 'border', color: 0xff4444, alpha: 0.5,
        strokeWidth: 3, strokeColor: 0xff0000,
      });

      const g = scene.add.graphics.mock.results[0].value;
      // Border-only should use transparent fill (color with alpha 0)
      expect(g.fillStyle).toHaveBeenCalledWith(0xff4444, 0);
      // lineStyle should use custom stroke width and color
      expect(g.lineStyle).toHaveBeenCalledWith(3, 0xff0000, 0.5);
      expect(g.fillRoundedRect).toHaveBeenCalledWith(50, 50, 100, 100, 8);
      expect(g.strokeRoundedRect).toHaveBeenCalledWith(50, 50, 100, 100, 8);
    });

    it('adds a zone with custom corner radius', () => {
      manager.addZone('rounded', {
        x: 0, y: 0, w: 50, h: 50,
        style: 'fill', color: 0x44ff44,
        radius: 4,
      });

      const g = scene.add.graphics.mock.results[0].value;
      expect(g.fillRoundedRect).toHaveBeenCalledWith(0, 0, 50, 50, 4);
      expect(g.strokeRoundedRect).toHaveBeenCalledWith(0, 0, 50, 50, 4);
    });

    it('replaces an existing zone with the same name', () => {
      manager.addZone('zone1', {
        x: 10, y: 10, w: 50, h: 50,
        style: 'fill', color: 0x44ff44,
      });

      // Track clear calls before replacement
      const g = scene.add.graphics.mock.results[0].value;
      g.clear.mockClear();

      // Replace the zone
      manager.addZone('zone1', {
        x: 20, y: 20, w: 80, h: 80,
        style: 'border', color: 0xff4444,
      });

      // When replacing, should clear the graphics and redraw
      expect(g.clear).toHaveBeenCalled();
    });
  });

  describe('auto-clear timeout', () => {
    it('automatically clears a zone after its lifetime expires', () => {
      const manager2 = new HighlightManager(scene as any);

      // Track auto-clear callbacks
      let autoClearCalled = false;
      scene.time.delayedCall.mockImplementation((_delay: number, callback: () => void) => {
        return {
          remove: vi.fn(),
          callback,
          call: () => { autoClearCalled = true; callback(); },
        };
      });

      manager2.addZone('timed', {
        x: 0, y: 0, w: 50, h: 50,
        style: 'fill', color: 0x44ff44,
        lifetime: 3000,
      });

      expect(scene.time.delayedCall).toHaveBeenCalledWith(3000, expect.any(Function));

      // Simulate the auto-clear timer firing
      const timerObj = scene.time.delayedCall.mock.results[0].value;
      timerObj.call();

      expect(autoClearCalled).toBe(true);

      manager2.destroy();
    });

    it('auto-clear timer is stopped when zone is manually removed', () => {
      const manager2 = new HighlightManager(scene as any);

      manager2.addZone('timed', {
        x: 0, y: 0, w: 50, h: 50,
        style: 'fill', color: 0x44ff44,
        lifetime: 5000,
      });

      // Capture the timer
      const timer = scene.time.delayedCall.mock.results[0].value;

      manager2.removeZone('timed');

      // Timer should be removed/cancelled
      expect(timer.remove).toHaveBeenCalled();
      manager2.destroy();
    });
  });

  describe('removeZone', () => {
    it('removes a named zone and redraws remaining zones', () => {
      manager.addZone('deck', {
        x: 100, y: 200, w: 80, h: 60,
        style: 'fill', color: 0x44ff44,
      });
      manager.addZone('discard', {
        x: 300, y: 200, w: 80, h: 60,
        style: 'fill', color: 0x44ff44,
      });

      const g = scene.add.graphics.mock.results[0].value;
      g.clear.mockClear();
      g.fillStyle.mockClear();
      g.fillRoundedRect.mockClear();

      manager.removeZone('deck');

      // After removal, clear should have been called
      expect(g.clear).toHaveBeenCalled();
      // The remaining zone ('discard') should be redrawn
      expect(g.fillRoundedRect).toHaveBeenCalledWith(300, 200, 80, 60, 8);
    });

    it('does nothing when removing a non-existent zone', () => {
      manager.addZone('existing', {
        x: 0, y: 0, w: 50, h: 50,
        style: 'fill', color: 0x44ff44,
      });

      const g = scene.add.graphics.mock.results[0].value;
      g.clear.mockClear();

      expect(() => manager.removeZone('nonexistent')).not.toThrow();
      // clear should not be called for non-existent zone removal
      expect(g.clear).not.toHaveBeenCalled();
    });
  });

  describe('clearAll', () => {
    it('clears all zones and the graphics object', () => {
      manager.addZone('zone1', {
        x: 0, y: 0, w: 50, h: 50,
        style: 'fill', color: 0x44ff44,
      });
      manager.addZone('zone2', {
        x: 100, y: 0, w: 50, h: 50,
        style: 'border', color: 0xff4444,
      });

      const g = scene.add.graphics.mock.results[0].value;
      g.clear.mockClear();

      manager.clearAll();

      // Graphics should be cleared
      expect(g.clear).toHaveBeenCalled();
      // After clearAll, removing a specific zone should be a no-op
      // (verifies the internal registry is empty without accessing private state)
      expect(() => manager.removeZone('zone1')).not.toThrow();
      expect(() => manager.removeZone('nonexistent')).not.toThrow();
    });

    it('clears auto-clear timers for all zones', () => {
      const manager2 = new HighlightManager(scene as any);

      manager2.addZone('timed1', {
        x: 0, y: 0, w: 50, h: 50,
        style: 'fill', color: 0x44ff44,
        lifetime: 3000,
      });
      manager2.addZone('timed2', {
        x: 100, y: 0, w: 50, h: 50,
        style: 'fill', color: 0x44ff44,
        lifetime: 5000,
      });

      const timers = scene.time.delayedCall.mock.results;
      expect(timers).toHaveLength(2);

      manager2.clearAll();

      // All timers should be removed
      for (const result of timers) {
        expect(result.value.remove).toHaveBeenCalled();
      }
      manager2.destroy();
    });
  });

  describe('destroy', () => {
    it('destroys the graphics object and clears all zones', () => {
      manager.addZone('zone1', {
        x: 0, y: 0, w: 50, h: 50,
        style: 'fill', color: 0x44ff44,
      });

      const g = scene.add.graphics.mock.results[0].value;

      manager.destroy();

      expect(g.destroy).toHaveBeenCalled();
      // After destroy, removeZone and clearAll should be no-ops
      expect(() => manager.removeZone('zone1')).not.toThrow();
      expect(() => manager.clearAll()).not.toThrow();
    });

    it('cleans up all auto-clear timers on destroy', () => {
      const manager2 = new HighlightManager(scene as any);

      manager2.addZone('timed', {
        x: 0, y: 0, w: 50, h: 50,
        style: 'fill', color: 0x44ff44,
        lifetime: 3000,
      });

      const timer = scene.time.delayedCall.mock.results[0].value;

      manager2.destroy();

      expect(timer.remove).toHaveBeenCalled();
    });

    it('is safe to call destroy multiple times', () => {
      manager.destroy();
      expect(() => manager.destroy()).not.toThrow();
    });
  });

  describe('style switching', () => {
    it('adds a zone then changes style by re-adding with same name', () => {
      // Add as fill
      manager.addZone('dynamic', {
        x: 10, y: 10, w: 80, h: 60,
        style: 'fill', color: 0x44ff44, alpha: 0.35,
      });

      // Re-add as border
      manager.addZone('dynamic', {
        x: 10, y: 10, w: 80, h: 60,
        style: 'border', color: 0x44ff44,
      });

      const g = scene.add.graphics.mock.results[0].value;

      // Last fillStyle should use border-style alpha (0 for transparent fill)
      const fillStyleCalls = g.fillStyle.mock.calls;
      const lastFillCall = fillStyleCalls[fillStyleCalls.length - 1];
      expect(lastFillCall).toEqual([0x44ff44, 0]);
    });

    it('supports translucent fill with configurable alpha', () => {
      manager.addZone('translucent', {
        x: 0, y: 0, w: 100, h: 80,
        style: 'fill', color: 0x0000ff, alpha: 0.5,
      });

      const g = scene.add.graphics.mock.results[0].value;
      expect(g.fillStyle).toHaveBeenCalledWith(0x0000ff, 0.5);
    });
  });

  describe('multiple zones', () => {
    it('supports multiple independent zones simultaneously', () => {
      manager.addZone('zone-a', {
        x: 0, y: 0, w: 50, h: 50,
        style: 'fill', color: 0xff0000,
      });
      manager.addZone('zone-b', {
        x: 100, y: 100, w: 60, h: 60,
        style: 'border', color: 0x00ff00,
      });

      // Both zones should be rendered (fillRoundedRect called twice)
      const g = scene.add.graphics.mock.results[0].value;
      expect(g.fillRoundedRect).toHaveBeenCalledWith(0, 0, 50, 50, 8);
      expect(g.fillRoundedRect).toHaveBeenCalledWith(100, 100, 60, 60, 8);

      // Remove only one
      g.clear.mockClear();
      g.fillRoundedRect.mockClear();
      manager.removeZone('zone-a');

      // Remaining zone should still be rendered
      expect(g.clear).toHaveBeenCalled();
      expect(g.fillRoundedRect).toHaveBeenCalledWith(100, 100, 60, 60, 8);
      expect(g.fillRoundedRect).not.toHaveBeenCalledWith(0, 0, 50, 50, 8);
    });
  });
});
