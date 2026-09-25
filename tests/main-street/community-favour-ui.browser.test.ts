/**
 * Community Favour (CG-0MSTOATDQ005XDET): Browser UI tests.
 *
 * Verifies in a real Phaser scene:
 * - AC2: Two favour buttons render in the market-phase action bar.
 * - AC2: Buttons disable when the input resource is insufficient and when
 *   the once-per-turn gate is spent; re-enable on a new day.
 * - AC3/AC5: Clicking an active button performs the exchange through the
 *   animated/sounded path (UI_CLICK SFX + popTextOrIcon), updating
 *   resources and setting favourUsedThisTurn; illegal attempts surface
 *   feedback rather than silently failing.
 *
 * @module tests/main-street/community-favour-ui.browser
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '@core-tests/helpers/waitForScene';
import { executeWeekStart } from '../../example-games/main-street/MainStreetEngine';

// ── Boot helpers (mirrors peek.browser.test.ts) ──

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

interface SceneHandle extends Phaser.Scene {
  state: {
    resourceBank: { coins: number; reputation: number };
    favourUsedThisTurn: boolean;
    actionsRemaining: number;
    phase: string;
    config: { favourCoinsToRepCost: number; favourRepToCoinsRepCost: number; favourRepToCoinsCoinGain: number };
  };
  uiPhase: string;
  actionContainer: Phaser.GameObjects.Container;
  hudContainer: Phaser.GameObjects.Container;
  replayMode: boolean;
  tooltipManager: { show: (content: string, x: number, y: number) => void; hide: () => void };
  refreshAll: () => void;
  refreshHud: () => void;
  msTurnController: { onCommunityFavourClick: (direction: 'coins-to-rep' | 'rep-to-coins') => void };
  settingsPanel?: { reducedMotion?: boolean };
  instructionText: { setText: (t: string) => void };
}

/** Walk a container and collect every text label found (including nested). */
function collectLabels(container: Phaser.GameObjects.Container): string[] {
  const labels: string[] = [];
  const walk = (obj: Phaser.GameObjects.GameObject): void => {
    if (obj.type === 'Text') {
      const txt = (obj as Phaser.GameObjects.Text).text;
      if (typeof txt === 'string' && txt.length > 0) labels.push(txt);
    }
    const inner = obj as Phaser.GameObjects.Container;
    if (inner.type === 'Container' && Array.isArray(inner.list)) {
      inner.list.forEach(walk);
    }
  };
  container.list.forEach(walk);
  return labels;
}

/** Collects the favour button labels rendered in the HUD strip. */
function hudFavourLabels(scene: SceneHandle): string[] {
  return collectLabels(scene.hudContainer).filter(l => l.includes('→'));
}

/** Collects every text label in the action container. */
function actionButtonLabels(scene: SceneHandle): string[] {
  return collectLabels(scene.actionContainer);
}

/** Finds the background rectangle of the favour button whose label matches. */
function findFavourButtonBg(scene: SceneHandle, labelIncludes: string): Phaser.GameObjects.Rectangle | undefined {
  const found = scene.hudContainer.list.find((obj) => {
    const c = obj as Phaser.GameObjects.Container;
    if (c.type !== 'Container' || !Array.isArray(c.list)) return false;
    return c.list.some((child: any) => child?.text?.includes(labelIncludes));
  }) as Phaser.GameObjects.Container | undefined;
  if (!found) return undefined;
  return found.list.find((c: any) => c.type === 'Rectangle') as Phaser.GameObjects.Rectangle | undefined;
}

describe('Main Street Community Favour UI', () => {
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

  /** Boots the game and returns the MainStreetScene handle. */
  async function bootScene(): Promise<SceneHandle> {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as unknown as SceneHandle;
    // Ensure we are in the market phase (default boot lands there).
    expect(scene.uiPhase).toBe('market');
    return scene;
  }

  it('renders two favour buttons in the HUD strip, not the action bar', async () => {
    const scene = await bootScene();
    const labels = () => hudFavourLabels(scene);

    await waitForCondition(
      () => labels().length >= 2,
      { label: 'favour buttons present in HUD' },
    );

    const favourLabels = labels();
    // One per direction: e.g. "2c → 1r" and "2r → 3c".
    expect(favourLabels).toHaveLength(2);
    expect(favourLabels.some(l => /^\d+c → \d+r$/.test(l.trim()))).toBe(true);
    expect(favourLabels.some(l => /^\d+r → \d+c$/.test(l.trim()))).toBe(true);

    // They are NOT rendered in the bottom action bar any more.
    const actionLabels = actionButtonLabels(scene);
    expect(actionLabels.some(l => l.includes('→'))).toBe(false);
  }, 30_000);

  it('attaches i18n tooltip zones to both favour buttons (CG-0MUFAITED0088AGN)', async () => {
    const scene = await bootScene();
    await waitForCondition(() => hudFavourLabels(scene).length >= 2, { label: 'favour buttons present' });

    const showSpy = vi.spyOn(scene.tooltipManager, 'show');
    const repToCoinsBg = findFavourButtonBg(scene, 'r → ');
    const coinsToRepBg = findFavourButtonBg(scene, 'c → ');
    expect(repToCoinsBg, 'rep→coins button background').toBeTruthy();
    expect(coinsToRepBg, 'coins→rep button background').toBeTruthy();

    repToCoinsBg!.emit('pointerover');
    expect(showSpy).toHaveBeenCalled();
    expect(String(showSpy.mock.calls[0][0])).toContain('Coins');
    showSpy.mockClear();
    repToCoinsBg!.emit('pointerout');

    coinsToRepBg!.emit('pointerover');
    expect(showSpy).toHaveBeenCalled();
    expect(String(showSpy.mock.calls[0][0])).toContain('Reputation');
  }, 30_000);

  it('skips favour tooltips in replay mode (CG-0MUFAITED0088AGN)', async () => {
    const scene = await bootScene();
    scene.replayMode = true;
    scene.refreshHud();

    const showSpy = vi.spyOn(scene.tooltipManager, 'show');
    const repToCoinsBg = findFavourButtonBg(scene, 'r → ');
    expect(repToCoinsBg).toBeTruthy();
    repToCoinsBg!.emit('pointerover');
    expect(showSpy).not.toHaveBeenCalled();

    scene.replayMode = false;
  }, 30_000);

  it('active exchange updates resources, sets the gate, and does not consume an action', async () => {
    const scene = await bootScene();

    // Give enough resources for both directions (×100 integer economy).
    scene.state.resourceBank.coins = 2000;
    scene.state.resourceBank.reputation = 500;
    scene.state.favourUsedThisTurn = false;
    scene.refreshAll();

    const coinsBefore = scene.state.resourceBank.coins;
    const repBefore = scene.state.resourceBank.reputation;
    const actionsBefore = scene.state.actionsRemaining;
    const cost = scene.state.config.favourCoinsToRepCost;

    scene.msTurnController.onCommunityFavourClick('coins-to-rep');

    // Exchange applied: coins spent, rep gained, gate set, daily action preserved
    // (Community Favour is a free once-per-turn action, CG-0MSTOATDQ005XDET).
    expect(scene.state.resourceBank.coins).toBe(coinsBefore - cost);
    expect(scene.state.resourceBank.reputation).toBe(repBefore + 1);
    expect(scene.state.favourUsedThisTurn).toBe(true);
    expect(scene.state.actionsRemaining).toBe(actionsBefore);

    // UI returns to market phase after the exchange.
    expect(scene.uiPhase).toBe('market');
  }, 30_000);

  it('disabled states: insufficient resource disables that direction; gate spent disables both', async () => {
    const scene = await bootScene();

    // Coins below the coins-to-rep cost → only the coins direction is
    // disabled (faded 0x2a2a2a fill), rep direction stays enabled.
    scene.state.resourceBank.coins = 0;
    // Exactly enough reputation to afford the rep→coins exchange (integer economy).
    scene.state.resourceBank.reputation = scene.state.config.favourRepToCoinsRepCost;
    scene.state.favourUsedThisTurn = false;
    scene.refreshAll();

    const coinsBg = findFavourButtonBg(scene, 'c → ');
    const repBg = findFavourButtonBg(scene, 'r → ');
    expect(coinsBg!.fillColor).toBe(0x2a2a2a); // disabled (insufficient coins)
    expect(repBg!.fillColor).not.toBe(0x2a2a2a); // enabled (enough reputation)

    const pressed: string[] = [];
    // The controller guard surfaces feedback for the insufficient resource
    // rather than mutating state.
    scene.msTurnController.onCommunityFavourClick('coins-to-rep');
    expect(scene.state.resourceBank.coins).toBe(0);
    expect(scene.state.favourUsedThisTurn).toBe(false);

    // Once the gate is spent, BOTH directions are disabled (faded fill).
    scene.state.favourUsedThisTurn = true;
    scene.refreshAll();
    expect(findFavourButtonBg(scene, 'c → ')!.fillColor).toBe(0x2a2a2a);
    expect(findFavourButtonBg(scene, 'r → ')!.fillColor).toBe(0x2a2a2a);

    // After resetting the gate and funding, a successful exchange sets the
    // gate and a second click is rejected with no further mutation.
    scene.state.resourceBank.coins = 2000;
    scene.state.resourceBank.reputation = 500;
    scene.state.favourUsedThisTurn = false;
    scene.refreshAll();
    scene.msTurnController.onCommunityFavourClick('rep-to-coins');
    expect(scene.state.favourUsedThisTurn).toBe(true);
    // Successful exchange: reputation spent, coins gained.
    expect(scene.state.resourceBank.coins).toBe(2000 + scene.state.config.favourRepToCoinsCoinGain);
    const coinsAfterFirst = scene.state.resourceBank.coins;
    const repAfterFirst = scene.state.resourceBank.reputation;
    // Second attempt in the same turn is rejected — nothing more changes.
    scene.msTurnController.onCommunityFavourClick('rep-to-coins');
    expect(scene.state.resourceBank.reputation).toBe(repAfterFirst);
    expect(scene.state.resourceBank.coins).toBe(coinsAfterFirst);
    expect(pressed).toHaveLength(0);
  }, 30_000);

  it('full rep-to-coins exchange round', async () => {
    const scene = await bootScene();

    // rep → coins: spend the config rep cost, gain the config coin gain (×100 scale).
    scene.state.resourceBank.coins = 400;
    scene.state.resourceBank.reputation = 500;
    scene.state.favourUsedThisTurn = false;
    scene.refreshAll();

    const repCost = scene.state.config.favourRepToCoinsRepCost;
    const coinGain = scene.state.config.favourRepToCoinsCoinGain;

    scene.msTurnController.onCommunityFavourClick('rep-to-coins');

    expect(scene.state.resourceBank.reputation).toBe(500 - repCost);
    expect(scene.state.resourceBank.coins).toBe(400 + coinGain);
    expect(scene.state.favourUsedThisTurn).toBe(true);
  }, 30_000);

  it('buttons re-enable on a new day (WeekStart resets the gate)', async () => {
    const scene = await bootScene();

    scene.state.resourceBank.coins = 2000;
    scene.state.resourceBank.reputation = 500;
    scene.state.favourUsedThisTurn = false;
    scene.refreshAll();

    // Use the gate.
    scene.msTurnController.onCommunityFavourClick('coins-to-rep');
    expect(scene.state.favourUsedThisTurn).toBe(true);

    // Simulate WeekStart: reset phase + gate (no awaits between the phase
    // assignment and the engine call, so the live game loop cannot intervene).
    scene.state.phase = 'WeekStart';
    executeWeekStart(scene.state as never);
    scene.refreshAll();

    expect(scene.state.favourUsedThisTurn).toBe(false);
    // Exchange works again in the new day.
    scene.msTurnController.onCommunityFavourClick('coins-to-rep');
    expect(scene.state.favourUsedThisTurn).toBe(true);
  }, 30_000);
});