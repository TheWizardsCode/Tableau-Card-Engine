/**
 * keyboard-navigation -- shared keyboard navigation for choice lists and modal
 * overlay focus (CG-0MWR0BKIT0084ZID; GDD G11 / gap B7).
 *
 * The story-line presentation contract promises a complete keyboard path
 * (`docs/design/storyline-game-gdd.md` §3.4.4): pick an option with `1`-`9` or
 * arrows + Enter, walk an open overlay's controls with Tab/Shift+Tab and
 * activate with Enter/Space, and close **only the topmost modal** with Escape.
 * This module is the single shared implementation of that contract; games call
 * {@link attachChoiceNavigation} and {@link attachOverlayFocus} instead of
 * hand-rolling `keydown` listeners.
 *
 * ## Contract
 *
 * - **Choice navigation** maps in-range digit keys (`1`-`9`) to option indices
 *   (digit `n` selects index `n - 1`), moves the highlight with
 *   ArrowUp/ArrowDown plus ArrowLeft/ArrowRight (wrapping at both ends),
 *   activates the highlighted option with Enter/Space, and reports the
 *   highlight through `onHighlight`. It is completely inert while a managed
 *   overlay is open (see {@link isManagedOverlayOpen}) or after disposal.
 * - **Overlay focus** traverses the supplied focusables in list order (Tab
 *   forward, Shift+Tab backward, wrapping), activates the focused item with
 *   Enter/Space through `onActivate`, reports focus changes through
 *   `onFocusChange`, and closes only the topmost managed overlay on Escape.
 *   Lower modal frames are inert, and Escape is left unhandled when no managed
 *   overlay is open, so `SettingsPanel`'s default `Escape` toggle keeps working
 *   (GDD §3.2 rule 3).
 * - **Visible focus is mandatory.** Attaching overlay focus immediately focuses
 *   index `0` and calls that item's optional `setFocusVisual(true)`; every
 *   focus move clears the previous visual and sets the new one. The helper owns
 *   the wiring and the focus bookkeeping, never the artwork.
 * - **No motion dependency.** Nothing animates, so reduced motion is a no-op
 *   and keyboard navigation works identically under it.
 * - **No leaks and no throws.** The returned disposer, the scene `shutdown`
 *   hook and the error path all funnel through one teardown; a missing keyboard
 *   plugin, a null scene or a throwing callback degrades quietly.
 *
 * ## Node safety
 *
 * Phaser appears **only** through `import type` (elided at compile time), so
 * this module is listed in `src/ui/node-safe-modules.ts` and can be imported by
 * downstream game unit suites in a plain Node environment
 * (`CG-0MVS9HBN3009HIQN`). Keyboard and lifecycle access go through injectable
 * `{ on, off }` seams (defaulting to `scene.input.keyboard` and `scene.events`),
 * so the whole contract is unit-testable headless — the same `bindInput`-style
 * pattern as `src/ui/narration-reveal.ts`.
 *
 * @module ui/keyboard-navigation
 */

import type Phaser from 'phaser';

// ── Injectable seams ────────────────────────────────────────

/**
 * Minimal keyboard surface the helpers bind to.
 *
 * Phaser's `KeyboardPlugin` satisfies it; unit tests inject a fake emitter so
 * the helpers run headless without a scene.
 */
export interface KeyboardSeam {
  on(event: 'keydown', handler: (event: KeyboardEvent) => void): unknown;
  off(event: 'keydown', handler: (event: KeyboardEvent) => void): unknown;
}

/**
 * Minimal scene-lifecycle surface used to tear navigation down on shutdown.
 *
 * Phaser's `scene.events` satisfies it; unit tests inject a fake emitter.
 */
export interface LifecycleSeam {
  on(event: 'shutdown', handler: () => void): unknown;
  off(event: 'shutdown', handler: () => void): unknown;
}

interface SceneHostLike {
  input?: { keyboard?: KeyboardSeam | null } | null;
  events?: LifecycleSeam | null;
}

function hasOnOff(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { on?: unknown; off?: unknown };
  return typeof candidate.on === 'function' && typeof candidate.off === 'function';
}

function resolveKeyboard(
  scene: Phaser.Scene | null | undefined,
  override: KeyboardSeam | undefined,
): KeyboardSeam | null {
  if (override) return hasOnOff(override) ? override : null;
  const keyboard = (scene as unknown as SceneHostLike | null | undefined)?.input
    ?.keyboard;
  return hasOnOff(keyboard) ? (keyboard as KeyboardSeam) : null;
}

function resolveLifecycle(
  scene: Phaser.Scene | null | undefined,
  override: LifecycleSeam | undefined,
): LifecycleSeam | null {
  if (override) return hasOnOff(override) ? override : null;
  const events = (scene as unknown as SceneHostLike | null | undefined)?.events;
  return hasOnOff(events) ? (events as LifecycleSeam) : null;
}

/**
 * Prevent the browser's default action for the navigation keys the helpers
 * own (Tab focus escape, arrow/Space scrolling, Escape).
 *
 * Digits and Enter are deliberately **not** prevented: swallowing those would
 * break sibling `keydown` consumers (risk register: "key-stealing"), and they
 * have no scrolling default to suppress.
 */
const PREVENT_DEFAULT_KEYS: ReadonlySet<string> = new Set<string>([
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  ' ',
  'Spacebar',
  'Escape',
  'Esc',
]);

function preventNavigationDefault(
  event: KeyboardEvent | null | undefined,
): void {
  if (!event || typeof event.preventDefault !== 'function') return;
  if (typeof event.key !== 'string' || !PREVENT_DEFAULT_KEYS.has(event.key)) {
    return;
  }
  try {
    event.preventDefault();
  } catch {
    // A read-only/unusual event must not break navigation.
  }
}

// ── Shared managed-overlay stack ────────────────────────────

interface ManagedOverlayFrame {
  readonly id: number;
}

/**
 * Attached {@link attachOverlayFocus} frames, oldest first. The **last** entry
 * is the topmost managed overlay: it alone handles Escape/Tab/activation, and
 * every lower frame is inert. Choice navigation is inert whenever this is
 * non-empty.
 */
const managedOverlayFrames: ManagedOverlayFrame[] = [];
let nextFrameId = 1;

/**
 * `true` while at least one managed overlay is open.
 *
 * This is the shared predicate behind "choice navigation is inert while a
 * modal is open" and can be used by a game to gate its own bindings.
 */
export function isManagedOverlayOpen(): boolean {
  return managedOverlayFrames.length > 0;
}

/** Number of currently attached managed overlays (topmost = last). */
export function managedOverlayDepth(): number {
  return managedOverlayFrames.length;
}

function pushManagedOverlay(): ManagedOverlayFrame {
  const frame: ManagedOverlayFrame = { id: nextFrameId };
  nextFrameId += 1;
  managedOverlayFrames.push(frame);
  return frame;
}

function removeManagedOverlay(frame: ManagedOverlayFrame): void {
  const index = managedOverlayFrames.indexOf(frame);
  if (index >= 0) managedOverlayFrames.splice(index, 1);
}

function isTopmostOverlay(frame: ManagedOverlayFrame): boolean {
  return (
    managedOverlayFrames.length > 0 &&
    managedOverlayFrames[managedOverlayFrames.length - 1] === frame
  );
}

// ── Pure index reducers ─────────────────────────────────────

/** Wrap `index` into `[0, count)`. Returns `0` for an empty range. */
export function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

/** Which key groups {@link attachChoiceNavigation} handles. */
export interface ChoiceKeyGroups {
  /** `1`-`9` select an option. Default `true`. */
  digits?: boolean;
  /** Arrow keys move the highlight (wrapping). Default `true`. */
  arrows?: boolean;
  /** Enter / Space activate the highlight. Default `true`. */
  activate?: boolean;
}

/**
 * A key the choice navigator handled.
 *
 * `moveHighlight` is set for arrows and digits; `activate` is set for digits
 * and Enter/Space. A digit therefore both moves the highlight and chooses.
 */
export interface ChoiceKeyAction {
  readonly index: number;
  readonly moveHighlight: boolean;
  readonly activate: boolean;
}

const PREVIOUS_ARROWS: ReadonlySet<string> = new Set<string>([
  'ArrowUp',
  'ArrowLeft',
]);
const NEXT_ARROWS: ReadonlySet<string> = new Set<string>([
  'ArrowDown',
  'ArrowRight',
]);

function isActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar';
}

function isDigitKey(key: string): boolean {
  return key.length === 1 && key >= '1' && key <= '9';
}

/**
 * Map a `keydown` key to a choice action, or `null` when the navigator does not
 * own it.
 *
 * Pure and deterministic so the wrap/range rules are unit-testable without a
 * scene:
 *
 * - `ArrowUp`/`ArrowLeft` move to the previous index and `ArrowDown`/
 *   `ArrowRight` to the next, both wrapping (`0 -> count - 1` and
 *   `count - 1 -> 0`). With no current highlight the first option is the base.
 * - `1`-`9` select index `digit - 1` **when in range**; an out-of-range digit
 *   (e.g. `5` with three options) is not handled.
 * - `Enter`/`Space` activate the current highlight (nothing when there is no
 *   highlight).
 */
export function resolveChoiceKeyAction(
  key: string | null | undefined,
  currentIndex: number | null,
  count: number,
  keys: ChoiceKeyGroups = {},
): ChoiceKeyAction | null {
  if (typeof key !== 'string' || count <= 0) return null;

  const digitsEnabled = keys.digits !== false;
  const arrowsEnabled = keys.arrows !== false;
  const activateEnabled = keys.activate !== false;

  if (arrowsEnabled && (PREVIOUS_ARROWS.has(key) || NEXT_ARROWS.has(key))) {
    const base = currentIndex ?? 0;
    const delta = PREVIOUS_ARROWS.has(key) ? -1 : 1;
    return {
      index: wrapIndex(base + delta, count),
      moveHighlight: true,
      activate: false,
    };
  }

  if (digitsEnabled && isDigitKey(key)) {
    const index = Number(key) - 1;
    if (index < count) {
      return { index, moveHighlight: true, activate: true };
    }
    return null;
  }

  if (activateEnabled && isActivationKey(key) && currentIndex !== null) {
    return {
      index: currentIndex,
      moveHighlight: false,
      activate: true,
    };
  }

  return null;
}

/**
 * A key the overlay-focus helper handled.
 *
 * `move` walks the focus list; `activate` calls the focused item's
 * `onActivate`; `escape` closes the topmost managed overlay.
 */
export type OverlayKeyAction =
  | { readonly kind: 'move'; readonly index: number }
  | { readonly kind: 'activate'; readonly index: number }
  | { readonly kind: 'escape' };

/** Modifiers that affect overlay key resolution. */
export interface OverlayKeyModifiers {
  /** Shift+Tab walks focus backwards. */
  shiftKey?: boolean;
}

/**
 * Map a `keydown` key to an overlay-focus action, or `null` when the helper
 * does not own it.
 *
 * Pure and deterministic:
 *
 * - `Tab` moves forward and `Shift+Tab` backward, wrapping at both ends.
 * - `Enter`/`Space` activate the focused item (nothing when there is none).
 * - `Escape` is handled even when there are no focusables — it closes the
 *   topmost managed overlay (the caller decides whether one is open).
 */
export function resolveOverlayKeyAction(
  key: string | null | undefined,
  currentIndex: number | null,
  count: number,
  modifiers: OverlayKeyModifiers = {},
): OverlayKeyAction | null {
  if (typeof key !== 'string') return null;

  if (key === 'Escape' || key === 'Esc') {
    return { kind: 'escape' };
  }

  if (count <= 0) return null;

  if (key === 'Tab') {
    const base = currentIndex ?? 0;
    const delta = modifiers.shiftKey ? -1 : 1;
    return { kind: 'move', index: wrapIndex(base + delta, count) };
  }

  if (isActivationKey(key) && currentIndex !== null) {
    return { kind: 'activate', index: currentIndex };
  }

  return null;
}

// ── Choice navigation ───────────────────────────────────────

/** Options accepted by {@link attachChoiceNavigation}. */
export interface ChoiceNavigationOptions {
  /** Number of selectable options. Values below `0` are treated as `0`. */
  count: number;
  /** Called when a choice is activated by a digit or Enter/Space. */
  onChoose(index: number): void;
  /** Called whenever arrows or digits move the highlight. */
  onHighlight?(index: number): void;
  /** Limit which key groups are handled. All groups default to enabled. */
  keys?: ChoiceKeyGroups;
  /** Keyboard seam override; defaults to `scene.input.keyboard`. */
  keyboard?: KeyboardSeam;
  /** Scene-lifecycle seam override; defaults to `scene.events`. */
  lifecycle?: LifecycleSeam;
  /**
   * Extra veto consulted before any key is handled (e.g. `() => modalOpen`).
   * Managed overlays are already handled by {@link isManagedOverlayOpen}.
   */
  isBlocked?(): boolean;
}

function normaliseCount(count: number): number {
  if (typeof count !== 'number' || !Number.isFinite(count)) return 0;
  const floored = Math.floor(count);
  return floored > 0 ? floored : 0;
}

/**
 * Attach keyboard choice navigation to a scene.
 *
 * The first option is highlighted on attach (`onHighlight(0)` when
 * `count > 0`) so the game can render a visible initial focus. Every handler is
 * inert while a managed overlay is open, while `isBlocked()` returns `true`, or
 * after disposal.
 *
 * @returns An idempotent disposer that detaches every listener it installed.
 *          The same teardown also runs on scene `shutdown`.
 */
export function attachChoiceNavigation(
  scene: Phaser.Scene | null | undefined,
  options: ChoiceNavigationOptions,
): () => void {
  const count = normaliseCount(options.count);
  let highlighted: number | null = count > 0 ? 0 : null;
  let disposed = false;

  const notifyHighlight = (index: number): void => {
    try {
      options.onHighlight?.(index);
    } catch {
      // A caller callback must not break navigation.
    }
  };

  const notifyChoose = (index: number): void => {
    try {
      options.onChoose(index);
    } catch {
      // A caller callback must not break navigation.
    }
  };

  const keyboard = resolveKeyboard(scene, options.keyboard);
  const lifecycle = resolveLifecycle(scene, options.lifecycle);

  const isBlocked = (): boolean => {
    if (isManagedOverlayOpen()) return true;
    try {
      return options.isBlocked?.() === true;
    } catch {
      // A throwing veto fails closed (inert) rather than consuming keys.
      return true;
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (disposed || isBlocked()) return;
    const action = resolveChoiceKeyAction(
      event?.key,
      highlighted,
      count,
      options.keys,
    );
    if (!action) return;

    preventNavigationDefault(event);
    if (action.moveHighlight) {
      highlighted = action.index;
      notifyHighlight(action.index);
    }
    if (action.activate) notifyChoose(action.index);
  };

  const teardown = (): void => {
    if (disposed) return;
    disposed = true;
    if (keyboard) {
      try {
        keyboard.off('keydown', onKeyDown);
      } catch {
        // ignore: the emitter may already be torn down
      }
    }
    if (lifecycle) {
      try {
        lifecycle.off('shutdown', onShutdown);
      } catch {
        // ignore: the emitter may already be torn down
      }
    }
  };

  const onShutdown = (): void => teardown();

  if (keyboard) {
    try {
      keyboard.on('keydown', onKeyDown);
    } catch {
      // A keyboard seam without working listeners cannot be wired.
    }
  }
  if (lifecycle) {
    try {
      lifecycle.on('shutdown', onShutdown);
    } catch {
      // A lifecycle seam without working listeners cannot be wired.
    }
  }

  if (highlighted !== null) notifyHighlight(highlighted);

  return teardown;
}

// ── Overlay focus ───────────────────────────────────────────

/** A game-owned control that overlay focus can traverse and activate. */
export interface OverlayFocusable {
  /** Activate the control (Enter / Space while it is focused). */
  onActivate(): void;
  /**
   * Render the visible focus state. The helper calls `true` when the item
   * gains focus and `false` when it loses it (including on disposal).
   * The game owns the artwork; the helper never draws it.
   */
  setFocusVisual?(focused: boolean): void;
}

/** Options accepted by {@link attachOverlayFocus}. */
export interface OverlayFocusOptions {
  /** Close the topmost managed overlay (Escape while this frame is topmost). */
  onEscape(): void;
  /** Report the focused index so the game can render a visible focus state. */
  onFocusChange?(index: number): void;
  /** Keyboard seam override; defaults to `scene.input.keyboard`. */
  keyboard?: KeyboardSeam;
  /** Scene-lifecycle seam override; defaults to `scene.events`. */
  lifecycle?: LifecycleSeam;
}

/**
 * Attach keyboard focus traversal to an open (managed) overlay.
 *
 * Attaching pushes a managed-overlay frame; the most recently attached frame is
 * the topmost and alone handles keys. The first focusable gains focus
 * immediately (`setFocusVisual(true)` + `onFocusChange(0)`) when there is one.
 * Escape closes only this topmost frame by calling `onEscape`; while no frame is
 * attached Escape is not observed at all, so other Escape bindings
 * (`SettingsPanel`) keep working.
 *
 * @returns An idempotent disposer that clears the focus visual, detaches every
 *          listener and pops the frame. The same teardown also runs on scene
 *          `shutdown`.
 */
export function attachOverlayFocus(
  scene: Phaser.Scene | null | undefined,
  focusables: readonly OverlayFocusable[],
  options: OverlayFocusOptions,
): () => void {
  const items: readonly OverlayFocusable[] = Array.isArray(focusables)
    ? focusables.slice()
    : [];
  const count = items.length;
  const frame = pushManagedOverlay();
  let current: number | null = count > 0 ? 0 : null;
  let disposed = false;

  const keyboard = resolveKeyboard(scene, options.keyboard);
  const lifecycle = resolveLifecycle(scene, options.lifecycle);

  const setVisual = (index: number | null, focused: boolean): void => {
    if (index === null) return;
    try {
      items[index]?.setFocusVisual?.(focused);
    } catch {
      // A caller's visual hook must not break navigation.
    }
  };

  const notifyFocus = (index: number | null): void => {
    if (index === null) return;
    try {
      options.onFocusChange?.(index);
    } catch {
      // A caller callback must not break navigation.
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (disposed || !isTopmostOverlay(frame)) return;

    const action = resolveOverlayKeyAction(
      event?.key,
      current,
      count,
      { shiftKey: event?.shiftKey === true },
    );
    if (!action) return;

    preventNavigationDefault(event);

    if (action.kind === 'escape') {
      try {
        options.onEscape();
      } catch {
        // A caller callback must not break navigation.
      }
      return;
    }

    if (action.kind === 'move') {
      setVisual(current, false);
      current = action.index;
      setVisual(current, true);
      notifyFocus(current);
      return;
    }

    try {
      items[action.index]?.onActivate();
    } catch {
      // A caller callback must not break navigation.
    }
  };

  const teardown = (): void => {
    if (disposed) return;
    disposed = true;
    setVisual(current, false);
    removeManagedOverlay(frame);
    if (keyboard) {
      try {
        keyboard.off('keydown', onKeyDown);
      } catch {
        // ignore: the emitter may already be torn down
      }
    }
    if (lifecycle) {
      try {
        lifecycle.off('shutdown', onShutdown);
      } catch {
        // ignore: the emitter may already be torn down
      }
    }
  };

  const onShutdown = (): void => {
    if (disposed) return;
    disposed = true;
    // Do not touch the focus visual here: the scene's objects may already be
    // destroyed. Detach the listener and pop the frame so nothing is orphaned.
    removeManagedOverlay(frame);
    if (keyboard) {
      try {
        keyboard.off('keydown', onKeyDown);
      } catch {
        // ignore
      }
    }
    if (lifecycle) {
      try {
        lifecycle.off('shutdown', onShutdown);
      } catch {
        // ignore
      }
    }
  };

  if (keyboard) {
    try {
      keyboard.on('keydown', onKeyDown);
    } catch {
      // A keyboard seam without working listeners cannot be wired.
    }
  }
  if (lifecycle) {
    try {
      lifecycle.on('shutdown', onShutdown);
    } catch {
      // A lifecycle seam without working listeners cannot be wired.
    }
  }

  setVisual(current, true);
  notifyFocus(current);

  return teardown;
}
