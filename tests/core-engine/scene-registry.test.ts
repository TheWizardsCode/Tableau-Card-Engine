/**
 * Unit tests for scene-registry — the `getSceneRegistry` helper that
 * associates a ListenerRegistry with a Phaser scene and auto-cleans on
 * shutdown. Runs in Node using a minimal mock scene.
 *
 * @module tests/unit/scene-registry
 */

import { describe, it, expect, vi } from 'vitest';
import { getSceneRegistry, removeSceneRegistry } from '../../src/core-engine/scene-registry';
import { ListenerRegistry } from '../../src/core-engine/ListenerRegistry';

/** A minimal mock Phaser scene that mimics the Phaser.Scene events API. */
interface MockSceneEvents {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  shutdownHandlers: Array<() => void>;
}

type MockScene = Phaser.Scene & { events: MockSceneEvents };

function createMockScene(): MockScene {
  const shutdownHandlers: Array<() => void> = [];
  const mock = {
    events: {
      on: vi.fn((event: string | symbol, handler: () => void) => {
        if (event === 'shutdown') shutdownHandlers.push(handler);
      }),
      off: vi.fn((event: string | symbol, handler: () => void) => {
        if (event === 'shutdown') {
          const idx = shutdownHandlers.indexOf(handler);
          if (idx !== -1) shutdownHandlers.splice(idx, 1);
        }
      }),
      shutdownHandlers,
    },
    scale: { width: 800, height: 600 },
  };
  return mock as unknown as MockScene;
}

describe('getSceneRegistry', () => {
  it('should return a ListenerRegistry for a new scene', () => {
    const scene = createMockScene();
    const registry = getSceneRegistry(scene);
    expect(registry).toBeInstanceOf(ListenerRegistry);
    expect(registry.size).toBe(0);
  });

  it('should return the same registry for repeated calls with the same scene', () => {
    const scene = createMockScene();
    const registry1 = getSceneRegistry(scene);
    const registry2 = getSceneRegistry(scene);
    expect(registry1).toBe(registry2);
    // The shutdown hook should only be registered once.
    expect(scene.events.shutdownHandlers.length).toBe(1);
  });

  it('should return different registries for different scenes', () => {
    const scene1 = createMockScene();
    const scene2 = createMockScene();
    const registry1 = getSceneRegistry(scene1);
    const registry2 = getSceneRegistry(scene2);
    expect(registry1).not.toBe(registry2);
  });

  it('should track listeners registered on the returned registry', () => {
    const scene = createMockScene();
    const registry = getSceneRegistry(scene);
    const mockEmitter = { on: vi.fn(), off: vi.fn() };
    registry.on(mockEmitter, 'pointerdown', () => {});
    expect(registry.size).toBe(1);
  });

  it('should auto-clear when shutdown event fires', () => {
    const scene = createMockScene();
    const registry = getSceneRegistry(scene);
    const mockEmitter = { on: vi.fn(), off: vi.fn() };
    registry.on(mockEmitter, 'pointerdown', () => {});
    expect(registry.size).toBe(1);

    // Trigger the registered shutdown hook — the registry should auto-clear.
    const shutdownHandler = scene.events.shutdownHandlers[0];
    shutdownHandler();
    expect(registry.size).toBe(0);
    expect(mockEmitter.off).toHaveBeenCalledTimes(1);
  });

  it('should create a fresh registry after shutdown (scene restart)', () => {
    const scene = createMockScene();
    const first = getSceneRegistry(scene);
    const shutdownHandler = scene.events.shutdownHandlers[0];
    shutdownHandler();
    // After shutdown the WeakMap entry is gone, so a new registry is created.
    const second = getSceneRegistry(scene);
    expect(second).not.toBe(first);
    expect(second.size).toBe(0);
  });
});

describe('removeSceneRegistry', () => {
  it('should remove a scene registry and return it', () => {
    const scene = createMockScene();
    const registry = getSceneRegistry(scene);
    const removed = removeSceneRegistry(scene);
    expect(removed).toBe(registry);
    // The dedicated shutdown hook should have been removed.
    expect(scene.events.shutdownHandlers.length).toBe(0);
  });

  it('should return undefined for a scene with no registry', () => {
    const scene = createMockScene();
    const result = removeSceneRegistry(scene);
    expect(result).toBeUndefined();
  });
});