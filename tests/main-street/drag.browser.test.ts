/**
 * Main Street drag-to-buy/place browser tests.
 *
 * Boots the real MainStreetScene (tutorial offer pre-skipped) and drives
 * native DOM mouse events on the canvas to exercise the reusable
 * core-engine drag-drop module wiring:
 *  - dragging a business card from the Development row onto an empty street
 *    slot buys and places it in one undoable step (direct buy-to-slot);
 *  - attempting to drag a card the player cannot afford keeps it in the row
 *    with illegal feedback (pickup veto);
 *  - dropping on an occupied slot or outside the street grid snap-backs the
 *    card to the Development row (invalid drop);
 *  - a click without drag still triggers the existing click-to-buy flow
 *    (click-vs-drag coexistence).
 *
 * @module tests/main-street/drag.browser
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import { TUTORIAL_STATE_STORAGE_KEY } from '../../example-games/main-street/TutorialState';

const GAME_W = 1280;
const GAME_H = 720;

/**
 * Clear persistent storage (localStorage + IndexedDB) so a checkpoint saved
 * by another test (or a previous run) cannot surface the resume overlay
 * (depth-2000 full-screen blocker) during the drag tests.
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
  // Skip the first-launch tutorial offer modal for every test.
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

/** Dispatch a native DOM MouseEvent at canvas (world) coordinates. */
function dispatchMouse(type: string, worldX: number, worldY: number): void {
  const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement;
  expect(canvas).toBeTruthy();
  // The canvas may be CSS-scaled to fit the browser viewport; convert game
  // world coordinates to client coordinates via the canvas bounding rect.
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
 * Wait until market rendering has settled (no container rebuilds).
 *
 * Shortly after boot the SVG prewarm chain triggers a final refreshAll which
 * destroys and rebuilds the market-card containers. A rebuild mid-gesture
 * would invalidate the dragged container, so tests must interact only once
 * the card container objects are stable across consecutive polls.
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
    // Stable across two consecutive polls → no rebuild in between.
    await wait(250);
    if (firstCard() === now) return;
  }
  throw new Error('Timed out waiting for market rendering to settle');
}

/** First business card in the development row. */
function firstBusinessCard(scene: Scene): any {
  // Community-space cards are grid-placeable too; accept either family so
  // the test does not depend on the seeded row's exact composition.
  const card = scene.state.market.cards.find(
    (c: any) => c.family === 'business' || c.family === 'community-space',
  );
  expect(card).toBeTruthy();
  return card;
}

/** The rendered market-card container for a card id. */
function cardContainer(scene: Scene, cardId: string): Phaser.GameObjects.Container {
  const container = scene.marketContainer.getByName(`ms-market-card-${cardId}`);
  expect(container).toBeTruthy();
  return container;
}

/** Simulate a full drag gesture from (sx,sy) to (dx,dy). */
async function simulateDrag(sx: number, sy: number, dx: number, dy: number, settleMs = 300): Promise<void> {
  dispatchMouse('mousedown', sx, sy);
  await wait(30);
  // First move just past the drag distance threshold (5px) so dragstart fires.
  dispatchMouse('mousemove', sx + 6, sy);
  await wait(30);
  // Then move to the destination; the card tracks the pointer.
  dispatchMouse('mousemove', dx, dy);
  await wait(80);
  dispatchMouse('mouseup', dx, dy);
  await wait(settleMs); // allow dragend / snap-back / illegal feedback processing
}

describe('MainStreet drag-to-buy/place (browser)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
    // Reset tutorial state between tests so each run starts fresh.
    localStorage.removeItem(TUTORIAL_STATE_STORAGE_KEY);
  });

  it('drag onto an empty slot buys and places in one undoable step', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    await waitForSettled(scene);

    // Plenty of coins so affordability is not a factor.
    scene.state.resourceBank.coins = 100;
    const card = firstBusinessCard(scene);
    const slot = scene.state.streetGrid.findIndex((s: any) => s === null);
    expect(slot).toBeGreaterThanOrEqual(0);

    const container = cardContainer(scene, card.id);
    const target = scene.getStreetSlotCenter(slot);
    const originY = container.y; // market row Y (the card's slot origin)
    await simulateDrag(container.x, container.y, target.x, target.y, 40);

    // Transfer visual must start at the DROP LOCATION (the card follows the
    // pointer, so it was released at the street slot) — not at the market
    // row origin. The drop lands on the slot centre, so the transfer is
    // distance-proportional (clamped to 250ms — well under the fixed
    // 1500ms); we sample the visual right after release while the short
    // tween is still running, and a y near the slot end (far from the
    // market row) proves the animation did not jump back to the market row
    // (CG-0MST2LS3E004BTPO).
    const visuals = [...(scene.activeTransferVisuals ?? [])];
    expect(visuals.length).toBe(1);
    const spread = Math.abs(originY - target.y);
    expect(Math.abs(visuals[0].y - originY)).toBeGreaterThan(spread / 2);
    expect(Math.abs(visuals[0].y - target.y)).toBeLessThan(spread / 2);

    // Direct buy-to-slot: card leaves the market and lands on the slot.
    await waitForCondition(
      () => scene.state.market.cards.find((c: any) => c.id === card.id) === undefined,
      'card removed from market after drag-drop buy',
    );
    expect(scene.state.streetGrid[slot]?.id).toBe(card.id);
    // Drag-drop buy-and-place pays a +50% premium over the listed cost
    // (CG-0MSTOF1N5005PK2R): 100 − ceil(cost × 1.5 × 2)/2.
    const premiumCost = Math.ceil(card.cost * 1.5 * 2) / 2;
    expect(scene.state.resourceBank.coins).toBe(100 - premiumCost);
    // Single undoable command (direct buy-to-slot path).
    expect(scene.undoManager.canUndo()).toBe(true);
    // Back in the market phase for further play.
    expect(scene.uiPhase).toBe('market');
  });

  it('cannot-buy drag keeps the card in the row (pickup veto)', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    await waitForSettled(scene);

    const card = firstBusinessCard(scene);
    scene.state.resourceBank.coins = 0; // cannot afford anything
    const slot = scene.state.streetGrid.findIndex((s: any) => s === null);

    const container = cardContainer(scene, card.id);
    const target = scene.getStreetSlotCenter(slot);
    await simulateDrag(container.x, container.y, target.x, target.y);

    // Card never left the row; no buy happened.
    expect(scene.state.market.cards.find((c: any) => c.id === card.id)).toBeTruthy();
    expect(scene.state.streetGrid[slot]).toBeNull();
    expect(scene.state.resourceBank.coins).toBe(0);
    expect(scene.undoManager.canUndo()).toBe(false);
  });

  it('invalid drop outside the street grid snap-backs the card', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    await waitForSettled(scene);

    scene.state.resourceBank.coins = 100;
    const card = firstBusinessCard(scene);
    const container = cardContainer(scene, card.id);

    // Drop far away from the street grid (bottom-right corner).
    await simulateDrag(container.x, container.y, GAME_W - 30, GAME_H - 30);

    await wait(500); // allow snap-back tween
    expect(scene.state.market.cards.find((c: any) => c.id === card.id)).toBeTruthy();
    expect(scene.undoManager.canUndo()).toBe(false);
  });

  it('invalid drop on an occupied slot snap-backs the card', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    await waitForSettled(scene);

    scene.state.resourceBank.coins = 100;
    const card = firstBusinessCard(scene);

    // Occupy the first empty slot, then refresh so drop zones are re-registered.
    const slot = scene.state.streetGrid.findIndex((s: any) => s === null);
    scene.state.streetGrid[slot] = {
      family: 'business', id: 'occupied-biz', name: 'Occupied', cost: 1, baseIncome: 1,
      synergyTypes: ['Food'], maxLevel: 1, level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, description: '',
    };
    scene.refreshAll();

    // refreshAll rebuilt the market: re-fetch the card container.
    const container = cardContainer(scene, card.id);
    const target = scene.getStreetSlotCenter(slot);
    await simulateDrag(container.x, container.y, target.x, target.y);

    await wait(500); // allow snap-back tween
    expect(scene.state.market.cards.find((c: any) => c.id === card.id)).toBeTruthy();
    expect(scene.state.streetGrid[slot]?.id).toBe('occupied-biz');
    expect(scene.undoManager.canUndo()).toBe(false);
  });

  it('click without drag still triggers the click-to-buy flow (coexistence)', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    await waitForSettled(scene);

    scene.state.resourceBank.coins = 100;
    const card = firstBusinessCard(scene);
    const container = cardContainer(scene, card.id);

    // Plain click: mousedown + mouseup with no movement. A longer settle gap
    // keeps the two events in separate frames even under heavy CI contention.
    dispatchMouse('mousedown', container.x, container.y);
    await wait(120);
    dispatchMouse('mouseup', container.x, container.y);

    // Click flow buys TO HAND (hand grows), not directly to a slot.
    await waitForCondition(
      () => (scene.state.hand ?? []).some((h: any) => h.id === card.id),
      'card bought to hand via click',
      15_000,
    );
    expect(scene.state.market.cards.find((c: any) => c.id === card.id)).toBeUndefined();
    // Post-CG-0MSXIQIPJ000NDTL: the bought card is NOT auto-selected — the
    // scene returns to the market phase and the player selects the hand card
    // (onHandBusinessCardClick) before placing.
    expect(scene.uiPhase).toBe('market');
    expect(scene.pendingHandIndex).toBeNull();

    // Selecting the hand card still enters the placing-from-hand phase.
    scene.onHandBusinessCardClick(0);
    expect(scene.uiPhase).toBe('placing-from-hand');
    expect(scene.pendingHandIndex).toBe(0);
  });
});
