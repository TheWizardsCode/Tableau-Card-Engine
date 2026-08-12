/**
 * dragDrop -- reusable drag-and-drop lifecycle module.
 *
 * Encapsulates the Phaser drag pattern first implemented bespoke in
 * Beleaguered Castle (see `setupDragAndDrop` in `BeleagueredCastleScene.ts`
 * and `makeDraggable`/`snapBack` in `BeleagueredCastleRenderer.ts`) into a
 * single configurable core-engine module:
 *
 * - registering draggable game objects (Image or Container) with per-object
 *   pickup validation (an illegal-card veto that keeps the card in place and
 *   plays illegal feedback at its origin);
 * - registering drop zones with hit-testing and per-zone acceptance
 *   validation;
 * - the dragstart / drag / dragend / drop lifecycle, origin capture + depth
 *   raise while dragging;
 * - valid-drop highlight callbacks (fired on dragstart, cleared on dragend);
 * - snap-back animation with reduced-motion fallback;
 * - illegal-feedback hooks (shake + `sfx-illegal-move`), defaulting to a
 *   container-safe shake that works for both Images and Containers.
 *
 * Main Street consumes this module for drag-to-buy/place
 * (CG-0MSKSAREE007AYSZ) and Beleaguered Castle is refactored onto it
 * afterwards (CG-0MSKSLDXQ008F5Y3).
 *
 * @module ui/dragDrop
 */

import { safePlaySound, COMMON_SFX_KEYS } from '../core-engine/SoundManager';
import { shakeIllegalMove } from './shakeIllegalMove';

/**
 * A draggable game object: anything with transform + depth components
 * (Image, Sprite, Container). The base `GameObject` type does not carry
 * `x`/`y`/`depth`, so intersect with the shared components.
 */
export type DraggableGameObject = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Transform &
  Phaser.GameObjects.Components.Depth;

/** Default depth applied to a dragged object while it is being dragged. */
export const DEFAULT_DRAG_DEPTH = 1000;

/** Default snap-back tween duration in milliseconds. */
export const DEFAULT_SNAP_BACK_DURATION = 200;

/** Default distance (px) a pointer must move before a drag starts. */
export const DEFAULT_DRAG_DISTANCE_THRESHOLD = 5;

/** Payload passed to drag lifecycle callbacks and validation functions. */
export interface DragDropPayload<TData = unknown> {
  /** The pointer driving the drag (may be undefined in tests). */
  pointer?: Phaser.Input.Pointer;
  /** The game object being dragged. */
  gameObject: DraggableGameObject;
  /** Caller-attached data (e.g. card id) supplied at registration. */
  data?: TData;
  /** The drop zone the object was released over (drop events only). */
  zone?: Phaser.GameObjects.Zone;
  /** Caller-attached zone data (e.g. slot index) for the drop target. */
  zoneData?: unknown;
}

/** Config for a single draggable game object. */
export interface DragDropObjectConfig<TData = unknown> {
  /** The game object to make draggable (Image or Container). */
  gameObject: DraggableGameObject;
  /** Optional caller data (e.g. card id) exposed via the payload. */
  data?: TData;
  /**
   * Optional hit area for Container-style draggables that are not already
   * interactive. Images use their texture frame automatically.
   */
  hitArea?: Phaser.Geom.Rectangle;
  /**
   * Pickup validation. Return `false` to veto the drag: the object stays at
   * its origin and the illegal feedback hook fires (illegal-card case).
   */
  canPickUp?: (payload: DragDropPayload<TData>) => boolean;
  /**
   * Called when the object is dropped on a registered zone whose
   * `canAccept` validation passes.
   */
  onDrop?: (payload: DragDropPayload<TData>) => void;
}

/** Config for a single drop zone. */
export interface DragDropZoneConfig<TZoneData = unknown> {
  /** A Phaser drop zone (created via `setRectangleDropZone`). */
  zone: Phaser.GameObjects.Zone;
  /** Optional caller data (e.g. slot index) exposed via the payload. */
  data?: TZoneData;
  /**
   * Zone acceptance validation. Return `false` to reject the drop
   * (snap-back + illegal feedback).
   */
  canAccept?: (payload: DragDropPayload) => boolean;
}

/** Options for {@link createDragDropManager}. */
export interface DragDropManagerConfig {
  /** The Phaser scene whose input plugin drives the drag lifecycle. */
  scene: Phaser.Scene;
  /** Depth applied to a dragged object while dragging. Default 1000. */
  dragDepth?: number;
  /** Snap-back tween duration in ms. Default 200. */
  snapBackDuration?: number;
  /** Skip the snap-back tween and restore position instantly. */
  reducedMotion?: boolean;
  /**
   * Pointer-movement threshold (px) before a drag starts, preserving
   * click-vs-drag coexistence for consumers.
   */
  dragDistanceThreshold?: number;
  /**
   * Fired after a drag passes pickup validation (i.e. on a valid
   * dragstart) — consumers show valid-drop highlights here.
   */
  onDragStart?: (payload: DragDropPayload) => void;
  /**
   * Fired when a drag ends (dragend or drop), regardless of outcome —
   * consumers clear their highlights here.
   */
  onDragEnd?: (payload: DragDropPayload) => void;
  /**
   * Illegal-feedback hook (shake + `sfx-illegal-move`). Fired on pickup
   * veto, snap-back (invalid drop), and drop-zone rejection. Defaults to a
   * container-safe shake via {@link shakeIllegalMove} (or a position shake
   * for objects without `setTint`).
   */
  onIllegal?: (payload: DragDropPayload) => void;
}

/** The drag-drop manager returned by {@link createDragDropManager}. */
export interface DragDropManager {
  /** Register a draggable object; makes it interactive + draggable. */
  registerDraggable(config: DragDropObjectConfig): void;
  /** Remove a draggable registration and clear its draggable flag. */
  unregisterDraggable(gameObject: DraggableGameObject): void;
  /** Register a drop zone with optional acceptance validation. */
  registerDropZone(config: DragDropZoneConfig): void;
  /** Remove a drop zone registration. */
  unregisterDropZone(zone: Phaser.GameObjects.Zone): void;
  /** Remove all drop zone registrations. */
  clearDropZones(): void;
  /** Return the caller data attached to a registered drop zone. */
  getDropZoneData(zone: Phaser.GameObjects.Zone): unknown;
  /** Enable (default) or disable all drag handling. */
  setEnabled(enabled: boolean): void;
  /** Toggle reduced-motion snap-back behaviour at runtime. */
  setReducedMotion(reducedMotion: boolean): void;
  /** Remove all input listeners and registrations. */
  destroy(): void;
}

/** Internal per-draggable state. */
interface DraggableEntry<TData = unknown> {
  config: DragDropObjectConfig<TData>;
  originX: number;
  originY: number;
  originDepth: number;
  /** True while the pointer is actively dragging this object. */
  dragging: boolean;
  /** True when pickup validation vetoed the drag (card stays in place). */
  vetoed: boolean;
}

/** Internal per-drop-zone state. */
interface DropZoneEntry {
  zone: Phaser.GameObjects.Zone;
  data: unknown;
  canAccept?: (payload: DragDropPayload) => boolean;
}

/** Container-safe illegal-move shake for objects without `setTint`. */
function shakeContainer(
  scene: Phaser.Scene,
  target: DraggableGameObject,
): void {
  const originalX = target.x;
  scene.tweens.add({
    targets: target,
    x: originalX - 5,
    duration: 50,
    yoyo: true,
    repeat: 2,
    ease: 'Sine.inOut',
    onComplete: () => {
      target.x = originalX;
    },
  });
}

/**
 * Rectangle hit-area containment test equivalent to
 * `Phaser.Geom.Rectangle.Contains` without a runtime Phaser import
 * (keeps the module importable in Node unit tests).
 */
function rectangleContains(
  rect: Phaser.Geom.Rectangle,
  x: number,
  y: number,
): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;
  return (
    rect.x <= x && rect.x + rect.width >= x &&
    rect.y <= y && rect.y + rect.height >= y
  );
}

/**
 * Create a drag-drop manager on the given scene.
 *
 * Registers the scene-level `dragstart`/`drag`/`dragend`/`drop` input
 * handlers once; per-object behaviour is configured via
 * {@link DragDropManager.registerDraggable} and
 * {@link DragDropManager.registerDropZone}.
 *
 * @param config - Manager configuration.
 * @returns A {@link DragDropManager} instance.
 */
export function createDragDropManager(config: DragDropManagerConfig): DragDropManager {
  const scene = config.scene;
  const dragDepth = config.dragDepth ?? DEFAULT_DRAG_DEPTH;
  const snapBackDuration = config.snapBackDuration ?? DEFAULT_SNAP_BACK_DURATION;

  const draggables = new Map<DraggableGameObject, DraggableEntry>();
  const dropZones = new Map<Phaser.GameObjects.Zone, DropZoneEntry>();

  let enabled = true;
  let reducedMotion = config.reducedMotion ?? false;

  // Apply the click-vs-drag threshold so pointerup-without-drag still
  // reaches the caller's click path (dragDistanceThreshold semantics).
  if (config.dragDistanceThreshold !== undefined) {
    scene.input.dragDistanceThreshold = config.dragDistanceThreshold;
  }

  const defaultIllegal = (payload: DragDropPayload): void => {
    const target = payload.gameObject as Phaser.GameObjects.Image;
    try {
      if (typeof target.setTint === 'function') {
        shakeIllegalMove({ scene, target });
      } else {
        safePlaySound(scene as never, COMMON_SFX_KEYS.ILLEGAL_MOVE);
        shakeContainer(scene, payload.gameObject);
      }
    } catch {
      // Illegal feedback must never crash the drag lifecycle (e.g. in
      // headless / test environments lacking a rectangle factory).
      safePlaySound(scene as never, COMMON_SFX_KEYS.ILLEGAL_MOVE);
    }
  };

  const onIllegal = config.onIllegal ?? defaultIllegal;

  const makePayload = (
    pointer: Phaser.Input.Pointer | undefined,
    gameObject: DraggableGameObject,
  ): DragDropPayload => ({ pointer, gameObject });

  const restoreOrigin = (entry: DraggableEntry, gameObject: DraggableGameObject): void => {
    gameObject.x = entry.originX;
    gameObject.y = entry.originY;
    gameObject.setDepth(entry.originDepth);
  };

  /** Snap a dragged object back to its captured origin (position + depth). */
  const snapBack = (
    entry: DraggableEntry,
    gameObject: DraggableGameObject,
    payload: DragDropPayload,
  ): void => {
    if (reducedMotion) {
      restoreOrigin(entry, gameObject);
      onIllegal(payload);
      return;
    }
    scene.tweens.add({
      targets: gameObject,
      x: entry.originX,
      y: entry.originY,
      duration: snapBackDuration,
      ease: 'Power2',
      onComplete: () => {
        gameObject.setDepth(entry.originDepth);
        onIllegal(payload);
      },
    });
  };

  const handleDragStart = (
    pointer: Phaser.Input.Pointer,
    gameObject: DraggableGameObject,
  ): void => {
    if (!enabled) return;
    const entry = draggables.get(gameObject);
    if (!entry) return;

    // Capture origin + raise depth for the drag.
    entry.originX = gameObject.x;
    entry.originY = gameObject.y;
    entry.originDepth = gameObject.depth;
    entry.dragging = true;
    entry.vetoed = false;

    const payload = makePayload(pointer, gameObject);
    payload.data = entry.config.data;

    // Pickup validation: vetoed drags keep the card in place and play
    // illegal feedback at its origin (illegal-card case).
    if (entry.config.canPickUp && !entry.config.canPickUp(payload)) {
      entry.vetoed = true;
      gameObject.setDepth(entry.originDepth);
      onIllegal(payload);
      return;
    }

    gameObject.setDepth(dragDepth);
    config.onDragStart?.(payload);
  };

  const handleDrag = (
    _pointer: Phaser.Input.Pointer,
    gameObject: DraggableGameObject,
    dragX: number,
    dragY: number,
  ): void => {
    if (!enabled) return;
    const entry = draggables.get(gameObject);
    if (!entry || !entry.dragging || entry.vetoed) return;
    gameObject.x = dragX;
    gameObject.y = dragY;
  };

  const handleDrop = (
    pointer: Phaser.Input.Pointer,
    gameObject: DraggableGameObject,
    zone: Phaser.GameObjects.Zone,
  ): void => {
    if (!enabled) return;
    const entry = draggables.get(gameObject);
    if (!entry || entry.vetoed) return;

    const zoneEntry = dropZones.get(zone);
    const payload = makePayload(pointer, gameObject);
    payload.data = entry.config.data;
    payload.zone = zone;
    payload.zoneData = zoneEntry?.data;

    const accepted = zoneEntry && (!zoneEntry.canAccept || zoneEntry.canAccept(payload));

    if (accepted && entry.config.onDrop) {
      // Successful drop: restore depth, clear highlights, notify caller.
      entry.dragging = false;
      entry.vetoed = false;
      gameObject.setDepth(entry.originDepth);
      config.onDragEnd?.(payload);
      entry.config.onDrop(payload);
      return;
    }

    // Invalid drop (unregistered zone, rejected by canAccept, or no drop
    // handler): snap-back + illegal feedback (illegal-move case).
    entry.dragging = false;
    config.onDragEnd?.(payload);
    snapBack(entry, gameObject, payload);
  };

  const handleDragEnd = (
    pointer: Phaser.Input.Pointer,
    gameObject: DraggableGameObject,
    dropped: boolean,
  ): void => {
    if (!enabled) return;
    const entry = draggables.get(gameObject);
    if (!entry || !entry.dragging) return;

    entry.dragging = false;
    const payload = makePayload(pointer, gameObject);
    payload.data = entry.config.data;

    if (entry.vetoed) {
      // Pickup veto already played illegal feedback; ensure the card is
      // still at its origin and clear the veto flag.
      entry.vetoed = false;
      restoreOrigin(entry, gameObject);
      config.onDragEnd?.(payload);
      return;
    }

    config.onDragEnd?.(payload);

    if (!dropped) {
      // Released outside any drop zone: snap back + illegal feedback.
      snapBack(entry, gameObject, payload);
      return;
    }

    // Released over a registered Phaser drop zone: the `drop` handler has
    // already accepted it or initiated snap-back. Restore depth only.
    gameObject.setDepth(entry.originDepth);
  };

  scene.input.on('dragstart', handleDragStart);
  scene.input.on('drag', handleDrag);
  scene.input.on('drop', handleDrop);
  scene.input.on('dragend', handleDragEnd);

  const manager: DragDropManager = {
    registerDraggable(objConfig) {
      const { gameObject } = objConfig;
      if (!gameObject.input) {
        if (objConfig.hitArea) {
          gameObject.setInteractive(objConfig.hitArea, rectangleContains);
        } else {
          gameObject.setInteractive({ draggable: true });
        }
      }
      scene.input.setDraggable(gameObject, true);
      draggables.set(gameObject, {
        config: objConfig,
        originX: gameObject.x,
        originY: gameObject.y,
        originDepth: gameObject.depth,
        dragging: false,
        vetoed: false,
      });
    },

    unregisterDraggable(gameObject) {
      draggables.delete(gameObject);
      if (gameObject.input) {
        scene.input.setDraggable(gameObject, false);
      }
    },

    registerDropZone(zoneConfig) {
      dropZones.set(zoneConfig.zone, {
        zone: zoneConfig.zone,
        data: zoneConfig.data,
        canAccept: zoneConfig.canAccept,
      });
    },

    unregisterDropZone(zone) {
      dropZones.delete(zone);
    },

    clearDropZones() {
      dropZones.clear();
    },

    getDropZoneData(zone) {
      return dropZones.get(zone)?.data;
    },

    setEnabled(nextEnabled) {
      enabled = nextEnabled;
    },

    setReducedMotion(next) {
      reducedMotion = next;
    },

    destroy() {
      scene.input.off('dragstart', handleDragStart);
      scene.input.off('drag', handleDrag);
      scene.input.off('drop', handleDrop);
      scene.input.off('dragend', handleDragEnd);
      draggables.clear();
      dropZones.clear();
    },
  };

  return manager;
}
