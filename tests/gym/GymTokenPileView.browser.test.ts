/**
 * GymTokenPileView Browser Test
 *
 * Boots GymTokenPileViewScene in a headless Phaser browser environment and
 * verifies that:
 * - Scene renders token piles with different renderers
 * - Add/remove operations update visual state
 * - Click events are captured
 * - Both built-in renderers are displayed
 *
 * @module tests/gym/GymTokenPileView.browser.test.ts
 */

import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { GymTokenPileViewScene } from '../../example-games/gym/scenes/GymTokenPileViewScene';
import { GYM_TOKEN_PILE_VIEW_KEY } from '../../example-games/gym/GymRegistry';
import { waitForScene } from '../helpers/waitForScene';

describe('GymTokenPileViewScene smoke test', () => {
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
      type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [GymTokenPileViewScene],
    });

    await waitForScene(game, GYM_TOKEN_PILE_VIEW_KEY);
    const scene = game.scene.getScene(GYM_TOKEN_PILE_VIEW_KEY);
    expect(scene).toBeTruthy();
    expect(scene.sys.isActive()).toBe(true);
    return scene;
  }

  /**
   * Count TokenPileView containers by looking for Phaser containers with
   * non-zero size that contain text objects (count labels).
   */
  function countTokenPileContainers(scene: Phaser.Scene): number {
    return scene.children.list.filter(
      (child) =>
        child instanceof Phaser.GameObjects.Container &&
        (child as Phaser.GameObjects.Container).length > 1,
    ).length;
  }

  // ── AC 2: At least 3 token piles with different renderers ──

  it('renders at least 3 token piles with different renderers (AC 2)', async () => {
    const scene = await bootScene();
    const containers = countTokenPileContainers(scene);
    expect(containers).toBeGreaterThanOrEqual(3);
  });

  // ── AC 3: Add/remove operations update visual state ───────

  it('adds and removes tokens updating count labels (AC 3)', async () => {
    const scene = await bootScene();

    // We need a reference to the scene as GymTokenPileViewScene to call add/remove
    const tokenScene = scene as unknown as {
      addTokenToPile: (pileIndex: number) => void;
      removeTokenFromPile: (pileIndex: number) => void;
      getPileCounts: () => number[];
    };

    expect(tokenScene.getPileCounts).toBeDefined();
    const initialCounts = tokenScene.getPileCounts();

    // Add a token to the first pile (random count 1-3)
    tokenScene.addTokenToPile(0);
    const afterAddCounts = tokenScene.getPileCounts();
    expect(afterAddCounts[0]).toBeGreaterThan(initialCounts[0]);

    // Remove the added token
    tokenScene.removeTokenFromPile(0);
    const afterRemoveCounts = tokenScene.getPileCounts();
    // Should return to original count since the added token was removed
    expect(afterRemoveCounts[0]).toBe(initialCounts[0]);
  });

  // ── AC 4: Click events captured in event log ──────────────

  it('captures click events on token piles (AC 4)', async () => {
    const scene = await bootScene();
    const tokenScene = scene as unknown as {
      getEventLogEntries: () => string[];
      getFirstPileContainer: () => Phaser.GameObjects.Container;
    };

    expect(tokenScene.getEventLogEntries).toBeDefined();
    expect(tokenScene.getFirstPileContainer).toBeDefined();

    const logBefore = tokenScene.getEventLogEntries().length;

    // Emit pointerdown on the first pile's container
    const container = tokenScene.getFirstPileContainer();
    container.emit('pointerdown');

    const logAfter = tokenScene.getEventLogEntries().length;
    expect(logAfter).toBeGreaterThan(logBefore);
  });

  // ── AC 5: Both built-in renderers demonstrated ────────────

  it('demonstrates both built-in renderers (simple token and card back) (AC 5)', async () => {
    const scene = await bootScene();
    const tokenScene = scene as unknown as {
      hasSimpleTokenRenderer: boolean;
      hasCardBackRenderer: boolean;
      hasCustomRenderer: boolean;
    };

    expect(tokenScene.hasSimpleTokenRenderer).toBe(true);
    expect(tokenScene.hasCardBackRenderer).toBe(true);
  });

  // ── AC 1-4: Card-back pile renders visible sprites ────────

  /**
   * Collect the texture keys of all Image sprites in the card-back pile
   * container. A "missing texture" sprite reports the '__MISSING' key.
   */
  function cardBackImageKeys(container: Phaser.GameObjects.Container): string[] {
    return container.list
      .filter((child) => child instanceof Phaser.GameObjects.Image)
      .map((img) => (img as Phaser.GameObjects.Image).texture.key);
  }

  it('renders card-back tokens with visible textures across load/add/remove/reset (AC 1-4)', async () => {
    const scene = await bootScene();
    const tokenScene = scene as unknown as {
      getCardBackPileContainer: () => Phaser.GameObjects.Container;
      addTokenToPile: (pileIndex: number) => void;
      removeTokenFromPile: (pileIndex: number) => void;
      // resetPiles is private; invoked through the [ Reset All ] handler path
      resetPiles: () => void;
    };

    expect(tokenScene.getCardBackPileContainer).toBeDefined();
    const container = tokenScene.getCardBackPileContainer();

    const assertAllVisible = (keys: string[], expectedCount: number): void => {
      expect(keys.length).toBe(expectedCount);
      for (const key of keys) {
        // Key must resolve to a real texture (not Phaser's '__MISSING')
        expect(scene.textures.exists(key)).toBe(true);
        expect(key).toBe('gym_token_card_back');
      }
    };

    // AC 1: 5 default card-back tokens all visible on scene load
    assertAllVisible(cardBackImageKeys(container), 5);

    // AC 2: [+ Card Back] adds a token that is also visible
    tokenScene.addTokenToPile(1);
    assertAllVisible(cardBackImageKeys(container), 6);

    // AC 3: [- Card Back] removes a token without error
    tokenScene.removeTokenFromPile(1);
    assertAllVisible(cardBackImageKeys(container), 5);

    // AC 4: [ Reset All ] restores defaults with all tokens visible
    tokenScene.resetPiles();
    assertAllVisible(cardBackImageKeys(container), 5);
  });
});
