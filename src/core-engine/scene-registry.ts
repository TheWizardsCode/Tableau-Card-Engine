/**
 * scene-registry — One-line listener setup for Phaser scenes.
 *
 * Provides a `getSceneRegistry(scene)` helper that uses a `WeakMap` to
 * associate a `ListenerRegistry` with a Phaser scene, and automatically
 * subscribes to the scene's `shutdown` event so listeners are cleaned up
 * when the scene is destroyed.
 *
 * This eliminates the need for scenes to call `registry.clear()` in their
 * own `destroy()` methods — the Phaser scene lifecycle handles it.
 *
 * @module core-engine/scene-registry
 */

import { ListenerRegistry } from './ListenerRegistry';

/** Per-scene state: the registry plus its shutdown hook (for removal). */
interface SceneRegistryEntry {
  registry: ListenerRegistry;
  shutdownHandler: () => void;
}

/** WeakMap associating Phaser scenes with their dedicated ListenerRegistry. */
const registryMap = new WeakMap<Phaser.Scene, SceneRegistryEntry>();

/**
 * Get (or create) a `ListenerRegistry` for the given Phaser scene.
 *
 * The registry is automatically cleared when the scene fires its `shutdown`
 * event, preventing listener leaks without requiring explicit cleanup in
 * scene `destroy()` methods.
 *
 * Usage in a scene's `create()` method:
 * ```ts
 * const registry = getSceneRegistry(this);
 * registry.on(this.input, 'pointerdown', this.onPointerDown, this);
 * // No need to manually clear — the registry is cleaned on scene shutdown.
 * ```
 *
 * @param scene - The Phaser scene to associate the registry with.
 * @returns A `ListenerRegistry` instance scoped to the scene.
 */
export function getSceneRegistry(scene: Phaser.Scene): ListenerRegistry {
  const existing = registryMap.get(scene);
  if (existing) return existing.registry;

  const registry = new ListenerRegistry();
  const shutdownHandler = () => {
    registry.clear();
    registryMap.delete(scene);
  };
  scene.events.on('shutdown', shutdownHandler);

  registryMap.set(scene, { registry, shutdownHandler });
  return registry;
}

/**
 * Remove a scene's registry from the WeakMap and detach its shutdown hook,
 * returning the registry so the caller can manage cleanup manually.
 *
 * This is useful for tests, or when the caller wants to take over ownership
 * of the registry's lifecycle (e.g. moving from scene-scoped to manual
 * management).
 *
 * @param scene - The Phaser scene to dissociate.
 * @returns The registry that was associated with the scene, or `undefined`.
 */
export function removeSceneRegistry(scene: Phaser.Scene): ListenerRegistry | undefined {
  const existing = registryMap.get(scene);
  if (!existing) return undefined;

  scene.events.off('shutdown', existing.shutdownHandler);
  registryMap.delete(scene);
  return existing.registry;
}