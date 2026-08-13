/**
 * Main Street: Synergy Formation Animation Tests
 *
 * Unit tests for `MainStreetAnimator.animateSynergyFormation` — the
 * newly-formed-synergy-link animation (line draw-in, paired-card pulse,
 * "Synergy!" pop, chime SFX) — and for the `diffNewSynergyPairs` helper
 * used by the controller to trigger only NEW pairs (pre-existing pairs
 * never re-animate on a plain refresh).
 *
 * These run in the Node unit environment, so the browser-only Phaser and
 * `src/ui` modules are mocked. The tests assert observable behaviour via the
 * public animator API: the chime SFX, the line fade-in, the midpoint spark,
 * the card pulse (via tagged street containers), the "Synergy!" pop, and the
 * reduced-motion / replay-mode exemptions.
 *
 * @module tests/main-street/synergy-formation-animator
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
import { diffNewSynergyPairs, type SynergyPair } from '../../example-games/main-street/MainStreetAdjacency';

// ── Mock scene helpers ──────────────────────────────────────

interface TweenConfig {
  targets: unknown;
  x?: number;
  y?: number;
  alpha?: number;
  radius?: number;
  scaleX?: number;
  scaleY?: number;
  duration?: number;
  ease?: string;
  yoyo?: boolean;
  hold?: number;
  onComplete?: () => void;
}

function createMockScene(overrides: Record<string, unknown> = {}) {
  const tweens: TweenConfig[] = [];
  const createdTexts: Array<{ x: number; y: number; label: string }> = [];

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
    streetContainer: { list: [] as unknown[] },
    soundManager: { play: vi.fn() },
    tweens: {
      add: vi.fn((config: TweenConfig) => {
        tweens.push(config);
        return {};
      }),
    },
    add: {
      graphics: vi.fn(() => ({
        lineStyle: vi.fn().mockReturnThis(),
        beginPath: vi.fn().mockReturnThis(),
        moveTo: vi.fn().mockReturnThis(),
        lineTo: vi.fn().mockReturnThis(),
        strokePath: vi.fn().mockReturnThis(),
        setDepth: vi.fn().mockReturnThis(),
        setAlpha: vi.fn().mockReturnThis(),
      })),
      circle: vi.fn(() => ({
        setDepth: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      })),
      text: vi.fn((x: number, y: number, label: string) => {
        const text = { x, y, label, setOrigin: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis() };
        createdTexts.push(text);
        return text;
      }),
    },
    ...overrides,
  };

  return { scene, tweens, createdTexts };
}

/** A tagged street card container as rendered by drawBusinessSlot. */
function taggedCard(slotIndex: number) {
  return {
    getData: vi.fn((key: string) => (key === 'streetSlotIndex' ? slotIndex : undefined)),
    scaleX: 1,
    scaleY: 1,
    setScale: vi.fn(),
  };
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreetAnimator.animateSynergyFormation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plays the chime, fades the line in, sparks at the midpoint, pulses the paired cards, and pops "Synergy!"', () => {
    const cardA = taggedCard(0);
    const cardB = taggedCard(1);
    const { scene, tweens, createdTexts } = createMockScene({
      streetContainer: { list: [cardA, cardB] },
    });
    const animator = new MainStreetAnimator(scene);

    animator.animateSynergyFormation({ fromIndex: 0, toIndex: 1, sharedSynergy: 'Culture' });

    // Chime SFX.
    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.INCOME_POSITIVE);

    // Line: graphics created with the synergy colour and faded in.
    expect(scene.add.graphics).toHaveBeenCalledTimes(1);
    const lineTween = tweens.find((t) => t.alpha === 0.7);
    expect(lineTween).toBeDefined();
    expect(lineTween!.duration).toBe(250);

    // Spark at the pair midpoint (slot centres: slot0 = (90,140), slot1 = (250,140)).
    const sparkTween = tweens.find((t) => t.radius === 14);
    expect(sparkTween).toBeDefined();
    const circleArgs = scene.add.circle.mock.calls[0] as unknown as [number, number, number];
    expect(circleArgs[0]).toBe((90 + 250) / 2);
    expect(circleArgs[1]).toBe(140);

    // Paired cards pulse (scale 1.15 yoyo).
    const pulses = tweens.filter((t) => t.targets === cardA || t.targets === cardB);
    expect(pulses).toHaveLength(2);
    expect(pulses.every((p) => p.scaleX === 1.15 && p.yoyo === true)).toBe(true);

    // "Synergy!" pop at the midpoint.
    expect(createdTexts.some((t) => t.label === 'Synergy!')).toBe(true);
    expect(popTextOrIcon).toHaveBeenCalledTimes(1);
  });

  it('keeps only the chime + minimal pop under reduced motion (no line, spark, or pulse)', () => {
    const cardA = taggedCard(0);
    const cardB = taggedCard(1);
    const { scene, tweens, createdTexts } = createMockScene({
      settingsPanel: { reducedMotion: true },
      streetContainer: { list: [cardA, cardB] },
    });
    const animator = new MainStreetAnimator(scene);

    animator.animateSynergyFormation({ fromIndex: 0, toIndex: 1, sharedSynergy: 'Culture' });

    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.INCOME_POSITIVE);
    expect(createdTexts.some((t) => t.label === 'Synergy!')).toBe(true);
    expect(scene.add.graphics).not.toHaveBeenCalled();
    expect(scene.add.circle).not.toHaveBeenCalled();
    expect(tweens).toHaveLength(0);
  });

  it('returns immediately in replay/headless mode (documented exemption)', () => {
    const { scene, tweens, createdTexts } = createMockScene({ replayMode: true });
    const animator = new MainStreetAnimator(scene);

    animator.animateSynergyFormation({ fromIndex: 0, toIndex: 1, sharedSynergy: 'Culture' });

    expect(scene.soundManager.play).not.toHaveBeenCalled();
    expect(tweens).toHaveLength(0);
    expect(createdTexts).toHaveLength(0);
  });

  it('skips the card pulse when the paired containers are not on screen (no crash)', () => {
    const { scene, tweens } = createMockScene({ streetContainer: { list: [] } });
    const animator = new MainStreetAnimator(scene);

    animator.animateSynergyFormation({ fromIndex: 3, toIndex: 8, sharedSynergy: 'Culture' });

    // Line + spark still animate; no pulse tweens target missing cards.
    expect(scene.add.graphics).toHaveBeenCalledTimes(1);
    expect(tweens.some((t) => t.alpha === 0.7)).toBe(true);
    expect(tweens.filter((t) => (t.targets as { scaleX?: number }).scaleX === 1.15)).toHaveLength(0);
  });
});

describe('diffNewSynergyPairs', () => {
  it('returns only the pairs in `after` that are not in `before`', () => {
    const before: SynergyPair[] = [
      { fromIndex: 0, toIndex: 1, sharedSynergy: 'Culture' },
    ];
    const after: SynergyPair[] = [
      { fromIndex: 0, toIndex: 1, sharedSynergy: 'Culture' },
      { fromIndex: 1, toIndex: 2, sharedSynergy: 'Culture' },
    ];

    const fresh = diffNewSynergyPairs(before, after);

    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toEqual({ fromIndex: 1, toIndex: 2, sharedSynergy: 'Culture' });
  });

  it('returns nothing when the pairs are unchanged (plain refresh never re-triggers)', () => {
    const pairs: SynergyPair[] = [
      { fromIndex: 0, toIndex: 1, sharedSynergy: 'Culture' },
    ];

    expect(diffNewSynergyPairs(pairs, pairs)).toHaveLength(0);
  });
});
