/**
 * Tests for the shared HintBar component.
 *
 * Verifies default position (bottom-centre), dynamic text updates,
 * visibility toggle, configuration overrides, and lifecycle management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal Phaser stub for headless test environments.
// Provides just enough of the Phaser.Scene and GameObjects.Text APIs
// to let HintBar construct and operate without a browser.

class MockScene {
  add = {
    text: vi.fn((x: number, y: number, text: string, style: Record<string, unknown>) => {
      const state: { _visible: boolean; _destroyed: boolean } = {
        _visible: true,
        _destroyed: false,
      };
      const mockText: Record<string, unknown> = {
        x,
        y,
        text,
        style,
        setOrigin: vi.fn().mockReturnThis(),
        setDepth: vi.fn().mockReturnThis(),
        setVisible: vi.fn(function (this: Record<string, unknown>, v: boolean) {
          state._visible = v;
          return this;
        }),
        setText: vi.fn(function (this: Record<string, unknown>, t: string) {
          this.text = t;
          return this;
        }),
        destroy: vi.fn(function () {
          state._destroyed = true;
        }),
        get visible() { return state._visible; },
        set visible(v: boolean) { state._visible = v; },
      };
      return mockText;
    }),
  };
  scale = { width: 1280, height: 720 };
}

// Import the module after stubbing Phaser
import { HintBar, type HintBarOptions } from '../../src/ui/HintBar';

describe('HintBar', () => {
  let scene: MockScene;

  beforeEach(() => {
    scene = new MockScene();
    vi.clearAllMocks();
  });

  describe('construction', () => {
    it('creates a text object at bottom-centre by default', () => {
      const bar = new HintBar(scene as any);
      const txt = bar.textObject as any;
      expect(txt.x).toBe(640); // gameW / 2
      expect(txt.y).toBe(720 - 20); // gameH - 20
      expect(txt.text).toBe('');
    });

    it('uses provided position and text when configured', () => {
      const opts: HintBarOptions = {
        x: 100,
        y: 50,
        initialText: 'Hello hint',
        fontSize: '20px',
        color: '#ff0000',
      };
      const bar = new HintBar(scene as any, opts);
      const txt = bar.textObject as any;
      expect(txt.x).toBe(100);
      expect(txt.y).toBe(50);
      expect(txt.text).toBe('Hello hint');
      expect(txt.style.fontSize).toBe('20px');
      expect(txt.style.color).toBe('#ff0000');
    });

    it('sets origin to (0.5, 1) by default', () => {
      const bar = new HintBar(scene as any);
      expect((bar.textObject as any).setOrigin).toHaveBeenCalledWith(0.5, 1);
    });
  });

  describe('setText', () => {
    it('updates the displayed text', () => {
      const bar = new HintBar(scene as any);
      bar.setText('New hint text');
      expect((bar.textObject as any).text).toBe('New hint text');
    });
  });

  describe('visibility', () => {
    it('starts visible by default', () => {
      const bar = new HintBar(scene as any);
      expect(bar.visible).toBe(true);
    });

    it('can start hidden when configured', () => {
      const bar = new HintBar(scene as any, { startVisible: false });
      expect(bar.visible).toBe(false);
    });

    it('show() makes the text object visible', () => {
      const bar = new HintBar(scene as any, { startVisible: false });
      bar.show();
      expect(bar.visible).toBe(true);
    });

    it('hide() makes the text object invisible', () => {
      const bar = new HintBar(scene as any);
      bar.hide();
      expect(bar.visible).toBe(false);
    });

    it('toggle() flips visibility', () => {
      const bar = new HintBar(scene as any);
      expect(bar.visible).toBe(true);
      bar.toggle();
      expect(bar.visible).toBe(false);
      bar.toggle();
      expect(bar.visible).toBe(true);
    });

    it('setVisible(boolean) controls visibility', () => {
      const bar = new HintBar(scene as any);
      bar.setVisible(false);
      expect(bar.visible).toBe(false);
      bar.setVisible(true);
      expect(bar.visible).toBe(true);
    });
  });

  describe('destroy', () => {
    it('calls destroy on the underlying text object', () => {
      const bar = new HintBar(scene as any);
      const destroySpy = (bar.textObject as any).destroy;
      bar.destroy();
      expect(destroySpy).toHaveBeenCalled();
    });

    it('is safe to call destroy() multiple times', () => {
      const bar = new HintBar(scene as any);
      expect(() => { bar.destroy(); bar.destroy(); }).not.toThrow();
    });
  });
});
