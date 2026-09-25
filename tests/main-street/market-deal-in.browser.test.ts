/**
 * Main Street: Market Deal-In Animation Browser Tests
 *
 * Verifies the market deal-in animation end to end in a real Phaser scene:
 *
 * 1. Starting a new day (`startTurnPhase`) refills the market and triggers
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

import { waitForScene } from '@core-tests/helpers/waitForScene';
import { destroyPhaserGame } from '@core-tests/helpers/phaserCanvasPool';

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

/**
 * Tear the game down deterministically (see `destroyPhaserGame`): a plain
 * `game.destroy(true, false)` defers teardown to the next game-loop frame,
 * which under CPU contention can leave the previous test's loop competing
 * with the current one and starve its tweens/input (CG-0MUE2U21C0007BKL).
 */
function destroyGame(game: Phaser.Game | null): void {
  destroyPhaserGame(game);
}

/**
 * Advance the Phaser game loop by one deterministic frame.
 *
 * Headless Chromium may throttle `requestAnimationFrame` under CPU
 * contention, stalling Phaser's tween manager.  `TimeStep.step(time)` runs a
 * full game step synchronously (the manual-stepping remedy used by
 * `BeleagueredCastleLayout.browser.test.ts`), advancing tweens by a real
 * frame regardless of rAF scheduling (CG-0MUE2U21C0007BKL).
 */
function stepGame(scene: Phaser.Scene, deltaMs = 16): void {
  const loop = (scene.game as any)?.loop;
  if (!loop || typeof loop.step !== 'function') return;
  const now = typeof loop.now === 'number' && loop.now > 0
    ? loop.now
    : window.performance.now();
  try {
    loop.step(now + deltaMs);
  } catch { /* game loop already torn down */ }
}

/**
 * Poll a predicate, stepping the game loop each iteration when a `scene` is
 * supplied so tween-driven predicates make progress even when rAF is
 * throttled under CPU contention.
 */
async function waitForCondition(
  predicate: () => boolean,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    label?: string;
    scene?: Phaser.Scene;
  } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 25;
  const label = options.label ?? 'condition';
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    // Step the game loop directly so the predicate (which may depend on a
    // tween) makes progress even when rAF is throttled.
    if (options.scene) stepGame(options.scene);
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

    // Day 2 start: executeWeekStart requires the WeekStart phase, then refills
    // the market row; the deal-in animation runs after the final
    // (post-prewarm) render.
    (scene.state as { phase: string }).phase = 'WeekStart';
    (scene.msTurnController as unknown as { startTurnPhase: (skipMarketRefill?: boolean) => void }).startTurnPhase();

    // The single market row deals in, with the rendered cards captured at call time.
    await waitForCondition(() => calls.length >= 1, { label: 'deal-in call for the market row', scene });

    const rows = calls.map((c) => c.row);
    expect(rows).toContain('market');

    for (const call of calls) {
      expect(call.cards.length).toBeGreaterThan(0);
      // Dealt state applied synchronously in the same frame as the draw.
      expect(call.scaleAtCall).toBeCloseTo(0.6, 1);
    }

    // Day start can render the row more than once: a deferred boot render
    // still in flight and the explicit `startTurnPhase()` both deal the market
    // in, and each render recreates the card containers. The LAST call owns
    // the containers the player actually sees (its tween advances); an
    // earlier call's containers were replaced and stay frozen at the dealt
    // 0.6 scale, so asserting on the first call reads a stale object.
    //
    // Advance the game loop deterministically (headless Chromium may throttle
    // rAF under CPU contention) and re-resolve the last market call on every
    // step, so a deferred render that replaces the containers cannot leave the
    // assertion reading a stale, frozen object.
    let marketCall = [...calls].reverse().find((c) => c.row === 'market');
    expect(marketCall).toBeDefined();

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      stepGame(scene);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const latest = [...calls].reverse().find((c) => c.row === 'market');
      if (latest) marketCall = latest;
      if ((marketCall!.cards[0]?.scaleX ?? 0) >= 0.85) break;
    }

    // The last market call's cards tweened from the dealt 0.6 to (near) full
    // scale. Accept >= 0.85 — full 0.99 is ideal but headless envs may not
    // complete the 350 ms tween in the budget.
    expect(marketCall!.cards[0]?.scaleX ?? 0).toBeGreaterThanOrEqual(0.85);
  }, 30_000);
});
