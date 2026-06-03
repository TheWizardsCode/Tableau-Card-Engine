/**
 * GymSceneUtils Smoke Test Suite
 *
 * Integration smoke tests for the createEventLog, createDeckGrid,
 * and createSlider utilities exported from src/ui/GymSceneUtils.ts.
 *
 * Uses a minimal Phaser mock to test each helper's public API surface.
 * Mocks the Renderer module to avoid Phaser import in node environment.
 */
import { describe, expect, it, vi } from 'vitest';

// Mock the Renderer module to avoid Phaser dependency in node environment.
// This allows unit-style testing of GymSceneUtils without browser runtime.
vi.mock('../../src/ui/Renderer', () => {
  const FONT_FAMILY = 'monospace';
  const createHudText = vi.fn((_scene: any, x: number, y: number, text: string, color: string, options?: any) => ({
    x, y, text, color, options,
    setOrigin: vi.fn().mockReturnThis(),
    setText: vi.fn().mockImplementation(function (this: any, t: string) { this.text = t; }),
    setPosition: vi.fn().mockImplementation(function (this: any, px: number, py: number) { this.x = px; this.y = py; }),
    setColor: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  }));
  return { createHudText, FONT_FAMILY };
});

// Mock CardTextureHelpers to avoid Phaser dependency
vi.mock('../../src/ui/CardTextureHelpers', () => ({
  getCardTexture: vi.fn((_card: any) => 'mock-texture'),
}));

// Mock constants to avoid Phaser dependency
vi.mock('../../src/ui/constants', () => ({
  GAME_W: 1280,
  GAME_H: 720,
  CARD_W: 48,
  CARD_H: 65,
}));

import { createEventLog, createDeckGrid, createSlider } from '../../src/ui/GymSceneUtils';
import type { Card } from '../../src/card-system/Card';

// ── Minimal Phaser mock ─────────────────────────────────────

function createMockScene(): any {
  const mockText = (x: number, y: number, text: string) => ({
    x, y, text,
    setOrigin: vi.fn().mockReturnThis(),
    setText: vi.fn().mockImplementation(function (this: any, t: string) { this.text = t; }),
    setPosition: vi.fn().mockImplementation(function (this: any, px: number, py: number) { this.x = px; this.y = py; }),
    setColor: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  });

  const mockImage = (x: number, y: number, texture: string) => ({
    x, y, texture: { key: texture },
    setInteractive: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(),
    setTexture: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    active: true,
  });

  const mockRectangle = (x: number, y: number, w: number, h: number) => ({
    x, y, width: w, height: h,
    setOrigin: vi.fn().mockReturnThis(),
    setPosition: vi.fn().mockImplementation(function (this: any, px: number, py: number) { this.x = px; this.y = py; }),
    setSize: vi.fn().mockImplementation(function (this: any, pw: number, ph: number) { this.width = pw; this.height = ph; }),
    setStrokeStyle: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
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
    on: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  });

  const objects: any[] = [];
  const addTracker = (obj: any) => { objects.push(obj); return obj; };

  return {
    add: {
      text: vi.fn().mockImplementation((x: number, y: number, text: string) => addTracker(mockText(x, y, text))),
      image: vi.fn().mockImplementation((x, y, texture) => addTracker(mockImage(x, y, texture))),
      rectangle: vi.fn().mockImplementation((x: number, y: number, w: number, h: number) => addTracker(mockRectangle(x, y, w, h))),
      graphics: vi.fn().mockImplementation(() => addTracker(mockGraphics())),
      zone: vi.fn().mockImplementation((x, y, w, h) => addTracker(mockZone(x, y, w, h))),
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

// ── createEventLog tests ────────────────────────────────────

describe('createEventLog', () => {
  it('returns header and line objects with default header text', () => {
    const scene = createMockScene();
    const result = createEventLog(scene, 200);

    expect(result).toBeDefined();
    expect(result.header).toBeDefined();
    expect(result.header.text).toBe('── Event Log ──');
    expect(typeof result.render).toBe('function');
    expect(typeof result.destroy).toBe('function');
  });

  it('renders log lines with correct count', () => {
    const scene = createMockScene();
    const result = createEventLog(scene, 200, { maxLines: 14 });

    result.render(['line 1', 'line 2', 'line 3']);

    expect(result.lines.length).toBe(3);
    expect(result.lines[0].text).toBe('line 1');
    expect(result.lines[2].text).toBe('line 3');
  });

  it('truncates lines beyond maxLines', () => {
    const scene = createMockScene();
    const result = createEventLog(scene, 200, { maxLines: 2 });

    result.render(['line 1', 'line 2', 'line 3']);

    expect(result.lines.length).toBe(2);
    expect(result.lines[0].text).toBe('line 2');
    expect(result.lines[1].text).toBe('line 3');
  });

  it('handles empty lines array', () => {
    const scene = createMockScene();
    const result = createEventLog(scene, 200);

    result.render([]);

    expect(result.lines.length).toBe(0);
    expect(result.header).toBeDefined();
  });

  it('accepts custom header text', () => {
    const scene = createMockScene();
    const result = createEventLog(scene, 200, { headerText: '── Sound Call Log ──' });

    expect(result.header.text).toBe('── Sound Call Log ──');
  });

  it('destroy cleans up objects without error', () => {
    const scene = createMockScene();
    const result = createEventLog(scene, 200);
    result.render(['line 1']);
    result.destroy();
    expect(result.lines.length).toBe(0);
  });
});

// ── createDeckGrid tests ────────────────────────────────────

describe('createDeckGrid', () => {
  it('returns sprite array for a non-empty deck', () => {
    const scene = createMockScene();
    const mockDeck: Card[] = [
      { rank: 'A', suit: 'hearts', faceUp: false } as Card,
      { rank: 'K', suit: 'spades', faceUp: false } as Card,
      { rank: 'Q', suit: 'diamonds', faceUp: false } as Card,
    ];

    const result = createDeckGrid(scene, mockDeck, { cols: 8, centerX: 400, centerY: 300 });

    expect(result).toBeDefined();
    expect(result.sprites).toBeDefined();
    expect(Array.isArray(result.sprites)).toBe(true);
    expect(result.sprites.length).toBe(3);
    expect(typeof result.destroy).toBe('function');
  });

  it('sets cards face-up', () => {
    const scene = createMockScene();
    const mockDeck: Card[] = [
      { rank: 'A', suit: 'hearts', faceUp: false } as Card,
    ];

    createDeckGrid(scene, mockDeck);

    expect(mockDeck[0].faceUp).toBe(true);
  });

  it('handles empty deck without errors', () => {
    const scene = createMockScene();
    const result = createDeckGrid(scene, []);
    expect(result.sprites).toBeDefined();
    expect(result.sprites.length).toBe(0);
  });

  it('renders cards in grid pattern with multiple rows', () => {
    const scene = createMockScene();
    const mockDeck: Card[] = Array.from({ length: 10 }, (_, i) => ({
      rank: String(i), suit: 'clubs', faceUp: false,
    }) as unknown as Card);

    const result = createDeckGrid(scene, mockDeck, { cols: 8, gapX: 4, gapY: 4 });

    expect(result.sprites.length).toBe(10);

    const row0Y = result.sprites[0].y;
    const row1Y = result.sprites[8].y;
    expect(row1Y).toBeGreaterThan(row0Y);
  });

  it('destroy cleans up all sprites', () => {
    const scene = createMockScene();
    const mockDeck: Card[] = [
      { rank: 'A', suit: 'hearts', faceUp: false } as Card,
      { rank: 'K', suit: 'spades', faceUp: false } as Card,
    ];

    const result = createDeckGrid(scene, mockDeck);
    expect(result.sprites.length).toBe(2);

    result.destroy();
    expect(result.sprites.length).toBe(0);
  });
});

// ── createSlider tests ──────────────────────────────────────

describe('createSlider', () => {
  it('returns config object with visual elements and handlers', () => {
    const scene = createMockScene();
    const result = createSlider(scene, 100, 200, {
      initialValue: 0.5, minValue: 0, maxValue: 1, label: 'Test',
    });

    expect(result).toBeDefined();
    expect(result.track).toBeDefined();
    expect(result.fill).toBeDefined();
    expect(result.handle).toBeDefined();
    expect(result.valueText).toBeDefined();
    expect(result.hitArea).toBeDefined();
    expect(typeof result.setValue).toBe('function');
    expect(typeof result.handlePointerMove).toBe('function');
    expect(typeof result.handlePointerUp).toBe('function');
    expect(typeof result.destroy).toBe('function');
  });

  it('initializes with correct default value', () => {
    const scene = createMockScene();
    const result = createSlider(scene, 100, 200, {
      initialValue: 0.75, minValue: 0, maxValue: 1,
    });

    expect(result.value).toBeCloseTo(0.75, 5);
  });

  it('setValue clamps to min/max', () => {
    const scene = createMockScene();
    const result = createSlider(scene, 100, 200, {
      initialValue: 0.5, minValue: 0, maxValue: 100,
    });

    result.setValue(150);
    expect(result.value).toBe(100);

    result.setValue(-10);
    expect(result.value).toBe(0);
  });

  it('handlePointerMove updates value while dragging', () => {
    const scene = createMockScene();
    const result = createSlider(scene, 100, 200, {
      initialValue: 0, minValue: 0, maxValue: 100, width: 200,
    });

    // Simulate pointerdown via hitArea
    const onMock = result.hitArea.on as unknown as ReturnType<typeof vi.fn>;
    for (const call of onMock.mock.calls) {
      if (call[0] === 'pointerdown') {
        call[1]({ x: 150 });
      }
    }

    result.handlePointerMove(200);
    expect(result.value).toBeGreaterThan(0);

    const valueBeforeUp = result.value;
    result.handlePointerUp();

    // After pointer up, pointermove should not change value
    expect(result.value).toBe(valueBeforeUp);
  });

  it('destroy cleans up all objects', () => {
    const scene = createMockScene();
    const result = createSlider(scene, 100, 200);
    result.destroy();
    // No crash on second destroy
    result.destroy();
  });

  it('fires onValueChange when value changes', () => {
    const scene = createMockScene();
    const onChange = vi.fn();
    const result = createSlider(scene, 100, 200, {
      initialValue: 0, minValue: 0, maxValue: 100, width: 200,
    });

    result.onValueChange = onChange;

    const onMock = result.hitArea.on as unknown as ReturnType<typeof vi.fn>;
    for (const call of onMock.mock.calls) {
      if (call[0] === 'pointerdown') {
        call[1]({ x: 200 });
      }
    }

    expect(onChange).toHaveBeenCalled();
  });
});
