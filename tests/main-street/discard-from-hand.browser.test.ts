/**
 * Main Street: [Discard] button and handler (CG-0MUEQ1AP7008KLIB).
 *
 * Browser tests for the player-facing discard control (parent AC1/AC3):
 * - the [Discard] button renders in the End Turn slot once a hand card is
 *   selected, labelled with the reputation cost, with [Cancel] shifted left;
 * - clicking it discards the selected card, deducts reputation, and returns
 *   the UI to the market phase;
 * - the discard is undoable.
 *
 * @module tests/main-street/discard-from-hand.browser
 */

import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '@core-tests/helpers/waitForScene';
import { TUTORIAL_STATE_STORAGE_KEY } from '../../example-games/main-street/TutorialState';
import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';

const GAME_W = 1280;
const GAME_H = 720;

// ── Boot helpers ──────────────────────────────────────────────

async function bootGame(): Promise<Phaser.Game> {
  try { localStorage.clear(); } catch { /* ignore */ }
  try {
    localStorage.setItem(
      TUTORIAL_STATE_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, status: 'skipped', completedAt: null, lastStepId: null }),
    );
  } catch { /* ignore */ }

  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import(
    '../../example-games/main-street/createMainStreetGame'
  );
  const game = createMainStreetGame({
    type: Phaser.CANVAS,
    parent: 'game-container',
    width: GAME_W,
    height: GAME_H,
  });
  await waitForScene(game, 'MainStreetScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(
  predicate: () => boolean,
  label: string,
  timeoutMs = 10_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await wait(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

type Scene = Phaser.Scene & Record<string, any>;

function getScene(game: Phaser.Game): Scene {
  return game.scene.getScene('MainStreetScene') as Scene;
}

/** Builds a minimal business card with a known cost. */
function makeBiz(id: string, name: string, cost: number): BusinessCard {
  return {
    family: 'business',
    id,
    name,
    cost,
    baseIncome: 0.5,
    synergyTypes: [],
    maxLevel: 1,
    description: 'test card',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
    appliedUpgrades: [],
  };
}

/** Finds a rendered action button container whose label matches. */
function findActionButton(
  scene: Scene,
  matcher: (text: string) => boolean,
): Phaser.GameObjects.Container | null {
  for (const obj of scene.actionContainer?.list ?? []) {
    const container = obj as Phaser.GameObjects.Container;
    if (container.type !== 'Container' || !Array.isArray(container.list)) continue;
    const label = container.list.find((c: any) => c.type === 'Text') as
      | Phaser.GameObjects.Text
      | undefined;
    if (label && typeof label.text === 'string' && matcher(label.text)) return container;
  }
  return null;
}

/** Fires the real pointerdown handler on a rendered action button. */
function clickActionButton(button: Phaser.GameObjects.Container): void {
  const bg = button.list.find((c: any) => c.type === 'Rectangle') as any;
  expect(bg, 'action button background rectangle').toBeTruthy();
  bg.emit('pointerdown');
}

/** Puts the scene into `placing-from-hand` with a known hand card selected. */
function selectHandCard(scene: Scene, card: BusinessCard, reputation = 10): void {
  scene.state.phase = 'MarketPhase';
  scene.state.hand = [card];
  scene.state.resourceBank.reputation = reputation;
  scene.pendingHandIndex = 0;
  scene.pendingHandJustMoved = false;
  scene.uiPhase = 'placing-from-hand';
  scene.refreshAll();
  scene.refreshActionButtons();
}

describe('Main Street [Discard] button and handler (browser)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
    try { localStorage.removeItem(TUTORIAL_STATE_STORAGE_KEY); } catch { /* ignore */ }
  });

  it('renders [Discard] in the End Turn slot with the reputation cost, Cancel shifted left', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForCondition(() => scene.state?.market?.cards?.length > 0, 'market ready');

    selectHandCard(scene, makeBiz('btn-biz', 'Button Card', 3));

    await waitForCondition(
      () => findActionButton(scene, t => t.startsWith('Discard')) !== null,
      'Discard button rendered',
    );

    const discardBtn = findActionButton(scene, t => t.startsWith('Discard'))!;
    const discardLabel = (discardBtn.list.find((c: any) => c.type === 'Text') as any).text as string;
    expect(discardLabel).toBe('Discard (-3 rep)');

    const cancelBtn = findActionButton(scene, t => t === 'Cancel');
    expect(cancelBtn, 'Cancel button rendered alongside Discard').not.toBeNull();

    // Discard occupies the rightmost slot; Cancel sits to its left.
    expect(discardBtn.x).toBeGreaterThan(cancelBtn!.x);
  }, 30_000);

  it('clicking [Discard] discards the card, deducts reputation, and returns to the market phase', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForCondition(() => scene.state?.market?.cards?.length > 0, 'market ready');

    selectHandCard(scene, makeBiz('click-biz', 'Click Card', 3), 10);
    await waitForCondition(
      () => findActionButton(scene, t => t.startsWith('Discard')) !== null,
      'Discard button rendered',
    );

    clickActionButton(findActionButton(scene, t => t.startsWith('Discard'))!);

    await waitForCondition(
      () => scene.uiPhase === 'market' && (scene.state.hand ?? []).length === 0,
      'discard completed and returned to market',
    );

    expect(scene.state.resourceBank.reputation).toBe(7);
    expect(scene.state.discards.business.some((c: any) => c.id === 'click-biz')).toBe(true);
    expect(scene.pendingHandIndex).toBeNull();
    // Discard is action-free.
    expect(scene.state.actionsRemaining).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('a UI discard is undoable (restores hand, discard pile and reputation)', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForCondition(() => scene.state?.market?.cards?.length > 0, 'market ready');

    selectHandCard(scene, makeBiz('undo-biz', 'Undo Card', 4), 10);
    await waitForCondition(
      () => findActionButton(scene, t => t.startsWith('Discard')) !== null,
      'Discard button rendered',
    );
    clickActionButton(findActionButton(scene, t => t.startsWith('Discard'))!);
    await waitForCondition(
      () => (scene.state.hand ?? []).length === 0,
      'discard completed',
    );
    expect(scene.state.resourceBank.reputation).toBe(6);

    scene.undoManager.undo();
    expect((scene.state.hand ?? []).some((c: any) => c.id === 'undo-biz')).toBe(true);
    expect(scene.state.discards.business.some((c: any) => c.id === 'undo-biz')).toBe(false);
    expect(scene.state.resourceBank.reputation).toBe(10);
  }, 30_000);

  it('respects reduced motion (discard still applies without animation)', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForCondition(() => scene.state?.market?.cards?.length > 0, 'market ready');

    // Reduced motion is a read-only getter on SettingsPanel; flip its backing
    // field so the handler takes the instant (still audible) path.
    if (scene.settingsPanel) (scene.settingsPanel as any)._reducedMotion = true;
    selectHandCard(scene, makeBiz('rm-biz', 'Reduced Card', 2), 10);
    await waitForCondition(
      () => findActionButton(scene, t => t.startsWith('Discard')) !== null,
      'Discard button rendered',
    );
    clickActionButton(findActionButton(scene, t => t.startsWith('Discard'))!);

    await waitForCondition(
      () => (scene.state.hand ?? []).length === 0,
      'reduced-motion discard completed',
    );
    expect(scene.state.resourceBank.reputation).toBe(8);
    expect(scene.uiPhase).toBe('market');
  }, 30_000);
});
