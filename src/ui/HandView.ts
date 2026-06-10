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
   * Custom texture resolver for non-standard card models (e.g. MindCard
   * with numeric `value` instead of `rank`/`suit`). When provided,
   * this function is called instead of `getCardTexture()` to determine
   * the texture key for each card.
   */
  cardTextureFn?: CardTextureResolver;
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

/** Options for the {@link HandView.removeCard} method. */
export interface RemoveCardOptions {
  /** Whether to animate the card leaving the hand. @default false */
  animate?: boolean;

  /** Duration in ms for discard animation. Only used when animate=true. */
  duration?: number;
}

/** Event map for {@link HandView}. */
export interface HandViewEvents {
  /** Fired when a card sprite is clicked. Payload: card index. */
  cardclick: number;

  /** Fired when the selection changes. Payload: new selected index or null. */
  selectionchange: number | null;
}

// ── Implementation ───────────────────────────────────────────

type EventCallback = (...args: any[]) => void;

/**
 * Reusable hand-of-cards display component.
 *
 * Manages a row of card sprites laid out horizontally, with optional
 * selection highlighting and click events. The component does not
 * own the Card data — callers mutate their own array and call
 * {@link setCards} or {@link addCard}/{@link removeCard} to sync
 * the visual state.
 *
 * ### Example
 * ```ts
 * const handView = new HandView(scene, { baseX: 60, baseY: 130, spacing: 20 });
 * handView.setCards(myHand);
 * handView.on('cardclick', (idx) => handView.setSelected(idx));
 * // Later:
 * handView.addCard(drawnCard, { animate: true, sourceX: 500, sourceY: 150 });
 * handView.destroy();
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

  /** Maximum rotation (degrees) applied proportionally based on card offset from centre. */
  private maxRotationDegrees: number = 0;

  // State
  private cards: Card[] = [];
  private selectedIndex: number | null = null;
  private _cardType: 'standard' | 'custom' = 'standard';

  // Display objects
  private sprites: Phaser.GameObjects.Image[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  /** Custom texture function (used for non-standard card models like MindCard). */
  private _customTextureFn: CardTextureResolver | undefined;

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
    this._customTextureFn = opts.cardTextureFn;
    this._cardType = opts.cardTextureFn ? 'custom' : 'standard';
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
   */
  getSelected(): number | null {
    return this.selectedIndex;
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
   * Return the sprite for a card at the given index, or undefined.
   */
  getSpriteAt(index: number): Phaser.GameObjects.Image | undefined {
    return this.sprites[index];
  }

  /**
   * Return all card sprites.
   */
  getSprites(): Phaser.GameObjects.Image[] {
    return [...this.sprites];
  }

  /**
   * Return current sprite centers in display order.
   */
  getCardCenters(): Array<{ x: number; y: number }> {
    return this.sprites.map((sprite) => ({ x: sprite.x, y: sprite.y }));
  }

  /**
   * Destroy all sprites, labels, and event listeners.
   */
  destroy(): void {
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

    // Precompute rotation helpers (centre and half-span) so rotation is
    // proportional to horizontal offset from the hand centre.
    const firstX = positions[0].x;
    const lastX = positions[positions.length - 1].x;
    const arcCenterX = (firstX + lastX) / 2;
    const halfSpan = Math.max((lastX - firstX) / 2, 1);

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      const textureKey = this._cardType === 'custom' && this._customTextureFn
        ? this._customTextureFn(card, i)
        : getCardTexture(card);
      const sprite = this.scene.add.image(positions[i].x, positions[i].y, textureKey);

      // Apply initial per-card rotation based on horizontal offset
      if (this.maxRotationDegrees !== 0) {
        const normalized = (positions[i].x - arcCenterX) / halfSpan;
        const rotDeg = this.maxRotationDegrees * normalized;
        sprite.rotation = (rotDeg * Math.PI) / 180;
      }

      if (this.clickEnabled || this.selectionEnabled) {
        sprite.setInteractive({ useHandCursor: true });
      }

      // Capture index for closures
      const idx = i;

      // Click handler
      if (this.clickEnabled) {
        sprite.on('pointerdown', () => {
          if (this.selectionEnabled) {
            this.selectedIndex = idx;
            this.updateSelectionTints();
          }
          this.emit('cardclick', idx);
        });
      }

      // Hover visual feedback
      sprite.on('pointerover', () => {
        sprite.setTint(0x66ff66);
      });
      sprite.on('pointerout', () => {
        sprite.setTint(idx === this.selectedIndex ? 0x88ff88 : 0xffffff);
      });

      // Selection tint
      sprite.setTint(i === this.selectedIndex ? 0x88ff88 : 0xffffff);

      this.sprites.push(sprite);

      if (this.showLabels) {
        const label = this.scene.add.text(positions[i].x, positions[i].y + 42, `${card.rank}${card.suit}`, {
          fontSize: '9px',
          color: i === this.selectedIndex ? '#88ff88' : '#aaaaaa',
          fontFamily: 'monospace',
        }).setOrigin(0.5);
        this.labels.push(label);
      }
    }
  }

  /** Compute current hand card center positions (x/y). */
  private computeCardPositions(): Array<{ x: number; y: number }> {
    if (this.cards.length === 0) return [];

    const gap = this.spacing - this.cardWidth;
    const centerX = this.baseX + (this.cards.length - 1) * this.spacing / 2;

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

    // Precompute rotation helpers (centre and half-span) so rotation is
    // proportional to horizontal offset from the hand centre.
    const firstX = positions[0].x;
    const lastX = positions[positions.length - 1].x;
    const arcCenterX = (firstX + lastX) / 2;
    const halfSpan = Math.max((lastX - firstX) / 2, 1);

    for (let i = 0; i < this.sprites.length && i < positions.length; i++) {
      const sprite = this.sprites[i];
      const pos = positions[i];
      (sprite as any).x = pos.x;
      (sprite as any).y = pos.y;

      // Apply per-card rotation (radians) proportional to horizontal offset
      if (this.maxRotationDegrees !== 0) {
        const normalized = (pos.x - arcCenterX) / halfSpan;
        const rotDeg = this.maxRotationDegrees * normalized;
        (sprite as any).rotation = (rotDeg * Math.PI) / 180;
      }

      if (i < this.labels.length) {
        const label = this.labels[i];
        (label as any).x = pos.x;
        (label as any).y = pos.y + 42;
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
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      if (!sprite || !sprite.active) continue;
      const isSelected = i === this.selectedIndex;
      sprite.setTint(isSelected ? 0x88ff88 : 0xffffff);

      // Update label colour
      if (i < this.labels.length) {
        const label = this.labels[i];
        if (label && label.active) {
          label.setColor(isSelected ? '#88ff88' : '#aaaaaa');
        }
      }
    }
  }
}