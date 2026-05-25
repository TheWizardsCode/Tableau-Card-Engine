import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TooltipManager } from '../../src/ui/Tooltip';
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
});
