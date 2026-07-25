/**
 * BeleagueredCastleMigration — smoke tests verifying HandView/PileView
 * integration after the Phase 2 shared-component migration.
 *
 * These tests run inside a real Chromium browser via Vitest browser mode
 * and Playwright. They boot the Beleaguered Castle scene once and verify
 * that tableau columns use HandView (vertical cascade) and foundation piles
 * use PileView.
 *
 * NOTE: A single Phaser game instance is shared across all tests to avoid
 * WebGL context exhaustion and the cumulative slowdown from destroying
 * and recreating games in headless Chromium.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

// ── Constants ───────────────────────────────────────────────
const TABLEAU_COUNT = 8;
const FOUNDATION_COUNT = 4;

// ── Shared game instance ────────────────────────────────────
let game: Phaser.Game | null = null;

/** Wait for N ms. */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait for the deal animation to finish (up to 60s).
 * Phaser browser tests in headless Chromium run the game loop at
 * a reduced frame rate, which proportionally slows tween animations.
 *
 * Also manually steps the Phaser game loop (game.loop.tick())
 * to ensure tweens advance even if requestAnimationFrame does not
 * fire consistently in headless Chromium when many Phaser games
 * are created and destroyed sequentially during the full test suite.
 */
async function waitForDeal(
  scene: Phaser.Scene & { isDealComplete(): boolean },
  timeoutMs: number = 60_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (scene.isDealComplete()) return;
    // Manually advance all tweens via the TweenManager's tick() method,
    // which is designed for manual stepping and always advances tweens
    // regardless of the internal timing state.
    // This handles the case where requestAnimationFrame may not fire
    // consistently in headless Chromium when many Phaser games are
    // created and destroyed sequentially during the full test suite.
    try {
      scene.tweens.tick();
    } catch {
      // If the tween manager is not available, fall through to polling
    }
    await wait(100);
  }
  throw new Error(`Deal animation did not complete within ${timeoutMs}ms`);
}

// ── Tests ───────────────────────────────────────────────────

describe('Beleaguered Castle HandView/PileView migration smoke test', () => {

  beforeAll(async () => {
    // Create a fresh container and boot the game once
    let container = document.getElementById('game-container');
    if (container) container.remove();
    container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    // Signal test mode: skip deal animation tweens to avoid timeouts
    // when game loop doesn't advance properly in headless Chromium.
    (window as any).__BC_TEST_REDUCED_MOTION__ = true;

    const { createBeleagueredCastleGame } = await import(
      '../../example-games/beleaguered-castle/createBeleagueredCastleGame'
    );
    game = createBeleagueredCastleGame({ type: Phaser.CANVAS });
    await waitForScene(game, 'BeleagueredCastleScene');
    // Wait for the deal to complete so it's ready for all tests
    const scene = game.scene.getScene('BeleagueredCastleScene') as any;
    await waitForDeal(scene);
  }, 180_000);

  afterAll(() => {
    if (game) {
      game.destroy(true, false);
      game = null;
    }
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  // ── Test 1: Foundation piles use PileView ─────────────────
  it('foundation piles are rendered via PileView', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
    await waitForDeal(scene);

    const renderer = scene.bcRenderer as any;
    expect(renderer).toBeDefined();

    const foundationPileViews: any[] = renderer.foundationPileViews;
    expect(foundationPileViews).toBeDefined();
    expect(foundationPileViews).toHaveLength(FOUNDATION_COUNT);

    for (let i = 0; i < FOUNDATION_COUNT; i++) {
      const pv = foundationPileViews[i];
      expect(pv).toBeDefined();
      expect(typeof pv.getSprite).toBe('function');
      expect(typeof pv.update).toBe('function');
      expect(typeof pv.setPile).toBe('function');
    }

    const foundationSprites = renderer.foundationSprites;
    expect(foundationSprites).toHaveLength(FOUNDATION_COUNT);
    for (let i = 0; i < FOUNDATION_COUNT; i++) {
      expect(foundationSprites[i]).toBeInstanceOf(Phaser.GameObjects.Image);
    }
  }, 120_000);

  // ── Test 2: Tableau columns use HandView (vertical cascade) ──
  it('tableau columns are rendered via HandView with vertical layout', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
    await waitForDeal(scene);

    const renderer = scene.bcRenderer as any;
    expect(renderer).toBeDefined();

    const tableauHandViews: any[] = renderer.tableauHandViews;
    expect(tableauHandViews).toBeDefined();
    expect(tableauHandViews).toHaveLength(TABLEAU_COUNT);

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const hv = tableauHandViews[col];
      expect(hv).toBeDefined();
      expect(typeof hv.getLayoutDirection).toBe('function');
      expect(typeof hv.setCards).toBe('function');
      expect(typeof hv.getSpriteAt).toBe('function');
      expect(typeof hv.getSprites).toBe('function');
      expect(hv.getLayoutDirection()).toBe('vertical');

      const sprites = hv.getSprites();
      expect(sprites.length).toBeGreaterThan(0);

      if (sprites.length > 1) {
        for (let i = 1; i < sprites.length; i++) {
          expect(sprites[i].y).toBeGreaterThan(sprites[i - 1].y);
        }
      }
    }
  }, 120_000);

  // ── Test 3: All tableau columns have correct number of cards after deal ──
  it('deals 6 cards to each tableau column', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
    await waitForDeal(scene);

    const renderer = scene.bcRenderer as any;
    const tableauHandViews: any[] = renderer.tableauHandViews;

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const hv = tableauHandViews[col];
      const sprites = hv.getSprites();
      expect(sprites).toHaveLength(6);
    }
  }, 120_000);
});
