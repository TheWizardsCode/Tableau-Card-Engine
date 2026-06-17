/**
 * GolfRenderer -- creates and refreshes all visual game objects for 9-Card Golf.
 *
 * Uses shared PileView for stock/discard pile rendering, and bespoke sprite
 * management for the 3×3 grid layouts (which don't fit the single-row HandView
 * pattern).
 */

import { scoreVisibleCards, scoreGrid } from '../GolfScoring';
import type { Card } from '../../../src/card-system/Card';
import type { GolfSession } from '../GolfGame';
import { GAME_W, GAME_H } from '../../../src/ui';
import { createSceneTitle, createSceneMenuButton } from '@ui/Renderer';
import { PileView } from '../../../src/ui/PileView';
import {
  createGolfHudText,
  getCardTexture,
} from '../../../src/ui/Renderer/adapters/GolfAdapter';
import {
  GOLF_CARD_H, CARD_GAP,
  GRID_ROWS,
} from './GolfConstants';
import {
  computeGolfLayout,
  gridCellPosition,
  type GolfLayout,
} from './GolfLayoutAdapter';

import type { CardPile } from '../../../src/ui/PileView';

/**
 * Lightweight adapter that wraps a plain Card[] with the PileView CardPile
 * interface (`size()`, `isEmpty()`, `peek()`). Golf's stock pile is a plain
 * array, not a Pile<T>, so this adapter enables PileView to render it.
 */
class ArrayPileAdapter implements CardPile<Card> {
  constructor(private cards: Card[]) {}
  size(): number { return this.cards.length; }
  isEmpty(): boolean { return this.cards.length === 0; }
  peek(): Card | undefined { return this.cards.length > 0 ? this.cards[this.cards.length - 1] : undefined; }
}

export class GolfRenderer {
  // Display objects -- grids
  humanCardSprites: Phaser.GameObjects.Image[] = [];
  aiCardSprites: Phaser.GameObjects.Image[] = [];

  // Shared PileView components (Phase 1 migration: CG-0MQ6IEM920091HF6)
  stockPileView!: PileView;
  discardPileView!: PileView;

  // Legacy pile sprite refs (kept for backward compat with animator / tests)
  stockSprite!: Phaser.GameObjects.Image;
  discardSprite!: Phaser.GameObjects.Image;
  drawnCardSprite: Phaser.GameObjects.Image | null = null;

  // Display objects -- UI
  turnText!: Phaser.GameObjects.Text;
  humanScoreText!: Phaser.GameObjects.Text;
  aiScoreText!: Phaser.GameObjects.Text;
  instructionText!: Phaser.GameObjects.Text;
  humanLabel!: Phaser.GameObjects.Text;
  aiLabel!: Phaser.GameObjects.Text;

  /** SLL-derived layout resolved once at construction. */
  private layout: GolfLayout;

  constructor(
    private scene: Phaser.Scene,
    private session: GolfSession,
    private replayMode: boolean,
  ) {
    this.layout = computeGolfLayout();
  }

  // ── UI creation ─────────────────────────────────────────

  createLabels(): void {
    // Menu button (top-left) -- returns to game selector
    if (!this.replayMode) {
      createSceneMenuButton(this.scene);
    }

    createSceneTitle(this.scene, '9-Card Golf');

    // Player labels above each grid
    const gridH = GRID_ROWS * GOLF_CARD_H + (GRID_ROWS - 1) * CARD_GAP;

    this.humanLabel = createGolfHudText(
      this.scene,
      this.layout.humanGridCenterX,
      this.layout.humanGridCenterY - gridH / 2 - 24,
      'You',
      '#ffffff',
      { fontSize: '24px', originX: 0.5 },
    );

    this.aiLabel = createGolfHudText(
      this.scene,
      this.layout.aiGridCenterX,
      this.layout.aiGridCenterY - gridH / 2 - 24,
      'AI',
      '#cccccc',
      { fontSize: '24px', originX: 0.5 },
    );
  }

  /**
   * Create PileView components for the stock and discard piles.
   *
   * @param onStockClick  - Callback when the stock pile is clicked.
   * @param onDiscardClick - Callback when the discard pile is clicked.
   * @param stockPile     - The card-system Pile for the stock (or an array with
   *                        `length` property). Golf uses `Card[]` for the stock.
   * @param discardPile   - The card-system Pile for the discard.
   */
  createPiles(
    onStockClick: () => void,
    onDiscardClick: () => void,
    stockPile: Card[],
    discardPile: CardPile<Card>,
  ): void {
    const ghostAlpha = this.replayMode ? 0.3 : 0.8;

    // Stock pile (upper center) -- rendered via shared PileView
    // Golf's stock is a plain Card[] so we wrap it with a minimal adapter.
    this.stockPileView = new PileView(this.scene, {
      x: this.layout.stockPileCenterX,
      y: this.layout.stockPileCenterY,
      label: 'Stock',
      emptyTexture: 'card_back',
      emptyAlpha: ghostAlpha,
      fullAlpha: 1,
      countOffsetY: GOLF_CARD_H / 2 + 16,
      countFontSize: '16px',
      countColor: '#aaccaa',
    });
    this.stockPileView.setPile(new ArrayPileAdapter(stockPile));
    if (!this.replayMode) {
      this.stockPileView.onClick(onStockClick);
    } else {
      this.stockPileView.setInteractive(false);
    }
    this.stockSprite = this.stockPileView.getSprite();

    // Discard pile (lower center) -- rendered via shared PileView
    // The discard pile already implements the CardPile interface so we pass
    // it directly rather than wrapping it in ArrayPileAdapter.
    this.discardPileView = new PileView(this.scene, {
      x: this.layout.discardPileCenterX,
      y: this.layout.discardPileCenterY,
      label: 'Discard',
      emptyTexture: 'card_back',
      emptyAlpha: this.replayMode ? 0.3 : 0.25,
      fullAlpha: 1,
      countOffsetY: GOLF_CARD_H / 2 + 16,
      countFontSize: '16px',
      countColor: '#aaccaa',
    });
    this.discardPileView.setPile(discardPile);
    if (!this.replayMode) {
      this.discardPileView.onClick(onDiscardClick);
    } else {
      this.discardPileView.setInteractive(false);
    }
    this.discardSprite = this.discardPileView.getSprite();
  }

  createGrids(onHumanCardClick: (index: number) => void): void {
    // Human grid (bottom)
    for (let i = 0; i < 9; i++) {
      const { x, y } = this.gridCellPosition(i, 'human');
      const sprite = this.scene.add.image(x, y, 'card_back');
      if (!this.replayMode) {
        sprite.setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => onHumanCardClick(i));
      }
      this.humanCardSprites.push(sprite);
    }

    // AI grid (top)
    for (let i = 0; i < 9; i++) {
      const { x, y } = this.gridCellPosition(i, 'ai');
      const sprite = this.scene.add.image(x, y, 'card_back');
      this.aiCardSprites.push(sprite);
    }
  }

  createScoreDisplay(): void {
    // Scores below each grid
    const gridH = GRID_ROWS * GOLF_CARD_H + (GRID_ROWS - 1) * CARD_GAP;

    this.humanScoreText = createGolfHudText(
      this.scene,
      this.layout.humanGridCenterX,
      this.layout.humanGridCenterY + gridH / 2 + 24,
      'Score: 0',
      '#ffffff',
      { fontSize: '22px', originX: 0.5 },
    );

    this.aiScoreText = createGolfHudText(
      this.scene,
      this.layout.aiGridCenterX,
      this.layout.aiGridCenterY + gridH / 2 + 24,
      'Score: 0',
      '#cccccc',
      { fontSize: '22px', originX: 0.5 },
    );

    // Turn indicator above the stock pile in center
    this.turnText = createGolfHudText(
      this.scene,
      this.layout.stockPileCenterX,
      this.layout.stockPileCenterY - GOLF_CARD_H / 2 - 24,
      '',
      '#ffdd44',
      { fontSize: '20px', originX: 0.5 },
    );
  }

  createInstructions(): void {
    this.instructionText = createGolfHudText(
      this.scene,
      GAME_W / 2,
      GAME_H - 18,
      '',
      '#88aa88',
      { fontSize: '18px', originX: 0.5 },
    );
  }

  // ── Grid layout helpers ─────────────────────────────────

  gridCellPosition(
    index: number,
    player: 'human' | 'ai',
  ): { x: number; y: number } {
    return gridCellPosition(this.layout, index, player);
  }

  // ── Refresh display ─────────────────────────────────────

  refreshAll(): void {
    this.refreshGrid('human');
    this.refreshGrid('ai');
    this.refreshPiles();
    this.refreshScores();
    this.refreshTurnIndicator();
  }

  refreshGrid(player: 'human' | 'ai'): void {
    const playerIdx = player === 'human' ? 0 : 1;
    const grid = this.session.gameState.playerStates[playerIdx].grid;
    const sprites = player === 'human' ? this.humanCardSprites : this.aiCardSprites;

    for (let i = 0; i < 9; i++) {
      sprites[i].setTexture(getCardTexture(grid[i]));
    }
  }

  refreshPiles(): void {
    // Refresh PileViews -- they handle their own sprite/text updates internally
    try { this.stockPileView.update(); } catch (_) { /* ignore if not created yet */ }
    try { this.discardPileView.update(); } catch (_) { /* ignore if not created yet */ }
    // Also update the animator's reference to the drawn card sprite depth
    if (this.drawnCardSprite) {
      // Ensure drawn card sprite is above pile views
      this.drawnCardSprite.setDepth(15);
    }
  }

  /** Show a dimmed card-back as an empty-pile placeholder so the discard
   *  area remains visible and clickable even when no cards are on it.
   *  @deprecated Use PileView.emptyAlpha instead; kept for backward compat. */
  showDiscardPlaceholder(): void {
    // PileView handles this internally; this method is a no-op now.
    // Kept for backward compatibility with callers that may reference it.
  }

  refreshScores(): void {
    const humanGrid = this.session.gameState.playerStates[0].grid;
    const aiGrid = this.session.gameState.playerStates[1].grid;

    const humanVisible = scoreVisibleCards(humanGrid);
    const aiVisible = scoreVisibleCards(aiGrid);

    if (this.session.gameState.phase === 'ended') {
      const humanFinal = scoreGrid(humanGrid);
      const aiFinal = scoreGrid(aiGrid);
      this.humanScoreText.setText(`Score: ${humanFinal}`);
      this.aiScoreText.setText(`Score: ${aiFinal}`);
    } else {
      this.humanScoreText.setText(`Score: ${humanVisible}`);
      this.aiScoreText.setText(`Score: ${aiVisible}`);
    }
  }

  refreshTurnIndicator(): void {
    if (this.session.gameState.phase === 'ended') {
      this.turnText.setText('Round Over!');
      return;
    }

    const currentIdx = this.session.gameState.currentPlayerIndex;
    const name = this.session.gameState.players[currentIdx].name;
    this.turnText.setText(`${name}'s turn`);

    // Highlight active player label
    if (currentIdx === 0) {
      this.humanLabel.setColor('#ffdd44');
      this.aiLabel.setColor('#cccccc');
    } else {
      this.humanLabel.setColor('#ffffff');
      this.aiLabel.setColor('#ffdd44');
    }
  }

  // ── Cleanup helpers ─────────────────────────────────────

  clearSprites(): void {
    this.humanCardSprites = [];
    this.aiCardSprites = [];
    this.drawnCardSprite = null;
  }

  setDrawnCardSprite(sprite: Phaser.GameObjects.Image | null): void {
    this.drawnCardSprite = sprite;
  }

  hideDrawnCard(): void {
    if (this.drawnCardSprite) {
      this.drawnCardSprite.destroy();
      this.drawnCardSprite = null;
    }
  }

  get gridCellPos() {
    return this.gridCellPosition.bind(this);
  }

  // ── Destroy (Phase 1 migration) ─────────────────────────

  /** Clean up all display objects including PileView components. */
  destroy(): void {
    this.stockPileView?.destroy();
    this.discardPileView?.destroy();
    this.clearSprites();
  }
}
