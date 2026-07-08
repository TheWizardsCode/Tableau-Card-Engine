/**
 * PileView -- Reusable component for rendering a card pile
 * (deck, discard, foundation, etc.) in a Phaser scene.
 *
 * Displays the top card of the pile (or a back texture when empty)
 * along with a count label. Supports click events and provides
 * quick access to the underlying pile model.
 *
 * @module ui/PileView
 */

import type { Card } from '../card-system/Card';
import { Pile } from '../card-system/Pile';
import { getCardTexture } from './CardTextureHelpers';

// ── Types ───────────────────────────────────────────────────

/**
 * Custom card texture resolver for non-standard card models.
 *
 * Used by {@link PileView} when the card type does not have `rank`/`suit`
 * properties (e.g. Lost Cities cards with expedition color and type).
 *
 * @param card  - The card object to resolve a texture for.
 * @returns The texture key to use for the card sprite.
 */
export type CardTextureResolver = (card: unknown) => string;

// ── Types ───────────────────────────────────────────────────

/** Minimal interface for a card pile model. PileView works with any
 *  object that provides `size()`, `isEmpty()`, and `peek()` methods.
 *  This enables usage with `Pile<Card>` from card-system as well as
 *  plain arrays or wrapper objects (e.g. Golf's `Card[]` stock pile). */
export interface CardPile<T = Card> {
  size(): number;
  isEmpty(): boolean;
  peek(): T | undefined;
}

/** Options for creating a {@link PileView}. */
export interface PileViewOptions {
  /** X position of the pile sprite centre. */
  x: number;

  /** Y position of the pile sprite centre. */
  y: number;

  /** Display label shown below the pile (e.g. "Deck", "Discard"). */
  label?: string;

  /** Texture key used when the pile is empty. @default 'card_back' */
  emptyTexture?: string;

  /** Alpha when the pile is empty (ghosted look). @default 0.3 */
  emptyAlpha?: number;

  /** Alpha when the pile has cards. @default 1 */
  fullAlpha?: number;

  /** Font size for the count label. @default '11px' */
  countFontSize?: string;

  /** Colour for the count label. @default '#888888' */
  countColor?: string;

  /** Y offset of the count label below the pile sprite. @default 60 */
  countOffsetY?: number;

  /**
   * Custom texture resolver for non-standard card models (e.g. Lost Cities
   * cards with expedition color and type instead of rank/suit). When
   * provided, this function is called instead of `getCardTexture()` to
   * determine the texture key for the top card of the pile.
   */
  cardTextureFn?: CardTextureResolver;
}

/** Event map for {@link PileView}. */
export interface PileViewEvents {
  /** Fired when the pile sprite is clicked. */
  click: void;
}

// ── Implementation ───────────────────────────────────────────

/**
 * Reusable card-pile display component.
 *
 * Renders the top card of a {@link Pile} model (or a back texture
 * when empty), shows a count label, and emits click events.
 *
 * ### Example
 * ```ts
 * const drawPile = new Pile(createStandardDeck());
 * const drawView = new PileView(scene, { x: 500, y: 150, label: 'Deck' });
 * drawView.setPile(drawPile);
 * drawView.onClick(() => {
 *   const card = drawPile.pop()!;
 *   // ... handle drawn card
 *   drawView.update();
 * });
 * ```
 */
export class PileView {
  // Config
  private readonly _x: number;
  private readonly _y: number;
  private emptyTexture: string;
  private emptyAlpha: number;
  private fullAlpha: number;
  private countOffsetY: number;
  private labelPrefix: string;
  private cardTextureFn: CardTextureResolver | undefined;

  // Pile model (accepts both Pile<Card> and generic CardPile objects)
  private pile: CardPile<Card> | null = null;

  // Display objects
  private sprite: Phaser.GameObjects.Image;
  private countText: Phaser.GameObjects.Text;

  // Events
  private clickCallbacks: Array<() => void> = [];

  // ── Constructor ─────────────────────────────────────────

  constructor(scene: Phaser.Scene, opts: PileViewOptions) {
    this._x = opts.x;
    this._y = opts.y;
    this.emptyTexture = opts.emptyTexture ?? 'card_back';
    this.emptyAlpha = opts.emptyAlpha ?? 0.3;
    this.fullAlpha = opts.fullAlpha ?? 1;
    this.countOffsetY = opts.countOffsetY ?? 60;
    this.labelPrefix = opts.label ? `${opts.label}: ` : '';
    this.cardTextureFn = opts.cardTextureFn;

    // Create sprite (starts as empty/back)
    this.sprite = scene.add.image(this._x, this._y, this.emptyTexture)
      .setInteractive({ useHandCursor: true })
      .setAlpha(this.emptyAlpha);

    this.sprite.on('pointerdown', () => {
      for (const cb of this.clickCallbacks) cb();
    });

    // Create count label
    this.countText = scene.add.text(this._x, this._y + this.countOffsetY, `${this.labelPrefix}0`, {
      fontSize: opts.countFontSize ?? '11px',
      color: opts.countColor ?? '#888888',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Set (or replace) the pile model. Call {@link update} to
   * refresh the visual state after mutating the pile.
   */
  setPile<T = Card>(pile: CardPile<T>): void {
    this.pile = pile as unknown as Pile<Card>;
    this.update();
  }

  /**
   * Peek at the top card of the pile without removing it.
   * Returns undefined if the pile is empty or not set.
   */
  peek(): Card | undefined {
    return this.pile?.peek();
  }

  /**
   * Refresh the sprite texture and count label from the
   * current pile model state.
   */
  update(): void {
    if (!this.pile) {
      this.sprite.setTexture(this.emptyTexture);
      this.sprite.setAlpha(this.emptyAlpha);
      this.countText.setText(`${this.labelPrefix}0`);
      return;
    }

    if (this.pile.isEmpty()) {
      this.sprite.setTexture(this.emptyTexture);
      this.sprite.setAlpha(this.emptyAlpha);
      // Sprite remains visible (ghosted) so it stays interactive
    } else {
      const top = this.pile.peek()!;
      const textureKey = this.cardTextureFn
        ? this.cardTextureFn(top)
        : getCardTexture(top as Card);
      this.sprite.setTexture(textureKey);
      this.sprite.setAlpha(this.fullAlpha);
      this.sprite.setVisible(true);
    }

    this.countText.setText(`${this.labelPrefix}${this.pile.size()}`);
  }

  /**
   * Register a click callback on the pile sprite.
   * Multiple callbacks can be registered and all will fire.
   */
  onClick(cb: () => void): void {
    this.clickCallbacks.push(cb);
  }

  /**
   * Enable or disable pointer interaction on the pile sprite.
   * Useful for disabling interaction in replay mode.
   */
  setInteractive(flag: boolean): void {
    if (flag) {
      this.sprite.setInteractive({ useHandCursor: true });
    } else {
      this.sprite.disableInteractive();
    }
  }

  /**
   * Return the count label text object (for external positioning
   * or styling if needed).
   */
  getCountText(): Phaser.GameObjects.Text {
    return this.countText;
  }

  /**
   * Return the pile sprite (for external animation or positioning).
   */
  getSprite(): Phaser.GameObjects.Image {
    return this.sprite;
  }

  /**
   * Get the current pile model, or null if not set.
   */
  getPile(): CardPile<Card> | null {
    return this.pile as unknown as CardPile<Card>;
  }

  /**
   * Destroy the sprite and label. Call this when the view
   * is no longer needed.
   */
  destroy(): void {
    this.pile = null;
    this.clickCallbacks = [];
    try { this.sprite.destroy(); } catch (_) { /* ignore */ }
    try { this.countText.destroy(); } catch (_) { /* ignore */ }
  }
}