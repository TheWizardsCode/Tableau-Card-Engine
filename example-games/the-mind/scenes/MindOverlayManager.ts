/**
 * MindOverlayManager -- handles win/loss overlays for The Mind.
 */

import {
  GAME_H,
  GAME_W,
  createParameterizedOverlay,
  overlayCenterY,
} from '../../../src/ui';
import { MAX_LEVEL } from '../TheMindGameState';
import type { TheMindSession } from '../TheMindGameState';
import type { SoundManager, GameEventEmitter } from '../../../src/core-engine';
import { DEPTH_OVERLAY, DEPTH_OVERLAY_CONTENT } from './MindConstants';
import { SFX_KEYS } from './MindAudioKeys';

export class MindOverlayManager {
  overlayObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private scene: Phaser.Scene,
    private session: TheMindSession,
    private gameEvents: GameEventEmitter,
    private soundManager: SoundManager | null,
  ) {}

  showWinOverlay(): void {
    this.soundManager?.play(SFX_KEYS.GAME_WIN);
    this.showOutcomeOverlay({
      title: 'You Win!',
      titleColor: '#88ff88',
      detailText: `Completed all ${MAX_LEVEL} levels!\nLives remaining: ${'❤'.repeat(this.session.lives)}`,
      primaryButtonLabel: '[ Play Again ]',
      primaryButtonEvent: 'play-again',
    });
  }

  showLossOverlay(): void {
    this.soundManager?.play(SFX_KEYS.GAME_LOST);
    this.showOutcomeOverlay({
      title: 'Game Over',
      titleColor: '#ff6666',
      detailText: `Reached Level ${this.session.currentLevel} of ${MAX_LEVEL}\nRan out of lives!`,
      primaryButtonLabel: '[ Try Again ]',
      primaryButtonEvent: 'try-again',
    });
  }

  private showOutcomeOverlay(config: {
    title: string;
    titleColor: string;
    detailText: string;
    primaryButtonLabel: string;
    primaryButtonEvent: string;
  }): void {
    this.dismiss();

    this.overlayObjects = createParameterizedOverlay(this.scene, {
      title: config.title,
      titleColor: config.titleColor,
      detailText: config.detailText,
      titleY: overlayCenterY(-60),
      detailY: overlayCenterY(-15),
      titleDepth: DEPTH_OVERLAY_CONTENT,
      detailDepth: DEPTH_OVERLAY_CONTENT,
      background: { depth: DEPTH_OVERLAY, alpha: 0.75 },
      box: { width: 460, height: 280, alpha: 0.9 },
      buttons: [
        {
          label: config.primaryButtonLabel,
          x: GAME_W / 2 - 90,
          y: GAME_H / 2 + 60,
          config: { fontSize: '18px' },
          onClick: () => {
            this.soundManager?.play(SFX_KEYS.UI_CLICK);
            this.gameEvents.emit('ui-interaction', {
              elementId: config.primaryButtonEvent,
              action: 'click',
            });
            this.scene.time.delayedCall(0, () => this.scene.scene.restart());
          },
        },
        {
          label: '[ Menu ]',
          x: GAME_W / 2 + 90,
          y: GAME_H / 2 + 60,
          config: { fontSize: '18px' },
          onClick: () => {
            this.soundManager?.play(SFX_KEYS.UI_CLICK);
            this.gameEvents.emit('ui-interaction', {
              elementId: 'menu',
              action: 'click',
            });
            this.scene.time.delayedCall(0, () =>
              this.scene.scene.start('GameSelectorScene'),
            );
          },
        },
      ],
    });
  }

  dismiss(): void {
    for (const obj of this.overlayObjects) {
      if (obj.active) {
        obj.destroy();
      }
    }
    this.overlayObjects = [];
  }
}
