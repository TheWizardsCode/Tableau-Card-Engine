import { FONT_FAMILY, GAME_H, GAME_W } from './constants';
import { createOverlayBackground, dismissOverlay, type OverlayBackgroundOptions, type OverlayBoxOptions } from './Overlay';
import { createOverlayButton, type OverlayButtonConfig } from './OverlayButton';

export interface ParameterizedOverlayButton {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly onClick: () => void;
  readonly config?: OverlayButtonConfig;
}

export interface ParameterizedOverlayConfig {
  readonly title: string;
  readonly titleColor: string;
  readonly detailText: string;
  readonly detailColor?: string;
  readonly titleY: number;
  readonly detailY: number;
  readonly titleFontSize?: string;
  readonly detailFontSize?: string;
  readonly titleDepth: number;
  readonly detailDepth: number;
  readonly buttons: ReadonlyArray<ParameterizedOverlayButton>;
  readonly background?: OverlayBackgroundOptions;
  readonly box?: OverlayBoxOptions;
}

export function createParameterizedOverlay(
  scene: Phaser.Scene,
  config: ParameterizedOverlayConfig,
): Phaser.GameObjects.GameObject[] {
  const overlay = createOverlayBackground(
    scene,
    config.background,
    config.box,
  );

  const objects: Phaser.GameObjects.GameObject[] = [...overlay.objects];

  const title = scene.add
    .text(GAME_W / 2, config.titleY, config.title, {
      fontSize: config.titleFontSize ?? '36px',
      color: config.titleColor,
      fontFamily: FONT_FAMILY,
      align: 'center',
    })
    .setOrigin(0.5)
    .setDepth(config.titleDepth);
  objects.push(title);

  const detail = scene.add
    .text(GAME_W / 2, config.detailY, config.detailText, {
      fontSize: config.detailFontSize ?? '16px',
      color: config.detailColor ?? '#cccccc',
      fontFamily: FONT_FAMILY,
      align: 'center',
    })
    .setOrigin(0.5)
    .setDepth(config.detailDepth);
  objects.push(detail);

  for (const button of config.buttons) {
    const btn = createOverlayButton(
      scene,
      button.x,
      button.y,
      button.label,
      config.detailDepth,
      button.config,
    );
    btn.on('pointerdown', button.onClick);
    objects.push(btn);
  }

  return objects;
}

export function overlayCenterY(offset: number): number {
  return GAME_H / 2 + offset;
}

/**
 * Dismiss a parameterized overlay created by createParameterizedOverlay.
 *
 * Destroys all game objects (background, title, detail, buttons) created
 * by the overlay factory.
 *
 * @param objects  The array of game objects returned by createParameterizedOverlay.
 */
export function dismissParameterizedOverlay(
  objects: Phaser.GameObjects.GameObject[],
): void {
  dismissOverlay(objects);
}
