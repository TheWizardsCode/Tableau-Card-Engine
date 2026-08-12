/**
 * Unit tests for the reusable drag-drop lifecycle module (src/ui/dragDrop.ts).
 *
 * The module encapsulates the Phaser drag pattern extracted from Beleaguered
 * Castle: dragstart/drag/dragend/drop handling, origin capture + depth raise,
 * pickup validation (illegal-card veto), drop-zone hit-testing, valid-drop
 * highlight callbacks, snap-back animation (reduced-motion fallback), and
 * illegal-feedback hooks.
 *
 * Phaser input events are simulated by recording handlers registered on a mock
 * scene.input; the tests drive the lifecycle by invoking those handlers with
 * mock game objects / drop zones.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import Phaser from 'phaser';

import {
  createDragDropManager,
  type DragDropManager,
  type DragDropManagerConfig,
  type DraggableGameObject,
} from '../../src/ui/dragDrop';

// ── Mock helpers ────────────────────────────────────────────

interface MockScene {
  scene: Phaser.Scene;
  events: Record<string, (...args: any[]) => void>;
  tweenConfigs: Phaser.Types.Tweens.TweenBuilderConfig[];
  input: any;
}

function createMockScene(): MockScene {
  const events: Record<string, (...args: any[]) => void> = {};
  const tweenConfigs: Phaser.Types.Tweens.TweenBuilderConfig[] = [];
  const input = {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      events[event] = handler;
    }),
    off: vi.fn(),
    setDraggable: vi.fn(),
    dragDistanceThreshold: 0,
  };
  const scene = {
    input,
    tweens: {
      add: vi.fn((config: Phaser.Types.Tweens.TweenBuilderConfig) => {
        tweenConfigs.push(config);
        // Faithful to real Phaser tweens: apply x/y targets immediately,
        // then invoke onComplete so callers observe restored positions.
        const targets = Array.isArray(config.targets) ? config.targets : [config.targets];
        for (const t of targets) {
          if (t && config.x !== undefined) t.x = config.x;
          if (t && config.y !== undefined) t.y = config.y;
        }
        return { destroy: vi.fn() };
      }),
    },
    sound: { play: vi.fn() },
  } as unknown as Phaser.Scene;
  return { scene, events, tweenConfigs, input };
}

interface MockGameObject {
  x: number;
  y: number;
  depth: number;
  input: { draggable: boolean } | null;
  setPosition: ReturnType<typeof vi.fn>;
  setDepth: ReturnType<typeof vi.fn>;
  setInteractive: ReturnType<typeof vi.fn>;
  setTint: ReturnType<typeof vi.fn>;
  clearTint: ReturnType<typeof vi.fn>;
  setX: ReturnType<typeof vi.fn>;
  displayWidth: number;
  displayHeight: number;
  originX: number;
  originY: number;
  rotation: number;
  parentContainer: null;
}

function createMockGameObject(x = 100, y = 200, depth = 5): MockGameObject {
  const go: MockGameObject = {
    x,
    y,
    depth,
    input: null,
    setPosition: vi.fn((nx: number, ny: number) => { go.x = nx; go.y = ny; }),
    setDepth: vi.fn((d: number) => { go.depth = d; }),
    setInteractive: vi.fn(),
    setTint: vi.fn(),
    clearTint: vi.fn(),
    setX: vi.fn((nx: number) => { go.x = nx; }),
    displayWidth: 96,
    displayHeight: 130,
    originX: 0.5,
    originY: 0.5,
    rotation: 0,
    parentContainer: null,
  };
  return go;
}

function createMockZone(name = 'zone'): Phaser.GameObjects.Zone {
  return {
    name,
    setRectangleDropZone: vi.fn(),
    setData: vi.fn(() => ({ setRectangleDropZone: vi.fn() })),
    getData: vi.fn(() => undefined),
  } as unknown as Phaser.GameObjects.Zone;
}

const pointer = {} as Phaser.Input.Pointer;

function makeManager(
  overrides: Partial<DragDropManagerConfig> = {},
  mock = createMockScene(),
): { manager: DragDropManager; mock: MockScene } {
  const manager = createDragDropManager({ scene: mock.scene, ...overrides });
  return { manager, mock };
}

function runTweenComplete(mock: MockScene, index = 0): void {
  const config = mock.tweenConfigs[index];
  expect(config).toBeDefined();
  (config.onComplete as (tween: Phaser.Tweens.Tween) => void)?.({} as Phaser.Tweens.Tween);
}

// ── Tests ───────────────────────────────────────────────────

describe('dragDrop module registration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registers the drag lifecycle handlers on create', () => {
    const { mock } = makeManager();

    // Fresh manager: handlers captured
    expect(Object.keys(mock.events).sort()).toEqual(['drag', 'dragend', 'dragstart', 'drop']);
  });

  it('registerDraggable sets the draggable flag via scene.input', () => {
    const { mock, manager } = makeManager();
    const go = createMockGameObject();
    go.input = { draggable: false };

    manager.registerDraggable({ gameObject: go as unknown as DraggableGameObject, data: { id: 'c1' } });

    expect(mock.input.setDraggable).toHaveBeenCalledWith(go, true);
  });

  it('unregisterDraggable clears the draggable flag', () => {
    const { mock, manager } = makeManager();
    const go = createMockGameObject();
    go.input = { draggable: true };

    manager.registerDraggable({ gameObject: go as unknown as DraggableGameObject });
    manager.unregisterDraggable(go as unknown as DraggableGameObject);

    expect(mock.input.setDraggable).toHaveBeenLastCalledWith(go, false);
  });

  it('registers and clears drop zones', () => {
    const { manager } = makeManager();
    const zone = createMockZone();
    void manager;

    manager.registerDropZone({ zone, data: { slot: 3 }, canAccept: () => true });
    expect(manager.getDropZoneData(zone)).toEqual({ slot: 3 });

    manager.clearDropZones();
    expect(manager.getDropZoneData(zone)).toBeUndefined();
  });

  it('applies dragDistanceThreshold to scene.input', () => {
    const mock = createMockScene();
    makeManager({ dragDistanceThreshold: 5 }, mock);
    expect(mock.input.dragDistanceThreshold).toBe(5);
  });

  it('destroy removes all input listeners', () => {
    const { mock, manager } = makeManager();
    manager.destroy();
    expect(mock.input.off).toHaveBeenCalledWith('dragstart', expect.any(Function));
    expect(mock.input.off).toHaveBeenCalledWith('drag', expect.any(Function));
    expect(mock.input.off).toHaveBeenCalledWith('dragend', expect.any(Function));
    expect(mock.input.off).toHaveBeenCalledWith('drop', expect.any(Function));
  });
});

describe('dragDrop drag lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('dragstart captures origin and raises depth; drag moves the object', () => {
    const { mock, manager } = makeManager();
    const go = createMockGameObject(100, 200, 5);
    go.input = { draggable: true };
    manager.registerDraggable({ gameObject: go as unknown as DraggableGameObject });

    mock.events.dragstart(pointer, go);
    expect(go.depth).toBe(1000); // default dragDepth
    expect(go.x).toBe(100);
    expect(go.y).toBe(200);

    mock.events.drag(pointer, go, 150, 260);
    expect(go.x).toBe(150);
    expect(go.y).toBe(260);
  });

  it('dragstart fires the onDragStart highlight callback with payload data', () => {
    const onDragStart = vi.fn();
    const { mock, manager } = makeManager({ onDragStart });
    const go = createMockGameObject();
    go.input = { draggable: true };
    manager.registerDraggable({ gameObject: go as unknown as DraggableGameObject, data: { id: 'c1' } });

    mock.events.dragstart(pointer, go);
    expect(onDragStart).toHaveBeenCalledWith(expect.objectContaining({ gameObject: go, data: { id: 'c1' } }));
  });

  it('dragend fires onDragEnd highlight clear callback', () => {
    const onDragEnd = vi.fn();
    const { mock, manager } = makeManager({ onDragEnd });
    const go = createMockGameObject();
    go.input = { draggable: true };
    manager.registerDraggable({ gameObject: go as unknown as DraggableGameObject });

    mock.events.dragstart(pointer, go);
    mock.events.dragend(pointer, go, false);
    expect(onDragEnd).toHaveBeenCalledWith(expect.objectContaining({ gameObject: go }));
  });

  it('ignores unregistered draggables', () => {
    const onDragStart = vi.fn();
    const { mock, manager } = makeManager({ onDragStart });
    const go = createMockGameObject();
    go.input = { draggable: true };
    void manager;

    mock.events.dragstart(pointer, go);
    expect(go.depth).toBe(5); // unchanged
    expect(onDragStart).not.toHaveBeenCalled();
  });
});

describe('dragDrop pickup validation (illegal card veto)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('vetoes the drag when canPickUp returns false and fires illegal feedback at origin', () => {
    const onIllegal = vi.fn();
    const onDragStart = vi.fn();
    const { mock, manager } = makeManager({ onIllegal, onDragStart });
    const go = createMockGameObject(100, 200, 5);
    go.input = { draggable: true };
    manager.registerDraggable({
      gameObject: go as unknown as DraggableGameObject,
      canPickUp: () => false,
    });

    mock.events.dragstart(pointer, go);

    // Card does not leave the row: depth unchanged, position unchanged
    expect(go.depth).toBe(5);
    expect(go.x).toBe(100);
    expect(go.y).toBe(200);
    // Illegal feedback fired at origin
    expect(onIllegal).toHaveBeenCalledWith(expect.objectContaining({ gameObject: go }));
    // Valid-drop highlight NOT shown
    expect(onDragStart).not.toHaveBeenCalled();

    // Subsequent drag events do not move the card
    mock.events.drag(pointer, go, 150, 260);
    expect(go.x).toBe(100);
    expect(go.y).toBe(200);
  });

  it('allows the drag when canPickUp returns true', () => {
    const onIllegal = vi.fn();
    const { mock, manager } = makeManager({ onIllegal });
    const go = createMockGameObject(100, 200, 5);
    go.input = { draggable: true };
    manager.registerDraggable({
      gameObject: go as unknown as DraggableGameObject,
      canPickUp: () => true,
    });

    mock.events.dragstart(pointer, go);
    expect(go.depth).toBe(1000);
    expect(onIllegal).not.toHaveBeenCalled();

    mock.events.drag(pointer, go, 150, 260);
    expect(go.x).toBe(150);
    expect(go.y).toBe(260);
  });

  it('passes the payload to canPickUp for caller validation', () => {
    const canPickUp = vi.fn(() => true);
    const { mock, manager } = makeManager();
    const go = createMockGameObject();
    go.input = { draggable: true };
    manager.registerDraggable({
      gameObject: go as unknown as DraggableGameObject,
      data: { id: 'c1' },
      canPickUp,
    });

    mock.events.dragstart(pointer, go);
    expect(canPickUp).toHaveBeenCalledWith(expect.objectContaining({ gameObject: go, data: { id: 'c1' } }));
  });
});

describe('dragDrop snap-back and invalid drops', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('snap-backs with a tween when released outside any drop zone (dropped=false)', () => {
    const onIllegal = vi.fn();
    const { mock, manager } = makeManager({ onIllegal });
    const go = createMockGameObject(100, 200, 5);
    go.input = { draggable: true };
    manager.registerDraggable({ gameObject: go as unknown as DraggableGameObject });

    mock.events.dragstart(pointer, go);
    mock.events.drag(pointer, go, 300, 400);
    mock.events.dragend(pointer, go, false);

    expect(mock.tweenConfigs.length).toBe(1);
    const tween = mock.tweenConfigs[0];
    expect(tween.targets).toBe(go);
    expect(tween.x).toBe(100);
    expect(tween.y).toBe(200);
    expect(onIllegal).not.toHaveBeenCalled(); // fired after snap-back completes

    runTweenComplete(mock);
    expect(go.depth).toBe(5); // depth restored
    expect(onIllegal).toHaveBeenCalledWith(expect.objectContaining({ gameObject: go }));
  });

  it('reduced-motion snap-back is instant: position restored without a tween', () => {
    const onIllegal = vi.fn();
    const { mock, manager } = makeManager({ reducedMotion: true, onIllegal });
    const go = createMockGameObject(100, 200, 5);
    go.input = { draggable: true };
    manager.registerDraggable({ gameObject: go as unknown as DraggableGameObject });

    mock.events.dragstart(pointer, go);
    mock.events.drag(pointer, go, 300, 400);
    mock.events.dragend(pointer, go, false);

    expect(mock.tweenConfigs.length).toBe(0);
    expect(go.x).toBe(100);
    expect(go.y).toBe(200);
    expect(go.depth).toBe(5);
    expect(onIllegal).toHaveBeenCalled();
  });

  it('a valid drop on a registered zone fires onDrop with zone data and does not snap-back', () => {
    const onDrop = vi.fn();
    const { mock, manager } = makeManager();
    const go = createMockGameObject(100, 200, 5);
    go.input = { draggable: true };
    const zone = createMockZone();

    manager.registerDraggable({
      gameObject: go as unknown as DraggableGameObject,
      onDrop,
    });
    manager.registerDropZone({ zone, data: { slot: 3 }, canAccept: () => true });

    mock.events.dragstart(pointer, go);
    mock.events.drop(pointer, go, zone);

    expect(onDrop).toHaveBeenCalledWith(expect.objectContaining({ gameObject: go, zone, zoneData: { slot: 3 } }));
    expect(mock.tweenConfigs.length).toBe(0); // no snap-back
    expect(go.depth).toBe(5); // depth restored
  });

  it('a drop rejected by canAccept snap-backs and fires illegal feedback', () => {
    const onIllegal = vi.fn();
    const onDrop = vi.fn();
    const { mock, manager } = makeManager({ onIllegal });
    const go = createMockGameObject(100, 200, 5);
    go.input = { draggable: true };
    const zone = createMockZone();

    manager.registerDraggable({ gameObject: go as unknown as DraggableGameObject, onDrop });
    manager.registerDropZone({ zone, data: { slot: 3 }, canAccept: () => false });

    mock.events.dragstart(pointer, go);
    mock.events.drag(pointer, go, 300, 400);
    mock.events.drop(pointer, go, zone);

    expect(onDrop).not.toHaveBeenCalled();
    expect(mock.tweenConfigs.length).toBe(1);
    runTweenComplete(mock);
    expect(go.x).toBe(100);
    expect(go.y).toBe(200);
    expect(onIllegal).toHaveBeenCalled();
  });

  it('a drop on an unregistered zone is invalid: snap-back + illegal feedback', () => {
    const onIllegal = vi.fn();
    const { mock, manager } = makeManager({ onIllegal });
    const go = createMockGameObject(100, 200, 5);
    go.input = { draggable: true };
    const zone = createMockZone();

    manager.registerDraggable({ gameObject: go as unknown as DraggableGameObject });

    mock.events.dragstart(pointer, go);
    mock.events.drag(pointer, go, 300, 400);
    mock.events.drop(pointer, go, zone);

    expect(mock.tweenConfigs.length).toBe(1);
    runTweenComplete(mock);
    expect(go.x).toBe(100);
    expect(onIllegal).toHaveBeenCalled();
  });

  it('dragend after an accepted drop does not snap-back again', () => {
    const onDrop = vi.fn();
    const { mock, manager } = makeManager();
    const go = createMockGameObject(100, 200, 5);
    go.input = { draggable: true };
    const zone = createMockZone();

    manager.registerDraggable({ gameObject: go as unknown as DraggableGameObject, onDrop });
    manager.registerDropZone({ zone, canAccept: () => true });

    mock.events.dragstart(pointer, go);
    mock.events.drop(pointer, go, zone);
    mock.events.dragend(pointer, go, true);

    expect(mock.tweenConfigs.length).toBe(0);
    expect(onDrop).toHaveBeenCalledTimes(1);
  });
});

describe('dragDrop enabled/blocked control', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('setEnabled(false) blocks dragstart, drag, drop, and dragend handling', () => {
    const onDrop = vi.fn();
    const onDragStart = vi.fn();
    const { mock, manager } = makeManager({ onDragStart });
    const go = createMockGameObject(100, 200, 5);
    go.input = { draggable: true };
    const zone = createMockZone();

    manager.registerDraggable({ gameObject: go as unknown as DraggableGameObject, onDrop });
    manager.registerDropZone({ zone, canAccept: () => true });

    manager.setEnabled(false);

    mock.events.dragstart(pointer, go);
    expect(go.depth).toBe(5);
    expect(onDragStart).not.toHaveBeenCalled();

    mock.events.drag(pointer, go, 150, 260);
    expect(go.x).toBe(100);

    mock.events.drop(pointer, go, zone);
    expect(onDrop).not.toHaveBeenCalled();

    mock.events.dragend(pointer, go, false);
    expect(mock.tweenConfigs.length).toBe(0);
  });

  it('setEnabled(true) re-enables handling', () => {
    const { mock, manager } = makeManager();
    const go = createMockGameObject(100, 200, 5);
    go.input = { draggable: true };
    manager.registerDraggable({ gameObject: go as unknown as DraggableGameObject });

    manager.setEnabled(false);
    manager.setEnabled(true);

    mock.events.dragstart(pointer, go);
    expect(go.depth).toBe(1000);
  });

  it('setReducedMotion toggles snap-back behaviour at runtime', () => {
    const { mock, manager } = makeManager();
    const go = createMockGameObject(100, 200, 5);
    go.input = { draggable: true };
    manager.registerDraggable({ gameObject: go as unknown as DraggableGameObject });

    manager.setReducedMotion(true);
    mock.events.dragstart(pointer, go);
    mock.events.dragend(pointer, go, false);
    expect(mock.tweenConfigs.length).toBe(0);
    expect(go.x).toBe(100);
  });
});

describe('dragDrop container draggables', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registerDraggable accepts a hit area for container-style objects', () => {
    const { manager } = makeManager();
    const container = createMockGameObject(200, 300, 10);
    container.input = null; // containers need explicit hit areas

    manager.registerDraggable({
      gameObject: container as unknown as DraggableGameObject,
      hitArea: { x: -48, y: -65, width: 96, height: 130 } as unknown as Phaser.Geom.Rectangle,
    });

    expect(container.setInteractive).toHaveBeenCalledWith(
      { x: -48, y: -65, width: 96, height: 130 },
      expect.any(Function),
    );
  });

  it('drag lifecycle works for container-style draggables', () => {
    const onIllegal = vi.fn();
    const { mock, manager } = makeManager({ onIllegal });
    const container = createMockGameObject(200, 300, 10);
    container.input = { draggable: true };

    manager.registerDraggable({ gameObject: container as unknown as DraggableGameObject });

    mock.events.dragstart(pointer, container);
    expect(container.depth).toBe(1000);
    mock.events.drag(pointer, container, 250, 350);
    expect(container.x).toBe(250);
    expect(container.y).toBe(350);
    mock.events.dragend(pointer, container, false);
    expect(mock.tweenConfigs.length).toBe(1);
    runTweenComplete(mock);
    expect(container.depth).toBe(10);
    expect(onIllegal).toHaveBeenCalled();
  });
});
