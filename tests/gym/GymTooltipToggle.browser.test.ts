/**
 * GymTooltipToggle browser tests -- Verifies the Disable/Enable toggle
 * replaces the old Hide button in the Tooltip Demo gym scene.
 *
 * @module tests/gym/GymTooltipToggle.browser.test
 */

import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { GymTooltipScene } from '../../example-games/gym/scenes/GymTooltipScene';

describe('GymTooltipScene toggle button (Disable/Enable)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) {
      game.destroy(true, false);
    }
    game = null;

    const container = document.getElementById('game-container');
    if (container) {
      container.remove();
    }
  });

  /** Helper: find the toggle button by its text content. */
  function findToggleButton(
    scene: GymTooltipScene,
  ): Phaser.GameObjects.Text | undefined {
    return scene.children.list.find(
      (c) =>
        c instanceof Phaser.GameObjects.Text &&
        (c.text === '[ Disable ]' || c.text === '[ Enable ]'),
    ) as Phaser.GameObjects.Text | undefined;
  }

  /** Helper: find the tooltip status label by its name. */
  function findTooltipLabel(
    scene: GymTooltipScene,
  ): Phaser.GameObjects.Text | undefined {
    return scene.children.getByName('tooltipLabel') as
      | Phaser.GameObjects.Text
      | undefined;
  }

  function bootScene(): Promise<GymTooltipScene> {
    return new Promise<GymTooltipScene>((resolve, reject) => {
      const container = document.createElement('div');
      container.id = 'game-container';
      document.body.appendChild(container);

      const scene = new GymTooltipScene();
      game = new Phaser.Game({
        type: Phaser.CANVAS,
        width: 800,
        height: 600,
        parent: 'game-container',
        scene: [scene],
      });

      // Listen for when the scene finishes its create()
      scene.events.once('postcreate', () => {
        resolve(scene);
      });

      // Fallback: wait for the Phaser ready event
      game.events.once('ready', () => {
        setTimeout(() => {
          try {
            resolve(scene);
          } catch {
            // ignore if already resolved
          }
        }, 500);
      });

      setTimeout(() => reject(new Error('Scene did not boot within 5s')), 5000);
    });
  }

  it('shows a toggle button instead of a Hide button', async () => {
    const scene = await bootScene();

    const toggleButton = findToggleButton(scene);
    expect(toggleButton).toBeDefined();
    // Default state is enabled, so the button should say "[ Disable ]"
    expect(toggleButton!.text).toBe('[ Disable ]');
  }, 10000);

  it('shows a status label indicating tooltip state', async () => {
    const scene = await bootScene();

    const label = findTooltipLabel(scene);
    expect(label).toBeDefined();
    // Default state is enabled
    expect(label!.text).toBe('Tooltips: Enabled');
  }, 10000);

  it('toggles between Disable and Enable on click', async () => {
    const scene = await bootScene();

    const toggleButton = findToggleButton(scene);
    expect(toggleButton).toBeDefined();
    expect(toggleButton!.text).toBe('[ Disable ]');

    // Simulate a click on the toggle button
    toggleButton!.emit('pointerdown');

    // After toggling, it should show "[ Enable ]"
    expect(toggleButton!.text).toBe('[ Enable ]');

    // Toggle back
    toggleButton!.emit('pointerdown');
    expect(toggleButton!.text).toBe('[ Disable ]');
  }, 10000);

  it('updates the status label when toggling', async () => {
    const scene = await bootScene();

    const toggleButton = findToggleButton(scene);
    expect(toggleButton).toBeDefined();

    // Disable
    toggleButton!.emit('pointerdown');
    const labelAfterDisable = findTooltipLabel(scene);
    expect(labelAfterDisable).toBeDefined();
    expect(labelAfterDisable!.text).toBe('Tooltips: Disabled');

    // Re-enable
    toggleButton!.emit('pointerdown');
    const labelAfterEnable = findTooltipLabel(scene);
    expect(labelAfterEnable).toBeDefined();
    expect(labelAfterEnable!.text).toBe('Tooltips: Enabled');
  }, 10000);

  it('logs toggle events to the event log', async () => {
    const scene = await bootScene();

    const toggleButton = findToggleButton(scene);
    expect(toggleButton).toBeDefined();

    // Disable tooltips
    toggleButton!.emit('pointerdown');

    // Check that the event log text objects contain "disabled" event
    const logTexts = scene.children.list.filter(
      (c) =>
        c instanceof Phaser.GameObjects.Text &&
        c.text.includes('Tooltips disabled'),
    );
    expect(logTexts.length).toBeGreaterThanOrEqual(1);

    // Re-enable
    toggleButton!.emit('pointerdown');

    const enableLogTexts = scene.children.list.filter(
      (c) =>
        c instanceof Phaser.GameObjects.Text &&
        c.text.includes('Tooltips enabled'),
    );
    expect(enableLogTexts.length).toBeGreaterThanOrEqual(1);
  }, 10000);
});
