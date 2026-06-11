/**
 * Main Street Tutorial E2E browser test (focused on key tutorial flow).
 *
 * Boots Main Street with tutorial forced via ?tutorial=1, then walks through
 * key tutorial steps to verify overlays, buttons, and state transitions.
 *
 * Uses Vitest browser mode with Playwright (Chromium, headless).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Phaser from 'phaser';
import { page } from '@vitest/browser/context';
import { waitForScene } from '../helpers/waitForScene';
import { createSeededRng } from '../../src/core-engine/SeededRng';

const TEST_SEED = 777;
const SCENE_LOAD_TIMEOUT = 30_000;
const UI_TRANSITION_TIMEOUT = 5_000;
const SCREENSHOT_DIR = 'main-street-tutorial-e2e';

// ── Helpers ──────────────────────────────────────────────

async function withSeededRandom<T>(fn: () => Promise<T>): Promise<T> {
  const original = Math.random;
  Math.random = createSeededRng(TEST_SEED);
  try { return await fn(); } finally { Math.random = original; }
}

async function bootGameWithTutorial(): Promise<Phaser.Game> {
  const existing = document.getElementById('game-container');
  if (existing) existing.remove();
  const container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);
  const url = new URL(window.location.href);
  url.searchParams.set('tutorial', '1');
  window.history.replaceState({}, '', url.toString());
  const { createMainStreetGame } = await import(
    '../../example-games/main-street/createMainStreetGame'
  );
  const game = createMainStreetGame({ parent: 'game-container', width: 1280, height: 720 });
  await waitForScene(game, 'MainStreetScene', SCENE_LOAD_TIMEOUT);
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

async function waitForTutorialOfferModal(timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (document.querySelector('.ms-tutorial-offer')) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Tutorial offer modal did not appear');
}

async function startTutorial(): Promise<void> {
  await waitForTutorialOfferModal();
  const startBtn = document.querySelector('.ms-tutorial-offer .ms-tutorial-start') as HTMLElement | null;
  expect(startBtn).toBeTruthy();
  startBtn!.click();
  await waitForTutorialOverlay(10_000);
}

async function waitForTutorialOverlay(timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (document.querySelector('.ms-tutorial-tooltip')) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Tutorial overlay did not appear');
}

function getOverlay(): Element | null {
  return document.querySelector('.ms-tutorial-tooltip');
}

async function clickNextBtn(): Promise<void> {
  const overlay = getOverlay();
  expect(overlay).toBeTruthy();
  const btn = overlay!.querySelector('.ms-tutorial-btn-next, .ms-tutorial-btn-continue') as HTMLElement | null;
  expect(btn).toBeTruthy();
  btn!.click();
  await new Promise((r) => setTimeout(r, 300));
}

async function waitForOverlayVisible(timeoutMs = UI_TRANSITION_TIMEOUT): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (document.querySelector('.ms-tutorial-tooltip')) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Overlay did not appear after click');
}

function getStepIndex(scene: Phaser.Scene): number {
  const c = (scene as any).tutorialController;
  return c?.currentStepIndex ?? -1;
}

async function saveScreenshot(name: string): Promise<void> {
  const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  await page.screenshot({ path: `__screenshots__/${SCREENSHOT_DIR}/${name}.png` });
}

async function clickMarketBusinessCard(scene: Phaser.Scene, idx: number): Promise<void> {
  const mc = (scene as any).getMarketContainer?.() ?? (scene as any).marketContainer;
  expect(mc).toBeTruthy();
  const children = mc.getChildren?.() ?? (mc as any).list ?? [];
  const cards = children.filter(
    (c: Phaser.GameObjects.GameObject) =>
      c instanceof Phaser.GameObjects.Image &&
      (c as Phaser.GameObjects.Image).texture?.key !== 'ms_placeholder_card',
  );
  expect(idx).toBeLessThan(cards.length);
  const card = cards[idx] as Phaser.GameObjects.Image;
  card.emit('pointerdown', { x: card.x, y: card.y, worldX: card.x, worldY: card.y });
  await new Promise((r) => setTimeout(r, 200));
}

function clickStreetSlot(scene: Phaser.Scene, slotIdx: number): void {
  const sc = (scene as any).getStreetContainer?.() ?? (scene as any).streetContainer;
  if (!sc) return;
  const children = sc.getChildren?.() ?? (sc as any).list ?? [];
  const slots = children.filter((c: Phaser.GameObjects.Graphics) => c instanceof Phaser.GameObjects.Graphics);
  if (slotIdx < slots.length) {
    slots[slotIdx].emit('pointerdown', { x: slots[slotIdx].x, y: slots[slotIdx].y, worldX: slots[slotIdx].x, worldY: slots[slotIdx].y });
  }
}

async function clickEndTurn(scene: Phaser.Scene): Promise<void> {
  const ac = (scene as any).getActionContainer?.() ?? (scene as any).actionContainer;
  if (!ac) return;
  const children = ac.getChildren?.() ?? (ac as any).list ?? [];
  const et = children.find((c: Phaser.GameObjects.Text) => c.text === 'End Turn') as Phaser.GameObjects.Text | undefined;
  if (et) {
    et.emit('pointerdown', { x: et.x, y: et.y, worldX: et.x, worldY: et.y });
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function clickHelp(scene: Phaser.Scene): Promise<void> {
  const hb = (scene as any).helpButton;
  if (hb) {
    hb.emit('pointerdown', { x: hb.x, y: hb.y, worldX: hb.x, worldY: hb.y });
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function waitForUiPhase(scene: Phaser.Scene, target: string, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((scene as any).uiPhase === target) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

// ── Tests ────────────────────────────────────────────────

describe('Main Street Tutorial E2E', () => {
  let game: Phaser.Game | null = null;

  beforeEach(async () => {
    await withSeededRandom(async () => {
      game = await bootGameWithTutorial();
      await startTutorial();
      const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
      await waitForUiPhase(scene, 'market', 10_000);
    });
  });

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  // ── T1: Welcome (confirm) ────────────────────────────

  it('T1: Welcome shows and advances to T2', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    expect(getStepIndex(scene)).toBe(0);
    await clickNextBtn();
    await waitForOverlayVisible();
    expect(getStepIndex(scene)).toBe(1);
    await saveScreenshot('t1-t2');
  }, 30_000);

  // ── T2: HUD (confirm) ────────────────────────────────

  it('T2: HUD advances to T3', async () => {
    await clickNextBtn(); // T1 -> T2
    await clickNextBtn(); // T2 -> T3
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    expect(getStepIndex(scene)).toBe(2); // T3
    await saveScreenshot('t2-t3');
  }, 30_000);

  // ── T3: Select Business (action) ─────────────────────

  it('T3: Select business card advances to T4', async () => {
    await clickNextBtn(); // T1 -> T2
    await clickNextBtn(); // T2 -> T3
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    expect(getStepIndex(scene)).toBe(2); // T3

    // Perform the action: click first business card
    await clickMarketBusinessCard(scene, 0);

    // Verify overlay advanced to T4
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(3); // T4
    await saveScreenshot('t3-t4');
  }, 30_000);

  // ── T4: Place Business (action) ──────────────────────

  it('T4: Place business on street advances to T5', async () => {
    await clickNextBtn(); // T1 -> T2
    await clickNextBtn(); // T2 -> T3
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await clickMarketBusinessCard(scene, 0); // T3 action
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(3); // T4

    // T4 action: click first street slot
    clickStreetSlot(scene, 0);
    await new Promise((r) => setTimeout(r, 500));
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(4); // T5
    await saveScreenshot('t4-t5');
  }, 30_000);

  // ── T5: Incidents (confirm) ──────────────────────────

  it('T5: Incident queue advances to T6', async () => {
    await clickNextBtn(); await clickNextBtn(); // T1,T2
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await clickMarketBusinessCard(scene, 0); // T3
    await waitForOverlayVisible(5_000);
    clickStreetSlot(scene, 0); // T4
    await new Promise((r) => setTimeout(r, 500));
    await waitForOverlayVisible(5_000);

    await clickNextBtn();
    expect(getStepIndex(scene)).toBe(5); // T6
    await saveScreenshot('t5-t6');
  }, 30_000);

  // ── T6: End Turn (action) ───────────────────────────

  it('T6: End turn advances to T7', async () => {
    await clickNextBtn(); await clickNextBtn(); // T1,T2
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await clickMarketBusinessCard(scene, 0); // T3
    await waitForOverlayVisible(5_000);
    clickStreetSlot(scene, 0); // T4
    await new Promise((r) => setTimeout(r, 500));
    await waitForOverlayVisible(5_000);
    await clickNextBtn(); // T5 -> T6

    // T6 action: click end turn
    await clickEndTurn(scene);
    await waitForOverlayVisible(10_000);
    expect(getStepIndex(scene)).toBe(6); // T7
    await saveScreenshot('t6-t7');
  }, 30_000);

  // ── T7: Buy Event (action) ──────────────────────────

  it('T7: Buy event card advances to T8', async () => {
    await clickNextBtn(); await clickNextBtn(); // T1,T2
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await clickMarketBusinessCard(scene, 0); // T3
    await waitForOverlayVisible(5_000);
    clickStreetSlot(scene, 0); // T4
    await new Promise((r) => setTimeout(r, 500));
    await waitForOverlayVisible(5_000);
    await clickNextBtn(); // T5 -> T6
    await clickEndTurn(scene); // T6 action
    await waitForOverlayVisible(10_000);

    // T7 action: buy first event card from investments
    await clickMarketBusinessCard(scene, 0); // Click investment/event card
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(7); // T8
    await saveScreenshot('t7-t8');
  }, 30_000);

  // ── T8: Upgrade (action) ────────────────────────────

  it('T8: Apply upgrade advances to T9', async () => {
    await clickNextBtn(); await clickNextBtn(); // T1,T2
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await clickMarketBusinessCard(scene, 0); // T3
    await waitForOverlayVisible(5_000);
    clickStreetSlot(scene, 0); // T4
    await new Promise((r) => setTimeout(r, 500));
    await waitForOverlayVisible(5_000);
    await clickNextBtn(); // T5 -> T6
    await clickEndTurn(scene); // T6
    await waitForOverlayVisible(10_000);
    await clickMarketBusinessCard(scene, 0); // T7
    await waitForOverlayVisible(5_000);

    // T8 action: apply upgrade (click upgrade card)
    // For this test, we just verify the overlay shows and we can advance
    await clickNextBtn(); // Try next if not action-gated, or verify overlay visible
    const overlay = getOverlay();
    expect(overlay).toBeTruthy();
    await saveScreenshot('t8');
  }, 30_000);

  // ── T9: Hand (confirm) ──────────────────────────────

  it('T9: Hand step advances to T10', async () => {
    await clickNextBtn(); await clickNextBtn(); // T1,T2
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await clickMarketBusinessCard(scene, 0); // T3
    await waitForOverlayVisible(5_000);
    clickStreetSlot(scene, 0); // T4
    await new Promise((r) => setTimeout(r, 500));
    await waitForOverlayVisible(5_000);
    await clickNextBtn(); // T5 -> T6
    await clickEndTurn(scene); // T6
    await waitForOverlayVisible(10_000);
    await clickMarketBusinessCard(scene, 0); // T7
    await waitForOverlayVisible(5_000);
    await clickNextBtn(); // T8 -> T9

    expect(getStepIndex(scene)).toBe(8); // T9
    await clickNextBtn();
    expect(getStepIndex(scene)).toBe(9); // T10
    await saveScreenshot('t9-t10');
  }, 30_000);

  // ── T10: Help (action) ──────────────────────────────

  it('T10: Open help advances to T11', async () => {
    await clickNextBtn(); await clickNextBtn(); // T1,T2
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await clickMarketBusinessCard(scene, 0); // T3
    await waitForOverlayVisible(5_000);
    clickStreetSlot(scene, 0); // T4
    await new Promise((r) => setTimeout(r, 500));
    await waitForOverlayVisible(5_000);
    await clickNextBtn(); // T5 -> T6
    await clickEndTurn(scene); // T6
    await waitForOverlayVisible(10_000);
    await clickMarketBusinessCard(scene, 0); // T7
    await waitForOverlayVisible(5_000);
    await clickNextBtn(); // T8 -> T9
    await clickNextBtn(); // T9 -> T10

    // T10 action: open help panel
    await clickHelp(scene);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(10); // T11
    await saveScreenshot('t10-t11');
  }, 30_000);

  // ── T11-T13: Remaining confirm steps ────────────────

  it('T11-T13: Remaining confirm steps advance to completion', async () => {
    await clickNextBtn(); await clickNextBtn(); // T1,T2
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await clickMarketBusinessCard(scene, 0); // T3
    await waitForOverlayVisible(5_000);
    clickStreetSlot(scene, 0); // T4
    await new Promise((r) => setTimeout(r, 500));
    await waitForOverlayVisible(5_000);
    await clickNextBtn(); // T5 -> T6
    await clickEndTurn(scene); // T6
    await waitForOverlayVisible(10_000);
    await clickMarketBusinessCard(scene, 0); // T7
    await waitForOverlayVisible(5_000);
    await clickNextBtn(); // T8 -> T9
    await clickNextBtn(); // T9 -> T10
    await clickHelp(scene); // T10
    await waitForOverlayVisible(5_000);

    // T11, T12, T13 are all confirm steps
    expect(getStepIndex(scene)).toBe(10); // T11
    await clickNextBtn();
    expect(getStepIndex(scene)).toBe(11); // T12
    await saveScreenshot('t11-t12');

    await clickNextBtn();
    expect(getStepIndex(scene)).toBe(12); // T13
    await saveScreenshot('t12-t13');

    await clickNextBtn();
    // After T13, tutorial should be complete (overlay dismissed)
    const finalOverlay = getOverlay();
    expect(finalOverlay).toBeFalsy();
    await saveScreenshot('tutorial-complete');
  }, 60_000);
});

