import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TooltipManager,
  clampTooltipToBounds,
  computeViewportTooltipPosition,
} from '../../src/ui/Tooltip';
import type { SettingsPanel } from '../../src/ui/SettingsPanel';

describe('TooltipManager', () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;

  let createdDivs: HTMLElement[];
  let mockScene: any;
  let mockCanvas: HTMLCanvasElement;
  let mockCamera: any;

  beforeEach(() => {
    createdDivs = [];

    mockCamera = { scrollX: 0, scrollY: 0 };
    mockCanvas = {
      getBoundingClientRect: () => ({
        left: 100,
        top: 50,
        width: 800,
        height: 600,
      }),
    } as unknown as HTMLCanvasElement;

    mockScene = {
      game: { canvas: mockCanvas },
      cameras: { main: mockCamera },
      scale: { width: 800, height: 600 },
    };

    (globalThis as any).document = {
      createElement: (tag: string) => {
        if (tag !== 'div') {
          throw new Error(`Unexpected tag: ${tag}`);
        }
        const div = {
          style: {} as Record<string, string>,
          textContent: '',
          remove: vi.fn(),
        };
        createdDivs.push(div as unknown as HTMLElement);
        return div;
      },
      body: {
        appendChild: vi.fn(),
      },
    } as any;

    (globalThis as any).window = {};
  });

  afterEach(() => {
    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
    vi.restoreAllMocks();
  });

  it('creates a hidden DOM element on construction', () => {
    new TooltipManager(mockScene);
    expect(createdDivs).toHaveLength(1);
    expect(createdDivs[0].style.display).toBe('none');
  });

  it('shows tooltip when called with content and coordinates', () => {
    const tooltip = new TooltipManager(mockScene);
    const div = createdDivs[0] as any;

    tooltip.show('Hello World', 200, 150);

    expect(div.textContent).toBe('Hello World');
    expect(div.style.display).toBe('block');
    expect(div.style.left).toMatch(/\d+px/);
    expect(div.style.top).toMatch(/\d+px/);
  });

  it('hides tooltip when hide() is called', () => {
    const tooltip = new TooltipManager(mockScene);
    const div = createdDivs[0] as any;

    tooltip.show('Test', 100, 100);
    expect(div.style.display).toBe('block');

    tooltip.hide();
    expect(div.style.display).toBe('none');
  });

  it('respects SettingsPanel.showTooltips when provided', () => {
    const mockSettingsPanel = { showTooltips: false } as unknown as SettingsPanel;
    const tooltip = new TooltipManager(mockScene, mockSettingsPanel);
    const div = createdDivs[0] as any;

    tooltip.show('Should not show', 100, 100);
    expect(div.style.display).toBe('none');
  });

  it('shows tooltip when SettingsPanel.showTooltips is true', () => {
    const mockSettingsPanel = { showTooltips: true } as unknown as SettingsPanel;
    const tooltip = new TooltipManager(mockScene, mockSettingsPanel);
    const div = createdDivs[0] as any;

    tooltip.show('Should show', 100, 100);
    expect(div.style.display).toBe('block');
    expect(div.textContent).toBe('Should show');
  });

  it('removes DOM element on destroy', () => {
    const tooltip = new TooltipManager(mockScene);
    const div = createdDivs[0] as any;

    tooltip.destroy();
    expect(div.remove).toHaveBeenCalled();
  });

  it('does not throw when document is undefined (SSR-like environment)', () => {
    (globalThis as any).document = undefined;
    const tooltip = new TooltipManager(mockScene);

    // Should not throw
    expect(() => tooltip.show('Test', 100, 100)).not.toThrow();
    expect(() => tooltip.hide()).not.toThrow();
    expect(() => tooltip.destroy()).not.toThrow();
  });

  it('hides tooltip when canvas bounding rect retrieval fails', () => {
    const brokenCanvas = {
      getBoundingClientRect: () => {
        throw new Error('Canvas gone');
      },
    } as unknown as HTMLCanvasElement;

    const brokenScene = {
      ...mockScene,
      game: { canvas: brokenCanvas },
    };

    const tooltip = new TooltipManager(brokenScene);
    const div = createdDivs[0] as any;

    // Should not throw; tooltip should be hidden
    expect(() => tooltip.show('Test', 100, 100)).not.toThrow();
    expect(div.style.display).toBe('none');
  });

  it('positions tooltip relative to canvas position with offset', () => {
    const tooltip = new TooltipManager(mockScene);
    const div = createdDivs[0] as any;

    tooltip.show('Test', 0, 0);

    // Canvas at (100, 50), offset (10, 10) => expected (110, 60)
    expect(div.style.left).toBe('110px');
    expect(div.style.top).toBe('60px');
  });

  it('accounts for camera scroll when positioning', () => {
    mockCamera.scrollX = 50;
    mockCamera.scrollY = 30;

    const tooltip = new TooltipManager(mockScene);
    const div = createdDivs[0] as any;

    tooltip.show('Test', 100, 100);

    // screenY = rect.top + (y - cam.scrollY) * scaleY = 50 + (100 - 30) * 1 = 120
    // screenX = rect.left + (x - cam.scrollX) * scaleX = 100 + (100 - 50) * 1 = 150
    // + offset (10, 10) => (160, 130)
    expect(div.style.left).toBe('160px');
    expect(div.style.top).toBe('130px');
  });

  it('anchors the DOM node with position: fixed (never extends document scroll area)', () => {
    new TooltipManager(mockScene);
    const div = createdDivs[0] as any;
    expect(div.style.position).toBe('fixed');
  });

  it('clamps a DOM tooltip inside the viewport at the bottom-right edge', () => {
    (globalThis as any).window = { innerWidth: 900, innerHeight: 700 };
    const tooltip = new TooltipManager(mockScene);
    const div = createdDivs[0] as any;
    div.offsetWidth = 240;
    div.offsetHeight = 100;

    // Canvas at (100, 50) scale 1: screenX = 100 + x, screenY = 50 + y.
    tooltip.show('edge', 1000, 1000);

    expect(div.style.display).toBe('block');
    // Flipped left/above and then clamped to the 4 px margin:
    // x = 900 - 240 - 4, y = 700 - 100 - 4
    expect(div.style.left).toBe('656px');
    expect(div.style.top).toBe('596px');
  });

  it('clamps a DOM tooltip inside the viewport at the top-left edge', () => {
    (globalThis as any).window = { innerWidth: 900, innerHeight: 700 };
    const tooltip = new TooltipManager(mockScene);
    const div = createdDivs[0] as any;
    div.offsetWidth = 240;
    div.offsetHeight = 100;

    tooltip.show('edge', -5000, -5000);

    expect(div.style.left).toBe('4px');
    expect(div.style.top).toBe('4px');
  });

  it('keeps the DOM tooltip fully inside the viewport with a small margin', () => {
    (globalThis as any).window = { innerWidth: 900, innerHeight: 700 };
    const tooltip = new TooltipManager(mockScene);
    const div = createdDivs[0] as any;
    div.offsetWidth = 240;
    div.offsetHeight = 100;

    tooltip.show('edge', 2000, 2000);

    const left = parseFloat(div.style.left);
    const top = parseFloat(div.style.top);
    expect(left).toBeGreaterThanOrEqual(4);
    expect(top).toBeGreaterThanOrEqual(4);
    expect(left + 240).toBeLessThanOrEqual(900);
    expect(top + 100).toBeLessThanOrEqual(700);
  });

  it('does not create DOM node when phaserRender is provided', () => {
    const renderFn = vi.fn() as unknown as import('../../src/ui/Tooltip').PhaserTooltipRenderFn;
    new TooltipManager(mockScene, undefined, { phaserRender: renderFn });

    expect(createdDivs).toHaveLength(0);
  });

  it('calls phaserRender callback on show', () => {
    const renderFn = vi.fn((_container, _scene, _hide, _ctx) => {
      return _container;
    });

    const tooltip = new TooltipManager(mockScene, undefined, { phaserRender: renderFn });

    const mockContainer = { add: vi.fn(), setPosition: vi.fn(), setDepth: vi.fn() };
    (mockScene.add as any) = { container: vi.fn(() => mockContainer) };

    tooltip.show('hello', 100, 200, { cardName: 'test' });

    expect(renderFn).toHaveBeenCalledTimes(1);
    expect(renderFn).toHaveBeenCalledWith(
      mockContainer,
      mockScene,
      expect.any(Function),
      expect.objectContaining({ content: 'hello', x: 100, y: 200, cardName: 'test' }),
    );
  });

  it('destroys phaser container on hide', () => {
    const destroyFn = vi.fn();
    const mockContainer = {
      add: vi.fn(),
      setPosition: vi.fn(),
      setDepth: vi.fn(),
      destroy: destroyFn,
    } as unknown as Phaser.GameObjects.Container;

    const renderFn = vi.fn(() => mockContainer) as unknown as import('../../src/ui/Tooltip').PhaserTooltipRenderFn;
    (mockScene.add as any) = { container: vi.fn(() => mockContainer) };

    const tooltip = new TooltipManager(mockScene, undefined, { phaserRender: renderFn });
    tooltip.show('hello', 0, 0);

    expect(mockContainer.destroy).not.toHaveBeenCalled();

    tooltip.hide();
    expect(mockContainer.destroy).toHaveBeenCalledTimes(1);
  });

  it('respects SettingsPanel.showTooltips in Phaser mode', () => {
    const mockSettingsPanel = { showTooltips: false } as any;

    (mockScene.add as any) = { container: vi.fn() };

    const tooltip = new TooltipManager(mockScene, mockSettingsPanel, { phaserRender: () => ({}) as any });
    tooltip.show('should not show', 0, 0);

    expect((mockScene.add as any).container).not.toHaveBeenCalled();
  });

  it('destroy cleans up both DOM and Phaser resources', () => {
    const tooltip = new TooltipManager(mockScene);
    tooltip.show('Test', 0, 0);

    // DOM mode – destroy should remove the node
    const div = createdDivs[0] as any;
    tooltip.destroy();
    expect(div.remove).toHaveBeenCalled();
  });
});

describe('clampTooltipToBounds', () => {
  const BOUNDS_W = 800;
  const BOUNDS_H = 600;
  const TOOLTIP_W = 200;
  const TOOLTIP_H = 120;

  it('leaves a tooltip that already fits untouched', () => {
    expect(clampTooltipToBounds(300, 200, TOOLTIP_W, TOOLTIP_H, BOUNDS_W, BOUNDS_H, 4)).toEqual({
      x: 300,
      y: 200,
    });
  });

  it('clamps the left edge to the margin', () => {
    expect(clampTooltipToBounds(-50, 200, TOOLTIP_W, TOOLTIP_H, BOUNDS_W, BOUNDS_H, 4)).toEqual({
      x: 4,
      y: 200,
    });
  });

  it('clamps the top edge to the margin', () => {
    expect(clampTooltipToBounds(300, -50, TOOLTIP_W, TOOLTIP_H, BOUNDS_W, BOUNDS_H, 4)).toEqual({
      x: 300,
      y: 4,
    });
  });

  it('clamps the right edge so the whole box stays inside', () => {
    expect(clampTooltipToBounds(700, 200, TOOLTIP_W, TOOLTIP_H, BOUNDS_W, BOUNDS_H, 4)).toEqual({
      x: BOUNDS_W - TOOLTIP_W - 4,
      y: 200,
    });
  });

  it('clamps the bottom edge so the whole box stays inside', () => {
    expect(clampTooltipToBounds(300, 550, TOOLTIP_W, TOOLTIP_H, BOUNDS_W, BOUNDS_H, 4)).toEqual({
      x: 300,
      y: BOUNDS_H - TOOLTIP_H - 4,
    });
  });

  it('clamps both axes independently for a corner position', () => {
    expect(clampTooltipToBounds(900, 700, TOOLTIP_W, TOOLTIP_H, BOUNDS_W, BOUNDS_H, 4)).toEqual({
      x: BOUNDS_W - TOOLTIP_W - 4,
      y: BOUNDS_H - TOOLTIP_H - 4,
    });
  });

  it('pins an oversized tooltip to the top-left margin', () => {
    // A tooltip wider/taller than its bounds cannot fit – partial
    // visibility is accepted and documented.
    expect(clampTooltipToBounds(100, 100, BOUNDS_W + 200, BOUNDS_H + 200, BOUNDS_W, BOUNDS_H, 4)).toEqual({
      x: 4,
      y: 4,
    });
  });

  it('defaults the margin to 4 px', () => {
    expect(clampTooltipToBounds(-10, -10, TOOLTIP_W, TOOLTIP_H, BOUNDS_W, BOUNDS_H)).toEqual({
      x: 4,
      y: 4,
    });
  });
});

describe('computeViewportTooltipPosition', () => {
  const viewport = { viewportWidth: 900, viewportHeight: 700 };
  const size = { tooltipWidth: 240, tooltipHeight: 100 };

  it('places the tooltip below-right of the hover point when it fits', () => {
    expect(
      computeViewportTooltipPosition({ screenX: 100, screenY: 100, ...size, ...viewport }),
    ).toEqual({ x: 110, y: 110 });
  });

  it('flips to the left when the right edge would overflow', () => {
    // screenX 700 + offset 10 + width 240 overflows 900 → flip to 700 - 10 - 240 = 450
    expect(
      computeViewportTooltipPosition({ screenX: 700, screenY: 100, ...size, ...viewport }),
    ).toEqual({ x: 450, y: 110 });
  });

  it('flips above when the bottom edge would overflow', () => {
    // screenY 650 + offset 10 + height 100 overflows 700 → flip to 650 - 10 - 100 = 540
    expect(
      computeViewportTooltipPosition({ screenX: 100, screenY: 650, ...size, ...viewport }),
    ).toEqual({ x: 110, y: 540 });
  });

  it('clamps to the margin when the hover point is off the top-left corner', () => {
    expect(
      computeViewportTooltipPosition({ screenX: -5000, screenY: -5000, ...size, ...viewport }),
    ).toEqual({ x: 4, y: 4 });
  });

  it('keeps the whole box visible at the bottom-right corner', () => {
    const pos = computeViewportTooltipPosition({
      screenX: 5000,
      screenY: 5000,
      ...size,
      ...viewport,
    });
    expect(pos.x).toBe(900 - 240 - 4);
    expect(pos.y).toBe(700 - 100 - 4);
  });

  it('pins an oversized tooltip to the margin', () => {
    const pos = computeViewportTooltipPosition({
      screenX: 400,
      screenY: 300,
      tooltipWidth: 1200,
      tooltipHeight: 900,
      viewportWidth: 900,
      viewportHeight: 700,
    });
    expect(pos).toEqual({ x: 4, y: 4 });
  });

  it('honours custom offsets', () => {
    const pos = computeViewportTooltipPosition({
      screenX: 100,
      screenY: 100,
      ...size,
      ...viewport,
      offsetX: 20,
      offsetY: 30,
    });
    expect(pos).toEqual({ x: 120, y: 130 });
  });
});
