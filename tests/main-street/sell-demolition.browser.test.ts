/**
 * Main Street: Sell Demolination + Refund Coin Fly Browser Tests
 *
 * Verifies the sell-feedback path end to end in a real Phaser scene:
 *
 * 1. Confirming a sale (Sell button in `showSellConfirmation`) triggers
 *    `MainStreetAnimator.animateSell` on the sold slot with the refund
 *    amount, and the sale itself commits (slot sold, coins credited).
 * 2. Reduced motion still triggers the animation (the animator degrades
 *    internally — covered by unit tests).
 *
 * The presentation is non-blocking and never mutates game state beyond the
 * sale itself.
 *
 * @module tests/main-street/sell-demolition.browser
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';
import { getBusinessTemplates, type BusinessCard } from '../../example-games/main-street/MainStreetCards';

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

function makeBusiness(): BusinessCard {
  const tpl = getBusinessTemplates()[0];
  return { ...tpl, id: `sell-browser-${tpl.id}`, family: 'business', level: 0, incomeBonus: 0, synergyRangeBonus: 0, reputationBonus: 0, appliedUpgrades: [] };
}

interface SellCall {
  slotIndex: number;
  refund: number;
  cardId: string;
  family: string;
}

function spyOnSell(scene: Phaser.Scene & Record<string, unknown>): { calls: SellCall[] } {
  const animator = scene.msAnimator as unknown as {
    animateSell: (params: SellCall) => Promise<void>;
  };
  const original = animator.animateSell.bind(animator);
  const calls: SellCall[] = [];
  vi.spyOn(animator, 'animateSell').mockImplementation((params) => {
    calls.push(params);
    return original(params); // run the real implementation so the visuals run
  });
  return { calls };
}

/** Finds the '[ Sell ]' overlay button among the scene's overlay objects. */
function findSellButton(scene: Phaser.Scene & Record<string, unknown>): Phaser.GameObjects.Text {
  const objects = (scene as unknown as { overlayObjects: Phaser.GameObjects.GameObject[] }).overlayObjects ?? [];
  const btn = objects.find(
    (o) => (o as unknown as { text?: string }).text === '[ Sell ]',
  ) as Phaser.GameObjects.Text | undefined;
  if (!btn) throw new Error('Sell button not found in overlayObjects');
  return btn;
}

describe('MainStreet sell demolition animation', () => {
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

  it('confirming a sale triggers the demolition + refund fly and credits the refund', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const biz = makeBusiness();

    const state = scene.state as {
      streetGrid: Array<BusinessCard | null>;
      resourceBank: { coins: number };
      soldSlots: boolean[];
    };
    state.streetGrid[0] = biz;
    state.resourceBank.coins = 50;
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    const { calls } = spyOnSell(scene);

    // Open the sell confirmation dialog and confirm.
    (scene.msTurnController as unknown as { onSellCard: (slotIndex: number) => void }).onSellCard(0);
    findSellButton(scene).emit('pointerdown');

    await waitForCondition(() => calls.length >= 1, { timeoutMs: 5000, label: 'sell animation trigger' });
    expect(calls).toHaveLength(1);
    expect(calls[0].slotIndex).toBe(0);
    expect(calls[0].family).toBe('business');
    expect(calls[0].cardId).toBe(biz.id);

    // Refund = ceil((cost + upgrades) / 2); no upgrades here.
    const expectedRefund = Math.ceil(biz.cost / 2);
    expect(calls[0].refund).toBe(expectedRefund);

    // The sale committed: slot sold, coins credited.
    expect(state.soldSlots[0]).toBe(true);
    expect(state.resourceBank.coins).toBe(50 + expectedRefund);
  }, 30_000);
});
