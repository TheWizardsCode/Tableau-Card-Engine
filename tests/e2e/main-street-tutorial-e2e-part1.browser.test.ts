/**
 * Main Street Tutorial E2E browser test — Part 1 (Tests 1-6).
 *
 * Walks the new 17-step tutorial flow (CG-0MSKSJ9SS0069ZWT):
 * T1 Welcome → T2 Development Row → T3 Buy the Laundromat → T4 Your Hand.
 *
 * Stays under Phaser 4 RC's ~8-cycle game create/destroy limit per browser
 * process. Later parts run in separate vitest invocations with fresh browsers.
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
  clickStreetSlot,
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

describe('Main Street Tutorial E2E — Part 1', () => {
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

  it('Tutorial uses scenario: market cards match STANDARD_TUTORIAL_SCENARIO (16 coins)', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    expect(getStepIndex(scene)).toBe(0);
    const s = scene as any;
    // Single market row (CG-0MSTOATDT009BRX2): all three cards share one row.
    const marketCards = s.state?.market?.cards;
    expect(marketCards).toBeTruthy();
    expect(marketCards.length).toBe(3);
    expect(marketCards[0].id).toBe('biz-bakery-0');
    expect(s.state.resourceBank.coins).toBe(16);
    const localFestival = marketCards.find((c: any) => c.name === 'Local Festival');
    expect(localFestival).toBeTruthy();
    expect(localFestival.cost).toBe(3);
  }, 30_000);

  it('T1: Welcome shows and advances to T2', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    expect(getStepIndex(scene)).toBe(0);
    await clickOverlayButtonByText('Next >');
    await waitForOverlayVisible();
    expect(getStepIndex(scene)).toBe(1);
    await saveScreenshot('t1-t2');
  }, 30_000);

  it('T2: Development Row advances to T3', async () => {
    await clickOverlayButtonByText('Next >');
    await clickOverlayButtonByText('Next >');
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    expect(getStepIndex(scene)).toBe(2);
    await saveScreenshot('t2-t3');
  }, 30_000);

  it('T3: Select correct business card (Laundromat) advances to T4', async () => {
    await clickOverlayButtonByText('Next >');
    await clickOverlayButtonByText('Next >');
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    expect(getStepIndex(scene)).toBe(2);
    await clickRequiredBusinessCard(scene);
    await waitForOverlayVisible(5_000);
    // T3 select-business → T4 Your Hand (confirm)
    expect(getStepIndex(scene)).toBe(3);
    await saveScreenshot('t3-t4');
  }, 30_000);

  it('T3: Clicking wrong card shows error and does not advance', async () => {
    await clickOverlayButtonByText('Next >');
    await clickOverlayButtonByText('Next >');
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    expect(getStepIndex(scene)).toBe(2);
    const s = scene as any;
    const wrongCard = s.state.market.cards[0]; // Bakery — not the Laundromat
    if (s.uiPhase !== 'market') { s.uiPhase = 'market'; }
    try { s.onBusinessCardClick(wrongCard); } catch (_) { /* ignore */ }
    expect(getStepIndex(scene)).toBe(2);
    const instructionText = s.instructionText?.text ?? '';
    expect(instructionText).toContain('not the card you should buy');
    await clickRequiredBusinessCard(scene);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(3);
    await saveScreenshot('t3-wrong-card');
  }, 30_000);

  it('T4: Your Hand advances to T5 on Next', async () => {
    await clickOverlayButtonByText('Next >');
    await clickOverlayButtonByText('Next >');
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await clickRequiredBusinessCard(scene);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(3);
    await clickOverlayButtonByText('Next >');
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(4);
    await saveScreenshot('t4-t5');
  }, 30_000);

  it('T5: Place business on street advances to T6', async () => {
    await clickOverlayButtonByText('Next >');
    await clickOverlayButtonByText('Next >');
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await clickRequiredBusinessCard(scene);
    await waitForOverlayVisible(5_000);
    await clickOverlayButtonByText('Next >');
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(4);
    await clickStreetSlot(scene, 0);
    await new Promise((r) => setTimeout(r, 500));
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(5);
    await saveScreenshot('t5-t6');
  }, 30_000);
});
