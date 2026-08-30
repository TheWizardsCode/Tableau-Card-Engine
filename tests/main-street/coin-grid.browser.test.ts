/**
 * Browser tests for the on-card coin grid (CG-0MTDE9H0C0061D51).
 *
 * Verifies the Phaser wrapper (`createCoinGrid`) renders packed coins on a
 * real Main Street card face, re-packs on `addCoins`, renders half coins for
 * 0.5 remainders, stays on-card for small cards / many coins (never clipped),
 * and moves with the card container.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';
import { mainStreetRenderCardSvg } from '../../src/ui/Renderer/adapters/MainStreetAdapter';
import {
  COIN_GRID_FULL_KEY,
  COIN_GRID_HALF_KEY,
  createCoinGrid,
} from '../../example-games/main-street/coin-grid';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame({ type: Phaser.CANVAS, parent: 'game-container' });
  await waitForScene(game, 'MainStreetScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

async function waitForCondition(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = performance.now();
  while (!check()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for condition.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
}

/** Create a card container at the given screen position with a real card face. */
function createCardFace(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
): Phaser.GameObjects.Container {
  const card = scene.add.container(x, y);
  mainStreetRenderCardSvg(scene, card, 'biz-cafe', width, height);
  (scene as any).streetContainer?.add(card);
  return card;
}

/** Collect the coin icons (Images with a coin-grid texture) in a grid container. */
function coinIcons(grid: ReturnType<typeof createCoinGrid>): Phaser.GameObjects.Image[] {
  const icons: Phaser.GameObjects.Image[] = [];
  for (const child of grid.container.list) {
    if (child instanceof Phaser.GameObjects.Image) icons.push(child);
  }
  return icons;
}

/** World position of a game object's local origin. */
function worldPosition(obj: Phaser.GameObjects.GameObject): { x: number; y: number } {
  const m = (obj as Phaser.GameObjects.Container).getWorldTransformMatrix();
  return { x: m.getX(0, 0), y: m.getY(0, 0) };
}

describe('Main Street on-card coin grid', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('renders packed coins on a real card face anchored to the card', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & {
      streetContainer: Phaser.GameObjects.Container;
    };
    const card = createCardFace(scene, 400, 300, 140, 80);
    const grid = createCoinGrid(scene, card);
    waitForCondition(() => card.list.length > 0);

    const layout = grid.addCoins(3);
    expect(layout.iconCount).toBe(3);
    expect(layout.columns).toBe(5);

    const icons = coinIcons(grid);
    expect(icons).toHaveLength(3);
    for (const icon of icons) {
      expect((icon as Phaser.GameObjects.Image).texture.key).toBe(COIN_GRID_FULL_KEY);
      // All icons are inside the card container's local half-extents.
      expect(Math.abs(icon.x + grid.container.x)).toBeLessThanOrEqual(70 + 1);
      expect(Math.abs(icon.y + grid.container.y)).toBeLessThanOrEqual(40 + 1);
    }
  });

  it('re-packs when the coin count changes (5×3 → 10×3 → 15×3)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & {
      streetContainer: Phaser.GameObjects.Container;
    };
    const card = createCardFace(scene, 400, 300, 140, 80);
    const grid = createCoinGrid(scene, card, undefined, undefined, {
      availableWidth: 70,
      availableHeight: 40,
    });

    const five = grid.addCoins(5);
    expect(five.columns).toBe(5);
    expect(coinIcons(grid)).toHaveLength(5);

    const ten = grid.addCoins(10);
    expect(ten.columns).toBe(10);
    expect(coinIcons(grid)).toHaveLength(10);

    const fifteen = grid.addCoins(15);
    expect(fifteen.columns).toBe(15);
    expect(coinIcons(grid)).toHaveLength(15);

    const twenty = grid.addCoins(20);
    expect(twenty.columns).toBe(15);
    expect(twenty.rows).toBe(2);
    expect(coinIcons(grid)).toHaveLength(20);
  });

  it('renders a half coin for a 0.5 remainder (last icon)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & {
      streetContainer: Phaser.GameObjects.Container;
    };
    const card = createCardFace(scene, 400, 300, 140, 80);
    const grid = createCoinGrid(scene, card);

    const layout = grid.addCoins(2.5);
    expect(layout.iconCount).toBe(3);

    const icons = coinIcons(grid);
    expect(icons).toHaveLength(3);
    const halfIcons = icons.filter((i) => (i as Phaser.GameObjects.Image).texture.key === COIN_GRID_HALF_KEY);
    expect(halfIcons).toHaveLength(1);
    // The half coin is the last (right-most) icon.
    const halfIcon = halfIcons[0] as Phaser.GameObjects.Image;
    const fullIcon = (icons.find((i) => i !== halfIcons[0]) as Phaser.GameObjects.Image);
    expect(halfIcon.x).toBeGreaterThan(fullIcon.x);

    await waitForCondition(() => icons.every((i) => (i as Phaser.GameObjects.Image).visible));
  });

  it('coins move with the card (grid anchored to the card transform)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & {
      streetContainer: Phaser.GameObjects.Container;
    };
    const card = createCardFace(scene, 400, 300, 140, 80);
    const grid = createCoinGrid(scene, card);
    grid.addCoins(4);

    const before = coinIcons(grid).map(worldPosition);
    card.x += 60;
    card.y -= 30;
    await waitForCondition(() => card.x === 460);

    const after = coinIcons(grid).map(worldPosition);
    for (let i = 0; i < before.length; i++) {
      expect(after[i].x).toBeCloseTo(before[i].x + 60, 2);
      expect(after[i].y).toBeCloseTo(before[i].y - 30, 2);
    }
  });

  it('never clips: many coins on a small card stay on the card face', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & {
      streetContainer: Phaser.GameObjects.Container;
    };
    const card = createCardFace(scene, 300, 260, 60, 34);
    const grid = createCoinGrid(scene, card, undefined, undefined, {
      availableWidth: 30,
      availableHeight: 17,
    });

    const layout = grid.addCoins(20);
    expect(layout.iconCount).toBe(20);

    const icons = coinIcons(grid);
    expect(icons).toHaveLength(20);

    // Every icon stays within the small card's world bounds (+0.5px tolerance).
    const minX = card.x - 30.5;
    const maxX = card.x + 30.5;
    const minY = card.y - 17.5;
    const maxY = card.y + 17.5;
    for (const icon of icons) {
      const pos = worldPosition(icon);
      expect(pos.x).toBeGreaterThanOrEqual(minX);
      expect(pos.x).toBeLessThanOrEqual(maxX);
      expect(pos.y).toBeGreaterThanOrEqual(minY);
      expect(pos.y).toBeLessThanOrEqual(maxY);
    }
  });

  it('clear() removes all coin icons', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & {
      streetContainer: Phaser.GameObjects.Container;
    };
    const card = createCardFace(scene, 400, 300, 140, 80);
    const grid = createCoinGrid(scene, card);
    grid.addCoins(7);
    expect(coinIcons(grid)).toHaveLength(7);

    grid.clear();
    expect(grid.getLayout()).toBeNull();
    expect(coinIcons(grid)).toHaveLength(0);
  });
});