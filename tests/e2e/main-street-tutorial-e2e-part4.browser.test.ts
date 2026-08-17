/**
 * Main Street Tutorial E2E test — T10: Optimizing for Events (buy-and-place Bookshop).
 *
 * The composite `buy-and-place` action: pickup (select-business) and drop
 * (place-business) are both allowed while T10 is active; the step completes on
 * the terminal drop. Simulated via the click-buy → click-place path (the same
 * composite gate), since Phaser input emit() does not drive the drag engine.
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

/** Walk from T1 to the end of T9 (arrives on T10). */
async function walkToT10(scene: Phaser.Scene): Promise<void> {
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
  await clickEndTurn(scene);               // T7 -> T8
  await waitForOverlayVisible(10_000);
  await clickOverlayButtonByText('Next >'); // T8 -> T9
  await waitForOverlayVisible(5_000);
  await clickRequiredEventCard(scene);  // T9 buy Local Festival -> T10
  await waitForOverlayVisible(5_000);
}

describe('Main Street Tutorial E2E — T10 Optimizing for Events', () => {
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

  it('T10: buy-and-place Bookshop completes on the place (drop) action', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT10(scene);
    expect(getStepIndex(scene)).toBe(9); // T10

    // Pickup: select the Bookshop (buy to hand). The composite gate allows
    // select-business but the step must NOT complete on pickup.
    const s = scene as any;
    const bookshop = s.state.market.cards.find((c: any) => c.id.startsWith('biz-bookshop'));
    expect(bookshop).toBeTruthy();
    await clickRequiredBusinessCard(scene); // buys the required Bookshop
    await new Promise((r) => setTimeout(r, 500));
    await waitForOverlayVisible(5_000);
    // Still on T10: pickup alone does not complete buy-and-place
    expect(getStepIndex(scene)).toBe(9);

    // Drop: place the Bookshop on an empty street slot → completes T10
    await clickStreetSlot(scene, 1);
    await new Promise((r) => setTimeout(r, 500));
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(10); // T11 End this turn
    await saveScreenshot('t10-t11');
  }, 30_000);
});
