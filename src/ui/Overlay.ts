/**
 * Overlay system for the Tableau Card Engine.
 *
 * Provides a unified overlay infrastructure suitable for dialogs,
 * modal prompts, info panels, and debug tools:
 *
 * - {@link createOverlayBackground} — basic backdrop + optional centered box
 * - {@link createOverlayDialog} — full dialog with title, close button,
 *   and scrollable content area (geometry mask + bounds-checked wheel handler)
 * - {@link dismissOverlay} — destroy all overlay game objects
 *
 * All overlays parent their objects into `scene.hudContainer` so they
 * render above the game board but below HUD controls, keeping z-ordering
 * consistent across all games.
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

/**
 * Result of creating a basic overlay background with
 * {@link createOverlayBackground}.
 */
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

  // Parent overlay box/background into hudContainer so all overlay content
  // (box + text + buttons) shares the same depth-sort space.  HUD-level
  // game elements (e.g. "Stock" label) must also be parented into
  // hudContainer so overlays can correctly cover them.  This keeps z-
  // ordering consistent and predictable across all games.
  try {
    const overlayContainer: any = (scene as any).hudContainer;
    if (overlayContainer && typeof overlayContainer.add === 'function') {
      for (const obj of objects) {
        try { overlayContainer.add(obj); } catch (_) { /* ignore */ }
      }
    }
  } catch (_) { /* ignore failures when inspecting scene */ }

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

// ── Overlay Dialog ─────────────────────────────────────────

/**
 * Default depth for the overlay dialog backdrop layer.
 */
const DEFAULT_DIALOG_DEPTH_BASE = 200;

/**
 * Depth offset between layers inside an overlay dialog.
 */
const DIALOG_DEPTH_STEP = 1;

/**
 * Default close button colour.
 */
const DIALOG_CLOSE_COLOR = '#aaaaaa';

/**
 * Close button hover colour.
 */
const DIALOG_CLOSE_HOVER = '#ffffff';

/**
 * Font family for the title bar and header controls.
 */
const DIALOG_HEADER_FONT = 'Arial, sans-serif';

/**
 * Monospace font for content text inside overlay dialogs.
 */
const DIALOG_MONO_FONT = 'Consolas, Monaco, "Lucida Console", monospace';

/**
 * Configures an overlay dialog created via
 * {@link createOverlayDialog}.
 *
 * Overlay Dialogs provide a modal backdrop, a consistent close
 * button, and a scrollable content area — all the standard dialog
 * behaviours — built on the shared overlay infrastructure.
 */
export interface OverlayDialogOptions {
  /** Window title displayed at the top of the overlay box. */
  title: string;

  /** Overlay box width in px (default: auto from GAME_W). */
  width?: number;

  /** Overlay box height in px (default: auto from GAME_H). */
  height?: number;

  /** Horizontal center position (default: GAME_W / 2). */
  x?: number;

  /** Vertical center position (default: GAME_H / 2). */
  y?: number;

  /** Box background colour (default: 0x1a1a2e). */
  boxColor?: number;

  /** Title text colour (default: '#f0c040'). */
  titleColor?: string;

  /** Enable built-in scrolling (default: true). */
  scrollable?: boolean;

  /** Depth for the backdrop layer (default: 200). */
  depthBase?: number;

  /** Height reserved for title bar + header row in px (default: 80). */
  headerHeight?: number;

  /** Bottom padding below scroll content in px (default: 10). */
  bottomPadding?: number;

  /**
   * Optional callback invoked when the overlay is closed.
   * Use this for custom cleanup (e.g. removing DOM elements).
   */
  onClose?: () => void;
}

/**
 * Handle returned by {@link createOverlayDialog} for managing the
 * overlay lifecycle and content.
 */
export interface OverlayDialogHandle {
  /** The Phaser scene. */
  readonly scene: Phaser.Scene;

  /** All game objects created by this overlay (for cleanup). */
  readonly objects: Phaser.GameObjects.GameObject[];

  /** Overlay box pixel position and dimensions. */
  readonly boxX: number;
  readonly boxY: number;
  readonly boxWidth: number;
  readonly boxHeight: number;

  /**
   * Scrollable content area position and dimensions (relative to the scene).
   * Content objects should be positioned at (x, y) relative to this
   * container's origin, starting from (0, 0).
   */
  readonly contentX: number;
  readonly contentY: number;
  readonly contentWidth: number;
  readonly contentHeight: number;

  /**
   * Container to which callers add their content game objects.
   * Content objects should be positioned at (x, y) relative to this
   * container's origin, starting from (0, 0).
   */
  readonly scrollContainer: Phaser.GameObjects.Container;

  /**
   * Monospace font family string suitable for content text.
   */
  readonly monoFont: string;

  /**
   * Current scroll offset in pixels (0 = top).
   * Modify this before calling `refresh()` to change the scroll position.
   */
  scrollY: number;

  /**
   * The depth base used for this overlay (backdrop). Layers are at:
   * backdrop = depthBase, box = depthBase + 1, content = depthBase + 2.
   */
  readonly depthBase: number;

  /**
   * Close/destroy the overlay and remove all its event listeners.
   * Safe to call multiple times.
   */
  close(): void;

  /**
   * Call after adding/removing content children in `scrollContainer`.
   * Re-clamps `scrollY`, re-positions the scroll container, and applies
   * or removes the geometry mask based on whether content overflows.
   *
   * @param totalContentHeight  Total height of content in px. If
   *                            omitted, estimated from children positions.
   */
  refresh(totalContentHeight?: number): void;
}

/**
 * Create an overlay dialog with backdrop, title, close button, and
 * scrollable content area.
 *
 * This is the recommended way to build dialogs, info panels, debug
 * tools, and any other interactive overlay with dynamic content.
 * It builds on {@link createOverlayBackground} and adds:
 *
 * - Title text with close (✕) button
 * - Scrollable content container with invisible geometry mask
 * - Bounds-checked wheel handler (only scrolls when pointer is
 *   within the overlay box, preventing scroll from leaking to
 *   overlays beneath)
 * - hudContainer parenting for correct z-ordering
 * - Cleanup via `close()` (removes wheel listeners, destroys
 *   objects, calls optional `onClose` callback)
 *
 * @example
 * ```ts
 * import { createOverlayDialog } from '@ui/Overlay';
 *
 * const overlay = createOverlayDialog(scene, {
 *   title: 'Event Log',
 *   width: 600,
 *   height: 400,
 * });
 *
 * // Add content at (x, y) relative to scrollContainer
 * const text = scene.add.text(0, 0, 'Hello', { ... });
 * overlay.scrollContainer.add(text);
 *
 * // Notify the overlay of content height for scroll clamping
 * overlay.refresh(50);
 * ```
 *
 * @param scene   - The active Phaser scene.
 * @param options - Overlay configuration.
 * @returns A {@link OverlayDialogHandle} for managing the overlay.
 */
export function createOverlayDialog(
  scene: Phaser.Scene,
  options: OverlayDialogOptions,
): OverlayDialogHandle {
  const boxWidth = options.width ?? Math.min(GAME_W - 80, 680);
  const boxHeight = options.height ?? Math.min(GAME_H - 80, 500);
  const boxX = options.x ?? (GAME_W - boxWidth) / 2;
  const boxY = options.y ?? (GAME_H - boxHeight) / 2;
  const depthBase = options.depthBase ?? DEFAULT_DIALOG_DEPTH_BASE;
  const boxColor = options.boxColor ?? 0x1a1a2e;
  const titleColor = options.titleColor ?? '#f0c040';
  const headerH = options.headerHeight ?? 80;
  const bottomPad = options.bottomPadding ?? 10;

  const objects: Phaser.GameObjects.GameObject[] = [];

  // Helper to parent objects into hudContainer
  function parentIntoHud(objs: Phaser.GameObjects.GameObject[]): void {
    try {
      const hud = (scene as any).hudContainer;
      if (hud && typeof hud.add === 'function') {
        for (const obj of objs) {
          hud.add(obj);
        }
      }
    } catch {
      // hudContainer may not exist yet
    }
  }

  // ── Overlay background + box ──
  const overlay = createOverlayBackground(
    scene,
    { depth: depthBase, alpha: 0.6, width: GAME_W, height: GAME_H },
    { width: boxWidth, height: boxHeight, color: boxColor, alpha: 1.0, depth: depthBase + DIALOG_DEPTH_STEP },
  );
  objects.push(...overlay.objects);
  parentIntoHud(overlay.objects);

  // ── Title ──
  const title = scene.add.text(boxX + 10, boxY + 8, options.title, {
    fontSize: '18px',
    color: titleColor,
    fontFamily: DIALOG_HEADER_FONT,
    fontStyle: 'bold',
  });
  title.setDepth(depthBase + DIALOG_DEPTH_STEP * 2);
  objects.push(title);
  parentIntoHud([title]);

  // ── Close button ──
  const closeBtn = scene.add.text(boxX + boxWidth - 30, boxY + 6, '✕', {
    fontSize: '22px',
    color: DIALOG_CLOSE_COLOR,
    fontFamily: DIALOG_HEADER_FONT,
  });
  closeBtn.setDepth(depthBase + DIALOG_DEPTH_STEP * 2);
  closeBtn.setInteractive({ useHandCursor: true });
  closeBtn.on('pointerover', () => closeBtn.setColor(DIALOG_CLOSE_HOVER));
  closeBtn.on('pointerout', () => closeBtn.setColor(DIALOG_CLOSE_COLOR));
  objects.push(closeBtn);
  parentIntoHud([closeBtn]);

  // ── Content area ──
  const contentX = boxX + 10;
  const contentY = boxY + headerH + 10;
  const contentWidth = boxWidth - 20;
  const contentHeight = boxHeight - headerH - 46 - bottomPad;

  // Scroll container
  const scrollContainer = scene.add.container(contentX, contentY);
  scrollContainer.setDepth(depthBase + DIALOG_DEPTH_STEP * 2);
  objects.push(scrollContainer);
  parentIntoHud([scrollContainer]);

  // Invisible scroll mask (scene-space)
  const maskGraphics = scene.add.graphics();
  maskGraphics.fillStyle(0xffffff);
  maskGraphics.fillRect(contentX, contentY, contentWidth, contentHeight);
  maskGraphics.setVisible(false);
  objects.push(maskGraphics);

  // ── Handle (forward-declared so the wheel handler can reference it) ──
  const handle: OverlayDialogHandle = {
    scene,
    objects,
    boxX,
    boxY,
    boxWidth,
    boxHeight,
    contentX,
    contentY,
    contentWidth,
    contentHeight,
    scrollContainer,
    monoFont: DIALOG_MONO_FONT,
    scrollY: 0,
    depthBase,
    close,
    refresh,
  };

  // ── Wheel handler (bounds-checked) ──
  const wheelHandler = (
    pointer: Phaser.Input.Pointer,
    _gameObjects: unknown[],
    _dx: number,
    dy: number,
  ): void => {
    if (
      pointer.x < boxX || pointer.x > boxX + boxWidth ||
      pointer.y < boxY || pointer.y > boxY + boxHeight
    ) {
      return;
    }
    const oldY = handle.scrollY;
    handle.scrollY = Math.max(0, handle.scrollY + dy * 1.5);
    if (handle.scrollY !== oldY) {
      refresh();
    }
  };
  scene.input.on('wheel', wheelHandler);

  // ── Methods ──

  /** Close the overlay and remove all event listeners. */
  function close(): void {
    scene.input.off('wheel', wheelHandler);
    dismissOverlay(objects);
    options.onClose?.();
  }

  /** Re-clamp scroll, reposition container, and apply/remove mask. */
  function refresh(totalContentHeight?: number): void {
    const th = totalContentHeight ?? estimateContentHeight();
    const maxScroll = Math.max(0, th - contentHeight);
    handle.scrollY = Math.min(handle.scrollY, maxScroll);
    scrollContainer.y = contentY - handle.scrollY;

    if (maxScroll > 0) {
      scrollContainer.setMask(maskGraphics.createGeometryMask());
    } else {
      scrollContainer.clearMask();
    }
  }

  /** Rough estimate of content height from child positions. */
  function estimateContentHeight(): number {
    let maxY = 0;
    for (const child of scrollContainer.list) {
      maxY = Math.max(maxY, (child as any).y + 22);
    }
    return maxY;
  }

  // Hook close button
  closeBtn.on('pointerdown', close);

  return handle;
}
