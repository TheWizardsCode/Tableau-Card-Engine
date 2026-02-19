/**
 * HelpPanel browser tests -- verify that the help panel renders
 * correctly within the Golf game, can be opened/closed, and
 * displays the expected content.
 *
 * Runs in real Chromium via Vitest browser mode + Playwright.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';

// ── Helpers ─────────────────────────────────────────────────

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createGolfGame } = await import(
    '../../example-games/golf/createGolfGame'
  );
  const game = createGolfGame();
  await waitForScene(game, 'GolfScene', 10_000);
  return game;
}

function waitForScene(
  game: Phaser.Game,
  sceneKey: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const scene = game.scene.getScene(sceneKey);
      if (
        scene &&
        (scene as Phaser.Scene & { sys: Phaser.Scenes.Systems }).sys.isActive()
      ) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(
            `Scene "${sceneKey}" did not become active within ${timeoutMs}ms`,
          ),
        );
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

/** Wait N animation frames. */
function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = n;
    const tick = () => {
      remaining--;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// ── Tests ───────────────────────────────────────────────────

describe('UI module exports (browser)', () => {
  it('should export HelpPanel, HelpButton, and UI_VERSION', async () => {
    const ui = await import('../../src/ui/index');
    expect(ui.UI_VERSION).toBe('0.1.0');
    expect(typeof ui.HelpPanel).toBe('function');
    expect(typeof ui.HelpButton).toBe('function');
  });
});

describe('HelpPanel browser tests', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('should render a help button ("?") in the scene', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene') as Phaser.Scene;

    const texts = scene.children.list.filter(
      (child) => child instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];

    const helpButtonText = texts.find((t) => t.text === '?');
    expect(helpButtonText).toBeDefined();
  });

  it('should have the help panel initially closed (not visible)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene') as Phaser.Scene;

    // The HelpPanel container should exist but not be visible
    const containers = scene.children.list.filter(
      (child) => child instanceof Phaser.GameObjects.Container,
    ) as Phaser.GameObjects.Container[];

    // At least one container should exist (the help panel)
    expect(containers.length).toBeGreaterThanOrEqual(1);

    // The help panel container should be hidden (not visible or off-screen)
    const panelContainer = containers.find((c) => c.x < 0 || !c.visible);
    expect(panelContainer).toBeDefined();
  });

  it('should not produce console errors with the help panel integrated', async () => {
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
      originalError.apply(console, args);
    };

    try {
      game = await bootGame();
      await waitFrames(3);
      expect(errors).toEqual([]);
    } finally {
      console.error = originalError;
    }
  });
});
