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

describe('Sushi Go pudding final scoring', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('applies pudding bonuses/penalties to session.totalScore at game end', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    // Prepare session for final round scoring
    scene.session.players.forEach((p: any) => {
      p.roundScores = [];
      p.totalScore = 0;
      p.tableau = [];
      p.puddingCount = 0;
    });

    // Set current round to final round and phase to round-scoring
    scene.session.currentRound = scene.session.totalRounds - 1;
    scene.session.phase = 'round-scoring';

    // Give player 0 two puddings and player 1 none
    const puddingCard = { id: 9999, type: 'pudding' };
    scene.session.players[0].tableau = [puddingCard, puddingCard];
    scene.session.players[1].tableau = [];

    // Now invoke scoring
    const { scoreRound } = await import('../../example-games/sushi-go/SushiGoGame');
    const result = scoreRound(scene.session);

    // Expect puddingCounts to reflect 2 and 0
    expect(result.puddingCounts).toBeDefined();
    expect(result.puddingCounts![0]).toBe(2);
    expect(result.puddingCounts![1]).toBe(0);

    // Pudding bonuses for 2 players where one has most and the other fewest
    expect(result.puddingBonuses).toBeDefined();
    expect(result.puddingBonuses![0]).toBe(6);
    expect(result.puddingBonuses![1]).toBe(-6);

    // Session totalScore should be updated accordingly
    expect(scene.session.players[0].totalScore).toBe(6);
    expect(scene.session.players[1].totalScore).toBe(-6);
  });
});
