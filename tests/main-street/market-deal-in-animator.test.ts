/**
 * Main Street: Market Deal-In Animation Tests
 *
 * Unit tests for `MainStreetAnimator.animateMarketDealIn` — the day-start
 * market refill and Discover/Research row-swap animation.
 *
 * These run in the Node unit environment, so the browser-only Phaser and
 * `src/ui` modules are mocked. The tests assert observable behaviour via the
 * public animator API: the synchronously-applied "dealt" state, the staggered
 * deal-in tweens with the shared deal SFX, the outgoing-card fade/shrink
 * snapshots (Discover/Research swap), and the reduced-motion / replay-mode
 * exemptions.
 *
 * @module tests/main-street/market-deal-in-animator
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

interface ScheduledCall {
  delay: number;
  fn: () => void;
}

interface TweenConfig {
  targets: unknown;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  alpha?: number;
  duration?: number;
  ease?: string;
  onComplete?: () => void;
}

function createMockCard(baseY = 200): {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  setScale: ReturnType<typeof vi.fn>;
  setAlpha: ReturnType<typeof vi.fn>;
} {
  const card = {
    x: 100,
    y: baseY,
    scaleX: 1,
    scaleY: 1,
    alpha: 1,
    setScale: vi.fn(),
    setAlpha: vi.fn(),
  };
  card.setScale.mockImplementation((sx: number, sy?: number) => {
    card.scaleX = sx;
    card.scaleY = sy ?? sx;
  });
  card.setAlpha.mockImplementation((a: number) => {
    card.alpha = a;
  });
  return card;
}

/** Cast mock card objects to the animator's Container param type. */
function toContainers(cards: ReturnType<typeof createMockCard>[]): Phaser.GameObjects.Container[] {
  return cards as unknown as Phaser.GameObjects.Container[];
}

function createMockScene(overrides: Record<string, unknown> = {}) {
  const scheduled: ScheduledCall[] = [];
  const tweens: TweenConfig[] = [];
  const destroyed: unknown[] = [];

  const scene = {
    layout: {
      marketCardW: 100,
      marketCardH: 140,
    },
    settingsPanel: null,
    replayMode: false,
    templateIdFromCardId: (cardId: string) => `template-of-${cardId}`,
    soundManager: { play: vi.fn() },
    time: {
      delayedCall: vi.fn((delay: number, fn: () => void) => {
        scheduled.push({ delay, fn });
        return {};
      }),
    },
    tweens: {
      add: vi.fn((config: TweenConfig) => {
        tweens.push(config);
        return {};
      }),
    },
    add: {
      container: vi.fn(() => {
        const container = {
          add: vi.fn(),
          setDepth: vi.fn().mockReturnThis(),
          destroy: vi.fn(() => destroyed.push(container)),
        };
        return container;
      }),
      rectangle: vi.fn(() => ({
        setStrokeStyle: vi.fn().mockReturnThis(),
      })),
      text: vi.fn(() => ({
        setOrigin: vi.fn().mockReturnThis(),
      })),
    },
    ...overrides,
  };

  return { scene, scheduled, tweens, destroyed };
}

/** Fires every scheduled delayed call in order. */
function fireScheduled(scheduled: ScheduledCall[]): void {
  for (const { fn } of scheduled) fn();
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreetAnimator.animateMarketDealIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies the dealt state synchronously and deals cards in with staggered deal SFX', () => {
    const { scene, scheduled, tweens } = createMockScene();
    const animator = new MainStreetAnimator(scene);
    const cardA = createMockCard(200);
    const cardB = createMockCard(200);

    animator.animateMarketDealIn({ row: 'development', cards: toContainers([cardA, cardB]) });

    // Dealt state applied in the same frame as the draw (no flicker).
    expect(cardA.setScale).toHaveBeenCalledWith(0.6, 0.6);
    expect(cardA.setAlpha).toHaveBeenCalledWith(0.35);
    expect(cardA.y).toBe(200 - 24);
    expect(cardB.y).toBe(200 - 24);

    // Staggered launches: 80ms apart.
    expect(scheduled.map((c) => c.delay)).toEqual([0, 80]);

    fireScheduled(scheduled);

    // One deal tween per card back to the resting pose.
    expect(tweens).toHaveLength(2);
    expect(tweens[0].targets).toBe(cardA);
    expect(tweens[0]).toMatchObject({ y: 200, scaleX: 1, scaleY: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });
    expect(tweens[1].targets).toBe(cardB);

    // The shared deal SFX plays per incoming card at launch.
    expect(scene.soundManager.play).toHaveBeenCalledTimes(2);
    expect(scene.soundManager.play).toHaveBeenNthCalledWith(1, SFX_KEYS.DEAL);
    expect(scene.soundManager.play).toHaveBeenNthCalledWith(2, SFX_KEYS.DEAL);
  });

  it('fades outgoing cards out (Discover/Research swap) before incoming cards deal in', () => {
    const { scene, scheduled, tweens } = createMockScene();
    const animator = new MainStreetAnimator(scene);
    const incoming = createMockCard(200);
    const spyOnVisual = vi.spyOn(animator, 'createTransferCardVisual');

    animator.animateMarketDealIn({
      row: 'development',
      cards: toContainers([incoming]),
      outgoing: [{ cardId: 'old-1', family: 'business', x: 60, y: 150 }],
    });

    // Outgoing snapshot launches first, then incoming cards (80ms stagger
    // after the outgoing lead).
    expect(scheduled.map((c) => c.delay)).toEqual([0, 60]);

    fireScheduled(scheduled);

    // Outgoing visual created at the old slot position...
    expect(spyOnVisual).toHaveBeenCalledTimes(1);
    expect(spyOnVisual).toHaveBeenCalledWith('old-1', 'business', 60, 150);

    // ...and faded/shrunk out, then destroyed on completion.
    const outgoingTween = tweens.find((t) => t.targets !== incoming);
    expect(outgoingTween).toBeDefined();
    expect(outgoingTween).toMatchObject({ alpha: 0, scaleX: 0.3, scaleY: 0.3, duration: 300, ease: 'Cubic.easeIn' });

    const visual = outgoingTween!.targets as { destroy: ReturnType<typeof vi.fn> };
    outgoingTween!.onComplete?.();
    expect(visual.destroy).toHaveBeenCalled();

    // Incoming card still deals in with the shared SFX.
    const incomingTween = tweens.find((t) => t.targets === incoming);
    expect(incomingTween).toMatchObject({ y: 200, scaleX: 1, alpha: 1 });
    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.DEAL);
  });

  it('does nothing when there are no cards and no outgoing cards', () => {
    const { scene, scheduled, tweens } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateMarketDealIn({ row: 'investments', cards: [] });

    expect(scheduled).toHaveLength(0);
    expect(tweens).toHaveLength(0);
    expect(scene.soundManager.play).not.toHaveBeenCalled();
  });

  it('skips the animation under reduced motion (cards appear instantly)', () => {
    const { scene, scheduled, tweens } = createMockScene({
      settingsPanel: { reducedMotion: true },
    });
    const animator = new MainStreetAnimator(scene);
    const card = createMockCard(200);

    animator.animateMarketDealIn({
      row: 'development',
      cards: toContainers([card]),
      outgoing: [{ cardId: 'old-1', family: 'event', x: 60, y: 150 }],
    });

    // No dealt state, no outgoing snapshots, nothing scheduled.
    expect(card.setScale).not.toHaveBeenCalled();
    expect(card.y).toBe(200);
    expect(scheduled).toHaveLength(0);
    expect(tweens).toHaveLength(0);
    expect(scene.soundManager.play).not.toHaveBeenCalled();
  });

  it('returns immediately in replay/headless mode (documented exemption)', () => {
    const { scene, scheduled, tweens } = createMockScene({ replayMode: true });
    const animator = new MainStreetAnimator(scene);
    const card = createMockCard(200);

    animator.animateMarketDealIn({ row: 'development', cards: toContainers([card]) });

    expect(card.setScale).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(0);
    expect(tweens).toHaveLength(0);
    expect(scene.soundManager.play).not.toHaveBeenCalled();
  });
});
