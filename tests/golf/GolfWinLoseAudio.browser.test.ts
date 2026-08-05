/**
 * Golf win/lose sound browser tests.
 *
 * Verifies that when the Golf end screen is shown, the correct outcome
 * sound plays:
 *  - human wins  -> `golf:sfx-game-win` plays
 *  - AI wins     -> `golf:sfx-game-lost` plays
 *  - `golf:sfx-score-reveal` still plays (kept)
 *  - `golf:sfx-round-end` is NOT played at game end (replaced by win/loss)
 *
 * Boots a real Phaser game in headless Chromium. Keeps total boots to 2
 * (human-win + ai-win) to stay well within the WebGL context budget.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

// ── Helpers ─────────────────────────────────────────────────

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createGolfGame } = await import(
    '../../example-games/golf/createGolfGame'
  );
  const game = createGolfGame({ type: Phaser.CANVAS });
  await waitForScene(game, 'GolfScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true, false);
  }
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSceneInternals(scene: Phaser.Scene) {
  return scene as any;
}

/** Rank pattern whose columns never match (avoids three-of-a-kind columns). */
const LOW_SCORE_RANKS = ['2', '2', '2', '3', '3', '3', '4', '4', '4']; // 15 pts
const HIGH_SCORE_RANKS = ['10', '10', '10', 'J', 'J', 'J', 'Q', 'Q', 'Q']; // 90 pts

/** Overwrite grid card ranks to force a deterministic outcome. */
function setGridRanks(
  grid: Array<{ rank: string }>,
  ranks: readonly string[],
): void {
  for (let i = 0; i < ranks.length; i++) {
    (grid[i] as { rank: string }).rank = ranks[i];
  }
}

/** Keys passed to Phaser's sound.play() during the end screen. */
function playedKeys(playSpy: { mock: { calls: unknown[][] } }): string[] {
  return playSpy.mock.calls.map((c) => c[0] as string);
}

// ── Tests ───────────────────────────────────────────────────

describe('Golf win/lose sounds', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('plays game-win when the human player wins (score-reveal kept, round-end removed)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;
    const internals = getSceneInternals(scene);

    // Force human win: human low score, AI high score.
    const gs = internals.session.gameState;
    setGridRanks(gs.playerStates[0].grid, LOW_SCORE_RANKS);
    setGridRanks(gs.playerStates[1].grid, HIGH_SCORE_RANKS);

    const playSpy = vi.spyOn(scene.sound, 'play');
    internals.phaseManager.set('round-ended');
    // Let the end screen render (sound playback is synchronous).
    await wait(100);

    const keys = playedKeys(playSpy);
    expect(keys).toContain('golf:sfx-score-reveal');
    expect(keys).toContain('golf:sfx-game-win');
    expect(keys).not.toContain('golf:sfx-game-lost');
    expect(keys).not.toContain('golf:sfx-round-end');
  });

  it('plays game-lost when the AI player wins', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;
    const internals = getSceneInternals(scene);

    // Force AI win: human high score, AI low score.
    const gs = internals.session.gameState;
    setGridRanks(gs.playerStates[0].grid, HIGH_SCORE_RANKS);
    setGridRanks(gs.playerStates[1].grid, LOW_SCORE_RANKS);

    const playSpy = vi.spyOn(scene.sound, 'play');
    internals.phaseManager.set('round-ended');
    await wait(100);

    const keys = playedKeys(playSpy);
    expect(keys).toContain('golf:sfx-score-reveal');
    expect(keys).toContain('golf:sfx-game-lost');
    expect(keys).not.toContain('golf:sfx-game-win');
    expect(keys).not.toContain('golf:sfx-round-end');
  });
});
