/**
 * ListenerRegistry — Automatic event listener tracking and cleanup.
 *
 * Centralises event listener management for Phaser scenes and UI components,
 * replacing manual `.off()` call chains in `destroy()` methods with a single
 * `.clear()` call. Compatible with Phaser 4 RC's event system — tracks
 * arbitrary emitters (anything with `.on()`/`.off()` methods), including
 * Phaser `Scene.events`, `scene.input`, `scene.input.keyboard`, and custom
 * `EventEmitter` instances.
 *
 * @module core-engine/ListenerRegistry
 */

/** Anything with Phaser-style `on`/`off` methods, or an `EventTarget`. */
export type ListenerEmitter =
  | {
      on(event: string | symbol, fn: (...args: any[]) => void, context?: any): any;
      off(event: string | symbol, fn?: (...args: any[]) => void, context?: any, once?: boolean): any;
    }
  | EventTarget;

/** Internal entry for a single listener registration. */
interface RegisteredListener {
  emitter: ListenerEmitter;
  event: string | symbol;
  handler: (...args: any[]) => void;
  context?: unknown;
}

/**
 * A registry that tracks event listeners and provides bulk removal.
 *
 * Usage:
 * ```ts
 * const registry = new ListenerRegistry();
 * registry.on(scene.input, 'pointerdown', handler, scene);
 * registry.size;   // 1
 * registry.clear(); // removes every tracked listener (idempotent)
 * ```
 */
export class ListenerRegistry {
  private entries: RegisteredListener[] = [];

  /**
   * Register a listener on the given emitter and track it for cleanup.
   *
   * @param emitter - An object with an `.on(event, handler, ctx?)` method.
   * @param event   - Event name or symbol.
   * @param handler - The callback to invoke when the event fires.
   * @param context - Optional context object for the handler.
   */
  on(
    emitter: ListenerEmitter,
    event: string | symbol,
    handler: (...args: any[]) => void,
    context?: unknown,
  ): void {
    const phaserEmitter = emitter as { on(event: string | symbol, fn: (...args: any[]) => void, context?: any): any };
    if (typeof (emitter as { on?: unknown }).on === 'function') {
      phaserEmitter.on(event, handler, context);
    } else {
      (emitter as EventTarget).addEventListener(
        event as string,
        handler as EventListener,
      );
    }
    this.entries.push({ emitter, event, handler, context });
  }

  /**
   * Remove a single previously registered listener.
   *
   * Idempotent — safe to call when the listener is not tracked (or was
   * already removed); in that case it is a no-op.
   *
   * @param emitter - The emitter the listener was registered on.
   * @param event   - Event name or symbol.
   * @param handler - The handler that was passed to `.on()`.
   */
  off(
    emitter: ListenerEmitter,
    event: string | symbol,
    handler: (...args: any[]) => void,
  ): void {
    const idx = this.entries.findIndex(
      (e) => e.emitter === emitter && e.event === event && e.handler === handler,
    );
    if (idx === -1) return;

    const entry = this.entries[idx];
    this.removeListener(entry);
    this.entries.splice(idx, 1);
  }

  /**
   * Remove all tracked listeners.
   *
   * Idempotent — subsequent calls are no-ops. The registry remains usable
   * after `clear()`, so it is safe to re-register listeners on a scene
   * restart.
   */
  clear(): void {
    for (const entry of this.entries) {
      this.removeListener(entry);
    }
    this.entries = [];
  }

  /**
   * Alias for {@link clear} — provided for symmetry with component
   * lifecycles (`registry.destroy()` in a component's `destroy()`).
   */
  destroy(): void {
    this.clear();
  }

  /** The number of currently tracked listeners. */
  get size(): number {
    return this.entries.length;
  }

  /** Detach a single tracked entry from its emitter. */
  private removeListener(entry: RegisteredListener): void {
    const phaserEmitter = entry.emitter as { off(event: string | symbol, fn?: (...args: any[]) => void, context?: any, once?: boolean): any };
    if (typeof (entry.emitter as { off?: unknown }).off === 'function') {
      phaserEmitter.off(entry.event, entry.handler, entry.context);
    } else {
      (entry.emitter as EventTarget).removeEventListener(
        entry.event as string,
        entry.handler as EventListener,
      );
    }
  }
}
