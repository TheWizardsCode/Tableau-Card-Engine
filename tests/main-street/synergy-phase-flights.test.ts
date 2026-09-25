/**
 * Main Street: synergy-line flight attribution + geometry
 * (CG-0MTV6LZEA003YS3E).
 *
 * Unit tests for the animator's synergy-phase flight builder:
 *
 *  - `attributeSynergyShares` splits a receiver's synergy bonus across its
 *    matching neighbours so the shares sum EXACTLY to the credited total;
 *  - `synergyPhaseFlights` emits BOTH directions per synergy pair using the
 *    shared clipped `p1`/`p2` geometry (`synergyLineEndpoints`) — the flight
 *    starts on the giver's slot edge and lands on the receiver's slot edge
 *    (never a `(0,0)` regression);
 *  - `flyCoinsAlongLine` flies `iconsForAmount(amount)` coins over
 *    `INCOME_FLIGHT_MS` (600 ms) with the 60 ms stagger and reveals the
 *    receiver's grid on arrival.
 *
 * Runs in the Node unit environment with Phaser + the UI module mocked; the
 * geometry is asserted through the public animator helpers, not internals.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

const { moveGameObject } = vi.hoisted(() => ({
  moveGameObject: vi.fn((opts?: { onComplete?: () => void }) => {
    opts?.onComplete?.();
    return {};
  }),
}));

vi.mock('@ui', () => ({
  FONT_FAMILY: 'sans-serif',
  popTextOrIcon: vi.fn(() => Promise.resolve()),
  moveGameObject,
}));

import {
  attributeSynergyShares,
  synergyPhaseFlights,
} from '../../example-games/main-street/scenes/MainStreetAnimatorUtils';
import { flyCoinsAlongLine } from '../../example-games/main-street/scenes/MainStreetAnimatorIncome';
import type {
  IncomePhaseSlot,
  MainStreetAnimatorContext,
} from '../../example-games/main-street/scenes/MainStreetAnimatorContext';
import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';

// ── Fixtures ──────────────────────────────────────────────────────

const LAYOUT = {
  streetX: 20,
  streetTop: 100,
  slotW: 140,
  slotH: 80,
  slotGap: 20,
  streetRowGap: 12,
  streetCols: 5,
};

/** Slot centre in world coordinates (matches the legacy 5×2 layout maths). */
function centre(i: number): { x: number; y: number } {
  return {
    x: LAYOUT.streetX + (i % LAYOUT.streetCols) * (LAYOUT.slotW + LAYOUT.slotGap) + LAYOUT.slotW / 2,
    y: LAYOUT.streetTop + Math.floor(i / LAYOUT.streetCols) * (LAYOUT.slotH + LAYOUT.streetRowGap) + LAYOUT.slotH / 2,
  };
}

function makeBiz(id: string, overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business',
    id,
    name: id,
    cost: 3,
    baseIncome: 200,
    synergyTypes: ['Food'],
    synergyCoinBonus: 0.5,
    synergyRepBonus: 0,
    maxLevel: 1,
    description: 'test',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
    ...overrides,
  };
}

function emptyGrid(): (BusinessCard | null)[] {
  return new Array<BusinessCard | null>(10).fill(null);
}

/** Fake animator context: only `scene` + `localSlotCentre` are used here. */
function makeContext(
  grid: (BusinessCard | null)[],
  soldSlots: boolean[] = [],
): MainStreetAnimatorContext {
  return {
    scene: {
      state: { streetGrid: grid, soldSlots },
      layout: LAYOUT,
      streetPlayableLattice: undefined,
      streetViewLattice: undefined,
    },
    localSlotCentre: centre,
  } as unknown as MainStreetAnimatorContext;
}

function makeSlot(index: number, synergyBonus: number): IncomePhaseSlot {
  return {
    pd: {
      slotIndex: index,
      businessName: `Biz ${index}`,
      baseIncome: 0,
      synergyBonus,
      repBonus: 0,
      eventDeltas: [],
      upcomingDeltas: [],
    },
    card: {} as IncomePhaseSlot['card'],
    handle: {} as IncomePhaseSlot['handle'],
    displayed: 0,
  };
}

// ── attributeSynergyShares ────────────────────────────────────────

describe('attributeSynergyShares', () => {
  it('splits an even total evenly', () => {
    expect([...attributeSynergyShares(100, [0, 1]).entries()]).toEqual([[0, 50], [1, 50]]);
  });

  it('assigns the remainder to the lowest slot indices so the sum is exact', () => {
    const shares = attributeSynergyShares(101, [0, 1]);
    expect(shares.get(0)).toBe(51);
    expect(shares.get(1)).toBe(50);
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(101);
  });

  it('is order-independent (sorts givers) and de-duplicates', () => {
    expect([...attributeSynergyShares(100, [5, 1]).entries()]).toEqual([[1, 50], [5, 50]]);
    expect([...attributeSynergyShares(100, [1, 1, 2]).entries()]).toEqual([[1, 50], [2, 50]]);
  });

  it('clamps a sub-icon total to a single lowest-index giver', () => {
    expect([...attributeSynergyShares(1, [0, 1, 2]).entries()]).toEqual([[0, 1], [1, 0], [2, 0]]);
  });

  it('returns zeros for a zero bonus and an empty map with no givers', () => {
    expect([...attributeSynergyShares(0, [0, 1]).entries()]).toEqual([[0, 0], [1, 0]]);
    expect(attributeSynergyShares(100, []).size).toBe(0);
  });

  it('always preserves the rounded total across many splits', () => {
    for (let total = 0; total <= 200; total += 7) {
      for (let n = 1; n <= 6; n++) {
        const givers = Array.from({ length: n }, (_, i) => i * 3);
        const shares = attributeSynergyShares(total, givers);
        const sum = [...shares.values()].reduce((a, b) => a + b, 0);
        expect(sum).toBe(Math.round(total));
      }
    }
  });
});

// ── synergyPhaseFlights ───────────────────────────────────────────

describe('synergyPhaseFlights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits both directions along the clipped pair geometry', () => {
    const grid = emptyGrid();
    grid[0] = makeBiz('biz-cafe-0');
    grid[1] = makeBiz('biz-bakery-0');
    const flights = synergyPhaseFlights(makeContext(grid), [makeSlot(0, 50), makeSlot(1, 50)]);

    expect(flights).toHaveLength(2);
    const f01 = flights.find((f) => f.fromSlotIndex === 0 && f.toSlotIndex === 1)!;
    const f10 = flights.find((f) => f.fromSlotIndex === 1 && f.toSlotIndex === 0)!;
    expect(f01).toBeDefined();
    expect(f10).toBeDefined();
    expect(f01.amount).toBe(50);
    expect(f10.amount).toBe(50);

    // Slot 0 centre (90,140), slot 1 centre (250,140); slots are 140×80.
    // Clipped endpoints are slot 0's right edge → slot 1's left edge.
    expect(f01.start).toEqual({ x: 160, y: 140 });
    expect(f01.end).toEqual({ x: 180, y: 140 });
    expect(f10.start).toEqual({ x: 180, y: 140 });
    expect(f10.end).toEqual({ x: 160, y: 140 });

    for (const f of flights) {
      // Regression guard: flights must never collapse to the origin.
      expect(f.start).not.toEqual({ x: 0, y: 0 });
      expect(f.end).not.toEqual({ x: 0, y: 0 });
    }
  });

  it('splits a multi-neighbour receiver across one flight per line', () => {
    const grid = emptyGrid();
    grid[0] = makeBiz('biz-cafe-1');
    grid[1] = makeBiz('biz-bakery-1');
    grid[5] = makeBiz('biz-diner-1');

    const flights = synergyPhaseFlights(makeContext(grid), [makeSlot(0, 100), makeSlot(1, 0), makeSlot(5, 0)]);
    // Receiver 0's 100 is split 50/50 across its two givers.
    expect(flights).toHaveLength(2);
    expect(flights.every((f) => f.toSlotIndex === 0)).toBe(true);
    expect(flights.map((f) => [f.fromSlotIndex, f.amount]).sort()).toEqual([[1, 50], [5, 50]]);
  });

  it('emits extended-range directional flights', () => {
    const grid = emptyGrid();
    grid[0] = makeBiz('biz-cafe-2', { synergyRangeBonus: 1 });
    grid[2] = makeBiz('biz-bakery-2');

    const flights = synergyPhaseFlights(makeContext(grid), [makeSlot(0, 50), makeSlot(2, 50)]);
    expect(flights).toHaveLength(2);
    expect(flights.find((f) => f.fromSlotIndex === 0 && f.toSlotIndex === 2)!.amount).toBe(50);
    expect(flights.find((f) => f.fromSlotIndex === 2 && f.toSlotIndex === 0)!.amount).toBe(50);
  });

  it('emits nothing when no receiver has a synergy bonus', () => {
    const grid = emptyGrid();
    grid[0] = makeBiz('biz-cafe-3');
    grid[1] = makeBiz('biz-bakery-3');
    const flights = synergyPhaseFlights(makeContext(grid), [makeSlot(0, 0), makeSlot(1, 0)]);
    expect(flights).toEqual([]);
  });

  it('is non-blocking: a malformed state yields no flights', () => {
    const context = { scene: { state: undefined, layout: LAYOUT }, localSlotCentre: centre } as unknown as MainStreetAnimatorContext;
    expect(synergyPhaseFlights(context, [makeSlot(0, 50)])).toEqual([]);
  });
});

// ── flyCoinsAlongLine ─────────────────────────────────────────────

describe('flyCoinsAlongLine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flies giver-edge → receiver-edge over 600 ms with 60 ms stagger and reveals the grid', () => {
    const scheduled: Array<{ delay: number; fn: () => void }> = [];
    const circles: Array<{ x: number; y: number }> = [];
    const revealInGrid = vi.fn();
    const scene = {
      soundManager: { play: vi.fn() },
      time: {
        delayedCall: vi.fn((delay: number, fn: () => void) => {
          scheduled.push({ delay, fn });
          return {};
        }),
      },
      add: {
        circle: vi.fn((x: number, y: number) => {
          circles.push({ x, y });
          return { setDepth: vi.fn().mockReturnThis(), destroy: vi.fn() };
        }),
      },
    };
    const animator = { scene, revealInGrid } as unknown as MainStreetAnimatorContext;
    const slot = makeSlot(1, 0);

    flyCoinsAlongLine(animator, slot, 150, { x: 160, y: 140 }, { x: 180, y: 140 }, 60);

    // 150 coins → 2 icons (round(150/100)), staggered 60 ms apart from `at`.
    expect(scheduled).toHaveLength(2);
    expect(scheduled[0].delay).toBe(60);
    expect(scheduled[1].delay).toBe(120);
    expect(revealInGrid).not.toHaveBeenCalled(); // nothing flies before its delay

    scheduled.forEach((call) => call.fn());

    expect(circles[0]).toEqual({ x: 160, y: 140 });
    expect(circles[1]).toEqual({ x: 160, y: 140 });
    const opts = moveGameObject.mock.calls[0][0] as unknown as {
      destX: number;
      destY: number;
      duration: number;
    };
    expect(opts.destX).toBe(180);
    expect(opts.destY).toBe(140);
    expect(opts.duration).toBe(600);
    expect(revealInGrid).toHaveBeenCalledTimes(2);
  });
});
