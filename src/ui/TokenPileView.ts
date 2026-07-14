/**
 * TokenPileView -- Reusable component for rendering token piles
 * (resource tokens, crop icons, expedition markers, etc.) in a Phaser scene.
 *
 * Unlike PileView which renders standard playing cards, TokenPileView
 * accepts arbitrary objects and renders them as circular tokens with
 * optional icon overlays and count labels. This enables games with
 * non-standard card models (e.g. Feudalism's resource tokens) to use
 * a shared, testable pile-rendering component.
 *
 * @module ui/TokenPileView
 */

// ── Types ───────────────────────────────────────────────────

/**
 * Token renderer callback.
 *
 * Called for each token object to produce its visual representation
 * within the token pile container. The callback receives the token
 * object and a Phaser container to which display objects should be
 * added.
 *
 * @param token   - The raw token object (any shape defined by the game).
 * @param container - The Phaser container to add display objects to.
 * @param index   - Zero-based index of this token within the pile.
 */
export type TokenRenderer<T = unknown> = (
  token: T,
  container: Phaser.GameObjects.Container,
  index: number,
) => void;

/**
 * Configuration for a {@link TokenPileView}.
 */
export interface TokenPileViewOptions<T = unknown> {
  /** X position of the pile centre. */
  x: number;

  /** Y position of the pile centre. */
  y: number;

  /** Display label shown below the pile (e.g. "Resources", "Supply"). */
  label?: string;

  /** Radius of each token circle in pixels. @default 20 */
  tokenRadius?: number;

  /** Fill colour for the token circle (0xRRGGBB or CSS string). @default '#cccccc' */
  tokenFillColor?: string;

  /** Stroke colour for the token circle border. @default '#666666' */
  tokenStrokeColor?: string;

  /** Stroke width for the token circle border. @default 1 */
  tokenStrokeWidth?: number;

  /** Font size for the count label. @default '13px' */
  countFontSize?: string;

  /** Colour for the count label. @default '#222222' */
  countColor?: string;

  /** Y offset of the count label below the pile sprite. @default 60 */
  countOffsetY?: number;

  /**
   * Custom renderer for each token object. When provided, this function
   * is called for each token to draw its visual representation.
   * This is the primary extensibility point for non-standard card models.
   */
  tokenRenderer?: TokenRenderer<T>;

  /** Number of tokens in the pile (defaults to tokens.length if not provided). */
  count?: number;
}

/** Event map for {@link TokenPileView}. */
export interface TokenPileViewEvents {
  /** Fired when the token pile container is clicked. */
  click: void;
}

// ── Implementation ───────────────────────────────────────────

/**
 * Reusable token-pile display component.
 *
 * Renders circular tokens with optional icon overlays, count labels,
 * and click events. Designed for games with non-standard card models
 * such as Feudalism's resource tokens.
 *
 * ### Example
 * ```ts
 * const tokens = [
 *   { type: 'wheat', count: 3 },
 *   { type: 'barley', count: 2 },
 * ];
 * const tokenPile = new TokenPileView(scene, {
 *   x: 300,
 *   y: 200,
 *   label: 'Resources',
 *   tokenRadius: 14,
 *   tokenRenderer: (token, container) => {
 *     const t = token as { type: string; count: number };
 *     // Draw circle, icon, count text
 *   },
 * });
 * tokenPile.setTokens(tokens);
 * ```
 */
export class TokenPileView<T = unknown> {
  // Config
  private readonly _x: number;
  private readonly _y: number;
  private tokenRadius: number;
  private _tokenStrokeWidth: number;
  private countOffsetY: number;
  private labelPrefix: string;
  private tokenRenderer: TokenRenderer<T> | undefined;
  private countFontSize: string;
  private countColor: string;

  // State
  private tokens: T[] = [];
  private totalDisplayCount: number;

  // Display objects
  private container: Phaser.GameObjects.Container;
  private backgroundGraphics: Phaser.GameObjects.Graphics | null;
  private countText: Phaser.GameObjects.Text;

  // Events
  private clickCallbacks: Array<() => void> = [];

  // ── Constructor ─────────────────────────────────────────

  constructor(scene: Phaser.Scene, opts: TokenPileViewOptions<T>) {
    this._x = opts.x;
    this._y = opts.y;
    this.tokenRadius = opts.tokenRadius ?? 20;
    this._tokenStrokeWidth = opts.tokenStrokeWidth ?? 1;
    this.countOffsetY = opts.countOffsetY ?? 60;
    this.labelPrefix = opts.label ? `${opts.label}: ` : '';
    this.tokenRenderer = opts.tokenRenderer;
    this.countFontSize = opts.countFontSize ?? '13px';
    this.countColor = opts.countColor ?? '#222222';

    // Create container for all token display objects
    this.container = scene.add.container(this._x, this._y);
    this.container.setInteractive({ useHandCursor: true });

    // Create background graphics for the pile base
    this.backgroundGraphics = scene.add.graphics();
    this.drawBackground();
    this.container.add(this.backgroundGraphics);

    // Draw initial tokens (empty)
    if (this.tokenRenderer) {
      this.tokens = [];
    }

    // Create count label
    const initialCount = opts.count ?? 0;
    this.totalDisplayCount = initialCount;

    this.countText = scene.add.text(this._x, this._y + this.countOffsetY,
      `${this.labelPrefix}${initialCount}`, {
        fontSize: this.countFontSize,
        color: this.countColor,
        fontFamily: 'monospace',
      }).setOrigin(0.5);
    scene.add.existing(this.countText);

    // Click handling
    this.container.on('pointerdown', () => {
      for (const cb of this.clickCallbacks) cb();
    });
  }

  // ── Background drawing ──────────────────────────────────

  /** Draw the circular background for the token pile. */
  private drawBackground(): void {
    if (!this.backgroundGraphics) return;
    this.backgroundGraphics.clear();
    this.backgroundGraphics.fillStyle(0x888888, 0.15);
    this.backgroundGraphics.fillCircle(0, 0, this.tokenRadius + 2);
    this.backgroundGraphics.lineStyle(this._tokenStrokeWidth, 0x888888, 0.3);
    this.backgroundGraphics.strokeCircle(0, 0, this.tokenRadius + 2);
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Set (or replace) the token objects and optionally override
   * the displayed count. Call {@link update} to refresh the visual state.
   */
  setTokens(items: T[], count?: number): void {
    this.tokens = items;
    if (count !== undefined) {
      this.totalDisplayCount = count;
    } else {
      this.totalDisplayCount = items.reduce((sum, t) => {
        const tokenData = t as Record<string, number>;
        return sum + (tokenData.count ?? 1);
      }, 0);
    }
    this.update();
  }

  /**
   * Refresh the tokens and count label from the current state.
   * Call this after mutating the tokens array.
   */
  update(): void {
    // Remove old tokens from container (keep background graphics at index 0)
    const children: Phaser.GameObjects.GameObject[] = this.container.list;
    for (let i = children.length - 1; i > 0; i--) {
      try { children[i].destroy(); } catch (_) { /* ignore */ }
    }

    // Draw each token
    if (this.tokenRenderer) {
      for (let i = 0; i < this.tokens.length; i++) {
        this.tokenRenderer(this.tokens[i], this.container, i);
      }
    }

    // Update count label
    this.countText.setText(`${this.labelPrefix}${this.totalDisplayCount}`);
  }

  /**
   * Register a click callback on the token pile container.
   * Multiple callbacks can be registered and all will fire.
   */
  onClick(cb: () => void): void {
    this.clickCallbacks.push(cb);
  }

  /**
   * Enable or disable pointer interaction on the token pile container.
   */
  setInteractive(flag: boolean): void {
    if (flag) {
      this.container.setInteractive({ useHandCursor: true });
    } else {
      this.container.disableInteractive();
    }
  }

  /**
   * Return the container for the token pile (for external animation
   * or positioning if needed).
   */
  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  /**
   * Return the count label text object (for external positioning
   * or styling if needed).
   */
  getCountText(): Phaser.GameObjects.Text {
    return this.countText;
  }

  /**
   * Return the current token objects.
   */
  getTokens(): T[] {
    return this.tokens;
  }

  /**
   * Get the current displayed count.
   */
  getCount(): number {
    return this.totalDisplayCount;
  }

  /**
   * Destroy the token pile view. Call this when the view
   * is no longer needed.
   */
  destroy(): void {
    this.tokens = [];
    this.totalDisplayCount = 0;
    this.clickCallbacks = [];
    try { this.container.destroy(); } catch (_) { /* ignore */ }
    try { this.countText.destroy(); } catch (_) { /* ignore */ }
    this.backgroundGraphics = null;
  }
}

// ── Pre-built helpers for common use cases ──────────────────

/**
 * A simple token renderer for resource tokens (Feudalism-style).
 *
 * Draws a coloured circle with a small icon and count overlay.
 * This is a convenience helper — games can also provide their own
 * `tokenRenderer` callback for full customisation.
 *
 * @param scene   - The Phaser scene for texture generation.
 * @param iconColor - Icon stroke colour (0xRRGGBB).
 * @returns A {@link TokenRenderer} function suitable for `TokenPileView`.
 */
export function createSimpleTokenRenderer(
  _scene: Phaser.Scene,
  _iconColor: number = 0x000000,
): TokenRenderer<{ type: string; count?: number }> {
  return (token: { type: string; count?: number }, container: Phaser.GameObjects.Container, index: number): void => {
    const scene = _scene;
    const cx = -index * 30; // Offset tokens horizontally

    // Token circle background
    const circle = scene.add.circle(cx, 0, 14, 0xdddddd);
    circle.setStrokeStyle(1, 0x666666);
    container.add(circle);

    // Small icon placeholder (coloured dot)
    const typeColors: Record<string, number> = {
      wheat: 0xf4a460,
      barley: 0xdaa520,
      oats: 0xdeb887,
      flax: 0x87ceeb,
      turnip: 0xff6347,
      mead: 0xffd700,
      default: 0xaaaaaa,
    };
    const iconFill = typeColors[token.type] ?? typeColors.default;
    const icon = scene.add.circle(cx, 0, 5, iconFill, 0.5);
    container.add(icon);

    // Count overlay
    const count = token.count ?? 1;
    const countLabel = scene.add.text(cx, 0, `${count}`, {
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#222222',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    container.add(countLabel);
  };
}

/**
 * A generic card-backed token renderer that uses the existing
 * `cardTextureKey` helper from CardTextureHelpers to map tokens
 * to card-like textures based on a `cardType` property.
 *
 * Useful for games that have card-like objects with custom types
 * but no dedicated token renderer.
 */
export function createCardBackTokenRenderer(
  backTexture: string = 'card_back',
): TokenRenderer<{ cardType?: string }> {
  return (token: { cardType?: string }, container: Phaser.GameObjects.Container, _index: number): void => {
    // Use card back texture for all tokens (or card type if provided)
    const key = token.cardType ? `${backTexture}-${token.cardType}` : backTexture;
    const sprite = container.scene.add.image(0, 0, key);
    container.add(sprite);
  };
}

/**
 * A token renderer for Feudalism-style resource tokens that draws
 * a coloured circle and a count overlay.
 *
 * This is a convenience wrapper that can be used directly with
 * {@link TokenPileView}. Games can also provide their own
 * `tokenRenderer` callback for full customisation (e.g. with crop icons).
 */
export function createFeudalismTokenRenderer(
  _strokeColor: number = 0x000000,
): TokenRenderer<{ type: string; count?: number }> {
  return (token: { type: string; count?: number }, container: Phaser.GameObjects.Container, index: number): void => {
    // We can't import from FeudalismCards here (circular dependency),
    // so we draw a simple coloured circle with the resource abbreviation
    const cx = -index * 34;

    // Token circle background
    const RESOURCE_COLORS: Record<string, number> = {
      wheat: 0xf4a460,
      barley: 0xdaa520,
      oats: 0xdeb887,
      flax: 0x87ceeb,
      turnip: 0xff6347,
      mead: 0xffd700,
      default: 0xcccccc,
    };
    const fill = RESOURCE_COLORS[token.type] ?? RESOURCE_COLORS.default;

    const circle = container.scene.add.circle(cx, 0, 14, fill);
    circle.setStrokeStyle(1, 0xffffff);
    container.add(circle);

    // Count overlay
    const count = token.count ?? 0;
    const countLabel = container.scene.add.text(cx, 0, `${count}`, {
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#222222',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    container.add(countLabel);
  };
}
