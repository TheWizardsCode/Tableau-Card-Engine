/**
 * Main Street Tutorial E2E test — T23 Triggering Events → T26 Tutorial
 * Complete.
 *
 * Walks the finale of the 26-step two-turn tutorial (CG-0MT53NXGZ004H5AE
 * + CG-0MTNMBX5Z002U0MH inserted end-turns): after building the Library
 * (T21), the player ends the day (T22), plays the held Local Festival from
 * the hand (T23, play-event gate), then confirms Success and Failure (T24),
 * Challenges (T25), and completes (T26) with the "Let's play!" button.
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
  clickCommunityFavour,
  clickPlayHeldEvent,
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

/**
 * Walk from T1 to the end of T22 (arrives on T23 Triggering Events).
 * Covers the full 26-step flow including the end-turns inserted by
 * CG-0MTNMBX5Z002U0MH (T8/T14/T16/T18/T20/T22).
 */
async function walkToT23(scene: Phaser.Scene): Promise<void> {
  await clickOverlayButtonByText('Next >'); // T1 -> T2
  await clickOverlayButtonByText('Next >'); // T2 -> T3
  await clickRequiredBusinessCard(scene);  // T3 move Laundromat -> T4
  await waitForOverlayVisible(5_000);
  await clickOverlayButtonByText('Next >'); // T4 -> T5
  await waitForOverlayVisible(5_000);
  await clickOverlayButtonByText('Next >'); // T5 -> T6
  await waitForOverlayVisible(5_000);
  await clickEndTurn(scene);               // T6 end -> T7
  await waitForOverlayVisible(10_000);
  await clickStreetSlot(scene, 0);        // T7 place Laundromat -> T8
  await new Promise((r) => setTimeout(r, 500));
  await waitForOverlayVisible(5_000);
  await clickEndTurn(scene);              // T8 (inserted end-turn) -> T9
  await waitForOverlayVisible(10_000);
  await clickOverlayButtonByText('Next >'); // T9 -> T10
  await waitForOverlayVisible(5_000);
  await clickRequiredEventCard(scene);   // T10 buy Local Festival -> T11
  await waitForOverlayVisible(5_000);
  await clickEndTurn(scene);              // T11 end -> T12
  await waitForOverlayVisible(10_000);
  await clickRequiredBusinessCard(scene); // T12 move Bookshop -> T13
  await waitForOverlayVisible(5_000);
  await clickOverlayButtonByText('Next >'); // T13 Costs -> T14
  await waitForOverlayVisible(5_000);
  await clickEndTurn(scene);              // T14 (inserted end-turn) -> T15
  await waitForOverlayVisible(10_000);
  await clickCommunityFavour(scene);       // T15 -> T16
  await waitForOverlayVisible(5_000);
  await clickEndTurn(scene);               // T16 -> T17
  await waitForOverlayVisible(10_000);
  await clickStreetSlot(scene, 1);         // T17 place Bookshop -> T18
  await waitForOverlayVisible(5_000);
  await clickEndTurn(scene);               // T18 -> T19
  await waitForOverlayVisible(10_000);
  await clickRequiredBusinessCard(scene);  // T19 move Library -> T20
  await waitForOverlayVisible(5_000);
  await clickEndTurn(scene);               // T20 -> T21
  await waitForOverlayVisible(10_000);
  await clickStreetSlot(scene, 2);         // T21 place Library (next to Bookshop) -> T22
  await waitForOverlayVisible(5_000);
  await clickEndTurn(scene);               // T22 end -> T23
  await waitForOverlayVisible(10_000);
}

describe('Main Street Tutorial E2E — T23-T26', () => {
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

  it('T23: Triggering Events — play the held Local Festival from the hand', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT23(scene);
    expect(getStepIndex(scene)).toBe(22); // T23

    // The held event (Local Festival) is in the hand
    const s = scene as any;
    const heldEvent = s.state.hand.find((c: any) => c.family === 'event');
    expect(heldEvent).toBeTruthy();

    await clickPlayHeldEvent(scene);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(23); // T24 Success and Failure
    await saveScreenshot('t23-t24');
  }, 60_000);

  it('T24-T26: Success and Failure, Challenges, and Tutorial Complete ("Let\'s play!")', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT23(scene);
    await clickPlayHeldEvent(scene);             // T23 -> T24
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(23);
    await clickOverlayButtonByText('Next >'); // T24 -> T25
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(24);
    await clickOverlayButtonByText('Next >'); // T25 -> T26
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(25);
    await saveScreenshot('t25-t26');
    // The completion button is now "Let's play!"
    await clickOverlayButtonByText('Let\'s play!');
    await new Promise((r) => setTimeout(r, 500));
    const finalOverlay = getOverlay();
    expect(finalOverlay).toBeFalsy();
    await saveScreenshot('tutorial-complete');
  }, 60_000);
});
