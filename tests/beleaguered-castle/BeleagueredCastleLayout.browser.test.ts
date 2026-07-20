/**
 * BeleagueredCastleScene layout regression tests.
 *
 * Guards against the recurring regression where card dimensions are
 * changed by refactoring work, causing tableau columns to overlap or
 * cards to extend beyond the game viewport.
 *
 * Previous regressions:
 *   - 90×126 cards with 14px gap → columns too close / overlapping
 *     (fixed in commit 0409463, reduced to 68×95 with 18px gap)
 *
 * These tests run inside a real Chromium browser via Vitest browser mode
 * and Playwright. They boot the Beleaguered Castle scene and verify
 * that card sprites are correctly sized and positioned.
 *
 * NOTE: Each test boots a fresh Phaser game which creates a WebGL context.
 * We keep total boots per file <= 3 to avoid context exhaustion.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

// ── Constants (must match BeleagueredCastleScene values) ────
// These are duplicated here intentionally so that tests fail when
// scene constants change without updating both locations.
const GAME_W = 1280;
const GAME_H = 720;
const TABLEAU_COUNT = 8;
const FOUNDATION_COUNT = 4;

// ── Helpers ─────────────────────────────────────────────────

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  // Signal to the scene that this is a test run, so the deal animation
  // should skip tweens (reduced motion). This prevents timeouts when
  // the Phaser game loop does not advance tweens in headless Chromium
  // after sequential game create/destroy cycles.
  (window as any).__BC_TEST_REDUCED_MOTION__ = true;

  const { createBeleagueredCastleGame } = await import(
    '../../example-games/beleaguered-castle/createBeleagueredCastleGame'
  );
  const game = createBeleagueredCastleGame({ type: Phaser.CANVAS });
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
 * Polls the scene's isDealComplete() accessor.
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
  throw new Error(
    `Deal animation did not complete within ${timeoutMs}ms`,
  );
}

/**
 * Get scene private properties via type-safe cast.
 * BeleagueredCastleScene stores card sprites in private arrays;
 * we access them for layout verification.
 */
function getSceneInternals(scene: Phaser.Scene): {
  tableauSprites: Phaser.GameObjects.Image[][];
  foundationSprites: Phaser.GameObjects.Image[];
  foundationDropZones: Phaser.GameObjects.Zone[];
  tableauDropZones: Phaser.GameObjects.Zone[];
} {
   
  return scene as any;
}

// ── Tests ───────────────────────────────────────────────────

describe('BeleagueredCastleScene layout regression tests', () => {
  let game: Phaser.Game | null = null;

  beforeAll(async () => {
    game = await bootGame();
  }, 120_000);

  afterAll(() => {
    destroyGame(game);
    game = null;
  });

  // ── Test 1: Tableau columns do not overlap horizontally ──
  it('should lay out 8 tableau columns without horizontal overlap', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene')!;
    await waitForDeal(scene as Phaser.Scene & { isDealComplete(): boolean });

    const internals = getSceneInternals(scene);
    const { tableauSprites } = internals;

    // There should be exactly 8 columns
    expect(tableauSprites).toHaveLength(TABLEAU_COUNT);

    // Each column should have at least 1 card after deal
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      expect(
        tableauSprites[col].length,
        `Column ${col} should have cards`,
      ).toBeGreaterThan(0);
    }

    // For each adjacent pair of columns, the right edge of the left column
    // must be strictly less than the left edge of the right column.
    // This ensures no horizontal overlap between columns.
    for (let col = 0; col < TABLEAU_COUNT - 1; col++) {
      const leftColSprites = tableauSprites[col];
      const rightColSprites = tableauSprites[col + 1];

      // Get the rightmost edge of any card in the left column
      const leftColRightEdge = Math.max(
        ...leftColSprites.map((s) => s.x + s.displayWidth / 2),
      );

      // Get the leftmost edge of any card in the right column
      const rightColLeftEdge = Math.min(
        ...rightColSprites.map((s) => s.x - s.displayWidth / 2),
      );

      const gap = rightColLeftEdge - leftColRightEdge;

      expect(
        leftColRightEdge,
        `Column ${col} right edge (${leftColRightEdge}) should be ` +
          `less than column ${col + 1} left edge (${rightColLeftEdge})`,
      ).toBeLessThan(rightColLeftEdge);

      // Ensure a minimum visual gap between columns (16px).
      // The previous regression had only 14px which was visually cramped.
      expect(
        gap,
        `Gap between column ${col} and ${col + 1} is ${gap}px, ` +
          `should be at least 16px for clear visual separation`,
      ).toBeGreaterThanOrEqual(16);
    }
}, 120_000);

  // ── Test 2: All cards and foundations fit within viewport ──
  it('should keep all cards and foundations within the game viewport', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene')!;
    await waitForDeal(scene as Phaser.Scene & { isDealComplete(): boolean });

    const internals = getSceneInternals(scene);

    // Collect all card sprites (tableau + foundations)
    const allSprites: Phaser.GameObjects.Image[] = [];

    for (const col of internals.tableauSprites) {
      allSprites.push(...col);
    }
    allSprites.push(...internals.foundationSprites);

    expect(allSprites.length).toBeGreaterThan(0);

    // Every card sprite must fit within the game viewport (0,0)-(GAME_W, GAME_H)
    for (const sprite of allSprites) {
      const leftEdge = sprite.x - sprite.displayWidth / 2;
      const rightEdge = sprite.x + sprite.displayWidth / 2;
      const topEdge = sprite.y - sprite.displayHeight / 2;
      const bottomEdge = sprite.y + sprite.displayHeight / 2;

      expect(
        leftEdge,
        `Card at (${sprite.x}, ${sprite.y}) left edge ${leftEdge} should be >= 0`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        rightEdge,
        `Card at (${sprite.x}, ${sprite.y}) right edge ${rightEdge} should be <= ${GAME_W}`,
      ).toBeLessThanOrEqual(GAME_W);
      expect(
        topEdge,
        `Card at (${sprite.x}, ${sprite.y}) top edge ${topEdge} should be >= 0`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        bottomEdge,
        `Card at (${sprite.x}, ${sprite.y}) bottom edge ${bottomEdge} should be <= ${GAME_H}`,
      ).toBeLessThanOrEqual(GAME_H);
    }
}, 120_000);

  // ── Test 3: Foundations do not overlap with tableau ────────
  it('should not overlap foundation slots with tableau columns', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene')!;
    await waitForDeal(scene as Phaser.Scene & { isDealComplete(): boolean });

    const internals = getSceneInternals(scene);

    // Foundation bottom edge must be above the topmost tableau card top edge
    const foundationBottomEdges = internals.foundationSprites.map(
      (s) => s.y + s.displayHeight / 2,
    );
    const maxFoundationBottom = Math.max(...foundationBottomEdges);

    // Find the topmost card across all tableau columns
    const allTableauTopEdges: number[] = [];
    for (const col of internals.tableauSprites) {
      if (col.length > 0) {
        allTableauTopEdges.push(
          Math.min(...col.map((s) => s.y - s.displayHeight / 2)),
        );
      }
    }
    const minTableauTop = Math.min(...allTableauTopEdges);

    expect(
      maxFoundationBottom,
      `Foundation bottom (${maxFoundationBottom}) must be above ` +
        `tableau top (${minTableauTop})`,
    ).toBeLessThan(minTableauTop);

    // Foundation slots should not overlap each other horizontally
    expect(internals.foundationSprites).toHaveLength(FOUNDATION_COUNT);
    for (let i = 0; i < FOUNDATION_COUNT - 1; i++) {
      const leftSlot = internals.foundationSprites[i];
      const rightSlot = internals.foundationSprites[i + 1];

      const leftRight = leftSlot.x + leftSlot.displayWidth / 2;
      const rightLeft = rightSlot.x - rightSlot.displayWidth / 2;

      expect(
        leftRight,
        `Foundation slot ${i} right edge (${leftRight}) must be less than ` +
          `slot ${i + 1} left edge (${rightLeft})`,
      ).toBeLessThan(rightLeft);
    }
}, 120_000);
});
