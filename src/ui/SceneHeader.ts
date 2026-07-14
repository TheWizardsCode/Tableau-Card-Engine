/**
 * Shared scene header scaffolding for the Tableau Card Engine.
 *
 * Provides factory functions for the standard scene header bar:
 * a centered title and a top-left "Menu" button that returns
 * to the GameSelectorScene.
 */

import { GAME_W, FONT_FAMILY } from './constants';

// ── Constants ───────────────────────────────────────────────

/** Default Y position for the scene header bar. */
export const SCENE_HEADER_Y = 14;

/** Default X position for the menu button. */
export const SCENE_MENU_BUTTON_X = 14;

/** Default font size for the scene title. */
export const SCENE_TITLE_FONT_SIZE = '18px';

/** Default color for the scene title. */
export const SCENE_TITLE_COLOR = '#ffffff';

/** Default font size for the scene menu button. */
export const SCENE_MENU_BUTTON_FONT_SIZE = '12px';

/** Default text color for the scene menu button. */
export const SCENE_MENU_BUTTON_COLOR = '#ffcc88';

/** Default background fill for the scene menu button. */
export const SCENE_MENU_BUTTON_FILL = 0x554422;

/** Default background alpha for the scene menu button. */
export const SCENE_MENU_BUTTON_FILL_ALPHA = 0.8;

/** Default border color for the scene menu button. */
export const SCENE_MENU_BUTTON_STROKE = 0xaa8855;

/** Default hover border color for the scene menu button. */
export const SCENE_MENU_BUTTON_HOVER_STROKE = 0xffdd44;

// Legacy color constants (kept for backward compatibility)
/** @deprecated Use SCENE_MENU_BUTTON_HOVER_STROKE instead. */
export const SCENE_MENU_BUTTON_HOVER_COLOR = '#88ff88';

/** Default button width. */
export const SCENE_MENU_BUTTON_WIDTH = 60;

/** Default button height. */
export const SCENE_MENU_BUTTON_HEIGHT = 24;

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
  /** X position (default: 14). */
  x?: number;
  /** Y position (default: SCENE_HEADER_Y = 14). */
  y?: number;
  /** Button width (default: 60). */
  width?: number;
  /** Button height (default: 24). */
  height?: number;
}

/** Result of creating a full scene header. */
export interface SceneHeaderResult {
  /** The title text object. */
  title: Phaser.GameObjects.Text;
  /** The menu button container. */
  menuButton: Phaser.GameObjects.Container;
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
 * Create a "Menu" button in the scene header bar that
 * navigates back to the GameSelectorScene on click.
 *
 * Styled as a compact action button with background fill,
 * border stroke, and hover effects.
 *
 * @param scene  - The Phaser scene to add the button to.
 * @param config - Optional styling/position overrides.
 * @returns A Container holding the button background and label.
 */
export function createSceneMenuButton(
  scene: Phaser.Scene,
  config?: SceneMenuButtonConfig,
): Phaser.GameObjects.Container {
  const x = config?.x ?? SCENE_MENU_BUTTON_X;
  const y = config?.y ?? SCENE_HEADER_Y;
  const w = config?.width ?? SCENE_MENU_BUTTON_WIDTH;
  const h = config?.height ?? SCENE_MENU_BUTTON_HEIGHT;

  // Container positioned so the button background is at (x, y)
  const container = scene.add.container(x + w / 2, y + h / 2);

  // Background rectangle
  const bg = scene.add.rectangle(0, 0, w, h, SCENE_MENU_BUTTON_FILL, SCENE_MENU_BUTTON_FILL_ALPHA);
  bg.setStrokeStyle(1, SCENE_MENU_BUTTON_STROKE);
  container.add(bg);

  // Label
  const label = scene.add.text(0, 0, 'Menu', {
    fontSize: SCENE_MENU_BUTTON_FONT_SIZE,
    fontStyle: 'bold',
    color: SCENE_MENU_BUTTON_COLOR,
    fontFamily: FONT_FAMILY,
  }).setOrigin(0.5);
  container.add(label);

  // Interactivity
  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerdown', () => scene.scene.start('GameSelectorScene'));
  bg.on('pointerover', () => {
    bg.setStrokeStyle(2, SCENE_MENU_BUTTON_HOVER_STROKE);
    container.setScale(1.05);
  });
  bg.on('pointerout', () => {
    bg.setStrokeStyle(1, SCENE_MENU_BUTTON_STROKE);
    container.setScale(1.0);
  });

  return container;
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
 * @returns Object containing both the title and menuButton objects.
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
