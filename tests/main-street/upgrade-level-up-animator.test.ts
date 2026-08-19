/**
 * Main Street: Upgrade Level-Up Burst Tests
 *
 * Unit tests for `MainStreetAnimator.animateLevelUp` — the upgrade-arrival
 * feedback on the target business (gold sparkle burst + "Level N" pop).
 *
 * These run in the Node unit environment, so the browser-only Phaser and
 * `src/ui` modules are mocked. The tests assert observable behaviour via the
 * public animator API: the sparkle burst tweens (fixed deterministic
 * directions), the "Level N" pop, and the reduced-motion / replay-mode
 * exemptions. The arrival chime is the upgrade transfer's existing end SFX
 * (`SFX_KEYS.UPGRADE_END` in `animateTransferFromMarket`) — deliberately not
 * replayed here, so no sound assertion is expected.
 *
 * @module tests/main-street/upgrade-level-up-animator
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

function createMockScene(overrides: Record<string, unknown> = {}) {
  const tweens: TweenConfig[] = [];
  const createdTexts: Array<{ x: number; y: number; label: string; color?: string }> = [];
  const createdCircles: Array<{ x: number; y: number; radius: number; color: number }> = [];

  const scene = {
    layout: {
      streetX: 20,
      streetTop: 100,
      slotW: 140,
      slotGap: 20,
      slotH: 80,
      streetCols: 5,
      streetRowGap: 12,
    },
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
      circle: vi.fn((x: number, y: number, radius: number, color: number) => {
        const circle = { x, y, radius, color, setDepth: vi.fn().mockReturnThis(), destroy: vi.fn() };
        createdCircles.push(circle);
        return circle;
      }),
      text: vi.fn((x: number, y: number, label: string, style: { color?: string } = {}) => {
        const text = { x, y, label, color: style.color, setOrigin: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis() };
        createdTexts.push(text);
        return text;
      }),
    },
    ...overrides,
  };

  return { scene, tweens, createdTexts, createdCircles };
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreetAnimator.animateLevelUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fires a gold sparkle burst on the target card and pops "Level N"', () => {
    const { scene, tweens, createdTexts, createdCircles } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateLevelUp({ slotIndex: 0, level: 2 });

    // Six sparks at the card centre (slot 0 centre = (90, 140)), gold.
    expect(createdCircles).toHaveLength(6);
    for (const c of createdCircles) {
      expect(c.x).toBe(90);
      expect(c.y).toBe(140);
      expect(c.color).toBe(0xffd700);
    }

    // Each spark tweens outward (deterministic directions) and fades out.
    const sparkTweens = tweens.filter((t) => (t.targets as { color?: number }).color !== undefined || (t.targets as { x?: number }).x !== undefined);
    expect(sparkTweens).toHaveLength(6);
    const destinations = sparkTweens.map((t) => `${t.x},${t.y}`);
    expect(destinations).toContain('68,126');   // dx -22, dy -14
    expect(destinations).toContain('112,126');  // dx +22, dy -14
    expect(destinations).toContain('90,114');   // dx 0, dy -26
    expect(sparkTweens.every((t) => t.alpha === 0 && t.duration === 420)).toBe(true);

    // "Level 2" pop text over the card.
    const levelText = createdTexts.find((t) => t.label === 'Level 2');
    expect(levelText).toBeDefined();
    expect(levelText!.y).toBe(140 - 18);
    expect(levelText!.color).toBe('#ffd700');
    expect(popTextOrIcon).toHaveBeenCalledTimes(1);
  });

  it('keeps only the "Level N" pop under reduced motion (no burst)', () => {
    const { scene, tweens, createdTexts, createdCircles } = createMockScene({
      settingsPanel: { reducedMotion: true },
    });
    const animator = new MainStreetAnimator(scene);

    animator.animateLevelUp({ slotIndex: 3, level: 1 });

    expect(createdTexts.some((t) => t.label === 'Level 1')).toBe(true);
    expect(createdCircles).toHaveLength(0);
    expect(tweens).toHaveLength(0);
    expect(popTextOrIcon).toHaveBeenCalledTimes(1);
  });

  it('returns immediately in replay/headless mode (documented exemption)', () => {
    const { scene, tweens, createdTexts, createdCircles } = createMockScene({ replayMode: true });
    const animator = new MainStreetAnimator(scene);

    animator.animateLevelUp({ slotIndex: 0, level: 1 });

    expect(createdCircles).toHaveLength(0);
    expect(createdTexts).toHaveLength(0);
    expect(tweens).toHaveLength(0);
  });

  it('is a no-op for an invalid slot index', () => {
    const { scene, tweens, createdTexts, createdCircles } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateLevelUp({ slotIndex: -1, level: 1 });

    expect(createdCircles).toHaveLength(0);
    expect(createdTexts).toHaveLength(0);
    expect(tweens).toHaveLength(0);
  });
});
