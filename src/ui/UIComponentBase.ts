/**
 * UIComponentBase — Shared lifecycle for reusable UI components.
 *
 * UI widgets (icon buttons, sliders, hint bars, pile views, …) repeated the
 * same lifecycle boilerplate: a private `destroyed` flag, a per-class
 * idempotency guard, `enabled` gating, and manual event-listener bookkeeping
 * that was easy to get wrong (listeners leaked if a component was destroyed
 * mid-interaction).
 *
 * `UIComponentBase` centralises that contract:
 *
 * - `destroyed` / `enabled` state with `setEnabled()`.
 * - `canInteract()` for handlers to gate on (live + enabled).
 * - Protected `on()` / `off()` that track listeners via the core-engine
 *   {@link ListenerRegistry} and remove every tracked listener on `destroy()`.
 * - An abstract `destroyContent()` for subclass-specific object teardown.
 * - An idempotent `destroy()` (safe to call repeatedly).
 *
 * Subclasses keep full control of their own construction and visual objects;
 * they only route listeners through `on()` and destroy their own objects in
 * `destroyContent()`.
 *
 * @module @ui/UIComponentBase
 *
 * @example
 * ```ts
 * class MyWidget extends UIComponentBase {
 *   private readonly box: Phaser.GameObjects.Rectangle;
 *
 *   constructor(scene: Phaser.Scene) {
 *     super();
 *     this.box = scene.add.rectangle(0, 0, 40, 40);
 *     this.on(this.box, 'pointerdown', () => {
 *       if (this.canInteract()) this.handleClick();
 *     });
 *   }
 *
 *   protected destroyContent(): void {
 *     this.box.destroy();
 *   }
 * }
 * ```
 */

import { ListenerRegistry, type ListenerEmitter } from '../core-engine/ListenerRegistry';

/**
 * Merge caller-supplied overrides over a set of defaults.
 *
 * Keys that are absent from (or explicitly `undefined` in) *overrides* fall
 * back to the default value. Falsy overrides (`0`, `false`, `''`) and `null`
 * are preserved — only `undefined` is treated as "not supplied".
 *
 * @param defaults  The complete set of default values.
 * @param overrides Optional partial overrides.
 * @returns A new object containing the merged values.
 */
export function mergeDefaults<T extends object>(
  defaults: T,
  overrides?: Partial<T> | null,
): T {
  const merged = { ...defaults };
  if (overrides) {
    for (const key of Object.keys(overrides) as (keyof T)[]) {
      const value = overrides[key];
      if (value !== undefined) {
        merged[key] = value as T[keyof T];
      }
    }
  }
  return merged;
}

/**
 * Base class for reusable UI components.
 *
 * Provides shared `destroyed`/`enabled` lifecycle state, listener tracking
 * with automatic cleanup, and an idempotent `destroy()`.
 */
export abstract class UIComponentBase {
  private _destroyed = false;
  private _enabled = true;

  /** Tracks every listener registered via {@link on} for bulk removal. */
  protected readonly listeners = new ListenerRegistry();

  /** Whether `destroy()` has run. */
  get destroyed(): boolean {
    return this._destroyed;
  }

  /** Whether the component currently accepts interaction. */
  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Enable or disable interaction. Disabled components ignore input; their
   * visuals are unaffected (subclasses may hide them separately).
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * True when the component is live and enabled — i.e. handlers should run.
   * Subclasses should gate their event handlers on this.
   */
  protected canInteract(): boolean {
    return !this._destroyed && this._enabled;
  }

  /**
   * Register an event listener and track it for automatic removal on
   * {@link destroy}.
   *
   * @param emitter   A Phaser-style emitter (`.on`/`.off`) or `EventTarget`.
   * @param event     Event name or symbol.
   * @param handler   Listener callback.
   * @param context   Optional handler context.
   * @returns An unsubscribe closure that removes exactly this listener.
   */
  protected on(
    emitter: ListenerEmitter,
    event: string | symbol,
    handler: (...args: any[]) => void,
    context?: unknown,
  ): () => void {
    this.listeners.on(emitter, event, handler, context);
    return () => this.listeners.off(emitter, event, handler);
  }

  /**
   * Remove a single tracked listener before {@link destroy}. Used for
   * listeners whose lifetime is shorter than the component's (e.g. a slider's
   * drag-scoped `pointermove`/`pointerup` handlers).
   *
   * Idempotent — safe to call when the listener is not tracked.
   */
  protected off(
    emitter: ListenerEmitter,
    event: string | symbol,
    handler: (...args: any[]) => void,
  ): void {
    this.listeners.off(emitter, event, handler);
  }

  /**
   * Destroy subclass-specific content (game objects, tweens, …).
   *
   * Called exactly once by {@link destroy}, before tracked listeners are
   * removed. Implementations should be tolerant of their objects already
   * being destroyed.
   */
  protected abstract destroyContent(): void;

  /**
   * Destroy the component: run {@link destroyContent}, then remove every
   * tracked listener.
   *
   * Idempotent — repeated calls are no-ops. Listener removal runs even if
   * `destroyContent()` throws, so no listeners leak.
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    try {
      this.destroyContent();
    } finally {
      this.listeners.clear();
    }
  }
}
