/**
 * Main Street Tutorial E2E test — T15 Triggering Events → T18 Tutorial Complete.
 *
 * Walks the new flow: after using Community Favour (T13) and building the
 * Library (T14), the player plays the held Local Festival from the hand
 * (T15, play-event gate), then confirms Success and Failure (T16),
 * Challenges (T17), and completes (T18) with the "Let's play!" button.
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

/** Walk from T1 to the end of T14 (arrives on T15 Triggering Events). */
async function walkToT15(scene: Phaser.Scene): Promise<void> {
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
  await clickRequiredBusinessCard(scene);  // T10 buy Bookshop -> T11 (composite stays active)
  await new Promise((r) => setTimeout(r, 500));
  await waitForOverlayVisible(5_000);
  await clickStreetSlot(scene, 1);  // T10 place Bookshop -> T11
  await new Promise((r) => setTimeout(r, 500));
  await waitForOverlayVisible(5_000);
  await clickEndTurn(scene);               // T11 -> T12 (informative)
  await waitForOverlayVisible(10_000);
  await clickOverlayButtonByText('Next >'); // T12 -> T13 (Community Favour)
  await waitForOverlayVisible(5_000);
  await clickCommunityFavour(scene);       // T13 rep→coins -> T14 (Build a Library)
  await waitForOverlayVisible(5_000);
  await clickRequiredBusinessCard(scene);  // T14 buy Library to hand (composite step stays active)
  await waitForOverlayVisible(5_000);
  await clickStreetSlot(scene, 2);         // T14 place Library next to the Bookshop (slot 1) -> T15
  await waitForOverlayVisible(5_000);
}

describe('Main Street Tutorial E2E — T15-T18', () => {
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

  it('T15: Triggering Events — play the held Local Festival from the hand', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT15(scene);
    expect(getStepIndex(scene)).toBe(14); // T15

    // The held event (Local Festival) is in the hand
    const s = scene as any;
    const heldEvent = s.state.hand.find((c: any) => c.family === 'event');
    expect(heldEvent).toBeTruthy();

    await clickPlayHeldEvent(scene);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(15); // T16 Success and Failure
    await saveScreenshot('t15-t16');
  }, 60_000);

  it('T16-T18: Success and Failure, Challenges, and Tutorial Complete ("Let\'s play!")', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT15(scene);
    await clickPlayHeldEvent(scene);             // T15 -> T16
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(15);
    await clickOverlayButtonByText('Next >'); // T16 -> T17
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(16);
    await clickOverlayButtonByText('Next >'); // T17 -> T18
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(17);
    await saveScreenshot('t17-t18');
    // The completion button is now "Let's play!"
    await clickOverlayButtonByText('Let\'s play!');
    await new Promise((r) => setTimeout(r, 500));
    const finalOverlay = getOverlay();
    expect(finalOverlay).toBeFalsy();
    await saveScreenshot('tutorial-complete');
  }, 60_000);
});
