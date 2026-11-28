/**
 * Browser test for the rendered scene-exit presentation
 * (`presentSceneExit()` in `src/ui/scene-exit-presentation.ts`,
 * CG-0MWZCM6I0005DYZ6).
 *
 * The planner/SFX unit suite owns the Phaser-free schedule contract; this file
 * proves the rendering layer against a real Phaser scene:
 *
 *  1. every field — act title, scene title, outcome word and route — is a real
 *     text object positioned from the injected SLL `sceneBanner` anchors (the
 *     GDD contract geometry), never from a pixel literal;
 *  2. the fields appear in plan order (title → outcome → route) and the
 *     presentation auto-advances after the configured dwell;
 *  3. a real pointer press skips straight to the full information and dismisses
 *     the presentation;
 *  4. the outcome word is printed in every outcome state (colour is only a
 *     secondary cue);
 *  5. reduced motion presents everything synchronously with no timer and no
 *     SFX, from **either** source (CG-0MWZCOFVH002WEY6): the explicit
 *     `reducedMotion` flag, or the effective preference
 *     (`getEffectiveReducedMotion()` — the SettingsStore toggle, then the CSS
 *     `prefers-reduced-motion: reduce` fallback);
 *  6. `destroy()` is idempotent and leaves no text object behind.
 *
 * @module tests/ui/scene-exit-presentation.browser.test.ts
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import {
  SCENE_EXIT_OUTCOME_COLOURS,
  SCENE_EXIT_PRESENTATION_DEPTH,
  anchorPoint,
  presentSceneExit,
  type PresentSceneExitOptions,
  type SceneExitAnchorName,
  type SceneExitOutcome,
  type SceneExitPresentationHandle,
  type SceneExitPresentationScheduler,
  type SceneExitPresentationTimer,
  type ScreenLayoutDocument,
} from '../../src/ui';
import { waitForScene } from '../helpers/waitForScene';
import { waitForCondition } from '../helpers/waitForCondition';

const SCENE_KEY = 'SceneExitPresentationHarness';
const VIEWPORT = { width: 900, height: 600 };

/**
 * The GDD §3.1 `sceneBanner` geometry, in miniature: the same anchor names and
 * proportions as `tests/fixtures/story-line/gdd-presentation-layout.json`, so
 * the test proves positions come from an SLL layout rather than from the helper.
 */
const LAYOUT: ScreenLayoutDocument = {
  version: 1,
  id: 'scene-exit-banner-harness',
  baseViewport: { width: 900, height: 600 },
  requiredZones: ['sceneBanner'],
  zones: {
    sceneBanner: {
      rect: { x: 0.03, y: 0.145 },
      anchors: {
        actTitle: { x: 0.05, y: 0.155 },
        sceneTitle: { x: 0.05, y: 0.18 },
        outcome: { x: 0.95, y: 0.155 },
        route: { x: 0.95, y: 0.18 },
      },
    },
  },
};

/** Storage key the SettingsStore persists the reduced-motion toggle under. */
const REDUCED_MOTION_STORAGE_KEY = 'tce-ui-reduced-motion';

const FIELDS = {
  actTitle: 'Act I',
  sceneTitle: 'The Arrival',
  outcome: 'success' as SceneExitOutcome,
  route: 'The road south',
};

const resolveAnchor = (anchor: SceneExitAnchorName) =>
  anchorPoint(LAYOUT, 'sceneBanner', anchor, VIEWPORT, 1);

interface ScheduledCall {
  cancelled: boolean;
  delayMs: number;
  callback: () => void;
}

/** Deterministic scheduler: fires steps by hand instead of waiting on a timer. */
class ManualScheduler implements SceneExitPresentationScheduler {
  readonly calls: ScheduledCall[] = [];

  after(delayMs: number, callback: () => void): SceneExitPresentationTimer {
    const call: ScheduledCall = { cancelled: false, delayMs, callback };
    this.calls.push(call);
    return {
      cancel: () => {
        call.cancelled = true;
      },
    };
  }

  get pending(): ScheduledCall[] {
    return this.calls.filter((call) => !call.cancelled);
  }

  /** Consume and run the oldest pending call; returns its delay. */
  fireNext(): number {
    const call = this.pending[0];
    if (!call) throw new Error('ManualScheduler: no pending call to fire');
    call.cancelled = true;
    call.callback();
    return call.delayMs;
  }
}

class BannerHarnessScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEY });
  }
}

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    parent: container,
    scene: [BannerHarnessScene],
    audio: { noAudio: true },
  });
  await waitForScene(game, SCENE_KEY);
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function getHarness(game: Phaser.Game): BannerHarnessScene {
  const scene = game.scene.getScene(SCENE_KEY) as BannerHarnessScene;
  expect(scene).toBeDefined();
  return scene;
}

/** Every text object currently in the scene (the harness creates none itself). */
function bannerTexts(scene: Phaser.Scene): Phaser.GameObjects.Text[] {
  return scene.children.list.filter(
    (child): child is Phaser.GameObjects.Text =>
      child instanceof Phaser.GameObjects.Text,
  );
}

function textFor(
  scene: Phaser.Scene,
  value: string,
): Phaser.GameObjects.Text | undefined {
  return bannerTexts(scene).find((text) => text.text === value);
}

/** Options shared by the non-instant tests (silent, deterministic motion). */
function baseOptions(
  overrides: Partial<PresentSceneExitOptions> = {},
): PresentSceneExitOptions {
  return {
    ...FIELDS,
    resolveAnchor,
    reducedMotion: false,
    soundManager: null,
    sfx: null,
    ...overrides,
  };
}

describe('presentSceneExit browser behaviour', () => {
  let game: Phaser.Game | null = null;
  let handle: SceneExitPresentationHandle | null = null;

  afterEach(() => {
    handle?.destroy();
    handle = null;
    destroyGame(game);
    game = null;
  });

  it('renders every field from its SLL sceneBanner anchor, never a pixel literal', async () => {
    game = await bootGame();
    const scene = getHarness(game);

    handle = presentSceneExit(
      scene,
      baseOptions({ stepMs: 10_000, autoAdvanceMs: 10_000 }),
    );

    const expected: Array<[SceneExitAnchorName, string]> = [
      ['actTitle', FIELDS.actTitle],
      ['sceneTitle', FIELDS.sceneTitle],
      ['outcome', FIELDS.outcome],
      ['route', FIELDS.route],
    ];

    for (const [anchor, value] of expected) {
      const text = textFor(scene, value);
      expect(text, `missing text object for ${anchor}`).toBeDefined();
      const point = anchorPoint(LAYOUT, 'sceneBanner', anchor, VIEWPORT, 1);
      expect(text!.x).toBeCloseTo(point.x, 5);
      expect(text!.y).toBeCloseTo(point.y, 5);
      // In-layout depth: above the board (0–999), below the HUD (1000).
      expect(text!.depth).toBe(SCENE_EXIT_PRESENTATION_DEPTH);
      expect(text!.displayWidth).toBeGreaterThan(0);
    }

    // Left anchors start at their point, right anchors end at theirs.
    expect(textFor(scene, FIELDS.actTitle)!.originX).toBe(0);
    expect(textFor(scene, FIELDS.sceneTitle)!.originX).toBe(0);
    expect(textFor(scene, FIELDS.outcome)!.originX).toBe(1);
    expect(textFor(scene, FIELDS.route)!.originX).toBe(1);
  });

  it('skips a field the layout does not provide instead of guessing a position', async () => {
    game = await bootGame();
    const scene = getHarness(game);

    handle = presentSceneExit(
      scene,
      baseOptions({
        stepMs: 10_000,
        autoAdvanceMs: 10_000,
        resolveAnchor: (anchor) =>
          anchor === 'route' ? null : resolveAnchor(anchor),
      }),
    );

    expect(textFor(scene, FIELDS.actTitle)).toBeDefined();
    expect(textFor(scene, FIELDS.sceneTitle)).toBeDefined();
    expect(textFor(scene, FIELDS.outcome)).toBeDefined();
    expect(textFor(scene, FIELDS.route)).toBeUndefined();
  });

  it('sequences title -> outcome -> route and auto-advances after the dwell', async () => {
    game = await bootGame();
    const scene = getHarness(game);
    const scheduler = new ManualScheduler();
    const onComplete = vi.fn();

    handle = presentSceneExit(
      scene,
      baseOptions({
        stepMs: 120,
        autoAdvanceMs: 450,
        scheduler,
        onComplete,
      }),
    );

    const act = textFor(scene, FIELDS.actTitle)!;
    const sceneTitle = textFor(scene, FIELDS.sceneTitle)!;
    const outcome = textFor(scene, FIELDS.outcome)!;
    const route = textFor(scene, FIELDS.route)!;

    // Step 1 — the act/scene title only.
    expect(act.visible).toBe(true);
    expect(sceneTitle.visible).toBe(true);
    expect(outcome.visible).toBe(false);
    expect(route.visible).toBe(false);
    expect(scheduler.pending.map((call) => call.delayMs)).toEqual([120]);

    // Step 2 — the outcome word (the title stays readable).
    expect(scheduler.fireNext()).toBe(120);
    expect(outcome.visible).toBe(true);
    expect(route.visible).toBe(false);
    expect(scheduler.pending.map((call) => call.delayMs)).toEqual([120]);

    // Step 3 — the route, then the auto-advance dwell.
    expect(scheduler.fireNext()).toBe(120);
    expect(route.visible).toBe(true);
    expect(scheduler.pending.map((call) => call.delayMs)).toEqual([
      120 + 450,
    ]);
    expect(handle.done).toBe(false);

    // Auto-advance: dismissed once, promise resolved once.
    expect(scheduler.fireNext()).toBe(120 + 450);
    expect(handle.done).toBe(true);
    await handle.promise;
    await handle.promise;
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toHaveLength(0);
    expect(act.visible && sceneTitle.visible && outcome.visible && route.visible).toBe(
      true,
    );
  });

  it('auto-advances on the real scene timer after the configured dwell', async () => {
    game = await bootGame();
    const scene = getHarness(game);

    handle = presentSceneExit(
      scene,
      baseOptions({ stepMs: 20, autoAdvanceMs: 40 }),
    );

    expect(handle.done).toBe(false);
    await waitForCondition(() => handle!.done, {
      timeoutMs: 5_000,
      label: 'scene-exit auto-advance',
    });
    await handle.promise;

    expect(handle.done).toBe(true);
    expect(textFor(scene, FIELDS.route)!.visible).toBe(true);
  });

  it('dismisses on a real pointer press, showing all text instantly', async () => {
    game = await bootGame();
    const scene = getHarness(game);

    handle = presentSceneExit(
      scene,
      // Dwells far longer than the test: only the pointer press can dismiss it.
      baseOptions({
        stepMs: 60_000,
        autoAdvanceMs: 60_000,
        scheduler: new ManualScheduler(),
      }),
    );

    expect(textFor(scene, FIELDS.route)!.visible).toBe(false);

    const canvas = document.querySelector(
      '#game-container canvas',
    ) as HTMLCanvasElement | null;
    expect(canvas).toBeTruthy();
    canvas!.dispatchEvent(
      new MouseEvent('mousedown', {
        clientX: 120,
        clientY: 120,
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
      }),
    );

    await waitForCondition(() => handle!.done, {
      timeoutMs: 5_000,
      label: 'scene-exit skip-on-input',
    });
    await handle.promise;

    for (const value of Object.values(FIELDS)) {
      const text = textFor(scene, value);
      expect(text, `missing text for ${value}`).toBeDefined();
      expect(text!.visible).toBe(true);
    }
  });

  it('prints the outcome word in every outcome state (colour is secondary)', async () => {
    game = await bootGame();
    const scene = getHarness(game);

    for (const outcome of ['success', 'partial', 'failure'] as const) {
      const tinted = presentSceneExit(
        scene,
        baseOptions({ outcome, reducedMotion: true }),
      );
      const word = textFor(scene, outcome);
      expect(word, `missing outcome word for ${outcome}`).toBeDefined();
      expect(word!.visible).toBe(true);
      expect(SCENE_EXIT_OUTCOME_COLOURS[outcome]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(String(word!.style.color).toLowerCase()).toBe(
        SCENE_EXIT_OUTCOME_COLOURS[outcome].toLowerCase(),
      );
      tinted.destroy();

      // Without the tint the word is still the whole channel.
      const untinted = presentSceneExit(
        scene,
        baseOptions({ outcome, reducedMotion: true, tintOutcome: false }),
      );
      expect(textFor(scene, outcome)?.visible).toBe(true);
      untinted.destroy();
    }
  });

  it('presents everything synchronously under reduced motion, with no timer or SFX', async () => {
    game = await bootGame();
    const scene = getHarness(game);
    const scheduler = new ManualScheduler();
    const soundManager = { play: vi.fn(() => true) };
    const onComplete = vi.fn();

    handle = presentSceneExit(
      scene,
      baseOptions({
        reducedMotion: true,
        scheduler,
        soundManager,
        sfx: 'sfx-custom-game-scoped-literal',
        stepMs: 10_000,
        autoAdvanceMs: 10_000,
        onComplete,
      }),
    );

    // Synchronous by contract: full information, promise already settled.
    expect(handle.done).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    await handle.promise;

    for (const value of Object.values(FIELDS)) {
      const text = textFor(scene, value);
      expect(text, `missing instant text for ${value}`).toBeDefined();
      expect(text!.visible).toBe(true);
    }

    // Reduced motion: no timer, no SFX (the accessibility contract).
    expect(scheduler.calls).toHaveLength(0);
    expect(soundManager.play).not.toHaveBeenCalled();
  });

  it('honours the settings preference: all four fields instantly, no timer or SFX', async () => {
    game = await bootGame();
    const scene = getHarness(game);
    const scheduler = new ManualScheduler();
    const soundManager = { play: vi.fn(() => true) };
    const onComplete = vi.fn();

    // No explicit `reducedMotion` option: the effective preference decides.
    // The SettingsStore toggle (localStorage) is the person's own choice, so
    // it takes priority over the CSS media-query fallback.
    localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, 'true');
    try {
      handle = presentSceneExit(scene, {
        ...FIELDS,
        resolveAnchor,
        scheduler,
        soundManager,
        onComplete,
      });

      const plan = handle.plan;
      expect(plan.instant).toBe(true);
      expect(plan.steps).toHaveLength(1);
      expect(plan.totalMs).toBe(0);

      // Synchronous: the promise is settled before the caller resumes.
      expect(handle.done).toBe(true);
      await handle.promise;
      expect(onComplete).toHaveBeenCalledTimes(1);

      // All four fields are present and visible in the one instant step.
      for (const value of Object.values(FIELDS)) {
        const text = textFor(scene, value);
        expect(text, `missing instant text for ${value}`).toBeDefined();
        expect(text!.visible).toBe(true);
      }

      // No timer and no SFX: the preference suppresses motion *and* audio.
      expect(scheduler.calls).toHaveLength(0);
      expect(soundManager.play).not.toHaveBeenCalled();
    } finally {
      localStorage.removeItem(REDUCED_MOTION_STORAGE_KEY);
    }
  });

  it('falls back to prefers-reduced-motion when no setting is stored', async () => {
    game = await bootGame();
    const scene = getHarness(game);
    const scheduler = new ManualScheduler();
    const soundManager = { play: vi.fn(() => true) };

    // Storage carries no explicit preference, so the CSS media query decides.
    localStorage.removeItem(REDUCED_MOTION_STORAGE_KEY);
    const realMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      media: query,
      matches: true,
    })) as unknown as typeof window.matchMedia;
    try {
      // No explicit `reducedMotion` option: only the platform preference can
      // collapse the plan.
      handle = presentSceneExit(scene, {
        ...FIELDS,
        resolveAnchor,
        scheduler,
        soundManager,
      });
    } finally {
      // The instant path is synchronous, so the platform stub is no longer
      // needed once presentSceneExit has returned.
      window.matchMedia = realMatchMedia;
    }

    expect(handle.plan.instant).toBe(true);
    expect(handle.done).toBe(true);
    await handle.promise;

    for (const value of Object.values(FIELDS)) {
      const text = textFor(scene, value);
      expect(text, `missing instant text for ${value}`).toBeDefined();
      expect(text!.visible).toBe(true);
    }

    expect(scheduler.calls).toHaveLength(0);
    expect(soundManager.play).not.toHaveBeenCalled();
  });

  it('destroys idempotently and leaves no text object or timer behind', async () => {
    game = await bootGame();
    const scene = getHarness(game);
    const scheduler = new ManualScheduler();

    handle = presentSceneExit(
      scene,
      baseOptions({ stepMs: 5_000, autoAdvanceMs: 5_000, scheduler }),
    );

    expect(bannerTexts(scene)).toHaveLength(4);
    expect(scheduler.pending).toHaveLength(1);

    handle.destroy();

    expect(handle.destroyed).toBe(true);
    expect(bannerTexts(scene)).toHaveLength(0);
    expect(scheduler.pending).toHaveLength(0);

    // Idempotent: a second destroy changes nothing and never throws.
    expect(() => handle!.destroy()).not.toThrow();
    expect(bannerTexts(scene)).toHaveLength(0);
  });
});
