/**
 * Shared Renderer API – extracted rendering helpers for tableau card games.
 *
 * This module provides a stable, documented set of shared rendering helpers
 * (container creation, HUD text, tooltip zones, action buttons) so that game
 * scenes can be kept small and focused without duplicating common patterns.
 *
 * Each helper is designed to work with a standard Phaser Scene and follows
 * the conventions established across the engine's example games.
 */

import Phaser from 'phaser';
import { FONT_FAMILY } from '../constants';
export {
  renderCardSvg,
} from './renderCardSvg';
export type {
  RenderCardSvgOptions,
  MakeTextureKeyFn,
  RequestTextureFn,
} from './renderCardSvg';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Optional configuration for {@link createActionButton}. */
export interface ActionButtonOptions {
  /** Height of the button in pixels. Defaults to the scene's layout value or 32. */
  height?: number;
  /** Display depth. Defaults to the Container's default (0). */
  depth?: number;
  /** Background fill colour. Defaults to 0x554422. */
  fillColor?: number;
  /** Background fill alpha. Defaults to 0.8. */
  fillAlpha?: number;
  /** Stroke colour. Defaults to 0xaa8855. */
  strokeColor?: number;
  /** Text colour. Defaults to '#ffcc88'. */
  textColor?: string;
  /** Font size for the label. Defaults to '14px'. */
  fontSize?: string;
  /** When true the button is visually dimmed and non-interactive. */
  disabled?: boolean;
}

/** Optional configuration for {@link createHudText}. */
export interface HudTextOptions {
  /** Override the default font family. */
  fontFamily?: string;
  /** Override the default origin (default is (0, 0.5)). */
  originX?: number;
  originY?: number;
  /** Text alignment ('left', 'center', 'right'). */
  align?: Phaser.Types.GameObjects.Text.TextStyle['align'];
  /** Extra line spacing in pixels. */
  lineSpacing?: number;
}

// ---------------------------------------------------------------------------
// Container helpers
// ---------------------------------------------------------------------------

/**
 * Create a HUD container with depth 1000, intended for transient overlay
 * elements that are rebuilt each HUD refresh cycle.
 *
 * Children created by HUD refresh functions should be tagged with
 * `_hudTransient: true` so they can be selectively destroyed on the next
 * refresh without affecting persistent overlay elements.
 *
 * @param scene - The Phaser scene that owns the container.
 * @returns A Phaser.Container positioned at (0, 0) with depth 1000.
 */
export function createHudContainer(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  try {
    container.setDepth(1000);
  } catch {
    // Depth may not be available in headless / test environments.
  }
  return container;
}

/**
 * Create a named zone container for grouping related game objects.
 *
 * Useful for separating gameplay areas (street, market, hand, etc.) so they
 * can be refreshed independently.
 *
 * @param scene - The Phaser scene.
 * @param x - X position of the container.
 * @param y - Y position of the container.
 * @param w - Logical width of the zone (stored as a custom property).
 * @param h - Logical height of the zone (stored as a custom property).
 * @param name - Optional label for debugging.
 * @returns A Phaser.Container at the specified position.
 */
export function createGameZone(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  name?: string,
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  (container as any).__zoneWidth = w;
  (container as any).__zoneHeight = h;
  if (name) {
    (container as any).__zoneName = name;
  }
  return container;
}

// ---------------------------------------------------------------------------
// Texture application helper
// ---------------------------------------------------------------------------

/**
 * Result shape returned by an async texture-ensure operation.
 */
export interface EnsureTextureResult {
  /** The texture key that will be (or is) available. */
  key: string;
  /** True if the texture is already registered and ready to use. */
  ready: boolean;
  /** Optional promise that resolves when async generation completes. */
  promise?: Promise<void>;
}

/**
 * Apply an ensured texture to a sprite, awaiting async generation if needed.
 *
 * This helper encapsulates the common pattern used across card games:
 * await the texture ensure operation, check that the sprite is still mounted,
 * then swap the texture and re-apply display size (since Phaser may reset
 * dimensions on texture change).
 *
 * @param sprite       - The image sprite to update.
 * @param ensureOp     - A promise that resolves to an {@link EnsureTextureResult}.
 * @param stillMounted - Guard function that returns false if the sprite has been
 *                       destroyed or removed since the operation started.
 * @param displayWidth  - Optional display width to re-apply after texture swap.
 * @param displayHeight - Optional display height to re-apply after texture swap.
 */
export async function applyEnsuredTexture(
  sprite: Phaser.GameObjects.Image,
  ensureOp: Promise<EnsureTextureResult>,
  stillMounted: () => boolean,
  displayWidth?: number,
  displayHeight?: number,
): Promise<void> {
  try {
    const result = await ensureOp;
    if (!result.ready && result.promise) {
      await result.promise;
    }
    if (!stillMounted()) return;
    sprite.setTexture(result.key);
    if (displayWidth !== undefined && displayHeight !== undefined) {
      sprite.setDisplaySize(displayWidth, displayHeight);
    }
  } catch {
    // keep existing texture fallback on error
  }
}

// ---------------------------------------------------------------------------
// HUD text helper
// ---------------------------------------------------------------------------

/**
 * Create a HUD text object with consistent styling.
 *
 * Uses {@link FONT_FAMILY} by default and sets the origin to (0, 0.5) so
 * that the text is vertically centred on the provided y coordinate.
 *
 * @param scene - The Phaser scene.
 * @param x - X position.
 * @param y - Y position.
 * @param text - The string to display.
 * @param color - CSS colour string (e.g. '#ffcc44').
 * @param options - Optional overrides for font size and font family.
 * @returns A Phaser.Text object.
 */
export function createHudText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: string,
  options?: { fontSize?: string } & HudTextOptions,
): Phaser.GameObjects.Text {
  const fontFamily = options?.fontFamily ?? FONT_FAMILY;
  const fontSize = options?.fontSize ?? '16px';
  const originX = options?.originX ?? 0;
  const originY = options?.originY ?? 0.5;
  const baseStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    fontSize,
    fontStyle: 'bold',
    color,
    fontFamily,
  };
  if (options?.align !== undefined) {
    (baseStyle as Phaser.Types.GameObjects.Text.TextStyle).align = options.align;
  }
  if (options?.lineSpacing !== undefined) {
    (baseStyle as Phaser.Types.GameObjects.Text.TextStyle).lineSpacing =
      options.lineSpacing;
  }

  return scene.add.text(x, y, text, baseStyle).setOrigin(originX, originY);
}

// ---------------------------------------------------------------------------
// Tooltip zone helper
// ---------------------------------------------------------------------------

/**
 * Attach an interactive tooltip zone to a HUD text element.
 *
 * On desktop (pointer), the tooltip shows on hover and hides on leave.
 * On mobile (touch), the first tap shows the tooltip and a second tap
 * (or tap elsewhere) dismisses it.
 *
 * ARIA labels are set on the underlying text object for accessibility.
 *
 * @param scene - The Phaser scene.
 * @param textObj - The text object to attach the tooltip zone to.
 * @param ariaLabel - Accessibility label for screen readers.
 * @param contentBuilder - Function that returns the tooltip content string.
 */
export function attachHudTooltipZone(
  scene: Phaser.Scene,
  textObj: Phaser.GameObjects.Text,
  ariaLabel: string,
  contentBuilder: () => string,
): void {
  // Set ARIA label for screen-reader accessibility
  try {
    const node = (textObj as any).node;
    if (node && typeof node.setAttribute === 'function') {
      node.setAttribute('aria-label', ariaLabel);
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
    }
  } catch {
    // Ignore in non-DOM environments.
  }

  // Compute hit area size from text metrics
  const w = Math.max(textObj.width, 60);
  const h = Math.max(textObj.height, 20);

  textObj.setInteractive(
    new Phaser.Geom.Rectangle(0, 0, w / textObj.scaleX, h / textObj.scaleY),
    Phaser.Geom.Rectangle.Contains,
  );

  // Mobile tap-toggle state (per element)
  let tooltipVisible = false;

  textObj.on('pointerover', () => {
    tooltipVisible = true;
    const content = contentBuilder();
    (scene as any).tooltipManager?.show(content, textObj.x, textObj.y - 10);
  });

  textObj.on('pointerout', () => {
    tooltipVisible = false;
    (scene as any).tooltipManager?.hide();
  });

  // Mobile / tap: toggle on pointerdown
  textObj.on('pointerdown', () => {
    if (tooltipVisible) {
      tooltipVisible = false;
      (scene as any).tooltipManager?.hide();
    } else {
      tooltipVisible = true;
      const content = contentBuilder();
      (scene as any).tooltipManager?.show(content, textObj.x, textObj.y - 10);
    }
  });
}

// ---------------------------------------------------------------------------
// Action button helper
// ---------------------------------------------------------------------------

/**
 * Create an action button with background, label, hover/click effects,
 * and optional disabled state.
 *
 * @param scene - The Phaser scene.
 * @param x - X position (left edge).
 * @param y - Y position (top edge).
 * @param width - Button width in pixels.
 * @param text - Label text.
 * @param callback - Click handler. Not invoked when disabled.
 * @param options - Optional styling and behaviour overrides.
 * @returns A Phaser.Container containing the button.
 */
export function createActionButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  text: string,
  callback: () => void,
  options?: ActionButtonOptions,
): Phaser.GameObjects.Container {
  const height = options?.height ?? 32;
  const depth: number | undefined = options?.depth;
  const fillColor: number = options?.fillColor ?? 0x554422;
  const fillAlpha: number = options?.fillAlpha ?? 0.8;
  const strokeColor: number = options?.strokeColor ?? 0xaa8855;
  const textColor: string = options?.textColor ?? '#ffcc88';
  const fontSize: string = options?.fontSize ?? '14px';
  const disabled: boolean = options?.disabled ?? false;

  const container = scene.add.container(x + width / 2, y + height / 2);
  if (depth !== undefined) {
    container.setDepth(depth);
  }

  const bg = scene.add.rectangle(0, 0, width, height, fillColor, fillAlpha);
  bg.setStrokeStyle(1, strokeColor);
  container.add(bg);

  const label = scene.add.text(0, 0, text, {
    fontSize,
    fontStyle: 'bold',
    color: (disabled ? '#666666' : textColor) as string,
    fontFamily: FONT_FAMILY,
  }).setOrigin(0.5);
  container.add(label);

  if (!disabled) {
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', callback);
    bg.on('pointerover', () => {
      bg.setStrokeStyle(2, 0xffdd44);
      container.setScale(1.05);
    });
    bg.on('pointerout', () => {
      bg.setStrokeStyle(1, strokeColor);
      container.setScale(1.0);
    });
  }

  return container;
}

