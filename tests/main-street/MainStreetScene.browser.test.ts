import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';
import { executeDayStart, processEndOfTurn } from '../../example-games/main-street/MainStreetEngine';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();

  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame();
  await waitForScene(game, 'MainStreetScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true, false);
  }
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

describe('MainStreetScene browser tests', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('re-renders activity log after scene restart', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    scene.logPrevEntryCount = 1;
    scene.logScrollOffset = 9999;
    scene.logAutoScroll = false;

    scene.scene.restart();
    await waitForScene(game, 'MainStreetScene');

    const restarted = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const state = restarted.state as { activityLog: Array<{ text: string }> };
    expect(state.activityLog).toHaveLength(1);

    const logContentContainer = restarted.logContentContainer as Phaser.GameObjects.Container;
    const textEntries = logContentContainer.list.filter((obj) => obj instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text[];

    expect(textEntries.some((entry) => entry.text === 'Turn 1')).toBe(true);
    expect(logContentContainer.y).toBeGreaterThan(0);
  });

  it('shows new entries for the restarted run', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    scene.scene.restart();
    await waitForScene(game, 'MainStreetScene');

    const restarted = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const state = restarted.state as Parameters<typeof processEndOfTurn>[0];

    processEndOfTurn(state);
    executeDayStart(state);
    (restarted.refreshAll as () => void)();

    const logContentContainer = restarted.logContentContainer as Phaser.GameObjects.Container;
    const textEntries = logContentContainer.list.filter((obj) => obj instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text[];

    expect(textEntries.some((entry) => entry.text === 'Turn 2')).toBe(true);
  });
});
