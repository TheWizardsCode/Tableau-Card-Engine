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

function waitForSllReadyMarker(
  expectedLayoutId?: string,
  timeoutMs = 10_000,
): Promise<GymSllReadyMarker> {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    const check = () => {
      const marker = (window as Window & { __gymSllSceneReady?: GymSllReadyMarker }).__gymSllSceneReady;
      const layoutMatches = expectedLayoutId ? marker?.layoutId === expectedLayoutId : true;
      if (marker?.ready && marker.sceneKey === GYM_SLL_KEY && layoutMatches) {
        resolve(marker);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(
          new Error(
            `Timed out waiting for window.__gymSllSceneReady${
              expectedLayoutId ? ` to reach layout ${expectedLayoutId}` : ''
            } after ${timeoutMs}ms`,
          ),
        );
        return;
      }
      requestAnimationFrame(check);
    };

    check();
  });
}

function findTextObject(scene: Phaser.Scene, textMatch: (text: string) => boolean): Phaser.GameObjects.Text | null {
  return (
    scene.children.list.find(
      (child): child is Phaser.GameObjects.Text =>
        child instanceof Phaser.GameObjects.Text && textMatch(child.text),
    ) ?? null
  );
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

  it('boots on the composed shell + scene layout and emits a scene-ready marker', async () => {
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
    const scene = game.scene.getScene(GYM_SLL_KEY) as Phaser.Scene;
    const marker = await waitForSllReadyMarker();

    expect(marker.ready).toBe(true);
    expect(marker.layoutId).toBe('gym-shell-layout+gym-scene-layout');
    expect(marker.profile.id).toBe('desktop-1x');
    expect(marker.composition).toEqual({
      baseLayoutId: 'gym-shell-layout',
      sceneLayoutId: 'gym-scene-layout',
      policy: 'sceneWins',
    });

    // Shell starts OFF (hidden) on first load
    expect(findTextObject(scene, text => text === 'Screen Layout Language (SLL)')?.visible).toBe(false);
    expect(findTextObject(scene, text => text === '[ Menu ]')?.visible).toBe(false);
    expect(findTextObject(scene, text => text === '[ Layout: Shell+Scene ]')?.visible).toBe(false);
    expect(findTextObject(scene, text => text === '[ Profile: desktop-1x ]')?.visible).toBe(false);
    expect(findTextObject(scene, text => text === '[ Overlay: OFF ]')?.visible).toBe(false);

    const helpIcon = findTextObject(scene, text => text === '?');
    expect(helpIcon).toBeTruthy();
    expect(helpIcon?.visible).toBe(false);

    const actionButton = findTextObject(scene, text => text === '[ Toggle Fill ]');
    expect(actionButton).toBeTruthy();
    expect(actionButton?.visible).toBe(true);

    const shellToggleButton = findTextObject(scene, text => text.startsWith('[ Toggle Shell: ON ]'));
    expect(shellToggleButton).toBeTruthy();
    expect(shellToggleButton?.visible).toBe(true);

    // Toggle ON → shell becomes visible
    shellToggleButton?.emit('pointerdown');
    expect(shellToggleButton?.text).toContain('ON');
    expect(findTextObject(scene, text => text === 'Screen Layout Language (SLL)')?.visible).toBe(true);
    expect(findTextObject(scene, text => text === '[ Menu ]')?.visible).toBe(true);
    expect(findTextObject(scene, text => text === '[ Layout: Shell+Scene ]')?.visible).toBe(true);
    expect(findTextObject(scene, text => text === '[ Profile: desktop-1x ]')?.visible).toBe(true);
    expect(findTextObject(scene, text => text === '[ Overlay: OFF ]')?.visible).toBe(true);
    expect(findTextObject(scene, text => text === 'SLL Title Anchor')?.visible).toBe(true);
    expect(findTextObject(scene, text => text === 'SLL Title Anchor')?.y).toBeGreaterThan(120);
    expect(findTextObject(scene, text => text === 'SLL Title Anchor')?.y).toBeLessThan(132);

    // Toggle OFF → shell hidden again
    shellToggleButton?.emit('pointerdown');
    expect(shellToggleButton?.text).toContain('OFF');
    expect(findTextObject(scene, text => text === 'Screen Layout Language (SLL)')?.visible).toBe(false);
    expect(findTextObject(scene, text => text === '[ Menu ]')?.visible).toBe(false);
    expect(findTextObject(scene, text => text === '[ Layout: Shell+Scene ]')?.visible).toBe(false);

    // Toggle ON again → shell visible
    shellToggleButton?.emit('pointerdown');
    expect(shellToggleButton?.text).toContain('ON');
    expect(findTextObject(scene, text => text === 'Screen Layout Language (SLL)')?.visible).toBe(true);
    expect(findTextObject(scene, text => text === '[ Menu ]')?.visible).toBe(true);
    expect(findTextObject(scene, text => text === '[ Layout: Shell+Scene ]')?.visible).toBe(true);

    const layoutButton = findTextObject(scene, text => text === '[ Layout: Shell+Scene ]');
    expect(layoutButton).toBeTruthy();

    // Cycle to shell-only layout, then toggle shell OFF/ON
    layoutButton?.emit('pointerdown');
    const shellOnlyMarker = await waitForSllReadyMarker('gym-shell-layout');
    expect(shellOnlyMarker.layoutId).toBe('gym-shell-layout');
    expect(findTextObject(scene, text => text === 'SLL Title Anchor')?.visible).toBe(false);

    shellToggleButton?.emit('pointerdown');
    expect(shellToggleButton?.text).toContain('OFF');
    expect(findTextObject(scene, text => text === 'Screen Layout Language (SLL)')?.visible).toBe(false);

    shellToggleButton?.emit('pointerdown');
    expect(shellToggleButton?.text).toContain('ON');
    expect(findTextObject(scene, text => text === 'Screen Layout Language (SLL)')?.visible).toBe(true);
    expect(findTextObject(scene, text => text === '[ Menu ]')?.visible).toBe(true);
    expect(findTextObject(scene, text => text === '[ Layout: Shell-only ]')?.visible).toBe(true);
  });

  it('cycles to the scene-only layout example', async () => {
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
    const scene = game.scene.getScene(GYM_SLL_KEY) as Phaser.Scene;

    const layoutButton = findTextObject(scene, text => text === '[ Layout: Shell+Scene ]');
    expect(layoutButton).toBeTruthy();

    layoutButton?.emit('pointerdown');
    await waitForSllReadyMarker('gym-shell-layout');

    layoutButton?.emit('pointerdown');

    const marker = await waitForSllReadyMarker('gym-scene-layout');

    expect(marker.layoutId).toBe('gym-scene-layout');
    expect(findTextObject(scene, text => text === '[ Layout: Scene-only ]')?.visible).toBe(false);
    expect(findTextObject(scene, text => text === 'Screen Layout Language (SLL)')?.visible).toBe(false);
    expect(findTextObject(scene, text => text === '[ Menu ]')?.visible).toBe(false);
    expect(findTextObject(scene, text => text === '[ Profile: desktop-1x ]')?.visible).toBe(false);
    expect(findTextObject(scene, text => text === '[ Overlay: OFF ]')?.visible).toBe(false);

    const helpIcon = findTextObject(scene, text => text === '?');
    expect(helpIcon).toBeTruthy();
    expect(helpIcon?.visible).toBe(false);
    expect(findTextObject(scene, text => text.startsWith('[ Toggle Shell: '))?.visible).toBe(true);
    const actionButton = findTextObject(scene, text => text === '[ Toggle Fill ]');
    expect(actionButton).toBeTruthy();
    expect(actionButton?.visible).toBe(true);
    expect(marker.anchorsDisplay.title.x).toBeGreaterThan(620);
    expect(marker.anchorsDisplay.title.x).toBeLessThan(660);
    expect(marker.anchorsDisplay.title.y).toBeGreaterThan(120);
    expect(marker.anchorsDisplay.title.y).toBeLessThan(132);
    expect(marker.anchorsDisplay.help.x).toBeGreaterThan(430);
    expect(marker.anchorsDisplay.help.x).toBeLessThan(470);
    expect(marker.anchorsDisplay.action.x).toBeGreaterThan(560);
    expect(marker.anchorsDisplay.action.x).toBeLessThan(600);
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
    expect(marker.anchorsDisplay.title.y).toBeGreaterThan(120);
    expect(marker.anchorsDisplay.title.y).toBeLessThan(132);

    expect(marker.anchorsDisplay.help.x).toBeGreaterThan(1160);
    expect(marker.anchorsDisplay.help.x).toBeLessThan(1195);
    expect(marker.anchorsDisplay.help.y).toBeGreaterThan(36);
    expect(marker.anchorsDisplay.help.y).toBeLessThan(54);

    expect(marker.anchorsDisplay.action.x).toBeGreaterThan(560);
    expect(marker.anchorsDisplay.action.x).toBeLessThan(600);
    expect(marker.anchorsDisplay.action.y).toBeGreaterThan(120);
    expect(marker.anchorsDisplay.action.y).toBeLessThan(132);
  });

  it('renders a readable overlay legend when toggled on', async () => {
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
    const scene = game.scene.getScene(GYM_SLL_KEY) as Phaser.Scene;

    const overlayButton = findTextObject(scene, text => text.includes('[ Overlay: OFF ]'));
    expect(overlayButton).toBeTruthy();

    overlayButton?.emit('pointerdown');

    await waitForSllReadyMarker();

    const overlayLegend = findTextObject(scene, text => text.startsWith('Overlay legend'));
    expect(overlayLegend).toBeTruthy();
    expect(overlayLegend?.x).toBeGreaterThanOrEqual(20);
    expect(overlayLegend?.y).toBeGreaterThanOrEqual(120);
    expect(overlayLegend?.text).toContain('shell');
    expect(overlayLegend?.text).toContain('banner');
  });
});
