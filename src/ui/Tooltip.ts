/**
 * Tooltip manager – a lightweight UI component for displaying
 * contextual information (e.g., card details) when the player hovers
 * over a game object.
 *
 * The tooltip respects the global "Tooltips" toggle in the Settings
 * panel (`SettingsPanel.showTooltips`). If tooltips are disabled the
 * manager simply hides itself.
 *
 * **DOM mode** (default) – renders an HTML overlay on top of the canvas:
 *
 * ```ts
 * const tooltip = new TooltipManager(this, this.settingsPanel);
 * cardSprite.setInteractive({ useHandCursor: true });
 * cardSprite.on('pointerover', () => {
 *   tooltip.show('Card info text', cardSprite.x, cardSprite.y);
 * });
 * cardSprite.on('pointerout', () => tooltip.hide());
 * ```
 *
 * **Phaser mode** – renders Phaser GameObjects inside the scene by
 * providing a `phaserRender` callback:
 *
 * ```ts
 * const tooltip = new TooltipManager(this, this.settingsPanel, {
 *   phaserRender: (container, scene, hideTooltip, ctx) => {
 *     // Create text, background, etc. and add to container
 *     const bg = scene.add.rectangle(0, 0, 200, 60, 0x000000, 0.85);
 *     const txt = scene.add.text(8, 8, ctx.content, { fontSize: '13px', color: '#fff' });
 *     container.add([bg, txt]);
 *     container.setPosition(ctx.x, ctx.y);
 *     container.setDepth(800);
 *     return container;
 *   },
 * });
 *
 * // Show: pass context your render callback expects
 * tooltip.show('', cardContainer.x, cardContainer.y, {
 *   content: 'Scoring rule…',
 *   x: tooltipX,
 *   y: tooltipY,
 * });
 *
 * // Hide
 * tooltip.hide();
 * ```
 */

import { SettingsPanel } from './SettingsPanel';
import { FONT_FAMILY } from './constants';
import Phaser from 'phaser';

/**
 * Context object passed to the `phaserRender` callback so games can
 * supply arbitrary data (content strings, positioning hints, etc.).
 */
export interface TooltipRenderContext {
  /** Raw content string (e.g. scoring rule text). */
  content?: string;
  /** Target X position in game-world coordinates. */
  x?: number;
  /** Target Y position in game-world coordinates. */
  y?: number;
  /** Additional game-specific data. */
  [key: string]: unknown;
}

/**
 * Signature for the Phaser render callback. The callback is responsible
 * for populating the provided container with game objects, positioning
 * it, and setting its depth.
 *
 * @param container – an empty Phaser.Container the callback fills.
 * @param scene     – the Phaser scene (for creating game objects).
 * @param hideTooltip – callback the render fn can wire to pointer-out.
 * @param ctx       – arbitrary context supplied by the caller of `show`.
 * @returns the populated container (same reference as `container`).
 */
export type PhaserTooltipRenderFn = (
  container: Phaser.GameObjects.Container,
  scene: Phaser.Scene,
  hideTooltip: () => void,
  ctx: TooltipRenderContext,
) => Phaser.GameObjects.Container;

/** Configuration supplied when creating a Phaser-mode TooltipManager. */
export interface TooltipManagerConfig {
  /** When provided the manager uses Phaser rendering instead of DOM. */
  phaserRender?: PhaserTooltipRenderFn;
}

/** A tooltip box's top-left position. */
export interface TooltipPosition {
  x: number;
  y: number;
}

/** Options for {@link computeViewportTooltipPosition}. */
export interface ViewportTooltipPositionOptions {
  /** Hover point X in viewport (client) coordinates. */
  screenX: number;
  /** Hover point Y in viewport (client) coordinates. */
  screenY: number;
  /** Measured tooltip width in pixels. */
  tooltipWidth: number;
  /** Measured tooltip height in pixels. */
  tooltipHeight: number;
  /** Visible viewport width in pixels. */
  viewportWidth: number;
  /** Visible viewport height in pixels. */
  viewportHeight: number;
  /** Horizontal gap between the hover point and the tooltip (default 10). */
  offsetX?: number;
  /** Vertical gap between the hover point and the tooltip (default 10). */
  offsetY?: number;
  /** Gap kept clear of every edge (default 4). */
  margin?: number;
}

/** Default gap (px) kept between a tooltip and the bounds it must stay inside. */
export const TOOLTIP_BOUNDS_MARGIN = 4;

/** Default gap (px) between a hover point and its tooltip. */
export const TOOLTIP_HOVER_OFFSET = 10;

/**
 * Clamp a tooltip box (top-left origin) so it stays fully inside a
 * `boundsWidth` x `boundsHeight` region, keeping `margin` px clear of
 * every edge.
 *
 * This is the shared helper for in-canvas (Phaser-mode) tooltips: games
 * measure their tooltip box and clamp the container position with it,
 * mirroring the Lost Cities / Sushi Go precedent. It is opt-in — the
 * helper never repositions a caller-managed container on its own, so a
 * callback that already clamps is unaffected.
 *
 * A tooltip larger than its bounds cannot fit; it is pinned to the
 * top-left margin and partial visibility is accepted (documented
 * behaviour).
 *
 * @param x             desired top-left X.
 * @param y             desired top-left Y.
 * @param tooltipWidth  measured tooltip width.
 * @param tooltipHeight measured tooltip height.
 * @param boundsWidth   width of the region the tooltip must stay inside.
 * @param boundsHeight  height of the region the tooltip must stay inside.
 * @param margin        gap kept clear of every edge (default 4).
 */
export function clampTooltipToBounds(
  x: number,
  y: number,
  tooltipWidth: number,
  tooltipHeight: number,
  boundsWidth: number,
  boundsHeight: number,
  margin: number = TOOLTIP_BOUNDS_MARGIN,
): TooltipPosition {
  // `Math.max(margin, …)` keeps the upper bound ordered even when the
  // tooltip is larger than its bounds (oversized tooltip case).
  const maxX = Math.max(margin, boundsWidth - tooltipWidth - margin);
  const maxY = Math.max(margin, boundsHeight - tooltipHeight - margin);
  return {
    x: Math.min(Math.max(x, margin), maxX),
    y: Math.min(Math.max(y, margin), maxY),
  };
}

/**
 * Compute a viewport-relative (DOM) tooltip position: place the box
 * below-right of the hover point, flip it above/left when there is not
 * enough room, then clamp it as a final guard so it is always fully
 * visible inside the viewport.
 *
 * Used by {@link TooltipManager}'s DOM renderer; exported so the
 * placement can be unit-tested without a DOM.
 */
export function computeViewportTooltipPosition(
  options: ViewportTooltipPositionOptions,
): TooltipPosition {
  const offsetX = options.offsetX ?? TOOLTIP_HOVER_OFFSET;
  const offsetY = options.offsetY ?? TOOLTIP_HOVER_OFFSET;
  const margin = options.margin ?? TOOLTIP_BOUNDS_MARGIN;

  let x = options.screenX + offsetX;
  let y = options.screenY + offsetY;

  // Flip to the left of the hover point when the right edge would overflow.
  if (x + options.tooltipWidth + margin > options.viewportWidth) {
    x = options.screenX - offsetX - options.tooltipWidth;
  }
  // Flip above the hover point when the bottom edge would overflow.
  if (y + options.tooltipHeight + margin > options.viewportHeight) {
    y = options.screenY - offsetY - options.tooltipHeight;
  }

  return clampTooltipToBounds(
    x,
    y,
    options.tooltipWidth,
    options.tooltipHeight,
    options.viewportWidth,
    options.viewportHeight,
    margin,
  );
}

export class TooltipManager {
  private readonly settingsPanel?: SettingsPanel;
  private readonly node: HTMLElement | null;
  private readonly scene: Phaser.Scene;
  private readonly phaserRender?: PhaserTooltipRenderFn;
  private phaserContainer: Phaser.GameObjects.Container | null = null;

  constructor(
    scene: Phaser.Scene,
    settingsPanel?: SettingsPanel,
    config?: TooltipManagerConfig,
  ) {
    this.settingsPanel = settingsPanel;
    this.scene = scene;
    this.phaserRender = config?.phaserRender;

    // DOM node – only needed when NOT in Phaser mode
    if (this.phaserRender || typeof document === 'undefined') {
      this.node = null;
      return;
    }

    const div = document.createElement('div');
    // Fixed positioning keeps the node out of the document flow, so an
    // at-the-edge tooltip can never extend the page's scrollable area.
    div.style.position = 'fixed';
    div.style.background = 'rgba(0,0,0,0.88)';
    div.style.color = '#ffffff';
    div.style.padding = '6px 8px';
    div.style.borderRadius = '6px';
    div.style.pointerEvents = 'none';
    div.style.whiteSpace = 'pre-wrap';
    div.style.fontFamily = FONT_FAMILY;
    div.style.fontSize = '12px';
    div.style.zIndex = '2147483647';
    div.style.maxWidth = '320px';
    div.style.display = 'none';

    document.body.appendChild(div);
    this.node = div;
  }

  /**
   * Show a tooltip.
   *
   * In DOM mode `content` is rendered as plain text at (x, y).
   * In Phaser mode the `phaserRender` callback is invoked; `content`,
   * `x` and `y` are passed through the context object so the callback
   * can use them (or ignore them if the game prefers its own layout).
   *
   * @param content – text for DOM mode; arbitrary string for Phaser mode.
   * @param x       – world X for DOM mode; passed to context for Phaser.
   * @param y       – world Y for DOM mode; passed to context for Phaser.
   * @param ctx     – extra context forwarded to the Phaser render callback.
   */
  show(
    content: string,
    x: number,
    y: number,
    ctx?: TooltipRenderContext,
  ): void {
    if (this.settingsPanel && !this.settingsPanel.showTooltips) {
      this.hide();
      return;
    }

    // ── Phaser mode ────────────────────────────────────────
    if (this.phaserRender) {
      // Destroy previous container if any
      this.hidePhaserTooltip();

      // Create a fresh container
      this.phaserContainer = this.scene.add.container(x, y);

      // Let the game populate it
      const mergedCtx: TooltipRenderContext = {
        content,
        x,
        y,
        ...ctx,
      };
      this.phaserRender(this.phaserContainer, this.scene, () => this.hide(), mergedCtx);
      return;
    }

    // ── DOM mode ───────────────────────────────────────────
    if (!this.node) return;

    // Set text and make the node displayable so it can be measured. The
    // browser does not paint until this task completes, so there is no
    // visible flash between the measure and the final position.
    this.node.textContent = content;

    // Convert game/world coordinates to client coordinates relative to the canvas
    try {
      const canvas = (this.scene.game.canvas as HTMLCanvasElement | null);
      if (!canvas) {
        this.node.style.display = 'none';
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const cam = this.scene.cameras.main;
      const scaleX = rect.width / this.scene.scale.width;
      const scaleY = rect.height / this.scene.scale.height;
      const screenX = rect.left + (x - cam.scrollX) * scaleX;
      const screenY = rect.top + (y - cam.scrollY) * scaleY;

      this.node.style.display = 'block';

      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
      const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;

      let left: number;
      let top: number;
      if (
        Number.isFinite(viewportWidth) &&
        viewportWidth > 0 &&
        Number.isFinite(viewportHeight) &&
        viewportHeight > 0
      ) {
        // Clamp + flip into the viewport using the tooltip's measured size.
        const position = computeViewportTooltipPosition({
          screenX,
          screenY,
          tooltipWidth: this.node.offsetWidth || 0,
          tooltipHeight: this.node.offsetHeight || 0,
          viewportWidth,
          viewportHeight,
          offsetX: TOOLTIP_HOVER_OFFSET,
          offsetY: TOOLTIP_HOVER_OFFSET,
          margin: TOOLTIP_BOUNDS_MARGIN,
        });
        left = position.x;
        top = position.y;
      } else {
        // No viewport available (SSR / bare test environment): keep the
        // legacy unclamped placement so behaviour is unchanged.
        left = screenX + TOOLTIP_HOVER_OFFSET;
        top = screenY + TOOLTIP_HOVER_OFFSET;
      }

      this.node.style.left = `${Math.round(left)}px`;
      this.node.style.top = `${Math.round(top)}px`;
    } catch (e) {
      // If anything fails, hide tooltip
      this.hide();
    }
  }

  hide(): void {
    // Hide Phaser tooltip
    this.hidePhaserTooltip();
    // Hide DOM tooltip
    if (!this.node) return;
    this.node.style.display = 'none';
  }

  /** Destroy the active Phaser container (internal). */
  private hidePhaserTooltip(): void {
    if (this.phaserContainer) {
      this.phaserContainer.destroy();
      this.phaserContainer = null;
    }
  }

  destroy(): void {
    // Clean up Phaser container
    this.hidePhaserTooltip();
    // Clean up DOM node
    if (this.node) {
      try { this.node.remove(); } catch {}
    }
  }
}
