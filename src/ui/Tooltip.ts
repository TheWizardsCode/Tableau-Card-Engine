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

/**
 * Which input source asked for a tooltip.
 *
 * The manager does not infer this from global pointer state (that is
 * unreliable in mixed-input scenes) — the caller states it explicitly on
 * {@link TooltipManager.show}.
 */
export type TooltipInputType = 'hover' | 'touch';

/** Configuration supplied when creating a Phaser-mode TooltipManager. */
export interface TooltipManagerConfig {
  /** When provided the manager uses Phaser rendering instead of DOM. */
  phaserRender?: PhaserTooltipRenderFn;
  /**
   * Hover-intent delay for mouse hover, in milliseconds (default `0`).
   *
   * `0` (or an absent value) renders the tooltip synchronously on
   * `show()` and schedules no timer at all, so an existing caller's frame
   * timing is unchanged. A non-zero value schedules the show and only
   * renders once the delay has elapsed.
   */
  delayMs?: number;
  /**
   * Hover-intent delay for a touch press-and-hold, in milliseconds
   * (default `0`, independent of {@link TooltipManagerConfig.delayMs}).
   *
   * A press-and-hold has no "pointer sweep" problem, so it normally wants
   * a shorter dwell than mouse hover; a host that opts into `delayMs`
   * should set this too. Left unset, touch shows immediately.
   */
  touchDelayMs?: number;
}

/** A show scheduled by a non-zero delay that has not rendered yet. */
interface PendingTooltipShow {
  content: string;
  x: number;
  y: number;
  ctx?: TooltipRenderContext;
  timer: Phaser.Time.TimerEvent | null;
}

/** The subset of `Phaser.Time.Clock` the manager relies on. */
interface TooltipTimeManager {
  delayedCall?: (delay: number, callback: () => void) => Phaser.Time.TimerEvent;
}

/** Coerce a configured delay to a finite, non-negative millisecond count. */
function normalizeTooltipDelay(delayMs: number | undefined): number {
  if (typeof delayMs !== 'number' || !Number.isFinite(delayMs) || delayMs <= 0) return 0;
  return delayMs;
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
  private readonly delayMs: number;
  private readonly touchDelayMs: number;
  private phaserContainer: Phaser.GameObjects.Container | null = null;
  private pendingShow: PendingTooltipShow | null = null;
  /**
   * Whether an overlay is currently on screen. Tracked explicitly so
   * {@link reanchor} can tell "visible, move it" from "nothing on screen, do
   * not show anything" without inferring it from the renderer's DOM state.
   */
  private rendered = false;

  constructor(
    scene: Phaser.Scene,
    settingsPanel?: SettingsPanel,
    config?: TooltipManagerConfig,
  ) {
    this.settingsPanel = settingsPanel;
    this.scene = scene;
    this.phaserRender = config?.phaserRender;
    this.delayMs = normalizeTooltipDelay(config?.delayMs);
    this.touchDelayMs = normalizeTooltipDelay(config?.touchDelayMs);

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
   * **Hover intent.** When the configured delay for `inputType` is non-zero
   * the overlay is *scheduled* rather than rendered: nothing appears until
   * the delay elapses. A repeated `show()` while a show is pending refreshes
   * the pending content, context and anchor (so a 1.5 s dwell still lands at
   * the live pointer) without restarting the delay — continuous pointer
   * movement inside one target cannot postpone the tooltip indefinitely.
   * `hide()` and `destroy()` cancel a pending show.
   *
   * The delay gates **appearance**, not **following**: once the overlay is up,
   * moving it with the pointer is {@link reanchor}'s job — a further `show()`
   * would arm a second dwell and leave the visible overlay frozen at its old
   * anchor.
   *
   * A delay of `0` (the default) renders synchronously on this call and
   * schedules no timer, so callers that pass no timing config behave exactly
   * as before. Scenes without a time manager (headless/bare mocks) fall back
   * to the same immediate render.
   *
   * @param content   – text for DOM mode; arbitrary string for Phaser mode.
   * @param x         – world X for DOM mode; passed to context for Phaser.
   * @param y         – world Y for DOM mode; passed to context for Phaser.
   * @param ctx       – extra context forwarded to the Phaser render callback.
   * @param inputType – which delay applies: `'hover'` (default) or `'touch'`.
   */
  show(
    content: string,
    x: number,
    y: number,
    ctx?: TooltipRenderContext,
    inputType: TooltipInputType = 'hover',
  ): void {
    if (this.settingsPanel && !this.settingsPanel.showTooltips) {
      this.cancelPendingShow();
      this.hide();
      return;
    }

    const delayMs = inputType === 'touch' ? this.touchDelayMs : this.delayMs;

    // Delay 0 keeps the historical synchronous render (no timer at all).
    if (delayMs <= 0) {
      this.cancelPendingShow();
      this.renderNow(content, x, y, ctx);
      return;
    }

    // Already waiting: refresh content/anchor but keep the running dwell.
    if (this.pendingShow) {
      this.pendingShow.content = content;
      this.pendingShow.x = x;
      this.pendingShow.y = y;
      this.pendingShow.ctx = ctx;
      return;
    }

    const time = (this.scene as unknown as { time?: TooltipTimeManager } | undefined)
      ?.time;
    if (!time || typeof time.delayedCall !== 'function') {
      // No time manager (headless / bare mocks): degrade to an immediate show.
      this.renderNow(content, x, y, ctx);
      return;
    }

    const pending: PendingTooltipShow = { content, x, y, ctx, timer: null };
    this.pendingShow = pending;
    pending.timer = time.delayedCall(delayMs, () => this.firePendingShow(pending));
  }

  /**
   * Move the tooltip's anchor to (x, y) **without** arming a new dwell.
   *
   * The delay gates *appearance*, not *following*: once a host has shown a
   * delayed tooltip it normally wants the overlay to stay with its target while
   * the pointer moves inside it. Re-issuing `show()` cannot express that — with
   * the overlay already rendered it schedules a second dwell and leaves the
   * overlay frozen at the old anchor — and `hide()` + `show()` flickers and
   * waits out a whole fresh delay. This method is the third anchor state:
   *
   * - a show is **pending**: the pending anchor moves and the dwell keeps
   *   running (identical to a repeated `show()` while pending);
   * - the overlay is **visible**: it is repositioned immediately with the same
   *   placement rules `show()` uses (DOM: canvas/camera mapping plus the
   *   viewport clamp/flip; Phaser: the container's position) and its content is
   *   left alone, so there is no re-render and no flicker;
   * - **nothing** is pending or visible: a no-op — a re-anchor never shows a
   *   tooltip the host has not asked for.
   *
   * Suppression still wins: with `SettingsPanel.showTooltips === false` a
   * pending show is cancelled and any visible overlay is hidden, exactly as
   * `show()` does.
   *
   * @param x – world X of the tooltip's target.
   * @param y – world Y of the tooltip's target.
   */
  reanchor(x: number, y: number): void {
    if (this.settingsPanel && !this.settingsPanel.showTooltips) {
      this.cancelPendingShow();
      this.hide();
      return;
    }

    // Still waiting out a dwell: move the anchor, keep the running timer so
    // continuous movement can never postpone the show.
    const pending = this.pendingShow;
    if (pending) {
      pending.x = x;
      pending.y = y;
      return;
    }

    // Nothing pending and nothing on screen: never render, never schedule.
    if (!this.rendered) return;

    if (this.phaserContainer) {
      this.phaserContainer.setPosition(x, y);
      return;
    }

    this.positionDomNode(x, y);
  }

  /**
   * Render a tooltip immediately (both render paths) — the pre-delay
   * behaviour, shared by the zero-delay path and the delayed timer callback.
   */
  private renderNow(
    content: string,
    x: number,
    y: number,
    ctx?: TooltipRenderContext,
  ): void {
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
      this.rendered = true;
      return;
    }

    // ── DOM mode ───────────────────────────────────────────
    if (!this.node) return;

    // Set text and make the node displayable so it can be measured. The
    // browser does not paint until this task completes, so there is no
    // visible flash between the measure and the final position.
    this.node.textContent = content;
    this.positionDomNode(x, y);
  }

  /**
   * Position the DOM overlay for an anchor: canvas/camera mapping plus the
   * viewport clamp/flip. Shared by the first render and by {@link reanchor}, so
   * a following tooltip can never jump or leave the viewport.
   */
  private positionDomNode(x: number, y: number): void {
    if (!this.node) return;

    // Display first: the clamp/flip below measures the node's rendered size.
    this.node.style.display = 'block';

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
      this.rendered = true;
    } catch (e) {
      // If anything fails, hide tooltip
      this.hide();
    }
  }

  /**
   * Cancel the pending show and render its content.
   *
   * Guarded twice: the pending record must still be the current one (a
   * `hide()`/`destroy()` in between clears it) and the Settings suppression
   * is re-checked, because the player can toggle tooltips off during the
   * dwell.
   */
  private firePendingShow(pending: PendingTooltipShow): void {
    if (this.pendingShow !== pending) return;
    this.pendingShow = null;
    if (this.settingsPanel && !this.settingsPanel.showTooltips) return;
    this.renderNow(pending.content, pending.x, pending.y, pending.ctx);
  }

  /** Cancel a scheduled show, if any, so no tooltip appears after it. */
  private cancelPendingShow(): void {
    const pending = this.pendingShow;
    this.pendingShow = null;
    if (!pending?.timer) return;
    try {
      pending.timer.remove(false);
    } catch {
      // A timer already torn down with its scene cannot be removed again.
    }
  }

  hide(): void {
    // A pending show must never appear after hide().
    this.cancelPendingShow();
    // Hide Phaser tooltip
    this.hidePhaserTooltip();
    // Hide DOM tooltip
    if (!this.node) {
      this.rendered = false;
      return;
    }
    this.node.style.display = 'none';
    this.rendered = false;
  }

  /** Destroy the active Phaser container (internal). */
  private hidePhaserTooltip(): void {
    if (this.phaserContainer) {
      this.phaserContainer.destroy();
      this.phaserContainer = null;
    }
    this.rendered = false;
  }

  destroy(): void {
    // No timer may survive teardown.
    this.cancelPendingShow();
    // Clean up Phaser container
    this.hidePhaserTooltip();
    // Clean up DOM node
    if (this.node) {
      try { this.node.remove(); } catch {}
    }
  }
}
