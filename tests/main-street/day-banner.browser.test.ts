/**
 * Main Street: Day Transition Banner Browser Tests
 *
 * Verifies the day-start banner trigger end to end in a real Phaser scene:
 *
 * 1. `startDayPhase()` triggers `MainStreetAnimator.animateDayBanner` with
 *    the current day — including the first day (day 1).
 * 2. The banner is skipped while the tutorial is active (its step overlays
 *    carry the guidance) and on checkpoint resume (`skipMarketRefill=true` —
 *    the same day continues).
 * 3. Under reduced motion the trigger still fires (the animator degrades
 *    internally — covered by unit tests).
 *
 * The banner is non-interactive and non-blocking; the market remains fully
 * interactive the whole time.
 *
 * @module tests/main-street/day-banner.browser
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

interface BannerCall {
  day: number;
}

function spyOnDayBanner(scene: Phaser.Scene & Record<string, unknown>): { calls: BannerCall[] } {
  const animator = scene.msAnimator as unknown as {
    animateDayBanner: (params: BannerCall) => void;
  };
  const original = animator.animateDayBanner.bind(animator);
  const calls: BannerCall[] = [];
  vi.spyOn(animator, 'animateDayBanner').mockImplementation((params) => {
    calls.push(params);
    original(params); // run the real implementation so the visuals run
  });
  return { calls };
}

describe('MainStreet day banner', () => {
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

  it('fires the banner with the current day on a new-day start (including day 1)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    // Ensure the tutorial is not active so the banner is eligible.
    (scene as unknown as { tutorialController?: unknown }).tutorialController = undefined;

    const { calls } = spyOnDayBanner(scene);

    (scene.state as { phase: string }).phase = 'DayStart';
    (scene.msTurnController as unknown as { startDayPhase: (skipMarketRefill?: boolean) => void }).startDayPhase();

    await waitForCondition(() => calls.length >= 1, { timeoutMs: 5000, label: 'day banner trigger' });
    expect(calls).toHaveLength(1);
    expect(calls[0].day).toBe((scene.state as { turn: number }).turn);
  }, 30_000);

  it('does NOT fire while the tutorial is active or on checkpoint resume', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    const { calls } = spyOnDayBanner(scene);

    // Tutorial active → skipped.
    (scene as unknown as { tutorialController?: unknown }).tutorialController = { isActive: true };
    (scene.state as { phase: string }).phase = 'DayStart';
    (scene.msTurnController as unknown as { startDayPhase: (skipMarketRefill?: boolean) => void }).startDayPhase();
    expect(calls).toHaveLength(0);

    // Checkpoint resume (same day continues) → skipped.
    (scene as unknown as { tutorialController?: unknown }).tutorialController = undefined;
    (scene.state as { phase: string }).phase = 'DayStart';
    (scene.msTurnController as unknown as { startDayPhase: (skipMarketRefill?: boolean) => void }).startDayPhase(true);
    expect(calls).toHaveLength(0);
  }, 30_000);

  it('still fires the trigger under reduced motion (animator degrades internally)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    (scene as unknown as { tutorialController?: unknown }).tutorialController = undefined;
    (scene as unknown as { settingsPanel: { reducedMotion: boolean } }).settingsPanel = { reducedMotion: true };

    const { calls } = spyOnDayBanner(scene);

    (scene.state as { phase: string }).phase = 'DayStart';
    (scene.msTurnController as unknown as { startDayPhase: (skipMarketRefill?: boolean) => void }).startDayPhase();

    await waitForCondition(() => calls.length >= 1, { timeoutMs: 5000, label: 'day banner trigger (reduced motion)' });
    expect(calls).toHaveLength(1);
  }, 30_000);
});
