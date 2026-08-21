/**
 * Main Street Tutorial E2E test — T11: End this turn, T12: Costs and
 * Reputation (informative), T13: Community Favour (rep→coins exchange,
 * CG-0MSTOATDQ005XDET), T14: Build a Library (synergy buy-and-place).
 *
 * Walks the new flow: after the buy-and-place (T10), the player ends the turn
 * (T11), confirms the informative Library step (T12), uses Community Favour
 * to convert reputation into coins (T13), then buys the Library (cs-library)
 * from the dev row and places it next to the Bookshop (T14).
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

/** Walk from T1 to the end of T10 (arrives on T11). */
async function walkToT11(scene: Phaser.Scene): Promise<void> {
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
}

describe('Main Street Tutorial E2E — T11-T14', () => {
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

  it('T11: End this turn advances to T12, then Next advances to T13', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT11(scene);
    expect(getStepIndex(scene)).toBe(10); // T11 End this turn
    await clickEndTurn(scene);
    await waitForOverlayVisible(10_000);
    // T12 is now the informative Costs and Reputation step (confirm gate).
    expect(getStepIndex(scene)).toBe(11); // T12 Costs and Reputation
    await clickOverlayButtonByText('Next >'); // T12 -> T13
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(12); // T13 Community Favour
    await saveScreenshot('t11-t13');
  }, 30_000);

  it('T13: Community Favour rep→coins exchange advances to T14', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    const s = scene as any;
    await walkToT11(scene);
    await clickEndTurn(scene);
    await waitForOverlayVisible(10_000);
    expect(getStepIndex(scene)).toBe(11); // T12 (informative)
    await clickOverlayButtonByText('Next >'); // T12 -> T13
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(12); // T13 Community Favour

    const coinsBefore = s.state.resourceBank.coins;
    const repBefore = s.state.resourceBank.reputation;
    await clickCommunityFavour(scene);
    await waitForOverlayVisible(5_000);

    // The exchange spent 2 rep and gained 3 coins; the gate is spent.
    expect(s.state.favourUsedThisTurn).toBe(true);
    expect(s.state.resourceBank.coins).toBe(coinsBefore + 3);
    expect(s.state.resourceBank.reputation).toBe(repBefore - 2);
    // Now the Library ($7) is affordable.
    expect(getStepIndex(scene)).toBe(13); // T14 Build a Library
    await saveScreenshot('t13-favour-t14');
  }, 30_000);

  it('T14: Build a Library — buy then place next to the Bookshop advances to T15', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT11(scene);
    await clickEndTurn(scene);
    await waitForOverlayVisible(10_000);
    expect(getStepIndex(scene)).toBe(11); // T12 (informative)
    await clickOverlayButtonByText('Next >'); // T12 -> T13
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(12);
    await clickCommunityFavour(scene); // T13 -> T14
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(13);

    // Verify the Library is on the single market row (forced in by the
    // day-start tutorial market-guarantee hook, CG-0MSTOATDT009BRX2).
    const s = scene as any;
    const library = s.state.market.cards.find((c: any) => c.id.startsWith('cs-library'));
    expect(library).toBeTruthy();

    // T14 is a composite buy-and-place step: buying the Library to hand
    // keeps the step active (no more click-to-buy soft-lock advance).
    await clickRequiredBusinessCard(scene);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(13); // still T14
    expect(s.state.hand.some((c: any) => c.id.startsWith('cs-library'))).toBe(true);

    // Place the Library next to the Bookshop (slot 1 from T10 → slot 2 is
    // its orthogonal neighbor; non-adjacent slots are rejected during T14).
    await clickStreetSlot(scene, 2);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(14); // T15 Triggering Events
    expect(s.state.streetGrid[2]?.id.startsWith('cs-library')).toBe(true);
    await saveScreenshot('t14-t15');
  }, 30_000);

  it('T14: diagonal placement next to the Bookshop is accepted (8-way adjacency)', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT11(scene);
    await clickEndTurn(scene);
    await waitForOverlayVisible(10_000);
    expect(getStepIndex(scene)).toBe(11); // T12 (informative)
    await clickOverlayButtonByText('Next >'); // T12 -> T13
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(12);
    await clickCommunityFavour(scene); // T13 -> T14
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(13);

    const s = scene as any;
    const library = s.state.market.cards.find((c: any) => c.id.startsWith('cs-library'));
    expect(library).toBeTruthy();

    await clickRequiredBusinessCard(scene);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(13); // still T14
    expect(s.state.hand.some((c: any) => c.id.startsWith('cs-library'))).toBe(true);

    // Bookshop is at slot 1 (from T10). Slot 5 is diagonal (row 1, col 0) —
    // Chebyshev distance 1, so the 8-way "next to" rule accepts it.
    await clickStreetSlot(scene, 5);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(14); // T15 Triggering Events
    expect(s.state.streetGrid[5]?.id.startsWith('cs-library')).toBe(true);
    await saveScreenshot('t14-diagonal-t15');
  }, 30_000);

  it('T14: non-adjacent placement is rejected with feedback and does not soft-lock', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await walkToT11(scene);
    await clickEndTurn(scene);
    await waitForOverlayVisible(10_000);
    expect(getStepIndex(scene)).toBe(11); // T12 (informative)
    await clickOverlayButtonByText('Next >'); // T12 -> T13
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(12);
    await clickCommunityFavour(scene); // T13 -> T14
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(13);

    const s = scene as any;
    await clickRequiredBusinessCard(scene);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(13); // still T14
    expect(s.state.hand.some((c: any) => c.id.startsWith('cs-library'))).toBe(true);

    // Bookshop is at slot 1 (from T10). Slot 4 is EMPTY but neither
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
    // hand, and the tutorial is still on T14 so the player can retry.
    expect(s.state.streetGrid[4]).toBeNull();
    expect(s.state.hand.some((c: any) => c.id.startsWith('cs-library'))).toBe(true);
    expect(getStepIndex(scene)).toBe(13);

    // Retry on a valid DIAGONAL slot (7, Chebyshev neighbour of slot 1)
    // completes T14 — proving the rejection did not break the flow.
    await clickStreetSlot(scene, 7);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(14); // T15 Triggering Events
    expect(s.state.streetGrid[7]?.id.startsWith('cs-library')).toBe(true);
    await saveScreenshot('t14-reject-retry');
  }, 30_000);
});
