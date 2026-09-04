/**
 * Main Street Tutorial E2E browser test — Part 2 (Tests 7-8).
 *
 * Walks the 23-step two-turn tutorial flow: T6 End Turn → T7 Place the
 * Laundromat (day 2, listed cost) → T8 Investments.
 *
 * Stays well within the browser's per-process canvas/WebGL context budget.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Phaser from 'phaser';
import {
  bootGameWithTutorial,
  destroyGame,
  findPhaserTextByLabel,
  waitForTutorialOverlay,
  clickOverlayButtonByText,
  waitForOverlayVisible,
  getStepIndex,
  clickRequiredBusinessCard,
  clickStreetSlot,
  clickEndTurn,
  saveScreenshot,
} from '../helpers/main-street-tutorial-e2e';

let game: Phaser.Game | null = null;

async function waitForStartButton(scene: Phaser.Scene, timeoutMs = 8_000): Promise<Phaser.GameObjects.Text | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const btn = findPhaserTextByLabel(scene, '[ Start Tutorial ]');
    if (btn) return btn;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

/** Walk the tutorial from T1 through the T6 End Turn (arrives on T7). */
async function walkToT7(scene: Phaser.Scene): Promise<void> {
  await clickOverlayButtonByText('Next >'); // T1 -> T2
  await clickOverlayButtonByText('Next >'); // T2 -> T3
  await clickRequiredBusinessCard(scene);  // T3 move Laundromat -> T4
  await waitForOverlayVisible(5_000);
  await clickOverlayButtonByText('Next >'); // T4 -> T5
  await waitForOverlayVisible(5_000);
  await clickOverlayButtonByText('Next >'); // T5 -> T6
  await waitForOverlayVisible(5_000);
  await clickEndTurn(scene);               // T6 end turn -> T7
  await new Promise((r) => setTimeout(r, 500));
  await waitForOverlayVisible(5_000);
}

describe('Main Street Tutorial E2E — Part 2', () => {
  beforeEach(async () => {
    game = await bootGameWithTutorial();
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    const startBtn = await waitForStartButton(scene, 10_000);
    expect(startBtn).toBeTruthy();
    startBtn!.emit('pointerdown', {
      x: startBtn!.x, y: startBtn!.y, worldX: startBtn!.x, worldY: startBtn!.y,
    });
    await waitForTutorialOverlay(15_000);
  });

  afterEach(async () => {
    await destroyGame(game);
    game = null;
  });

  it('T6: End Turn advances to T7 (day 2 placement step)', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await clickOverlayButtonByText('Next >'); // T1 -> T2
    await clickOverlayButtonByText('Next >'); // T2 -> T3
    await clickRequiredBusinessCard(scene);  // T3 -> T4
    await waitForOverlayVisible(5_000);
    await clickOverlayButtonByText('Next >'); // T4 -> T5
    await waitForOverlayVisible(5_000);
    await clickOverlayButtonByText('Next >'); // T5 -> T6
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(5); // T6 End Turn
    await clickEndTurn(scene);
    await waitForOverlayVisible(10_000);
    expect(getStepIndex(scene)).toBe(6); // T7 Place the Laundromat
    await saveScreenshot('t6-t7');
  }, 30_000);

  it('T7: Place the Laundromat at LISTED cost advances to T8', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT7(scene);
    expect(getStepIndex(scene)).toBe(6);
    // The Laundromat waited in hand overnight: placing it today costs the
    // LISTED $4 (plan-ahead, CG-0MT53NXGZ004H5AE) — no same-day premium.
    const s = scene as any;
    const coinsBefore = s.state.resourceBank.coins;
    await clickStreetSlot(scene, 0);
    await new Promise((r) => setTimeout(r, 500));
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(7); // T8 Investments
    // Listed-cost deduction (400, CG-0MTIO1M15001E9Y6 ×100), not 600 same-day premium.
    expect(s.state.resourceBank.coins).toBe(coinsBefore - 400);
    await saveScreenshot('t7-t8');
  }, 30_000);
});