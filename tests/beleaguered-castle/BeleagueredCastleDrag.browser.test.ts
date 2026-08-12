/**
 * Beleaguered Castle drag-and-drop browser tests.
 *
 * Boots the real BeleagueredCastleScene (reduced-motion test mode with a
 * fixed seed) and drives native DOM mouse events on the canvas to verify
 * the drag-to-move behaviour after the refactor onto the reusable
 * core-engine drag-drop module (src/ui/dragDrop.ts, CG-0MSKSLDXQ008F5Y3):
 *  - dragging a tableau top card to a legal foundation executes the move
 *    (single undoable step);
 *  - dragging a tableau top card to a legal tableau column executes the
 *    move;
 *  - an illegal drop (wrong foundation / own column) snap-backs the card
 *    to its origin and does NOT change the game state;
 *  - a release outside any drop zone snap-backs the card to its origin;
 *  - reduced-motion mode restores the origin synchronously (no tween);
 *  - interaction-blocked (auto-complete in flight) vetoes pickup so the
 *    card never leaves its origin;
 *  - a click without drag still triggers the existing click-to-select flow
 *    (click-vs-drag coexistence).
 *
 * @module tests/beleaguered-castle/BeleagueredCastleDrag.browser
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import {
  getLegalMoves,
  isLegalFoundationMove,
} from '../../example-games/beleaguered-castle/BeleagueredCastleRules';
import type { BeleagueredCastleState } from '../../example-games/beleaguered-castle/BeleagueredCastleState';

const GAME_W = 1280;
const GAME_H = 720;
/** Fixed seed: deterministic deal with known legal moves (see below). */
const TEST_SEED = 42;

/**
 * Clear persistent storage (localStorage + IndexedDB) so a checkpoint saved
 * by another test (or a previous run) cannot surface the resume overlay
 * during the drag tests.
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
  // Reduced-motion test mode: instant deal, no checkpoint resume overlay.
  (window as any).__BC_TEST_REDUCED_MOTION__ = true;
  // Fixed seed so the dealt tableau is deterministic across runs.
  history.replaceState(null, '', `?seed=${TEST_SEED}`);

  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createBeleagueredCastleGame } = await import(
    '../../example-games/beleaguered-castle/createBeleagueredCastleGame'
  );
  const game = createBeleagueredCastleGame({
    type: Phaser.CANVAS,
    parent: 'game-container',
    width: GAME_W,
    height: GAME_H,
  });
  await waitForScene(game, 'BeleagueredCastleScene');
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
  return game.scene.getScene('BeleagueredCastleScene') as Scene;
}

/** Wait until the (instant, reduced-motion) deal has completed. */
async function waitForDeal(scene: Scene): Promise<void> {
  await waitForCondition(
    () => scene.isDealComplete() && (scene.tableauSprites.every((col: any[]) => col.length > 0)),
    'reduced-motion deal to complete',
  );
}

/** Simulate a full drag gesture from (sx,sy) to (dx,dy). */
async function simulateDrag(sx: number, sy: number, dx: number, dy: number): Promise<void> {
  dispatchMouse('mousedown', sx, sy);
  await wait(30);
  // First move just past the drag distance threshold (5px) so dragstart fires.
  dispatchMouse('mousemove', sx + 6, sy);
  await wait(30);
  // Then move to the destination; the card tracks the pointer.
  dispatchMouse('mousemove', dx, dy);
  await wait(80);
  dispatchMouse('mouseup', dx, dy);
  await wait(300); // allow dragend / snap-back / illegal feedback processing
}

/** Top sprite (rendered card) of a tableau column. */
function topSprite(scene: Scene, colIndex: number): Phaser.GameObjects.Image {
  const sprites = scene.tableauSprites[colIndex] as Phaser.GameObjects.Image[];
  expect(sprites.length).toBeGreaterThan(0);
  return sprites[sprites.length - 1];
}

/** The tableau drop zone for a column (rendered via the renderer). */
function tableauZone(scene: Scene, colIndex: number): Phaser.GameObjects.Zone {
  const zone = (scene.bcRenderer as any).tableauDZs[colIndex] as Phaser.GameObjects.Zone;
  expect(zone).toBeTruthy();
  return zone;
}

describe('Beleaguered Castle drag-to-move (browser)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('drags a top card to a legal foundation and executes the move', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForDeal(scene);

    // Find a legal foundation move in the dealt state.
    const moves = getLegalMoves(scene.getGameState());
    const fMove = moves.find((m) => m.kind === 'tableau-to-foundation');
    expect(fMove).toBeTruthy();

    const src = topSprite(scene, fMove!.fromCol);
    const zone = scene.foundationDropZones[fMove!.toFoundation] as Phaser.GameObjects.Zone;
    const movedCard = scene.getGameState().tableau[fMove!.fromCol].peek();
    expect(movedCard).toBeTruthy();
    const moveCountBefore = scene.getGameState().moveCount;

    await simulateDrag(src.x, src.y, zone.x, zone.y);

    // The move executed: a single undoable step, card lands in the foundation.
    await waitForCondition(
      () => scene.getGameState().moveCount === moveCountBefore + 1,
      'move count to increment after foundation drag',
    );
    const foundationTop = scene.getGameState().foundations[fMove!.toFoundation].peek();
    expect(foundationTop).toBeTruthy();
    expect(foundationTop!.rank).toBe(movedCard!.rank);
    expect(foundationTop!.suit).toBe(movedCard!.suit);
    expect(scene.getUndoManager().canUndo()).toBe(true);
  });

  it('drags a top card onto a legal tableau column and executes the move', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForDeal(scene);

    const moves = getLegalMoves(scene.getGameState());
    const tMove = moves.find((m) => m.kind === 'tableau-to-tableau');
    expect(tMove).toBeTruthy();

    const src = topSprite(scene, tMove!.fromCol);
    const zone = tableauZone(scene, tMove!.toCol);
    const movedCard = scene.getGameState().tableau[tMove!.fromCol].peek();
    const moveCountBefore = scene.getGameState().moveCount;

    await simulateDrag(src.x, src.y, zone.x, zone.y);

    await waitForCondition(
      () => scene.getGameState().moveCount === moveCountBefore + 1,
      'move count to increment after tableau drag',
    );
    const destTop = scene.getGameState().tableau[tMove!.toCol].peek();
    expect(destTop).toBeTruthy();
    expect(destTop!.rank).toBe(movedCard!.rank);
    expect(destTop!.suit).toBe(movedCard!.suit);
    expect(scene.getUndoManager().canUndo()).toBe(true);
  });

  it('snap-backs the card to its origin on an illegal foundation drop', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForDeal(scene);

    // Pick a source column and a foundation where the move is illegal.
    const state: BeleagueredCastleState = scene.getGameState();
    let fromCol = -1;
    let illegalFoundation = -1;
    for (let c = 0; c < 8 && illegalFoundation === -1; c++) {
      if (state.tableau[c].isEmpty()) continue;
      for (let fi = 0; fi < 4; fi++) {
        if (!isLegalFoundationMove(state, c, fi).legal) {
          fromCol = c;
          illegalFoundation = fi;
          break;
        }
      }
    }
    expect(fromCol).toBeGreaterThanOrEqual(0);

    const src = topSprite(scene, fromCol);
    const originX = src.x;
    const originY = src.y;
    const zone = scene.foundationDropZones[illegalFoundation] as Phaser.GameObjects.Zone;
    const moveCountBefore = state.moveCount;

    await simulateDrag(src.x, src.y, zone.x, zone.y);

    // No move executed; the card snap-backed to its origin.
    expect(state.moveCount).toBe(moveCountBefore);
    expect(scene.getUndoManager().canUndo()).toBe(false);
    await waitForCondition(
      () => Math.abs(src.x - originX) < 2 && Math.abs(src.y - originY) < 2,
      'snap-back to origin after illegal drop',
    );
  });

  it('click without drag still selects a column (click-vs-drag coexistence)', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForDeal(scene);

    const colIndex = 0;
    const src = topSprite(scene, colIndex);

    // Plain click: mousedown + mouseup with no movement.
    dispatchMouse('mousedown', src.x, src.y);
    await wait(120);
    dispatchMouse('mouseup', src.x, src.y);

    // The click path (pointerdown) selects the column.
    await waitForCondition(
      () => (scene as any).selectedCol === colIndex,
      'column selection after click',
    );
  });

  it('snap-backs the card when released outside any drop zone (out-of-zone drop)', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForDeal(scene);

    const colIndex = 0;
    const src = topSprite(scene, colIndex);
    const originX = src.x;
    const originY = src.y;
    const moveCountBefore = scene.getGameState().moveCount;

    // Drop far outside every registered drop zone: top-left corner is well
    // above the tableau zones and left of the foundation zones.
    await simulateDrag(src.x, src.y, 10, 10);

    // No move executed; the card snap-backed to its origin.
    expect(scene.getGameState().moveCount).toBe(moveCountBefore);
    expect(scene.getUndoManager().canUndo()).toBe(false);
    await waitForCondition(
      () => Math.abs(src.x - originX) < 2 && Math.abs(src.y - originY) < 2,
      'snap-back to origin after out-of-zone drop',
    );
  });

  it('restores the card instantly in reduced-motion mode (synchronous snap-back)', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForDeal(scene);

    // bootGame() forces reduced motion via __BC_TEST_REDUCED_MOTION__; the
    // drag-drop manager was created with reducedMotion=true, so snap-back
    // must restore the origin synchronously instead of tweening.
    expect((scene as any).bcRenderer.reducedMotion).toBe(true);

    const colIndex = 0;
    const src = topSprite(scene, colIndex);
    const originX = src.x;
    const originY = src.y;
    const moveCountBefore = scene.getGameState().moveCount;

    // Drag to an illegal drop (wrong foundation), then release.
    const state: BeleagueredCastleState = scene.getGameState();
    let fromCol = -1;
    let illegalFoundation = -1;
    for (let c = 0; c < 8 && illegalFoundation === -1; c++) {
      if (state.tableau[c].isEmpty()) continue;
      for (let fi = 0; fi < 4; fi++) {
        if (!isLegalFoundationMove(state, c, fi).legal) {
          fromCol = c;
          illegalFoundation = fi;
          break;
        }
      }
    }
    expect(fromCol).toBeGreaterThanOrEqual(0);
    const zone = scene.foundationDropZones[illegalFoundation] as Phaser.GameObjects.Zone;

    dispatchMouse('mousedown', src.x, src.y);
    await wait(30);
    dispatchMouse('mousemove', src.x + 6, src.y);
    await wait(30);
    dispatchMouse('mousemove', zone.x, zone.y);
    await wait(80);
    dispatchMouse('mouseup', zone.x, zone.y);
    // Reduced-motion snap-back is synchronous (restoreOrigin, no tween).
    // Assert restoration completes well within SNAP_BACK_DURATION (200ms):
    // at ~60% of a 200ms Power2 tween the card would still be ~30px from
    // its origin, so a sub-150ms restore proves the no-tween path.
    await waitForCondition(
      () => Math.abs(src.x - originX) < 2 && Math.abs(src.y - originY) < 2,
      'instant (synchronous) snap-back in reduced motion',
      150,
    );

    expect(Math.abs(src.x - originX)).toBeLessThan(2);
    expect(Math.abs(src.y - originY)).toBeLessThan(2);
    expect(scene.getGameState().moveCount).toBe(moveCountBefore);
    expect(scene.getUndoManager().canUndo()).toBe(false);
  });

  it('vetoes pickup while interaction is blocked (auto-complete running)', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForDeal(scene);

    // Simulate an in-flight auto-complete: the turn controller raises the
    // flag and the scene disables the drag manager (syncDragEnabled).
    (scene as any).turnController.autoCompleting = true;
    (scene as any).syncDragEnabled();

    const colIndex = 0;
    const src = topSprite(scene, colIndex);
    const originX = src.x;
    const originY = src.y;
    const moveCountBefore = scene.getGameState().moveCount;

    // Full drag gesture to a foundation zone; the disabled manager must
    // veto the pickup so the card never leaves its origin.
    const moves = getLegalMoves(scene.getGameState());
    const fMove = moves.find((m) => m.kind === 'tableau-to-foundation');
    const destX = fMove ? (scene.foundationDropZones[fMove.toFoundation] as Phaser.GameObjects.Zone).x : src.x + 6;
    const destY = fMove ? (scene.foundationDropZones[fMove.toFoundation] as Phaser.GameObjects.Zone).y : src.y;
    await simulateDrag(src.x, src.y, destX, destY);

    // Pickup vetoed: card stays at origin, no move executes.
    expect(Math.abs(src.x - originX)).toBeLessThan(2);
    expect(Math.abs(src.y - originY)).toBeLessThan(2);
    expect(scene.getGameState().moveCount).toBe(moveCountBefore);
    expect(scene.getUndoManager().canUndo()).toBe(false);

    // Restore interaction state for teardown cleanliness.
    (scene as any).turnController.autoCompleting = false;
    (scene as any).syncDragEnabled();
  });
});
