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
    await wait(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
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
 * Drive a drag gesture up to (but not including) the release.
 *
 * Phaser fires `dragstart` on the first pointer move that crosses the drag
 * threshold and captures the grab offset there, so a second move is required
 * for the card to visibly follow the cursor (mirrors the business drag suite).
 */
async function beginDrag(sx: number, sy: number): Promise<void> {
  dispatchMouse('mousedown', sx, sy);
  await wait(40);
  // Cross the drag-distance threshold → dragstart fires.
  dispatchMouse('mousemove', sx + 6, sy);
  await wait(60);
  // Second move: the container now tracks the pointer.
  dispatchMouse('mousemove', sx + 60, sy + 20);
  await wait(80);
}

/** Complete a gesture started with {@link beginDrag} at the given target. */
async function releaseDrag(dx: number, dy: number, settleMs = 300): Promise<void> {
  dispatchMouse('mousemove', dx, dy);
  await wait(60);
  dispatchMouse('mouseup', dx, dy);
  await wait(settleMs);
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

/** The text of the buy-and-place premium badge on a card container, if any. */
function premiumBadgeText(container: any): string | null {
  const children: any[] = container?.list ?? [];
  const badge = children.find((child) => child?.name === 'buyAndPlacePremiumLabel');
  return badge?.text ?? null;
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

    // The premium badge mirrors the business buy-and-place label.
    expect(premiumBadgeText(container)).toContain(String(premiumOf(upgrade.cost)));

    const originX = container.x;
    const originY = container.y;
    const originDepth = container.depth;
    await beginDrag(originX, originY);

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

    await beginDrag(container.x, container.y);
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

    await beginDrag(originX, originY);
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

    // A full gesture leaves the card exactly where it started.
    const originX = container.x;
    const originY = container.y;
    await beginDrag(originX, originY);
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
    await beginDrag(container.x, container.y);
    await releaseDrag(target.x, target.y, 40);

    // The transfer continues from where the card was released.
    await waitForCondition(
      () => transferSpy.mock.calls.length > 0,
      'transfer animation to start after the drop',
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
