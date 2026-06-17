/**
 * HandView -- Reusable component for rendering and interacting with
 * a player's hand of cards in a Phaser scene.
 *
 * Encapsulates sprite creation, horizontal layout, selection handling
 * (with visual tint feedback), and event emission. Animation hooks for
 * deal/discard/flip are delegated to the caller via callbacks so the
 * component stays decoupled from specific animation implementations.
 *
 * @module ui/HandView
 */

import type { Card } from '../card-system/Card';
import { getCardTexture } from './CardTextureHelpers';
import { layoutCardPositions } from './layoutCardPositions';
import { CARD_W } from './constants';
import { dealCard } from './dealCard';
import { GameEventEmitter } from '../core-engine';

// ── Types ────────────────────────────────────────────────────

/**
 * Custom card texture resolver for non-standard card models.
 *
 * Used by {@link HandView} when the card type does not have `rank`/`suit`
 * properties (e.g. The Mind's `MindCard` with a numeric `value`).
 *
 * The `card` parameter is typed as `any` to allow resolvers for arbitrary
 * card-like types (MindCard, etc.) without requiring casts at the call site.
 *
 * @param card  - The card object to resolve a texture for.
 * @param index - The card's index in the hand (useful for back-face cards).
 * @returns The texture key to use for the card sprite.
 */
export type CardTextureResolver = (card: any, index: number) => string;

/**
 * Custom card renderer for non-standard card visuals.
 *
 * Used by {@link HandView} when a game needs to render cards using custom
 * Phaser display objects (e.g. {@link Phaser.GameObjects.Container}s with
 * colored rectangles, icons, and text labels) instead of the default
 * Image-sprite model.
 *
 * When provided, HandView calls this callback for each card instead of
 * creating a default `Phaser.GameObjects.Image` sprite. The returned
 * object is managed by HandView for layout, selection tint, and (when
 * no `customHoverFn`/`customClickFn` are provided) default hover and
 * click event handling.
 *
 * **Interaction handling** — If the caller handles hover/click/selection
 * inside the renderer, pass matching callbacks via
 * {@link HandViewOptions.customHoverFn} and
 * {@link HandViewOptions.customClickFn} to ensure HandView's built-in
 * event emission and selection tint are applied correctly.
 *
 * ### Example (Sushi Go-style colored rect + icon + label)
 * ```ts
 * const handView = new HandView(scene, {
 *   baseX: 60, baseY: 130, spacing: 20,
 *   renderCard: (card, index) => {
 *     const container = scene.add.container(0, 0);
 *     const rect = scene.add.rectangle(0, 0, 48, 65, 0xff8888);
 *     rect.setStrokeStyle(2, 0x333333);
 *     container.add(rect);
 *     container.setData('cardId', card.id);
 *     return container;
 *   },
 * });
 * ```
 *
 * @param card       - The card object to render.
 * @param index      - The card's index in the hand.
 * @param isSelected - Whether this card is currently selected.
 * @returns A Phaser display object (Image, Container, etc.) representing the card.
 */
export type RenderCardFn = (
  card: any,
  index: number,
  isSelected: boolean,
) => Phaser.GameObjects.GameObject;

/** Options for creating a {@link HandView}. */
export interface HandViewOptions {
  /** X coordinate for the leftmost (or centre) card position. */
  baseX: number;

  /** Y coordinate for all cards in the hand. */
  baseY: number;

  /** Horizontal spacing (px) between card centres. @default 20 */
  spacing?: number;

  /** Card width used for layout calculations. @default CARD_W (48) */
  cardWidth?: number;

  /** Maximum row width (px). Cards compress if they exceed this. */
  maxWidth?: number;

  /**
   * Arc radius used for curved layout.
   * - `0` renders a straight horizontal line at `baseY`.
   * - `>0` lifts edge cards along a smooth arc.
   * @default 0
   */
  arcRadius?: number;

  /** Whether per-card rank/suit labels are shown. @default true */
  showLabels?: boolean;

  /** Whether selection clicks are enabled. @default true */
  selectionEnabled?: boolean;

  /** Whether card click events are emitted. @default true */
  clickEnabled?: boolean;

  /**
   * Whether animations should be suppressed (instant state changes).
   * When true, addCard/removeCard with `{ animate: true }` will still
   * apply instantly instead of playing tweens.
   * @default false
   */
  reducedMotion?: boolean;

  /**
   * Maximum per-card rotation (degrees). Positive values tilt cards up to
   * `maxRotationDegrees` based on their horizontal offset from the hand
   * centre. Default: 25 (tilt).
   */
  maxRotationDegrees?: number;

  /**
   * Layout direction for the hand.
   * - `'horizontal'`: cards laid out in a row (left to right).
   * - `'vertical'`: cards stacked vertically (top to bottom cascade).
   * @default 'horizontal'
   */
  layoutDirection?: 'horizontal' | 'vertical';

  /**
   * Custom texture resolver for non-standard card models (e.g. MindCard
   * with numeric `value` instead of `rank`/`suit`). When provided,
   * this function is called instead of `getCardTexture()` to determine
   * the texture key for each card.
   */
  cardTextureFn?: CardTextureResolver;

  /**
   * Custom card renderer for non-standard card visuals.
   *
   * When provided, this function is called for each card instead of
   * creating a default `Phaser.GameObjects.Image` sprite. The returned
   * display object is managed by HandView for layout and selection.
   *
   * HandView applies a selection tint to the returned object and emits
   * `cardclick` events. If the caller handles hover effects inside the
   * renderer, pass a {@link customHoverFn} to apply selection tint and
   * emit events on hover as well.
   */
  renderCard?: RenderCardFn;

  /**
   * Custom hover callback for when the card object (rendered by
   * {@link renderCard}) is hovered. When provided, HandView will call
   * this function instead of applying its default `setTint(0x66ff66)`
   * hover effect.
   *
   * This allows custom renderers that manage their own hover visuals
   * (e.g. stroke color changes, scale tweens) to still benefit from
   * HandView's event emission.
   */
  customHoverFn?: (cardObject: Phaser.GameObjects.GameObject) => void;

  /**
   * Custom click callback for when the card object (rendered by
   * {@link renderCard}) is clicked. When provided, HandView will call
   * this function instead of its default click handling (selection +
   * event emission). The callback receives the card index.
   *
   * This allows custom renderers that manage their own click behaviour
   * (e.g. opening a tooltip, triggering a chopsticks pick) to still
   * benefit from HandView's layout and selection management.
   */
  customClickFn?: (cardIndex: number) => void;

  /**
   * Fixed horizontal centre for the hand layout.
   *
   * When set, {@link computeCardPositions} uses this value as the
   * horizontal centre of the hand instead of deriving it from
   * `baseX + (n-1)*spacing/2`. This keeps the hand anchored at a
   * fixed screen position when spacing or hand-size changes.
   *
   * Has no effect in vertical (cascade) layout mode — the X position
   * is always `baseX` in vertical mode.
   *
   * @default undefined (use baseX-derived centre)
   */
  centerX?: number;
}

/** Options for the {@link HandView.addCard} method. */
export interface AddCardOptions {
  /** Whether to animate the card entering the hand. @default false */
  animate?: boolean;

  /** Source X coordinate for deal animation. Only used when animate=true. */
  sourceX?: number;

  /** Source Y coordinate for deal animation. Only used when animate=true. */
  sourceY?: number;

  /** Duration in ms for deal animation. Only used when animate=true. */
  duration?: number;
}

/**
 * Animation options for {@link HandView.animateAddCard}.
 *
 * These options define the entry animation for a card being dealt into the hand.
 */
export interface AnimateAddCardOptions {
  /** Source X coordinate (where the card is coming from). */
  sourceX: number;

  /** Source Y coordinate (where the card is coming from). */
  sourceY: number;

  /** Duration in ms for the deal animation. @default 400 */
  duration?: number;

  /**
   * Arc height for the dealing motion (negative = upward arc).
   * Set to 0 for straight-line movement.
   * @default -50
   */
  arcHeight?: number;

  /** Easing function for the movement. @default 'Quad.easeOut' */
  ease?: string;

  /**
   * Optional rotation to apply during the deal (in radians).
   * Set to a small value (e.g., 0.1) for a slight spin effect.
   * @default 0.05
   */
  rotation?: number;

  /**
   * Optional SFX configuration for the deal animation.
   * Keys: start, move, end — audio keys to play at each phase.
   */
  sfx?: {
    start?: string;
    move?: string;
    end?: string;
    moveIntervalMs?: number;
    moveLoop?: boolean;
  };

  /**
   * Optional target index to insert the card at.
   * When provided, destination is computed for this index
   * and the card is inserted here. When omitted, appends.
   */
  insertAtIndex?: number;
}

/** Options for the {@link HandView.removeCard} method. */
export interface RemoveCardOptions {
  /** Whether to animate the card leaving the hand. @default false */
  animate?: boolean;

  /** Duration in ms for discard animation. Only used when animate=true. */
  duration?: number;
}

/** Source range for a drag operation (inclusive card indices). */
export interface DragSourceRange {
  from: number;
  to: number;
}

/** Payload for the {@link HandViewEvents.dragmove} event. */
export interface DragMovePayload {
  sourceRange: DragSourceRange;
  x: number;
  y: number;
}

/** Payload for the {@link HandViewEvents.dragend} event. */
export interface DragEndPayload {
  sourceRange: DragSourceRange;
  targetPileIndex: number | null;
  accepted: boolean;
}

/** Event map for {@link HandView}. */
export interface HandViewEvents {
  /** Fired when a card sprite is clicked. Payload: card index. */
  cardclick: number;

  /** Fired when the selection changes. Payload: new selected index or null. */
  selectionchange: number | null;

  /** Fired when a drag operation starts. Payload: source range (selected card indices). */
  dragstart: DragSourceRange;

  /** Fired during drag movement. Payload: source range and pointer coordinates. */
  dragmove: DragMovePayload;

  /** Fired when a drag ends. Payload: source range, target pile index (or null), and whether it was accepted. */
  dragend: DragEndPayload;
}

// ── Implementation ───────────────────────────────────────────

type EventCallback = (...args: any[]) => void;

/**
 * Reusable hand-of-cards display component.
 *
 * Manages a row of card sprites laid out horizontally (default) or in a
 * vertical cascade, with optional selection highlighting and click events.
 * The component does not own the Card data — callers mutate their own
 * array and call {@link setCards} or {@link addCard}/{@link removeCard}
 * to sync the visual state.
 *
 * ### Horizontal example (default)
 * ```ts
 * const handView = new HandView(scene, { baseX: 60, baseY: 130, spacing: 20 });
 * handView.setCards(myHand);
 * handView.on('cardclick', (idx) => handView.setSelected(idx));
 * // Later:
 * handView.addCard(drawnCard, { animate: true, sourceX: 500, sourceY: 150 });
 * handView.destroy();
 * ```
 *
 * ### Vertical (cascade) example
 * ```ts
 * const cascade = new HandView(scene, {
 *   baseX: 200,
 *   baseY: 100,
 *   spacing: 42,
 *   layoutDirection: 'vertical',
 * });
 * cascade.setCards(tableauCards);
 * cascade.on('cardclick', (idx) => cascade.setSelected(idx)); // selects cards [0..idx]
 * cascade.getCascadeRange(); // { from: 0, to: idx }
 * ```
 *
 * ### Custom card rendering example (Sushi Go style)
 * ```ts
 * const handView = new HandView(scene, {
 *   baseX: 60, baseY: 130, spacing: 20,
 *   renderCard: (card, index, isSelected) => {
 *     const container = scene.add.container(0, 0);
 *     const rect = scene.add.rectangle(0, 0, 48, 65, 0xff8888);
 *     rect.setStrokeStyle(2, 0x333333);
 *     rect.setInteractive({ useHandCursor: true });
 *     container.add(rect);
 *     container.setData('cardId', card.id);
 *     // Custom hover/selection handled via customHoverFn below
 *     return container;
 *   },
 *   customHoverFn: (cardObj) => {
 *     // Apply selection tint to the custom card
 *     cardObj.setTint(0x66ff66);
 *   },
 * });
 * ```
 */
export class HandView {
  private scene: Phaser.Scene;

  // Layout
  private baseX: number;
  private baseY: number;
  private spacing: number;
  private cardWidth: number;
  private maxWidth: number | undefined;
  private arcRadius: number;
  private showLabels: boolean;
  private selectionEnabled: boolean;
  private clickEnabled: boolean;
  private _reducedMotion: boolean;
  private _centerX: number | undefined;

  /** Whether this HandView instance has been destroyed. */
  public destroyed: boolean = false;

  /** Maximum rotation (degrees) applied proportionally based on card offset from centre. */
  private maxRotationDegrees: number = 0;

  /** Layout direction for the hand — horizontal row or vertical cascade. */
  private layoutDirection: 'horizontal' | 'vertical';

  // State
  private cards: Card[] = [];
  private selectedIndex: number | null = null;
  private _cardType: 'standard' | 'custom' = 'standard';

  // Display objects
  private sprites: Phaser.GameObjects.GameObject[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  /** Custom texture function (used for non-standard card models like MindCard). */
  private _customTextureFn: CardTextureResolver | undefined;
  /** Custom card renderer (used for non-standard card visuals). */
  private _renderCardFn: RenderCardFn | undefined;
  /** Custom hover callback for custom-rendered cards. */
  private _customHoverFn: ((cardObject: Phaser.GameObjects.GameObject) => void) | undefined;
  /** Custom click callback for custom-rendered cards. */
  private _customClickFn: ((cardIndex: number) => void) | undefined;

  // Drag-and-drop state
  private _dragEnabled: boolean = false;
  private _dragValidator: ((sourceRange: DragSourceRange, targetPileIndex: number) => boolean) | null = null;
  private _dragSourceRange: DragSourceRange | null = null;
  private _dragStartX: number = 0;
  private _dragStartY: number = 0;
  private _isDragging: boolean = false;
  private _originalPositions: { x: number; y: number }[] = [];
  private _currentTargetPileIndex: number | null = null;
  private _dragLiftOffset: number = -8;
  private _dimTint: number = 0x888888;
  private static readonly DRAG_THRESHOLD: number = 5;

  // Events — lightweight listener map
  private listeners: Map<keyof HandViewEvents, Set<EventCallback>> = new Map();

  // ── Constructor ─────────────────────────────────────────

  constructor(scene: Phaser.Scene, opts: HandViewOptions) {
    this.scene = scene;
    this.baseX = opts.baseX;
    this.baseY = opts.baseY;
    this.spacing = opts.spacing ?? 20;
    this.cardWidth = opts.cardWidth ?? CARD_W;
    this.maxWidth = opts.maxWidth;
    this.arcRadius = Math.max(0, opts.arcRadius ?? 0);
    this.showLabels = opts.showLabels ?? true;
    this.selectionEnabled = opts.selectionEnabled ?? true;
    this.clickEnabled = opts.clickEnabled ?? true;
    this._reducedMotion = opts.reducedMotion ?? false;
    this.maxRotationDegrees = opts.maxRotationDegrees ?? 25;
    this.layoutDirection = opts.layoutDirection ?? 'horizontal';
    this._centerX = opts.centerX;
    this._customTextureFn = opts.cardTextureFn;
    this._cardType = opts.cardTextureFn ? 'custom' : 'standard';
    this._renderCardFn = opts.renderCard;
    this._customHoverFn = opts.customHoverFn;
    this._customClickFn = opts.customClickFn;
    // If renderCard is provided, also set cardType to 'custom'
    // so that the existing texture resolution path is bypassed.
    if (opts.renderCard) {
      this._cardType = 'custom';
    }
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Replace all cards in the hand, rebuilding sprites from scratch.
   * Clears existing selection.
   */
  setCards(cards: Card[], _opts?: { cardTextureFn?: CardTextureResolver }): void {
    if (_opts?.cardTextureFn) {
      this._customTextureFn = _opts.cardTextureFn;
      this._cardType = 'custom';
    }
    this.cards = [...cards];
    this.cards = [...cards];
    this.selectedIndex = null;
    this.rebuildDisplay();
  }

  /**
   * Return a shallow copy of the current hand cards.
   */
  getCards(): Card[] {
    return [...this.cards];
  }

  /**
   * Update the custom texture resolver at runtime (e.g. when switching
   * from standard cards to MindCard rendering mid-game).
   */
  setCardTextureFn(fn: CardTextureResolver): void {
    this._customTextureFn = fn;
    this._cardType = 'custom';
  }

  /**
   * Set a custom card renderer at runtime.
   *
   * When provided, HandView calls this function for each card instead of
   * creating a default Image sprite. Call {@link rebuildDisplay} after
   * setting this to apply the new renderer to the current hand.
   */
  setRenderCard(fn: RenderCardFn): void {
    this._renderCardFn = fn;
    this._cardType = 'custom';
  }

  /**
   * Clear the custom card renderer, reverting to default Image sprite creation.
   */
  clearRenderCard(): void {
    this._renderCardFn = undefined;
    this._cardType = this._customTextureFn ? 'custom' : 'standard';
  }

  /**
   * Add a card to the end of the hand.
   *
   * The caller is responsible for playing deal/discard animations
   * externally. This method simply adds the card to the model and
   * rebuilds the display (or just appends the new sprite).
   */
  addCard(card: Card, _opts: AddCardOptions = {}): void {
    this.cards.push(card);
    this.rebuildDisplay();
    this.emit('selectionchange', this.selectedIndex);
  }

  /**
   * Animate a card entering the hand with a dealing animation, then
   * integrate it into the hand model and display on completion.
   *
   * The destination is computed using HandView's own layout algorithm
   * (same as {@link computeCardPositions}) so the animation exactly
   * matches where the card will appear. This avoids the mismatch that
   * occurs when callers duplicate layout math externally.
   *
   * In reduced-motion mode, the card is placed instantly (no animation)
   * and the returned Promise resolves synchronously.
   *
   * @param card   - The card to add.
   * @param options - Animation options including source position and timing.
   * @returns A Promise that resolves when the animation completes and the
   *          card is fully integrated into the hand model and display.
   */
  async animateAddCard(card: Card, options: AnimateAddCardOptions): Promise<void> {
    const insertIndex = options.insertAtIndex ?? this.cards.length;
    const newCount = this.cards.length + 1;

    // ── Compute destination (same layout logic as computeCardPositions) ──
    let destX: number;
    let destY: number;

    if (this.layoutDirection === 'vertical') {
      destX = this.baseX;
      destY = this.baseY + insertIndex * this.spacing;
    } else {
      const gap = this.spacing - this.cardWidth;
      const centerX = this._centerX ?? (this.baseX + (newCount - 1) * this.spacing / 2);

      const { positions } = layoutCardPositions({
        count: newCount,
        cardWidth: this.cardWidth,
        gap,
        centerX,
        maxWidth: this.maxWidth,
      });

      destX = positions[insertIndex];

      if (this.arcRadius <= 0 || newCount < 3) {
        destY = this.baseY;
      } else {
        const first = positions[0];
        const last = positions[positions.length - 1];
        const arcCenterX = (first + last) / 2;
        const halfSpan = Math.max((last - first) / 2, 1);
        const normalized = (destX - arcCenterX) / halfSpan;
        const offsetY = ((1 - normalized * normalized) * halfSpan * halfSpan) / (2 * this.arcRadius);
        destY = this.baseY - offsetY;
      }
    }

    // ── Reduced motion: instant placement ──
    if (this._reducedMotion) {
      this.cards.splice(insertIndex, 0, card);
      this.rebuildDisplay();
      this.emit('selectionchange', this.selectedIndex);
      return;
    }

    // ── Animated path ──
    return new Promise<void>((resolve) => {
      const animSprite = this.scene.add.image(
        options.sourceX,
        options.sourceY,
        getCardTexture(card),
      );

      // Create a game event emitter to listen for deal completion
      const gameEvents = new GameEventEmitter();
      gameEvents.once('card:dealt', () => {
        try {
          animSprite.destroy();
        } catch {
          // Ignore destroy errors if sprite already cleaned up
        }
        this.cards.splice(insertIndex, 0, card);
        this.rebuildDisplay();
        this.emit('selectionchange', this.selectedIndex);
        resolve();
      });

      // Use a unique card identifier for the deal event.
      // Card.id may not exist on Card data models, so we generate a fallback.
      const cardId = (card as any).id || `${(card as any).rank || '?'}${(card as any).suit || ''}_${Date.now()}`;

      dealCard({
        scene: this.scene,
        target: animSprite,
        destX,
        destY,
        sourceX: options.sourceX,
        sourceY: options.sourceY,
        duration: options.duration,
        arcHeight: options.arcHeight,
        ease: options.ease,
        rotation: options.rotation,
        gameEvents,
        cardId,
      });
    });
  }

  /**
   * Remove a card at the given index and return it.
   *
   * Returns `undefined` if the index is out of bounds.
   * Adjusts the selection index automatically.
   */
  removeCard(index: number, _opts: RemoveCardOptions = {}): Card | undefined {
    if (index < 0 || index >= this.cards.length) return undefined;
    const removed = this.cards.splice(index, 1)[0];

    // Adjust selection index
    if (this.selectedIndex !== null) {
      if (this.selectedIndex === index) {
        this.selectedIndex = null;
      } else if (this.selectedIndex > index) {
        this.selectedIndex--;
      }
    }

    this.rebuildDisplay();
    this.emit('selectionchange', this.selectedIndex);
    return removed;
  }

  /**
   * Sort the hand cards in-place using the provided comparison function,
   * then rebuild the display to reflect the new order.
   *
   * Clears the current selection.
   *
   * @param compareFn - A comparison function following the same contract as
   *                    `Array.prototype.sort`. Receives two Card objects and
   *                    returns a negative number if `a` should come before `b`,
   *                    a positive number if `a` should come after `b`, or 0 if
   *                    they are considered equal.
   *
   * @example
   * ```ts
   * // Sort by rank ascending
   * handView.sortCards((a, b) => a.rank - b.rank);
   *
   * // Sort by suit then rank
   * handView.sortCards((a, b) => {
   *   if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
   *   return a.rank - b.rank;
   * });
   * ```
   */
  sortCards(compareFn: (a: Card, b: Card) => number): void {
    this.cards.sort(compareFn);
    this.selectedIndex = null;
    this.rebuildDisplay();
    this.emit('selectionchange', this.selectedIndex);
  }

  /**
   * Set the selected card index.
   *
   * Pass `null` to clear selection. Visual tints update immediately.
   */
  setSelected(index: number | null): void {
    this.selectedIndex = index;
    this.updateSelectionTints();
    this.emit('selectionchange', this.selectedIndex);
  }

  /**
   * Return the currently selected card index, or null if none.
   *
   * In vertical (cascade) mode, this returns the bottom-most card index
   * of the selection range (cards [0..index] are selected).
   */
  getSelected(): number | null {
    return this.selectedIndex;
  }

  /**
   * Return the cascade selection range, or null if nothing is selected.
   *
   * In vertical mode, clicking card at index `i` selects cards `[0..i]`.
   * Returns `{ from: 0, to: selectedIndex }` or `null` when no selection.
   * In horizontal mode, `{ from: selectedIndex, to: selectedIndex }` or `null`.
   */
  getCascadeRange(): { from: number; to: number } | null {
    if (this.selectedIndex === null) return null;
    if (this.layoutDirection === 'vertical') {
      return { from: 0, to: this.selectedIndex };
    }
    return { from: this.selectedIndex, to: this.selectedIndex };
  }

  // ── Drag-and-drop API ──────────────────────────────────

  /**
   * Enable or disable drag-and-drop on this HandView.
   * When disabled, pointer events behave as before (click-to-select only).
   */
  setDragEnabled(enabled: boolean): void {
    this._dragEnabled = enabled;
  }

  /**
   * Whether drag-and-drop is currently enabled.
   */
  getDragEnabled(): boolean {
    return this._dragEnabled;
  }

  /**
   * Register a validator callback for drag operations.
   *
   * The validator is called on drag end with the source range and target pile index.
   * Return `true` to accept the drop, `false` to reject (triggers snap-back).
   *
   * Pass `null` to clear the validator.
   */
  setDragValidator(
    validator: ((sourceRange: DragSourceRange, targetPileIndex: number) => boolean) | null,
  ): void {
    this._dragValidator = validator;
  }

  /**
   * Set the current target pile index for an in-progress drag.
   *
   * Renderers should call this during dragmove processing, after hit-testing
   * the pointer position against their pile zones. This value is passed to
   * the validator and emitted in the dragend event.
   */
  setDragTargetPileIndex(index: number | null): void {
    this._currentTargetPileIndex = index;
  }

  /**
   * Set arc radius for hand layout.
   * `0` means straight horizontal layout at `baseY`.
   */
  setArcRadius(radius: number): void {
    const next = Number.isFinite(radius) ? Math.max(0, radius) : 0;
    if (next === this.arcRadius) return;
    this.arcRadius = next;
    this.applyLayout();
  }

  /** Current arc radius used for layout. */
  getArcRadius(): number {
    return this.arcRadius;
  }

  /**
   * Set the layout direction at runtime.
   *
   * When switching between horizontal and vertical mode, the display is
   * rebuilt immediately. Existing selection is preserved (but reinterpreted
   * for cascade selection when switching to vertical).
   */
  setLayoutDirection(direction: 'horizontal' | 'vertical'): void {
    if (direction === this.layoutDirection) return;
    this.layoutDirection = direction;
    this.rebuildDisplay();
  }

  /** Current layout direction. */
  getLayoutDirection(): 'horizontal' | 'vertical' {
    return this.layoutDirection;
  }

  /**
   * Update the base X position used for card layout.
   * Does not trigger a full rebuild — calls applyLayout to reposition sprites.
   */
  setBaseX(x: number): void {
    this.baseX = x;
    this.applyLayout();
  }

  /**
   * Set the fixed horizontal centre for hand layout.
   *
   * When set, the hand is centred on this X coordinate regardless of
   * spacing or hand-size changes. Pass `undefined` to restore the
   * original baseX-derived centre calculation.
   *
   * Has no effect in vertical (cascade) mode — call {@link setBaseX}
   * directly for vertical layout positioning.
   *
   * @param x - Fixed horizontal centre, or undefined to clear.
   */
  setCenterX(x: number | undefined): void {
    this._centerX = x;
    this.applyLayout();
  }

  /**
   * Update the base Y position used for card layout.
   * In horizontal mode this is the row's Y; in vertical mode this is the top card's Y.
   * Does not trigger a full rebuild — calls applyLayout to reposition sprites.
   */
  setBaseY(y: number): void {
    this.baseY = y;
    this.applyLayout();
  }

  /**
   * Set the horizontal centre-to-centre spacing (in pixels) used when
   * laying out cards. Accepts integer or floating values; values below
   * a sensible minimum are clamped to avoid degenerate layouts. When
   * updated the visible sprite positions are updated via applyLayout().
   *
   * Note: spacing is the centre-to-centre distance — when spacing <
   * cardWidth the computed `gap = spacing - cardWidth` will be
   * negative, allowing card overlap.
   */
  setSpacing(spacing: number): void {
    const next = Number.isFinite(spacing) ? spacing : this.spacing;
    // Protect against absurdly small values; 25% of cardWidth is a
    // reasonable lower bound and complements the Gym slider bounds.
    const min = Math.max(1, Math.round(this.cardWidth * 0.25));
    const clamped = Math.max(min, next);
    if (clamped === this.spacing) return;
    this.spacing = clamped;
    this.applyLayout();
  }

  /** Current spacing (px) used between card centres. */
  getSpacing(): number {
    return this.spacing;
  }

  /**
   * Set the maximum rotation in degrees applied to cards based on their
   * horizontal offset from the hand centre. A value of 0 disables tilt.
   */
  setMaxRotationDegrees(maxDegrees: number): void {
    const next = Number.isFinite(maxDegrees) ? Math.max(0, maxDegrees) : 0;
    if (next === this.maxRotationDegrees) return;
    this.maxRotationDegrees = next;
    this.applyLayout();
  }

  /** Current maximum rotation (degrees). */
  getMaxRotationDegrees(): number {
    return this.maxRotationDegrees;
  }

  /**
   * Register an event callback.
   *
   * Supported events:
   * - `'cardclick'` — `(index: number)` fired when a card sprite is clicked.
   * - `'selectionchange'` — `(index: number | null)` fired when selection changes.
   */
  on(event: keyof HandViewEvents, cb: EventCallback): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
  }

  /**
   * Remove an event callback.
   */
  off(event: keyof HandViewEvents, cb: EventCallback): void {
    this.listeners.get(event)?.delete(cb);
  }

  /**
   * Set the reduced-motion preference. When true, all animations
   * will be instant.
   */
  setReducedMotion(value: boolean): void {
    this._reducedMotion = value;
  }

  /**
   * Whether reduced motion is currently enabled.
   */
  get reducedMotion(): boolean {
    return this._reducedMotion;
  }

  /**
   * Return the display object for a card at the given index, or undefined.
   *
   * When using the default sprite creation path, the returned object is
   * a `Phaser.GameObjects.Image`. When a custom {@link renderCard}
   * callback is used, the returned object is whatever the callback
   * returned (e.g. a {@link Phaser.GameObjects.Container}).
   *
   * @param index - The card index.
   * @returns The card's display object, or `undefined` if out of bounds.
   */
  getSpriteAt(index: number): Phaser.GameObjects.GameObject | undefined {
    return this.sprites[index];
  }

  /**
   * Return all card display objects.
   *
   * When using the default sprite creation path, the returned objects are
   * `Phaser.GameObjects.Image` instances. When a custom {@link renderCard}
   * callback is used, the returned objects are whatever the callback
   * returned (e.g. {@link Phaser.GameObjects.Container}s).
   *
   * @returns A shallow copy of all card display objects.
   */
  getSprites(): Phaser.GameObjects.GameObject[] {
    return [...this.sprites];
  }

  /**
   * Return current sprite centers in display order.
   */
  getCardCenters(): Array<{ x: number; y: number }> {
    return this.sprites.map((sprite) => ({ x: (sprite as any).x, y: (sprite as any).y }));
  }

  /**
   * Destroy all sprites, labels, and event listeners.
   */
  destroy(): void {
    this.destroyed = true;
    this.clearDisplay();
    this.cards = [];
    this.selectedIndex = null;
    this.listeners.clear();
  }

  // ── Internal ────────────────────────────────────────────

  /** Emit an event to all registered listeners. */
  private emit(event: keyof HandViewEvents, ...args: any[]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) {
        cb(...args);
      }
    }
  }

  /** Clear and recreate all card sprites and labels. */
  private rebuildDisplay(): void {
    this.clearDisplay();

    if (this.cards.length === 0) return;

    const positions = this.computeCardPositions();

    // Precompute rotation helpers for horizontal mode (centre and half-span)
    // so rotation is proportional to horizontal offset from the hand centre.
    const firstX = positions[0].x;
    const lastX = positions[positions.length - 1].x;
    const arcCenterX = (firstX + lastX) / 2;
    const halfSpan = Math.max((lastX - firstX) / 2, 1);

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      const sprite = this.createCardSprite(card, i, positions[i], arcCenterX, halfSpan);
      this.sprites.push(sprite);

      if (!this._renderCardFn) {
        // Default Image sprite path — attach hover and click handlers
        this.attachDefaultInteractionHandlers(sprite as unknown as Phaser.GameObjects.Image, i);
      } else {
        // Custom render path — attach optional custom hover/click handlers
        if (this._customHoverFn) {
          (sprite as any).on('pointerover', () => {
            this._customHoverFn!(sprite);
          });
          (sprite as any).on('pointerout', () => {
            this.updateSelectionTints();
          });
        }
        if (this._customClickFn) {
          (sprite as any).on('pointerdown', () => {
            this._customClickFn!(i);
          });
        }
      }

      if (this.showLabels && !this._renderCardFn) {
        this.addCardLabel(card, i, positions[i], sprite);
      }
    }
  }

  /**
   * Create a card display object for the given card at the given position.
   *
   * Uses the custom {@link renderCard} callback if provided, otherwise
   * creates a default Image sprite from the card's texture key.
   */
  private createCardSprite(
    card: Card,
    index: number,
    pos: { x: number; y: number },
    arcCenterX: number,
    halfSpan: number,
  ): Phaser.GameObjects.GameObject {
    if (this._renderCardFn) {
      // Custom rendering path — caller provides the full card object
      const isSelected = this.layoutDirection === 'vertical' && this.selectedIndex !== null
        ? index <= this.selectedIndex
        : index === this.selectedIndex;
      const cardObj = this._renderCardFn(card, index, isSelected);
      // Position the returned object at the computed layout position
      (cardObj as any).x = pos.x;
      (cardObj as any).y = pos.y;
      return cardObj;
    }

    // Default Image sprite creation path
    const textureKey = this._cardType === 'custom' && this._customTextureFn
      ? this._customTextureFn(card, index)
      : getCardTexture(card);
    const sprite = this.scene.add.image(pos.x, pos.y, textureKey);

    // Apply initial per-card rotation based on horizontal offset (horizontal mode only)
    if (this.layoutDirection === 'horizontal' && this.maxRotationDegrees !== 0) {
      const normalized = (pos.x - arcCenterX) / halfSpan;
      const rotDeg = this.maxRotationDegrees * normalized;
      (sprite as any).rotation = (rotDeg * Math.PI) / 180;
    }

    if (this.clickEnabled || this.selectionEnabled) {
      sprite.setInteractive({ useHandCursor: true });
    }

    return sprite;
  }

  /**
   * Attach default hover and click handlers to a default Image sprite.
   *
   * These handlers apply selection tint, hover tint, and emit events
   * that downstream code (e.g. game logic, drag-and-drop) can respond to.
   */
  private attachDefaultInteractionHandlers(
    sprite: Phaser.GameObjects.Image,
    index: number,
  ): void {
    if (this.clickEnabled || this.selectionEnabled) {
      sprite.setInteractive({ useHandCursor: true });
    }

    // Capture index for closures
    const idx = index;

    // Click handler (also initiates drag when enabled)
    if (this.clickEnabled) {
      sprite.on('pointerdown', (pointer: any) => {
        if (this.selectionEnabled) {
          this.selectedIndex = idx;
          this.updateSelectionTints();
        }
        this.emit('cardclick', idx);

        // Drag initiation — record state but don't start dragging yet
        if (this._dragEnabled) {
          this._cleanupDrag();
          this._dragSourceRange = this._computeDragRange(idx);
          this._dragStartX = pointer.x;
          this._dragStartY = pointer.y;
          this._isDragging = false;
          this._originalPositions = [];

          // Register scene-level handlers for pointer movement tracking
          const sceneInput = (this.scene as any).input;
          if (sceneInput && typeof sceneInput.on === 'function') {
            sceneInput.on('pointermove', this._boundPointerMove);
            sceneInput.on('pointerup', this._boundPointerUp);
          }
        }
      });
    }

    // Hover visual feedback
    sprite.on('pointerover', () => {
      sprite.setTint(0x66ff66);
    });
    sprite.on('pointerout', () => {
      const isSelected = this.layoutDirection === 'vertical' && this.selectedIndex !== null
        ? idx <= this.selectedIndex
        : idx === this.selectedIndex;
      sprite.setTint(isSelected ? 0x88ff88 : 0xffffff);
    });
  }

  /**
   * Add a rank/suit label for a card sprite.
   */
  private addCardLabel(
    card: Card,
    index: number,
    pos: { x: number; y: number },
    sprite: Phaser.GameObjects.GameObject,
  ): void {
    const isSelected = this.layoutDirection === 'vertical' && this.selectedIndex !== null
      ? index <= this.selectedIndex
      : index === this.selectedIndex;

    // In vertical mode, position label to the right of the card to avoid overlap
    const labelX = this.layoutDirection === 'vertical'
      ? pos.x + this.cardWidth / 2 + 8
      : pos.x;
    const labelY = this.layoutDirection === 'vertical'
      ? pos.y
      : pos.y + 42;
    const label = this.scene.add.text(labelX, labelY, `${card.rank}${card.suit}`, {
      fontSize: '9px',
      color: isSelected ? '#88ff88' : '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.labels.push(label);

    // Apply selection tint (default Image sprite path only)
    (sprite as any).setTint(isSelected ? 0x88ff88 : 0xffffff);
  }

  /** Compute current hand card center positions (x/y). */
  private computeCardPositions(): Array<{ x: number; y: number }> {
    if (this.cards.length === 0) return [];

    // ── Vertical (cascade) layout ──
    if (this.layoutDirection === 'vertical') {
      return this.cards.map((_, i) => ({
        x: this.baseX,
        y: this.baseY + i * this.spacing,
      }));
    }

    // ── Horizontal layout ──
    const gap = this.spacing - this.cardWidth;
    const centerX = this._centerX ?? (this.baseX + (this.cards.length - 1) * this.spacing / 2);

    const { positions } = layoutCardPositions({
      count: this.cards.length,
      cardWidth: this.cardWidth,
      gap,
      centerX,
      maxWidth: this.maxWidth,
    });

    const xs = positions.length > 0
      ? positions
      : this.cards.map((_, i) => this.baseX + i * this.spacing);

    if (this.arcRadius <= 0 || xs.length < 3) {
      return xs.map((x) => ({ x, y: this.baseY }));
    }

    const first = xs[0];
    const last = xs[xs.length - 1];
    const arcCenterX = (first + last) / 2;
    const halfSpan = Math.max((last - first) / 2, 1);

    return xs.map((x) => {
      const normalized = (x - arcCenterX) / halfSpan;
      // Inverted arc: central card should be at the highest point while edges remain at baseY.
      // Use a parabolic profile that peaks at normalized=0 and falls to zero at normalized=±1.
      const offsetY = ((1 - normalized * normalized) * halfSpan * halfSpan) / (2 * this.arcRadius);
      return { x, y: this.baseY - offsetY };
    });
  }

  /** Apply current layout to existing display objects. */
  private applyLayout(): void {
    if (this.sprites.length === 0 || this.cards.length === 0) return;

    const positions = this.computeCardPositions();

    // Precompute rotation helpers for horizontal mode
    const firstX = positions[0].x;
    const lastX = positions[positions.length - 1].x;
    const arcCenterX = (firstX + lastX) / 2;
    const halfSpan = Math.max((lastX - firstX) / 2, 1);

    for (let i = 0; i < this.sprites.length && i < positions.length; i++) {
      const sprite = this.sprites[i];
      const pos = positions[i];
      (sprite as any).x = pos.x;
      (sprite as any).y = pos.y;

      // Apply per-card rotation (horizontal mode only)
      if (this.layoutDirection === 'horizontal' && this.maxRotationDegrees !== 0) {
        const normalized = (pos.x - arcCenterX) / halfSpan;
        const rotDeg = this.maxRotationDegrees * normalized;
        (sprite as any).rotation = (rotDeg * Math.PI) / 180;
      } else if (this.layoutDirection === 'vertical') {
        (sprite as any).rotation = 0;
      }

      if (i < this.labels.length) {
        const label = this.labels[i];
        // In vertical mode, position label to the right of the card
        if (this.layoutDirection === 'vertical') {
          (label as any).x = pos.x + this.cardWidth / 2 + 8;
          (label as any).y = pos.y;
        } else {
          (label as any).x = pos.x;
          (label as any).y = pos.y + 42;
        }
      }
    }
  }

  /** Clear all sprites and labels from the scene. */
  private clearDisplay(): void {
    for (const s of this.sprites) {
      try { s.destroy(); } catch (_) { /* ignore */ }
    }
    for (const l of this.labels) {
      try { l.destroy(); } catch (_) { /* ignore */ }
    }
    this.sprites = [];
    this.labels = [];
  }

  /** Update visual selection tint on all sprites. */
  private updateSelectionTints(): void {
    // Custom-rendered cards manage their own selection visuals
    if (this._renderCardFn) return;
    const isVertical = this.layoutDirection === 'vertical';
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      if (!sprite || !sprite.active) continue;
      // In vertical (cascade) mode, selecting index i selects the range [0..i]
      const isSelected = isVertical && this.selectedIndex !== null
        ? i <= this.selectedIndex
        : i === this.selectedIndex;
      (sprite as any).setTint(isSelected ? 0x88ff88 : 0xffffff);

      // Update label colour
      if (i < this.labels.length) {
        const label = this.labels[i];
        if (label && label.active) {
          label.setColor(isSelected ? '#88ff88' : '#aaaaaa');
        }
      }
    }
  }

  // ── Drag helpers ─────────────────────────────────────────

  /** Clean up any in-progress drag state. */
  private _cleanupDrag(): void {
    const sceneInput = (this.scene as any).input;
    if (sceneInput && typeof sceneInput.off === 'function') {
      sceneInput.off('pointermove', this._boundPointerMove);
      sceneInput.off('pointerup', this._boundPointerUp);
    }
    // If we were mid-drag, restore positions
    if (this._isDragging && this._dragSourceRange && this._originalPositions.length > 0) {
      this._animateSnapBack();
    }
    this._dragSourceRange = null;
    this._isDragging = false;
    this._currentTargetPileIndex = null;
    this._originalPositions = [];
  }

  /** Compute the drag source range for a clicked card index. */
  private _computeDragRange(index: number): DragSourceRange {
    if (this.layoutDirection === 'vertical') {
      return { from: 0, to: index };
    }
    return { from: index, to: index };
  }

  /** Store current sprite positions before drag visuals are applied. */
  private _storeOriginalPositions(): void {
    this._originalPositions = [];
    if (!this._dragSourceRange) return;
    for (let i = this._dragSourceRange.from; i <= this._dragSourceRange.to; i++) {
      const sprite = this.sprites[i];
      if (sprite) {
        this._originalPositions.push({ x: (sprite as any).x, y: (sprite as any).y });
      }
    }
  }

  /** Apply visual lift + dim effects when a drag starts. */
  private _applyDragVisuals(): void {
    if (!this._dragSourceRange) return;
    const { from, to } = this._dragSourceRange;

    // Lift selected cards (Y offset)
    for (let i = from; i <= to; i++) {
      const sprite = this.sprites[i];
      if (sprite && sprite.active) {
        (sprite as any).y += this._dragLiftOffset;
      }
    }

    // Dim unselected cards above drag handle (only meaningful in vertical mode)
    if (this.layoutDirection === 'vertical') {
      for (let i = 0; i < from; i++) {
        const sprite = this.sprites[i];
        if (sprite && sprite.active) {
          (sprite as any).setTint(this._dimTint);
        }
      }
    }
  }

  /** Reset visual lift + dim and restore selection tints. */
  private _resetDragVisuals(): void {
    this.updateSelectionTints();
  }

  /** Move dragged sprites relative to pointer delta from drag start. */
  private _moveDragSprites(pointerX: number, pointerY: number): void {
    if (!this._dragSourceRange || this._originalPositions.length === 0) return;
    const { from, to } = this._dragSourceRange;

    const dx = pointerX - this._dragStartX;
    const dy = pointerY - this._dragStartY;

    for (let i = 0; i <= to - from; i++) {
      const spriteIdx = from + i;
      const sprite = this.sprites[spriteIdx];
      if (sprite && sprite.active && this._originalPositions[i]) {
        (sprite as any).x = this._originalPositions[i].x + dx;
        (sprite as any).y = this._originalPositions[i].y + this._dragLiftOffset + dy;
      }
    }
  }

  /** Animate dragged cards back to original positions (snap-back on rejection). */
  private _animateSnapBack(): void {
    if (!this._dragSourceRange || this._originalPositions.length === 0) return;
    const { from, to } = this._dragSourceRange;

    for (let i = 0; i <= to - from; i++) {
      const spriteIdx = from + i;
      const sprite = this.sprites[spriteIdx];
      if (sprite && sprite.active && this._originalPositions[i]) {
        const targetX = this._originalPositions[i].x;
        const targetY = this._originalPositions[i].y;

        if (this._reducedMotion) {
          (sprite as any).x = targetX;
          (sprite as any).y = targetY;
        } else {
          this.scene.tweens.add({
            targets: sprite as any,
            x: targetX,
            y: targetY,
            duration: 200,
            ease: 'Power2',
          });
        }
      }
    }
  }

  /** Remove lift offset on drag acceptance. */
  private _animateDragAccept(): void {
    if (!this._dragSourceRange || this._originalPositions.length === 0) return;
    const { from, to } = this._dragSourceRange;

    for (let i = 0; i <= to - from; i++) {
      const spriteIdx = from + i;
      const sprite = this.sprites[spriteIdx];
      if (sprite && sprite.active && this._originalPositions[i]) {
        const targetY = (sprite as any).y - this._dragLiftOffset;

        if (this._reducedMotion) {
          (sprite as any).y = targetY;
        } else {
          this.scene.tweens.add({
            targets: sprite as any,
            y: targetY,
            duration: 150,
            ease: 'Power2',
          });
        }
      }
    }
  }

  /** Scene-level pointermove handler (arrow = bound to instance). */
  private _boundPointerMove = (pointer: any): void => {
    if (!this._dragEnabled || !this._dragSourceRange) return;

    const dx = pointer.x - this._dragStartX;
    const dy = pointer.y - this._dragStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!this._isDragging) {
      if (dist < HandView.DRAG_THRESHOLD) return;
      // Threshold exceeded — start drag
      this._isDragging = true;
      this._storeOriginalPositions();
      this._applyDragVisuals();
      this.emit('dragstart', this._dragSourceRange);
    }

    this._moveDragSprites(pointer.x, pointer.y);
    this.emit('dragmove', {
      sourceRange: this._dragSourceRange,
      x: pointer.x,
      y: pointer.y,
    });
  };

  /** Scene-level pointerup handler (arrow = bound to instance). */
  private _boundPointerUp = (): void => {
    // Unregister scene handlers
    const sceneInput = (this.scene as any).input;
    if (sceneInput && typeof sceneInput.off === 'function') {
      sceneInput.off('pointermove', this._boundPointerMove);
      sceneInput.off('pointerup', this._boundPointerUp);
    }

    if (this._isDragging && this._dragSourceRange) {
      const targetPileIndex = this._currentTargetPileIndex;
      let accepted = false;

      if (targetPileIndex !== null && this._dragValidator) {
        accepted = this._dragValidator(this._dragSourceRange, targetPileIndex);
      }

      if (accepted) {
        this._animateDragAccept();
      } else {
        this._animateSnapBack();
      }

      this.emit('dragend', {
        sourceRange: this._dragSourceRange,
        targetPileIndex,
        accepted,
      });

      this._resetDragVisuals();
    }

    this._dragSourceRange = null;
    this._isDragging = false;
    this._currentTargetPileIndex = null;
    this._originalPositions = [];
  };
}
