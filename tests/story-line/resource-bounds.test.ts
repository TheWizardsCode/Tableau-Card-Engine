/**
 * Resource-bounds suite — spill at the cap, clamped loss at the floor
 * (CG-0MWR0BGVG004UE7X, GDD §2.8 gap G4).
 *
 * The per-key ranges the GDD states (`hull` 0–5, `morale` 0–8, …) used to be
 * authoring discipline: `applyResourceDelta` forwarded every finite, non-zero
 * delta to the game's own field mutator with no bounds and no report, so a
 * gain at the cap banked silently and a loss at the floor drove the key
 * negative. This suite pins the delivered contract:
 *
 * 1. **Bounds are the caller's data.** `createResourceProjection(fields,
 *    { bounds })` clamps and spills only for the keys the caller bounded; the
 *    engine hard-codes no key and no range.
 * 2. **A gain at the cap spills** — applied only up to `max`, the excess
 *    reported as `spilled` and never banked or moved to another key.
 * 3. **A loss at the floor clamps** — applied only down to `min`, the
 *    unapplied magnitude reported as `clamped`, the key never left below `min`.
 * 4. **The remainder is reported** — one entry per declared key, in
 *    declaration order, plus a hook that fires at most once per call, only
 *    when something actually spilled or clamped.
 * 5. **Omitting bounds keeps today's behaviour exactly** — `applied === delta`,
 *    no clamping, no reporting: no existing game changes.
 *
 * @module
 */
import { describe, expect, it, vi } from 'vitest';

import {
  createResourceProjection,
  type ManifestResourceBounds,
  type ResourceProjectionOptions,
  type ResourceRemainderEntry,
  type ResourceRemainderReport,
  type StorylineCard,
  type StorylineEngineAdapter,
  type StorylineResourceField,
  type StorylineResourceKey,
} from '../../src/story-line';

/** The fixture ship's resource bag (one field per declared key). */
interface ShipState {
  hull: number;
  morale: number;
  stores: number;
}

/**
 * The fixture bounds: two keys bounded, deliberately non-alphabetical.
 *
 * `stores` is bounded differently from the GDD's 0–6 so a test that only
 * checks "within bounds" cannot pass by accident.
 */
const SHIP_BOUNDS: Record<StorylineResourceKey, ManifestResourceBounds> = {
  morale: { min: 0, max: 8 },
  hull: { min: 0, max: 5 },
  stores: { min: 0, max: 6 },
};

/** Declaration order the projection is built in (`['morale','hull','stores']`). */
const DECLARATION_ORDER: readonly StorylineResourceKey[] = ['morale', 'hull', 'stores'];

/** A ship at the supplied values, defaulting to the spike's start bag. */
function ship(overrides: Partial<ShipState> = {}): ShipState {
  return { hull: 5, morale: 5, stores: 4, ...overrides };
}

/** One recorded `fields[key].apply` call. */
interface ApplyCall {
  readonly key: StorylineResourceKey;
  readonly delta: number;
}

/** A projection over a {@link ShipState} plus the `apply` calls it made. */
interface ShipProjection {
  readonly projection: ReturnType<typeof createResourceProjection<ShipState>>;
  readonly applies: ApplyCall[];
}

/**
 * Builds the fixture projection.
 *
 * The field map is built in {@link DECLARATION_ORDER} and every `apply` is
 * recorded, so a test can assert both the report and what was actually
 * written to the game's state.
 */
function shipProjection(
  options: ResourceProjectionOptions<ShipState> = {},
  order: readonly StorylineResourceKey[] = DECLARATION_ORDER,
): ShipProjection {
  const applies: ApplyCall[] = [];
  const fields: Record<string, StorylineResourceField<ShipState>> = {};
  for (const key of order) {
    fields[key] = {
      read: (state) => state[key as keyof ShipState],
      apply: (state, delta) => {
        applies.push({ key, delta });
        state[key as keyof ShipState] += delta;
      },
    };
  }
  return { projection: createResourceProjection(fields, options), applies };
}

/** The report entry for one key, or a named failure when it is missing. */
function entryOf(report: ResourceRemainderReport, key: StorylineResourceKey): ResourceRemainderEntry {
  const entry = report.find((candidate) => candidate.key === key);
  if (entry === undefined) throw new Error(`The report does not cover "${key}".`);
  return entry;
}

describe('bounded resource projection — spill at the cap', () => {
  it('applies only up to the maximum and reports the excess as spilled', () => {
    const state = ship({ morale: 8 });
    const { projection, applies } = shipProjection({ bounds: SHIP_BOUNDS });

    const report = projection.applyResourceDelta(state, { morale: 2 });

    expect(state.morale).toBe(8);
    expect(entryOf(report, 'morale')).toEqual({
      key: 'morale',
      applied: 0,
      spilled: 2,
      clamped: 0,
    });
    // A fully wasted delta mutates nothing at all.
    expect(applies).toEqual([]);
  });

  it('applies the headroom of a partially spilled gain', () => {
    const state = ship({ morale: 6 });
    const { projection, applies } = shipProjection({ bounds: SHIP_BOUNDS });

    const report = projection.applyResourceDelta(state, { morale: 4 });

    expect(state.morale).toBe(8);
    expect(applies).toEqual([{ key: 'morale', delta: 2 }]);
    expect(entryOf(report, 'morale')).toEqual({
      key: 'morale',
      applied: 2,
      spilled: 2,
      clamped: 0,
    });
  });

  it('never transfers a spill to another key', () => {
    const state = ship({ morale: 8, stores: 0 });
    const { projection } = shipProjection({ bounds: SHIP_BOUNDS });

    projection.applyResourceDelta(state, { morale: 3, stores: 1 });

    expect(state.morale).toBe(8);
    expect(state.stores).toBe(1);
  });
});

describe('bounded resource projection — clamped loss at the floor', () => {
  it('applies only down to the minimum and reports the unapplied magnitude', () => {
    const state = ship({ stores: 1 });
    const { projection, applies } = shipProjection({ bounds: SHIP_BOUNDS });

    const report = projection.applyResourceDelta(state, { stores: -3 });

    expect(state.stores).toBe(0);
    expect(applies).toEqual([{ key: 'stores', delta: -1 }]);
    expect(entryOf(report, 'stores')).toEqual({
      key: 'stores',
      applied: -1,
      spilled: 0,
      clamped: 2,
    });
  });

  it('never lets a bounded key end below its minimum', () => {
    const { projection } = shipProjection({ bounds: SHIP_BOUNDS });
    for (let start = -2; start <= 8; start += 1) {
      for (let delta = -12; delta <= 12; delta += 1) {
        // A zero / absent delta applies nothing at all, so it legitimately
        // leaves an already-out-of-bounds start alone.
        if (delta === 0) continue;
        const state = ship({ stores: start, morale: start, hull: start });
        projection.applyResourceDelta(state, { stores: delta });
        expect(state.stores).toBeGreaterThanOrEqual(SHIP_BOUNDS.stores.min);
        expect(state.stores).toBeLessThanOrEqual(SHIP_BOUNDS.stores.max);
      }
    }
  });

  it('reports an already-out-of-bounds start honestly', () => {
    // A key above its maximum is corrected by the next delta; the accounting
    // identity `applied = (target − current) + clamped − spilled` must hold.
    const state = ship({ morale: 10 });
    const { projection } = shipProjection({ bounds: SHIP_BOUNDS });

    const report = projection.applyResourceDelta(state, { morale: 2 });

    expect(state.morale).toBe(8);
    expect(entryOf(report, 'morale')).toEqual({
      key: 'morale',
      applied: -2,
      spilled: 4,
      clamped: 0,
    });
  });
});

describe('bounded resource projection — scope of the bounds', () => {
  it('leaves a key with no bounds entry unbounded', () => {
    const state = ship({ stores: 1 });
    const { projection } = shipProjection({ bounds: { morale: { min: 0, max: 8 } } });

    const report = projection.applyResourceDelta(state, { stores: 40 });

    expect(state.stores).toBe(41);
    expect(entryOf(report, 'stores')).toEqual({
      key: 'stores',
      applied: 40,
      spilled: 0,
      clamped: 0,
    });
    expect(entryOf(report, 'morale')).toEqual({
      key: 'morale',
      applied: 0,
      spilled: 0,
      clamped: 0,
    });
  });

  it('keeps today’s behaviour exactly when no bounds are supplied', () => {
    const state = ship({ morale: 8 });
    const { projection, applies } = shipProjection();

    const report = projection.applyResourceDelta(state, { morale: 5, stores: -9 });

    expect(state.morale).toBe(13);
    expect(state.stores).toBe(-5);
    expect(applies).toEqual([
      { key: 'morale', delta: 5 },
      { key: 'stores', delta: -9 },
    ]);
    // `applied === delta` and nothing is reported as wasted.
    expect(entryOf(report, 'morale')).toEqual({
      key: 'morale',
      applied: 5,
      spilled: 0,
      clamped: 0,
    });
    expect(entryOf(report, 'stores')).toEqual({
      key: 'stores',
      applied: -9,
      spilled: 0,
      clamped: 0,
    });
  });

  it('ignores an invalid bounds entry rather than producing nonsense', () => {
    // `readManifestBounds` refuses an inverted range, so a caller passing one
    // has bypassed its validation; the projection must stay total.
    const state = ship({ morale: 8 });
    const { projection } = shipProjection({
      bounds: {
        morale: { min: 9, max: 2 },
        stores: { min: Number.NEGATIVE_INFINITY, max: 6 },
      },
    });

    const report = projection.applyResourceDelta(state, { morale: 1, stores: 100 });

    expect(state.morale).toBe(9);
    expect(state.stores).toBe(104);
    expect(entryOf(report, 'morale')).toEqual({
      key: 'morale',
      applied: 1,
      spilled: 0,
      clamped: 0,
    });
  });
});

describe('bounded resource projection — the remainder report', () => {
  it('covers every declared key in declaration order, with zeros for untouched keys', () => {
    const { projection } = shipProjection({ bounds: SHIP_BOUNDS });

    const report = projection.applyResourceDelta(ship(), { stores: 1 });

    expect(report.map((entry) => entry.key)).toEqual([...DECLARATION_ORDER]);
    expect(report).toEqual([
      { key: 'morale', applied: 0, spilled: 0, clamped: 0 },
      { key: 'hull', applied: 0, spilled: 0, clamped: 0 },
      { key: 'stores', applied: 1, spilled: 0, clamped: 0 },
    ]);
  });

  it('reports a different declaration order as a different order', () => {
    const { projection } = shipProjection({ bounds: SHIP_BOUNDS }, ['stores', 'morale', 'hull']);

    const report = projection.applyResourceDelta(ship(), {});

    expect(report.map((entry) => entry.key)).toEqual(['stores', 'morale', 'hull']);
  });

  it('applies multi-key deltas independently, one entry per key', () => {
    const state = ship({ morale: 7, stores: 1 });
    const { projection, applies } = shipProjection({ bounds: SHIP_BOUNDS });

    const report = projection.applyResourceDelta(state, { morale: 3, stores: -4 });

    expect(state.morale).toBe(8);
    expect(state.stores).toBe(0);
    expect(applies).toEqual([
      { key: 'morale', delta: 1 },
      { key: 'stores', delta: -1 },
    ]);
    expect(report).toEqual([
      { key: 'morale', applied: 1, spilled: 2, clamped: 0 },
      { key: 'hull', applied: 0, spilled: 0, clamped: 0 },
      { key: 'stores', applied: -1, spilled: 0, clamped: 3 },
    ]);
  });

  it('is deterministic: the same state and delta always yield the same report', () => {
    const { projection } = shipProjection({ bounds: SHIP_BOUNDS });
    const first = ship({ morale: 7, stores: 1 });
    const second = ship({ morale: 7, stores: 1 });

    const firstReport = projection.applyResourceDelta(first, { morale: 3, stores: -4 });
    const secondReport = projection.applyResourceDelta(second, { morale: 3, stores: -4 });

    expect(secondReport).toEqual(firstReport);
    expect(first).toEqual(second);
  });
});

describe('bounded resource projection — the remainder hook', () => {
  it('fires once, carrying the report the return value carries', () => {
    const onRemainder = vi.fn();
    const { projection } = shipProjection({ bounds: SHIP_BOUNDS, onRemainder });

    const report = projection.applyResourceDelta(ship({ morale: 8, stores: 1 }), {
      morale: 2,
      stores: -5,
    });

    expect(onRemainder).toHaveBeenCalledTimes(1);
    expect(onRemainder.mock.calls[0][0]).toBe(report);
  });

  it('does not fire when nothing spilled or clamped', () => {
    const onRemainder = vi.fn();
    const { projection } = shipProjection({ bounds: SHIP_BOUNDS, onRemainder });

    projection.applyResourceDelta(ship({ morale: 5 }), { morale: 1, stores: -1 });

    expect(onRemainder).not.toHaveBeenCalled();
  });

  it('does not fire for an unbounded projection', () => {
    const onRemainder = vi.fn();
    const { projection } = shipProjection({ onRemainder });

    projection.applyResourceDelta(ship({ morale: 8 }), { morale: 99 });

    expect(onRemainder).not.toHaveBeenCalled();
  });

  it('hands the mutated state to the hook so a game can record the remainder', () => {
    const onRemainder = vi.fn();
    const { projection } = shipProjection({ bounds: SHIP_BOUNDS, onRemainder });
    const state = ship({ morale: 8 });

    projection.applyResourceDelta(state, { morale: 2 });

    expect(onRemainder.mock.calls[0][1]).toBe(state);
    expect(state.morale).toBe(8);
  });
});

describe('bounded resource projection — unchanged filtering', () => {
  it('still ignores non-finite, zero and undeclared values', () => {
    const state = ship({ morale: 5 });
    const { projection, applies } = shipProjection({ bounds: SHIP_BOUNDS });

    const report = projection.applyResourceDelta(state, {
      morale: 0,
      hull: Number.NaN,
      stores: Number.POSITIVE_INFINITY,
      shields: 3,
    });

    expect(state).toEqual(ship({ morale: 5 }));
    expect(applies).toEqual([]);
    expect(report.every((entry) => entry.applied === 0)).toBe(true);
    expect(report).toHaveLength(DECLARATION_ORDER.length);
  });

  it('stays structurally assignable to the void-returning adapter seam', () => {
    const { projection } = shipProjection({ bounds: SHIP_BOUNDS });

    const adapter: StorylineEngineAdapter<ShipState, StorylineCard> = {
      ...projection,
      rng: () => 0.5,
      applyEffect: () => {
        // The fixture has no card-level effect.
      },
      appendLog: () => {
        // No activity log in this fixture.
      },
      getActivityLog: () => [],
      getTemplate: () => null,
      getBaseTypeId: (id) => id,
      getChainScanCards: () => [],
      pushChainCard: () => {
        // No chain in this fixture.
      },
    };

    expect(typeof adapter.applyResourceDelta).toBe('function');
    expect(adapter.resources).toEqual([...DECLARATION_ORDER]);
    adapter.applyResourceDelta?.(ship({ morale: 8 }), { morale: 1 });
  });
});
