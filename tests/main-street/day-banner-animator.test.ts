/**
 * Main Street: Day Transition Banner Tests
 *
 * Unit tests for `MainStreetAnimator.animateDayBanner` — the non-interactive
 * "Day N" banner that plays at each day start (fade in ~250ms, hold ~300ms,
 * fade out ~250ms, then destroy).
 *
 * These run in the Node unit environment, so the browser-only Phaser and
 * `src/ui` modules are mocked. The tests assert observable behaviour via the
 * public animator API: the banner container + "Day N" text + depth, the
 * day-chime SFX (reused `SFX_KEYS.CLICK`), the fade-in tween, the scheduled
 * fade-out, the reduced-motion / replay-mode exemptions, and that the banner
 * is non-interactive (never calls setInteractive).
 *
 * @module tests/main-street/day-banner-animator
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
  alpha?: number;
  scaleX?: number;
  scaleY?: number;
  duration?: number;
  ease?: string;
  onComplete?: () => void;
}

interface ScheduledCall {
  delay: number;
  fn: () => void;
}

interface BannerMock {
  x: number;
  y: number;
  alpha: number;
  scaleX: number;
  scaleY: number;
  depth?: number;
  destroyed?: boolean;
  setDepth: ReturnType<typeof vi.fn>;
  setAlpha: ReturnType<typeof vi.fn>;
  setScale: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  setInteractive: ReturnType<typeof vi.fn>;
}

function createMockScene(overrides: Record<string, unknown> = {}) {
  const tweens: TweenConfig[] = [];
  const scheduled: ScheduledCall[] = [];
  const banners: BannerMock[] = [];

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
    time: {
      delayedCall: vi.fn((delay: number, fn: () => void) => {
        scheduled.push({ delay, fn });
        return {};
      }),
    },
    add: {
      container: vi.fn((x: number, y: number) => {
        const banner: BannerMock = {
          x,
          y,
          alpha: 1,
          scaleX: 1,
          scaleY: 1,
          setDepth: vi.fn((d: number) => { banner.depth = d; return banner; }),
          setAlpha: vi.fn((a: number) => { banner.alpha = a; return banner; }),
          setScale: vi.fn((sx: number, sy?: number) => { banner.scaleX = sx; banner.scaleY = sy ?? sx; return banner; }),
          add: vi.fn(),
          destroy: vi.fn(() => { banner.destroyed = true; }),
          setInteractive: vi.fn(() => banner),
        };
        banners.push(banner);
        return banner;
      }),
      rectangle: vi.fn(() => ({ setStrokeStyle: vi.fn().mockReturnThis() })),
      text: vi.fn(() => ({ setOrigin: vi.fn().mockReturnThis() })),
    },
    ...overrides,
  };

  return { scene, tweens, scheduled, banners };
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreetAnimator.animateDayBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a "Day N" banner at the board centre with the day-chime SFX and fades in', () => {
    const { scene, tweens, scheduled, banners } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateDayBanner({ day: 3 });

    // Banner at the board centre, above the board but below the HUD (1000).
    expect(banners).toHaveLength(1);
    expect(banners[0].x).toBe(480);
    expect(banners[0].y).toBe(320);
    expect(banners[0].depth).toBe(600);
    expect(banners[0].alpha).toBe(0);
    expect(banners[0].scaleX).toBe(0.6);

    // Day-chime SFX (reused CLICK — no new ToneForge key).
    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.CLICK);

    // Fade-in tween: 250ms Back.easeOut to full size/opacity.
    const fadeIn = tweens.find((t) => t.duration === 250);
    expect(fadeIn).toBeDefined();
    expect(fadeIn!.alpha).toBe(1);
    expect(fadeIn!.scaleX).toBe(1);
    expect(fadeIn!.ease).toBe('Back.easeOut');

    // After the fade-in completes, a hold is scheduled (~300ms) then the
    // banner fades out and is destroyed.
    fadeIn!.onComplete!();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].delay).toBe(300);

    scheduled[0].fn();
    const fadeOut = tweens.filter((t) => t.duration === 250 && t.alpha === 0);
    expect(fadeOut).toHaveLength(1);
    expect(fadeOut[0].ease).toBe('Quad.easeIn');

    fadeOut[0].onComplete!();
    expect(banners[0].destroyed).toBe(true);
  });

  it('is a no-op under reduced motion (instruction text remains the cue)', () => {
    const { scene, tweens, scheduled, banners } = createMockScene({
      settingsPanel: { reducedMotion: true },
    });
    const animator = new MainStreetAnimator(scene);

    animator.animateDayBanner({ day: 1 });

    expect(banners).toHaveLength(0);
    expect(tweens).toHaveLength(0);
    expect(scheduled).toHaveLength(0);
    expect(scene.soundManager.play).not.toHaveBeenCalled();
  });

  it('is a no-op in replay/headless mode (documented exemption)', () => {
    const { scene, tweens, scheduled, banners } = createMockScene({ replayMode: true });
    const animator = new MainStreetAnimator(scene);

    animator.animateDayBanner({ day: 2 });

    expect(banners).toHaveLength(0);
    expect(tweens).toHaveLength(0);
    expect(scheduled).toHaveLength(0);
  });

  it('never sets the banner interactive (no click interception)', () => {
    const { scene, banners } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateDayBanner({ day: 5 });

    expect(banners).toHaveLength(1);
    expect(banners[0].setInteractive).not.toHaveBeenCalled();
  });
});
