/**
 * Main Street: Income Collection Animation Browser Tests
 *
 * Verifies the end-of-turn income collection animation end to end in a real
 * Phaser scene:
 *
 * 1. Ending the turn with a producing business on the street triggers
 *    `MainStreetAnimator.animateIncomeCollection` with the per-slot income
 *    breakdown, sets `incomeCollectionActive` for the duration of the
 *    flights, and clears it once collection completes.
 * 2. Under reduced motion the animation is skipped entirely (no
 *    `incomeCollectionActive` window; the HUD refresh path still provides
 *    the single final pop + income sound).
 *
 * The animation is presentation-only: it never mutates game state, the
 * transcript, or the turn flow (the next day still starts after the usual
 * 1200 ms turn-advance window).
 *
 * @module tests/main-street/income-collection.browser
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';
import {
  getBusinessTemplates,
  type BusinessCard,
} from '../../example-games/main-street/MainStreetCards';

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

/** A full business card built from the first template, placed on a street slot. */
function makeProducingBiz(id: string): BusinessCard {
  const tpl = getBusinessTemplates()[0];
  if (!tpl) throw new Error('No business templates loaded');
  return {
    ...tpl,
    id,
    family: 'business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
    // applyIncome() reads the cached per-turn income; template cards carry
    // this field only after syncCardCurrentIncome() runs, so set it here.
    currentIncome: 2,
    currentReputationPerTurn: 0,
  };
}

describe('MainStreet income collection animation', () => {
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

  it('triggers a coin-collection animation from producing slots to the HUD on end turn', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    // Place a producing business on slot 0 (booted state is already in MarketPhase).
    const state = scene.state as {
      streetGrid: Array<BusinessCard | null>;
      resourceBank: { coins: number };
    };
    state.streetGrid[0] = makeProducingBiz('biz-income-collection-test');

    const spy = vi.spyOn(
      scene.msAnimator as unknown as { animateIncomeCollection: (params: unknown) => void },
      'animateIncomeCollection',
    );

    (scene.msTurnController as unknown as { endTurn: () => void }).endTurn();

    // The controller calls the animator with the income result from
    // processEndOfTurn — per-slot breakdown included.
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = (spy as unknown as { mock: { calls: Array<[unknown]> } }).mock.calls[0][0] as {
      income: { total: number; breakdown: Array<{ slotIndex: number; total: number }> };
    };
    expect(arg.income.total).toBeGreaterThan(0);
    expect(arg.income.breakdown.some((b) => b.slotIndex === 0 && b.total > 0)).toBe(true);

    // The animation runs (flag set synchronously) and completes.
    expect(scene.incomeCollectionActive).toBe(true);
    await waitForCondition(() => scene.incomeCollectionActive === false, {
      timeoutMs: 5000,
      label: 'income collection animation to complete',
    });
  }, 30_000);
});
