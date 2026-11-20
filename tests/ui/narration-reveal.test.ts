/**
 * Unit tests for the shared narration reveal helper
 * (`src/ui/narration-reveal.ts`, CG-0MWO7CULE001IWU1).
 *
 * Everything here runs in a plain Node environment: the reveal's Phaser
 * dependency is type-only, the timer is driven through the injected
 * `NarrationRevealScheduler` seam, and scenes/emitters are minimal fakes. The
 * suite covers the AC5 contract — duration/step scheduling, the instant path,
 * SFX key selection and idempotent completion/destruction (including "no timer
 * or listener left behind").
 */

import { describe, expect, it, vi } from 'vitest';
import { COMMON_SFX_KEYS } from '../../src/core-engine/SoundManager';
import {
  NARRATION_REVEAL_DEFAULT_SFX,
  NARRATION_REVEAL_MAX_STEP_MS,
  NARRATION_REVEAL_MAX_TOTAL_MS,
  NARRATION_REVEAL_MIN_STEP_MS,
  NARRATION_REVEAL_MIN_TOTAL_MS,
  NARRATION_REVEAL_MS_PER_CHARACTER,
  planNarrationReveal,
  resolveNarrationSfxKey,
  resolveNarrationTextWriter,
  revealNarration,
  type NarrationRevealScheduler,
  type NarrationRevealTarget,
  type NarrationSfxSelection,
} from '../../src/ui/narration-reveal';

// ── Fakes ───────────────────────────────────────────────────

type Handler = () => void;

interface FakeEmitter {
  on(event: string, handler: Handler): void;
  off(event: string, handler: Handler): void;
  emit(event: string): void;
  count(event?: string): number;
}

function createFakeEmitter(): FakeEmitter {
  const handlers = new Map<string, Set<Handler>>();
  return {
    on(event, handler) {
      const set = handlers.get(event) ?? new Set<Handler>();
      set.add(handler);
      handlers.set(event, set);
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler);
    },
    emit(event) {
      for (const handler of [...(handlers.get(event) ?? [])]) handler();
    },
    count(event) {
      if (event !== undefined) return handlers.get(event)?.size ?? 0;
      let total = 0;
      for (const set of handlers.values()) total += set.size;
      return total;
    },
  };
}

interface FakeScene {
  input: FakeEmitter & { keyboard: FakeEmitter };
  events: FakeEmitter;
}

function createFakeScene(): FakeScene {
  const input = Object.assign(createFakeEmitter(), { keyboard: createFakeEmitter() });
  return { input, events: createFakeEmitter() };
}

interface FakeScheduler {
  scheduler: NarrationRevealScheduler;
  stepMs: () => number;
  everyCalls: () => number;
  cancelled: () => number;
  /** Fire the scheduled step callback `times` times (default 1). */
  tick(times?: number): void;
}

function createFakeScheduler(): FakeScheduler {
  let stepMs = -1;
  let everyCalls = 0;
  let cancelled = 0;
  let onStep: Handler | null = null;
  const scheduler: NarrationRevealScheduler = {
    every(delay, callback) {
      everyCalls += 1;
      stepMs = delay;
      onStep = callback;
      return {
        cancel() {
          cancelled += 1;
        },
      };
    },
  };
  return {
    scheduler,
    stepMs: () => stepMs,
    everyCalls: () => everyCalls,
    cancelled: () => cancelled,
    tick(times = 1) {
      for (let index = 0; index < times; index += 1) onStep?.();
    },
  };
}

interface FakeText {
  text: string;
  setText(value: string): void;
}

function createFakeText(initial = ''): FakeText {
  return {
    text: initial,
    setText(value: string) {
      this.text = value;
    },
  };
}

function asTarget(text: FakeText): NarrationRevealTarget {
  return text as unknown as NarrationRevealTarget;
}

function createSoundManager() {
  return { play: vi.fn() };
}

const PROSE = 'The gate groans open.';

function startReveal(
  overrides: Partial<Parameters<typeof revealNarration>[0]> = {},
): {
  scene: FakeScene;
  text: FakeText;
  scheduler: FakeScheduler;
  sound: ReturnType<typeof createSoundManager>;
  handle: ReturnType<typeof revealNarration>;
} {
  const scene = createFakeScene();
  const text = createFakeText();
  const fakeScheduler = createFakeScheduler();
  const sound = createSoundManager();
  const handle = revealNarration({
    scene: scene as never,
    target: asTarget(text),
    prose: PROSE,
    soundManager: sound,
    scheduler: fakeScheduler.scheduler,
    ...overrides,
  });
  return { scene, text, scheduler: fakeScheduler, sound, handle };
}

// ── planNarrationReveal (pure scheduling) ───────────────────

describe('planNarrationReveal', () => {
  it('plans an instant, single-step reveal for empty prose', () => {
    const plan = planNarrationReveal('');

    expect(plan.instant).toBe(true);
    expect(plan.steps).toEqual(['']);
    expect(plan.stepMs).toBe(0);
    expect(plan.totalMs).toBe(0);
  });

  it('plans an instant reveal of the full prose under reduced motion', () => {
    const plan = planNarrationReveal(PROSE, { reducedMotion: true });

    expect(plan.instant).toBe(true);
    expect(plan.steps).toEqual([PROSE]);
    expect(plan.prose).toBe(PROSE);
    expect(plan.totalMs).toBe(0);
  });

  it('schedules progressive, monotonic slices ending with the full prose', () => {
    const plan = planNarrationReveal(PROSE);

    expect(plan.instant).toBe(false);
    expect(plan.stepMs).toBe(NARRATION_REVEAL_MS_PER_CHARACTER);
    expect(plan.totalMs).toBe(PROSE.length * NARRATION_REVEAL_MS_PER_CHARACTER);
    expect(plan.steps.length).toBeGreaterThan(1);
    expect(plan.steps[plan.steps.length - 1]).toBe(PROSE);

    let previousLength = 0;
    for (const step of plan.steps) {
      expect(step).toBe(PROSE.slice(0, step.length));
      expect(step.length).toBeGreaterThanOrEqual(previousLength);
      previousLength = step.length;
    }
  });

  it('never schedules a reveal shorter than the readable minimum total', () => {
    const plan = planNarrationReveal('Oh');

    expect(plan.totalMs).toBe(NARRATION_REVEAL_MIN_TOTAL_MS);
    expect(plan.steps.length).toBeGreaterThan(1);
  });

  it('bounds a long reveal at the maximum total duration', () => {
    const plan = planNarrationReveal('x'.repeat(5000));

    expect(plan.totalMs).toBe(NARRATION_REVEAL_MAX_TOTAL_MS);
    expect(plan.steps[plan.steps.length - 1]).toBe('x'.repeat(5000));
    // The step count is derived from the bounded total, not the prose length.
    expect(plan.steps.length).toBe(
      Math.ceil(NARRATION_REVEAL_MAX_TOTAL_MS / plan.stepMs),
    );
  });

  it('clamps the step interval to the readable range', () => {
    expect(planNarrationReveal(PROSE, { msPerCharacter: 5 }).stepMs).toBe(
      NARRATION_REVEAL_MIN_STEP_MS,
    );
    expect(planNarrationReveal(PROSE, { msPerCharacter: 500 }).stepMs).toBe(
      NARRATION_REVEAL_MAX_STEP_MS,
    );
  });

  it('falls back to the documented pacing for unusable overrides', () => {
    expect(planNarrationReveal(PROSE, { msPerCharacter: 0 }).stepMs).toBe(
      NARRATION_REVEAL_MS_PER_CHARACTER,
    );
    expect(planNarrationReveal(PROSE, { msPerCharacter: Number.NaN }).stepMs).toBe(
      NARRATION_REVEAL_MS_PER_CHARACTER,
    );
  });
});

// ── SFX key selection ──────────────────────────────────────

describe('resolveNarrationSfxKey', () => {
  it('defaults to a COMMON_SFX_KEYS reveal sound', () => {
    expect(NARRATION_REVEAL_DEFAULT_SFX).toBe(COMMON_SFX_KEYS.SCORE_REVEAL);
    expect(resolveNarrationSfxKey()).toBe(COMMON_SFX_KEYS.SCORE_REVEAL);
  });

  it('honours any shared common key', () => {
    expect(resolveNarrationSfxKey(COMMON_SFX_KEYS.ROUND_END)).toBe(
      COMMON_SFX_KEYS.ROUND_END,
    );
  });

  it('treats an explicit null as a silent reveal', () => {
    expect(resolveNarrationSfxKey(null)).toBeNull();
  });

  it('never returns a game-scoped literal', () => {
    expect(resolveNarrationSfxKey('ms-narration-reveal')).toBe(
      NARRATION_REVEAL_DEFAULT_SFX,
    );
  });
});

// ── Target resolution ──────────────────────────────────────

describe('resolveNarrationTextWriter', () => {
  it('writes straight into a text object', () => {
    const text = createFakeText();
    const write = resolveNarrationTextWriter(asTarget(text));

    write?.('hello');
    expect(text.text).toBe('hello');
  });

  it('writes into the first text-like child of a container', () => {
    const label = createFakeText();
    const container = { list: [{ alpha: 1 }, label] };

    const write = resolveNarrationTextWriter(
      container as unknown as NarrationRevealTarget,
    );
    write?.('narrated');

    expect(label.text).toBe('narrated');
  });

  it('returns null when the target exposes nothing writable', () => {
    expect(resolveNarrationTextWriter(null)).toBeNull();
    expect(
      resolveNarrationTextWriter({ list: [{}] } as unknown as NarrationRevealTarget),
    ).toBeNull();
  });
});

// ── Progressive reveal ─────────────────────────────────────

describe('revealNarration (progressive)', () => {
  it('reveals slice by slice and lands on the full prose', () => {
    const { text, scheduler, handle } = startReveal();

    expect(text.text).toBe('');
    expect(handle.done).toBe(false);
    expect(scheduler.stepMs()).toBe(NARRATION_REVEAL_MS_PER_CHARACTER);

    scheduler.tick();
    expect(text.text).toBe(handle.plan.steps[0]);
    expect(handle.done).toBe(false);

    scheduler.tick(handle.plan.steps.length - 1);
    expect(text.text).toBe(PROSE);
    expect(handle.text).toBe(PROSE);
    expect(handle.done).toBe(true);
    expect(scheduler.cancelled()).toBe(1);
  });

  it('plays the default shared SFX exactly once when the reveal starts', () => {
    const { sound } = startReveal();

    expect(sound.play).toHaveBeenCalledTimes(1);
    expect(sound.play).toHaveBeenCalledWith(COMMON_SFX_KEYS.SCORE_REVEAL);
  });

  it('plays a caller-selected shared SFX key', () => {
    const { sound } = startReveal({ sfx: COMMON_SFX_KEYS.TURN_CHANGE });

    expect(sound.play).toHaveBeenCalledWith(COMMON_SFX_KEYS.TURN_CHANGE);
  });

  it('stays silent for an explicit null SFX but still reveals', () => {
    const { sound, text, scheduler } = startReveal({ sfx: null });

    expect(sound.play).not.toHaveBeenCalled();
    scheduler.tick(1000);
    expect(text.text).toBe(PROSE);
  });

  it('never lets a throwing audio backend block the textual channel', () => {
    const sound = { play: vi.fn(() => { throw new Error('audio unavailable'); }) };
    const scene = createFakeScene();
    const text = createFakeText();
    const fakeScheduler = createFakeScheduler();

    const handle = revealNarration({
      scene: scene as never,
      target: asTarget(text),
      prose: PROSE,
      soundManager: sound,
      scheduler: fakeScheduler.scheduler,
    });

    expect(sound.play).toHaveBeenCalledTimes(1);
    fakeScheduler.tick(1000);
    expect(handle.done).toBe(true);
    expect(text.text).toBe(PROSE);
  });

  it('completes instantly when the scene exposes no timer (headless)', () => {
    const scene = createFakeScene();
    const text = createFakeText();

    const handle = revealNarration({
      scene: scene as never,
      target: asTarget(text),
      prose: PROSE,
      skipOnInput: false,
    });

    expect(text.text).toBe(PROSE);
    expect(handle.done).toBe(true);
    expect(scene.events.count('shutdown')).toBe(0);
  });
});

// ── Instant / reduced-motion path ──────────────────────────

describe('revealNarration (instant path)', () => {
  it('shows the full prose synchronously under reduced motion', () => {
    const onComplete = vi.fn();
    const { text, scheduler, sound, handle, scene } = startReveal({
      reducedMotion: true,
      onComplete,
    });

    expect(text.text).toBe(PROSE);
    expect(handle.done).toBe(true);
    expect(handle.text).toBe(PROSE);
    expect(scheduler.everyCalls()).toBe(0);
    expect(sound.play).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
    // No listeners were left behind.
    expect(scene.input.count()).toBe(0);
    expect(scene.input.keyboard.count()).toBe(0);
    expect(scene.events.count()).toBe(0);
  });

  it('shows the full prose synchronously for empty prose', () => {
    const { text, handle } = startReveal({ prose: '' });

    expect(text.text).toBe('');
    expect(handle.done).toBe(true);
  });
});

// ── Skip-on-input ──────────────────────────────────────────

describe('revealNarration (skipOnInput)', () => {
  it('completes on pointer input with the full prose and releases the timer', () => {
    const onComplete = vi.fn();
    const { scene, text, scheduler, handle } = startReveal({ onComplete });
    scheduler.tick();
    expect(handle.done).toBe(false);

    scene.input.emit('pointerdown');

    expect(text.text).toBe(PROSE);
    expect(handle.done).toBe(true);
    expect(scheduler.cancelled()).toBe(1);
    expect(scene.input.count()).toBe(0);
    expect(scene.events.count()).toBe(0);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('completes on key input', () => {
    const { scene, text, handle } = startReveal();

    scene.input.keyboard.emit('keydown');

    expect(text.text).toBe(PROSE);
    expect(handle.done).toBe(true);
    expect(scene.input.keyboard.count()).toBe(0);
  });

  it('ignores input when skipOnInput is disabled', () => {
    const { scene, text, handle } = startReveal({ skipOnInput: false });
    expect(scene.input.count('pointerdown')).toBe(0);
    expect(scene.input.keyboard.count('keydown')).toBe(0);

    scene.input.emit('pointerdown');
    expect(handle.done).toBe(false);
    expect(text.text).toBe('');
  });
});

// ── Idempotence and teardown ───────────────────────────────

describe('revealNarration (lifecycle)', () => {
  it('complete() is idempotent and fires onComplete once', () => {
    const onComplete = vi.fn();
    const { text, scheduler, handle, scene } = startReveal({ onComplete });
    scheduler.tick();

    handle.complete();
    handle.complete();
    // Completing after completion is a no-op.
    scheduler.tick();

    expect(text.text).toBe(PROSE);
    expect(handle.done).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(scheduler.cancelled()).toBe(1);
    expect(scene.input.count()).toBe(0);
    expect(scene.input.keyboard.count()).toBe(0);
    expect(scene.events.count()).toBe(0);
  });

  it('destroy() mid-reveal cancels the timer and detaches every listener', () => {
    const onComplete = vi.fn();
    const { text, scheduler, handle, scene } = startReveal({ onComplete });
    scheduler.tick(2);
    const partial = text.text;
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan(PROSE.length);

    handle.destroy();
    handle.destroy();

    expect(handle.destroyed).toBe(true);
    expect(handle.done).toBe(false);
    expect(text.text).toBe(partial);
    expect(scheduler.cancelled()).toBe(1);
    expect(scene.input.count()).toBe(0);
    expect(scene.input.keyboard.count()).toBe(0);
    expect(scene.events.count()).toBe(0);
    // An aborted reveal is not a completion.
    expect(onComplete).not.toHaveBeenCalled();

    // The timer callback is inert after destruction.
    scheduler.tick(1000);
    expect(text.text).toBe(partial);
    expect(handle.done).toBe(false);
  });

  it('complete() after destroy() is a safe no-op', () => {
    const { text, scheduler, handle } = startReveal();
    scheduler.tick();
    const partial = text.text;

    handle.destroy();
    handle.complete();

    expect(text.text).toBe(partial);
    expect(handle.done).toBe(false);
    expect(handle.destroyed).toBe(true);
  });

  it('releases everything on scene shutdown without firing onComplete', () => {
    const onComplete = vi.fn();
    const { scene, scheduler, handle } = startReveal({ onComplete });
    scheduler.tick();

    scene.events.emit('shutdown');

    expect(handle.destroyed).toBe(true);
    expect(scheduler.cancelled()).toBe(1);
    expect(scene.input.count()).toBe(0);
    expect(scene.input.keyboard.count()).toBe(0);
    expect(scene.events.count()).toBe(0);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('cancels a timer that fires synchronously inside the scheduler seam', () => {
    const scene = createFakeScene();
    const text = createFakeText();
    let cancelled = 0;

    const scheduler: NarrationRevealScheduler = {
      every(_stepMs, onStep) {
        // A pathological scheduler that completes the reveal before returning.
        for (let index = 0; index < 1000; index += 1) onStep();
        return { cancel: () => { cancelled += 1; } };
      },
    };

    const handle = revealNarration({
      scene: scene as never,
      target: asTarget(text),
      prose: PROSE,
      scheduler,
    });

    expect(handle.done).toBe(true);
    expect(text.text).toBe(PROSE);
    expect(cancelled).toBe(1);
  });
});

// Type-level guard: the public SFX option is typed to shared common keys only.
const _sfxSelectionTypeGuard: NarrationSfxSelection = COMMON_SFX_KEYS.UI_CLICK;
void _sfxSelectionTypeGuard;
