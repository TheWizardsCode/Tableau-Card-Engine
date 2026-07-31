/**
 * Main Street Tutorial E2E test — Coin Budget.
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

describe('Main Street Tutorial E2E — Coin Budget', () => {
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

  it('Tutorial walkthrough is stable end-to-end', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    const s = scene as any;
    expect(s.state?.resourceBank?.coins).toBe(12);
    await clickOverlayButtonByText('Next >');
    await clickOverlayButtonByText('Next >');
    clickRequiredBusinessCard(scene);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(3);
    clickStreetSlot(scene, 0);
    await new Promise((r) => setTimeout(r, 500));
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(4);
    await clickOverlayButtonByText('Next >');
    expect(getStepIndex(scene)).toBe(5);
    await clickEndTurn(scene);
    await waitForOverlayVisible(10_000);
    expect(getStepIndex(scene)).toBe(6);
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
    await clickOverlayButtonByText('Next >');
    expect(getStepIndex(scene)).toBe(11);
    await clickOverlayButtonByText('Next >');
    expect(getStepIndex(scene)).toBe(12);
    await clickOverlayButtonByText('Next >');
    expect(getStepIndex(scene)).toBe(13);
    await clickOverlayButtonByText('Start Full Game');
    await new Promise((r) => setTimeout(r, 500));
    const finalOverlay = getOverlay();
    expect(finalOverlay).toBeFalsy();
  }, 60_000);
});
