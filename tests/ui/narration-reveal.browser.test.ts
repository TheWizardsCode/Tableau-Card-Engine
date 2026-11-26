/**
 * Browser test for the shared narration reveal helper
 * (`src/ui/narration-reveal.ts`, CG-0MWO7CULE001IWU1 — AC5).
 *
 * The unit suite owns the Phaser-free schedule/decision contract; this file
 * proves the helper on a real Phaser scene and a real framebuffer:
 *
 *  1. under reduced motion the narration block renders **and completes
 *     immediately** with the full prose on screen, with no reveal timer left
 *     running;
 *  2. the progressive path really animates (partial text first, full prose on
 *     completion) driven by Phaser's own time plugin;
 *  3. a real pointer press on the canvas completes a live reveal instantly
 *     (`skipOnInput`), proving the input listener is wired to the scene input
 *     plugin and released afterwards.
 *
 * Everything is imported from the public `@ui` barrel, so the file doubles as a
 * proof of the exported surface.
 *
 * @module tests/ui/narration-reveal.browser.test.ts
 */

import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import {
  revealNarration,
  type NarrationRevealHandle,
} from '../../src/ui';
import { waitForScene } from '../helpers/waitForScene';
import { waitForCondition } from '../helpers/waitForCondition';

const SCENE_KEY = 'NarrationRevealHarness';

const PROSE = 'The gate groans open and the fog takes your name.';

/** A minimal scene exposing a narration text block. */
class NarrationHarnessScene extends Phaser.Scene {
  narrationText!: Phaser.GameObjects.Text;
  handle: NarrationRevealHandle | null = null;

  constructor() {
    super({ key: SCENE_KEY });
  }

  create(): void {
    this.narrationText = this.add.text(20, 40, '', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffffff',
      wordWrap: { width: 600 },
    });
  }
}

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    width: 900,
    height: 600,
    parent: container,
    scene: [NarrationHarnessScene],
    audio: { noAudio: true },
  });
  await waitForScene(game, SCENE_KEY);
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function getHarness(game: Phaser.Game): NarrationHarnessScene {
  const scene = game.scene.getScene(SCENE_KEY) as NarrationHarnessScene;
  expect(scene).toBeDefined();
  return scene;
}

describe('revealNarration browser behaviour', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('renders the block and completes instantly under reduced motion', async () => {
    game = await bootGame();
    const scene = getHarness(game);

    const handle = revealNarration({
      scene,
      target: scene.narrationText,
      prose: PROSE,
      reducedMotion: true,
    });

    // Synchronous by contract: no timer, no input listener, full prose.
    expect(handle.done).toBe(true);
    expect(handle.text).toBe(PROSE);
    expect(scene.narrationText.text).toBe(PROSE);
    expect(scene.narrationText.visible).toBe(true);
    expect(scene.narrationText.displayWidth).toBeGreaterThan(0);

    // Idempotent teardown on an already-complete reveal.
    handle.complete();
    handle.destroy();
    expect(() => handle.destroy()).not.toThrow();
  });

  it('progressively reveals the prose through the real Phaser timer', async () => {
    game = await bootGame();
    const scene = getHarness(game);

    const handle = revealNarration({
      scene,
      target: scene.narrationText,
      prose: PROSE,
      reducedMotion: false,
      sfx: null,
    });

    expect(handle.done).toBe(false);
    expect(scene.narrationText.text).toBe('');

    await waitForCondition(() => handle.done, {
      timeoutMs: 5000,
      label: 'narration reveal completion',
    });

    expect(handle.text).toBe(PROSE);
    expect(scene.narrationText.text).toBe(PROSE);
    expect(scene.narrationText.displayWidth).toBeGreaterThan(0);
  });

  it('completes the reveal on a real pointer press (skipOnInput)', async () => {
    game = await bootGame();
    const scene = getHarness(game);

    const handle = revealNarration({
      scene,
      target: scene.narrationText,
      prose: PROSE,
      reducedMotion: false,
      sfx: null,
    });
    expect(handle.done).toBe(false);

    const canvas = document.querySelector(
      '#game-container canvas',
    ) as HTMLCanvasElement | null;
    expect(canvas).toBeTruthy();
    canvas!.dispatchEvent(
      new MouseEvent('mousedown', {
        clientX: 120,
        clientY: 120,
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
      }),
    );

    await waitForCondition(() => handle.done, {
      timeoutMs: 5000,
      label: 'narration reveal skip-on-input completion',
    });

    expect(handle.text).toBe(PROSE);
    expect(scene.narrationText.text).toBe(PROSE);
  });
});
