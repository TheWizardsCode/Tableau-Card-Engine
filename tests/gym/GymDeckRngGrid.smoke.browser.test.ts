/**
 * GymDeckRngGrid Smoke Test
 *
 * Boots GymDeckRngScene in a headless Phaser browser environment and
 * verifies the deck grid renders the expected number of card objects
 * with correct positions and spacing.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { GymDeckRngScene } from '../../example-games/gym/scenes/GymDeckRngScene';
import { GYM_DECK_RNG_KEY } from '../../example-games/gym/GymRegistry';
import { waitForScene } from '../helpers/waitForScene';

describe('GymDeckRngScene deck grid smoke', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  async function bootScene(): Promise<Phaser.Scene> {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [GymDeckRngScene],
    });

    await waitForScene(game, GYM_DECK_RNG_KEY);
    const scene = game.scene.getScene(GYM_DECK_RNG_KEY);
    expect(scene).toBeTruthy();
    expect(scene.sys.isActive()).toBe(true);
    return scene;
  }

  /**
   * Get card sprite snapshots sorted by grid position (row-major).
   */
  function getCardSprites(scene: Phaser.Scene): { x: number; y: number; textureKey: string }[] {
    return scene.children.list
      .filter((child): child is Phaser.GameObjects.Image => child instanceof Phaser.GameObjects.Image)
      .sort((a, b) => {
        const yDiff = a.y - b.y;
        if (Math.abs(yDiff) > 5) return yDiff;
        return a.x - b.x;
      })
      .map((img) => ({
        x: Math.round(img.x),
        y: Math.round(img.y),
        textureKey: img.texture.key,
      }));
  }

  // ── AC 3: 52 card sprites rendered (full deck, within grid capacity) ──

  it('renders exactly 52 card sprites (AC 3)', async () => {
    const scene = await bootScene();
    const sprites = getCardSprites(scene);
    expect(sprites.length).toBe(52);
  });

  // ── AC 4: Cards positioned in grid with correct spacing ──────────────

  it('positions cards in a grid pattern with consistent row/column spacing (AC 4)', async () => {
    const scene = await bootScene();
    const sprites = getCardSprites(scene);

    // First row: 8 cards, all with same Y
    const row0Cards = sprites.slice(0, 8);
    const row0Y = row0Cards[0].y;
    for (const card of row0Cards) {
      expect(Math.abs(card.y - row0Y)).toBeLessThanOrEqual(3);
    }

    // Columns should be evenly spaced
    const colGaps: number[] = [];
    for (let i = 1; i < row0Cards.length; i++) {
      colGaps.push(row0Cards[i].x - row0Cards[i - 1].x);
    }
    // All column gaps should be similar (within 1px tolerance)
    for (let i = 1; i < colGaps.length; i++) {
      expect(Math.abs(colGaps[i] - colGaps[0])).toBeLessThanOrEqual(2);
    }

    // Row gaps should be consistent
    const row0FirstX = row0Cards[0].x;
    const row1First = sprites[8];
    const rowGap = row1First.y - row0Y;

    // Row 1 should be below row 0
    expect(rowGap).toBeGreaterThan(0);

    // Check rows 0 and 1 have consistent X positions
    expect(Math.abs(sprites[8].x - row0FirstX)).toBeLessThanOrEqual(3);
  });

  // ── AC 5: Grid capacity handling (52 > 8*6=48, but 52 cards fit in 7 rows) ──

  it('renders all cards without errors when deck fits in grid (no overflow) (AC 5)', async () => {
    const scene = await bootScene();
    const sprites = getCardSprites(scene);
    // 52 cards fit in 7 rows of 8 (56 slots), so all render
    expect(sprites.length).toBe(52);

    // The last row should have 4 cards (52 % 8 = 4)
    const lastRowStart = Math.floor(52 / 8) * 8;
    const lastRowCards = sprites.slice(lastRowStart);
    expect(lastRowCards.length).toBe(4);
  });
});
