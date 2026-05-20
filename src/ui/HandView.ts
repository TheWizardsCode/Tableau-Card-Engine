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

/** Options for creating a {@link HandView}. */
export interface HandViewOptions {
  /** X coordinate for the leftmost (or centre) card position. */
  baseX: number;

  /** Y coordinate for all cards in the hand. */
  baseY: number;

  /** Horizontal spacing (px) between card centres. @default 56 */
  spacing?: number;

  /** Card width used for layout calculations. @default CARD_W (48) */
  cardWidth?: number;

  /** Maximum row width (px). Cards compress if they exceed this. */
  maxWidth?: number;

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
 * const handView = new HandView(scene, { baseX: 60, baseY: 130, spacing: 56 });
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
  private selectionEnabled: boolean;
  private clickEnabled: boolean;
  private _reducedMotion: boolean;

  // State
  private cards: Card[] = [];
  private selectedIndex: number | null = null;

  // Display objects
  private sprites: Phaser.GameObjects.Image[] = [];
  private labels: Phaser.GameObjects.Text[] = [];

  // Events — lightweight listener map
  private listeners: Map<keyof HandViewEvents, Set<EventCallback>> = new Map();

  // ── Constructor ─────────────────────────────────────────

  constructor(scene: Phaser.Scene, opts: HandViewOptions) {
    this.scene = scene;
    this.baseX = opts.baseX;
    this.baseY = opts.baseY;
    this.spacing = opts.spacing ?? 56;
    this.cardWidth = opts.cardWidth ?? CARD_W;
    this.maxWidth = opts.maxWidth;
    this.selectionEnabled = opts.selectionEnabled ?? true;
    this.clickEnabled = opts.clickEnabled ?? true;
    this._reducedMotion = opts.reducedMotion ?? false;
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Replace all cards in the hand, rebuilding sprites from scratch.
   * Clears existing selection.
   */
  setCards(cards: Card[]): void {
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

    // Compute layout positions using shared layout helper
    const gap = this.spacing - this.cardWidth;
    const centerX = this.baseX + (this.cards.length - 1) * this.spacing / 2;

    const { positions } = layoutCardPositions({
      count: this.cards.length,
      cardWidth: this.cardWidth,
      gap: Math.max(0, gap),
      centerX,
      maxWidth: this.maxWidth,
    });

    // If layoutCardPositions returned empty, fall back to simple linear layout
    const xs = positions.length > 0
      ? positions
      : this.cards.map((_, i) => this.baseX + i * this.spacing);

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      const textureKey = getCardTexture(card);
      const sprite = this.scene.add.image(xs[i], this.baseY, textureKey);

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

      // Card label
      const label = this.scene.add.text(xs[i], this.baseY + 42, `${card.rank}${card.suit}`, {
        fontSize: '9px',
        color: i === this.selectedIndex ? '#88ff88' : '#aaaaaa',
        fontFamily: 'monospace',
      }).setOrigin(0.5);

      this.sprites.push(sprite);
      this.labels.push(label);
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