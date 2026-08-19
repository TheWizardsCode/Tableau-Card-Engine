/**
 * Main Street: Market Deal-In Animation Browser Tests
 *
 * Verifies the market deal-in animation end to end in a real Phaser scene:
 *
 * 1. Starting a new day (`startDayPhase`) refills the market and triggers
 *    `MainStreetAnimator.animateMarketDealIn` for the single market row. The
 *    rendered cards enter a "dealt" state (scale 0.6, faint) synchronously
 *    and tween back to full scale.
 * 2. Under reduced motion the animation is skipped entirely — cards appear
 *    at full scale instantly and no transforms are applied.
 *
 * The animation is presentation-only: it never mutates game state, the
 * transcript, or the turn flow (the market refill + render already happened
 * before the animation runs).
 *
 * @module tests/main-street/market-deal-in.browser
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';

// ── Boot helpers (mirrors MainStreetScene.browser.test.ts) ──

async function bootGame(options: { width?: number; height?: number } = {}): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();

  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame(options);
  await waitForScene(game, 'MainStreetScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true, false);
  }
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

async function waitForCondition(
  predicate: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 25;
  const label = options.label ?? 'condition';
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}

/** Observable deal-in call as captured by the test spy wrapper. */
interface DealInCall {
  row: string;
  cards: Array<{ scaleX: number }>;
  /** First card's scale read synchronously right after the real method ran. */
  scaleAtCall: number;
}

/**
 * Spies on `animateMarketDealIn` while still running the real implementation,
 * capturing each call's rendered cards plus the first card's scale read
 * synchronously after the animation applied its dealt state.
 */
function spyOnMarketDealIn(scene: Phaser.Scene & Record<string, unknown>): {
  spy: ReturnType<typeof vi.spyOn>;
  calls: DealInCall[];
} {
  const animator = scene.msAnimator as unknown as {
    animateMarketDealIn: (params: { row: string; cards: Array<{ scaleX: number }> }) => void;
  };
  const original = animator.animateMarketDealIn.bind(animator);
  const calls: DealInCall[] = [];

  const spy = vi.spyOn(animator, 'animateMarketDealIn').mockImplementation((params) => {
    original(params);
    calls.push({
      row: params.row,
      cards: [...params.cards],
      scaleAtCall: params.cards[0]?.scaleX ?? 1,
    });
  });

  return { spy, calls };
}

describe('MainStreet market deal-in animation', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    const moduleUrl = (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE_URL__;
    if (typeof moduleUrl === 'string' && moduleUrl.startsWith('blob:')) {
      URL.revokeObjectURL(moduleUrl);
    }

    delete (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE__;
    delete (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE_URL__;
    delete (globalThis as unknown as Record<string, unknown>).__TF_PLAY_COUNT__;
    destroyGame(game);
    game = null;
  });

  it('deals the refilled market in on day start (single row, staggered, back to full scale)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    const { calls } = spyOnMarketDealIn(scene);

    // Day 2 start: executeDayStart requires the DayStart phase, then refills
    // the market row; the deal-in animation runs after the final
    // (post-prewarm) render.
    (scene.state as { phase: string }).phase = 'DayStart';
    (scene.msTurnController as unknown as { startDayPhase: (skipMarketRefill?: boolean) => void }).startDayPhase();

    // The single market row deals in, with the rendered cards captured at call time.
    await waitForCondition(() => calls.length >= 1, { label: 'deal-in call for the market row' });

    const rows = calls.map((c) => c.row);
    expect(rows).toContain('market');

    for (const call of calls) {
      expect(call.cards.length).toBeGreaterThan(0);
      // Dealt state applied synchronously in the same frame as the draw.
      expect(call.scaleAtCall).toBeCloseTo(0.6, 1);
    }

    // The staggered deal-in tweens complete: cards return to full scale.
    const marketCall = calls.find((c) => c.row === 'market');
    expect(marketCall).toBeDefined();
    await waitForCondition(() => (marketCall!.cards[0]?.scaleX ?? 0) >= 0.99, {
      timeoutMs: 5000,
      label: 'first market card to return to full scale',
    });
  }, 30_000);

  it('skips the animation under reduced motion (cards stay at full scale instantly)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    // Force reduced motion on the settings panel.
    (scene as unknown as { settingsPanel: { reducedMotion: boolean } }).settingsPanel = { reducedMotion: true };

    const { calls } = spyOnMarketDealIn(scene);

    (scene.state as { phase: string }).phase = 'DayStart';
    (scene.msTurnController as unknown as { startDayPhase: (skipMarketRefill?: boolean) => void }).startDayPhase();

    await waitForCondition(() => calls.length >= 1, { label: 'deal-in call (reduced motion)' });

    for (const call of calls) {
      // The animator is still called (the trigger point is unchanged) but
      // returns early: no dealt state is applied, cards stay full scale.
      expect(call.cards.length).toBeGreaterThan(0);
      expect(call.scaleAtCall).toBe(1);
    }
  }, 30_000);
});
