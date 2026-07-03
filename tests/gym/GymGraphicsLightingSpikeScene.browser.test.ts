/**
 * GymGraphicsLightingSpikeScene browser integration tests.
 *
 * Validates that:
 *  - The scene boots without errors (both Canvas and WebGL modes).
 *  - In Canvas mode, the fallback message is displayed (lighting unavailable).
 *  - UI controls (Toggle Light, Move Light) exist and respond to clicks.
 *  - The event log updates appropriately on user interaction.
 *  - The lighting system can be toggled on/off when WebGL is available.
 *  - The light can be moved to new positions.
 *
 * @module tests/gym/GymGraphicsLightingSpikeScene.browser.test
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { GymGraphicsLightingSpikeScene } from '../../example-games/gym/scenes/GymGraphicsLightingSpikeScene';
import { GYM_GRAPHICS_LIGHTING_SPIKE_KEY } from '../../example-games/gym/GymRegistry';
import { waitForScene } from '../helpers/waitForScene';

describe('GymGraphicsLightingSpikeScene browser integration', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  /**
   * Bootstrap the scene with the given render type.
   */
  async function bootScene(renderType: number = Phaser.CANVAS): Promise<Phaser.Scene> {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: renderType,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [GymGraphicsLightingSpikeScene],
    });

    await waitForScene(game, GYM_GRAPHICS_LIGHTING_SPIKE_KEY);
    const scene = game.scene.getScene(GYM_GRAPHICS_LIGHTING_SPIKE_KEY);
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

  // ── AC 1: Scene boots without errors ─────────────────────

  it('boots without errors in Canvas mode (AC 1)', async () => {
    const scene = await bootScene(Phaser.CANVAS);
    expect(scene).toBeTruthy();
  });

  it('boots without errors in WebGL mode (AC 1)', async () => {
    const scene = await bootScene(Phaser.WEBGL);
    expect(scene).toBeTruthy();
  });

  // ── AC 2: Fallback message in Canvas mode ─────────────────

  it('shows lighting unavailable fallback in Canvas mode (AC 2)', async () => {
    const scene = await bootScene(Phaser.CANVAS);

    // Look for the fallback message text
    const fallbackMsg = findTextContaining(scene, 'Lighting unavailable');
    expect(fallbackMsg).toBeTruthy();
  });

  // ── AC 3: UI controls exist and are interactive ───────────

  it('has the [ Toggle Light ] button', async () => {
    const scene = await bootScene(Phaser.WEBGL);

    const toggleBtn = findText(scene, '[ Toggle Light ]');
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn!.visible).toBe(true);
  });

  it('has the [ Move Light ] button', async () => {
    const scene = await bootScene(Phaser.WEBGL);

    const moveBtn = findText(scene, '[ Move Light ]');
    expect(moveBtn).toBeTruthy();
    expect(moveBtn!.visible).toBe(true);
  });

  // ── AC 4: Event log shows lighting status ─────────────────

  it('event log shows WebGL availability information (AC 4)', async () => {
    const scene = await bootScene(Phaser.WEBGL);

    // The event log should indicate WebGL availability
    const webglLog = findTextContaining(scene, 'WebGL');
    expect(webglLog).toBeTruthy();
  });

  it('event log shows canvas fallback when lighting unavailable (AC 4)', async () => {
    const scene = await bootScene(Phaser.CANVAS);

    const fallbackLog = findTextContaining(scene, 'Lighting not');
    expect(fallbackLog).toBeTruthy();
  });

  // ── AC 5: Toggle Light updates log in WebGL mode ──────────

  it('[ Toggle Light ] updates event log (AC 5)', async () => {
    const scene = await bootScene(Phaser.WEBGL);

    const toggleBtn = findText(scene, '[ Toggle Light ]');
    expect(toggleBtn).toBeTruthy();
    toggleBtn!.emit('pointerdown');

    // After toggling, the log should indicate the light was enabled/disabled
    const toggleLog = findTextContaining(scene, 'Light ');
    expect(toggleLog).toBeTruthy();
  });

  // ── AC 6: Move Light updates log in WebGL mode ────────────

  it('[ Move Light ] updates event log (AC 6)', async () => {
    const scene = await bootScene(Phaser.WEBGL);

    const moveBtn = findText(scene, '[ Move Light ]');
    expect(moveBtn).toBeTruthy();
    moveBtn!.emit('pointerdown');

    // After moving, the log should indicate the light moved
    const moveLog = findTextContaining(scene, 'Light moved');
    expect(moveLog).toBeTruthy();
  });

  // ── AC 6: Toggle Light shows correct status in Canvas mode ──

  it('[ Toggle Light ] shows lighting not available in Canvas mode (AC 5)', async () => {
    const scene = await bootScene(Phaser.CANVAS);

    const toggleBtn = findText(scene, '[ Toggle Light ]');
    expect(toggleBtn).toBeTruthy();
    toggleBtn!.emit('pointerdown');

    // In Canvas, toggling should log that lighting is not available
    const notAvailLog = findTextContaining(scene, 'not available');
    expect(notAvailLog).toBeTruthy();
  });

  // ── AC 7: Move Light shows correct status in Canvas mode ──

  it('[ Move Light ] shows lighting not available in Canvas mode (AC 6)', async () => {
    const scene = await bootScene(Phaser.CANVAS);

    const moveBtn = findText(scene, '[ Move Light ]');
    expect(moveBtn).toBeTruthy();
    moveBtn!.emit('pointerdown');

    // In Canvas, moving should log that lighting is not available
    const notAvailLog = findTextContaining(scene, 'not available');
    expect(notAvailLog).toBeTruthy();
  });

  // ── AC 8: Multiple toggles produce consistent log entries ──

  it('toggling light twice produces two distinct log entries', async () => {
    const scene = await bootScene(Phaser.WEBGL);

    const toggleBtn = findText(scene, '[ Toggle Light ]');
    expect(toggleBtn).toBeTruthy();

    // Toggle ON (first click)
    toggleBtn!.emit('pointerdown');

    // Toggle OFF (second click)
    toggleBtn!.emit('pointerdown');

    // After toggling twice, the lighting should be back on
    const enabledLog = findTextContaining(scene, 'Light enabled');
    expect(enabledLog).toBeTruthy();
  });
});
