/**
 * Main Street Tutorial E2E test — T7: Buy Event Card.
 *
 * Standalone file with a single test to avoid Phaser 4 RC resource
 * exhaustion from multiple game create/destroy cycles.
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
  clickRequiredEventCard,
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

describe('Main Street Tutorial E2E — T7', () => {
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

  it('T7: Buy event card advances to T8', async () => {
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
    clickRequiredEventCard(scene);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(7);
    await saveScreenshot('t7-t8');
  }, 30_000);
});
