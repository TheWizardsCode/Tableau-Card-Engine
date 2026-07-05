/**
 * Unit tests for the shared scene header scaffolding:
 *   - createSceneTitle      (SceneHeader.ts)
 *   - createSceneMenuButton (SceneHeader.ts)
 *   - createSceneHeader     (SceneHeader.ts)
 *   - exported constants
 *
 * All Phaser scene interactions are mocked to run in Node.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSceneTitle,
  createSceneMenuButton,
  createSceneHeader,
  SCENE_HEADER_Y,
  SCENE_MENU_BUTTON_X,
  SCENE_TITLE_FONT_SIZE,
  SCENE_TITLE_COLOR,
  SCENE_MENU_BUTTON_FONT_SIZE,
  SCENE_MENU_BUTTON_COLOR,
  SCENE_MENU_BUTTON_HOVER_COLOR,
  SCENE_MENU_BUTTON_WIDTH,
  SCENE_MENU_BUTTON_HEIGHT,
} from '../../src/ui/SceneHeader';
import { GAME_W, FONT_FAMILY } from '../../src/ui/constants';

// ── Mock helpers ────────────────────────────────────────────

/** Create a mock Phaser.GameObjects.Text. */
function mockText() {
  return {
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
}

/** Create a mock Phaser.GameObjects.Rectangle. */
function mockRect() {
  const handlers: Record<string, Function> = {};
  return {
    setStrokeStyle: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(),
    on: vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
      return handlers;
    }),
    destroy: vi.fn(),
    input: { enabled: true },
    _handlers: handlers,
  };
}

/** Create a mock Phaser.GameObjects.Container. */
function mockContainer() {
  const children: any[] = [];
  return {
    add: vi.fn((child: any) => { children.push(child); }),
    setDepth: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    list: children,
  };
}

/** Create a minimal mock Phaser.Scene. */
function mockScene() {
  const mockRectInstance = mockRect();
  const mockContainerInstance = mockContainer();
  const mockTextInstance = mockText();
  const add = {
    text: vi.fn(() => mockTextInstance),
    rectangle: vi.fn(() => mockRectInstance),
    container: vi.fn(() => mockContainerInstance),
  };
  return {
    add,
    scene: {
      start: vi.fn(),
    },
    /** Test helper to access the created rectangle. */
    _mockRect: mockRectInstance,
    /** Test helper to access the created container. */
    _mockContainer: mockContainerInstance,
    /** Test helper to access the created text. */
    _mockText: mockTextInstance,
  } as unknown as Phaser.Scene & { _mockRect: any; _mockContainer: any; _mockText: any };
}

// ── Constants ───────────────────────────────────────────────

describe('scene header constants', () => {
  it('exports SCENE_HEADER_Y = 14', () => {
    expect(SCENE_HEADER_Y).toBe(14);
  });

  it('exports SCENE_MENU_BUTTON_X = 14', () => {
    expect(SCENE_MENU_BUTTON_X).toBe(14);
  });

  it('exports SCENE_TITLE_FONT_SIZE = 18px', () => {
    expect(SCENE_TITLE_FONT_SIZE).toBe('18px');
  });

  it('exports SCENE_TITLE_COLOR = #ffffff', () => {
    expect(SCENE_TITLE_COLOR).toBe('#ffffff');
  });

  it('exports SCENE_MENU_BUTTON_FONT_SIZE = 12px', () => {
    expect(SCENE_MENU_BUTTON_FONT_SIZE).toBe('12px');
  });

  it('exports SCENE_MENU_BUTTON_COLOR = #ffcc88 (action button gold)', () => {
    expect(SCENE_MENU_BUTTON_COLOR).toBe('#ffcc88');
  });

  it('exports SCENE_MENU_BUTTON_HOVER_COLOR = #88ff88', () => {
    expect(SCENE_MENU_BUTTON_HOVER_COLOR).toBe('#88ff88');
  });

  it('exports SCENE_MENU_BUTTON_WIDTH = 60', () => {
    expect(SCENE_MENU_BUTTON_WIDTH).toBe(60);
  });

  it('exports SCENE_MENU_BUTTON_HEIGHT = 24', () => {
    expect(SCENE_MENU_BUTTON_HEIGHT).toBe(24);
  });
});

// ── createSceneTitle ────────────────────────────────────────

describe('createSceneTitle', () => {
  let scene: ReturnType<typeof mockScene>;

  beforeEach(() => {
    scene = mockScene();
  });

  it('creates title text centered at GAME_W/2 with default Y', () => {
    createSceneTitle(scene, 'Test Game');

    expect(scene.add.text).toHaveBeenCalledWith(
      GAME_W / 2,
      SCENE_HEADER_Y,
      'Test Game',
      {
        fontSize: SCENE_TITLE_FONT_SIZE,
        color: SCENE_TITLE_COLOR,
        fontFamily: FONT_FAMILY,
      },
    );
  });

  it('centers title with setOrigin(0.5)', () => {
    const title = createSceneTitle(scene, 'My Game');
    expect(title.setOrigin).toHaveBeenCalledWith(0.5);
  });

  it('accepts custom Y position', () => {
    createSceneTitle(scene, 'Shifted', { y: 30 });

    expect(scene.add.text).toHaveBeenCalledWith(
      GAME_W / 2,
      30,
      'Shifted',
      expect.objectContaining({ fontSize: SCENE_TITLE_FONT_SIZE }),
    );
  });

  it('accepts custom font size and color', () => {
    createSceneTitle(scene, 'Custom', {
      fontSize: '24px',
      color: '#ff0000',
    });

    expect(scene.add.text).toHaveBeenCalledWith(
      GAME_W / 2,
      SCENE_HEADER_Y,
      'Custom',
      expect.objectContaining({
        fontSize: '24px',
        color: '#ff0000',
      }),
    );
  });

  it('accepts custom font family', () => {
    createSceneTitle(scene, 'Mono', { fontFamily: 'monospace' });

    expect(scene.add.text).toHaveBeenCalledWith(
      GAME_W / 2,
      SCENE_HEADER_Y,
      'Mono',
      expect.objectContaining({ fontFamily: 'monospace' }),
    );
  });
});

// ── createSceneMenuButton ───────────────────────────────────

describe('createSceneMenuButton', () => {
  let scene: ReturnType<typeof mockScene>;

  beforeEach(() => {
    scene = mockScene();
  });

  it('returns a Container', () => {
    const btn = createSceneMenuButton(scene);
    // The mock container doesn't have instanceof, so check its structure
    expect(btn).toBeDefined();
    expect(typeof btn.add).toBe('function');
  });

  it('creates a container with background rectangle and label', () => {
    createSceneMenuButton(scene);

    expect(scene.add.container).toHaveBeenCalledOnce();
    expect(scene.add.rectangle).toHaveBeenCalledOnce();
    expect(scene.add.text).toHaveBeenCalledOnce();
  });

  it('positions the container at default header position', () => {
    createSceneMenuButton(scene);

    // Container is positioned at (x + w/2, y + h/2)
    expect(scene.add.container).toHaveBeenCalledWith(
      SCENE_MENU_BUTTON_X + SCENE_MENU_BUTTON_WIDTH / 2,
      SCENE_HEADER_Y + SCENE_MENU_BUTTON_HEIGHT / 2,
    );
  });

  it('creates label text with "Menu"', () => {
    createSceneMenuButton(scene);

    expect(scene.add.text).toHaveBeenCalledWith(
      0, 0, 'Menu',
      expect.objectContaining({
        fontSize: SCENE_MENU_BUTTON_FONT_SIZE,
        color: expect.any(String),
      }),
    );
  });

  it('navigates to GameSelectorScene on pointerdown', () => {
    createSceneMenuButton(scene);

    const rect = (scene as any)._mockRect;
    rect._handlers['pointerdown']();
    expect(scene.scene.start).toHaveBeenCalledWith('GameSelectorScene');
  });

  it('accepts custom position', () => {
    createSceneMenuButton(scene, { x: 50, y: 20 });

    expect(scene.add.container).toHaveBeenCalledWith(
      50 + SCENE_MENU_BUTTON_WIDTH / 2,
      20 + SCENE_MENU_BUTTON_HEIGHT / 2,
    );
  });

  it('accepts custom width and height', () => {
    createSceneMenuButton(scene, { width: 80, height: 30 });

    expect(scene.add.container).toHaveBeenCalledWith(
      SCENE_MENU_BUTTON_X + 80 / 2,
      SCENE_HEADER_Y + 30 / 2,
    );
  });
});

// ── createSceneHeader ───────────────────────────────────────

describe('createSceneHeader', () => {
  let scene: ReturnType<typeof mockScene>;

  beforeEach(() => {
    scene = mockScene();
  });

  it('creates both title and menu button', () => {
    const result = createSceneHeader(scene, 'My Game');

    expect(result.title).toBeDefined();
    expect(result.menuButton).toBeDefined();
    // Two calls: one for title, one for menu button
    expect(scene.add.text).toHaveBeenCalledTimes(2);
    // One container for menu button
    expect(scene.add.container).toHaveBeenCalledTimes(1);
    // One rectangle for menu button
    expect(scene.add.rectangle).toHaveBeenCalledTimes(1);
  });

  it('menu button navigates to GameSelectorScene', () => {
    createSceneHeader(scene, 'Nav Test');

    const rect = (scene as any)._mockRect;
    rect._handlers['pointerdown']();
    expect(scene.scene.start).toHaveBeenCalledWith('GameSelectorScene');
  });
});
