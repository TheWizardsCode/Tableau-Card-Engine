import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);
  const { createBeleagueredCastleGame } = await import('../../example-games/beleaguered-castle/createBeleagueredCastleGame');
  const game = createBeleagueredCastleGame();
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

function getOverlayManager(scene: Phaser.Scene): any {
  return (scene as any).overlayManager;
}

describe('Beleaguered Castle help panel', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => { destroyGame(game); game = null; });

  it('opens/closes, has correct depth, and input blocker', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('BeleagueredCastleScene') as any;
    await waitFrames(8);

    expect(scene.helpPanel).toBeDefined();
    expect(scene.helpButton).toBeDefined();
    expect(scene.helpPanel.isOpen).toBe(false);

    scene.helpPanel.open();
    await waitFrames(10);
    expect(scene.helpPanel.isOpen).toBe(true);

    const c = (scene.helpPanel as any).container as Phaser.GameObjects.Container;
    expect(c.visible).toBe(true);
    expect(c.depth).toBeGreaterThanOrEqual(900);

    const blocker = (scene.helpPanel as any).inputBlocker as Phaser.GameObjects.Rectangle | null;
    expect(blocker).toBeDefined();
    if (blocker) {
      expect(blocker.input?.enabled).toBe(true);
      expect(blocker.depth).toBeGreaterThanOrEqual(900);
    }

    scene.helpPanel.close();
    await waitFrames(10);
    expect(scene.helpPanel.isOpen).toBe(false);
    expect((scene.helpPanel as any).inputBlocker).toBeNull();
  });
});

describe('Beleaguered Castle settings panel', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => { destroyGame(game); game = null; });

  it('opens/closes, has correct depth, and input blocker', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('BeleagueredCastleScene') as any;
    await waitFrames(8);

    expect(scene.settingsPanel).toBeDefined();
    expect(scene.settingsButton).toBeDefined();
    expect(scene.settingsPanel.isOpen).toBe(false);

    scene.settingsPanel.open();
    await waitFrames(10);
    expect(scene.settingsPanel.isOpen).toBe(true);

    const c = (scene.settingsPanel as any).container as Phaser.GameObjects.Container;
    expect(c.visible).toBe(true);
    expect(c.depth).toBeGreaterThanOrEqual(900);

    const blocker = (scene.settingsPanel as any).inputBlocker as Phaser.GameObjects.Rectangle | null;
    expect(blocker).toBeDefined();
    if (blocker) {
      expect(blocker.input?.enabled).toBe(true);
      expect(blocker.depth).toBeGreaterThanOrEqual(900);
    }

    scene.settingsPanel.close();
    await waitFrames(10);
    expect(scene.settingsPanel.isOpen).toBe(false);
    expect((scene.settingsPanel as any).inputBlocker).toBeNull();
  });
});

describe('Beleaguered Castle overlays', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => { destroyGame(game); game = null; });

  it('win overlay has input blocker, buttons at correct depths, and dismissal', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('BeleagueredCastleScene') as any;
    await waitFrames(8);

    getOverlayManager(scene).showWinOverlay(0);
    await waitFrames(5);

    // Check blocker
    const rects = scene.children.list.filter(
      (child: any) => child instanceof Phaser.GameObjects.Rectangle && child.depth === 2000,
    ) as Phaser.GameObjects.Rectangle[];
    expect(rects.length).toBeGreaterThanOrEqual(1);
    const blocker = rects.find((r: any) => r.width === 1280 && r.height === 720 && r.input?.enabled);
    expect(blocker).toBeDefined();

    // Check buttons at depth 2001
    const labels = ['[ New Game ]', '[ Restart ]', '[ Menu ]'];
    const btns = scene.children.list.filter(
      (child: any) => child instanceof Phaser.GameObjects.Text && labels.includes(child.text) && child.depth === 2001,
    ) as Phaser.GameObjects.Text[];
    expect(btns.length).toBeGreaterThanOrEqual(2);
    for (const btn of btns) expect(btn.input?.enabled).toBe(true);

    // Dismiss
    getOverlayManager(scene).dismiss();
    await waitFrames(3);
    const winText = scene.children.list.filter((child: any) => child instanceof Phaser.GameObjects.Text && child.text === 'You Win!');
    expect(winText.length).toBe(0);
  });

  it('no-moves overlay has input blocker, buttons at correct depths, and dismissal', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('BeleagueredCastleScene') as any;
    await waitFrames(8);

    getOverlayManager(scene).showNoMovesOverlay();
    await waitFrames(5);

    // Check blocker
    const rects = scene.children.list.filter(
      (child: any) => child instanceof Phaser.GameObjects.Rectangle && child.depth === 2000,
    ) as Phaser.GameObjects.Rectangle[];
    expect(rects.length).toBeGreaterThanOrEqual(1);
    const blocker = rects.find((r: any) => r.width === 1280 && r.height === 720 && r.input?.enabled);
    expect(blocker).toBeDefined();

    // Check buttons
    const labels = ['[ Undo Last ]', '[ New Game ]', '[ Restart ]', '[ Menu ]'];
    const btns = scene.children.list.filter(
      (child: any) => child instanceof Phaser.GameObjects.Text && labels.includes(child.text) && child.depth === 2001,
    ) as Phaser.GameObjects.Text[];
    expect(btns.length).toBeGreaterThanOrEqual(3);
    for (const btn of btns) expect(btn.input?.enabled).toBe(true);

    // Dismiss
    getOverlayManager(scene).dismiss();
    await waitFrames(3);
    const noMoveText = scene.children.list.filter(
      (child: any) => child instanceof Phaser.GameObjects.Text && child.text === 'No Productive Moves Available',
    );
    expect(noMoveText.length).toBe(0);
  });
});
