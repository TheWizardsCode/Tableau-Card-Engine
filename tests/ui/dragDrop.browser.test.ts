/**
 * Browser tests for the reusable drag-drop lifecycle module
 * (src/ui/dragDrop.ts) through Phaser's real input pipeline.
 *
 * Boots a minimal Phaser scene that registers a draggable Container
 * (Main Street's market-card shape) plus drop zones via
 * `createDragDropManager`, then dispatches native DOM MouseEvents on the
 * canvas to drive the full dragstart → drag → drop/dragend lifecycle.
 *
 * Verifies:
 *  - a valid drop on a registered zone fires the caller's onDrop handler
 *    and does NOT snap back;
 *  - a pickup-vetoed drag (canPickUp returns false) keeps the card in
 *    place and fires the illegal feedback hook;
 *  - an invalid drop (canAccept returns false) snap-backs the card to its
 *    origin and fires illegal feedback.
 *
 * @module tests/ui/dragDrop.browser.test
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import { createDragDropManager } from '../../src/ui/dragDrop';

const SCENE_KEY = 'DragDropHarness';

/** Minimal scene that wires the drag-drop module. */
class DragDropHarnessScene extends Phaser.Scene {
  public results: Array<Record<string, unknown>> = [];
  public manager!: ReturnType<typeof createDragDropManager>;
  public card!: Phaser.GameObjects.Container;
  public zoneA!: Phaser.GameObjects.Zone;
  public zoneB!: Phaser.GameObjects.Zone;

  constructor() {
    super(SCENE_KEY);
  }

  create(): void {
    this.manager = createDragDropManager({
      scene: this,
      dragDistanceThreshold: 5,
      onDragStart: () => this.results.push({ type: 'dragstart' }),
      onDragEnd: () => this.results.push({ type: 'dragend' }),
      onIllegal: () => this.results.push({ type: 'illegal' }),
    });

    // Draggable card (Container like Main Street market cards).
    this.card = this.add.container(200, 300);
    const bg = this.add.rectangle(0, 0, 96, 130, 0x335577);
    this.card.add(bg);
    this.manager.registerDraggable({
      gameObject: this.card,
      data: { id: 'card-1' },
      hitArea: new Phaser.Geom.Rectangle(-48, -65, 96, 130),
      canPickUp: () => true,
      onDrop: (payload) => this.results.push({ type: 'drop', zoneData: payload.zoneData }),
    });

    // Drop zone A accepts, drop zone B rejects.
    this.zoneA = this.add.zone(600, 300, 120, 150).setRectangleDropZone(120, 150);
    this.zoneB = this.add.zone(600, 500, 120, 150).setRectangleDropZone(120, 150);
    this.manager.registerDropZone({ zone: this.zoneA, data: { slot: 0 }, canAccept: () => true });
    this.manager.registerDropZone({ zone: this.zoneB, data: { slot: 1 }, canAccept: () => false });
  }
}

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    width: 900,
    height: 700,
    parent: container,
    scene: [DragDropHarnessScene],
    audio: { noAudio: true },
  });
  await waitForScene(game, SCENE_KEY);
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

/** Get the harness scene and its module results. */
function getHarness(game: Phaser.Game): DragDropHarnessScene {
  const scene = game.scene.getScene(SCENE_KEY) as DragDropHarnessScene;
  expect(scene).toBeDefined();
  return scene;
}

/** Dispatch a native DOM MouseEvent at canvas coordinates. */
function dispatchMouse(type: string, x: number, y: number): void {
  const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement;
  expect(canvas).toBeTruthy();
  canvas.dispatchEvent(
    new MouseEvent(type, {
      clientX: x,
      clientY: y,
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

/** Simulate a full drag gesture from (sx,sy) to (dx,dy). */
async function simulateDrag(sx: number, sy: number, dx: number, dy: number): Promise<void> {
  dispatchMouse('mousedown', sx, sy);
  await wait(30);
  // First move just past the drag distance threshold (5px) so dragstart
  // fires with the grab offset measured from the card's origin.
  dispatchMouse('mousemove', sx + 6, sy);
  await wait(30);
  // Then move to the destination; the card tracks with a constant offset.
  dispatchMouse('mousemove', dx, dy);
  await wait(80); // let the final drag event process so the card reaches dx,dy
  dispatchMouse('mouseup', dx, dy);
  await wait(250); // allow snap-back tween / event processing
}

describe('dragDrop module browser interaction', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('drops a card on an accepting zone: fires onDrop, no snap-back', async () => {
    game = await bootGame();
    const scene = getHarness(game);

    const sx = scene.card.x;
    const sy = scene.card.y;
    await simulateDrag(sx, sy, scene.zoneA.x, scene.zoneA.y);

    const drops = scene.results.filter((r) => r.type === 'drop');
    expect(drops.length).toBe(1);
    expect(drops[0].zoneData).toEqual({ slot: 0 });

    // Card tracked the pointer towards the zone (no snap-back). Phaser
    // keeps the grab offset, so allow tolerance around the zone centre.
    expect(Math.abs(scene.card.x - scene.zoneA.x)).toBeLessThan(15);
    expect(Math.abs(scene.card.y - scene.zoneA.y)).toBeLessThan(15);
  });

  it('snap-backs to origin after a rejected drop and fires illegal feedback', async () => {
    game = await bootGame();
    const scene = getHarness(game);

    const sx = scene.card.x;
    const sy = scene.card.y;
    await simulateDrag(sx, sy, scene.zoneB.x, scene.zoneB.y);

    const drops = scene.results.filter((r) => r.type === 'drop');
    expect(drops.length).toBe(0);

    // Card returned to its origin (snap-back).
    expect(scene.card.x).toBeCloseTo(sx, 0);
    expect(scene.card.y).toBeCloseTo(sy, 0);
    // Illegal feedback fired via the module's onIllegal hook.
    expect(scene.results.some((r) => r.type === 'illegal')).toBe(true);
  });

  it('keeps the card in place on a pickup veto', async () => {
    game = await bootGame();
    const scene = getHarness(game);

    // Re-register the card with a vetoing canPickUp.
    scene.manager.unregisterDraggable(scene.card);
    scene.manager.registerDraggable({
      gameObject: scene.card,
      data: { id: 'card-1' },
      canPickUp: () => false,
      onDrop: () => scene.results.push({ type: 'drop' }),
    });

    const sx = scene.card.x;
    const sy = scene.card.y;
    await simulateDrag(sx, sy, scene.zoneA.x, scene.zoneA.y);

    const drops = scene.results.filter((r) => r.type === 'drop');
    expect(drops.length).toBe(0);
    // Card never left its origin.
    expect(scene.card.x).toBeCloseTo(sx, 0);
    expect(scene.card.y).toBeCloseTo(sy, 0);
    // Illegal feedback fired for the veto.
    expect(scene.results.some((r) => r.type === 'illegal')).toBe(true);
  });
});
