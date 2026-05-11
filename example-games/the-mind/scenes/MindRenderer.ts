/**
 * MindRenderer -- creates and refreshes all visual game objects for The Mind.
 */

import { GAME_W, GAME_H, FONT_FAMILY, createSceneHeader, layoutCardPositions } from '../../../src/ui';
import { getMindCardTexture } from '../MindCardRenderer';
import { CARD_BACK_KEY } from '../MindCard';
import type { MindCard } from '../MindCard';
import type { TheMindSession } from '../TheMindGameState';
import { MAX_LEVEL } from '../TheMindGameState';
import {
  CARD_W, CARD_H, CARD_GAP, MAX_HAND_WIDTH,
  PILE_X, PILE_Y, HUMAN_HAND_Y, AI_HAND_Y,
  DEPTH_CARDS, DEPTH_PILE, DEPTH_UI,
} from './MindConstants';

export class MindRenderer {
  // Display objects -- human hand
  humanCardSprites: Phaser.GameObjects.Image[] = [];

  // Display objects -- AI hand
  aiCardSprites: Phaser.GameObjects.Image[] = [];
  aiCountText: Phaser.GameObjects.Text | null = null;

  // Display objects -- pile
  pileSprite!: Phaser.GameObjects.Image;
  pileCountText!: Phaser.GameObjects.Text;
  pileValueText!: Phaser.GameObjects.Text;

  // Display objects -- UI
  levelText!: Phaser.GameObjects.Text;
  livesText!: Phaser.GameObjects.Text;
  instructionText!: Phaser.GameObjects.Text;

  constructor(
    private scene: Phaser.Scene,
    private session: TheMindSession,
  ) {}

  // ── UI creation ─────────────────────────────────────────

  createHeader(): void {
    createSceneHeader(this.scene, 'The Mind');
  }

  createStatusDisplay(): void {
    this.levelText = this.scene.add
      .text(GAME_W - 100, 55, '', {
        fontSize: '16px',
        color: '#aaccff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH_UI);

    this.livesText = this.scene.add
      .text(GAME_W - 100, 79, '', {
        fontSize: '16px',
        color: '#ff6666',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH_UI);
  }

  createPile(): void {
    this.pileSprite = this.scene.add
      .image(PILE_X, PILE_Y, CARD_BACK_KEY)
      .setDisplaySize(CARD_W, CARD_H)
      .setDepth(DEPTH_PILE)
      .setAlpha(0.3);

    this.scene.add
      .text(PILE_X, PILE_Y - CARD_H / 2 - 18, 'PILE', {
        fontSize: '12px',
        color: '#888888',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);

    this.pileValueText = this.scene.add
      .text(PILE_X, PILE_Y + CARD_H / 2 + 14, '', {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);

    this.pileCountText = this.scene.add
      .text(PILE_X, PILE_Y + CARD_H / 2 + 32, '', {
        fontSize: '11px',
        color: '#888888',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);
  }

  createInstruction(): void {
    this.instructionText = this.scene.add
      .text(GAME_W / 2, GAME_H - 20, '', {
        fontSize: '12px',
        color: '#aaaaaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);
  }

  // ── Status refresh ─────────────────────────────────────

  refreshStatus(): void {
    this.levelText.setText(
      `Level ${this.session.currentLevel} / ${MAX_LEVEL}`,
    );

    const hearts = '\u2764'.repeat(this.session.lives);
    this.livesText.setText(`Lives: ${hearts}`);
  }

  refreshPile(): void {
    const topCard = this.session.pile.peek();
    const pileSize = this.session.pile.size();

    if (pileSize > 0 && topCard) {
      this.pileSprite.setTexture(getMindCardTexture(topCard));
      this.pileSprite.setAlpha(1);
      this.pileValueText.setText(`${topCard.value}`);
    } else {
      this.pileSprite.setTexture(CARD_BACK_KEY);
      this.pileSprite.setAlpha(0.3);
      this.pileValueText.setText('Empty');
    }

    this.pileCountText.setText(
      pileSize > 0 ? `${pileSize} card${pileSize !== 1 ? 's' : ''}` : '',
    );
  }

  // ── Human hand rendering ───────────────────────────────

  renderHumanHand(onCardClick: (card: MindCard) => void, phase: string, autoPlayEnabled: boolean): void {
    for (const sprite of this.humanCardSprites) {
      sprite.destroy();
    }
    this.humanCardSprites = [];

    const hand = this.session.players[0].hand;
    if (hand.length === 0) return;

    const { positions } = layoutCardPositions({
      count: hand.length,
      cardWidth: CARD_W,
      gap: CARD_GAP,
      centerX: GAME_W / 2,
      maxWidth: MAX_HAND_WIDTH,
    });

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];
      const displayCard = { ...card, faceUp: true };
      const x = positions[i];
      const sprite = this.scene.add
        .image(x, HUMAN_HAND_Y, getMindCardTexture(displayCard))
        .setDisplaySize(CARD_W, CARD_H)
        .setDepth(DEPTH_CARDS + i)
        .setInteractive({ useHandCursor: true });

      sprite.on('pointerdown', () => onCardClick(card));
      sprite.on('pointerover', () => {
        if (phase === 'playing' && !autoPlayEnabled) {
          sprite.setScale(1.08);
          sprite.setY(HUMAN_HAND_Y - 6);
        }
      });
      sprite.on('pointerout', () => {
        sprite.setScale(1);
        sprite.setY(HUMAN_HAND_Y);
      });

      this.humanCardSprites.push(sprite);
    }

    this.scene.add
      .text(GAME_W / 2, HUMAN_HAND_Y - CARD_H / 2 - 14, 'Your Hand', {
        fontSize: '12px',
        color: '#88ff88',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);
  }

  refreshHumanHand(): void {
    const hand = this.session.players[0].hand;

    if (hand.length !== this.humanCardSprites.length) {
      // Can't re-render here without callbacks; caller should use renderHumanHand
      return;
    }

    for (let i = 0; i < hand.length; i++) {
      const displayCard = { ...hand[i], faceUp: true };
      this.humanCardSprites[i].setTexture(getMindCardTexture(displayCard));
    }
  }

  // ── AI hand rendering ──────────────────────────────────

  renderAiHand(): void {
    for (const sprite of this.aiCardSprites) {
      sprite.destroy();
    }
    this.aiCardSprites = [];

    const hand = this.session.players[1].hand;
    if (hand.length === 0) {
      if (this.aiCountText) this.aiCountText.setText('');
      return;
    }

    const { positions } = layoutCardPositions({
      count: hand.length,
      cardWidth: CARD_W,
      gap: CARD_GAP,
      centerX: GAME_W / 2,
      maxWidth: MAX_HAND_WIDTH,
    });

    for (let i = 0; i < hand.length; i++) {
      const x = positions[i];
      const sprite = this.scene.add
        .image(x, AI_HAND_Y, CARD_BACK_KEY)
        .setDisplaySize(CARD_W, CARD_H)
        .setDepth(DEPTH_CARDS + i);

      this.aiCardSprites.push(sprite);
    }

    if (this.aiCountText) {
      this.aiCountText.destroy();
    }
    this.aiCountText = this.scene.add
      .text(GAME_W / 2, AI_HAND_Y + CARD_H / 2 + 14, '', {
        fontSize: '12px',
        color: '#aaaaaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);

    this.aiCountText.setText(
      `AI: ${hand.length} card${hand.length !== 1 ? 's' : ''}`,
    );

    this.scene.add
      .text(GAME_W / 2, AI_HAND_Y - CARD_H / 2 - 14, 'AI Hand', {
        fontSize: '12px',
        color: '#ffaa44',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);
  }

  refreshAiHand(): void {
    const hand = this.session.players[1].hand;

    if (hand.length !== this.aiCardSprites.length) {
      return;
    }

    if (this.aiCountText) {
      this.aiCountText.setText(
        hand.length > 0
          ? `AI: ${hand.length} card${hand.length !== 1 ? 's' : ''}`
          : '',
      );
    }
  }

  // ── Refresh all ────────────────────────────────────────

  refreshAll(): void {
    this.refreshHumanHand();
    this.refreshAiHand();
    this.refreshPile();
    this.refreshStatus();
  }

  // ── Replay helpers ─────────────────────────────────────

  renderReplayHand(
    cardValues: number[],
    y: number,
    faceUp: boolean,
    spriteArray: Phaser.GameObjects.Image[],
    label: string,
    labelColor: string,
  ): void {
    if (cardValues.length === 0) return;

    const { positions } = layoutCardPositions({
      count: cardValues.length,
      cardWidth: CARD_W,
      gap: CARD_GAP,
      centerX: GAME_W / 2,
      maxWidth: MAX_HAND_WIDTH,
    });

    for (let i = 0; i < cardValues.length; i++) {
      const x = positions[i];
      const card: MindCard = { value: cardValues[i], faceUp };
      const texture = faceUp ? getMindCardTexture(card) : CARD_BACK_KEY;
      const sprite = this.scene.add
        .image(x, y, texture)
        .setDisplaySize(CARD_W, CARD_H)
        .setDepth(DEPTH_CARDS + i);
      spriteArray.push(sprite);
    }

    this.scene.add
      .text(GAME_W / 2, y - CARD_H / 2 - 14, label, {
        fontSize: '12px',
        color: labelColor,
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);
  }

  clearSprites(): void {
    for (const sprite of this.humanCardSprites) sprite.destroy();
    this.humanCardSprites = [];
    for (const sprite of this.aiCardSprites) sprite.destroy();
    this.aiCardSprites = [];
  }

  disableGameInteraction(autoPlayButton?: Phaser.GameObjects.Text): void {
    for (const sprite of this.humanCardSprites) {
      sprite.disableInteractive();
    }
    if (autoPlayButton) {
      autoPlayButton.disableInteractive();
    }
  }

  flashLives(): void {
    let flashes = 0;
    const flashTimer = this.scene.time.addEvent({
      delay: 150,
      repeat: 5,
      callback: () => {
        flashes++;
        this.livesText.setColor(flashes % 2 === 0 ? '#ff6666' : '#ffffff');
      },
    });

    this.scene.time.delayedCall(150 * 6 + 50, () => {
      flashTimer.destroy();
      this.livesText.setColor('#ff6666');
    });
  }
}
