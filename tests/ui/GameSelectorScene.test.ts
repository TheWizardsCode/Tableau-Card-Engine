/**
 * Unit tests for GameSelectorScene:
 *   - init() catalogue loading (from data vs. registry)
 *   - preload() thumbnail asset loading
 *   - create() card layout (text-only vs. thumbnail variants)
 *   - hasThumbnail() helper
 *   - Interactive hover and click behavior
 *
 * All Phaser scene interactions are mocked to run in Node.
 * The phaser module is mocked so that GameSelectorScene can extend
 * Phaser.Scene without triggering browser-only code paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Phaser before importing GameSelectorScene.
// Provide a minimal Scene base class that the scene can extend.
vi.mock('phaser', () => {
  class Scene {
    constructor(_config: unknown) {
      // no-op: real Phaser.Scene constructor wires up subsystems
    }
  }
  return {
    default: { Scene },
    Scene,
  };
});

import {
  GameSelectorScene,
  REGISTRY_KEY_GAMES,
} from '../../src/ui/GameSelectorScene';
import type { GameEntry } from '../../src/ui/GameSelectorScene';

// ── Test data ──────────────────────────────────────────────

const GAME_NO_THUMB: GameEntry = {
  sceneKey: 'TestScene',
  title: 'Test Game',
  description: 'A test game without a thumbnail.',
};

const GAME_WITH_THUMB: GameEntry = {
  sceneKey: 'ThumbScene',
  title: 'Thumbnail Game',
  description: 'A test game with a thumbnail.',
  thumbnail: 'games/test/thumbnail',
};

// ── Mock helpers ────────────────────────────────────────────

/** Create a mock Phaser.GameObjects.Text. */
function mockText() {
  const handlers: Record<string, Function> = {};
  const text = {
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    setCrop: vi.fn().mockReturnThis(),
    on: vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
      return text;
    }),
    destroy: vi.fn(),
    width: 100,
    height: 20,
    _handlers: handlers,
  };
  return text;
}

/** Create a mock Phaser.GameObjects.Graphics. */
function mockGraphics() {
  return {
    fillStyle: vi.fn().mockReturnThis(),
    fillRoundedRect: vi.fn().mockReturnThis(),
    lineStyle: vi.fn().mockReturnThis(),
    strokeRoundedRect: vi.fn().mockReturnThis(),
    clear: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
}

/** Create a mock Phaser.GameObjects.Image. */
function mockImage() {
  return {
    setDisplaySize: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
}

/** Create a mock Phaser.GameObjects.Zone. */
function mockZone() {
  const handlers: Record<string, Function> = {};
  const zone = {
    setInteractive: vi.fn().mockReturnThis(),
    on: vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
      return zone;
    }),
    destroy: vi.fn(),
    _handlers: handlers,
  };
  return zone;
}

/**
 * Inject mock Phaser subsystems into a GameSelectorScene instance.
 * This replaces the properties that Phaser.Scene would normally set up
 * during its boot sequence.
 */
function injectMocks(
  scene: GameSelectorScene,
  opts: { textureKeys?: string[] } = {},
) {
  const textureKeys = new Set(opts.textureKeys ?? []);

  const mocks = {
    cameras: {
      main: { setBackgroundColor: vi.fn() },
    },
    add: {
      text: vi.fn(() => mockText()),
      graphics: vi.fn(() => mockGraphics()),
      image: vi.fn(() => mockImage()),
      zone: vi.fn(() => mockZone()),
    },
    load: {
      image: vi.fn(),
    },
    textures: {
      exists: vi.fn((key: string) => textureKeys.has(key)),
    },
    registry: {
      get: vi.fn(),
    },
    scene: {
      start: vi.fn(),
    },
  };

  // Assign mocks as own properties on the scene instance.
  // These shadow the prototype-chain properties Phaser.Scene would provide.
  Object.assign(scene, mocks);

  return mocks;
}

// ── Tests ──────────────────────────────────────────────────

describe('GameSelectorScene', () => {
  let scene: GameSelectorScene;

  beforeEach(() => {
    scene = new GameSelectorScene();
  });

  // ── Static properties ──────────────────────────────────

  describe('static properties', () => {
    it('has KEY = "GameSelectorScene"', () => {
      expect(GameSelectorScene.KEY).toBe('GameSelectorScene');
    });

    it('exports REGISTRY_KEY_GAMES', () => {
      expect(REGISTRY_KEY_GAMES).toBe('gameSelector.games');
    });
  });

  // ── init() ─────────────────────────────────────────────

  describe('init()', () => {
    it('accepts games from init data', () => {
      const mocks = injectMocks(scene);
      scene.init({ games: [GAME_NO_THUMB] });

      // Verify games were stored by calling create and checking
      // that a card was rendered (at least one graphics + text call)
      scene.create();
      expect(mocks.add.graphics).toHaveBeenCalled();
    });

    it('falls back to registry when no init data provided', () => {
      const mocks = injectMocks(scene);
      mocks.registry.get.mockReturnValue([GAME_NO_THUMB]);

      scene.init({});
      scene.create();

      expect(mocks.registry.get).toHaveBeenCalledWith(REGISTRY_KEY_GAMES);
      expect(mocks.add.graphics).toHaveBeenCalled();
    });

    it('shows no cards when no games provided via data or registry', () => {
      const mocks = injectMocks(scene);
      mocks.registry.get.mockReturnValue(undefined);

      scene.init({});
      scene.create();

      // Title + Subtitle text are created, but no graphics (no cards)
      expect(mocks.add.graphics).not.toHaveBeenCalled();
    });
  });

  // ── preload() ──────────────────────────────────────────

  describe('preload()', () => {
    it('loads thumbnail assets for games that have a thumbnail key', () => {
      const mocks = injectMocks(scene);
      scene.init({ games: [GAME_WITH_THUMB, GAME_NO_THUMB] });
      scene.preload();

      expect(mocks.load.image).toHaveBeenCalledTimes(1);
      expect(mocks.load.image).toHaveBeenCalledWith(
        'games/test/thumbnail',
        'assets/games/test/thumbnail.png',
      );
    });

    it('does not load anything when no games have thumbnails', () => {
      const mocks = injectMocks(scene);
      scene.init({ games: [GAME_NO_THUMB] });
      scene.preload();

      expect(mocks.load.image).not.toHaveBeenCalled();
    });

    it('does not load anything when game list is empty', () => {
      const mocks = injectMocks(scene);
      scene.init({ games: [] });
      scene.preload();

      expect(mocks.load.image).not.toHaveBeenCalled();
    });
  });

  // ── create() card layout ──────────────────────────────

  describe('create() -- card layout', () => {
    it('renders heading text (title and subtitle)', () => {
      const mocks = injectMocks(scene);
      scene.init({ games: [GAME_NO_THUMB] });
      scene.create();

      // First two text calls are the heading title and subtitle
      const calls = mocks.add.text.mock.calls as unknown[][];
      expect(calls.length).toBeGreaterThanOrEqual(2);

      // Title
      expect(calls[0][2]).toBe('Tableau Card Engine');
      // Subtitle
      expect(calls[1][2]).toBe('Select a game to play');
    });

    it('renders one card per game entry', () => {
      const mocks = injectMocks(scene);
      const games = [GAME_NO_THUMB, { ...GAME_NO_THUMB, sceneKey: 'S2', title: 'Game 2' }];
      scene.init({ games });
      scene.create();

      // Each card creates one graphics object for the background
      expect(mocks.add.graphics).toHaveBeenCalledTimes(2);
      // Each card creates one interactive zone
      expect(mocks.add.zone).toHaveBeenCalledTimes(2);
    });

    it('sets background color on the main camera', () => {
      const mocks = injectMocks(scene);
      scene.init({ games: [] });
      scene.create();

      expect(mocks.cameras.main.setBackgroundColor).toHaveBeenCalledWith('#1a2a1a');
    });
  });

  // ── Text-only card (no thumbnail) ─────────────────────

  describe('text-only card (no thumbnail)', () => {
    it('does not add an image when no thumbnail is available', () => {
      const mocks = injectMocks(scene);
      scene.init({ games: [GAME_NO_THUMB] });
      scene.create();

      expect(mocks.add.image).not.toHaveBeenCalled();
    });

    it('centers description text with origin(0.5, 0.5)', () => {
      const mocks = injectMocks(scene);
      scene.init({ games: [GAME_NO_THUMB] });
      scene.create();

      // Find the description text call -- it contains the game description
      const textCalls = mocks.add.text.mock.calls as unknown[][];
      const textResults = mocks.add.text.mock.results as { value: ReturnType<typeof mockText> }[];
      const descIdx = textCalls.findIndex((c) => c[2] === GAME_NO_THUMB.description);
      expect(descIdx).not.toBe(-1);

      // The returned text mock should have setOrigin called with (0.5, 0.5)
      // for centered layout
      expect(textResults[descIdx].value.setOrigin).toHaveBeenCalledWith(0.5, 0.5);
    });

    it('uses center align for description text', () => {
      const mocks = injectMocks(scene);
      scene.init({ games: [GAME_NO_THUMB] });
      scene.create();

      const textCalls = mocks.add.text.mock.calls as unknown[][];
      const descCall = textCalls.find((c) => c[2] === GAME_NO_THUMB.description);
      expect(descCall).toBeDefined();
      expect(descCall![3]).toEqual(expect.objectContaining({ align: 'center' }));
    });
  });

  // ── Thumbnail card ────────────────────────────────────

  describe('thumbnail card', () => {
    it('adds an image when the thumbnail texture exists', () => {
      const mocks = injectMocks(scene, {
        textureKeys: ['games/test/thumbnail'],
      });
      scene.init({ games: [GAME_WITH_THUMB] });
      scene.create();

      expect(mocks.add.image).toHaveBeenCalledTimes(1);
      expect(mocks.add.image).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        'games/test/thumbnail',
      );
    });

    it('sets thumbnail display size to 120x68', () => {
      const mocks = injectMocks(scene, {
        textureKeys: ['games/test/thumbnail'],
      });
      scene.init({ games: [GAME_WITH_THUMB] });
      scene.create();

      const imgResult = mocks.add.image.mock.results[0];
      expect(imgResult.value.setDisplaySize).toHaveBeenCalledWith(120, 68);
    });

    it('uses left align for description text when thumbnail is present', () => {
      const mocks = injectMocks(scene, {
        textureKeys: ['games/test/thumbnail'],
      });
      scene.init({ games: [GAME_WITH_THUMB] });
      scene.create();

      const textCalls = mocks.add.text.mock.calls as unknown[][];
      const descCall = textCalls.find((c) => c[2] === GAME_WITH_THUMB.description);
      expect(descCall).toBeDefined();
      expect(descCall![3]).toEqual(expect.objectContaining({ align: 'left' }));
    });

    it('sets left-aligned origin (0, 0.5) for description when thumbnail is present', () => {
      const mocks = injectMocks(scene, {
        textureKeys: ['games/test/thumbnail'],
      });
      scene.init({ games: [GAME_WITH_THUMB] });
      scene.create();

      const textCalls = mocks.add.text.mock.calls as unknown[][];
      const textResults = mocks.add.text.mock.results as { value: ReturnType<typeof mockText> }[];
      const descIdx = textCalls.findIndex((c) => c[2] === GAME_WITH_THUMB.description);
      expect(descIdx).not.toBe(-1);
      expect(textResults[descIdx].value.setOrigin).toHaveBeenCalledWith(0, 0.5);
    });

    it('falls back to text-only when thumbnail key is set but texture not loaded', () => {
      // Texture does NOT exist in the texture manager
      const mocks = injectMocks(scene, { textureKeys: [] });
      scene.init({ games: [GAME_WITH_THUMB] });
      scene.create();

      // No image should be added
      expect(mocks.add.image).not.toHaveBeenCalled();

      // Description should be centered (text-only fallback)
      const textCalls = mocks.add.text.mock.calls as unknown[][];
      const descCall = textCalls.find((c) => c[2] === GAME_WITH_THUMB.description);
      expect(descCall).toBeDefined();
      expect(descCall![3]).toEqual(expect.objectContaining({ align: 'center' }));
    });
  });

  // ── Interactive behavior ──────────────────────────────

  describe('interactive card behavior', () => {
    it('creates an interactive zone with hand cursor for each card', () => {
      const mocks = injectMocks(scene);
      scene.init({ games: [GAME_NO_THUMB] });
      scene.create();

      expect(mocks.add.zone).toHaveBeenCalledTimes(1);
      const zoneResult = mocks.add.zone.mock.results[0];
      expect(zoneResult.value.setInteractive).toHaveBeenCalledWith({
        useHandCursor: true,
      });
    });

    it('starts the game scene on pointerdown', () => {
      const mocks = injectMocks(scene);
      scene.init({ games: [GAME_NO_THUMB] });
      scene.create();

      const zone = mocks.add.zone.mock.results[0].value;
      zone._handlers['pointerdown']();

      expect(mocks.scene.start).toHaveBeenCalledWith('TestScene');
    });

    it('changes card colors on pointerover and restores on pointerout', () => {
      const mocks = injectMocks(scene);
      scene.init({ games: [GAME_NO_THUMB] });
      scene.create();

      const zone = mocks.add.zone.mock.results[0].value;
      const graphics = mocks.add.graphics.mock.results[0].value;

      // Trigger hover
      zone._handlers['pointerover']();

      // Card background should be redrawn (graphics.clear + redraw)
      expect(graphics.clear).toHaveBeenCalled();

      // Trigger unhover
      zone._handlers['pointerout']();

      // Card background should be redrawn again
      expect(graphics.clear).toHaveBeenCalledTimes(2);
    });
  });

  // ── Mixed game list ───────────────────────────────────

  describe('mixed game list (with and without thumbnails)', () => {
    it('renders thumbnail for games with texture and text-only for others', () => {
      const mocks = injectMocks(scene, {
        textureKeys: ['games/test/thumbnail'],
      });
      scene.init({ games: [GAME_WITH_THUMB, GAME_NO_THUMB] });
      scene.create();

      // One image for the thumbnail game, none for the text-only game
      expect(mocks.add.image).toHaveBeenCalledTimes(1);

      // Two cards total (two graphics + two zones)
      expect(mocks.add.graphics).toHaveBeenCalledTimes(2);
      expect(mocks.add.zone).toHaveBeenCalledTimes(2);
    });
  });
});
