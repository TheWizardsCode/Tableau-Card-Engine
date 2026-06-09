/**
 * Main Street z-order browser tests.
 *
 * Validates that Main Street's container depth ordering follows the expected
 * convention: HUD depth (1000) > all other zone containers > gameplay containers.
 *
 * Main Street explicitly sets HUD container depth to 1000.  Other containers
 * (street, market, hand, action, incident queue) use default depth (0) and
 * rely on creation-order depth sorting.
 *
 * Expected ordering (bottom → top):
 *   1. streetContainer       – business cards on the street (depth 0)
 *   2. marketContainer       – market cards (depth 0)
 *   3. incidentQueueContainer – incident queue (depth 0)
 *   4. handContainer         – player hand cards (depth 0)
 *   5. actionContainer       – action buttons (depth 0)
 *   6. hudContainer          – HUD overlays (depth 1000)
 *   7. Game state overlays   – depth 2000+
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

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame({ parent: 'game-container' });
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

describe('Main Street container z-order', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('all expected containers exist after boot', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;

    expect(scene.hudContainer).toBeDefined();
    expect(scene.hudContainer).toBeInstanceOf(Phaser.GameObjects.Container);

    expect(scene.streetContainer).toBeDefined();
    expect(scene.streetContainer).toBeInstanceOf(Phaser.GameObjects.Container);

    expect(scene.marketContainer).toBeDefined();
    expect(scene.marketContainer).toBeInstanceOf(Phaser.GameObjects.Container);

    expect(scene.handContainer).toBeDefined();
    expect(scene.handContainer).toBeInstanceOf(Phaser.GameObjects.Container);

    expect(scene.actionContainer).toBeDefined();
    expect(scene.actionContainer).toBeInstanceOf(Phaser.GameObjects.Container);
  });

  it('hudContainer has depth ≥ 1000', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;

    const hudDepth = scene.hudContainer.depth ?? 0;
    expect(hudDepth).toBeGreaterThanOrEqual(1000);
  });

  it('gameplay containers use default depth (0)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;

    const containers = [
      'streetContainer',
      'marketContainer',
      'incidentQueueContainer',
      'handContainer',
      'actionContainer',
    ];

    for (const name of containers) {
      if (scene[name]) {
        expect((scene[name] as any).depth ?? 0, `${name} should use default depth`).toBe(0);
      }
    }
  });

  it('hudContainer depth is greater than all gameplay container depths', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;

    const hudDepth = scene.hudContainer.depth ?? 0;
    expect(hudDepth).toBeGreaterThanOrEqual(1000);

    const gameplayContainers = [
      'streetContainer',
      'marketContainer',
      'handContainer',
      'actionContainer',
    ];

    for (const name of gameplayContainers) {
      if (scene[name]) {
        const cDepth = (scene[name] as any).depth ?? 0;
        expect(hudDepth, `hud depth (${hudDepth}) > ${name} depth (${cDepth})`).toBeGreaterThan(cDepth);
      }
    }
  });

  it('actionContainer is created after street/market containers (renders on top)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;
    const children = scene.children.list as Phaser.GameObjects.GameObject[];

    const actionIdx = children.indexOf(scene.actionContainer);
    const streetIdx = children.indexOf(scene.streetContainer);
    const marketIdx = children.indexOf(scene.marketContainer);

    expect(actionIdx).toBeGreaterThan(streetIdx);
    expect(actionIdx).toBeGreaterThan(marketIdx);
  });

  it('zone metadata is not set on Main Street containers (they use raw containers)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;

    const containers = [
      'hudContainer',
      'streetContainer',
      'marketContainer',
      'handContainer',
      'actionContainer',
    ];

    for (const name of containers) {
      if (scene[name]) {
        expect((scene[name] as any).__zoneWidth, `${name} should not have __zoneWidth`).toBeUndefined();
        expect((scene[name] as any).__zoneHeight, `${name} should not have __zoneHeight`).toBeUndefined();
        expect((scene[name] as any).__zoneName, `${name} should not have __zoneName`).toBeUndefined();
      }
    }
  });

  it('hudContainer stores no zone metadata but has correct depth', async () => {
    game = await bootGame();
    await waitFrames(3);
    const scene = game.scene.getScene('MainStreetScene') as any;

    // hudContainer is created via scene.add.container, not createGameZone,
    // so it should not have zone metadata
    expect((scene.hudContainer as any).__zoneWidth).toBeUndefined();
    expect((scene.hudContainer as any).__zoneHeight).toBeUndefined();
    expect((scene.hudContainer as any).__zoneName).toBeUndefined();

    // But it should have the correct depth
    expect(scene.hudContainer.depth).toBeGreaterThanOrEqual(1000);
  });
});
