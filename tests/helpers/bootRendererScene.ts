/**
 * Renderer-parity test harness: boot a scene under a **forced** renderer,
 * capture console warnings, and probe framebuffer pixels.
 *
 * ## Why this module exists
 *
 * Phaser 4's WebGL renderer behaves differently from Canvas for several
 * features (most notably `GeometryMask`/`GameObject.setMask`, which is
 * Canvas-only and logs a warning under WebGL). A browser test that asks for
 * WebGL but silently receives Canvas therefore proves nothing: it renders a
 * green suite while the shipped WebGL build is broken.
 *
 * This harness makes the renderer explicit:
 *
 * - {@link bootRendererScene} creates the game with the **requested**
 *   `Phaser.CANVAS` / `Phaser.WEBGL` type, waits for the scene to become
 *   active, then asserts that the renderer Phaser actually created is the
 *   requested one. A downgrade is a loud failure, never a pass.
 * - If the environment cannot provide the requested renderer (no WebGL
 *   context), the harness records a skip reason (see
 *   {@link getRendererSkipReasons}) and throws
 *   {@link RendererUnavailableError} — so a WebGL assertion can never turn
 *   green on a Canvas fallback. A test may additionally gate on
 *   {@link detectRendererSupport} to skip itself and report the reason.
 * - {@link captureConsoleWarnings} records every `console.warn` emitted
 *   between start and stop, so tests can assert that no
 *   `setMask … not supported in WebGL` warning was raised.
 * - {@link probePixel} reads a single framebuffer pixel via
 *   `renderer.snapshotPixel()`, after awaiting a rendered frame, so clipping
 *   and painting assertions are real rendering checks rather than
 *   scene-graph claims.
 *
 * Teardown is handled for you: every game booted through this module is
 * registered and destroyed (running the deferred destroy synchronously and
 * draining Phaser's canvas pool via
 * {@link drainPhaserCanvasPool}) in an `afterEach` hook. Call
 * {@link destroyRendererScenes} explicitly if a test needs to free the
 * renderer early.
 *
 * @module tests/helpers/bootRendererScene
 */

import Phaser from 'phaser';
import { afterEach } from 'vitest';

import { destroyPhaserGame, drainPhaserCanvasPool } from './phaserCanvasPool';
import { waitForScene } from './waitForScene';

/** Scene key of the empty scene the harness boots when none is supplied. */
export const RENDERER_HARNESS_SCENE_KEY = 'renderer-harness-probe';

/** A renderer family the harness can force. */
export type RendererName = 'canvas' | 'webgl';

/** How long to wait for a scene to become active. */
const DEFAULT_TIMEOUT_MS = 20_000;

/** How long a `snapshotPixel()` probe may take before it is a hard failure. */
const SNAPSHOT_TIMEOUT_MS = 5_000;

/** Number of rendered frames to let pass after a scene becomes active. */
const SETTLE_FRAMES = 3;

/**
 * A framebuffer pixel read with `renderer.snapshotPixel()`.
 *
 * Plain data (no Phaser types) so it can be compared directly in an
 * assertion, e.g. `expect(pixel).toEqual({ r: 255, g: 0, b: 0, a: 255 })`.
 */
export interface PixelColour {
  /** Red channel, 0–255. */
  r: number;
  /** Green channel, 0–255. */
  g: number;
  /** Blue channel, 0–255. */
  b: number;
  /** Alpha channel, 0–255 (255 when the snapshot backend omits alpha). */
  a: number;
}

/** Options accepted by {@link bootRendererScene}. */
export interface BootRendererSceneOptions {
  /**
   * Scene class (or scene config) to register. Defaults to an empty probe
   * scene, which renders the configured background colour.
   */
  scene?: Phaser.Types.Scenes.SceneType;

  /**
   * Key of the scene to wait for. Defaults to the probe scene key, or — for a
   * custom scene — the first scene that becomes active.
   */
  sceneKey?: string;

  /** Logical viewport width. Default `800`. */
  width?: number;

  /** Logical viewport height. Default `600`. */
  height?: number;

  /** CSS background colour. Default `'#000000'`. */
  backgroundColor?: string;

  /** DOM element id to parent the canvas to. Default: unique per boot. */
  parentId?: string;

  /** How long to wait for the scene to become active. Default 20 000 ms. */
  timeoutMs?: number;

  /**
   * Extra Phaser game config, spread first. The renderer `type`, `scene`,
   * `parent`, size, background colour and `banner` are always controlled by
   * this harness and win over the same keys here.
   */
  gameConfig?: Partial<Phaser.Types.Core.GameConfig>;
}

/**
 * A booted renderer scene plus the helpers that need its game.
 *
 * The handle is registered for automatic teardown; {@link RendererSceneHandle.destroy}
 * is idempotent.
 */
export interface RendererSceneHandle {
  /** The Phaser game the harness created. */
  readonly game: Phaser.Game;
  /** The scene that became active. */
  readonly scene: Phaser.Scene;
  /** The render type actually in use (`Phaser.CANVAS` / `Phaser.WEBGL`). */
  readonly renderType: number;
  /** Friendly name of {@link RendererSceneHandle.renderType}. */
  readonly rendererName: RendererName;
  /** DOM id of the game's parent container. */
  readonly parentId: string;
  /** Resolve after the next completed render (see {@link awaitRenderTick}). */
  awaitRenderTick(timeoutMs?: number): Promise<void>;
  /** Read one framebuffer pixel (see {@link probePixel}). */
  probePixel(x: number, y: number): Promise<PixelColour>;
  /** Destroy the game, remove its container and drain the canvas pool. */
  destroy(): void;
}

/** Recorded per-boot reason describing why a requested renderer was unavailable. */
const rendererSkipReasons: string[] = [];

/**
 * Every reason the harness recorded for a renderer it could not provide.
 *
 * A WebGL test that cannot run reports its reason here (and/or via
 * {@link detectRendererSupport}) — it is never silently green. Assert this is
 * empty when a test requires a renderer to have really been exercised.
 */
export function getRendererSkipReasons(): readonly string[] {
  return [...rendererSkipReasons];
}

/** Forget recorded skip reasons (call from `beforeEach` for isolation). */
export function clearRendererSkipReasons(): void {
  rendererSkipReasons.length = 0;
}

function recordRendererSkipReason(reason: string): void {
  rendererSkipReasons.push(reason);
}

/** Name a Phaser render type, for messages and assertions. */
export function renderTypeName(renderType: number): RendererName | 'unknown' {
  if (renderType === Phaser.CANVAS) return 'canvas';
  if (renderType === Phaser.WEBGL) return 'webgl';
  return 'unknown';
}

/** Result of probing the environment for a renderer. */
export interface RendererSupport {
  /** Whether the requested renderer can be created here. */
  supported: boolean;
  /** Human-readable reason when `supported` is false (empty otherwise). */
  reason: string;
}

/** Memoised support probes — the environment cannot change within a file. */
const supportCache = new Map<number, RendererSupport>();

/**
 * Probe whether this environment can provide `renderType`.
 *
 * Use it to gate a test explicitly (`it.skipIf(!support.supported)`) so an
 * unsupported renderer is reported as a skip with a reason instead of a green
 * assertion that never touched that renderer. Results are memoised per
 * renderer, so the probe context is created at most once.
 */
export function detectRendererSupport(renderType: number): RendererSupport {
  const cached = supportCache.get(renderType);
  if (cached) return cached;

  const support = probeRendererSupport(renderType);
  supportCache.set(renderType, support);
  return support;
}

function probeRendererSupport(renderType: number): RendererSupport {
  if (renderType === Phaser.CANVAS) {
    const context = document.createElement('canvas').getContext('2d');
    if (context) return { supported: true, reason: '' };
    return {
      supported: false,
      reason: 'Canvas 2D context is unavailable in this browser environment.',
    };
  }

  if (renderType === Phaser.WEBGL) {
    const canvas = document.createElement('canvas');
    const context =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!context) {
      return {
        supported: false,
        reason:
          'WebGL is unavailable in this browser environment (no webgl2/webgl context).',
      };
    }

    // Release the probe context; the game creates its own.
    const loseContext = (context as WebGLRenderingContext).getExtension(
      'WEBGL_lose_context',
    );
    loseContext?.loseContext();

    return { supported: true, reason: '' };
  }

  return {
    supported: false,
    reason: `Unknown renderer type ${renderType}; expected Phaser.CANVAS or Phaser.WEBGL.`,
  };
}

/** Thrown when the environment cannot provide the requested renderer. */
export class RendererUnavailableError extends Error {
  constructor(reason: string, options?: { cause?: unknown }) {
    super(
      `bootRendererScene: ${reason} The test did not run on the requested renderer, so it fails rather than reporting a false pass.`,
    );
    this.name = 'RendererUnavailableError';
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** Thrown when Phaser created a different renderer than the one requested. */
export class RendererMismatchError extends Error {
  constructor(requested: number, actual: number) {
    super(
      `bootRendererScene: requested the ${renderTypeName(requested)} renderer but Phaser created ${renderTypeName(actual)} (type ${actual}). A renderer-parity assertion must never run on the wrong renderer.`,
    );
    this.name = 'RendererMismatchError';
  }
}

// ── Warning capture ────────────────────────────────────────────────────────

/** One captured `console.warn` call. */
export interface ConsoleWarning {
  /** Arguments stringified and joined with a space. */
  message: string;
  /** The original arguments passed to `console.warn`. */
  args: readonly unknown[];
  /** Stack at the point the warning was emitted (handy for attribution). */
  stack: string;
}

/** Handle returned by {@link captureConsoleWarnings}. */
export interface ConsoleWarningCapture {
  /** Every warning captured so far. */
  readonly warnings: readonly ConsoleWarning[];
  /** Message text of every warning captured so far. */
  readonly messages: readonly string[];
  /** Whether the capture is still recording. */
  readonly active: boolean;
  /** Messages containing `pattern` (substring or `RegExp`). */
  matching(pattern: string | RegExp): string[];
  /** Stop recording and return the captured warnings. Idempotent. */
  stop(): readonly ConsoleWarning[];
}

interface InternalCapture extends ConsoleWarningCapture {
  record(warning: ConsoleWarning): void;
}

/** The `console.warn` that was installed before the harness patched it. */
let originalConsoleWarn: typeof console.warn | null = null;

/** Captures currently recording; `console.warn` is a dispatcher for all of them. */
const activeCaptures = new Set<InternalCapture>();

function installConsoleWarnSpy(): void {
  if (originalConsoleWarn) return;
  originalConsoleWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const warning: ConsoleWarning = {
      message: args.map((arg) => String(arg)).join(' '),
      args,
      stack: new Error().stack ?? '',
    };
    for (const capture of activeCaptures) {
      capture.record(warning);
    }
    // Keep normal logging behaviour: capturing must not swallow warnings.
    originalConsoleWarn?.apply(console, args);
  };
}

function uninstallConsoleWarnSpy(): void {
  if (activeCaptures.size > 0) return;
  if (originalConsoleWarn) {
    console.warn = originalConsoleWarn;
    originalConsoleWarn = null;
  }
}

function matchesPattern(message: string, pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') return message.includes(pattern);
  // A global/sticky RegExp keeps `lastIndex` between calls; reset it so a
  // repeated match on the same instance is stable.
  pattern.lastIndex = 0;
  return pattern.test(message);
}

/**
 * Record every `console.warn` emitted between this call and
 * {@link ConsoleWarningCapture.stop}.
 *
 * Start the capture **before** booting the game to include boot-time warnings
 * (that is where Phaser logs `setMask … not supported in WebGL`):
 *
 * ```ts
 * const warnings = captureConsoleWarnings();
 * const handle = await bootRendererScene(Phaser.WEBGL, { scene: MyScene });
 * // ... assertions ...
 * expect(warnings.matching('not supported in WebGL')).toEqual([]);
 * warnings.stop();
 * ```
 *
 * @param scene When supplied, the capture stops automatically when that scene
 *   shuts down (so a scene-scoped capture cannot leak into later tests).
 */
export function captureConsoleWarnings(scene?: Phaser.Scene): ConsoleWarningCapture {
  const warnings: ConsoleWarning[] = [];
  let active = true;
  let detachScene: (() => void) | null = null;

  const capture: InternalCapture = {
    get warnings(): readonly ConsoleWarning[] {
      return warnings;
    },
    get messages(): readonly string[] {
      return warnings.map((warning) => warning.message);
    },
    get active(): boolean {
      return active;
    },
    matching(pattern: string | RegExp): string[] {
      return warnings
        .map((warning) => warning.message)
        .filter((message) => matchesPattern(message, pattern));
    },
    record(warning: ConsoleWarning): void {
      if (active) warnings.push(warning);
    },
    stop(): readonly ConsoleWarning[] {
      if (active) {
        active = false;
        activeCaptures.delete(capture);
        uninstallConsoleWarnSpy();
        detachScene?.();
        detachScene = null;
      }
      return [...warnings];
    },
  };

  activeCaptures.add(capture);
  installConsoleWarnSpy();

  if (scene) {
    const onShutdown = (): void => {
      capture.stop();
    };
    scene.sys.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    scene.sys.events.once(Phaser.Scenes.Events.DESTROY, onShutdown);
    detachScene = () => {
      scene.sys.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
      scene.sys.events.off(Phaser.Scenes.Events.DESTROY, onShutdown);
    };
  }

  return capture;
}

// ── Rendering primitives ───────────────────────────────────────────────────

/** Resolve on the next animation frame. */
function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * Resolve after the game completes a render.
 *
 * `renderer.snapshotPixel()` reads the **last rendered** framebuffer, so a
 * caller must let a frame land after mutating the scene before probing.
 */
export function awaitRenderTick(
  scene: Phaser.Scene,
  timeoutMs = SNAPSHOT_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const game = scene.game;
    let settled = false;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      game.events.off(Phaser.Core.Events.POST_RENDER, onPostRender);
      resolve();
    };

    const onPostRender = (): void => {
      finish();
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      game.events.off(Phaser.Core.Events.POST_RENDER, onPostRender);
      reject(
        new Error(
          `awaitRenderTick: the game did not render a frame within ${timeoutMs}ms.`,
        ),
      );
    }, timeoutMs);

    game.events.on(Phaser.Core.Events.POST_RENDER, onPostRender);
  });
}

function toPixelColour(snapshot: Phaser.Display.Color | HTMLImageElement): PixelColour {
  const colour = snapshot as Partial<Phaser.Display.Color>;
  const channel = (value: unknown): number =>
    typeof value === 'number' ? value : 0;

  return {
    r: channel(colour.red),
    g: channel(colour.green),
    b: channel(colour.blue),
    a: typeof colour.alpha === 'number' ? colour.alpha : 255,
  };
}

/**
 * Read a single framebuffer pixel with `renderer.snapshotPixel()`.
 *
 * **Requires a rendered frame** — a snapshot reads the last completed
 * framebuffer, so the helper awaits the next render (and `snapshotPixel`
 * itself resolves after the following one) before returning. Coordinates are
 * in game-viewport pixels (`0..width`/`0..height`), which match scene layout
 * coordinates at the default resolution of 1.
 *
 * @param scene The scene whose game is probed.
 * @param x Viewport x coordinate.
 * @param y Viewport y coordinate.
 */
export async function probePixel(
  scene: Phaser.Scene,
  x: number,
  y: number,
): Promise<PixelColour> {
  await awaitRenderTick(scene);

  const renderer = scene.renderer;

  return new Promise<PixelColour>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `probePixel(${x}, ${y}): renderer.snapshotPixel() did not complete within ${SNAPSHOT_TIMEOUT_MS}ms.`,
        ),
      );
    }, SNAPSHOT_TIMEOUT_MS);

    try {
      renderer.snapshotPixel(x, y, (snapshot) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(toPixelColour(snapshot));
      });
    } catch (error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
  });
}

// ── Booting ────────────────────────────────────────────────────────────────

/** Empty scene used when the caller does not supply one. */
class RendererHarnessScene extends Phaser.Scene {
  constructor() {
    super({ key: RENDERER_HARNESS_SCENE_KEY });
  }

  // Intentionally empty: the framebuffer shows the configured background,
  // which is what the harness self-test probes.
  create(): void {}
}

let bootCounter = 0;

/** Every live handle, torn down automatically after each test. */
const activeHandles = new Set<RendererSceneHandle>();

/**
 * Let a few frames pass so deferred scene work (tweens, deferred creates)
 * has run before the test starts asserting.
 */
async function settleFrames(count = SETTLE_FRAMES): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await nextAnimationFrame();
  }
}

/** Wait for the first scene that becomes active (custom scenes without a key). */
async function waitForAnyActiveScene(
  game: Phaser.Game,
  timeoutMs: number,
): Promise<Phaser.Scene> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const scene = game.scene.getScenes(true)[0];
    if (scene) {
      await settleFrames();
      return scene;
    }
    await nextAnimationFrame();
  }

  throw new Error(
    `bootRendererScene: no scene became active within ${timeoutMs}ms.`,
  );
}

/**
 * Destroy every game booted through this module and drain the canvas pool.
 *
 * Runs automatically in an `afterEach` hook; exported so a test can free the
 * renderer mid-file.
 */
export function destroyRendererScenes(): void {
  for (const handle of [...activeHandles]) {
    handle.destroy();
  }
  activeHandles.clear();
  drainPhaserCanvasPool();
}

/**
 * Boot a scene with a **forced** renderer.
 *
 * Creates the game with `renderType`, waits for the scene to become active,
 * then asserts that `scene.renderer.type` really is `renderType`. A missing
 * renderer throws {@link RendererUnavailableError} (recording the reason);
 * a silent Phaser downgrade throws {@link RendererMismatchError}. Either way
 * the test fails loudly instead of asserting against the wrong renderer.
 *
 * The returned handle is registered for automatic teardown in `afterEach`.
 *
 * @param renderType `Phaser.CANVAS` or `Phaser.WEBGL`.
 * @param options Scene, size, colours and timeout overrides.
 */
export async function bootRendererScene(
  renderType: number,
  options: BootRendererSceneOptions = {},
): Promise<RendererSceneHandle> {
  const support = detectRendererSupport(renderType);
  if (!support.supported) {
    recordRendererSkipReason(support.reason);
    throw new RendererUnavailableError(support.reason);
  }

  bootCounter += 1;
  const parentId = options.parentId ?? `renderer-harness-container-${bootCounter}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const scene = options.scene ?? RendererHarnessScene;

  document.getElementById(parentId)?.remove();
  const container = document.createElement('div');
  container.id = parentId;
  document.body.appendChild(container);

  let game: Phaser.Game;
  try {
    game = new Phaser.Game({
      ...options.gameConfig,
      type: renderType,
      parent: parentId,
      width: options.width ?? 800,
      height: options.height ?? 600,
      backgroundColor: options.backgroundColor ?? '#000000',
      scene,
      banner: false,
    });
  } catch (error) {
    container.remove();
    const reason = `Phaser could not create the requested ${renderTypeName(renderType)} renderer: ${
      error instanceof Error ? error.message : String(error)
    }`;
    recordRendererSkipReason(reason);
    throw new RendererUnavailableError(reason, { cause: error });
  }

  let activeScene: Phaser.Scene;
  try {
    if (options.sceneKey) {
      // `waitForScene` resolves once the requested key is active; fetch the
      // instance afterwards so `getScene` never returns a not-yet-booted scene.
      await waitForScene(game, options.sceneKey, timeoutMs);
      activeScene = game.scene.getScene(options.sceneKey);
    } else if (options.scene) {
      activeScene = await waitForAnyActiveScene(game, timeoutMs);
    } else {
      await waitForScene(game, RENDERER_HARNESS_SCENE_KEY, timeoutMs);
      activeScene = game.scene.getScene(RENDERER_HARNESS_SCENE_KEY);
    }
  } catch (error) {
    destroyPhaserGame(game, parentId);
    throw error;
  }

  const actualRenderType = activeScene.renderer.type;
  if (actualRenderType !== renderType) {
    destroyPhaserGame(game, parentId);
    const reason = `requested ${renderTypeName(renderType)} but Phaser created ${renderTypeName(actualRenderType)}`;
    recordRendererSkipReason(reason);
    throw new RendererMismatchError(renderType, actualRenderType);
  }

  const handle: RendererSceneHandle = {
    game,
    scene: activeScene,
    renderType: actualRenderType,
    rendererName: renderTypeName(actualRenderType) as RendererName,
    parentId,
    awaitRenderTick: (timeout?: number) => awaitRenderTick(activeScene, timeout),
    probePixel: (x: number, y: number) => probePixel(activeScene, x, y),
    destroy: (): void => {
      if (!activeHandles.delete(handle)) return;
      destroyPhaserGame(game, parentId);
      drainPhaserCanvasPool();
    },
  };

  activeHandles.add(handle);
  return handle;
}

// Belt-and-braces teardown: every test file that imports this module gets the
// hook, so no renderer, canvas context or console.warn patch survives a test.
afterEach(() => {
  destroyRendererScenes();
});
