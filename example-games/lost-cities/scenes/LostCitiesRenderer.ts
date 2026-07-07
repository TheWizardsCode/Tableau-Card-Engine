/**
 * LostCitiesRenderer — UI creation and refresh logic for Lost Cities.
 *
 * This renderer uses the shared HandView and PileView components for
 * player hand, AI hand, draw pile, discard pile, and expedition pile
 * rendering. Expedition piles use a PileView for the top card plus a
 * lightweight cascade array for preceding cards in each lane.
 *
 * Phase 3 migration: CG-0MQBOKB540040Q60, CG-0MQ6IEM9F001JTQD
 *
 * @module example-games/lost-cities/scenes/LostCitiesRenderer
 */
import type { Card } from '../../../src/card-system/Card';
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
  getLcFaceKey,
  ensureLcCardTexture,
  ensureLcCompactTexture,
  ensureLcBackTexture,
  applyEnsuredTexture,
} from '../LostCitiesTextureHelpers';
import { HandView } from '../../../src/ui/HandView';
import { PileView, type CardPile } from '../../../src/ui/PileView';
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

// ── Card texture resolvers for Lost Cities cards ────────────

/**
 * Resolve texture key for a Lost Cities card.
 * Uses `getLcFaceKey` for lazy texture cache with fallback.
 */
function lcCardTextureFn(
  scene: Phaser.Scene,
  cardW: number,
  cardH: number,
): (card: unknown, _index: number) => string {
  return (card: unknown, _index: number): string => {
    const lcCard = card as LostCitiesCard;
    const templateId = cardAssetKey(lcCard);
    return getLcFaceKey(scene, templateId, cardW, cardH);
  };
}

/**
 * Resolve texture key for discard pile top cards (compact size).
 */
function lcCompactTextureFn(
  scene: Phaser.Scene,
): (card: unknown) => string {
  return (card: unknown): string => {
    const lcCard = card as LostCitiesCard;
    const templateId = compactAssetKey(lcCard);
    return getLcFaceKey(scene, templateId, DISCARD_CARD_W, DISCARD_CARD_H);
  };
}

/**
 * Resolve texture key for draw pile (card back).
 */
function lcDrawPileTextureFn(scene: Phaser.Scene): () => string {
  return (): string => getLcBackFallbackKey(scene);
}

// ── Draw pile PileView with card-back texture ───────────────

/**
 * A PileView that uses the card back texture and supports
 * lazy card-back texture updates for Lost Cities.
 */
export class DrawPileView extends PileView {
  private scene: Phaser.Scene;
  private cardW: number;
  private cardH: number;
  private refreshGen = 0;

  constructor(
    scene: Phaser.Scene,
    opts: { x: number; y: number; cardW: number; cardH: number },
  ) {
    super(scene, {
      x: opts.x,
      y: opts.y,
      label: 'Draw Pile',
      emptyTexture: 'card_back',
      cardTextureFn: lcDrawPileTextureFn(scene),
      countOffsetY: opts.cardH / 2 + 5.5,
    });
    this.scene = scene;
    this.cardW = opts.cardW;
    this.cardH = opts.cardH;
    // Size the sprite to match the expected card dimensions
    this.getSprite().setDisplaySize(opts.cardW, opts.cardH);
  }

  /**
   * Override update to also handle lazy card-back texture resolution.
   */
  override update(): void {
    super.update();
    // After super.update() sets the texture via setTexture(), Phaser resets
    // the sprite's display size to the texture frame's natural size. Since SVG
    // textures are rasterised at quality scale (4x), we must re-apply the
    // intended display size immediately — otherwise the sprite appears at 4x.
    this.getSprite().setDisplaySize(this.cardW, this.cardH);

    // Also apply lazy texture if needed (for async card back generation)
    const gen = this.refreshGen;
    void applyEnsuredTexture(
      this.getSprite(),
      ensureLcBackTexture(this.scene, this.cardW, this.cardH),
      () => gen === this.refreshGen && this.getSprite().active,
      this.cardW,
      this.cardH,
    );
    this.refreshGen++;
  }
}

// ── Discard pile wrapper ────────────────────────────────────

/**
 * Simple adapter that wraps a single-card discard pile array
 * to satisfy the PileView CardPile interface.
 */
class DiscardPileAdapter {
  private cards: LostCitiesCard[];

  constructor(cards: LostCitiesCard[]) {
    this.cards = cards;
  }

  size(): number {
    return this.cards.length;
  }

  isEmpty(): boolean {
    return this.cards.length === 0;
  }

  peek(): LostCitiesCard | undefined {
    return this.cards.length > 0 ? this.cards[this.cards.length - 1] : undefined;
  }
}

/**
 * Lightweight adapter that wraps a plain LostCitiesCard[] with the PileView
 * CardPile interface (`size()`, `isEmpty()`, `peek()`). Used for expedition
 * piles which are stored as plain arrays in the session model.
 *
 * Follows the same pattern as Golf's ArrayPileAdapter (CG-0MQ6IEM920091HF6).
 */
class LcArrayPileAdapter implements CardPile<LostCitiesCard> {
  constructor(private cards: LostCitiesCard[]) {}
  size(): number { return this.cards.length; }
  isEmpty(): boolean { return this.cards.length === 0; }
  peek(): LostCitiesCard | undefined { return this.cards.length > 0 ? this.cards[this.cards.length - 1] : undefined; }
}

// ── Renderer class ──────────────────────────────────────────

export class LostCitiesRenderer {
  private scene: Phaser.Scene;
  private session: LostCitiesSession;

  // Graphics layer
  private gfx!: Phaser.GameObjects.Graphics;

  // PileView instances for expedition lanes' top card + cascade sprites for preceding cards.
  // Phase 3 migration: CG-0MQBOKB540040Q60, CG-0MQ6IEM9F001JTQD
  private playerExpPileViews: Map<ExpeditionColor, PileView> = new Map();
  private oppExpPileViews: Map<ExpeditionColor, PileView> = new Map();
  private playerExpCascade: Map<ExpeditionColor, Phaser.GameObjects.Image[]> = new Map();
  private oppExpCascade: Map<ExpeditionColor, Phaser.GameObjects.Image[]> = new Map();
  private selectionHighlight: Phaser.GameObjects.Rectangle | null = null;

  // UI text
  private oppScoreText!: Phaser.GameObjects.Text;
  private plrScoreText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private turnIndicatorText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;

  // Reusable UI components
  private handView!: HandView;
  private drawPileView!: DrawPileView;
  private discardViews: Map<ExpeditionColor, PileView> = new Map();

  // AI hand sprites (kept separate from HandView — always face-down)
  private aiHandSprites: Phaser.GameObjects.Image[] = [];

  /** Cache the refresh generation for stillMounted checks in async texture updates. */
  private refreshGen = 0;

  /** Stored reference to the hand click handler so we can remove it before re-adding. */
  private boundHandClick: ((index: number) => void) | null = null;

  constructor(scene: Phaser.Scene, session: LostCitiesSession) {
    this.scene = scene;
    this.session = session;
  }

  // ── Getters for external access ─────────────────────────
  getScene(): Phaser.Scene { return this.scene; }
  get gfxObject(): Phaser.GameObjects.Graphics { return this.gfx; }

  /** Return the player hand sprite at the given index (for illegal move feedback). */
  get handSpriteList(): Phaser.GameObjects.Image[] {
    return this.handView.getSprites() as Phaser.GameObjects.Image[];
  }

  /** Return the AI hand sprite list (for AI animation). */
  get aiHandSpriteList(): Phaser.GameObjects.Image[] {
    return this.aiHandSprites;
  }

  /** Return the draw pile sprite (for animation). */
  get drawPile(): Phaser.GameObjects.Image {
    return this.drawPileView.getSprite();
  }

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
      const laneCenterX = laneX(i);

      // Initialize PileView instances for opponent (even if 0 cards — handles empty state)
      if (!this.oppExpPileViews.has(color)) {
        const pv = new PileView(this.scene, {
          x: laneCenterX,
          y: OPP_EXP_TOP + CARD_H / 2,
          emptyTexture: getLcBackFallbackKey(this.scene),
          emptyAlpha: 0.3,
          fullAlpha: 1,
          countOffsetY: EXP_OVERLAP + 8,
          countFontSize: '11px',
          countColor: '#667766',
        });
        pv.setInteractive(false); // no individual click — use expedition hit zone
        this.oppExpPileViews.set(color, pv);
      }
      this.oppExpCascade.set(color, []);

      // Initialize PileView instances for player
      if (!this.playerExpPileViews.has(color)) {
        const pv = new PileView(this.scene, {
          x: laneCenterX,
          y: PLR_EXP_TOP + CARD_H / 2,
          emptyTexture: getLcBackFallbackKey(this.scene),
          emptyAlpha: 0.3,
          fullAlpha: 1,
          countOffsetY: EXP_OVERLAP + 8,
          countFontSize: '11px',
          countColor: '#667766',
        });
        pv.setInteractive(false);
        this.playerExpPileViews.set(color, pv);
      }
      this.playerExpCascade.set(color, []);
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

    // ── Draw Pile: use PileView ─────────────────────────────
    this.drawPileView = new DrawPileView(this.scene, {
      x: MID_COL_CENTER,
      y: DRAW_PILE_Y + CARD_H / 2,
      cardW: CARD_W,
      cardH: CARD_H,
    });
    this.drawPileView.onClick(() => callbacks.onDrawPileClick());

    // ── Player Hand: use HandView ───────────────────────────
    this.handView = new HandView(this.scene, {
      baseX: PLAYER_HAND_CENTER,
      baseY: HAND_TOP + HAND_CARD_H / 2,
      spacing: HAND_OVERLAP,
      cardWidth: HAND_CARD_W,
      showLabels: false,
      selectionEnabled: false, // Lost Cities manages its own selection via showSelectionHighlight
      clickEnabled: true,
      layoutDirection: 'vertical',
      cardTextureFn: lcCardTextureFn(this.scene, HAND_CARD_W, HAND_CARD_H),
    });

    // ── AI Hand: use HandView (face-down cards) ─────────────
    // Note: AI hand uses the same HandView infrastructure but with
    // a texture resolver that always returns the card back key.
    // We store AI hand cards separately and rebuild when needed.

    // ── Discard Piles: use PileView per color ───────────────
    for (const color of EXPEDITION_COLORS) {
      const dv = new PileView(this.scene, {
        x: laneX(EXPEDITION_COLORS.indexOf(color)),
        y: DISCARD_Y + DISCARD_CARD_H / 2,
        label: '',
        emptyTexture: getLcBackFallbackKey(this.scene),
        emptyAlpha: 0.3,
        fullAlpha: 1,
        cardTextureFn: lcCompactTextureFn(this.scene),
      });
      // Disable interactivity — the discard hit area created in
      // createDiscardZones handles all discard clicks.
      dv.setInteractive(false);
      this.discardViews.set(color, dv);
    }

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

  /**
   * Pre-warm texture generation for all cards currently visible in the game
   * state. Called at the start of refreshAll so textures are being generated
   * (or are already cached) before sprites are created.
   */
  private prewarmTextures(): void {
    // Kick off generation for all expedition cards (both players)
    for (const color of EXPEDITION_COLORS) {
      for (const cards of [
        this.session.players[0].expeditions.get(color) ?? [],
        this.session.players[1].expeditions.get(color) ?? [],
      ]) {
        for (const card of cards) {
          const templateId = cardAssetKey(card);
          void ensureLcCardTexture(this.scene, templateId, CARD_W, CARD_H);
        }
      }

      // Discard piles
      const pile = this.session.round.discardPiles.get(color) ?? [];
      if (pile.length > 0) {
        const topCard = pile[pile.length - 1];
        const templateId = compactAssetKey(topCard);
        void ensureLcCompactTexture(this.scene, templateId);
      }
    }

    // Player hand
    for (const card of this.session.players[0].hand) {
      const templateId = cardAssetKey(card);
      void ensureLcCardTexture(this.scene, templateId, CARD_W, CARD_H);
    }

    // Card back (for AI hand and draw pile)
    void ensureLcBackTexture(this.scene, CARD_W, CARD_H);
  }

  refreshAll(onHandClick?: (index: number) => void): void {
    this.refreshGen++;
    // Start generating textures for all currently-visible cards BEFORE
    // destroying and recreating sprites. On the first render this means
    // textures will start generation early; on subsequent renders they
    // will already be cached and used directly via getLcFaceKey.
    this.prewarmTextures();
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

    // Destroy old cascade sprites (PileView instances are kept and updated)
    for (const sprites of this.oppExpCascade.values()) {
      sprites.forEach(s => s.destroy());
    }
    for (const sprites of this.playerExpCascade.values()) {
      sprites.forEach(s => s.destroy());
    }

    // ── Helpers for a single expedition lane ─────────────
    const buildCascade = (
      cards: LostCitiesCard[],
      baseTop: number,
      laneXpos: number,
      cascadeMap: Map<ExpeditionColor, Phaser.GameObjects.Image[]>,
      color: ExpeditionColor,
    ): Phaser.GameObjects.Image[] => {
      // All cards except the last (top)
      const cascadeCards = cards.slice(0, -1);
      const sprites: Phaser.GameObjects.Image[] = [];
      for (let c = 0; c < cascadeCards.length; c++) {
        const y = baseTop + c * EXP_OVERLAP + CARD_H / 2;
        const templateId = cardAssetKey(cascadeCards[c]);
        const textureKey = getLcFaceKey(this.scene, templateId, CARD_W, CARD_H);
        const sprite = this.scene.add.image(laneXpos, y, textureKey);
        sprite.setDisplaySize(CARD_W, CARD_H);
        sprite.setDepth(c);
        sprites.push(sprite);

        // Lazy async texture update for generation that hasn't completed yet
        const cascadeSprites = cascadeMap.get(color);
        void applyEnsuredTexture(
          sprite,
          ensureLcCardTexture(this.scene, templateId, CARD_W, CARD_H),
          () => gen === this.refreshGen && !!cascadeSprites && cascadeSprites.includes(sprite),
          CARD_W,
          CARD_H,
        );
      }
      return sprites;
    };

    const updatePileView = (
      pv: PileView,
      cards: LostCitiesCard[],
      laneXpos: number,
      baseTop: number,
    ): void => {
      // Wire the pile model via adapter for future unified texture resolution.
      // Manual setTexture is used currently (The Mind pattern); the adapter
      // enables a later migration to PileView.update() with cardTextureFn.
      pv.setPile(new LcArrayPileAdapter(cards));

      if (cards.length === 0) {
        // Empty state: show ghosted card_back at base-top position
        pv.getSprite().setPosition(laneXpos, baseTop + CARD_H / 2);
        pv.getSprite().setTexture(getLcBackFallbackKey(this.scene));
        pv.getSprite().setAlpha(0.3);
        pv.getSprite().setVisible(true);
        pv.getSprite().setDisplaySize(CARD_W, CARD_H);
        pv.getCountText().setPosition(laneXpos, baseTop + CARD_H / 2 + EXP_OVERLAP + 8);
        pv.getCountText().setText('0');
        return;
      }

      // Top card position (topmost in the cascade)
      const topY = baseTop + (cards.length - 1) * EXP_OVERLAP + CARD_H / 2;
      const topCard = cards[cards.length - 1];
      const templateId = cardAssetKey(topCard);
      const faceKey = getLcFaceKey(this.scene, templateId, CARD_W, CARD_H);

      // Position sprite at top card location
      pv.getSprite().setPosition(laneXpos, topY);
      pv.getSprite().setTexture(faceKey);
      pv.getSprite().setAlpha(1);
      pv.getSprite().setVisible(true);
      pv.getSprite().setDisplaySize(CARD_W, CARD_H);
      pv.getSprite().setDepth(cards.length - 1);

      // Count label below the cascade
      pv.getCountText().setPosition(laneXpos, topY + EXP_OVERLAP + 8);
      pv.getCountText().setText(`${cards.length}`);

      // Lazy async texture update for top card
      void applyEnsuredTexture(
        pv.getSprite(),
        ensureLcCardTexture(this.scene, templateId, CARD_W, CARD_H),
        () => gen === this.refreshGen && pv.getSprite().active,
        CARD_W,
        CARD_H,
      );
    };

    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];
      const laneCenterX = laneX(i);

      // Opponent expedition
      const oppCards = this.session.players[1].expeditions.get(color) ?? [];
      const oppPv = this.oppExpPileViews.get(color)!;
      this.oppExpCascade.set(color, buildCascade(
        oppCards, OPP_EXP_TOP, laneCenterX, this.oppExpCascade, color,
      ));
      updatePileView(oppPv, oppCards, laneCenterX, OPP_EXP_TOP);

      // Player expedition
      const plrCards = this.session.players[0].expeditions.get(color) ?? [];
      const plrPv = this.playerExpPileViews.get(color)!;
      this.playerExpCascade.set(color, buildCascade(
        plrCards, PLR_EXP_TOP, laneCenterX, this.playerExpCascade, color,
      ));
      updatePileView(plrPv, plrCards, laneCenterX, PLR_EXP_TOP);
    }
  }

  refreshDiscardPiles(): void {
    const gen = this.refreshGen;
    for (let i = 0; i < 5; i++) {
      const color = EXPEDITION_COLORS[i];
      const pile = this.session.round.discardPiles.get(color) ?? [];

      const discardView = this.discardViews.get(color);
      if (!discardView) continue;

      if (pile.length === 0) {
        // Hide the sprite and count text — discard hit areas (createDiscardZones)
        // handle all interaction, so the ghosted card-back is unnecessary visual
        // clutter. Using PileView.update() for empty piles would show a
        // full-size card-back (95×130) instead of the compact discard size
        // (57×78), appearing oversized and shifting layout when cards arrive.
        discardView.getSprite().setVisible(false);
        discardView.getCountText().setVisible(false);
        continue;
      }

      // Update the adapter with the current pile data
      const adapter = new DiscardPileAdapter([...pile]);
      discardView.setPile(adapter);
      discardView.update();

      // Set the correct display size on the discard pile sprite.
      // SVG textures are rasterised at quality scale (4x), so without
      // setDisplaySize the sprite appears at the full canvas pixel size.
      discardView.getSprite().setDisplaySize(DISCARD_CARD_W, DISCARD_CARD_H);

      // Also ensure compact texture is available
      const topCard = pile[pile.length - 1];
      const templateId = compactAssetKey(topCard);
      void ensureLcCompactTexture(this.scene, templateId);

      // Apply lazy texture update so the discard card shows face-up
      // when the compact SVG texture finishes rasterising.
      void applyEnsuredTexture(
        discardView.getSprite(),
        ensureLcCompactTexture(this.scene, templateId),
        () => gen === this.refreshGen && discardView.getSprite().active,
        DISCARD_CARD_W,
        DISCARD_CARD_H,
      );
    }
  }

  refreshHand(onClick: (index: number) => void): void {
    // Use HandView for the player hand.
    // HandView manages its own sprites via setCards(), selection, and events.

    // Get current hand and sort it by color then value (ascending)
    const hand = this.session.players[0].hand;
    hand.sort(LostCitiesRenderer.handSortCompare);
    const currentGen = this.refreshGen;

    // Update HandView with current cards.
    // HandView.setCards expects Card[], but LostCitiesCard doesn't implement
    // Card (no rank/suit). We cast to `any[]` since HandView only uses the
    // card objects as opaque handles passed to the custom texture resolver.
    this.handView.setCards(hand as unknown as Card[], { cardTextureFn: lcCardTextureFn(this.scene, HAND_CARD_W, HAND_CARD_H) });

    // Wire click handler — HandView emits cardclick events.
    // Must remove the old listener first to prevent accumulation across turns.
    if (this.boundHandClick) {
      this.handView.off('cardclick', this.boundHandClick);
    }
    this.boundHandClick = (index: number) => onClick(index);
    this.handView.on('cardclick', this.boundHandClick);

    // Set the correct display size on all hand sprites.
    // SVG textures are rasterised at quality scale (4x), so without
    // setDisplaySize sprites appear at the full canvas pixel size.
    const sprites = this.handView.getSprites() as Phaser.GameObjects.Image[];
    for (let i = 0; i < sprites.length; i++) {
      const sprite = sprites[i];
      sprite.setDisplaySize(HAND_CARD_W, HAND_CARD_H);
      sprite.setDepth(i + 1);

      // Kick off lazy rasterisation for each hand card so the face texture
      // replaces the card-back fallback. The cardTextureFn above may return
      // the card-back key for any card whose face texture isn't ready yet.
      const card = hand[i];
      if (card) {
        const templateId = cardAssetKey(card);
        void applyEnsuredTexture(
          sprite,
          ensureLcCardTexture(this.scene, templateId, HAND_CARD_W, HAND_CARD_H),
          () => currentGen === this.refreshGen && sprites.includes(sprite),
          HAND_CARD_W,
          HAND_CARD_H,
        );
      }
    }
  }

  refreshAiHand(): void {
    const currentGen = this.refreshGen;

    // Clean up old AI hand sprites
    for (const sprite of this.aiHandSprites) {
      sprite.destroy();
    }
    this.aiHandSprites = [];

    const aiHand = this.session.players[1].hand;
    const backKey = getLcBackFallbackKey(this.scene);

    // Create face-down card sprites for the AI hand.
    // These use the card back texture and are managed separately
    // from the player hand (which uses HandView).
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
        if (currentGen !== this.refreshGen) return;
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
    const remaining = this.session.round.drawPile.length;

    // Update PileView
    this.drawPileView.setPile({
      size: () => remaining,
      isEmpty: () => remaining === 0,
      peek: () => (remaining > 0 ? undefined : undefined),
    });
    this.drawPileView.update();

    // The DrawPileView handles card back texture updates internally.
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
    const sprite = this.handView.getSpriteAt(handIndex);
    if (!sprite) return;
    const imgSprite = sprite as Phaser.GameObjects.Image;

    this.selectionHighlight = this.scene.add.rectangle(
      imgSprite.x, imgSprite.y,
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

  // ── Cleanup ─────────────────────────────────────────────

  /** Destroy all PileView instances and cascade sprite collections. */
  destroy(): void {
    for (const pv of this.playerExpPileViews.values()) {
      pv.destroy();
    }
    this.playerExpPileViews.clear();
    for (const pv of this.oppExpPileViews.values()) {
      pv.destroy();
    }
    this.oppExpPileViews.clear();

    for (const sprites of this.playerExpCascade.values()) {
      sprites.forEach(s => s.destroy());
    }
    this.playerExpCascade.clear();
    for (const sprites of this.oppExpCascade.values()) {
      sprites.forEach(s => s.destroy());
    }
    this.oppExpCascade.clear();
  }
}
