/**
 * Coloretto browser tests -- boots the Phaser scene and verifies the
 * start overlay and round start flow (acceptance criteria 5/6).
 */

import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createColorettoGame } = await import('../../example-games/coloretto/createColorettoGame');
  const game = createColorettoGame({ type: Phaser.CANVAS });
  await waitForScene(game, 'ColorettoScene');
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

/** Collect display objects from scene children and the HUD container. */
function collectFromSceneAndHud<T extends Phaser.GameObjects.GameObject>(
  scene: Phaser.Scene,
  predicate: (obj: Phaser.GameObjects.GameObject) => obj is T,
): T[] {
  const result: T[] = [];
  const walk = (parent: Phaser.GameObjects.GameObject[]) => {
    for (const child of parent) {
      if (predicate(child)) result.push(child);
      if (child instanceof Phaser.GameObjects.Container && (child as any).list) {
        walk((child as any).list);
      }
    }
  };
  walk(scene.children.list);
  const hud = (scene as any).hudContainer as { list: Phaser.GameObjects.GameObject[] } | undefined;
  if (hud && hud.list) walk(hud.list);
  return result;
}

function textObjects(scene: Phaser.Scene): Phaser.GameObjects.Text[] {
  return collectFromSceneAndHud(
    scene,
    (obj): obj is Phaser.GameObjects.Text => obj instanceof Phaser.GameObjects.Text,
  );
}

function texts(scene: Phaser.Scene): string[] {
  return textObjects(scene).map((t) => t.text);
}

/** Find a text object whose content includes the given substring. */
function findText(scene: Phaser.Scene, fragment: string): Phaser.GameObjects.Text | undefined {
  return textObjects(scene).find((t) => t.text.includes(fragment));
}

/** Simulate a pointerdown on a text object. */
function clickText(scene: Phaser.Scene, fragment: string): boolean {
  const obj = findText(scene, fragment);
  if (!obj) return false;
  obj.emit('pointerdown');
  return true;
}

describe('ColorettoScene (browser)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('boots and shows the player-count start overlay', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('ColorettoScene') as Phaser.Scene;

    await waitFrames(10);

    const allTexts = texts(scene);
    expect(allTexts.some((t) => t.includes('How many players?'))).toBe(true);
    expect(allTexts.some((t) => t.includes('2 (1 AI)'))).toBe(true);
    expect(allTexts.some((t) => t.includes('5 (4 AI)'))).toBe(true);
  });

  it('starts a 3-player game after selecting the player count', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('ColorettoScene') as Phaser.Scene;

    await waitFrames(10);
    expect(clickText(scene, '3 (2 AI)')).toBe(true);

    await waitFrames(10);

    const allTexts = texts(scene);
    expect(allTexts.some((t) => t.includes('Round 1 of 5'))).toBe(true);
    expect(allTexts.some((t) => t.includes('Deck'))).toBe(true);
    // 3 rows for a 3-player game are rendered as row labels R1..R3.
    expect(allTexts.some((t) => t.includes('R1'))).toBe(true);
    expect(allTexts.some((t) => t.includes('R2'))).toBe(true);
    expect(allTexts.some((t) => t.includes('R3'))).toBe(true);
  });

  it('starts a 2-player game with 7 rounds and 3 rows', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('ColorettoScene') as Phaser.Scene;

    await waitFrames(10);
    expect(clickText(scene, '2 (1 AI)')).toBe(true);
    await waitFrames(10);

    const allTexts = texts(scene);
    expect(allTexts.some((t) => t.includes('Round 1 of 7'))).toBe(true);
    expect(allTexts.some((t) => t.includes('R1'))).toBe(true);
    expect(allTexts.some((t) => t.includes('R3'))).toBe(true);
  });
});
