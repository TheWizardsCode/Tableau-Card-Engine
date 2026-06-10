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
  (_scene: unknown, _templateId: string, _svgText: string, _w: number, _h: number) => ({
    key: 'mock_key',
    ready: true,
  }),
));

const makeTextureKeyMock = vi.hoisted(() => vi.fn(
  (templateId: string, w: number, h: number, _dpr: number) =>
    `svg_${templateId}_${w}x${h}`,
));

// Mock must match the path used by the module under test (renderCardSvg.ts),
// which imports via '../../core-engine/SvgHelpers'. Vitest resolves from the
// test file's directory, so we need the path from tests/ui/ to src/core-engine/.
vi.mock('../../src/core-engine/SvgHelpers', () => ({
  getOrCreateTexture: getOrCreateTextureMock,
  makeTextureKey: makeTextureKeyMock,
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
  markHudTransient,
  clearTransientHud,
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
          setInteractive: vi.fn().mockReturnThis(),
          on: vi.fn().mockReturnThis(),
          add: vi.fn(function (this: any, obj: any) { children.push(obj); return c; }),
          remove: vi.fn(),
        };
        return c;
      }),
      text: vi.fn((x: number, y: number) => {
        const t: any = {
          width: 80,
          height: 20,
          x: x ?? 0,
          y: y ?? 0,
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

  it('does not set __zoneName when name is explicitly undefined', () => {
    const scene = createMockScene();
    const zone = createGameZone(scene, 50, 75, 200, 150, undefined);
    expect((zone as any).__zoneWidth).toBe(200);
    expect((zone as any).__zoneHeight).toBe(150);
    expect((zone as any).__zoneName).toBeUndefined();
  });

  it('treats empty string name as no-name (falsy)', () => {
    const scene = createMockScene();
    const zone = createGameZone(scene, 0, 0, 100, 100, '');
    // Empty string is falsy, so __zoneName is not set
    expect((zone as any).__zoneName).toBeUndefined();
  });

  it('returns a container with expected interface methods', () => {
    const scene = createMockScene();
    const zone = createGameZone(scene, 0, 0, 100, 100, 'testZone');
    expect(typeof (zone as any).setDepth).toBe('function');
    expect(typeof (zone as any).add).toBe('function');
    expect(typeof (zone as any).remove).toBe('function');
    expect(Array.isArray((zone as any).list)).toBe(true);
  });

  it('supports typical zone label conventions (hudContainer, streetContainer)', () => {
    const scene = createMockScene();
    const hudZone = createGameZone(scene, 0, 0, 1280, 720, 'hudContainer');
    const streetZone = createGameZone(scene, 0, 200, 1280, 400, 'streetContainer');
    expect((hudZone as any).__zoneName).toBe('hudContainer');
    expect((streetZone as any).__zoneName).toBe('streetContainer');
  });

  it('stores negative dimensions as provided', () => {
    const scene = createMockScene();
    const zone = createGameZone(scene, 0, 0, -10, -5);
    expect((zone as any).__zoneWidth).toBe(-10);
    expect((zone as any).__zoneHeight).toBe(-5);
  });
});

describe('markHudTransient', () => {
  it('tags a game object with _hudTransient: true', () => {
    const scene = createMockScene();
    const textObj = scene.add.text(0, 0, 'test', {}) as any;
    const tagged = markHudTransient(textObj);
    expect(tagged._hudTransient).toBe(true);
  });

  it('returns the same object reference', () => {
    const scene = createMockScene();
    const rect = scene.add.rectangle() as any;
    const tagged = markHudTransient(rect);
    expect(tagged).toBe(rect);
  });

  it('works with any game object type', () => {
    const scene = createMockScene();
    const container = scene.add.container() as any;
    const tagged = markHudTransient(container);
    expect(tagged._hudTransient).toBe(true);
  });
});

describe('clearTransientHud', () => {
  it('removes only children tagged with _hudTransient', () => {
    const scene = createMockScene();
    const container = scene.add.container() as any;

    const transientText = scene.add.text(0, 0, 'transient', {}) as any;
    markHudTransient(transientText);
    container.add(transientText);

    const persistentRect = scene.add.rectangle() as any;
    // NOT tagged
    container.add(persistentRect);

    clearTransientHud(container);

    expect(container.remove).toHaveBeenCalledWith(transientText, true);
    expect(container.remove).not.toHaveBeenCalledWith(persistentRect, true);
  });

  it('removes all transient children when multiple exist', () => {
    const scene = createMockScene();
    const container = scene.add.container() as any;

    const t1 = markHudTransient(scene.add.text(0, 0, 'a', {}) as any);
    const t2 = markHudTransient(scene.add.text(0, 20, 'b', {}) as any);
    const t3 = markHudTransient(scene.add.rectangle() as any);
    container.add(t1);
    container.add(t2);
    container.add(t3);

    clearTransientHud(container);

    expect(container.remove).toHaveBeenCalledTimes(3);
  });

  it('does nothing when no transient children exist', () => {
    const scene = createMockScene();
    const container = scene.add.container() as any;

    const persistent = scene.add.rectangle() as any;
    container.add(persistent);

    clearTransientHud(container);

    expect(container.remove).not.toHaveBeenCalled();
  });

  it('does nothing on an empty container', () => {
    const scene = createMockScene();
    const container = scene.add.container() as any;

    clearTransientHud(container);

    expect(container.remove).not.toHaveBeenCalled();
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

  it('respects align option', () => {
    const scene = createMockScene();
    createHudText(scene, 0, 0, 'Aligned', '#fff', { align: 'center' });
    expect(scene.add.text).toHaveBeenCalledWith(0, 0, 'Aligned', expect.objectContaining({
      align: 'center',
    }));
  });

  it('respects lineSpacing option', () => {
    const scene = createMockScene();
    createHudText(scene, 0, 0, 'Spaced', '#fff', { lineSpacing: 4 });
    expect(scene.add.text).toHaveBeenCalledWith(0, 0, 'Spaced', expect.objectContaining({
      lineSpacing: 4,
    }));
  });

  it('respects custom fontFamily override', () => {
    const scene = createMockScene();
    createHudText(scene, 0, 0, 'Custom', '#fff', { fontFamily: 'Courier, monospace' });
    expect(scene.add.text).toHaveBeenCalledWith(0, 0, 'Custom', expect.objectContaining({
      fontFamily: 'Courier, monospace',
    }));
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

  it('shows tooltip on pointerover', () => {
    const tooltipManager = { show: vi.fn(), hide: vi.fn() };
    const scene = { ...createMockScene(), tooltipManager } as unknown as Phaser.Scene;
    const textObj = scene.add.text(50, 100, 'test', {}) as any;
    attachHudTooltipZone(scene, textObj, 'label', () => 'hovered!');
    const pointeroverHandler = (textObj.on as ReturnType<typeof vi.fn>).mock.calls
      .find((call: any[]) => call[0] === 'pointerover');
    expect(pointeroverHandler).toBeDefined();
    pointeroverHandler![1]();
    expect(tooltipManager.show).toHaveBeenCalledWith('hovered!', textObj.x, textObj.y - 10);
  });

  it('hides tooltip on pointerout', () => {
    const tooltipManager = { show: vi.fn(), hide: vi.fn() };
    const scene = { ...createMockScene(), tooltipManager } as unknown as Phaser.Scene;
    const textObj = scene.add.text(50, 100, 'test', {}) as any;
    attachHudTooltipZone(scene, textObj, 'label', () => 'content');
    const pointeroutHandler = (textObj.on as ReturnType<typeof vi.fn>).mock.calls
      .find((call: any[]) => call[0] === 'pointerout');
    expect(pointeroutHandler).toBeDefined();
    pointeroutHandler![1]();
    expect(tooltipManager.hide).toHaveBeenCalledTimes(1);
  });

  it('toggles tooltip on pointerdown', () => {
    const tooltipManager = { show: vi.fn(), hide: vi.fn() };
    const scene = { ...createMockScene(), tooltipManager } as unknown as Phaser.Scene;
    const textObj = scene.add.text(50, 100, 'test', {}) as any;
    attachHudTooltipZone(scene, textObj, 'label', () => 'tapped!');
    const pointerdownHandler = (textObj.on as ReturnType<typeof vi.fn>).mock.calls
      .find((call: any[]) => call[0] === 'pointerdown');
    expect(pointerdownHandler).toBeDefined();
    // First tap: show
    pointerdownHandler![1]();
    expect(tooltipManager.show).toHaveBeenCalledWith('tapped!', textObj.x, textObj.y - 10);
    // Second tap: hide
    pointerdownHandler![1]();
    expect(tooltipManager.hide).toHaveBeenCalledTimes(1);
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

  it('applies custom depth to the container', () => {
    const scene = createMockScene();
    const btn = createActionButton(scene, 0, 0, 100, 'Deep', () => {}, { depth: 500 });
    expect((btn as any)._depth).toBe(500);
  });

  it('does not set depth when depth option is omitted', () => {
    const scene = createMockScene();
    const btn = createActionButton(scene, 0, 0, 100, 'NoDepth', () => {});
    expect((btn as any)._depth).toBe(0);
  });

  it('fires callback when pointerdown is triggered on an enabled button', () => {
    const scene = createMockScene();
    const callback = vi.fn();
    createActionButton(scene, 0, 0, 100, 'Click', callback);
    const rect = (scene.add.rectangle as ReturnType<typeof vi.fn>).mock.results[0].value;
    const pointerdownHandler = (rect.on as ReturnType<typeof vi.fn>).mock.calls
      .find((call: any[]) => call[0] === 'pointerdown');
    expect(pointerdownHandler).toBeDefined();
    pointerdownHandler![1]();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('applies hover effect: scale increase and yellow stroke on pointerover', () => {
    const scene = createMockScene();
    const btn = createActionButton(scene, 0, 0, 100, 'Hover', () => {});
    const rect = (scene.add.rectangle as ReturnType<typeof vi.fn>).mock.results[0].value;
    const pointeroverHandler = (rect.on as ReturnType<typeof vi.fn>).mock.calls
      .find((call: any[]) => call[0] === 'pointerover');
    expect(pointeroverHandler).toBeDefined();
    pointeroverHandler![1]();
    expect(btn.setScale).toHaveBeenCalledWith(1.05);
    expect(rect.setStrokeStyle).toHaveBeenCalledWith(2, 0xffdd44);
  });

  it('restores default scale and stroke on pointerout', () => {
    const scene = createMockScene();
    const btn = createActionButton(scene, 0, 0, 100, 'Out', () => {});
    const rect = (scene.add.rectangle as ReturnType<typeof vi.fn>).mock.results[0].value;
    const pointeroutHandler = (rect.on as ReturnType<typeof vi.fn>).mock.calls
      .find((call: any[]) => call[0] === 'pointerout');
    expect(pointeroutHandler).toBeDefined();
    pointeroutHandler![1]();
    expect(btn.setScale).toHaveBeenCalledWith(1.0);
    expect(rect.setStrokeStyle).toHaveBeenCalledWith(1, 0xaa8855);
  });

  it('disabled button does not fire callback even if pointerdown is triggered', () => {
    const scene = createMockScene();
    const callback = vi.fn();
    createActionButton(scene, 0, 0, 100, 'Disabled', callback, { disabled: true });
    const rect = (scene.add.rectangle as ReturnType<typeof vi.fn>).mock.results[0].value;
    const pointerdownCalls = (rect.on as ReturnType<typeof vi.fn>).mock.calls
      .filter((call: any[]) => call[0] === 'pointerdown');
    expect(pointerdownCalls).toHaveLength(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it('disabled button uses grey text color', () => {
    const scene = createMockScene();
    createActionButton(scene, 0, 0, 100, 'Disabled', () => {}, { disabled: true });
    const textCall = (scene.add.text as ReturnType<typeof vi.fn>).mock.calls
      .find((call: any[]) => call[2] === 'Disabled');
    expect(textCall).toBeDefined();
    expect(textCall![3].color).toBe('#666666');
  });

  it('enabled button uses configured text color', () => {
    const scene = createMockScene();
    createActionButton(scene, 0, 0, 100, 'Enabled', () => {}, { textColor: '#aabbcc' });
    const textCall = (scene.add.text as ReturnType<typeof vi.fn>).mock.calls
      .find((call: any[]) => call[2] === 'Enabled');
    expect(textCall).toBeDefined();
    expect(textCall![3].color).toBe('#aabbcc');
  });

  it('applies custom fill alpha', () => {
    const scene = createMockScene();
    createActionButton(scene, 0, 0, 100, 'Alpha', () => {}, { fillAlpha: 0.5 });
    const rectCall = (scene.add.rectangle as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(rectCall[5]).toBe(0.5);
  });
});


// ── Extended mock scene with texture exists support ─────────────────────────

function createMockSceneWithTextures(textureExists = true): Phaser.Scene {
  const children: any[] = [];
  const container: any = {
    list: children,
    _children: children,
    _depth: 0,
    setDepth: vi.fn(function (this: any, d: number) { this._depth = d; return container; }),
    setScale: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    add: vi.fn(function (this: any, obj: any) { children.push(obj); return container; }),
    remove: vi.fn(),
  };

  return {
    add: {
      container: vi.fn(() => container),
      text: vi.fn((x: number, y: number) => {
        const t: any = {
          width: 80,
          height: 20,
          x: x ?? 0,
          y: y ?? 0,
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
      exists: vi.fn(() => textureExists),
    } as unknown as Phaser.Textures.TextureManager,
  } as unknown as Phaser.Scene;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('renderCardSvg', () => {
  it('creates an Image when texture exists and adds to container', () => {
    const scene = createMockSceneWithTextures(true);
    const container = scene.add.container();
    const result = renderCardSvg(scene, container, 'business-card-1', 96, 130);
    expect(scene.add.image).toHaveBeenCalledWith(0, 0, expect.stringContaining('business-card-1'));
    const img = (scene.add.image as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(img.setDisplaySize).toHaveBeenCalledWith(96, 130);
    expect(container.add).toHaveBeenCalledWith(img);
    expect(result).toBe(img);
  });

  it('creates a fallback Rectangle when texture does not exist', () => {
    const scene = createMockSceneWithTextures(false);
    const container = scene.add.container();
    const result = renderCardSvg(scene, container, 'missing-card', 96, 130);
    expect(scene.add.rectangle).toHaveBeenCalledWith(0, 0, 96, 130, 0x333333);
    const rect = (scene.add.rectangle as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(rect.setStrokeStyle).toHaveBeenCalledWith(1, 0x666666);
    expect(container.add).toHaveBeenCalledWith(rect);
    expect(result).toBe(rect);
  });

  it('calls requestTexture when texture is missing', () => {
    const scene = createMockSceneWithTextures(false);
    const container = scene.add.container();
    renderCardSvg(scene, container, 'gen-card', 96, 130);
    expect(getOrCreateTextureMock).toHaveBeenCalled();
  });

  it('uses custom makeKey callback', () => {
    const scene = createMockSceneWithTextures(true);
    const container = scene.add.container();
    const customKey = 'custom_key_123';
    renderCardSvg(scene, container, 'any-id', 96, 130, {
      makeKey: () => customKey,
    });
    expect(scene.add.image).toHaveBeenCalledWith(0, 0, customKey);
  });

  it('uses custom requestTexture callback', () => {
    const scene = createMockSceneWithTextures(false);
    const container = scene.add.container();
    const customRequest = vi.fn();
    renderCardSvg(scene, container, 'any-id', 96, 130, {
      requestTexture: customRequest,
    });
    expect(customRequest).toHaveBeenCalledWith(scene, 'any-id', 96, 130);
  });

  it('uses custom fallback colours', () => {
    const scene = createMockSceneWithTextures(false);
    const container = scene.add.container();
    renderCardSvg(scene, container, 'any-id', 96, 130, {
      fallbackFill: 0xff0000,
      fallbackStroke: 0x00ff00,
    });
    expect(scene.add.rectangle).toHaveBeenCalledWith(0, 0, 96, 130, 0xff0000);
    const rect = (scene.add.rectangle as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(rect.setStrokeStyle).toHaveBeenCalledWith(1, 0x00ff00);
  });

  it('handles empty template id without throwing', () => {
    const scene = createMockSceneWithTextures(true);
    const container = scene.add.container();
    expect(() => renderCardSvg(scene, container, '', 96, 130)).not.toThrow();
  });

  it('handles zero dimensions without throwing', () => {
    const scene = createMockSceneWithTextures(true);
    const container = scene.add.container();
    expect(() => renderCardSvg(scene, container, 'card', 0, 0)).not.toThrow();
  });

  it('works with missing texture manager gracefully', () => {
    const scene = createMockScene();
    (scene as any).textures = null;
    const container = scene.add.container();
    // When textures is null, exists() throws/returns falsy, so fallback path is taken
    expect(() => renderCardSvg(scene, container, 'card', 96, 130)).not.toThrow();
  });
});
