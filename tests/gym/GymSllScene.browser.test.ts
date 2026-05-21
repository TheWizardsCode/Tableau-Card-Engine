import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { GymSllScene } from '../../example-games/gym/scenes/GymSllScene';
import { GYM_SLL_KEY } from '../../example-games/gym/GymRegistry';
import { waitForScene } from '../helpers/waitForScene';

interface GymSllReadyMarker {
  ready: boolean;
  sceneKey: string;
  layoutId: string;
  profile: {
    id: string;
    viewport: { width: number; height: number };
    dpr: number;
  };
  anchorsDisplay: {
    title: { x: number; y: number };
    help: { x: number; y: number };
    action: { x: number; y: number };
  };
  composition?: {
    baseLayoutId: string;
    sceneLayoutId: string;
    policy: 'sceneWins' | 'baseWins' | 'namespace';
  };
}

function waitForSllReadyMarker(timeoutMs = 10_000): Promise<GymSllReadyMarker> {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    const check = () => {
      const marker = (window as Window & { __gymSllSceneReady?: GymSllReadyMarker }).__gymSllSceneReady;
      if (marker?.ready && marker.sceneKey === GYM_SLL_KEY) {
        resolve(marker);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for window.__gymSllSceneReady after ${timeoutMs}ms`));
        return;
      }
      requestAnimationFrame(check);
    };

    check();
  });
}

describe('GymSllScene browser integration', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;

    const container = document.getElementById('game-container');
    if (container) container.remove();

    delete (window as Window & { __gymSllSceneReady?: GymSllReadyMarker }).__gymSllSceneReady;
  });

  it('boots and emits a scene-ready marker', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [GymSllScene],
    });

    await waitForScene(game, GYM_SLL_KEY);
    const marker = await waitForSllReadyMarker();

    expect(marker.ready).toBe(true);
    expect(marker.layoutId).toBe('gym-shell-layout+gym-scene-layout');
    expect(marker.profile.id).toBe('desktop-1x');
    expect(marker.composition).toEqual({
      baseLayoutId: 'gym-shell-layout',
      sceneLayoutId: 'gym-scene-layout',
      policy: 'sceneWins',
    });
  });

  it('positions anchor-derived elements in expected pixel ranges', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [GymSllScene],
    });

    await waitForScene(game, GYM_SLL_KEY);
    const marker = await waitForSllReadyMarker();

    // Range-based assertions keep the browser spec stable across headless
    // Chromium runs while still proving the merged shell + scene anchors land
    // in the expected regions.
    expect(marker.anchorsDisplay.title.x).toBeGreaterThan(620);
    expect(marker.anchorsDisplay.title.x).toBeLessThan(660);
    expect(marker.anchorsDisplay.title.y).toBeGreaterThan(36);
    expect(marker.anchorsDisplay.title.y).toBeLessThan(54);

    expect(marker.anchorsDisplay.help.x).toBeGreaterThan(1160);
    expect(marker.anchorsDisplay.help.x).toBeLessThan(1195);
    expect(marker.anchorsDisplay.help.y).toBeGreaterThan(36);
    expect(marker.anchorsDisplay.help.y).toBeLessThan(54);

    expect(marker.anchorsDisplay.action.x).toBeGreaterThan(325);
    expect(marker.anchorsDisplay.action.x).toBeLessThan(340);
    expect(marker.anchorsDisplay.action.y).toBeGreaterThan(150);
    expect(marker.anchorsDisplay.action.y).toBeLessThan(166);
  });
});
