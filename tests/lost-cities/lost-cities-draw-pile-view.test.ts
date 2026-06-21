/**
 * DrawPileView unit tests
 *
 * Validates that DrawPileView positions the count text below the card bottom
 * edge to prevent overlap with card artwork.
 *
 * Bug: CG-0MQK10H46004OVCC — Draw pile count in Lost Cities misaligned
 *
 * NOTE: Phaser is mocked to avoid its window-dependent OS detection in
 * Node.js unit-test environments. The mock provides a minimal stub that
 * allows PileView and its subclasses to construct test instances.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CARD_H } from '../../example-games/lost-cities/scenes/LostCitiesConstants';
import { PileView } from '../../src/ui/PileView';

// Mock Phaser before any module that imports it is loaded.
// Phaser's OS detection (node_modules/phaser/src/device/OS.js) accesses
// `window` at module scope, which crashes in Node.js.
vi.mock('phaser', () => {
  // Return a minimal Phaser-compatible default export.
  // The only thing PileView needs from Phaser at construction time is
  // `scene.add.image()` and `scene.add.text()`, which we provide via
  // our own mock scene object — so the Phaser module itself only needs
  // to exist without crashing when imported.
  const mockScene = {
    add: {
      image: vi.fn(),
      text: vi.fn(),
    },
  };
  const PhaserMock: Record<string, unknown> = {
    Scene: vi.fn().mockImplementation(() => mockScene),
    GameObjects: {
      Image: class {},
      Text: class {},
      Graphics: class {},
    },
    Display: {
      Color: {
        HexStringToColor: vi.fn().mockReturnValue({ color: 0 }),
      },
    },
    Input: {
      Pointer: class {},
    },
  };
  return {
    default: PhaserMock,
    ...PhaserMock,
  };
});

// Also mock the ui barrel module that LostCitiesConstants imports from,
// to prevent it from trying to load the hiDpiText side-effect module
// which accesses Phaser's GameObjects.Text.prototype.
vi.mock('../../example-games/lost-cities/../../../src/ui', () => ({
  GAME_W: 960,
  GAME_H: 600,
  FONT_FAMILY: 'monospace',
}));

// ── Minimal Phaser scene mock ─────────────────────────────

function createMockScene(): any {
  const images: any[] = [];
  const texts: any[] = [];

  const createImage = vi.fn((x: number, y: number, texture: string) => {
    const img = {
      x,
      y,
      texture: { key: texture },
      setInteractive: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      clearTint: vi.fn().mockReturnThis(),
      setAlpha: vi.fn().mockReturnThis(),
      setTexture: vi.fn().mockImplementation((tex: string) => {
        (img as any).texture.key = tex;
        return img;
      }),
      setVisible: vi.fn().mockReturnThis(),
      setOrigin: vi.fn().mockReturnThis(),
      setDisplaySize: vi.fn().mockReturnThis(),
      setDepth: vi.fn().mockReturnThis(),
      setPosition: vi.fn().mockReturnThis(),
      rotation: 0,
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
      active: true,
      input: { enabled: true },
    };
    images.push(img);
    return img;
  });

  const createText = vi.fn((x: number, y: number, text: string, _style?: any) => {
    const txt = {
      x,
      y,
      text,
      width: text.length * 8,
      setOrigin: vi.fn().mockReturnThis(),
      setColor: vi.fn().mockReturnThis(),
      setText: vi.fn().mockImplementation((t: string) => { (txt as any).text = t; return txt; }),
      destroy: vi.fn(),
      active: true,
    };
    texts.push(txt);
    return txt;
  });

  return {
    add: {
      image: vi.fn().mockImplementation(createImage),
      text: vi.fn().mockImplementation(createText),
      graphics: vi.fn().mockReturnValue({
        fillStyle: vi.fn().mockReturnThis(),
        fillRoundedRect: vi.fn().mockReturnThis(),
        lineStyle: vi.fn().mockReturnThis(),
        strokeRoundedRect: vi.fn().mockReturnThis(),
        clear: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      }),
    },
    _images: images,
    _texts: texts,
  };
}

// ── Tests ───────────────────────────────────────────────────

describe('DrawPileView', () => {
  let scene: ReturnType<typeof createMockScene>;

  beforeEach(() => {
    scene = createMockScene();
  });

  it('positions count text below the card bottom edge (countOffsetY > CARD_H/2)', async () => {
    const mod = await import(
      '../../example-games/lost-cities/scenes/LostCitiesRenderer'
    );
    const DrawPileViewCtor = mod.DrawPileView;

    const testCardH = CARD_H; // 130
    const drawPileY = 200;
    const centerX = 400;

    // DrawPileView constructor: (scene, opts: { x, y, cardW, cardH })
    const dpv = new DrawPileViewCtor(scene, {
      x: centerX,
      y: drawPileY + testCardH / 2,
      cardW: 95,
      cardH: testCardH,
    }) as PileView;

    const sprite = dpv.getSprite();
    const countText = dpv.getCountText();

    // countOffsetY should be cardH/2 + 16 = 65 + 16 = 81
    const expectedOffset = testCardH / 2 + 16;
    const actualOffset = countText.y - sprite.y;

    expect(actualOffset).toBeGreaterThan(testCardH / 2);
    expect(actualOffset).toBe(expectedOffset);

    dpv.destroy();
  });

  it('extends PileView and has the expected prototype chain', async () => {
    const mod = await import(
      '../../example-games/lost-cities/scenes/LostCitiesRenderer'
    );
    const DrawPileViewCtor = mod.DrawPileView;

    const dpv = new DrawPileViewCtor(scene, {
      x: 400,
      y: 300,
      cardW: 95,
      cardH: 130,
    });

    expect(dpv).toBeInstanceOf(PileView);

    dpv.destroy();
  });

  it('count text remains positioned below card bottom edge in empty state', async () => {
    const mod = await import(
      '../../example-games/lost-cities/scenes/LostCitiesRenderer'
    );
    const DrawPileViewCtor = mod.DrawPileView;

    const testCardH = 130;
    const drawPileY = 200;
    const centerX = 400;

    const dpv = new DrawPileViewCtor(scene, {
      x: centerX,
      y: drawPileY + testCardH / 2,
      cardW: 95,
      cardH: testCardH,
    }) as PileView;

    // Test initial state (empty draw pile) - count text should show "Draw Pile: 0"
    // at the correct position
    const expectedOffset = testCardH / 2 + 16;
    const actualOffset = dpv.getCountText().y - dpv.getSprite().y;

    expect(actualOffset).toBe(expectedOffset);
    expect(dpv.getCountText().text).toBe('Draw Pile: 0');

    dpv.destroy();
  });
});
