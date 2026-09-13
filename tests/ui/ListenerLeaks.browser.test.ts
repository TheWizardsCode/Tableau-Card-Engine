/**
 * Browser tests verifying that the ListenerRegistry-migrated UI components
 * (HelpPanel, SettingsPanel) leave no listener residue after destroy.
 *
 * These tests create the component on a live Phaser scene, measure the
 * emitter listener counts before/after creation and after `destroy()`, and
 * assert the counts return to baseline — the "no listener leaks" acceptance
 * criterion for the ListenerRegistry refactor (CG-0MTXDWGY0005SY24).
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

  const { createGolfGame } = await import('../../example-games/golf/createGolfGame');
  const game = createGolfGame({ type: Phaser.CANVAS });
  await waitForScene(game, 'GolfScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

/** Count listeners on an emitter for an event (Phaser 4 EventEmitter). */
function countListeners(emitter: unknown, event: string): number {
  const e = emitter as { listenerCount?: (ev: string) => number };
  if (typeof e.listenerCount !== 'function') return 0;
  return e.listenerCount(event);
}

// ── Tests ───────────────────────────────────────────────────

describe('ListenerRegistry: no listener leaks (browser)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('HelpPanel leaves no listeners after destroy()', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene') as Phaser.Scene;

    // The Golf scene already has its own help panel; capture baseline counts.
    const baselineWheel = countListeners(scene.input, 'wheel');
    const baselineKeydown = scene.input.keyboard
      ? countListeners(scene.input.keyboard, 'keydown')
      : 0;

    const { HelpPanel } = await import('../../src/ui/HelpPanel');
    const panel = new HelpPanel(scene, {
      sections: [
        { heading: 'H1', body: 'Content '.repeat(40) },
        { heading: 'H2', body: 'More content '.repeat(40) },
        { heading: 'H3', body: 'Even more content '.repeat(40) },
      ],
      showButton: false,
    });

    // Wheel listener requires scrollable content (maxScroll > 0); the long
    // section bodies guarantee overflow on the default 800x600 canvas.
    expect(countListeners(scene.input, 'wheel')).toBeGreaterThan(baselineWheel);
    if (scene.input.keyboard) {
      expect(countListeners(scene.input.keyboard, 'keydown')).toBeGreaterThan(baselineKeydown);
    }

    panel.destroy();

    // After destroy, listener counts return to baseline (no leaks).
    expect(countListeners(scene.input, 'wheel')).toBe(baselineWheel);
    if (scene.input.keyboard) {
      expect(countListeners(scene.input.keyboard, 'keydown')).toBe(baselineKeydown);
    }
  });

  it('SettingsPanel leaves no listeners after destroy()', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene') as Phaser.Scene;

    // The Golf scene already has its own settings panel; capture baselines.
    const baselineMove = countListeners(scene.input, 'pointermove');
    const baselineUp = countListeners(scene.input, 'pointerup');
    const baselineKeydown = scene.input.keyboard
      ? countListeners(scene.input.keyboard, 'keydown')
      : 0;

    const { SettingsPanel } = await import('../../src/ui/SettingsPanel');
    const soundManager = (scene as unknown as { soundManager: unknown }).soundManager;
    expect(soundManager).toBeDefined();

    const panel = new SettingsPanel(scene, {
      soundManager: soundManager as never,
      showButton: false,
      hasTooltips: false,
    });

    // Creation adds scene-level pointermove/pointerup listeners.
    expect(countListeners(scene.input, 'pointermove')).toBeGreaterThan(baselineMove);
    expect(countListeners(scene.input, 'pointerup')).toBeGreaterThan(baselineUp);

    panel.destroy();

    // After destroy, counts return to baseline (no leaks).
    expect(countListeners(scene.input, 'pointermove')).toBe(baselineMove);
    expect(countListeners(scene.input, 'pointerup')).toBe(baselineUp);
    if (scene.input.keyboard) {
      expect(countListeners(scene.input.keyboard, 'keydown')).toBe(baselineKeydown);
    }
  });
});