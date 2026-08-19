/**
 * Main Street: Game-Over Win Celebration / Loss Sting Tests
 *
 * Unit tests for `MainStreetAnimator.animateGameOver` — the win confetti
 * burst + victory fanfare and the loss sting SFX + board dim pulse that
 * play when `showGameOverOverlay` reveals the final game-over panel.
 *
 * These run in the Node unit environment, so the browser-only Phaser and
 * `src/ui` modules are mocked. The tests assert observable behaviour via
 * the public animator API: the `GAME_WIN` / `GAME_LOST` SFX keys, the 24
 * confetti rectangles at depth 100.5 (win), the single dim rectangle at
 * depth 99.5 (loss), the tween contracts, and the reduced-motion /
 * replay-mode degradation (spec AC3).
 *
 * @module tests/main-street/game-over-animator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phaser is browser-only; the animator only uses it for type annotations.
vi.mock('phaser', () => ({ default: {} }));

// Mock src/ui so importing the animator does not load Phaser-dependent UI code.
const { popTextOrIcon, moveGameObject } = vi.hoisted(() => ({
  popTextOrIcon: vi.fn((_opts?: unknown) => Promise.resolve()),
  moveGameObject: vi.fn((_opts?: unknown) => ({})),
}));

vi.mock('../../src/ui', () => ({
  FONT_FAMILY: 'sans-serif',
  popTextOrIcon,
  moveGameObject,
}));

import { MainStreetAnimator } from '../../example-games/main-street/scenes/MainStreetAnimator';
import { SFX_KEYS } from '../../example-games/main-street/scenes/MainStreetConstants';

// ── Mock scene helpers ──────────────────────────────────────

interface TweenConfig {
  targets: unknown;
  y?: number;
  rotation?: number;
  alpha?: number;
  duration?: number;
  delay?: number;
  ease?: string;
  yoyo?: boolean;
  onComplete?: () => void;
}

interface RectMock {
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
  alpha: number;
  depth?: number;
  destroyed?: boolean;
  setDepth: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function createMockScene(overrides: Record<string, unknown> = {}) {
  const tweens: TweenConfig[] = [];
  const rects: RectMock[] = [];

  const scene = {
    layout: { gameW: 960, gameH: 640 },
    settingsPanel: null,
    replayMode: false,
    soundManager: { play: vi.fn() },
    tweens: {
      add: vi.fn((config: TweenConfig) => {
        tweens.push(config);
        return {};
      }),
    },
    add: {
      rectangle: vi.fn(
        (x: number, y: number, width: number, height: number, color: number, alpha: number) => {
          const rect: RectMock = {
            x,
            y,
            width,
            height,
            color,
            alpha,
            setDepth: vi.fn((depth: number) => {
              rect.depth = depth;
              return rect;
            }),
            destroy: vi.fn(() => { rect.destroyed = true; }),
          };
          rects.push(rect);
          return rect;
        },
      ),
    },
    ...overrides,
  };

  return { scene, tweens, rects };
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreetAnimator.animateGameOver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('win: plays the victory fanfare and spawns 24 confetti rectangles above the overlay backdrop', () => {
    const { scene, tweens, rects } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateGameOver({ win: true, width: 960, height: 640 });

    // Victory fanfare SFX (convention key, default WAV).
    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.GAME_WIN);

    // 24 deterministic confetti rectangles at depth 100.5 (above the
    // overlay backdrop/box at 100, below overlay text/buttons at 101).
    expect(rects).toHaveLength(24);
    for (const rect of rects) {
      expect(rect.setDepth).toHaveBeenCalledWith(100.5);
      expect(rect.y).toBe(-20);
    }
    // Confetti colours cycle through the celebration palette.
    const palette = [0xffdd44, 0x44ff44, 0x44aaff, 0xff6644, 0xdd88ff];
    rects.forEach((rect, i) => {
      expect(rect.color).toBe(palette[i % palette.length]);
    });

    // Each confetti piece has a falling + spinning + fading tween
    // (Quad.easeIn, staggered by index).
    expect(tweens.filter((t) => t.ease === 'Quad.easeIn' && t.alpha === 0 && t.y === 670)).toHaveLength(24);
    expect(tweens[0].delay).toBe(0);
    expect(tweens[23].delay).toBe(23 * 60);

    // Confetti is destroyed when its tween completes.
    tweens[0].onComplete!();
    expect(rects[0].destroyed).toBe(true);
  });

  it('loss: plays the sting and dims the board with a brief dark pulse below the backdrop', () => {
    const { scene, tweens, rects } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateGameOver({ win: false, width: 960, height: 640 });

    // Low sting SFX (convention key, default WAV).
    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.GAME_LOST);

    // One full-board dim rectangle at depth 99.5 (under the overlay
    // backdrop at 100 — only the board dims, not the panel).
    expect(rects).toHaveLength(1);
    expect(rects[0].width).toBe(960);
    expect(rects[0].height).toBe(640);
    expect(rects[0].setDepth).toHaveBeenCalledWith(99.5);

    // The dim pulses in and out (yoyo) then is destroyed.
    expect(tweens).toHaveLength(1);
    expect(tweens[0].alpha).toBe(0.35);
    expect(tweens[0].yoyo).toBe(true);
    expect(tweens[0].duration).toBe(120);
    tweens[0].onComplete!();
    expect(rects[0].destroyed).toBe(true);
  });

  it('degrades under reduced motion: plays the sound only, no visuals', () => {
    const { scene, tweens, rects } = createMockScene({
      settingsPanel: { reducedMotion: true },
    });
    const animator = new MainStreetAnimator(scene);

    animator.animateGameOver({ win: true, width: 960, height: 640 });
    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.GAME_WIN);
    expect(rects).toHaveLength(0);
    expect(tweens).toHaveLength(0);

    vi.clearAllMocks();
    animator.animateGameOver({ win: false, width: 960, height: 640 });
    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.GAME_LOST);
    expect(rects).toHaveLength(0);
    expect(tweens).toHaveLength(0);
  });

  it('is a no-op in replay/headless mode (documented exemption)', () => {
    const { scene, tweens, rects } = createMockScene({ replayMode: true });
    const animator = new MainStreetAnimator(scene);

    animator.animateGameOver({ win: true, width: 960, height: 640 });
    animator.animateGameOver({ win: false, width: 960, height: 640 });

    expect(rects).toHaveLength(0);
    expect(tweens).toHaveLength(0);
    expect(scene.soundManager.play).not.toHaveBeenCalled();
  });
});
