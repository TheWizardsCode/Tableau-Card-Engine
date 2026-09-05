/**
 * Main Street Tutorial E2E test — T13: Community Favour → T14: End this turn
 * → T15: Place the Bookshop (listed cost) → T16: End this turn → T17: Move
 * the Library to hand → T18: End this turn → T19: Build a Library next to
 * the Bookshop (synergy, listed cost).
 *
 * Walks the second half of the two-turn plan-ahead flow
 * (CG-0MT53NXGZ004H5AE): the Bookshop is placed at listed cost the day
 * after its move, and the Library gets the same two-turn treatment.
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
  clickStreetSlotExpectRejected,
  clickEndTurn,
  clickCommunityFavour,
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

/** Walk from T1 to the end of T12 (arrives on T13 Community Favour). */
async function walkToT13(scene: Phaser.Scene): Promise<void> {
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
}

describe('Main Street Tutorial E2E — T13-T19', () => {
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

  it('T13: Community Favour rep→coins exchange advances to T14', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    const s = scene as any;
    await walkToT13(scene);
    expect(getStepIndex(scene)).toBe(12); // T13 Community Favour

    const coinsBefore = s.state.resourceBank.coins;
    const repBefore = s.state.resourceBank.reputation;
    await clickCommunityFavour(scene);
    await waitForOverlayVisible(5_000);

    // The exchange spent 2 rep and gained 3 coins; the gate is spent.
    expect(s.state.favourUsedThisTurn).toBe(true);
    expect(s.state.resourceBank.coins).toBe(coinsBefore + 300);
    expect(s.state.resourceBank.reputation).toBe(repBefore - 200);
    expect(getStepIndex(scene)).toBe(13); // T14 End this turn
    await saveScreenshot('t13-favour-t14');
  }, 30_000);

  it('T14→T18: End turns and placements keep the Budget positive; T15 places the Bookshop at listed cost', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    const s = scene as any;
    await walkToT13(scene);
    expect(getStepIndex(scene)).toBe(12);
    await clickCommunityFavour(scene); // T13 -> T14
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(13);

    await clickEndTurn(scene);         // T14 end day 3 -> T15
    await waitForOverlayVisible(10_000);
    expect(getStepIndex(scene)).toBe(14); // T15 Place the Bookshop

    // T15: place the held Bookshop at LISTED 300 (×100, plan-ahead, not premium).
    const coinsBeforeB = s.state.resourceBank.coins;
    await clickStreetSlot(scene, 1);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(15); // T16 End this turn
    expect(s.state.streetGrid[1]?.id.startsWith('biz-bookshop')).toBe(true);
    expect(s.state.resourceBank.coins).toBe(coinsBeforeB - 300);
    await saveScreenshot('t15-place-bookshop');
  }, 30_000);

  it('T19: Build a Library — place next to the Bookshop advances to T20', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    const s = scene as any;
    await walkToT13(scene);
    await clickCommunityFavour(scene); // T13 -> T14
    await waitForOverlayVisible(5_000);
    await clickEndTurn(scene);         // T14 -> T15
    await waitForOverlayVisible(10_000);
    await clickStreetSlot(scene, 1);  // T15 place Bookshop -> T16
    await waitForOverlayVisible(5_000);
    await clickEndTurn(scene);         // T16 end day 4 -> T17
    await waitForOverlayVisible(10_000);
    expect(getStepIndex(scene)).toBe(16); // T17 Move the Library to hand
    await clickRequiredBusinessCard(scene); // T17 move Library -> T18
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(17); // T18 End this turn
    await clickEndTurn(scene);         // T18 end day 5 -> T19
    await waitForOverlayVisible(10_000);
    expect(getStepIndex(scene)).toBe(18); // T19 Build a Library

    const library = s.state.market.cards.find((c: any) => c.id.startsWith('cs-library'))
      ?? s.state.hand.find((c: any) => c.id.startsWith('cs-library'));
    expect(library).toBeTruthy();

    // Place the Library next to the Bookshop (slot 1 → slot 2 orthogonal;
    // 8-way adjacency). Listed cost 700 (×100).
    const coinsBeforeL = s.state.resourceBank.coins;
    await clickStreetSlot(scene, 2);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(19); // T20 Triggering Events
    expect(s.state.streetGrid[2]?.id.startsWith('cs-library')).toBe(true);
    expect(s.state.resourceBank.coins).toBe(coinsBeforeL - 700);
    await saveScreenshot('t19-t20');
  }, 30_000);

  it('T19: diagonal placement next to the Bookshop is accepted (8-way adjacency)', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT13(scene);
    await clickCommunityFavour(scene); // T13 -> T14
    await waitForOverlayVisible(5_000);
    await clickEndTurn(scene);         // T14 -> T15
    await waitForOverlayVisible(10_000);
    await clickStreetSlot(scene, 1);  // T15 place Bookshop -> T16
    await waitForOverlayVisible(5_000);
    await clickEndTurn(scene);         // T16 -> T17
    await waitForOverlayVisible(10_000);
    await clickRequiredBusinessCard(scene); // T17 move Library -> T18
    await waitForOverlayVisible(5_000);
    await clickEndTurn(scene);         // T18 -> T19
    await waitForOverlayVisible(10_000);
    expect(getStepIndex(scene)).toBe(18);

    // Bookshop is at slot 1 (from T15). Slot 5 is diagonal (row 1, col 0) —
    // Chebyshev distance 1, so the 8-way "next to" rule accepts it.
    await clickStreetSlot(scene, 5);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(19); // T20 Triggering Events
    const s = scene as any;
    expect(s.state.streetGrid[5]?.id.startsWith('cs-library')).toBe(true);
    await saveScreenshot('t19-diagonal-t20');
  }, 30_000);

  it('T19: non-adjacent placement is rejected with feedback and does not soft-lock', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT13(scene);
    await clickCommunityFavour(scene); // T13 -> T14
    await waitForOverlayVisible(5_000);
    await clickEndTurn(scene);         // T14 -> T15
    await waitForOverlayVisible(10_000);
    await clickStreetSlot(scene, 1);  // T15 place Bookshop -> T16
    await waitForOverlayVisible(5_000);
    await clickEndTurn(scene);         // T16 -> T17
    await waitForOverlayVisible(10_000);
    await clickRequiredBusinessCard(scene); // T17 move Library -> T18
    await waitForOverlayVisible(5_000);
    await clickEndTurn(scene);         // T18 -> T19
    await waitForOverlayVisible(10_000);
    expect(getStepIndex(scene)).toBe(18);

    const s = scene as any;
    // Bookshop is at slot 1 (from T15). Slot 4 is EMPTY but neither
    // orthogonally nor diagonally adjacent (Chebyshev distance 3) — the
    // click must be rejected with the synergy-partner instruction message
    // (blocked-move feedback, CG-0MSP26K6U001PXT8 AC-2).
    expect(s.state.streetGrid[4]).toBeNull();
    await clickStreetSlotExpectRejected(scene, 4);

    // User-facing blocked-move feedback names the synergy partner card.
    const start = Date.now();
    while (
      Date.now() - start < 5_000 &&
      !String(s.instructionText?.text ?? '').includes('next to')
    ) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(String(s.instructionText?.text ?? '')).toContain('next to');

    // No soft-lock regression: the slot stays empty, the Library stays in
    // hand, and the tutorial is still on T19 so the player can retry.
    expect(s.state.streetGrid[4]).toBeNull();
    expect(s.state.hand.some((c: any) => c.id.startsWith('cs-library'))).toBe(true);
    expect(getStepIndex(scene)).toBe(18);

    // Retry on a valid DIAGONAL slot (7, Chebyshev neighbour of slot 1)
    // completes T19 — proving the rejection did not break the flow.
    await clickStreetSlot(scene, 7);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(19); // T20 Triggering Events
    expect(s.state.streetGrid[7]?.id.startsWith('cs-library')).toBe(true);
    await saveScreenshot('t19-reject-retry');
  }, 30_000);
});