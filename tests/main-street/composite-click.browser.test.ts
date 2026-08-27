/**
 * Main Street composite click-to-click buy-and-play browser tests
 * (CG-0MT76RG60001ELUL / CG-0MT24X0SX007RLHN).
 *
 * Covers the interactive click flow: market card → hand (free, action
 * consumed) → hand card click (select) → street slot click (placement).
 * When the placement happens with 0 actions remaining, the +50% premium
 * applies and the explainer dialog fires; Proceed completes the premium
 * placement, Cancel aborts (card returns to hand, no cost). The
 * "Don't show this again" preference (PREMIUM_DIALOG_DISMISSED_KEY)
 * suppresses the dialog on later premium placements. Held-card play
 * (plan-ahead) stays at listed cost with no dialog.
 *
 * All interactions go through the REAL Phaser pointer pipeline for the
 * street-slot click (the regression guard from click-place.browser.test.ts);
 * market/hand clicks call the scene on* handlers directly as in that suite.
 *
 * @module tests/main-street/composite-click.browser
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import { TUTORIAL_STATE_STORAGE_KEY } from '../../example-games/main-street/TutorialState';
import { getEmptySlots } from '../../example-games/main-street/MainStreetMarket';
import { createBusinessDeck, createCommunitySpaceDeck } from '../../example-games/main-street/MainStreetCards';
import { PREMIUM_DIALOG_DISMISSED_KEY } from '../../example-games/main-street/MainStreetPrefs';

const GAME_W = 1280;
const GAME_H = 720;

async function bootGame(): Promise<Phaser.Game> {
  // No persistent-storage wipe: MainStreetScene.browser.test.ts (17 boots)
  // boots directly and the resume overlay only surfaces when a checkpoint
  // was actually saved. Deleting IndexedDB here blocks once a previous game's
  // save-store connection lingers (deleteDatabase waits for onblocked).
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
  // Reduced-motion mode (a first-class accessibility setting) makes the
  // click-composite transfer animation resolve synchronously, so the
  // premium dialog / placement are NOT gated behind Phaser's RAF-driven
  // tween. This keeps the tests deterministic under parallel-browser CPU
  // contention (the exact scenario that stalls the full tween).
  const sceneAny = game.scene.getScene('MainStreetScene') as any;
  if (sceneAny?.settingsPanel) sceneAny.settingsPanel._reducedMotion = true;
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

/**
 * Wait for the premium dialog to become visible. This is the one
 * RAF-animation-driven wait in the suite: the dialog is created by the
 * transfer-completion callback after the slot click, so its wall-clock
 * latency grows under parallel-browser CPU contention. Use a generous
 * timeout (each test gets an explicit 90s budget).
 */
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

/**
 * Wait for the premium dialog to become visible. This is the one
 * RAF-animation-driven wait in the suite: the dialog is created by the
 * transfer-completion callback after the slot click, so its wall-clock
 * latency grows under parallel-browser CPU contention. Use a generous
 * timeout (each test gets an explicit 90s budget).
 */
async function waitForPremiumDialog(scene: Scene, label = 'premium dialog to appear'): Promise<void> {
  await waitForCondition(() => isDialogOpen(scene), label, 45_000);
}

type Scene = Phaser.Scene & Record<string, any>;

function getScene(game: Phaser.Game): Scene {
  return game.scene.getScene('MainStreetScene') as Scene;
}

/** Wait until the market row is populated with a grid-placeable card. */
async function waitForMarketReady(scene: Scene): Promise<void> {
  await waitForCondition(
    () => scene.state?.market?.cards?.length > 0 &&
      scene.state.market.cards.some((c: any) => c.family === 'business' || c.family === 'community-space'),
    'market row populated with a buyable card',
  );
}

async function waitForSettled(scene: Scene): Promise<void> {
  const firstCard = (): Phaser.GameObjects.GameObject | undefined =>
    (scene.marketContainer?.list ?? []).find(
      (c: any) => c.name?.startsWith?.('ms-market-card-'),
    );
  for (let i = 0; i < 60; i++) {
    await wait(250);
    const now = firstCard();
    if (now === undefined) continue;
    await wait(250);
    if (firstCard() === now) return;
  }
  throw new Error('Timed out waiting for market rendering to settle');
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

async function clickAt(worldX: number, worldY: number): Promise<void> {
  dispatchMouse('mousedown', worldX, worldY);
  await wait(30);
  dispatchMouse('mouseup', worldX, worldY);
}

/**
 * First grid-placeable card in the development row (business or
 * community-space; staff/service cards are excluded). When the row lacks
 * one at the moment of interaction, inject a deterministic full-featured
 * business clone so the test never depends on the seeded row's exact
 * composition or refill timing (mirror of drag.browser.test.ts's
 * firstBusinessCard plus the injection pattern used for the community
 * test).
 */
function firstBuyableCard(scene: Scene): any {
  let card = scene.state.market.cards.find(
    (c: any) => c.family === 'business' || c.family === 'community-space',
  );
  if (!card) {
    const base = createBusinessDeck(1)[0];
    card = { ...base, id: 'biz-injected', name: base.name };
    scene.state.market.cards.push(card);
  }
  expect(card).toBeTruthy();
  return card;
}

/** The premium price for a card: Math.ceil(cost * 1.5 * 2) / 2. */
function premiumOf(cost: number): number {
  return Math.ceil(cost * 1.5 * 2) / 2;
}

/**
 * Run the click composite and stop at the dialog (or report the dialog
 * absence): market card → hand, hand card → select, slot click → placement.
 * Returns after the slot click has been dispatched.
 */
async function clickCompositeToSlot(scene: Scene, card: any, targetSlot: number): Promise<void> {
  scene.onBusinessCardClick(card);
  await waitForCondition(
    () => scene.state.hand?.some((c: any) => c.id === card.id),
    'business moved to hand',
  );
  scene.onHandBusinessCardClick(0);
  await waitForCondition(
    () => scene.uiPhase === 'placing-from-hand' && scene.pendingHandIndex === 0,
    'hand card selected (placing-from-hand phase)',
  );
  await wait(120);
  await clickAt(scene.getStreetSlotCenter(targetSlot).x, scene.getStreetSlotCenter(targetSlot).y);
}

/** Find an interactive Text by its exact label anywhere in the HUD container. */
function findButtonText(scene: Scene, label: string): Phaser.GameObjects.Text | undefined {
  const hud = scene.hudContainer as { list: Phaser.GameObjects.GameObject[] } | undefined;
  if (!hud) return undefined;
  return hud.list.find(
    (child) => child instanceof Phaser.GameObjects.Text && child.text === label,
  ) as Phaser.GameObjects.Text | undefined;
}

/** True when the premium explainer dialog is currently open. */
function isDialogOpen(scene: Scene): boolean {
  return findButtonText(scene, '[ Proceed ]') !== undefined;
}

describe('Main Street composite click-to-click buy-and-play (browser)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
    try { localStorage.removeItem(TUTORIAL_STATE_STORAGE_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(PREMIUM_DIALOG_DISMISSED_KEY); } catch { /* ignore */ }
  });

  it('composite click deducts the premium for business and community-space cards via the dialog', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    await waitForSettled(scene);
    scene.state.resourceBank.coins = 100;

    // ── Same-day BUSINESS card: dialog appears, Proceed places at +50%. ──
    const card = firstBuyableCard(scene);
    const coinBefore = scene.state.resourceBank.coins;
    const targetSlot = getEmptySlots(scene.state)[0];
    expect(targetSlot).toBeGreaterThanOrEqual(0);

    await clickCompositeToSlot(scene, card, targetSlot);

    // The dialog fires because the same-day placement has 0 actions left.
    await waitForPremiumDialog(scene);
    const proceedBtn = findButtonText(scene, '[ Proceed ]')!;
    proceedBtn.emit('pointerdown');

    await waitForCondition(
      () => scene.state.streetGrid[targetSlot]?.id === card.id,
      'business placed on the clicked street slot',
    );
    expect(scene.uiPhase).toBe('market');
    // Premium (not listed cost) deducted from the coin balance.
    expect(scene.state.resourceBank.coins).toBe(coinBefore - premiumOf(card.cost));

    // ── Same-day COMMUNITY-SPACE card: same premium path. ──
    // Deterministic: inject a Library into the market row.
    const cs = createCommunitySpaceDeck(1).find((c: any) => c.name === 'Library')!;
    expect(cs).toBeTruthy();
    scene.state.market.cards.push(cs);
    // Placement needs a fresh action for the move step (first placement
    // left 0 actions).
    scene.state.actionsRemaining = 1;
    const csCoinBefore = scene.state.resourceBank.coins;
    const csSlot = getEmptySlots(scene.state)[0];
    await clickCompositeToSlot(scene, cs, csSlot);
    await waitForPremiumDialog(scene);
    findButtonText(scene, '[ Proceed ]')!.emit('pointerdown');

    await waitForCondition(
      () => scene.state.streetGrid[csSlot]?.id === cs.id,
      'community-space card placed',
    );
    expect(scene.state.resourceBank.coins).toBe(csCoinBefore - premiumOf(cs.cost));
  }, 90_000);

  it('Cancel aborts the premium placement; held-card play stays listed cost with no dialog', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    await waitForSettled(scene);
    scene.state.resourceBank.coins = 100;

    // ── Cancel aborts the premium placement. ──
    const card = firstBuyableCard(scene);
    const coinBefore = scene.state.resourceBank.coins;
    const targetSlot = getEmptySlots(scene.state)[0];

    await clickCompositeToSlot(scene, card, targetSlot);
    await waitForPremiumDialog(scene);

    findButtonText(scene, '[ Cancel ]')!.emit('pointerdown');

    // Aborted: card back in hand (selection cleared), slot empty, no coins
    // deducted.
    await waitForCondition(() => scene.uiPhase === 'market', 'return to market phase');
    expect(scene.state.hand.some((c: any) => c.id === card.id)).toBe(true);
    expect(scene.state.streetGrid[targetSlot]).toBeNull();
    expect(scene.state.resourceBank.coins).toBe(coinBefore);

    // ── Same card, now treated as HELD (plan-ahead): listed cost, no
    // dialog, consumes an action. Clear the same-day tracker so the
    // selection is not a composite.
    scene.justMovedHandCardId = null;
    scene.state.actionsRemaining = 1;
    const heldCoinBefore = scene.state.resourceBank.coins;
    const heldSlot = getEmptySlots(scene.state)[0];

    scene.onHandBusinessCardClick(0);
    await waitForCondition(
      () => scene.uiPhase === 'placing-from-hand' && scene.pendingHandJustMoved === false,
      'held hand card selected (not same-day)',
    );
    await wait(120);
    await clickAt(scene.getStreetSlotCenter(heldSlot).x, scene.getStreetSlotCenter(heldSlot).y);

    await waitForCondition(
      () => scene.state.streetGrid[heldSlot]?.id === card.id,
      'held card placed',
    );
    // Listed cost, no premium, and the dialog never fired for this step.
    expect(scene.state.resourceBank.coins).toBe(heldCoinBefore - card.cost);
    expect(isDialogOpen(scene)).toBe(false);
  }, 90_000);

  it('persisted dismissal suppresses the dialog on later premium placements', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    await waitForSettled(scene);
    scene.state.resourceBank.coins = 100;

    // First premium placement: tick "Don't show again" and Proceed, which
    // persists the preference.
    const card1 = firstBuyableCard(scene);
    const target1 = getEmptySlots(scene.state)[0];
    await clickCompositeToSlot(scene, card1, target1);
    await waitForPremiumDialog(scene, 'first premium dialog');
    const checkLabel = findButtonText(scene, "[ ] Don't show this again")!;
    checkLabel.emit('pointerdown'); // toggle to [x]
    findButtonText(scene, '[ Proceed ]')!.emit('pointerdown');
    await waitForCondition(
      () => scene.state.streetGrid[target1]?.id === card1.id,
      'first card placed',
    );

    // Second premium placement: the move needs a fresh action (the first
    // placement left 0 actions), so restore one before the composite. The
    // refilled row may be staff/service-only, so inject a deterministic
    // business card (clone of a real row card).
    scene.state.actionsRemaining = 1;
    const base2 = firstBuyableCard(scene);
    const card2 = { ...base2, id: 'biz-dismissed-2', name: 'Dismissed2', cost: 6 };
    scene.state.market.cards.push(card2);
    const target2 = getEmptySlots(scene.state)[0];
    await clickCompositeToSlot(scene, card2, target2);
    await waitForCondition(
      () => scene.state.streetGrid[target2]?.id === card2.id,
      'second card placed without a dialog',
    );
    expect(isDialogOpen(scene)).toBe(false);
  }, 90_000);
});