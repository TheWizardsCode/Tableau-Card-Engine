/**
 * Main Street: End-of-Turn Income Presentation Browser Tests (controller wiring)
 *
 * Verifies the end-of-turn income presentation wiring end to end in a real
 * Phaser scene (CG-0MTDEETZE0056JS5, child 4 of CG-0MT23O6W8003AXWJ):
 *
 * 1. Normal play: ending the turn with producing slots on the street routes
 *    `result.income.phaseBreakdown.perSlotBreakdown` into
 *    `MainStreetAnimator.animateIncomePhases()`; `incomeCollectionActive`
 *    is set for the duration of the phased choreography (~11s) and cleared
 *    once collection completes; the day start is deferred until the show
 *    finishes.
 * 2. Tutorial mode: the compact window-safe `animateIncomeCollection` is
 *    used instead (tutorial pacing unchanged); the day advances inside the
 *    usual ~1.2s window.
 * 3. The presentation is VFX only — it never mutates game state, the
 *    transcript, or the turn flow; a throwing animator cannot block the
 *    turn advance (the flag is defensively cleared).
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
import { UNIFIED_TUTORIAL_STEPS } from '../../example-games/main-street/TutorialFlow';

/**
 * Waits until the street container stops being re-rendered (boot-time SVG
 * prewarm / campaign-load refreshes rebuild it). Samples every 250ms and
 * returns once the container's direct-child signature has been stable for
 * two consecutive samples.
 */
async function waitForStableStreet(scene: Phaser.Scene & Record<string, unknown>): Promise<void> {
  const street = scene.streetContainer as Phaser.GameObjects.Container | undefined;
  let prevRefs: readonly Phaser.GameObjects.GameObject[] = street?.list ?? [];
  let stableSamples = 0;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const cur = street?.list ?? [];
    let same = cur.length === prevRefs.length;
    if (same) {
      for (let j = 0; j < cur.length; j++) {
        if (cur[j] !== prevRefs[j]) {
          same = false;
          break;
        }
      }
    }
    prevRefs = cur;
    stableSamples = same ? stableSamples + 1 : 0;
    if (stableSamples >= 2) return;
  }
}

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
    ongoingCost: 0,
    appliedUpgrades: [],
    // applyIncome() reads the cached per-turn income; template cards carry
    // this field only after syncCardCurrentIncome() runs, so set it here.
    currentIncome: 2,
    currentReputationPerTurn: 0,
  };
}

/** Phased choreography duration: 5 phase gaps + collection, default gap 2200ms. */
const PHASED_SHOW_MS = 5 * 2200 + 600;

describe('MainStreet end-of-turn income presentation (controller wiring)', () => {
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

  it('routes per-slot phase data into animateIncomePhases and defers the day start', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    // Let the boot-time card-SVG prewarm's deferred refreshAll() settle
    // (it re-renders the street once rasterisation completes; a mid-show
    // re-render would destroy the coin grid). Awaiting the prewarm + a
    // street-stability poll makes the timing deterministic regardless of
    // rasterise latency — real play always ends the first turn long after
    // this boot artifact.
    await (scene as unknown as { prewarmVisibleCardTextures: () => Promise<unknown> }).prewarmVisibleCardTextures();
    await waitForStableStreet(scene);

    // Place a producing business on slot 0 (booted state is already in MarketPhase).
    const state = scene.state as {
      streetGrid: Array<BusinessCard | null>;
      resourceBank: { coins: number };
      turn: number;
      phase: string;
    };
    state.streetGrid[0] = makeProducingBiz('biz-income-collection-test');
    // Render the street so the choreography can resolve a live card
    // container for slot 0 (the animator needs it to host the coin grid).
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    const turnBefore = (state.turn as number);

    const spy = vi.spyOn(
      scene.msAnimator as unknown as { animateIncomePhases: (params: unknown) => void },
      'animateIncomePhases',
    );

    (scene.msTurnController as unknown as { endTurn: () => void }).endTurn();

    // The controller calls the animator with the per-slot phase breakdown
    // from processEndOfTurn (child 1 data model).
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = (spy as unknown as { mock: { calls: Array<[unknown]> } }).mock.calls[0][0] as Array<{
      slotIndex: number;
      baseIncome: number;
    }>;
    expect(Array.isArray(arg)).toBe(true);
    expect(arg.some((pd) => pd.slotIndex === 0 && pd.baseIncome > 0)).toBe(true);

    // The choreography runs: flag set synchronously, cleared at collect end.
    expect(scene.incomeCollectionActive).toBe(true);

    // Mid-show, the controller must keep the choreography alive: the flag
    // still holds and the day has NOT started early at ~4s into the show
    // (the street refresh + DayStart are deferred until collection ends).
    await new Promise((r) => setTimeout(r, 4000));
    expect(scene.incomeCollectionActive).toBe(true);
    expect(state.phase).toBe('DayStart');

    // VFX only — the post-income bank value must not change while the show
    // runs, and the day must advance only after the flag clears.
    const coinsAfterIncome = (state.resourceBank.coins as number);

    // Wait for the full show AND the deferred day start (the controller polls
    // on a 250ms cadence, so MarketPhase can land up to ~250ms after clear).
    await waitForCondition(() => scene.incomeCollectionActive === false && state.phase === 'MarketPhase', {
      timeoutMs: PHASED_SHOW_MS + 9000,
      label: 'phased income show to complete and the day to start',
    });

    expect(state.resourceBank.coins).toBe(coinsAfterIncome);
    expect(state.turn).toBe(turnBefore + 1);
    expect(state.phase).toBe('MarketPhase');
  }, 40_000);

  it('keeps the compact collection during the tutorial (day start inside the usual window)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    // Simulate an active tutorial: the controller must keep the compact,
    // window-safe `animateIncomeCollection` path so step pacing is unchanged.
    // (The scene attaches `tutorialController` dynamically via Object.assign.)
    (scene as unknown as { tutorialController: unknown }).tutorialController = {
      isActive: true,
      // Park the tutorial on a real action-gated `end-turn` step (T6) so
      // the controller's tutorial gate allows end-turn and the compact
      // collection branch is reached.
      currentStepIndex: UNIFIED_TUTORIAL_STEPS.findIndex((s) => s.requiredAction === 'end-turn'),
      lastCompletedStepId: null,
      exited: false,
    };

    const state = scene.state as {
      streetGrid: Array<BusinessCard | null>;
      resourceBank: { coins: number };
      turn: number;
      phase: string;
    };
    state.streetGrid[0] = makeProducingBiz('biz-tutorial-collection-test');
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    const turnBefore = (state.turn as number);

    const phasedSpy = vi.spyOn(
      scene.msAnimator as unknown as { animateIncomePhases: (params: unknown) => void },
      'animateIncomePhases',
    );
    const compactSpy = vi.spyOn(
      scene.msAnimator as unknown as { animateIncomeCollection: (params: unknown) => void },
      'animateIncomeCollection',
    );

    (scene.msTurnController as unknown as { endTurn: () => void }).endTurn();

    // The phased choreography must NOT run in tutorial mode.
    expect(phasedSpy).not.toHaveBeenCalled();
    expect(compactSpy).toHaveBeenCalledTimes(1);

    // The compact flights finish fast; the day advances inside the usual window.
    await waitForCondition(() => scene.incomeCollectionActive === false && state.turn > turnBefore && state.phase === 'MarketPhase', {
      timeoutMs: 4000,
      label: 'tutorial turn advance',
    });
  }, 15_000);

  it('never blocks the turn advance when the animator throws', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    const state = scene.state as {
      streetGrid: Array<BusinessCard | null>;
      turn: number;
      phase: string;
    };
    state.streetGrid[0] = makeProducingBiz('biz-throwing-animator-test');
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    const turnBefore = (state.turn as number);

    const spy = vi.spyOn(
      scene.msAnimator as unknown as { animateIncomePhases: (params: unknown) => void },
      'animateIncomePhases',
    ).mockImplementation(() => {
      throw new Error('simulated animator failure');
    });

    (scene.msTurnController as unknown as { endTurn: () => void }).endTurn();

    expect(spy).toHaveBeenCalledTimes(1);
    // The catch resets the flag defensively...
    expect(scene.incomeCollectionActive).toBe(false);

    // ...and the day still starts in the usual window.
    await waitForCondition(() => state.turn > turnBefore && state.phase === 'MarketPhase', {
      timeoutMs: 4000,
      label: 'turn advance after animator failure',
    });
  }, 15_000);
});