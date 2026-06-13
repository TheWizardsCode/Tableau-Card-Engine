/**
 * BeleagueredCastleMigration — smoke tests verifying HandView/PileView
 * integration after the Phase 2 shared-component migration.
 *
 * These tests run inside a real Chromium browser via Vitest browser mode
 * and Playwright. They boot the Beleaguered Castle scene and verify that
 * tableau columns use HandView (vertical cascade) and foundation piles
 * use PileView.
 *
 * NOTE: Each test boots a fresh Phaser game which creates a WebGL context.
 * We keep total boots per file <= 3 to avoid context exhaustion.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

// ── Constants ───────────────────────────────────────────────
const TABLEAU_COUNT = 8;
const FOUNDATION_COUNT = 4;

// ── Helpers ─────────────────────────────────────────────────

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createBeleagueredCastleGame } = await import(
    '../../example-games/beleaguered-castle/createBeleagueredCastleGame'
  );
  const game = createBeleagueredCastleGame();
  await waitForScene(game, 'BeleagueredCastleScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true, false);
  }
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

/** Wait for a specific number of milliseconds. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for the deal animation to finish.
 */
async function waitForDeal(
  scene: Phaser.Scene & { isDealComplete(): boolean },
  timeoutMs: number = 10_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (scene.isDealComplete()) return;
    await wait(100);
  }
  throw new Error(`Deal animation did not complete within ${timeoutMs}ms`);
}

// ── Tests ───────────────────────────────────────────────────

describe('Beleaguered Castle HandView/PileView migration smoke test', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  // ── Test 1: Foundation piles use PileView ─────────────────
  it('foundation piles are rendered via PileView', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('BeleagueredCastleScene') as any;

    const renderer = scene.bcRenderer as any;
    expect(renderer).toBeDefined();

    // foundationPileViews should exist and contain PileView instances
    const foundationPileViews: any[] = renderer.foundationPileViews;
    expect(foundationPileViews).toBeDefined();
    expect(foundationPileViews).toHaveLength(FOUNDATION_COUNT);

    for (let i = 0; i < FOUNDATION_COUNT; i++) {
      const pv = foundationPileViews[i];
      expect(pv).toBeDefined();
      // Check that it looks like a PileView (has pile-related methods)
      expect(typeof pv.getSprite).toBe('function');
      expect(typeof pv.update).toBe('function');
      expect(typeof pv.setPile).toBe('function');
    }

    // Foundation sprites should be accessible and have correct positions
    const foundationSprites = renderer.foundationSprites;
    expect(foundationSprites).toHaveLength(FOUNDATION_COUNT);
    for (let i = 0; i < FOUNDATION_COUNT; i++) {
      expect(foundationSprites[i]).toBeInstanceOf(Phaser.GameObjects.Image);
    }
  });

  // ── Test 2: Tableau columns use HandView (vertical cascade) ──
  it('tableau columns are rendered via HandView with vertical layout', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('BeleagueredCastleScene') as any;
    await waitForDeal(scene as any);

    const renderer = scene.bcRenderer as any;
    expect(renderer).toBeDefined();

    // tableauHandViews should exist and contain HandView instances
    const tableauHandViews: any[] = renderer.tableauHandViews;
    expect(tableauHandViews).toBeDefined();
    expect(tableauHandViews).toHaveLength(TABLEAU_COUNT);

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const hv = tableauHandViews[col];
      expect(hv).toBeDefined();

      // Check that it looks like a HandView
      expect(typeof hv.getLayoutDirection).toBe('function');
      expect(typeof hv.setCards).toBe('function');
      expect(typeof hv.getSpriteAt).toBe('function');
      expect(typeof hv.getSprites).toBe('function');

      // Verify layout direction is vertical
      expect(hv.getLayoutDirection()).toBe('vertical');

      // Each column should have sprites after deal
      const sprites = hv.getSprites();
      expect(sprites.length).toBeGreaterThan(0);

      // Verify cards overlap vertically (Y positions should be increasing)
      if (sprites.length > 1) {
        for (let i = 1; i < sprites.length; i++) {
          expect(sprites[i].y).toBeGreaterThan(sprites[i - 1].y);
        }
      }
    }
  });

  // ── Test 3: All tableau columns have correct number of cards after deal ──
  it('deals 6 cards to each tableau column', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('BeleagueredCastleScene') as any;
    await waitForDeal(scene as any);

    const renderer = scene.bcRenderer as any;
    const tableauHandViews: any[] = renderer.tableauHandViews;

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const hv = tableauHandViews[col];
      const sprites = hv.getSprites();
      expect(sprites).toHaveLength(6);
    }
  });
});
