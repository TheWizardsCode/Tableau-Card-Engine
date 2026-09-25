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
import { waitForScene } from '@core-tests/helpers/waitForScene';
import { TUTORIAL_STATE_STORAGE_KEY } from '../../example-games/main-street/TutorialState';
import { canPurchaseBusiness, getEmptySlots } from '../../example-games/main-street/MainStreetMarket';
import { PREMIUM_DIALOG_DISMISSED_KEY } from '../../example-games/main-street/MainStreetPrefs';
import { streetViewportRect, visibleLocalRect } from '../../example-games/main-street/MainStreetMapView';
import { ROAD_COLOUR } from '../../example-games/main-street/scenes/MainStreetConstants';

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

/**
 * Count road-surface and road-marking pixels inside the street viewport band.
 *
 * Roads must be grey rectangles with a dashed white centre line, so a real
 * rendered frame should contain both colours inside the band.
 */

/**
 * True when any pixel in a small neighbourhood around a screen point matches a
 * colour (the road markings are 2px wide, so exact-pixel sampling is brittle).
 */
function hasNearColour(screenX: number, screenY: number, hex: number, tol = 14): boolean {
  const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const dpr = canvas.width / GAME_W;
  const px = Math.round(screenX * dpr);
  const py = Math.round(screenY * dpr);
  const size = 3 * Math.max(1, Math.round(dpr));
  const data = ctx.getImageData(px, py, size, size).data;
  const tr = (hex >> 16) & 0xff;
  const tg = (hex >> 8) & 0xff;
  const tb = hex & 0xff;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    if (Math.abs(data[i] - tr) <= tol && Math.abs(data[i + 1] - tg) <= tol && Math.abs(data[i + 2] - tb) <= tol) {
      return true;
    }
  }
  return false;
}

/** Brightest channel value found along a local-space segment, via screen space. */
function brightestChannel(
  x1: number, y1: number, x2: number, y2: number,
  toScreen: (x: number, y: number) => { x: number; y: number },
): number {
  const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const dpr = canvas.width / GAME_W;
  let best = 0;
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const lx = x1 + ((x2 - x1) * i) / steps;
    const ly = y1 + ((y2 - y1) * i) / steps;
    const s = toScreen(lx, ly);
    const d = ctx.getImageData(Math.max(0, Math.round(s.x * dpr) - 1), Math.max(0, Math.round(s.y * dpr) - 1), 3, 3).data;
    for (let k = 0; k < d.length; k += 4) {
      if (d[k + 3] < 200) continue;
      best = Math.max(best, d[k], d[k + 1], d[k + 2]);
    }
  }
  return best;
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

    // A whole ring of neighbours is now framed. Streets are physically larger
    // in the city-block model (each owns its ten plots plus a road band around
    // it), so fewer plots fit at 2× than in the old seam-sharing layout — the
    // meaningful assertion is that more than one street cell is revealed.
    const framedAt2x = visibleStreetSlotRects(scene).length;
    expect(framedAt2x).toBeGreaterThan(framedAt1x);
    expect(framedAt2x).toBeGreaterThanOrEqual(20);
    const framedCells = new Set(
      (scene.getVisibleStreetNodes() as Array<{ cellX: number; cellY: number }>)
        .map((n) => `${n.cellX},${n.cellY}`),
    );
    expect(framedCells.size).toBeGreaterThan(1);

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

  it('reveals new street cells when zooming out from the default 1×1 board (CG-0MT5Y1X5T001M4S6)', async () => {
    // Regression guard for the manual-audit rejection: "the zoom camera works
    // but when zooming out no new cells are displayed".  The view lattice must
    // auto-grow with the zoom level so zooming out actually reveals
    // neighbouring streets — with NO manual setStreetViewLattice() call.
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    if (scene.settingsPanel) scene.settingsPanel._reducedMotion = true;

    // The shipping default is the legacy 1×1 board.
    expect(scene.getStreetViewLattice()).toEqual({ cols: 1, rows: 1 });
    const nodesAt1x = scene.getVisibleStreetNodes().length;
    expect(nodesAt1x).toBe(10);
    const framedAt1x = visibleStreetSlotRects(scene).length;
    expect(framedAt1x).toBe(10);

    // Zoom out one level: the lattice grows to 3×3 and new street cells are
    // rendered (strictly more than the legacy 10 slots).
    scene.zoomStreetOut();
    await wait(150);
    expect(scene.getStreetCameraForTest().camera.zoomLevel).toBe(2);
    expect(scene.getStreetViewLattice()).toEqual({ cols: 3, rows: 3 });

    const nodesAt2x = scene.getVisibleStreetNodes().length;
    expect(nodesAt2x).toBeGreaterThan(nodesAt1x);
    // …and the newly revealed cells are actually framed on screen (not just
    // instantiated off-viewport).
    expect(visibleStreetSlotRects(scene).length).toBeGreaterThan(framedAt1x);

    // And zooming out again reveals a still larger lattice.
    scene.zoomStreetOut();
    await wait(150);
    expect(scene.getStreetViewLattice()).toEqual({ cols: 5, rows: 5 });
    expect(scene.getVisibleStreetNodes().length).toBeGreaterThan(nodesAt2x);

    // Zooming back in keeps the revealed streets (the lattice only grows;
    // the camera rect culls what is off-screen).
    scene.zoomStreetIn();
    scene.zoomStreetIn();
    await wait(150);
    expect(scene.getStreetCameraForTest().camera.zoomLevel).toBe(1);
    expect(scene.getVisibleStreetNodes().length).toBe(10);
  });

  it('grows the view lattice when a zoomed-out camera state is restored (save/load)', async () => {
    // A checkpoint saved while zoomed out must rehydrate with its
    // neighbouring streets visible, not just a scaled-down 1×1 board
    // (CG-0MT5Y1X5T001M4S6).
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    if (scene.settingsPanel) scene.settingsPanel._reducedMotion = true;

    expect(scene.getStreetViewLattice()).toEqual({ cols: 1, rows: 1 });
    expect(scene.getVisibleStreetNodes().length).toBe(10);

    // Restoring a saved camera at zoom level 3 grows the lattice to 5×5 and
    // renders the neighbouring streets.
    scene.setStreetCameraState({ zoomLevel: 3, focusX: 0, focusY: 0 });
    await wait(150);
    expect(scene.getStreetCameraForTest().camera.zoomLevel).toBe(3);
    expect(scene.getStreetViewLattice()).toEqual({ cols: 5, rows: 5 });
    expect(scene.getVisibleStreetNodes().length).toBeGreaterThan(10);
  });

  it('draws the city-block road layer and grows it with the lattice (CG-0MT5Y1X5T001M4S6)', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    if (scene.settingsPanel) scene.settingsPanel._reducedMotion = true;

    const roadLayer = () => (scene.streetContainer as Phaser.GameObjects.Container).list.find(
      (obj) => obj.name === 'ms-street-roads',
    );

    // 1×1 lattice: a road ring around the single street (2 vertical + 2 horizontal).
    expect(roadLayer()).toBeTruthy();
    expect(scene.getStreetRoadBands()).toHaveLength(4);
    expect(scene.getStreetRoadBands().every((b: any) => b.w > 0 && b.h > 0)).toBe(true);

    // Zooming out grows the lattice, and the road layer follows it.
    scene.zoomStreetOut();
    await wait(150);
    expect(scene.getStreetViewLattice()).toEqual({ cols: 3, rows: 3 });
    // cols + 1 vertical bands + rows + 1 horizontal bands.
    expect(scene.getStreetRoadBands()).toHaveLength(3 + 1 + 3 + 1);
    expect(roadLayer()).toBeTruthy();
  });

  it('renders the whole road ring at the default zoom, with a dashed white centre line', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    if (scene.settingsPanel) scene.settingsPanel._reducedMotion = true;

    // Sample the real canvas for road surfaces and centre-line markings.
    const sampleRoads = () => {
      const camera = scene.getStreetCameraState();
      const { scale, containerX, containerY } = scene.getStreetCameraForTest();
      const visible = visibleLocalRect(camera, scene.layout);
      const toScreen = (x: number, y: number) => ({ x: containerX + x * scale, y: containerY + y * scale });
      const bands = scene.getStreetRoadBands() as Array<{ orientation: string; x: number; y: number; w: number; h: number }>;
      let surface = 0;
      let brightest = 0;
      for (const band of bands) {
        const x0 = Math.max(band.x, visible.left);
        const x1 = Math.min(band.x + band.w, visible.right);
        const y0 = Math.max(band.y, visible.top);
        const y1 = Math.min(band.y + band.h, visible.bottom);
        if (x1 - x0 < 8 || y1 - y0 < 8) continue; // band not (or barely) on screen
        if (band.orientation === 'vertical') {
          const midY = (y0 + y1) / 2;
          const s = toScreen(band.x + band.w * 0.25, midY);
          if (hasNearColour(s.x, s.y, ROAD_COLOUR)) surface++;
          brightest = Math.max(brightest, brightestChannel(band.x + band.w / 2, midY - 30, band.x + band.w / 2, midY + 30, toScreen));
        } else {
          const midX = (x0 + x1) / 2;
          const s = toScreen(midX, band.y + band.h * 0.25);
          if (hasNearColour(s.x, s.y, ROAD_COLOUR)) surface++;
          brightest = Math.max(brightest, brightestChannel(midX - 30, band.y + band.h / 2, midX + 30, band.y + band.h / 2, toScreen));
        }
      }
      return { surface, brightest, bands: bands.length };
    };

    // At the DEFAULT zoom the whole road ring is on screen: all four bands
    // (left/right/top/bottom) are inside the clipped street band, each showing a
    // grey surface and a bright dashed centre line (CG-0MT5Y1X5T001M4S6).
    await wait(250);
    const at1x = sampleRoads();
    expect(at1x.bands).toBe(4);
    expect(at1x.surface).toBe(4);
    expect(at1x.brightest).toBeGreaterThan(150);

    // Zooming out reveals more roads, which are still drawn correctly.
    scene.setStreetZoomLevel(2, false);
    await wait(250);
    const at2x = sampleRoads();
    expect(at2x.bands).toBeGreaterThan(at1x.bands);
    expect(at2x.surface).toBeGreaterThanOrEqual(at1x.surface);
    expect(at2x.brightest).toBeGreaterThan(150);
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

  it('syncs the camera into serialised state and restores it on load', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);

    // Default state camera matches the default scene camera.
    expect(scene.state.streetCamera).toEqual({ zoomLevel: 1, focusX: 0, focusY: 0 });

    // Zoom out and pan, then capture the live camera into state (what the
    // checkpoint save does). The scene clamps the pan to the map bounds, so
    // the assertion is against the live scene camera, not the requested value.
    scene.zoomStreetOut();
    scene.panStreetBy(60, 40);
    const live = scene.getStreetCameraState();
    scene.syncStreetCameraToState();
    expect(scene.state.streetCamera).toEqual(live);
    expect(scene.state.streetCamera.zoomLevel).toBeGreaterThan(1);

    // Mutate the live camera away, then restore from the saved state (what a
    // checkpoint resume does): the scene camera returns to the saved values.
    scene.setStreetCameraState({ zoomLevel: 1, focusX: 0, focusY: 0 });
    expect(scene.getStreetCameraState().zoomLevel).toBe(1);

    scene.syncStreetCameraFromState();
    const restored = scene.getStreetCameraState();
    expect(restored.zoomLevel).toBe(live.zoomLevel);
    expect(restored.focusX).toBe(live.focusX);
    expect(restored.focusY).toBe(live.focusY);
  });
});
