import { describe, it, expect, vi, beforeEach } from 'vitest';

import { moveGameObject } from '../../src/ui/moveGameObject';

let tweenConfig: Phaser.Types.Tweens.TweenBuilderConfig | null = null;

function createScene() {
  tweenConfig = null;
  return {
    tweens: {
      add: vi.fn((config: Phaser.Types.Tweens.TweenBuilderConfig) => {
        tweenConfig = config;
        return { destroy: vi.fn() } as unknown as Phaser.Tweens.Tween;
      }),
    },
    sound: {
      add: vi.fn(() => ({ play: vi.fn(), stop: vi.fn() })),
      play: vi.fn(),
    },
  } as unknown as Phaser.Scene;
}

describe('moveGameObject', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses looping sound for moveLoop and stops it on complete', () => {
    const scene = createScene();
    const createdSound = { play: vi.fn(), stop: vi.fn() };
    (scene.sound.add as unknown as ReturnType<typeof vi.fn>).mockReturnValue(createdSound);

    moveGameObject({
      scene,
      target: { x: 0, y: 0 } as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
      destX: 10,
      destY: 20,
      sfx: { move: 'ms-move-loop', moveLoop: true },
    });

    (tweenConfig?.onStart as () => void)?.();
    expect(scene.sound.add).toHaveBeenCalledWith('ms-move-loop', { loop: true });
    expect(createdSound.play).toHaveBeenCalledOnce();

    (tweenConfig?.onComplete as () => void)?.();
    expect(createdSound.stop).toHaveBeenCalledOnce();
  });

  it('throttles move playback when moveLoop is disabled', () => {
    const scene = createScene();
    const soundManager = {
      play: vi.fn(),
      stop: vi.fn(),
      setVolume: vi.fn(),
      setMute: vi.fn(),
    } as any;

    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);

    moveGameObject({
      scene,
      target: { x: 0, y: 0 } as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
      destX: 10,
      destY: 20,
      soundManager,
      sfx: { move: 'ms-move', moveIntervalMs: 200 },
    });

    (tweenConfig?.onStart as () => void)?.();
    expect(soundManager.play).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(1_100);
    (tweenConfig?.onUpdate as () => void)?.();
    expect(soundManager.play).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(1_300);
    (tweenConfig?.onUpdate as () => void)?.();
    expect(soundManager.play).toHaveBeenCalledTimes(2);
  });
});
