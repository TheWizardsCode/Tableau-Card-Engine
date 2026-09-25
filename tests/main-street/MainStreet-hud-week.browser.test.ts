/**
 * Main Street: HUD Week/Year Label Browser Smoke Test
 *
 * Verifies the annual-calendar HUD surface end to end (CG-0MTT0K9RX0004QTE,
 * Feature 5 AC8):
 *
 * 1. A freshly booted game exposes `state.week` (1–52) and `state.year` (>= 1).
 * 2. The HUD strip renders a "Week W · Year Y" label matching the state.
 *
 * The HUD label is a transient text object parented into `hudContainer`
 * (rendered by `MainStreetRenderer.refreshHud`). Reduced-motion preference
 * and tutorial-offer state do not affect the HUD strip, so the label is
 * visible at boot once the scene reaches the market phase.
 *
 * @module tests/main-street/MainStreet-hud-week.browser
 */

import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '@core-tests/helpers/waitForScene';

// ── Boot helpers (mirrors MainStreetScene.browser.test.ts) ──

/** Key used by TutorialState for the tutorial-offer eligibility flag. */
const TUTORIAL_STATE_KEY = 'tce-main-street-tutorial-state';

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

describe('MainStreet HUD week/year label', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    try { (window as any).localStorage?.clear(); } catch (_) { /* ignore */ }
    destroyGame(game);
    game = null;
  });

  it('shows "Week W · Year Y" in the HUD matching the state week/year', async () => {
    // Fresh tutorial state so the boot flow reaches the market phase.
    try { (window as any).localStorage?.removeItem(TUTORIAL_STATE_KEY); } catch (_) { /* ignore */ }
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    // The state carries the calendar fields (week within 1–52, year >= 1).
    const state = scene.state as { week: number; year: number };
    expect(state.week).toBeGreaterThanOrEqual(1);
    expect(state.week).toBeLessThanOrEqual(52);
    expect(state.year).toBeGreaterThanOrEqual(1);

    // The HUD strip renders a text labelled with the week/year once the
    // market phase refresh runs.
    const expectedPrefix = `Week ${state.week}`;
    await waitForCondition(() => {
      const hud = (scene as any).hudContainer;
      const texts: Phaser.GameObjects.Text[] = [];
      const list = hud?.list ?? hud?.getAll?.() ?? [];
      for (const obj of list) {
        if (obj instanceof Phaser.GameObjects.Text) texts.push(obj as Phaser.GameObjects.Text);
      }
      return texts.some((t) => t.text?.startsWith(expectedPrefix));
    }, { timeoutMs: 5000, label: 'HUD week label' });

    // Assert the full label text exactly (Week W · Year Y).
    const hud = (scene as any).hudContainer;
    const texts: Phaser.GameObjects.Text[] = [];
    const list = hud?.list ?? hud?.getAll?.() ?? [];
    for (const obj of list) {
      if (obj instanceof Phaser.GameObjects.Text) texts.push(obj as Phaser.GameObjects.Text);
    }
    const weekText = texts.find((t) => t.text?.startsWith(expectedPrefix));
    expect(weekText).toBeDefined();
    expect(weekText!.text).toBe(`Week ${state.week} · Year ${state.year}`);
  }, 30_000);
});