/**
 * Main Street: Held-Event Play Burst Feedback Tests
 *
 * Unit tests for `MainStreetAnimator.animateEventPlayed` — the burst + cheer
 * SFX + event-name pop that plays when a held event card is played from the
 * hand.
 *
 * These run in the Node unit environment, so the browser-only Phaser and
 * `src/ui` modules are mocked. The tests assert observable behaviour via the
 * public animator API: the `EVENT_CHEER` SFX, the 8 deterministic spark
 * circles tweening outward + fading, the event-name pop text, and the
 * reduced-motion / replay-mode degradation (spec AC2).
 *
 * @module tests/main-street/event-played-animator
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
  x?: number;
  y?: number;
  alpha?: number;
  scale?: number;
  duration?: number;
  ease?: string;
  onComplete?: () => void;
}

interface SparkMock {
  x: number;
  y: number;
  alpha: number;
  scale: number;
  destroyed?: boolean;
  setDepth: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function createMockScene(overrides: Record<string, unknown> = {}) {
  const tweens: TweenConfig[] = [];
  const sparks: SparkMock[] = [];
  const texts: { x: number; y: number; text: string; depth?: number; setOrigin: ReturnType<typeof vi.fn> }[] = [];

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
      circle: vi.fn((x: number, y: number, _radius: number, _color: number, alpha: number) => {
        const spark: SparkMock = {
          x,
          y,
          alpha,
          scale: 1,
          setDepth: vi.fn(() => spark),
          destroy: vi.fn(() => { spark.destroyed = true; }),
        };
        sparks.push(spark);
        return spark;
      }),
      text: vi.fn((x: number, y: number, text: string) => {
        const t = { x, y, text, setOrigin: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis() };
        texts.push(t);
        return t;
      }),
    },
    ...overrides,
  };

  return { scene, tweens, sparks, texts };
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreetAnimator.animateEventPlayed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plays the cheer SFX, spawns the 8-spark burst at the card position, and pops the event name', () => {
    const { scene, tweens, sparks, texts } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateEventPlayed({ x: 480, y: 560, eventName: 'Investor Bonanza' });

    // Cheer SFX (reuse-first — EVENT_CHEER is already loaded).
    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.EVENT_CHEER);

    // 8 deterministic sparks at the played card's position.
    expect(sparks).toHaveLength(8);
    for (const spark of sparks) {
      expect(spark.x).toBe(480);
      expect(spark.y).toBe(560);
      expect(spark.setDepth).toHaveBeenCalledWith(400);
    }

    // Each spark has a tween outward + fade (Quad.easeOut, 400ms).
    expect(tweens.filter((t) => t.duration === 400 && t.alpha === 0 && t.scale === 0.4)).toHaveLength(8);

    // Sparks are destroyed when their tween completes.
    tweens[0].onComplete!();
    expect(sparks[0].destroyed).toBe(true);

    // Event name pops above the position via popTextOrIcon.
    expect(texts).toHaveLength(1);
    expect(texts[0].x).toBe(480);
    expect(texts[0].y).toBe(540);
    expect(texts[0].text).toBe('Investor Bonanza');
    expect(popTextOrIcon).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 1400, riseY: 28, scale: 1.3, reducedMotion: false }),
    );
  });

  it('degrades under reduced motion: no burst, but keeps the pop + cheer SFX', () => {
    const { scene, tweens, sparks, texts } = createMockScene({
      settingsPanel: { reducedMotion: true },
    });
    const animator = new MainStreetAnimator(scene);

    animator.animateEventPlayed({ x: 100, y: 200, eventName: 'Tax Rebate' });

    expect(sparks).toHaveLength(0);
    expect(tweens).toHaveLength(0);
    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.EVENT_CHEER);
    expect(texts).toHaveLength(1);
    expect(popTextOrIcon).toHaveBeenCalledWith(
      expect.objectContaining({ reducedMotion: true }),
    );
  });

  it('is a no-op in replay/headless mode (documented exemption)', () => {
    const { scene, tweens, sparks, texts } = createMockScene({ replayMode: true });
    const animator = new MainStreetAnimator(scene);

    animator.animateEventPlayed({ x: 100, y: 200, eventName: 'Windfall' });

    expect(sparks).toHaveLength(0);
    expect(tweens).toHaveLength(0);
    expect(scene.soundManager.play).not.toHaveBeenCalled();
    expect(texts).toHaveLength(0);
    expect(popTextOrIcon).not.toHaveBeenCalled();
  });
});
