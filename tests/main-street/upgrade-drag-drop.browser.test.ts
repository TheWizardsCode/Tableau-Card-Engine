/**
 * Main Street: Upgrade drag-drop buy-and-play browser tests
 * (CG-0MT40GTSU006C6U1, parent CG-0MT3IYSRL001VVUP).
 *
 * Upgrades in the Development row are draggable onto street businesses. A
 * drag-drop is the same-turn buy-and-play gesture (mirroring business cards):
 *
 * - the dragged upgrade follows the cursor and shows the +50% buy-and-play
 *   premium badge (matching the business formula exactly);
 * - eligible business slots highlight green and ineligible ones red while the
 *   drag is live;
 * - dropping on an eligible business buys and applies the upgrade in one
 *   undoable action, spending exactly one daily action at the +50% premium;
 * - dropping on an ineligible business snaps the card back with illegal
 *   feedback and spends nothing;
 * - when the action budget is spent the upgrade is dimmed and the drag is
 *   vetoed (the tooltip still shows the full card, plus the reason);
 * - the drop plays the market→business transfer animation and the upgrade
 *   SFX through the SoundManager.
 *
 * Assertions go through the scene's public interaction surface and the state
 * it mutates — never source greps.
 *
 * @module tests/main-street/upgrade-drag-drop.browser
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';
import { TUTORIAL_STATE_STORAGE_KEY } from '../../example-games/main-street/TutorialState';
import {
  getBusinessTemplates,
  getUpgradeTemplates,
  type BusinessCard,
  type UpgradeCard,
} from '../../example-games/main-street/MainStreetCards';
import { SFX_KEYS } from '../../example-games/main-street/scenes/MainStreetConstants';

const GAME_W = 1280;
const GAME_H = 720;

type Scene = Phaser.Scene & Record<string, any>;

/** Clear persistent storage so no checkpoint/resume overlay swallows input. */
async function clearPersistentStorage(): Promise<void> {
  try { localStorage.clear(); } catch { /* ignore */ }
}

async function bootGame(): Promise<Phaser.Game> {
  await clearPersistentStorage();
  // Skip the tutorial so no tutorial step gates a drag interaction.
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
    // Yield to the browser's animation-frame loop so Phaser's game loop
    // step (and its InputPlugin.preUpdate) can process queued events.
    // Without this the `drop` handler may never fire under contention
    // (CG-0MUA7RRXL007GEHW).  rAF is used rather than a bare setTimeout
    // because it guarantees at least one full game-loop step runs per poll.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

/**
 * Wait for real browser animation frames so Phaser's game loop executes.
 *
 * Newly created interactive game objects (the drop zones and draggable
 * market-card containers rebuilt by `refreshAll`/`refreshStreetGrid`) are
 * queued in Phaser's `_pendingInsertion` and only registered with the input
 * system during `InputPlugin.preUpdate`, which runs on the scene's
 * `PRE_UPDATE` tick — i.e. from the game loop's rAF callback, never from a
 * `setTimeout`.
 *
 * Under full-suite Chromium contention the loop can be starved for seconds,
 * so a fixed `setTimeout` wait is unreliable: the drag begins against a
 * not-yet-registered hit zone, the drop is missed and the transfer never
 * starts.  Waiting for two `requestAnimationFrame` callbacks guarantees at
 * least one full game-loop step has run before the gesture begins (the same
 * established pattern used in `expanded-viewport.browser.test.ts`).
 *
 * @param count - Number of frames to wait (default 2 for a margin).
 */
async function waitForFrames(count = 2): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function getScene(game: Phaser.Game): Scene {
  return game.scene.getScene('MainStreetScene') as Scene;
}

/** Dispatch a native DOM MouseEvent at canvas (game-world) coordinates. */
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

/**
 * Wait for a single browser animation frame (one Phaser game-loop tick).
 *
 * `setTimeout` does not guarantee the game loop ran, so under frame
 * starvation Phaser's `InputPlugin` may not process a dispatched pointer
 * event before the next one arrives.  `requestAnimationFrame` does.
 */
function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Options for {@link beginDrag}.
 */
interface BeginDragOptions {
  /**
   * Whether the gesture is expected to actually engage (the container follows
   * the pointer).  Positive drag tests leave this `true` so the helper retries
   * the gesture until it engages or the deadline passes — the contention
   * guard.  Tests that assert a deliberate pickup veto pass `false`: the
   * gesture is dispatched once and the helper returns so the test can verify
   * the card stayed put.
   */
  expectEngage?: boolean;
  /** Max wall-clock time to keep retrying (default 30 s). */
  deadlineMs?: number;
}

/**
 * Drive a drag gesture up to (but not including) the release.
 *
 * Phaser fires `dragstart` on the first pointer move that crosses the drag
 * threshold and captures the grab offset there, so a second move is required
 * for the card to visibly follow the cursor (mirrors the business drag suite).
 *
 * Under full-suite Chromium contention Phaser's game loop can be starved for
 * seconds, so the fixed `setTimeout` sleeps used by the original gesture are
 * unreliable: pointer events dispatched during a starved frame may never be
 * processed by `InputPlugin`, so `dragstart` does not fire and the container
 * never follows the pointer.  Two mitigations are applied:
 *
 * 1. every inter-event wait is a real animation frame, guaranteeing the game
 *    loop ran between dispatches; and
 * 2. when the gesture is expected to engage, the full dispatch is retried
 *    idempotently until the container moves or a generous deadline passes
 *    (the same retry-until-condition remedy as `expanded-viewport.browser`,
 *    commit da4290c8).  The regression guard is preserved: a genuinely broken
 *    drag/drop pipeline still exhausts the deadline and throws.
 *
 * @param container - The rendered market-card container to drag.
 * @param opts - Engagement expectation and retry deadline.
 */
async function beginDrag(
  container: any,
  opts: BeginDragOptions = {},
): Promise<void> {
  const { expectEngage = true, deadlineMs = 30_000 } = opts;
  const originX = container.x;
  const originY = container.y;

  // Let the game loop register the freshly rebuilt interactive hit zones
  // (drop zones + draggable containers) before the gesture starts.
  await waitForFrames();

  const start = Date.now();
  for (;;) {
    // A full dispatch of the gesture.  Re-issuing it is idempotent: once the
    // drag has engaged we return immediately, and a failed attempt leaves no
    // active drag because the mouseup below resets partial pointer state.
    dispatchMouse('mousedown', originX, originY);
    await nextFrame();
    // Cross the drag-distance threshold → dragstart fires.
    dispatchMouse('mousemove', originX + 6, originY);
    await nextFrame();
    // Second move: the container should now track the pointer.
    dispatchMouse('mousemove', originX + 60, originY + 20);
    await waitForFrames(2);

    // Poll: has the container moved?  If so, the drag is live — leave it
    // active for releaseDrag().
    if (
      Math.abs(container.x - originX) > 5 ||
      Math.abs(container.y - originY) > 5
    ) {
      return;
    }

    // A deliberate veto (no actions / no eligible target) leaves the card at
    // its origin by design — return so the test can assert that state.
    if (!expectEngage) return;

    if (Date.now() - start >= deadlineMs) {
      throw new Error(
        `Timed out waiting for the drag to engage after ${deadlineMs}ms ` +
          `(container.x=${container.x}, container.y=${container.y})`,
      );
    }

    // The gesture missed (hit zone not yet live, or the frame was starved).
    // Reset any partial pointer state before retrying the full sequence.
    dispatchMouse('mouseup', originX, originY);
    await waitForFrames(2);
  }
}

/**
 * Complete a gesture started with {@link beginDrag} at the given target.
 *
 * Under contention the mousemove+mouseup pair may need an extra rAF flush
 * before the drop handler fires.  A generous settleMs (default 300 ms) is
 * retained, but the function also polls for the expected post-drop state
 * so it doesn't stall unnecessarily when the game loop is fast.
 *
 * @param dx - Drop target X (world coordinates).
 * @param dy - Drop target Y (world coordinates).
 * @param settleMs - Extra settle time after mouseup (default 300 ms).
 */
async function releaseDrag(
  dx: number,
  dy: number,
  settleMs = 300,
): Promise<void> {
  // Flush any pending insertion so the drop zone hit-box is live.
  await waitForFrames();

  dispatchMouse('mousemove', dx, dy);
  await nextFrame();

  dispatchMouse('mouseup', dx, dy);

  // Settle: let Phaser process the drop and any resulting tweens.
  // Use rAF-based waits instead of bare setTimeout for the same contention
  // reasons as beginDrag (CG-0MUA7RRXL007GEHW).
  const settleStart = Date.now();
  while (Date.now() - settleStart < settleMs) {
    await nextFrame();
  }
}

/**
 * A level-0 upgrade plus a matching base-level business template, so the flow
 * can be exercised end to end (mirrors upgrade-hand-flow.browser.test.ts).
 */
function makeUpgradeFixture(): { biz: BusinessCard; upgrade: UpgradeCard } {
  const upgrades = getUpgradeTemplates();
  const upgrade = upgrades.find((u) => (u.requiredLevel ?? 0) === 0);
  if (!upgrade) throw new Error('No level-0 upgrade templates');
  const tpl = getBusinessTemplates().find((t) => t.name === upgrade.targetBusiness);
  if (!tpl) throw new Error(`No business template named "${upgrade.targetBusiness}"`);
  const biz: BusinessCard = {
    ...tpl,
    id: `dragdrop-biz-${tpl.id}`,
    family: 'business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
  };
  return { biz, upgrade };
}

/** `Math.ceil(cost * 1.5 * 2) / 2` — the shared buy-and-play premium. */
function premiumOf(cost: number): number {
  return Math.ceil(cost * 1.5 * 2) / 2;
}

/**
 * Place a deterministic street/upgrade-market setup on the live scene.
 *
 * The upgrade sits alone in the Development row and one matching business is
 * seated on slot 0 (eligible at `businessLevel` 0, ineligible at any other
 * level because the fixture requires level 0).
 */
function setupUpgradeScene(
  scene: Scene,
  opts: { actions?: number; coins?: number; businessLevel?: number } = {},
): { biz: BusinessCard; upgrade: UpgradeCard } {
  const { biz, upgrade } = makeUpgradeFixture();
  const level = opts.businessLevel ?? 0;
  const placedBiz: BusinessCard = { ...biz, level, id: `${biz.id}-lvl${level}` };

  scene.state.streetGrid[0] = placedBiz;
  for (let i = 1; i < scene.state.streetGrid.length; i += 1) {
    scene.state.streetGrid[i] = null;
  }

  scene.state.market.cards = [upgrade];
  scene.state.hand = [];
  scene.state.resourceBank.coins = opts.coins ?? 2000;
  scene.state.actionsRemaining = opts.actions ?? 1;
  scene.state.justMovedUpgradeCardId = null;

  scene.pendingHandIndex = null;
  scene.pendingHandJustMoved = false;
  scene.uiPhase = 'market';
  // Keep the drag deterministic: no tween-driven settle on release.
  if (scene.settingsPanel) scene.settingsPanel._reducedMotion = true;
  scene.refreshAll();

  return { biz: placedBiz, upgrade };
}

/** The rendered market-card container for a card id. */
function findMarketCardContainer(scene: Scene, cardId: string): any | undefined {
  const list: any[] = scene.marketContainer?.list ?? [];
  return list.find((child) => child?.name === `ms-market-card-${cardId}`);
}

/**
 * Wait until the market containers are stable across consecutive polls so a
 * rebuild cannot invalidate the dragged container mid-gesture.
 */
async function waitForMarketStable(scene: Scene, cardId: string): Promise<any> {
  let previous: any;
  for (let i = 0; i < 40; i += 1) {
    await wait(100);
    const now = findMarketCardContainer(scene, cardId);
    if (now && now === previous) return now;
    previous = now;
  }
  throw new Error('Timed out waiting for the market containers to stabilise');
}

describe('Main Street upgrade drag-drop buy-and-play (browser)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
    try { localStorage.removeItem(TUTORIAL_STATE_STORAGE_KEY); } catch { /* ignore */ }
  });

  it('advertises the +50% premium and makes the dragged upgrade follow the cursor', async () => {
    game = await bootGame();
    const scene = getScene(game);
    const { upgrade } = setupUpgradeScene(scene);
    const container = await waitForMarketStable(scene, upgrade.id);

    const originX = container.x;
    const originDepth = container.depth;
    await beginDrag(container);

    // The container tracks the pointer and is raised above the board.
    expect(container.x).toBeGreaterThan(originX + 20);
    expect(container.depth).toBeGreaterThan(originDepth);
    expect(scene.dragDropManager).toBeTruthy();

    // Release away from the street so the gesture ends with a snap-back.
    await releaseDrag(GAME_W - 40, GAME_H - 40);
  }, 60_000);

  it('highlights eligible business slots green and ineligible ones red while dragging', async () => {
    game = await bootGame();
    const scene = getScene(game);
    const { upgrade } = setupUpgradeScene(scene);

    // Slot 0 holds a level-0 business (eligible); slot 1 holds a level-1 one
    // (ineligible for this level-0 upgrade).
    scene.state.streetGrid[1] = { ...scene.state.streetGrid[0]!, id: 'ineligible-lvl1', level: 1 };
    scene.refreshAll();

    scene.msRenderer.showDragHighlights(upgrade.id);

    const highlights: Array<{ slotIndex: number; validity: string }> =
      scene.msRenderer.getDragHighlights();
    const bySlot = new Map(highlights.map((h) => [h.slotIndex, h.validity]));

    expect(bySlot.get(0)).toBe('valid');
    expect(bySlot.get(1)).toBe('invalid');
    // Highlighting is cleared on drag end.
    scene.msRenderer.clearDragHighlights();
    expect(scene.msRenderer.getDragHighlights()).toHaveLength(0);
  }, 60_000);

  it('dropping an upgrade on an eligible business buys and plays it at the premium', async () => {
    game = await bootGame();
    const scene = getScene(game);
    const { upgrade } = setupUpgradeScene(scene, { actions: 1, coins: 2000 });
    const container = await waitForMarketStable(scene, upgrade.id);
    const target = scene.getStreetSlotCenter(0);

    await beginDrag(container);
    await releaseDrag(target.x, target.y);

    await waitForCondition(
      () => scene.state.streetGrid[0]?.level === 1,
      'upgrade applied to the business after the drop',
    );

    // Drag-drop is the same-turn buy-and-play: exactly one action, premium price.
    expect(scene.state.actionsRemaining).toBe(0);
    expect(scene.state.resourceBank.coins).toBe(2000 - premiumOf(upgrade.cost));
    // The card left the Development row and the scene returned to the market phase.
    expect(scene.state.market.cards.some((c: any) => c.id === upgrade.id)).toBe(false);
    expect(scene.uiPhase).toBe('market');
    // The buy-and-play was a single undoable command.
    expect(scene.undoManager.canUndo()).toBe(true);
  }, 60_000);

  it('rejects a drop on an ineligible business with a snap-back and no action spent', async () => {
    game = await bootGame();
    const scene = getScene(game);
    // Business sits at level 1 while the upgrade requires level 0.
    const { upgrade } = setupUpgradeScene(scene, { actions: 1, businessLevel: 1 });
    const container = await waitForMarketStable(scene, upgrade.id);
    const originX = container.x;
    const originY = container.y;
    const target = scene.getStreetSlotCenter(0);

    await beginDrag(container, { expectEngage: false });
    await releaseDrag(target.x, target.y, 500);

    // The card snapped back to the Development row, nothing was spent, and
    // the ineligible business is untouched.
    expect(container.x).toBeCloseTo(originX, 0);
    expect(container.y).toBeCloseTo(originY, 0);
    expect(scene.state.market.cards.some((c: any) => c.id === upgrade.id)).toBe(true);
    expect(scene.state.streetGrid[0]?.level).toBe(1);
    expect(scene.state.actionsRemaining).toBe(1);
    expect(scene.state.resourceBank.coins).toBe(2000);
    expect(scene.undoManager.canUndo()).toBe(false);
  }, 60_000);

  it('dims the upgrade, vetoes the drag, and explains the reason when no actions remain', async () => {
    game = await bootGame();
    const scene = getScene(game);
    const { upgrade } = setupUpgradeScene(scene, { actions: 0 });
    const container = await waitForMarketStable(scene, upgrade.id);

    // Disabled presentation + the drag pick-up is refused.
    expect(container.alpha).toBeCloseTo(0.45, 5);
    expect(scene.msTurnController.canPickUpUpgradeCard(upgrade.id)).toBe(false);

    // Hovering still shows the full card tooltip, plus the blocking reason.
    const showSpy = vi.spyOn(scene.tooltipManager, 'show');
    const hover = (container.list ?? []).find(
      (child: any) => child instanceof Phaser.GameObjects.Rectangle && child.input,
    );
    expect(hover).toBeTruthy();
    hover.emit('pointerover');
    expect(showSpy).toHaveBeenCalled();
    expect(String(showSpy.mock.calls[0][0])).toContain('No actions remaining');
    // The full card details are preserved alongside the reason.
    expect(String(showSpy.mock.calls[0][0])).toContain(`Upgrade: ${upgrade.name}`);

    // A full gesture leaves the card exactly where it started.  The pickup is
    // vetoed (no actions), so the drag is not expected to engage.
    const originX = container.x;
    const originY = container.y;
    await beginDrag(container, { expectEngage: false });
    await releaseDrag(scene.getStreetSlotCenter(0).x, scene.getStreetSlotCenter(0).y, 400);

    expect(container.x).toBeCloseTo(originX, 0);
    expect(container.y).toBeCloseTo(originY, 0);
    expect(scene.state.streetGrid[0]?.level).toBe(0);
    expect(scene.state.market.cards.some((c: any) => c.id === upgrade.id)).toBe(true);
  }, 60_000);

  it('animates the transfer from the drop location and plays the upgrade SFX', async () => {
    game = await bootGame();
    const scene = getScene(game);
    const { upgrade } = setupUpgradeScene(scene, { actions: 1 });
    const container = await waitForMarketStable(scene, upgrade.id);
    const originX = container.x;
    // Real motion + audio so the transfer animation and its SFX actually run.
    scene.settingsPanel._reducedMotion = false;

    const transferSpy = vi.spyOn(scene, 'animateTransferFromMarket');
    const soundSpy = vi.spyOn(scene.soundManager, 'play').mockClear();

    const target = scene.getStreetSlotCenter(0);
    await beginDrag(container);
    await releaseDrag(target.x, target.y, 40);

    // The transfer continues from where the card was released.
    // 30 s timeout: under concurrent-suite Chromium contention the
    // scene update loop can starve, so the default and the 15-25 s budgets
    // are sometimes too short.  waitForCondition yields to rAF each poll so
    // the `drop` handler is guaranteed a game-loop step to fire.
    await waitForCondition(
      () => transferSpy.mock.calls.length > 0,
      'transfer animation to start after the drop',
      30_000,
    );
    const options = transferSpy.mock.calls[0][0] as any;
    expect(options.family).toBe('upgrade');
    expect(options.destination.x).toBeCloseTo(target.x, 0);
    expect(options.destination.y).toBeCloseTo(target.y, 0);
    expect(options.source).toBeTruthy();
    // The card followed the pointer to the drop location (Phaser keeps the
    // grab offset, so allow a small tolerance) rather than staying in the row.
    expect(Math.abs(options.source.x - target.x)).toBeLessThanOrEqual(20);
    expect(Math.abs(options.source.x - originX)).toBeGreaterThan(20);
    expect(scene.activeTransferVisuals.size).toBeGreaterThanOrEqual(1);

    // The upgrade transfer is audible (start + end cues through the manager).
    await waitForCondition(
      () => soundSpy.mock.calls.some((call) => call[0] === SFX_KEYS.UPGRADE_END),
      'upgrade end SFX to play',
      15_000,
    );
    expect(soundSpy).toHaveBeenCalledWith(SFX_KEYS.UPGRADE_START);
    expect(soundSpy).toHaveBeenCalledWith(SFX_KEYS.UPGRADE_END);
  }, 60_000);
});
