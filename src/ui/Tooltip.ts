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
    div.style.position = 'absolute';
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

    // Set text
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

      const offsetX = 10;
      const offsetY = 10;

      // Position the element and make it visible
      this.node.style.left = `${Math.round(screenX + offsetX)}px`;
      this.node.style.top = `${Math.round(screenY + offsetY)}px`;
      this.node.style.display = 'block';
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
