export interface PopTextOrIconOptions {
  scene: Phaser.Scene;
  target?: Phaser.GameObjects.GameObject & {
    x: number;
    y: number;
    alpha: number;
    scaleX: number;
    scaleY: number;
    destroy(): void;
  };
  label?: string;
  x?: number;
  y?: number;
  duration?: number;
  riseY?: number;
  scale?: number;
  ease?: string;
  reducedMotion?: boolean;
  style?: Phaser.Types.GameObjects.Text.TextStyle;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function popTextOrIcon(options: PopTextOrIconOptions): Promise<void> {
  const {
    scene,
    target,
    label,
    x,
    y,
    duration = 450,
    riseY = 20,
    scale = 1.15,
    ease = 'Cubic.easeOut',
    reducedMotion,
    style,
  } = options;

  const textTarget = target ?? (label !== undefined && x !== undefined && y !== undefined
    ? scene.add.text(x, y, label, {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff',
      ...style,
    }).setOrigin(0.5)
    : null);

  if (!textTarget) {
    return Promise.resolve();
  }

  const shouldReduce = reducedMotion ?? prefersReducedMotion();
  if (shouldReduce) {
    textTarget.destroy();
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    scene.tweens.add({
      targets: textTarget,
      y: textTarget.y - riseY,
      alpha: 0,
      scaleX: scale,
      scaleY: scale,
      duration,
      ease,
      onComplete: () => {
        textTarget.destroy();
        resolve();
      },
    });
  });
}
