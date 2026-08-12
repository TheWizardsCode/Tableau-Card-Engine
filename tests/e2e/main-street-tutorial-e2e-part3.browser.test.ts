/**
 * Main Street Tutorial E2E test — Coin Budget + T8 Investments → T9 Buy Local Festival.
 *
 * Verifies the 16-coin starting budget and walks T8 (Investments, confirm) and
 * T9 (Buy the Local Festival, buy-event gate with requiredCardId evt-festival-0).
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

/** Walk from T1 to the end of T7 (arrives on T8). */
async function walkToT8(scene: Phaser.Scene): Promise<void> {
  await clickOverlayButtonByText('Next >'); // T1 -> T2
  await clickOverlayButtonByText('Next >'); // T2 -> T3
  await clickRequiredBusinessCard(scene);  // T3 buy Laundromat -> T4
  await waitForOverlayVisible(5_000);
  await clickOverlayButtonByText('Next >'); // T4 -> T5
  await waitForOverlayVisible(5_000);
  await clickStreetSlot(scene, 0);  // T5 place -> T6
  await new Promise((r) => setTimeout(r, 500));
  await waitForOverlayVisible(5_000);
  await clickOverlayButtonByText('Next >'); // T6 -> T7
  await waitForOverlayVisible(5_000);
  await clickEndTurn(scene);               // T7 end turn -> T8
  await waitForOverlayVisible(10_000);
}

describe('Main Street Tutorial E2E — Coin Budget (16 coins)', () => {
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

  it('starts with 16 coins and the Laundromat is affordable', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    const s = scene as any;
    // 16 coins (raised from the 12-coin Easy preset for the 4-card flow)
    expect(s.state?.resourceBank?.coins).toBe(16);
    const laundromat = s.state.market.development.find((c: any) => c.id.startsWith('biz-laundromat'));
    expect(laundromat).toBeTruthy();
    expect(laundromat.cost).toBeLessThanOrEqual(4);
  }, 30_000);

  it('T8: Investments (confirm) advances to T9', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT8(scene);
    expect(getStepIndex(scene)).toBe(7); // T8 Investments
    await clickOverlayButtonByText('Next >');
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(8); // T9 Buy the Local Festival
    await saveScreenshotForPart3(scene, 't8-t9');
  }, 30_000);

  it('T9: Buy the Local Festival advances to T10', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT8(scene);
    await clickOverlayButtonByText('Next >'); // T8 -> T9
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(8);
    await clickRequiredEventCard(scene);          // T9 buy Local Festival -> T10
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(9);
    await saveScreenshotForPart3(scene, 't9-t10');
  }, 30_000);
});

/** Reuse the standard screenshot helper with the part-3 screenshot dir. */
import { saveScreenshot } from '../helpers/main-street-tutorial-e2e';
async function saveScreenshotForPart3(_scene: Phaser.Scene, name: string): Promise<void> {
  await saveScreenshot(name);
}
