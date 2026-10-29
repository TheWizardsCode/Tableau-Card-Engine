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
import {
  createOverlayBackground,
  createOverlayDialog,
  dismissOverlay,
  type OverlayDialogHandle,
} from '../../src/ui/Overlay';
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

  it('parents overlay objects into scene.hudContainer when present', () => {
    // Provide a scene with a hudContainer that has an `add` spy.
    // Overlay box/background are parented into hudContainer so all overlay
    // content (box + text + buttons) shares the same depth-sort space.  HUD-
    // level game elements (e.g. "Stock" label) must also be parented into
    // hudContainer so overlays can correctly cover them.
    const hudScene: any = mockScene();
    hudScene.hudContainer = { add: vi.fn() };

    const res = createOverlayBackground(hudScene);

    // hudContainer.add should have been called for the background
    expect(hudScene.hudContainer.add).toHaveBeenCalledWith(res.background);
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

// ── createOverlayDialog ─────────────────────────────────────

/**
 * Create a mock Phaser.GameObjects.Container covering the subset of the
 * container API `createOverlayDialog` uses (position, child list, mask).
 */
function mockContainer(x = 0, y = 0) {
  const list: unknown[] = [];
  const container: Record<string, unknown> = {
    x,
    y,
    list,
    mask: null as unknown,
    setDepth: vi.fn().mockReturnThis(),
    add: vi.fn((child: unknown) => {
      list.push(child);
      return container;
    }),
    removeAll: vi.fn(() => {
      list.length = 0;
      return container;
    }),
    setMask: vi.fn((mask: unknown) => {
      container.mask = mask;
      return container;
    }),
    clearMask: vi.fn(() => {
      container.mask = null;
      return container;
    }),
    destroy: vi.fn(),
  };
  return container;
}

/** Create a mock Phaser.GameObjects.Graphics (the scroll mask geometry). */
function mockMaskGraphics() {
  const mask = { __geometryMask: true };
  return {
    mask,
    fillStyle: vi.fn().mockReturnThis(),
    fillRect: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    createGeometryMask: vi.fn(() => mask),
    destroy: vi.fn(),
  };
}

/** Minimal mock scene that captures the registered `wheel` handlers. */
function mockDialogScene() {
  const wheelHandlers: Array<
    (pointer: { x: number; y: number }, over: unknown[], dx: number, dy: number) => void
  > = [];

  const scene = {
    add: {
      rectangle: vi.fn(() => mockRectangle()),
      text: vi.fn(() => mockText()),
      container: vi.fn((x: number, y: number) => mockContainer(x, y)),
      graphics: vi.fn(() => mockMaskGraphics()),
    },
    input: {
      on: vi.fn((event: string, handler: (typeof wheelHandlers)[number]) => {
        if (event === 'wheel') wheelHandlers.push(handler);
      }),
      off: vi.fn((event: string, handler: (typeof wheelHandlers)[number]) => {
        if (event !== 'wheel') return;
        const index = wheelHandlers.indexOf(handler);
        if (index >= 0) wheelHandlers.splice(index, 1);
      }),
    },
  };

  return {
    scene: scene as unknown as Phaser.Scene,
    wheelHandlerCount: (): number => wheelHandlers.length,
    /** Dispatch a wheel event to every registered handler (as Phaser does). */
    wheel(x: number, y: number, dx: number, dy: number): void {
      for (const handler of [...wheelHandlers]) handler({ x, y }, [], dx, dy);
    },
  };
}

/**
 * Add one mock content object to the dialog's scroll container so the
 * dialog's fallback content measurements (`estimateContentHeight`,
 * `estimateContentWidth`) report the requested size.
 */
function addDemoContent(
  dialog: OverlayDialogHandle,
  height: number,
  width: number,
): void {
  dialog.scrollContainer.add({
    x: 0,
    y: height - 22,
    width,
  } as unknown as Phaser.GameObjects.GameObject);
}

describe('createOverlayDialog', () => {
  let harness: ReturnType<typeof mockDialogScene>;

  beforeEach(() => {
    harness = mockDialogScene();
  });

  it('is vertical-only by default: dx never moves content and maxScrollX stays 0', () => {
    const dialog = createOverlayDialog(harness.scene, { title: 'Defaults' });
    addDemoContent(dialog, dialog.contentHeight * 3, dialog.contentWidth * 5);
    dialog.refresh();

    expect(dialog.scrollX).toBe(0);
    expect(dialog.maxScrollX).toBe(0);
    expect(dialog.scrollContainer.x).toBe(dialog.contentX);

    harness.wheel(dialog.boxX + 5, dialog.boxY + 5, 40, 0);

    expect(dialog.scrollX).toBe(0);
    expect(dialog.maxScrollX).toBe(0);
    expect(dialog.scrollContainer.x).toBe(dialog.contentX);
  });

  it('keeps vertical scrolling working on a default dialog', () => {
    const dialog = createOverlayDialog(harness.scene, { title: 'Vertical' });
    addDemoContent(dialog, dialog.contentHeight * 3, dialog.contentWidth);
    dialog.refresh();

    harness.wheel(dialog.boxX + 5, dialog.boxY + 5, 0, 10);

    expect(dialog.scrollY).toBeCloseTo(15);
    expect(dialog.scrollContainer.y).toBeCloseTo(dialog.contentY - 15);
    expect(dialog.scrollContainer.x).toBe(dialog.contentX);
  });

  it('scrolls horizontally when enableHorizontalScroll is opt-in', () => {
    const dialog = createOverlayDialog(harness.scene, {
      title: 'Wide',
      enableHorizontalScroll: true,
    });
    const wideContent = dialog.contentWidth * 4;
    addDemoContent(dialog, dialog.contentHeight, wideContent);
    dialog.refresh();

    expect(dialog.maxScrollX).toBe(wideContent - dialog.contentWidth);

    harness.wheel(dialog.boxX + 5, dialog.boxY + 5, 10, 0);

    expect(dialog.scrollX).toBeCloseTo(15);
    expect(dialog.scrollContainer.x).toBeCloseTo(dialog.contentX - 15);
  });

  it('clamps horizontal scrolling between 0 and the measured content width', () => {
    const dialog = createOverlayDialog(harness.scene, {
      title: 'Clamped',
      enableHorizontalScroll: true,
    });
    const wideContent = dialog.contentWidth * 4;
    addDemoContent(dialog, dialog.contentHeight, wideContent);
    dialog.refresh();

    harness.wheel(dialog.boxX + 5, dialog.boxY + 5, 1_000_000, 0);
    expect(dialog.scrollX).toBe(dialog.maxScrollX);
    expect(dialog.scrollContainer.x).toBeCloseTo(dialog.contentX - dialog.maxScrollX);

    harness.wheel(dialog.boxX + 5, dialog.boxY + 5, -1_000_000, 0);
    expect(dialog.scrollX).toBe(0);
    expect(dialog.scrollContainer.x).toBe(dialog.contentX);
  });

  it('scrolls both axes independently and re-clamps them on refresh', () => {
    const dialog = createOverlayDialog(harness.scene, {
      title: 'Both axes',
      enableHorizontalScroll: true,
    });
    addDemoContent(dialog, dialog.contentHeight * 3, dialog.contentWidth * 4);
    dialog.refresh();

    harness.wheel(dialog.boxX + 5, dialog.boxY + 5, 10, 20);

    expect(dialog.scrollX).toBeCloseTo(15);
    expect(dialog.scrollY).toBeCloseTo(30);
    expect(dialog.scrollContainer.x).toBeCloseTo(dialog.contentX - 15);
    expect(dialog.scrollContainer.y).toBeCloseTo(dialog.contentY - 30);

    dialog.refresh();
    expect(dialog.scrollX).toBeCloseTo(15);
    expect(dialog.scrollY).toBeCloseTo(30);

    dialog.refresh(0, 0);
    expect(dialog.scrollX).toBe(0);
    expect(dialog.scrollY).toBe(0);
    expect(dialog.scrollContainer.x).toBe(dialog.contentX);
    expect(dialog.scrollContainer.y).toBe(dialog.contentY);
  });

  it('applies the geometry mask when content overflows vertically and clears it when it fits', () => {
    const dialog = createOverlayDialog(harness.scene, { title: 'Mask' });
    addDemoContent(dialog, dialog.contentHeight * 2, dialog.contentWidth);
    dialog.refresh();
    expect(dialog.scrollContainer.mask).not.toBeNull();

    dialog.refresh(dialog.contentHeight, dialog.contentWidth);
    expect(dialog.scrollContainer.mask).toBeNull();
  });

  it('applies the geometry mask for horizontal overflow only when opted in', () => {
    const defaultDialog = createOverlayDialog(harness.scene, { title: 'No mask' });
    defaultDialog.refresh(10, defaultDialog.contentWidth * 4);
    expect(defaultDialog.scrollContainer.mask).toBeNull();

    const wideDialog = createOverlayDialog(harness.scene, {
      title: 'Wide mask',
      enableHorizontalScroll: true,
    });
    wideDialog.refresh(10, wideDialog.contentWidth * 4);
    expect(wideDialog.scrollContainer.mask).not.toBeNull();
  });

  it('keeps the opt-in capability per-dialog (a default dialog still ignores dx)', () => {
    const optIn = createOverlayDialog(harness.scene, {
      title: 'Opted in',
      enableHorizontalScroll: true,
    });
    addDemoContent(optIn, 10, optIn.contentWidth * 3);
    optIn.refresh();

    const defaulted = createOverlayDialog(harness.scene, { title: 'Defaulted' });
    addDemoContent(defaulted, 10, defaulted.contentWidth * 3);
    defaulted.refresh();

    harness.wheel(defaulted.boxX + 5, defaulted.boxY + 5, 10, 0);

    expect(defaulted.scrollX).toBe(0);
    expect(defaulted.maxScrollX).toBe(0);
    // The same wheel event did reach the opt-in dialog.
    expect(optIn.scrollX).toBeCloseTo(15);
  });

  it('ignores wheel events outside the dialog box', () => {
    const dialog = createOverlayDialog(harness.scene, {
      title: 'Bounds',
      enableHorizontalScroll: true,
    });
    addDemoContent(dialog, dialog.contentHeight * 3, dialog.contentWidth * 4);
    dialog.refresh();

    harness.wheel(dialog.boxX - 20, dialog.boxY + 5, 10, 10);
    harness.wheel(dialog.boxX + dialog.boxWidth + 20, dialog.boxY + 5, 10, 10);
    harness.wheel(dialog.boxX + 5, dialog.boxY - 20, 10, 10);
    harness.wheel(dialog.boxX + 5, dialog.boxY + dialog.boxHeight + 20, 10, 10);

    expect(dialog.scrollX).toBe(0);
    expect(dialog.scrollY).toBe(0);
  });

  it('detaches its wheel handler on close', () => {
    const dialog = createOverlayDialog(harness.scene, { title: 'Closable' });
    expect(harness.wheelHandlerCount()).toBe(1);

    dialog.close();

    expect(harness.wheelHandlerCount()).toBe(0);
  });
});

describe('createOverlayDialog content-width measurement', () => {
  let harness: ReturnType<typeof mockDialogScene>;

  beforeEach(() => {
    harness = mockDialogScene();
  });

  it('derives maxScrollX from the content children when no width is supplied', () => {
    const dialog = createOverlayDialog(harness.scene, {
      title: 'Estimated',
      enableHorizontalScroll: true,
    });
    addDemoContent(dialog, 10, dialog.contentWidth * 2);

    dialog.refresh();

    expect(dialog.maxScrollX).toBe(dialog.contentWidth);
  });

  it('keeps maxScrollX at 0 when the content fits the visible width', () => {
    const dialog = createOverlayDialog(harness.scene, {
      title: 'Fits',
      enableHorizontalScroll: true,
    });
    addDemoContent(dialog, 10, dialog.contentWidth - 1);
    dialog.refresh();

    expect(dialog.maxScrollX).toBe(0);

    harness.wheel(dialog.boxX + 5, dialog.boxY + 5, 50, 0);

    expect(dialog.scrollX).toBe(0);
    expect(dialog.scrollContainer.x).toBe(dialog.contentX);
  });

  it('re-clamps the horizontal offset when the content shrinks', () => {
    const dialog = createOverlayDialog(harness.scene, {
      title: 'Shrinks',
      enableHorizontalScroll: true,
    });
    addDemoContent(dialog, 10, dialog.contentWidth * 3);
    dialog.refresh();

    harness.wheel(dialog.boxX + 5, dialog.boxY + 5, 100, 0);
    expect(dialog.scrollX).toBeGreaterThan(0);

    dialog.scrollContainer.removeAll(false);
    addDemoContent(dialog, 10, dialog.contentWidth);
    dialog.refresh();

    expect(dialog.maxScrollX).toBe(0);
    expect(dialog.scrollX).toBe(0);
    expect(dialog.scrollContainer.x).toBe(dialog.contentX);
  });
});
