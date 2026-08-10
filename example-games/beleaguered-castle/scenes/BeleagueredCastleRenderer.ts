/**
 * BeleagueredCastleRenderer — UI creation, refresh, and deal animation.
 *
 * Foundation piles rendered via shared PileView; tableau columns
 * rendered via shared HandView (vertical cascade layout).
 */
import Phaser from 'phaser';
import type { BeleagueredCastleState, BCMove } from '../BeleagueredCastleState';
import { FOUNDATION_COUNT, TABLEAU_COUNT } from '../BeleagueredCastleState';
import { HandView, PileView } from '../../../src/ui';
import { GAME_W, GAME_H } from '../../../src/ui';
import type { DragDropManager, DragDropPayload } from '../../../src/ui';
import { createSceneTitle } from '@ui/Renderer';
import { createBcHudText } from '../../../src/ui/Renderer/adapters/BeleagueredCastleAdapter';
import {
  BC_CARD_W, BC_CARD_H, CARD_GAP, CASCADE_OFFSET_Y,
  DRAG_DEPTH, DEAL_STAGGER, ANIM_DURATION,
  HIGHLIGHT_VALID, HIGHLIGHT_ALPHA, SELECTION_TINT,
  HINT_SOURCE_COLOR, HINT_DEST_COLOR, HINT_ALPHA, HINT_DEPTH,
  HUD_MARGIN,
  HUD_FONT_SIZE,
  HUD_SEED_FONT_SIZE,
  FOUNDATION_SLOT_ALPHA,
  FOUNDATION_BORDER_RADIUS,
  FOUNDATION_COUNT_FONT_SIZE,
} from './BeleagueredCastleConstants';
import {
  computeBeleagueredCastleLayout,
  type BeleagueredCastleLayout,
} from './BeleagueredCastleLayoutAdapter';

/**
 * Data attached to each draggable tableau top card (exposed via the
 * drag-drop module's payload). Origin/depth are tracked by the module.
 */
export interface BCTopCardDragData {
  colIndex: number;
  rowIndex: number;
}

/** Data attached to each registered drop zone (foundation/tableau). */
export interface BCZoneDragData {
  type: 'foundation' | 'tableau';
  index: number;
}

export class BeleagueredCastleRenderer {
  /** When true, deal animation is skipped and all cards appear immediately. */
  reducedMotion = false;

  private scene: Phaser.Scene;
  private state: BeleagueredCastleState;

  /** SLL-derived layout resolved once at construction. */
  private layout: BeleagueredCastleLayout;

  /**
   * Reusable core-engine drag-drop manager (created by the scene).
   * The renderer registers tableau top cards as draggables via it.
   */
  dragDropManager: DragDropManager | null = null;

  /** Tableau top cards registered as draggables on the current board render. */
  private dragDropRegistered = new Set<Phaser.GameObjects.Image>();

  // Display objects
  /** Shared PileView components for foundation piles. */
  private foundationPileViews: PileView[] = [];
  private foundationDropZones: Phaser.GameObjects.Zone[] = [];

  /** Hint highlight rectangles (source + destination). */
  private hintRects: Phaser.GameObjects.Rectangle[] = [];

  /** Shared HandView components for tableau columns (vertical cascade layout). */
  private tableauHandViews: HandView[] = [];
  private tableauDropZones: Phaser.GameObjects.Zone[] = [];
  private highlightRects: Phaser.GameObjects.Rectangle[] = [];

  // HUD
  private moveCountText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private seedText!: Phaser.GameObjects.Text;

  // Callbacks
  onDealCard?: (info: { cardIndex: number; totalCards: number }) => void;
  onDealComplete?: () => void;
  onCardClick?: (colIndex: number) => void;
  /** Fired by the drag-drop module for an accepted drag-drop (see scene handleDrop). */
  onCardDragDrop?: (payload: DragDropPayload) => void;

  constructor(scene: Phaser.Scene, state: BeleagueredCastleState) {
    this.scene = scene;
    this.state = state;
    this.layout = computeBeleagueredCastleLayout();
  }

  // ── Getters ─────────────────────────────────────────────
  get foundationSprites(): Phaser.GameObjects.Image[] { return this.foundationPileViews.map((pv) => pv.getSprite()); }
  get foundationDZs(): Phaser.GameObjects.Zone[] { return this.foundationDropZones; }
  get tableauDZs(): Phaser.GameObjects.Zone[] { return this.tableauDropZones; }
  /** Whether a hint highlight is currently displayed. */
  get hasActiveHint(): boolean { return this.hintRects.length > 0; }
  /** Each tableau column's sprites, derived from HandView components. */
  get tableauSprs(): Phaser.GameObjects.Image[][] { return this.tableauHandViews.map((hv) => hv.getSprites() as Phaser.GameObjects.Image[]); }
  get moveText(): Phaser.GameObjects.Text { return this.moveCountText; }
  get timer(): Phaser.GameObjects.Text { return this.timerText; }
  get seedDisplay(): Phaser.GameObjects.Text { return this.seedText; }
  /**
   * Return the HandView for a given tableau column, or undefined.
   */
  getHandView(colIndex: number): HandView | undefined {
    return this.tableauHandViews[colIndex];
  }

  // ── UI creation ─────────────────────────────────────────
  createTitle(): void {
    createSceneTitle(this.scene, 'Beleaguered Castle', { y: this.layout.headerY });
  }

  createFoundationSlots(): void {
    const FOUNDATION_GAP = CARD_GAP + 30;
    const totalW = FOUNDATION_COUNT * BC_CARD_W + (FOUNDATION_COUNT - 1) * FOUNDATION_GAP;
    const startX = (GAME_W - totalW) / 2 + BC_CARD_W / 2;

    for (let i = 0; i < FOUNDATION_COUNT; i++) {
      const x = startX + i * (BC_CARD_W + FOUNDATION_GAP);
      const slotGraphics = this.scene.add.graphics();
      slotGraphics.lineStyle(2, 0x448844, FOUNDATION_SLOT_ALPHA);
      slotGraphics.strokeRoundedRect(x - BC_CARD_W / 2, this.layout.foundationCenterY - BC_CARD_H / 2, BC_CARD_W, BC_CARD_H, FOUNDATION_BORDER_RADIUS);

      // Foundation pile rendered via shared PileView
      const pileView = new PileView(this.scene, {
        x,
        y: this.layout.foundationCenterY,
        emptyTexture: 'card_back',
        emptyAlpha: 0,
        fullAlpha: 1,
        countOffsetY: BC_CARD_H / 2 + 16,
        countFontSize: FOUNDATION_COUNT_FONT_SIZE,
        countColor: '#aaccaa',
      });
      pileView.setPile(this.state.foundations[i]);
      this.foundationPileViews.push(pileView);

      const zone = this.scene.add.zone(x, this.layout.foundationCenterY, BC_CARD_W, BC_CARD_H)
        .setRectangleDropZone(BC_CARD_W, BC_CARD_H);
      this.foundationDropZones.push(zone);
    }
  }

  /**
   * Create shared HandView instances for all 8 tableau columns.
   * Call once during scene.create() after construction.
   */
  initTableauHandViews(reducedMotion = false): void {
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const hv = new HandView(this.scene, {
        baseX: this.tableauColumnX(col),
        baseY: this.layout.tableauTopY,
        spacing: CASCADE_OFFSET_Y,
        cardWidth: BC_CARD_W,
        layoutDirection: 'vertical',
        showLabels: false,
        selectionEnabled: false,
        clickEnabled: false,
        reducedMotion,
      });
      this.tableauHandViews.push(hv);
    }
  }

  createTableauDropZones(): void {
    const zoneTop = this.layout.tableauTopY - BC_CARD_H / 2;
    const zoneBottom = this.layout.tableauBottomY + BC_CARD_H / 2;
    const maxColHeight = zoneBottom - zoneTop;
    const zoneCenterY = (zoneTop + zoneBottom) / 2;

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const x = this.tableauColumnX(col);
      const zone = this.scene.add.zone(x, zoneCenterY, BC_CARD_W + 4, maxColHeight)
        .setRectangleDropZone(BC_CARD_W + 4, maxColHeight);
      this.tableauDropZones.push(zone);
    }
  }

  createHUD(seed: number): void {
    this.moveCountText = createBcHudText(this.scene, 20, GAME_H - HUD_MARGIN, 'Moves: 0', '#aaccaa', { fontSize: HUD_FONT_SIZE });

    this.timerText = createBcHudText(this.scene, GAME_W / 2, GAME_H - HUD_MARGIN, '00:00', '#aaccaa', { fontSize: HUD_FONT_SIZE });

    this.seedText = createBcHudText(this.scene, GAME_W - 20, GAME_H - HUD_MARGIN, `Seed: ${seed}`, '#668866', {
      fontSize: HUD_SEED_FONT_SIZE,
      originX: 1,
    });
  }

  // ── Foundation rendering ────────────────────────────────
  refreshFoundations(): void {
    for (let i = 0; i < FOUNDATION_COUNT; i++) {
      const pv = this.foundationPileViews[i];
      if (pv) pv.update();
    }
  }

  // ── Tableau layout ──────────────────────────────────────
  tableauColumnX(colIndex: number): number {
    const totalW = TABLEAU_COUNT * BC_CARD_W + (TABLEAU_COUNT - 1) * CARD_GAP;
    const startX = (GAME_W - totalW) / 2 + BC_CARD_W / 2;
    return startX + colIndex * (BC_CARD_W + CARD_GAP);
  }

  /**
   * Compute the cascade spacing for a column of the given size,
   * with adaptive compression when cards would exceed the tableau zone.
   */
  private computeCascadeSpacing(columnSize: number): number {
    if (columnSize <= 1) return CASCADE_OFFSET_Y;
    const maxOffsets = columnSize - 1;
    const maxTotalHeight = this.layout.tableauBottomY - this.layout.tableauTopY;
    const idealHeight = maxOffsets * CASCADE_OFFSET_Y;
    if (idealHeight > maxTotalHeight) {
      return maxTotalHeight / maxOffsets;
    }
    return CASCADE_OFFSET_Y;
  }

  /**
   * Compute the Y position for a card at the given row index in a column of given size.
   * Matches HandView's vertical layout: baseY + rowIndex * spacing.
   */
  private tableauCardYForColumn(rowIndex: number, columnSize: number): number {
    return this.layout.tableauTopY + rowIndex * this.computeCascadeSpacing(columnSize);
  }

  /**
   * Update HandView spacing for all columns based on current card counts,
   * then call setCards to rebuild the sprites at correct positions.
   */
  private syncTableauHandViews(): void {
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const cards = this.state.tableau[col].toArray();
      const spacing = this.computeCascadeSpacing(cards.length);
      const hv = this.tableauHandViews[col];
      if (hv) {
        hv.setSpacing(spacing);
        hv.setCards(cards);
      }
    }
  }

  // ── Deal animation ──────────────────────────────────────
  dealTableauAnimated(): void {
    if (this.reducedMotion) {
      this.syncTableauHandViews();
      this.onDealComplete?.();
      return;
    }
    const centerX = GAME_W / 2;
    const centerY = GAME_H / 2;

    // Populate HandViews with tableau cards (creates sprites at final positions)
    this.syncTableauHandViews();

    // Collect all target positions and move sprites to deal origin
    const targetPositions: Array<{ x: number; y: number }> = [];
    let totalCards = 0;

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const hv = this.tableauHandViews[col];
      if (!hv) continue;
      const centers = hv.getCardCenters();
      for (const c of centers) {
        targetPositions.push(c);
      }
      totalCards += this.state.tableau[col].size();
    }

    // Move all sprites to center for animation start
    let dealIndex = 0;
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const hv = this.tableauHandViews[col];
      if (!hv) continue;
      const sprites = hv.getSprites();
      for (const sprite of sprites) {
        (sprite as Phaser.GameObjects.Image).setPosition(centerX, centerY).setAlpha(0).setDepth(dealIndex);
        dealIndex++;
      }
    }

    // Tween sprites from center to their HandView-computed positions
    let completedCount = 0;
    dealIndex = 0;

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const cards = this.state.tableau[col].toArray();
      for (let row = 0; row < cards.length; row++) {
        const target = targetPositions[dealIndex];
        const sprite = this.tableauHandViews[col]?.getSpriteAt(row);
        if (!sprite || !target) {
          dealIndex++;
          continue;
        }

        const currentDealIndex = dealIndex;
        this.scene.tweens.add({
          targets: sprite,
          x: target.x,
          y: target.y,
          alpha: 1,
          duration: ANIM_DURATION,
          delay: dealIndex * DEAL_STAGGER,
          ease: 'Power2',
          onStart: () => {
            this.onDealCard?.({ cardIndex: currentDealIndex, totalCards });
          },
          onComplete: () => {
            (sprite as Phaser.GameObjects.Image).setDepth(row);
            completedCount++;
            if (completedCount >= totalCards) {
              this.onDealComplete?.();
            }
          },
        });
        dealIndex++;
      }
    }

    if (totalCards === 0) {
      this.onDealComplete?.();
    }
  }

  // ── Make draggable ──────────────────────────────────────
  /**
   * Register each tableau column's top card with the shared drag-drop
   * module and wire the click-to-move pointerdown. Call whenever the
   * tableau sprites have been (re)built (after deal or refresh).
   */
  makeDraggable(): void {
    const manager = this.dragDropManager;
    if (!manager) return;

    // Unregister draggables from the previous board render (their sprites
    // were destroyed by HandView.rebuildDisplay on the last refresh).
    for (const go of this.dragDropRegistered) {
      try { manager.unregisterDraggable(go); } catch { /* ignore */ }
    }
    this.dragDropRegistered.clear();

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const hv = this.tableauHandViews[col];
      if (!hv) continue;
      const sprites = hv.getSprites();
      if (sprites.length === 0) continue;

      const topSprite = sprites[sprites.length - 1] as Phaser.GameObjects.Image;
      const rowIndex = sprites.length - 1;

      manager.registerDraggable({
        gameObject: topSprite,
        data: { colIndex: col, rowIndex } satisfies BCTopCardDragData,
        onDrop: (payload) => this.onCardDragDrop?.(payload),
      });
      this.dragDropRegistered.add(topSprite);

      // Click-to-move: pointerdown selects the column. A pure click never
      // crosses the drag distance threshold, so it still reaches this
      // handler even though the card is draggable.
      topSprite.on('pointerdown', () => this.onCardClick?.(col));
      // Preserve the hand cursor on hover (module sets draggable without it).
      if (topSprite.input) topSprite.input.cursor = 'pointer';
    }
  }

  // ── Highlights ──────────────────────────────────────────
  showValidDropHighlights(fromCol: number, getLegalMoves: () => Array<{ kind: string; fromCol: number; toFoundation?: number; toCol?: number }>): void {
    this.clearDropHighlights();
    const legalMoves = getLegalMoves();
    const relevantMoves = legalMoves.filter((m) => m.fromCol === fromCol);

    for (const move of relevantMoves) {
      if (move.kind === 'tableau-to-foundation' && move.toFoundation !== undefined) {
        const fSprite = this.foundationPileViews[move.toFoundation]?.getSprite();
        if (!fSprite || !fSprite.active) continue;
        const rect = this.scene.add.rectangle(fSprite.x, fSprite.y, BC_CARD_W + 4, BC_CARD_H + 4, HIGHLIGHT_VALID, HIGHLIGHT_ALPHA)
          .setDepth(DRAG_DEPTH - 1);
        this.highlightRects.push(rect);
      } else if (move.kind === 'tableau-to-tableau' && move.toCol !== undefined) {
        const col = move.toCol;
        const cards = this.state.tableau[col].toArray();
        const dropY = cards.length > 0
          ? this.tableauCardYForColumn(cards.length - 1, cards.length)
          : this.tableauCardYForColumn(0, 1);
        const x = this.tableauColumnX(col);
        const rect = this.scene.add.rectangle(x, dropY, BC_CARD_W + 4, BC_CARD_H + 4, HIGHLIGHT_VALID, HIGHLIGHT_ALPHA)
          .setDepth(DRAG_DEPTH - 1);
        this.highlightRects.push(rect);
      }
    }
  }

  clearDropHighlights(): void {
    for (const rect of this.highlightRects) {
      rect.destroy();
    }
    this.highlightRects = [];
  }

  // ── Hint highlight ───────────────────────────────────────
  /**
   * Highlight the suggested move: the source card (gold border) and the
   * destination — foundation pile or tableau column top / empty space
   * (green border).
   */
  showHint(move: BCMove): void {
    this.clearHint();

    // Source: the top card of the source column
    const sourceSprites = this.tableauSprs[move.fromCol];
    if (sourceSprites && sourceSprites.length > 0) {
      const top = sourceSprites[sourceSprites.length - 1];
      const rect = this.scene.add.rectangle(
        top.x, top.y, BC_CARD_W + 6, BC_CARD_H + 6,
        HINT_SOURCE_COLOR, HINT_ALPHA,
      ).setDepth(HINT_DEPTH);
      this.hintRects.push(rect);
    }

    // Destination
    if (move.kind === 'tableau-to-foundation') {
      const fSprite = this.foundationPileViews[move.toFoundation]?.getSprite();
      if (fSprite) {
        const rect = this.scene.add.rectangle(
          fSprite.x, fSprite.y, BC_CARD_W + 6, BC_CARD_H + 6,
          HINT_DEST_COLOR, HINT_ALPHA,
        ).setDepth(HINT_DEPTH);
        this.hintRects.push(rect);
      }
    } else {
      const col = move.toCol;
      const cards = this.state.tableau[col].toArray();
      const dropY = cards.length > 0
        ? this.tableauCardYForColumn(cards.length - 1, cards.length)
        : this.tableauCardYForColumn(0, 1);
      const rect = this.scene.add.rectangle(
        this.tableauColumnX(col), dropY, BC_CARD_W + 6, BC_CARD_H + 6,
        HINT_DEST_COLOR, HINT_ALPHA,
      ).setDepth(HINT_DEPTH);
      this.hintRects.push(rect);
    }
  }

  /** Remove any active hint highlight. */
  clearHint(): void {
    for (const rect of this.hintRects) {
      rect.destroy();
    }
    this.hintRects = [];
  }

  // ── Selection ───────────────────────────────────────────
  selectColumn(colIndex: number): void {
    const hv = this.tableauHandViews[colIndex];
    if (!hv) return;
    const sprites = hv.getSprites();
    if (sprites.length > 0) {
      (sprites[sprites.length - 1] as any).setTint(SELECTION_TINT);
    }
  }

  deselectColumn(colIndex: number): void {
    const hv = this.tableauHandViews[colIndex];
    if (!hv) return;
    const sprites = hv.getSprites();
    if (sprites.length > 0) {
      (sprites[sprites.length - 1] as any).clearTint();
    }
  }

  // ── Refresh ─────────────────────────────────────────────
  refreshAll(makeDraggable: boolean): void {
    this.clearHint();
    this.refreshFoundations();
    this.refreshTableau();
    this.refreshHUD();
    if (makeDraggable) this.makeDraggable();
  }

  refreshTableau(): void {
    this.syncTableauHandViews();
  }

  refreshHUD(): void {
    this.moveCountText.setText(`Moves: ${this.state.moveCount}`);
    this.seedText.setText(`Seed: ${this.state.seed}`);
  }

  setTimerText(elapsedSeconds: number): void {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    this.timerText.setText(`${mm}:${ss}`);
  }
}
