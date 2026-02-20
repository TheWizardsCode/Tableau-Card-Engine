/**
 * Unit tests for the shared overlay system:
 *   - createOverlayBackground  (Overlay.ts)
 *   - dismissOverlay           (Overlay.ts)
 *   - createOverlayButton      (OverlayButton.ts)
 *   - createOverlayMenuButton  (MenuButton.ts)
 *
 * All Phaser scene interactions are mocked to run in Node.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOverlayBackground, dismissOverlay } from '../../src/ui/Overlay';
import {
  createOverlayButton,
  OVERLAY_BUTTON_COLOR,
  OVERLAY_BUTTON_HOVER_COLOR,
  OVERLAY_BUTTON_FONT_SIZE,
} from '../../src/ui/OverlayButton';
import { createOverlayMenuButton } from '../../src/ui/MenuButton';
import { FONT_FAMILY, GAME_W, GAME_H } from '../../src/ui/constants';

// ── Mock helpers ────────────────────────────────────────────

/** Create a mock Phaser.GameObjects.Rectangle returned by scene.add.rectangle(). */
function mockRectangle() {
  return {
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    _type: 'rectangle',
  };
}

/** Create a mock Phaser.GameObjects.Text returned by scene.add.text(). */
function mockText() {
  const handlers: Record<string, Function> = {};
  const text = {
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    on: vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
      return text;
    }),
    destroy: vi.fn(),
    _handlers: handlers,
    _type: 'text',
  };
  return text;
}

/** Create a minimal mock Phaser.Scene. */
function mockScene() {
  return {
    add: {
      rectangle: vi.fn(() => mockRectangle()),
      text: vi.fn(() => mockText()),
    },
    scene: {
      start: vi.fn(),
    },
  } as unknown as Phaser.Scene;
}

// ── createOverlayBackground ─────────────────────────────────

describe('createOverlayBackground', () => {
  let scene: ReturnType<typeof mockScene>;

  beforeEach(() => {
    scene = mockScene();
  });

  it('creates a full-screen background with default settings', () => {
    const result = createOverlayBackground(scene);

    expect(scene.add.rectangle).toHaveBeenCalledWith(
      GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.75,
    );
    expect(result.background.setDepth).toHaveBeenCalledWith(10);
    expect(result.background.setInteractive).toHaveBeenCalled();
    expect(result.box).toBeNull();
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0]).toBe(result.background);
  });

  it('applies custom background options', () => {
    const result = createOverlayBackground(scene, {
      depth: 2000,
      alpha: 0.5,
      color: 0x222222,
      width: 800,
      height: 600,
    });

    expect(scene.add.rectangle).toHaveBeenCalledWith(
      400, 300, 800, 600, 0x222222, 0.5,
    );
    expect(result.background.setDepth).toHaveBeenCalledWith(2000);
  });

  it('creates a centered overlay box when box config is provided', () => {
    const result = createOverlayBackground(
      scene,
      { depth: 10, alpha: 0.01 },
      { width: 350, height: 180, alpha: 0.85 },
    );

    // Two calls to rectangle: background + box
    expect(scene.add.rectangle).toHaveBeenCalledTimes(2);

    // Box call
    expect(scene.add.rectangle).toHaveBeenCalledWith(
      GAME_W / 2, GAME_H / 2, 350, 180, 0x000000, 0.85,
    );

    expect(result.box).not.toBeNull();
    expect(result.box!.setDepth).toHaveBeenCalledWith(10); // defaults to bg depth
    expect(result.objects).toHaveLength(2);
  });

  it('box uses custom depth when specified', () => {
    const result = createOverlayBackground(
      scene,
      { depth: 10 },
      { width: 200, height: 100, depth: 15 },
    );

    expect(result.box!.setDepth).toHaveBeenCalledWith(15);
  });

  it('box uses custom color when specified', () => {
    createOverlayBackground(
      scene,
      {},
      { width: 200, height: 100, color: 0xff0000, alpha: 0.5 },
    );

    expect(scene.add.rectangle).toHaveBeenCalledWith(
      GAME_W / 2, GAME_H / 2, 200, 100, 0xff0000, 0.5,
    );
  });
});

// ── dismissOverlay ──────────────────────────────────────────

describe('dismissOverlay', () => {
  it('destroys all objects passed to it', () => {
    const obj1 = { destroy: vi.fn() };
    const obj2 = { destroy: vi.fn() };
    const obj3 = { destroy: vi.fn() };

    dismissOverlay([obj1, obj2, obj3] as any);

    expect(obj1.destroy).toHaveBeenCalled();
    expect(obj2.destroy).toHaveBeenCalled();
    expect(obj3.destroy).toHaveBeenCalled();
  });

  it('handles empty array', () => {
    // Should not throw
    expect(() => dismissOverlay([])).not.toThrow();
  });
});

// ── createOverlayButton ─────────────────────────────────────

describe('createOverlayButton', () => {
  let scene: ReturnType<typeof mockScene>;

  beforeEach(() => {
    scene = mockScene();
  });

  it('creates a text button with default styling', () => {
    const btn = createOverlayButton(scene, 100, 200, '[ Play ]');

    expect(scene.add.text).toHaveBeenCalledWith(
      100, 200, '[ Play ]',
      {
        fontSize: OVERLAY_BUTTON_FONT_SIZE,
        color: OVERLAY_BUTTON_COLOR,
        fontFamily: FONT_FAMILY,
      },
    );
    expect(btn.setOrigin).toHaveBeenCalledWith(0.5);
    expect(btn.setDepth).toHaveBeenCalledWith(11); // default depth
    expect(btn.setInteractive).toHaveBeenCalledWith({ useHandCursor: true });
  });

  it('uses custom depth when specified', () => {
    const btn = createOverlayButton(scene, 0, 0, 'X', 2001);
    expect(btn.setDepth).toHaveBeenCalledWith(2001);
  });

  it('applies custom config overrides', () => {
    createOverlayButton(scene, 50, 50, 'Test', 11, {
      fontSize: '20px',
      color: '#ff0000',
      hoverColor: '#ff8888',
      fontFamily: 'Arial',
    });

    expect(scene.add.text).toHaveBeenCalledWith(
      50, 50, 'Test',
      {
        fontSize: '20px',
        color: '#ff0000',
        fontFamily: 'Arial',
      },
    );
  });

  it('registers pointerover and pointerout hover handlers', () => {
    const btn = createOverlayButton(scene, 0, 0, 'Hover');

    expect(btn.on).toHaveBeenCalledWith('pointerover', expect.any(Function));
    expect(btn.on).toHaveBeenCalledWith('pointerout', expect.any(Function));
  });

  it('pointerover sets hover color and pointerout restores default', () => {
    const btn = createOverlayButton(scene, 0, 0, 'Hover');
    const handlers = (btn as any)._handlers;

    handlers['pointerover']();
    expect(btn.setColor).toHaveBeenCalledWith(OVERLAY_BUTTON_HOVER_COLOR);

    handlers['pointerout']();
    expect(btn.setColor).toHaveBeenCalledWith(OVERLAY_BUTTON_COLOR);
  });

  it('uses custom hover colors from config', () => {
    const btn = createOverlayButton(scene, 0, 0, 'Custom', 11, {
      color: '#aabbcc',
      hoverColor: '#ddeeff',
    });
    const handlers = (btn as any)._handlers;

    handlers['pointerover']();
    expect(btn.setColor).toHaveBeenCalledWith('#ddeeff');

    handlers['pointerout']();
    expect(btn.setColor).toHaveBeenCalledWith('#aabbcc');
  });
});

// ── Exported constants ──────────────────────────────────────

describe('overlay button constants', () => {
  it('exports expected default color', () => {
    expect(OVERLAY_BUTTON_COLOR).toBe('#88ff88');
  });

  it('exports expected hover color', () => {
    expect(OVERLAY_BUTTON_HOVER_COLOR).toBe('#aaffaa');
  });

  it('exports expected font size', () => {
    expect(OVERLAY_BUTTON_FONT_SIZE).toBe('14px');
  });
});

// ── createOverlayMenuButton ─────────────────────────────────

describe('createOverlayMenuButton', () => {
  let scene: ReturnType<typeof mockScene>;

  beforeEach(() => {
    scene = mockScene();
  });

  it('creates a button labeled "[ Menu ]"', () => {
    createOverlayMenuButton(scene, 100, 200);

    expect(scene.add.text).toHaveBeenCalledWith(
      100, 200, '[ Menu ]',
      expect.objectContaining({
        fontSize: OVERLAY_BUTTON_FONT_SIZE,
        color: OVERLAY_BUTTON_COLOR,
        fontFamily: FONT_FAMILY,
      }),
    );
  });

  it('uses default depth of 11', () => {
    const btn = createOverlayMenuButton(scene, 0, 0);
    expect(btn.setDepth).toHaveBeenCalledWith(11);
  });

  it('uses custom depth when specified', () => {
    const btn = createOverlayMenuButton(scene, 0, 0, 2001);
    expect(btn.setDepth).toHaveBeenCalledWith(2001);
  });

  it('navigates to GameSelectorScene on pointerdown', () => {
    const btn = createOverlayMenuButton(scene, 0, 0);
    const handlers = (btn as any)._handlers;

    handlers['pointerdown']();
    expect(scene.scene.start).toHaveBeenCalledWith('GameSelectorScene');
  });

  it('inherits hover behavior from createOverlayButton', () => {
    const btn = createOverlayMenuButton(scene, 0, 0);

    expect(btn.on).toHaveBeenCalledWith('pointerover', expect.any(Function));
    expect(btn.on).toHaveBeenCalledWith('pointerout', expect.any(Function));
  });
});
