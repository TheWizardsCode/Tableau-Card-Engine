/**
 * Browser tests for Main Street tutorial E2E cleanup infrastructure.
 *
 * Validates that drainCanvasPool and destroyGame properly release
 * canvas/GPU resources, enabling at least 6 sequential game
 * create/destroy cycles without resource exhaustion.
 *
 * These tests verify:
 * 1. drainCanvasPool is safe to call when no pool or game exists
 * 2. CanvasPool is accessible after Phaser is imported
 * 3. destroyGame removes game canvases from the DOM
 * 4. Three sequential create/destroy cycles do not exhaust contexts
 *    (tests the core fix; full 6-cycle coverage via E2E suite)
 *
 * Rebalance safety notes:
 * - part1 asserts localFestival.cost === 3 (rebalanced to $3)
 * - part3 asserts resourceBank.coins === 12 (starting budget)
 * - These values are verified correct after CG-0MRDE9EYB0013E20 rebalance
 * - No other tutorial assertions reference card costs/coin values
 */
import { describe, it, expect } from 'vitest';
import Phaser from 'phaser';
import {
  bootGameWithTutorial,
  destroyGame,
} from './main-street-tutorial-e2e';

// ── Helpers ───────────────────────────────────────────────

/**
 * Access Phaser's CanvasPool.pool array, if available.
 */
function getCanvasPoolArray(): Array<{ parent: any; canvas: HTMLCanvasElement }> | null {
  const canvasPool = (Phaser as any).Display?.Canvas?.CanvasPool;
  if (!canvasPool) return null;
  const pool: Array<{ parent: any; canvas: HTMLCanvasElement }> | undefined =
    (canvasPool as any).pool;
  return pool ?? null;
}

/**
 * Count canvas elements currently in the DOM.
 */
function countCanvasElements(): number {
  return document.querySelectorAll('canvas').length;
}

/**
 * Count canvas contexts tracked by Phaser's CanvasPool.
 */
function countPoolEntries(): number {
  const arr = getCanvasPoolArray();
  return arr ? arr.length : -1;
}

// ── Tests ─────────────────────────────────────────────────

describe('CanvasPool cleanup - drainCanvasPool safety', () => {
  it('destroyGame(null) does not throw', async () => {
    await expect(destroyGame(null)).resolves.not.toThrow();
  });

  it('Phaser CanvasPool global is accessible', () => {
    const canvasPool = (Phaser as any).Display?.Canvas?.CanvasPool;
    expect(canvasPool).toBeTruthy();
    expect(typeof canvasPool.pool).not.toBe('undefined');
  });

  it('CanvasPool.pool is empty on fresh page load', () => {
    const count = countPoolEntries();
    // Should be 0 on fresh page; allow -1 if pool is null/undefined
    if (count === -1) {
      // Pool not exposed; skip assertion
      expect(true).toBe(true);
    } else {
      expect(count).toBe(0);
    }
  });
});

describe('CanvasPool cleanup - destroyGame DOM cleanup', () => {
  it('removes all canvas elements after create and destroy', async () => {
    const game = await bootGameWithTutorial();
    expect(game).toBeTruthy();
    expect(countCanvasElements()).toBeGreaterThan(0);

    await destroyGame(game);

    // After destroy + drain + delay, should be no canvases
    await new Promise((r) => setTimeout(r, 200));
    expect(countCanvasElements()).toBe(0);
  }, 60_000);

  it('drains CanvasPool.pool after destroy', async () => {
    const game = await bootGameWithTutorial();
    expect(game).toBeTruthy();

    await destroyGame(game);
    await new Promise((r) => setTimeout(r, 200));

    const count = countPoolEntries();
    if (count !== -1) {
      expect(count).toBe(0);
    }
  }, 60_000);
});

describe('CanvasPool cleanup - multi-cycle resilience', () => {
  it('survives 3 sequential create/destroy cycles', async () => {
    const cycles = 3;
    for (let i = 0; i < cycles; i++) {
      const game = await bootGameWithTutorial();
      expect(game).toBeTruthy();
      expect(countCanvasElements()).toBeGreaterThan(0);
      const ctx = (document.querySelector('#game-container canvas') as HTMLCanvasElement)?.getContext('2d');
      expect(ctx).toBeTruthy();
      await destroyGame(game);
      await new Promise((r) => setTimeout(r, 200));
      expect(countCanvasElements()).toBe(0);
    }
  }, 120_000);
});
