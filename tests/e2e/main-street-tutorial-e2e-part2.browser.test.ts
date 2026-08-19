/**
 * Main Street Tutorial E2E browser test — Part 2 (Tests 7-8).
 *
 * Walks the new 17-step tutorial flow: T6 Upcoming Incidents → T7 End Turn.
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

/** Walk the tutorial from T1 through the T5 place step (arrives on T6). */
async function walkToT6(scene: Phaser.Scene): Promise<void> {
  await clickOverlayButtonByText('Next >'); // T1 -> T2
  await clickOverlayButtonByText('Next >'); // T2 -> T3
  await clickRequiredBusinessCard(scene);  // T3 buy Laundromat -> T4
  await waitForOverlayVisible(5_000);
  await clickOverlayButtonByText('Next >'); // T4 -> T5
  await waitForOverlayVisible(5_000);
  await clickStreetSlot(scene, 0);  // T5 place -> T6
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

  it('T6: Incident queue advances to T7', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT6(scene);
    expect(getStepIndex(scene)).toBe(5); // T6 Upcoming Incidents
    await clickOverlayButtonByText('Next >');
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(6); // T7 End Turn
    await saveScreenshot('t6-t7');
  }, 30_000);

  it('T7: End turn advances to T8', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT6(scene);
    await clickOverlayButtonByText('Next >'); // T6 -> T7
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(6);
    await clickEndTurn(scene);
    await waitForOverlayVisible(10_000);
    expect(getStepIndex(scene)).toBe(7); // T8 Investments
    await saveScreenshot('t7-t8');
  }, 30_000);
});
