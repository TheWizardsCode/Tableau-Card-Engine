/**
 * GolfScene browser tests -- verify the Phaser game boots, renders
 * a canvas, and displays the expected initial game state.
 *
 * These tests run inside a real Chromium browser via Vitest browser mode
 * and Playwright. They validate that the Golf UI renders correctly and
 * that game objects are created as expected.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

// Helper: create a game container div and boot the golf game
async function bootGame(): Promise<Phaser.Game> {
  // Ensure a fresh container
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  // Import the factory dynamically to avoid module-level side effects
  const { createGolfGame } = await import(
    '../../example-games/golf/createGolfGame'
  );
  const game = createGolfGame({ type: Phaser.CANVAS });

  // Wait for the game to boot and the scene to become active
  await waitForScene(game, 'GolfScene');

  return game;
}

// Helper: destroy the game cleanly after each test
function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true, false);
  }
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

describe('GolfScene browser tests', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('should render a canvas element inside the game container', async () => {
    game = await bootGame();

    const container = document.getElementById('game-container');
    expect(container).not.toBeNull();

    const canvas = container!.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas!.width).toBeGreaterThan(0);
    expect(canvas!.height).toBeGreaterThan(0);
  });

  it('should create the GolfScene as the active scene', async () => {
    game = await bootGame();

    const scene = game.scene.getScene('GolfScene');
    expect(scene).toBeDefined();
    expect(scene.sys.isActive()).toBe(true);
  });

  it('should create 18 card sprites (9 per player grid)', async () => {
    game = await bootGame();

    const scene = game.scene.getScene('GolfScene') as Phaser.Scene;

    // Count Image game objects (cards are rendered as Phaser Images)
    const images = scene.children.list.filter(
      (child) => child instanceof Phaser.GameObjects.Image,
    );

    // We expect at least 18 grid cards + 2 pile cards (stock + discard) +
    // possibly a drawn card sprite = at minimum 20 images
    // But at the start, we have exactly:
    //   9 human grid + 9 AI grid + 1 stock + 1 discard = 20
    expect(images.length).toBeGreaterThanOrEqual(20);
  });

  it('should display text elements for labels, scores, and instructions', async () => {
    game = await bootGame();

    const scene = game.scene.getScene('GolfScene') as Phaser.Scene;

    // Collect all text game objects from scene children and hudContainer
    // (HUD text is now parented into hudContainer after the container-refactoring)
    const sceneTexts = scene.children.list.filter(
      (child) => child instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];

    const hudContainer = (scene as any).hudContainer as {
      getAll?: () => Phaser.GameObjects.GameObject[];
      list?: Phaser.GameObjects.GameObject[];
    };
    // Phaser 4 Container exposes children via .getAll() or .list (not .children.list)
    const hudAllObjects = hudContainer?.getAll?.() ?? hudContainer?.list ?? [];
    const hudTexts = hudAllObjects.filter(
      (child) => child instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];

    const texts = [...sceneTexts, ...(hudTexts as Phaser.GameObjects.Text[])];

    // Extract text content
    const textContents = texts.map((t) => t.text);

    // Check for essential UI text
    expect(textContents).toContain('9-Card Golf');
    expect(textContents).toContain('You');
    expect(textContents).toContain('AI');

    // Check that stock and discard pile labels are present (PileView shows "Stock: N")
    const hasStock = textContents.some((t) => t.startsWith('Stock:'));
    expect(hasStock).toBe(true);

    const hasDiscard = textContents.some((t) => t.startsWith('Discard:'));
    expect(hasDiscard).toBe(true);

    // Check that there's a score display
    const hasScore = textContents.some((t) => t.startsWith('Score:'));
    expect(hasScore).toBe(true);

    // Check that there's a turn indicator
    const hasTurn = textContents.some((t) => t.includes('turn'));
    expect(hasTurn).toBe(true);

    // Check instruction text is present
    const hasInstruction = textContents.some(
      (t) => t.includes('Click') || t.includes('AI is thinking'),
    );
    expect(hasInstruction).toBe(true);
  });

  it('should have interactive stock and discard pile sprites', async () => {
    game = await bootGame();

    const scene = game.scene.getScene('GolfScene') as Phaser.Scene;

    const images = scene.children.list.filter(
      (child) => child instanceof Phaser.GameObjects.Image,
    ) as Phaser.GameObjects.Image[];

    // Find interactive images (stock and discard piles + human grid cards)
    const interactiveImages = images.filter((img) => img.input?.enabled);

    // At minimum: 9 human grid cards + 1 stock + 1 discard = 11 interactive
    expect(interactiveImages.length).toBeGreaterThanOrEqual(11);
  });

  it('should not have any console errors during initialization', async () => {
    // Capture console errors
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
      originalError.apply(console, args);
    };

    try {
      game = await bootGame();
      // Allow a frame for any deferred errors
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(errors).toEqual([]);
    } finally {
      console.error = originalError;
    }
  });
});
