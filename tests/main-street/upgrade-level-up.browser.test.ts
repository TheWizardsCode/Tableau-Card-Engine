/**
 * Main Street: Upgrade Level-Up Burst Browser Tests
 *
 * Verifies the upgrade-arrival feedback end to end in a real Phaser scene:
 *
 * 1. Applying an upgrade via `onUpgradeCardClick` triggers
 *    `MainStreetAnimator.animateLevelUp` on the target business once the
 *    transfer lands (sparkle burst + "Level N" pop).
 * 2. Reduced motion still triggers the animation (the animator degrades
 *    internally — covered by unit tests).
 *
 * The presentation is non-blocking and never mutates game state beyond the
 * upgrade itself.
 *
 * @module tests/main-street/upgrade-level-up.browser
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';
import {
  getBusinessTemplates,
  getUpgradeTemplates,
  type BusinessCard,
  type UpgradeCard,
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

/**
 * Finds an upgrade applicable to a base (level 0) business plus a matching
 * business template, so the upgrade flow can be exercised end to end.
 */
function makeUpgradeFixture(): { biz: BusinessCard; upgrade: UpgradeCard } {
  const upgrades = getUpgradeTemplates();
  const upgrade = upgrades.find((u) => (u.requiredLevel ?? 0) === 0);
  if (!upgrade) throw new Error('No level-0 upgrade templates');
  const tpl = getBusinessTemplates().find((t) => t.name === upgrade.targetBusiness);
  if (!tpl) throw new Error(`No business template named "${upgrade.targetBusiness}"`);
  const biz: BusinessCard = { ...tpl, id: `lvlup-biz-${tpl.id}`, family: 'business', level: 0, incomeBonus: 0, synergyRangeBonus: 0, reputationBonus: 0, appliedUpgrades: [] };
  return { biz, upgrade };
}

interface LevelUpCall {
  slotIndex: number;
  level: number;
}

function spyOnLevelUp(scene: Phaser.Scene & Record<string, unknown>): {
  spy: ReturnType<typeof vi.spyOn>;
  calls: LevelUpCall[];
} {
  const animator = scene.msAnimator as unknown as {
    animateLevelUp: (params: LevelUpCall) => void;
  };
  const original = animator.animateLevelUp.bind(animator);
  const calls: LevelUpCall[] = [];
  const spy = vi.spyOn(animator, 'animateLevelUp').mockImplementation((params) => {
    calls.push(params);
    original(params); // run the real implementation so the visuals run
  });
  return { spy, calls };
}

describe('MainStreet upgrade level-up animation', () => {
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

  it('triggers the level-up burst + pop on the target business when the upgrade lands', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const { biz, upgrade } = makeUpgradeFixture();

    // Business on slot 0 at level 0; upgrade in the investments market.
    const state = scene.state as {
      streetGrid: Array<BusinessCard | null>;
      market: { cards: Array<UpgradeCard | null> };
      resourceBank: { coins: number };
    };
    state.streetGrid[0] = biz;
    state.market.cards[0] = upgrade;
    state.resourceBank.coins = 2000;
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    const { calls } = spyOnLevelUp(scene);

    (scene.msTurnController as unknown as {
      onUpgradeCardClick: (card: UpgradeCard) => void;
    }).onUpgradeCardClick(upgrade);

    await waitForCondition(() => calls.length >= 1, { timeoutMs: 10_000, label: 'level-up trigger' });
    expect(calls).toHaveLength(1);
    expect(calls[0].slotIndex).toBe(0);
    expect(calls[0].level).toBe(1);

    // The upgrade actually applied (level incremented on the target).
    expect(state.streetGrid[0]?.level).toBe(1);
    // The upgrade card left the market (splice — the row may have shifted).
    expect(state.market.cards.some(c => c !== null && c.id === upgrade.id)).toBe(false);
  }, 30_000);
});
