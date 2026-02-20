/**
 * Shared overlay background system for the Tableau Card Engine.
 *
 * Provides functions to create full-screen modal overlays with
 * input-blocking backgrounds and optional visible overlay boxes,
 * plus cleanup helpers.
 */

import { GAME_W, GAME_H } from './constants';

// ── Types ───────────────────────────────────────────────────

/** Configuration for the overlay background. */
export interface OverlayBackgroundOptions {
  /** Display depth for the background layer (default: 10). */
  depth?: number;
  /** Background fill color (default: 0x000000). */
  color?: number;
  /** Background alpha / opacity (default: 0.75). */
  alpha?: number;
  /** Game viewport width (default: GAME_W). */
  width?: number;
  /** Game viewport height (default: GAME_H). */
  height?: number;
}

/** Configuration for an optional overlay box centered on screen. */
export interface OverlayBoxOptions {
  /** Box width in pixels. */
  width: number;
  /** Box height in pixels. */
  height: number;
  /** Box fill color (default: 0x000000). */
  color?: number;
  /** Box alpha / opacity (default: 0.85). */
  alpha?: number;
  /** Display depth for the box (default: same as background depth). */
  depth?: number;
}

/** Result of creating an overlay background. */
export interface OverlayResult {
  /** The full-screen input-blocking background rectangle. */
  background: Phaser.GameObjects.Rectangle;
  /** The visible overlay box, if one was requested. */
  box: Phaser.GameObjects.Rectangle | null;
  /** All game objects created (background + optional box), for cleanup. */
  objects: Phaser.GameObjects.GameObject[];
}

// ── Factory ─────────────────────────────────────────────────

/**
 * Create a full-screen overlay background that blocks input to
 * objects beneath it.
 *
 * Optionally creates a visible centered box on top of the
 * background for displaying overlay content.
 *
 * @param scene   - The Phaser scene to add the overlay to.
 * @param options - Background configuration.
 * @param box     - Optional centered overlay box configuration.
 * @returns An OverlayResult with the created game objects.
 */
export function createOverlayBackground(
  scene: Phaser.Scene,
  options?: OverlayBackgroundOptions,
  box?: OverlayBoxOptions,
): OverlayResult {
  const depth = options?.depth ?? 10;
  const color = options?.color ?? 0x000000;
  const alpha = options?.alpha ?? 0.75;
  const width = options?.width ?? GAME_W;
  const height = options?.height ?? GAME_H;

  const objects: Phaser.GameObjects.GameObject[] = [];

  // Full-screen input-blocking background
  const background = scene.add.rectangle(
    width / 2,
    height / 2,
    width,
    height,
    color,
    alpha,
  );
  background.setDepth(depth);
  background.setInteractive();
  objects.push(background);

  // Optional visible overlay box
  let overlayBox: Phaser.GameObjects.Rectangle | null = null;
  if (box) {
    const boxColor = box.color ?? 0x000000;
    const boxAlpha = box.alpha ?? 0.85;
    const boxDepth = box.depth ?? depth;

    overlayBox = scene.add.rectangle(
      width / 2,
      height / 2,
      box.width,
      box.height,
      boxColor,
      boxAlpha,
    );
    overlayBox.setDepth(boxDepth);
    objects.push(overlayBox);
  }

  return { background, box: overlayBox, objects };
}

// ── Cleanup ─────────────────────────────────────────────────

/**
 * Destroy all game objects in an overlay.
 *
 * Call this to dismiss a modal overlay and restore interactivity
 * to the scene beneath.
 *
 * @param objects - Array of game objects to destroy.
 */
export function dismissOverlay(
  objects: Phaser.GameObjects.GameObject[],
): void {
  for (const obj of objects) {
    obj.destroy();
  }
}
