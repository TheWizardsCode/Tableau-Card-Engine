/**
 * MindReplayController -- handles replay mode state injection for The Mind.
 */

import { resolveTemplateId, resolveBackTemplateId, getCanonicalTextureKey } from '../MindCardTextureAdapter';
import { MAX_LEVEL } from '../TheMindGameState';
import type { MindRenderer } from './MindRenderer';
import { HUMAN_HAND_Y, AI_HAND_Y, DEPTH_UI, CARD_W, CARD_H } from './MindConstants';

export class MindReplayController {
  replayStepIndex = 0;

  constructor(
    private scene: Phaser.Scene,
    private renderer: MindRenderer,
    private replayMode: { value: boolean },
  ) {}

  loadBoardState(state: {
    humanHand: number[];
    aiHand: number[];
    pileTop: number;
    pileSize: number;
    currentLevel: number;
    lives: number;
    stepIndex?: number;
  }): void {
    if (!this.replayMode.value) {
      throw new Error(
        'loadBoardState() is only available in replay mode (?mode=replay)',
      );
    }

    this.renderer.clearSprites();

    this.renderer.renderReplayHand(
      state.humanHand,
      HUMAN_HAND_Y,
      true,
      this.renderer.humanCardSprites,
      'Your Hand',
      '#88ff88',
    );

    this.renderer.renderReplayHand(
      state.aiHand,
      AI_HAND_Y,
      false,
      this.renderer.aiCardSprites,
      'AI Hand',
      '#ffaa44',
    );

    if (this.renderer.aiCountText) this.renderer.aiCountText.destroy();
    if (state.aiHand.length > 0) {
      this.renderer.aiCountText = this.scene.add
        .text(this.scene.scale.width / 2, AI_HAND_Y + CARD_H / 2 + 14, '', {
          fontSize: '12px',
          color: '#aaaaaa',
          fontFamily: 'sans-serif',
        })
        .setOrigin(0.5)
        .setDepth(DEPTH_UI);
      this.renderer.aiCountText.setText(
        `AI: ${state.aiHand.length} card${state.aiHand.length !== 1 ? 's' : ''}`,
      );
    } else {
      this.renderer.aiCountText = null;
    }

    if (state.pileTop > 0) {
      const faceUpKey = getCanonicalTextureKey(resolveTemplateId(state.pileTop), CARD_W, CARD_H);
      this.renderer.pileSprite.setTexture(faceUpKey);
      this.renderer.pileSprite.setDisplaySize(CARD_W, CARD_H);
      this.renderer.pileSprite.setAlpha(1);
      this.renderer.pileValueText.setText(`${state.pileTop}`);
    } else {
      const backKey = getCanonicalTextureKey(resolveBackTemplateId(), CARD_W, CARD_H);
      this.renderer.pileSprite.setTexture(backKey);
      this.renderer.pileSprite.setDisplaySize(CARD_W, CARD_H);
      this.renderer.pileSprite.setAlpha(0.3);
      this.renderer.pileValueText.setText('Empty');
    }
    this.renderer.pileCountText.setText(
      state.pileSize > 0
        ? `${state.pileSize} card${state.pileSize !== 1 ? 's' : ''}`
        : '',
    );

    this.renderer.levelText.setText(`Level ${state.currentLevel} / ${MAX_LEVEL}`);
    const hearts = '\u2764'.repeat(Math.max(0, state.lives));
    this.renderer.livesText.setText(`Lives: ${hearts}`);

    if (state.stepIndex !== undefined) {
      this.replayStepIndex = state.stepIndex;
    }

    (this.scene as any).emitStateSettled(this.replayStepIndex, 'playing');
  }
}
