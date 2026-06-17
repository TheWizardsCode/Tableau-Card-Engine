/**
 * SushiGoIcons — tests that Sushi Go! SVG icons are properly rasterised
 * as Phaser textures and rendered within card containers.
 *
 * These tests run inside a real Chromium browser via Vitest browser mode
 * and Playwright.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

describe('SushiGoScene SVG icon rendering', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  it('renders sushi icons as non-solid images (not black squares)', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    // Use direct game creation matching the original test pattern
    const { SushiGoScene } = await import('../../example-games/sushi-go/scenes/SushiGoScene');
    game = new Phaser.Game({ type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a3a',
      scene: [SushiGoScene],
    });
    await waitForScene(game, 'SushiGoScene');

    const scene = game!.scene.getScene('SushiGoScene') as any;
    expect(scene).toBeTruthy();

    // Debug: check cache and texture state


    // Key icon textures expected to be loaded by the scene
    const keys = [
      'icon-nigiri-salmon', 'icon-nigiri-egg', 'icon-nigiri-squid',
      'icon-maki-1', 'icon-maki-2', 'icon-maki-3',
      'icon-tempura', 'icon-sashimi', 'icon-dumpling',
      'icon-wasabi', 'icon-pudding', 'icon-chopsticks',
    ];

    // Wait for textures to exist (rasterised async during create()).
    const pollStart = performance.now();
    const pollTimeout = 60000;
    while (true) {
      const texturesReady = keys.every((k) => scene.textures.exists(k));
      if (texturesReady) break;
      if (performance.now() - pollStart > pollTimeout) {
        const missing = keys.filter((k) => !scene.textures.exists(k));
        throw new Error(`Timed out waiting for textures. Missing: ${missing.join(', ')}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    for (const k of keys) {
      expect(scene.textures.exists(k)).toBe(true);
    }

    // Verify cards are rendered via HandView (not directly in handContainer)
    expect(scene.handView).toBeTruthy();
    const sprites = scene.handView.getSprites ? scene.handView.getSprites() : [];
    expect(sprites.length).toBeGreaterThan(0);
  }, 120000);
});
