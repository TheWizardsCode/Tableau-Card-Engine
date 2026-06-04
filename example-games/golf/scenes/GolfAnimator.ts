/**
 * GolfAnimator -- handles all card animations and tweens for 9-Card Golf.
 */

import type { Card } from '../../../src/card-system/Card';
import type { TurnResult } from '../GolfGame';
import { cardTextureKey, flipCard } from '../../../src/ui';
import type { SoundManager } from '../../../src/core-engine';
import {
  GOLF_CARD_W,
  ANIM_DURATION, SWAP_ANIM_DURATION,
  SFX_KEYS,
} from './GolfConstants';
import type { GolfRenderer } from './GolfRenderer';
import type { GolfSession } from '../GolfGame';

export class GolfAnimator {
  constructor(
    private scene: Phaser.Scene,
    private session: GolfSession,
    private renderer: GolfRenderer,
    private soundManager: SoundManager | null,
  ) {}

  private get layout() { return this.renderer['layout']; }

  // ── Turn animation ──────────────────────────────────────

  animateTurn(
    result: TurnResult,
    drawnCard: Card | null,
    onComplete: () => void,
  ): void {
    const playerKey = result.playerIndex === 0 ? 'human' : 'ai';
    const sprites = playerKey === 'human'
      ? this.renderer.humanCardSprites
      : this.renderer.aiCardSprites;

    // Wrap the caller's onComplete to clean up the drawn card sprite first.
    const wrappedOnComplete = () => {
      this.renderer.hideDrawnCard();
      onComplete();
    };

    if (result.move.kind === 'swap') {
      this.animateSwap(result, sprites, drawnCard, wrappedOnComplete);
    } else {
      this.animateDiscardAndFlip(result, sprites, drawnCard, onComplete);
    }
  }

  private animateSwap(
    result: TurnResult,
    sprites: Phaser.GameObjects.Image[],
    _drawnCard: Card | null,
    onComplete: () => void,
  ): void {
    const idx = result.move.row * 3 + result.move.col;
    const sprite = sprites[idx];
    const grid = this.session.gameState.playerStates[result.playerIndex].grid;

    // Compute destination positions
    const gridSlotPos = this.renderer.gridCellPosition(idx, result.playerIndex === 0 ? 'human' : 'ai');
    const discardPos = { x: this.layout.discardPileCenterX, y: this.layout.discardPileCenterY };

    // Track completion of both parallel tweens
    let completed = 0;
    const checkDone = () => {
      completed++;
      if (completed === 2) {
        sprite.setPosition(gridSlotPos.x, gridSlotPos.y);
        sprite.setDepth(0);
        onComplete();
      }
    };

    // Raise grid card depth so it renders above other grid cards during transit
    sprite.setDepth(10);

    // 1. Grid card: flip (reveal face) + translate to discard pile
    flipCard({
      scene: this.scene,
      target: sprite,
      newTexture: cardTextureKey(grid[idx].rank, grid[idx].suit),
      duration: SWAP_ANIM_DURATION,
      easeClose: 'Power2',
      destX: discardPos.x,
      destY: discardPos.y,
      soundManager: this.soundManager,
      sfx: { start: SFX_KEYS.CARD_SWAP, move: SFX_KEYS.CARD_SWAP, end: SFX_KEYS.CARD_FLIP, moveIntervalMs: 100 },
      onComplete: checkDone,
    });

    // 2. Drawn card: translate from display position to vacated grid slot
    const drawnCardSprite = this.renderer.drawnCardSprite;
    if (drawnCardSprite) {
      let lastMove = 0;
      this.scene.tweens.add({
        targets: drawnCardSprite,
        x: gridSlotPos.x,
        y: gridSlotPos.y,
        duration: SWAP_ANIM_DURATION,
        ease: 'Power2',
        onStart: () => {
          this.soundManager?.play(SFX_KEYS.CARD_SWAP);
          lastMove = Date.now();
        },
        onUpdate: () => {
          const now = Date.now();
          if (now - lastMove >= 100) {
            this.soundManager?.play(SFX_KEYS.CARD_SWAP);
            lastMove = now;
          }
        },
        onComplete: checkDone,
      });
    } else {
      checkDone();
    }
  }

  private animateDiscardAndFlip(
    result: TurnResult,
    sprites: Phaser.GameObjects.Image[],
    _drawnCard: Card | null,
    onComplete: () => void,
  ): void {
    const idx = result.move.row * 3 + result.move.col;
    const sprite = sprites[idx];
    const grid = this.session.gameState.playerStates[result.playerIndex].grid;
    const discardPos = { x: this.layout.discardPileCenterX, y: this.layout.discardPileCenterY };

    const phase2 = () => {
      this.renderer.hideDrawnCard();

      flipCard({
        scene: this.scene,
        target: sprite,
        newTexture: cardTextureKey(grid[idx].rank, grid[idx].suit),
        duration: SWAP_ANIM_DURATION / 2,
        easeClose: 'Power2',
        soundManager: this.soundManager,
        sfx: { start: SFX_KEYS.CARD_DISCARD, move: SFX_KEYS.CARD_DISCARD, end: SFX_KEYS.CARD_FLIP, moveIntervalMs: 100 },
        onComplete: onComplete,
      });
    };

    const drawnCardSprite = this.renderer.drawnCardSprite;
    if (drawnCardSprite) {
      this.scene.tweens.add({
        targets: drawnCardSprite,
        x: discardPos.x,
        y: discardPos.y,
        duration: SWAP_ANIM_DURATION / 2,
        ease: 'Power2',
        onComplete: phase2,
      });
    } else {
      phase2();
    }
  }

  // ── Drawn card display ──────────────────────────────────

  showDrawnCard(card: Card, source: 'stock' | 'discard' = 'stock'): void {
    // Destination: to the right of the discard pile, between piles and AI grid.
    // Position at midpoint between the deck right edge and the original position,
    // moving it left by half the distance from the right edge of the deck.
    const destX = this.layout.discardPileCenterX + GOLF_CARD_W * 3 / 4 + 12;
    const destY = this.layout.discardPileCenterY;
    const faceTexture = cardTextureKey(card.rank, card.suit);

    // Start at the source pile position
    const startX = this.layout.stockPileCenterX;
    const startY = source === 'stock' ? this.layout.stockPileCenterY : this.layout.discardPileCenterY;

    if (source === 'stock') {
      // Stock draw: start face-down, flip to reveal during transit
      const sprite = this.scene.add.image(startX, startY, 'card_back');
      sprite.setDepth(15);
      this.renderer.setDrawnCardSprite(sprite);

      flipCard({
        scene: this.scene,
        target: sprite,
        newTexture: faceTexture,
        duration: ANIM_DURATION,
        easeClose: 'Power2',
        destX,
        destY,
        soundManager: this.soundManager,
        sfx: { start: SFX_KEYS.CARD_DRAW, move: SFX_KEYS.CARD_DRAW, end: SFX_KEYS.CARD_FLIP, moveIntervalMs: 100 },
        onComplete: () => {
          if (this.renderer.drawnCardSprite) this.renderer.drawnCardSprite.setDepth(0);
        },
      });
    } else {
      // Discard draw: card is already face-up, slide to held position
      const sprite = this.scene.add.image(startX, startY, faceTexture);
      sprite.setDepth(15);
      this.renderer.setDrawnCardSprite(sprite);

      let lastMove = 0;
      this.scene.tweens.add({
        targets: sprite,
        x: destX,
        y: destY,
        duration: ANIM_DURATION,
        ease: 'Power2',
        onStart: () => {
          this.soundManager?.play(SFX_KEYS.CARD_DRAW);
          lastMove = Date.now();
        },
        onUpdate: () => {
          const now = Date.now();
          if (now - lastMove >= 100) {
            this.soundManager?.play(SFX_KEYS.CARD_DRAW);
            lastMove = now;
          }
        },
        onComplete: () => {
          if (this.renderer.drawnCardSprite) this.renderer.drawnCardSprite.setDepth(0);
        },
      });
    }

    // Update turn label
    this.renderer.turnText.setText(`Drew: ${card.rank} of ${card.suit}`);
  }

  /**
   * Visually update the discard pile to show the card beneath the one being
   * drawn.  Called during the preview phase (before `executeTurn()` pops
   * the card) so the taken card disappears from the pile immediately.
   */
  updateDiscardPileAfterDraw(): void {
    const pile = this.session.shared.discardPile;
    if (pile.size() <= 1) {
      this.renderer.showDiscardPlaceholder();
    } else {
      const arr = pile.toArray();
      const nextTop = arr[arr.length - 2];
      this.renderer.discardSprite.setTexture(cardTextureKey(nextTop.rank, nextTop.suit));
      this.renderer.discardSprite.setAlpha(1);
    }
  }

  /**
   * Animate the drawn card sprite from its current (held) position to the
   * discard pile.  Called when the player clicks the discard pile to discard
   * their drawn card, so the visual feedback happens immediately rather than
   * waiting until the flip-target is chosen.
   */
  animateDrawnCardToDiscard(drawnCard: Card | null, onComplete: () => void): void {
    const drawnCardSprite = this.renderer.drawnCardSprite;
    if (!drawnCardSprite) {
      onComplete();
      return;
    }

    drawnCardSprite.setDepth(15);

    let lastMove = 0;
    this.scene.tweens.add({
      targets: drawnCardSprite,
      x: this.layout.discardPileCenterX,
      y: this.layout.discardPileCenterY,
      duration: SWAP_ANIM_DURATION / 2,
      ease: 'Power2',
      onStart: () => {
        this.soundManager?.play(SFX_KEYS.CARD_DISCARD);
        lastMove = Date.now();
      },
      onUpdate: () => {
        const now = Date.now();
        if (now - lastMove >= 100) {
          this.soundManager?.play(SFX_KEYS.CARD_DISCARD);
          lastMove = now;
        }
      },
      onComplete: () => {
        this.renderer.hideDrawnCard();
        if (drawnCard) {
          this.renderer.discardSprite.setTexture(cardTextureKey(drawnCard.rank, drawnCard.suit));
          this.renderer.discardSprite.setAlpha(1);
          this.renderer.discardSprite.setVisible(true);
        }
        this.soundManager?.play(SFX_KEYS.CARD_DISCARD);
        onComplete();
      },
    });
  }
}
