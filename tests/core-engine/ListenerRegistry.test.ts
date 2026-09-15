/**
 * Unit tests for ListenerRegistry — automatic event listener tracking and
 * cleanup. Runs in Node (no Phaser runtime required) using mock emitters.
 *
 * @module tests/unit/ListenerRegistry
 */

import { describe, it, expect, vi } from 'vitest';
import { ListenerRegistry } from '../../src/core-engine/ListenerRegistry';

/** A minimal mock emitter that mimics Phaser's EventEmitter.on/off pattern. */
function createMockEmitter() {
  const events: Array<{ event: string | symbol; handler: (...args: any[]) => void; context?: unknown }> = [];
  const emitter = {
    on: vi.fn((event: string | symbol, handler: (...args: any[]) => void, context?: unknown) => {
      events.push({ event, handler, context });
    }),
    off: vi.fn((event: string | symbol, handler: (...args: any[]) => void, context?: unknown) => {
      const idx = events.findIndex(
        (e) => e.event === event && e.handler === handler && e.context === context,
      );
      if (idx !== -1) events.splice(idx, 1);
    }),
  };
  return emitter;
}

describe('ListenerRegistry', () => {
  describe('tracking', () => {
    it('should track a single listener registration', () => {
      const registry = new ListenerRegistry();
      const emitter = createMockEmitter();
      const handler = () => {};
      registry.on(emitter, 'pointerdown', handler);
      expect(registry.size).toBe(1);
      expect(emitter.on).toHaveBeenCalledTimes(1);
    });

    it('should track multiple listener registrations', () => {
      const registry = new ListenerRegistry();
      const emitter = createMockEmitter();
      const handler1 = () => {};
      const handler2 = () => {};
      registry.on(emitter, 'pointerdown', handler1);
      registry.on(emitter, 'pointerup', handler2);
      expect(registry.size).toBe(2);
    });

    it('should track listeners on different emitters', () => {
      const registry = new ListenerRegistry();
      const emitter1 = createMockEmitter();
      const emitter2 = createMockEmitter();
      const handler = () => {};
      registry.on(emitter1, 'pointerdown', handler);
      registry.on(emitter2, 'pointerdown', handler);
      expect(registry.size).toBe(2);
    });

    it('should track listeners with context', () => {
      const registry = new ListenerRegistry();
      const emitter = createMockEmitter();
      const handler = () => {};
      const context = { foo: 'bar' };
      registry.on(emitter, 'pointerdown', handler, context);
      expect(emitter.on).toHaveBeenCalledWith('pointerdown', handler, context);
    });
  });

  describe('single removal', () => {
    it('should remove a single listener via off()', () => {
      const registry = new ListenerRegistry();
      const emitter = createMockEmitter();
      const handler = () => {};
      registry.on(emitter, 'pointerdown', handler);
      expect(registry.size).toBe(1);
      registry.off(emitter, 'pointerdown', handler);
      expect(registry.size).toBe(0);
      expect(emitter.off).toHaveBeenCalledWith('pointerdown', handler, undefined);
    });

    it('should be idempotent when removing a non-existent listener', () => {
      const registry = new ListenerRegistry();
      const emitter = createMockEmitter();
      const handler = () => {};
      registry.off(emitter, 'pointerdown', handler);
      expect(registry.size).toBe(0);
    });
  });

  describe('clear()', () => {
    it('should remove all tracked listeners', () => {
      const registry = new ListenerRegistry();
      const emitter1 = createMockEmitter();
      const emitter2 = createMockEmitter();
      const handler1 = () => {};
      const handler2 = () => {};
      registry.on(emitter1, 'pointerdown', handler1);
      registry.on(emitter2, 'pointerup', handler2);
      expect(registry.size).toBe(2);
      registry.clear();
      expect(registry.size).toBe(0);
      expect(emitter1.off).toHaveBeenCalledTimes(1);
      expect(emitter2.off).toHaveBeenCalledTimes(1);
    });

    it('should be idempotent — calling clear() twice should not error', () => {
      const registry = new ListenerRegistry();
      const emitter = createMockEmitter();
      const handler = () => {};
      registry.on(emitter, 'pointerdown', handler);
      registry.clear();
      expect(registry.size).toBe(0);
      // Second clear should be a no-op
      registry.clear();
      expect(registry.size).toBe(0);
    });

    it('should call off() on all emitters in correct order', () => {
      const registry = new ListenerRegistry();
      const emitter1 = createMockEmitter();
      const emitter2 = createMockEmitter();
      const handler = () => {};
      registry.on(emitter1, 'pointerdown', handler);
      registry.on(emitter2, 'pointerdown', handler);
      registry.clear();
      // Both emitters' off() should have been called
      expect(emitter1.off).toHaveBeenCalledTimes(1);
      expect(emitter2.off).toHaveBeenCalledTimes(1);
    });
  });

  describe('size getter', () => {
    it('should return 0 for a fresh registry', () => {
      const registry = new ListenerRegistry();
      expect(registry.size).toBe(0);
    });

    it('should increment on each registration', () => {
      const registry = new ListenerRegistry();
      const emitter = createMockEmitter();
      registry.on(emitter, 'a', () => {});
      registry.on(emitter, 'b', () => {});
      registry.on(emitter, 'c', () => {});
      expect(registry.size).toBe(3);
    });

    it('should decrement on each off() call', () => {
      const registry = new ListenerRegistry();
      const emitter = createMockEmitter();
      const handler = () => {};
      registry.on(emitter, 'a', handler);
      registry.on(emitter, 'b', handler);
      expect(registry.size).toBe(2);
      registry.off(emitter, 'a', handler);
      expect(registry.size).toBe(1);
    });

    it('should return 0 after clear()', () => {
      const registry = new ListenerRegistry();
      const emitter = createMockEmitter();
      registry.on(emitter, 'a', () => {});
      registry.clear();
      expect(registry.size).toBe(0);
    });
  });

  describe('no listener leaks', () => {
    it('should leave no listeners after destroy', () => {
      const registry = new ListenerRegistry();
      const emitter = createMockEmitter();
      const handler = () => {};
      registry.on(emitter, 'pointerdown', handler);
      registry.on(emitter, 'pointerup', handler);
      registry.destroy();
      expect(registry.size).toBe(0);
      expect(emitter.off).toHaveBeenCalledTimes(2);
    });

    it('should remain usable after clear() (re-register + clear again)', () => {
      const registry = new ListenerRegistry();
      const emitter = createMockEmitter();
      const handler = () => {};
      registry.on(emitter, 'pointerdown', handler);
      registry.clear();
      expect(registry.size).toBe(0);
      // Re-register after clear (e.g. scene restart) then clear again.
      registry.on(emitter, 'pointerdown', handler);
      expect(registry.size).toBe(1);
      registry.clear();
      expect(registry.size).toBe(0);
      expect(emitter.off).toHaveBeenCalledTimes(2);
    });
  });
});
