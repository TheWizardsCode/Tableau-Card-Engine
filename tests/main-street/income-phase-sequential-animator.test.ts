/**
 * Main Street: phased income animation — sequential card processing
 * (CG-0MTR766U6003RZ88).
 *
 * Verifies the one-card-at-a-time model introduced for
 * `MainStreetAnimator.animateIncomePhases()`:
 *
 *  - within a phase, card 0's count-out / coin flights are fully scheduled
 *    before card 1's begin (no parallel overlap);
 *  - the inter-card delay decreases progressively for successive cards;
 *  - later cards use shorter coin-flight durations (animation speed-up);
 *  - reduced motion and replay/headless exemptions are unchanged.
 *
 * Runs in the Node unit environment with Phaser + UI modules mocked. The
 * observable contract is the timing schedule registered on the scene's
 * `time.delayedCall` and the `moveGameObject` calls the schedule produces —
 * asserted via the public `animateIncomePhases` API, not internals.
 *
 * @module tests/main-street/income-phase-sequential-animator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phaser is browser-only; the animator only uses it for type annotations.
vi.mock('phaser', () => ({ default: {} }));

// Mock src/ui so importing the animator does not load Phaser-dependent UI code.
const { popTextOrIcon, moveGameObject } = vi.hoisted(() => ({
  popTextOrIcon: vi.fn(() => Promise.resolve()),
  moveGameObject: vi.fn((_opts?: unknown) => ({})),
}));

vi.mock('@ui', () => ({
  FONT_FAMILY: 'sans-serif',
  popTextOrIcon,
  moveGameObject,
}));

// Registry populated by the mocked createCoinGrid so tests can observe which
// card's grid received a count-out, and in what order.
const gridRegistry = vi.hoisted(() => ({
  handles: [] as Array<{ container: Record<string, unknown> }>,
  addLog: [] as Array<{ handleIndex: number; count: number }>,
}));

vi.mock('../../example-games/main-street/coin-grid', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../example-games/main-street/coin-grid')>();
  return {
    ...actual,
    createCoinGrid: vi.fn(() => {
      const handleIndex = gridRegistry.handles.length;
      const container: Record<string, unknown> = {
        list: [] as Array<Record<string, unknown>>,
        removeAll: vi.fn(() => {
          (container.list as Array<unknown>).length = 0;
        }),
        destroy: vi.fn(),
        getWorldTransformMatrix: () => ({
          getX: () => 100 + handleIndex * 160,
          getY: () => 140,
        }),
      };
      const handle = {
        addCoins: vi.fn((count: number) => {
          gridRegistry.addLog.push({ handleIndex, count });
          container.list = Array.from({ length: count }, () => ({
            setScale: vi.fn(),
            getWorldTransformMatrix: () => ({ getX: () => 120, getY: () => 150 }),
            setPosition: vi.fn().mockReturnThis(),
            setDepth: vi.fn().mockReturnThis(),
            destroy: vi.fn(),
          }));
          return { placements: [], iconCount: count };
        }),
        clear: vi.fn(),
        getLayout: vi.fn(() => null),
        container,
      };
      gridRegistry.handles.push(handle);
      return handle;
    }),
  };
});

import { MainStreetAnimator } from '../../example-games/main-street/scenes/MainStreetAnimator';
import type { SlotPhaseBreakdown } from '../../example-games/main-street/MainStreetAdjacency';
import type { IncomePhaseKey } from '../../example-games/main-street/scenes/MainStreetAnimator';

interface ScheduledCall {
  delay: number;
  fn: () => void;
}

interface MockScene {
  layout: Record<string, number>;
  settingsPanel: unknown;
  replayMode: boolean;
  incomeCollectionActive: boolean;
  state: { activeEffects: unknown[] };
  soundManager: { play: ReturnType<typeof vi.fn> };
  gameEvents: { emit: ReturnType<typeof vi.fn> };
  time: { delayedCall: ReturnType<typeof vi.fn> };
  add: Record<string, unknown>;
  tweens: { add: ReturnType<typeof vi.fn> };
  streetContainer: { list: unknown[] };
  msRenderer: { animateUpcomingEffectLine: ReturnType<typeof vi.fn> };
}

function createMockScene(slotCount: number, overrides: Partial<MockScene> = {}): {
  scene: MockScene;
  scheduled: ScheduledCall[];
} {
  const scheduled: ScheduledCall[] = [];
  const cards = Array.from({ length: slotCount }, (_, i) => ({
    getData: (key: string) => (key === 'streetSlotIndex' ? i : undefined),
  }));

  const scene: MockScene = {
    layout: {
      gameW: 1280,
      hudY: 50,
      gameH: 720,
      streetTop: 100,
      streetCols: 5,
      streetX: 20,
      slotW: 140,
      slotH: 80,
      slotGap: 20,
      streetRowGap: 12,
      queueTop: 600,
      logX: 20,
    },
    settingsPanel: null,
    replayMode: false,
    incomeCollectionActive: false,
    state: { activeEffects: [] },
    soundManager: { play: vi.fn() },
    gameEvents: { emit: vi.fn() },
    time: {
      delayedCall: vi.fn((delay: number, fn: () => void) => {
        scheduled.push({ delay, fn });
        return {};
      }),
    },
    add: {
      circle: vi.fn(() => ({ setDepth: vi.fn().mockReturnThis(), destroy: vi.fn() })),
      text: vi.fn(() => ({
        setOrigin: vi.fn().mockReturnThis(),
        setDepth: vi.fn().mockReturnThis(),
        setAlpha: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      })),
      container: vi.fn(() => ({
        add: vi.fn(),
        setDepth: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
        list: [],
      })),
      existing: vi.fn(),
      graphics: vi.fn(() => ({
        fillStyle: vi.fn().mockReturnThis(),
        fillCircle: vi.fn().mockReturnThis(),
        generateTexture: vi.fn(),
        clear: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      })),
    },
    tweens: {
      add: vi.fn((cfg: { onComplete?: () => void }) => {
        cfg?.onComplete?.();
        return {};
      }),
    },
    streetContainer: { list: cards },
    msRenderer: { animateUpcomingEffectLine: vi.fn() },
  };

  Object.assign(scene, overrides);
  return { scene, scheduled };
}

/** Phase data with `baseIncome`/`repBonus` in the ×100 economy (1 icon = 100). */
function makePhaseData(bases: number[], reps: number[] = []): SlotPhaseBreakdown[] {
  return bases.map((baseIncome, slotIndex) => ({
    slotIndex,
    businessName: `Biz ${slotIndex}`,
    baseIncome,
    synergyBonus: 0,
    repBonus: reps[slotIndex] ?? 0,
    eventDeltas: [],
    upcomingDeltas: [],
  }));
}

/**
 * Fires the phase dispatch and then every call it registered, recording the
 * absolute scheduled delay of each count-out (`addCoins`) invocation. This
 * exposes the *schedule* the sequential model produces, card by card.
 */
function collectCountOutSchedule(
  scheduled: ScheduledCall[],
  dispatchIndex: number,
): Array<{ delay: number; handleIndex: number }> {
  const firstNew = scheduled.length;
  scheduled[dispatchIndex].fn();
  const newCalls = scheduled.slice(firstNew);

  const result: Array<{ delay: number; handleIndex: number }> = [];
  for (const call of newCalls) {
    const logLen = gridRegistry.addLog.length;
    call.fn();
    if (gridRegistry.addLog.length > logLen) {
      const entry = gridRegistry.addLog[gridRegistry.addLog.length - 1];
      result.push({ delay: call.delay, handleIndex: entry.handleIndex });
    }
  }
  return result;
}

/** Fires a phase dispatch and returns the coin-flight durations it launches. */
function collectFlightDurations(
  scheduled: ScheduledCall[],
  dispatchIndex: number,
): number[] {
  const firstNew = scheduled.length;
  scheduled[dispatchIndex].fn();
  const newCalls = scheduled.slice(firstNew);

  const durations: number[] = [];
  for (const call of newCalls) {
    const before = moveGameObject.mock.calls.length;
    call.fn();
    for (let i = before; i < moveGameObject.mock.calls.length; i++) {
      const opts = moveGameObject.mock.calls[i][0] as unknown as { duration?: number };
      if (typeof opts.duration === 'number') durations.push(opts.duration);
    }
  }
  return durations;
}

describe('MainStreetAnimator.animateIncomePhases — sequential card processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gridRegistry.handles.length = 0;
    gridRegistry.addLog.length = 0;
  });

  it('counts base coins out one card at a time (card 0 completes before card 1 begins)', () => {
    const { scene, scheduled } = createMockScene(2);
    const animator = new MainStreetAnimator(scene);

    animator.animateIncomePhases(makePhaseData([300, 200]), { phaseGapMs: 100_000 });

    // Fire the base phase dispatch (index 0) and inspect the count-out schedule.
    const schedule = collectCountOutSchedule(scheduled, 0);
    expect(schedule.length).toBeGreaterThan(0);

    const card0 = schedule.filter((s) => s.handleIndex === 0);
    const card1 = schedule.filter((s) => s.handleIndex === 1);
    expect(card0.length).toBe(3);
    expect(card1.length).toBe(2);

    // Sequential (AC1): every card-0 count-out is scheduled strictly before
    // every card-1 count-out — no parallel overlap.
    const lastCard0 = Math.max(...card0.map((s) => s.delay));
    const firstCard1 = Math.min(...card1.map((s) => s.delay));
    expect(firstCard1).toBeGreaterThan(lastCard0);
  });

  it('decreases the delay between successive cards (AC3)', () => {
    const { scene, scheduled } = createMockScene(4);
    const animator = new MainStreetAnimator(scene);

    animator.animateIncomePhases(makePhaseData([100, 100, 100, 100]), { phaseGapMs: 100_000 });

    const schedule = collectCountOutSchedule(scheduled, 0);
    // First count-out delay registered for each card = that card's start offset.
    const starts = [0, 1, 2, 3].map((h) => Math.min(...schedule.filter((s) => s.handleIndex === h).map((s) => s.delay)));

    expect(starts).toHaveLength(4);
    const gaps = [starts[1] - starts[0], starts[2] - starts[1], starts[3] - starts[2]];
    // Progressive speed-up: each gap is strictly smaller than the previous one.
    expect(gaps[0]).toBeGreaterThan(gaps[1]);
    expect(gaps[1]).toBeGreaterThan(gaps[2]);
  });

  it('speeds up coin flights for later cards (AC4)', () => {
    const { scene, scheduled } = createMockScene(3);
    const animator = new MainStreetAnimator(scene);

    // Reputation phase = dispatch index 2; one icon per card (repBonus 100).
    animator.animateIncomePhases(makePhaseData([0, 0, 0], [100, 100, 100]), { phaseGapMs: 100_000 });

    const durations = collectFlightDurations(scheduled, 2);
    expect(durations).toHaveLength(3);
    // Later cards fly faster: durations strictly decrease.
    expect(durations[0]).toBeGreaterThan(durations[1]);
    expect(durations[1]).toBeGreaterThan(durations[2]);
  });

  it('still runs every phase in order base → … → collect', () => {
    const { scene, scheduled } = createMockScene(2);
    const animator = new MainStreetAnimator(scene);

    const order: IncomePhaseKey[] = [];
    animator.animateIncomePhases(makePhaseData([100, 100]), {
      phaseGapMs: 100_000,
      onPhase: (phase) => order.push(phase),
    });

    // Fire the five phase dispatches plus collect (indices 0..5).
    for (let i = 0; i < 6; i++) scheduled[i].fn();

    expect(order).toEqual(['base', 'synergy', 'reputation', 'events', 'upcoming', 'collect']);
  });

  it('reduced motion schedules no count-outs and no coin flights (AC5)', () => {
    const { scene, scheduled } = createMockScene(2, {
      settingsPanel: { reducedMotion: true },
    });
    const animator = new MainStreetAnimator(scene);

    animator.animateIncomePhases(makePhaseData([300, 200], [100, 100]), { phaseGapMs: 100_000 });

    const schedule = collectCountOutSchedule(scheduled, 0);
    expect(schedule).toEqual([]);
    expect(gridRegistry.addLog).toEqual([]);

    const durations = collectFlightDurations(scheduled, 2);
    expect(durations).toEqual([]);
    expect(moveGameObject).not.toHaveBeenCalled();
  });

  it('replay/headless mode schedules nothing (AC7)', () => {
    const { scene, scheduled } = createMockScene(2, { replayMode: true });
    const animator = new MainStreetAnimator(scene);

    animator.animateIncomePhases(makePhaseData([300, 200]), { phaseGapMs: 100 });

    expect(scheduled).toEqual([]);
    expect(gridRegistry.handles).toEqual([]);
    expect(scene.incomeCollectionActive).toBe(false);
  });
});
