/**
 * Dialog — Reusable modal dialog component for the Tableau Card Engine.
 *
 * Provides a consistent dialog frame (backdrop + centered box, title, close
 * button) with a scrollable content area, pointer-bounds‑checked wheel
 * handling, and proper cleanup.
 *
 * All dialog overlays should use this component instead of manually wiring
 * up overlay backgrounds, title text, close buttons, scroll containers,
 * masks, and wheel handlers.
 *
 * @module @ui/Dialog
 */

import type Phaser from 'phaser';
import { GAME_W, GAME_H } from './constants';
import {
  createOverlayBackground,
  dismissOverlay,
} from './Overlay';

// ── Constants ───────────────────────────────────────────────

/** Default depth for the backdrop layer. */
const DEFAULT_DEPTH_BASE = 200;

/** Depth offset between layers (backdrop, box, content). */
const DEPTH_STEP = 1;

/** Default background color for the overlay box. */
const DEFAULT_BOX_COLOR = 0x1a1a2e;

/** Default title text colour. */
const DEFAULT_TITLE_COLOR = '#f0c040';

/** Default close‑button colour. */
const DEFAULT_CLOSE_COLOR = '#aaaaaa';

/** Close‑button hover colour. */
const DEFAULT_CLOSE_HOVER = '#ffffff';

/** Default font for title/controls. */
const HEADER_FONT = 'Arial, sans-serif';

/** Monospace font used for content text. */
const MONO_FONT = 'Consolas, Monaco, "Lucida Console", monospace';

// ── Public Types ───────────────────────────────────────────

export interface DialogOptions {
  /** Window title displayed at the top of the dialog box. */
  title: string;

  /** Dialog box width in px (default: auto from GAME_W). */
  width?: number;

  /** Dialog box height in px (default: auto from GAME_H). */
  height?: number;

  /** Horizontal center position (default: GAME_W / 2). */
  x?: number;

  /** Vertical center position (default: GAME_H / 2). */
  y?: number;

  /** Box background colour (default: 0x1a1a2e). */
  boxColor?: number;

  /** Title text colour (default: '#f0c040'). */
  titleColor?: string;

  /** Enable built‑in scrolling (default: true). */
  scrollable?: boolean;

  /** Depth for the backdrop layer (default: 200). */
  depthBase?: number;

  /** Height reserved for title bar + header row in px (default: 80). */
  headerHeight?: number;

  /** Bottom padding below scroll content in px (default: 10). */
  bottomPadding?: number;

  /**
   * Optional callback invoked when the dialog is closed.
   * Use this for custom cleanup (e.g. removing DOM elements).
   */
  onClose?: () => void;
}

export interface DialogHandle {
  /** The Phaser scene. */
  readonly scene: Phaser.Scene;

  /** All game objects created by this dialog (for cleanup). */
  readonly objects: Phaser.GameObjects.GameObject[];

  /** Box pixel position and dimensions. */
  readonly boxX: number;
  readonly boxY: number;
  readonly boxWidth: number;
  readonly boxHeight: number;

  /** Scrollable content area position and dimensions (relative to the scene). */
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
   * The monospace font family string used by this dialog for content text.
   * Callers should use this when creating text objects inside the dialog.
   */
  readonly monoFont: string;

  /**
   * Current scroll offset in pixels (0 = top).
   * Modify this before calling `refresh()` to change the scroll position.
   */
  scrollY: number;

  /**
   * The depth base used for this dialog (backdrop). Layers are at:
   * backdrop = depthBase, box = depthBase + 1, content = depthBase + 2.
   */
  readonly depthBase: number;

  /**
   * Close/destroy the dialog and remove all its event listeners.
   * Safe to call multiple times.
   */
  close(): void;

  /**
   * Call after adding/removing content children in `scrollContainer`.
   * Re‑clamps `scrollY`, re‑positions the scroll container, and applies
   * or removes the geometry mask based on whether content overflows.
   *
   * @param totalContentHeight  Total height of content in px. If
   *                            omitted, estimated from children.
   */
  refresh(totalContentHeight?: number): void;
}

// ── Internal helpers ───────────────────────────────────────

/**
 * Parent game objects into `scene.hudContainer` if it exists.
 */
function parentIntoHud(
  scene: Phaser.Scene,
  objs: Phaser.GameObjects.GameObject[],
): void {
  try {
    const hud = (scene as any).hudContainer;
    if (hud && typeof hud.add === 'function') {
      for (const obj of objs) {
        hud.add(obj);
      }
    }
  } catch {
    // hudContainer may not exist yet — that's fine
  }
}

// ── Factory ─────────────────────────────────────────────────

/**
 * Create a reusable modal dialog with backdrop, title, close button,
 * and scrollable content area.
 *
 * @example
 * ```ts
 * const dlg = createDialog(scene, { title: 'My Dialog', width: 500, height: 400 });
 * // Add content to dlg.scrollContainer at (x, y)
 * const text = scene.add.text(0, 0, 'Hello', { ... });
 * text.setDepth(dlg.depthBase + 2);
 * dlg.scrollContainer.add(text);
 * dlg.scrollContainer.setDepth(dlg.depthBase + 2);
 * dlg.refresh(100); // if content is 100px tall
 * ```
 *
 * @param scene   - The active Phaser scene.
 * @param options - Dialog configuration.
 * @returns A {@link DialogHandle} for managing the dialog.
 */
export function createDialog(
  scene: Phaser.Scene,
  options: DialogOptions,
): DialogHandle {
  const boxWidth = options.width ?? Math.min(GAME_W - 80, 680);
  const boxHeight = options.height ?? Math.min(GAME_H - 80, 500);
  const boxX = options.x ?? (GAME_W - boxWidth) / 2;
  const boxY = options.y ?? (GAME_H - boxHeight) / 2;
  const depthBase = options.depthBase ?? DEFAULT_DEPTH_BASE;
  const boxColor = options.boxColor ?? DEFAULT_BOX_COLOR;
  const titleColor = options.titleColor ?? DEFAULT_TITLE_COLOR;
  const headerH = options.headerHeight ?? 80;
  const bottomPad = options.bottomPadding ?? 10;

  const objects: Phaser.GameObjects.GameObject[] = [];

  // ── Overlay background + box ──
  const overlay = createOverlayBackground(
    scene,
    { depth: depthBase, alpha: 0.6, width: GAME_W, height: GAME_H },
    { width: boxWidth, height: boxHeight, color: boxColor, alpha: 1.0, depth: depthBase + DEPTH_STEP },
  );
  objects.push(...overlay.objects);
  parentIntoHud(scene, overlay.objects);

  // ── Title ──
  const title = scene.add.text(boxX + 10, boxY + 8, options.title, {
    fontSize: '18px',
    color: titleColor,
    fontFamily: HEADER_FONT,
    fontStyle: 'bold',
  });
  title.setDepth(depthBase + DEPTH_STEP * 2);
  objects.push(title);
  parentIntoHud(scene, [title]);

  // ── Close button ──
  const closeBtn = scene.add.text(boxX + boxWidth - 30, boxY + 6, '✕', {
    fontSize: '22px',
    color: DEFAULT_CLOSE_COLOR,
    fontFamily: HEADER_FONT,
  });
  closeBtn.setDepth(depthBase + DEPTH_STEP * 2);
  closeBtn.setInteractive({ useHandCursor: true });
  closeBtn.on('pointerover', () => closeBtn.setColor(DEFAULT_CLOSE_HOVER));
  closeBtn.on('pointerout', () => closeBtn.setColor(DEFAULT_CLOSE_COLOR));
  objects.push(closeBtn);
  parentIntoHud(scene, [closeBtn]);

  // ── Content area ──
  const contentX = boxX + 10;
  const contentY = boxY + headerH + 10;
  const contentWidth = boxWidth - 20;
  const contentHeight = boxHeight - headerH - 46 - bottomPad;

  // Scroll container — lives at (contentX, contentY) in the scene.
  // Callers add their text / game objects here at (0, 0) relative origin.
  const scrollContainer = scene.add.container(contentX, contentY);
  scrollContainer.setDepth(depthBase + DEPTH_STEP * 2);
  objects.push(scrollContainer);
  parentIntoHud(scene, [scrollContainer]);

  // ── Invisible scroll mask (scene‑space) ──
  const maskGraphics = scene.add.graphics();
  maskGraphics.fillStyle(0xffffff);
  maskGraphics.fillRect(contentX, contentY, contentWidth, contentHeight);
  maskGraphics.setVisible(false);
  objects.push(maskGraphics);

  // ── Handle (forward‑declared so the wheel handler can reference it) ──
  const handle: DialogHandle = {
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
    monoFont: MONO_FONT,
    scrollY: 0,
    depthBase,
    close,
    refresh,
  };

  // ── Wheel handler (bounds‑checked, attached to scene input) ──
  // The handler checks pointer position against the dialog box area so
  // that wheel events over this dialog don't leak to other overlays.
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

  /** Close the dialog and remove all event listeners. */
  function close(): void {
    scene.input.off('wheel', wheelHandler);
    dismissOverlay(objects);
    options.onClose?.();
  }

  /**
   * Re‑clamp scroll, reposition container, and apply/remove mask.
   */
  function refresh(totalContentHeight?: number): void {
    const th = totalContentHeight ?? estimateContentHeight();
    const maxScroll = Math.max(0, th - contentHeight);
    handle.scrollY = Math.min(handle.scrollY, maxScroll);
    scrollContainer.setY(-handle.scrollY);

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

  // Hook close button to the close method
  closeBtn.on('pointerdown', close);

  return handle;
}
