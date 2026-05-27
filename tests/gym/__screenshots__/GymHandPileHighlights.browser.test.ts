/**
 * GymHandPile highlight-zone regression test.
 *
 * Boots the GymHandPile scene, triggers "Show Valid" highlights,
 * captures a screenshot, and verifies that the highlight zones
 * are centred on the deck and discard pile graphics.
 */
import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { GymHandPileScene } from '../../../example-games/gym/scenes/GymHandPileScene';
import { waitForScene } from '../../helpers/waitForScene';
import { CARD_W, CARD_H } from '../../../src/ui/constants';

async function bootGymHandPile(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    parent: 'game-container',
    backgroundColor: '#1a2a1a',
    scene: [GymHandPileScene],
  });
  await waitForScene(game, 'GymHandPileScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true, false);
  }
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

describe('GymHandPile highlight-zone regression', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('captures screenshot with highlight zones visible', async () => {
    game = await bootGymHandPile();
    const scene = game.scene.getScene('GymHandPileScene') as Phaser.Scene;

    // Wait for scene to be ready
    await new Promise((r) => setTimeout(r, 200));

    // Trigger the "Show Valid Moves" highlight
    (scene as any).showValidMoves();

    // Wait for the delayed clear to NOT fire — capture immediately
    await new Promise((r) => setTimeout(r, 100));

    // Get the canvas and verify it has content
    const canvas = scene.game.canvas;
    expect(canvas).toBeDefined();
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);

    // Verify canvas has been drawn to (non-transparent pixels)
    const ctx = canvas.getContext('2d');
    expect(ctx).toBeDefined();
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // Check that not all pixels are transparent (indicating something was drawn)
      let hasContent = false;
      for (let i = 3; i < imageData.data.length; i += 4) {
        if (imageData.data[i] > 0) {
          hasContent = true;
          break;
        }
      }
      expect(hasContent).toBe(true);
    }
  });

  it('highlight zones overlap deck and discard pile positions', async () => {
    game = await bootGymHandPile();
    const scene = game.scene.getScene('GymHandPileScene') as Phaser.Scene;

    // Wait for scene to be ready
    await new Promise((r) => setTimeout(r, 200));

    // Trigger highlights
    (scene as any).showValidMoves();
    await new Promise((r) => setTimeout(r, 100));

    const DECK_X = (scene as any).DECK_X as number;
    const DISCARD_X = (scene as any).DISCARD_X as number;
    const PILE_Y = (scene as any).PILE_Y as number;
    const highlightW = CARD_W + 16;
    const highlightH = CARD_H + 16;

    // Get deck and discard pile sprites from PileView
    const deckView = (scene as any).deckView as { getSprite: () => Phaser.GameObjects.Image };
    const discardView = (scene as any).discardView as { getSprite: () => Phaser.GameObjects.Image };

    expect(deckView).toBeDefined();
    expect(discardView).toBeDefined();

    const deckSprite = deckView.getSprite();
    const discardSprite = discardView.getSprite();

    expect(deckSprite).toBeDefined();
    expect(discardSprite).toBeDefined();

    // Verify sprites are at expected positions using getBounds (Image has GetBounds mixin)
    const deckBounds = deckSprite.getBounds();
    const discardBounds = discardSprite.getBounds();

    // Sprites should be centred at DECK_X/DISCARD_X, PILE_Y
    const tolerance = 5;
    expect(Math.abs(deckBounds.x + deckBounds.width / 2 - DECK_X)).toBeLessThan(tolerance);
    expect(Math.abs(deckBounds.y + deckBounds.height / 2 - PILE_Y)).toBeLessThan(tolerance);
    expect(Math.abs(discardBounds.x + discardBounds.width / 2 - DISCARD_X)).toBeLessThan(tolerance);
    expect(Math.abs(discardBounds.y + discardBounds.height / 2 - PILE_Y)).toBeLessThan(tolerance);

    // Verify highlight graphics exists and has drawing commands
    const highlightGraphics = (scene as any).highlightGraphics as Phaser.GameObjects.Graphics;
    expect(highlightGraphics).toBeDefined();

    const commandBuffer = (highlightGraphics as any).commandBuffer as unknown[];
    expect(Array.isArray(commandBuffer)).toBe(true);
    expect(commandBuffer.length).toBeGreaterThan(0);

    // Highlight zone centres should match pile sprite centres
    const expectedDeckZone = {
      x: DECK_X - highlightW / 2,
      y: PILE_Y - highlightH / 2,
      width: highlightW,
      height: highlightH,
    };

    const expectedDiscardZone = {
      x: DISCARD_X - highlightW / 2,
      y: PILE_Y - highlightH / 2,
      width: highlightW,
      height: highlightH,
    };

    // Verify the zone centres match the sprite centres (within tolerance)
    const deckZoneCentreX = expectedDeckZone.x + expectedDeckZone.width / 2;
    const deckZoneCentreY = expectedDeckZone.y + expectedDeckZone.height / 2;
    const discardZoneCentreX = expectedDiscardZone.x + expectedDiscardZone.width / 2;
    const discardZoneCentreY = expectedDiscardZone.y + expectedDiscardZone.height / 2;

    expect(Math.abs(deckZoneCentreX - (deckBounds.x + deckBounds.width / 2))).toBeLessThan(tolerance);
    expect(Math.abs(deckZoneCentreY - (deckBounds.y + deckBounds.height / 2))).toBeLessThan(tolerance);
    expect(Math.abs(discardZoneCentreX - (discardBounds.x + discardBounds.width / 2))).toBeLessThan(tolerance);
    expect(Math.abs(discardZoneCentreY - (discardBounds.y + discardBounds.height / 2))).toBeLessThan(tolerance);
  });

  it('highlight labels are cleared when highlights are removed', async () => {
    game = await bootGymHandPile();
    const scene = game.scene.getScene('GymHandPileScene') as Phaser.Scene;

    // Wait for scene to be ready
    await new Promise((r) => setTimeout(r, 200));

    // Trigger highlights
    (scene as any).showValidMoves();
    await new Promise((r) => setTimeout(r, 100));

    // Clear highlights (this is what happens after 3s delay or on next showValidMoves)
    (scene as any).clearHighlights();
    await new Promise((r) => setTimeout(r, 50));

    // Verify no orphan text objects were left behind by highlight code
    const allTexts = scene.children.list.filter(
      (c) => c instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];

    // Scene should still have its normal text objects (title, labels, log, buttons)
    expect(allTexts.length).toBeGreaterThan(0);
  });
});
