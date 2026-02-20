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
} from '../../src/ui/SceneHeader';
import { GAME_W, FONT_FAMILY } from '../../src/ui/constants';

// ── Mock helpers ────────────────────────────────────────────

/** Create a mock Phaser.GameObjects.Text. */
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
  };
  return text;
}

/** Create a minimal mock Phaser.Scene. */
function mockScene() {
  return {
    add: {
      text: vi.fn(() => mockText()),
    },
    scene: {
      start: vi.fn(),
    },
  } as unknown as Phaser.Scene;
}

// ── Constants ───────────────────────────────────────────────

describe('scene header constants', () => {
  it('exports SCENE_HEADER_Y = 14', () => {
    expect(SCENE_HEADER_Y).toBe(14);
  });

  it('exports SCENE_MENU_BUTTON_X = 30', () => {
    expect(SCENE_MENU_BUTTON_X).toBe(30);
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

  it('exports SCENE_MENU_BUTTON_COLOR = #aaccaa', () => {
    expect(SCENE_MENU_BUTTON_COLOR).toBe('#aaccaa');
  });

  it('exports SCENE_MENU_BUTTON_HOVER_COLOR = #88ff88', () => {
    expect(SCENE_MENU_BUTTON_HOVER_COLOR).toBe('#88ff88');
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

  it('creates [ Menu ] button at default position', () => {
    createSceneMenuButton(scene);

    expect(scene.add.text).toHaveBeenCalledWith(
      SCENE_MENU_BUTTON_X,
      SCENE_HEADER_Y,
      '[ Menu ]',
      {
        fontSize: SCENE_MENU_BUTTON_FONT_SIZE,
        color: SCENE_MENU_BUTTON_COLOR,
        fontFamily: FONT_FAMILY,
      },
    );
  });

  it('centers with setOrigin(0.5)', () => {
    const btn = createSceneMenuButton(scene);
    expect(btn.setOrigin).toHaveBeenCalledWith(0.5);
  });

  it('sets interactive with hand cursor', () => {
    const btn = createSceneMenuButton(scene);
    expect(btn.setInteractive).toHaveBeenCalledWith({ useHandCursor: true });
  });

  it('navigates to GameSelectorScene on pointerdown', () => {
    const btn = createSceneMenuButton(scene);
    const handlers = (btn as any)._handlers;

    handlers['pointerdown']();
    expect(scene.scene.start).toHaveBeenCalledWith('GameSelectorScene');
  });

  it('changes color on pointerover and restores on pointerout', () => {
    const btn = createSceneMenuButton(scene);
    const handlers = (btn as any)._handlers;

    handlers['pointerover']();
    expect(btn.setColor).toHaveBeenCalledWith(SCENE_MENU_BUTTON_HOVER_COLOR);

    handlers['pointerout']();
    expect(btn.setColor).toHaveBeenCalledWith(SCENE_MENU_BUTTON_COLOR);
  });

  it('accepts custom position', () => {
    createSceneMenuButton(scene, { x: 50, y: 20 });

    expect(scene.add.text).toHaveBeenCalledWith(
      50, 20, '[ Menu ]',
      expect.objectContaining({ fontSize: SCENE_MENU_BUTTON_FONT_SIZE }),
    );
  });

  it('accepts custom colors', () => {
    const btn = createSceneMenuButton(scene, {
      color: '#ffffff',
      hoverColor: '#cccccc',
    });
    const handlers = (btn as any)._handlers;

    handlers['pointerover']();
    expect(btn.setColor).toHaveBeenCalledWith('#cccccc');

    handlers['pointerout']();
    expect(btn.setColor).toHaveBeenCalledWith('#ffffff');
  });

  it('accepts custom font size and family', () => {
    createSceneMenuButton(scene, {
      fontSize: '16px',
      fontFamily: 'Courier',
    });

    expect(scene.add.text).toHaveBeenCalledWith(
      SCENE_MENU_BUTTON_X,
      SCENE_HEADER_Y,
      '[ Menu ]',
      expect.objectContaining({
        fontSize: '16px',
        fontFamily: 'Courier',
      }),
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
  });

  it('uses default Y for both elements', () => {
    createSceneHeader(scene, 'Default Y');

    // Both calls should use SCENE_HEADER_Y
    const calls = (scene.add.text as any).mock.calls;
    // Title call: y = SCENE_HEADER_Y
    expect(calls[0][1]).toBe(SCENE_HEADER_Y);
    // Menu button call: y = SCENE_HEADER_Y
    expect(calls[1][1]).toBe(SCENE_HEADER_Y);
  });

  it('passes custom Y to both elements', () => {
    createSceneHeader(scene, 'Custom Y', 30);

    const calls = (scene.add.text as any).mock.calls;
    expect(calls[0][1]).toBe(30);
    expect(calls[1][1]).toBe(30);
  });

  it('menu button navigates to GameSelectorScene', () => {
    const result = createSceneHeader(scene, 'Nav Test');
    const handlers = (result.menuButton as any)._handlers;

    handlers['pointerdown']();
    expect(scene.scene.start).toHaveBeenCalledWith('GameSelectorScene');
  });
});
