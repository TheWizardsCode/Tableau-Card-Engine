import { describe, expect, it, vi } from 'vitest';
import { runSceneTransition } from '../../src/ui/sceneTransition';

function createMockScene() {
  const tweenConfigs: Array<Record<string, unknown>> = [];
  const camera = {
    alpha: 1,
    fadeEffect: {
      reset: vi.fn(),
    },
  };

  const scene = {
    cameras: { main: camera },
    tweens: {
      add: vi.fn((config: Record<string, unknown>) => {
        tweenConfigs.push(config);
        const onComplete = config.onComplete as (() => void) | undefined;
        setTimeout(() => onComplete?.(), 0);
        return {};
      }),
    },
  };

  return { scene, tweenConfigs, camera };
}

describe('runSceneTransition', () => {
  it('resolves immediately in reduced-motion mode', async () => {
    const { scene } = createMockScene();

    await runSceneTransition({
      scene: scene as any,
      mode: 'enter',
      reducedMotion: true,
    });

    expect(scene.tweens.add).not.toHaveBeenCalled();
  });

  it('runs fade enter transition', async () => {
    const { scene, tweenConfigs } = createMockScene();

    await runSceneTransition({
      scene: scene as any,
      mode: 'enter',
      type: 'fade',
      duration: 300,
    });

    expect(scene.tweens.add).toHaveBeenCalledTimes(1);
    expect(tweenConfigs[0].alpha).toBe(1);
    expect(tweenConfigs[0].duration).toBe(300);
  });

  it('runs slide exit transition', async () => {
    const { scene, tweenConfigs } = createMockScene();

    await runSceneTransition({
      scene: scene as any,
      mode: 'exit',
      type: 'slide',
      distance: 100,
      duration: 260,
    });

    expect(scene.tweens.add).toHaveBeenCalledTimes(1);
    expect(tweenConfigs[0].scrollX).toBe(100);
    expect(tweenConfigs[0].duration).toBe(260);
  });
});
