/**
 * Main Street street-map camera browser tests (CG-0MTH9OVMC001V44E).
 *
 * Boots the real MainStreetScene and exercises the map-like camera through
 * Phaser's real input pipeline:
 *
 *  - AC2: at zoom level 1 the street shows exactly the legacy 10-slot framing
 *         (identity container transform, legacy slot positions); at zoom level
 *         2 a ring of neighbouring streets becomes visible inside the street
 *         band, and the HUD chrome does not move.
 *  - AC1: the zoom/pan controls are always available — clicking the on-screen
 *         `−` control zooms out at any time, with no milestone/turn gating.
 *  - AC3: pointer hit-testing maps through the camera transform — after
 *         zooming out, a real canvas click at a slot's *transformed* screen
 *         position places the held card on that slot.
 *  - AC4: reduced motion applies the zoom instantly (no tween).
 *
 * @module tests/main-street/camera-zoom.browser
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import { TUTORIAL_STATE_STORAGE_KEY } from '../../example-games/main-street/TutorialState';
import { canPurchaseBusiness, getEmptySlots } from '../../example-games/main-street/MainStreetMarket';
import { PREMIUM_DIALOG_DISMISSED_KEY } from '../../example-games/main-street/MainStreetPrefs';
import { streetViewportRect } from '../../example-games/main-street/MainStreetMapView';

const GAME_W = 1280;
const GAME_H = 720;

type Scene = Phaser.Scene & Record<string, any>;

async function clearPersistentStorage(): Promise<void> {
  try { localStorage.clear(); } catch { /* ignore */ }
  try {
    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      const names = (await Promise.race([
        indexedDB.databases(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('databases timeout')), 2000)),
      ])).map((d: IDBDatabaseInfo) => d.name).filter((n): n is string => Boolean(n));
      await Promise.race([
        Promise.all(names.map((n) => new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(n);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        }))),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
  } catch { /* ignore */ }
}

async function bootGame(): Promise<Phaser.Game> {
  await clearPersistentStorage();
  localStorage.setItem(
    TUTORIAL_STATE_STORAGE_KEY,
    JSON.stringify({ schemaVersion: 1, status: 'skipped', completedAt: null, lastStepId: null }),
  );
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
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

function dispatchMouse(type: string, worldX: number, worldY: number): void {
  const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement;
  expect(canvas).toBeTruthy();
  const rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(new MouseEvent(type, {
    clientX: rect.x + (worldX / GAME_W) * rect.width,
    clientY: rect.y + (worldY / GAME_H) * rect.height,
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0,
  }));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(predicate: () => boolean, label: string, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await wait(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function getScene(game: Phaser.Game): Scene {
  return game.scene.getScene('MainStreetScene') as Scene;
}

async function waitForMarketReady(scene: Scene): Promise<void> {
  await waitForCondition(() => scene.state?.market?.cards?.length > 0, 'market row populated');
}

/** All street-slot rectangles currently instantiated in the street layer. */
function streetSlotRects(scene: Scene): Phaser.GameObjects.Rectangle[] {
  const container = scene.streetContainer as Phaser.GameObjects.Container;
  return container.list.filter(
    (obj): obj is Phaser.GameObjects.Rectangle =>
      obj instanceof Phaser.GameObjects.Rectangle &&
      obj.width === scene.layout.slotW &&
      obj.height === scene.layout.slotH,
  );
}

/**
 * Street-slot rectangles whose *screen* rectangle intersects the street
 * viewport band. This is the framed view: anything outside the band is clipped
 * by the map mask and therefore not revealed to the player. The screen rect
 * applies the street layer's camera transform (container scale + position).
 */
function visibleStreetSlotRects(scene: Scene): Phaser.GameObjects.Rectangle[] {
  const layout = scene.layout;
  const viewport = streetViewportRect(layout);
  const { scale, containerX, containerY } = scene.getStreetCameraForTest();
  return streetSlotRects(scene).filter((rect) => {
    const cx = containerX + rect.x * scale;
    const cy = containerY + rect.y * scale;
    const halfW = (rect.width * scale) / 2;
    const halfH = (rect.height * scale) / 2;
    return (
      cx + halfW > viewport.x && cx - halfW < viewport.x + viewport.w &&
      cy + halfH > viewport.y && cy - halfH < viewport.y + viewport.h
    );
  });
}

/** Centre of a zoom control in canvas coordinates. */
function zoomControlCenter(scene: Scene, name: string): { x: number; y: number } {
  const control = (scene.hudContainer as Phaser.GameObjects.Container).list.find(
    (obj) => (obj as Phaser.GameObjects.Container).name === name,
  ) as Phaser.GameObjects.Container | undefined;
  if (!control) throw new Error(`zoom control ${name} not found`);
  return { x: control.x, y: control.y };
}

describe('Main Street street-map camera (browser)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
    localStorage.removeItem(TUTORIAL_STATE_STORAGE_KEY);
    localStorage.removeItem(PREMIUM_DIALOG_DISMISSED_KEY);
  });

  it('frames the legacy 10-slot street at zoom level 1', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);

    const snapshot = scene.getStreetCameraForTest();
    expect(snapshot.camera.zoomLevel).toBe(1);
    expect(snapshot.lattice).toEqual({ cols: 1, rows: 1 });
    // Identity transform: the legacy framing is pixel-identical.
    expect(snapshot.scale).toBe(1);
    expect(snapshot.containerX).toBe(0);
    expect(snapshot.containerY).toBe(0);

    // Exactly the 10 legacy slots are framed, at their legacy centres.
    const rects = visibleStreetSlotRects(scene);
    expect(rects).toHaveLength(10);

    const layout = scene.layout;
    const expected = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const col = i % layout.streetCols;
      const row = Math.floor(i / layout.streetCols);
      expected.add(
        `${layout.streetX + col * (layout.slotW + layout.slotGap) + layout.slotW / 2},` +
        `${layout.streetTop + row * (layout.slotH + layout.streetRowGap) + layout.slotH / 2}`,
      );
    }
    const actual = new Set(rects.map((r) => `${r.x},${r.y}`));
    expect(actual).toEqual(expected);
  });

  it('is always available: the − control zooms out and the + control zooms back in', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    await wait(150);

    // The controls exist in the fixed HUD layer.
    expect((scene.hudContainer as Phaser.GameObjects.Container).list.some(
      (obj) => (obj as Phaser.GameObjects.Container).name === 'ms-zoom-out',
    )).toBe(true);

    const zoomOut = zoomControlCenter(scene, 'ms-zoom-out');
    dispatchMouse('mousedown', zoomOut.x, zoomOut.y);
    await wait(30);
    dispatchMouse('mouseup', zoomOut.x, zoomOut.y);

    await waitForCondition(
      () => Math.abs(scene.getStreetCameraForTest().scale - 0.5) < 0.001,
      'zoom-out control applied the map zoom',
    );
    expect(scene.getStreetCameraForTest().camera.zoomLevel).toBe(2);
    expect(scene.getStreetCameraForTest().scale).toBeCloseTo(0.5, 3);

    const zoomIn = zoomControlCenter(scene, 'ms-zoom-in');
    dispatchMouse('mousedown', zoomIn.x, zoomIn.y);
    await wait(30);
    dispatchMouse('mouseup', zoomIn.x, zoomIn.y);

    await waitForCondition(
      () => scene.getStreetCameraForTest().scale === 1,
      'zoom-in control restored the 1× framing',
    );
  });

  it('applies zoom instantly under reduced motion', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    if (scene.settingsPanel) scene.settingsPanel._reducedMotion = true;

    scene.zoomStreetOut();
    // No tween: the container is already at the new scale on the same tick.
    expect(scene.getStreetCameraForTest().scale).toBeCloseTo(0.5, 3);
    expect(scene.getStreetCameraForTest().camera.zoomLevel).toBe(2);
  });

  it('reveals a ring of neighbouring streets at zoom level 2 without moving the HUD', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    if (scene.settingsPanel) scene.settingsPanel._reducedMotion = true;

    const hudCoinPos = (() => {
      const text = (scene.hudContainer as Phaser.GameObjects.Container).list.find(
        (obj) => obj instanceof Phaser.GameObjects.Text && (obj as Phaser.GameObjects.Text).text.startsWith('Coins:'),
      ) as Phaser.GameObjects.Text | undefined;
      return text ? { x: text.x, y: text.y } : null;
    })();

    // A 3×3 street lattice: the playable board is the centre cell.
    scene.setStreetViewLattice(3, 3);
    await wait(150);
    expect(scene.getStreetViewLattice()).toEqual({ cols: 3, rows: 3 });

    // At 1× only the playable street is framed (neighbours are clipped).
    const framedAt1x = visibleStreetSlotRects(scene).length;
    expect(framedAt1x).toBe(10);

    scene.zoomStreetOut();
    await wait(150);

    const snapshot = scene.getStreetCameraForTest();
    expect(snapshot.camera.zoomLevel).toBe(2);
    expect(snapshot.scale).toBeCloseTo(0.5, 3);

    // A whole ring of neighbours is now framed (8 cells × up to 10 plots,
    // minus the shared seam plots rendered once).
    const framedAt2x = visibleStreetSlotRects(scene).length;
    expect(framedAt2x).toBeGreaterThan(framedAt1x);
    expect(framedAt2x).toBeGreaterThanOrEqual(40);

    // Only the street layer transforms — the HUD chrome stays put.
    if (hudCoinPos) {
      const text = (scene.hudContainer as Phaser.GameObjects.Container).list.find(
        (obj) => obj instanceof Phaser.GameObjects.Text && (obj as Phaser.GameObjects.Text).text.startsWith('Coins:'),
      ) as Phaser.GameObjects.Text | undefined;
      expect(text?.x).toBe(hudCoinPos.x);
      expect(text?.y).toBe(hudCoinPos.y);
    }

    // Back to the default 1× framing on reset.
    scene.setStreetZoomLevel(1, false);
    expect(visibleStreetSlotRects(scene).length).toBe(10);
  });

  it('maps pointer hit-testing through the camera transform (place after zooming out)', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    // Faster + deterministic: no zoom tween while the pointer flow runs.
    if (scene.settingsPanel) scene.settingsPanel._reducedMotion = true;
    try { localStorage.setItem(PREMIUM_DIALOG_DISMISSED_KEY, 'true'); } catch { /* ignore */ }

    scene.state.resourceBank.coins = 2000;

    const targetSlot = getEmptySlots(scene.state)[0];
    expect(targetSlot).toBeGreaterThanOrEqual(0);
    const business = scene.state.market.cards.find((c: any) =>
      c && canPurchaseBusiness(scene.state, c.id, targetSlot).legal,
    );
    expect(business).toBeTruthy();

    scene.onBusinessCardClick(business);
    await waitForCondition(
      () => scene.state.hand?.some((c: any) => c.id === business.id),
      'business moved to hand',
    );
    scene.onHandBusinessCardClick(0);
    await waitForCondition(
      () => scene.uiPhase === 'placing-from-hand' && scene.pendingHandIndex === 0,
      'hand card selected',
    );

    // Zoom the map out: the slot's screen position now differs from its
    // layout position, so the click only lands if input follows the camera.
    scene.zoomStreetOut();
    await wait(120);
    expect(scene.getStreetCameraForTest().scale).toBeCloseTo(0.5, 3);

    const slotCenter = scene.getStreetSlotCenter(targetSlot);
    const layout = scene.layout;
    const legacyCenter = {
      x: layout.streetX + (targetSlot % layout.streetCols) * (layout.slotW + layout.slotGap) + layout.slotW / 2,
      y: layout.streetTop + Math.floor(targetSlot / layout.streetCols) * (layout.slotH + layout.streetRowGap) + layout.slotH / 2,
    };
    // The camera transform actually moved the slot on screen.
    expect(Math.abs(slotCenter.x - legacyCenter.x)).toBeGreaterThan(1);

    dispatchMouse('mousedown', slotCenter.x, slotCenter.y);
    await wait(30);
    dispatchMouse('mouseup', slotCenter.x, slotCenter.y);

    await waitForCondition(
      () => scene.state.streetGrid[targetSlot]?.id === business.id,
      'business placed on the slot clicked through the camera transform',
    );
    expect(scene.state.streetGrid[targetSlot]?.id).toBe(business.id);
  });
});
