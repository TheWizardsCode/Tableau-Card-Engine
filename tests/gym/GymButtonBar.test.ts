/**
 * GymButtonBar Unit Tests
 *
 * Tests for the GymButtonBar component which provides auto-laying-out
 * button bars with left/center/right zones and automatic row wrapping.
 *
 * Uses mocked Phaser scene objects to test layout logic without a browser.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GymButtonBar } from '../../src/ui/GymButtonBar';

// ── Constants ──────────────────────────────────────────────

const GAME_W = 1280;

// ── Mock Phaser scene ──────────────────────────────────────

function createMockScene(): any {
  const objects: any[] = [];

  const mockText = (x: number, y: number, text: string, style?: any) => {
    const fontSize = style?.fontSize ?? '14px';
    // Approximate width: ~7px per char for default 14px, scaled by font size
    const sizePx = parseInt(fontSize, 10);
    const charWidth = sizePx * 0.5;
    const width = text.length * charWidth;

    const obj = {
      x, y, text, style,
      width,
      depth: 0,
      originX: 0,
      originY: 0,
      visible: true,
      _events: {} as Record<string, Function[]>,
      setPosition: vi.fn(function (this: any, px: number, py: number) {
        this.x = px;
        this.y = py;
        return this;
      }),
      setOrigin: vi.fn(function (this: any, ox: number, oy: number) {
        this.originX = ox;
        this.originY = oy;
        return this;
      }),
      setDepth: vi.fn(function (this: any, d: number) {
        this.depth = d;
        return this;
      }),
      setVisible: vi.fn(function (this: any, v: boolean) {
        this.visible = v;
        return this;
      }),
      setText: vi.fn(function (this: any, t: string) {
        this.text = t;
        return this;
      }),
      setInteractive: vi.fn(function (this: any, _opts?: any) {
        return this;
      }),
      on: vi.fn(function (this: any, event: string, fn: Function) {
        if (!this._events[event]) this._events[event] = [];
        this._events[event].push(fn);
        return this;
      }),
      setColor: vi.fn(function (this: any, _c: string) {
        return this;
      }),
      destroy: vi.fn(function (this: any) {
        const idx = objects.indexOf(this);
        if (idx >= 0) objects.splice(idx, 1);
      }),
      getBounds: vi.fn(() => ({ width, height: sizePx + 4 })),
    };
    return obj;
  };

  return {
    add: {
      text: vi.fn().mockImplementation((x: number, y: number, text: string, style?: any) => {
        const obj = mockText(x, y, text, style);
        objects.push(obj);
        return obj;
      }),
    },
    children: {
      get list() { return objects; },
    },
    tweens: {
      add: vi.fn(),
    },
  };
}

// ── Tests ──────────────────────────────────────────────────

describe('GymButtonBar', () => {
  let scene: any;

  beforeEach(() => {
    scene = createMockScene();
  });

  // ── AC 1: Bar creation ─────────────────────────────────

  it('creates a button bar at the given Y position', () => {
    const bar = new GymButtonBar(scene, { y: 100 });
    expect(bar).toBeDefined();
  });

  it('addButton returns a Text object', () => {
    const bar = new GymButtonBar(scene, { y: 100 });
    const btn = bar.addButton('[ Test ]', () => {});
    expect(btn).toBeDefined();
    expect(typeof btn.setText).toBe('function');
    expect(typeof btn.setVisible).toBe('function');
  });

  // ── AC 2: Zone positioning ─────────────────────────────

  it('positions left-zone buttons on the left side', () => {
    const bar = new GymButtonBar(scene, { y: 100, width: GAME_W, padding: 20 });
    const btn = bar.addButton('[ Left ]', () => {}, { zone: 'left' });

    // Left zone occupies left 1/3 of available width (1260/3 = 420)
    // Button should be positioned within the left 420px
    const zoneRightBoundary = 20 + (GAME_W - 40) / 3;
    expect(btn.x).toBeGreaterThanOrEqual(20);
    expect(btn.x).toBeLessThan(zoneRightBoundary);
  });

  it('positions center-zone buttons near the center', () => {
    const bar = new GymButtonBar(scene, { y: 100, width: GAME_W, padding: 20 });
    const btn = bar.addButton('[ Center ]', () => {}, { zone: 'center' });

    const zoneLeft = 20 + (GAME_W - 40) / 3;
    const zoneRight = 20 + 2 * (GAME_W - 40) / 3;
    expect(btn.x).toBeGreaterThanOrEqual(zoneLeft);
    expect(btn.x).toBeLessThanOrEqual(zoneRight);
  });

  it('positions right-zone buttons on the right side', () => {
    const bar = new GymButtonBar(scene, { y: 100, width: GAME_W, padding: 20 });
    const btn = bar.addButton('[ Right ]', () => {}, { zone: 'right' });

    const zoneLeft = 20 + 2 * (GAME_W - 40) / 3;
    expect(btn.x).toBeGreaterThanOrEqual(zoneLeft);
    expect(btn.x).toBeLessThanOrEqual(GAME_W - 20);
  });

  it('default zone is center', () => {
    const bar = new GymButtonBar(scene, { y: 100 });
    const btn = bar.addButton('[ Default ]', () => {});

    const zoneLeft = (GAME_W - 40) / 3;
    const zoneRight = 2 * (GAME_W - 40) / 3;
    expect(btn.x).toBeGreaterThanOrEqual(zoneLeft);
    expect(btn.x).toBeLessThanOrEqual(zoneRight);
  });

  // ── AC 3: Even spacing within zones ────────────────────

  it('evenly spaces buttons within the same zone', () => {
    const bar = new GymButtonBar(scene, { y: 100, width: GAME_W, padding: 20 });
    bar.addButton('[ A ]', () => {}, { zone: 'center' });
    bar.addButton('[ B ]', () => {}, { zone: 'center' });
    bar.addButton('[ C ]', () => {}, { zone: 'center' });

    // Get the buttons' x positions
    const buttons = scene.children.list.filter(
      (c: any) => c.text?.startsWith('['),
    );
    expect(buttons.length).toBe(3);

    // Spacing should be even (roughly equal gaps)
    const gap1 = buttons[1].x - buttons[0].x;
    const gap2 = buttons[2].x - buttons[1].x;
    const gapDiff = Math.abs(gap1 - gap2);

    // Allow some rounding tolerance
    expect(gapDiff).toBeLessThan(5);
  });

  // ── AC 4: Row wrapping ─────────────────────────────────

  it('wraps buttons to a new row when they exceed zone width', () => {
    const bar = new GymButtonBar(scene, { y: 100, width: 300, padding: 10, rowSpacing: 30 });
    // Add many buttons to force wrapping in the center zone
    for (let i = 0; i < 10; i++) {
      bar.addButton(`[ Btn${i} ]`, () => {}, { zone: 'center' });
    }

    // Find buttons that should be on row 2
    const buttons = scene.children.list.filter(
      (c: any) => c.text?.startsWith('['),
    );

    // Some buttons should be on row 2 (y > 100 + rowSpacing)
    const row2Buttons = buttons.filter((b: any) => b.y >= 130);
    expect(row2Buttons.length).toBeGreaterThan(0);

    // All buttons should be within the valid x range
    for (const btn of buttons) {
      expect(btn.x).toBeGreaterThanOrEqual(0);
      expect(btn.x).toBeLessThanOrEqual(300);
    }
  });

  it('supports 1-n rows', () => {
    const bar = new GymButtonBar(scene, { y: 100, width: 200, padding: 5, rowSpacing: 28 });
    // Add enough buttons to force multiple rows
    for (let i = 0; i < 20; i++) {
      bar.addButton(`[ X ]`, () => {}, { zone: 'left' });
    }

    const buttons = scene.children.list.filter(
      (c: any) => c.text?.startsWith('['),
    );

    // Should have at least 2 rows
    const maxY = Math.max(...buttons.map((b: any) => b.y));
    const minY = Math.min(...buttons.map((b: any) => b.y));
    expect(maxY - minY).toBeGreaterThan(28);
  });

  // ── AC 5: Button styling preservation ──────────────────

  it('preserves default button styling', () => {
    const bar = new GymButtonBar(scene, { y: 100 });
    const btn = bar.addButton('[ Styled ]', () => {});

    // Button should be positioned at y=100 via setPosition
    expect(btn.y).toBe(100);
    expect(btn.text).toBe('[ Styled ]');
  });

  it('respects per-button style overrides in Phaser text config', () => {
    const bar = new GymButtonBar(scene, { y: 100 });
    bar.addButton('[ Custom ]', () => {}, {
      fontSize: '16px',
      color: '#ff8888',
      hoverColor: '#ffaaaa',
    });

    // The style should be passed to scene.add.text
    expect(scene.add.text).toHaveBeenCalled();
    const calls = (scene.add.text as any).mock.calls;
    const customCall = calls.find((c: any) => c[2] === '[ Custom ]');
    expect(customCall).toBeDefined();
    expect(customCall[3]).toEqual(
      expect.objectContaining({
        fontSize: '16px',
        color: '#ff8888',
      }),
    );
  });

  // ── AC 6: Button reference ─────────────────────────────

  it('returned button supports setVisible', () => {
    const bar = new GymButtonBar(scene, { y: 100 });
    const btn = bar.addButton('[ Toggle ]', () => {});
    btn.setVisible(false);
    expect(btn.visible).toBe(false);
  });

  it('returned button supports setText', () => {
    const bar = new GymButtonBar(scene, { y: 100 });
    const btn = bar.addButton('[ Old ]', () => {});
    btn.setText('[ New ]');
    expect(btn.text).toBe('[ New ]');
  });

  // ── AC 7: Multiple bars at different Y positions ───────

  it('supports multiple button bars at different Y positions', () => {
    const bar1 = new GymButtonBar(scene, { y: 60 });
    const bar2 = new GymButtonBar(scene, { y: 120 });

    bar1.addButton('[ Bar1 ]', () => {}, { zone: 'left' });
    bar2.addButton('[ Bar2 ]', () => {}, { zone: 'left' });

    const btn1 = scene.children.list.find((c: any) => c.text === '[ Bar1 ]');
    const btn2 = scene.children.list.find((c: any) => c.text === '[ Bar2 ]');

    expect(btn1).toBeDefined();
    expect(btn2).toBeDefined();
    expect(btn1.y).toBe(60);
    expect(btn2.y).toBe(120);
  });

  // ── AC 8: refresh re-layouts all buttons ───────────────

  it('refresh re-positions buttons', () => {
    const bar = new GymButtonBar(scene, { y: 100, width: GAME_W });
    const btn = bar.addButton('[ Test ]', () => {}, { zone: 'left' });
    const originalX = btn.x;

    // Change bar config and refresh
    // (Internally, refresh recomputes positions)
    bar.refresh();
    expect(btn.x).toBe(originalX); // should remain same since no config change
  });

  // ── AC 9: Destroy cleans up ────────────────────────────

  it('destroy removes all buttons from the scene', () => {
    const bar = new GymButtonBar(scene, { y: 100 });
    bar.addButton('[ A ]', () => {});
    bar.addButton('[ B ]', () => {});
    bar.addButton('[ C ]', () => {});

    expect(scene.children.list.length).toBeGreaterThan(0);
    bar.destroy();
    expect(scene.children.list.length).toBe(0);
  });

  // ── AC 10: Dynamic button addition ─────────────────────

  it('supports adding buttons after initial creation', () => {
    const bar = new GymButtonBar(scene, { y: 100 });
    bar.addButton('[ First ]', () => {});
    bar.addButton('[ Second ]', () => {});

    const buttons = scene.children.list.filter(
      (c: any) => c.text?.startsWith('['),
    );
    expect(buttons.length).toBe(2);
  });

  // ── AC 11: Staggered zone layout ───────────────────────

  it('places left and right zone buttons at opposite ends', () => {
    const bar = new GymButtonBar(scene, { y: 100, width: GAME_W, padding: 20 });
    const leftBtn = bar.addButton('[ Left ]', () => {}, { zone: 'left' });
    const rightBtn = bar.addButton('[ Right ]', () => {}, { zone: 'right' });

    // Left button should be to the left of right button
    expect(leftBtn.x).toBeLessThan(rightBtn.x);
  });

  // ── AC 12: Row spacing configuration ───────────────────

  it('respects custom row spacing', () => {
    const bar = new GymButtonBar(scene, { y: 100, width: 200, padding: 5, rowSpacing: 50 });
    for (let i = 0; i < 8; i++) {
      bar.addButton(`[ ${i} ]`, () => {}, { zone: 'center' });
    }

    const buttons = scene.children.list.filter(
      (c: any) => c.text?.startsWith('['),
    );

    // Row 1 should be at y=100, row 2 should be at y=150
    const row2Buttons = buttons.filter((b: any) => b.y >= 150);
    // But on row 1 should be at y=100
    const row1Buttons = buttons.filter((b: any) => b.y < 150);

    expect(row1Buttons.length).toBeGreaterThan(0);
    expect(row2Buttons.length).toBeGreaterThan(0);
  });
});
