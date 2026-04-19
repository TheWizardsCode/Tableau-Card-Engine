/**
 * Unit tests for createCardGame -- the shared Phaser game factory.
 *
 * Uses vi.mock to replace Phaser so we can verify the config that
 * createCardGame passes to `new Phaser.Game(config)` without needing
 * a real browser or Phaser runtime.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Polyfill window for Node environment ───────────────────

const fakeWindow: Record<string, unknown> = {
  location: { search: '' },
  devicePixelRatio: 2,
};

if (typeof globalThis.window === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).window = fakeWindow;
}

// ── Mocks ──────────────────────────────────────────────────

const { MockPhaserGame } = vi.hoisted(() => {
  const MockPhaserGame = vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
  }));
  return { MockPhaserGame };
});

vi.mock('phaser', () => ({
  default: {
    Game: MockPhaserGame,
    AUTO: 0,
    Scale: {
      FIT: 1,
      CENTER_BOTH: 2,
    },
    GameObjects: {
      Text: {
        prototype: {
          updateText: vi.fn(),
        },
      },
    },
  },
}));

// Import after mocks are set up
import { createCardGame } from '../../src/ui/createCardGame';
import type { CardGameOptions } from '../../src/ui/createCardGame';

// ── Test setup ─────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Clean up window exposure from previous tests
  delete (window as unknown as Record<string, unknown>).__PHASER_GAME__;
});

// ── Tests ──────────────────────────────────────────────────

describe('createCardGame', () => {
  const minimalOptions: CardGameOptions = {
    backgroundColor: '#2d572c',
    scenes: [],
  };

  describe('required options', () => {
    it('passes backgroundColor to Phaser.Game config', () => {
      createCardGame({ backgroundColor: '#ff0000', scenes: [] });

      const config = MockPhaserGame.mock.calls[0][0];
      expect(config.backgroundColor).toBe('#ff0000');
    });

    it('passes scenes to Phaser.Game config', () => {
      const FakeScene = class {};
      createCardGame({ backgroundColor: '#000', scenes: [FakeScene] });

      const config = MockPhaserGame.mock.calls[0][0];
      expect(config.scene).toEqual([FakeScene]);
    });
  });

  describe('default config values', () => {
    it('uses default parent "game-container"', () => {
      createCardGame(minimalOptions);
      const config = MockPhaserGame.mock.calls[0][0];
      expect(config.parent).toBe('game-container');
    });

    it('uses default width 1280', () => {
      createCardGame(minimalOptions);
      const config = MockPhaserGame.mock.calls[0][0];
      expect(config.width).toBe(1280);
    });

    it('uses default height 720', () => {
      createCardGame(minimalOptions);
      const config = MockPhaserGame.mock.calls[0][0];
      expect(config.height).toBe(720);
    });

    it('sets scale mode to FIT with CENTER_BOTH', () => {
      createCardGame(minimalOptions);
      const config = MockPhaserGame.mock.calls[0][0];
      expect(config.scale).toEqual({
        mode: 1, // Phaser.Scale.FIT
        autoCenter: 2, // Phaser.Scale.CENTER_BOTH
        autoRound: true,
      });
    });

    it('enables roundPixels in render config', () => {
      createCardGame(minimalOptions);
      const config = MockPhaserGame.mock.calls[0][0];
      expect(config.render.roundPixels).toBe(true);
    });

    it('does not disable WebAudio', () => {
      createCardGame(minimalOptions);
      const config = MockPhaserGame.mock.calls[0][0];
      expect(config.audio).toEqual({ disableWebAudio: false });
    });
  });

  describe('optional overrides', () => {
    it('allows overriding parent', () => {
      createCardGame({ ...minimalOptions, parent: 'my-container' });
      const config = MockPhaserGame.mock.calls[0][0];
      expect(config.parent).toBe('my-container');
    });

    it('allows overriding width and height', () => {
      createCardGame({ ...minimalOptions, width: 800, height: 600 });
      const config = MockPhaserGame.mock.calls[0][0];
      expect(config.width).toBe(800);
      expect(config.height).toBe(600);
    });

    it('merges render overrides with defaults', () => {
      createCardGame({
        ...minimalOptions,
        render: { preserveDrawingBuffer: true },
      });
      const config = MockPhaserGame.mock.calls[0][0];
      expect(config.render.roundPixels).toBe(true);
      expect(config.render.preserveDrawingBuffer).toBe(true);
    });

    it('passes callbacks config when provided', () => {
      const preBoot = vi.fn();
      createCardGame({ ...minimalOptions, callbacks: { preBoot } });
      const config = MockPhaserGame.mock.calls[0][0];
      expect(config.callbacks.preBoot).toBe(preBoot);
    });

    it('does not include callbacks when not provided', () => {
      createCardGame(minimalOptions);
      const config = MockPhaserGame.mock.calls[0][0];
      expect(config.callbacks).toBeUndefined();
    });
  });

  describe('exposeOnWindow', () => {
    it('does not expose game on window by default', () => {
      createCardGame(minimalOptions);
      expect(
        (window as unknown as Record<string, unknown>).__PHASER_GAME__,
      ).toBeUndefined();
    });

    it('exposes game on window.__PHASER_GAME__ when enabled', () => {
      const game = createCardGame({
        ...minimalOptions,
        exposeOnWindow: true,
      });
      expect(
        (window as unknown as Record<string, unknown>).__PHASER_GAME__,
      ).toBe(game);
    });
  });

  describe('return value', () => {
    it('returns the Phaser.Game instance', () => {
      const game = createCardGame(minimalOptions);
      expect(game).toBeDefined();
      expect(MockPhaserGame).toHaveBeenCalledOnce();
    });
  });
});
