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
 * This slice renders the declared set, the declared bounds and the
 * loss-bearing subset. A bounded key prints `value / max` (for example
 * `Morale 5 / 8`); a key sitting at a declared edge prints a **state marker**
 * word (`full` / `empty`); and a key in the caller's `irreversible` subset
 * prints the word `irreversible` beside it. Each printed marker is the primary
 * channel and carries a secondary colour cue — colour is never the only
 * channel (GDD §3.4.3).
 *
 * The options object is the stable public contract: `reducedMotion`,
 * `soundManager`, `sfx` and `onChange` all drive the update path.
 *
 * ## Updating values
 *
 * `setResources(bag)` pushes a new resource bag after a choice and is the only
 * way values change. It diffs the declared keys against the rendered values and
 * updates **only the text content of the items that actually changed** — the
 * item objects keep their position, so the row is never re-flowed into a new
 * layout. The printed marker words and colour cues are re-resolved, so a value
 * that reaches a bound (or is printed as a caller-supplied spilled/clamped
 * figure) reads correctly afterwards.
 *
 * - **Animated path (default):** the changed value texts get one short pop
 *   tween (scale `1.15` → `1`), the previous in-flight pop is stopped first,
 *   and **at most one** SFX is played per update through the injected
 *   `soundManager` (a `COMMON_SFX_KEYS` key was supplied by the caller).
 * - **Reduced motion:** the new values snap with no tween and **no** SFX
 *   (GDD §3.4.1); the printed channel is never suppressed.
 * - **No `soundManager` / no `sfx`:** a silent no-op on the audio seam.
 * - **`onChange`:** called once with the new declared-key snapshot after a
 *   real change (either path), and not at all when nothing changed.
 * - **After `destroy()`:** a safe no-op — no text write, tween, SFX or callback.
 *
 * `setReducedMotion()` lets a caller follow the settings-panel toggle at
 * runtime; a switch to reduced motion stops an in-flight pop and snaps.
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
 *   bounds: readManifestBounds(manifest),
 *   irreversible: projection.irreversible,
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

/**
 * The printed state marker a key earns at a declared bound edge.
 *
 * `full` when the value sits at (or beyond) the declared maximum, `empty` when
 * it sits at (or below) the declared minimum. A key strictly between its
 * bounds prints neither.
 */
export type ResourceHudState = 'full' | 'empty';

/**
 * The printed marker words, in one place so the HUD, its callers and its tests
 * name the same text. The printed marker is the primary channel; the matching
 * colour cue is secondary (GDD §3.4.3).
 */
export const RESOURCE_HUD_MARKERS: Readonly<
  Record<ResourceHudState | 'irreversible', string>
> = {
  full: 'full',
  empty: 'empty',
  irreversible: 'irreversible',
};

/** Optional visual styling for a {@link ResourceHud}. */
export interface ResourceHudStyle {
  /** Font size of an item (default: `'14px'`). */
  fontSize?: string;
  /** Font family of an item (default: {@link FONT_FAMILY}). */
  fontFamily?: string;
  /** Text colour of an item (default: `'#d8e0d8'`). */
  color?: string;
  /** Secondary colour cue of a key at its declared maximum (default: green). */
  fullColor?: string;
  /** Secondary colour cue of a key at its declared minimum (default: amber). */
  emptyColor?: string;
  /**
   * Secondary colour cue of an irreversible key (default: red). Takes
   * precedence over the edge-state colours, because irreversibility outlives a
   * transient value.
   */
  irreversibleColor?: string;
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
   * `resources.bounds` read-through). A bounded key prints `value / max` and
   * a key at an edge prints its state marker.
   */
  bounds?: Readonly<Record<string, ResourceHudBounds>>;
  /**
   * The declared never-restored / loss-bearing keys. A key in this subset is
   * marked, with the printed word `irreversible` as the primary channel.
   */
  irreversible?: readonly string[];
  /**
   * Display-label overrides, keyed by declared resource key. A key with no
   * entry prints as authored, capitalised at most (no invented pluralisation).
   */
  labels?: Readonly<Record<string, string>>;
  /**
   * Caller-resolved reduced-motion flag — pass
   * `getEffectiveReducedMotion()` from `@ui`. An instant, silent update path.
   */
  reducedMotion?: boolean;
  /** Optional audio sink for value updates. A missing manager is a silent no-op. */
  soundManager?: ResourceHudSoundPlayer;
  /**
   * SFX key played once per animated value update — a `COMMON_SFX_KEYS` key.
   * Omitted, no sound is played (and reduced motion never plays one).
   */
  sfx?: string;
  /** Called once with the new bag after a `setResources` update changes a value. */
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
  /** The declared inclusive minimum, when the key is bounded and usable. */
  readonly min?: number;
  /** The declared inclusive maximum, when the key is bounded and usable. */
  readonly max?: number;
  /** The printed state marker earned at a declared edge, if any. */
  readonly state?: ResourceHudState;
  /** Whether the key is declared never-restored / loss-bearing. */
  readonly irreversible: boolean;
  /** The resolved text colour (a secondary cue; the printed marker is primary). */
  readonly color: string;
  /** The Phaser text object showing the full rendered item. */
  readonly text: Phaser.GameObjects.Text;
}

// ── Defaults & helpers ─────────────────────────────────────

/** Default item styling, spacing and state colour cues. */
const RESOURCE_HUD_STYLE_DEFAULTS: Required<ResourceHudStyle> = {
  fontSize: '14px',
  fontFamily: FONT_FAMILY,
  color: '#d8e0d8',
  fullColor: '#8fd18f',
  emptyColor: '#e8b45a',
  irreversibleColor: '#f07a7a',
  itemGap: 18,
};

/**
 * Per-character width used only when a text object reports no usable width
 * (a minimal headless stub). Real Phaser text exposes its measured `width`
 * during construction, so rendered alignment uses the true bounds.
 */
const FALLBACK_CHAR_WIDTH = 8;

/** Duration, in milliseconds, of the value-change pop tween. */
const UPDATE_TWEEN_DURATION_MS = 240;

/** Scale a changed value text pops from before settling back to `1`. */
const UPDATE_TWEEN_POP_SCALE = 1.15;

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

/**
 * Reads the usable bounds declared for one key.
 *
 * A key with no bounds entry, or one whose `max` is not a finite number, is
 * treated as unbounded — the HUD never invents a range and never hides a
 * malformed declaration behind a made-up maximum. A non-finite `min` falls
 * back to `0`, the conventional floor.
 *
 * @param bounds The caller's declared bounds record.
 * @param key    The declared resource key to read.
 */
export function readResourceBounds(
  bounds: Readonly<Record<string, ResourceHudBounds>> | undefined,
  key: string,
): ResourceHudBounds | undefined {
  const declared = bounds?.[key];
  if (!declared) return undefined;
  if (typeof declared.max !== 'number' || !Number.isFinite(declared.max)) {
    return undefined;
  }
  const min =
    typeof declared.min === 'number' && Number.isFinite(declared.min)
      ? declared.min
      : 0;
  return { min, max: declared.max };
}

/**
 * Formats a key's value, appending the declared maximum when the key is
 * bounded: `5` for an unbounded key, `5 / 8` for a bounded one.
 *
 * The value is printed as read from the bag — the HUD is a view and never
 * silently clamps a value the caller supplied.
 *
 * @param value  The current value of the key.
 * @param bounds The key's usable bounds, if it is bounded. A non-finite
 *               maximum is treated as unbounded.
 */
export function formatResourceAmount(
  value: number,
  bounds?: ResourceHudBounds,
): string {
  if (bounds === undefined || !Number.isFinite(bounds.max)) return `${value}`;
  return `${value} / ${bounds.max}`;
}

/**
 * Reports the printed state marker a value earns against its declared bounds:
 * `full` at or beyond the maximum, `empty` at or below the minimum, and
 * `undefined` in between or when the key is unbounded.
 *
 * A key whose bounds are a single point (`min === max`) reports `full`, since
 * the maximum is checked first.
 *
 * @param value  The current value of the key.
 * @param bounds The key's usable bounds, if it is bounded.
 */
export function resolveResourceState(
  value: number,
  bounds?: ResourceHudBounds,
): ResourceHudState | undefined {
  if (bounds === undefined) return undefined;
  if (value >= bounds.max) return 'full';
  if (value <= bounds.min) return 'empty';
  return undefined;
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
  /** In-flight value-change tweens, stopped on a new update and on destroy. */
  private readonly tweens = new Set<Phaser.Tweens.Tween>();
  /** The resolved reduced-motion flag driving the update path. */
  private reducedMotionFlag: boolean;

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
    this.reducedMotionFlag = options.reducedMotion ?? false;

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
   * projected. Reflects the most recent {@link setResources} update.
   */
  getResources(): Readonly<Record<string, number>> {
    const snapshot: Record<string, number> = {};
    for (const item of this.items) {
      snapshot[item.key] = item.value;
    }
    return snapshot;
  }

  /** Whether the HUD currently takes the instant, silent update path. */
  get reducedMotion(): boolean {
    return this.reducedMotionFlag;
  }

  /**
   * Follow the settings-panel reduced-motion toggle at runtime.
   *
   * Switching it on stops any in-flight value pop and snaps the texts back to
   * their resting scale, so the next update is instant and silent.
   *
   * @param reducedMotion The newly resolved reduced-motion flag.
   */
  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotionFlag = reducedMotion;
    if (reducedMotion) this.stopTweens();
  }

  /**
   * Push a new resource bag and render the values that changed.
   *
   * Only the text content of changed items is rewritten — item positions are
   * left untouched, so the row never re-flows. The changed texts pop once on
   * the animated path (with at most one SFX), snap instantly and silently
   * under reduced motion, and the new bag is reported through `onChange`. An
   * update that changes nothing is a no-op; so is any update after
   * {@link destroy}.
   *
   * @param resources The new resource bag, keyed by declared resource key.
   */
  setResources(resources: Readonly<Record<string, number>>): void {
    if (this.destroyed) return;

    const changedTexts: Phaser.GameObjects.Text[] = [];
    let changed = false;

    this.items.forEach((item, index) => {
      const value = readResourceValue(resources, item.key);
      if (value === item.value) return;
      changed = true;

      const bounds = readResourceBounds(this.options.bounds, item.key);
      const state = resolveResourceState(value, bounds);
      const irreversible = this.isIrreversible(item.key);
      const color = this.resolveColor(state, irreversible);
      item.text.setText(
        this.buildContent(item.label, value, bounds, state, irreversible),
      );
      item.text.setColor(color);
      this.items[index] = { ...item, value, state, color };
      changedTexts.push(item.text);
    });

    if (!changed) return;

    // A fresh update always starts from a settled row: the previous pop (if
    // any) is stopped and every text returns to its resting scale.
    this.stopTweens();

    if (!this.reducedMotionFlag) {
      this.animateValueChange(changedTexts);
      this.playUpdateSfx();
    }

    this.options.onChange?.(this.getResources());
  }

  // ── Lifecycle ──────────────────────────────────────────────

  protected destroyContent(): void {
    this.stopTweens();
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

  // ── Update helpers ─────────────────────────────────────────

  /**
   * Starts the single value-change pop tween and tracks it for teardown.
   *
   * All changed texts are targets of one tween so an update costs one tween
   * and one SFX regardless of how many keys moved.
   */
  private animateValueChange(texts: readonly Phaser.GameObjects.Text[]): void {
    if (texts.length === 0) return;
    const tweens = this.scene.tweens;
    if (!tweens || typeof tweens.add !== 'function') return;

    for (const text of texts) text.setScale(UPDATE_TWEEN_POP_SCALE);

    const tween = tweens.add({
      targets: texts as Phaser.GameObjects.Text[],
      scaleX: 1,
      scaleY: 1,
      duration: UPDATE_TWEEN_DURATION_MS,
      ease: 'Quad.easeOut',
      onComplete: () => this.tweens.delete(tween),
      onStop: () => this.tweens.delete(tween),
    });
    if (tween) this.tweens.add(tween);
  }

  /**
   * Plays at most one SFX for this update — only when the caller supplied both
   * a `soundManager` and a `COMMON_SFX_KEYS` key, and never under reduced
   * motion (the callers of this helper gate that).
   */
  private playUpdateSfx(): void {
    const { soundManager, sfx } = this.options;
    if (!soundManager || !sfx) return;
    soundManager.play(sfx);
  }

  /**
   * Stops and forgets every tracked pop tween, returning the texts to their
   * resting scale. Safe to call when no tween is in flight.
   */
  private stopTweens(): void {
    for (const tween of this.tweens) {
      try {
        tween.stop();
      } catch {
        // Non-fatal — the tween may already have completed or been destroyed.
      }
    }
    this.tweens.clear();
    for (const item of this.items) {
      try {
        item.text.setScale(1);
      } catch {
        // Non-fatal — Phaser may throw if the object was already destroyed.
      }
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
      const bounds = readResourceBounds(this.options.bounds, key);
      const state = resolveResourceState(value, bounds);
      const irreversible = this.isIrreversible(key);
      const color = this.resolveColor(state, irreversible);
      const content = this.buildContent(label, value, bounds, state, irreversible);
      const text = this.scene.add
        .text(cursor, 0, content, {
          fontSize: this.style.fontSize,
          fontFamily: this.style.fontFamily,
          color,
        })
        .setOrigin(0, 0.5);
      items.push({
        key,
        label,
        value,
        min: bounds?.min,
        max: bounds?.max,
        state,
        irreversible,
        color,
        text,
      });
      cursor += measureTextWidth(text) + this.style.itemGap;
    }
    return items;
  }

  /**
   * Assembles an item's printed text: `label value [/ max]`, then the state
   * marker word, then the irreversible marker word. Every marker is printed
   * text, so the item stays legible without colour.
   */
  private buildContent(
    label: string,
    value: number,
    bounds: ResourceHudBounds | undefined,
    state: ResourceHudState | undefined,
    irreversible: boolean,
  ): string {
    const parts = [`${label} ${formatResourceAmount(value, bounds)}`];
    if (state !== undefined) parts.push(RESOURCE_HUD_MARKERS[state]);
    if (irreversible) parts.push(RESOURCE_HUD_MARKERS.irreversible);
    return parts.join(' ');
  }

  /**
   * Resolves an item's secondary colour cue. The irreversible cue wins over an
   * edge-state cue, because a loss-bearing key stays loss-bearing whatever its
   * current value; the printed word carries the meaning in either case.
   */
  private resolveColor(
    state: ResourceHudState | undefined,
    irreversible: boolean,
  ): string {
    if (irreversible) return this.style.irreversibleColor;
    if (state === 'full') return this.style.fullColor;
    if (state === 'empty') return this.style.emptyColor;
    return this.style.color;
  }

  /** Whether the caller declared the key never-restored / loss-bearing. */
  private isIrreversible(key: string): boolean {
    return this.options.irreversible?.includes(key) ?? false;
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
