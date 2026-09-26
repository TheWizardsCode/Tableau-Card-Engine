/**
 * cardHighlight -- Canvas-compatible persistent highlight for a card sprite.
 *
 * In Phaser 4's Canvas renderer `setTint()` on an Image/Sprite is a no-op,
 * so a selection/target highlight that only calls `setTint()` is invisible
 * whenever a game falls back to Canvas. This helper applies both the WebGL
 * tint and a semi-transparent overlay rectangle (visible under both
 * renderers) — the same approach `HandView` uses for its selection state and
 * `shakeIllegalMove` uses for its transient illegal-move flash
 * (CG-0MUHL6T0I002AW5Y).
 *
 * Unlike those transient overlays, a card highlight is persistent: it stays
 * attached to its card until explicitly destroyed and can be re-synced to
 * follow the card after it moves or finishes a tween.
 *
 * @module ui/cardHighlight
 */

/** Options for {@link createCardHighlight}. */
export interface CardHighlightOptions {
  /** The Phaser scene that owns the overlay rectangle. */
  scene: Phaser.Scene;
  /** The card sprite/Image to highlight. */
  target: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  /** Highlight colour (overlay fill and WebGL tint). */
  color: number;
  /** Overlay alpha. @default 0.35 */
  alpha?: number;
  /**
   * Depth offset applied above the target's current depth so the overlay
   * renders just above the card. @default 0.01
   */
  depthOffset?: number;
  /**
   * Optional outline colour drawn around the overlay. A stroke makes the
   * selection unmistakable under both WebGL and Canvas (the semi-transparent
   * fill alone can read as a subtle wash). Omitted → no outline.
   */
  strokeColor?: number;
  /** Outline width in px. Only used when {@link strokeColor} is set. @default 3 */
  strokeWidth?: number;
}

/** A live card highlight created by {@link createCardHighlight}. */
export interface CardHighlight {
  /** The overlay rectangle (Canvas-visible highlight). */
  readonly overlay: Phaser.GameObjects.Rectangle;
  /**
   * Re-align the overlay with the target's current position, rotation and
   * depth. Call after moving/tweening the card while the highlight is active.
   */
  sync(): void;
  /** Remove the overlay and clear the WebGL tint. Idempotent. */
  destroy(): void;
}

/** Default overlay alpha, matching `HandView`'s selection overlay. */
const DEFAULT_HIGHLIGHT_ALPHA = 0.35;

/** Default depth offset so the overlay renders just above the card. */
const DEFAULT_DEPTH_OFFSET = 0.01;

/** Default outline width when a `strokeColor` is supplied. */
const DEFAULT_STROKE_WIDTH = 3;

/** Fallback card dimensions when the target exposes none. */
const FALLBACK_CARD_W = 96;
const FALLBACK_CARD_H = 130;

/**
 * Attach a persistent, renderer-agnostic highlight to a card sprite.
 *
 * @returns A {@link CardHighlight} whose `overlay` is the Canvas-visible
 *          rectangle; call `destroy()` to remove it (and clear the tint).
 */
export function createCardHighlight(
  options: CardHighlightOptions,
): CardHighlight {
  const {
    scene,
    target,
    color,
    alpha = DEFAULT_HIGHLIGHT_ALPHA,
    depthOffset = DEFAULT_DEPTH_OFFSET,
    strokeColor,
    strokeWidth = DEFAULT_STROKE_WIDTH,
  } = options;

  const t = target as unknown as {
    x: number;
    y: number;
    depth?: number;
    rotation?: number;
    originX?: number;
    originY?: number;
    displayWidth?: number;
    displayHeight?: number;
    width?: number;
    height?: number;
    active?: boolean;
    setTint?: (c: number) => void;
    clearTint?: (() => void) | undefined;
  };

  // WebGL tint (no-op under Canvas, which is why the overlay exists).
  try {
    target.setTint?.(color);
  } catch {
    /* tint is best-effort; the overlay is the guaranteed highlight */
  }

  const width = t.displayWidth ?? t.width ?? FALLBACK_CARD_W;
  const height = t.displayHeight ?? t.height ?? FALLBACK_CARD_H;

  const overlay = scene.add
    .rectangle(t.x, t.y, width, height, color)
    .setAlpha(alpha)
    .setOrigin(t.originX ?? 0.5, t.originY ?? 0.5)
    .setRotation(t.rotation ?? 0)
    .setDepth((t.depth ?? 0) + depthOffset);

  // Optional outline: the fill alone can read as a subtle wash, so a stroke
  // makes the selection unmistakable in both renderers (CG-0MUHKD7S8007EEAC).
  if (strokeColor !== undefined && typeof overlay.setStrokeStyle === 'function') {
    overlay.setStrokeStyle(strokeWidth, strokeColor);
  }

  let destroyed = false;

  const sync = (): void => {
    if (destroyed || !overlay.active) return;
    if (t.active === false) return;
    overlay.setPosition(t.x, t.y);
    overlay.setRotation(t.rotation ?? 0);
    overlay.setDepth((t.depth ?? 0) + depthOffset);
  };

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    if (t.active !== false) {
      try {
        target.clearTint?.();
      } catch {
        /* the card/overlay may already be destroyed — ignore */
      }
    }
    overlay.destroy();
  };

  return { overlay, sync, destroy };
}
