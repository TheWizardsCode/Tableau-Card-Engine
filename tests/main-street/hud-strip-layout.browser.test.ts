/**
 * Main Street: HUD strip layout browser test (CG-0MUFAISSZ002TE1B).
 *
 * Verifies the widened, market-aligned HUD strip:
 * - the strip spans exactly `[hudLeft, hudRight]` (AC2);
 * - Coins are left-aligned at the strip's left edge; Score + week label are
 *   right-aligned at the strip's right edge;
 * - Reputation sits right of the reserved favour band and never overlaps the
 *   Score;
 * - the actions-remaining counter is NOT rendered inside the strip (it moves
 *   to the action cluster in CG-0MUFAITX70081W41);
 * - every strip child is transient-tagged and survives/replaces correctly
 *   across two `refreshHud()` calls (no leak, no persistent-panel destruction).
 *
 * @module tests/main-street/hud-strip-layout.browser
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '@core-tests/helpers/waitForScene';

const TUTORIAL_STATE_KEY = 'tce-main-street-tutorial-state';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();

  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame();
  await waitForScene(game, 'MainStreetScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

interface HudSnapshot {
  layout: {
    hudLeft: number;
    hudRight: number;
    hudWidth: number;
    favourBandRight: number;
  };
  children: Array<Phaser.GameObjects.GameObject & { _hudTransient?: boolean }>;
  texts: Phaser.GameObjects.Text[];
  strip: Phaser.GameObjects.Rectangle | undefined;
}

function snapshot(scene: Phaser.Scene & Record<string, unknown>): HudSnapshot {
  const hud = (scene as any).hudContainer as Phaser.GameObjects.Container;
  const list = (hud?.list ?? hud?.getAll?.() ?? []) as Array<
    Phaser.GameObjects.GameObject & { _hudTransient?: boolean }
  >;
  const texts = list.filter(
    (o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text,
  );
  const strip = list.find(
    (o): o is Phaser.GameObjects.Rectangle =>
      o instanceof Phaser.GameObjects.Rectangle
      && o.width > 500
      && o.height <= 40,
  );
  return {
    layout: (scene as any).layout as HudSnapshot['layout'],
    children: list,
    texts,
    strip,
  };
}

describe('MainStreet HUD strip layout', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    try { (window as any).localStorage?.removeItem(TUTORIAL_STATE_KEY); } catch (_) { /* ignore */ }
    destroyGame(game);
    game = null;
  });

  it('draws a market-aligned strip with the counter removed from it', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    const before = snapshot(scene);
    expect(before.strip, 'HUD strip rectangle not found').toBeDefined();
    const strip = before.strip!;

    // Market-aligned edges: strip spans [hudLeft, hudRight].
    expect(strip.x).toBeCloseTo(before.layout.hudLeft, 0);
    expect(strip.x + strip.width).toBeCloseTo(before.layout.hudRight, 0);
    expect(strip.width).toBeCloseTo(before.layout.hudWidth, 0);

    // Coins left-aligned near the strip's left edge.
    const coinText = before.texts.find((t) => t.text?.startsWith('Coins:'));
    expect(coinText, 'Coins text missing').toBeDefined();
    expect(coinText!.x).toBeCloseTo(before.layout.hudLeft + 10, 0);

    // Score right-aligned near the strip's right edge.
    const scoreText = before.texts.find((t) => t.text?.startsWith('Score:'));
    expect(scoreText, 'Score text missing').toBeDefined();
    expect(scoreText!.getRightCenter().x).toBeCloseTo(before.layout.hudRight - 10, 0);

    // Week label retained under the Score.
    const weekText = before.texts.find((t) => t.text?.startsWith('Week '));
    expect(weekText, 'week label missing').toBeDefined();

    // Reputation is right of the reserved favour band and does not overlap Score.
    const repText = before.texts.find((t) => t.text?.startsWith('Reputation:'));
    expect(repText, 'Reputation text missing').toBeDefined();
    expect(repText!.getLeftCenter().x).toBeGreaterThanOrEqual(before.layout.favourBandRight);
    expect(repText!.getRightCenter().x).toBeLessThan(scoreText!.getLeftCenter().x);

    // No actions-remaining counter text inside the strip bounds.
    const counterInStrip = before.texts.find((t) => {
      if (!/\d+\s+actions?\s+left/i.test(t.text ?? '')) return false;
      const left = t.getLeftCenter().x;
      const right = t.getRightCenter().x;
      return left >= strip.x - 2 && right <= strip.x + strip.width + 2;
    });
    expect(counterInStrip, 'action counter must not render in the HUD strip').toBeUndefined();

    // Every strip child is transient-tagged.
    for (const child of [strip, coinText!, repText!, scoreText!, weekText!]) {
      expect((child as any)._hudTransient, 'strip child must be transient-tagged').toBe(true);
    }

    // Refresh: transient children are replaced (not leaked).
    const transientCountBefore = before.children.filter((c) => c._hudTransient).length;
    (scene as any).refreshHud();
    const after = snapshot(scene);
    const transientCountAfter = after.children.filter((c) => c._hudTransient).length;
    expect(transientCountAfter).toBe(transientCountBefore);

    // New strip is present and still market-aligned.
    expect(after.strip).toBeDefined();
    expect(after.strip!.x).toBeCloseTo(before.layout.hudLeft, 0);
    expect(after.strip!.x + after.strip!.width).toBeCloseTo(before.layout.hudRight, 0);
  }, 30_000);
});
