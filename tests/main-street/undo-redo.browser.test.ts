/**
 * Main Street: Undo/Redo Feedback Notification Browser Tests
 *
 * Verifies the undo/redo feedback trigger end to end in a real Phaser scene:
 *
 * 1. Undoing a real executed command (`performUndo`) triggers
 *    `MainStreetAnimator.animateUndoRedo({ action: 'undo', description })`
 *    with the reversed command's description, and the action is actually
 *    reversed on the board.
 * 2. Redoing it (`performRedo`) triggers `animateUndoRedo({ action: 'redo',
 *    description })` and re-applies the action.
 *
 * The pop/SFX internals are covered deterministically by the unit tests;
 * here we assert the wiring + state changes.
 *
 * @module tests/main-street/undo-redo.browser
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';
import type { MainStreetState } from '../../example-games/main-street/MainStreetState';

// ── Boot helpers (mirrors MainStreetScene.browser.test.ts) ──

/**
 * Clear persistent storage (localStorage + IndexedDB) so a checkpoint saved
 * by another test in the shared browser profile cannot surface the resume
 * overlay during the tests (CG-0MTF70V9X002CAYH). A mid-day checkpoint can
 * restore a partially-sold market row with no business cards, which makes
 * the affordable-card finder below come up empty (the ≥1-business rule only
 * applies at refill time). Same helper as the other MainStreet browser
 * tests (composite / click-place / drag / hint-bar-placement / migration).
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

async function bootGame(): Promise<Phaser.Game> {
  await clearPersistentStorage();  // stale checkpoint → resume overlay → stale market state
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame({ type: Phaser.CANVAS });
  await waitForCondition(
    () => {
      const scene = game.scene.getScene('MainStreetScene');
      return Boolean(scene && (scene as any).state && (scene as any).undoManager && (scene as any).msAnimator);
    },
    { timeoutMs: 20_000, label: 'MainStreetScene boot' },
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

interface UndoRedoCall {
  action: 'undo' | 'redo';
  description: string;
}

/** Spy on the animator's undo/redo feedback (call-through so visuals run). */
function spyOnUndoRedo(scene: Phaser.Scene & Record<string, unknown>): { calls: UndoRedoCall[] } {
  const animator = scene.msAnimator as unknown as {
    animateUndoRedo: (params: UndoRedoCall) => void;
  };
  const original = animator.animateUndoRedo.bind(animator);
  const calls: UndoRedoCall[] = [];
  vi.spyOn(animator, 'animateUndoRedo').mockImplementation((params) => {
    calls.push(params);
    original(params); // run the real implementation so the pop + SFX run
  });
  return { calls };
}

describe('MainStreet undo/redo feedback', () => {
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

  it('undo and redo each fire the notification trigger and actually reverse/reapply the action', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const s = scene as any;

    // Populate the market (the booted game waits for the player to start the day).
    const state = s.state as MainStreetState;
    if (state.market.cards.length === 0) {
      state.phase = 'DayStart';
      const { executeDayStart } = await import('../../example-games/main-street/MainStreetEngine');
      executeDayStart(state);
    }

    // Generous coins so an affordable business/community-space card always
    // exists in the row regardless of the random seed's market draw (mirror
    // of MainStreetScene.browser.test.ts; the default boot is not guaranteed
    // to yield a buyable card at starting coins).
    state.resourceBank.coins = 2000;

    const emptySlot = state.streetGrid.findIndex((cell) => cell === null);
    expect(emptySlot).toBeGreaterThanOrEqual(0);
    // The cheapest *purchasable-on-street* card (business/community-space) —
    // events/staff/upgrades are bought through their own commands and would
    // be rejected by buyBusinessCommand.
    const affordable = state.market.cards.find(
      (b) =>
        (b.family === 'business' || b.family === 'community-space') &&
        b.cost <= state.resourceBank.coins,
    );
    expect(affordable).toBeDefined();

    // Execute a real purchase through the scene's own undo manager (the same
    // path the turn controller uses for clicks).
    const { buyBusinessCommand } = await import('../../example-games/main-street/MainStreetCommands');
    const cmd = buyBusinessCommand(state, affordable!.id, emptySlot);
    s.undoManager.execute(cmd);

    expect(state.streetGrid[emptySlot]).not.toBeNull();
    const streetCardId = (state.streetGrid[emptySlot] as { id: string }).id;
    expect(streetCardId).toBe(affordable!.id);

    // ── Undo ──
    const { calls } = spyOnUndoRedo(scene);
    (s.msTurnController as unknown as { performUndo: () => void }).performUndo();

    await waitForCondition(() => calls.length >= 1, { timeoutMs: 5000, label: 'undo trigger' });
    expect(calls).toHaveLength(1);
    expect(calls[0].action).toBe('undo');
    expect(calls[0].description.length).toBeGreaterThan(0);
    expect(calls[0].description).toContain(affordable!.id);

    // The street slot is actually freed (action reversed).
    expect(state.streetGrid[emptySlot]).toBeNull();

    // ── Redo ──
    vi.clearAllMocks();
    const { calls: redoCalls } = spyOnUndoRedo(scene);
    (s.msTurnController as unknown as { performRedo: () => void }).performRedo();

    await waitForCondition(() => redoCalls.length >= 1, { timeoutMs: 5000, label: 'redo trigger' });
    expect(redoCalls).toHaveLength(1);
    expect(redoCalls[0].action).toBe('redo');
    expect(redoCalls[0].description).toBe(calls[0].description);

    // The street slot is re-filled (action re-applied).
    expect((state.streetGrid[emptySlot] as { id: string }).id).toBe(affordable!.id);
  }, 30_000);

  it('does not fire the trigger when there is nothing to undo (empty stack)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const s = scene as any;

    const { calls } = spyOnUndoRedo(scene);
    (s.msTurnController as unknown as { performUndo: () => void }).performUndo();

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(calls).toHaveLength(0);
  }, 30_000);
});
