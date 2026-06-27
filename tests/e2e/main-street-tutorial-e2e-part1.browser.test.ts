/**
 * Main Street Tutorial E2E browser test — Part 1 (Tests 1-6).
 *
 * Runs 6 tutorial tests. Stays under Phaser 4 RC's ~8-cycle game
 * create/destroy limit per browser process. Part 2 runs in a
 * separate vitest invocation with its own fresh browser process.
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

  it('Tutorial uses scenario: market cards match STANDARD_TUTORIAL_SCENARIO', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    expect(getStepIndex(scene)).toBe(0);
    const s = scene as any;
    const devCards = s.state?.market?.development;
    expect(devCards).toBeTruthy();
    expect(devCards.length).toBe(4);
    expect(devCards[0].id).toBe('biz-bakery-0');
    const investments = s.state?.market?.investments;
    const grandOpening = investments?.find((c: any) => c.name === 'Grand Opening Sale');
    expect(grandOpening).toBeTruthy();
    expect(grandOpening.cost).toBe(2);
  }, 30_000);

  it('T1: Welcome shows and advances to T2', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    expect(getStepIndex(scene)).toBe(0);
    await clickOverlayButtonByText('Next >');
    await waitForOverlayVisible();
    expect(getStepIndex(scene)).toBe(1);
    await saveScreenshot('t1-t2');
  }, 30_000);

  it('T2: HUD advances to T3', async () => {
    await clickOverlayButtonByText('Next >');
    await clickOverlayButtonByText('Next >');
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    expect(getStepIndex(scene)).toBe(2);
    await saveScreenshot('t2-t3');
  }, 30_000);

  it('T3: Select correct business card advances to T4', async () => {
    await clickOverlayButtonByText('Next >');
    await clickOverlayButtonByText('Next >');
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    expect(getStepIndex(scene)).toBe(2);
    clickRequiredBusinessCard(scene);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(3);
    await saveScreenshot('t3-t4');
  }, 30_000);

  it('T3: Clicking wrong card shows error and does not advance', async () => {
    await clickOverlayButtonByText('Next >');
    await clickOverlayButtonByText('Next >');
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    expect(getStepIndex(scene)).toBe(2);
    const s = scene as any;
    const wrongCard = s.state.market.development[0];
    if (s.uiPhase !== 'market') { s.uiPhase = 'market'; }
    try { s.onBusinessCardClick(wrongCard); } catch (_) { /* ignore */ }
    expect(getStepIndex(scene)).toBe(2);
    const instructionText = s.instructionText?.text ?? '';
    expect(instructionText).toContain('not the card you should buy');
    clickRequiredBusinessCard(scene);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(3);
    await saveScreenshot('t3-wrong-card');
  }, 30_000);

  it('T4: Place business on street advances to T5', async () => {
    await clickOverlayButtonByText('Next >');
    await clickOverlayButtonByText('Next >');
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    clickRequiredBusinessCard(scene);
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(3);
    clickStreetSlot(scene, 0);
    await new Promise((r) => setTimeout(r, 500));
    await waitForOverlayVisible(5_000);
    expect(getStepIndex(scene)).toBe(4);
    await saveScreenshot('t4-t5');
  }, 30_000);
});
