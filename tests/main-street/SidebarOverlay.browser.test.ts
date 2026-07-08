import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame({ type: Phaser.CANVAS, parent: 'game-container' });
  await waitForScene(game, 'MainStreetScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = n;
    const tick = () => {
      remaining--;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

describe('MainStreet overlay/sidebar layering', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('help panel and settings panel render above gameplay containers and are parented into hudContainer', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;

    // Ensure hudContainer exists and has a large depth
    expect(scene.hudContainer).toBeDefined();

    // Open help panel (use API directly)
    scene.helpPanel.open();
    await waitFrames(6);

    // Panel should be open
    expect(scene.helpPanel.isOpen).toBe(true);

    // Expect help panel container to be parented into hudContainer
    const helpParent = (scene.helpPanel as any).container.parentContainer;
    expect(helpParent).toBe(scene.hudContainer);

    // HUD container depth should be greater than street/market/action containers
    const hudDepth = scene.hudContainer.depth ?? 0;
    const streetDepth = scene.streetContainer.depth ?? 0;
    const marketDepth = scene.marketContainer.depth ?? 0;
    const actionDepth = scene.actionContainer.depth ?? 0;

    expect(hudDepth).toBeGreaterThanOrEqual(1000);
    expect(hudDepth).toBeGreaterThan(streetDepth);
    expect(hudDepth).toBeGreaterThan(marketDepth);
    expect(hudDepth).toBeGreaterThan(actionDepth);

    // Close help then open settings panel separately to reduce concurrency risk
    scene.helpPanel.close();
    await waitFrames(6);

    scene.settingsPanel.open();
    await waitFrames(6);
    expect(scene.settingsPanel.isOpen).toBe(true);
    const settingsParent = (scene.settingsPanel as any).container.parentContainer;
    expect(settingsParent).toBe(scene.hudContainer);
  });
});
