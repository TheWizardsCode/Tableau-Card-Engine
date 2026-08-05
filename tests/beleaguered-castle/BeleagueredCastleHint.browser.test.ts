import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);
  (window as any).__BC_TEST_REDUCED_MOTION__ = true;
  const { createBeleagueredCastleGame } = await import('../../example-games/beleaguered-castle/createBeleagueredCastleGame');
  const game = createBeleagueredCastleGame({ type: Phaser.CANVAS });
  await waitForScene(game, 'BeleagueredCastleScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function waitFrames(n: number, fallbackMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let left = n;
    const finish = () => { if (settled) return; settled = true; resolve(); };
    const fallback = setTimeout(finish, fallbackMs);
    const tick = () => {
      if (settled) return;
      left -= 1;
      if (left <= 0) { clearTimeout(fallback); finish(); }
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Wait until the deal has completed (dealComplete true). */
async function waitForDeal(scene: any): Promise<void> {
  for (let i = 0; i < 100 && !scene.dealComplete; i++) {
    await waitFrames(1);
  }
  expect(scene.dealComplete).toBe(true);
}

/** Simulate a click on the hint button (its interactive bg rectangle). */
function clickHintButton(scene: any): void {
  const btn = scene.hintBtn as Phaser.GameObjects.Container;
  expect(btn).toBeDefined();
  const bg = btn.list[0] as Phaser.GameObjects.Rectangle;
  bg.emit('pointerdown');
}

let game: Phaser.Game | null = null;

beforeAll(async () => {
  game = await bootGame();
}, 120_000);

afterAll(() => {
  destroyGame(game);
  game = null;
});

describe('Beleaguered Castle hint button', () => {
  it('is created in the HUD next to Undo/Redo', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
    await waitFrames(8);
    await waitForDeal(scene);

    // Hint button exists, is labelled, and is parented into hudContainer
    expect(scene.hintBtn).toBeDefined();
    const btn = scene.hintBtn as Phaser.GameObjects.Container;
    expect(btn.parentContainer).toBe(scene.hudContainer);
    const label = btn.list.find(
      (child: any) => child instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text | undefined;
    expect(label).toBeDefined();
    expect(label!.text).toBe('Hint');

    // Positioned to the left of the Undo button (no overlap)
    expect(btn.x).toBeLessThan((scene as any).undoButton.x);

    // Shared HintBar exists for the hint description
    expect(scene.hintBar).toBeDefined();
    expect((scene as any).hintBar.visible).toBe(false);
  });

  it('suggests a move with highlights and a description when clicked', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
    await waitFrames(8);
    await waitForDeal(scene);

    clickHintButton(scene);
    await waitFrames(10);

    // A suggestion was found and displayed
    expect(scene.bcRenderer.hasActiveHint).toBe(true);
    expect((scene as any).hintBar.visible).toBe(true);
    const hintText = (scene as any).hintBar.textObject.text as string;
    expect(hintText).toContain('Hint: move');

    // Source + destination highlight rectangles at HINT_DEPTH (900)
    const hintRects = scene.children.list.filter(
      (child: any) => child instanceof Phaser.GameObjects.Rectangle && child.depth === 900,
    );
    expect(hintRects.length).toBeGreaterThanOrEqual(2);
  });

  it('clears the suggestion after a board refresh (e.g. after a move)', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
    await waitFrames(8);
    await waitForDeal(scene);

    clickHintButton(scene);
    await waitFrames(5);
    expect(scene.bcRenderer.hasActiveHint).toBe(true);

    scene.refreshAll();

    expect(scene.bcRenderer.hasActiveHint).toBe(false);
    // Hint description hidden after the board changes
    expect((scene as any).hintBar.visible).toBe(false);
    // Hint rects removed from the scene
    const hintRects = scene.children.list.filter(
      (child: any) => child instanceof Phaser.GameObjects.Rectangle && child.depth === 900,
    );
    expect(hintRects.length).toBe(0);
  });

  it('does nothing while interaction is blocked (during deal)', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
    await waitFrames(8);

    // Simulate the deal not being complete
    scene.dealComplete = false;
    clickHintButton(scene);
    await waitFrames(5);

    expect(scene.bcRenderer.hasActiveHint).toBe(false);
    expect((scene as any).hintBar.visible).toBe(false);

    scene.dealComplete = true;
  });
});
