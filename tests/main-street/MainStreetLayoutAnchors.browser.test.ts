import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';

async function bootGame(options: { width?: number; height?: number } = {}): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();

  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame(options);
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

function findEndTurnRect(scene: Phaser.Scene & Record<string, any>): { x: number; y: number; w: number; h: number } {
  const actionContainer = scene.actionContainer as Phaser.GameObjects.Container;
  const endTurnContainer = actionContainer.list.find((entry) => {
    if (!(entry instanceof Phaser.GameObjects.Container)) return false;
    return entry.list.some(
      (child) => child instanceof Phaser.GameObjects.Text && child.text === 'End Turn',
    );
  }) as Phaser.GameObjects.Container | undefined;

  if (!endTurnContainer) {
    throw new Error('End Turn button container not found');
  }

  const bg = endTurnContainer.list.find(
    (child) => child instanceof Phaser.GameObjects.Rectangle,
  ) as Phaser.GameObjects.Rectangle | undefined;

  if (!bg) {
    throw new Error('End Turn button background not found');
  }

  return {
    x: endTurnContainer.x - bg.width / 2,
    y: endTurnContainer.y - bg.height / 2,
    w: bg.width,
    h: bg.height,
  };
}

describe('Main Street layout anchor bounds', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('keeps Activity Log and End Turn within expected bounds across target viewports', async () => {
    const viewports = [
      { width: 1280, height: 720 },
      { width: 720, height: 1280 },
    ];

    for (const viewport of viewports) {
      game = await bootGame(viewport);
      const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, any>;
      const layout = scene.getLayoutMetricsForTest();

      const logRect = {
        x: layout.logX,
        y: layout.logY,
        w: layout.logW,
        h: layout.logH,
      };
      const endTurnRect = findEndTurnRect(scene);

      // Activity Log: upper-right quadrant and inside viewport.
      expect(logRect.x).toBeGreaterThanOrEqual(layout.gameW * 0.4);
      expect(logRect.y).toBeLessThanOrEqual(layout.gameH * 0.2);
      expect(logRect.x + logRect.w).toBeLessThanOrEqual(layout.gameW);
      expect(logRect.y + logRect.h).toBeLessThanOrEqual(layout.gameH);

      // End Turn: lower-right quadrant and inside viewport.
      expect(endTurnRect.x).toBeGreaterThanOrEqual(layout.gameW * 0.65);
      expect(endTurnRect.y).toBeGreaterThanOrEqual(layout.gameH * 0.85);
      expect(endTurnRect.x + endTurnRect.w).toBeLessThanOrEqual(layout.gameW);
      expect(endTurnRect.y + endTurnRect.h).toBeLessThanOrEqual(layout.gameH);

      // Explicit pass/fail bound: End Turn stays below Activity Log.
      expect(endTurnRect.y).toBeGreaterThan(logRect.y + logRect.h);

      destroyGame(game);
      game = null;
    }
  });
});
