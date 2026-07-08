/**
 * Main Street Tutorial E2E browser test — Part 2 (Tests 7-8).
 *
 * Runs 2 tutorial tests. Stays well within the browser's per-process
 * canvas/WebGL context budget (~8 contexts in Chromium).
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

  it('T5: Incident queue advances to T6', async () => {
    await clickOverlayButtonByText('Next >'); await clickOverlayButtonByText('Next >');
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    clickRequiredBusinessCard(scene);
    await waitForOverlayVisible(5_000);
    clickStreetSlot(scene, 0);
    await new Promise((r) => setTimeout(r, 500));
    await waitForOverlayVisible(5_000);
    await clickOverlayButtonByText('Next >');
    expect(getStepIndex(scene)).toBe(5);
    await saveScreenshot('t5-t6');
  }, 30_000);

  it('T6: End turn advances to T7', async () => {
    await clickOverlayButtonByText('Next >'); await clickOverlayButtonByText('Next >');
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    clickRequiredBusinessCard(scene);
    await waitForOverlayVisible(5_000);
    clickStreetSlot(scene, 0);
    await new Promise((r) => setTimeout(r, 500));
    await waitForOverlayVisible(5_000);
    await clickOverlayButtonByText('Next >');
    await clickEndTurn(scene);
    await waitForOverlayVisible(10_000);
    expect(getStepIndex(scene)).toBe(6);
    await saveScreenshot('t6-t7');
  }, 30_000);
});
