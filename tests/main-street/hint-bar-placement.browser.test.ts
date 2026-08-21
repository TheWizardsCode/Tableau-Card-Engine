/**
 * Main Street placement hint-bar regression tests.
 *
 * Regression guard for CG-0MT24DCPS0034610 (hint text obscured by hand).
 *
 * Previously the phase-specific placement hint ("Card in hand (N) — click an
 * empty slot to place" / "Place \"[name]\" -- click an empty slot") was
 * rendered with `s.add.text(...)` inline at the action area (actionY - 4),
 * directly behind the hand-card sprites and therefore visually obscured.
 *
 * This work item moved that text onto the shared `HintBar` component at the
 * bottom-centre of the screen (`s.hintBar.setText(...)`). These browser tests
 * boot the real MainStreetScene and assert:
 *
 *   AC1: the phase-specific hint text is NO LONGER rendered inline in the
 *        action container (no stray text objects at the action area).
 *   AC2: the hint text is displayed via the shared HintBar (the bottom-centre
 *        text object referenced by `s.instructionText`, which is the same
 *        object).
 *   AC3: on returning from placing-from-hand / placing-business to market
 *        (via the real Cancel action button), the hint bar is reset to the
 *        standard market instruction.
 *
 * @module tests/main-street/hint-bar-placement.browser
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import { TUTORIAL_STATE_STORAGE_KEY } from '../../example-games/main-street/TutorialState';
import { canPurchaseBusiness, getEmptySlots } from '../../example-games/main-street/MainStreetMarket';

const GAME_W = 1280;
const GAME_H = 720;

/**
 * Clear persistent storage (localStorage + IndexedDB) so a checkpoint saved
 * by another test (or a previous run) cannot surface the resume overlay.
 */
async function clearPersistentStorage(): Promise<void> {
  try { localStorage.clear(); } catch { /* ignore */ }
  try {
    let names: string[] = ['save-load-store'];
    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      try {
        names = (await Promise.race([
          indexedDB.databases(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('databases timeout')), 2000)),
        ])).map((d: IDBDatabaseInfo) => d.name).filter((n): n is string => !!n);
      } catch { /* fall back to the default name */ }
    }
    await Promise.race([
      Promise.all(
        names.map(
          (n) =>
            new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(n);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            }),
        ),
      ),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch { /* ignore */ }
}

async function bootGame(): Promise<Phaser.Game> {
  await clearPersistentStorage();
  localStorage.setItem(
    TUTORIAL_STATE_STORAGE_KEY,
    JSON.stringify({ schemaVersion: 1, status: 'skipped', completedAt: null, lastStepId: null }),
  );
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

async function waitForMarketReady(scene: Scene): Promise<void> {
  await waitForCondition(
    () => scene.state?.market?.cards?.length > 0,
    'market row populated',
  );
}

async function waitForSettled(scene: Scene): Promise<void> {
  const firstCard = (): Phaser.GameObjects.GameObject | undefined =>
    (scene.marketContainer?.list ?? []).find(
      (c: any) => c.name?.startsWith?.('ms-market-card-'),
    );
  for (let i = 0; i < 60; i++) {
    await wait(250);
    const now = firstCard();
    if (now === undefined) continue;
    await wait(250);
    if (firstCard() === now) return;
  }
  throw new Error('Timed out waiting for market rendering to settle');
}

/** Current hint text shown by the shared HintBar at the bottom of the screen. */
function hintText(scene: Scene): string {
  return String(scene.hintBar?.textObject?.text ?? '');
}

/** True if any text object remains rendered inline in the action container. */
function hasInlineActionText(scene: Scene): boolean {
  const list = scene.actionContainer?.list ?? [];
  return list.some((entry: any) => {
    if (entry?.text !== undefined && entry?.type === 'Text') return true;
    // Nested text (e.g. inside a button container) is fine — the AC is about
    // standalone hint text directly added to the action container.
    return false;
  });
}

/** Find the interactive Cancel button inside the action container and click it. */
async function clickCancelButton(scene: Scene): Promise<void> {
  const list: any[] = scene.actionContainer?.list ?? [];
  const cancel = list.find((entry: any) => {
    if (!entry?.list) return false;
    return entry.list.some((child: any) => child?.text === 'Cancel');
  });
  expect(cancel, 'Cancel button should exist in the action container').toBeTruthy();
  const bg = cancel.list.find((child: any) => typeof child?.setInteractive === 'function');
  expect(bg, 'Cancel button background').toBeTruthy();
  bg.emit('pointerdown');
  await wait(60);
}

describe('Main Street placement hint is shown via HintBar (browser)', () => {
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
    localStorage.removeItem(TUTORIAL_STATE_STORAGE_KEY);
  });

  it('shows the placing-from-hand hint in the HintBar, not inline, then resets on cancel', async () => {
    game = await bootGame();
    const scene = getScene(game);
    await waitForMarketReady(scene);
    await waitForSettled(scene);

    scene.state.resourceBank.coins = 100;

    const targetSlot = getEmptySlots(scene.state)[0];
    expect(targetSlot).toBeGreaterThanOrEqual(0);
    const business = scene.state.market.cards.find((c: any) =>
      c && canPurchaseBusiness(scene.state, c.id, targetSlot).legal,
    );
    expect(business).toBeTruthy();

    scene.onBusinessCardClick(business);
    await waitForCondition(
      () => scene.state.hand?.some((c: any) => c.id === business.id),
      'business moved to hand',
    );

    // Enter placing-from-hand by clicking the hand card.
    scene.onHandBusinessCardClick(0);
    await waitForCondition(
      () => scene.uiPhase === 'placing-from-hand',
      'placing-from-hand phase',
    );

    // AC2: the phase-specific hint appears in the shared HintBar text.
    await waitForCondition(
      () => hintText(scene).toLowerCase().includes('click an empty slot'),
      'placing hint in HintBar',
    );

    // AC1: no standalone hint text object remains inline in the action container.
    expect(hasInlineActionText(scene)).toBe(false);

    // AC3: clicking the real Cancel button returns to market and resets the
    // hint bar to the standard market instruction.
    await clickCancelButton(scene);
    await waitForCondition(
      () => scene.uiPhase === 'market',
      'back to market after cancel',
    );
    const resetText = hintText(scene).toLowerCase();
    expect(resetText).toContain('buy cards from the market');
    expect(resetText).not.toContain('click an empty slot');
    expect(resetText).not.toContain('card in hand');
  });
});
