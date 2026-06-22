import { getEffectiveReducedMotion } from './ReducedMotion';

export type SceneTransitionType = 'fade' | 'slide';
export type SceneTransitionMode = 'enter' | 'exit';

export interface SceneTransitionOptions {
  scene: Phaser.Scene;
  mode: SceneTransitionMode;
  type?: SceneTransitionType;
  duration?: number;
  ease?: string;
  distance?: number;
  reducedMotion?: boolean;
}

export function runSceneTransition(options: SceneTransitionOptions): Promise<void> {
  const {
    scene,
    mode,
    type = 'fade',
    duration = 300,
    ease = 'Quad.easeOut',
    distance = 80,
    reducedMotion,
  } = options;

  const shouldReduce = reducedMotion ?? getEffectiveReducedMotion();
  if (shouldReduce) return Promise.resolve();

  const camera = scene.cameras.main;

  if (type === 'fade') {
    if (mode === 'enter') {
      camera.alpha = 0;
      return new Promise((resolve) => {
        scene.tweens.add({
          targets: camera,
          alpha: 1,
          duration,
          ease,
          onComplete: () => resolve(),
        });
      });
    }

    return new Promise((resolve) => {
      scene.tweens.add({
        targets: camera,
        alpha: 0,
        duration,
        ease,
        onComplete: () => resolve(),
      });
    });
  }

  if (mode === 'enter') {
    camera.scrollX = -distance;
    camera.alpha = 0;
    return new Promise((resolve) => {
      scene.tweens.add({
        targets: camera,
        scrollX: 0,
        alpha: 1,
        duration,
        ease,
        onComplete: () => resolve(),
      });
    });
  }

  return new Promise((resolve) => {
    scene.tweens.add({
      targets: camera,
      scrollX: distance,
      alpha: 0,
      duration,
      ease,
      onComplete: () => resolve(),
    });
  });
}
