/**
 * HelpPanel browser tests -- verify that the help panel renders
 * correctly within the Golf game, can be opened/closed, and
 * displays the expected content.
 *
 * Runs in real Chromium via Vitest browser mode + Playwright.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

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
  await waitForScene(game, 'GolfScene');
  return game;
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

  it('should export HelpButtonPosition and SettingsButtonPosition types', async () => {
    const ui = await import('../../src/ui/index');
    // Type-only exports cannot be checked at runtime, but we can verify
    // that the module imports without errors and the types are available
    expect(ui.HelpPanel).toBeDefined();
    expect(ui.SettingsPanel).toBeDefined();
  });

  it('should allow showButton:false to suppress button creation', async () => {
    // Create a minimal game just to test HelpPanel with showButton:false
    let container = document.getElementById('game-container');
    if (container) container.remove();
    container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    const { createGolfGame } = await import(
      '../../example-games/golf/createGolfGame'
    );
    game = createGolfGame();
    await waitForScene(game, 'GolfScene');
    const scene = game.scene.getScene('GolfScene') as Phaser.Scene;

    // Create a HelpPanel with showButton: false
    const { HelpPanel } = await import('../../src/ui/HelpPanel');
    const panel = new HelpPanel(scene, {
      sections: [{ heading: 'Test', body: 'Test body' }],
      showButton: false,
    });

    expect(panel.helpButton).toBeNull();

    // Cleanup
    panel.destroy();
  });

  it('should allow showButton:true (default) to create a button', async () => {
    // Create a minimal game just to test HelpPanel with showButton:true
    let container = document.getElementById('game-container');
    if (container) container.remove();
    container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    const { createGolfGame } = await import(
      '../../example-games/golf/createGolfGame'
    );
    game = createGolfGame();
    await waitForScene(game, 'GolfScene');
    const scene = game.scene.getScene('GolfScene') as Phaser.Scene;

    const { HelpPanel } = await import('../../src/ui/HelpPanel');
    const panel = new HelpPanel(scene, {
      sections: [{ heading: 'Test', body: 'Test body' }],
    });

    // Default: showButton is true, so helpButton should exist
    expect(panel.helpButton).not.toBeNull();
    expect(panel.helpButton).toBeDefined();

    // Cleanup
    panel.destroy();
  });

  it('should destroy the integrated button when panel is destroyed', async () => {
    let container = document.getElementById('game-container');
    if (container) container.remove();
    container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    const { createGolfGame } = await import(
      '../../example-games/golf/createGolfGame'
    );
    game = createGolfGame();
    await waitForScene(game, 'GolfScene');
    const scene = game.scene.getScene('GolfScene') as Phaser.Scene;

    const { HelpPanel } = await import('../../src/ui/HelpPanel');
    const panel = new HelpPanel(scene, {
      sections: [{ heading: 'Test', body: 'Test body' }],
    });

    // Button exists
    expect(panel.helpButton).not.toBeNull();
    const btn = panel.helpButton!;

    // Destroy panel
    panel.destroy();

    // Button should be destroyed (destroyed flag set, objects cleaned up)
    // HelpButton.destroy() is idempotent, so calling it again is safe
    btn.destroy();

    // Panel's helpButton should be null after destroy
    expect(panel.helpButton).toBeNull();
  });
});
