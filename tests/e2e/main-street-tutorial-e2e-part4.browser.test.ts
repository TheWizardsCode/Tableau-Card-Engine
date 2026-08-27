/**
 * Main Street Tutorial E2E test — T10: End this turn (day 2→3) → T11: Move
 * the Bookshop to hand → T12: Costs and Reputation.
 *
 * The two-turn plan-ahead flow (CG-0MT53NXGZ004H5AE): the Bookshop is moved
 * to hand on day 3 (split 1), and will be placed at LISTED cost on day 4
 * (T15, in Part 5). No same-day composite buy-and-place step exists here.
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
  await clickRequiredBusinessCard(scene);  // T3 move Laundromat -> T4
  await waitForOverlayVisible(5_000);
  await clickOverlayButtonByText('Next >'); // T4 -> T5
  await waitForOverlayVisible(5_000);
  await clickOverlayButtonByText('Next >'); // T5 -> T6
  await waitForOverlayVisible(5_000);
  await clickEndTurn(scene);               // T6 -> T7
  await waitForOverlayVisible(10_000);
  await clickStreetSlot(scene, 0);         // T7 place Laundromat -> T8
  await new Promise((r) => setTimeout(r, 500));
  await waitForOverlayVisible(5_000);
  await clickOverlayButtonByText('Next >'); // T8 -> T9
  await waitForOverlayVisible(5_000);
  await clickRequiredEventCard(scene);    // T9 buy Local Festival -> T10
  await waitForOverlayVisible(5_000);
}

describe('Main Street Tutorial E2E — T10-T12', () => {
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

  it('T10: End this turn advances to T11 (Move the Bookshop to hand)', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT10(scene);
    expect(getStepIndex(scene)).toBe(9); // T10
    const s = scene as any;
    const coinsBefore = s.state.resourceBank.coins;
    await clickEndTurn(scene);
    await waitForOverlayVisible(10_000);
    expect(getStepIndex(scene)).toBe(10); // T11 Move the Bookshop to hand
    // End-turn income arrives; the balance never dips below zero.
    expect(s.state.resourceBank.coins).toBeGreaterThan(0);
    expect(s.state.resourceBank.coins).toBeGreaterThanOrEqual(coinsBefore - 2);
    await saveScreenshot('t10-t11');
  }, 30_000);

  it('T11: Move the Bookshop to hand completes on the pickup (no same-turn placement)', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT10(scene);
    await clickEndTurn(scene);            // T10 -> T11
    await waitForOverlayVisible(10_000);
    expect(getStepIndex(scene)).toBe(10);

    // Split 1/2: moving the Bookshop to hand completes the step; there is
    // no composite drop. The Bookshop is now in hand, awaiting day 4.
    await clickRequiredBusinessCard(scene);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(11); // T12 Costs and Reputation
    const s = scene as any;
    expect(s.state.hand.some((c: any) => c.id.startsWith('biz-bookshop'))).toBe(true);
    await saveScreenshot('t11-t12');
  }, 30_000);
});