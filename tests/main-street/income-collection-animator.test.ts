/**
 * Main Street: Income Collection Animator Tests
 *
 * Unit tests for `MainStreetAnimator.animateIncomeCollection` and the
 * `incomeCollectionActive` suppression in `animateHudValueChanges`.
 *
 * These run in the Node unit environment, so the browser-only Phaser and
 * `src/ui` modules are mocked. The tests assert observable behaviour via
 * the public animator API: which flights are launched (per producing slot
 * and reputation-earning slot), the staggered coin-pop SFX config, the
 * final "+total" pop, the reduced-motion / replay-mode exemptions, and the
 * HUD delta-pop suppression while collection is running.
 *
 * @module tests/main-street/income-collection-animator
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

function createMockScene(overrides: Record<string, unknown> = {}) {
  const scheduled: ScheduledCall[] = [];
  const createdTexts: Array<{ x: number; y: number; label: string }> = [];
  const createdCircles: Array<{ x: number; y: number }> = [];

  const scene = {
    layout: {
      gameW: 1280,
      hudY: 50,
      streetCols: 5,
      streetX: 20,
      slotW: 140,
      slotH: 80,
      slotGap: 20,
      streetTop: 100,
      streetRowGap: 12,
    },
    settingsPanel: null,
    replayMode: false,
    incomeCollectionActive: false,
    previousCoins: null as number | null,
    previousReputation: null as number | null,
    soundManager: { play: vi.fn() },
    gameEvents: { emit: vi.fn() },
    time: {
      delayedCall: vi.fn((delay: number, fn: () => void) => {
        scheduled.push({ delay, fn });
        return {};
      }),
    },
    add: {
      circle: vi.fn((x: number, y: number) => {
        createdCircles.push({ x, y });
        return { x, y, destroy: vi.fn(), setDepth: vi.fn() };
      }),
      text: vi.fn((x: number, y: number, label: string) => {
        createdTexts.push({ x, y, label });
        return {
          x,
          y,
          label,
          setOrigin: vi.fn().mockReturnThis(),
          setDepth: vi.fn().mockReturnThis(),
        };
      }),
    },
    ...overrides,
  };

  return { scene, scheduled, createdTexts, createdCircles };
}

/** Fires every scheduled delayed call, then every moveGameObject onComplete. */
function completeAllFlights(scheduled: ScheduledCall[]): void {
  for (const { fn } of scheduled) fn();
  for (const opts of moveGameObject.mock.calls.map((c) => c[0] as { onComplete?: () => void } | undefined)) {
    opts?.onComplete?.();
  }
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreetAnimator.animateIncomeCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('launches one staggered coin flight per producing slot to the HUD coins counter', () => {
    const { scene, scheduled } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateIncomeCollection({
      income: {
        total: 4,
        breakdown: [
          { slotIndex: 0, businessName: 'Bakery', baseIncome: 2, synergyBonus: 0, total: 2 },
          { slotIndex: 1, businessName: 'Laundromat', baseIncome: 2, synergyBonus: 0, total: 2 },
        ],
      },
      repSources: [],
    });

    // Flag is active while collection is running.
    expect(scene.incomeCollectionActive).toBe(true);

    // Two flights scheduled with increasing delays (staggered launch).
    expect(scheduled.map((c) => c.delay)).toEqual([0, 50]);
    expect(scheduled).toHaveLength(2);

    // Fire the launches (the flights start when each delayed call fires).
    for (const { fn } of scheduled) fn();

    // Each flight targets the HUD coin counter (stripLeft = gameW*0.25 + 70)
    // with the shared coin-pop SFX played via the scene SoundManager.
    const coinX = 1280 * 0.25 + 70;
    const moveCalls = moveGameObject.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(moveCalls).toHaveLength(2);
    for (const opts of moveCalls) {
      expect(opts.destX).toBe(coinX);
      expect(opts.destY).toBe(50);
      expect(opts.sfx).toEqual({ start: SFX_KEYS.COIN_POP });
      expect(opts.soundManager).toBe(scene.soundManager);
    }
    // Sources are the street-slot centres of the producing slots.
    const circleStarts = scene.add.circle.mock.calls.map((c) => ({ x: c[0], y: c[1] }));
    expect(circleStarts).toEqual([
      { x: 90, y: 140 },   // slot 0 (col 0, row 0)
      { x: 250, y: 140 },  // slot 1 (col 1, row 0)
    ]);
  });

  it('launches reputation pips to the rep HUD value for rep-earning cards', () => {
    const { scene, scheduled } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateIncomeCollection({
      income: { total: 0, breakdown: [] },
      repSources: [{ slotIndex: 2, rep: 1 }],
    });

    expect(scheduled).toHaveLength(1);
    scheduled[0].fn();

    const moveCalls = moveGameObject.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(moveCalls).toHaveLength(1);
    // Rep pip targets the reputation label at the strip centre (gameW * 0.5).
    expect(moveCalls[0].destX).toBe(1280 * 0.5);
    expect(moveCalls[0].destY).toBe(50);
  });

  it('pops the final "+total" once every flight has landed and clears the flag', async () => {
    const { scene, scheduled, createdTexts } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateIncomeCollection({
      income: {
        total: 4,
        breakdown: [
          { slotIndex: 0, businessName: 'Bakery', baseIncome: 2, synergyBonus: 0, total: 2 },
          { slotIndex: 1, businessName: 'Laundromat', baseIncome: 2, synergyBonus: 0, total: 2 },
        ],
      },
      repSources: [],
    });

    completeAllFlights(scheduled);

    // Final "+total" pop at the coin counter, above the HUD strip.
    expect(popTextOrIcon).toHaveBeenCalledTimes(1);
    const popOpts = popTextOrIcon.mock.calls[0][0] as Record<string, unknown>;
    const totalText = createdTexts.find((t) => t.label === '+4');
    expect(totalText).toBeDefined();
    expect(popOpts.target).toBeDefined();
    expect((popOpts.target as { label: string }).label).toBe('+4');
    expect(popOpts.duration).toBeGreaterThan(0);

    // The collection flag clears once the animation is complete.
    expect(scene.incomeCollectionActive).toBe(false);
  });

  it('does nothing when no slots produce income or reputation (flag stays unset)', () => {
    const { scene, scheduled } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateIncomeCollection({
      income: {
        total: 0,
        breakdown: [{ slotIndex: 0, businessName: 'Sold', baseIncome: 0, synergyBonus: 0, total: 0 }],
      },
      repSources: [],
    });

    expect(scene.incomeCollectionActive).toBe(false);
    expect(scheduled).toHaveLength(0);
    expect(moveGameObject).not.toHaveBeenCalled();
  });

  it('skips all flights under reduced motion (single final pop handled by HUD refresh)', () => {
    const { scene, scheduled } = createMockScene({
      settingsPanel: { reducedMotion: true },
    });
    const animator = new MainStreetAnimator(scene);

    animator.animateIncomeCollection({
      income: {
        total: 4,
        breakdown: [{ slotIndex: 0, businessName: 'Bakery', baseIncome: 2, synergyBonus: 0, total: 2 }],
      },
      repSources: [],
    });

    expect(scene.incomeCollectionActive).toBe(false);
    expect(scheduled).toHaveLength(0);
    expect(moveGameObject).not.toHaveBeenCalled();
    expect(popTextOrIcon).not.toHaveBeenCalled();
  });

  it('returns immediately in replay/headless mode (documented exemption)', () => {
    const { scene, scheduled } = createMockScene({ replayMode: true });
    const animator = new MainStreetAnimator(scene);

    animator.animateIncomeCollection({
      income: {
        total: 4,
        breakdown: [{ slotIndex: 0, businessName: 'Bakery', baseIncome: 2, synergyBonus: 0, total: 2 }],
      },
      repSources: [],
    });

    expect(scene.incomeCollectionActive).toBe(false);
    expect(scheduled).toHaveLength(0);
    expect(moveGameObject).not.toHaveBeenCalled();
  });
});

describe('MainStreetAnimator.animateHudValueChanges income suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('suppresses the immediate delta pop while collection is active but still routes the income sound', () => {
    const { scene } = createMockScene();
    const animator = new MainStreetAnimator(scene);
    scene.previousCoins = 10;
    scene.previousReputation = 5;
    scene.incomeCollectionActive = true;

    animator.animateHudValueChanges({
      coins: 14,
      reputation: 5,
      coinX: 390,
      repX: 640,
      hudY: 50,
    });

    // No immediate pop text while the collection animation is running...
    expect(scene.add.text).not.toHaveBeenCalled();
    expect(popTextOrIcon).not.toHaveBeenCalled();
    // ...but the income-gained event (income sound) is still emitted.
    expect(scene.gameEvents.emit).toHaveBeenCalledWith('income-gained', { amount: 4 });
  });

  it('shows the delta pop when collection is not active', () => {
    const { scene } = createMockScene();
    const animator = new MainStreetAnimator(scene);
    scene.previousCoins = 10;
    scene.previousReputation = 5;

    animator.animateHudValueChanges({
      coins: 14,
      reputation: 5,
      coinX: 390,
      repX: 640,
      hudY: 50,
    });

    expect(scene.add.text).toHaveBeenCalledTimes(1);
    expect(popTextOrIcon).toHaveBeenCalledTimes(1);
    expect(scene.gameEvents.emit).toHaveBeenCalledWith('income-gained', { amount: 4 });
  });
});
