/**
 * Main Street click-to-place regression tests.
 *
 * Regression guard for CG-0MSN8ZZX2000B9UP: clicking an empty street slot to
 * place a business did nothing because the drag-drop drop zones (registered
 * AFTER the slot rectangles were drawn) rendered on top and — under Phaser's
 * default topOnly input mode — swallowed the pointer events meant for the
 * slot rectangles.
 *
 * The fix moves refreshDragDropZones() BEFORE the slot-drawing loop so the
 * clickable slot rectangles end up top-most and receive pointer events.
 *
 * These tests exercise the REAL Phaser pointer pipeline: they boot the actual
 * MainStreetScene and dispatch native DOM mousedown/mouseup events on the
 * canvas at slot coordinates (CSS-scale-aware), then assert the held business
 * card lands on the slot. Calling scene.onSlotClick(idx) directly would
 * bypass the exact input-ordering bug this regression guards against.
 *
 * @module tests/main-street/click-place.browser
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import { TUTORIAL_STATE_STORAGE_KEY } from '../../example-games/main-street/TutorialState';
import { canPurchaseBusiness, getEmptySlots } from '../../example-games/main-street/MainStreetMarket';
import { PREMIUM_DIALOG_DISMISSED_KEY } from '../../example-games/main-street/MainStreetPrefs';

const GAME_W = 1280;
const GAME_H = 720;

/**
 * Clear persistent storage (localStorage + IndexedDB) so a checkpoint saved
 * by another test (or a previous run) cannot surface the resume overlay
 * (depth-2000 full-screen blocker) during the tests.
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
          (n) =>
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
  } catch { /* ignore */ }
}

async function bootGame(): Promise<Phaser.Game> {
  await clearPersistentStorage();
  // Skip the first-launch tutorial offer modal for every test so it cannot
  // block canvas pointer events.
  localStorage.setItem(
    TUTORIAL_STATE_STORAGE_KEY,
    JSON.stringify({ schemaVersion: 1, status: 'skipped', completedAt: null, lastStepId: null }),
  );
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import(
    '../../example-games/main-street/createMainStreetGame'
  );
  const game = createMainStreetGame({
    type: Phaser.CANVAS,
    parent: 'game-container',
    width: GAME_W,
    height: GAME_H,
  });
  await waitForScene(game, 'MainStreetScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

/**
 * Dispatch a native DOM MouseEvent at canvas (world) coordinates. The canvas
 * may be CSS-scaled to fit the browser viewport, so game-world coordinates
 * are converted to client coordinates via the canvas bounding rect.
 */
function dispatchMouse(type: string, worldX: number, worldY: number): void {
  const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement;
  expect(canvas).toBeTruthy();
  const rect = canvas.getBoundingClientRect();
  const clientX = rect.x + (worldX / GAME_W) * rect.width;
  const clientY = rect.y + (worldY / GAME_H) * rect.height;
  canvas.dispatchEvent(
    new MouseEvent(type, {
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
    }),
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(
  predicate: () => boolean,
  label: string,
  timeoutMs = 10_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await wait(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

type Scene = Phaser.Scene & Record<string, any>;

function getScene(game: Phaser.Game): Scene {
  return game.scene.getScene('MainStreetScene') as Scene;
}

/** Wait until the market row is populated (campaign load + day start). */
async function waitForMarketReady(scene: Scene): Promise<void> {
  await waitForCondition(
    () => scene.state?.market?.cards?.length > 0,
    'market row populated',
  );
}

/**
 * Wait until market rendering has settled (no container rebuilds). Shortly
 * after boot the SVG prewarm chain triggers a final refreshAll which destroys
 * and rebuilds the market-card containers; a rebuild mid-gesture would
 * invalidate the objects under the pointer.
 */
async function waitForSettled(scene: Scene): Promise<void> {
  const firstCard = (): Phaser.GameObjects.GameObject | undefined =>
    (scene.marketContainer?.list ?? []).find(
      (c: any) => c.name?.startsWith?.('ms-market-card-'),
    );
  for (let i = 0; i < 60; i++) {
    await wait(250);
    const now = firstCard();
    if (now === undefined) continue; // market not fully rendered yet
    await wait(250);
    if (firstCard() === now) return; // stable across two consecutive polls
  }
  throw new Error('Timed out waiting for market rendering to settle');
}

/** Simulate a plain click (mousedown + mouseup, no movement) at a world point. */
async function clickAt(worldX: number, worldY: number): Promise<void> {
  dispatchMouse('mousedown', worldX, worldY);
  await wait(30);
  dispatchMouse('mouseup', worldX, worldY);
}

describe('MainStreet click-to-place via real pointer events (browser)', () => {
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
    localStorage.removeItem(TUTORIAL_STATE_STORAGE_KEY);
    localStorage.removeItem(PREMIUM_DIALOG_DISMISSED_KEY);
  });

  it('clicking an empty street slot places the held business via real pointer events', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    await waitForSettled(scene);

    // Plenty of coins so affordability is not a factor.
    scene.state.resourceBank.coins = 2000;

    // Same-day composite buy-and-play now incurs the +50% premium with a
    // one-time explainer dialog (CG-0MT24X0SX007RLHN). Dismiss it here so
    // the regression test focuses on the pointer-pipeline fix; the dialog
    // flow itself is covered by dedicated dialog tests.
    try { localStorage.setItem(PREMIUM_DIALOG_DISMISSED_KEY, 'true'); } catch { /* ignore */ }

    // Buy a business to hand → card rests in hand unselected (CG-0MSXIQIPJ000NDTL);
    // selecting it enters placing-from-hand, making the empty slot rectangles
    // interactive (the state under test).
    const targetSlot = getEmptySlots(scene.state)[0];
    expect(targetSlot).toBeGreaterThanOrEqual(0);
    const business = scene.state.market.cards.find((c: any) =>
      c && canPurchaseBusiness(scene.state, c.id, targetSlot).legal,
    );
    expect(business).toBeTruthy();

    scene.onBusinessCardClick(business);

    // Post-CG-0MSXIQIPJ000NDTL: buying to hand no longer auto-selects;
    // the player must click the hand card first.
    await waitForCondition(
      () => scene.state.hand?.some((c: any) => c.id === business.id),
      'business moved to hand (not auto-selected)',
    );
    // Click the hand card to select it and enter placing-from-hand phase.
    scene.onHandBusinessCardClick(0);
    await waitForCondition(
      () => scene.uiPhase === 'placing-from-hand' && scene.pendingHandIndex === 0,
      'hand card selected (placing-from-hand phase)',
    );

    // ── The regression guard: a REAL pointer click on the empty slot. ──
    // Dispatches native mousedown/mouseup through the canvas so Phaser's
    // input pipeline (topOnly hit-test) decides which object receives the
    // event — the same path that was broken before the fix.
    // Wait a beat for the renderer to flush the newly interactive slot
    // rectangles into the camera render list; Phaser's hit test skips objects
    // that haven't rendered yet (willRender), and under CI contention the
    // click can otherwise land in the same frame as the street-grid rebuild.
    await wait(120);
    const slotCenter = scene.getStreetSlotCenter(targetSlot);
    expect(scene.state.streetGrid[targetSlot]).toBeNull();
    await clickAt(slotCenter.x, slotCenter.y);

    await waitForCondition(
      () => scene.state.streetGrid[targetSlot]?.id === business.id,
      'business placed on the clicked street slot',
    );
    expect(scene.state.streetGrid[targetSlot]?.id).toBe(business.id);
    // Back in the market phase for further play (placement completed).
    expect(scene.uiPhase).toBe('market');
  });

});
