/**
 * ResourceHud — reusable HUD row for a game-declared resource set.
 *
 * A game declares its resource keys (and, optionally, display labels); the
 * component renders **exactly one labelled item per declared key**, in
 * declaration order, showing the key's display label and its current value
 * from the caller's resource bag. No resource key, label, order or value is
 * hard-coded here: the declaration is plain data, the same "plain options
 * object" shape as `HintBar` and `TokenPileView`.
 *
 * The caller positions the HUD at an SLL-resolved point (`anchorPoint()`) and
 * picks the alignment that point implies: `left` grows right from the anchor,
 * `centre` centres the block on it, and `right` ends the block at it — the
 * Gym's `statusBar.resources` surface is right-aligned (`setOrigin(1, 0.5)`).
 * Alignment is applied with the container's origin, so Phaser aligns by the
 * items' real rendered bounds.
 *
 * ## Scope
 *
 * This slice renders the declared set only. The options object is the stable
 * public contract: `bounds`, `irreversible`, `labels`, `reducedMotion`,
 * `soundManager`, `sfx` and `onChange` are declared here so callers can adopt
 * the component once, and are consumed by the follow-on bounds/marker and
 * update-path slices.
 *
 * `src/ui` is Phaser-bearing and must not import `@story-line`: the resource
 * bag, declared keys, labels and bounds all arrive as plain data (for example
 * from `projection.getResources(state)` and the manifest's `readManifestBounds`
 * output).
 *
 * ## Usage
 *
 * ```ts
 * import { ResourceHud } from '@ui';
 *
 * const hud = new ResourceHud(this, {
 *   x: anchor.x,
 *   y: anchor.y,
 *   align: 'right',
 *   declaredKeys: projection.resources,
 *   resources: projection.getResources(state),
 *   labels: { hull: 'Hull' },
 * });
 * ```
 *
 * @module @ui/ResourceHud
 */

import Phaser from 'phaser';
import { FONT_FAMILY } from './constants';
import { UIComponentBase, mergeDefaults } from './UIComponentBase';

// ── Types ──────────────────────────────────────────────────

/** Horizontal alignment of the rendered block around the SLL anchor point. */
export type ResourceHudAlign = 'left' | 'centre' | 'right';

/** Optional visual styling for a {@link ResourceHud}. */
export interface ResourceHudStyle {
  /** Font size of an item (default: `'14px'`). */
  fontSize?: string;
  /** Font family of an item (default: {@link FONT_FAMILY}). */
  fontFamily?: string;
  /** Text colour of an item (default: `'#d8e0d8'`). */
  color?: string;
  /** Gap in pixels between two items (default: `18`). */
  itemGap?: number;
}

/** Inclusive bounds declared for one resource key (`{ min, max }`). */
export interface ResourceHudBounds {
  /** Inclusive lower bound. */
  readonly min: number;
  /** Inclusive upper bound. */
  readonly max: number;
}

/**
 * The minimal sound seam the HUD's update path plays through.
 *
 * Structural, so a `SoundManager` satisfies it without this module importing
 * the audio implementation (and a test can pass a plain stub).
 */
export interface ResourceHudSoundPlayer {
  /** Play the SFX registered under `key`. */
  play(key: string): unknown;
}

/** Options for constructing a {@link ResourceHud}. */
export interface ResourceHudOptions {
  /** Horizontal anchor X, resolved by SLL (`anchorPoint()`). */
  x: number;
  /** Vertical anchor Y, resolved by SLL (`anchorPoint()`). */
  y: number;
  /** Alignment of the block around the anchor point (default: `'left'`). */
  align?: ResourceHudAlign;
  /** Current resource values, keyed by declared resource key. */
  resources: Readonly<Record<string, number>>;
  /** The declared resource keys, in the order they must render. */
  declaredKeys: readonly string[];
  /**
   * Inclusive per-key bounds, keyed by declared resource key (the manifest's
   * `resources.bounds` read-through). Consumed by the bounds-marker slice.
   */
  bounds?: Readonly<Record<string, ResourceHudBounds>>;
  /**
   * The declared never-restored / loss-bearing keys. Consumed by the
   * irreversible-marker slice.
   */
  irreversible?: readonly string[];
  /**
   * Display-label overrides, keyed by declared resource key. A key with no
   * entry prints as authored, capitalised at most (no invented pluralisation).
   */
  labels?: Readonly<Record<string, string>>;
  /** Caller-resolved reduced-motion flag. Consumed by the update path. */
  reducedMotion?: boolean;
  /** Optional audio sink for value updates. Consumed by the update path. */
  soundManager?: ResourceHudSoundPlayer;
  /** SFX key to play on a value update. Consumed by the update path. */
  sfx?: string;
  /** Called after the HUD's values change. Consumed by the update path. */
  onChange?: (resources: Readonly<Record<string, number>>) => void;
  /** Optional style overrides. */
  style?: ResourceHudStyle;
}

/** One rendered resource item. */
export interface ResourceHudItem {
  /** The declared resource key this item renders. */
  readonly key: string;
  /** The display label (caller override, otherwise the authored key). */
  readonly label: string;
  /** The value read from the supplied resource bag. */
  readonly value: number;
  /** The Phaser text object showing `"<label> <value>"`. */
  readonly text: Phaser.GameObjects.Text;
}

// ── Defaults & helpers ─────────────────────────────────────

/** Default item styling and spacing. */
const RESOURCE_HUD_STYLE_DEFAULTS: Required<ResourceHudStyle> = {
  fontSize: '14px',
  fontFamily: FONT_FAMILY,
  color: '#d8e0d8',
  itemGap: 18,
};

/**
 * Per-character width used only when a text object reports no usable width
 * (a minimal headless stub). Real Phaser text exposes its measured `width`
 * during construction, so rendered alignment uses the true bounds.
 */
const FALLBACK_CHAR_WIDTH = 8;

/**
 * Formats a declared resource key as a display label: capitalises the first
 * character at most, so an authored key reads as written (`hull` → `Hull`,
 * `stores` → `Stores`). No pluralisation is invented for an arbitrary key.
 *
 * @param key The declared resource key.
 */
export function formatResourceLabel(key: string): string {
  if (key.length === 0) return '';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Reads one value from a resource bag, treating an absent or non-finite value
 * as `0` (the same rule the story-line engine's `readResource` applies).
 *
 * @param resources The caller's resource bag.
 * @param key       The declared resource key to read.
 */
export function readResourceValue(
  resources: Readonly<Record<string, number>>,
  key: string,
): number {
  const value = resources[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Trims, drops blank and duplicate keys, preserving declaration order. */
function normaliseDeclaredKeys(keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalised: string[] = [];
  for (const raw of keys) {
    const key = raw.trim();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    normalised.push(key);
  }
  return normalised;
}

/** The rendered width of an item text, with a deterministic stub fallback. */
function measureTextWidth(text: Phaser.GameObjects.Text): number {
  const width = text.width;
  return Number.isFinite(width) && width > 0
    ? width
    : (text.text?.length ?? 0) * FALLBACK_CHAR_WIDTH;
}

/** Resolves an alignment, falling back to `left` for unknown runtime data. */
function resolveAlign(align: ResourceHudAlign | undefined): ResourceHudAlign {
  return align === 'centre' || align === 'right' ? align : 'left';
}

// ── Component ──────────────────────────────────────────────

/**
 * A horizontal HUD block rendering one labelled item per declared resource key.
 *
 * The block lives in a single Phaser container; items are laid out
 * left-to-right inside it and the container is shifted so the block's left
 * edge, centre or right edge sits on the SLL anchor point.
 */
export class ResourceHud extends UIComponentBase {
  private readonly scene: Phaser.Scene;
  private readonly options: ResourceHudOptions;
  private readonly style: Required<ResourceHudStyle>;
  private readonly declaredKeys: readonly string[];
  private readonly container: Phaser.GameObjects.Container;
  private readonly items: ResourceHudItem[];

  /**
   * @param scene   The Phaser scene that owns the HUD.
   * @param options The caller's declared resource set, position and styling.
   */
  constructor(scene: Phaser.Scene, options: ResourceHudOptions) {
    super();
    this.scene = scene;
    this.options = options;
    this.style = mergeDefaults(RESOURCE_HUD_STYLE_DEFAULTS, options.style);

    this.declaredKeys = normaliseDeclaredKeys(options.declaredKeys);
    this.items = this.buildItems(this.declaredKeys);

    this.container = this.scene.add.container(0, 0);
    if (this.items.length > 0) {
      this.container.add(this.items.map((item) => item.text));
    }
    const startX = this.resolveStartX(resolveAlign(options.align));
    this.container.setPosition(startX, options.y);
  }

  // ── Public API ─────────────────────────────────────────────

  /** The Phaser container holding every item. */
  get gameObject(): Phaser.GameObjects.Container {
    return this.container;
  }

  /** The rendered items, in declaration order. */
  getItems(): readonly ResourceHudItem[] {
    return this.items;
  }

  /**
   * The current values of the declared keys, in declaration order.
   *
   * An absent key reads as `0`; keys outside the declaration are not
   * projected.
   */
  getResources(): Readonly<Record<string, number>> {
    const snapshot: Record<string, number> = {};
    for (const key of this.declaredKeys) {
      snapshot[key] = readResourceValue(this.options.resources, key);
    }
    return snapshot;
  }

  // ── Lifecycle ──────────────────────────────────────────────

  protected destroyContent(): void {
    for (const item of this.items) {
      try {
        item.text.destroy();
      } catch {
        // Non-fatal — Phaser may throw if the object was already destroyed.
      }
    }
    try {
      this.container.destroy();
    } catch {
      // Non-fatal — Phaser may throw if the object was already destroyed.
    }
  }

  // ── Construction helpers ───────────────────────────────────

  /** Creates one text object per declared key, laid out left-to-right. */
  private buildItems(declaredKeys: readonly string[]): ResourceHudItem[] {
    const items: ResourceHudItem[] = [];
    let cursor = 0;
    for (const key of declaredKeys) {
      const label = this.resolveLabel(key);
      const value = readResourceValue(this.options.resources, key);
      const content = `${label} ${value}`;
      const text = this.scene.add
        .text(cursor, 0, content, {
          fontSize: this.style.fontSize,
          fontFamily: this.style.fontFamily,
          color: this.style.color,
        })
        .setOrigin(0, 0.5);
      items.push({ key, label, value, text });
      cursor += measureTextWidth(text) + this.style.itemGap;
    }
    return items;
  }

  /**
   * Resolves the container X so the block's left edge, centre or right edge
   * sits on the anchor point.
   */
  private resolveStartX(align: ResourceHudAlign): number {
    const anchorX = this.options.x;
    if (this.items.length === 0) return anchorX;
    const blockWidth = this.items.reduce(
      (total, item) => total + measureTextWidth(item.text),
      0,
    ) + this.style.itemGap * (this.items.length - 1);
    if (align === 'right') return anchorX - blockWidth;
    if (align === 'centre') return anchorX - blockWidth / 2;
    return anchorX;
  }

  /** Resolves the display label for a key: caller override, else authored. */
  private resolveLabel(key: string): string {
    const override = this.options.labels?.[key];
    return override !== undefined ? override : formatResourceLabel(key);
  }
}
