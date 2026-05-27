/**
 * LostCitiesRenderer — UI creation and refresh logic for Lost Cities.
 */
import Phaser from 'phaser';
import type { ExpeditionColor, LostCitiesCard } from '../LostCitiesCards';
import {
  EXPEDITION_COLORS,
  EXPEDITION_HEX,
  cardAssetKey,
  compactAssetKey,
} from '../LostCitiesCards';
import type { LostCitiesSession } from '../LostCitiesGame';
import { scoreRoundDetailed } from '../LostCitiesScoring';
import {
  getLcBackFallbackKey,
  ensureLcCardTexture,
  ensureLcCompactTexture,
  ensureLcBackTexture,
  applyEnsuredTexture,
} from '../LostCitiesTextureHelpers';
import {
  TABLEAU_LEFT,
  laneX,
  LANE_STEP,
  LANE_GAP,
  BOX_PAD,
  BOX_LABEL_H,
  OPP_EXP_TOP,
  PLR_EXP_TOP,
  EXP_HEIGHT,
  EXP_OVERLAP,
  DISCARD_Y,
  DISCARD_CARD_W,
  DISCARD_CARD_H,
  OPP_SCORE_Y,
  PLR_SCORE_Y,
  SCORE_BOX_H,
  MID_COL_X,
  MID_COL_CENTER,
  MID_COL_W,
  ROUND_Y,
  ROUND_BOX_H,
  DRAW_PILE_Y,
  CARD_W,
  CARD_H,
  HAND_TOP,
  HAND_CARD_W,
  HAND_CARD_H,
  HAND_OVERLAP,
  PLAYER_HAND_CENTER,
  AI_HAND_CENTER,
  PLAYER_HAND_BOX_X,
  AI_HAND_BOX_X,
  HAND_BOX_W,
  LABEL_STYLE,
  SCORE_STYLE,
  SMALL_LABEL,
  BOX_STROKE,
  BOX_STROKE_ALPHA,
  BOX_FILL,
  BOX_FILL_ALPHA,
  BOX_RADIUS,
} from './LostCitiesConstants';

export interface ExpeditionZoneCallbacks {
  onExpeditionClick: () => void;
  onExpeditionPointerMove: (pointer: Phaser.Input.Pointer) => void;
  onExpeditionPointerOut: () => void;
}

export interface DiscardZoneCallbacks {
  onDiscardRowClick: (pointer: Phaser.Input.Pointer) => void;
  onDiscardPointerMove: (pointer: Phaser.Input.Pointer) => void;
  onDiscardPointerOut: () => void;
}

export interface DrawPileCallbacks {
  onDrawPileClick: () => void;
}

export interface HandCallbacks {
  onHandCardClick: (index: number) => void;
}

export class LostCitiesRenderer {
  private scene: Phaser.Scene;
  private session: LostCitiesSession;

  // Graphics layer
  private gfx!: Phaser.GameObjects.Graphics;

  // Sprite collections
  private playerExpSprites: Map<ExpeditionColor, Phaser.GameObjects.Image[]> = new Map();
  private oppExpSprites: Map<ExpeditionColor, Phaser.GameObjects.Image[]> = new Map();
  private discardSprites: Map<ExpeditionColor, Phaser.GameObjects.Image> = new Map();
  private handSprites: Phaser.GameObjects.Image[] = [];
  private aiHandSprites: Phaser.GameObjects.Image[] = [];
  private selectionHighlight: Phaser.GameObjects.Rectangle | null = null;

  // UI text
  private oppScoreText!: Phaser.GameObjects.Text;
  private plrScoreText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private turnIndicatorText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;
  private drawPileSprite!: Phaser.GameObjects.Image;
  private drawPileCountText!: Phaser.GameObjects.Text;

  /** Cache the refresh generation for stillMounted checks in async texture updates. */
  private refreshGen = 0;

  constructor(scene: Phaser.Scene, session: LostCitiesSession) {
    this.scene = scene;
    this.session = session;
  }

  // ── Getters for external access ─────────────────────────
  getScene(): Phaser.Scene { return this.scene; }
  get gfxObject(): Phaser.GameObjects.Graphics { return this.gfx; }
  get handSpriteList(): Phaser.GameObjects.Image[] { return this.handSprites; }
  get aiHandSpriteList(): Phaser.GameObjects.Image[] { return this.aiHandSprites; }
  get drawPile(): Phaser.GameObjects.Image { return this.drawPileSprite; }
  get instruction(): Phaser.GameObjects.Text { return this.instructionText; }
  get turnIndicator(): Phaser.GameObjects.Text { return this.turnIndicatorText; }
  get playerScore(): Phaser.GameObjects.Text { return this.plrScoreText; }
  get opponentScore(): Phaser.GameObjects.Text { return this.oppScoreText; }

  // ── Initialization ──────────────────────────────────────
  createGraphics(): void {
    this.gfx = this.scene.add.graphics();
  }

  createSectionBoxes(
    onExpeditionTooltip: (color: ExpeditionColor, anchor: Phaser.GameObjects.Components.Transform & { height?: number }, position: 'above' | 'below') => void,
    onHideTooltip: () => void,
  ): void {
    const tabW = 5 * LANE_STEP - LANE_GAP + 2 * BOX_PAD;

    // Opponent expeditions
    this.drawSectionBox(
      TABLEAU_LEFT - BOX_PAD,
      OPP_EXP_TOP - BOX_LABEL_H - BOX_PAD,
      tabW,
      EXP_HEIGHT + BOX_LABEL_H + 2 * BOX_PAD,
      'Opponent Expeditions',
    );

    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];
      const hex = Phaser.Display.Color.HexStringToColor(EXPEDITION_HEX[color]).color;
      this.drawCardSlot(
        laneX(i) - CARD_W / 2, OPP_EXP_TOP,
        CARD_W, CARD_H, hex, 0.15,
      );

      const zone = this.scene.add.rectangle(
        laneX(i), OPP_EXP_TOP + CARD_H / 2,
        CARD_W + 8, CARD_H + 4,
        0x000000, 0,
      );
      zone.setInteractive({ useHandCursor: false });
      zone.on('pointerover', () => onExpeditionTooltip(color, zone, 'below'));
      zone.on('pointerout', () => onHideTooltip());
    }

    // Discard piles
    this.drawSectionBox(
      TABLEAU_LEFT - BOX_PAD,
      DISCARD_Y - BOX_PAD,
      tabW,
      DISCARD_CARD_H + 2 * BOX_PAD,
      '',
    );

    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];
      const hex = Phaser.Display.Color.HexStringToColor(EXPEDITION_HEX[color]).color;
      this.drawCardSlot(
        laneX(i) - DISCARD_CARD_W / 2, DISCARD_Y,
        DISCARD_CARD_W, DISCARD_CARD_H, hex, 0.2,
      );
    }

    // Player expeditions
    this.drawSectionBox(
      TABLEAU_LEFT - BOX_PAD,
      PLR_EXP_TOP - BOX_LABEL_H - BOX_PAD,
      tabW,
      EXP_HEIGHT + BOX_LABEL_H + 2 * BOX_PAD,
      'Your Expeditions',
    );

    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];
      const hex = Phaser.Display.Color.HexStringToColor(EXPEDITION_HEX[color]).color;
      this.drawCardSlot(
        laneX(i) - CARD_W / 2, PLR_EXP_TOP,
        CARD_W, CARD_H, hex, 0.15,
      );
    }

    // Right column boxes
    this.drawSectionBox(
      MID_COL_X - BOX_PAD, OPP_SCORE_Y - BOX_PAD,
      MID_COL_W + 2 * BOX_PAD, SCORE_BOX_H + 2 * BOX_PAD, '',
    );
    this.drawSectionBox(
      MID_COL_X - BOX_PAD, ROUND_Y - BOX_PAD,
      MID_COL_W + 2 * BOX_PAD, ROUND_BOX_H + 2 * BOX_PAD, '',
    );
    this.drawSectionBox(
      MID_COL_X - BOX_PAD,
      DRAW_PILE_Y - BOX_LABEL_H - BOX_PAD,
      MID_COL_W + 2 * BOX_PAD,
      CARD_H + BOX_LABEL_H + 2 * BOX_PAD + 16,
      'Draw Pile',
    );
    this.drawSectionBox(
      MID_COL_X - BOX_PAD, PLR_SCORE_Y - BOX_PAD,
      MID_COL_W + 2 * BOX_PAD, SCORE_BOX_H + 2 * BOX_PAD, '',
    );

    // Hand boxes
    const handTotalH = HAND_CARD_H + (this.session.players[0].hand.length - 1) * HAND_OVERLAP;
    const handBoxH = handTotalH + BOX_LABEL_H + 2 * BOX_PAD;
    const handBoxY = HAND_TOP - BOX_LABEL_H - BOX_PAD;

    this.drawSectionBox(
      PLAYER_HAND_BOX_X - BOX_PAD,
      handBoxY,
      HAND_BOX_W + 2 * BOX_PAD,
      handBoxH,
      'Your Hand',
    );
    this.drawSectionBox(
      AI_HAND_BOX_X - BOX_PAD,
      handBoxY,
      HAND_BOX_W + 2 * BOX_PAD,
      handBoxH,
      'AI Hand',
    );
  }

  private drawSectionBox(
    x: number, y: number, w: number, h: number, label: string,
  ): void {
    this.gfx.lineStyle(1, BOX_STROKE, BOX_STROKE_ALPHA);
    this.gfx.fillStyle(BOX_FILL, BOX_FILL_ALPHA);
    this.gfx.fillRoundedRect(x, y, w, h, BOX_RADIUS);
    this.gfx.strokeRoundedRect(x, y, w, h, BOX_RADIUS);
    if (label) {
      this.scene.add
        .text(x + 8, y + 4, label, {
          ...SMALL_LABEL,
          fontSize: '9px',
          color: '#667766',
        })
        .setOrigin(0, 0.5);
    }
  }

  private drawCardSlot(
    x: number, y: number, w: number, h: number,
    fillColor: number, alpha: number,
  ): void {
    this.gfx.fillStyle(fillColor, alpha);
    this.gfx.fillRoundedRect(x, y, w, h, 4);
    this.gfx.lineStyle(1, 0xffffff, 0.15);
    this.gfx.strokeRoundedRect(x, y, w, h, 4);
  }

  createExpeditionZones(callbacks: ExpeditionZoneCallbacks): void {
    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];
      this.oppExpSprites.set(color, []);
      this.playerExpSprites.set(color, []);
    }

    const areaLeft = laneX(0) - CARD_W / 2 - 2;
    const areaRight = laneX(4) + CARD_W / 2 + 2;
    const areaWidth = areaRight - areaLeft;
    const areaCenterX = areaLeft + areaWidth / 2;
    const hitArea = this.scene.add.rectangle(
      areaCenterX, PLR_EXP_TOP + EXP_HEIGHT / 2,
      areaWidth, EXP_HEIGHT + 4,
      0x000000, 0,
    );
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', () => callbacks.onExpeditionClick());
    hitArea.on('pointermove', (pointer: Phaser.Input.Pointer) => callbacks.onExpeditionPointerMove(pointer));
    hitArea.on('pointerout', () => callbacks.onExpeditionPointerOut());
  }

  createDiscardZones(callbacks: DiscardZoneCallbacks): void {
    const areaLeft = laneX(0) - CARD_W / 2 - 2;
    const areaRight = laneX(4) + CARD_W / 2 + 2;
    const areaWidth = areaRight - areaLeft;
    const areaCenterX = areaLeft + areaWidth / 2;
    const hitArea = this.scene.add.rectangle(
      areaCenterX, DISCARD_Y + DISCARD_CARD_H / 2,
      areaWidth, DISCARD_CARD_H + 4,
      0x000000, 0,
    );
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => callbacks.onDiscardRowClick(pointer));
    hitArea.on('pointermove', (pointer: Phaser.Input.Pointer) => callbacks.onDiscardPointerMove(pointer));
    hitArea.on('pointerout', () => callbacks.onDiscardPointerOut());
  }

  createRightColumn(callbacks: DrawPileCallbacks): void {
    this.scene.add
      .text(MID_COL_CENTER, OPP_SCORE_Y + 6, 'Opponent', LABEL_STYLE)
      .setOrigin(0.5, 0);
    this.oppScoreText = this.scene.add
      .text(MID_COL_CENTER, OPP_SCORE_Y + 26, 'Score: 0', SCORE_STYLE)
      .setOrigin(0.5, 0);

    this.roundText = this.scene.add
      .text(MID_COL_CENTER, ROUND_Y + 6, 'Round 1 / 3', SCORE_STYLE)
      .setOrigin(0.5, 0);
    this.turnIndicatorText = this.scene.add
      .text(MID_COL_CENTER, ROUND_Y + 30, 'Your Turn', {
        ...LABEL_STYLE,
        fontSize: '13px',
        color: '#66dd66',
      })
      .setOrigin(0.5, 0);

    // Draw pile uses card back as fallback; lazy rasterisation will update
    // the texture when the DPR-aware texture is ready.
    const backKey = getLcBackFallbackKey(this.scene);
    this.drawPileSprite = this.scene.add.image(
      MID_COL_CENTER, DRAW_PILE_Y + CARD_H / 2, backKey,
    );
    this.drawPileSprite.setInteractive({ useHandCursor: true });
    this.drawPileSprite.on('pointerdown', () => callbacks.onDrawPileClick());

    // Kick off lazy rasterisation for the card back.
    void applyEnsuredTexture(
      this.drawPileSprite,
      ensureLcBackTexture(this.scene, CARD_W, CARD_H),
      () => !!this.drawPileSprite,
      CARD_W,
      CARD_H,
    );

    this.drawPileCountText = this.scene.add
      .text(MID_COL_CENTER, DRAW_PILE_Y + CARD_H + 4, '44 remaining', SMALL_LABEL)
      .setOrigin(0.5, 0);

    this.scene.add
      .text(MID_COL_CENTER, PLR_SCORE_Y + 6, 'You', LABEL_STYLE)
      .setOrigin(0.5, 0);
    this.plrScoreText = this.scene.add
      .text(MID_COL_CENTER, PLR_SCORE_Y + 26, 'Score: 0', SCORE_STYLE)
      .setOrigin(0.5, 0);
  }

  createInstructionBar(): void {
    this.instructionText = this.scene.add
      .text((this.scene.game.config.width as number) / 2, (this.scene.game.config.height as number) - 6, '', {
        ...SMALL_LABEL,
        fontSize: '13px',
        color: '#88cc88',
      })
      .setOrigin(0.5, 1);
  }

  // ── Refresh display ─────────────────────────────────────
  refreshAll(onHandClick?: (index: number) => void): void {
    this.refreshGen++;
    this.refreshExpeditions();
    this.refreshDiscardPiles();
    if (onHandClick) this.refreshHand(onHandClick);
    this.refreshAiHand();
    this.refreshDrawPile();
    this.refreshScores();
    this.refreshRoundIndicator();
  }

  refreshExpeditions(): void {
    const gen = this.refreshGen;
    const backKey = getLcBackFallbackKey(this.scene);

    for (const sprites of this.oppExpSprites.values()) {
      sprites.forEach(s => s.destroy());
    }
    for (const sprites of this.playerExpSprites.values()) {
      sprites.forEach(s => s.destroy());
    }

    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];

      const oppCards = this.session.players[1].expeditions.get(color) ?? [];
      const oppSprites: Phaser.GameObjects.Image[] = [];
      for (let c = 0; c < oppCards.length; c++) {
        const x = laneX(i);
        const y = OPP_EXP_TOP + c * EXP_OVERLAP + CARD_H / 2;
        const templateId = cardAssetKey(oppCards[c]);
        const sprite = this.scene.add.image(x, y, backKey);
        sprite.setDisplaySize(CARD_W, CARD_H);
        sprite.setDepth(c);
        oppSprites.push(sprite);

        // Lazy rasterisation: ensure texture exists and update sprite when ready.
        const colorSprites = this.oppExpSprites.get(color);
        void applyEnsuredTexture(
          sprite,
          ensureLcCardTexture(this.scene, templateId, CARD_W, CARD_H),
          () => gen === this.refreshGen && !!colorSprites && colorSprites.includes(sprite),
          CARD_W,
          CARD_H,
        );
      }
      this.oppExpSprites.set(color, oppSprites);

      const plrCards = this.session.players[0].expeditions.get(color) ?? [];
      const plrSprites: Phaser.GameObjects.Image[] = [];
      for (let c = 0; c < plrCards.length; c++) {
        const x = laneX(i);
        const y = PLR_EXP_TOP + c * EXP_OVERLAP + CARD_H / 2;
        const templateId = cardAssetKey(plrCards[c]);
        const sprite = this.scene.add.image(x, y, backKey);
        sprite.setDisplaySize(CARD_W, CARD_H);
        sprite.setDepth(c);
        plrSprites.push(sprite);

        const colorSprites = this.playerExpSprites.get(color);
        void applyEnsuredTexture(
          sprite,
          ensureLcCardTexture(this.scene, templateId, CARD_W, CARD_H),
          () => gen === this.refreshGen && !!colorSprites && colorSprites.includes(sprite),
          CARD_W,
          CARD_H,
        );
      }
      this.playerExpSprites.set(color, plrSprites);
    }
  }

  refreshDiscardPiles(): void {
    const gen = this.refreshGen;
    const backKey = getLcBackFallbackKey(this.scene);

    for (const sprite of this.discardSprites.values()) {
      sprite.destroy();
    }
    this.discardSprites.clear();

    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];
      const pile = this.session.round.discardPiles.get(color) ?? [];

      if (pile.length > 0) {
        const topCard = pile[pile.length - 1];
        const templateId = compactAssetKey(topCard);
        const sprite = this.scene.add.image(
          laneX(i), DISCARD_Y + DISCARD_CARD_H / 2,
          backKey,
        );
        sprite.setDisplaySize(DISCARD_CARD_W, DISCARD_CARD_H);
        this.discardSprites.set(color, sprite);

        void applyEnsuredTexture(
          sprite,
          ensureLcCompactTexture(this.scene, templateId),
          () => gen === this.refreshGen && this.discardSprites.get(color) === sprite,
          DISCARD_CARD_W,
          DISCARD_CARD_H,
        );
      }
    }
  }

  refreshHand(onClick: (index: number) => void): void {
    const gen = this.refreshGen;
    const backKey = getLcBackFallbackKey(this.scene);

    this.handSprites.forEach(s => s.destroy());
    this.handSprites = [];
    if (this.selectionHighlight) {
      this.selectionHighlight.destroy();
      this.selectionHighlight = null;
    }

    const hand = this.session.players[0].hand;
    hand.sort(LostCitiesRenderer.handSortCompare);
    for (let c = 0; c < hand.length; c++) {
      const x = PLAYER_HAND_CENTER;
      const y = HAND_TOP + c * HAND_OVERLAP + HAND_CARD_H / 2;
      const templateId = cardAssetKey(hand[c]);
      const sprite = this.scene.add.image(x, y, backKey);
      sprite.setDisplaySize(HAND_CARD_W, HAND_CARD_H);
      sprite.setDepth(c + 1);
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', () => onClick(c));
      this.handSprites.push(sprite);

      void applyEnsuredTexture(
        sprite,
        ensureLcCardTexture(this.scene, templateId, CARD_W, CARD_H),
        () => gen === this.refreshGen && this.handSprites.includes(sprite),
        CARD_W,
        CARD_H,
      );
    }
  }

  refreshAiHand(): void {
    const gen = this.refreshGen;
    const backKey = getLcBackFallbackKey(this.scene);

    for (const sprite of this.aiHandSprites) {
      sprite.destroy();
    }
    this.aiHandSprites = [];

    const aiHand = this.session.players[1].hand;
    for (let c = 0; c < aiHand.length; c++) {
      const x = AI_HAND_CENTER;
      const y = HAND_TOP + c * HAND_OVERLAP + HAND_CARD_H / 2;
      const sprite = this.scene.add.image(x, y, backKey);
      sprite.setDisplaySize(HAND_CARD_W, HAND_CARD_H);
      sprite.setDepth(c + 1);
      this.aiHandSprites.push(sprite);
    }

    // Kick off lazy rasterisation for card back and update all AI hand sprites.
    void (async () => {
      try {
        const result = await ensureLcBackTexture(this.scene, CARD_W, CARD_H);
        if (!result.ready && result.promise) {
          await result.promise;
        }
        if (gen !== this.refreshGen) return;
        for (const sprite of this.aiHandSprites) {
          sprite.setTexture(result.key);
          sprite.setDisplaySize(HAND_CARD_W, HAND_CARD_H);
        }
      } catch {
        // keep fallback back texture
      }
    })();
  }

  refreshDrawPile(): void {
    const gen = this.refreshGen;
    const remaining = this.session.round.drawPile.length;
    this.drawPileCountText.setText(`${remaining} remaining`);
    this.drawPileSprite.setVisible(remaining > 0);

    // Ensure card back texture is available for draw pile.
    void applyEnsuredTexture(
      this.drawPileSprite,
      ensureLcBackTexture(this.scene, CARD_W, CARD_H),
      () => gen === this.refreshGen && !!this.drawPileSprite,
      CARD_W,
      CARD_H,
    );
  }

  refreshScores(): void {
    const p0Detailed = scoreRoundDetailed(this.session.players[0].expeditions);
    const p1Detailed = scoreRoundDetailed(this.session.players[1].expeditions);

    const p0Round = p0Detailed.total;
    const p1Round = p1Detailed.total;
    const [p0Cum, p1Cum] = this.session.cumulativeScores;

    const p0Total = p0Cum + p0Round;
    const p1Total = p1Cum + p1Round;

    if (this.session.roundNumber > 1 || p0Cum !== 0 || p1Cum !== 0) {
      this.plrScoreText.setText(`Round: ${p0Round}  Total: ${p0Total}`);
      this.oppScoreText.setText(`Round: ${p1Round}  Total: ${p1Total}`);
    } else {
      this.plrScoreText.setText(`Score: ${p0Round}`);
      this.oppScoreText.setText(`Score: ${p1Round}`);
    }
  }

  refreshRoundIndicator(): void {
    this.roundText.setText(`Round ${this.session.roundNumber} / 3`);
  }

  // ── Selection highlight ─────────────────────────────────
  showSelectionHighlight(handIndex: number): void {
    this.clearSelectionHighlight();
    const sprite = this.handSprites[handIndex];
    if (!sprite) return;

    this.selectionHighlight = this.scene.add.rectangle(
      sprite.x, sprite.y,
      HAND_CARD_W + 6, HAND_CARD_H + 6,
      0xffdd44, 0,
    );
    this.selectionHighlight.setStrokeStyle(3, 0xffdd44, 1);
    this.selectionHighlight.setDepth(handIndex + 0.5);
  }

  clearSelectionHighlight(): void {
    if (this.selectionHighlight) {
      this.selectionHighlight.destroy();
      this.selectionHighlight = null;
    }
  }

  // ── Static sort compare ─────────────────────────────────
  static handSortCompare(a: LostCitiesCard, b: LostCitiesCard): number {
    const colorA = EXPEDITION_COLORS.indexOf(a.color);
    const colorB = EXPEDITION_COLORS.indexOf(b.color);
    if (colorA !== colorB) return colorA - colorB;
    if (a.type !== b.type) return a.type === 'investment' ? -1 : 1;
    if (a.type === 'investment' && b.type === 'investment') {
      return a.investmentIndex - b.investmentIndex;
    }
    if (a.type === 'numbered' && b.type === 'numbered') {
      return a.rank - b.rank;
    }
    return 0;
  }
}
