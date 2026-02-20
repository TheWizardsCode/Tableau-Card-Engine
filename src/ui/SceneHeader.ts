/**
 * Shared scene header scaffolding for the Tableau Card Engine.
 *
 * Provides factory functions for the standard scene header bar:
 * a centered title and a top-left "[ Menu ]" button that returns
 * to the GameSelectorScene.
 */

import { GAME_W, FONT_FAMILY } from './constants';

// ── Constants ───────────────────────────────────────────────

/** Default Y position for the scene header bar. */
export const SCENE_HEADER_Y = 14;

/** Default X position for the menu button. */
export const SCENE_MENU_BUTTON_X = 30;

/** Default font size for the scene title. */
export const SCENE_TITLE_FONT_SIZE = '18px';

/** Default color for the scene title. */
export const SCENE_TITLE_COLOR = '#ffffff';

/** Default font size for the scene menu button. */
export const SCENE_MENU_BUTTON_FONT_SIZE = '12px';

/** Default color for the scene menu button. */
export const SCENE_MENU_BUTTON_COLOR = '#aaccaa';

/** Default hover color for the scene menu button. */
export const SCENE_MENU_BUTTON_HOVER_COLOR = '#88ff88';

// ── Types ───────────────────────────────────────────────────

/** Optional configuration for the scene title text. */
export interface SceneTitleConfig {
  /** Y position (default: SCENE_HEADER_Y = 14). */
  y?: number;
  /** Font size (default: '18px'). */
  fontSize?: string;
  /** Text color (default: '#ffffff'). */
  color?: string;
  /** Font family (default: FONT_FAMILY). */
  fontFamily?: string;
}

/** Optional configuration for the scene menu button. */
export interface SceneMenuButtonConfig {
  /** X position (default: 30). */
  x?: number;
  /** Y position (default: SCENE_HEADER_Y = 14). */
  y?: number;
  /** Font size (default: '12px'). */
  fontSize?: string;
  /** Default text color (default: '#aaccaa'). */
  color?: string;
  /** Hover text color (default: '#88ff88'). */
  hoverColor?: string;
  /** Font family (default: FONT_FAMILY). */
  fontFamily?: string;
}

/** Result of creating a full scene header. */
export interface SceneHeaderResult {
  /** The title text object. */
  title: Phaser.GameObjects.Text;
  /** The menu button text object. */
  menuButton: Phaser.GameObjects.Text;
}

// ── Factories ───────────────────────────────────────────────

/**
 * Create a centered scene title at the top of the viewport.
 *
 * @param scene  - The Phaser scene to add the title to.
 * @param title  - The title text (e.g. '9-Card Golf').
 * @param config - Optional styling overrides.
 * @returns The created Phaser text game object.
 */
export function createSceneTitle(
  scene: Phaser.Scene,
  title: string,
  config?: SceneTitleConfig,
): Phaser.GameObjects.Text {
  const y = config?.y ?? SCENE_HEADER_Y;
  const fontSize = config?.fontSize ?? SCENE_TITLE_FONT_SIZE;
  const color = config?.color ?? SCENE_TITLE_COLOR;
  const fontFamily = config?.fontFamily ?? FONT_FAMILY;

  return scene.add
    .text(GAME_W / 2, y, title, { fontSize, color, fontFamily })
    .setOrigin(0.5);
}

/**
 * Create a "[ Menu ]" button in the scene header bar that
 * navigates back to the GameSelectorScene on click.
 *
 * Includes hover color change for visual feedback.
 *
 * @param scene  - The Phaser scene to add the button to.
 * @param config - Optional styling/position overrides.
 * @returns The created Phaser text game object.
 */
export function createSceneMenuButton(
  scene: Phaser.Scene,
  config?: SceneMenuButtonConfig,
): Phaser.GameObjects.Text {
  const x = config?.x ?? SCENE_MENU_BUTTON_X;
  const y = config?.y ?? SCENE_HEADER_Y;
  const fontSize = config?.fontSize ?? SCENE_MENU_BUTTON_FONT_SIZE;
  const color = config?.color ?? SCENE_MENU_BUTTON_COLOR;
  const hoverColor = config?.hoverColor ?? SCENE_MENU_BUTTON_HOVER_COLOR;
  const fontFamily = config?.fontFamily ?? FONT_FAMILY;

  const btn = scene.add
    .text(x, y, '[ Menu ]', { fontSize, color, fontFamily })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });

  btn.on('pointerdown', () => scene.scene.start('GameSelectorScene'));
  btn.on('pointerover', () => btn.setColor(hoverColor));
  btn.on('pointerout', () => btn.setColor(color));

  return btn;
}

/**
 * Create both the scene title and menu button in one call.
 *
 * Convenience wrapper that calls createSceneTitle and
 * createSceneMenuButton with shared Y position.
 *
 * @param scene  - The Phaser scene.
 * @param title  - The title text.
 * @param y      - Y position for both elements (default: SCENE_HEADER_Y).
 * @returns Object containing both the title and menuButton text objects.
 */
export function createSceneHeader(
  scene: Phaser.Scene,
  title: string,
  y?: number,
): SceneHeaderResult {
  const titleObj = createSceneTitle(scene, title, y != null ? { y } : undefined);
  const menuButton = createSceneMenuButton(scene, y != null ? { y } : undefined);
  return { title: titleObj, menuButton };
}
