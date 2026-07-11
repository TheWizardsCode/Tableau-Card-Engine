/**
 * Unit tests for flipCard – two-phase card-flip animation helper.
 *
 * Phaser tween system is mocked to verify correct tween configurations
 * and callback sequencing without a running Phaser instance.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flipCard } from '../../src/ui/flipCard';

// ── Mock helpers ────────────────────────────────────────────

/** Captured tween configs in call order. */
let tweenConfigs: Phaser.Types.Tweens.TweenBuilderConfig[];

/** Mock Phaser tween object returned by tweens.add. */
function createMockTween(): Phaser.Tweens.Tween {
  return { destroy: vi.fn() } as unknown as Phaser.Tweens.Tween;
}

/** Create a mock Phaser scene with a tweens.add spy. */
function createMockScene(): Phaser.Scene {
  tweenConfigs = [];
  return {
    tweens: {
      add: vi.fn((config: Phaser.Types.Tweens.TweenBuilderConfig) => {
        tweenConfigs.push(config);
        return createMockTween();
      }),
    },
  } as unknown as Phaser.Scene;
}

/** Create a mock Phaser Image/Sprite with position and setTexture. */
function createMockTarget(x = 100, y = 200): Phaser.GameObjects.Image {
  return {
    x,
    y,
    setTexture: vi.fn(),
  } as unknown as Phaser.GameObjects.Image;
}

// ── Tests ───────────────────────────────────────────────────

describe('flipCard', () => {
  let scene: Phaser.Scene;
  let target: Phaser.GameObjects.Image;

  beforeEach(() => {
    scene = createMockScene();
    target = createMockTarget();
  });

  // ── Basic flip (no translation) ────────────────────────

  it('creates a close-phase tween with scaleX: 0', () => {
    flipCard({ scene, target, newTexture: 'card_face' });

    expect(tweenConfigs).toHaveLength(1);
    expect(tweenConfigs[0].targets).toBe(target);
    expect(tweenConfigs[0].scaleX).toBe(0);
  });

  it('uses default duration of 300ms (150ms per half)', () => {
    flipCard({ scene, target, newTexture: 'card_face' });

    expect(tweenConfigs[0].duration).toBe(150);
  });

  it('uses default easing of Power2 for close phase', () => {
    flipCard({ scene, target, newTexture: 'card_face' });

    expect(tweenConfigs[0].ease).toBe('Power2');
  });

  it('does not include x/y properties when no destination provided', () => {
    flipCard({ scene, target, newTexture: 'card_face' });

    expect(tweenConfigs[0].x).toBeUndefined();
    expect(tweenConfigs[0].y).toBeUndefined();
  });

  it('returns the close-phase tween', () => {
    const result = flipCard({ scene, target, newTexture: 'card_face' });

    expect(result).toBeDefined();
    expect(result.destroy).toBeDefined(); // Our mock tween
  });

  // ── Midpoint callback (simulating close-phase onComplete) ──

  describe('when close phase completes', () => {
    beforeEach(() => {
      flipCard({
        scene,
        target,
        newTexture: 'card_face',
        duration: 400,
        easeClose: 'Cubic.easeIn',
        easeOpen: 'Cubic.easeOut',
      });
      // Trigger the close-phase onComplete
      const closeCb = tweenConfigs[0].onComplete as Function;
      closeCb();
    });

    it('sets the new texture on the target', () => {
      expect(target.setTexture).toHaveBeenCalledWith('card_face');
    });

    it('creates an open-phase tween with scaleX: 1', () => {
      expect(tweenConfigs).toHaveLength(2);
      expect(tweenConfigs[1].targets).toBe(target);
      expect(tweenConfigs[1].scaleX).toBe(1);
    });

    it('uses specified easeOpen for the open phase', () => {
      expect(tweenConfigs[1].ease).toBe('Cubic.easeOut');
    });

    it('uses half the total duration for the open phase', () => {
      expect(tweenConfigs[1].duration).toBe(200);
    });
  });

  // ── Custom easing ──────────────────────────────────────

  it('defaults easeOpen to easeClose when not specified', () => {
    flipCard({
      scene,
      target,
      newTexture: 'card_face',
      easeClose: 'Quad.easeInOut',
    });
    // Trigger close complete
    (tweenConfigs[0].onComplete as Function)();

    expect(tweenConfigs[0].ease).toBe('Quad.easeInOut');
    expect(tweenConfigs[1].ease).toBe('Quad.easeInOut');
  });

  // ── onMidpoint callback ────────────────────────────────

  it('calls onMidpoint after setting texture', () => {
    const callOrder: string[] = [];

    (target.setTexture as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push('setTexture');
    });
    const onMidpoint = vi.fn(() => callOrder.push('onMidpoint'));

    flipCard({ scene, target, newTexture: 'card_face', onMidpoint });
    (tweenConfigs[0].onComplete as Function)();

    expect(onMidpoint).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(['setTexture', 'onMidpoint']);
  });

  // ── onComplete callback ────────────────────────────────

  it('calls onComplete when open phase finishes', () => {
    const onComplete = vi.fn();

    flipCard({ scene, target, newTexture: 'card_face', onComplete });
    // Close phase done
    (tweenConfigs[0].onComplete as Function)();
    // Open phase done
    (tweenConfigs[1].onComplete as Function)();

    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('does not set onComplete on open tween when none provided', () => {
    flipCard({ scene, target, newTexture: 'card_face' });
    (tweenConfigs[0].onComplete as Function)();

    expect(tweenConfigs[1].onComplete).toBeUndefined();
  });

  it('uses scene.sound.add for looping move SFX and stops it on completion', () => {
    const stop = vi.fn();
    const play = vi.fn();
    const add = vi.fn(() => ({ play, stop }));

    scene = {
      tweens: {
        add: vi.fn((config: Phaser.Types.Tweens.TweenBuilderConfig) => {
          tweenConfigs.push(config);
          return createMockTween();
        }),
      },
      sound: { add },
    } as unknown as Phaser.Scene;

    flipCard({
      scene,
      target,
      newTexture: 'card_face',
      onComplete: vi.fn(),
      sfx: { move: 'sfx-move-loop', moveLoop: true },
    });

    (tweenConfigs[0].onStart as Function)();
    expect(add).toHaveBeenCalledWith('sfx-move-loop', { loop: true });
    expect(play).toHaveBeenCalledOnce();

    (tweenConfigs[0].onComplete as Function)();
    (tweenConfigs[1].onComplete as Function)();
    expect(stop).toHaveBeenCalledOnce();
  });

  // ── Flip with translation ──────────────────────────────

  describe('with destination (flip + translate)', () => {
    const destX = 500;
    const destY = 400;

    beforeEach(() => {
      target = createMockTarget(100, 200);
      flipCard({
        scene,
        target,
        newTexture: 'card_face',
        destX,
        destY,
      });
    });

    it('moves to midpoint position during close phase', () => {
      // Midpoint = average of start and dest
      expect(tweenConfigs[0].x).toBe((100 + 500) / 2); // 300
      expect(tweenConfigs[0].y).toBe((200 + 400) / 2); // 300
    });

    it('moves to final destination during open phase', () => {
      (tweenConfigs[0].onComplete as Function)();

      expect(tweenConfigs[1].x).toBe(500);
      expect(tweenConfigs[1].y).toBe(400);
    });
  });

  // ── Custom duration ────────────────────────────────────

  it('splits custom duration equally between phases', () => {
    flipCard({ scene, target, newTexture: 'card_face', duration: 500 });

    expect(tweenConfigs[0].duration).toBe(250);

    (tweenConfigs[0].onComplete as Function)();
    expect(tweenConfigs[1].duration).toBe(250);
  });

  // ── Equivalence with Golf's swap-flip pattern ──────────

  it('reproduces Golf swap-flip: Power2 easing, 450ms duration, with translation', () => {
    const sprite = createMockTarget(200, 300);
    const discardPos = { x: 600, y: 100 };

    flipCard({
      scene,
      target: sprite,
      newTexture: 'card_face_texture',
      duration: 450,
      easeClose: 'Power2',
      destX: discardPos.x,
      destY: discardPos.y,
    });

    // Close phase
    expect(tweenConfigs[0].scaleX).toBe(0);
    expect(tweenConfigs[0].duration).toBe(225);
    expect(tweenConfigs[0].ease).toBe('Power2');
    expect(tweenConfigs[0].x).toBe((200 + 600) / 2); // 400
    expect(tweenConfigs[0].y).toBe((300 + 100) / 2); // 200

    // Trigger midpoint
    (tweenConfigs[0].onComplete as Function)();

    // Open phase
    expect(tweenConfigs[1].scaleX).toBe(1);
    expect(tweenConfigs[1].duration).toBe(225);
    expect(tweenConfigs[1].ease).toBe('Power2');
    expect(tweenConfigs[1].x).toBe(600);
    expect(tweenConfigs[1].y).toBe(100);
  });

  // ── Equivalence with The Mind's AI flip pattern ────────

  it('reproduces The Mind AI flip: asymmetric easing, 250ms, flip-only (translation separate)', () => {
    const sprite = createMockTarget(400, 100) as any;
    sprite.scaleX = 1;
    const setDisplaySize = vi.fn(() => {
      // Simulate Phaser setDisplaySize changing effective scaleX.
      sprite.scaleX = 0.25;
    });
    sprite.setDisplaySize = setDisplaySize;

    flipCard({
      scene,
      target: sprite,
      newTexture: 'mind_card_42',
      duration: 250,
      easeClose: 'Cubic.easeIn',
      easeOpen: 'Cubic.easeOut',
      onMidpoint: () => {
        sprite.setDisplaySize(120, 168);
      },
    });

    // Close phase
    expect(tweenConfigs[0].scaleX).toBe(0);
    expect(tweenConfigs[0].duration).toBe(125);
    expect(tweenConfigs[0].ease).toBe('Cubic.easeIn');
    expect(tweenConfigs[0].x).toBeUndefined(); // No translation in flip tween

    // Trigger midpoint
    (tweenConfigs[0].onComplete as Function)();

    expect(sprite.setTexture).toHaveBeenCalledWith('mind_card_42');
    expect(setDisplaySize).toHaveBeenCalledWith(120, 168);

    // Open phase should preserve midpoint scale target (no width pop).
    expect(tweenConfigs[1].scaleX).toBe(0.25);
    expect(tweenConfigs[1].duration).toBe(125);
    expect(tweenConfigs[1].ease).toBe('Cubic.easeOut');
  });

  // ── Equivalence with Golf's in-place flip ──────────────

  it('reproduces Golf discard-and-flip: Power2, 225ms (quarter of 450 * 2), in place', () => {
    const sprite = createMockTarget(300, 400);
    const onComplete = vi.fn();

    // Golf uses SWAP_ANIM_DURATION / 4 per half = 450 / 4 = 112.5ms
    // Total duration = 112.5 * 2 = 225ms
    flipCard({
      scene,
      target: sprite,
      newTexture: 'grid_card_face',
      duration: 225,
      easeClose: 'Power2',
      onComplete,
    });

    expect(tweenConfigs[0].duration).toBe(112.5);
    expect(tweenConfigs[0].x).toBeUndefined(); // In-place flip

    (tweenConfigs[0].onComplete as Function)();

    expect(tweenConfigs[1].duration).toBe(112.5);
    expect(tweenConfigs[1].x).toBeUndefined();

    (tweenConfigs[1].onComplete as Function)();
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
