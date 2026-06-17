/**
 * MindRenderer -- creates and refreshes all visual game objects for The Mind.
 *
 * Phase 1 migration (CG-0MQ6IEM920091HF6):
 *   - Human hand now uses shared HandView component.
 *   - AI hand now uses shared HandView component.
 *   - Play pile now uses shared PileView component.
 *   - Custom texture resolution via Mind-specific texture adapters.
 */

import { FONT_FAMILY, HandView, PileView, layoutCardPositions, type CardTextureResolver } from '../../../src/ui';
import { createSceneHeader } from '@ui/Renderer';
import { createMindHudText } from '../../../src/ui/Renderer/adapters/MindAdapter';
import { applyEnsuredTexture } from '../../../src/ui/Renderer';
import {
  ensureTexture,
  ensureBackTexture,
  resolveBackTemplateId,
  resolveTemplateId,
  getCanonicalTextureKey,
} from '../MindCardTextureAdapter';
import type { MindCard } from '../MindCard';
import type { TheMindSession } from '../TheMindGameState';
import { MAX_LEVEL } from '../TheMindGameState';
import {
  CARD_W, CARD_H, CARD_GAP, MAX_HAND_WIDTH,
  DEPTH_CARDS, DEPTH_UI,
} from './MindConstants';
import {
  computeMindLayout,
  type MindLayout,
} from './MindLayoutAdapter';

export class MindRenderer {
  // ── Shared view components (Phase 1 migration: CG-0MQ6IEM920091HF6) ──

  /** HandView for the human player's hand. */
  humanHandView!: HandView;

  /** HandView for the AI player's hand (face-down). */
  aiHandView!: HandView;

  /** PileView for the play pile. */
  pileView!: PileView;

  // Legacy sprite refs (kept for backward compat with animator / tests)
  humanCardSprites: Phaser.GameObjects.Image[] = [];
  private lastHumanHandRenderArgs:
    | {
        onCardClick: (card: MindCard) => void;
        phase: string;
        autoPlayEnabled: boolean;
      }
    | null = null;

  // Legacy AI hand sprite refs (kept for backward compat)
  aiCardSprites: Phaser.GameObjects.Image[] = [];
  aiCountText: Phaser.GameObjects.Text | null = null;

  // Legacy pile sprite refs (kept for backward compat)
  pileSprite!: Phaser.GameObjects.Image;
  pileCountText!: Phaser.GameObjects.Text;
  pileValueText!: Phaser.GameObjects.Text;

  // Display objects -- UI
  levelText!: Phaser.GameObjects.Text;
  livesText!: Phaser.GameObjects.Text;
  instructionText!: Phaser.GameObjects.Text;

  /** SLL-derived layout resolved once at construction. */
  private layout: MindLayout;

  private get sceneW(): number { return (this.scene.game.config.width as number) ?? 1280; }
  private get sceneH(): number { return (this.scene.game.config.height as number) ?? 720; }

  constructor(
    private scene: Phaser.Scene,
    private session: TheMindSession,
  ) {
    this.layout = computeMindLayout({
      width: (this.scene.game.config.width as number) ?? 1280,
      height: (this.scene.game.config.height as number) ?? 720,
    });
  }

  private getBackTextureFallbackKey(): string {
    const canonical = getCanonicalTextureKey(resolveBackTemplateId(), CARD_W, CARD_H);
    if (this.scene.textures?.exists(canonical)) return canonical;
    if (this.scene.textures?.exists(resolveBackTemplateId())) return resolveBackTemplateId();
    return canonical;
  }

  private ensureAiBackTextures(): void {
    void (async () => {
      try {
        const result = await ensureBackTexture(this.scene, CARD_W, CARD_H);
        if (!result.ready && result.promise) {
          await result.promise;
        }
        for (const sprite of this.aiCardSprites) {
          sprite.setTexture(result.key);
          sprite.setDisplaySize(CARD_W, CARD_H);
        }
      } catch {
        // keep fallback back texture
      }
    })();
  }

  // ── UI creation ─────────────────────────────────────────

  createHeader(): void {
    createSceneHeader(this.scene, 'The Mind');
  }

  createStatusDisplay(): void {
    this.levelText = createMindHudText(
      this.scene,
      this.sceneW - 100, 55, '',
      '#aaccff',
    );

    this.livesText = createMindHudText(
      this.scene,
      this.sceneW - 100, 79, '',
      '#ff6666',
    );
  }

  createPile(): void {
    const backKey = this.getBackTextureFallbackKey();

    // ── Shared PileView for the play pile (Phase 1 migration) ──
    this.pileView = new PileView(this.scene, {
      x: this.layout.playPileCenterX,
      y: this.layout.playPileCenterY,
      emptyTexture: backKey,
      emptyAlpha: 0.3,
      fullAlpha: 1,
      countOffsetY: CARD_H / 2 + 32,
      countFontSize: '11px',
      countColor: '#888888',
      label: 'Pile',
    });

    // Wire the pile model to PileView.
    // TheMindSession.pile is a Pile<MindCard> which satisfies CardPile.
    this.pileView.setPile(this.session.pile as any);

    // PileView handles the sprite and count label.
    // The value text (e.g. "42") is a Mind-specific overlay.
    this.pileSprite = this.pileView.getSprite();
    this.pileCountText = this.pileView.getCountText();

    // Value overlay (numeric value of the top card)
    this.pileValueText = this.scene.add
      .text(this.layout.playPileCenterX, this.layout.playPileCenterY + CARD_H / 2 + 14, '', {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);
  }

  createInstruction(): void {
    this.instructionText = this.scene.add
      .text(this.sceneW / 2, this.sceneH - 20, '', {
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
      const backKey = this.getBackTextureFallbackKey();
      const faceKey = getCanonicalTextureKey(resolveTemplateId(topCard.value), CARD_W, CARD_H);
      const hasFaceTexture = !!this.scene.textures?.exists?.(faceKey);

      // Avoid flicker: if face texture is already available, use it immediately
      // instead of flashing back texture first.
      this.pileSprite.setTexture(hasFaceTexture ? faceKey : backKey);
      this.pileSprite.setDisplaySize(CARD_W, CARD_H);
      this.pileSprite.setAlpha(1);
      this.pileValueText.setText(`${topCard.value}`);

      void applyEnsuredTexture(
        this.pileSprite,
        ensureTexture(this.scene, topCard.value, CARD_W, CARD_H),
        () => !!this.pileSprite,
        CARD_W,
        CARD_H,
      );
    } else {
      const backKey = this.getBackTextureFallbackKey();
      this.pileSprite.setTexture(backKey);
      this.pileSprite.setDisplaySize(CARD_W, CARD_H);
      this.pileSprite.setAlpha(0.3);
      this.pileValueText.setText('Empty');
    }

    this.pileCountText.setText(
      pileSize > 0 ? `${pileSize} card${pileSize !== 1 ? 's' : ''}` : '',
    );
  }

  /**
   * Create HandView components for the human and AI hands.
   * Call this once during scene creation, before rendering the initial state.
   */
  createHands(): void {
    // Human hand HandView
    this.humanHandView = new HandView(this.scene, {
      baseX: this.sceneW / 2,
      baseY: this.layout.humanHandCenterY,
      spacing: CARD_GAP + CARD_W,
      cardWidth: CARD_W,
      maxWidth: MAX_HAND_WIDTH,
      showLabels: false,
      selectionEnabled: false,
      clickEnabled: true,
      arcRadius: 0,
      maxRotationDegrees: 0,
    });

    // AI hand HandView (face-down cards)
    this.aiHandView = new HandView(this.scene, {
      baseX: this.sceneW / 2,
      baseY: this.layout.aiHandCenterY,
      spacing: CARD_GAP + CARD_W,
      cardWidth: CARD_W,
      maxWidth: MAX_HAND_WIDTH,
      showLabels: false,
      selectionEnabled: false,
      clickEnabled: false,
      arcRadius: 0,
      maxRotationDegrees: 0,
    });
  }

  // ── Human hand rendering (Phase 1: uses HandView) ──────

  renderHumanHand(onCardClick: (card: MindCard) => void, phase: string, autoPlayEnabled: boolean): void {
    this.lastHumanHandRenderArgs = { onCardClick, phase, autoPlayEnabled };

    const hand = this.session.players[0].hand;

    if (hand.length === 0) {
      this.humanHandView.setCards([], { cardTextureFn: this._humanCardTextureFn });
      return;
    }

    // Use HandView for layout, selection, and click handling.
    // Mind-specific: each card's texture is loaded lazily via applyEnsuredTexture.
    this.humanHandView.setCards(hand as any, { cardTextureFn: this._humanCardTextureFn });
    this.humanHandView.on('cardclick', (idx: number) => {
      if (idx >= 0 && idx < hand.length) {
        onCardClick(hand[idx]);
      }
    });

    // Update sprite display size and store card value for lazy texture loading.
    const sprites = this.humanHandView.getSprites() as Phaser.GameObjects.Image[];
    this.humanCardSprites = sprites;

    for (let i = 0; i < sprites.length; i++) {
      const sprite = sprites[i];
      const card = hand[i];
      (sprite as any).__mindCardValue = card.value;
      sprite.setDisplaySize(CARD_W, CARD_H);
      sprite.setDepth(DEPTH_CARDS + i);
      sprite.setInteractive({ useHandCursor: true });

      // Kick off lazy rasterisation
      void applyEnsuredTexture(
        sprite,
        ensureTexture(this.scene, card.value, CARD_W, CARD_H),
        () => this.humanCardSprites.includes(sprite),
        CARD_W,
        CARD_H,
      );

      // Hover feedback (only during playing phase, not auto-play)
      sprite.on('pointerover', () => {
        if (phase === 'playing' && !autoPlayEnabled) {
          sprite.setDisplaySize(CARD_W * 1.03, CARD_H * 1.03);
          sprite.setY(this.layout.humanHandCenterY - 4);
        }
      });
      sprite.on('pointerout', () => {
        sprite.setDisplaySize(CARD_W, CARD_H);
        sprite.setY(this.layout.humanHandCenterY);
      });
    }
  }

  /**
   * Mind-specific texture resolver for the human hand.
   * Returns the fallback back texture key (actual card textures loaded lazily).
   */
  private _humanCardTextureFn: CardTextureResolver = (
    _card: MindCard,
  ): string => {
    // Return card-back as placeholder; lazy texture updates replace it.
    return this.getBackTextureFallbackKey();
  };

  refreshHumanHand(): void {
    const hand = this.session.players[0].hand;
    const sprites = this.humanCardSprites;

    if (hand.length !== sprites.length) {
      // Can't re-render here without callbacks; caller should use renderHumanHand
      return;
    }

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];
      const sprite = sprites[i];
      (sprite as any).__mindCardValue = card.value;

      // Update sprite with lazy texture loading.
      sprite.setDisplaySize(CARD_W, CARD_H);
      void applyEnsuredTexture(
        sprite,
        ensureTexture(this.scene, card.value, CARD_W, CARD_H),
        () => sprites[i] === sprite,
        CARD_W,
        CARD_H,
      );
    }
  }

  // ── AI hand rendering (Phase 1: uses HandView) ─────────

  renderAiHand(): void {
    const hand = this.session.players[1].hand;
    const backKey = this.getBackTextureFallbackKey();

    if (hand.length === 0) {
      if (this.aiCountText) this.aiCountText.setText('');
      this.aiHandView.setCards([]);
      this.aiCardSprites = [];
      return;
    }

    // Use HandView for layout; AI cards are always face-down.
    this.aiHandView.setCards(hand as any, { cardTextureFn: () => backKey });
    const sprites = this.aiHandView.getSprites() as Phaser.GameObjects.Image[];
    this.aiCardSprites = sprites;

    // Apply Mind-specific properties to sprites.
    for (let i = 0; i < sprites.length; i++) {
      const sprite = sprites[i];
      sprite.setDisplaySize(CARD_W, CARD_H);
      sprite.setDepth(DEPTH_CARDS + i);
    }

    // Ensure AI back textures are loaded.
    this.ensureAiBackTextures();
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
    const humanHand = this.session.players[0].hand;
    const humanSprites = this.humanCardSprites;

    if (
      humanHand.length !== humanSprites.length &&
      this.lastHumanHandRenderArgs
    ) {
      this.renderHumanHand(
        this.lastHumanHandRenderArgs.onCardClick,
        this.lastHumanHandRenderArgs.phase,
        this.lastHumanHandRenderArgs.autoPlayEnabled,
      );
    } else {
      this.refreshHumanHand();
    }

    const aiHand = this.session.players[1].hand;
    if (aiHand.length !== this.aiCardSprites.length) {
      this.renderAiHand();
    } else {
      this.refreshAiHand();
    }

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
      centerX: this.sceneW / 2,
      maxWidth: MAX_HAND_WIDTH,
    });

    for (let i = 0; i < cardValues.length; i++) {
      const x = positions[i];
      const card: MindCard = { value: cardValues[i], faceUp };
      const backKey = this.getBackTextureFallbackKey();
      const sprite = this.scene.add
        .image(x, y, backKey)
        .setDisplaySize(CARD_W, CARD_H)
        .setDepth(DEPTH_CARDS + i);

      if (faceUp) {
        void applyEnsuredTexture(
          sprite,
          ensureTexture(this.scene, card.value, CARD_W, CARD_H),
          () => (sprite as any).active !== false,
          CARD_W,
          CARD_H,
        );
      }

      spriteArray.push(sprite);
    }

    this.scene.add
      .text(this.sceneW / 2, y - CARD_H / 2 - 14, label, {
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

  // ── Destroy (Phase 1 migration) ─────────────────────────

  /** Clean up all display objects including shared view components. */
  destroy(): void {
    this.humanHandView.destroy();
    this.aiHandView.destroy();
    this.pileView.destroy();
    this.clearSprites();
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
