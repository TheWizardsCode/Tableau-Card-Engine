/**
 * Unit tests for shakeIllegalMove -- illegal-move shake animation helper.
 *
 * Phaser tween system is mocked to verify correct tween configurations
 * and callback sequencing without a running Phaser instance.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// No `vi.mock('phaser')` stub here on purpose (CG-0MVQQ2M8E003FQMZ):
// `shakeIllegalMove` (and the toast view it imports statically) is free of
// Phaser **value** imports, so it loads in plain Node. If a Phaser value import
// is ever reintroduced into this graph the import below throws
// `ReferenceError: window is not defined` and every test in this file fails
// loudly instead of being masked. `tests/ui/phaser-free-imports.test.ts`
// asserts the same invariant explicitly.
import { shakeIllegalMove } from '../../src/ui/shakeIllegalMove';

// ── Mock helpers ────────────────────────────────────────────

/** Captured tween configs in call order. */
let tweenConfigs: Phaser.Types.Tweens.TweenBuilderConfig[];

import { createMockTween } from '../helpers/MockFactory';

/** Create a mock Phaser scene with a tweens.add spy and sound.play mock. */
function createMockScene(): Phaser.Scene {
  tweenConfigs = [];
  const destroyed: any[] = [];
  const rectangles: any[] = [];
  const add = {
    rectangle: vi.fn().mockImplementation((x: number, y: number, w: number, h: number, color: number) => {
      const rect = {
        x, y, width: w, height: h, color,
        active: true,
        setPosition: vi.fn().mockReturnThis(),
        setOrigin: vi.fn().mockReturnThis(),
        setDepth: vi.fn().mockReturnThis(),
        setAlpha: vi.fn().mockReturnThis(),
        setRotation: vi.fn().mockReturnThis(),
        destroy: vi.fn().mockImplementation(() => {
          rect.active = false;
          destroyed.push(rect);
        }),
      };
      rectangles.push(rect);
      return rect;
    }),
  };
  return {
    add,
    tweens: {
      add: vi.fn((config: Phaser.Types.Tweens.TweenBuilderConfig) => {
        tweenConfigs.push(config);
        return createMockTween();
      }),
    },
    sound: {
      play: vi.fn(),
    },
    _rectangles: rectangles,
    _destroyed: destroyed,
  } as unknown as Phaser.Scene;
}
function createMockTarget(x = 100): Phaser.GameObjects.Image {
  return {
    x,
    displayWidth: 96,
    displayHeight: 130,
    width: 96,
    height: 130,
    originX: 0.5,
    originY: 0.5,
    depth: 0,
    setTint: vi.fn(),
    clearTint: vi.fn(),
    setX: vi.fn(),
  } as unknown as Phaser.GameObjects.Image;
}

// ── Tests ───────────────────────────────────────────────────

describe('shakeIllegalMove', () => {
  let scene: Phaser.Scene;
  let target: Phaser.GameObjects.Image;

  beforeEach(() => {
    scene = createMockScene();
    target = createMockTarget(200);
  });

  // ── Default behaviour ─────────────────────────────────

  it('applies the default red tint to the target', () => {
    shakeIllegalMove({ scene, target });

    expect(target.setTint).toHaveBeenCalledWith(0xff4444);
  });

  it('creates a shake tween with default options', () => {
    shakeIllegalMove({ scene, target });

    expect(tweenConfigs).toHaveLength(1);
    const config = tweenConfigs[0];
    expect(config.targets).toBe(target);
    expect(config.x).toBe(195); // 200 - 5
    expect(config.duration).toBe(50);
    expect(config.yoyo).toBe(true);
    expect(config.repeat).toBe(2);
    expect(config.ease).toBe('Sine.inOut');
  });

  it('returns the shake tween', () => {
    const result = shakeIllegalMove({ scene, target });

    expect(result).toBeDefined();
    expect(result!.destroy).toBeDefined();
  });

  // ── onComplete behaviour ──────────────────────────────

  it('clears tint and resets x when tween completes', () => {
    shakeIllegalMove({ scene, target });

    const onComplete = tweenConfigs[0].onComplete as Function;
    onComplete();

    expect(target.clearTint).toHaveBeenCalledOnce();
    expect(target.setX).toHaveBeenCalledWith(200);
  });

  it('calls onComplete callback after tint is cleared', () => {
    const callOrder: string[] = [];

    (target.clearTint as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push('clearTint');
    });
    (target.setX as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push('setX');
    });
    const onComplete = vi.fn(() => callOrder.push('onComplete'));

    shakeIllegalMove({ scene, target, onComplete });
    (tweenConfigs[0].onComplete as Function)();

    expect(onComplete).toHaveBeenCalledOnce();
    // clearTint and setX are still called; destroy on the overlay is also called
    expect(callOrder).toEqual(['clearTint', 'setX', 'onComplete']);
  });

  it('does not throw when no onComplete is provided', () => {
    shakeIllegalMove({ scene, target });

    const cb = tweenConfigs[0].onComplete as Function;
    expect(() => cb()).not.toThrow();
  });

  // ── Custom options ────────────────────────────────────

  it('accepts custom tint colour', () => {
    shakeIllegalMove({ scene, target, tint: 0x00ff00 });

    expect(target.setTint).toHaveBeenCalledWith(0x00ff00);
  });

  it('accepts custom shake distance', () => {
    shakeIllegalMove({ scene, target, shakeDistance: 10 });

    expect(tweenConfigs[0].x).toBe(190); // 200 - 10
  });

  it('accepts custom duration', () => {
    shakeIllegalMove({ scene, target, duration: 100 });

    expect(tweenConfigs[0].duration).toBe(100);
  });

  it('accepts custom repeat count', () => {
    shakeIllegalMove({ scene, target, repeat: 5 });

    expect(tweenConfigs[0].repeat).toBe(5);
  });

  it('accepts custom ease', () => {
    shakeIllegalMove({ scene, target, ease: 'Linear' });

    expect(tweenConfigs[0].ease).toBe('Linear');
  });

  // ── Sound integration ─────────────────────────────────

  it('plays the default illegal-move sound when no soundKey is specified', () => {
    shakeIllegalMove({ scene, target });

    expect(scene.sound.play).toHaveBeenCalledWith('sfx-illegal-move');
  });

  it('plays a custom soundKey when provided', () => {
    shakeIllegalMove({ scene, target, soundKey: 'sfx-custom-error' });

    expect(scene.sound.play).toHaveBeenCalledWith('sfx-custom-error');
  });

  it('does not play any sound when soundKey is empty string', () => {
    shakeIllegalMove({ scene, target, soundKey: '' });

    expect(scene.sound.play).not.toHaveBeenCalled();
  });

  it('plays the default sound when soundKey is explicitly undefined (default kicks in)', () => {
    shakeIllegalMove({ scene, target, soundKey: undefined });

    expect(scene.sound.play).toHaveBeenCalledWith('sfx-illegal-move');
  });

  it('does not play sound when target is null (guard clause)', () => {
    shakeIllegalMove({ scene, target: null });

    expect(scene.sound.play).not.toHaveBeenCalled();
  });

  it('does not throw if sound.play throws (safePlaySound safety)', () => {
    const mockScene = scene as unknown as { sound: { play: ReturnType<typeof vi.fn> } };
    mockScene.sound.play.mockImplementation(() => { throw new Error('missing key'); });

    expect(() => shakeIllegalMove({ scene, target })).not.toThrow();
  });

  // ── Guard clause (null/undefined target) ──────────────

  it('returns undefined when target is null', () => {
    const result = shakeIllegalMove({ scene, target: null });

    expect(result).toBeUndefined();
    expect(tweenConfigs).toHaveLength(0);
  });

  it('returns undefined when target is undefined', () => {
    const result = shakeIllegalMove({ scene, target: undefined });

    expect(result).toBeUndefined();
    expect(tweenConfigs).toHaveLength(0);
  });

  // ── Equivalence with existing game implementations ────

  it('reproduces LostCities showIllegalMoveFlash pattern', () => {
    // LostCities: setTint(0xff4444), x: sprite.x - 5, duration: 50,
    //             yoyo: true, repeat: 2, ease: 'Sine.inOut', clearTint on complete
    const sprite = createMockTarget(300);

    shakeIllegalMove({
      scene,
      target: sprite,
      // All defaults match LostCities
    });

    expect(sprite.setTint).toHaveBeenCalledWith(0xff4444);
    expect(tweenConfigs[0].x).toBe(295); // 300 - 5
    expect(tweenConfigs[0].duration).toBe(50);
    expect(tweenConfigs[0].yoyo).toBe(true);
    expect(tweenConfigs[0].repeat).toBe(2);
    expect(tweenConfigs[0].ease).toBe('Sine.inOut');

    // Trigger completion
    (tweenConfigs[0].onComplete as Function)();
    expect(sprite.clearTint).toHaveBeenCalledOnce();
    expect(sprite.setX).toHaveBeenCalledWith(300);
  });

  it('reproduces The Mind showInvalidPlayFeedback pattern', () => {
    // The Mind: setTint(0xff4444), x: originalX - 5, duration: 50,
    //           yoyo: true, repeat: 2, clearTint + setX(originalX) on complete
    // The Mind did not specify ease (used Phaser default), but our default
    // 'Sine.inOut' harmonizes both games. The animation is visually identical.
    const sprite = createMockTarget(450);

    shakeIllegalMove({
      scene,
      target: sprite,
    });

    expect(sprite.setTint).toHaveBeenCalledWith(0xff4444);
    expect(tweenConfigs[0].x).toBe(445); // 450 - 5
    expect(tweenConfigs[0].duration).toBe(50);
    expect(tweenConfigs[0].yoyo).toBe(true);
    expect(tweenConfigs[0].repeat).toBe(2);

    (tweenConfigs[0].onComplete as Function)();
    expect(sprite.clearTint).toHaveBeenCalledOnce();
    expect(sprite.setX).toHaveBeenCalledWith(450);
  });

  // ── Reason toast (CG-0MVPXFHBZ004LGEB) ─────────────────

  /** Toast-capable mock scene: add.text + time.delayedCall + events.once. */
  function createToastMockScene(): {
    scene: Phaser.Scene;
    texts: Array<{ text: string; depth: number | null; setText: ReturnType<typeof vi.fn> }>;
    timers: Array<{ delay: number; callback: () => void }>;
    addTextMock: ReturnType<typeof vi.fn>;
  } {
    const texts: Array<{ text: string; depth: number | null; setText: ReturnType<typeof vi.fn> }> = [];
    const timers: Array<{ delay: number; callback: () => void }> = [];
    const base = createMockScene();
    const addTextMock = vi.fn((_x: number, _y: number, text: string) => {
      const obj: any = {
        text,
        depth: null,
        setText: vi.fn((value: string) => { obj.text = value; return obj; }),
        setOrigin: vi.fn().mockReturnThis(),
        setDepth: vi.fn((d: number) => { obj.depth = d; return obj; }),
        setWordWrapWidth: vi.fn().mockReturnThis(),
        setStroke: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      };
      texts.push(obj);
      return obj;
    });
    (base as any).add.text = addTextMock;
    (base as any).time = {
      delayedCall: vi.fn((delay: number, callback: () => void) => {
        timers.push({ delay, callback });
        return { remove: vi.fn() };
      }),
    };
    (base as any).events = {
      once: vi.fn(),
    };
    return { scene: base as Phaser.Scene, texts, timers, addTextMock: addTextMock as any };
  }

  it('renders the reason as a toast when a reason is provided (AC1)', () => {
    const { scene: toastScene, texts } = createToastMockScene();
    const toastTarget = createMockTarget(120);

    shakeIllegalMove({
      scene: toastScene,
      target: toastTarget,
      reason: 'That figure cannot be played here.',
    });

    expect(texts).toHaveLength(1);
    expect(texts[0].text).toBe('That figure cannot be played here.');
    expect(tweenConfigs).toHaveLength(1); // the shake still runs
  });

  it('does not create a toast when no reason is given (AC1 backwards compat)', () => {
    const { scene: toastScene, addTextMock } = createToastMockScene();

    shakeIllegalMove({ scene: toastScene, target: createMockTarget(120) });

    expect(addTextMock).not.toHaveBeenCalled();
  });

  it('shows the toast even when the target is null (AC3)', () => {
    const { scene: toastScene, texts } = createToastMockScene();

    const result = shakeIllegalMove({
      scene: toastScene,
      target: null,
      reason: 'No eligible slot on the street.',
    });

    expect(result).toBeUndefined();
    expect(texts).toHaveLength(1);
    expect(texts[0].text).toBe('No eligible slot on the street.');
    expect(tweenConfigs).toHaveLength(0);
  });

  it('handles a non-tintable Container: position shake only, toast shown (AC3)', () => {
    const { scene: toastScene, texts } = createToastMockScene();
    const container = {
      x: 200,
      depth: 3,
      setX: vi.fn((x: number) => { container.x = x; }),
    } as unknown as Phaser.GameObjects.Container;

    const tween = shakeIllegalMove({
      scene: toastScene,
      target: container,
      reason: 'The street is full.',
    });

    expect(tween).toBeDefined();
    expect(texts).toHaveLength(1);
    expect(texts[0].text).toBe('The street is full.');
    // Container has no setTint: neither tint nor the Canvas overlay is used.
    const config = tweenConfigs[0];
    expect(config.targets).toBe(container);
    expect(config.x).toBe(195); // 200 - 5
    (config.onComplete as Function)();
    expect(container.setX).toHaveBeenCalledWith(200);
  });

  it('suppresses the shake (but not the toast) under reduced motion (AC3)', () => {
    const { scene: toastScene, texts } = createToastMockScene();
    const onComplete = vi.fn();

    const result = shakeIllegalMove({
      scene: toastScene,
      target: createMockTarget(200),
      reason: 'That split costs more than you hold.',
      reducedMotion: true,
      onComplete,
    });

    expect(result).toBeUndefined();
    expect(tweenConfigs).toHaveLength(0);
    expect(texts).toHaveLength(1);
    expect(texts[0].text).toBe('That split costs more than you hold.');
    // The completion hook still fires so callers that chain on it are safe.
    expect(onComplete).toHaveBeenCalledOnce();
    // The project-wide reduced-motion contract also suppresses SFX: the
    // toast is the feedback channel.
    expect((toastScene as unknown as { sound: { play: ReturnType<typeof vi.fn> } }).sound.play).not.toHaveBeenCalled();
  });

  it('passes a custom reasonDwellMs to the toast timer', () => {
    const { scene: toastScene, timers } = createToastMockScene();

    shakeIllegalMove({
      scene: toastScene,
      target: null,
      reason: 'Blocked by the gate figure.',
      reasonDwellMs: 1250,
    });

    expect(timers).toHaveLength(1);
    expect(timers[0].delay).toBe(1250);
  });

  it('repeat rejects replace, never stack (AC4)', () => {
    const { scene: toastScene, texts } = createToastMockScene();

    shakeIllegalMove({ scene: toastScene, target: null, reason: 'First reason.' });
    shakeIllegalMove({ scene: toastScene, target: null, reason: 'Second reason.' });

    expect(texts).toHaveLength(1);
    expect(texts[0].text).toBe('Second reason.');
  });
});
