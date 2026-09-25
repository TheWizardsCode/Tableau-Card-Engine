/**
 * Main Street: event-card select-then-act flow (CG-0MUEQ1BF000770B3).
 *
 * Clicking a held event card now selects it (rather than playing it
 * immediately) and the action bar offers [Play] and [Discard]. [Play]
 * preserves the existing play-event behaviour and action economy.
 *
 * @module tests/main-street/event-card-select-then-act.browser
 */

import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '@core-tests/helpers/waitForScene';
import { TUTORIAL_STATE_STORAGE_KEY } from '../../example-games/main-street/TutorialState';

const GAME_W = 1280;
const GAME_H = 720;

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

/** Builds a minimal playable Investment event card. */
function makeEvent(id: string, name: string, cost: number) {
  return {
    family: 'event' as const,
    id,
    name,
    trigger: 'Investment' as const,
    cost,
    effect: 'test effect',
    target: 'All' as const,
    coinDelta: 1,
    reputationDelta: 0,
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

function clickActionButton(button: Phaser.GameObjects.Container): void {
  const bg = button.list.find((c: any) => c.type === 'Rectangle') as any;
  expect(bg, 'action button background rectangle').toBeTruthy();
  bg.emit('pointerdown');
}

/** Places a held event in hand and enters the market phase. */
function holdEvent(scene: Scene, event: ReturnType<typeof makeEvent>, coins = 500): void {
  scene.state.phase = 'MarketPhase';
  scene.state.hand = [event];
  scene.state.resourceBank.coins = coins;
  scene.state.resourceBank.reputation = 10;
  scene.pendingHandIndex = null;
  scene.uiPhase = 'market';
  scene.refreshAll();
  scene.refreshActionButtons();
}

describe('Main Street event select-then-act flow (browser)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
    try { localStorage.removeItem(TUTORIAL_STATE_STORAGE_KEY); } catch { /* ignore */ }
  });

  it('selecting a held event offers [Play] and [Discard]', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForCondition(() => scene.state?.market?.cards?.length > 0, 'market ready');

    holdEvent(scene, makeEvent('sel-evt', 'Selected Event', 3));
    scene.onHandEventCardClick(0);
    scene.refreshActionButtons();

    await waitForCondition(
      () => findActionButton(scene, t => t === 'Play') !== null,
      'Play button rendered',
    );
    expect(scene.uiPhase).toBe('event-selected');
    expect(scene.pendingHandIndex).toBe(0);
    expect(findActionButton(scene, t => t.startsWith('Discard'))).not.toBeNull();
    // Discard stays in the rightmost (End Turn) slot.
    const playBtn = findActionButton(scene, t => t === 'Play')!;
    const discardBtn = findActionButton(scene, t => t.startsWith('Discard'))!;
    expect(discardBtn.x).toBeGreaterThan(playBtn.x);
  }, 30_000);

  it('[Play] plays the selected event and clears the selection', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForCondition(() => scene.state?.market?.cards?.length > 0, 'market ready');

    holdEvent(scene, makeEvent('play-evt', 'Play Me', 3));
    scene.onHandEventCardClick(0);
    scene.refreshActionButtons();
    await waitForCondition(() => findActionButton(scene, t => t === 'Play') !== null, 'Play rendered');

    clickActionButton(findActionButton(scene, t => t === 'Play')!);
    await waitForCondition(
      () => !(scene.state.hand ?? []).some((c: any) => c.id === 'play-evt'),
      'event played (left hand)',
    );
    expect(scene.uiPhase).toBe('market');
    expect(scene.pendingHandIndex).toBeNull();
  }, 30_000);

  it('[Discard] discards the selected event for reputation', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForCondition(() => scene.state?.market?.cards?.length > 0, 'market ready');

    holdEvent(scene, makeEvent('disc-evt', 'Discard Me', 4));
    scene.onHandEventCardClick(0);
    scene.refreshActionButtons();
    await waitForCondition(
      () => findActionButton(scene, t => t.startsWith('Discard')) !== null,
      'Discard rendered',
    );

    clickActionButton(findActionButton(scene, t => t.startsWith('Discard'))!);
    await waitForCondition(
      () => (scene.state.hand ?? []).length === 0,
      'event discarded',
    );
    expect(scene.state.resourceBank.reputation).toBe(6);
    expect(scene.state.discards.event.some((c: any) => c.id === 'disc-evt')).toBe(true);
    expect(scene.uiPhase).toBe('market');
  }, 30_000);
});
