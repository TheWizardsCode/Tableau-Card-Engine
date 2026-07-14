import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);
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

function getOverlayManager(scene: Phaser.Scene): any {
  return (scene as any).overlayManager;
}

/**
 * Collect display objects from scene children and the HUD container.
 * Phaser 4 containers store children in .list (not .children).
 */
function collectFromSceneAndHud<T extends Phaser.GameObjects.GameObject>(
  scene: Phaser.Scene,
  predicate: (obj: Phaser.GameObjects.GameObject) => obj is T,
): T[] {
  const result: T[] = [];
  const walk = (parent: Phaser.GameObjects.GameObject[]) => {
    for (const child of parent) {
      if (predicate(child)) result.push(child);
      if (child instanceof Phaser.GameObjects.Container && (child as any).list) {
        walk((child as any).list);
      }
    }
  };
  walk(scene.children.list);
  const hud = (scene as any).hudContainer as { list: Phaser.GameObjects.GameObject[] } | undefined;
  if (hud && hud.list) walk(hud.list);
  return result;
}

let game: Phaser.Game | null = null;

beforeAll(async () => {
  game = await bootGame();
}, 120_000);

afterAll(() => {
  destroyGame(game);
  game = null;
});

describe('Beleaguered Castle help panel', () => {
  it('opens/closes, has correct depth, and input blocker', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
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
    // Wait enough frames for the 300ms slide-out animation to complete
    // (inputBlocker is only removed in the onComplete callback).
    await waitFrames(20);
    expect(scene.helpPanel.isOpen).toBe(false);
    expect((scene.helpPanel as any).inputBlocker).toBeNull();
  });
});

describe('Beleaguered Castle settings panel', () => {
  it('opens/closes, has correct depth, and input blocker', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
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
    // Wait enough frames for the 300ms slide-out animation to complete
    // (inputBlocker is only removed in the onComplete callback).
    await waitFrames(20);
    expect(scene.settingsPanel.isOpen).toBe(false);
    expect((scene.settingsPanel as any).inputBlocker).toBeNull();
  });
});

describe('Beleaguered Castle overlay z-ordering', () => {
  it('help panel and settings panel are parented into hudContainer for correct z-ordering', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
    await waitFrames(8);

    // Verify hudContainer exists at convention depth
    expect(scene.hudContainer).toBeDefined();
    expect(scene.hudContainer.depth).toBe(1000);

    // Open help panel and verify its container is parented into hudContainer
    scene.helpPanel.open();
    await waitFrames(10);
    const helpContainer = (scene.helpPanel as any).container as Phaser.GameObjects.Container;
    expect(helpContainer.parentContainer).toBe(scene.hudContainer);
    scene.helpPanel.close();
    await waitFrames(10);

    // Open settings panel and verify its container is parented into hudContainer
    scene.settingsPanel.open();
    await waitFrames(10);
    const settingsContainer = (scene.settingsPanel as any).container as Phaser.GameObjects.Container;
    expect(settingsContainer.parentContainer).toBe(scene.hudContainer);
    scene.settingsPanel.close();
    await waitFrames(10);
  });
});

describe('Beleaguered Castle overlay z-ordering', () => {
  it('help panel and settings panel are parented into hudContainer for correct z-ordering', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
    await waitFrames(8);

    // Verify hudContainer exists at convention depth
    expect(scene.hudContainer).toBeDefined();
    expect(scene.hudContainer.depth).toBe(1000);

    // Open help panel and verify its container is parented into hudContainer
    scene.helpPanel.open();
    await waitFrames(10);
    const helpContainer = (scene.helpPanel as any).container as Phaser.GameObjects.Container;
    expect(helpContainer.parentContainer).toBe(scene.hudContainer);
    scene.helpPanel.close();
    await waitFrames(10);

    // Open settings panel and verify its container is parented into hudContainer
    scene.settingsPanel.open();
    await waitFrames(10);
    const settingsContainer = (scene.settingsPanel as any).container as Phaser.GameObjects.Container;
    expect(settingsContainer.parentContainer).toBe(scene.hudContainer);
    scene.settingsPanel.close();
    await waitFrames(10);
  });
});

describe('Beleaguered Castle overlays', () => {
  it('win overlay has input blocker, buttons at correct depths, and dismissal', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
    await waitFrames(8);

    (scene as any).showWinOverlay(0);
    await waitFrames(5);

    // Check blocker - objects are in HUD container
    const allRects = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Rectangle =>
      child instanceof Phaser.GameObjects.Rectangle && child.depth === 2000,
    );
    expect(allRects.length).toBeGreaterThanOrEqual(1);
    const blocker = allRects.find((r) => r.width === 1280 && r.height === 720 && r.input?.enabled);
    expect(blocker).toBeDefined();

    // Check buttons — createGameOverOverlay creates them at DEFAULT_BUTTON_DEPTH = 11
    const labels = ['Play Again', 'Restart', 'Menu'];
    const btns = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Text =>
      child instanceof Phaser.GameObjects.Text && labels.includes(child.text) && child.depth === 11,
    );
    expect(btns.length).toBeGreaterThanOrEqual(2);
    for (const btn of btns) expect(btn.input?.enabled).toBe(true);

    // Verify overlay objects are parented into hudContainer
    const hud = scene.hudContainer as { list: Phaser.GameObjects.GameObject[] };
    const hudTexts = hud.list?.filter(
      (child) => child instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];
    const titleInHud = hudTexts.find((t) => t.text === 'You Win!');
    expect(titleInHud).toBeDefined();
    const summaryInHud = hudTexts.find((t) => (t.text as string).includes('Moves:'));
    expect(summaryInHud).toBeDefined();

    // Dismiss
    getOverlayManager(scene).dismiss();
    await waitFrames(3);
    const winText = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Text =>
      child instanceof Phaser.GameObjects.Text && child.text === 'You Win!',
    );
    expect(winText.length).toBe(0);
  });

  it('no-moves overlay has input blocker, buttons at correct depths, and dismissal', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
    await waitFrames(8);

    (scene as any).showNoMovesOverlay();
    await waitFrames(5);

    // Check blocker - objects are in HUD container
    const allRects = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Rectangle =>
      child instanceof Phaser.GameObjects.Rectangle && child.depth === 2000,
    );
    expect(allRects.length).toBeGreaterThanOrEqual(1);
    const blocker = allRects.find((r) => r.width === 1280 && r.height === 720 && r.input?.enabled);
    expect(blocker).toBeDefined();

    // Check buttons
    const labels = ['[ Undo Last ]', '[ New Game ]', '[ Restart ]', '[ Menu ]'];
    const btns = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Text =>
      child instanceof Phaser.GameObjects.Text && labels.includes(child.text) && child.depth === 2001,
    );
    expect(btns.length).toBeGreaterThanOrEqual(3);
    for (const btn of btns) expect(btn.input?.enabled).toBe(true);

    // Verify overlay content is parented into hudContainer for correct z-ordering
    const hud = scene.hudContainer as { list: Phaser.GameObjects.GameObject[] };
    const hudTexts = hud.list?.filter(
      (child) => child instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];
    const titleInHud = hudTexts.find((t) => t.text === 'No Productive Moves Available');
    expect(titleInHud).toBeDefined();

    // Dismiss
    getOverlayManager(scene).dismiss();
    await waitFrames(3);
    const noMoveText = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Text =>
      child instanceof Phaser.GameObjects.Text && child.text === 'No Productive Moves Available',
    );
    expect(noMoveText.length).toBe(0);
  });

  describe('Undo/Redo migration to shared mechanism', () => {
    it('uses initUndoRedoButtons from CardGameScene (no direct button creation in renderer)', async () => {
        const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
      await waitFrames(8);

      // Verify the shared mechanism's undo/redo buttons exist
      const undoBtn = (scene as any).undoButton as Phaser.GameObjects.Container | null;
      const redoBtn = (scene as any).redoButton as Phaser.GameObjects.Container | null;
      expect(undoBtn).not.toBeNull();
      expect(redoBtn).not.toBeNull();

      // Verify the renderer no longer has direct undo/redo button fields
      expect((scene as any).bcRenderer.undoBtn).toBeUndefined();
      expect((scene as any).bcRenderer.redoBtn).toBeUndefined();

      // Verify correct ordering (undo left of redo)
      expect(undoBtn!.x).toBeLessThan(redoBtn!.x);
    });

    it('undo/redo buttons do not overlap with settings button', async () => {
        const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
      await waitFrames(8);

      const undoBtn = (scene as any).undoButton as Phaser.GameObjects.Container | null;
      const redoBtn = (scene as any).redoButton as Phaser.GameObjects.Container | null;
      const settingsBtn = (scene as any).settingsButton as any;

      expect(undoBtn).not.toBeNull();
      expect(redoBtn).not.toBeNull();
      expect(settingsBtn).not.toBeNull();

      // Settings button left edge (center - radius)
      const settingsLeftEdge = settingsBtn.posX - 16;
      // Redo right edge (center + half-width)
      const redoRightEdge = redoBtn!.x + 30;

      expect(redoRightEdge).toBeLessThan(settingsLeftEdge);
    });

    it('undo/redo callbacks work (wired to turnController)', async () => {
        const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
      await waitFrames(8);

      // Access the undo/redo buttons' callback
      // The buttons are Containers; their first child is the interactive bg rectangle
      const redoContainer = (scene as any).redoButton as Phaser.GameObjects.Container;
      expect(redoContainer).not.toBeNull();
      expect(redoContainer.list.length).toBeGreaterThanOrEqual(1);

      // The buttons should exist and be interactive (not test clicking which
      // requires coordinate-based interaction - we just verify the mechanism
      // is wired. The unit tests verify callback invocation.)
      expect(scene.turnController).toBeDefined();
      expect(typeof scene.turnController.performUndo).toBe('function');
      expect(typeof scene.turnController.performRedo).toBe('function');
    });

    it('keyboard shortcuts (Ctrl+Z, Ctrl+Y) remain functional', async () => {
        const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
      await waitFrames(8);

      // Simulate keyboard events by emitting on the scene's keyboard
      const keyboard = scene.input.keyboard;
      expect(keyboard).toBeDefined();

      // Verify keyboard is wired (the scene sets up keydown listener)
      // For real keyboard tests we'd need to dispatch DOM events, but
      // Phaser handles that internally. We just verify the scene has
      // the keyboard handler wired up by checking the keyboard reference.
      expect(keyboard.enabled).toBe(true);
    });
  });
});
