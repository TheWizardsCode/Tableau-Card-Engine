import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import type { ResourceType } from '../../example-games/feudalism/FeudalismCards';

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

async function waitFor(predicate: () => boolean, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

describe('Feudalism selected market card highlight', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('persists selected card highlight and clears on non-card click', async () => {
    game = await bootGame();

    const scene = game.scene.getScene('FeudalismScene') as Phaser.Scene & {
      getFirstVisibleMarketCardIdForTest: () => number | null;
      getSelectedMarketCardIdForTest: () => number | null;
      getMarketCardScaleForTest: (cardId: number) => number | null;
      selectMarketCardForTest: (cardId: number) => void;
      emitNonCardPointerDownForTest: () => void;
    };

    const cardId = scene.getFirstVisibleMarketCardIdForTest();
    expect(cardId).not.toBeNull();

    scene.selectMarketCardForTest(cardId!);

    expect(scene.getSelectedMarketCardIdForTest()).toBe(cardId);
    expect(scene.getMarketCardScaleForTest(cardId!)).toBeCloseTo(1.04, 2);

    scene.emitNonCardPointerDownForTest();

    expect(scene.getSelectedMarketCardIdForTest()).toBeNull();
    expect(scene.getMarketCardScaleForTest(cardId!)).toBeCloseTo(1, 2);
  });

  it('clears selected supply tokens after a take-different turn completes', async () => {
    game = await bootGame();

    const scene = game.scene.getScene('FeudalismScene') as Phaser.Scene & {
      startTokenSelectionForTest: () => void;
      toggleSupplyTokenForTest: (color: ResourceType) => void;
      confirmTakeDifferentForTest: () => void;
      getSelectedTokensForTest: () => ResourceType[];
      getTurnPhaseForTest: () => string;
    };

    scene.startTokenSelectionForTest();
    scene.toggleSupplyTokenForTest('wheat');

    expect(scene.getSelectedTokensForTest()).toEqual(['wheat']);

    scene.confirmTakeDifferentForTest();

    await waitFor(() => scene.getTurnPhaseForTest() === 'player-turn');

    expect(scene.getSelectedTokensForTest()).toEqual([]);
  });
});
