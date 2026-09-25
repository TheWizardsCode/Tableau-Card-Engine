/**
 * Main Street: Undo/Redo Button Enabled-State Browser Tests
 *
 * The undo/redo HUD buttons must never look clickable when the underlying
 * stack is empty (CG-0MT5Y4DL8000AKKZ). This suite drives a real Phaser
 * scene and asserts the *observable* button alphas (1.0 = enabled,
 * 0.5 = disabled) after each stack-mutating operation:
 *
 * 1. Boot — both stacks empty → both buttons disabled (AC 1 & 2).
 * 2. A real player action through the turn controller (`onRefreshMarketClick`)
 *    adds an undo entry → Undo enabled, Redo still disabled (AC 3).
 * 3. `performUndo()` flips the state → Undo disabled, Redo enabled (AC 4).
 * 4. `performRedo()` flips it back → Undo enabled, Redo disabled (AC 4).
 * 5. `endTurn()` clears the per-turn stacks → both buttons disabled (AC 5).
 * 6. A sell confirmed through the overlay dialog (which executes
 *    `sellBusinessCommand` via the undo manager) enables Undo (AC 3).
 *
 * The alpha-to-state mapping itself is covered by the shared
 * `tests/ui/CardGameScene.test.ts` unit tests; here we assert the Main
 * Street wiring feeds that mechanism the right values at the right times.
 *
 * @module tests/main-street/undo-redo-button-state.browser
 */

import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '@core-tests/helpers/waitForScene';
import { getBusinessTemplates, type BusinessCard } from '../../example-games/main-street/MainStreetCards';
import type { MainStreetState } from '../../example-games/main-street/MainStreetState';

/** Alpha used by `refreshUndoRedoButtons` for an available action. */
const ENABLED = 1.0;
/** Alpha used by `refreshUndoRedoButtons` for an unavailable action. */
const DISABLED = 0.5;

// ── Boot / teardown helpers (mirrors MainStreetScene.browser.test.ts) ──

/**
 * Clear persistent storage (localStorage + IndexedDB) so a checkpoint saved
 * by another test in the shared browser profile cannot surface the resume
 * overlay and leave the scene in a non-market phase.
 */
async function clearPersistentStorage(): Promise<void> {
  try { localStorage.clear(); } catch { /* ignore */ }
  try {
    let names: string[] = ['save-load-store'];
    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      try {
        names = (await Promise.race([
          indexedDB.databases(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('databases timeout')), 2000)),
        ])).map((d: IDBDatabaseInfo) => d.name).filter((n): n is string => !!n);
      } catch { /* fall back to the default name */ }
    }
    await Promise.race([
      Promise.all(
        names.map(
          (n: string) =>
            new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(n);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            }),
        ),
      ),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch { /* ignore non-browser environments */ }
}

interface SceneLike extends Phaser.Scene {
  state: MainStreetState;
  undoManager: { canUndo: () => boolean; canRedo: () => boolean };
  undoButton?: Phaser.GameObjects.Container | null;
  redoButton?: Phaser.GameObjects.Container | null;
  msTurnController: {
    performUndo: () => void;
    performRedo: () => void;
    endTurn: () => void;
    onRefreshMarketClick: () => void;
    onSellCard: (slotIndex: number) => void;
  };
  overlayObjects: Phaser.GameObjects.GameObject[];
  refreshAll: () => void;
  uiPhase: string;
}

async function bootGame(): Promise<Phaser.Game> {
  await clearPersistentStorage();
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame({ type: Phaser.CANVAS });
  await waitForScene(game, 'MainStreetScene');

  const scene = game.scene.getScene('MainStreetScene') as SceneLike;
  // The undo manager and its HUD buttons are wired during scene setup; wait
  // for both so the first assertion cannot race the initialisation.
  await waitForCondition(
    () => Boolean(scene.undoManager && scene.undoButton && scene.redoButton),
    { timeoutMs: 20_000, label: 'undo manager + buttons initialised' },
  );
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

async function waitForCondition(
  predicate: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const intervalMs = options.intervalMs ?? 25;
  const label = options.label ?? 'condition';
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}

/** Assert the observable enabled-state of both HUD buttons. */
function expectButtons(scene: SceneLike, undoEnabled: boolean, redoEnabled: boolean): void {
  expect(scene.undoButton?.alpha).toBe(undoEnabled ? ENABLED : DISABLED);
  expect(scene.redoButton?.alpha).toBe(redoEnabled ? ENABLED : DISABLED);
}

/**
 * Put the scene into a playable MarketPhase with coins for the actions under
 * test. Mirrors the `executeWeekStart` fallback used by
 * `tests/main-street/undo-redo.browser.test.ts`.
 */
async function ensureMarketPhase(scene: SceneLike): Promise<void> {
  const state = scene.state;
  if (state.phase === 'WeekStart') {
    const { executeWeekStart } = await import('../../example-games/main-street/MainStreetEngine');
    executeWeekStart(state);
  }
  state.resourceBank.coins = 2000;
  scene.uiPhase = 'market';
}

function makeBusiness(): BusinessCard {
  const tpl = getBusinessTemplates()[0];
  return {
    ...tpl,
    id: `undo-redo-button-${tpl.id}`,
    family: 'business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
  };
}

describe('MainStreet undo/redo button enabled state', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    const moduleUrl = (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE_URL__;
    if (typeof moduleUrl === 'string' && moduleUrl.startsWith('blob:')) {
      URL.revokeObjectURL(moduleUrl);
    }

    delete (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE__;
    delete (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE_URL__;
    delete (globalThis as unknown as Record<string, unknown>).__TF_PLAY_COUNT__;
    destroyGame(game);
    game = null;
  });

  it('tracks the stack through action → undo → redo → end-turn', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as SceneLike;

    // ── AC 1 & 2: empty stacks at boot → both buttons disabled ──
    expect(scene.undoManager.canUndo()).toBe(false);
    expect(scene.undoManager.canRedo()).toBe(false);
    expectButtons(scene, false, false);

    await ensureMarketPhase(scene);

    // ── AC 3: a real controller action adds an undo entry ──
    scene.msTurnController.onRefreshMarketClick();
    expect(scene.undoManager.canUndo()).toBe(true);
    expect(scene.undoManager.canRedo()).toBe(false);
    expectButtons(scene, true, false);

    // ── AC 4: undo makes Redo available and exhausts Undo ──
    scene.msTurnController.performUndo();
    expect(scene.undoManager.canUndo()).toBe(false);
    expect(scene.undoManager.canRedo()).toBe(true);
    expectButtons(scene, false, true);

    // ── AC 4: redo re-applies the entry, exhausting Redo again ──
    scene.msTurnController.performRedo();
    expect(scene.undoManager.canUndo()).toBe(true);
    expect(scene.undoManager.canRedo()).toBe(false);
    expectButtons(scene, true, false);

    // ── AC 5: end-of-turn clears the per-turn stacks ──
    scene.msTurnController.endTurn();
    expect(scene.undoManager.canUndo()).toBe(false);
    expect(scene.undoManager.canRedo()).toBe(false);
    expectButtons(scene, false, false);
  }, 30_000);

  it('enables Undo after a sale confirmed through the overlay dialog', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as SceneLike;

    await ensureMarketPhase(scene);

    // Place a business so the sell confirmation has a target, then open it.
    scene.state.streetGrid[0] = makeBusiness();
    scene.state.soldSlots[0] = false;
    scene.refreshAll();
    scene.msTurnController.onSellCard(0);

    const sellButton = scene.overlayObjects.find(
      (o) => (o as unknown as { text?: string }).text === '[ Sell ]',
    ) as Phaser.GameObjects.Text | undefined;
    expect(sellButton).toBeDefined();

    // Confirm the sale — the handler executes sellBusinessCommand through the
    // undo manager, so Undo must become available and its button enabled.
    sellButton!.emit('pointerdown');

    await waitForCondition(() => scene.state.soldSlots[0] === true, {
      timeoutMs: 5_000,
      label: 'sale committed',
    });
    expect(scene.undoManager.canUndo()).toBe(true);
    expect(scene.undoManager.canRedo()).toBe(false);
    expectButtons(scene, true, false);
  }, 30_000);
});
