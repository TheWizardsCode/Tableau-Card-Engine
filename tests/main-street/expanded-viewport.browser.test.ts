/**
 * Expanded-viewport rendering & shared-corner interaction — browser smoke
 * (CG-0MTH9OW0H0005VKE).
 *
 * Boots the real MainStreetScene with a 2×2 playable lattice and verifies:
 *
 *  - AC1: the shared four-way intersection has exactly one interactive
 *         hit-zone — a real canvas click at its (camera-transformed) screen
 *         position places the held card on that ONE world slot.
 *  - AC2: a card on an adjacent *street* (across the seam) forms synergy with
 *         the shared-corner card, and the renderer draws the cross-street
 *         synergy line.
 *  - AC4: only slots inside the viewport are instantiated.
 *
 * @module tests/main-street/expanded-viewport.browser
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import { TUTORIAL_STATE_STORAGE_KEY } from '../../example-games/main-street/TutorialState';
import { canPurchaseBusiness } from '../../example-games/main-street/MainStreetMarket';
import { PREMIUM_DIALOG_DISMISSED_KEY } from '../../example-games/main-street/MainStreetPrefs';
import {
  computeSynergyPairs,
  updateNeighborsOnPlacement,
  worldSlotCount,
} from '../../example-games/main-street/MainStreetAdjacency';
import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';

const GAME_W = 1280;
const GAME_H = 720;

type Scene = Phaser.Scene & Record<string, any>;

let game: Phaser.Game | null = null;

async function clearPersistentStorage(): Promise<void> {
  try { localStorage.clear(); } catch { /* ignore */ }
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
  const g = createMainStreetGame({
    type: Phaser.CANVAS,
    parent: 'game-container',
    width: GAME_W,
    height: GAME_H,
  });
  await waitForScene(g, 'MainStreetScene');
  return g;
}

function destroyGame(g: Phaser.Game | null): void {
  if (g) g.destroy(true, false);
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

function getScene(g: Phaser.Game): Scene {
  return g.scene.getScene('MainStreetScene') as Scene;
}

async function waitForMarketReady(scene: Scene): Promise<void> {
  await waitForCondition(() => scene.state?.market?.cards?.length > 0, 'market row populated');
}

function businessFixture(id: string, baseIncome = 10, synergyTypes: string[] = ['Food']): BusinessCard {
  return {
    family: 'business',
    id,
    name: id,
    cost: 1,
    baseIncome,
    synergyTypes,
    synergyCoinBonus: 0.5,
    synergyRepBonus: 0,
    maxLevel: 1,
    description: '',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
  } as BusinessCard;
}

/** Graphics objects owned by the street layer (the synergy lines). */
function streetGraphics(scene: Scene): Phaser.GameObjects.GameObject[] {
  const container = scene.streetContainer as Phaser.GameObjects.Container;
  return container.list.filter((o) => o instanceof Phaser.GameObjects.Graphics);
}

afterEach(() => {
  destroyGame(game);
  game = null;
});

describe('expanded street viewport (browser)', () => {
  it('places a held card on the shared four-way corner through the camera transform (AC1/AC2)', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    if (scene.settingsPanel) scene.settingsPanel._reducedMotion = true;
    try { localStorage.setItem(PREMIUM_DIALOG_DISMISSED_KEY, 'true'); } catch { /* ignore */ }

    // Grow the playable board to 2×2 streets (27 world plots).
    scene.setStreetPlayableLattice(2, 2);
    await wait(80);
    expect(scene.getStreetPlayableLattice()).toEqual({ cols: 2, rows: 2 });
    expect(scene.state.streetGridCols).toBe(2);
    expect(scene.state.streetGridRows).toBe(2);
    expect(scene.state.streetGrid).toHaveLength(worldSlotCount(2, 2));

    // Zoom out so the corner and its neighbouring streets are framed.
    scene.setStreetZoomLevel(3, false);
    await wait(80);

    // The shared four-way intersection is world (4,1) → index 13.
    const CORNER = 13;
    scene.state.resourceBank.coins = 2000;
    const business = scene.state.market.cards.find((c: any) =>
      c && c.family === 'business' &&
      Array.isArray(c.synergyTypes) && c.synergyTypes.length > 0 &&
      (c.synergyCoinBonus ?? 0.5) !== 0 &&
      canPurchaseBusiness(scene.state, c.id, CORNER).legal,
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

    // Instrument the slot click so a miss reports *where* the pointer went.
    const clicks: number[] = [];
    const origOnSlotClick = scene.onSlotClick.bind(scene);
    scene.onSlotClick = (i: number) => { clicks.push(i); return origOnSlotClick(i); };

    // The selectable slot rects are (re)drawn by the refresh that follows the
    // selection; re-render explicitly so the click cannot race that refresh.
    scene.refreshStreetGrid();
    await wait(50);

    const centre = scene.getStreetSlotCenter(CORNER);
    expect(Number.isFinite(centre.x)).toBe(true);
    expect(Number.isFinite(centre.y)).toBe(true);

    dispatchMouse('mousedown', centre.x, centre.y);
    await wait(30);
    dispatchMouse('mouseup', centre.x, centre.y);

    await waitForCondition(
      () => scene.state.streetGrid[CORNER]?.id === business.id,
      `card placed on the shared corner (slot clicks: ${JSON.stringify(clicks)}, uiPhase: ${scene.uiPhase})`,
    );
    expect(scene.state.streetGrid[CORNER]?.id).toBe(business.id);

    // AC2: a synergistic card in a NEIGHBOURING STREET (world 3,0 → index 3, a
    // different street cell) forms synergy with the shared-corner card. The
    // neighbour shares the placed card's synergy type but has a different base
    // type, and the two plots are Chebyshev-1 adjacent across the seam.
    const placed = scene.state.streetGrid[CORNER]!;
    const before = placed.currentIncome ?? 0;
    expect(before).toBeGreaterThan(0);
    const shared = ((placed as any).synergyTypes ?? ['Food'])[0];
    const neighbour = businessFixture('biz-neighbour-street', 10, [shared]);
    scene.state.streetGrid[3] = neighbour;
    updateNeighborsOnPlacement(scene.state, 3);
    scene.refreshStreetGrid();
    await wait(80);

    const after = scene.state.streetGrid[CORNER]!.currentIncome ?? 0;
    expect(after).toBeGreaterThan(before);

    // The cross-street pair is discovered with the expanded grid dimensions…
    const pairs = computeSynergyPairs(
      scene.state.streetGrid,
      scene.state.soldSlots ?? [],
      { cols: 2, rows: 2 },
    );
    expect(pairs.some((p) =>
      (p.fromIndex === CORNER && p.toIndex === 3) || (p.fromIndex === 3 && p.toIndex === CORNER),
    )).toBe(true);

    // …and the renderer draws the synergy line(s) for it.
    expect(streetGraphics(scene).length).toBeGreaterThan(0);
  });

  it('culls plots outside the viewport (AC4)', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    if (scene.settingsPanel) scene.settingsPanel._reducedMotion = true;

    scene.setStreetPlayableLattice(2, 2);
    await wait(80);

    const total = worldSlotCount(2, 2);
    const visibleAt1x = scene.getVisibleStreetNodes().length;
    expect(visibleAt1x).toBeGreaterThan(0);
    expect(visibleAt1x).toBeLessThan(total);

    scene.setStreetZoomLevel(4, false);
    await wait(80);
    const visibleAt4x = scene.getVisibleStreetNodes().length;
    expect(visibleAt4x).toBeGreaterThan(visibleAt1x);
    expect(visibleAt4x).toBeLessThanOrEqual(total);
  });
});
