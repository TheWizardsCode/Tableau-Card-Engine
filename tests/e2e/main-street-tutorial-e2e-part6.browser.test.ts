/**
 * Main Street Tutorial E2E test — T10-T13: Completion.
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
  getOverlay,
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

describe('Main Street Tutorial E2E — T10-T13', () => {
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

  it('T10-T14: Challenges, Scoring, and Completion steps advance', async () => {
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
    clickRequiredBusinessCard(scene);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(8);
    clickStreetSlot(scene, 1);
    await new Promise((r) => setTimeout(r, 500));
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(9);
    await clickOverlayButtonByText('Next >');
    expect(getStepIndex(scene)).toBe(10);
    await saveScreenshot('t10-t11');
    await clickOverlayButtonByText('Next >');
    expect(getStepIndex(scene)).toBe(11);
    await saveScreenshot('t11-t12');
    await clickOverlayButtonByText('Next >');
    expect(getStepIndex(scene)).toBe(12);
    await saveScreenshot('t12-t13');
    await clickOverlayButtonByText('Next >');
    expect(getStepIndex(scene)).toBe(13);
    await saveScreenshot('t13-t14');
    await clickOverlayButtonByText('Start Full Game');
    await new Promise((r) => setTimeout(r, 500));
    const finalOverlay = getOverlay();
    expect(finalOverlay).toBeFalsy();
    await saveScreenshot('tutorial-complete');
  }, 60_000);
});
