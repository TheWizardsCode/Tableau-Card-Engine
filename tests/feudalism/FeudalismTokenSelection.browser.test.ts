import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();

  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createFeudalismGame } = await import('../../example-games/feudalism/createFeudalismGame');
  const game = createFeudalismGame();
  await waitForScene(game, 'FeudalismScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true, false);
  }
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function countSupplyChecks(scene: any): number {
  const supplyContainer = (scene as any).feudRenderer.supplyContainer as Phaser.GameObjects.Container;
  if (!supplyContainer) return 0;
  let count = 0;
  for (const child of supplyContainer.list) {
    if (child && child.type === 'Text' && (child as Phaser.GameObjects.Text).text === '✓') count++;
  }
  return count;
}

describe('Feudalism token selection ticks', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('clears token tick marks after confirming a take-different action', async () => {
    game = await bootGame();

    const scene = game.scene.getScene('FeudalismScene') as any;
    expect(scene).toBeTruthy();

    // Start token selection
    scene.onTakeTokens();
    expect(scene.turnController.phase).toBe('selecting-tokens');

    // Pick three available colors from the supply
    const supply = scene.session.tokenSupply as Record<string, number>;
    const colors: string[] = [];
    for (const k of Object.keys(supply)) {
      if (supply[k] > 0 && k !== 'mead') colors.push(k);
      if (colors.length >= 3) break;
    }
    expect(colors.length).toBeGreaterThanOrEqual(1);

    // Select tokens
    for (const c of colors) scene.onSupplyTokenClick(c);

    // Ensure check marks are present
    const checksBefore = countSupplyChecks(scene);
    expect(checksBefore).toBeGreaterThan(0);

    // Confirm selection
    scene.onConfirmDifferent();

    // After confirming, the UI selection should be cleared
    const checksAfter = countSupplyChecks(scene);
    expect(checksAfter).toBe(0);
  });
});
