/**
 * Main Street: Deferred-Mutation Animator Tests
 * (CG-0MTR72P14000VO6Q — "Don't add coins/reputation/score until the end of
 * the end of turn cycle", AC3)
 *
 * The end-of-turn income collection applies the pending deltas to
 * `state.resourceBank` when the animation completes — exactly once, guarded
 * so a second animation (e.g. the incident reveal) cannot double-apply.
 *
 * @module tests/main-street/main-street-animators-deferred
 */

import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { recalculateCard } from '../../example-games/main-street/MainStreetAdjacency';

let game: Phaser.Game | null = null;

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const g = createMainStreetGame({ type: Phaser.CANVAS });
  await waitForCondition(
    () => {
      const scene = g.scene.getScene('MainStreetScene');
      return Boolean(scene && (scene as any).state && (scene as any).msAnimator && (scene as any).layout);
    },
    { timeoutMs: 20_000, label: 'MainStreetScene boot' },
  );
  return g;
}

function destroyGame(g: Phaser.Game | null): void {
  if (g) g.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

async function waitForCondition(
  predicate: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const intervalMs = options.intervalMs ?? 25;
  const label = options.label ?? 'condition';
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}

/** Places a producing business on slot 0 and renders its street container. */
function placeAndRenderBusiness(scene: any): void {
  scene.state.streetGrid[0] = {
    family: 'business',
    id: 'deferred-biz',
    name: 'Deferred Biz',
    cost: 3,
    baseIncome: 1,
    synergyTypes: ['Food'],
    maxLevel: 1,
    description: 'Test business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
  };
  recalculateCard(scene.state, 0);
  scene.msRenderer.refreshStreetGrid();
}

afterEach(() => {
  destroyGame(game);
  game = null;
});

describe('animateIncomePhases pending-delta application (CG-0MTR72P14000VO6Q AC3)', () => {
  it('applies pendingDeltas exactly once when the collection completes', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;
    placeAndRenderBusiness(scene);

    scene.state.resourceBank.coins = 100;
    scene.state.resourceBank.reputation = 10;
    scene.endOfTurnDeltasApplied = false;

    // A producing slot with a small base income (one coin icon → fast flight).
    const phaseData = [{
      slotIndex: 0,
      businessName: 'Deferred Biz',
      baseIncome: 1,
      synergyBonus: 0,
      repBonus: 0,
      eventDeltas: [],
      upcomingDeltas: [],
    }];

    const startedAt = Date.now();
    scene.msAnimator.animateIncomePhases(phaseData, {
      phaseGapMs: 1,
      startDelayMs: 0,
      pendingDeltas: { pendingCoinDelta: 7, pendingRepDelta: 0, pendingScoreDelta: 0 },
    });

    await waitForCondition(
      () => scene.incomeCollectionActive === false && scene.endOfTurnDeltasApplied === true,
      { timeoutMs: 10_000, label: 'income collection completion + delta application' },
    );

    expect(Date.now() - startedAt).toBeLessThan(10_000);
    // The deltas were applied exactly once.
    expect(scene.state.resourceBank.coins).toBe(107);
    expect(scene.endOfTurnDeltasApplied).toBe(true);
  });

  it('does NOT apply deltas when pendingDeltas is absent (legacy path)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;
    placeAndRenderBusiness(scene);

    scene.state.resourceBank.coins = 100;
    scene.endOfTurnDeltasApplied = false;

    const phaseData = [{
      slotIndex: 0,
      businessName: 'Deferred Biz',
      baseIncome: 1,
      synergyBonus: 0,
      repBonus: 0,
      eventDeltas: [],
      upcomingDeltas: [],
    }];

    scene.msAnimator.animateIncomePhases(phaseData, { phaseGapMs: 1, startDelayMs: 0 });

    await waitForCondition(
      () => scene.incomeCollectionActive === false,
      { timeoutMs: 10_000, label: 'income collection completion' },
    );

    expect(scene.state.resourceBank.coins).toBe(100);
    expect(scene.endOfTurnDeltasApplied).toBe(false);
  });

  it('the scene guard prevents a second animation from double-applying', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;
    placeAndRenderBusiness(scene);

    scene.state.resourceBank.coins = 100;
    scene.endOfTurnDeltasApplied = false;

    const phaseData = [{
      slotIndex: 0,
      businessName: 'Deferred Biz',
      baseIncome: 1,
      synergyBonus: 0,
      repBonus: 0,
      eventDeltas: [],
      upcomingDeltas: [],
    }];

    // First animation applies 7.
    scene.msAnimator.animateIncomePhases(phaseData, {
      phaseGapMs: 1,
      startDelayMs: 0,
      pendingDeltas: { pendingCoinDelta: 7, pendingRepDelta: 0, pendingScoreDelta: 0 },
    });
    await waitForCondition(
      () => scene.endOfTurnDeltasApplied === true,
      { timeoutMs: 10_000, label: 'first delta application' },
    );
    expect(scene.state.resourceBank.coins).toBe(107);

    // A second animation (e.g. an incident reveal late in the cycle) with a
    // DIFFERENT delta block must NOT re-apply — the guard is already set.
    scene.msAnimator.animateIncomePhases(phaseData, {
      phaseGapMs: 1,
      startDelayMs: 0,
      pendingDeltas: { pendingCoinDelta: 50, pendingRepDelta: 0, pendingScoreDelta: 0 },
    });
    // Wait for the second run to start (flag true) and finish (flag false again).
    const start = Date.now();
    let sawSecondStart = false;
    while (Date.now() - start < 10_000) {
      if (scene.incomeCollectionActive) sawSecondStart = true;
      if (sawSecondStart && !scene.incomeCollectionActive) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(sawSecondStart).toBe(true);
    // Unchanged: the second block was swallowed by the guard.
    expect(scene.state.resourceBank.coins).toBe(107);
  });
});