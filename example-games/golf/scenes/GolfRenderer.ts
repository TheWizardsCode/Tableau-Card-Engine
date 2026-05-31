/**
 * GolfRenderer -- creates and refreshes all visual game objects for 9-Card Golf.
 */

import { scoreVisibleCards, scoreGrid } from '../GolfScoring';
import type { GolfSession } from '../GolfGame';
import { GAME_W, GAME_H } from '../../../src/ui';
import {
  createGolfHudText,
  getCardTexture,
  createSceneTitle,
  createSceneMenuButton,
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

export class GolfRenderer {
  // Display objects -- grids
  humanCardSprites: Phaser.GameObjects.Image[] = [];
  aiCardSprites: Phaser.GameObjects.Image[] = [];

  // Display objects -- piles
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

  createPiles(
    onStockClick: () => void,
    onDiscardClick: () => void,
  ): void {
    // Stock pile (upper center)
    this.stockSprite = this.scene.add.image(this.layout.stockPileCenterX, this.layout.stockPileCenterY, 'card_back');
    if (!this.replayMode) {
      this.stockSprite.setInteractive({ useHandCursor: true });
      this.stockSprite.on('pointerdown', onStockClick);
    }

    createGolfHudText(
      this.scene,
      this.layout.stockPileCenterX,
      this.layout.stockPileCenterY + GOLF_CARD_H / 2 + 16,
      'Stock',
      '#aaccaa',
      { fontSize: '16px', originX: 0.5 },
    );

    // Discard pile (lower center)
    this.discardSprite = this.scene.add.image(this.layout.discardPileCenterX, this.layout.discardPileCenterY, 'card_back');
    if (!this.replayMode) {
      this.discardSprite.setInteractive({ useHandCursor: true });
      this.discardSprite.on('pointerdown', onDiscardClick);
    }

    createGolfHudText(
      this.scene,
      this.layout.discardPileCenterX,
      this.layout.discardPileCenterY + GOLF_CARD_H / 2 + 16,
      'Discard',
      '#aaccaa',
      { fontSize: '16px', originX: 0.5 },
    );
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
    // Stock: always shows card_back (or nothing if empty)
    if (this.session.shared.stockPile.length > 0) {
      this.stockSprite.setVisible(true);
      this.stockSprite.setTexture('card_back');
      this.stockSprite.setAlpha(1);
    } else {
      this.stockSprite.setVisible(false);
    }

    // Discard: shows top card face-up, or a dimmed placeholder when empty
    const top = this.session.shared.discardPile.peek();
    if (top) {
      this.discardSprite.setVisible(true);
      this.discardSprite.setTexture(getCardTexture(top));
      this.discardSprite.setAlpha(1);
    } else if (this.replayMode) {
      this.discardSprite.setVisible(false);
    } else {
      this.showDiscardPlaceholder();
    }
  }

  /** Show a dimmed card-back as an empty-pile placeholder so the discard
   *  area remains visible and clickable even when no cards are on it. */
  showDiscardPlaceholder(): void {
    this.discardSprite.setVisible(true);
    this.discardSprite.setTexture('card_back');
    this.discardSprite.setAlpha(0.25);
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
}
