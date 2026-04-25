import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { HelloWorldScene } from '../../example-games/hello-world/scenes/HelloWorldScene';
import { waitForScene } from '../helpers/waitForScene';

describe('HelloWorldScene browser smoke', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  it('boots and renders the HelloWorldScene under Phaser 4', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: 'game-container',
      backgroundColor: '#2d572c',
      scene: [HelloWorldScene],
    });

    await waitForScene(game, 'HelloWorldScene');

    const activeScene = game.scene.getScene('HelloWorldScene');
    expect(activeScene).toBeTruthy();
    expect(activeScene.sys.isActive()).toBe(true);
    expect(container.querySelector('canvas')).not.toBeNull();
  });
});
