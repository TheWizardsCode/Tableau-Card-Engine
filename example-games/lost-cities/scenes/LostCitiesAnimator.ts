/**
 * LostCitiesAnimator — card movement and AI animation helpers.
 */
import Phaser from 'phaser';
import type { Phase1Action, Phase2Action } from '../LostCitiesRules';
import { cardAssetKey, compactAssetKey } from '../LostCitiesCards';
import type { LostCitiesSession } from '../LostCitiesGame';
import { EXPEDITION_COLORS } from '../LostCitiesCards';
import { getLcTextureKey, getLcBackFallbackKey, getLcFaceKey } from '../LostCitiesTextureHelpers';
import {
  laneX,
  PLR_EXP_TOP,
  OPP_EXP_TOP,
  EXP_OVERLAP,
  CARD_W,
  CARD_H,
  DISCARD_Y,
  DISCARD_CARD_W,
  DISCARD_CARD_H,
  HAND_TOP,
  HAND_CARD_W,
  HAND_CARD_H,
  HAND_OVERLAP,
  PLAYER_HAND_CENTER,
  AI_HAND_CENTER,
  MID_COL_CENTER,
  DRAW_PILE_Y,
  ANIM_DURATION,
  AI_ANIM_DURATION,
} from './LostCitiesConstants';
import { LostCitiesRenderer } from './LostCitiesRenderer';
import { flipCard, moveGameObject, shakeIllegalMove, FONT_FAMILY } from '../../../src/ui';

export class LostCitiesAnimator {
  /** When true, all animations are skipped and sprites snap to final state. */
  reducedMotion = false;

  private scene: Phaser.Scene;
  private session: LostCitiesSession;
  private renderer: LostCitiesRenderer;

  constructor(
    scene: Phaser.Scene,
    session: LostCitiesSession,
    renderer: LostCitiesRenderer,
  ) {
    this.scene = scene;
    this.session = session;
    this.renderer = renderer;
  }

  animatePhase1(action: Phase1Action, handIndex: number, onComplete: () => void): void {
    if (this.reducedMotion) {
      onComplete();
      return;
    }
    const handSprites = this.renderer.handSpriteList;
    if (handSprites.length === 0 || handIndex < 0 || handIndex >= handSprites.length) {
      onComplete();
      return;
    }

    const sprite = handSprites[handIndex];
    sprite.setDepth(100);

    let targetX: number;
    let targetY: number;

    if (action.kind === 'play-to-expedition') {
      const colorIdx = EXPEDITION_COLORS.indexOf(action.color);
      const lane = this.session.players[0].expeditions.get(action.color) ?? [];
      const cardIdx = Math.max(0, lane.length - 1);
      targetX = laneX(colorIdx);
      targetY = PLR_EXP_TOP + cardIdx * EXP_OVERLAP + CARD_H / 2;
    } else {
      const colorIdx = EXPEDITION_COLORS.indexOf(action.color);
      targetX = laneX(colorIdx);
      targetY = DISCARD_Y + DISCARD_CARD_H / 2;
    }

    const targetW = action.kind === 'discard' ? DISCARD_CARD_W : CARD_W;
    const targetH = action.kind === 'discard' ? DISCARD_CARD_H : CARD_H;
    // Use displayWidth/displayHeight instead of scaleX/scaleY so the
    // tween works correctly with high-DPI textures (whose intrinsic size
    // differs from the original 95x130 load.svg textures).
    this.scene.tweens.add({
      targets: sprite,
      x: targetX,
      y: targetY,
      displayWidth: targetW,
      displayHeight: targetH,
      duration: ANIM_DURATION,
      ease: 'Power2',
      onComplete: () => {
        sprite.destroy();
        onComplete();
      },
    });
  }

  animatePhase2(action: Phase2Action, onComplete: () => void): void {
    if (this.reducedMotion) {
      onComplete();
      return;
    }
    let sourceX: number;
    let sourceY: number;
    let textureKey: string;

    const hand = this.session.players[0].hand;
    const drawnCard = hand[hand.length - 1];

    if (action.kind === 'draw-from-pile') {
      sourceX = MID_COL_CENTER;
      sourceY = DRAW_PILE_Y + CARD_H / 2;
      // Use card back fallback for draw pile (correct — cards are face-down).
      textureKey = getLcBackFallbackKey(this.scene);
    } else {
      const colorIdx = EXPEDITION_COLORS.indexOf(action.color);
      sourceX = laneX(colorIdx);
      sourceY = DISCARD_Y + DISCARD_CARD_H / 2;
      // Use compact template ID (with -sm suffix) + getLcFaceKey so the
      // texture matches what prewarmTextures() creates, and getLcFaceKey
      // provides fallback to card-back if synchronous rasterisation fails.
      const templateId = compactAssetKey(drawnCard);
      textureKey = getLcFaceKey(this.scene, templateId, DISCARD_CARD_W, DISCARD_CARD_H);
    }

    const tempSprite = this.scene.add.image(sourceX, sourceY, textureKey);
    tempSprite.setDisplaySize(
      action.kind === 'draw-from-pile' ? CARD_W : DISCARD_CARD_W,
      action.kind === 'draw-from-pile' ? CARD_H : DISCARD_CARD_H,
    );
    tempSprite.setDepth(100);

    const sorted = [...hand].sort(LostCitiesRenderer.handSortCompare);
    const targetIdx = sorted.findIndex(c => c.id === drawnCard.id);
    const targetX = PLAYER_HAND_CENTER;
    const targetY = HAND_TOP + targetIdx * HAND_OVERLAP + HAND_CARD_H / 2;

    this.scene.tweens.add({
      targets: tempSprite,
      x: targetX,
      y: targetY,
      displayWidth: HAND_CARD_W,
      displayHeight: HAND_CARD_H,
      duration: ANIM_DURATION,
      ease: 'Power2',
      onComplete: () => {
        tempSprite.destroy();
        onComplete();
      },
    });
  }

  animateAiPhase1(action: Phase1Action, onComplete: () => void): void {
    if (this.reducedMotion) {
      onComplete();
      return;
    }
    const sprites = this.renderer.aiHandSpriteList;
    if (sprites.length === 0) {
      onComplete();
      return;
    }

    const spriteIdx = Math.floor(Math.random() * sprites.length);
    const sprite = sprites.splice(spriteIdx, 1)[0];
    sprite.setDepth(100);

    const colorIdx = EXPEDITION_COLORS.indexOf(action.color);
    let targetX: number;
    let targetY: number;

    if (action.kind === 'play-to-expedition') {
      const lane = this.session.players[1].expeditions.get(action.color) ?? [];
      const cardIdx = Math.max(0, lane.length - 1);
      targetX = laneX(colorIdx);
      targetY = OPP_EXP_TOP + cardIdx * EXP_OVERLAP + CARD_H / 2;
    } else {
      targetX = laneX(colorIdx);
      targetY = DISCARD_Y + DISCARD_CARD_H / 2;
    }

    const isDiscard = action.kind === 'discard';
    const finalW = isDiscard ? DISCARD_CARD_W : CARD_W;
    const finalH = isDiscard ? DISCARD_CARD_H : CARD_H;

    // Pre-ensure the face texture via synchronous rasterisation if possible.
    const templateId = cardAssetKey(action.card);
    const faceKey = getLcTextureKey(templateId, finalW, finalH);
    // getLcFaceKey will attempt synchronous rasterisation if the texture
    // doesn't exist yet and SVG text is available in cache.
    void getLcFaceKey(this.scene, templateId, finalW, finalH);

    // Phase 1: move the AI card (showing back) from hand to destination.
    // Phase 2 (at destination): flip to face.
    this.scene.tweens.add({
      targets: sprite,
      x: targetX,
      y: targetY,
      displayWidth: finalW,
      displayHeight: finalH,
      duration: AI_ANIM_DURATION,
      ease: 'Power2',
      onComplete: () => {
        const hasFaceTexture = this.scene.textures?.exists(faceKey) ?? false;

        if (hasFaceTexture) {
          // Flip at destination to reveal the face.
          flipCard({
            scene: this.scene,
            target: sprite,
            newTexture: faceKey,
            duration: 300,
            onMidpoint: () => {
              sprite.setDisplaySize(finalW, finalH);
            },
            onComplete: () => {
              sprite.destroy();
              this.repositionAiHand(sprites);
              onComplete();
            },
          });
        } else {
          // Face texture not ready yet — destroy the temp sprite.
          // refreshExpeditions() called after this will create the correct
          // sprite with a fallback if texture still not ready.
          sprite.destroy();
          this.repositionAiHand(sprites);
          onComplete();
        }
      },
    });
  }

  /** Reposition remaining AI hand sprites after removing one. */
  private repositionAiHand(sprites: Phaser.GameObjects.Image[]): void {
    for (let i = 0; i < sprites.length; i++) {
      const newY = HAND_TOP + i * HAND_OVERLAP + HAND_CARD_H / 2;
      if (sprites[i].y !== newY) {
        moveGameObject({
          scene: this.scene,
          target: sprites[i],
          destX: AI_HAND_CENTER,
          destY: newY,
          duration: 200,
          reducedMotion: this.reducedMotion,
        });
      }
      sprites[i].setDepth(i + 1);
    }
  }

  animateAiPhase2(action: Phase2Action, onComplete: () => void): void {
    if (this.reducedMotion) {
      onComplete();
      return;
    }
    let sourceX: number;
    let sourceY: number;
    let annotationText: string;

    if (action.kind === 'draw-from-pile') {
      sourceX = MID_COL_CENTER;
      sourceY = DRAW_PILE_Y + CARD_H / 2;
      annotationText = 'Drew from pile';
    } else {
      const colorIdx = EXPEDITION_COLORS.indexOf(action.color);
      sourceX = laneX(colorIdx);
      sourceY = DISCARD_Y + DISCARD_CARD_H / 2;
      annotationText = `Drew ${action.color.charAt(0).toUpperCase() + action.color.slice(1)}`;
    }

    const tempSprite = this.scene.add.image(sourceX, sourceY, getLcBackFallbackKey(this.scene));
    tempSprite.setDisplaySize(
      action.kind === 'draw-from-pile' ? CARD_W : DISCARD_CARD_W,
      action.kind === 'draw-from-pile' ? CARD_H : DISCARD_CARD_H,
    );
    tempSprite.setDisplaySize(
      action.kind === 'draw-from-pile' ? CARD_W : DISCARD_CARD_W,
      action.kind === 'draw-from-pile' ? CARD_H : DISCARD_CARD_H,
    );
    tempSprite.setDepth(100);

    const aiHandSize = this.session.players[1].hand.length;
    const targetIdx = aiHandSize - 1;
    const targetX = AI_HAND_CENTER;
    const targetY = HAND_TOP + targetIdx * HAND_OVERLAP + HAND_CARD_H / 2;

    // FONT_FAMILY imported from src/ui
    const annotation = this.scene.add.text(sourceX, sourceY - 40, annotationText, {
      fontFamily: FONT_FAMILY,
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    });
    annotation.setOrigin(0.5);
    annotation.setDepth(101);

    this.scene.tweens.add({
      targets: annotation,
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => annotation.destroy(),
    });

    moveGameObject({
      scene: this.scene,
      target: tempSprite,
      destX: targetX,
      destY: targetY,
      duration: AI_ANIM_DURATION,
      reducedMotion: this.reducedMotion,
      onComplete: () => {
        tempSprite.destroy();
        onComplete();
      },
    });
  }

  showIllegalMoveFlash(sprite: Phaser.GameObjects.Image, _soundManager?: { play: (key: string) => void } | null): void {
    if (!sprite) return;
    shakeIllegalMove({ scene: this.scene, target: sprite });
  }
}
