/**
 * MindOverlayManager -- handles win/loss overlays for The Mind.
 */

import { GAME_W, GAME_H, FONT_FAMILY, createOverlayBackground, createOverlayButton } from '../../../src/ui';
import { MAX_LEVEL } from '../TheMindGameState';
import type { TheMindSession } from '../TheMindGameState';
import type { SoundManager, GameEventEmitter } from '../../../src/core-engine';
import { DEPTH_OVERLAY, DEPTH_OVERLAY_CONTENT, SFX_KEYS } from './MindConstants';

export class MindOverlayManager {
  overlayObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private scene: Phaser.Scene,
    private session: TheMindSession,
    private gameEvents: GameEventEmitter,
    private soundManager: SoundManager | null,
  ) {}

  // ── Win overlay ────────────────────────────────────────

  showWinOverlay(): void {
    this.soundManager?.play(SFX_KEYS.GAME_WIN);

    const overlay = createOverlayBackground(
      this.scene,
      { depth: DEPTH_OVERLAY, alpha: 0.75 },
      { width: 460, height: 280, alpha: 0.9 },
    );
    this.overlayObjects.push(...overlay.objects);

    const titleText = this.scene.add
      .text(GAME_W / 2, GAME_H / 2 - 60, 'You Win!', {
        fontSize: '36px',
        color: '#88ff88',
        fontFamily: FONT_FAMILY,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY_CONTENT);
    this.overlayObjects.push(titleText);

    const detailText = this.scene.add
      .text(
        GAME_W / 2,
        GAME_H / 2 - 15,
        `Completed all ${MAX_LEVEL} levels!\nLives remaining: ${'\u2764'.repeat(this.session.lives)}`,
        {
          fontSize: '16px',
          color: '#cccccc',
          fontFamily: FONT_FAMILY,
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY_CONTENT);
    this.overlayObjects.push(detailText);

    const playAgainBtn = createOverlayButton(
      this.scene,
      GAME_W / 2 - 90,
      GAME_H / 2 + 60,
      '[ Play Again ]',
      DEPTH_OVERLAY_CONTENT,
      { fontSize: '18px' },
    );
    playAgainBtn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      this.gameEvents.emit('ui-interaction', {
        elementId: 'play-again',
        action: 'click',
      });
      this.scene.time.delayedCall(0, () => this.scene.scene.restart());
    });
    this.overlayObjects.push(playAgainBtn);

    const menuBtn = createOverlayButton(
      this.scene,
      GAME_W / 2 + 90,
      GAME_H / 2 + 60,
      '[ Menu ]',
      DEPTH_OVERLAY_CONTENT,
      { fontSize: '18px' },
    );
    menuBtn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      this.gameEvents.emit('ui-interaction', {
        elementId: 'menu',
        action: 'click',
      });
      this.scene.time.delayedCall(0, () =>
        this.scene.scene.start('GameSelectorScene'),
      );
    });
    this.overlayObjects.push(menuBtn);
  }

  // ── Loss overlay ───────────────────────────────────────

  showLossOverlay(): void {
    this.soundManager?.play(SFX_KEYS.GAME_LOST);

    const overlay = createOverlayBackground(
      this.scene,
      { depth: DEPTH_OVERLAY, alpha: 0.75 },
      { width: 460, height: 280, alpha: 0.9 },
    );
    this.overlayObjects.push(...overlay.objects);

    const titleText = this.scene.add
      .text(GAME_W / 2, GAME_H / 2 - 60, 'Game Over', {
        fontSize: '36px',
        color: '#ff6666',
        fontFamily: FONT_FAMILY,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY_CONTENT);
    this.overlayObjects.push(titleText);

    const detailText = this.scene.add
      .text(
        GAME_W / 2,
        GAME_H / 2 - 15,
        `Reached Level ${this.session.currentLevel} of ${MAX_LEVEL}\nRan out of lives!`,
        {
          fontSize: '16px',
          color: '#cccccc',
          fontFamily: FONT_FAMILY,
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY_CONTENT);
    this.overlayObjects.push(detailText);

    const tryAgainBtn = createOverlayButton(
      this.scene,
      GAME_W / 2 - 90,
      GAME_H / 2 + 60,
      '[ Try Again ]',
      DEPTH_OVERLAY_CONTENT,
      { fontSize: '18px' },
    );
    tryAgainBtn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      this.gameEvents.emit('ui-interaction', {
        elementId: 'try-again',
        action: 'click',
      });
      this.scene.time.delayedCall(0, () => this.scene.scene.restart());
    });
    this.overlayObjects.push(tryAgainBtn);

    const menuBtn = createOverlayButton(
      this.scene,
      GAME_W / 2 + 90,
      GAME_H / 2 + 60,
      '[ Menu ]',
      DEPTH_OVERLAY_CONTENT,
      { fontSize: '18px' },
    );
    menuBtn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      this.gameEvents.emit('ui-interaction', {
        elementId: 'menu',
        action: 'click',
      });
      this.scene.time.delayedCall(0, () =>
        this.scene.scene.start('GameSelectorScene'),
      );
    });
    this.overlayObjects.push(menuBtn);
  }

  dismiss(): void {
    for (const obj of this.overlayObjects) {
      if (obj.active) obj.destroy();
    }
    this.overlayObjects = [];
  }
}
