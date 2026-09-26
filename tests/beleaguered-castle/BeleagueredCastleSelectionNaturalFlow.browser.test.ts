/**
 * Beleaguered Castle natural-flow selection browser tests.
 *
 * These tests exercise the *real* user boot path — pick a variant, watch the
 * animated deal complete, then click — rather than the reduced-motion test
 * path (`__BC_TEST_REDUCED_MOTION__`) used by the drag suite. That timing is
 * where the post-deal first-click race lived: `makeDraggable()` registers the
 * tableau top cards while the input plugin still holds them in its pending
 * insertion queue, so a click arriving before the next input `preUpdate` was
 * silently dropped (CG-0MUHKD7S8007EEAC / CG-0MUHL7MY9000XFBL).
 *
 * The first click is dispatched *synchronously from within* the deal-complete
 * callback — immediately after `makeDraggable()` has run and before any input
 * frame can flush the queue — which deterministically reproduces the race
 * window (and therefore fails if the shared `DragDropManager.registerDraggable`
 * flush regresses).
 *
 * The game is booted with `Phaser.CANVAS` so the assertion also covers the
 * Canvas-visible selection overlay introduced in CG-0MUHL6T0I002AW5Y.
 *
 * @module tests/beleaguered-castle/BeleagueredCastleSelectionNaturalFlow.browser
 */

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '@core-tests/helpers/waitForScene';
import { CheckpointManager } from '@core-engine/CheckpointManager';
import {
  getLegalMoves,
} from '../../example-games/beleaguered-castle/BeleagueredCastleRules';
import type {
  BCMove,
} from '../../example-games/beleaguered-castle/BeleagueredCastleState';

const GAME_W = 1280;
const GAME_H = 720;

/** Seeds used to repeat the first-click sequence across distinct deals. */
const SEEDS = [1, 7, 42];

/** Clear persistent storage so no checkpoint/resume overlay can appear. */
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

/**
 * Boot the game through the natural (non-reduced-motion) path: cleared
 * storage, a fixed seed, and `Phaser.CANVAS`. The variant popup is still
 * shown (it is part of the natural flow) and must be dismissed by the caller.
 */
async function bootNaturalGame(seed: number): Promise<Phaser.Game> {
  await clearPersistentStorage();
  // Explicitly ensure reduced-motion test mode is off — a preceding test in
  // the same page context may have enabled it.
  delete (window as any).__BC_TEST_REDUCED_MOTION__;
  history.replaceState(null, '', `?seed=${seed}`);

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

/** Top sprite (rendered card) of a tableau column. */
function topSprite(scene: Scene, colIndex: number): Phaser.GameObjects.Image {
  const sprites = scene.tableauSprites[colIndex] as Phaser.GameObjects.Image[];
  expect(sprites.length).toBeGreaterThan(0);
  return sprites[sprites.length - 1];
}

/** The tableau drop zone for a column. */
function tableauZone(scene: Scene, colIndex: number): Phaser.GameObjects.Zone {
  const zone = (scene.bcRenderer as any).tableauDZs[colIndex] as Phaser.GameObjects.Zone;
  expect(zone).toBeTruthy();
  return zone;
}

/** Find a display-list text object by its label (scene + HUD container). */
function findText(scene: Scene, label: string): Phaser.GameObjects.Text | undefined {
  // Overlay content (incl. the variant popup buttons) is parented to the HUD
  // container by OverlayManager, so it is not in scene.children.list.
  const lists: any[][] = [scene.children.list as any[]];
  const hud = scene.hudContainer as Phaser.GameObjects.Container | undefined;
  if (hud?.list) lists.push(hud.list as any[]);
  const overlayObjects = (scene.overlayManager as any)?.objects as any[] | undefined;
  if (Array.isArray(overlayObjects)) lists.push(overlayObjects);
  for (const list of lists) {
    const found = list.find((o: any) => o.type === 'Text' && o.text === label);
    if (found) return found as Phaser.GameObjects.Text;
  }
  return undefined;
}

/**
 * Dismiss the variant popup by choosing Classic.
 *
 * The overlay button is invoked via `emit('pointerdown')` (the exact handler
 * the DOM click would run): the popup is setup for this test, while the
 * first-card click under test is always a real DOM event so it exercises the
 * Phaser input hit-test path.
 */
async function chooseClassicVariant(scene: Scene): Promise<void> {
  await waitForCondition(
    () => findText(scene, '[ Classic ]') !== undefined,
    'variant popup to appear',
  );
  findText(scene, '[ Classic ]')!.emit('pointerdown');
}

/**
 * Probe recorded by {@link installDealCompleteProbe} when the animated deal
 * completes (i.e. immediately after the renderer's `makeDraggable()` ran).
 */
interface DealCompleteProbe {
  /** True once the deal-complete handler has fired. */
  fired: boolean;
  /** The source column chosen for the immediate first click. */
  sourceCol: number;
  /** The legal move selected from that column. */
  move: BCMove | null;
  /** Whether the top card was already in the active hit-test list. */
  inList?: boolean;
  /** Whether the top card was still awaiting insertion. */
  inPending?: boolean;
}

/**
 * Wrap the renderer's `onDealComplete` so the test can act at the exact
 * moment `makeDraggable()` has registered the top cards. By default it also
 * dispatches the immediate first click synchronously (before the next input
 * frame), reproducing the post-deal race deterministically.
 */
function installDealCompleteProbe(
  scene: Scene,
  options: { clickSource?: boolean } = {},
): DealCompleteProbe {
  const probe: DealCompleteProbe = {
    fired: false,
    sourceCol: -1,
    move: null,
  };
  const renderer = (scene as any).bcRenderer;
  const original = renderer.onDealComplete;

  renderer.onDealComplete = () => {
    // Runs the scene handler: sets dealComplete + calls makeDraggable().
    original?.();
    probe.fired = true;

    const moves = getLegalMoves(scene.getGameState());
    // Prefer a foundation move (unambiguous destination); fall back to any.
    probe.move = moves.find((m) => m.kind === 'tableau-to-foundation') ?? moves[0] ?? null;
    probe.sourceCol = probe.move ? probe.move.fromCol : 0;

    const src = topSprite(scene, probe.sourceCol);
    const input = scene.input as any;
    probe.inList = Array.isArray(input._list) ? input._list.includes(src) : undefined;
    probe.inPending = Array.isArray(input._pendingInsertion)
      ? input._pendingInsertion.includes(src)
      : undefined;

    if (options.clickSource !== false) {
      // Immediately after makeDraggable(): the deterministic race window.
      dispatchMouse('mousedown', src.x, src.y);
      dispatchMouse('mouseup', src.x, src.y);
    }
  };

  return probe;
}

describe('Beleaguered Castle natural-flow selection (browser)', () => {
  let game: Phaser.Game | null = null;

  // Persistence is not under test here, and the checkpoint save is
  // fire-and-forget over IndexedDB: a previous test's connection can leave the
  // next boot's `checkAndResume` load hanging (so the variant popup never
  // appears). Stub the store so every natural boot follows the real
  // "no checkpoint" path — `checkAndResume` → variant popup — deterministically.
  beforeAll(() => {
    vi.spyOn(CheckpointManager.prototype as any, 'load').mockResolvedValue(null);
    vi.spyOn(CheckpointManager.prototype as any, 'save').mockResolvedValue(undefined);
  });

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('makes the tableau top card immediately hit-testable when the deal completes', async () => {
    game = await bootNaturalGame(SEEDS[0]);
    const scene = getScene(game);
    // No click: just observe the input plugin state at deal completion.
    const probe = installDealCompleteProbe(scene, { clickSource: false });

    await chooseClassicVariant(scene);
    await waitForCondition(() => probe.fired, 'natural deal to complete', 20_000);

    // The shared drag-drop module must promote the newly registered card out
    // of the pending insertion queue and into the active hit-test list.
    expect(probe.inList).toBe(true);
    expect(probe.inPending).toBe(false);
  });

  it.each(SEEDS)(
    'selects the column on the immediate first click after a natural deal (seed %i)',
    async (seed) => {
      game = await bootNaturalGame(seed);
      const scene = getScene(game);
      const probe = installDealCompleteProbe(scene);

      await chooseClassicVariant(scene);
      await waitForCondition(() => probe.fired, 'natural deal to complete', 20_000);

      // The click was dispatched synchronously at deal-complete — no retry,
      // no settle delay. It must select the column on that very first click.
      await waitForCondition(
        () => (scene as any).selectedCol === probe.sourceCol,
        `immediate first click to select column ${probe.sourceCol}`,
        3000,
      );
      expect((scene as any).selectedCol).toBe(probe.sourceCol);
    },
  );

  it('executes exactly one undoable move from an immediate first click plus a destination click', async () => {
    game = await bootNaturalGame(SEEDS[0]);
    const scene = getScene(game);
    const probe = installDealCompleteProbe(scene);

    await chooseClassicVariant(scene);
    await waitForCondition(() => probe.fired, 'natural deal to complete', 20_000);
    await waitForCondition(
      () => (scene as any).selectedCol === probe.sourceCol,
      'source selection on first click',
    );

    const state = scene.getGameState();
    const move = getLegalMoves(state).find((m) => m.fromCol === probe.sourceCol);
    expect(move).toBeTruthy();
    const moveCountBefore = state.moveCount;

    // Click the legal destination. The foundation zone handles
    // tableau-to-foundation; the tableau column zone handles
    // tableau-to-tableau.
    const zone = move!.kind === 'tableau-to-foundation'
      ? (scene.foundationDropZones[move!.toFoundation!] as Phaser.GameObjects.Zone)
      : tableauZone(scene, move!.toCol!);
    dispatchMouse('mousedown', zone.x, zone.y);
    dispatchMouse('mouseup', zone.x, zone.y);

    await waitForCondition(
      () => state.moveCount === moveCountBefore + 1,
      'click-to-move destination to execute the move',
    );
    expect(state.moveCount).toBe(moveCountBefore + 1);
    expect(scene.getUndoManager().canUndo()).toBe(true);

    // Selection + highlight clear after the move.
    await waitForCondition(() => (scene as any).selectedCol === null, 'selection to clear after move');
    const highlights = (scene.bcRenderer as any).selectionHighlights as Map<number, unknown>;
    expect(highlights.size).toBe(0);
  });

  it('deselects when the selected top card is clicked a second time', async () => {
    game = await bootNaturalGame(SEEDS[0]);
    const scene = getScene(game);
    const probe = installDealCompleteProbe(scene);

    await chooseClassicVariant(scene);
    await waitForCondition(() => probe.fired, 'natural deal to complete', 20_000);
    await waitForCondition(
      () => (scene as any).selectedCol === probe.sourceCol,
      'source selection on first click',
    );

    // Click the same card again: the documented same-card deselect contract.
    const src = topSprite(scene, probe.sourceCol);
    dispatchMouse('mousedown', src.x, src.y);
    dispatchMouse('mouseup', src.x, src.y);

    await waitForCondition(() => (scene as any).selectedCol === null, 'same-card deselect');
    expect((scene as any).selectedCol).toBeNull();
  });
});
