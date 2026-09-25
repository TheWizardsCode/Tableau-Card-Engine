/**
 * Expanded Grid Save/Load, Camera & Undo (CG-0MTH9OWF2002YQQ3)
 *
 * Unit tests for the persistence of the expanded street grid, the street-map
 * camera, and undo/redo of commands that mutate the grid:
 *
 *  - AC1: `MainStreetSerializedState` carries `streetGridCols`/`streetGridRows`,
 *    `streetCamera`, the world-indexed `streetGrid`, and a `soldSlots` array
 *    sized to the world grid; serialise/deserialise round-trips without loss.
 *  - AC2: legacy saves (no grid/camera fields) load as 1×1 with the default
 *    camera, identical card positions, and a resized `soldSlots`.
 *  - AC3: the command snapshot machinery (used by `UndoRedoManager`) captures
 *    and restores a world-sized `streetGrid`/`soldSlots` — undo of a placement
 *    on an expanded grid removes the card and reverts the resources.
 *  - AC4: a re-seeded expanded fixture reproduces the same state.
 *
 * The MainStreet save schema version stays 1: `SaveLoadStore` strictly rejects
 * version mismatches, so backward compatibility is provided by migration
 * defaults (mirroring `pendingEventChoice`, CG-0MTT7F1JG007E7UL).
 *
 * @module tests/main-street/save-load-expanded
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { SaveLoadStore } from '@core-engine';
import { UndoRedoManager } from '@core-engine/UndoRedoManager';
import {
  setupMainStreetGame,
  serializeMainStreetState,
  deserializeMainStreetState,
  type MainStreetSerializedState,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';
import { worldSlotCount } from '../../example-games/main-street/MainStreetAdjacency';
import { buyBusinessCommand } from '../../example-games/main-street/MainStreetCommands';
import {
  createMainStreetCheckpointManager,
  MAIN_STREET_SAVE_SCHEMA_VERSION,
} from '../../example-games/main-street/MainStreetSaveLoad';

function createLocalStorageMock(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
  };
}

/**
 * Build a 2×1 (20 unique world slot, city-block grid) expanded state
 * from a normal 1×1 game, carrying any business card from the market onto the
 * expanded grid so the world-sized array is non-trivial.
 */
function makeExpandedState(seed = 'expanded-save-load'): MainStreetState {
  const state = setupMainStreetGame({ seed });
  const size = worldSlotCount(2, 1); // 20
  state.streetGridCols = 2;
  state.streetGridRows = 1;
  state.streetGrid = new Array<BusinessCard | null>(size).fill(null);
  state.soldSlots = new Array<boolean>(size).fill(false);

  const card = state.market.cards.find(
    (c) => c.family === 'business' || c.family === 'community-space',
  ) as BusinessCard | undefined;
  if (!card) throw new Error('fixture: no business card in market');
  state.streetGrid[10] = { ...card, id: `${card.id}-world10` } as BusinessCard;
  state.soldSlots[5] = true;
  state.streetCamera = { zoomLevel: 2, focusX: 123, focusY: -45 };
  return state;
}

describe('expanded grid save/load, camera & undo (CG-0MTH9OWF2002YQQ3)', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', createLocalStorageMock());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('bumps the MainStreet save schema and still loads legacy saves via migration (AC2)', () => {
    // The day→week terminology rename (CG-0MTMYIHKO001QCWL) bumped the schema
    // to v2 and added a forward-migration hook, so pre-change saves still load
    // while the wire format carries the new field names.
    expect(MAIN_STREET_SAVE_SCHEMA_VERSION).toBe(2);
  });

  // ── AC1: round-trip ──────────────────────────────────────

  it('round-trips the camera, grid dimensions and world-sized grid (AC1)', () => {
    const state = makeExpandedState('round-trip-expanded');
    const saved = serializeMainStreetState(state);

    expect(saved.streetGridCols).toBe(2);
    expect(saved.streetGridRows).toBe(1);
    expect(saved.streetGrid).toHaveLength(20);
    expect(saved.streetCamera).toEqual({ zoomLevel: 2, focusX: 123, focusY: -45 });
    expect(saved.soldSlots).toHaveLength(20);

    const restored = deserializeMainStreetState(saved);

    expect(restored.streetGridCols).toBe(2);
    expect(restored.streetGridRows).toBe(1);
    expect(restored.streetGrid).toHaveLength(20);
    expect(restored.streetCamera).toEqual({ zoomLevel: 2, focusX: 123, focusY: -45 });
    expect(restored.soldSlots).toHaveLength(20);

    // The world-10 card survives verbatim and the sold flag is preserved.
    expect(restored.streetGrid[10]?.id).toBe(`${state.streetGrid[10]!.id}`);
    expect(restored.streetGrid[0]).toBeNull();
    expect(restored.soldSlots[5]).toBe(true);
    expect(restored.soldSlots[10]).toBe(false);
  });

  it('round-trips the shipped 1×1 camera state without loss (AC1)', () => {
    const state = setupMainStreetGame({ seed: 'round-trip-1x1' });
    state.streetCamera = { zoomLevel: 3, focusX: 7, focusY: 9 };
    const restored = deserializeMainStreetState(serializeMainStreetState(state));

    expect(restored.streetGridCols).toBe(1);
    expect(restored.streetGridRows).toBe(1);
    expect(restored.streetCamera).toEqual({ zoomLevel: 3, focusX: 7, focusY: 9 });
    expect(restored.soldSlots).toHaveLength(10);
  });

  // ── AC2: legacy migration ────────────────────────────────

  it('loads a pre-camera save as 1×1 with the default camera (AC2)', () => {
    const state = setupMainStreetGame({ seed: 'legacy-migration' });
    const saved = serializeMainStreetState(state) as Partial<MainStreetSerializedState>;
    delete saved.streetCamera;
    delete saved.streetGridCols;
    delete saved.streetGridRows;

    const restored = deserializeMainStreetState(saved as MainStreetSerializedState);

    expect(restored.streetGridCols).toBe(1);
    expect(restored.streetGridRows).toBe(1);
    expect(restored.streetCamera).toEqual({ zoomLevel: 1, focusX: 0, focusY: 0 });
    expect(restored.streetGrid).toHaveLength(10);
    expect(restored.soldSlots).toHaveLength(10);
  });

  it('resizes legacy soldSlots to the world grid on load, preserving flags (AC2)', () => {
    const state = makeExpandedState('legacy-sold-slots');
    const saved = serializeMainStreetState(state) as Partial<MainStreetSerializedState>;
    // Simulate a legacy save: sold flags sized for the 1×1 board only.
    saved.soldSlots = new Array<boolean>(10).fill(false);
    saved.soldSlots[9] = true;

    const restored = deserializeMainStreetState(saved as MainStreetSerializedState);

    expect(restored.soldSlots).toHaveLength(20);
    expect(restored.soldSlots[9]).toBe(true);
    expect(restored.soldSlots[17]).toBe(false);
  });

  it('serialises soldSlots at the world grid size even when the runtime array is stale (AC1)', () => {
    const state = makeExpandedState('stale-sold-slots');
    // A stale, too-short sold list must not leak into the saved payload.
    state.soldSlots = new Array<boolean>(10).fill(false);
    state.soldSlots[3] = true;

    const saved = serializeMainStreetState(state);

    expect(saved.streetGrid).toHaveLength(20);
    expect(saved.soldSlots).toHaveLength(20);
    expect(saved.soldSlots[3]).toBe(true);
    expect(saved.soldSlots[17]).toBe(false);
  });

  // ── AC3: undo captures/restores the expanded grid ────────

  it('undo of a placement on an expanded grid removes the card and reverts resources (AC3)', () => {
    const state = makeExpandedState('undo-expanded-placement');
    // Generous coins so the fixture's own market card (the one already
    // placed at the street-edge slot 10 with a -world10 id) is affordable
    // here too — its identity drives the integrity assertion below.
    state.resourceBank.coins = 10000;
    state.actionsRemaining = 2;

    const card = state.market.cards.find(
      (c) =>
        (c.family === 'business' || c.family === 'community-space') &&
        c.cost <= state.resourceBank.coins,
    );
    if (!card) throw new Error('fixture: no affordable card');

    const gridBefore = state.streetGrid.map((c) => c?.id ?? null);
    const soldBefore = [...state.soldSlots];
    const coinsBefore = state.resourceBank.coins;
    const actionsBefore = state.actionsRemaining;

    const undoManager = new UndoRedoManager();
    const slotIndex = 3; // a valid world slot on the expanded grid
    undoManager.execute(buyBusinessCommand(state, card.id, slotIndex));

    expect(state.streetGrid[slotIndex]).not.toBeNull();
    expect(state.streetGrid).toHaveLength(20);
    expect(state.resourceBank.coins).toBeLessThan(coinsBefore);
    expect(state.actionsRemaining).toBe(actionsBefore - 1);

    undoManager.undo();

    expect(state.streetGrid).toHaveLength(20);
    expect(state.streetGrid.map((c) => c?.id ?? null)).toEqual(gridBefore);
    expect(state.soldSlots).toHaveLength(20);
    expect(state.soldSlots).toEqual(soldBefore);
    expect(state.resourceBank.coins).toBe(coinsBefore);
    expect(state.actionsRemaining).toBe(actionsBefore);
    // The street-edge card placed by the fixture is untouched by the undo.
    expect(state.streetGrid[10]?.id).toBe(`${card.id}-world10`);
  });

  // ── AC4: determinism ─────────────────────────────────────

  it('re-seeds the same expanded fixture deterministically (AC4)', () => {
    const state = makeExpandedState('deterministic-expanded');
    // Consume some RNG so the checkpoint records a non-zero rngCalls offset.
    for (let i = 0; i < 5; i++) state.rng();

    const restored = deserializeMainStreetState(serializeMainStreetState(state));

    // The world-sized grid and camera survive the re-seed identically.
    expect(restored.streetGridCols).toBe(2);
    expect(restored.streetGridRows).toBe(1);
    expect(restored.streetGrid.map((c) => c?.id ?? null)).toEqual(
      state.streetGrid.map((c) => c?.id ?? null),
    );
    expect(restored.streetCamera).toEqual(state.streetCamera);

    // The RNG stream continues from the same point (fnv of seed + rngCalls).
    expect(restored.rngCalls).toBe(state.rngCalls);
    const nextOriginal = state.rng();
    const nextRestored = restored.rng();
    expect(nextRestored).toBe(nextOriginal);

    // A different seed produces a different market deal.
    const other = serializeMainStreetState(makeExpandedState('deterministic-expanded-other'));
    expect(other.market.cards.map((x) => x.id)).not.toEqual(
      serializeMainStreetState(state).market.cards.map((x) => x.id),
    );
  });

  // ── Checkpoint resume with camera ────────────────────────

  it('checkpoint save/load preserves the camera state (AC1/AC3)', async () => {
    const store = new SaveLoadStore();
    const mgr = createMainStreetCheckpointManager(store);

    const state = setupMainStreetGame({ seed: 'checkpoint-camera' });
    state.streetCamera = { zoomLevel: 4, focusX: -12, focusY: 34 };

    await mgr.save(state);
    const restored = await mgr.load();

    expect(restored).not.toBeNull();
    expect(restored!.streetCamera).toEqual({ zoomLevel: 4, focusX: -12, focusY: 34 });
    expect(restored!.streetGridCols).toBe(1);
    expect(restored!.streetGridRows).toBe(1);
  });
});
