import { describe, it, expect } from 'vitest';
import { popTextOrIcon } from '../../src/ui/popTextOrIcon';
import { createMockSceneWithTweens } from '../helpers/MockFactory';

function createMockScene() {
  const scene = createMockSceneWithTweens({}, { autoTweenComplete: true });
  return { scene, tweenConfigs: scene.tweensList };
}

describe('popTextOrIcon', () => {
  it('resolves immediately with reduced motion and skips tween', async () => {
    const { scene } = createMockScene();
    const target = scene.add.text(10, 20, '+1');

    await popTextOrIcon({
      scene: scene as any,
      target: target as any,
      reducedMotion: true,
    });

    expect(scene.tweens.add).not.toHaveBeenCalled();
    expect(target.destroy).toHaveBeenCalled();
  });

  it('creates a tween and resolves on completion', async () => {
    const { scene, tweenConfigs } = createMockScene();
    const target = scene.add.text(20, 30, '+2');

    await popTextOrIcon({
      scene: scene as any,
      target: target as any,
      duration: 420,
      riseY: 18,
      scale: 1.2,
    });

    expect(scene.tweens.add).toHaveBeenCalledTimes(1);
    expect(tweenConfigs[0].duration).toBe(420);
    expect(tweenConfigs[0].y).toBe(12);
    expect(tweenConfigs[0].scaleX).toBe(1.2);
    expect(target.destroy).toHaveBeenCalled();
  });

  it('can create text target with longer readable duration', async () => {
    const { scene, tweenConfigs } = createMockScene();
    const target = scene.add.text(50, 60, '♪ Sound!');

    await popTextOrIcon({
      scene: scene as any,
      target: target as any,
      duration: 1800,
      riseY: 30,
      scale: 1.3,
    });

    expect(scene.tweens.add).toHaveBeenCalledTimes(1);
    expect(tweenConfigs[0].duration).toBe(1800);
    expect(tweenConfigs[0].scaleX).toBe(1.3);
    expect(tweenConfigs[0].y).toBe(30);
    expect(target.destroy).toHaveBeenCalled();
  });

  it('can create text target when label and position are provided', async () => {
    const { scene } = createMockScene();

    await popTextOrIcon({
      scene: scene as any,
      label: '+3',
      x: 100,
      y: 80,
      reducedMotion: true,
    });

    expect(scene.add.text).toHaveBeenCalledWith(
      100,
      80,
      '+3',
      expect.any(Object),
    );
  });
});
