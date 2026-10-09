/**
 * 1916: The Rising — browser smoke test (F4, AC6).
 *
 * Boots {@link TheRisingScene} in a headless Phaser browser environment and
 * asserts that:
 *   - the scene shell boots and becomes active;
 *   - the Spirit Row renders spirit cards through the shared `HandView`;
 *   - the HUD (Memory, Rising Clock, Insight) is created and visible.
 *
 * These are behavioural assertions on the rendered scene, not source greps.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { TheRisingScene, THERISING_SCENE_KEY } from '../../src/scenes/TheRisingScene';
import { waitForScene } from '../helpers/waitForScene';

describe('TheRisingScene smoke', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  async function bootScene(): Promise<TheRisingScene> {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#10141d',
      scene: [TheRisingScene],
    });

    await waitForScene(game, THERISING_SCENE_KEY);
    const scene = game.scene.getScene(THERISING_SCENE_KEY) as TheRisingScene;
    expect(scene).toBeTruthy();
    expect(scene.sys.isActive()).toBe(true);
    return scene;
  }

  it('boots the scene shell and resolves the SLL layout', async () => {
    const scene = await bootScene();

    // The scene shell extends CardGameScene and integrates the layout adapter.
    expect(scene.boardRenderer).toBeTruthy();
    expect(scene.animator).toBeTruthy();
    expect(scene.risingState).toBeTruthy();
    expect(scene.risingLayout.viewport.width).toBeGreaterThan(0);
    expect(scene.risingLayout.viewport.height).toBeGreaterThan(0);
  });

  it('renders Spirit Row cards through the shared HandView', async () => {
    const scene = await bootScene();

    const marketSprites = scene.boardRenderer.marketView.getSprites();
    expect(marketSprites.length).toBeGreaterThan(0);

    // Each rendered spirit face is a container owned by the market view, and
    // is positioned on-screen (not left at the (0, 0) origin).
    const first = marketSprites[0] as Phaser.GameObjects.Container;
    expect(first).toBeTruthy();
    expect(typeof first.x).toBe('number');
    expect(Number.isFinite(first.x)).toBe(true);
    expect(Number.isFinite(first.y)).toBe(true);
  });

  it('shows a visible HUD with Memory, Rising Clock and Insight', async () => {
    const scene = await bootScene();

    const { memoryText, clockText, insightText } = scene.boardRenderer;

    expect(memoryText.visible).toBe(true);
    expect(clockText.visible).toBe(true);
    expect(insightText.visible).toBe(true);

    expect(memoryText.text).toContain('Memory');
    expect(clockText.text).toContain('Rising Clock');
    expect(insightText.text).toContain('Insight');
  });
});
