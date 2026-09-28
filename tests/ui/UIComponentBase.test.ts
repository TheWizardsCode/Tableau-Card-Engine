/**
 * UIComponentBase Unit Tests
 *
 * Specifies the shared UI lifecycle contract: destroyed/enabled state,
 * tracked listener registration with automatic cleanup on destroy(),
 * idempotent destroy(), and defaults merging.
 *
 * Uses a minimal EventEmitter mock so the base can be exercised in Node.js
 * without a browser runtime.
 */
import { describe, expect, it, vi } from 'vitest';

import { UIComponentBase, mergeDefaults } from '../../src/ui/UIComponentBase';

// ── Minimal emitter mock ─────────────────────────────────────

interface MockEmitter {
  handlers: Map<string, Set<(...args: any[]) => void>>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  emit: (event: string, ...args: any[]) => void;
}

function createEmitter(): MockEmitter {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  const emitter: MockEmitter = {
    handlers,
    on: vi.fn((event: string, fn: (...args: any[]) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(fn);
      return emitter;
    }),
    off: vi.fn((event: string, fn: (...args: any[]) => void) => {
      handlers.get(event)?.delete(fn);
      return emitter;
    }),
    emit: (event: string, ...args: any[]) => {
      for (const fn of Array.from(handlers.get(event) ?? [])) fn(...args);
    },
  };
  return emitter;
}

// ── Concrete test component ──────────────────────────────────

class TestComponent extends UIComponentBase {
  destroyContentCalls = 0;
  destroyContentError: Error | null = null;

  protected destroyContent(): void {
    this.destroyContentCalls++;
    if (this.destroyContentError) throw this.destroyContentError;
  }

  /** Expose the protected listener API for assertions. */
  track(emitter: MockEmitter, event: string, handler: (...args: any[]) => void): () => void {
    return this.on(emitter, event, handler);
  }

  untrack(emitter: MockEmitter, event: string, handler: (...args: any[]) => void): void {
    this.off(emitter, event, handler);
  }

  interactable(): boolean {
    return this.canInteract();
  }
}

// ── State tests ──────────────────────────────────────────────

describe('UIComponentBase — state', () => {
  it('starts live, enabled, and interactive', () => {
    const component = new TestComponent();
    expect(component.destroyed).toBe(false);
    expect(component.enabled).toBe(true);
    expect(component.interactable()).toBe(true);
  });

  it('setEnabled(false) suppresses interaction until re-enabled', () => {
    const component = new TestComponent();
    component.setEnabled(false);
    expect(component.enabled).toBe(false);
    expect(component.interactable()).toBe(false);

    component.setEnabled(true);
    expect(component.enabled).toBe(true);
    expect(component.interactable()).toBe(true);
  });

  it('destroy() marks the component destroyed and suppresses interaction', () => {
    const component = new TestComponent();
    component.destroy();
    expect(component.destroyed).toBe(true);
    expect(component.interactable()).toBe(false);
  });
});

// ── Listener tracking tests ──────────────────────────────────

describe('UIComponentBase — listener tracking', () => {
  it('registers tracked listeners on the target', () => {
    const component = new TestComponent();
    const emitter = createEmitter();
    const handler = vi.fn();

    component.track(emitter, 'pointerdown', handler);

    expect(emitter.on).toHaveBeenCalledTimes(1);
    expect(emitter.on).toHaveBeenCalledWith('pointerdown', handler, undefined);
    emitter.emit('pointerdown');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('removes every tracked listener exactly once on destroy()', () => {
    const component = new TestComponent();
    const emitter = createEmitter();
    const first = vi.fn();
    const second = vi.fn();

    component.track(emitter, 'pointerdown', first);
    component.track(emitter, 'pointerup', second);
    component.destroy();

    expect(emitter.off).toHaveBeenCalledWith('pointerdown', first, undefined);
    expect(emitter.off).toHaveBeenCalledWith('pointerup', second, undefined);
    expect(emitter.off).toHaveBeenCalledTimes(2);

    emitter.emit('pointerdown');
    emitter.emit('pointerup');
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('cleans up listeners registered mid-lifecycle (before destroy)', () => {
    const component = new TestComponent();
    const emitter = createEmitter();
    const handler = vi.fn();

    component.track(emitter, 'pointermove', handler);
    // Added later, still before destroy.
    component.track(emitter, 'pointerup', handler);
    component.destroy();

    expect(emitter.off).toHaveBeenCalledTimes(2);
  });

  it('off() removes a single tracked listener and destroy() does not re-remove it', () => {
    const component = new TestComponent();
    const emitter = createEmitter();
    const handler = vi.fn();

    component.track(emitter, 'pointermove', handler);
    component.untrack(emitter, 'pointermove', handler);

    expect(emitter.off).toHaveBeenCalledTimes(1);
    component.destroy();
    expect(emitter.off).toHaveBeenCalledTimes(1);
  });

  it('the unsubscribe closure returned by on() removes exactly that listener', () => {
    const component = new TestComponent();
    const emitter = createEmitter();
    const handler = vi.fn();

    const unsubscribe = component.track(emitter, 'pointermove', handler);
    unsubscribe();

    expect(emitter.off).toHaveBeenCalledTimes(1);
    component.destroy();
    expect(emitter.off).toHaveBeenCalledTimes(1);
  });

  it('destroy() still clears listeners when destroyContent() throws', () => {
    const component = new TestComponent();
    component.destroyContentError = new Error('boom');
    const emitter = createEmitter();
    component.track(emitter, 'pointerdown', vi.fn());

    expect(() => component.destroy()).toThrow('boom');
    expect(component.destroyed).toBe(true);
    expect(emitter.off).toHaveBeenCalledTimes(1);
  });
});

// ── Idempotency tests ────────────────────────────────────────

describe('UIComponentBase — idempotent destroy', () => {
  it('invokes destroyContent() exactly once across repeated destroy() calls', () => {
    const component = new TestComponent();
    component.destroy();
    component.destroy();
    component.destroy();
    expect(component.destroyContentCalls).toBe(1);
  });

  it('does not re-detach listeners on a second destroy()', () => {
    const component = new TestComponent();
    const emitter = createEmitter();
    component.track(emitter, 'pointerdown', vi.fn());

    component.destroy();
    component.destroy();

    expect(emitter.off).toHaveBeenCalledTimes(1);
  });
});

// ── mergeDefaults tests ──────────────────────────────────────

describe('mergeDefaults', () => {
  const defaults = { a: 1, b: 'two', c: true };

  it('returns the defaults when no overrides are supplied', () => {
    expect(mergeDefaults(defaults)).toEqual(defaults);
    expect(mergeDefaults(defaults, undefined)).toEqual(defaults);
    expect(mergeDefaults(defaults, null)).toEqual(defaults);
  });

  it('lets overrides win and falls back for absent keys', () => {
    expect(mergeDefaults(defaults, { b: 'changed' })).toEqual({ a: 1, b: 'changed', c: true });
  });

  it('treats explicitly-undefined override values as absent', () => {
    expect(mergeDefaults(defaults, { a: undefined, b: 'changed' })).toEqual({
      a: 1,
      b: 'changed',
      c: true,
    });
  });

  it('preserves falsy override values (0, false, empty string)', () => {
    expect(mergeDefaults(defaults, { a: 0, c: false })).toEqual({ a: 0, b: 'two', c: false });
  });
});
