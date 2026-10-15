/**
 * Centralised mock factory helpers for Phaser unit tests.
 *
 * Replaces duplicated inline mock definitions across test files.
 * Each factory returns objects that satisfy the minimal Phaser interfaces
 * required by the code under test, using vi.fn() for all observable behaviour
 * so callers can assert on calls and return values.
 *
 * @module tests/helpers/MockFactory
 */

import { vi, type Mock } from 'vitest';

/**
 * Callable mock spy type.
 *
 * Vitest 4's `MockFn` resolves to
 * `Mock<Procedure | Constructable>`, which is *not* callable in a typed
 * context because the union includes a constructor signature ("Value of type
 * 'Mock<Procedure | Constructable>' is not callable"). An explicit function
 * signature keeps the spy callable while retaining the full `MockInstance`
 * API (`.mockReturnValue`, `.toHaveBeenCalled`, …).
 */
export type MockFn = Mock<(...args: any[]) => any>;

// ── Types ───────────────────────────────────────────────────

/** Minimal mock of a Phaser tween. */
export interface MockTween {
  destroy: MockFn;
}

/** Minimal mock of a Phaser text object. */
export interface MockText {
  setText: MockFn;
  setOrigin: MockFn;
  setDepth: MockFn;
  setTint: MockFn;
  clearTint: MockFn;
  setColor: MockFn;
  setInteractive: MockFn;
  on: MockFn;
  destroy: MockFn;
  text: string;
}

/** Minimal mock of a Phaser rectangle / graphics primitive. */
export interface MockRectangle {
  setStrokeStyle: MockFn;
  setFillStyle: MockFn;
  setDepth: MockFn;
  setInteractive: MockFn;
  setOrigin: MockFn;
  on: MockFn;
  destroy: MockFn;
  input: { enabled: boolean };
  _handlers: Record<string, Function>;
}

/** Minimal mock of a Phaser container. */
export interface MockContainer {
  add: MockFn;
  setDepth: MockFn;
  setScale: MockFn;
  setVisible: MockFn;
  destroy: MockFn;
  list: unknown[];
}

/** Minimal mock of a Phaser image/sprite used as a card target. */
export interface MockImage {
  x: number;
  y: number;
  texture: { key: string };
  active: boolean;
  setTexture: MockFn;
  setInteractive: MockFn;
  setTint: MockFn;
  clearTint: MockFn;
  setOrigin: MockFn;
  setAlpha: MockFn;
  setDepth: MockFn;
  setPosition: MockFn;
  setRotation: MockFn;
  setScale: MockFn;
  setDisplaySize: MockFn;
  on: MockFn;
  off: MockFn;
  destroy: MockFn;
  scaleX: number;
  scaleY: number;
  alpha: number;
  rotation: number;
  displayWidth: number;
  displayHeight: number;
}

// ── Factory: createMockTween ─────────────────────────────────

/** Create a mock tween with a destroy spy. */
export function createMockTween(): MockTween {
  return { destroy: vi.fn() } as unknown as MockTween;
}

// ── Factory: createMockText ──────────────────────────────────

/** Create a mock text object with standard methods. */
export function createMockText(): MockText {
  const handlers: Record<string, Function> = {};
  return {
    text: '',
    setText: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setTint: vi.fn().mockReturnThis(),
    clearTint: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    on: vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
      return handlers;
    }),
    destroy: vi.fn(),
  } as unknown as MockText;
}

// ── Factory: createMockRectangle ─────────────────────────────

/** Create a mock rectangle with event handler capture. */
export function createMockRectangle(): MockRectangle {
  const handlers: Record<string, Function> = {};
  return {
    setStrokeStyle: vi.fn().mockReturnThis(),
    setFillStyle: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(),
    on: vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
      return handlers;
    }),
    destroy: vi.fn(),
    input: { enabled: true },
    _handlers: handlers,
  } as unknown as MockRectangle;
}

// ── Factory: createMockContainer ─────────────────────────────

/** Create a mock container that records added children. */
export function createMockContainer(): MockContainer {
  const children: unknown[] = [];
  return {
    add: vi.fn((child: unknown) => { children.push(child); }),
    setDepth: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    list: children,
  } as unknown as MockContainer;
}

// ── Factory: createMockImage ─────────────────────────────────

/** Create a mock image/sprite with standard transform methods. */
export function createMockImage(
  x = 0,
  y = 0,
  texture = 'default',
): MockImage {
  return {
    x,
    y,
    texture: { key: texture },
    active: true,
    setTexture: vi.fn(),
    setInteractive: vi.fn().mockReturnThis(),
    setTint: vi.fn().mockReturnThis(),
    clearTint: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setPosition: vi.fn().mockReturnThis(),
    setRotation: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    setDisplaySize: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    scaleX: 1,
    scaleY: 1,
    alpha: 1,
    rotation: 0,
    displayWidth: 48,
    displayHeight: 65,
  } as unknown as MockImage;
}

// ── Factory: createMockSceneWithTweens ───────────────────────

/**
 * Minimal mock of a Phaser.Scene with full tween tracking, add.image/text/
 * graphics support, and event capture.  Extends nothing — callers cast to
 * Phaser.Scene where needed.
 */
export interface MockSceneWithTweens {
  tweens: { add: MockFn };
  tweensList: Phaser.Types.Tweens.TweenBuilderConfig[];
  add: {
    image: MockFn;
    text: MockFn;
    graphics: MockFn;
    rectangle: MockFn;
    container: MockFn;
  };
  sound: {
    play: MockFn;
    add: MockFn;
  };
  soundManager: {
    play: MockFn;
  };
  input: {
    on: MockFn;
    off: MockFn;
    setDraggable: MockFn;
    dragDistanceThreshold: number;
  };
  events: Record<string, (...args: any[]) => void>;
  eventsObj: Phaser.Events.EventEmitter;
  scene: { start: MockFn };
  _mockImage: MockImage;
  _mockText: MockText;
  _mockRect: MockRectangle;
  _mockContainer: MockContainer;
}

export interface CreateMockSceneOptions {
  /** Automatically call tween onComplete via setTimeout (default: true). */
  autoTweenComplete?: boolean;
}

/**
 * Create a mock Phaser.Scene with full tween tracking, add.image/text/graphics
 * support, and event capture.
 *
 * @param overrides — additional properties to merge onto the scene
 * @param options — factory behaviour options
 */
export function createMockSceneWithTweens(
  overrides: Record<string, unknown> = {},
  options: CreateMockSceneOptions = {},
): MockSceneWithTweens {
  const tweensList: Phaser.Types.Tweens.TweenBuilderConfig[] = [];
  const events: Record<string, (...args: any[]) => void> = {};
  const images: MockImage[] = [];
  const texts: MockText[] = [];

  const autoTweenComplete = options.autoTweenComplete ?? true;

  const mockImage = vi.fn(
    (_x: number, _y: number, texture: string) => {
      const img = createMockImage(0, 0, texture);
      images.push(img);
      return img;
    },
  );

  const mockText = vi.fn(
    (x: number, y: number, text: string) => {
      const txt = createMockText();
      (txt as any).text = text;
      (txt as any).x = x;
      (txt as any).y = y;
      texts.push(txt);
      return txt;
    },
  );

  const mockRect = vi.fn(() => createMockRectangle());
  const mockContainer = vi.fn(() => createMockContainer());

  return {
    tweens: {
      add: vi.fn((config: Phaser.Types.Tweens.TweenBuilderConfig) => {
        tweensList.push(config);
        if (autoTweenComplete) {
          const onComplete = (config as any).onComplete as (() => void) | undefined;
          if (onComplete) {
            setTimeout(() => onComplete(), 0);
          }
        }
        return createMockTween();
      }),
    },
    tweensList,
    add: {
      image: mockImage,
      text: mockText,
      graphics: vi.fn().mockReturnValue({
        fillStyle: vi.fn().mockReturnThis(),
        fillRoundedRect: vi.fn().mockReturnThis(),
        lineStyle: vi.fn().mockReturnThis(),
        strokeRoundedRect: vi.fn().mockReturnThis(),
        clear: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      }),
      rectangle: mockRect,
      container: mockContainer,
    },
    sound: {
      play: vi.fn(),
      add: vi.fn(),
    },
    input: {
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        events[event] = handler;
      }),
      off: vi.fn(),
      setDraggable: vi.fn(),
      dragDistanceThreshold: 0,
    },
    events,
    eventsObj: {
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      emit: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
    } as unknown as Phaser.Events.EventEmitter,
    _mockImage: images[0] as MockImage,
    _mockText: texts[0] as MockText,
    _mockRect: createMockRectangle(),
    _mockContainer: createMockContainer(),
    scene: { start: vi.fn() },
    ...overrides,
  } as unknown as MockSceneWithTweens;
}

// ── Factory: createMockScene (shorthand) ─────────────────────

/**
 * Create a minimal Phaser.Scene mock (alias for createMockSceneWithTweens
 * with no overrides).  Useful for tests that only need `scene.tweens.add`.
 */
export function createMockScene(): MockSceneWithTweens {
  return createMockSceneWithTweens();
}
