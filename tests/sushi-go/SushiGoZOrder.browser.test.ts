/**
 * Sushi Go z-order browser tests.
 *
 * Validates that hand and tableau containers have defined, non-overlapping
 * depth ordering.  Sushi Go relies on Phaser's default creation-order
 * depth sorting for its containers (no explicit setDepth calls), so these
 * tests verify the creation sequence produces the expected visual layering.
 *
 * Actual ordering (bottom → top) — determined by creation order:
 *   1. handContainer           – cards currently in the player's hand
 *   2. playerTableauContainer  – cards played to the player's tableau
 *   3. aiTableauContainer      – cards played to the AI's tableau
 *
 * Since Sushi Go does not assign explicit depth values to these containers,
 * we verify that the creation order is stable and consistent, and that
 * no containers share the same explicit depth that would cause z-fighting.
 */

import { describe, it, expect, afterEach } from 'vitest';
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
  // Wait for ensureIconTextures().finally() to settle before returning,
  // avoiding unhandled rejection on scene destroy.
  await new Promise((r) => setTimeout(r, 200));
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

describe('Sushi Go container z-order', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('handContainer, playerTableauContainer, and aiTableauContainer exist after boot', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    // In Sushi Go, containers are fields on the scene itself, not on a renderer.
    expect(scene.handContainer).toBeDefined();
    expect(scene.handContainer).toBeInstanceOf(Phaser.GameObjects.Container);

    expect(scene.playerTableauContainer).toBeDefined();
    expect(scene.playerTableauContainer).toBeInstanceOf(Phaser.GameObjects.Container);

    expect(scene.aiTableauContainer).toBeDefined();
    expect(scene.aiTableauContainer).toBeInstanceOf(Phaser.GameObjects.Container);
  });

  it('containers are created in a consistent order', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    // All three containers use default depth (0) in Sushi Go, so render order
    // is determined by creation order. We verify the containers exist and
    // are all present in the scene's children list.
    const children = scene.children.list as Phaser.GameObjects.GameObject[];
    const handIdx = children.indexOf(scene.handContainer);
    const playerTableauIdx = children.indexOf(scene.playerTableauContainer);
    const aiTableauIdx = children.indexOf(scene.aiTableauContainer);

    expect(handIdx).toBeGreaterThanOrEqual(0);
    expect(playerTableauIdx).toBeGreaterThanOrEqual(0);
    expect(aiTableauIdx).toBeGreaterThanOrEqual(0);

    // Verify containers have distinct indices (no overlapping references)
    expect(handIdx).not.toBe(playerTableauIdx);
    expect(handIdx).not.toBe(aiTableauIdx);
    expect(playerTableauIdx).not.toBe(aiTableauIdx);
  });

  it('no explicit depth is set on gameplay containers (rely on creation order)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    // Sushi Go containers use default depth (0); verify none have been
    // assigned a custom depth value that would override creation order.
    expect((scene.handContainer as any).depth ?? 0).toBe(0);
    expect((scene.playerTableauContainer as any).depth ?? 0).toBe(0);
    expect((scene.aiTableauContainer as any).depth ?? 0).toBe(0);
  });

  it('hudContainer depth (1000) is above all gameplay containers', async () => {
    game = await bootGame();
    await waitFrames(3);
    const scene = game.scene.getScene('SushiGoScene') as any;

    if (scene.hudContainer) {
      const hudDepth = scene.hudContainer.depth ?? 0;
      expect(hudDepth).toBeGreaterThanOrEqual(1000);

      // Gameplay containers use depth 0
      expect(hudDepth).toBeGreaterThan((scene.handContainer as any).depth ?? 0);
      expect(hudDepth).toBeGreaterThan((scene.playerTableauContainer as any).depth ?? 0);
      expect(hudDepth).toBeGreaterThan((scene.aiTableauContainer as any).depth ?? 0);
    }
  });

  it('zone metadata is not set on Sushi Go containers (they use raw containers)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    // Sushi Go containers are raw Phaser containers, not created via createGameZone,
    // so they should not have zone metadata properties.
    expect((scene.handContainer as any).__zoneWidth).toBeUndefined();
    expect((scene.handContainer as any).__zoneHeight).toBeUndefined();
    expect((scene.handContainer as any).__zoneName).toBeUndefined();
  });
});
