import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createSushiGoGame } = await import('../../example-games/sushi-go/createSushiGoGame');
  const game = createSushiGoGame();
  await waitForScene(game, 'SushiGoScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let count = 0;
    const step = () => {
      count += 1;
      if (count >= n) {
        resolve();
      } else {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  });
}

describe('Sushi Go game-over overlay', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('renders Play Again and Menu buttons when game-over overlay is shown', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    const fakeRoundResult = {
      round: 2,
      tableauScores: [9, 8],
      tableauBreakdowns: [
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
      ],
      makiCounts: [0, 0],
      makiBonuses: [0, 0],
      roundScores: [9, 8],
      puddingCounts: [0, 0],
      puddingBonuses: [0, 0],
    };

    scene.overlayManager.showGameOverOverlay(fakeRoundResult, null, () => {
      scene.scene.restart();
    });

    await waitFrames(3);

    const texts = scene.children.list.filter(
      (child: Phaser.GameObjects.GameObject) => child instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];

    const playAgainBtn = texts.find((t) => t.text === '[ Play Again ]');
    const menuBtn = texts.find((t) => t.text === '[ Menu ]');

    expect(playAgainBtn).toBeDefined();
    expect(menuBtn).toBeDefined();
    expect(playAgainBtn!.input?.enabled).toBe(true);
    expect(menuBtn!.input?.enabled).toBe(true);
  });
});
