/**
 * Unit tests for shakeIllegalMove -- illegal-move shake animation helper.
 *
 * Phaser tween system is mocked to verify correct tween configurations
 * and callback sequencing without a running Phaser instance.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shakeIllegalMove } from '../../src/ui/shakeIllegalMove';

// ── Mock helpers ────────────────────────────────────────────

/** Captured tween configs in call order. */
let tweenConfigs: Phaser.Types.Tweens.TweenBuilderConfig[];

/** Mock Phaser tween object returned by tweens.add. */
function createMockTween(): Phaser.Tweens.Tween {
  return { destroy: vi.fn() } as unknown as Phaser.Tweens.Tween;
}

/** Create a mock Phaser scene with a tweens.add spy and sound.play mock. */
function createMockScene(): Phaser.Scene {
  tweenConfigs = [];
  const destroyed: any[] = [];
  const rectangles: any[] = [];
  return {
    add: {
      rectangle: vi.fn().mockImplementation((x: number, y: number, w: number, h: number, color: number) => {
        const rect = {
          x, y, width: w, height: h, color,
          active: true,
          setPosition: vi.fn().mockReturnThis(),
          setOrigin: vi.fn().mockReturnThis(),
          setDepth: vi.fn().mockReturnThis(),
          setAlpha: vi.fn().mockReturnThis(),
          destroy: vi.fn().mockImplementation(() => {
            rect.active = false;
            destroyed.push(rect);
          }),
        };
        rectangles.push(rect);
        return rect;
      }),
    },
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

/** Create a mock Phaser Image with position, tint, and x-reset methods. */
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
});
