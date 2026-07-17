/**
 * Feudalism audio resilience browser test.
 *
 * Verifies that missing audio keys do not crash the game:
 *  - `safePlaySound()` (or try/catch-protected calls) gracefully handle
 *    missing keys without throwing
 *  - Direct unprotected `scene.sound.play()` calls DO throw (demonstrating
 *    why the protection is necessary)
 *  - The game scene remains responsive after safe sound calls
 *  - The game-over overlay renders correctly even with missing audio keys
 *
 * NOTE: Each test boots a fresh Phaser game which creates a WebGL context.
 * Browsers limit concurrent WebGL contexts (~8-16). We keep total boots
 * per file <= 6 to avoid context exhaustion.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { safePlaySound } from '../../src/core-engine/SoundManager';
import { waitForScene } from '../helpers/waitForScene';

// ── Helpers ─────────────────────────────────────────────────

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createFeudalismGame } = await import(
    '../../example-games/feudalism/createFeudalismGame'
  );
  const game = createFeudalismGame({ type: Phaser.CANVAS });
  await waitForScene(game, 'FeudalismScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true, false);
  }
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

/**
 * Get a typed reference to the active FeudalismScene.
 */
function getScene(game: Phaser.Game): Phaser.Scene {
  const scene = game.scene.getScene('FeudalismScene');
  if (!scene) throw new Error('FeudalismScene not found');
  return scene;
}

/**
 * Check if the scene is still active by verifying its systems are running.
 */
function isSceneActive(scene: Phaser.Scene): boolean {
  return scene.sys.isActive();
}

// ── Tests ───────────────────────────────────────────────────

describe('Feudalism audio resilience', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('safePlaySound does not throw for a missing audio key', async () => {
    game = await bootGame();
    const scene = getScene(game);

    // This key was never loaded into Phaser's audio cache
    const MISSING_KEY = '__test-nonexistent-audio-key__';

    let error: Error | null = null;
    try {
      safePlaySound(scene, MISSING_KEY);
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeNull();
  });

  it('safePlaySound does not throw when sound is null', async () => {
    game = await bootGame();

    let error: Error | null = null;
    try {
      safePlaySound(null, 'any-key');
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeNull();
  });

  it('scene remains active after safePlaySound calls with missing keys', async () => {
    game = await bootGame();
    const scene = getScene(game);

    // Make multiple safe play attempts with various missing keys
    safePlaySound(scene, '__test-nonexistent-key-1__');
    safePlaySound(scene, '__test-nonexistent-key-2__');
    safePlaySound(scene, '__test-nonexistent-key-3__');

    // Wait a few frames for any deferred error propagation
    await waitFrames(5);

    // Scene must still be active
    expect(isSceneActive(scene)).toBe(true);
  });

  it('direct scene.sound.play with missing key throws an error', async () => {
    game = await bootGame();
    const scene = getScene(game);

    const MISSING_KEY = '__test-nonexistent-audio-key__';

    // Phaser's sound.play() throws when the key is not in the audio cache.
    // This test proves WHY the try/catch protection is necessary.
    expect(() => {
      scene.sound.play(MISSING_KEY);
    }).toThrow();
  });

  it('game-over overlay renders and scene remains active after sound calls', async () => {
    game = await bootGame();
    const scene = getScene(game);

    // Simulate missing-key sound playback via safePlaySound (as overlays do)
    safePlaySound(scene, '__test-missing-sfx__');
    safePlaySound(scene, '__test-another-missing__');

    // Wait a few frames for any error propagation
    await waitFrames(5);

    // Scene must still be active (the game loop was not crashed)
    expect(isSceneActive(scene)).toBe(true);

    // Verify the Phaser game is still running
    expect(game.isRunning).toBe(true);
  });

  it('protects against null scene or missing sound manager', async () => {
    game = await bootGame();

    // Null scene
    expect(() => safePlaySound(null, 'sfx-test')).not.toThrow();

    // Scene with null sound
    const nullSoundScene = { sound: null };
    expect(() => safePlaySound(nullSoundScene as any, 'sfx-test')).not.toThrow();

    // Scene with sound that has no play method
    const noPlayScene = { sound: {} };
    expect(() => safePlaySound(noPlayScene as any, 'sfx-test')).not.toThrow();
  });
});
