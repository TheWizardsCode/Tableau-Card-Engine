/**
 * GymDlcUnlockScene Browser Test
 *
 * Boots GymDlcUnlockScene in a headless Phaser environment and verifies the
 * gated-content UI end-to-end (CG-0MUZGBTWW00729L4, intake AC4):
 *
 *   locked  →  verified  →  reachable  →  reset  →  locked
 *
 * It asserts the observable UI state (locked presentation visibility, content
 * reachability, gate reason and content-panel colour), not the source text.
 *
 * @module tests/gym/GymDlcUnlock.browser.test.ts
 */

import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { GymDlcUnlockScene } from '../../example-games/gym/scenes/GymDlcUnlockScene';
import { GYM_DLC_UNLOCK_KEY } from '../../example-games/gym/GymRegistry';
import { waitForScene } from '../helpers/waitForScene';

/** Locked panel fill (mirrors PANEL_FILL_LOCKED in the scene). */
const PANEL_FILL_LOCKED = 0x222233;
/** Unlocked panel fill (mirrors PANEL_FILL_UNLOCKED in the scene). */
const PANEL_FILL_UNLOCKED = 0x1f3d24;

describe('GymDlcUnlockScene browser test', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  async function bootScene(): Promise<GymDlcUnlockScene> {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [GymDlcUnlockScene],
    });

    await waitForScene(game, GYM_DLC_UNLOCK_KEY);
    const scene = game.scene.getScene(GYM_DLC_UNLOCK_KEY) as GymDlcUnlockScene;
    expect(scene).toBeTruthy();
    await scene.whenReady();
    return scene;
  }

  it('starts with the DLC content locked and the locked presentation visible (AC3)', async () => {
    const scene = await bootScene();

    expect(scene.isContentReachable()).toBe(false);
    expect(scene.isLockedPresentationVisible()).toBe(true);

    const result = scene.getLastGateResult();
    expect(result).toMatchObject({ unlocked: false, reason: 'locked' });
    expect(scene.getContentPanel().fillColor).toBe(PANEL_FILL_LOCKED);
  });

  it('refuses to open the locked content (AC3)', async () => {
    const scene = await bootScene();

    const before = scene.getEventLogEntries().length;
    scene.openBonus();

    const entries = scene.getEventLogEntries();
    expect(entries.length).toBeGreaterThan(before);
    expect(entries.some((entry) => /Refused/.test(entry))).toBe(true);
    expect(scene.isContentReachable()).toBe(false);
  });

  it('reveals the content after the action is verified (AC3/AC4)', async () => {
    const scene = await bootScene();

    await scene.verifyAction();

    expect(scene.isContentReachable()).toBe(true);
    expect(scene.isLockedPresentationVisible()).toBe(false);
    expect(scene.getLastGateResult()).toMatchObject({ unlocked: true, reason: 'unlocked' });
    expect(scene.getContentPanel().fillColor).toBe(PANEL_FILL_UNLOCKED);

    // The now-reachable content can be opened.
    const before = scene.getEventLogEntries().length;
    scene.openBonus();
    const entries = scene.getEventLogEntries();
    expect(entries.length).toBeGreaterThan(before);
    expect(entries.some((entry) => /Opened/.test(entry))).toBe(true);
  });

  it('relocks the content when verification is reset (AC3)', async () => {
    const scene = await bootScene();

    await scene.verifyAction();
    expect(scene.isContentReachable()).toBe(true);

    await scene.resetVerification();
    expect(scene.isContentReachable()).toBe(false);
    expect(scene.isLockedPresentationVisible()).toBe(true);
    expect(scene.getLastGateResult()).toMatchObject({ unlocked: false, reason: 'locked' });
    expect(scene.getContentPanel().fillColor).toBe(PANEL_FILL_LOCKED);
  });

  it('re-reads the gate when the [ Verify action ] button is clicked (AC4)', async () => {
    const scene = await bootScene();
    const before = scene.getEventLogEntries().length;

    scene.getVerifyButton().emit('pointerdown');
    // The button callback kicks off the async gate read; wait for it.
    await scene.whenReady();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(scene.isContentReachable()).toBe(true);
    expect(scene.getEventLogEntries().length).toBeGreaterThan(before);
  });
});
