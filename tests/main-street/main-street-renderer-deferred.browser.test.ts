/**
 * Main Street: Deferred HUD Window Renderer Tests
 * (CG-0MTR72P14000VO6Q — "Don't add coins/reputation/score until the end of
 * the end of turn cycle", AC2)
 *
 * While the end-of-turn animations run (`incomeCollectionActive` and/or
 * `incidentRevealActive`), `refreshHud()` must render the pre-animation
 * resource values (`previousCoins` / `previousReputation`) — the HUD numbers
 * change only after the animation window closes.
 *
 * @module tests/main-street/main-street-renderer-deferred
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

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
      return Boolean(scene && (scene as any).state && (scene as any).msRenderer && (scene as any).layout);
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
  const timeoutMs = options.timeoutMs ?? 10_000;
  const intervalMs = options.intervalMs ?? 25;
  const label = options.label ?? 'condition';
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}

function hudCoinText(scene: any): string | null {
  const hudList = scene.hudContainer.list as Phaser.GameObjects.GameObject[];
  const coinText = hudList.find(
    (obj) => obj instanceof Phaser.GameObjects.Text
      && (obj as any)._hudTransient
      && (obj as Phaser.GameObjects.Text).text.startsWith('Coins:'),
  ) as Phaser.GameObjects.Text | undefined;
  return coinText ? coinText.text : null;
}

beforeEach(async () => {
  game = await bootGame();
});

afterEach(() => {
  destroyGame(game);
  game = null;
});

describe('refreshHud during the deferred window (CG-0MTR72P14000VO6Q)', () => {
  it('renders previousCoins/previousReputation while incomeCollectionActive is true', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as any;

    // State already mutated to the post-turn value; the pre-animation values
    // are captured and the income window is open.
    scene.state.resourceBank.coins = 150;
    scene.state.resourceBank.reputation = 42;
    scene.previousCoins = 100;
    scene.previousReputation = 30;
    scene.incomeCollectionActive = true;

    scene.refreshHud();

    expect(hudCoinText(scene)).toBe('Coins: 100');
    // Reputation uses the previous (pre-animation) value too.
    const repText = (scene.hudContainer.list as Phaser.GameObjects.GameObject[])
      .find(
        (obj) => obj instanceof Phaser.GameObjects.Text
          && (obj as any)._hudTransient
          && (obj as Phaser.GameObjects.Text).text.startsWith('Reputation:'),
      ) as Phaser.GameObjects.Text | undefined;
    expect(repText?.text).toBe('Reputation: 30');

    scene.incomeCollectionActive = false;
  });

  it('keeps the window open during an incident reveal and switches only after it closes', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as any;

    scene.state.resourceBank.coins = 200;
    scene.previousCoins = 100;
    scene.incidentRevealActive = true;
    scene.incomeCollectionActive = false;

    scene.refreshHud();
    expect(hudCoinText(scene)).toBe('Coins: 100');

    // Incident reveal completes → the window closes → HUD shows the new value.
    scene.incidentRevealActive = false;
    scene.previousCoins = null;
    scene.previousReputation = null;
    scene.refreshHud();
    expect(hudCoinText(scene)).toBe('Coins: 200');
  });

  it('falls back to state values outside the deferred window (no regression)', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as any;

    scene.state.resourceBank.coins = 77;
    scene.previousCoins = 50; // stale captures are ignored when no animation runs
    scene.incomeCollectionActive = false;
    scene.incidentRevealActive = false;

    scene.refreshHud();

    expect(hudCoinText(scene)).toBe('Coins: 77');
  });
});