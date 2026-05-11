/**
 * MindAnimator -- handles card animations and visual effects for The Mind.
 */

import type { MindCard } from '../MindCard';
import type { PlayResult, PlayerId } from '../TheMindGameState';
import { getMindCardTexture } from '../MindCardRenderer';
import { CARD_BACK_KEY } from '../MindCard';
import { flipCard, shakeIllegalMove } from '../../../src/ui';
import type { SoundManager } from '../../../src/core-engine';
import {
  CARD_W, CARD_H,
  PILE_X, PILE_Y, HUMAN_HAND_Y, AI_HAND_Y,
  ANIM_DURATION, PENALTY_REVEAL_DELAY,
  DEPTH_PLAYED_CARD, DEPTH_OVERLAY_CONTENT,
} from './MindConstants';
import { pickPenaltyStartPositions } from './penaltyAnimation';
import type { MindRenderer } from './MindRenderer';
import type { TheMindSession } from '../TheMindGameState';

export class MindAnimator {
  constructor(
    private scene: Phaser.Scene,
    private session: TheMindSession,
    private renderer: MindRenderer,
    _soundManager: SoundManager | null,
  ) {}

  // ── Card play animation ────────────────────────────────

  animateCardTowardsPile(
    playerId: PlayerId,
    cardValue: number,
    onComplete: () => void,
  ): void {
    if (playerId === 0) {
      this.animateHumanCardToPile(cardValue, onComplete);
    } else {
      this.animateAiCardToPile(cardValue, onComplete);
    }
  }

  private animateHumanCardToPile(
    cardValue: number,
    onComplete: () => void,
  ): void {
    const displayCard: MindCard = { value: cardValue, faceUp: true };
    const targetTex = getMindCardTexture(displayCard);
    let sprite: Phaser.GameObjects.Image | undefined;
    let spriteIdx = -1;

    for (let i = 0; i < this.renderer.humanCardSprites.length; i++) {
      if (this.renderer.humanCardSprites[i].texture.key === targetTex) {
        sprite = this.renderer.humanCardSprites[i];
        spriteIdx = i;
        break;
      }
    }

    if (!sprite) {
      this.scene.time.delayedCall(ANIM_DURATION, onComplete);
      return;
    }

    this.renderer.humanCardSprites.splice(spriteIdx, 1);
    sprite.disableInteractive();
    sprite.setDepth(DEPTH_PLAYED_CARD);

    this.scene.tweens.add({
      targets: sprite,
      x: PILE_X,
      y: PILE_Y,
      duration: ANIM_DURATION,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        sprite!.destroy();
        onComplete();
      },
    });
  }

  private animateAiCardToPile(
    cardValue: number,
    onComplete: () => void,
  ): void {
    let sourceX = PILE_X;
    let sourceY = AI_HAND_Y;

    if (this.renderer.aiCardSprites.length > 0) {
      const lastIdx = this.renderer.aiCardSprites.length - 1;
      const srcSprite = this.renderer.aiCardSprites[lastIdx];
      sourceX = srcSprite.x;
      sourceY = srcSprite.y;
      this.renderer.aiCardSprites.splice(lastIdx, 1);
      srcSprite.destroy();
    }

    const tempSprite = this.scene.add
      .image(sourceX, sourceY, CARD_BACK_KEY)
      .setDisplaySize(CARD_W, CARD_H)
      .setDepth(DEPTH_PLAYED_CARD);

    const faceUpTex = getMindCardTexture({ value: cardValue, faceUp: true });

    this.scene.tweens.add({
      targets: tempSprite,
      x: PILE_X,
      y: PILE_Y,
      duration: ANIM_DURATION,
      ease: 'Cubic.easeOut',
    });

    flipCard({
      scene: this.scene,
      target: tempSprite,
      newTexture: faceUpTex,
      duration: ANIM_DURATION,
      easeClose: 'Cubic.easeIn',
      easeOpen: 'Cubic.easeOut',
      onMidpoint: () => {
        tempSprite.setDisplaySize(CARD_W, CARD_H);
      },
    });

    this.scene.time.delayedCall(ANIM_DURATION, () => {
      tempSprite.destroy();
      onComplete();
    });
  }

  // ── Penalty display ────────────────────────────────────

  showPenaltyCards(result: PlayResult, onComplete: () => void): void {
    const penaltySprites: Phaser.GameObjects.Image[] = [];

    const startPositions = pickPenaltyStartPositions(
      result.penaltyCards,
      this.renderer.humanCardSprites.map((s) => ({ x: s.x, y: s.y })),
      this.renderer.aiCardSprites.map((s) => ({ x: s.x, y: s.y })),
      {
        0: { x: PILE_X, y: HUMAN_HAND_Y },
        1: { x: PILE_X, y: AI_HAND_Y },
      },
    );

    for (let i = 0; i < result.penaltyCards.length; i++) {
      const { card } = result.penaltyCards[i];
      const displayCard = { ...card, faceUp: true };
      const { x, y } = startPositions[i];

      const sprite = this.scene.add
        .image(x, y, getMindCardTexture(displayCard))
        .setDisplaySize(CARD_W, CARD_H)
        .setDepth(DEPTH_PLAYED_CARD + 1)
        .setTint(0xff4444);

      penaltySprites.push(sprite);

      this.scene.tweens.add({
        targets: sprite,
        x: PILE_X,
        y: PILE_Y,
        alpha: 0.8,
        duration: ANIM_DURATION,
      });
    }

    this.scene.time.delayedCall(PENALTY_REVEAL_DELAY, () => {
      for (const sprite of penaltySprites) {
        this.scene.tweens.add({
          targets: sprite,
          alpha: 0,
          duration: ANIM_DURATION,
          onComplete: () => sprite.destroy(),
        });
      }

      this.scene.time.delayedCall(ANIM_DURATION + 50, () => {
        onComplete();
      });
    });
  }

  // ── Invalid move feedback ──────────────────────────────

  showInvalidPlayFeedback(cardValue: number): void {
    const hand = this.session.players[0].hand;
    const idx = hand.findIndex((c: MindCard) => c.value === cardValue);
    if (idx === -1 || idx >= this.renderer.humanCardSprites.length) return;

    const sprite = this.renderer.humanCardSprites[idx];
    shakeIllegalMove({ scene: this.scene, target: sprite });
  }

  // ── Level complete display ─────────────────────────────

  showLevelCompleteText(
    completedLevel: number,
    bonusLifeAwarded: boolean,
    onComplete: () => void,
  ): void {
    const bonusText = bonusLifeAwarded
      ? '\nBonus life awarded!'
      : '';

    const levelText = this.scene.add
      .text(
        PILE_X,
        PILE_Y + 40,
        `Level ${completedLevel} Complete!${bonusText}`,
        {
          fontSize: '28px',
          color: '#88ff88',
          fontFamily: 'sans-serif',
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY_CONTENT)
      .setAlpha(0);

    this.scene.tweens.add({
      targets: levelText,
      alpha: 1,
      duration: 300,
    });

    this.scene.time.delayedCall(2000, () => {
      levelText.destroy();
      onComplete();
    });
  }
}
