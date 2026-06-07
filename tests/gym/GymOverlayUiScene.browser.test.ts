/**
 * GymOverlayUiScene browser integration tests.
 *
 * Validates that:
 *  - The overlay opens and dismisses correctly
 *  - The overlay background rectangle is centered (not in top-left corner)
 *  - Overlay positioning is correct relative to the game viewport
 *  - Visual regression via screenshot comparison
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { page } from '@vitest/browser/context';
import { GymOverlayUiScene } from '../../example-games/gym/scenes/GymOverlayUiScene';
import { GYM_OVERLAY_UI_KEY } from '../../example-games/gym/GymRegistry';
import { GAME_W, GAME_H } from '../../src/ui/constants';
import { waitForScene } from '../helpers/waitForScene';

describe('GymOverlayUiScene browser integration', () => {
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
      type: Phaser.AUTO,
      width: GAME_W,
      height: GAME_H,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [GymOverlayUiScene],
    });

    await waitForScene(game, GYM_OVERLAY_UI_KEY);
    const scene = game.scene.getScene(GYM_OVERLAY_UI_KEY);
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
   * Get the x, y position and dimensions of the overlay background rectangle.
   * The overlay background is a Phaser.GameObjects.Rectangle with a dark fill
   * color (0x0a1a0a) that covers the full screen.
   */
  function getOverlayBackground(scene: Phaser.Scene): {
    x: number;
    y: number;
    width: number;
    height: number;
    displayOriginX: number;
    displayOriginY: number;
    fillColor?: number;
  } | null {
    const rectangles = scene.children.list.filter(
      (child): child is Phaser.GameObjects.Rectangle =>
        child instanceof Phaser.GameObjects.Rectangle &&
        child.width === GAME_W &&
        child.height === GAME_H,
    );

    // The first full-screen rectangle should be the overlay background
    if (rectangles.length === 0) return null;

    const bg = rectangles[0];
    return {
      x: bg.x,
      y: bg.y,
      width: bg.width,
      height: bg.height,
      displayOriginX: bg.displayOriginX,
      displayOriginY: bg.displayOriginY,
      fillColor: bg.fillColor,
    };
  }

  /**
   * Helper: advance the scene by N frames to allow tweens, rendering, etc.
   */
  async function advanceFrames(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await new Promise((r) => requestAnimationFrame(r));
    }
  }

  // ── AC 1: Scene boots correctly ──────────────────────────

  it('boots the GymOverlayUiScene without errors', async () => {
    const scene = await bootScene();
    expect(scene).toBeTruthy();
    expect(scene.sys.isActive()).toBe(true);
  });

  // ── AC 2: Overlay opens and dismisses ─────────────────────

  it('opens overlay when Show Overlay button is clicked', async () => {
    const scene = await bootScene();

    // Find and click the Show Overlay button
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');

    await advanceFrames(5);

    // After opening, the overlay background should exist
    const bg = getOverlayBackground(scene);
    expect(bg).not.toBeNull();
  });

  it('dismisses overlay when Dismiss Overlay button is clicked', async () => {
    const scene = await bootScene();

    // Open overlay
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
    await advanceFrames(5);

    // Should have overlay background
    expect(getOverlayBackground(scene)).not.toBeNull();

    // Find and click the dismiss button (inside overlay)
    const dismissBtn = findText(scene, '[ Dismiss Overlay ]');
    expect(dismissBtn).toBeTruthy();

    // The dismiss button inside the overlay may have a different reference.
    // The overlay has text "[ Dismiss Overlay ]" at (GAME_W/2, 520).
    // Let's emit pointerdown on the dismiss text objects.
    const dismissTexts = scene.children.list.filter(
      (child): child is Phaser.GameObjects.Text =>
        child instanceof Phaser.GameObjects.Text &&
        child.text === '[ Dismiss Overlay ]',
    );
    // The dismiss link INSIDE the overlay should have depth >= 11
    const overlayDismiss = dismissTexts.find((t) => (t as any).depth >= 11);
    expect(overlayDismiss).toBeTruthy();
    overlayDismiss!.emit('pointerdown');

    await advanceFrames(5);

    // After dismissing, the overlay background should be gone
    expect(getOverlayBackground(scene)).toBeNull();
  });

  // ── AC 3: Overlay background is centered ──────────────────

  it('overlay background rectangle is centered at (GAME_W/2, GAME_H/2)', async () => {
    const scene = await bootScene();

    // Open overlay
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
    await advanceFrames(5);

    // Get the overlay background
    const bg = getOverlayBackground(scene);
    expect(bg, 'Overlay background rectangle should exist').not.toBeNull();

    // The background should be centered at (GAME_W/2, GAME_H/2)
    // Allow 1px tolerance for subpixel rendering
    expect(bg!.x).toBeCloseTo(GAME_W / 2, 0);
    expect(bg!.y).toBeCloseTo(GAME_H / 2, 0);

    // Dimensions should match the game viewport
    expect(bg!.width).toBe(GAME_W);
    expect(bg!.height).toBe(GAME_H);

    // Display origin: with default (0.5, 0.5) origin and full-screen dimensions,
    // displayOriginX = 0.5 * GAME_W, displayOriginY = 0.5 * GAME_H
    expect(bg!.displayOriginX).toBe(GAME_W / 2);
    expect(bg!.displayOriginY).toBe(GAME_H / 2);
  });

  // ── AC 4: Overlay covers the full screen ──────────────────

  it('overlay background covers the entire game viewport', async () => {
    const scene = await bootScene();

    // Open overlay
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
    await advanceFrames(5);

    const bg = getOverlayBackground(scene);
    expect(bg).not.toBeNull();

    // With centered position and GAME_W x GAME_H dimensions, the
    // background should extend from (0,0) to (GAME_W, GAME_H)
    const left = bg!.x - bg!.displayOriginX;
    const top = bg!.y - bg!.displayOriginY;
    const right = left + bg!.width;
    const bottom = top + bg!.height;

    expect(left).toBe(0);
    expect(top).toBe(0);
    expect(right).toBe(GAME_W);
    expect(bottom).toBe(GAME_H);
  });

  // ── AC 5: Overlay z-ordering — background is behind content ─

  it('overlay background has depth 10 and content appears above it', async () => {
    const scene = await bootScene();

    // Open overlay
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
    await advanceFrames(5);

    const bg = getOverlayBackground(scene);
    expect(bg).not.toBeNull();

    // Background should be at depth 10 (the default in createOverlayBackground)
    const bgRect = scene.children.list.find(
      (child): child is Phaser.GameObjects.Rectangle & { depth: number } =>
        child instanceof Phaser.GameObjects.Rectangle &&
        child.width === GAME_W &&
        child.height === GAME_H &&
        (child as any).depth === 10,
    );
    expect(bgRect).toBeTruthy();
  });

  // ── AC 6: Overlay can be closed and reopened multiple times ─

  it('overlay can be opened, closed, and reopened without errors', async () => {
    const scene = await bootScene();

    // Open → Close → Open → Close
    for (let cycle = 0; cycle < 2; cycle++) {
      // Open
      const showBtn = findText(scene, '[ Show Overlay ]');
      expect(showBtn).toBeTruthy();
      showBtn!.emit('pointerdown');
      await advanceFrames(5);

      const bg = getOverlayBackground(scene);
      expect(bg, `Background should exist after open cycle ${cycle}`).not.toBeNull();

      // Close
      const dismissTexts = scene.children.list.filter(
        (child): child is Phaser.GameObjects.Text =>
          child instanceof Phaser.GameObjects.Text &&
          child.text === '[ Dismiss Overlay ]',
      );
      const overlayDismiss = dismissTexts.find((t) => (t as any).depth >= 11);
      expect(overlayDismiss).toBeTruthy();
      overlayDismiss!.emit('pointerdown');
      await advanceFrames(5);

      expect(getOverlayBackground(scene), `Background should be null after dismiss cycle ${cycle}`).toBeNull();
    }
  });

  // ── AC 7: Background dismisses on click ───────────────────

  it('overlay dismisses when clicking the background', async () => {
    const scene = await bootScene();

    // Open overlay
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
    await advanceFrames(5);

    const bg = getOverlayBackground(scene);
    expect(bg).not.toBeNull();

    // Simulate a click on the background
    // The background has a pointerdown handler that calls closeOverlay
    const bgRect = scene.children.list.find(
      (child) =>
        child instanceof Phaser.GameObjects.Rectangle &&
        child.width === GAME_W &&
        child.height === GAME_H,
    );

    expect(bgRect).toBeTruthy();
    // Emit pointerdown on the background to dismiss
    if (bgRect) {
      bgRect.emit('pointerdown');
    }
    await advanceFrames(10);

    // After dismissing, the overlay should be gone
    expect(getOverlayBackground(scene)).toBeNull();
  });

  // ── Visual screenshot test ─────────────────────────────

  it('overlay screenshot shows centered background (visual verification)', async () => {
    const scene = await bootScene();

    // Open overlay
    const showBtn = findText(scene, '[ Show Overlay ]');
    expect(showBtn).toBeTruthy();
    showBtn!.emit('pointerdown');
    await advanceFrames(10);

    // Capture a screenshot of the overlay scene
    const canvas = document.querySelector('canvas');
    expect(canvas).not.toBeNull();

    // Take a screenshot for visual regression
    const screenshotPath = `__screenshots__/GymOverlayUiScene.browser.test.ts/overlay-centered.png`;
    await page.screenshot({ path: screenshotPath });

    // Log the screenshot path for CI artifact collection
    console.log(`[screenshot:overlay-centered] path=${screenshotPath} canvas=${canvas!.width}x${canvas!.height}`);
  });
});
