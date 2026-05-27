import { describe, it, expect, vi } from 'vitest';

// ── Phaser mock ─────────────────────────────────────────────────────────────

vi.mock('phaser', () => {
  const RectConstructor = vi.fn(function (this: any, _x: number, _y: number, w: number, h: number) {
    this.width = w;
    this.height = h;
  });
  (RectConstructor as any).Contains = vi.fn();

  return {
    default: {
      GameObjects: {},
      Geom: { Rectangle: RectConstructor },
    },
    GameObjects: {},
    Geom: { Rectangle: RectConstructor },
  };
});

// ── SvgHelpers mock ─────────────────────────────────────────────────────────

const getOrCreateTextureMock = vi.hoisted(() => vi.fn(
  (_scene: unknown, templateId: string, _svgText: string, w: number, h: number) => ({
    key: `svg_${templateId}_${w}x${h}`,
    ready: true,
  }),
));

vi.mock('../../core-engine/SvgHelpers', () => ({
  getOrCreateTexture: getOrCreateTextureMock,
}));

// ── Imports (after mocks) ───────────────────────────────────────────────────

import Phaser from 'phaser';
import {
  createHudContainer,
  createGameZone,
  createHudText,
  attachHudTooltipZone,
  createActionButton,
  renderCardSvg,
} from '../../src/ui/Renderer';

// ── Test helpers ────────────────────────────────────────────────────────────

function createMockScene(): Phaser.Scene {
  return {
    add: {
      container: vi.fn(() => {
        const children: any[] = [];
        const c: any = {
          list: children,
          _children: children,
          _depth: 0,
          setDepth: vi.fn(function (this: any, d: number) { this._depth = d; return c; }),
          setScale: vi.fn().mockReturnThis(),
          add: vi.fn(function (this: any, obj: any) { children.push(obj); return c; }),
          remove: vi.fn(),
        };
        return c;
      }),
      text: vi.fn(() => {
        const t: any = {
          width: 80,
          height: 20,
          x: 0,
          y: 0,
          _originX: 0,
          _originY: 0,
          _text: '',
          setText: vi.fn(function (this: any, v: string) { this._text = v; return this; }),
          setOrigin: vi.fn(function (this: any, ox: number, oy: number) { this._originX = ox; this._originY = oy; return this; }),
          setInteractive: vi.fn().mockReturnThis(),
          on: vi.fn().mockReturnThis(),
        };
        return t;
      }),
      rectangle: vi.fn(() => {
        const r: any = {
          _strokeWidth: 1,
          _strokeColor: 0xffffff,
          setStrokeStyle: vi.fn(function (this: any, w: number, c: number) { this._strokeWidth = w; this._strokeColor = c; return this; }),
          setFillStyle: vi.fn().mockReturnThis(),
          setInteractive: vi.fn().mockReturnThis(),
          on: vi.fn().mockReturnThis(),
        };
        return r;
      }),
      image: vi.fn(() => ({
        setDisplaySize: vi.fn().mockReturnThis(),
        setTexture: vi.fn().mockReturnThis(),
      })),
    },
    textures: {
      exists: vi.fn(() => true),
    } as unknown as Phaser.Textures.TextureManager,
  } as unknown as Phaser.Scene;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('createHudContainer', () => {
  it('returns a container with depth 1000', () => {
    const scene = createMockScene();
    const container = createHudContainer(scene);
    expect((container as any)._depth).toBe(1000);
  });

  it('adds the container to the scene', () => {
    const scene = createMockScene();
    createHudContainer(scene);
    expect(scene.add.container).toHaveBeenCalled();
  });

  it('does not throw when setDepth is unavailable', () => {
    const scene = {
      add: {
        container: vi.fn(() => ({
          list: [],
          setDepth: vi.fn(() => { throw new Error('no depth'); }),
          add: vi.fn(),
          setScale: vi.fn(),
          remove: vi.fn(),
        })),
      },
    } as unknown as Phaser.Scene;
    expect(() => createHudContainer(scene)).not.toThrow();
  });
});

describe('createGameZone', () => {
  it('creates a container at the specified position', () => {
    const scene = createMockScene();
    const zone = createGameZone(scene, 100, 200, 400, 300, 'market');
    expect(scene.add.container).toHaveBeenCalledWith(100, 200);
    expect((zone as any).__zoneWidth).toBe(400);
    expect((zone as any).__zoneHeight).toBe(300);
    expect((zone as any).__zoneName).toBe('market');
  });

  it('works without a name', () => {
    const scene = createMockScene();
    const zone = createGameZone(scene, 0, 0, 100, 100);
    expect((zone as any).__zoneWidth).toBe(100);
    expect((zone as any).__zoneHeight).toBe(100);
    expect((zone as any).__zoneName).toBeUndefined();
  });

  it('stores negative dimensions as provided', () => {
    const scene = createMockScene();
    const zone = createGameZone(scene, 0, 0, -10, -5);
    expect((zone as any).__zoneWidth).toBe(-10);
    expect((zone as any).__zoneHeight).toBe(-5);
  });
});

describe('createHudText', () => {
  it('creates text with default options', () => {
    const scene = createMockScene();
    const text = createHudText(scene, 50, 100, 'Coins: 10', '#ffcc44');
    expect(scene.add.text).toHaveBeenCalledWith(50, 100, 'Coins: 10', expect.objectContaining({
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffcc44',
      fontFamily: expect.any(String),
    }));
    expect((text as any)._originX).toBe(0);
    expect((text as any)._originY).toBe(0.5);
  });

  it('creates text with custom font size', () => {
    const scene = createMockScene();
    createHudText(scene, 0, 0, 'Score', '#fff', { fontSize: '20px' });
    expect(scene.add.text).toHaveBeenCalledWith(0, 0, 'Score', expect.objectContaining({
      fontSize: '20px',
    }));
  });

  it('handles empty string text', () => {
    const scene = createMockScene();
    createHudText(scene, 0, 0, '', '#fff');
    expect(scene.add.text).toHaveBeenCalledWith(0, 0, '', expect.any(Object));
  });

  it('respects custom origin overrides', () => {
    const scene = createMockScene();
    const text = createHudText(scene, 0, 0, 'Test', '#fff', { originX: 0.5, originY: 0 });
    expect((text as any)._originX).toBe(0.5);
    expect((text as any)._originY).toBe(0);
  });
});

describe('attachHudTooltipZone', () => {
  it('attaches pointerover, pointerout, and pointerdown handlers', () => {
    const scene = createMockScene();
    const textObj = scene.add.text(0, 0, 'test', {}) as any;
    attachHudTooltipZone(scene, textObj, 'test-label', () => 'tooltip content');
    expect(textObj.setInteractive).toHaveBeenCalled();
    expect(textObj.on).toHaveBeenCalledWith('pointerover', expect.any(Function));
    expect(textObj.on).toHaveBeenCalledWith('pointerout', expect.any(Function));
    expect(textObj.on).toHaveBeenCalledWith('pointerdown', expect.any(Function));
  });

  it('handles null tooltipManager gracefully', () => {
    const scene = { ...createMockScene(), tooltipManager: null } as unknown as Phaser.Scene;
    const textObj = scene.add.text(0, 0, 'test', {}) as any;
    attachHudTooltipZone(scene, textObj, 'label', () => 'content');
  });

  it('handles empty string content builder result', () => {
    const scene = createMockScene();
    const textObj = scene.add.text(0, 0, 'test', {}) as any;
    attachHudTooltipZone(scene, textObj, 'label', () => '');
    expect(textObj.on).toHaveBeenCalledWith('pointerover', expect.any(Function));
  });
});

describe('createActionButton', () => {
  it('creates a button container with background and label', () => {
    const scene = createMockScene();
    const btn = createActionButton(scene, 10, 20, 120, 'Click Me', () => {});
    expect(scene.add.container).toHaveBeenCalledWith(70, 36);
    expect(scene.add.rectangle).toHaveBeenCalled();
    expect(scene.add.text).toHaveBeenCalled();
    const container = btn as any;
    expect(container._children.length).toBeGreaterThanOrEqual(2);
  });

  it('attaches click handler when not disabled', () => {
    const scene = createMockScene();
    const callback = vi.fn();
    createActionButton(scene, 0, 0, 100, 'Btn', callback);
    const rect = (scene.add.rectangle as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(rect.setInteractive).toHaveBeenCalled();
    expect(rect.on).toHaveBeenCalledWith('pointerdown', callback);
  });

  it('does not attach interaction when disabled', () => {
    const scene = createMockScene();
    createActionButton(scene, 0, 0, 100, 'Disabled', () => {}, { disabled: true });
    const rect = (scene.add.rectangle as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(rect.setInteractive).not.toHaveBeenCalled();
  });

  it('applies custom styling options', () => {
    const scene = createMockScene();
    createActionButton(scene, 0, 0, 100, 'Styled', () => {}, {
      height: 48,
      fillColor: 0xff0000,
      strokeColor: 0x00ff00,
      textColor: '#0000ff',
      fontSize: '18px',
    });
    expect(scene.add.container).toHaveBeenCalledWith(50, 24);
  });

  it('handles zero width button', () => {
    const scene = createMockScene();
    createActionButton(scene, 0, 0, 0, 'Zero', () => {});
    expect(scene.add.container).toHaveBeenCalledWith(0, 16);
  });

  it('handles empty string label', () => {
    const scene = createMockScene();
    createActionButton(scene, 0, 0, 100, '', () => {});
    expect(scene.add.text).toHaveBeenCalledWith(0, 0, '', expect.any(Object));
  });
});


describe('renderCardSvg', () => {
  it('returns an object with key, ready, and optional promise', () => {
    const scene = createMockScene();
    const result = renderCardSvg(scene, 'business-card-1', '<svg>...</svg>', 96, 130);
    expect(result).toHaveProperty('key');
    expect(typeof result.key).toBe('string');
    expect(result).toHaveProperty('ready');
    expect(typeof result.ready).toBe('boolean');
  });

  it('delegates to getOrCreateTexture with correct scene', () => {
    const scene = createMockScene();
    const result = renderCardSvg(scene, 'test-card', '<svg/>', 100, 100);
    // The key should contain the templateId we passed
    expect(result.key).toContain('test-card');
  });

  it('handles empty template id without throwing', () => {
    const scene = createMockScene();
    expect(() => renderCardSvg(scene, '', '<svg/>', 96, 130)).not.toThrow();
  });

  it('handles zero dimensions without throwing', () => {
    const scene = createMockScene();
    expect(() => renderCardSvg(scene, 'card', '<svg/>', 0, 0)).not.toThrow();
  });
});
