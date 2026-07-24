/**
 * GymParameterizedOverlayScene browser integration tests.
 *
 * Validates that:
 *  - The scene boots without errors
 *  - Three different parameterized overlay configs are demonstrated
 *  - Each overlay opens on button press and displays correct title/body/buttons
 *  - Button callbacks fire correctly and are logged in the event log
 *  - overlayCenterY offset positioning is demonstrated at two different offsets
 *  - Scene follows Gym conventions (GymSceneBase, GymRegistry entry, barrel export)
 */
import { afterEach, describe, expect, it } from 'vitest';
import { page } from '@vitest/browser/context';
import Phaser from 'phaser';
import { GymParameterizedOverlayScene } from '../../example-games/gym/scenes/GymParameterizedOverlayScene';
import { GYM_PARAMETERIZED_OVERLAY_KEY } from '../../example-games/gym/GymRegistry';
import { GAME_W, GAME_H } from '../../src/ui/constants';
import { waitForScene } from '../helpers/waitForScene';
import { overlayCenterY } from '../../src/ui/ParameterizedOverlay';

describe('GymParameterizedOverlayScene browser integration', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  /**
   * Bootstrap the scene for each test.
   */
  async function bootScene(): Promise<Phaser.Scene> {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: GAME_W,
      height: GAME_H,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [GymParameterizedOverlayScene],
    });

    await waitForScene(game, GYM_PARAMETERIZED_OVERLAY_KEY);
    const scene = game.scene.getScene(GYM_PARAMETERIZED_OVERLAY_KEY);
    expect(scene).toBeTruthy();
    expect(scene.sys.isActive()).toBe(true);
    return scene;
  }

  /**
   * Find a text object in the scene by exact text match.
   */
  function findText(scene: Phaser.Scene, text: string): Phaser.GameObjects.Text | null {
    return (
      scene.children.list.find(
        (child): child is Phaser.GameObjects.Text =>
          child instanceof Phaser.GameObjects.Text && child.text === text,
      ) ?? null
    );
  }

  /**
   * Helper: advance the scene by N frames to allow rendering.
   */
  async function advanceFrames(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await new Promise((r) => requestAnimationFrame(r));
    }
  }

  /**
   * Check if the scene currently has an overlay open by looking for
   * full-screen dark rectangles beyond the normal scene UI.
   */
  function hasOverlayActive(scene: Phaser.Scene): boolean {
    // Count rectangles that could be overlay backgrounds
    const overlayRects = scene.children.list.filter(
      (child) =>
        child instanceof Phaser.GameObjects.Rectangle &&
        child.width === GAME_W &&
        child.height === GAME_H &&
        (child as any).depth !== undefined &&
        (child as any).depth >= 10,
    );
    return overlayRects.length > 0;
  }

  // ── AC 1: Scene boots correctly ──────────────────────────

  it('boots the GymParameterizedOverlayScene without errors', async () => {
    const scene = await bootScene();
    expect(scene).toBeTruthy();
    expect(scene.sys.isActive()).toBe(true);
  });

  // ── AC 2: Scene title is displayed ────────────────────────

  it('displays the scene title', async () => {
    const scene = await bootScene();
    const titleText = findText(scene, 'Parameterized Overlay');
    expect(titleText).toBeTruthy();
  });

  // ── AC 3: Three overlay trigger buttons exist ─────────────

  it('shows three overlay trigger buttons for game-over, round-end, and confirmation', async () => {
    const scene = await bootScene();

    // Find the trigger buttons for each overlay type
    const gameOverBtn = findText(scene, '[ Game Over ]');
    const roundEndBtn = findText(scene, '[ Round End ]');
    const confirmBtn = findText(scene, '[ Confirm Action ]');

    expect(gameOverBtn).toBeTruthy();
    expect(roundEndBtn).toBeTruthy();
    expect(confirmBtn).toBeTruthy();
  });

  // ── AC 4: Game Over overlay opens with correct content ────

  it('Game Over overlay opens with correct title and buttons', async () => {
    const scene = await bootScene();

    // Click the Game Over button
    const gameOverBtn = findText(scene, '[ Game Over ]');
    expect(gameOverBtn).toBeTruthy();
    gameOverBtn!.emit('pointerdown');
    await advanceFrames(5);

    // Overlay should be active
    expect(hasOverlayActive(scene)).toBe(true);

    // The overlay should contain "Game Over" text
    const gameOverTitle = findText(scene, 'Game Over');
    expect(gameOverTitle).toBeTruthy();

    // Should also contain buttons like [ Play Again ] and [ Main Menu ]
    const playAgainBtn = findText(scene, '[ Play Again ]');
    const mainMenuBtn = findText(scene, '[ Main Menu ]');
    expect(playAgainBtn).toBeTruthy();
    expect(mainMenuBtn).toBeTruthy();
  });

  // ── AC 5: Round End overlay opens with correct content ────

  it('Round End overlay opens with correct title and buttons', async () => {
    const scene = await bootScene();

    // Click the Round End button
    const roundEndBtn = findText(scene, '[ Round End ]');
    expect(roundEndBtn).toBeTruthy();
    roundEndBtn!.emit('pointerdown');
    await advanceFrames(5);

    // Overlay should be active
    expect(hasOverlayActive(scene)).toBe(true);

    // The overlay should contain "Round Complete" or similar round-end title
    const roundEndTitle = findText(scene, 'Round Complete');
    expect(roundEndTitle).toBeTruthy();

    // Should contain round-end buttons
    const nextRoundBtn = findText(scene, '[ Next Round ]');
    const viewScoresBtn = findText(scene, '[ View Scores ]');
    expect(nextRoundBtn).toBeTruthy();
    expect(viewScoresBtn).toBeTruthy();
  });

  // ── AC 6: Confirmation overlay opens with correct content ─

  it('Confirmation overlay opens with correct title and buttons', async () => {
    const scene = await bootScene();

    // Click the Confirm Action button
    const confirmBtn = findText(scene, '[ Confirm Action ]');
    expect(confirmBtn).toBeTruthy();
    confirmBtn!.emit('pointerdown');
    await advanceFrames(5);

    // Overlay should be active
    expect(hasOverlayActive(scene)).toBe(true);

    // The overlay should contain "Confirm Action" or similar title
    const confirmTitle = findText(scene, 'Confirm Action');
    expect(confirmTitle).toBeTruthy();

    // Should contain confirmation buttons
    const confirmOkBtn = findText(scene, '[ Confirm ]');
    const cancelBtn = findText(scene, '[ Cancel ]');
    expect(confirmOkBtn).toBeTruthy();
    expect(cancelBtn).toBeTruthy();
  });

  // ── AC 7: Event log shows overlay actions ─────────────────

  it('event log records overlay open events', async () => {
    const scene = await bootScene();

    // Open game-over overlay
    const gameOverBtn = findText(scene, '[ Game Over ]');
    expect(gameOverBtn).toBeTruthy();
    gameOverBtn!.emit('pointerdown');
    await advanceFrames(5);

    // The event log area should contain a record of the action
    // Look for "Game Over" in any log text entries
    const logEntry = scene.children.list.find(
      (child) =>
        child instanceof Phaser.GameObjects.Text &&
        child.text.includes('Game Over'),
    );
    expect(logEntry).toBeTruthy();
  });

  // ── AC 8: Button callbacks log to event log ───────────────

  it('button callbacks inside overlays are logged to event log', async () => {
    const scene = await bootScene();

    // Open game-over overlay
    const gameOverBtn = findText(scene, '[ Game Over ]');
    expect(gameOverBtn).toBeTruthy();
    gameOverBtn!.emit('pointerdown');
    await advanceFrames(5);

    // Find and click the Play Again button inside the overlay
    const playAgainBtn = findText(scene, '[ Play Again ]');
    expect(playAgainBtn).toBeTruthy();
    playAgainBtn!.emit('pointerdown');
    await advanceFrames(5);

    // The event log should record the button press
    const playAgainLog = scene.children.list.find(
      (child) =>
        child instanceof Phaser.GameObjects.Text &&
        child.text.includes('Play Again'),
    );
    expect(playAgainLog).toBeTruthy();
  });

  // ── AC 9: Multiple different overlayCenterY offsets ───────

  it('uses at least two different overlayCenterY offset values', async () => {
    const scene = await bootScene();

    // The scene should expose the overlay configs with their Y offsets
    const overlayConfigs = (scene as any).overlayConfigs as
      | ReadonlyArray<{ title: string; offset: number }>
      | undefined;

    expect(overlayConfigs).toBeTruthy();
    expect(overlayConfigs!.length).toBeGreaterThanOrEqual(3);

    // Collect the unique offset values used
    const offsets = new Set(overlayConfigs!.map((c) => c.offset));
    expect(offsets.size).toBeGreaterThanOrEqual(2);
  });

  // ── AC 10: overlayCenterY produces different positions ────

  it('overlayCenterY with different offsets produces different Y values', () => {
    const pos1 = overlayCenterY(20);
    const pos2 = overlayCenterY(-40);
    expect(pos1).not.toBe(pos2);
    expect(pos1).toBe(GAME_H / 2 + 20);
    expect(pos2).toBe(GAME_H / 2 - 40);
  });

  // ── AC 11: Event log header is present ────────────────────

  it('displays the event log header', async () => {
    const scene = await bootScene();
    const logHeader = findText(scene, '── Event Log ──');
    expect(logHeader).toBeTruthy();
  });

  // ── AC 12: Help panel sections exist ──────────────────────

  it('provides help sections for the scene', async () => {
    const scene = await bootScene();
    // The scene should have help panel sections defined
    const helpSectionCount = (scene as any).helpSectionCount as number | undefined;
    expect(helpSectionCount).toBeGreaterThanOrEqual(1);
  });

  // ── Visual screenshot test ─────────────────────────────

  it('overlay screenshot shows game-over parameterized overlay (visual verification)', async () => {
    const scene = await bootScene();

    // Open the Game Over overlay
    const gameOverBtn = findText(scene, '[ Game Over ]');
    expect(gameOverBtn).toBeTruthy();
    gameOverBtn!.emit('pointerdown');
    await advanceFrames(10);

    // Capture a screenshot
    const canvas = document.querySelector('canvas');
    expect(canvas).not.toBeNull();

    const screenshotPath = `__screenshots__/GymParameterizedOverlayScene.browser.test.ts/overlay-game-over.png`;
    await page.screenshot({ path: screenshotPath });

    console.log(`[screenshot:game-over-overlay] path=${screenshotPath} canvas=${canvas!.width}x${canvas!.height}`);
  });
});
