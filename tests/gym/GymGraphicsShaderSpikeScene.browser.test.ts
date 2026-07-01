/**
 * GymGraphicsShaderSpikeScene browser integration tests.
 *
 * Validates that:
 *  - The status line displays the correct initial tint and blend mode.
 *  - The status line updates when tint or blend mode changes.
 *  - The event log continues to update correctly (no regression).
 *  - The status line content matches the actual applied tint/blend state.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { GymGraphicsShaderSpikeScene } from '../../example-games/gym/scenes/GymGraphicsShaderSpikeScene';
import { GYM_GRAPHICS_SHADER_SPIKE_KEY } from '../../example-games/gym/GymRegistry';
import { waitForScene } from '../helpers/waitForScene';

describe('GymGraphicsShaderSpikeScene browser integration', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  /**
   * Bootstrap the scene for each test.
   */
  async function bootScene(): Promise<Phaser.Scene> {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [GymGraphicsShaderSpikeScene],
    });

    await waitForScene(game, GYM_GRAPHICS_SHADER_SPIKE_KEY);
    const scene = game.scene.getScene(GYM_GRAPHICS_SHADER_SPIKE_KEY);
    expect(scene).toBeTruthy();
    expect(scene.sys.isActive()).toBe(true);
    return scene;
  }

  /**
   * Find a text object in the scene by exact text match.
   */
  function findText(scene: Phaser.Scene, text: string): Phaser.GameObjects.Text | null {
    return (
      scene.children.list.find(
        (child): child is Phaser.GameObjects.Text =>
          child instanceof Phaser.GameObjects.Text && child.text === text,
      ) ?? null
    );
  }

  /**
   * Find a text object containing a substring.
   */
  function findTextContaining(scene: Phaser.Scene, substring: string): Phaser.GameObjects.Text | null {
    return (
      scene.children.list.find(
        (child): child is Phaser.GameObjects.Text =>
          child instanceof Phaser.GameObjects.Text && child.text.includes(substring),
      ) ?? null
    );
  }

  // ── AC 1: Initial status line shows correct defaults ────────

  it('status line shows initial Blend: NORMAL and Tint: None (AC 1)', async () => {
    const scene = await bootScene();

    const statusLine = findTextContaining(scene, 'Blend:');
    expect(statusLine).toBeTruthy();
    expect(statusLine!.text).toContain('NORMAL');
    expect(statusLine!.text).toContain('None');
  });

  // ── AC 2: Status line updates on tint cycle ─────────────────

  it('status line updates when cycling tint (AC 2)', async () => {
    const scene = await bootScene();

    // Find the [ Next Tint ] button and click it
    const nextTintBtn = findText(scene, '[ Next Tint ]');
    expect(nextTintBtn).toBeTruthy();
    nextTintBtn!.emit('pointerdown');

    // After one click we should have 'Red'
    const statusLine = findTextContaining(scene, 'Tint:');
    expect(statusLine).toBeTruthy();
    expect(statusLine!.text).toContain('Red');
  });

  // ── AC 2: Status line updates on blend mode cycle ──────────

  it('status line updates when cycling blend mode (AC 2)', async () => {
    const scene = await bootScene();

    // Click [ Next Blend ] button
    const nextBlendBtn = findText(scene, '[ Next Blend ]');
    expect(nextBlendBtn).toBeTruthy();
    nextBlendBtn!.emit('pointerdown');

    // After one click we should have ADD
    const statusLine = findTextContaining(scene, 'Blend:');
    expect(statusLine).toBeTruthy();
    expect(statusLine!.text).toContain('ADD');
  });

  // ── AC 2: Status line updates on reset tint ────────────────

  it('status line updates when resetting tint (AC 2)', async () => {
    const scene = await bootScene();

    // First cycle to a non-default tint
    const nextTintBtn = findText(scene, '[ Next Tint ]');
    expect(nextTintBtn).toBeTruthy();
    nextTintBtn!.emit('pointerdown');

    let statusLine = findTextContaining(scene, 'Tint:');
    expect(statusLine).toBeTruthy();
    expect(statusLine!.text).toContain('Red');

    // Now reset tint
    const resetTintBtn = findText(scene, '[ Reset Tint ]');
    expect(resetTintBtn).toBeTruthy();
    resetTintBtn!.emit('pointerdown');

    // Status should be back to 'None'
    statusLine = findTextContaining(scene, 'Tint:');
    expect(statusLine).toBeTruthy();
    expect(statusLine!.text).toContain('None');
  });

  // ── AC 3: Event log continues to work ──────────────────────

  it('event log updates correctly on tint/blend changes (AC 3, 4)', async () => {
    const scene = await bootScene();

    // The event log section has a header text that should be present
    const logHeader = findTextContaining(scene, 'Event Log');
    expect(logHeader).toBeTruthy();

    // Click Next Tint - should produce a log entry
    const nextTintBtn = findText(scene, '[ Next Tint ]');
    expect(nextTintBtn).toBeTruthy();
    nextTintBtn!.emit('pointerdown');

    // The event log should contain a tint-related entry
    const tintLog = findTextContaining(scene, 'Tint: Red');
    expect(tintLog).toBeTruthy();

    // Click Next Blend - should produce a log entry
    const nextBlendBtn = findText(scene, '[ Next Blend ]');
    expect(nextBlendBtn).toBeTruthy();
    nextBlendBtn!.emit('pointerdown');

    // The event log should contain a blend-related entry
    const blendLog = findTextContaining(scene, 'Blend: ADD');
    expect(blendLog).toBeTruthy();

    // Click Reset Tint - should produce a log entry
    const resetTintBtn = findText(scene, '[ Reset Tint ]');
    expect(resetTintBtn).toBeTruthy();
    resetTintBtn!.emit('pointerdown');

    // The event log should contain a reset entry
    const resetLog = findTextContaining(scene, 'Tint reset');
    expect(resetLog).toBeTruthy();
  });

  // ── AC 4: Status line content matches actual applied state ──

  it('status line reflects combined tint and blend state (AC 4)', async () => {
    const scene = await bootScene();

    // Cycle tint twice: None(0) -> Red(1) -> Green(2)
    const nextTintBtn = findText(scene, '[ Next Tint ]');
    expect(nextTintBtn).toBeTruthy();
    nextTintBtn!.emit('pointerdown');
    nextTintBtn!.emit('pointerdown');

    // Cycle blend once: NORMAL(0) -> ADD(1)
    const nextBlendBtn = findText(scene, '[ Next Blend ]');
    expect(nextBlendBtn).toBeTruthy();
    nextBlendBtn!.emit('pointerdown');

    // Status line should reflect both changes
    const statusLine = findTextContaining(scene, 'Blend:');
    expect(statusLine).toBeTruthy();
    expect(statusLine!.text).toContain('ADD');
    expect(statusLine!.text).toContain('Green');
  });
});
