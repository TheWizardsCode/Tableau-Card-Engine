/**
 * Main Street startup console-error regression tests.
 *
 * Ensures that starting a new Main Street game does not produce
 * console errors — particularly the `drawImage(null)` crash that
 * occurred when cached Phaser textures were cleared with a yield
 * point before rasterisation could replace them.
 *
 * This test boots a full Phaser game in a browser environment,
 * captures all console.error / console.warn calls during startup,
 * and asserts that only expected diagnostic messages appear.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Phaser from 'phaser';
import { page } from '@vitest/browser/context';
import { waitForScene } from '../helpers/waitForScene';
import { destroyGame } from '../helpers/main-street-tutorial-e2e';

const SCENE_LOAD_TIMEOUT = 30_000;

let game: Phaser.Game | null = null;
let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let capturedErrors: string[] = [];
let capturedWarns: string[] = [];

/**
 * Boot a fresh Main Street game with default settings.
 * Cleans up any stale DOM or canvas state first.
 */
async function bootMainStreetGame(): Promise<Phaser.Game> {
  // Clean up any stale state
  document.querySelectorAll('canvas').forEach((el) => el.remove());
  const existing = document.getElementById('game-container');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import(
    '../../example-games/main-street/createMainStreetGame'
  );

  const newGame = createMainStreetGame({
    type: Phaser.CANVAS,
    parent: 'game-container',
    width: 1280,
    height: 720,
  });

  await waitForScene(newGame, 'MainStreetScene', SCENE_LOAD_TIMEOUT);

  // Wait for async campaign load and prewarm to complete
  const scene = newGame.scene.getScene('MainStreetScene') as any;
  if (scene?.cardSvgLoadPromise) {
    await scene.cardSvgLoadPromise;
  }
  const campaignPromise = scene?._campaignLoadPromise;
  if (campaignPromise) {
    await campaignPromise;
  }

  // Extra settle time for SVG rasterisation and render loop
  await new Promise((r) => setTimeout(r, 500));

  return newGame;
}

describe('Main Street startup — no console errors', () => {
  beforeEach(() => {
    // Clear captured logs from any previous test
    capturedErrors = [];
    capturedWarns = [];

    // Spy on console methods BEFORE the game boots
    errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: any[]) => {
      capturedErrors.push(args.map((a: any) => String(a)).join(' '));
    });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: any[]) => {
      capturedWarns.push(args.map((a: any) => String(a)).join(' '));
    });
  });

  afterEach(async () => {
    // Restore console spies and destroy game
    errorSpy?.mockRestore();
    warnSpy?.mockRestore();
    await destroyGame(game);
    game = null;
  });

  it('starts without drawImage / null texture errors', async () => {
    game = await bootMainStreetGame();

    // Take a screenshot for visual debugging
    await page.screenshot({
      path: `__screenshots__/main-street-no-console-errors/startup.png`,
    });

    // Report any captured errors for debugging
    if (capturedErrors.length > 0) {
      console.log('Captured console.error during startup:', JSON.stringify(capturedErrors, null, 2));
    }
    if (capturedWarns.length > 0) {
      console.log('Captured console.warn during startup:', JSON.stringify(capturedWarns, null, 2));
    }

    // No console.error should fire during a clean startup
    expect(capturedErrors).toHaveLength(0);

    // Specifically check that drawImage errors are absent
    for (const err of capturedErrors) {
      expect(err).not.toContain('drawImage');
      expect(err).not.toContain('canvasData');
      expect(err).not.toContain('Cannot read properties of null');
    }
  });
});
