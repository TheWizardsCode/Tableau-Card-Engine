/**
 * Main Street Tutorial E2E test — T14 Triggering Events → T17 Tutorial Complete.
 *
 * Walks the new flow: after building the Library (T13), the player plays the
 * held Local Festival from the hand (T14, play-event gate), then confirms
 * Success and Failure (T15), Challenges (T16), and completes (T17) with the
 * "Let's play!" button.
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

/** Walk from T1 to the end of T13 (arrives on T14). */
async function walkToT14(scene: Phaser.Scene): Promise<void> {
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
  await clickRequiredBusinessCard(scene);  // T3 buy Laundromat -> T4
  await new Promise((r) => setTimeout(r, 500));
  await waitForOverlayVisible(5_000);
  await clickStreetSlot(scene, 1);  // T5 place -> T6
  await new Promise((r) => setTimeout(r, 500));
  await waitForOverlayVisible(5_000);
  await clickEndTurn(scene);               // T11 -> T12 (informative)
  await waitForOverlayVisible(10_000);
  await clickOverlayButtonByText('Next >'); // T12 -> T13 (Build a Library)
  await waitForOverlayVisible(5_000);
  await clickRequiredBusinessCard(scene);  // T13 buy Library to hand (composite step stays active)
  await waitForOverlayVisible(5_000);
  await clickStreetSlot(scene, 2);         // T13 place Library next to the Bookshop (slot 1) -> T14
  await waitForOverlayVisible(5_000);
}

describe('Main Street Tutorial E2E — T14-T17', () => {
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

  it('T14: Triggering Events — play the held Local Festival from the hand', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT14(scene);
    expect(getStepIndex(scene)).toBe(13); // T14

    // The held event (Local Festival) is in the hand
    const s = scene as any;
    const heldEvent = s.state.hand.find((c: any) => c.family === 'event');
    expect(heldEvent).toBeTruthy();

    await clickPlayHeldEvent(scene);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(14); // T15 Success and Failure
    await saveScreenshot('t14-t15');
  }, 60_000);

  it('T15-T17: Success and Failure, Challenges, and Tutorial Complete ("Let\'s play!")', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT14(scene);
    await clickPlayHeldEvent(scene);             // T14 -> T15
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(14);
    await clickOverlayButtonByText('Next >'); // T15 -> T16
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(15);
    await clickOverlayButtonByText('Next >'); // T16 -> T17
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(16);
    await saveScreenshot('t16-t17');
    // The completion button is now "Let's play!"
    await clickOverlayButtonByText('Let\'s play!');
    await new Promise((r) => setTimeout(r, 500));
    const finalOverlay = getOverlay();
    expect(finalOverlay).toBeFalsy();
    await saveScreenshot('tutorial-complete');
  }, 60_000);
});
