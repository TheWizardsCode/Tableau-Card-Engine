/**
 * Main Street Tutorial E2E test — T20 Triggering Events → T23 Tutorial Complete.
 *
 * Walks the finale of the 23-step two-turn tutorial (CG-0MT53NXGZ004H5AE):
 * after building the Library (T19), the player plays the held Local Festival
 * from the hand (T20, play-event gate), then confirms Success and Failure
 * (T21), Challenges (T22), and completes (T23) with the "Let's play!" button.
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

/** Walk from T1 to the end of T19 (arrives on T20 Triggering Events). */
async function walkToT20(scene: Phaser.Scene): Promise<void> {
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
  await clickOverlayButtonByText('Next >'); // T8 -> T9
  await waitForOverlayVisible(5_000);
  await clickRequiredEventCard(scene);   // T9 buy Local Festival -> T10
  await waitForOverlayVisible(5_000);
  await clickEndTurn(scene);              // T10 end -> T11
  await waitForOverlayVisible(10_000);
  await clickRequiredBusinessCard(scene); // T11 move Bookshop -> T12
  await waitForOverlayVisible(5_000);
  await clickOverlayButtonByText('Next >'); // T12 -> T13
  await waitForOverlayVisible(5_000);
  await clickCommunityFavour(scene);       // T13 -> T14
  await waitForOverlayVisible(5_000);
  await clickEndTurn(scene);               // T14 -> T15
  await waitForOverlayVisible(10_000);
  await clickStreetSlot(scene, 1);         // T15 place Bookshop -> T16
  await waitForOverlayVisible(5_000);
  await clickEndTurn(scene);               // T16 -> T17
  await waitForOverlayVisible(10_000);
  await clickRequiredBusinessCard(scene);  // T17 move Library -> T18
  await waitForOverlayVisible(5_000);
  await clickEndTurn(scene);               // T18 -> T19
  await waitForOverlayVisible(10_000);
  await clickStreetSlot(scene, 2);         // T19 place Library -> T20
  await waitForOverlayVisible(5_000);
}

describe('Main Street Tutorial E2E — T20-T23', () => {
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

  it('T20: Triggering Events — play the held Local Festival from the hand', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT20(scene);
    expect(getStepIndex(scene)).toBe(19); // T20

    // The held event (Local Festival) is in the hand
    const s = scene as any;
    const heldEvent = s.state.hand.find((c: any) => c.family === 'event');
    expect(heldEvent).toBeTruthy();

    await clickPlayHeldEvent(scene);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(20); // T21 Success and Failure
    await saveScreenshot('t20-t21');
  }, 60_000);

  it('T21-T23: Success and Failure, Challenges, and Tutorial Complete ("Let\'s play!")', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT20(scene);
    await clickPlayHeldEvent(scene);             // T20 -> T21
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(20);
    await clickOverlayButtonByText('Next >'); // T21 -> T22
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(21);
    await clickOverlayButtonByText('Next >'); // T22 -> T23
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(22);
    await saveScreenshot('t22-t23');
    // The completion button is now "Let's play!"
    await clickOverlayButtonByText('Let\'s play!');
    await new Promise((r) => setTimeout(r, 500));
    const finalOverlay = getOverlay();
    expect(finalOverlay).toBeFalsy();
    await saveScreenshot('tutorial-complete');
  }, 60_000);
});