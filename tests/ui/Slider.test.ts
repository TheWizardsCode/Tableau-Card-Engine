/**
 * Slider Unit Tests
 *
 * Tests the Slider class exported from src/ui/Slider.ts.
 * Verifies construction with various options, value management,
 * input interaction, self-contained listener lifecycle, and cleanup.
 *
 * Uses a minimal Phaser mock to test in a Node.js environment
 * without a browser runtime.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/Renderer', () => {
  const createHudText = vi.fn((_scene: any, x: number, y: number, text: string, color: string, _options?: any) => ({
    x, y, text, color,
    setOrigin: vi.fn().mockReturnThis(),
    setText: vi.fn().mockImplementation(function (this: any, t: string) { this.text = t; }),
    setPosition: vi.fn().mockImplementation(function (this: any, px: number, py: number) { this.x = px; this.y = py; }),
    setColor: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
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

import { Slider } from '../../src/ui/Slider';
import type { SliderOptions } from '../../src/ui/Slider';

// ── Minimal Phaser mock ─────────────────────────────────────

function createMockScene(): any {
  const objects: any[] = [];
  const addTracker = (obj: any) => { objects.push(obj); return obj; };

  const mockText = (x: number, y: number, text: string) => ({
    x, y, text,
    setOrigin: vi.fn().mockReturnThis(),
    setText: vi.fn().mockImplementation(function (this: any, t: string) { this.text = t; }),
    setPosition: vi.fn().mockImplementation(function (this: any, px: number, py: number) { this.x = px; this.y = py; }),
    setColor: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  });

  const mockRectangle = (x: number, y: number, w: number, h: number) => ({
    x, y, width: w, height: h,
    setOrigin: vi.fn().mockReturnThis(),
    setPosition: vi.fn().mockImplementation(function (this: any, px: number, py: number) { this.x = px; this.y = py; }),
    setSize: vi.fn().mockImplementation(function (this: any, pw: number, ph: number) { this.width = pw; this.height = ph; }),
    setStrokeStyle: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  });

  const mockGraphics = () => ({
    clear: vi.fn().mockReturnThis(),
    fillStyle: vi.fn().mockReturnThis(),
    fillCircle: vi.fn().mockReturnThis(),
    lineStyle: vi.fn().mockReturnThis(),
    strokeCircle: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  });

  const mockZone = (x: number, y: number, w: number, h: number) => ({
    x, y, width: w, height: h,
    setInteractive: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    input: { enabled: true },
  });

  return {
    add: {
      text: vi.fn().mockImplementation((x: number, y: number, text: string) => addTracker(mockText(x, y, text))),
      rectangle: vi.fn().mockImplementation((x: number, y: number, w: number, h: number) => addTracker(mockRectangle(x, y, w, h))),
      graphics: vi.fn().mockImplementation(() => addTracker(mockGraphics())),
      zone: vi.fn().mockImplementation((x: number, y: number, w: number, h: number) => addTracker(mockZone(x, y, w, h))),
    },
    input: {
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
    },
    events: {
      on: vi.fn().mockReturnThis(),
      once: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
    },
    children: { list: objects },
  };
}

// ── Slider tests ────────────────────────────────────────────

describe('Slider', () => {
  it('creates a Slider instance with visual elements', () => {
    const scene = createMockScene();
    const slider = new Slider(scene, 100, 200, {
      initialValue: 0.5, minValue: 0, maxValue: 1, label: 'Test',
    });

    expect(slider).toBeDefined();
    expect(slider).toBeInstanceOf(Slider);
    expect(slider.track).toBeDefined();
    expect(slider.fill).toBeDefined();
    expect(slider.handle).toBeDefined();
    expect(slider.valueText).toBeDefined();
    expect(slider.hitArea).toBeDefined();
    expect(typeof slider.setValue).toBe('function');
    expect(typeof slider.getValue).toBe('function');
    expect(typeof slider.destroy).toBe('function');
    // handlePointerMove and handlePointerUp must NOT be on the public API
    expect((slider as any).handlePointerMove).toBeUndefined();
    expect((slider as any).handlePointerUp).toBeUndefined();
  });

  it('initializes with correct default value', () => {
    const scene = createMockScene();
    const slider = new Slider(scene, 100, 200, {
      initialValue: 0.75, minValue: 0, maxValue: 1,
    });

    expect(slider.getValue()).toBeCloseTo(0.75, 5);
  });

  it('uses default options when none provided', () => {
    const scene = createMockScene();
    const slider = new Slider(scene, 100, 200);

    expect(slider.getValue()).toBeCloseTo(0.5, 5);
    expect(slider.track).toBeDefined();
  });

  it('setValue clamps to min/max', () => {
    const scene = createMockScene();
    const slider = new Slider(scene, 100, 200, {
      initialValue: 0.5, minValue: 0, maxValue: 100,
    });

    slider.setValue(150);
    expect(slider.getValue()).toBe(100);

    slider.setValue(-10);
    expect(slider.getValue()).toBe(0);
  });

  it('getValue returns the current value', () => {
    const scene = createMockScene();
    const slider = new Slider(scene, 100, 200, {
      initialValue: 42, minValue: 0, maxValue: 100,
    });

    expect(slider.getValue()).toBe(42);
    slider.setValue(75);
    expect(slider.getValue()).toBe(75);
  });

  it('destroy cleans up all objects', () => {
    const scene = createMockScene();
    const slider = new Slider(scene, 100, 200);
    slider.destroy();
    // No crash on second destroy
    slider.destroy();
  });

  it('fires onValueChange when value changes via pointer interaction', () => {
    const scene = createMockScene();
    const onChange = vi.fn();
    const slider = new Slider(scene, 100, 200, {
      initialValue: 0, minValue: 0, maxValue: 100, width: 200,
    });

    slider.onValueChange = onChange;

    // Simulate pointerdown on the hit area
    const onMock = slider.hitArea.on as unknown as ReturnType<typeof vi.fn>;
    for (const call of onMock.mock.calls) {
      if (call[0] === 'pointerdown') {
        call[1]({ x: 200 });
      }
    }

    expect(onChange).toHaveBeenCalled();
  });

  it('setValue does NOT fire onValueChange', () => {
    const scene = createMockScene();
    const onChange = vi.fn();
    const slider = new Slider(scene, 100, 200, {
      initialValue: 0, minValue: 0, maxValue: 100,
    });

    slider.onValueChange = onChange;
    slider.setValue(75);

    expect(onChange).not.toHaveBeenCalled();
  });

  // ── Self-contained listener tests ──────────────────────────

  it('registers pointermove listener on pointerdown', () => {
    const scene = createMockScene();
    const slider = new Slider(scene, 100, 200, {
      initialValue: 0, minValue: 0, maxValue: 100, width: 200,
    });

    const inputOnMock = scene.input.on;
    const inputOffMock = scene.input.off;
    inputOnMock.mockClear();
    inputOffMock.mockClear();

    // Initially, no pointermove listener should be registered
    expect(inputOnMock).not.toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(inputOnMock).not.toHaveBeenCalledWith('pointerup', expect.any(Function));

    // Simulate pointerdown on the hit area
    const onMock = slider.hitArea.on as unknown as ReturnType<typeof vi.fn>;
    for (const call of onMock.mock.calls) {
      if (call[0] === 'pointerdown') {
        call[1]({ x: 150 });
      }
    }

    // After pointerdown, scene.input.on should have registered pointermove and pointerup
    expect(inputOnMock).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(inputOnMock).toHaveBeenCalledWith('pointerup', expect.any(Function));
  });

  it('unregisters listeners on pointerup', () => {
    const scene = createMockScene();
    const slider = new Slider(scene, 100, 200, {
      initialValue: 0, minValue: 0, maxValue: 100, width: 200,
    });

    const inputOnMock = scene.input.on;
    const inputOffMock = scene.input.off;
    inputOnMock.mockClear();
    inputOffMock.mockClear();

    // Trigger pointerdown
    const onMock = slider.hitArea.on as unknown as ReturnType<typeof vi.fn>;
    for (const call of onMock.mock.calls) {
      if (call[0] === 'pointerdown') {
        call[1]({ x: 150 });
      }
    }

    // Capture the registered handlers
    const moveHandler = inputOnMock.mock.calls.find((c: any[]) => c[0] === 'pointermove')?.[1];
    const upHandler = inputOnMock.mock.calls.find((c: any[]) => c[0] === 'pointerup')?.[1];
    expect(moveHandler).toBeDefined();
    expect(upHandler).toBeDefined();

    // Simulate pointermove via the self-contained listener
    moveHandler({ x: 200 });
    const valueAfterMove = slider.getValue();
    expect(valueAfterMove).toBeGreaterThan(0);

    // Simulate pointerup via the self-contained listener
    upHandler();

    // After pointerup, listeners should be unregistered
    expect(inputOffMock).toHaveBeenCalledWith('pointermove', moveHandler);
    expect(inputOffMock).toHaveBeenCalledWith('pointerup', upHandler);

    // After pointerup, pointermove should not change value
    const valueBeforeMove2 = slider.getValue();
    moveHandler({ x: 250 });
    expect(slider.getValue()).toBe(valueBeforeMove2);
  });

  it('pointermove updates value during drag (via self-contained listeners)', () => {
    const scene = createMockScene();
    const slider = new Slider(scene, 100, 200, {
      initialValue: 0, minValue: 0, maxValue: 100, width: 200,
    });

    const inputOnMock = scene.input.on;
    inputOnMock.mockClear();

    // Simulate pointerdown via hitArea
    const onMock = slider.hitArea.on as unknown as ReturnType<typeof vi.fn>;
    for (const call of onMock.mock.calls) {
      if (call[0] === 'pointerdown') {
        call[1]({ x: 150 });
      }
    }

    // Find the registered pointermove handler
    const moveHandler = inputOnMock.mock.calls.find((c: any[]) => c[0] === 'pointermove')?.[1];
    expect(moveHandler).toBeDefined();

    // Simulate drag via the self-contained listener
    moveHandler({ x: 200 });
    expect(slider.getValue()).toBeGreaterThan(0);
  });

  it('destroy cleans up active listeners', () => {
    const scene = createMockScene();
    const slider = new Slider(scene, 100, 200, {
      initialValue: 0, minValue: 0, maxValue: 100, width: 200,
    });

    const inputOnMock = scene.input.on;
    const inputOffMock = scene.input.off;
    inputOnMock.mockClear();
    inputOffMock.mockClear();

    // Trigger pointerdown
    const onMock = slider.hitArea.on as unknown as ReturnType<typeof vi.fn>;
    for (const call of onMock.mock.calls) {
      if (call[0] === 'pointerdown') {
        call[1]({ x: 150 });
      }
    }

    // Capture the registered handler
    const moveHandler = inputOnMock.mock.calls.find((c: any[]) => c[0] === 'pointermove')?.[1];
    expect(moveHandler).toBeDefined();

    // Reset off mock to test destroy cleanup
    inputOffMock.mockClear();

    // Destroy the slider while dragging
    slider.destroy();

    // Listeners should be cleaned up
    expect(inputOffMock).toHaveBeenCalledWith('pointermove', moveHandler);
  });

  it('multiple sliders each self-manage their own listeners', () => {
    const scene = createMockScene();

    const slider1 = new Slider(scene, 100, 200, {
      initialValue: 0, minValue: 0, maxValue: 100, width: 200,
    });
    const slider2 = new Slider(scene, 400, 200, {
      initialValue: 0, minValue: 0, maxValue: 100, width: 200,
    });

    const inputOnMock = scene.input.on;
    const inputOffMock = scene.input.off;
    inputOnMock.mockClear();
    inputOffMock.mockClear();

    // Trigger pointerdown on slider1 only
    const onMock1 = slider1.hitArea.on as unknown as ReturnType<typeof vi.fn>;
    for (const call of onMock1.mock.calls) {
      if (call[0] === 'pointerdown') {
        call[1]({ x: 150 });
      }
    }

    // Only one pointermove listener should be registered
    const moveCalls = inputOnMock.mock.calls.filter((c: any[]) => c[0] === 'pointermove');
    expect(moveCalls).toHaveLength(1);

    // Simulate pointermove - only slider1 should update
    const moveHandler = moveCalls[0][1];
    moveHandler({ x: 200 });
    expect(slider1.getValue()).toBeGreaterThan(0);
    expect(slider2.getValue()).toBeCloseTo(0, 1);

    // Simulate pointerup - listener should be cleaned up
    const upHandler = inputOnMock.mock.calls.find((c: any[]) => c[0] === 'pointerup')?.[1];
    upHandler();
    expect(inputOffMock).toHaveBeenCalledWith('pointermove', moveHandler);
  });

  it('supports all SliderOptions fields', () => {
    const scene = createMockScene();
    const options: SliderOptions = {
      initialValue: 100,
      minValue: 0,
      maxValue: 200,
      label: 'Test',
      width: 300,
      trackHeight: 10,
      trackColor: 0x111111,
      fillColor: 0x222222,
      handleColor: 0x333333,
      fontSize: '14px',
      textColor: '#ffffff',
    };

    const slider = new Slider(scene, 50, 100, options);
    expect(slider.getValue()).toBe(100);
    expect(slider.track).toBeDefined();
    expect(slider.fill).toBeDefined();
    expect(slider.handle).toBeDefined();
    expect(slider.valueText).toBeDefined();
    expect(slider.hitArea).toBeDefined();
  });

  it('accepts null for onValueChange', () => {
    const scene = createMockScene();
    const slider = new Slider(scene, 100, 200);
    expect(slider.onValueChange).toBeNull();
    slider.onValueChange = vi.fn();
    expect(slider.onValueChange).not.toBeNull();
    slider.onValueChange = null;
    expect(slider.onValueChange).toBeNull();
  });
});
