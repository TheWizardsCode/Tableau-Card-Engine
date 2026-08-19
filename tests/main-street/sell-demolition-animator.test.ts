/**
 * Main Street: Sell Demolition + Refund Coin Fly Tests
 *
 * Unit tests for `MainStreetAnimator.animateSell` — the sell-feedback
 * animation: a brief demolition on the sold card (pre-sold snapshot
 * shrinking/fading over ~380ms) followed by a refund coin flying from the
 * sold slot to the HUD coins counter (`SFX_KEYS.COIN_POP`), with a
 * "+€refund" pop landing at the counter.
 *
 * These run in the Node unit environment, so the browser-only Phaser and
 * `src/ui` modules are mocked. The promise chain is driven manually by
 * invoking each captured `onComplete` callback in sequence (demolition tween
 * complete → flight complete).
 *
 * @module tests/main-street/sell-demolition-animator
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
  scaleX?: number;
  scaleY?: number;
  alpha?: number;
  duration?: number;
  ease?: string;
  onComplete?: () => void;
}

interface FlightOptions {
  scene: unknown;
  target: unknown;
  destX?: number;
  destY?: number;
  duration?: number;
  ease?: string;
  soundManager?: { play: ReturnType<typeof vi.fn> };
  sfx?: { start?: string };
  onComplete?: () => void;
}

function createMockScene(overrides: Record<string, unknown> = {}) {
  const tweens: TweenConfig[] = [];
  const circles: Array<{ x: number; y: number; radius: number; color: number; depth?: number; destroy: ReturnType<typeof vi.fn>; setDepth: (d: number) => unknown }> = [];
  const texts: Array<{ x: number; y: number; label: string; color?: string }> = [];
  const containers: Array<{
    x: number;
    y: number;
    depth?: number;
    destroyed?: boolean;
    setDepth: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
  }> = [];

  const scene = {
    layout: {
      gameW: 960,
      hudY: 56,
      marketCardW: 100,
      marketCardH: 150,
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
    templateIdFromCardId: vi.fn(() => 'template-bakery'),
    soundManager: { play: vi.fn() },
    tweens: {
      add: vi.fn((config: TweenConfig) => {
        tweens.push(config);
        return {};
      }),
    },
    add: {
      circle: vi.fn((x: number, y: number, radius: number, color: number, _alpha?: number) => {
        const circle: typeof circles[number] = { x, y, radius, color, destroy: vi.fn(), setDepth: (d: number) => { circle.depth = d; return circle; } };
        circles.push(circle);
        return circle;
      }),
      text: vi.fn((x: number, y: number, label: string, style: { color?: string } = {}) => {
        const text = { x, y, label, color: style.color, setOrigin: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis() };
        texts.push(text);
        return text;
      }),
      container: vi.fn((x: number, y: number) => {
        const container: typeof containers[number] = { x, y, setDepth: vi.fn(), destroy: vi.fn(), add: vi.fn() };
        containers.push(container);
        return container;
      }),
      rectangle: vi.fn(() => ({ setOrigin: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(), setStrokeStyle: vi.fn().mockReturnThis() })),
    },
    ...overrides,
  };

  return { scene, tweens, circles, texts, containers };
}

/** Runs a returned presentation promise to completion by invoking the
 *  captured onComplete callbacks in order (demolition tween → coin flight). */
async function driveToCompletion(
  promise: Promise<void>,
  tweens: TweenConfig[],
  moveGameObjectMock: ReturnType<typeof vi.fn>,
): Promise<void> {
  const demolition = tweens.find((t) => t.duration === 380);
  expect(demolition?.onComplete).toBeDefined();
  demolition!.onComplete!();

  // allow the .then chain to schedule the flight
  await Promise.resolve();
  await Promise.resolve();

  const moveCalls = moveGameObjectMock.mock.calls.map((c) => c[0] as FlightOptions);
  const flight = moveCalls[moveCalls.length - 1];
  expect(flight?.onComplete).toBeDefined();
  flight!.onComplete!();
  await promise;
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreetAnimator.animateSell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moveGameObject.mockClear();
  });

  it('plays demolition (snapshot shrink/fade) then a coin fly with COIN_POP and a +€refund pop', async () => {
    const { scene, tweens, circles, texts, containers } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    const promise = animator.animateSell({ slotIndex: 0, refund: 5, cardId: 'biz-1', family: 'business' });

    // Demolition snapshot created at the slot centre (slot 0 = (90, 140))
    // and already set above the SOLD overlay by createTransferCardVisual.
    expect(containers).toHaveLength(1);
    expect(containers[0].x).toBe(90);
    expect(containers[0].y).toBe(140);
    expect(containers[0].setDepth).toHaveBeenCalledWith(10000);

    const demolition = tweens.find((t) => t.duration === 380);
    expect(demolition).toBeDefined();
    expect(demolition!.scaleX).toBe(0.25);
    expect(demolition!.scaleY).toBe(0.25);
    expect(demolition!.alpha).toBe(0);
    expect(demolition!.ease).toBe('Cubic.easeIn');

    // No refund feedback yet (it waits for the flight to land).
    expect(texts.some((t) => t.label === '+€5')).toBe(false);
    expect(popTextOrIcon).not.toHaveBeenCalled();

    // Drive the chain: demolition complete → coin flight.
    await driveToCompletion(promise, tweens, moveGameObject);

    // Coin flight from the slot to the HUD counter with the coin SFX.
    expect(moveGameObject).toHaveBeenCalledTimes(1);
    const flight = moveGameObject.mock.calls.map((c) => c[0] as FlightOptions)[0];
    expect(flight!.destX).toBe(960 * 0.25 + 70);
    expect(flight!.destY).toBe(56);
    expect(flight!.sfx?.start).toBe(SFX_KEYS.COIN_POP);
    expect(flight!.duration).toBe(600);

    // Coin visual created at the slot centre.
    expect(circles).toHaveLength(1);
    expect(circles[0].x).toBe(90);
    expect(circles[0].y).toBe(140);
    expect(circles[0].color).toBe(0xffcc44);

    // "+€refund" pop at the HUD counter + coin SFX on landing.
    const pop = texts.find((t) => t.label === '+€5');
    expect(pop).toBeDefined();
    expect(pop!.x).toBe(960 * 0.25 + 70);
    expect(pop!.y).toBe(56 - 8);
    expect(popTextOrIcon).toHaveBeenCalledTimes(1);
    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.COIN_POP);
  });

  it('keeps only the +€refund pop under reduced motion (no demolition, no flight)', async () => {
    const { scene, tweens, texts, containers } = createMockScene({
      settingsPanel: { reducedMotion: true },
    });
    const animator = new MainStreetAnimator(scene);

    const promise = animator.animateSell({ slotIndex: 2, refund: 8, cardId: 'cs-1', family: 'community-space' });

    expect(containers).toHaveLength(0);           // no demolition snapshot
    expect(tweens).toHaveLength(0);               // no demolition tween
    expect(moveGameObject).not.toHaveBeenCalled(); // no coin flight
    expect(texts.some((t) => t.label === '+€8')).toBe(true); // single pop
    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.COIN_POP);
    await promise; // resolves immediately
  });

  it('returns immediately in replay/headless mode (documented exemption)', async () => {
    const { scene, tweens, texts, containers } = createMockScene({ replayMode: true });
    const animator = new MainStreetAnimator(scene);

    const promise = animator.animateSell({ slotIndex: 0, refund: 3, cardId: 'biz-2', family: 'business' });

    expect(containers).toHaveLength(0);
    expect(texts).toHaveLength(0);
    expect(tweens).toHaveLength(0);
    expect(moveGameObject).not.toHaveBeenCalled();
    await promise;
  });

  it('the demolition destroys its snapshot when the tween completes', async () => {
    const { scene, tweens, containers } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    const promise = animator.animateSell({ slotIndex: 0, refund: 4, cardId: 'biz-3', family: 'business' });
    const demolition = tweens.find((t) => t.duration === 380)!;
    demolition.onComplete!();
    await Promise.resolve();
    await Promise.resolve();

    expect(containers[0].destroy).toHaveBeenCalled();
    // flight still ran afterwards
    expect(moveGameObject).toHaveBeenCalledTimes(1);
    // complete the flight so the returned promise settles
    const flight = moveGameObject.mock.calls.map((c) => c[0] as FlightOptions).pop()!;
    flight.onComplete!();
    await promise;
  });
});
