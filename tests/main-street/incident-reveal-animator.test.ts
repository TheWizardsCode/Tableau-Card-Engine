/**
 * Main Street: Incident Reveal Animation Tests (new choreography)
 *
 * Unit tests for `MainStreetAnimator.animateIncidentReveal` — the
 * end-of-turn incident reveal presentation. The new choreography replaces
 * the old flight → red flash → popTextOrIcon path with:
 *
 * 1. A card-back-over-face container at the incident queue origin.
 * 2. A flight to board centre (~550ms).
 * 3. A hinge-flip (scaleX → 0) that reveals the card face.
 * 4. A 4-second hold where delta bubbles animate.
 * 5. A return to the queue origin and cleanup.
 *
 * Reduced motion: flight, hinge flip and bubble travel are skipped, but the
 * 4000ms hold + cleanup are preserved (parent AC3).
 *
 * No incident: the entire animation is a no-op — no tweens, no delayed
 * calls, no SFX, no game-state/transcript mutation (parent AC4).
 *
 * @module tests/main-street/incident-reveal-animator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phaser is browser-only; the animator only uses it for type annotations.
vi.mock('phaser', () => ({ default: {} }));

// Mock src/ui so importing the animator does not load Phaser-dependent UI code.
const { popTextOrIcon, moveGameObject } = vi.hoisted(() => ({
  popTextOrIcon: vi.fn((_opts?: unknown) => Promise.resolve()),
  moveGameObject: vi.fn((_opts?: unknown) => ({})),
}));

vi.mock('@ui', () => ({
  FONT_FAMILY: 'sans-serif',
  popTextOrIcon,
  moveGameObject,
}));

import { MainStreetAnimator } from '../../example-games/main-street/scenes/MainStreetAnimator';
import { SFX_KEYS } from '../../example-games/main-street/scenes/MainStreetConstants';
import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import { processEndOfTurn } from '../../example-games/main-street/MainStreetEngine';
import type { EventCard } from '../../example-games/main-street/MainStreetCards';

// ── Mock scene helpers ──────────────────────────────────────

interface TweenConfig {
  targets: unknown;
  x?: number;
  y?: number;
  alpha?: number;
  scaleX?: number;
  scaleY?: number;
  duration?: number;
  ease?: string;
  yoyo?: boolean;
  hold?: number;
  delay?: number;
  onComplete?: () => void;
}

interface DelayedCallConfig {
  delay: number;
  callback?: () => void;
}

interface MockContainer {
  type?: string;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  visible?: boolean;
  children?: unknown[];
  setStrokeStyle?: (a?: unknown, b?: unknown, c?: unknown) => MockContainer;
  setDepth?: (d?: number) => MockContainer;
  setAlpha?: (a?: number) => MockContainer;
  setVisible?: (v?: boolean) => MockContainer;
  setScale?: (x?: number, y?: number) => MockContainer;
  setPosition?: (x?: number, y?: number) => MockContainer;
  setOrigin?: (x?: number, y?: number) => MockContainer;
  destroy?: () => void;
  add?: (child?: unknown) => MockContainer;
}

function createMockScene(overrides: Record<string, unknown> = {}) {
  const tweens: TweenConfig[] = [];
  const delayedCalls: DelayedCallConfig[] = [];
  const createdContainers: MockContainer[] = [];
  const createdRectangles: MockContainer[] = [];
  const createdCircles: MockContainer[] = [];
  const soundCalls: Array<{ key: string }> = [];

  /**
   * Invoke recorded delayed-call callbacks whose delay is strictly below
   * `maxDelayExclusive`. Used by the bubble tests to fire the short bubble
   * stagger delays without triggering the 4000ms reveal hold.
   */
  const flushDelayedCallsBelow = (maxDelayExclusive: number): void => {
    for (const call of delayedCalls) {
      if (call.delay < maxDelayExclusive && call.callback) call.callback();
    }
  };

  const scene = {
    layout: {
      gameW: 1280,
      gameH: 720,
      hudY: 50,
      queueCardW: 120,
      queueCardH: 170,
    },
    settingsPanel: null,
    replayMode: false,
    templateIdFromCardId: (cardId: string) => `template-of-${cardId}`,
    templateKeyForCard: (templateId: string, w: number, h: number) => `${templateId}-${w}x${h}`,
    requestCardTexture: vi.fn(),
    textures: { exists: vi.fn(() => false) },
    incidentQueueContainer: { list: [] },
    soundManager: {
      play: vi.fn((key: string) => {
        soundCalls.push({ key });
      }),
    },
    tweens: {
      add: vi.fn((config: TweenConfig) => {
        tweens.push(config);
        // Invoke onComplete synchronously so the mock traces the full choreography
        // chain (flight → hinge → 4000ms hold) without real tween timing.
        config.onComplete?.();
        return { stop: vi.fn() };
      }),
    },
    time: {
      delayedCall: vi.fn((delay: number, callback?: () => void) => {
        delayedCalls.push({ delay, callback });
      }),
    },
    add: {
      container: vi.fn((x: number, y: number) => {
        const container: MockContainer = { type: 'Container', x, y, children: [], scaleX: 1, scaleY: 1, visible: true };
        createdContainers.push(container);
        const mock = {
          add: vi.fn((child: MockContainer) => {
            container.children = [...(container.children ?? []), child];
            return mock;
          }),
          setDepth: vi.fn().mockReturnThis(),
          setScale: vi.fn((sx?: number, sy?: number) => { container.scaleX = sx; container.scaleY = sy ?? sx; return mock; }),
          setVisible: vi.fn((v?: boolean) => { container.visible = v; return mock; }),
          setPosition: vi.fn((x?: number, y?: number) => { container.x = x; container.y = y; return mock; }),
          destroy: vi.fn(),
        };
        return mock;
      }),
      rectangle: vi.fn((_x: number, _y: number, _w: number, _h: number, _color: number, _alpha: number) => {
        const rect: MockContainer = {
          type: 'Rectangle', scaleX: 1, scaleY: 1,
          setStrokeStyle: vi.fn().mockReturnThis(),
          setDepth: vi.fn().mockReturnThis(),
          setAlpha: vi.fn().mockReturnThis(),
          setVisible: vi.fn().mockReturnThis(),
          destroy: vi.fn(),
        };
        createdRectangles.push(rect);
        return rect;
      }),
      text: vi.fn((_x: number, _y: number, _label: string, _style?: unknown) => {
        const text: MockContainer = {
          type: 'Text', scaleX: 1, scaleY: 1,
          setOrigin: vi.fn().mockReturnThis(),
          setDepth: vi.fn().mockReturnThis(),
          setScale: vi.fn().mockReturnThis(),
          destroy: vi.fn(),
        };
        return text;
      }),
      circle: vi.fn((_x: number, _y: number, _r: number, _color: number, _alpha: number) => {
        const circle: MockContainer = {
          type: 'Circle', scaleX: 1, scaleY: 1,
          setDepth: vi.fn().mockReturnThis(),
          setVisible: vi.fn().mockReturnThis(),
          destroy: vi.fn(),
        };
        createdCircles.push(circle);
        return circle;
      }),
    },
    ...overrides,
  };

  return { scene, tweens, delayedCalls, createdContainers, createdRectangles, createdCircles, soundCalls, flushDelayedCallsBelow };
}

function makeIncidentEvent(overrides: Partial<EventCard> = {}): EventCard {
  return {
    family: 'event',
    id: overrides.id ?? 'test-incident-event',
    name: overrides.name ?? 'Test Incident Event',
    trigger: 'Incident',
    cost: overrides.cost ?? 0,
    effect: overrides.effect ?? '-2 coins',
    target: overrides.target ?? 'All',
    targetSynergy: overrides.targetSynergy,
    coinDelta: overrides.coinDelta ?? -2,
    reputationDelta: overrides.reputationDelta ?? 0,
  };
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreetAnimator.animateIncidentReveal (new choreography)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a card-back-over-face container at the queue origin, flies to board centre, then hinges open to reveal the face', () => {
    const { scene, tweens } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateIncidentReveal({
      cardId: 'inc-1',
      incidentName: 'Power Outage',
      coinChange: -2,
      repChange: -1,
      from: { x: 400, y: 300 },
    });

    // Container built at queue origin.
    const containerCalls = scene.add.container.mock.calls;
    expect(containerCalls.length).toBeGreaterThan(0);
    expect(containerCalls[0][0]).toBe(400); // x = queue origin
    expect(containerCalls[0][1]).toBe(300); // y = queue origin

    // Flight tween to board centre (~550ms).
    const flight = tweens.find((t) => (t.x as number | undefined) !== undefined && t.duration === 550);
    expect(flight).toBeDefined();
    expect(flight!.x).toBe(1280 / 2);
    expect(flight!.y).toBe(720 / 2);

    // Hinge-flip tween: scaleX → 0 reveals the face.
    const hinge = tweens.find((t) => t.scaleX === 0);
    expect(hinge).toBeDefined();
  });

  it('holds the face visible for exactly 4000ms before returning/cleanup', () => {
    const { scene, delayedCalls } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateIncidentReveal({
      cardId: 'inc-1',
      incidentName: 'Power Outage',
      coinChange: -2,
      repChange: 0,
      from: { x: 400, y: 300 },
    });

    // The 4000ms hold is implemented as a delayedCall after the flip completes.
    const holdCall = delayedCalls.find((d) => d.delay >= 4000);
    expect(holdCall).toBeDefined();
    expect(holdCall!.delay).toBeGreaterThanOrEqual(4000);
  });

  it('reduces motion: skips flight, hinge flip and bubble travel but still schedules the 4000ms hold and cleanup', () => {
    const { scene, tweens, delayedCalls, createdContainers } = createMockScene({
      settingsPanel: { reducedMotion: true },
    });
    const animator = new MainStreetAnimator(scene);

    animator.animateIncidentReveal({
      cardId: 'inc-1',
      incidentName: 'Power Outage',
      coinChange: -2,
      repChange: -1,
      from: { x: 400, y: 300 },
    });

    // Container still built and positioned instantly at board centre
    // (card appears face-up, no flight).
    expect(createdContainers.length).toBeGreaterThan(0);
    expect(createdContainers[0].x).toBe(1280 / 2);
    expect(createdContainers[0].y).toBe(720 / 2);

    // No flight tween (no x/y tween with 550ms duration).
    const flight = tweens.find((t) => (t.x as number | undefined) !== undefined && t.duration === 550);
    expect(flight).toBeUndefined();

    // No hinge flip (no scaleX → 0 tween).
    const hinge = tweens.find((t) => t.scaleX === 0);
    expect(hinge).toBeUndefined();

    // 4000ms hold is still scheduled.
    const holdCall = delayedCalls.find((d) => d.delay >= 4000);
    expect(holdCall).toBeDefined();
  });

  it('is a no-op when there is no incident (no tweens, delayed calls, SFX or container) but still completes', () => {
    const { scene, tweens, delayedCalls, createdContainers, createdCircles, soundCalls } = createMockScene();
    const animator = new MainStreetAnimator(scene);
    let completed = false;

    animator.animateIncidentReveal({
      cardId: '', // no resolved incident
      incidentName: '',
      coinChange: 0,
      repChange: 0,
      from: { x: 400, y: 300 },
      onComplete: () => { completed = true; },
    });

    // Nothing is rendered, scheduled, or played.
    expect(createdContainers).toHaveLength(0);
    expect(createdCircles).toHaveLength(0);
    expect(tweens).toHaveLength(0);
    expect(delayedCalls).toHaveLength(0);
    expect(soundCalls).toHaveLength(0);
    // ...but the completion callback fires so the turn cannot hang.
    expect(completed).toBe(true);
  });

  it('returns immediately in replay/headless mode but still fires onComplete', () => {
    const { scene, tweens, delayedCalls, createdContainers, createdCircles, soundCalls } = createMockScene({ replayMode: true });
    const animator = new MainStreetAnimator(scene);
    let completed = false;

    animator.animateIncidentReveal({
      cardId: 'inc-1',
      incidentName: 'Power Outage',
      coinChange: -2,
      repChange: 0,
      from: { x: 400, y: 300 },
      onComplete: () => { completed = true; },
    });

    // No presentation in replay/headless mode...
    expect(createdContainers).toHaveLength(0);
    expect(createdCircles).toHaveLength(0);
    expect(tweens).toHaveLength(0);
    expect(delayedCalls).toHaveLength(0);
    expect(soundCalls).toHaveLength(0);
    // ...but the turn-advance chain still completes.
    expect(completed).toBe(true);
  });

  it('destroys the container after the return/cleanup phase', () => {
    const { scene, delayedCalls, flushDelayedCallsBelow } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateIncidentReveal({
      cardId: 'inc-1',
      incidentName: 'Power Outage',
      coinChange: -2,
      repChange: 0,
      from: { x: 400, y: 300 },
    });

    // Fire the short bubble stagger delays first, then invoke the 4000ms hold.
    flushDelayedCallsBelow(1000);
    const holdCall = delayedCalls.find((d) => d.delay >= 4000 && d.callback);
    expect(holdCall).toBeDefined();
    holdCall!.callback!();
    // Return tween's onComplete (invoked synchronously by the mock) destroys
    // the container — no throw means cleanup ran.
  });

  it('fires an onComplete callback after cleanup', () => {
    const { scene, delayedCalls } = createMockScene();
    const animator = new MainStreetAnimator(scene);
    let completed = false;

    animator.animateIncidentReveal({
      cardId: 'inc-1',
      incidentName: 'Power Outage',
      coinChange: -2,
      repChange: 0,
      from: { x: 400, y: 300 },
      onComplete: () => { completed = true; },
    });

    // onComplete should not fire before the 4000ms hold completes.
    expect(completed).toBe(false);

    // Trigger the delayed 4000ms hold; the return tween's onComplete
    // (invoked synchronously by the mock) calls cleanup → onComplete.
    const holdCall = delayedCalls.find((d) => d.delay >= 4000 && d.callback);
    expect(holdCall).toBeDefined();
    holdCall!.callback!();
    expect(completed).toBe(true);
  });

  it('fires onComplete after the 4-second hold under reduced motion', () => {
    const { scene, delayedCalls } = createMockScene({
      settingsPanel: { reducedMotion: true },
    });
    const animator = new MainStreetAnimator(scene);
    let completed = false;

    animator.animateIncidentReveal({
      cardId: 'inc-1',
      incidentName: 'Power Outage',
      coinChange: -2,
      repChange: 0,
      from: { x: 400, y: 300 },
      onComplete: () => { completed = true; },
    });

    expect(completed).toBe(false);
    const holdCall = delayedCalls.find((d) => d.delay >= 4000 && d.callback);
    expect(holdCall).toBeDefined();
    holdCall!.callback!();
    expect(completed).toBe(true);
  });

  it('plays the warning sting SFX', () => {
    const { scene, soundCalls } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateIncidentReveal({
      cardId: 'inc-1',
      incidentName: 'Power Outage',
      coinChange: -2,
      repChange: 0,
      from: { x: 400, y: 300 },
    });

    expect(soundCalls.some((c) => c.key === SFX_KEYS.INCOME_NEGATIVE)).toBe(true);
  });
});

describe('MainStreetAnimator.animateIncidentDeltaBubbles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('launches coin-loss bubbles from HUD to card when coinChange < 0', () => {
    const { scene, createdCircles, flushDelayedCallsBelow } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator['animateIncidentDeltaBubbles']({
      coinChange: -3,
      repChange: 0,
      cardCenter: { x: 640, y: 360 },
      hudCoinX: 390,
      hudRepX: 640,
      hudY: 50,
    });

    // Fire the short bubble stagger delays (but not the 4000ms hold).
    flushDelayedCallsBelow(1000);

    // Gold coin circles are created.
    const coinBubbles = createdCircles.filter((c) => c.type === 'Circle');
    expect(coinBubbles.length).toBeGreaterThan(0);

    // Bubbles travel via moveGameObject; loss travels HUD → card.
    expect(moveGameObject).toHaveBeenCalled();
    const first = moveGameObject.mock.calls[0][0] as { destX: number; destY: number };
    expect(first.destX).toBe(640);
    expect(first.destY).toBe(360);
  });

  it('launches coin-gain bubbles from card to HUD when coinChange > 0', () => {
    const { scene, createdCircles, flushDelayedCallsBelow } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator['animateIncidentDeltaBubbles']({
      coinChange: 5,
      repChange: 0,
      cardCenter: { x: 640, y: 360 },
      hudCoinX: 390,
      hudRepX: 640,
      hudY: 50,
    });

    flushDelayedCallsBelow(1000);

    const coinBubbles = createdCircles.filter((c) => c.type === 'Circle');
    expect(coinBubbles.length).toBeGreaterThan(0);
    // Gain travels card → HUD.
    const first = moveGameObject.mock.calls[0][0] as { destX: number; destY: number };
    expect(first.destX).toBe(390);
  });

  it('launches reputation-loss bubbles from HUD to card when repChange < 0', () => {
    const { scene, createdCircles, flushDelayedCallsBelow } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator['animateIncidentDeltaBubbles']({
      coinChange: 0,
      repChange: -2,
      cardCenter: { x: 640, y: 360 },
      hudCoinX: 390,
      hudRepX: 640,
      hudY: 50,
    });

    flushDelayedCallsBelow(1000);

    const repBubbles = createdCircles.filter((c) => c.type === 'Circle');
    expect(repBubbles.length).toBeGreaterThan(0);
    // Loss travels HUD rep counter → card.
    const first = moveGameObject.mock.calls[0][0] as { destX: number; destY: number };
    expect(first.destX).toBe(640);
  });

  it('launches reputation-gain bubbles from card to HUD when repChange > 0', () => {
    const { scene, createdCircles, flushDelayedCallsBelow } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator['animateIncidentDeltaBubbles']({
      coinChange: 0,
      repChange: 3,
      cardCenter: { x: 640, y: 360 },
      hudCoinX: 390,
      hudRepX: 640,
      hudY: 50,
    });

    flushDelayedCallsBelow(1000);

    const repBubbles = createdCircles.filter((c) => c.type === 'Circle');
    expect(repBubbles.length).toBeGreaterThan(0);
    // Gain travels card → HUD rep counter.
    const first = moveGameObject.mock.calls[0][0] as { destX: number; destY: number };
    expect(first.destX).toBe(640);
  });

  it('launches no bubbles when both deltas are zero', () => {
    const { scene, createdCircles, flushDelayedCallsBelow } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator['animateIncidentDeltaBubbles']({
      coinChange: 0,
      repChange: 0,
      cardCenter: { x: 640, y: 360 },
      hudCoinX: 390,
      hudRepX: 640,
      hudY: 50,
    });

    flushDelayedCallsBelow(1000);

    expect(createdCircles.filter((c) => c.type === 'Circle')).toHaveLength(0);
  });

  it('skips all bubbles under reduced motion', () => {
    const { scene, createdCircles, delayedCalls } = createMockScene({
      settingsPanel: { reducedMotion: true },
    });
    const animator = new MainStreetAnimator(scene);

    animator['animateIncidentDeltaBubbles']({
      coinChange: -3,
      repChange: -2,
      cardCenter: { x: 640, y: 360 },
      hudCoinX: 390,
      hudRepX: 640,
      hudY: 50,
    });

    expect(createdCircles.filter((c) => c.type === 'Circle')).toHaveLength(0);
    expect(delayedCalls).toHaveLength(0);
  });
});

describe('processEndOfTurn incident deltas', () => {
  it('surfaces the incident coin/reputation deltas on TurnResult', () => {
    const state: MainStreetState = setupMainStreetGame({ seed: 'incident-delta-test' });
    const incidentEvt = makeIncidentEvent({ coinDelta: -2, reputationDelta: -1 });
    state.incidentDeck = [incidentEvt];
    state.phase = 'MarketPhase';

    const result = processEndOfTurn(state);

    expect(result.incident).not.toBeNull();
    expect(result.incidentCoinChange).toBe(-2);
    expect(result.incidentRepChange).toBe(-1);
  });

  it('reports zero deltas when no incident resolves', () => {
    const state: MainStreetState = setupMainStreetGame({ seed: 'incident-delta-none' });
    state.incidentDeck = [];
    state.phase = 'MarketPhase';

    const result = processEndOfTurn(state);

    expect(result.incident).toBeNull();
    expect(result.incidentCoinChange).toBe(0);
    expect(result.incidentRepChange).toBe(0);
  });
});
