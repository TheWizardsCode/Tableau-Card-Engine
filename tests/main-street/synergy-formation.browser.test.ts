/**
 * Main Street: Synergy Formation Animation Browser Tests
 *
 * Verifies the synergy-formation trigger end to end in a real Phaser scene:
 *
 * 1. Placing a business (drag-to-slot flow) that forms a NEW synergy pair
 *    triggers `MainStreetAnimator.animateSynergyFormation` with the new
 *    pair's slot indices + shared synergy type, and the chime SFX plays.
 * 2. A subsequent plain refresh does NOT re-trigger the animation (only
 *    newly-formed pairs animate).
 * 3. Under reduced motion the trigger still fires (the animator degrades
 *    internally — covered by unit tests).
 *
 * The presentation is non-blocking and never mutates game state beyond the
 * placement itself.
 *
 * @module tests/main-street/synergy-formation.browser
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';
import {
  getBusinessTemplates,
  type BusinessCard,
  type SynergyType,
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
 * Two distinct business cards sharing a synergy type (different base type ids
 * so the same-type exclusion rule doesn't suppress the pair).
 */
function makeSynergyPair(): { cardA: BusinessCard; cardB: BusinessCard; shared: SynergyType } {
  const tpls = getBusinessTemplates();
  const shared = tpls.find((t) => t.synergyTypes.length > 0)?.synergyTypes[0];
  if (!shared) throw new Error('No synergy-capable business templates');
  const pair = tpls.filter((t) => t.synergyTypes.includes(shared)).slice(0, 2);
  if (pair.length < 2) throw new Error(`Fewer than 2 templates share synergy ${shared}`);
  const [ta, tb] = pair as [typeof pair[0], typeof pair[0]];
  const cardA: BusinessCard = { ...ta, id: `syn-browser-a-${ta.id}`, family: 'business', level: 0, incomeBonus: 0, synergyRangeBonus: 0, reputationBonus: 0, appliedUpgrades: [] };
  const cardB: BusinessCard = { ...tb, id: `syn-browser-b-${tb.id}`, family: 'business', level: 0, incomeBonus: 0, synergyRangeBonus: 0, reputationBonus: 0, appliedUpgrades: [] };
  return { cardA, cardB, shared };
}

interface FormationCall {
  fromIndex: number;
  toIndex: number;
  sharedSynergy: string;
}

function spyOnSynergyFormation(scene: Phaser.Scene & Record<string, unknown>): {
  spy: ReturnType<typeof vi.spyOn>;
  calls: FormationCall[];
} {
  const animator = scene.msAnimator as unknown as {
    animateSynergyFormation: (params: FormationCall) => void;
  };
  const original = animator.animateSynergyFormation.bind(animator);
  const calls: FormationCall[] = [];
  const spy = vi.spyOn(animator, 'animateSynergyFormation').mockImplementation((params) => {
    calls.push(params);
    original(params); // run the real implementation so the visuals run
  });
  return { spy, calls };
}

describe('MainStreet synergy formation animation', () => {
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

  it('triggers the formation animation with the new pair and plays the chime on placement', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const { cardA, cardB, shared } = makeSynergyPair();

    // Partner already on slot 0; the new card comes from the market row.
    const state = scene.state as {
      streetGrid: Array<BusinessCard | null>;
      market: { development: Array<BusinessCard | null> };
      resourceBank: { coins: number };
    };
    state.streetGrid[0] = cardA;
    state.market.development[0] = cardB;
    state.resourceBank.coins = 100;
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    const { calls } = spyOnSynergyFormation(scene);
    const soundSpy = vi.spyOn(scene.soundManager as unknown as { play: (k: string) => void }, 'play');

    // Drag the market card onto slot 1 (adjacent to slot 0).
    (scene.msTurnController as unknown as {
      onDragDropBusiness: (payload: { data: string; zoneData: number; gameObject: unknown }) => void;
    }).onDragDropBusiness({ data: cardB.id, zoneData: 1, gameObject: null });

    // The placement forms a NEW pair and triggers the animation.
    await waitForCondition(() => calls.length >= 1, { timeoutMs: 8000, label: 'synergy formation trigger' });
    expect(calls).toHaveLength(1);
    expect(calls[0].fromIndex).toBe(0);
    expect(calls[0].toIndex).toBe(1);
    expect(calls[0].sharedSynergy).toBe(shared);

    // The chime SFX played (positive feedback; the buy itself only
    // decreases coins, so INCOME_POSITIVE must come from the chime).
    expect(soundSpy.mock.calls.some((c) => c[0] === 'sfx-income-positive')).toBe(true);

    // A plain refresh (pre-existing pair) does NOT re-trigger.
    (scene as unknown as { refreshAll: () => void }).refreshAll();
    expect(calls).toHaveLength(1);
  }, 30_000);

  it('still fires the trigger under reduced motion (animator degrades internally)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const { cardA, cardB } = makeSynergyPair();

    const state = scene.state as {
      streetGrid: Array<BusinessCard | null>;
      market: { development: Array<BusinessCard | null> };
      resourceBank: { coins: number };
    };
    state.streetGrid[0] = cardA;
    state.market.development[0] = cardB;
    state.resourceBank.coins = 100;
    (scene as unknown as { settingsPanel: { reducedMotion: boolean } }).settingsPanel = { reducedMotion: true };
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    const { calls } = spyOnSynergyFormation(scene);

    (scene.msTurnController as unknown as {
      onDragDropBusiness: (payload: { data: string; zoneData: number; gameObject: unknown }) => void;
    }).onDragDropBusiness({ data: cardB.id, zoneData: 1, gameObject: null });

    await waitForCondition(() => calls.length >= 1, { timeoutMs: 8000, label: 'synergy formation trigger (reduced motion)' });
    expect(calls).toHaveLength(1);
    expect(calls[0].sharedSynergy).toBeTruthy();
  }, 30_000);
});
